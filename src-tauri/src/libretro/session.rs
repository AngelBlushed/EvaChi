//! Qui tient le cœur, et où.
//!
//! Deux réponses possibles, derrière la même porte.
//!
//! **Dans la fenêtre**, sur un fil dédié : c'est la façon d'origine. Un cœur
//! libretro n'est pas déplaçable entre fils — ses rappels écrivent dans une
//! variable de fil, et la plupart supposent un fil d'exécution unique —, alors
//! que les commandes de l'interface arrivent depuis le pool de Tauri, sur
//! n'importe lequel. [`Locale`] réconcilie les deux : un fil détient le cœur,
//! tout le reste lui parle par messages.
//!
//! **Dans un processus voisin**, un par partie : c'est la façon ordinaire
//! depuis que les cœurs sont isolés. Elle coûte un aller-retour de tuyau par
//! trame et rapporte ceci — un cœur qui plante ne fait plus disparaître la
//! fenêtre, un cœur qui se fige ne la fige plus, et deux cœurs 3D lancés
//! l'un après l'autre ne se marchent plus dessus.
//!
//! Le repli existe, mais il est à sens unique : si le processus voisin ne peut
//! pas démarrer *avant qu'aucun cœur n'ait vécu*, on retombe dans la fenêtre et
//! on l'écrit. Jamais après. Un cœur qui vient de tuer son processus serait
//! sinon réessayé dans la fenêtre, qu'il tuerait à son tour — le repli serait
//! devenu le chemin le plus sûr vers le défaut qu'on supprime.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::thread;

use super::abi::Entrees;
use super::core::{AvInfo, Core, CoreInfo};
use super::host::VideoFrame;

/// Canal de réponse à une requête. L'erreur est aplatie en texte : elle est
/// destinée à l'interface, pas à être rattrapée par du code.
type Reply<T> = Sender<Result<T, String>>;

/// Ce qu'une trame rapporte au thread appelant.
pub struct FramePayload {
    /// Absente quand le cœur a demandé de réafficher la trame précédente, ou
    /// quand la fenêtre a dit qu'elle ne peindrait pas celle-ci.
    pub video: Option<VideoFrame>,
    pub audio: Vec<i16>,
    pub messages: Vec<String>,
    pub shutdown: bool,
}

/// Écrit à la main : la dérivation cracherait plusieurs mégaoctets de pixels
/// dans le moindre message d'erreur.
impl std::fmt::Debug for FramePayload {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FramePayload")
            .field(
                "video",
                &self
                    .video
                    .as_ref()
                    .map(|video| format!("{}x{}", video.width, video.height)),
            )
            .field("audio", &format_args!("{} échantillons", self.audio.len()))
            .field("messages", &self.messages)
            .field("shutdown", &self.shutdown)
            .finish()
    }
}

// --- Le cœur dans la fenêtre ------------------------------------------------

enum Request {
    LoadCore {
        path: PathBuf,
        system_dir: PathBuf,
        save_dir: PathBuf,
        langue: String,
        reply: Reply<CoreInfo>,
    },
    LoadContent {
        path: PathBuf,
        reply: Reply<AvInfo>,
    },
    RunFrame {
        input: Entrees,
        trames: u32,
        reply: Reply<FramePayload>,
    },
    Reset {
        reply: Reply<()>,
    },
    SaveState {
        reply: Reply<Vec<u8>>,
    },
    LoadState {
        data: Vec<u8>,
        reply: Reply<()>,
    },
    Triches {
        consignes: super::triches::Consignes,
        reply: Reply<super::triches::Etat>,
    },
    Memoire {
        debut: u32,
        longueur: u32,
        reply: Reply<Vec<u8>>,
    },
    Unload {
        reply: Reply<()>,
    },
}

/// Poignée vers le fil d'émulation. Le cœur, lui, ne bouge pas.
pub struct Locale {
    /// Enveloppé dans une `Option` pour pouvoir fermer le canal à la
    /// destruction, ce qui fait sortir le fil de sa boucle.
    tx: Option<Sender<Request>>,
    /// Conservé pour attendre le fil : sans cela, le cœur serait déchargé
    /// après le retour de `drop`, et un cœur chargé entre-temps se ferait
    /// déinitialiser sous les pieds.
    thread: Option<thread::JoinHandle<()>>,
}

