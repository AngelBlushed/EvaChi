//! Déclarations de l'ABI libretro, transcrites depuis `libretro.h`.
//!
//! libretro est une interface C stable : un cœur d'émulation est une
//! bibliothèque dynamique qui exporte une trentaine de symboles connus. C'est
//! ce qui permet à EvaChi d'héberger des cœurs très différents sans se brancher
//! sur les entrailles de chacun.
//!
//! Rien ici n'est spécifique à une machine émulée : ce fichier ne décrit que la
//! forme des appels et des structures échangées.

#![allow(non_camel_case_types)]
// Ce fichier transcrit une interface externe, pas seulement la part qu'EvaChi
// consomme aujourd'hui : les commandes qu'on refuse volontairement sont
// nommées ici pour que le refus soit lisible plutôt que muet.
#![allow(dead_code)]

use std::os::raw::{c_char, c_uint, c_void};

/// Version de l'API que ce hôte sait piloter. Un cœur qui renvoie autre chose
/// est refusé plutôt que d'être appelé au hasard.
pub const RETRO_API_VERSION: c_uint = 1;

// --- Commandes d'environnement ---------------------------------------------
// Le cœur interroge et configure son hôte par un unique point d'entrée, en
// distinguant les requêtes par un numéro. On n'implémente que celles dont les
// cœurs ont réellement besoin pour démarrer.

pub const ENV_SET_ROTATION: c_uint = 1;
pub const ENV_GET_CAN_DUPE: c_uint = 3;
pub const ENV_SET_MESSAGE: c_uint = 6;
pub const ENV_SHUTDOWN: c_uint = 7;
pub const ENV_SET_PERFORMANCE_LEVEL: c_uint = 8;
pub const ENV_GET_SYSTEM_DIRECTORY: c_uint = 9;
pub const ENV_SET_PIXEL_FORMAT: c_uint = 10;
pub const ENV_SET_INPUT_DESCRIPTORS: c_uint = 11;
/// Le cœur tend sa table pour piloter son lecteur de disques.
///
/// C'est lui qui la donne, et l'hôte qui s'en sert : éjecter, changer de
/// disque, refermer. Sans elle, un jeu qui demande le disque deux attend
/// indéfiniment un geste que personne ne peut faire.
pub const ENV_SET_DISK_CONTROL_INTERFACE: c_uint = 13;
pub const ENV_SET_HW_RENDER: c_uint = 14;
pub const ENV_GET_VARIABLE: c_uint = 15;
pub const ENV_SET_VARIABLES: c_uint = 16;
pub const ENV_GET_VARIABLE_UPDATE: c_uint = 17;
pub const ENV_SET_SUPPORT_NO_GAME: c_uint = 18;
pub const ENV_GET_LIBRETRO_PATH: c_uint = 19;
/// La langue que l'hôte demande au cœur. Voir [`crate::libretro::langues`].
pub const ENV_GET_LANGUAGE: c_uint = 21;

/// La mémoire de sauvegarde de la cartouche, celle qui finit sur le disque.
///
/// Jamais touchée par les triches : c'est la distinction entre elle et la RAM
/// de travail qui garantit qu'une triche ne peut pas abîmer une sauvegarde.
/// Voir [`crate::libretro::triches`]. Elle a son propre chemin, celui des
/// piles : le cœur l'expose, et l'hôte la relit et la range —
/// voir [`crate::piles`].
pub const MEMORY_SAVE_RAM: c_uint = 0;
/// L'horloge de la cartouche, pour les jeux qui suivent le temps réel.
///
/// Rangée comme la pile, sous son propre suffixe : sans elle, une partie
/// reprise ne sait plus quel jour on était, et les jeux qui font pousser
/// quelque chose la nuit ne poussent plus.
pub const MEMORY_RTC: c_uint = 1;
/// La RAM de travail de la console. La seule que les triches écrivent.
pub const MEMORY_SYSTEM_RAM: c_uint = 2;
pub const ENV_GET_LOG_INTERFACE: c_uint = 27;
/// Le même numéro que le journal, mais marqué expérimental : c'est ainsi que
/// libretro distingue les deux, et les confondre rendrait au cœur une table de
/// fonctions à la place de l'autre.
pub const ENV_GET_SENSOR_INTERFACE: c_uint = 27 | ENV_EXPERIMENTAL;
pub const ENV_GET_CORE_ASSETS_DIRECTORY: c_uint = 30;
pub const ENV_GET_SAVE_DIRECTORY: c_uint = 31;
pub const ENV_SET_GEOMETRY: c_uint = 37;
pub const ENV_GET_INPUT_BITMASKS: c_uint = 51 | ENV_EXPERIMENTAL;
pub const ENV_GET_CORE_OPTIONS_VERSION: c_uint = 52;
pub const ENV_SET_CORE_OPTIONS_V2: c_uint = 67;
pub const ENV_SET_CORE_OPTIONS_V2_INTL: c_uint = 68;
pub const ENV_GET_PREFERRED_HW_RENDER: c_uint = 69;
/// La même table, en plus complète : elle sait dire le nom de chaque disque.
///
/// Les cœurs récents tendent celle-ci, les anciens l'autre. Les sept
/// premières fonctions sont les mêmes, dans le même ordre : c'est ce qui
/// permet de les lire d'un seul et même morceau.
pub const ENV_SET_DISK_CONTROL_EXT_INTERFACE: c_uint = 58 | ENV_EXPERIMENTAL;

