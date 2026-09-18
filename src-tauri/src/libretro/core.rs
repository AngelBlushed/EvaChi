//! Chargement et pilotage d'un cœur libretro.
//!
//! Un cœur est une bibliothèque dynamique qui exporte une trentaine de symboles
//! nommés. On les résout une fois au chargement, puis on l'appelle dans l'ordre
//! que l'ABI impose : environnement, initialisation, rappels, contenu.

use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_uint, c_void};
use std::path::Path;

use libloading::{Library, Symbol};
use serde::{Deserialize, Serialize};

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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
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
    set_controller_port_device: unsafe extern "C" fn(c_uint, c_uint),
    /// Oublie toutes les triches. À appeler avant d'en reposer.
    cheat_reset: unsafe extern "C" fn(),
    /// Pose une triche, dans le dialecte de la console. C'est le cœur qui
    /// décode : lui seul connaît le sien.
    cheat_set: unsafe extern "C" fn(c_uint, bool, *const c_char),
    /// Le début d'une zone de mémoire, ou un pointeur nul si le cœur ne
    /// l'expose pas.
    get_memory_data: unsafe extern "C" fn(c_uint) -> *mut c_void,
    get_memory_size: unsafe extern "C" fn(c_uint) -> usize,
}

/// Une manette ordinaire, au sens de libretro.
const DEVICE_JOYPAD: c_uint = 1;

