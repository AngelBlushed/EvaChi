//! Le fil qui relie la fenêtre au processus du cœur.
//!
//! Un tuyau nommé, et non la sortie standard : les cœurs écrivent dessus. La
//! sonde de cœurs le constate déjà — « un cœur bavard écrit sur la sortie
//! standard avant nous » — et s'en tire en ne gardant que la dernière ligne. Un
//! protocole binaire n'aurait pas cette chance.
//!
//! Côté fenêtre, toutes les lectures et écritures sont **en recouvrement**.
//! Ce n'est pas un raffinement : c'est ce qui donne une échéance à chaque
//! échange sans passer par un fil lecteur, et ce qui permet d'attendre en même
//! temps la réponse *et* la mort du processus d'en face. Un cœur qui tombe
//! réveille l'attente tout de suite, au lieu de la laisser courir jusqu'au bout
//! de l'échéance.
//!
//! Côté cœur, le tuyau est ordinaire et bloquant : il n'a rien à attendre
//! d'autre, et si la fenêtre disparaît, sa lecture rend la fin du flux.

#![cfg(windows)]

use std::os::raw::c_void;
use std::time::Duration;

use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, ERROR_FILE_NOT_FOUND, ERROR_IO_PENDING, ERROR_PIPE_BUSY,
    ERROR_PIPE_CONNECTED, INVALID_HANDLE_VALUE, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, ReadFile, WriteFile, FILE_FLAG_FIRST_PIPE_INSTANCE, FILE_FLAG_OVERLAPPED,
    FILE_GENERIC_READ, FILE_GENERIC_WRITE, OPEN_EXISTING, PIPE_ACCESS_DUPLEX,
};
use windows_sys::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS,
    PIPE_TYPE_BYTE, PIPE_WAIT,
};
use windows_sys::Win32::System::Threading::{CreateEventW, ResetEvent, WaitForMultipleObjects};
use windows_sys::Win32::System::IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED};

/// Marque des erreurs qui veulent dire « le processus du cœur n'est plus là ».
///
/// La fenêtre s'en sert pour distinguer un cœur tombé d'un refus ordinaire :
/// ce ne sont pas les mêmes mots à l'écran, ni la même suite.
pub const TOMBE: &str = "coeur-tombe";

/// Tampons du tuyau, généreux à dessein : un état de sauvegarde de quatre-vingt-dix
/// mégaoctets ne doit pas se payer en milliers d'allers-retours.
const TAMPON: u32 = 1024 * 1024;

fn large(texte: &str) -> Vec<u16> {
    texte.encode_utf16().chain(std::iter::once(0)).collect()
}

fn erreur() -> u32 {
    // SAFETY : sans argument, toujours sûre.
    unsafe { GetLastError() }
}

// --- Côté fenêtre -----------------------------------------------------------

/// Un tuyau créé, en attente que le processus du cœur s'y branche.
pub struct Ecoute {
    nom: String,
    tuyau: *mut c_void,
}

// SAFETY : une poignée Windows n'a pas d'affinité de fil.
unsafe impl Send for Ecoute {}

impl Ecoute {
    /// Crée le tuyau. À faire **avant** de lancer le processus du cœur : celui-ci
    /// ouvre un nom, et un nom qui n'existe pas encore lui rend « fichier
    /// introuvable », contre quoi l'attente de tuyau ne peut rien.
    pub fn creer() -> Result<Self, String> {
        let nom = super::partage::nom_neuf("tuyau").replace("Local\\", "\\\\.\\pipe\\");
        let large_nom = large(&nom);

        // SAFETY : le nom vit jusqu'au retour, les drapeaux sont valides.
        let tuyau = unsafe {
            CreateNamedPipeW(
                large_nom.as_ptr(),
                // `FIRST_PIPE_INSTANCE` : si le nom est déjà pris, on veut le
                // savoir tout de suite plutôt que de partager le tuyau d'un
                // autre.
                PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | FILE_FLAG_FIRST_PIPE_INSTANCE,
                // En octets, et non en messages : on cadre déjà nous-mêmes, et
                // le mode message rend une lecture trop courte sous la forme
                // d'une erreur dont il est facile de perdre la suite.
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                1,
                TAMPON,
                TAMPON,
                0,
                std::ptr::null(),
            )
        };

        if tuyau == INVALID_HANDLE_VALUE || tuyau.is_null() {
            return Err(format!("tuyau refusé : erreur {}", erreur()));
        }
        Ok(Self { nom, tuyau })
    }

    pub fn nom(&self) -> &str {
        &self.nom
    }

