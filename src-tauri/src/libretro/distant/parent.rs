//! Côté fenêtre : lancer le processus du cœur, lui parler, et lui survivre.
//!
//! La règle qui gouverne tout ce fichier : **ce qui vient d'en face est une
//! déclaration, jamais une consigne**. Le processus voisin peut devenir fou —
//! c'est même la raison de son existence — et rien de ce qu'il annonce ne doit
//! être cru sans vérification.

#![cfg(windows)]

use std::os::raw::c_void;
use std::os::windows::io::AsRawHandle;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

use windows_sys::Win32::Foundation::CloseHandle;
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
    JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows_sys::Win32::System::Threading::{
    SetPriorityClass, SetProcessInformation, ABOVE_NORMAL_PRIORITY_CLASS, ProcessPowerThrottling,
    PROCESS_POWER_THROTTLING_CURRENT_VERSION, PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
    PROCESS_POWER_THROTTLING_STATE,
};

use super::partage::Segment;
use super::protocole::{self, Demande, Ouverture, Rendu, Requete, BON, ENTETE};
use super::tuyau::{Canal, Ecoute, TOMBE};
use super::{enfant::CODE_PLANTAGE, DRAPEAU};

/// Marque des erreurs qui veulent dire « le processus n'a jamais commencé ».
///
/// C'est la seule circonstance où l'on s'autorise à retomber dans la fenêtre, et
/// il y a quatre façons d'y arriver — le tuyau, la mémoire partagée, le
/// lancement, le branchement. Les reconnaître au début de leur phrase les aurait
/// manquées trois fois sur quatre.
pub const DEMARRAGE: &str = "demarrage-impossible";

/// Sans fenêtre console, même quand la version de débogage en est une.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Combien de temps on laisse au processus pour se brancher.
const BRANCHEMENT: Duration = Duration::from_secs(15);

/// Et combien on lui laisse pour mourir quand on le lui demande.
const AGONIE: Duration = Duration::from_secs(5);

/// Le processus voisin qui tient le cœur, et le fil qui y mène.
pub struct Distante {
    processus: Child,
    poignee: *mut c_void,
    travail: Travail,
    canal: Canal,
    segment: Segment,
    jeton: u32,
    /// Vrai dès qu'un échange a mal tourné. On ne redemande plus rien à un
    /// processus qui a cessé de répondre : il ne répondra pas mieux, et
    /// l'attendre une seconde fois coûterait une minute à qui veut simplement
    /// revenir à la bibliothèque.
    perdu: bool,
    /// Ce que le cœur a dit, mis de côté au fur et à mesure.
    ///
    /// Rangé ici plutôt que rendu avec la réponse, parce qu'une réponse peut
    /// être un refus — et c'est justement alors que ces lignes valent quelque
    /// chose. Les rendre seulement en cas de succès, c'était les jeter au seul
    /// moment où on les cherche.
    dits: Vec<String>,
}

// SAFETY : tout ce qui est ici — poignées Windows, tuyau, projection — est
// propre au processus et non au fil. Les accès sont sérialisés par le verrou
// qui tient la session.
unsafe impl Send for Distante {}

impl Distante {
    /// Lance le processus du cœur et attend qu'il se branche.
    ///
    /// L'ordre compte : le tuyau d'abord, le processus ensuite. Un nom qui
    /// n'existe pas encore rend « fichier introuvable » à qui l'ouvre, et
    /// l'attente de tuyau ne sait attendre qu'un tuyau existant mais occupé.
    pub fn demarrer(exe: &Path, dossier: &Path) -> Result<Self, String> {
        Self::ouvrir(exe, dossier).map_err(|raison| format!("{DEMARRAGE} : {raison}"))
    }

    fn ouvrir(exe: &Path, dossier: &Path) -> Result<Self, String> {
        let ecoute = Ecoute::creer()?;
        let segment = Segment::creer()?;

        let mut commande = Command::new(exe);
        commande
            .arg(DRAPEAU)
            .arg(ecoute.nom())
            .arg(segment.nom())
            // Rien ne lit ces deux sorties, et c'est voulu. Un cœur bavard —
            // Dolphin en écrit des milliers de lignes par seconde — remplirait
            // un tuyau que personne ne vide, et la prochaine écriture le
            // bloquerait au milieu d'une trame. On aurait fabriqué le figement
            // qu'on prétend soigner. Ce que le cœur a d'important à dire passe
            // par le protocole, pas par sa sortie d'erreur.
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW);

