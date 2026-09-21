//! Cœur libretro d'essai, écrit pour éprouver l'hôte d'EvaChi.
//!
//! Il n'émule rien. Il produit des valeurs **prévisibles** sur chaque chemin de
//! l'ABI — image, son, entrées, sauvegarde d'état — pour que les tests puissent
//! affirmer exactement ce qu'ils doivent recevoir. Un vrai cœur dirait « ça a
//! l'air de marcher » ; celui-ci dit « le canal rouge est bien à l'octet 0 ».
//!
//! Compilé en bibliothèque dynamique, il se charge comme n'importe quel cœur.

#![allow(non_camel_case_types)]

use std::os::raw::{c_char, c_uint, c_void};
use std::sync::atomic::{AtomicU64, Ordering};

pub const WIDTH: u32 = 32;
pub const HEIGHT: u32 = 16;
/// Largeur réelle d'une ligne en mémoire, volontairement plus grande que la
/// partie visible : un hôte qui confond `pitch` et `width * 4` produit une
/// image en biais, et ce rembourrage le démasque.
pub const STRIDE: u32 = WIDTH + 4;
pub const FPS: f64 = 60.0;
pub const SAMPLE_RATE: f64 = 44100.0;
/// Échantillons stéréo produits par trame.
pub const AUDIO_FRAMES: usize = 735;

const ENV_SET_PIXEL_FORMAT: c_uint = 10;
const ENV_GET_VARIABLE: c_uint = 15;
const ENV_SET_VARIABLES: c_uint = 16;
const ENV_GET_LANGUAGE: c_uint = 21;
const ENV_GET_LOG_INTERFACE: c_uint = 27;
/// La pile de la cartouche, au sens de libretro.
const MEMORY_SAVE_RAM: c_uint = 0;
/// La RAM de travail, au sens de libretro.
const MEMORY_SYSTEM_RAM: c_uint = 2;
const PIXEL_FORMAT_XRGB8888: c_uint = 1;
const RETRO_DEVICE_JOYPAD: c_uint = 1;

/// Le contenu que ce cœur refuse, pour éprouver le chemin du refus.
///
/// Un refus n'a jamais produit de trame : ce que le cœur a écrit avant de
/// refuser ne peut donc voyager que sur la réponse elle-même. C'est le seul
/// endroit où l'on apprend *pourquoi*, et c'est le plus facile à perdre.
pub const CONTENU_REFUSE: &[u8] = b"refuse";

/// Ce qu'il écrit avant de refuser. Choisi pour ressembler à une vraie plainte.
pub const PLAINTE: &str = "error: missing bios file lynxboot.img";

/// L'option par laquelle ce cœur demande la langue de la machine émulée.
///
/// Nommée comme les vrais la nomment — avec le mot « language » dedans —
/// puisque c'est là-dessus que l'hôte les reconnaît. L'anglais est en tête :
/// c'est la valeur que retiendrait un hôte qui ne ferait rien, et donc celle
/// qu'une épreuve doit voir changer pour conclure quoi que ce soit.
const CLE_LANGUE: &[u8] = b"evachi_essai_language\0";
const OFFRE_LANGUE: &[u8] = b"Langue du jeu; English|French|Japanese|Spanish\0";

/// Ce que le cœur écrit pour dire la langue qu'on lui a donnée.
pub const DIT_OPTION: &str = "option de langue : ";
/// Et celle que l'hôte lui annonce par `GET_LANGUAGE`.
pub const DIT_RETRO: &str = "langue annoncée : ";

/// Une paire clé/valeur, telle que libretro la fait voyager.
#[repr(C)]
struct Variable {
    key: *const c_char,
    value: *const c_char,
}

/// La taille de la RAM de travail que ce cœur expose.
///
/// Deux kilooctets, comme la NES : assez pour éprouver les bornes, assez peu
/// pour qu'une épreuve puisse la parcourir en entier.
pub const RAM_TAILLE: usize = 2048;

/// L'octet que le cœur incrémente à chaque trame.
///
/// C'est lui qui démasque une valeur maintenue d'une valeur posée une seule
/// fois : sans triche il monte sans fin, et avec une triche il repart de la
/// même valeur à chaque trame pour ne monter que d'un cran.
pub const RAM_COMPTEUR: usize = 0;

