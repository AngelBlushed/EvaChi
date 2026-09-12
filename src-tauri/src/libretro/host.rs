//! Côté hôte de l'ABI libretro : l'état que les rappels alimentent, et les
//! rappels eux-mêmes.
//!
//! libretro ne transporte aucun pointeur utilisateur dans ses rappels : le cœur
//! appelle des fonctions globales. L'état vit donc dans une variable de thread,
//! ce qui convient tant que les rappels partent de `retro_run`.
//!
//! L'audio fait exception et vit dans un verrou partagé : certains cœurs — dont
//! Dolphin — font tourner leur son sur un thread à eux, et leurs échantillons se
//! perdaient dans une file que personne ne relisait.

use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::sync::Mutex;
use std::os::raw::{c_char, c_uint, c_void};

use super::abi::*;

/// Une trame vidéo convertie en RGBA8888, prête pour un canvas.
#[derive(Default, Clone)]
pub struct VideoFrame {
    pub rgba: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

pub struct HostState {
    /// Format annoncé par le cœur ; libretro impose 0RGB1555 par défaut.
    pub pixel_format: PixelFormat,
    pub video: VideoFrame,
    /// Faux quand le cœur a demandé de réafficher la trame précédente.
    pub video_fresh: bool,
    /// État des boutons du port 0. Les autres ports renvoient zéro.
    pub input: [i16; JOYPAD_BUTTONS],
    pub system_dir: CString,
    pub save_dir: CString,
    /// Géométrie redemandée en cours de partie par certains cœurs.
    pub geometry: Option<GameGeometry>,
    /// Le cœur a demandé l'arrêt de lui-même.
    pub shutdown: bool,
    /// Messages que le cœur veut afficher à l'utilisateur.
    pub messages: Vec<String>,
    /// Options du cœur : valeur courante par clé, gardée en `CString` pour que
    /// le pointeur rendu au cœur reste valide après le retour du rappel.
    pub options: HashMap<String, CString>,
    /// Vrai tant que le cœur n'a pas relu les options modifiées.
    pub options_dirty: bool,
    /// Le contexte graphique réclamé par le cœur, s'il dessine en 3D.
    ///
    /// Renseigné pendant `retro_set_environment`, donc bien avant que le
    /// contenu soit chargé : c'est la seule occasion qu'a le cœur de le
    /// demander, et la taille du tampon n'est connue qu'après.
    pub hw: Option<HwRequest>,
    /// Le contexte OpenGL, créé une fois la géométrie connue.
    #[cfg(windows)]
    pub gl: Option<super::gl::GlContext>,
}

/// Ce qu'un cœur réclame comme contexte graphique.
///
/// Recopié de la structure que le cœur nous tend : celle-ci ne vit que le temps
/// de l'appel, et il faudra la relire longtemps après.
#[derive(Debug, Clone, Copy)]
pub struct HwRequest {
    pub context_type: c_uint,
    pub reset: Option<unsafe extern "C" fn()>,
    pub destroy: Option<unsafe extern "C" fn()>,
    pub depth: bool,
    pub stencil: bool,
    pub bottom_left_origin: bool,
    pub major: u32,
    pub minor: u32,
}

impl HwRequest {
    /// Vrai si le cœur veut le profil moderne d'OpenGL, sans les fonctions
    /// héritées.
    pub fn core_profile(&self) -> bool {
        self.context_type == HW_CONTEXT_OPENGL_CORE
    }
}

impl Default for HostState {
    fn default() -> Self {
        Self {
            pixel_format: PixelFormat::default(),
            video: VideoFrame::default(),
            video_fresh: false,
            input: [0; JOYPAD_BUTTONS],
            system_dir: CString::default(),
            save_dir: CString::default(),
            geometry: None,
            shutdown: false,
            messages: Vec::new(),
            options: HashMap::new(),
            options_dirty: false,
            hw: None,
            #[cfg(windows)]
            gl: None,
        }
    }
}

thread_local! {
    /// L'état du cœur actif sur ce thread. Un seul cœur tourne à la fois.
    pub static HOST: RefCell<HostState> = RefCell::new(HostState::default());
}

/// Applique une closure à l'état hôte du thread courant.
pub fn with_host<R>(f: impl FnOnce(&mut HostState) -> R) -> R {
    HOST.with(|host| f(&mut host.borrow_mut()))
}

// --- Conversion vidéo -------------------------------------------------------

/// Étend un canal de 5 bits sur 8 en répliquant les bits de poids fort, ce qui
/// envoie bien 31 sur 255 plutôt que sur 248.
#[inline]
fn expand5(value: u16) -> u8 {
    ((value << 3) | (value >> 2)) as u8
}

#[inline]
fn expand6(value: u16) -> u8 {
    ((value << 2) | (value >> 4)) as u8
}

/// Convertit le tampon du cœur en RGBA8888.
///
/// `pitch` est la longueur d'une ligne source en octets : elle dépasse souvent
/// `width * bytes_per_pixel`, les cœurs alignant leurs lignes.
///
/// # Safety
/// `data` doit pointer sur au moins `height * pitch` octets lisibles.
unsafe fn convert(
    data: *const c_void,
    width: u32,
    height: u32,
    pitch: usize,
    format: PixelFormat,
    out: &mut Vec<u8>,
) {
    let (w, h) = (width as usize, height as usize);
    out.clear();
    out.resize(w * h * 4, 0);

    match format {
        PixelFormat::Xrgb8888 => {
            for y in 0..h {
                let row = data.cast::<u8>().add(y * pitch).cast::<u32>();
                for x in 0..w {
                    let pixel = row.add(x).read_unaligned();
                    let o = (y * w + x) * 4;
                    out[o] = ((pixel >> 16) & 0xff) as u8;
                    out[o + 1] = ((pixel >> 8) & 0xff) as u8;
                    out[o + 2] = (pixel & 0xff) as u8;
                    out[o + 3] = 0xff;
                }
            }
        }
        PixelFormat::Rgb565 => {
            for y in 0..h {
                let row = data.cast::<u8>().add(y * pitch).cast::<u16>();
                for x in 0..w {
                    let pixel = row.add(x).read_unaligned();
                    let o = (y * w + x) * 4;
                    out[o] = expand5((pixel >> 11) & 0x1f);
                    out[o + 1] = expand6((pixel >> 5) & 0x3f);
                    out[o + 2] = expand5(pixel & 0x1f);
                    out[o + 3] = 0xff;
                }
            }
        }
        PixelFormat::Rgb1555 => {
            for y in 0..h {
                let row = data.cast::<u8>().add(y * pitch).cast::<u16>();
                for x in 0..w {
                    let pixel = row.add(x).read_unaligned();
                    let o = (y * w + x) * 4;
                    out[o] = expand5((pixel >> 10) & 0x1f);
                    out[o + 1] = expand5((pixel >> 5) & 0x1f);
                    out[o + 2] = expand5(pixel & 0x1f);
                    out[o + 3] = 0xff;
                }
            }
        }
    }
}

// --- Rappels ----------------------------------------------------------------

/// # Safety
/// Appelé par le cœur pendant `retro_run` ou le chargement.
pub unsafe extern "C" fn video_refresh(
    data: *const c_void,
    width: c_uint,
    height: c_uint,
    pitch: usize,
) {
    with_host(|host| {
        // Un pointeur nul signifie « rejoue la trame précédente » : on garde le
        // tampon en place et on signale que rien de neuf n'est arrivé.
        if data.is_null() {
            host.video_fresh = false;
            return;
        }

        // Trame dessinée par le processeur graphique : il n'y a pas de tableau
        // de pixels à convertir, mais un tampon de rendu à relire.
        if data as usize == usize::MAX {
            #[cfg(windows)]
            {
                let mut rgba = std::mem::take(&mut host.video.rgba);
                match host.gl.as_ref() {
                    // SAFETY : le contexte est courant, `retro_run` s'exécutant
                    // sur le thread qui l'a créé.
                    Some(gl) => unsafe { gl.read_frame(width, height, &mut rgba) },
                    None => rgba.clear(),
                }
                host.video = VideoFrame { rgba, width, height };
                host.video_fresh = !host.video.rgba.is_empty();
            }
            #[cfg(not(windows))]
            {
                host.video_fresh = false;
            }
            return;
        }

        let format = host.pixel_format;
        let mut rgba = std::mem::take(&mut host.video.rgba);
        convert(data, width, height, pitch, format, &mut rgba);

        host.video = VideoFrame { rgba, width, height };
        host.video_fresh = true;
    });
}

/// Rend au cœur l'identifiant du tampon où il doit dessiner.
///
/// Appelé à chaque trame, parfois plusieurs fois : le cœur ne suppose jamais
/// que le tampon reste le même, ce qui nous laisse libres de le réallouer.
///
/// # Safety
/// Appelé par le cœur, sur le thread qui pilote la session.
unsafe extern "C" fn current_framebuffer() -> usize {
    #[cfg(windows)]
    {
        with_host(|host| host.gl.as_ref().map_or(0, |gl| gl.framebuffer()))
    }
    #[cfg(not(windows))]
    {
        0
    }
}

/// Résout un symbole OpenGL pour le cœur.
///
/// # Safety
/// `name` doit être une chaîne terminée par zéro.
unsafe extern "C" fn gl_proc_address(name: *const c_char) -> *const c_void {
    if name.is_null() {
        return std::ptr::null();
    }
    #[cfg(windows)]
    {
        let symbol = CStr::from_ptr(name).to_string_lossy();
        super::gl::proc_address(&symbol)
    }
    #[cfg(not(windows))]
    {
        std::ptr::null()
    }
}

/// Les échantillons remis par le cœur, quel que soit le thread appelant.
///
/// Tout le reste de l'état hôte vit dans une variable de thread, ce qui est
/// juste tant que le cœur rappelle depuis `retro_run`. L'audio fait exception :
/// Dolphin, et les cœurs qui font tourner leur son à part, appellent depuis un
/// thread à eux. Leurs échantillons atterrissaient alors dans une file que
/// personne ne relisait — l'image tournait, le son manquait, et rien ne le
/// disait.
///
/// Un verrou par lot coûte quelques dizaines de nanosecondes ; à la fréquence
/// où ces rappels arrivent, cela ne se mesure pas.
static AUDIO: Mutex<Vec<i16>> = Mutex::new(Vec::new());

/// Applique une closure à la file audio, en survivant à un verrou empoisonné.
///
/// Un cœur qui panique en tenant le verrou ne doit pas rendre le son
/// définitivement muet : les données restent lisibles, on continue.
fn with_audio<R>(f: impl FnOnce(&mut Vec<i16>) -> R) -> R {
    let mut guard = AUDIO.lock().unwrap_or_else(|poison| poison.into_inner());
    f(&mut guard)
}

/// Vide la file audio et rend ce qu'elle contenait.
pub fn take_audio() -> Vec<i16> {
    with_audio(std::mem::take)
}

/// Jette ce qui reste, avant une nouvelle trame ou un nouveau contenu.
pub fn clear_audio() {
    with_audio(Vec::clear);
}

/// # Safety
/// Appelé par le cœur, éventuellement depuis un thread à lui.
pub unsafe extern "C" fn audio_sample(left: i16, right: i16) {
    with_audio(|audio| audio.extend_from_slice(&[left, right]));
}

/// # Safety
/// `data` doit pointer sur `frames * 2` entiers 16 bits.
pub unsafe extern "C" fn audio_sample_batch(data: *const i16, frames: usize) -> usize {
    if data.is_null() || frames == 0 {
        return frames;
    }
    let samples = std::slice::from_raw_parts(data, frames * 2);
    with_audio(|audio| audio.extend_from_slice(samples));
    frames
}

/// # Safety
/// Appelé par le cœur pendant `retro_run`.
pub unsafe extern "C" fn input_poll() {
    // L'état des manettes est déposé avant `retro_run` : rien à relever ici.
}

/// # Safety
/// Appelé par le cœur pendant `retro_run`.
pub unsafe extern "C" fn input_state(
    port: c_uint,
    device: c_uint,
    _index: c_uint,
    id: c_uint,
) -> i16 {
    if port != 0 || device != RETRO_DEVICE_JOYPAD || id as usize >= JOYPAD_BUTTONS {
        return 0;
    }
    with_host(|host| host.input[id as usize])
}

extern "C" {
    /// Le vrai rappel remis aux cœurs, écrit en C faute de mieux.
    ///
    /// Voir `journal.c` : Rust stable sait déclarer une fonction variadique,
    /// pas en définir une.
    fn evachi_log_printf(level: c_uint, fmt: *const c_char, ...);
}

/// Les lignes que les cœurs ont écrites, en attente d'être relevées.
///
/// Une file globale plutôt que l'état hôte, pour la même raison que l'audio :
/// un cœur peut journaliser depuis un de ses propres threads, ou depuis
/// l'intérieur d'un autre rappel. Emprunter l'état hôte à ce moment-là le
/// ferait paniquer en pleine partie.
static CORE_LOG: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Au-delà, on cesse d'accumuler.
///
/// Un cœur bavard en écrit des milliers par seconde avant qu'on ait relevé quoi
/// que ce soit. Garder les premières plutôt que les dernières : ce sont celles
/// qui disent pourquoi le démarrage s'est mal passé.
const CORE_LOG_MAX: usize = 200;

/// Reçoit une ligne déjà formatée par `journal.c`.
///
/// # Safety
/// `text` doit être une chaîne C valide.
#[no_mangle]
pub unsafe extern "C" fn evachi_log_line(level: c_uint, text: *const c_char) {
    if text.is_null() {
        return;
    }
    let text = CStr::from_ptr(text).to_string_lossy();
    let text = text.trim_end();
    if text.is_empty() {
        return;
    }

    let severity = match level {
        0 => "debug",
        1 => "info",
        2 => "attention",
        _ => "erreur",
    };
    eprintln!("[cœur/{severity}] {text}");

    // Le débogage reste sur la sortie d'erreur : ce sont des milliers de lignes
    // par partie, et elles n'apprennent rien à qui n'a pas le code sous les
    // yeux. Le reste remonte jusqu'au journal de l'application.
    if level == 0 {
        return;
    }
    let mut file = CORE_LOG.lock().unwrap_or_else(|poison| poison.into_inner());
    if file.len() < CORE_LOG_MAX {
        file.push(format!("{severity} · {text}"));
    }
}

/// Relève les lignes accumulées depuis le dernier passage.
pub fn take_core_log() -> Vec<String> {
    let mut file = CORE_LOG.lock().unwrap_or_else(|poison| poison.into_inner());
    std::mem::take(&mut file)
}

/// Point d'entrée unique par lequel le cœur interroge et configure son hôte.
///
/// Renvoyer `false` sur une commande inconnue est la réponse correcte : le cœur
/// bascule alors sur un comportement de repli. On ne traite donc que ce qui est
/// nécessaire à un démarrage propre.
///
/// # Safety
/// `data` doit correspondre au type attendu par `cmd`, ce que garantit le cœur.
pub unsafe extern "C" fn environment(cmd: c_uint, data: *mut c_void) -> bool {
    match cmd {
        ENV_GET_CAN_DUPE => {
            if data.is_null() {
                return false;
            }
            // On sait réafficher la trame précédente sur pointeur vidéo nul.
            data.cast::<bool>().write(true);
            true
        }

        ENV_SET_PIXEL_FORMAT => {
            if data.is_null() {
                return false;
            }
            match PixelFormat::from_raw(data.cast::<c_uint>().read()) {
                Some(format) => {
                    with_host(|host| host.pixel_format = format);
                    true
                }
                None => false,
            }
        }

        ENV_GET_SYSTEM_DIRECTORY => {
            if data.is_null() {
                return false;
            }
            with_host(|host| {
                data.cast::<*const c_char>().write(host.system_dir.as_ptr());
            });
            true
        }

        ENV_GET_SAVE_DIRECTORY | ENV_GET_CORE_ASSETS_DIRECTORY => {
            if data.is_null() {
                return false;
            }
            with_host(|host| {
                data.cast::<*const c_char>().write(host.save_dir.as_ptr());
            });
            true
        }

        ENV_SET_VARIABLES => {
            if data.is_null() {
                return false;
            }
            let mut entry = data.cast::<Variable>();
            with_host(|host| {
                // Le tableau se termine par une entrée dont la clé est nulle.
                while !(*entry).key.is_null() {
                    let key = CStr::from_ptr((*entry).key).to_string_lossy().into_owned();
                    let spec = CStr::from_ptr((*entry).value).to_string_lossy();

                    // Forme attendue : « Description; valeur1|valeur2|valeur3 ».
                    // La première valeur est celle par défaut.
                    if let Some(default) = spec
                        .split_once(';')
                        .map(|(_, values)| values.trim())
                        .and_then(|values| values.split('|').next())
                    {
                        if let Ok(value) = CString::new(default.trim()) {
                            host.options.entry(key).or_insert(value);
                        }
                    }
                    entry = entry.add(1);
                }
                host.options_dirty = true;
            });
            true
        }

        ENV_GET_VARIABLE => {
            if data.is_null() {
                return false;
            }
            let request = data.cast::<Variable>();
            if (*request).key.is_null() {
                return false;
            }
            let key = CStr::from_ptr((*request).key).to_string_lossy().into_owned();

            with_host(|host| match host.options.get(&key) {
                Some(value) => {
                    (*request).value = value.as_ptr();
                    true
                }
                None => false,
            })
        }

        ENV_GET_VARIABLE_UPDATE => {
            if data.is_null() {
                return false;
            }
            with_host(|host| {
                data.cast::<bool>().write(host.options_dirty);
                host.options_dirty = false;
            });
            true
        }

        ENV_GET_CORE_OPTIONS_VERSION => {
            if data.is_null() {
                return false;
            }
            // Version 0 : on ne gère que l'ancien `SET_VARIABLES`, sur lequel
            // les cœurs se rabattent d'eux-mêmes.
            data.cast::<c_uint>().write(0);
            true
        }

        ENV_SET_GEOMETRY => {
            if data.is_null() {
                return false;
            }
            let geometry = data.cast::<GameGeometry>().read();
            with_host(|host| host.geometry = Some(geometry));
            true
        }

        ENV_SET_MESSAGE => {
            // La structure commence par le message ; on ne lit que lui.
            if data.is_null() {
                return false;
            }
            let text = data.cast::<*const c_char>().read();
            if !text.is_null() {
                let message = CStr::from_ptr(text).to_string_lossy().into_owned();
                with_host(|host| host.messages.push(message));
            }
            true
        }

        ENV_SHUTDOWN => {
            with_host(|host| host.shutdown = true);
            true
        }

        ENV_SET_HW_RENDER => {
            if data.is_null() {
                return false;
            }
            let request = data.cast::<HwRenderCallback>();

            // Seul OpenGL de bureau est servi. Refuser proprement les autres
            // laisse le cœur essayer autre chose : Dolphin descend ainsi de
            // OpenGL Core à OpenGL 3.0, et Mupen64Plus de Vulkan à OpenGL.
            let kind = (*request).context_type;
            if kind != HW_CONTEXT_OPENGL && kind != HW_CONTEXT_OPENGL_CORE {
                return false;
            }
            if !cfg!(windows) {
                return false;
            }

            with_host(|host| {
                host.hw = Some(HwRequest {
                    context_type: kind,
                    reset: (*request).context_reset,
                    destroy: (*request).context_destroy,
                    depth: (*request).depth,
                    stencil: (*request).stencil,
                    bottom_left_origin: (*request).bottom_left_origin,
                    major: (*request).version_major,
                    minor: (*request).version_minor,
                });
            });

            // La moitié de l'échange va dans l'autre sens : c'est l'hôte qui
            // remplit ces deux fonctions, et le cœur s'en servira à chaque
            // trame.
            (*request).get_current_framebuffer = Some(current_framebuffer);
            (*request).get_proc_address = Some(gl_proc_address);
            true
        }

        // `GET_PREFERRED_HW_RENDER` n'est volontairement pas traité.
        //
        // On y répondait « OpenGL », pour que les cœurs sachant faire les deux
        // choisissent GL plutôt que Vulkan. Mais la question n'est pas « lequel
        // préfères-tu » : c'est « lequel dois-tu employer ». Un cœur logiciel
        // qui la pose par acquit de conscience — DOSBox Pure le fait — prenait
        // notre réponse pour un ordre, s'engageait dans son chemin accéléré, et
        // emportait l'application entière avant d'avoir affiché quoi que ce
        // soit. Une violation d'accès, sans un mot.
        //
        // Ne pas répondre ne coûte rien : le repli existe déjà un cran plus
        // bas. `SET_HW_RENDER` refuse tout ce qui n'est pas OpenGL, et les
        // cœurs redescendent d'eux-mêmes — Mupen64Plus de Vulkan vers GL,
        // Dolphin d'OpenGL Core vers OpenGL 3.0. C'est là que la décision se
        // prend, et elle s'y prend mieux.

        // Acceptées sans effet : le cœur s'en accommode.
        ENV_SET_PERFORMANCE_LEVEL | ENV_SET_INPUT_DESCRIPTORS | ENV_SET_SUPPORT_NO_GAME
        | ENV_SET_ROTATION => true,

        ENV_GET_LOG_INTERFACE => {
            if data.is_null() {
                return false;
            }
            // Le refus n'était pas une option neutre : plusieurs cœurs
            // appellent cette commande puis se servent du pointeur sans
            // vérifier qu'on l'a rempli, et sautent alors sur une adresse non
            // initialisée. Fournir un rappel inerte les fait vivre.
            data.cast::<LogCallback>().write(LogCallback {
                log: evachi_log_printf,
            });
            true
        }

        // Refusées volontairement : les options v2 et les masques de bits
        // d'entrée ont chacun un chemin de repli que les cœurs empruntent
        // d'eux-mêmes.
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Convertit un tampon de test et rend le RGBA obtenu.
    fn convert_rows<T: Copy>(rows: &[Vec<T>], width: u32, format: PixelFormat) -> Vec<u8> {
        // Chaque ligne est allouée à sa taille propre : `pitch` vaut donc la
        // longueur réelle d'une ligne, marge comprise.
        let pitch = rows[0].len() * std::mem::size_of::<T>();
        let mut flat: Vec<T> = Vec::new();
        for row in rows {
            assert_eq!(row.len() * std::mem::size_of::<T>(), pitch, "lignes inégales");
            flat.extend_from_slice(row);
        }

        let mut out = Vec::new();
        unsafe {
            convert(
                flat.as_ptr().cast(),
                width,
                rows.len() as u32,
                pitch,
                format,
                &mut out,
            );
        }
        out
    }

    #[test]
    fn xrgb8888_place_les_canaux_dans_le_bon_ordre() {
        // En petit-boutiste, 0x00RRGGBB arrive octet par octet en B, G, R, X :
        // c'est l'inversion que cette conversion doit défaire.
        let rows = vec![vec![0x00ff_0000u32, 0x0000_ff00, 0x0000_00ff, 0x00ff_ffff]];
        let rgba = convert_rows(&rows, 4, PixelFormat::Xrgb8888);

        assert_eq!(&rgba[0..4], &[0xff, 0x00, 0x00, 0xff], "rouge");
        assert_eq!(&rgba[4..8], &[0x00, 0xff, 0x00, 0xff], "vert");
        assert_eq!(&rgba[8..12], &[0x00, 0x00, 0xff, 0xff], "bleu");
        assert_eq!(&rgba[12..16], &[0xff, 0xff, 0xff, 0xff], "blanc");
    }

    #[test]
    fn rgb565_etend_les_canaux_jusqu_au_maximum() {
        let rows = vec![vec![0xf800u16, 0x07e0, 0x001f, 0xffff]];
        let rgba = convert_rows(&rows, 4, PixelFormat::Rgb565);

        // 31 sur 5 bits et 63 sur 6 doivent donner 255, pas 248 ni 252 : c'est
        // tout l'intérêt de répliquer les bits de poids fort.
        assert_eq!(&rgba[0..4], &[0xff, 0x00, 0x00, 0xff], "rouge saturé");
        assert_eq!(&rgba[4..8], &[0x00, 0xff, 0x00, 0xff], "vert saturé");
        assert_eq!(&rgba[8..12], &[0x00, 0x00, 0xff, 0xff], "bleu saturé");
        assert_eq!(&rgba[12..16], &[0xff, 0xff, 0xff, 0xff], "blanc");
    }

    #[test]
    fn rgb1555_ignore_le_bit_de_poids_fort() {
        let rows = vec![vec![0x7c00u16, 0x03e0, 0x001f, 0xffff]];
        let rgba = convert_rows(&rows, 4, PixelFormat::Rgb1555);

        assert_eq!(&rgba[0..4], &[0xff, 0x00, 0x00, 0xff], "rouge");
        assert_eq!(&rgba[4..8], &[0x00, 0xff, 0x00, 0xff], "vert");
        assert_eq!(&rgba[8..12], &[0x00, 0x00, 0xff, 0xff], "bleu");
        // 0xFFFF : le bit 15 doit être ignoré, pas déborder sur le rouge.
        assert_eq!(&rgba[12..16], &[0xff, 0xff, 0xff, 0xff], "blanc");
    }

    #[test]
    fn le_rembourrage_de_ligne_est_saute() {
        // Deux lignes utiles de deux pixels, chacune suivie de deux pixels de
        // marge qui ne doivent jamais apparaître dans le résultat.
        let rows = vec![
            vec![0x00ff_0000u32, 0x0000_ff00, 0x00de_adbe, 0x00de_adbe],
            vec![0x0000_00ff, 0x00ff_ffff, 0x00de_adbe, 0x00de_adbe],
        ];
        let rgba = convert_rows(&rows, 2, PixelFormat::Xrgb8888);

        assert_eq!(rgba.len(), 2 * 2 * 4, "seuls les pixels utiles sont rendus");
        assert_eq!(&rgba[0..4], &[0xff, 0x00, 0x00, 0xff]);
        assert_eq!(&rgba[4..8], &[0x00, 0xff, 0x00, 0xff]);
        assert_eq!(&rgba[8..12], &[0x00, 0x00, 0xff, 0xff], "deuxième ligne");
        assert_eq!(&rgba[12..16], &[0xff, 0xff, 0xff, 0xff]);
    }

    #[test]
    fn le_canal_alpha_est_toujours_opaque() {
        let rows = vec![vec![0x0012_3456u32; 8]; 4];
        let rgba = convert_rows(&rows, 8, PixelFormat::Xrgb8888);

        for chunk in rgba.chunks_exact(4) {
            assert_eq!(chunk[3], 0xff);
        }
    }

    #[test]
    fn une_trame_dupliquee_conserve_l_image_precedente() {
        with_host(|host| *host = HostState::default());

        unsafe {
            with_host(|host| host.pixel_format = PixelFormat::Xrgb8888);
            let pixels = [0x00ff_0000u32, 0x0000_ff00];
            video_refresh(pixels.as_ptr().cast(), 2, 1, 8);
        }

        let (first, fresh) = with_host(|host| (host.video.rgba.clone(), host.video_fresh));
        assert!(fresh, "la première trame est neuve");
        assert_eq!(&first[0..4], &[0xff, 0x00, 0x00, 0xff]);

        // Un pointeur nul signifie « rejoue la trame précédente ».
        unsafe { video_refresh(std::ptr::null(), 2, 1, 8) };

        let (second, fresh) = with_host(|host| (host.video.rgba.clone(), host.video_fresh));
        assert!(!fresh, "la trame dupliquée n'est pas neuve");
        assert_eq!(first, second, "l'image précédente est conservée");
    }
}
