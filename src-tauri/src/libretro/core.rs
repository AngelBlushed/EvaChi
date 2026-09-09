//! Chargement et pilotage d'un cœur libretro.
//!
//! Un cœur est une bibliothèque dynamique qui exporte une trentaine de symboles
//! nommés. On les résout une fois au chargement, puis on l'appelle dans l'ordre
//! que l'ABI impose : environnement, initialisation, rappels, contenu.

use std::ffi::{CStr, CString};
use std::os::raw::{c_uint, c_void};
use std::path::Path;

use libloading::{Library, Symbol};
use serde::Serialize;

use super::abi::*;
use super::host::{self, with_host, VideoFrame};

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("cœur illisible : {0}")]
    Load(#[from] libloading::Error),

    #[error("symbole absent : {0} — ce fichier n'est pas un cœur libretro")]
    MissingSymbol(&'static str),

    #[error("version d'ABI {found}, cet hôte pilote la version {RETRO_API_VERSION}")]
    ApiVersion { found: c_uint },

    #[error("le cœur a refusé le contenu")]
    ContentRejected,

    #[error("aucun contenu chargé")]
    NoContent,

    #[error("ce cœur ne sait pas sérialiser son état")]
    NoSaveState,

    #[error("sérialisation refusée par le cœur")]
    SerializeFailed,

    #[error("état de {got} octets, le cœur en attend {expected}")]
    StateSize { got: usize, expected: usize },

    #[error("chemin illisible : {0}")]
    BadPath(String),
}

/// Identité d'un cœur, telle qu'il la déclare avant tout chargement.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreInfo {
    pub name: String,
    pub version: String,
    /// Extensions acceptées, sans le point.
    pub extensions: Vec<String>,
    /// Vrai si le cœur veut un chemin sur disque plutôt que le contenu en mémoire.
    pub need_fullpath: bool,
}

/// Caractéristiques audiovisuelles du contenu chargé.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvInfo {
    pub width: u32,
    pub height: u32,
    pub max_width: u32,
    pub max_height: u32,
    pub aspect_ratio: f32,
    pub fps: f64,
    pub sample_rate: f64,
}

/// Les symboles résolus du cœur. Ce sont de simples pointeurs de fonction ;
/// leur validité tient à la bibliothèque, gardée vivante dans [`Core`].
struct Api {
    init: unsafe extern "C" fn(),
    deinit: unsafe extern "C" fn(),
    api_version: unsafe extern "C" fn() -> c_uint,
    get_system_info: unsafe extern "C" fn(*mut SystemInfo),
    get_system_av_info: unsafe extern "C" fn(*mut SystemAvInfo),
    set_environment: unsafe extern "C" fn(EnvironmentFn),
    set_video_refresh: unsafe extern "C" fn(VideoRefreshFn),
    set_audio_sample: unsafe extern "C" fn(AudioSampleFn),
    set_audio_sample_batch: unsafe extern "C" fn(AudioSampleBatchFn),
    set_input_poll: unsafe extern "C" fn(InputPollFn),
    set_input_state: unsafe extern "C" fn(InputStateFn),
    reset: unsafe extern "C" fn(),
    run: unsafe extern "C" fn(),
    serialize_size: unsafe extern "C" fn() -> usize,
    serialize: unsafe extern "C" fn(*mut c_void, usize) -> bool,
    unserialize: unsafe extern "C" fn(*const c_void, usize) -> bool,
    load_game: unsafe extern "C" fn(*const GameInfo) -> bool,
    unload_game: unsafe extern "C" fn(),
}

/// Un cœur chargé, éventuellement porteur d'un contenu en cours.
///
/// L'instance n'est pas `Send` : les rappels libretro écrivent dans une
/// variable de thread, donc le cœur doit rester sur le thread qui l'a créé.
pub struct Core {
    api: Api,
    /// Doit vivre aussi longtemps que `api`, et donc être déclaré après lui :
    /// Rust détruit les champs dans l'ordre de déclaration.
    _lib: Library,
    info: CoreInfo,
    content_loaded: bool,
    initialised: bool,
}