/// La taille de la pile de la cartouche que ce cœur expose.
///
/// Trente-deux octets : une vraie pile en fait des milliers, mais celle-ci
/// doit tenir en entier dans un message d'épreuve qui a échoué.
pub const PILE_TAILLE: usize = 32;

/// Ce que le jeu note dans sa pile quand on lui demande de sauvegarder.
///
/// Du texte, et non des octets quelconques : une épreuve qui échoue montre
/// alors ce qu'elle a trouvé à la place, en clair.
pub const PILE_ECRITE: &[u8] = b"partie sauvegardee";

/// Le bouton par lequel le jeu sauvegarde — L, dans la numérotation libretro.
pub const BOUTON_SAUVER: u32 = 10;
/// Et celui par lequel il dit ce qu'il trouve dans sa pile — R.
///
/// C'est le seul moyen, pour une épreuve, de voir que l'hôte a bien rendu au
/// jeu ce qu'il avait sauvegardé : la pile n'appartient qu'au cœur, personne
/// d'autre ne peut dire ce qu'elle contient.
pub const BOUTON_RELIRE: u32 = 11;
/// Ce que le cœur écrit alors, suivi du contenu de sa pile.
pub const DIT_PILE: &str = "pile : ";

/// Ce que le cœur écrit quand on lui pose une triche, pour qu'on sache qu'elle
/// est bien arrivée jusqu'à lui — et dans quel ordre.
pub const DIT_TRICHE: &str = "triche posée : ";
/// Et quand on les lui retire toutes.
pub const DIT_OUBLI: &str = "triches oubliées";

/// L'interface de journal que libretro tend au cœur.
///
/// Le premier champ est une fonction variadique ; on ne s'en sert qu'avec une
/// chaîne déjà formée, ce qui est licite et suffit ici.
#[repr(C)]
struct LogCallback {
    log: Option<unsafe extern "C" fn(c_uint, *const c_char, ...)>,
}

// --- Mal tourner sur commande -----------------------------------------------

/// Les quatre boutons qui, tenus ensemble, demandent au cœur de mal tourner.
///
/// L2, R2, L3 et R3 à la fois, dans la numérotation de libretro : aucun jeu ne
/// le demande, aucune autre épreuve ne les emploie, et il faut vraiment le
/// vouloir.
///
/// Un cœur qui plante à la demande est le seul moyen d'éprouver qu'un cœur qui
/// plante n'emporte plus l'application. L'épreuve était littéralement
/// inécrivable tant que le cœur vivait dans le processus du programme de test :
/// c'est lui qui serait mort.
pub const SABOTAGE: u16 = 1 << 12 | 1 << 13 | 1 << 14 | 1 << 15;
/// Avec A en plus, le cœur ne rend plus la main. C'est le cas Dolphin.
pub const SABOTAGE_FIGE: u16 = 1 << 8;
/// Avec X en plus, le cœur abandonne de lui-même.
pub const SABOTAGE_ABANDON: u16 = 1 << 9;

/// Se conduit comme un cœur défaillant, à la demande.
///
/// # Safety
/// Ne rend jamais la main : ou le processus meurt, ou il s'arrête de tourner.
unsafe fn saboter(buttons: u16) -> ! {
    if buttons & SABOTAGE_FIGE != 0 {
        // On dort plutôt que de brûler un cœur du processeur : ce que l'hôte
        // observe est le même — sa trame ne vient pas — et la machine d'en face
        // reste utilisable pendant l'épreuve.
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3600));
        }
    }

    if buttons & SABOTAGE_ABANDON != 0 {
        std::process::abort();
    }

    // Une écriture hors de la mémoire du cœur : le cas Flycast. Windows tue le
    // processus sur-le-champ, sans déroulement de pile ni message.
    //
    // `black_box` empêche le compilateur de reconnaître l'écriture à l'adresse
    // nulle et de la remplacer par une instruction illégale : on veut une vraie
    // violation d'accès, avec le code de sortie qui va avec.
    let egare = std::hint::black_box(std::ptr::null_mut::<u8>());
    std::ptr::write_volatile(egare, 42);
    unreachable!("l'écriture hors mémoire n'a pas tué le processus");
}