impl Locale {
    /// Démarre le fil d'émulation. Il vit jusqu'à la destruction, cœur compris.
    pub fn spawn() -> Self {
        let (tx, rx) = channel::<Request>();

        let handle = thread::Builder::new()
            .name("evachi-emulation".into())
            .spawn(move || {
                // Le cœur naît et meurt sur ce fil, jamais ailleurs.
                let mut core: Option<Core> = None;

                while let Ok(request) = rx.recv() {
                    match request {
                        Request::LoadCore {
                            path,
                            system_dir,
                            save_dir,
                            langue,
                            reply,
                        } => {
                            // Le cœur précédent est détruit d'abord : deux cœurs
                            // se disputeraient la même variable de fil.
                            core = None;

                            // SAFETY : charger une bibliothèque exécute son code
                            // d'initialisation ; le chemin vient de l'utilisateur,
                            // qui répond de sa provenance.
                            let outcome =
                                unsafe { Core::load(&path, &system_dir, &save_dir, &langue) };
                            let _ = reply.send(match outcome {
                                Ok(loaded) => {
                                    let info = loaded.info().clone();
                                    core = Some(loaded);
                                    Ok(info)
                                }
                                Err(error) => Err(error.to_string()),
                            });
                        }

                        Request::LoadContent { path, reply } => {
                            let _ = reply.send(match core.as_mut() {
                                Some(core) => {
                                    core.load_content(&path).map_err(|error| error.to_string())
                                }
                                None => Err("aucun cœur chargé".into()),
                            });
                        }

                        Request::RunFrame {
                            input,
                            trames,
                            reply,
                        } => {
                            let _ = reply.send(match core.as_mut() {
                                Some(core) => tourner(core, input, trames),
                                None => Err("aucun cœur chargé".into()),
                            });
                        }

                        Request::Reset { reply } => {
                            let _ = reply.send(match core.as_mut() {
                                Some(core) => core.reset().map_err(|error| error.to_string()),
                                None => Err("aucun cœur chargé".into()),
                            });
                        }

                        Request::SaveState { reply } => {
                            let _ = reply.send(match core.as_ref() {
                                Some(core) => core.save_state().map_err(|error| error.to_string()),
                                None => Err("aucun cœur chargé".into()),
                            });
                        }

                        Request::LoadState { data, reply } => {
                            let _ = reply.send(match core.as_mut() {
                                Some(core) => {
                                    core.load_state(&data).map_err(|error| error.to_string())
                                }
                                None => Err("aucun cœur chargé".into()),
                            });
                        }

                        Request::Triches { consignes, reply } => {
                            let _ = reply.send(match core.as_mut() {
                                Some(core) => Ok(core.poser_triches(&consignes)),
                                None => Err("aucun cœur chargé".into()),
                            });
                        }

                        Request::Memoire {
                            debut,
                            longueur,
                            reply,
                        } => {
                            let _ = reply.send(match core.as_ref() {
                                Some(core) => {
                                    Ok(super::distant::protocole::Tranche { debut, longueur }
                                        .decouper(core.ram()))
                                }
                                None => Err("aucun cœur chargé".into()),
                            });
                        }

                        Request::Unload { reply } => {
                            core = None;
                            let _ = reply.send(Ok(()));
                        }
                    }
                }
            })
            .expect("le fil d'émulation n'a pas pu démarrer");

        Self {
            tx: Some(tx),
            thread: Some(handle),
        }
    }

    /// Envoie une requête et attend sa réponse.
    fn call<T>(&self, build: impl FnOnce(Reply<T>) -> Request) -> Result<T, String> {
        let sender = self
            .tx
            .as_ref()
            .ok_or_else(|| "la session est en cours de fermeture".to_string())?;

        let (tx, rx) = channel();
        sender
            .send(build(tx))
            .map_err(|_| "le fil d'émulation s'est arrêté".to_string())?;
        rx.recv()
            .map_err(|_| "le fil d'émulation n'a pas répondu".to_string())?
    }