/// Marqueur des commandes encore expérimentales côté libretro.
pub const ENV_EXPERIMENTAL: c_uint = 0x10000;

// --- Rendu par le processeur graphique --------------------------------------

/// Genre de contexte graphique qu'un cœur peut réclamer.
///
/// EvaChi n'en sert que les variantes OpenGL de bureau : ce sont celles que les
/// cœurs 3D demandent en premier, et Windows les fournit sans couche
/// intermédiaire.
pub const HW_CONTEXT_NONE: c_uint = 0;
pub const HW_CONTEXT_OPENGL: c_uint = 1;
pub const HW_CONTEXT_OPENGLES2: c_uint = 2;
pub const HW_CONTEXT_OPENGL_CORE: c_uint = 3;
pub const HW_CONTEXT_OPENGLES3: c_uint = 4;
pub const HW_CONTEXT_OPENGLES_VERSION: c_uint = 5;
pub const HW_CONTEXT_VULKAN: c_uint = 6;

/// Valeur que le cœur passe à `video_refresh` quand la trame est déjà dans le
/// tampon de rendu, et non dans un tableau de pixels.
///
/// libretro la définit comme `(void*)-1` : une adresse impossible, choisie pour
/// ne jamais être confondue avec un vrai tampon.
pub const HW_FRAME_BUFFER_VALID: *const c_void = usize::MAX as *const c_void;

/// Ce que le cœur demande et ce que l'hôte lui rend, pour le rendu matériel.
///
/// L'ordre des champs est celui de `libretro.h` et ne souffre aucune liberté :
/// le cœur écrit dans cette structure et relit ce qu'on y a mis.
#[repr(C)]
pub struct HwRenderCallback {
    /// Genre de contexte réclamé, parmi les `HW_CONTEXT_*`.
    pub context_type: c_uint,
    /// À appeler une fois le contexte prêt, et après chaque recréation.
    pub context_reset: Option<unsafe extern "C" fn()>,
    /// Rempli par l'hôte : rend l'identifiant du tampon de rendu courant.
    pub get_current_framebuffer: Option<unsafe extern "C" fn() -> usize>,
    /// Rempli par l'hôte : résout un symbole OpenGL par son nom.
    pub get_proc_address: Option<unsafe extern "C" fn(*const c_char) -> *const c_void>,
    pub depth: bool,
    pub stencil: bool,
    /// Vrai si le cœur dessine à la manière d'OpenGL, origine en bas à gauche.
    pub bottom_left_origin: bool,
    pub version_major: c_uint,
    pub version_minor: c_uint,
    /// Le cœur souhaite que le contexte survive à une réinitialisation.
    pub cache_context: bool,
    /// À appeler avant de détruire le contexte.
    pub context_destroy: Option<unsafe extern "C" fn()>,
    pub debug_context: bool,
}

// --- Format des pixels ------------------------------------------------------

/// Format du tampon vidéo que le cœur remplit. Il l'annonce une fois pour
/// toutes via `ENV_SET_PIXEL_FORMAT`, avant la première trame.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PixelFormat {
    /// 15 bits par pixel, bit de poids fort ignoré.
    Rgb1555,
    /// 32 bits par pixel, octet de poids fort ignoré. Le plus courant.
    Xrgb8888,
    /// 16 bits par pixel, 5-6-5.
    Rgb565,
}

impl PixelFormat {
    pub fn from_raw(value: c_uint) -> Option<Self> {
        match value {
            0 => Some(Self::Rgb1555),
            1 => Some(Self::Xrgb8888),
            2 => Some(Self::Rgb565),
            _ => None,
        }
    }

