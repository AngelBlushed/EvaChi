//! Hôte libretro : chargement de cœurs, pilotage, transport des trames.
//!
//! libretro définit une frontière en C entre un émulateur et son interface.
//! EvaChi se tient du côté interface : il charge des bibliothèques de cœurs,
//! leur fournit un environnement, et récupère vidéo, son et sauvegardes. Aucun
//! code spécifique à une machine émulée ne vit ici.

pub mod abi;
pub mod core;
pub mod host;
pub mod session;

pub use abi::JOYPAD_BUTTONS;
pub use core::{AvInfo, Core, CoreInfo};
pub use host::VideoFrame;
pub use session::{FramePayload, Session};