// --- Structures de l'ABI ----------------------------------------------------

#[repr(C)]
pub struct SystemInfo {
    pub library_name: *const c_char,
    pub library_version: *const c_char,
    pub valid_extensions: *const c_char,
    pub need_fullpath: bool,
    pub block_extract: bool,
}

#[repr(C)]
pub struct GameGeometry {
    pub base_width: c_uint,
    pub base_height: c_uint,
    pub max_width: c_uint,
    pub max_height: c_uint,
    pub aspect_ratio: f32,
}

#[repr(C)]
pub struct SystemTiming {
    pub fps: f64,
    pub sample_rate: f64,
}

#[repr(C)]
pub struct SystemAvInfo {
    pub geometry: GameGeometry,
    pub timing: SystemTiming,
}

#[repr(C)]
pub struct GameInfo {
    pub path: *const c_char,
    pub data: *const c_void,
    pub size: usize,
    pub meta: *const c_char,
}

type EnvironmentFn = unsafe extern "C" fn(c_uint, *mut c_void) -> bool;
type VideoRefreshFn = unsafe extern "C" fn(*const c_void, c_uint, c_uint, usize);
type AudioSampleFn = unsafe extern "C" fn(i16, i16);
type AudioSampleBatchFn = unsafe extern "C" fn(*const i16, usize) -> usize;
type InputPollFn = unsafe extern "C" fn();
type InputStateFn = unsafe extern "C" fn(c_uint, c_uint, c_uint, c_uint) -> i16;

// --- État ------------------------------------------------------------------
//
// Les rappels de libretro ne transportent pas de pointeur utilisateur : un cœur
// range donc son état en global, comme le font les vrais.

static mut ENVIRONMENT: Option<EnvironmentFn> = None;
/// Le journal, tel que l'hôte le tend. Absent tant qu'on ne l'a pas demandé.
static mut JOURNAL: Option<unsafe extern "C" fn(c_uint, *const c_char, ...)> = None;
static mut VIDEO_REFRESH: Option<VideoRefreshFn> = None;
static mut AUDIO_BATCH: Option<AudioSampleBatchFn> = None;
static mut AUDIO_SAMPLE: Option<AudioSampleFn> = None;
static mut INPUT_POLL: Option<InputPollFn> = None;
static mut INPUT_STATE: Option<InputStateFn> = None;

/// Numéro de la trame courante, aussi utilisé comme état sérialisable.
static FRAME: AtomicU64 = AtomicU64::new(0);

static mut FRAMEBUFFER: Vec<u32> = Vec::new();
static mut AUDIO: Vec<i16> = Vec::new();
/// La RAM de travail, celle que les triches ont le droit d'écrire.
static mut RAM: Vec<u8> = Vec::new();
/// La pile de la cartouche, celle que l'hôte relit et range.
static mut PILE: Vec<u8> = Vec::new();

/// Contenu accepté : le cœur n'en fait rien mais vérifie qu'on le lui passe.
static CONTENT_SIZE: AtomicU64 = AtomicU64::new(0);

const NAME: &[u8] = b"EvaChi Test Core\0";
const VERSION: &[u8] = b"1.0\0";
const EXTENSIONS: &[u8] = b"test|bin\0";

// --- Motif de test ----------------------------------------------------------

/// Fond de l'image : sombre, pour qu'un humain puisse regarder l'écran.
const BACKGROUND: u32 = 0x0010_1810;
/// Curseur qui parcourt l'écran, un pixel par trame.
const CURSOR: u32 = 0x009e_e37d;

/// Magenta écrit dans le rembourrage de chaque ligne, en dehors de la partie
/// visible.
///
/// Un hôte qui respecte `pitch` ne le verra jamais ; un hôte qui le confond
/// avec `width * 4` le fera entrer dans l'image. Un rembourrage laissé à zéro
/// ne prouverait rien : le noir se confond avec le fond, et le test passerait
/// pour la mauvaise raison.
pub const PADDING_POISON: u32 = 0x00ff_00ff;

/// Première ligne utile du fond : les deux premières servent au diagnostic.
const FIELD_TOP: u32 = 2;

