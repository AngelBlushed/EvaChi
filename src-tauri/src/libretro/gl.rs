//! Contexte OpenGL pour les cœurs qui dessinent avec le processeur graphique.
//!
//! Un cœur 2D remplit un tableau de pixels que l'hôte n'a plus qu'à convertir.
//! Un cœur 3D — GameCube, N64, Dreamcast, 3DS — ne sait pas faire cela : il
//! émet des commandes de dessin et réclame un vrai contexte graphique. Faute de
//! l'obtenir, Dolphin bascule sur son moteur `Null`, émule sans rien afficher,
//! puis se termine brutalement.
//!
//! Ce module fournit ce contexte. Il crée une fenêtre invisible — sous Windows
//! un contexte OpenGL doit être porté par une fenêtre, même quand on ne compte
//! rien y afficher — puis un tampon de rendu hors écran dans lequel le cœur
//! dessine. Chaque trame est ensuite relue en mémoire et suit le même chemin
//! qu'une trame logicielle : l'interface ne voit aucune différence.
//!
//! Le contexte appartient au thread qui l'a créé, et c'est le même que celui
//! qui appelle `retro_run`. Cette contrainte n'est pas un détail de mise en
//! œuvre : un contexte OpenGL n'est utilisable que là où il est courant.

#![cfg(windows)]

use std::ffi::CString;
use std::os::raw::{c_int, c_void};

use windows_sys::Win32::Foundation::{HMODULE, HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{GetDC, ReleaseDC, HDC};
use windows_sys::Win32::Graphics::OpenGL::{
    wglCreateContext, wglDeleteContext, wglGetProcAddress, wglMakeCurrent, ChoosePixelFormat,
    SetPixelFormat, HGLRC, PFD_DOUBLEBUFFER, PFD_DRAW_TO_WINDOW, PFD_MAIN_PLANE,
    PFD_SUPPORT_OPENGL, PFD_TYPE_RGBA, PIXELFORMATDESCRIPTOR,
};
use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress, LoadLibraryW};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassW, CS_OWNDC, WNDCLASSW,
    WS_OVERLAPPED,
};

// --- Constantes OpenGL ------------------------------------------------------
// Transcrites plutôt qu'importées : elles tiennent en vingt lignes et évitent
// une dépendance de plus pour des valeurs qui ne changeront jamais.

const GL_FRAMEBUFFER: u32 = 0x8D40;
const GL_RENDERBUFFER: u32 = 0x8D41;
const GL_COLOR_ATTACHMENT0: u32 = 0x8CE0;
const GL_DEPTH_STENCIL_ATTACHMENT: u32 = 0x821A;
const GL_DEPTH_ATTACHMENT: u32 = 0x8D00;
const GL_DEPTH24_STENCIL8: u32 = 0x88F0;
const GL_DEPTH_COMPONENT24: u32 = 0x81A6;
const GL_FRAMEBUFFER_COMPLETE: u32 = 0x8CD5;
const GL_TEXTURE_2D: u32 = 0x0DE1;
const GL_RGBA: u32 = 0x1908;
const GL_RGBA8: u32 = 0x8058;
const GL_UNSIGNED_BYTE: u32 = 0x1401;
const GL_LINEAR: u32 = 0x2601;
const GL_TEXTURE_MIN_FILTER: u32 = 0x2801;
const GL_TEXTURE_MAG_FILTER: u32 = 0x2800;
const GL_PACK_ALIGNMENT: u32 = 0x0D05;
const GL_COLOR_BUFFER_BIT: u32 = 0x4000;
const GL_DEPTH_BUFFER_BIT: u32 = 0x0100;

const WGL_CONTEXT_MAJOR_VERSION_ARB: c_int = 0x2091;
const WGL_CONTEXT_MINOR_VERSION_ARB: c_int = 0x2092;
const WGL_CONTEXT_PROFILE_MASK_ARB: c_int = 0x9126;
const WGL_CONTEXT_CORE_PROFILE_BIT_ARB: c_int = 0x0000_0001;
const WGL_CONTEXT_COMPATIBILITY_PROFILE_BIT_ARB: c_int = 0x0000_0002;

