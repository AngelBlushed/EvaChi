//! Le thread propriétaire du cœur.
//!
//! Un cœur libretro n'est pas déplaçable entre threads : ses rappels écrivent
//! dans une variable de thread, et la plupart des cœurs supposent un fil
//! d'exécution unique. Les commandes de l'interface arrivent en revanche depuis
//! le pool de Tauri, sur n'importe quel thread.
//!
//! [`Session`] réconcilie les deux : un thread dédié détient le cœur, tout le
//! reste lui parle par messages.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::thread;

use super::abi::JOYPAD_BUTTONS;
use super::core::{AvInfo, Core, CoreInfo};
use super::host::VideoFrame;

/// Canal de réponse à une requête. L'erreur est aplatie en texte : elle est
/// destinée à l'interface, pas à être rattrapée par du code.
type Reply<T> = Sender<Result<T, String>>;

/// Ce qu'une trame rapporte au thread appelant.
pub struct FramePayload {
    /// Absente quand le cœur a demandé de réafficher la trame précédente.
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

enum Request {
    LoadCore {
        path: PathBuf,
        system_dir: PathBuf,
        save_dir: PathBuf,
        reply: Reply<CoreInfo>,
    },
    LoadContent {
        path: PathBuf,
        reply: Reply<AvInfo>,
    },
    RunFrame {
        input: [i16; JOYPAD_BUTTONS],
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
    Unload {
        reply: Reply<()>,
    },
}

/// Poignée vers le thread d'émulation. Clonable et utilisable depuis n'importe
/// quel thread ; le cœur, lui, ne bouge pas.
pub struct Session {
    /// Enveloppé dans une `Option` pour pouvoir fermer le canal à la
    /// destruction, ce qui fait sortir le thread de sa boucle.
    tx: Option<Sender<Request>>,
    /// Conservé pour attendre le thread : sans cela, le cœur serait déchargé
    /// après le retour de `drop`, et un cœur chargé entre-temps se ferait
    /// déinitialiser sous les pieds.
    thread: Option<thread::JoinHandle<()>>,
    /// Messages émis par le cœur, en attente de relève par l'interface. C'est
    /// par là qu'un cœur signale un BIOS manquant ou un contenu douteux.
    messages: Mutex<Vec<String>>,
}

/// Au-delà, on jette les plus anciens : un cœur bavard ne doit pas faire enfler
/// la file indéfiniment si personne ne la relève.
const MAX_PENDING_MESSAGES: usize = 64;

impl Session {
    /// Démarre le thread d'émulation. Il vit jusqu'à la destruction de la
    /// session, cœur compris.
    pub fn spawn() -> Self {
        let (tx, rx) = channel::<Request>();

        let handle = thread::Builder::new()
            .name("evachi-emulation".into())
            .spawn(move || {
                // Le cœur naît et meurt sur ce thread, jamais ailleurs.
                let mut core: Option<Core> = None;

                while let Ok(request) = rx.recv() {
                    match request {
                        Request::LoadCore {
                            path,
                            system_dir,
                            save_dir,
                            reply,
                        } => {
                            // Le cœur précédent est détruit d'abord : deux cœurs
                            // se disputeraient la même variable de thread.
                            core = None;

                            // SAFETY : charger une bibliothèque exécute son code
                            // d'initialisation ; le chemin vient de l'utilisateur,
                            // qui répond de sa provenance.
                            let outcome = unsafe { Core::load(&path, &system_dir, &save_dir) };
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

                        Request::RunFrame { input, reply } => {
                            let _ = reply.send(match core.as_mut() {
                                Some(core) => core
                                    .run_frame(input)
                                    .map(|frame| FramePayload {
                                        video: frame.video,
                                        audio: frame.audio,
                                        messages: frame.messages,
                                        shutdown: frame.shutdown,
                                    })
                                    .map_err(|error| error.to_string()),
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

                        Request::Unload { reply } => {
                            core = None;
                            let _ = reply.send(Ok(()));
                        }
                    }
                }
            })
            .expect("le thread d'émulation n'a pas pu démarrer");

        Self {
            tx: Some(tx),
            thread: Some(handle),
            messages: Mutex::new(Vec::new()),
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
            .map_err(|_| "le thread d'émulation s'est arrêté".to_string())?;
        rx.recv()
            .map_err(|_| "le thread d'émulation n'a pas répondu".to_string())?
    }

    pub fn load_core(
        &self,
        path: &Path,
        system_dir: &Path,
        save_dir: &Path,
    ) -> Result<CoreInfo, String> {
        self.call(|reply| Request::LoadCore {
            path: path.to_path_buf(),
            system_dir: system_dir.to_path_buf(),
            save_dir: save_dir.to_path_buf(),
            reply,
        })
    }

    pub fn load_content(&self, path: &Path) -> Result<AvInfo, String> {
        self.call(|reply| Request::LoadContent {
            path: path.to_path_buf(),
            reply,
        })
    }

    pub fn run_frame(&self, input: [i16; JOYPAD_BUTTONS]) -> Result<FramePayload, String> {
        let mut payload = self.call(|reply| Request::RunFrame { input, reply })?;

        if !payload.messages.is_empty() {
            if let Ok(mut pending) = self.messages.lock() {
                pending.append(&mut payload.messages);
                let excess = pending.len().saturating_sub(MAX_PENDING_MESSAGES);
                if excess > 0 {
                    pending.drain(..excess);
                }
            }
        }

        Ok(payload)
    }

    /// Relève les messages accumulés et vide la file.
    pub fn take_messages(&self) -> Vec<String> {
        let mut pending = self
            .messages
            .lock()
            .map(|mut pending| std::mem::take(&mut *pending))
            .unwrap_or_default();

        // Ce que le cœur a écrit avant de refuser le contenu ne passait par
        // aucune trame — puisqu'il n'y en a jamais eu — et n'arrivait donc
        // qu'au jeu suivant, où il n'expliquait plus rien. C'est pourtant le
        // seul endroit où l'on apprend *pourquoi* un chargement a échoué.
        pending.extend(super::host::take_core_log());
        pending
    }

    pub fn reset(&self) -> Result<(), String> {
        self.call(|reply| Request::Reset { reply })
    }

    pub fn save_state(&self) -> Result<Vec<u8>, String> {
        self.call(|reply| Request::SaveState { reply })
    }

    pub fn load_state(&self, data: Vec<u8>) -> Result<(), String> {
        self.call(|reply| Request::LoadState { data, reply })
    }

    pub fn unload(&self) -> Result<(), String> {
        self.call(|reply| Request::Unload { reply })
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        // Fermer le canal fait sortir le thread de sa boucle, ce qui détruit le
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