/// Couleur attendue à la position donnée, en 0x00RRGGBB.
///
/// Le motif doit se lire d'un coup d'œil autant que s'affirmer dans un test :
///
/// - ligne 0 : rouge, vert, bleu, blanc purs — un hôte qui inverse rouge et
///   bleu s'y trahit immédiatement ;
/// - ligne 1 : un pixel allumé par bouton enfoncé, ce qui rend visible ce que
///   le cœur a réellement lu ;
/// - en dessous : un fond sombre parcouru par un curseur qui avance d'un pixel
///   par trame, ce qui montre l'avancement sans agresser l'œil.
///
/// Une première version remplissait le fond de bruit coloré. C'était tout aussi
/// vérifiable et parfaitement insoutenable à regarder.
pub fn expected_pixel(x: u32, y: u32, frame: u64, buttons: u16) -> u32 {
    if y == 0 {
        match x {
            0 => return 0x00ff_0000, // rouge pur
            1 => return 0x0000_ff00, // vert pur
            2 => return 0x0000_00ff, // bleu pur
            3 => return 0x00ff_ffff, // blanc
            _ => {}
        }
    }

    if y == 1 && x < 16 {
        return if buttons & (1 << x) != 0 { CURSOR } else { 0x0000_0000 };
    }

    let field = WIDTH as u64 * (HEIGHT - FIELD_TOP) as u64;
    let step = (frame % field) as u32;
    if x == step % WIDTH && y == FIELD_TOP + step / WIDTH {
        return CURSOR;
    }

    BACKGROUND
}

// --- Points d'entrée --------------------------------------------------------

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub extern "C" fn retro_api_version() -> c_uint {
    1
}

/// # Safety
/// `info` doit pointer sur une `SystemInfo` accessible en écriture.
#[no_mangle]
pub unsafe extern "C" fn retro_get_system_info(info: *mut SystemInfo) {
    if info.is_null() {
        return;
    }
    (*info).library_name = NAME.as_ptr().cast();
    (*info).library_version = VERSION.as_ptr().cast();
    (*info).valid_extensions = EXTENSIONS.as_ptr().cast();
    (*info).need_fullpath = false;
    (*info).block_extract = false;
}

/// # Safety
/// `info` doit pointer sur une `SystemAvInfo` accessible en écriture.
#[no_mangle]
pub unsafe extern "C" fn retro_get_system_av_info(info: *mut SystemAvInfo) {
    if info.is_null() {
        return;
    }
    (*info).geometry = GameGeometry {
        base_width: WIDTH,
        base_height: HEIGHT,
        max_width: WIDTH,
        max_height: HEIGHT,
        aspect_ratio: 0.0, // 0 demande à l'hôte de déduire le rapport
    };
    (*info).timing = SystemTiming {
        fps: FPS,
        sample_rate: SAMPLE_RATE,
    };
}

/// # Safety
/// Appelé par l'hôte avant `retro_init`.
#[no_mangle]
pub unsafe extern "C" fn retro_set_environment(cb: EnvironmentFn) {
    ENVIRONMENT = Some(cb);

    // Les vrais cœurs déclarent leurs options ici, et l'hôte n'a que ce
    // moment-là pour peser dessus : ensuite le cœur a déjà lu sa valeur.
    let mut variables = [
        Variable {
            key: CLE_LANGUE.as_ptr().cast::<c_char>(),
            value: OFFRE_LANGUE.as_ptr().cast::<c_char>(),
        },
        Variable {
            key: std::ptr::null(),
            value: std::ptr::null(),
        },
    ];
    cb(ENV_SET_VARIABLES, variables.as_mut_ptr().cast::<c_void>());
}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub unsafe extern "C" fn retro_set_video_refresh(cb: VideoRefreshFn) {
    VIDEO_REFRESH = Some(cb);
}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub unsafe extern "C" fn retro_set_audio_sample(cb: AudioSampleFn) {
    AUDIO_SAMPLE = Some(cb);
}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub unsafe extern "C" fn retro_set_audio_sample_batch(cb: AudioSampleBatchFn) {
    AUDIO_BATCH = Some(cb);
}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub unsafe extern "C" fn retro_set_input_poll(cb: InputPollFn) {
    INPUT_POLL = Some(cb);
}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub unsafe extern "C" fn retro_set_input_state(cb: InputStateFn) {
    INPUT_STATE = Some(cb);
}