    /// Taille d'un pixel en octets dans le tampon source.
    pub fn bytes_per_pixel(self) -> usize {
        match self {
            Self::Rgb1555 | Self::Rgb565 => 2,
            Self::Xrgb8888 => 4,
        }
    }
}

impl Default for PixelFormat {
    /// libretro impose ce format par défaut quand le cœur n'en demande aucun.
    fn default() -> Self {
        Self::Rgb1555
    }
}

// --- Manette ----------------------------------------------------------------

pub const RETRO_DEVICE_JOYPAD: c_uint = 1;

/// Les manches analogiques, que le cœur interroge séparément des boutons.
///
/// C'est ce qui manquait à la Nintendo 64. Ses jeux ne lisent pas la croix
/// directionnelle pour se déplacer — ils lisent le manche, et un manche qu'on
/// ne leur donne pas vaut un personnage qui ne bouge pas. Le cœur demande
/// alors l'axe par son numéro de manche et son numéro d'axe, et non par un
/// identifiant de bouton.
pub const RETRO_DEVICE_ANALOG: c_uint = 5;

/// Les deux manches, dans l'ordre où libretro les numérote.
pub const ANALOG_GAUCHE: c_uint = 0;
pub const ANALOG_DROIT: c_uint = 1;

/// Boutons de la manette libretro standard, dans l'ordre de leurs identifiants.
/// C'est une disposition abstraite : chaque cœur y projette la sienne.
pub const JOYPAD_BUTTONS: usize = 16;

/// Les quatre axes : X et Y du manche gauche, puis X et Y du droit.
pub const MANCHES: usize = 4;

/// Les six capteurs : accélération sur trois axes, rotation sur trois autres.
///
/// Quelques cartouches ne se jouent pas qu'aux boutons — on penche la console,
/// on la secoue. Le cœur réclame alors cette interface-ci, et s'il n'obtient
/// rien, le jeu ne bouge pas sans qu'aucun message ne le dise.
pub const CAPTEURS: usize = 6;

/// Ce qu'un cœur demande d'allumer ou d'éteindre, par la première fonction.
pub const SENSOR_ACCELEROMETER_ENABLE: c_uint = 0;
pub const SENSOR_ACCELEROMETER_DISABLE: c_uint = 1;
pub const SENSOR_GYROSCOPE_ENABLE: c_uint = 2;
pub const SENSOR_GYROSCOPE_DISABLE: c_uint = 3;

/// La table de fonctions que le cœur reçoit pour lire les capteurs.
#[repr(C)]
pub struct SensorInterface {
    pub set_sensor_state: unsafe extern "C" fn(c_uint, c_uint, c_uint) -> bool,
    pub get_sensor_input: unsafe extern "C" fn(c_uint, c_uint) -> f32,
}

/// Ce que la manette envoie pour une trame.
///
/// Les deux choses voyagent ensemble parce qu'elles décrivent le même instant :
/// séparées, un manche en retard d'une trame sur les boutons donnerait un saut
/// qui part dans la mauvaise direction.
///
/// Les capteurs y sont aussi : ils décrivent le même instant que les boutons,
/// et une inclinaison en retard d'une trame sur un saut envoie le personnage
/// du mauvais côté.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Entrees {
    /// Pression de chaque bouton, dans l'ordre de l'ABI.
    pub boutons: [i16; JOYPAD_BUTTONS],
    /// Position des axes, de -32768 à 32767, zéro au repos.
    pub manches: [i16; MANCHES],
    /// Accélération en g sur trois axes, puis rotation en radians par seconde.
    pub capteurs: [f32; CAPTEURS],
}

impl Entrees {
    /// Les boutons seuls, manches au repos.
    ///
    /// La plupart des machines n'ont pas de manche, et toutes les épreuves qui
    /// ne s'intéressent qu'aux boutons passent par là.
    pub fn boutons(boutons: [i16; JOYPAD_BUTTONS]) -> Self {
        Self {
            boutons,
            manches: [0; MANCHES],
            capteurs: [0.0; CAPTEURS],
        }
    }

    /// Ce que vaut un capteur, ou zéro quand le cœur en invente un.
    pub fn capteur(&self, id: c_uint) -> f32 {
        self.capteurs.get(id as usize).copied().unwrap_or(0.0)
    }