    /// Attend que le processus du cœur se branche.
    ///
    /// On attend deux choses à la fois : la connexion, et la mort du processus.
    /// Un enfant qui démarre puis meurt avant d'ouvrir le tuyau — antivirus,
    /// refus de Windows, bibliothèque manquante — laisserait sinon la fenêtre
    /// attendre pour toujours.
    pub fn accepter(self, processus: *mut c_void, echeance: Duration) -> Result<Canal, String> {
        let evenement = creer_evenement()?;
        let mut recouvrement = neuf(evenement);

        // SAFETY : le tuyau est valide et le recouvrement vit jusqu'au bout.
        let tout_de_suite = unsafe { ConnectNamedPipe(self.tuyau, &mut recouvrement) };
        let issue = if tout_de_suite != 0 {
            Ok(())
        } else {
            match erreur() {
                // Le processus du cœur a ouvert le tuyau avant qu'on écoute :
                // c'est un succès, malgré le zéro rendu.
                ERROR_PIPE_CONNECTED => Ok(()),
                ERROR_IO_PENDING => {
                    attendre(self.tuyau, &mut recouvrement, evenement, processus, echeance)
                        .map(|_| ())
                        .map_err(|raison| format!("le cœur ne s'est pas branché : {raison}"))
                }
                code => Err(format!("branchement refusé : erreur {code}")),
            }
        };

        // Une seule sortie pour tous les échecs : l'événement se fermait sur le
        // chemin direct et fuyait sur celui de l'attente, qui est justement le
        // chemin ordinaire.
        if let Err(raison) = issue {
            fermer(evenement);
            return Err(raison);
        }

        // Le tuyau passe au canal, et le reste part avec l'écoute. `ManuallyDrop`
        // plutôt que `mem::forget` : celui-ci abandonnait aussi le nom, quelques
        // dizaines d'octets par partie que rien ne reprenait jamais.
        let mut sortante = std::mem::ManuallyDrop::new(self);
        let nom = std::mem::take(&mut sortante.nom);

        Ok(Canal {
            _nom: nom,
            tuyau: sortante.tuyau,
            evenement,
        })
    }
}

impl Drop for Ecoute {
    fn drop(&mut self) {
        fermer(self.tuyau);
    }
}

/// Le tuyau une fois branché des deux côtés.
pub struct Canal {
    _nom: String,
    tuyau: *mut c_void,
    evenement: *mut c_void,
}

// SAFETY : deux poignées Windows, sans affinité de fil. Les accès sont
// sérialisés par le verrou qui tient le canal, pas par le type.
unsafe impl Send for Canal {}

impl Canal {
    /// Écrit tout, ou dit pourquoi elle n'a pas pu.
    pub fn ecrire(
        &self,
        octets: &[u8],
        processus: *mut c_void,
        echeance: Duration,
    ) -> Result<(), String> {
        let mut ecrits = 0usize;
        while ecrits < octets.len() {
            let tranche = &octets[ecrits..];
            let mut recouvrement = neuf(self.evenement);
            reposer(self.evenement);

            let mut combien = 0u32;
            // SAFETY : la tranche vit jusqu'à la fin de l'attente, et le
            // recouvrement aussi.
            let fini = unsafe {
                WriteFile(
                    self.tuyau,
                    tranche.as_ptr(),
                    tranche.len().min(u32::MAX as usize) as u32,
                    &mut combien,
                    &mut recouvrement,
                )
            };

            if fini == 0 {
                if erreur() != ERROR_IO_PENDING {
                    return Err(format!("{TOMBE} : le cœur n'a pas pris la demande ({})", erreur()));
                }
                combien = attendre(
                    self.tuyau,
                    &mut recouvrement,
                    self.evenement,
                    processus,
                    echeance,
                )?;
            }

            if combien == 0 {
                return Err(format!("{TOMBE} : le cœur s'est arrêté pendant qu'on lui parlait"));
            }
            ecrits += combien as usize;
        }
        Ok(())
    }

    /// Remplit le tampon, sans quoi elle échoue.
    ///
    /// En mode octet, une lecture rend ce qui est disponible et non ce qu'on a
    /// demandé : la boucle n'est pas une précaution, c'est la seule façon de
    /// lire un message entier.
    pub fn lire(
        &self,
        tampon: &mut [u8],
        processus: *mut c_void,
        echeance: Duration,
    ) -> Result<(), String> {
        let mut lus = 0usize;
        while lus < tampon.len() {
            let mut recouvrement = neuf(self.evenement);
            reposer(self.evenement);

            let reste = &mut tampon[lus..];
            let mut combien = 0u32;
            // SAFETY : le tampon vit jusqu'à la fin de l'attente.
            let fini = unsafe {
                ReadFile(
                    self.tuyau,
                    reste.as_mut_ptr(),
                    reste.len().min(u32::MAX as usize) as u32,
                    &mut combien,
                    &mut recouvrement,
                )
            };

            if fini == 0 {
                if erreur() != ERROR_IO_PENDING {
                    return Err(format!("{TOMBE} : le cœur n'a pas répondu ({})", erreur()));
                }
                combien = attendre(
                    self.tuyau,
                    &mut recouvrement,
                    self.evenement,
                    processus,
                    echeance,
                )?;
            }

            if combien == 0 {
                return Err(format!("{TOMBE} : le cœur s'est arrêté brutalement"));
            }
            lus += combien as usize;
        }
        Ok(())
    }
}