/// Les fonctions OpenGL dont l'hôte a besoin.
///
/// Celles d'OpenGL 1.1 sont exportées par `opengl32.dll` ; tout ce qui est venu
/// après ne s'obtient qu'auprès du pilote, par `wglGetProcAddress`, et seulement
/// une fois un contexte courant. D'où cette table remplie après coup plutôt
/// qu'une liaison à l'édition de liens.
#[allow(non_snake_case)]
struct Gl {
    GenFramebuffers: unsafe extern "system" fn(c_int, *mut u32),
    BindFramebuffer: unsafe extern "system" fn(u32, u32),
    FramebufferTexture2D: unsafe extern "system" fn(u32, u32, u32, u32, c_int),
    FramebufferRenderbuffer: unsafe extern "system" fn(u32, u32, u32, u32),
    CheckFramebufferStatus: unsafe extern "system" fn(u32) -> u32,
    DeleteFramebuffers: unsafe extern "system" fn(c_int, *const u32),
    GenRenderbuffers: unsafe extern "system" fn(c_int, *mut u32),
    BindRenderbuffer: unsafe extern "system" fn(u32, u32),
    RenderbufferStorage: unsafe extern "system" fn(u32, u32, c_int, c_int),
    DeleteRenderbuffers: unsafe extern "system" fn(c_int, *const u32),
    GenTextures: unsafe extern "system" fn(c_int, *mut u32),
    BindTexture: unsafe extern "system" fn(u32, u32),
    TexImage2D: unsafe extern "system" fn(
        u32,
        c_int,
        c_int,
        c_int,
        c_int,
        c_int,
        u32,
        u32,
        *const c_void,
    ),
    TexParameteri: unsafe extern "system" fn(u32, u32, c_int),
    DeleteTextures: unsafe extern "system" fn(c_int, *const u32),
    ReadPixels: unsafe extern "system" fn(c_int, c_int, c_int, c_int, u32, u32, *mut c_void),
    PixelStorei: unsafe extern "system" fn(u32, c_int),
    Viewport: unsafe extern "system" fn(c_int, c_int, c_int, c_int),
    Clear: unsafe extern "system" fn(u32),
    ClearColor: unsafe extern "system" fn(f32, f32, f32, f32),
    Finish: unsafe extern "system" fn(),
}

/// Cherche un symbole OpenGL, d'abord auprès du pilote puis dans `opengl32`.
///
/// # Safety
/// Un contexte doit être courant : `wglGetProcAddress` ne répond pas sinon.
pub unsafe fn proc_address(name: &str) -> *const c_void {
    let Ok(symbol) = CString::new(name) else {
        return std::ptr::null();
    };

    if let Some(found) = wglGetProcAddress(symbol.as_ptr().cast()) {
        // Certains pilotes rendent 1, 2, 3 ou -1 pour « je ne connais pas »
        // plutôt que zéro. Un saut vers l'adresse 1 ne pardonne pas.
        let address = found as usize;
        if address > 3 && address != usize::MAX {
            return found as *const c_void;
        }
    }

    let module = opengl32();
    if module.is_null() {
        return std::ptr::null();
    }
    match GetProcAddress(module, symbol.as_ptr().cast()) {
        Some(found) => found as *const c_void,
        None => std::ptr::null(),
    }
}

/// Le module `opengl32.dll`, chargé une fois pour toutes.
fn opengl32() -> HMODULE {
    use std::sync::OnceLock;
    static MODULE: OnceLock<usize> = OnceLock::new();

    let handle = *MODULE.get_or_init(|| {
        let name: Vec<u16> = "opengl32.dll".encode_utf16().chain(Some(0)).collect();
        // SAFETY : nom terminé par zéro, chargement d'une bibliothèque système.
        unsafe { LoadLibraryW(name.as_ptr()) as usize }
    });
    handle as HMODULE
}