        // Le répertoire courant est choisi, et non hérité du lanceur : un cœur
        // qui écrit un fichier à nom relatif le poserait sinon à côté de
        // l'exécutable, là où Windows refuse souvent d'écrire.
        if dossier.is_dir() {
            commande.current_dir(dossier);
        }

        let processus = commande
            .spawn()
            .map_err(|erreur| format!("le processus du cœur n'a pas démarré : {erreur}"))?;

        let poignee = processus.as_raw_handle().cast::<c_void>();
        let travail = Travail::neuf(poignee);
        confort(poignee);

        let canal = match ecoute.accepter(poignee, BRANCHEMENT) {
            Ok(canal) => canal,
            Err(raison) => {
                // Il est peut-être encore vivant sans savoir se brancher : on ne
                // le laisse pas derrière nous.
                let mut orphelin = processus;
                let _ = orphelin.kill();
                let _ = orphelin.wait();
                return Err(raison);
            }
        };

        Ok(Self {
            processus,
            poignee,
            travail,
            canal,
            segment,
            jeton: 0,
            perdu: false,
            dits: Vec::new(),
        })
    }

    /// Pose une question et attend la réponse.
    ///
    /// Rend les lignes que le cœur a écrites depuis la dernière fois — elles
    /// voyagent sur *toutes* les réponses — et la charge utile.
    pub fn demander(&mut self, demande: Demande, charge: &[u8]) -> Result<Vec<u8>, String> {
        if self.perdu {
            return Err(format!("{TOMBE} : le processus du cœur ne répond plus"));
        }

        let issue = self.echanger(demande, charge);
        // Une panne de transport ne se rattrape pas : le flux est désormais
        // désynchronisé, et tout ce qu'on lirait ensuite serait la réponse à une
        // autre question.
        if issue.as_ref().is_err_and(|raison| raison.contains(TOMBE)) {
            self.perdu = true;
        }
        issue
    }

    fn echanger(&mut self, demande: Demande, charge: &[u8]) -> Result<Vec<u8>, String> {
        let echeance = demande.echeance();
        self.jeton = self.jeton.wrapping_add(1);
        let attendu = self.jeton;

        let mut message = Vec::with_capacity(ENTETE + charge.len());
        protocole::envoyer(&mut message, demande as u32, attendu, charge)
            .map_err(|erreur| format!("message non formé : {erreur}"))?;
        self.canal.ecrire(&message, self.poignee, echeance)?;

        let mut entete = [0u8; ENTETE];
        self.canal.lire(&mut entete, self.poignee, echeance)?;
        // Marqué comme une chute : un en-tête qu'on refuse laisse derrière lui un
        // flux dont on ne sait plus où il en est. Sans la marque, le canal serait
        // déclaré sain et la demande suivante lirait la réponse de celle-ci.
        let (longueur, marque, jeton) =
            protocole::decoder_entete(&entete).map_err(|raison| format!("{TOMBE} : {raison}"))?;

        let mut reponse = vec![0u8; longueur as usize];
        if longueur > 0 {
            self.canal.lire(&mut reponse, self.poignee, echeance)?;
        }

        // Une réponse qui ne porte pas le bon jeton est une réponse à une autre
        // question : le fil est perdu, et rien de ce qui suivra n'aura de sens.
        if jeton != attendu {
            return Err(format!(
                "{TOMBE} : réponse {jeton} pour la demande {attendu}, le fil est rompu"
            ));
        }

        let (messages, utile) = protocole::decomposer(&reponse)?;
        // Mises de côté avant de regarder si c'est un oui ou un non : le non les
        // emporterait sinon avec lui.
        self.dits.extend(messages);

        match marque {
            BON => Ok(utile),
            _ => {
                let raison = String::from_utf8_lossy(&utile).into_owned();
                // Le refus formulé par le cœur lui-même est rendu tel quel : il
                // explique ce qu'aucune erreur de transport ne saurait dire.
                Err(if raison.is_empty() {
                    "le cœur a refusé sans explication".into()
                } else {
                    raison
                })
            }
        }
    }

    /// Relève ce que le cœur a dit depuis la dernière fois.
    ///
    /// À appeler après chaque demande, qu'elle ait réussi ou non.
    pub fn prendre_dits(&mut self) -> Vec<String> {
        std::mem::take(&mut self.dits)
    }

    /// Fait tourner le cœur et rend la trame.
    pub fn trame(&mut self, requete: Requete) -> Result<Trame, String> {
        let brut = self.demander(Demande::Trame, &requete.ecrire())?;
        let rendu = Rendu::lire(&brut)?;

        let image = match rendu.geometrie {
            Some((largeur, hauteur)) => Some(Image {
                largeur,
                hauteur,
                rgba: self.segment.relever(rendu.sequence, largeur, hauteur)?,
            }),
            None => None,
        };

        Ok(Trame {
            image,
            audio: rendu.audio,
            arret: rendu.arret,
        })
    }

    /// Demande au cœur de se décharger, puis s'assure que le processus est bien
    /// parti.
    ///
    /// Le déchargement est attendu et non abrégé : c'est là, et nulle part
    /// ailleurs, que la plupart des cœurs écrivent la sauvegarde de pile. Le
    /// couper, c'est perdre la partie.
    ///
    /// Rend faux si l'on a dû le tuer — auquel cas la sauvegarde est peut-être
    /// perdue, et la fenêtre doit le dire.
    pub fn congedier(&mut self) -> bool {
        // On ne demande poliment qu'à qui peut encore répondre. Un cœur figé a
        // déjà fait attendre la fenêtre une fois ; lui redemander de se
        // décharger la ferait attendre une seconde fois, et quarante-cinq
        // secondes pour revenir à la bibliothèque, c'est une application cassée.
        let propre = !self.perdu && self.demander(Demande::Decharger, &[]).is_ok();
        if !propre {
            self.perdu = true;
        }

        // Quoi qu'il ait répondu, on attend sa fin avant de rendre la main. Le
        // processus suivant écrira dans le même dossier de sauvegardes : deux
        // cœurs qui s'y trouvent en même temps, c'est une carte mémoire abîmée.
        let debut = std::time::Instant::now();
        let patience = if propre { AGONIE } else { Duration::from_millis(200) };
        loop {
            match self.processus.try_wait() {
                Ok(Some(_)) => return propre,
                Ok(None) if debut.elapsed() < patience => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                _ => break,
            }
        }

        let _ = self.processus.kill();
        let _ = self.processus.wait();
        false
    }

    /// Ce que Windows dit de sa mort, quand il est mort.
    ///
    /// On laisse un court instant au processus pour finir de tomber : la
    /// fermeture du tuyau arrive avant que Windows ait fini de récolter le
    /// cadavre, et demander tout de suite rendrait « il est encore vivant »
    /// pour un cœur qui vient justement de fauter. Court, parce qu'un cœur figé
    /// est bien vivant et le restera : on ne va pas l'attendre.
    pub fn epitaphe(&mut self) -> Option<String> {
        const RECOLTE: Duration = Duration::from_millis(400);
        let debut = std::time::Instant::now();
        let fin = loop {
            match self.processus.try_wait() {
                Ok(Some(fin)) => break fin,
                Ok(None) if debut.elapsed() < RECOLTE => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                _ => return None,
            }
        };

        let code = fin.code()? as u32;
        Some(match code {
            0 => "il s'est arrêté de lui-même".into(),
            // Le code que l'enfant se donne quand il a rattrapé sa propre faute.
            CODE_PLANTAGE => "il a fauté".into(),
            // Les codes d'exception de Windows. Celui-là, on le nomme : c'est le
            // plus fréquent de tous, et celui qui a motivé ce chantier.
            0xC000_0005 => "il a fauté : violation d'accès".into(),
            autre if (0xC000_0000..0xD000_0000).contains(&autre) => {
                format!("il a fauté (0x{autre:08x})")
            }
            autre => format!("il s'est arrêté (0x{autre:08x})"),
        })
    }
}

