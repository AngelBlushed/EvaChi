//! La mémoire que les deux processus regardent ensemble.
//!
//! Une trame de 640×480 pèse 1,2 Mo ; en 1080p, 8,3 Mo. À soixante par seconde,
//! c'est un demi-gigaoctet par seconde qu'il serait absurde de faire passer par
//! un tuyau. Les pixels ne voyagent donc pas : ils sont écrits une fois, dans
//! une zone que les deux processus projettent à la même place.
//!
//! Le protocole est strictement question-réponse, ce qui suffit à protéger la
//! zone : le processus du cœur n'y écrit que pendant une trame demandée, et la
//! fenêtre n'y lit qu'après avoir reçu la réponse. Un seul écrivain à la fois,
//! donc ni double tampon, ni verrou, ni déchirure possible.
//!
//! Reste une chose dont il faut se garder, et elle est sérieuse : **le
//! processus d'en face peut être devenu fou**, c'est même tout l'objet du
//! dispositif. Ce qu'il écrit dans l'en-tête est donc une déclaration, jamais
//! une consigne. [`Segment::relever`] vérifie tout avant de toucher un octet —
//! sans quoi un pointeur égaré dans le cœur ferait tomber la fenêtre, par le
//! symptôme exact qu'on s'emploie à supprimer.

#![cfg(windows)]

use std::os::raw::c_void;
use std::sync::atomic::{AtomicU32, Ordering};

use windows_sys::Win32::Foundation::{CloseHandle, ERROR_ALREADY_EXISTS, INVALID_HANDLE_VALUE};
use windows_sys::Win32::System::Memory::{
    CreateFileMappingW, MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, FILE_MAP_ALL_ACCESS,
    MEMORY_MAPPED_VIEW_ADDRESS, PAGE_READWRITE,
};

/// Taille du segment, en octets.
///
/// Trente-deux mégaoctets tiennent une image de 2896 pixels de côté, bien
/// au-delà de ce qu'un cœur produit. La section est adossée au fichier
/// d'échange : la validation est engagée d'emblée, mais les pages physiques ne
/// sont touchées qu'à l'écriture — on ne consomme pas trente-deux mégaoctets de
/// mémoire vive pour un jeu Game Boy.
pub const TAILLE: usize = 32 * 1024 * 1024;

/// En-tête du segment : le numéro de trame, puis de la place en réserve pour
/// garder les pixels alignés.
pub const ENTETE: usize = 16;

/// Ce qui reste pour les pixels.
pub const MAX_PIXELS: usize = TAILLE - ENTETE;

/// Au-delà, on refuse la géométrie annoncée.
///
/// Aucun cœur libretro ne dessine plus grand ; un chiffre plus gros est une
/// déclaration abîmée, pas une image.
pub const MAX_COTE: u32 = 8192;

/// Sert à ce qu'une seconde EvaChi ne tombe jamais sur le nom de la première.
static COMPTEUR: AtomicU32 = AtomicU32::new(0);

/// Un nom de segment que personne d'autre ne peut porter.
///
/// `Local\` et non `Global\` : la zone ne doit être visible que dans la session
/// de l'utilisateur. Le numéro de processus et le compteur suffiraient presque ;
/// l'empreinte de l'instant les complète, pour qu'un enfant orphelin d'une
/// session précédente ne puisse pas non plus se trouver sur le chemin.
pub fn nom_neuf(quoi: &str) -> String {
    let rang = COMPTEUR.fetch_add(1, Ordering::Relaxed);
    let instant = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|age| age.as_nanos())
        .unwrap_or_default();

    // FNV-1a, comme ailleurs dans le dépôt : quelques lignes, pas de dépendance,
    // et bien assez pour distinguer deux noms.
    let mut empreinte = 0xcbf2_9ce4_8422_2325u64;
    for octet in instant
        .to_le_bytes()
        .iter()
        .chain(std::process::id().to_le_bytes().iter())
        .chain(rang.to_le_bytes().iter())
    {
        empreinte ^= u64::from(*octet);
        empreinte = empreinte.wrapping_mul(0x100_0000_01b3);
    }

    format!(
        "Local\\evachi-{quoi}-{}-{rang}-{empreinte:016x}",
        std::process::id()
    )
}

