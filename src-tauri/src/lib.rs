// EvaChi — hôte d'émulation multi-systèmes
// Copyright (C) 2026  contributeurs d'EvaChi
//
// Ce programme est un logiciel libre : vous pouvez le redistribuer et/ou le
// modifier selon les termes de la Licence publique générale GNU telle que
// publiée par la Free Software Foundation, soit la version 3, soit (à votre
// choix) toute version ultérieure. Voir <https://www.gnu.org/licenses/>.

//! L'hôte d'émulation, exposé en bibliothèque.
//!
//! Le binaire n'est qu'une coque Tauri par-dessus. Séparer les deux permet aux
//! tests d'intégration de charger un vrai cœur et d'éprouver l'ABI sans passer
//! par l'interface.

pub mod libretro;
/// Les sauvegardes que le jeu écrit lui-même. Ici plutôt que dans le binaire :
/// c'est le cœur qui les remplit, et c'est donc la bibliothèque qui les range.
pub mod piles;