impl Gl {
    /// # Safety
    /// Un contexte OpenGL doit être courant sur ce thread.
    // Le type d'arrivée de chaque `transmute` est celui du champ qu'on
    // renseigne, déclaré vingt lignes plus haut : le répéter ici n'ajouterait
    // rien à la lisibilité.
    #[allow(clippy::missing_transmute_annotations)]
    unsafe fn load() -> Result<Self, String> {
        macro_rules! charger {
            ($nom:literal) => {{
                let address = proc_address($nom);
                if address.is_null() {
                    return Err(format!("{} manque au pilote graphique", $nom));
                }
                std::mem::transmute(address)
            }};
        }

        Ok(Self {
            GenFramebuffers: charger!("glGenFramebuffers"),
            BindFramebuffer: charger!("glBindFramebuffer"),
            FramebufferTexture2D: charger!("glFramebufferTexture2D"),
            FramebufferRenderbuffer: charger!("glFramebufferRenderbuffer"),
            CheckFramebufferStatus: charger!("glCheckFramebufferStatus"),
            DeleteFramebuffers: charger!("glDeleteFramebuffers"),
            GenRenderbuffers: charger!("glGenRenderbuffers"),
            BindRenderbuffer: charger!("glBindRenderbuffer"),
            RenderbufferStorage: charger!("glRenderbufferStorage"),
            DeleteRenderbuffers: charger!("glDeleteRenderbuffers"),
            GenTextures: charger!("glGenTextures"),
            BindTexture: charger!("glBindTexture"),
            TexImage2D: charger!("glTexImage2D"),
            TexParameteri: charger!("glTexParameteri"),
            DeleteTextures: charger!("glDeleteTextures"),
            ReadPixels: charger!("glReadPixels"),
            PixelStorei: charger!("glPixelStorei"),
            Viewport: charger!("glViewport"),
            Clear: charger!("glClear"),
            ClearColor: charger!("glClearColor"),
            Finish: charger!("glFinish"),
        })
    }
}

/// Procédure de fenêtre minimale : la fenêtre ne sert qu'à porter le contexte.
unsafe extern "system" fn window_proc(
    window: HWND,
    message: u32,
    w: WPARAM,
    l: LPARAM,
) -> LRESULT {
    DefWindowProcW(window, message, w, l)
}

/// Un contexte OpenGL et son tampon de rendu hors écran.
pub struct GlContext {
    window: HWND,
    dc: HDC,
    context: HGLRC,
    gl: Gl,
    framebuffer: u32,
    color: u32,
    depth: u32,
    width: u32,
    height: u32,
    /// Vrai si le cœur dessine l'origine en bas à gauche, comme OpenGL.
    pub bottom_left_origin: bool,
}