/// Résout un symbole obligatoire de l'ABI.
unsafe fn resolve<T: Copy>(lib: &Library, name: &'static str) -> Result<T, CoreError> {
    let mut symbol_name = name.as_bytes().to_vec();
    symbol_name.push(0);
    let symbol: Symbol<T> = lib
        .get(&symbol_name)
        .map_err(|_| CoreError::MissingSymbol(name))?;
    Ok(*symbol)
}

impl Core {
    /// Charge une bibliothèque de cœur et vérifie qu'elle parle bien libretro.
    ///
    /// # Safety
    /// Charger une bibliothèque exécute son code d'initialisation. L'appelant
    /// répond de la provenance du fichier.
    pub unsafe fn load(path: &Path, system_dir: &Path, save_dir: &Path) -> Result<Self, CoreError> {
        let lib = Library::new(path)?;

        let api = Api {
            init: resolve(&lib, "retro_init")?,
            deinit: resolve(&lib, "retro_deinit")?,
            api_version: resolve(&lib, "retro_api_version")?,
            get_system_info: resolve(&lib, "retro_get_system_info")?,
            get_system_av_info: resolve(&lib, "retro_get_system_av_info")?,
            set_environment: resolve(&lib, "retro_set_environment")?,
            set_video_refresh: resolve(&lib, "retro_set_video_refresh")?,
            set_audio_sample: resolve(&lib, "retro_set_audio_sample")?,
            set_audio_sample_batch: resolve(&lib, "retro_set_audio_sample_batch")?,
            set_input_poll: resolve(&lib, "retro_set_input_poll")?,
            set_input_state: resolve(&lib, "retro_set_input_state")?,
            reset: resolve(&lib, "retro_reset")?,
            run: resolve(&lib, "retro_run")?,
            serialize_size: resolve(&lib, "retro_serialize_size")?,
            serialize: resolve(&lib, "retro_serialize")?,
            unserialize: resolve(&lib, "retro_unserialize")?,
            load_game: resolve(&lib, "retro_load_game")?,
            unload_game: resolve(&lib, "retro_unload_game")?,
        };

        let found = (api.api_version)();
        if found != RETRO_API_VERSION {
            return Err(CoreError::ApiVersion { found });
        }

        // Les répertoires doivent être en place avant `retro_init` : certains
        // cœurs y cherchent un BIOS dès l'initialisation.
        let to_cstring = |p: &Path| {
            CString::new(p.to_string_lossy().as_bytes())
                .map_err(|_| CoreError::BadPath(p.display().to_string()))
        };
        let system = to_cstring(system_dir)?;
        let save = to_cstring(save_dir)?;
        with_host(|state| {
            *state = host::HostState {
                system_dir: system,
                save_dir: save,
                ..Default::default()
            };
        });

        // L'ordre imposé par l'ABI : environnement, puis initialisation, puis
        // les rappels de trame.
        (api.set_environment)(host::environment);
        (api.init)();
        (api.set_video_refresh)(host::video_refresh);
        (api.set_audio_sample)(host::audio_sample);
        (api.set_audio_sample_batch)(host::audio_sample_batch);
        (api.set_input_poll)(host::input_poll);
        (api.set_input_state)(host::input_state);

        let mut raw = std::mem::zeroed::<SystemInfo>();
        (api.get_system_info)(&mut raw);

        let read = |ptr: *const std::os::raw::c_char| -> String {
            if ptr.is_null() {
                String::new()
            } else {
                CStr::from_ptr(ptr).to_string_lossy().into_owned()
            }
        };

        let info = CoreInfo {
            name: read(raw.library_name),
            version: read(raw.library_version),
            extensions: read(raw.valid_extensions)
                .split('|')
                .filter(|e| !e.is_empty())
                .map(str::to_owned)
                .collect(),
            need_fullpath: raw.need_fullpath,
        };

        Ok(Self {
            api,
            _lib: lib,
            info,
            content_loaded: false,
            initialised: true,
        })
    }

    pub fn info(&self) -> &CoreInfo {
        &self.info
    }