    /// L'axe demandé, ou zéro quand le cœur en invente un.
    ///
    /// Un cœur peut interroger un troisième manche ou un axe Z : la réponse est
    /// « au repos », jamais un octet pris ailleurs dans le tableau.
    pub fn axe(&self, manche: c_uint, axe: c_uint) -> i16 {
        if manche > ANALOG_DROIT || axe > 1 {
            return 0;
        }
        self.manches[(manche * 2 + axe) as usize]
    }
}

/// Combien de manettes une console peut recevoir chez nous.
///
/// Quatre : c'est ce que la Nintendo 64 et la GameCube ont d'origine, et les
/// consoles qui n'en ont que deux ignorent simplement les ports suivants.
/// Au-delà il faudrait un multitap, que rien ne réclame ici.
pub const PORTS: usize = 4;

/// Ce que toutes les manettes envoient pour une même trame.
///
/// Un cœur interroge ses ports un par un, et l'hôte doit pouvoir répondre pour
/// chacun. Tant qu'il n'y avait qu'une manette, le deuxième port rendait zéro
/// quoi qu'il arrive : à deux, le jeu démarrait et le second joueur n'existait
/// pas.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Manettes {
    pub ports: [Entrees; PORTS],
}

/// Une manette seule vaut la première, les autres au repos : c'est le cas de
/// presque tout le code et de toutes les épreuves d'avant.
impl From<Entrees> for Manettes {
    fn from(premiere: Entrees) -> Self {
        let mut ports = [Entrees::default(); PORTS];
        ports[0] = premiere;
        Self { ports }
    }
}

impl Manettes {
    /// L'état d'un port. Un port que la console invente est au repos.
    pub fn port(&self, rang: c_uint) -> &Entrees {
        static REPOS: Entrees = Entrees {
            boutons: [0; JOYPAD_BUTTONS],
            manches: [0; MANCHES],
            capteurs: [0.0; CAPTEURS],
        };
        self.ports.get(rang as usize).unwrap_or(&REPOS)
    }
}

// --- Structures échangées ---------------------------------------------------