/// # Safety
/// Appelé par l'hôte après `retro_set_environment`.
#[no_mangle]
pub unsafe extern "C" fn retro_init() {
    // On réclame le journal comme le font les vrais cœurs : c'est le seul moyen
    // de dire quoi que ce soit à l'hôte.
    if let Some(environment) = ENVIRONMENT {
        let mut interface = LogCallback { log: None };
        if environment(
            ENV_GET_LOG_INTERFACE,
            std::ptr::addr_of_mut!(interface).cast::<c_void>(),
        ) {
            JOURNAL = interface.log;
        }
    }

    // Ce que l'hôte a retenu pour la langue. Dit ici et non gardé pour soi :
    // c'est la seule chose que l'hôte ne peut pas vérifier tout seul — il sait
    // ce qu'il a posé, pas ce que le cœur a lu.
    if let Some(env) = ENVIRONMENT {
        let mut demande = Variable {
            key: CLE_LANGUE.as_ptr().cast::<c_char>(),
            value: std::ptr::null(),
        };
        if env(
            ENV_GET_VARIABLE,
            std::ptr::addr_of_mut!(demande).cast::<c_void>(),
        ) && !demande.value.is_null()
        {
            let valeur = std::ffi::CStr::from_ptr(demande.value).to_string_lossy();
            dire(&format!("{DIT_OPTION}{valeur}"));
        }

        let mut annoncee: c_uint = u32::MAX;
        if env(
            ENV_GET_LANGUAGE,
            std::ptr::addr_of_mut!(annoncee).cast::<c_void>(),
        ) {
            dire(&format!("{DIT_RETRO}{annoncee}"));
        }
    }

    FRAME.store(0, Ordering::SeqCst);
    FRAMEBUFFER = vec![0; (STRIDE * HEIGHT) as usize];
    AUDIO = vec![0; AUDIO_FRAMES * 2];
    // Allouées une fois pour toutes : l'hôte garde les pointeurs qu'on lui
    // rend, et une réallocation les laisserait pendre.
    RAM = vec![0; RAM_TAILLE];
    PILE = vec![0; PILE_TAILLE];

    // Un vrai cœur annonce son format dès l'initialisation ; on fait pareil,
    // ce qui vérifie au passage que l'hôte le retient.
    if let Some(env) = ENVIRONMENT {
        let mut format = PIXEL_FORMAT_XRGB8888;
        env(
            ENV_SET_PIXEL_FORMAT,
            (&mut format as *mut c_uint).cast::<c_void>(),
        );
    }
}

/// # Safety
/// Appelé par l'hôte en fin de vie du cœur.
#[no_mangle]
pub unsafe extern "C" fn retro_deinit() {
    FRAMEBUFFER = Vec::new();
    AUDIO = Vec::new();
    ENVIRONMENT = None;
    VIDEO_REFRESH = None;
    AUDIO_BATCH = None;
    AUDIO_SAMPLE = None;
    INPUT_POLL = None;
    INPUT_STATE = None;
}

/// # Safety
/// `game` doit être valide ou nul.
#[no_mangle]
pub unsafe extern "C" fn retro_load_game(game: *const GameInfo) -> bool {
    if game.is_null() {
        return false;
    }

    // Un contenu convenu fait refuser le cœur, après qu'il s'est plaint. C'est
    // le chemin le plus facile à perdre : aucune trame n'a eu lieu, donc rien
    // ne porte la plainte sinon la réponse au refus elle-même.
    let octets = std::slice::from_raw_parts((*game).data.cast::<u8>(), (*game).size);
    if !(*game).data.is_null() && octets.starts_with(CONTENU_REFUSE) {
        dire(PLAINTE);
        return false;
    }

    CONTENT_SIZE.store((*game).size as u64, Ordering::SeqCst);
    FRAME.store(0, Ordering::SeqCst);
    true
}