impl GlContext {
    /// Crée le contexte et son tampon de rendu.
    ///
    /// `major`/`minor` sont la version réclamée par le cœur ; `core_profile`
    /// distingue le profil moderne du profil de compatibilité. Le pilote peut
    /// rendre une version supérieure, ce qui convient.
    ///
    /// # Safety
    /// À appeler depuis le thread qui pilotera le cœur, et lui seul.
    pub unsafe fn create(
        width: u32,
        height: u32,
        want_depth: bool,
        want_stencil: bool,
        core_profile: bool,
        major: u32,
        minor: u32,
    ) -> Result<Self, String> {
        let class_name: Vec<u16> = "EvaChiGL".encode_utf16().chain(Some(0)).collect();
        let instance = GetModuleHandleW(std::ptr::null());

        let class = WNDCLASSW {
            style: CS_OWNDC,
            lpfnWndProc: Some(window_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: instance,
            hIcon: std::ptr::null_mut(),
            hCursor: std::ptr::null_mut(),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
        };
        // Un second enregistrement rend zéro sans conséquence : la classe reste
        // utilisable, ce qui compte quand on recharge un cœur.
        RegisterClassW(&class);

        // Fenêtre jamais montrée : ni `WS_VISIBLE`, ni `ShowWindow`.
        let window = CreateWindowExW(
            0,
            class_name.as_ptr(),
            class_name.as_ptr(),
            WS_OVERLAPPED,
            0,
            0,
            1,
            1,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            instance,
            std::ptr::null(),
        );
        if window.is_null() {
            return Err("fenêtre de contexte impossible à créer".into());
        }

        let dc = GetDC(window);
        if dc.is_null() {
            DestroyWindow(window);
            return Err("contexte de périphérique indisponible".into());
        }

        let mut descriptor: PIXELFORMATDESCRIPTOR = std::mem::zeroed();
        descriptor.nSize = std::mem::size_of::<PIXELFORMATDESCRIPTOR>() as u16;
        descriptor.nVersion = 1;
        descriptor.dwFlags = PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER;
        descriptor.iPixelType = PFD_TYPE_RGBA;
        descriptor.cColorBits = 32;
        descriptor.cDepthBits = 24;
        descriptor.cStencilBits = 8;
        descriptor.iLayerType = PFD_MAIN_PLANE as u8;

        let format = ChoosePixelFormat(dc, &descriptor);
        if format == 0 || SetPixelFormat(dc, format, &descriptor) == 0 {
            ReleaseDC(window, dc);
            DestroyWindow(window);
            return Err("aucun format de pixel compatible OpenGL".into());
        }

        // Premier contexte, ancien style : il ne sert qu'à obtenir la fonction
        // qui sait en créer un versionné. C'est la danse qu'impose WGL.
        let legacy = wglCreateContext(dc);
        if legacy.is_null() {
            ReleaseDC(window, dc);
            DestroyWindow(window);
            return Err("création du contexte OpenGL refusée".into());
        }
        wglMakeCurrent(dc, legacy);

        let context = match Self::create_versioned(dc, core_profile, major, minor) {
            Some(modern) => {
                wglMakeCurrent(dc, std::ptr::null_mut());
                wglDeleteContext(legacy);
                wglMakeCurrent(dc, modern);
                modern
            }
            // Pilote sans `wglCreateContextAttribsARB` : l'ancien contexte fera
            // l'affaire, il expose souvent la même version.
            None => legacy,
        };

        let gl = match Gl::load() {
            Ok(gl) => gl,
            Err(error) => {
                wglMakeCurrent(dc, std::ptr::null_mut());
                wglDeleteContext(context);
                ReleaseDC(window, dc);
                DestroyWindow(window);
                return Err(error);
            }
        };

        let mut this = Self {
            window,
            dc,
            context,
            gl,
            framebuffer: 0,
            color: 0,
            depth: 0,
            width: 0,
            height: 0,
            bottom_left_origin: true,
        };

        this.allocate(width.max(1), height.max(1), want_depth, want_stencil)?;
        Ok(this)
    }

    /// Demande au pilote un contexte de la version voulue.
    ///
    /// Rend `None` quand l'extension manque ou que la version est refusée ;
    /// l'appelant se rabat alors sur le contexte d'origine.
    ///
    /// # Safety
    /// Un contexte doit déjà être courant sur `dc`.
    unsafe fn create_versioned(
        dc: HDC,
        core_profile: bool,
        major: u32,
        minor: u32,
    ) -> Option<HGLRC> {
        type CreateContextAttribs = unsafe extern "system" fn(HDC, HGLRC, *const c_int) -> HGLRC;

        let address = proc_address("wglCreateContextAttribsARB");
        if address.is_null() {
            return None;
        }
        let create = std::mem::transmute::<*const c_void, CreateContextAttribs>(address);

        // Un cœur qui ne précise rien obtient 3.3 : assez récent pour les
        // nuanceurs qu'ils emploient tous, assez ancien pour tout pilote actuel.
        let (major, minor) = if major == 0 { (3, 3) } else { (major, minor) };
        let profile = if core_profile {
            WGL_CONTEXT_CORE_PROFILE_BIT_ARB
        } else {
            WGL_CONTEXT_COMPATIBILITY_PROFILE_BIT_ARB
        };

        let attributes = [
            WGL_CONTEXT_MAJOR_VERSION_ARB,
            major as c_int,
            WGL_CONTEXT_MINOR_VERSION_ARB,
            minor as c_int,
            WGL_CONTEXT_PROFILE_MASK_ARB,
            profile,
            0,
        ];

        let created = create(dc, std::ptr::null_mut(), attributes.as_ptr());
        if created.is_null() {
            None
        } else {
            Some(created)
        }
    }

    /// (Ré)alloue le tampon de rendu à la taille demandée.
    ///
    /// # Safety
    /// Le contexte doit être courant.
    unsafe fn allocate(
        &mut self,
        width: u32,
        height: u32,
        want_depth: bool,
        want_stencil: bool,
    ) -> Result<(), String> {
        self.release_targets();

        let gl = &self.gl;
        (gl.GenTextures)(1, &mut self.color);
        (gl.BindTexture)(GL_TEXTURE_2D, self.color);
        (gl.TexImage2D)(
            GL_TEXTURE_2D,
            0,
            GL_RGBA8 as c_int,
            width as c_int,
            height as c_int,
            0,
            GL_RGBA,
            GL_UNSIGNED_BYTE,
            std::ptr::null(),
        );
        (gl.TexParameteri)(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR as c_int);
        (gl.TexParameteri)(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR as c_int);

        (gl.GenFramebuffers)(1, &mut self.framebuffer);
        (gl.BindFramebuffer)(GL_FRAMEBUFFER, self.framebuffer);
        (gl.FramebufferTexture2D)(
            GL_FRAMEBUFFER,
            GL_COLOR_ATTACHMENT0,
            GL_TEXTURE_2D,
            self.color,
            0,
        );

        if want_depth {
            (gl.GenRenderbuffers)(1, &mut self.depth);
            (gl.BindRenderbuffer)(GL_RENDERBUFFER, self.depth);
            // Un tampon combiné profondeur+pochoir est ce que réclament les
            // cœurs qui demandent les deux, et ce que les pilotes préfèrent.
            let (format, attachment) = if want_stencil {
                (GL_DEPTH24_STENCIL8, GL_DEPTH_STENCIL_ATTACHMENT)
            } else {
                (GL_DEPTH_COMPONENT24, GL_DEPTH_ATTACHMENT)
            };
            (gl.RenderbufferStorage)(GL_RENDERBUFFER, format, width as c_int, height as c_int);
            (gl.FramebufferRenderbuffer)(GL_FRAMEBUFFER, attachment, GL_RENDERBUFFER, self.depth);
        }

        let status = (gl.CheckFramebufferStatus)(GL_FRAMEBUFFER);
        if status != GL_FRAMEBUFFER_COMPLETE {
            return Err(format!("tampon de rendu incomplet (0x{status:04X})"));
        }

        (gl.Viewport)(0, 0, width as c_int, height as c_int);
        (gl.ClearColor)(0.0, 0.0, 0.0, 1.0);
        (gl.Clear)(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

        self.width = width;
        self.height = height;
        Ok(())
    }

    /// Libère texture, tampon de profondeur et tampon de rendu.
    ///
    /// # Safety
    /// Le contexte doit être courant.
    unsafe fn release_targets(&mut self) {
        let gl = &self.gl;
        if self.framebuffer != 0 {
            (gl.DeleteFramebuffers)(1, &self.framebuffer);
            self.framebuffer = 0;
        }
        if self.color != 0 {
            (gl.DeleteTextures)(1, &self.color);
            self.color = 0;
        }
        if self.depth != 0 {
            (gl.DeleteRenderbuffers)(1, &self.depth);
            self.depth = 0;
        }
    }

    /// Rend le contexte courant sur le thread appelant.
    ///
    /// # Safety
    /// Le thread doit être celui qui a créé le contexte.
    pub unsafe fn make_current(&self) {
        wglMakeCurrent(self.dc, self.context);
    }

    /// L'identifiant du tampon de rendu, tel que le cœur le réclame.
    pub fn framebuffer(&self) -> usize {
        self.framebuffer as usize
    }

    /// Agrandit le tampon si le cœur dessine plus grand que prévu.
    ///
    /// Les cœurs 3D acceptent souvent d'augmenter leur résolution interne en
    /// cours de partie ; la taille annoncée au chargement ne suffit alors plus.
    ///
    /// # Safety
    /// Le contexte doit être courant.
    pub unsafe fn ensure_size(&mut self, width: u32, height: u32) -> Result<(), String> {
        if width <= self.width && height <= self.height {
            return Ok(());
        }
        let want_depth = self.depth != 0;
        self.allocate(
            width.max(self.width),
            height.max(self.height),
            want_depth,
            want_depth,
        )
    }

    /// Relit la trame dessinée par le cœur, en RGBA, de haut en bas.
    ///
    /// OpenGL range ses lignes de bas en haut ; l'interface les attend dans
    /// l'autre sens. Le retournement se fait ici, ligne par ligne, plutôt que
    /// dans le convertisseur commun aux cœurs logiciels.
    ///
    /// # Safety
    /// Le contexte doit être courant et le tampon complet.
    pub unsafe fn read_frame(&self, width: u32, height: u32, out: &mut Vec<u8>) {
        let width = width.min(self.width);
        let height = height.min(self.height);
        let taille = width as usize * height as usize * 4;

        out.clear();
        out.resize(taille, 0);
        if taille == 0 {
            return;
        }

        let gl = &self.gl;
        (gl.BindFramebuffer)(GL_FRAMEBUFFER, self.framebuffer);
        (gl.Finish)();
        (gl.PixelStorei)(GL_PACK_ALIGNMENT, 1);
        (gl.ReadPixels)(
            0,
            0,
            width as c_int,
            height as c_int,
            GL_RGBA,
            GL_UNSIGNED_BYTE,
            out.as_mut_ptr().cast(),
        );

        if self.bottom_left_origin {
            flip_vertically(out, width as usize, height as usize);
        }
    }

    /// Réarme le tampon de rendu avant que le cœur ne dessine.
    ///
    /// # Safety
    /// Le contexte doit être courant.
    pub unsafe fn begin_frame(&self) {
        let gl = &self.gl;
        (gl.BindFramebuffer)(GL_FRAMEBUFFER, self.framebuffer);
        (gl.Viewport)(0, 0, self.width as c_int, self.height as c_int);
    }
}

/// Retourne une image RGBA de haut en bas, sur place.
///
/// Isolé de tout appel graphique pour être vérifiable : une erreur d'indice ici
/// donnerait une image à l'envers, ou un panique en plein rendu.
pub fn flip_vertically(pixels: &mut [u8], width: usize, height: usize) {
    let ligne = width * 4;
    if ligne == 0 || height < 2 || pixels.len() < ligne * height {
        return;
    }

    for y in 0..height / 2 {
        let haut = y * ligne;
        let bas = (height - 1 - y) * ligne;
        // `split_at_mut` donne deux emprunts disjoints : la moitié haute finit
        // au début de `queue`, la ligne opposée s'y calcule par différence.
        let (tete, queue) = pixels.split_at_mut(bas);
        tete[haut..haut + ligne].swap_with_slice(&mut queue[..ligne]);
    }
}

impl Drop for GlContext {
    fn drop(&mut self) {
        // SAFETY : le contexte appartient à ce thread, et plus rien ne s'en
        // sert une fois le cœur déchargé.
        unsafe {
            wglMakeCurrent(self.dc, self.context);
            self.release_targets();
            wglMakeCurrent(self.dc, std::ptr::null_mut());
            wglDeleteContext(self.context);
            ReleaseDC(self.window, self.dc);
            DestroyWindow(self.window);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Construit une image où chaque ligne est remplie de son numéro.
    fn image(width: usize, height: usize) -> Vec<u8> {
        (0..height)
            .flat_map(|y| std::iter::repeat_n(y as u8, width * 4))
            .collect()
    }

    #[test]
    fn le_retournement_remet_les_lignes_dans_l_ordre() {
        let mut pixels = image(3, 4);
        flip_vertically(&mut pixels, 3, 4);

        let lignes: Vec<u8> = pixels.chunks(12).map(|ligne| ligne[0]).collect();
        assert_eq!(lignes, vec![3, 2, 1, 0]);
    }

    #[test]
    fn une_hauteur_impaire_garde_sa_ligne_du_milieu() {
        let mut pixels = image(2, 5);
        flip_vertically(&mut pixels, 2, 5);

        let lignes: Vec<u8> = pixels.chunks(8).map(|ligne| ligne[0]).collect();
        assert_eq!(lignes, vec![4, 3, 2, 1, 0]);
    }

    #[test]
    fn deux_retournements_rendent_l_image_d_origine() {
        let depart = image(5, 6);
        let mut pixels = depart.clone();

        flip_vertically(&mut pixels, 5, 6);
        flip_vertically(&mut pixels, 5, 6);

        assert_eq!(pixels, depart);
    }

    #[test]
    fn un_tampon_trop_court_est_laisse_intact() {
        // Mieux vaut une image non retournée qu'un panique au milieu d'une
        // partie : la taille annoncée par le cœur n'est pas toujours celle du
        // tampon qu'on a sous la main.
        let mut pixels = vec![7u8; 10];
        flip_vertically(&mut pixels, 4, 4);

        assert_eq!(pixels, vec![7u8; 10]);
    }

    #[test]
    fn une_image_d_une_seule_ligne_ne_bouge_pas() {
        let mut pixels = image(3, 1);
        let depart = pixels.clone();
        flip_vertically(&mut pixels, 3, 1);

        assert_eq!(pixels, depart);
    }
}