/// Identité du cœur, disponible avant tout chargement de contenu.
#[repr(C)]
pub struct SystemInfo {
    pub library_name: *const c_char,
    pub library_version: *const c_char,
    /// Extensions acceptées, séparées par des barres verticales.
    pub valid_extensions: *const c_char,
    /// Vrai si le cœur veut un chemin de fichier plutôt que le contenu en mémoire.
    pub need_fullpath: bool,
    pub block_extract: bool,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct GameGeometry {
    pub base_width: c_uint,
    pub base_height: c_uint,
    pub max_width: c_uint,
    pub max_height: c_uint,
    /// Rapport d'affichage voulu ; 0 signifie « déduire de base_width/height ».
    pub aspect_ratio: f32,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct SystemTiming {
    pub fps: f64,
    pub sample_rate: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct SystemAvInfo {
    pub geometry: GameGeometry,
    pub timing: SystemTiming,
}

/// Contenu à charger. Selon `need_fullpath`, le cœur lit `path` ou `data`.
#[repr(C)]
pub struct GameInfo {
    pub path: *const c_char,
    pub data: *const c_void,
    pub size: usize,
    pub meta: *const c_char,
}

/// La table que le cœur tend pour piloter son lecteur de disques.
///
/// Les sept premières fonctions sont celles de la version d'origine ; les
/// trois dernières n'existent que dans la version étendue, et restent nulles
/// quand le cœur tend l'ancienne. L'ordre est celui de l'ABI, et il ne se
/// réarrange pas : c'est de la mémoire que le cœur nous prête.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct DiskControlCallback {
    /// Ouvre ou referme le lecteur. Rien ne se change tant qu'il est fermé.
    pub set_eject_state: Option<unsafe extern "C" fn(bool) -> bool>,
    pub get_eject_state: Option<unsafe extern "C" fn() -> bool>,
    pub get_image_index: Option<unsafe extern "C" fn() -> c_uint>,
    pub set_image_index: Option<unsafe extern "C" fn(c_uint) -> bool>,
    pub get_num_images: Option<unsafe extern "C" fn() -> c_uint>,
    /// Met un autre fichier à la place du disque de ce rang.
    pub replace_image_index: Option<unsafe extern "C" fn(c_uint, *const GameInfo) -> bool>,
    /// Ajoute un emplacement vide à la fin, à remplir par le précédent.
    pub add_image_index: Option<unsafe extern "C" fn() -> bool>,
    pub set_initial_image: Option<unsafe extern "C" fn(c_uint, *const c_char) -> bool>,
    pub get_image_path: Option<unsafe extern "C" fn(c_uint, *mut c_char, usize) -> bool>,
    /// Le nom du disque tel que le cœur l'affiche — « Disc 2 », le plus souvent.
    pub get_image_label: Option<unsafe extern "C" fn(c_uint, *mut c_char, usize) -> bool>,
}

/// La version d'origine : les sept premières fonctions, et rien d'autre.
///
/// Lue à part parce qu'un cœur qui tend celle-ci n'a écrit que sept
/// pointeurs : en lire dix irait chercher trois mots qui ne lui appartiennent
/// pas.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct DiskControlSimple {
    pub set_eject_state: Option<unsafe extern "C" fn(bool) -> bool>,
    pub get_eject_state: Option<unsafe extern "C" fn() -> bool>,
    pub get_image_index: Option<unsafe extern "C" fn() -> c_uint>,
    pub set_image_index: Option<unsafe extern "C" fn(c_uint) -> bool>,
    pub get_num_images: Option<unsafe extern "C" fn() -> c_uint>,
    pub replace_image_index: Option<unsafe extern "C" fn(c_uint, *const GameInfo) -> bool>,
    pub add_image_index: Option<unsafe extern "C" fn() -> bool>,
}

impl From<DiskControlSimple> for DiskControlCallback {
    fn from(simple: DiskControlSimple) -> Self {
        Self {
            set_eject_state: simple.set_eject_state,
            get_eject_state: simple.get_eject_state,
            get_image_index: simple.get_image_index,
            set_image_index: simple.set_image_index,
            get_num_images: simple.get_num_images,
            replace_image_index: simple.replace_image_index,
            add_image_index: simple.add_image_index,
            set_initial_image: None,
            get_image_path: None,
            get_image_label: None,
        }
    }
}

/// Une option de configuration exposée par le cœur, terminée par une entrée nulle.
#[repr(C)]
pub struct Variable {
    pub key: *const c_char,
    /// Description puis valeurs possibles, séparées par des barres verticales.
    pub value: *const c_char,
}

// --- Signatures des rappels -------------------------------------------------
//
// Aucune de ces fonctions ne transporte de pointeur utilisateur : le cœur
// appelle des fonctions globales. C'est la contrainte structurante de libretro,
// et la raison pour laquelle l'hôte range son état dans une variable de thread.

pub type EnvironmentFn = unsafe extern "C" fn(cmd: c_uint, data: *mut c_void) -> bool;
pub type VideoRefreshFn =
    unsafe extern "C" fn(data: *const c_void, width: c_uint, height: c_uint, pitch: usize);
pub type AudioSampleFn = unsafe extern "C" fn(left: i16, right: i16);
pub type AudioSampleBatchFn = unsafe extern "C" fn(data: *const i16, frames: usize) -> usize;
pub type InputPollFn = unsafe extern "C" fn();
pub type InputStateFn =
    unsafe extern "C" fn(port: c_uint, device: c_uint, index: c_uint, id: c_uint) -> i16;

/// Niveaux du journal que les cœurs émettent via `ENV_GET_LOG_INTERFACE`.
pub type LogPrintfFn = unsafe extern "C" fn(level: c_uint, fmt: *const c_char, ...);

#[repr(C)]
pub struct LogCallback {
    pub log: LogPrintfFn,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rend_chaque_axe_a_sa_place() {
        let entrees = Entrees {
            boutons: [0; JOYPAD_BUTTONS],
            manches: [1, 2, 3, 4],
            capteurs: [0.0; CAPTEURS],
        };
        assert_eq!(entrees.axe(ANALOG_GAUCHE, 0), 1);
        assert_eq!(entrees.axe(ANALOG_GAUCHE, 1), 2);
        assert_eq!(entrees.axe(ANALOG_DROIT, 0), 3);
        assert_eq!(entrees.axe(ANALOG_DROIT, 1), 4);
    }

    #[test]
    fn rend_le_repos_pour_un_axe_qui_n_existe_pas() {
        let entrees = Entrees {
            boutons: [0; JOYPAD_BUTTONS],
            manches: [1, 2, 3, 4],
            capteurs: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
        };
        assert_eq!(entrees.capteur(0), 1.0);
        assert_eq!(entrees.capteur(5), 6.0);
        assert_eq!(entrees.capteur(6), 0.0, "un septieme capteur");
        assert_eq!(entrees.axe(2, 0), 0, "un troisieme manche");
        assert_eq!(entrees.axe(ANALOG_GAUCHE, 2), 0, "un axe Z");
        assert_eq!(entrees.axe(99, 99), 0);
    }
}