/// Écrit une ligne dans le journal de l'hôte, s'il nous en a tendu un.
///
/// # Safety
/// Appelée depuis les points d'entrée, rappels posés.
unsafe fn dire(texte: &str) {
    let Some(journal) = JOURNAL else { return };
    let mut octets = texte.as_bytes().to_vec();
    octets.push(0);
    // Niveau 3 : une erreur. Le niveau zéro serait jeté par l'hôte, et c'est
    // précisément ce qu'on veut voir arriver de l'autre côté.
    journal(3, octets.as_ptr().cast::<c_char>());
}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub extern "C" fn retro_unload_game() {
    CONTENT_SIZE.store(0, Ordering::SeqCst);
}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub extern "C" fn retro_reset() {
    FRAME.store(0, Ordering::SeqCst);
}

/// Émule une trame : relève les entrées, peint le motif, émet le son.
///
/// # Safety
/// Appelé par l'hôte, rappels posés.
#[no_mangle]
pub unsafe extern "C" fn retro_run() {
    if let Some(poll) = INPUT_POLL {
        poll();
    }

    // On lit les seize boutons du port 0 et on les compacte en un masque.
    let mut buttons: u16 = 0;
    if let Some(state) = INPUT_STATE {
        for id in 0..16u32 {
            if state(0, RETRO_DEVICE_JOYPAD, 0, id) != 0 {
                buttons |= 1 << id;
            }
        }
    }

    // Avant toute chose : si on nous demande de mal tourner, on ne rend pas la
    // main. Rien de ce qui suit n'a alors lieu, pas même une trame.
    if buttons & SABOTAGE == SABOTAGE {
        saboter(buttons);
    }

    // Le jeu vit sa vie dans sa mémoire : il compte ses trames. Une valeur
    // maintenue par une triche le ramène à son point de départ juste avant,
    // et le compteur cesse alors de monter.
    let ram = &mut *std::ptr::addr_of_mut!(RAM);
    if let Some(octet) = ram.get_mut(RAM_COMPTEUR) {
        *octet = octet.wrapping_add(1);
    }

    // Et il sauvegarde quand on le lui demande, dans sa pile à lui. C'est à
    // l'hôte de la porter jusqu'au disque : ce cœur-ci n'écrit aucun fichier,
    // comme la plupart des cœurs de consoles à cartouche.
    let pile = &mut *std::ptr::addr_of_mut!(PILE);
    if buttons & (1 << BOUTON_SAUVER) != 0 {
        let tient = PILE_ECRITE.len().min(pile.len());
        pile[..tient].copy_from_slice(&PILE_ECRITE[..tient]);
    }
    if buttons & (1 << BOUTON_RELIRE) != 0 {
        dire(&format!("{DIT_PILE}{}", String::from_utf8_lossy(pile)));
    }

    let frame = FRAME.load(Ordering::SeqCst);

    let buffer = &mut *std::ptr::addr_of_mut!(FRAMEBUFFER);
    for y in 0..HEIGHT {
        for x in 0..STRIDE {
            // Au-delà de la largeur visible commence le rembourrage, qu'on
            // empoisonne pour qu'un hôte négligeant `pitch` se dénonce.
            buffer[(y * STRIDE + x) as usize] = if x < WIDTH {
                expected_pixel(x, y, frame, buttons)
            } else {
                PADDING_POISON
            };
        }
    }

    if let Some(refresh) = VIDEO_REFRESH {
        refresh(
            buffer.as_ptr().cast(),
            WIDTH,
            HEIGHT,
            STRIDE as usize * 4,
        );
    }

    let audio = &mut *std::ptr::addr_of_mut!(AUDIO);
    for i in 0..AUDIO_FRAMES {
        // Rampe distincte par canal : l'hôte qui les intervertit se voit.
        audio[i * 2] = expected_audio_left(i);
        audio[i * 2 + 1] = expected_audio_right(i);
    }

    if let Some(batch) = AUDIO_BATCH {
        batch(audio.as_ptr(), AUDIO_FRAMES);
    }

    FRAME.store(frame + 1, Ordering::SeqCst);
}