/// Un cœur chargé, éventuellement porteur d'un contenu en cours.
///
/// L'instance n'est pas `Send` : les rappels libretro écrivent dans une
/// variable de thread, donc le cœur doit rester sur le thread qui l'a créé.
pub struct Core {
    api: Api,
    /// Doit vivre aussi longtemps que `api`, et donc être déclaré après lui :
    /// Rust détruit les champs dans l'ordre de déclaration.
    ///
    /// En `Option` pour pouvoir choisir, à la destruction, entre rendre la
    /// bibliothèque au système et la laisser en place. Voir [`Core::drop`].
    lib: Option<Library>,
    info: CoreInfo,
    content_loaded: bool,
    initialised: bool,
    /// Les valeurs qu'on maintient en RAM, déjà vérifiées contre sa taille.
    ///
    /// Gardées ici plutôt que redemandées à chaque trame : elles ne changent
    /// qu'au gré de l'utilisateur, et la trame est le seul endroit de ce
    /// programme où compter les microsecondes a un sens.
    pokes: Vec<super::triches::Poke>,
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
    /// `langue` est l'étiquette BCP 47 de la langue qu'on voudrait entendre
    /// parler au jeu. Elle est posée avant `retro_set_environment`, seul
    /// moment où elle puisse encore peser sur les options du cœur.
    ///
    /// # Safety
    /// Charger une bibliothèque exécute son code d'initialisation. L'appelant
    /// répond de la provenance du fichier.
    pub unsafe fn load(
        path: &Path,
        system_dir: &Path,
        save_dir: &Path,
        langue: &str,
    ) -> Result<Self, CoreError> {
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
            set_controller_port_device: resolve(&lib, "retro_set_controller_port_device")?,
            cheat_reset: resolve(&lib, "retro_cheat_reset")?,
            cheat_set: resolve(&lib, "retro_cheat_set")?,
            get_memory_data: resolve(&lib, "retro_get_memory_data")?,
            get_memory_size: resolve(&lib, "retro_get_memory_size")?,
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
        let parler = super::langues::parler(langue).unwrap_or_else(super::langues::defaut);
        with_host(|state| {
            *state = host::HostState {
                system_dir: system,
                save_dir: save,
                langue: parler,
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
            lib: Some(lib),
            info,
            content_loaded: false,
            initialised: true,
            pokes: Vec::new(),
        })
    }

    pub fn info(&self) -> &CoreInfo {
        &self.info
    }

    /// Charge un contenu désigné par son chemin.
    ///
    /// Le fichier n'est lu que si le cœur veut les octets. Un cœur qui réclame
    /// un chemin sur disque — tous les gros : PS2, GameCube, PSP — n'en reçoit
    /// aucun, et les lire quand même se payait comptant : une image de quatre
    /// gigaoctets sur un disque externe coûtait deux minutes de lecture pure,
    /// pour un tampon aussitôt jeté.
    pub fn load_content(&mut self, path: &Path) -> Result<AvInfo, CoreError> {
        let c_path = CString::new(path.to_string_lossy().as_bytes())
            .map_err(|_| CoreError::BadPath(path.display().to_string()))?;

        let data = if self.info.need_fullpath {
            Vec::new()
        } else {
            std::fs::read(path)
                .map_err(|error| CoreError::BadPath(format!("{} : {error}", path.display())))?
        };

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

        // Dire quelle manette est branchée sur le premier port.
        //
        // L'ABI le prévoit après le chargement du contenu, et beaucoup de cœurs
        // s'en passent : ils supposent une manette ordinaire et lisent les
        // boutons quoi qu'il arrive. D'autres non — Dolphin instancie ses
        // manettes GameCube à ce moment-là, et sans cet appel le jeu démarre,
        // s'affiche, et ne répond à rien. Le silence était complet : aucun
        // message, aucune erreur, juste un jeu qui ignore les boutons.
        //
        // SAFETY : le contenu est chargé, ce que l'ABI exige pour cet appel.
        unsafe { (self.api.set_controller_port_device)(0, DEVICE_JOYPAD) };

        let av = self.av_info();
        self.start_hw_render(&av);
        Ok(av)
    }

    /// Met en place le contexte graphique quand le cœur en a réclamé un.
    ///
    /// L'ordre importe et n'est pas évident : le cœur demande son contexte
    /// pendant `retro_set_environment`, bien avant qu'on sache quelle taille
    /// lui donner. La géométrie n'arrive qu'avec le contenu — c'est donc ici,
    /// et pas plus tôt, qu'on peut créer le tampon puis prévenir le cœur que
    /// son contexte existe.
    ///
    /// Un échec n'interrompt rien : le cœur tournera sans image plutôt que de
    /// refuser de démarrer, et le message part dans le journal.
    #[cfg(windows)]
    fn start_hw_render(&mut self, av: &AvInfo) {
        let Some(request) = with_host(|host| host.hw) else {
            return;
        };

        // Les cœurs annoncent souvent une taille maximale généreuse ; c'est
        // elle qu'il faut allouer, la résolution interne pouvant monter en
        // cours de partie.
        let width = av.max_width.max(av.width).max(1);
        let height = av.max_height.max(av.height).max(1);

        // SAFETY : appelé depuis le thread propriétaire du cœur, celui-là même
        // qui appellera `retro_run`.
        let context = unsafe {
            super::gl::GlContext::create(
                width,
                height,
                request.depth,
                request.stencil,
                request.core_profile(),
                request.major,
                request.minor,
            )
        };

        match context {
            Ok(mut context) => {
                context.bottom_left_origin = request.bottom_left_origin;
                with_host(|host| host.gl = Some(context));

                // Le cœur ne construit ses ressources graphiques qu'à cet
                // appel : sans lui, il dessinerait dans le vide.
                if let Some(reset) = request.reset {
                    // SAFETY : le contexte est courant sur ce thread.
                    unsafe { reset() };
                }
            }
            Err(error) => {
                host::poser_message(format!("rendu matériel indisponible : {error}"));
            }
        }
    }

    #[cfg(not(windows))]
    fn start_hw_render(&mut self, _av: &AvInfo) {}

    /// Prévient le cœur que son contexte disparaît, puis le détruit.
    #[cfg(windows)]
    fn stop_hw_render(&mut self) {
        let destroy = with_host(|host| host.hw.and_then(|hw| hw.destroy));
        let had_context = with_host(|host| host.gl.is_some());

        if had_context {
            if let Some(destroy) = destroy {
                // SAFETY : le contexte est encore courant, comme l'exige
                // l'ABI : le cœur y libère ses textures et ses nuanceurs.
                unsafe { destroy() };
            }
        }
        with_host(|host| host.gl = None);
    }

    #[cfg(not(windows))]
    fn stop_hw_render(&mut self) {}

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
            host.video_fresh = false;
        });
        // La file audio est partagée entre threads : on la vide ici, et on la
        // relève après la trame.
        host::clear_audio();

        // Le cœur dessine dans notre tampon : il faut le lier avant qu'il ne
        // commence, sinon ses commandes partent vers la fenêtre invisible.
        #[cfg(windows)]
        with_host(|host| {
            if let Some(gl) = host.gl.as_ref() {
                // SAFETY : même thread que la création du contexte.
                unsafe {
                    gl.make_current();
                    gl.begin_frame();
                }
            }
        });

        self.maintenir();

        // SAFETY : contenu chargé, rappels posés, même thread qu'au chargement.
        unsafe { (self.api.run)() };

        let audio = host::take_audio();
        Ok(with_host(|host| Frame {
            video: host.video_fresh.then(|| host.video.clone()),
            audio,
            messages: {
                // Ce que le cœur a dit de lui-même vient après ce qu'il a
                // demandé d'afficher : l'un explique souvent l'autre.
                let mut dites = host::prendre_messages();
                dites.extend(host::take_core_log());
                dites
            },
            shutdown: host.shutdown,
        }))
    }

    /// La RAM de travail de la console, telle que le cœur l'expose.
    ///
    /// Vide quand le cœur ne l'expose pas — c'est son droit, et plusieurs ne le
    /// font pas. On rend alors une tranche vide plutôt qu'une erreur : c'est à
    /// l'appelant de dire que la recherche est impossible, pas au cœur de
    /// paraître en panne.
    fn zone(&self, quoi: c_uint) -> Option<(*mut u8, usize)> {
        if !self.content_loaded {
            return None;
        }
        // SAFETY : les deux appels vont de pair, et le cœur garantit la zone
        // valide tant que le contenu est chargé, ce qu'on vient de vérifier.
        let (debut, taille) = unsafe {
            (
                (self.api.get_memory_data)(quoi),
                (self.api.get_memory_size)(quoi),
            )
        };
        if debut.is_null() || taille == 0 {
            return None;
        }
        Some((debut.cast::<u8>(), taille))
    }

    /// Ce que la recherche a le droit de lire et d'écrire.
    ///
    /// La RAM de travail, et elle seule. La mémoire de sauvegarde est une
    /// autre zone, que rien ici ne demande jamais : c'est ce qui fait qu'une
    /// triche ne peut pas coûter une partie sauvegardée.
    pub fn ram(&self) -> &[u8] {
        match self.zone(MEMORY_SYSTEM_RAM) {
            // SAFETY : la zone vaut tant que le contenu est chargé, et
            // l'emprunt partagé qu'on rend ne vit pas plus longtemps que
            // `&self` — donc pas plus longtemps que le cœur.
            Some((debut, taille)) => unsafe { std::slice::from_raw_parts(debut, taille) },
            None => &[],
        }
    }

    /// La même, pour y écrire.
    ///
    /// Séparée de [`Core::ram`] à dessein : un `&mut` tiré d'un emprunt
    /// partagé permettrait à deux tranches modifiables de vivre ensemble, ce
    /// que Rust interdit partout ailleurs et pour de bonnes raisons. Ici c'est
    /// `&mut self` qui l'empêche, comme il se doit.
    fn ram_mut(&mut self) -> &mut [u8] {
        match self.zone(MEMORY_SYSTEM_RAM) {
            // SAFETY : même garantie, et l'unicité vient de `&mut self`.
            Some((debut, taille)) => unsafe { std::slice::from_raw_parts_mut(debut, taille) },
            None => &mut [],
        }
    }

    /// Combien d'octets la RAM de travail compte, zéro si le cœur la cache.
    pub fn taille_ram(&self) -> usize {
        self.ram().len()
    }

    /// Pose les triches, et garde les valeurs à maintenir.
    ///
    /// Les codes partent au cœur tels quels : chaque console a son dialecte,
    /// et `retro_cheat_set` est précisément la porte que l'ABI ouvre pour ne
    /// pas avoir à les décoder soi-même.
    ///
    /// Les valeurs, elles, sont filtrées ici contre la taille réelle de la RAM
    /// de cette console-ci. Une adresse relevée sur une autre partie, ou une
    /// fiche mal lue, s'arrête donc là plutôt que d'aller écrire ailleurs.
    pub fn poser_triches(&mut self, consignes: &super::triches::Consignes) -> super::triches::Etat {
        let ram = self.taille_ram();
        self.pokes = consignes.retenues(ram);

        // SAFETY : symboles obligatoires de l'ABI, cœur chargé sur ce thread.
        unsafe {
            (self.api.cheat_reset)();
            for (rang, code) in consignes.codes.iter().enumerate() {
                let Ok(texte) = CString::new(code.as_str()) else {
                    continue;
                };
                (self.api.cheat_set)(rang as c_uint, true, texte.as_ptr());
            }
        }

        super::triches::Etat {
            retenus: self.pokes.len(),
            ram,
        }
    }

    /// Réécrit les valeurs qu'on maintient, juste avant que le cœur ne tourne.
    ///
    /// Avant et non après : le jeu doit lire la valeur qu'on a posée pendant la
    /// trame qui suit. Posée après, elle serait écrasée par le jeu lui-même
    /// avant d'avoir servi à quoi que ce soit.
    fn maintenir(&mut self) {
        if self.pokes.is_empty() {
            return;
        }
        // La liste est empruntée le temps de l'écriture : sans cela, elle et la
        // RAM seraient deux emprunts du même cœur, l'un partagé et l'autre non.
        let pokes = std::mem::take(&mut self.pokes);
        let ram = self.ram_mut();
        for poke in &pokes {
            super::triches::deposer(ram, poke);
        }
        self.pokes = pokes;
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

        // Le contexte graphique part en dernier, et l'ordre n'est pas
        // indifférent : un cœur comme Dolphin fait tourner son propre fil
        // graphique jusqu'au bout de `retro_unload_game`. Le prévenir avant
        // qu'il ait fini le laissait attendre un contexte déjà démonté, et
        // l'arrêt d'un jeu ne rendait jamais la main.
        self.stop_hw_render();

        // Rendre la bibliothèque au système la décharge, et décharger un cœur
        // qui a laissé des fils en vie fige le processus : Windows attend, la
        // main ne revient jamais. Dolphin est dans ce cas.
        //
        // On la garde donc en mémoire. Ce n'est pas une fuite qui grandit : un
        // second chargement du même fichier ne fait qu'incrémenter un compteur
        // côté système, et `retro_init` / `retro_deinit` restent la vraie
        // frontière entre deux parties.
        if let Some(lib) = self.lib.take() {
            std::mem::forget(lib);
        }
    }
}