impl Drop for Canal {
    fn drop(&mut self) {
        fermer(self.tuyau);
        fermer(self.evenement);
    }
}

/// Attend la fin d'une opération, la mort du processus, ou l'échéance.
fn attendre(
    tuyau: *mut c_void,
    recouvrement: &mut OVERLAPPED,
    evenement: *mut c_void,
    processus: *mut c_void,
    echeance: Duration,
) -> Result<u32, String> {
    let objets = [evenement, processus];
    let combien = if processus.is_null() { 1 } else { 2 };
    let millisecondes = echeance.as_millis().min(u128::from(u32::MAX - 1)) as u32;

    // SAFETY : les poignées sont valides et le tableau vit jusqu'au retour.
    let issue = unsafe { WaitForMultipleObjects(combien, objets.as_ptr(), 0, millisecondes) };

    let ennui = match issue {
        WAIT_OBJECT_0 => None,
        // Le second objet, c'est le processus : il s'est terminé.
        x if x == WAIT_OBJECT_0 + 1 => Some(format!("{TOMBE} : le cœur s'est arrêté brutalement")),
        WAIT_TIMEOUT => Some(format!(
            "{TOMBE} : pas de réponse en {} s — le cœur ne répond plus",
            echeance.as_secs()
        )),
        _ => Some(format!("{TOMBE} : attente rompue ({})", erreur())),
    };

    if let Some(raison) = ennui {
        // Sans cela, l'opération continuerait d'écrire dans un tampon qui n'existe
        // plus dès que cette fonction rend la main.
        // SAFETY : les deux poignées sont valides.
        unsafe { CancelIoEx(tuyau, recouvrement) };
        let mut perdus = 0u32;
        // SAFETY : on attend l'annulation pour que le tampon redevienne à nous.
        unsafe { GetOverlappedResult(tuyau, recouvrement, &mut perdus, 1) };
        return Err(raison);
    }

    let mut transferes = 0u32;
    // SAFETY : l'opération est finie ; on ne fait que relire son compte.
    let bon = unsafe { GetOverlappedResult(tuyau, recouvrement, &mut transferes, 0) };
    if bon == 0 {
        return Err(format!("{TOMBE} : le cœur s'est arrêté brutalement ({})", erreur()));
    }
    Ok(transferes)
}

fn creer_evenement() -> Result<*mut c_void, String> {
    // À réarmement manuel : c'est ce que le recouvrement attend.
    // SAFETY : sans nom ni attributs.
    let evenement = unsafe { CreateEventW(std::ptr::null(), 1, 0, std::ptr::null()) };
    if evenement.is_null() {
        return Err(format!("événement refusé : erreur {}", erreur()));
    }
    Ok(evenement)
}

fn neuf(evenement: *mut c_void) -> OVERLAPPED {
    // SAFETY : une structure entièrement à zéro est l'état de départ attendu.
    let mut recouvrement: OVERLAPPED = unsafe { std::mem::zeroed() };
    recouvrement.hEvent = evenement;
    recouvrement
}

fn reposer(evenement: *mut c_void) {
    // SAFETY : la poignée est valide.
    unsafe { ResetEvent(evenement) };
}

fn fermer(poignee: *mut c_void) {
    if !poignee.is_null() && poignee != INVALID_HANDLE_VALUE {
        // SAFETY : la poignée est à nous et n'est fermée qu'ici.
        unsafe { CloseHandle(poignee) };
    }
}

// --- Côté cœur --------------------------------------------------------------