    /// Charge un contenu. `path` est requis quand le cœur réclame un fichier
    /// sur disque ; `data` sert dans le cas contraire.
    pub fn load_content(&mut self, path: &Path, data: &[u8]) -> Result<AvInfo, CoreError> {
        let c_path = CString::new(path.to_string_lossy().as_bytes())
            .map_err(|_| CoreError::BadPath(path.display().to_string()))?;

        let game = GameInfo {
            path: c_path.as_ptr(),
            data: if self.info.need_fullpath {
                std::ptr::null()
            } else {
                data.as_ptr().cast()
            },
            size: if self.info.need_fullpath { 0 } else { data.len() },
            meta: std::ptr::null(),
        };

        // SAFETY : le cœur est initialisé et les rappels sont posés.
        let accepted = unsafe { (self.api.load_game)(&game) };
        if !accepted {
            return Err(CoreError::ContentRejected);
        }
        self.content_loaded = true;

        Ok(self.av_info())
    }

    /// Relit les caractéristiques audiovisuelles, qui ne sont valides qu'une
    /// fois le contenu chargé.
    pub fn av_info(&self) -> AvInfo {
        let mut raw = unsafe { std::mem::zeroed::<SystemAvInfo>() };
        unsafe { (self.api.get_system_av_info)(&mut raw) };

        let aspect = if raw.geometry.aspect_ratio > 0.0 {
            raw.geometry.aspect_ratio
        } else {
            raw.geometry.base_width as f32 / raw.geometry.base_height.max(1) as f32
        };

        AvInfo {
            width: raw.geometry.base_width,
            height: raw.geometry.base_height,
            max_width: raw.geometry.max_width,
            max_height: raw.geometry.max_height,
            aspect_ratio: aspect,
            fps: raw.timing.fps,
            sample_rate: raw.timing.sample_rate,
        }
    }

    /// Émule une trame et récupère ce que les rappels ont déposé.
    pub fn run_frame(&mut self, input: [i16; JOYPAD_BUTTONS]) -> Result<Frame, CoreError> {
        if !self.content_loaded {
            return Err(CoreError::NoContent);
        }

        with_host(|host| {
            host.input = input;
            host.audio.clear();
            host.video_fresh = false;
        });

        // SAFETY : contenu chargé, rappels posés, même thread qu'au chargement.
        unsafe { (self.api.run)() };

        Ok(with_host(|host| Frame {
            video: host.video_fresh.then(|| host.video.clone()),
            audio: std::mem::take(&mut host.audio),
            messages: std::mem::take(&mut host.messages),
            shutdown: host.shutdown,
        }))
    }

    pub fn reset(&mut self) -> Result<(), CoreError> {
        if !self.content_loaded {
            return Err(CoreError::NoContent);
        }
        unsafe { (self.api.reset)() };
        Ok(())
    }

    pub fn save_state(&self) -> Result<Vec<u8>, CoreError> {
        let size = unsafe { (self.api.serialize_size)() };
        if size == 0 {
            return Err(CoreError::NoSaveState);
        }
        let mut buffer = vec![0u8; size];
        let ok = unsafe { (self.api.serialize)(buffer.as_mut_ptr().cast(), size) };
        if !ok {
            return Err(CoreError::SerializeFailed);
        }
        Ok(buffer)
    }

    pub fn load_state(&mut self, state: &[u8]) -> Result<(), CoreError> {
        let expected = unsafe { (self.api.serialize_size)() };
        if expected == 0 {
            return Err(CoreError::NoSaveState);
        }
        if state.len() != expected {
            return Err(CoreError::StateSize {
                got: state.len(),
                expected,
            });
        }
        let ok = unsafe { (self.api.unserialize)(state.as_ptr().cast(), state.len()) };
        if !ok {
            return Err(CoreError::SerializeFailed);
        }
        Ok(())
    }
}

/// Ce qu'une trame émulée produit.
pub struct Frame {
    /// Absent quand le cœur a demandé de réafficher la trame précédente.
    pub video: Option<VideoFrame>,
    /// Échantillons stéréo entrelacés.
    pub audio: Vec<i16>,
    pub messages: Vec<String>,
    pub shutdown: bool,
}

impl Drop for Core {
    fn drop(&mut self) {
        // L'ABI impose de décharger le contenu avant de dénitialiser, et de ne
        // rien appeler après `retro_deinit`.
        unsafe {
            if self.content_loaded {
                (self.api.unload_game)();
                self.content_loaded = false;
            }
            if self.initialised {
                (self.api.deinit)();
                self.initialised = false;
            }
        }
    }
}