/// Convertit un nom Rust en chaîne large terminée par un zéro.
fn large(texte: &str) -> Vec<u16> {
    texte.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Une zone de mémoire partagée entre la fenêtre et le processus du cœur.
pub struct Segment {
    nom: String,
    section: *mut c_void,
    vue: *mut u8,
}

// SAFETY : une projection de section est propre au processus, pas au thread.
// Rien ici n'a d'affinité de fil ; les accès concurrents sont interdits par le
// protocole question-réponse, pas par le type.
unsafe impl Send for Segment {}

impl Segment {
    /// Crée la zone. C'est la fenêtre qui le fait, et elle seule.
    ///
    /// `CreateFileMappingW` sur un nom déjà pris ne rate pas : il rend une
    /// poignée vers la section **existante**, dont la taille peut être plus
    /// petite que celle qu'on demandait. On refuserait alors de le savoir, et
    /// le premier écrivain déborderait d'une vue trop courte. D'où le contrôle
    /// de `ERROR_ALREADY_EXISTS`, qui n'est pas une précaution de principe.
    pub fn creer() -> Result<Self, String> {
        let nom = nom_neuf("trame");
        let large_nom = large(&nom);

        // SAFETY : les arguments sont valides et la chaîne vit jusqu'au retour.
        let section = unsafe {
            CreateFileMappingW(
                INVALID_HANDLE_VALUE,
                std::ptr::null(),
                PAGE_READWRITE,
                (TAILLE >> 32) as u32,
                (TAILLE & 0xffff_ffff) as u32,
                large_nom.as_ptr(),
            )
        };
        if section.is_null() {
            return Err(format!(
                "mémoire partagée refusée : erreur {}",
                derniere_erreur()
            ));
        }
        if derniere_erreur() == ERROR_ALREADY_EXISTS {
            // SAFETY : la poignée vient d'être obtenue et n'a pas été fermée.
            unsafe { CloseHandle(section) };
            return Err("mémoire partagée déjà prise : un autre programme occupe ce nom".into());
        }

        Self::projeter(nom, section)
    }

    /// Ouvre une zone déjà créée. C'est le processus du cœur qui le fait.
    pub fn ouvrir(nom: &str) -> Result<Self, String> {
        let large_nom = large(nom);
        // SAFETY : même raison.
        let section = unsafe { OpenFileMappingW(FILE_MAP_ALL_ACCESS, 0, large_nom.as_ptr()) };
        if section.is_null() {
            return Err(format!(
                "mémoire partagée introuvable : erreur {}",
                derniere_erreur()
            ));
        }
        Self::projeter(nom.to_string(), section)
    }

    fn projeter(nom: String, section: *mut c_void) -> Result<Self, String> {
        // SAFETY : la section est valide ; on demande la totalité.
        let vue: MEMORY_MAPPED_VIEW_ADDRESS =
            unsafe { MapViewOfFile(section, FILE_MAP_ALL_ACCESS, 0, 0, TAILLE) };
        if vue.Value.is_null() {
            let erreur = derniere_erreur();
            // SAFETY : la poignée est valide et n'est pas encore fermée.
            unsafe { CloseHandle(section) };
            return Err(format!("mémoire partagée non projetée : erreur {erreur}"));
        }

        Ok(Self {
            nom,
            section,
            vue: vue.Value.cast::<u8>(),
        })
    }

    pub fn nom(&self) -> &str {
        &self.nom
    }

    /// La zone où le processus du cœur écrit ses pixels.
    ///
    /// Rend `None` quand l'image demandée ne tiendrait pas : le cœur n'écrit
    /// alors rien, et la fenêtre rejouera la trame précédente. Mieux vaut une
    /// image manquante qu'un débordement.
    pub fn zone(&mut self, taille: usize) -> Option<&mut [u8]> {
        if taille > MAX_PIXELS {
            return None;
        }
        // SAFETY : la vue fait `TAILLE` octets et `taille` tient dedans.
        Some(unsafe { std::slice::from_raw_parts_mut(self.vue.add(ENTETE), taille) })
    }

    /// Annonce que la trame qui vient d'être écrite porte ce numéro.
    ///
    /// À appeler **après** les pixels : c'est ce qui rend l'écriture visible
    /// comme un tout du point de vue de la fenêtre.
    pub fn marquer(&mut self, sequence: u32) {
        // SAFETY : l'en-tête est dans la vue.
        unsafe { std::ptr::write_volatile(self.vue.cast::<u32>(), sequence) };
    }

    /// Recopie les pixels hors de la zone, après avoir tout vérifié.
    ///
    /// La copie n'est pas une négligence : la fenêtre garde souvent une image
    /// d'une trame sur l'autre, et le processus du cœur réécrira cette zone dès
    /// la trame suivante. Rendre une vue serait rendre une image qui change
    /// toute seule.
    pub fn relever(&self, sequence: u32, largeur: u32, hauteur: u32) -> Result<Vec<u8>, String> {
        if largeur == 0 || hauteur == 0 || largeur > MAX_COTE || hauteur > MAX_COTE {
            return Err(format!("géométrie refusée : {largeur}×{hauteur}"));
        }

        let taille = (largeur as usize)
            .checked_mul(hauteur as usize)
            .and_then(|pixels| pixels.checked_mul(4))
            .filter(|taille| *taille <= MAX_PIXELS)
            .ok_or_else(|| format!("image trop grande : {largeur}×{hauteur}"))?;

        // Lu une seule fois, et gardé : relire le champ après l'avoir vérifié
        // laisserait l'autre processus le changer entre les deux.
        // SAFETY : l'en-tête est dans la vue.
        let ecrite = unsafe { std::ptr::read_volatile(self.vue.cast::<u32>()) };
        if ecrite != sequence {
            return Err(format!(
                "trame {sequence} demandée, trame {ecrite} trouvée : le processus du cœur a perdu le fil"
            ));
        }

        let mut pixels = vec![0u8; taille];
        // SAFETY : `taille` a été borné à la vue, et les deux zones sont
        // disjointes — l'une est à nous, l'autre est la projection.
        unsafe {
            std::ptr::copy_nonoverlapping(self.vue.add(ENTETE), pixels.as_mut_ptr(), taille);
        }
        Ok(pixels)
    }
}

impl Drop for Segment {
    fn drop(&mut self) {
        // SAFETY : les deux poignées sont à nous et ne sont fermées qu'ici.
        unsafe {
            UnmapViewOfFile(MEMORY_MAPPED_VIEW_ADDRESS {
                Value: self.vue.cast::<c_void>(),
            });
            CloseHandle(self.section);
        }
    }
}

fn derniere_erreur() -> u32 {
    // SAFETY : sans argument, et toujours sûre à appeler.
    unsafe { windows_sys::Win32::Foundation::GetLastError() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deux_noms_de_suite_ne_se_ressemblent_pas() {
        // Deux EvaChi ouvertes en même temps, ou deux parties enchaînées : un
        // nom réutilisé ferait écrire deux processus au même endroit.
        let un = nom_neuf("trame");
        let deux = nom_neuf("trame");
        assert_ne!(un, deux);
        assert!(un.starts_with("Local\\evachi-trame-"));
    }

    #[test]
    fn ce_qu_on_ecrit_se_relit_de_l_autre_cote() {
        let mut ecrivain = Segment::creer().expect("création");
        let lecteur = Segment::ouvrir(ecrivain.nom()).expect("ouverture");

        let zone = ecrivain.zone(8 * 4).expect("zone");
        zone.copy_from_slice(&[7u8; 32]);
        ecrivain.marquer(3);

        let releve = lecteur.relever(3, 4, 2).expect("relève");
        assert_eq!(releve, vec![7u8; 32]);
    }

    #[test]
    fn une_trame_d_avant_ne_passe_pas_pour_la_bonne() {
        // Si le processus du cœur a répondu sans écrire, la fenêtre ne doit pas
        // repeindre une vieille image en croyant qu'elle est neuve.
        let mut ecrivain = Segment::creer().expect("création");
        ecrivain.zone(16).expect("zone").fill(1);
        ecrivain.marquer(1);

        let lecteur = Segment::ouvrir(ecrivain.nom()).expect("ouverture");
        assert!(lecteur.relever(2, 2, 2).is_err());
        assert!(lecteur.relever(1, 2, 2).is_ok());
    }

    #[test]
    fn une_geometrie_aberrante_est_refusee_avant_de_toucher_un_octet() {
        // C'est le cas qui compte : un pointeur égaré dans le cœur a écrit
        // n'importe quoi, et la fenêtre ne doit pas tomber avec lui.
        let mut segment = Segment::creer().expect("création");
        segment.marquer(1);

        assert!(segment.relever(1, 0, 100).is_err(), "largeur nulle");
        assert!(segment.relever(1, 100, 0).is_err(), "hauteur nulle");
        assert!(segment.relever(1, 99_999, 2).is_err(), "largeur démesurée");
        assert!(segment.relever(1, u32::MAX, u32::MAX).is_err(), "les deux");
        // 8192×8192×4 fait 268 Mo : au-delà du segment, donc refusé aussi.
        assert!(segment.relever(1, MAX_COTE, MAX_COTE).is_err(), "trop gros");
    }

    #[test]
    fn une_image_qui_ne_tient_pas_n_est_pas_ecrite() {
        let mut segment = Segment::creer().expect("création");
        assert!(segment.zone(MAX_PIXELS).is_some());
        assert!(segment.zone(MAX_PIXELS + 1).is_none());
    }

    #[test]
    fn ouvrir_un_nom_qui_n_existe_pas_echoue_proprement() {
        assert!(Segment::ouvrir("Local\\evachi-trame-qui-n-existe-pas").is_err());
    }
}