/// Ouvre le tuyau depuis le processus du cœur.
///
/// On réessaie : entre le moment où la fenêtre crée le tuyau et celui où elle
/// se met à écouter, l'ouverture peut rendre « occupé », et sur une machine
/// lente le processus peut démarrer avant que le nom existe.
pub fn brancher(nom: &str, patience: Duration) -> Result<std::fs::File, String> {
    use std::os::windows::io::FromRawHandle;

    let large_nom = large(nom);
    let depart = std::time::Instant::now();

    loop {
        // SAFETY : le nom vit jusqu'au retour.
        let poignee = unsafe {
            CreateFileW(
                large_nom.as_ptr(),
                FILE_GENERIC_READ | FILE_GENERIC_WRITE,
                0,
                std::ptr::null(),
                OPEN_EXISTING,
                0,
                std::ptr::null_mut(),
            )
        };

        if poignee != INVALID_HANDLE_VALUE && !poignee.is_null() {
            // SAFETY : la poignée vient d'être obtenue et n'est possédée par
            // personne d'autre ; le fichier la fermera.
            return Ok(unsafe { std::fs::File::from_raw_handle(poignee.cast()) });
        }

        let code = erreur();
        if depart.elapsed() >= patience {
            return Err(format!("tuyau injoignable : erreur {code}"));
        }
        if code != ERROR_PIPE_BUSY && code != ERROR_FILE_NOT_FOUND {
            return Err(format!("tuyau refusé : erreur {code}"));
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deux_ecoutes_ne_portent_pas_le_meme_nom() {
        let une = Ecoute::creer().expect("première");
        let deux = Ecoute::creer().expect("seconde");
        assert_ne!(une.nom(), deux.nom());
        assert!(une.nom().starts_with("\\\\.\\pipe\\evachi-tuyau-"));
    }

    #[test]
    fn se_brancher_sur_un_tuyau_qui_n_existe_pas_abandonne_au_bout_du_delai() {
        // Et rend la main : c'est ce qui compte. Une attente sans fin ici, et
        // la fenêtre serait morte avant d'avoir commencé.
        let debut = std::time::Instant::now();
        let issue = brancher(
            "\\\\.\\pipe\\evachi-tuyau-qui-n-existe-pas",
            Duration::from_millis(120),
        );
        assert!(issue.is_err());
        assert!(debut.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn un_aller_retour_complet_passe_par_le_tuyau() {
        use std::io::{Read, Write};

        let ecoute = Ecoute::creer().expect("écoute");
        let nom = ecoute.nom().to_string();

        // Le « processus du cœur » est ici un simple fil : le tuyau ne fait pas
        // la différence, et c'est le protocole qu'on éprouve.
        let coeur = std::thread::spawn(move || {
            let mut fil = brancher(&nom, Duration::from_secs(5)).expect("branchement");
            let mut recu = [0u8; 5];
            fil.read_exact(&mut recu).expect("lecture");
            fil.write_all(b"pong!").expect("écriture");
            recu
        });

        let canal = ecoute
            .accepter(std::ptr::null_mut(), Duration::from_secs(5))
            .expect("connexion");
        canal
            .ecrire(b"ping!", std::ptr::null_mut(), Duration::from_secs(5))
            .expect("envoi");

        let mut reponse = [0u8; 5];
        canal
            .lire(&mut reponse, std::ptr::null_mut(), Duration::from_secs(5))
            .expect("réception");

        assert_eq!(&reponse, b"pong!");
        assert_eq!(&coeur.join().expect("fil"), b"ping!");
    }

    #[test]
    fn une_reponse_qui_ne_vient_pas_abandonne_a_l_echeance() {
        // Le cas du cœur figé : personne n'écrit jamais, et la fenêtre doit
        // reprendre la main d'elle-même.
        let ecoute = Ecoute::creer().expect("écoute");
        let nom = ecoute.nom().to_string();

        let muet = std::thread::spawn(move || {
            let fil = brancher(&nom, Duration::from_secs(5)).expect("branchement");
            std::thread::sleep(Duration::from_millis(600));
            drop(fil);
        });

        let canal = ecoute
            .accepter(std::ptr::null_mut(), Duration::from_secs(5))
            .expect("connexion");

        let debut = std::time::Instant::now();
        let mut rien = [0u8; 4];
        let issue = canal.lire(&mut rien, std::ptr::null_mut(), Duration::from_millis(150));

        let erreur = issue.expect_err("échéance attendue");
        assert!(erreur.contains(TOMBE), "{erreur}");
        assert!(debut.elapsed() < Duration::from_secs(3));
        muet.join().expect("fil");
    }

    #[test]
    fn un_gros_bloc_passe_en_une_fois() {
        use std::io::Read;

        // Un état de sauvegarde pèse des mégaoctets : la boucle de lecture doit
        // tenir sur plus que la taille d'un tampon de tuyau.
        let ecoute = Ecoute::creer().expect("écoute");
        let nom = ecoute.nom().to_string();
        let taille = 3 * 1024 * 1024;

        let coeur = std::thread::spawn(move || {
            let mut fil = brancher(&nom, Duration::from_secs(5)).expect("branchement");
            let mut recu = vec![0u8; taille];
            fil.read_exact(&mut recu).expect("lecture");
            recu.iter().map(|o| u64::from(*o)).sum::<u64>()
        });

        let canal = ecoute
            .accepter(std::ptr::null_mut(), Duration::from_secs(5))
            .expect("connexion");
        let gros = vec![7u8; taille];
        canal
            .ecrire(&gros, std::ptr::null_mut(), Duration::from_secs(20))
            .expect("envoi");

        assert_eq!(coeur.join().expect("fil"), 7 * taille as u64);
    }
}
