//! Hôte libretro : chargement de cœurs, pilotage, transport des trames.
//!
//! libretro définit une frontière en C entre un émulateur et son interface.
//! EvaChi se tient du côté interface : il charge des bibliothèques de cœurs,
//! leur fournit un environnement, et récupère vidéo, son et sauvegardes. Aucun
//! code spécifique à une machine émulée ne vit ici.

pub mod abi;
pub mod core;
/// Les disques d'un jeu qui en a plusieurs, retrouvés par leur nom.
pub mod disques;
/// Le cœur dans un processus voisin. Windows seulement : le tuyau nommé, la
/// mémoire partagée et l'objet de travail n'ont pas d'équivalent portable, et
/// c'est la seule plateforme que l'application vise.
#[cfg(windows)]
pub mod distant;
/// Contexte OpenGL pour les cœurs 3D. Windows seulement : c'est WGL qui le
/// porte, et la seule plateforme que l'application vise aujourd'hui.
#[cfg(windows)]
pub mod gl;
pub mod host;
pub mod langues;
pub mod session;
pub mod triches;

pub use abi::{Entrees, Manettes, JOYPAD_BUTTONS, MANCHES, PORTS};
pub use core::{AvInfo, Core, CoreInfo, Disques};
pub use host::VideoFrame;
pub use triches::{Consignes, Poke};
pub use session::{FramePayload, Session};