impl Drop for Distante {
    fn drop(&mut self) {
        self.congedier();
        // Le travail part en dernier : tant qu'il vit, un processus oublié ne
        // peut pas survivre.
        drop(std::mem::replace(&mut self.travail, Travail::vide()));
    }
}

/// Une image relevée dans la mémoire partagée, déjà recopiée.
pub struct Image {
    pub largeur: u32,
    pub hauteur: u32,
    pub rgba: Vec<u8>,
}

/// Ce qu'une demande de trame rapporte.
pub struct Trame {
    /// Absente quand le cœur a redemandé la précédente, ou quand la fenêtre
    /// n'avait pas besoin de l'image.
    pub image: Option<Image>,
    pub audio: Vec<i16>,
    pub arret: bool,
}

/// De quoi charger un cœur, prêt à partir.
pub fn ouverture(coeur: &Path, systeme: &Path, sauvegardes: &Path) -> Result<Vec<u8>, String> {
    serde_json::to_vec(&Ouverture {
        coeur: coeur.to_string_lossy().into_owned(),
        dossier_systeme: systeme.to_string_lossy().into_owned(),
        dossier_sauvegardes: sauvegardes.to_string_lossy().into_owned(),
    })
    .map_err(|erreur| erreur.to_string())
}

// --- L'objet de travail -----------------------------------------------------