/// Échantillon gauche attendu à l'indice donné.
///
/// Deux rampes de périodes différentes, l'une positive et l'autre négative :
/// un hôte qui intervertit les canaux ou perd l'entrelacement se voit tout de
/// suite. L'amplitude reste sous 1 % de la pleine échelle — la première version
/// montait au maximum, ce qui produisait un vacarme insoutenable pour qui
/// lançait l'application sans couper le son.
pub fn expected_audio_left(index: usize) -> i16 {
    ((index % 128) as i16) * 2
}

/// Échantillon droit attendu à l'indice donné.
pub fn expected_audio_right(index: usize) -> i16 {
    -(((index % 96) as i16) * 2)
}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub extern "C" fn retro_serialize_size() -> usize {
    std::mem::size_of::<u64>()
}

/// # Safety
/// `data` doit pointer sur au moins `size` octets accessibles en écriture.
#[no_mangle]
pub unsafe extern "C" fn retro_serialize(data: *mut c_void, size: usize) -> bool {
    if data.is_null() || size < std::mem::size_of::<u64>() {
        return false;
    }
    let frame = FRAME.load(Ordering::SeqCst);
    std::ptr::copy_nonoverlapping(frame.to_le_bytes().as_ptr(), data.cast::<u8>(), 8);
    true
}

/// # Safety
/// `data` doit pointer sur au moins `size` octets lisibles.
#[no_mangle]
pub unsafe extern "C" fn retro_unserialize(data: *const c_void, size: usize) -> bool {
    if data.is_null() || size < std::mem::size_of::<u64>() {
        return false;
    }
    let mut bytes = [0u8; 8];
    std::ptr::copy_nonoverlapping(data.cast::<u8>(), bytes.as_mut_ptr(), 8);
    FRAME.store(u64::from_le_bytes(bytes), Ordering::SeqCst);
    true
}

// --- Points d'entrée exigés par l'ABI mais sans objet ici -------------------

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub extern "C" fn retro_set_controller_port_device(_port: c_uint, _device: c_uint) {}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub extern "C" fn retro_get_region() -> c_uint {
    0
}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub unsafe extern "C" fn retro_get_memory_data(id: c_uint) -> *mut c_void {
    // Deux zones, et deux seulement : la RAM de travail, que les triches ont
    // le droit d'écrire, et la pile de la cartouche, qu'elles ne doivent
    // jamais atteindre. Les avoir toutes les deux ici est ce qui permet à
    // l'épreuve de vérifier que l'hôte ne les confond pas.
    match id {
        MEMORY_SYSTEM_RAM => (*std::ptr::addr_of_mut!(RAM)).as_mut_ptr().cast::<c_void>(),
        MEMORY_SAVE_RAM => (*std::ptr::addr_of_mut!(PILE)).as_mut_ptr().cast::<c_void>(),
        _ => std::ptr::null_mut(),
    }
}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub unsafe extern "C" fn retro_get_memory_size(id: c_uint) -> usize {
    match id {
        MEMORY_SYSTEM_RAM => (*std::ptr::addr_of!(RAM)).len(),
        MEMORY_SAVE_RAM => (*std::ptr::addr_of!(PILE)).len(),
        _ => 0,
    }
}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub unsafe extern "C" fn retro_load_game_special(
    _kind: c_uint,
    _info: *const GameInfo,
    _num: usize,
) -> bool {
    false
}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
#[no_mangle]
pub unsafe extern "C" fn retro_cheat_reset() {
    dire(DIT_OUBLI);
}

/// # Safety
/// Appelé par l'hôte selon l'ABI libretro.
///
/// Un vrai cœur décoderait le code dans le dialecte de sa console. Celui-ci se
/// contente de dire ce qu'il a reçu : ce qu'on veut éprouver, c'est que la
/// chaîne porte la chaîne de caractères sans y toucher, pas qu'on sache la lire
/// — justement, on ne veut surtout pas savoir la lire.
#[no_mangle]
pub unsafe extern "C" fn retro_cheat_set(index: c_uint, enabled: bool, code: *const c_char) {
    if code.is_null() {
        return;
    }
    let texte = std::ffi::CStr::from_ptr(code).to_string_lossy();
    dire(&format!("{DIT_TRICHE}{index} {enabled} {texte}"));
}
