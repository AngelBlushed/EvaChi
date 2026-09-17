//! Le cœur dans un processus à côté.
//!
//! Un cœur libretro est une bibliothèque étrangère à qui l'on donne tous les
//! droits sur la mémoire de qui la charge. Quand elle lit de travers — Flycast
//! l'a fait — Windows tue le processus fautif, c'est-à-dire la fenêtre entière :
//! sans message, sans journal, sans retour à la bibliothèque.
//!
//! Ici, le cœur ne vit plus dans la fenêtre. Il vit dans un processus voisin,
//! un par partie, qui n'est autre que le même exécutable relancé avec un
//! drapeau interne — le chemin qu'emprunte déjà l'interrogation des cœurs. La
//! fenêtre lui parle par un tuyau nommé, regarde ses images dans une mémoire
//! partagée, et le voit mourir sans mourir avec lui.
//!
//! Trois défauts disparaissent d'un coup, et le troisième est gratuit :
//!
//! 1. un cœur qui plante n'emporte plus la fenêtre ;
//! 2. un cœur qui se fige ne la fige plus — au bout de l'échéance, on le tue ;
//! 3. trois cœurs 3D d'affilée ne se marchent plus dessus, puisqu'aucun ne
//!    partage plus ses variables globales avec le suivant : elles meurent avec
//!    leur processus.
//!
//! Le module est réservé à Windows. Ailleurs, [`super::Session`] garde le cœur
//! sur un fil de la fenêtre, comme avant.

#![cfg(windows)]

pub mod enfant;
pub mod parent;
pub mod partage;
pub mod protocole;
pub mod tuyau;

pub use parent::{Distante, DEMARRAGE};
pub use tuyau::TOMBE;

/// Argument interne : tient un cœur pour le compte de la fenêtre, et ne rend la
/// main qu'à la fin de la partie.
///
/// Il attend le nom du tuyau puis celui de la mémoire partagée.
pub const DRAPEAU: &str = "--tenir-un-coeur";