    fn load_core(
        &self,
        path: &Path,
        system_dir: &Path,
        save_dir: &Path,
        langue: &str,
    ) -> Result<CoreInfo, String> {
        self.call(|reply| Request::LoadCore {
            path: path.to_path_buf(),
            system_dir: system_dir.to_path_buf(),
            save_dir: save_dir.to_path_buf(),
            langue: langue.to_owned(),
            reply,
        })
    }
}

/// Fait tourner le cœur, une fois ou plusieurs, et rassemble le résultat.
///
/// Partagé par les deux façons de tenir un cœur : la fenêtre doit obtenir la
/// même chose de l'une et de l'autre, sans quoi l'un des deux chemins finirait
/// par diverger sans que rien ne le dise.
fn tourner(core: &mut Core, input: Entrees, trames: u32) -> Result<FramePayload, String> {
    let mut audio: Vec<i16> = Vec::new();
    let mut messages: Vec<String> = Vec::new();
    let mut video = None;
    let mut shutdown = false;

    for _ in 0..trames.max(1) {
        let frame = core.run_frame(input).map_err(|error| error.to_string())?;
        // La dernière image *produite*, et non celle de la dernière trame : un
        // cœur a le droit de redemander la précédente, et cela arrive souvent.
        if frame.video.is_some() {
            video = frame.video;
        }
        audio.extend_from_slice(&frame.audio);
        messages.extend(frame.messages);
        shutdown |= frame.shutdown;
    }

    Ok(FramePayload {
        video,
        audio,
        messages,
        shutdown,
    })
}

impl Drop for Locale {
    fn drop(&mut self) {
        // Fermer le canal fait sortir le fil de sa boucle, ce qui détruit le
        // cœur et appelle `retro_deinit`. On attend ce ménage : sinon il se
        // produirait après le retour de `drop`, et déinitialiserait un cœur
        // chargé entre-temps — les cœurs libretro n'existant qu'en un
        // exemplaire par processus.
        self.tx.take();
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
    }
}

// --- Le cœur à côté ---------------------------------------------------------

/// Ce qu'il faut pour relancer un processus de cœur à chaque partie.
#[cfg(windows)]
struct Chantier {
    /// L'exécutable à relancer. Passé plutôt que déduit : dans un programme
    /// d'épreuve, `current_exe` désigne le programme d'épreuve, pas EvaChi.
    exe: PathBuf,
    voisin: Option<super::distant::Distante>,
    /// Vrai dès qu'un cœur a vécu dans un processus voisin. À partir de là, on
    /// ne revient plus jamais dans la fenêtre.
    engage: bool,
}

// --- La porte commune -------------------------------------------------------

enum Tenant {
    Local(Locale),
    #[cfg(windows)]
    Distant(Chantier),
}

/// Ce qui tient le cœur, quel que soit l'endroit où il vit.
pub struct Session {
    tenant: Mutex<Tenant>,
    /// Ce que le cœur a dit, en attente de relève par l'interface. C'est par là
    /// qu'arrive un BIOS manquant ou un contenu douteux.
    messages: Mutex<Vec<String>>,
}

/// Au-delà, on jette les plus anciens : un cœur bavard ne doit pas faire enfler
/// la file indéfiniment si personne ne la relève.
const MAX_PENDING_MESSAGES: usize = 64;

impl Session {
    /// Le cœur dans cette fenêtre, sur un fil dédié.
    pub fn locale() -> Self {
        Self {
            tenant: Mutex::new(Tenant::Local(Locale::spawn())),
            messages: Mutex::new(Vec::new()),
        }
    }

    /// Le cœur dans un processus voisin, relancé à chaque partie.
    ///
    /// Le processus n'est pas lancé tout de suite : il naît au premier cœur
    /// chargé, et meurt avec lui.
    #[cfg(windows)]
    pub fn isolee(exe: PathBuf) -> Self {
        Self {
            tenant: Mutex::new(Tenant::Distant(Chantier {
                exe,
                voisin: None,
                engage: false,
            })),
            messages: Mutex::new(Vec::new()),
        }
    }