/// Garantit qu'aucun processus de cœur ne survit à la fenêtre.
///
/// Windows ne récolte pas les enfants avec leur parent : il n'a pas de groupe
/// de processus à la manière d'Unix. Or le geste que l'on fait devant un jeu
/// figé, c'est justement de tuer l'application depuis le gestionnaire des
/// tâches — ce qui laisserait un émulateur sans fenêtre à cent pour cent d'un
/// cœur, que rien ne nomme et que personne ne pensera à chercher.
///
/// Un objet de travail règle cela au niveau du noyau : quand la dernière
/// poignée se ferme — y compris parce que le processus qui la tenait a
/// disparu —, tout ce qu'il contient est tué.
struct Travail(*mut c_void);

impl Travail {
    fn vide() -> Self {
        Self(std::ptr::null_mut())
    }

    fn neuf(processus: *mut c_void) -> Self {
        // SAFETY : sans nom ni attributs ; rend null en cas d'échec.
        let travail = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if travail.is_null() {
            return Self::vide();
        }

        // SAFETY : la structure est à zéro puis renseignée, et sa taille est
        // celle que l'appel attend.
        unsafe {
            let mut limites: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limites.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(
                travail,
                JobObjectExtendedLimitInformation,
                std::ptr::addr_of!(limites).cast(),
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            AssignProcessToJobObject(travail, processus);
        }

        Self(travail)
    }
}

impl Drop for Travail {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY : la poignée est à nous et n'est fermée qu'ici.
            unsafe { CloseHandle(self.0) };
        }
    }
}

/// Empêche Windows de traiter le processus du cœur comme de l'arrière-plan.
///
/// Depuis Windows 10, un processus sans fenêtre visible est classé travail
/// d'arrière-plan : planifié de préférence sur les cœurs d'efficacité, et
/// limité en fréquence. Le processus du cœur a exactement ce profil — sa seule
/// fenêtre est celle, invisible, qui porte le contexte OpenGL. Sans ces deux
/// lignes, la même partie tourne à cinquante-deux images par seconde sur
/// batterie là où elle en faisait soixante la veille, et l'on chercherait la
/// cause du côté du tuyau, qui n'y serait pour rien.
fn confort(processus: *mut c_void) {
    // SAFETY : la structure est renseignée en entier et sa taille est donnée.
    unsafe {
        let etat = PROCESS_POWER_THROTTLING_STATE {
            Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
            ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
            // Le masque à zéro veut dire « ne bride pas », et non « laisse
            // faire » : c'est la différence entre décider et s'abstenir.
            StateMask: 0,
        };
        SetProcessInformation(
            processus,
            ProcessPowerThrottling,
            std::ptr::addr_of!(etat).cast(),
            std::mem::size_of::<PROCESS_POWER_THROTTLING_STATE>() as u32,
        );
        SetPriorityClass(processus, ABOVE_NORMAL_PRIORITY_CLASS);
    }
}