    /// Ailleurs que sous Windows, il n'y a pas d'ailleurs.
    #[cfg(not(windows))]
    pub fn isolee(_exe: PathBuf) -> Self {
        Self::locale()
    }

    /// Range ce que le cœur vient de dire.
    fn retenir(&self, dits: Vec<String>) {
        if dits.is_empty() {
            return;
        }
        if let Ok(mut file) = self.messages.lock() {
            file.extend(dits);
            let trop = file.len().saturating_sub(MAX_PENDING_MESSAGES);
            if trop > 0 {
                file.drain(..trop);
            }
        }
    }

    fn tenant(&self) -> std::sync::MutexGuard<'_, Tenant> {
        self.tenant
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
    }

    pub fn load_core(
        &self,
        path: &Path,
        system_dir: &Path,
        save_dir: &Path,
        langue: &str,
    ) -> Result<CoreInfo, String> {
        let mut tenant = self.tenant();
        match &mut *tenant {
            Tenant::Local(locale) => locale.load_core(path, system_dir, save_dir, langue),
            #[cfg(windows)]
            Tenant::Distant(chantier) => {
                let issue = self.ouvrir_a_cote(chantier, path, system_dir, save_dir, langue);
                match issue {
                    Ok(info) => Ok(info),
                    // Aucun cœur n'a encore vécu à côté, et c'est le démarrage
                    // qui a échoué : le repli est encore honnête, et il vaut
                    // mieux qu'une application qui refuse de jouer.
                    Err(raison)
                        if !chantier.engage && raison.contains(super::distant::DEMARRAGE) =>
                    {
                        eprintln!("[session] {raison} — le cœur restera dans la fenêtre");
                        let locale = Locale::spawn();
                        let repli = locale.load_core(path, system_dir, save_dir, langue);
                        *tenant = Tenant::Local(locale);
                        repli
                    }
                    Err(raison) => Err(raison),
                }
            }
        }
    }

    /// Ouvre un cœur dans un processus neuf.
    #[cfg(windows)]
    fn ouvrir_a_cote(
        &self,
        chantier: &mut Chantier,
        path: &Path,
        system_dir: &Path,
        save_dir: &Path,
        langue: &str,
    ) -> Result<CoreInfo, String> {
        use super::distant::{parent, protocole::Demande, Distante};

        // Le précédent s'en va d'abord, et on attend qu'il soit vraiment parti :
        // deux cœurs qui écrivent en même temps dans le même dossier de
        // sauvegardes, c'est une carte mémoire abîmée.
        chantier.voisin = None;

        // Une seconde chance, et une seule. Lancer un processus échoue parfois
        // pour des raisons passagères — un antivirus qui inspecte un exécutable
        // qui se relance vingt fois par session, une ressource système prise à
        // l'instant. Réessayer une fois coûte un dixième de seconde et évite de
        // renvoyer l'utilisateur à la bibliothèque pour une contrariété qui
        // aurait disparu d'elle-même.
        let mut voisin = match Distante::demarrer(&chantier.exe, save_dir) {
            Ok(voisin) => voisin,
            Err(premiere) => {
                eprintln!("[session] {premiere} — on réessaie une fois");
                std::thread::sleep(std::time::Duration::from_millis(150));
                Distante::demarrer(&chantier.exe, save_dir)?
            }
        };

        // Le processus a vécu dès l'instant où il s'est branché — pas seulement
        // quand un cœur y sera chargé. Si le chargement échoue parce que le cœur
        // a fauté, on ne doit surtout pas le réessayer dans la fenêtre : il la
        // tuerait à son tour.
        chantier.engage = true;
        let charge = parent::ouverture(path, system_dir, save_dir, langue)?;

        let issue = voisin.demander(Demande::ChargerCoeur, &charge);
        // Relevé avant de regarder l'issue : ce que le cœur a écrit avant de
        // refuser est tout ce qu'on a pour comprendre pourquoi.
        self.retenir(voisin.prendre_dits());
        let brut = match issue {
            Ok(reponse) => reponse,
            Err(raison) => return Err(self.enrichir(&mut voisin, raison)),
        };

        let info: CoreInfo = serde_json::from_slice(&brut)
            .map_err(|erreur| format!("identité du cœur illisible : {erreur}"))?;

        chantier.voisin = Some(voisin);
        Ok(info)
    }

    /// Ajoute à une erreur ce que Windows dit de la mort du processus.
    ///
    /// « Il ne répond plus » et « il a fauté » n'appellent pas le même conseil,
    /// et l'utilisateur a le droit de savoir lequel des deux il a sous les yeux.
    #[cfg(windows)]
    fn enrichir(&self, voisin: &mut super::distant::Distante, raison: String) -> String {
        match voisin.epitaphe() {
            Some(mot) if raison.contains(super::distant::TOMBE) => format!("{raison} — {mot}"),
            _ => raison,
        }
    }

    #[cfg(windows)]
    fn voisin<'a>(&self, tenant: &'a mut Tenant) -> Result<&'a mut super::distant::Distante, String> {
        match tenant {
            Tenant::Distant(chantier) => chantier
                .voisin
                .as_mut()
                .ok_or_else(|| "aucun cœur chargé".to_string()),
            Tenant::Local(_) => Err("aucun cœur chargé".into()),
        }
    }

    /// Demande quelque chose au processus voisin, en rangeant ce qu'il dit.
    #[cfg(windows)]
    fn demander(
        &self,
        tenant: &mut Tenant,
        demande: super::distant::protocole::Demande,
        charge: &[u8],
    ) -> Result<Vec<u8>, String> {
        let voisin = self.voisin(tenant)?;
        let issue = voisin.demander(demande, charge);
        // Quoi qu'il ait répondu : un refus porte souvent l'explication du refus.
        let dits = voisin.prendre_dits();
        let issue = issue.map_err(|raison| self.enrichir(voisin, raison));
        self.retenir(dits);
        issue
    }

    pub fn load_content(&self, path: &Path) -> Result<AvInfo, String> {
        let mut tenant = self.tenant();
        match &mut *tenant {
            Tenant::Local(locale) => locale.call(|reply| Request::LoadContent {
                path: path.to_path_buf(),
                reply,
            }),
            #[cfg(windows)]
            Tenant::Distant(_) => {
                use super::distant::protocole::Demande;
                let brut = self.demander(
                    &mut tenant,
                    Demande::ChargerContenu,
                    path.to_string_lossy().as_bytes(),
                )?;
                serde_json::from_slice(&brut)
                    .map_err(|erreur| format!("géométrie illisible : {erreur}"))
            }
        }
    }

    /// Fait tourner une trame.
    pub fn run_frame(&self, input: Entrees) -> Result<FramePayload, String> {
        self.run_frames(input, 1, true)
    }

    /// Fait tourner `trames` trames d'affilée, et ne rapporte l'image que si la
    /// fenêtre compte la peindre.
    ///
    /// Plusieurs trames d'un coup servent l'avance rapide : à neuf cents pour
    /// cent, on en exécute neuf pour n'en regarder qu'une, et les demander une
    /// par une paierait l'aller-retour neuf fois.
    pub fn run_frames(
        &self,
        input: Entrees,
        trames: u32,
        image: bool,
    ) -> Result<FramePayload, String> {
        let mut tenant = self.tenant();
        let payload = match &mut *tenant {
            Tenant::Local(locale) => locale.call(|reply| Request::RunFrame {
                input,
                trames,
                reply,
            })?,
            #[cfg(windows)]
            Tenant::Distant(_) => {
                use super::distant::protocole::Requete;
                let requete = Requete {
                    entrees: input,
                    trames,
                    image,
                };
                let voisin = self.voisin(&mut tenant)?;
                let issue = voisin.trame(requete);
                let dits = voisin.prendre_dits();
                let trame = match issue {
                    Ok(trame) => trame,
                    Err(raison) => {
                        let raison = self.enrichir(voisin, raison);
                        self.retenir(dits);
                        return Err(raison);
                    }
                };
                self.retenir(dits);

                FramePayload {
                    video: trame.image.map(|image| VideoFrame {
                        rgba: image.rgba,
                        width: image.largeur,
                        height: image.hauteur,
                    }),
                    audio: trame.audio,
                    messages: Vec::new(),
                    shutdown: trame.arret,
                }
            }
        };

        self.retenir(payload.messages);
        Ok(FramePayload {
            messages: Vec::new(),
            ..payload
        })
    }

    /// Relève les messages accumulés et vide la file.
    pub fn take_messages(&self) -> Vec<String> {
        let mut file = self
            .messages
            .lock()
            .map(|mut file| std::mem::take(&mut *file))
            .unwrap_or_default();

        // Quand le cœur vit ici, le journal est une globale de ce processus : on
        // le relève sur place. Quand il vit à côté, ces lignes sont déjà venues
        // avec les réponses — elles voyagent sur toutes, et pas seulement sur
        // celles des trames, faute de quoi un chargement refusé n'expliquerait
        // jamais ce qui lui manquait.
        if matches!(&*self.tenant(), Tenant::Local(_)) {
            file.extend(super::host::prendre_messages());
            file.extend(super::host::take_core_log());
        }
        file
    }

    pub fn reset(&self) -> Result<(), String> {
        let mut tenant = self.tenant();
        match &mut *tenant {
            Tenant::Local(locale) => locale.call(|reply| Request::Reset { reply }),
            #[cfg(windows)]
            Tenant::Distant(_) => {
                use super::distant::protocole::Demande;
                self.demander(&mut tenant, Demande::Reinitialiser, &[])
                    .map(|_| ())
            }
        }
    }

    pub fn save_state(&self) -> Result<Vec<u8>, String> {
        let mut tenant = self.tenant();
        match &mut *tenant {
            Tenant::Local(locale) => locale.call(|reply| Request::SaveState { reply }),
            #[cfg(windows)]
            Tenant::Distant(_) => {
                use super::distant::protocole::Demande;
                self.demander(&mut tenant, Demande::SauverEtat, &[])
            }
        }
    }

    /// Pose les triches et les valeurs à maintenir, et dit ce qui a été retenu.
    ///
    /// Tout part d'un coup, à chaque changement : une liste complète se
    /// remplace sans qu'on ait à suivre ce qui a été coché ou décoché, et le
    /// cœur oublie les précédentes avant de reprendre les nouvelles. Décocher
    /// arrête donc l'écriture à l'instant, ce qui est la seule chose qui
    /// compte quand une triche a mal tourné.
    pub fn poser_triches(
        &self,
        consignes: super::triches::Consignes,
    ) -> Result<super::triches::Etat, String> {
        let mut tenant = self.tenant();
        match &mut *tenant {
            Tenant::Local(locale) => locale.call(|reply| Request::Triches { consignes, reply }),
            #[cfg(windows)]
            Tenant::Distant(_) => {
                use super::distant::protocole::Demande;
                let charge = serde_json::to_vec(&consignes)
                    .map_err(|erreur| format!("consignes illisibles : {erreur}"))?;
                let brut = self.demander(&mut tenant, Demande::Triches, &charge)?;
                serde_json::from_slice(&brut)
                    .map_err(|erreur| format!("réponse aux triches illisible : {erreur}"))
            }
        }
    }

    /// Une tranche de la RAM de travail, pour la recherche de valeurs.
    ///
    /// Bornée par le cœur lui-même : une tranche qui dépasserait est rognée,
    /// jamais lue plus loin.
    pub fn lire_memoire(&self, debut: u32, longueur: u32) -> Result<Vec<u8>, String> {
        let mut tenant = self.tenant();
        match &mut *tenant {
            Tenant::Local(locale) => locale.call(|reply| Request::Memoire {
                debut,
                longueur,
                reply,
            }),
            #[cfg(windows)]
            Tenant::Distant(_) => {
                use super::distant::protocole::{Demande, Tranche};
                let charge = serde_json::to_vec(&Tranche { debut, longueur })
                    .map_err(|erreur| erreur.to_string())?;
                self.demander(&mut tenant, Demande::Memoire, &charge)
            }
        }
    }

    pub fn load_state(&self, data: Vec<u8>) -> Result<(), String> {
        let mut tenant = self.tenant();
        match &mut *tenant {
            Tenant::Local(locale) => locale.call(|reply| Request::LoadState { data, reply }),
            #[cfg(windows)]
            Tenant::Distant(_) => {
                use super::distant::protocole::Demande;
                self.demander(&mut tenant, Demande::ReprendreEtat, &data)
                    .map(|_| ())
            }
        }
    }

    /// Range le cœur. Le processus voisin, lui, s'en va pour de bon.
    pub fn unload(&self) -> Result<(), String> {
        let mut tenant = self.tenant();
        match &mut *tenant {
            Tenant::Local(locale) => locale.call(|reply| Request::Unload { reply }),
            #[cfg(windows)]
            Tenant::Distant(chantier) => {
                // La destruction fait le nécessaire : demander le déchargement,
                // l'attendre — c'est là que le cœur écrit sa sauvegarde de pile
                // —, puis s'assurer que le processus est bien parti.
                match chantier.voisin.take() {
                    Some(mut voisin) => {
                        let propre = voisin.congedier();
                        drop(voisin);
                        if propre {
                            Ok(())
                        } else {
                            Err("le cœur n'a pas répondu : la sauvegarde de cette partie n'a peut-être pas été écrite".into())
                        }
                    }
                    None => Ok(()),
                }
            }
        }
    }

    /// Vrai quand le cœur vit dans un processus à côté.
    pub fn isolee_en_cours(&self) -> bool {
        !matches!(&*self.tenant(), Tenant::Local(_))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn une_session_locale_se_dit_locale() {
        let session = Session::locale();
        assert!(!session.isolee_en_cours());
    }

    #[test]
    fn une_session_sans_coeur_refuse_poliment() {
        let session = Session::locale();
        let erreur = session
            .run_frame(Entrees::default())
            .expect_err("refus attendu");
        assert!(erreur.contains("aucun cœur"), "{erreur}");
    }

    #[test]
    fn les_messages_ne_s_accumulent_pas_sans_fin() {
        // Un cœur bavard ne doit pas faire enfler la file quand personne ne la
        // relève : on garde les derniers, qui sont les plus près de l'incident.
        let session = Session::locale();
        for rang in 0..MAX_PENDING_MESSAGES * 3 {
            session.retenir(vec![format!("ligne {rang}")]);
        }
        let releve = session.take_messages();
        assert_eq!(releve.len(), MAX_PENDING_MESSAGES);
        assert_eq!(releve[MAX_PENDING_MESSAGES - 1], "ligne 191");
    }

    #[test]
    fn relever_deux_fois_ne_rend_rien_la_seconde() {
        let session = Session::locale();
        session.retenir(vec!["une chose".to_string()]);
        assert_eq!(session.take_messages().len(), 1);
        assert!(session.take_messages().is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn une_session_isolee_sans_processus_refuse_poliment() {
        // Aucun cœur chargé, donc aucun processus : la demande doit être
        // refusée avec des mots, pas par une attente sans fin.
        let session = Session::isolee(PathBuf::from("evachi-qui-n-existe-pas.exe"));
        assert!(session.isolee_en_cours());
        let erreur = session
            .run_frame(Entrees::default())
            .expect_err("refus attendu");
        assert!(erreur.contains("aucun cœur"), "{erreur}");
    }

    #[cfg(windows)]
    #[test]
    fn un_executable_introuvable_retombe_dans_la_fenetre() {
        // Le repli n'est légitime qu'ici : aucun cœur n'a encore vécu à côté.
        // L'erreur rendue est alors celle du cœur, pas celle du lancement.
        let session = Session::isolee(PathBuf::from("evachi-qui-n-existe-pas.exe"));
        let erreur = session
            .load_core(
                Path::new("coeur-qui-n-existe-pas.dll"),
                Path::new("."),
                Path::new("."),
                "fr",
            )
            .expect_err("refus attendu");

        assert!(!session.isolee_en_cours(), "on doit être retombé dans la fenêtre");
        assert!(
            erreur.contains("illisible") || erreur.contains("symbole"),
            "{erreur}"
        );
    }
}
