//! Éprouve l'hôte libretro contre un vrai cœur chargé dynamiquement.
//!
//! Le cœur employé est `test-core`, écrit pour ce projet : il ne simule aucune
//! machine mais produit des valeurs connues sur chaque chemin de l'ABI. Les
//! attentes sont réécrites ici plutôt qu'importées — un test qui partage ses
//! constantes avec ce qu'il vérifie ne vérifie plus grand-chose.
//!
//! Le cœur d'essai est construit à la demande s'il manque : `cargo test` suffit.

use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use evachi::libretro::{Session, JOYPAD_BUTTONS};

/// Un cœur libretro range son état en global : chargé deux fois dans le même
/// processus, il n'existe toujours qu'en un exemplaire. Les tests s'exécutant
/// en parallèle par défaut, chacun prend ce verrou pour avoir le cœur à lui.
static CORE: Mutex<()> = Mutex::new(());

/// Prend le verrou du cœur, même si un test précédent a échoué en le tenant.
fn exclusive() -> MutexGuard<'static, ()> {
    CORE.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Dimensions annoncées par le cœur d'essai.
const WIDTH: u32 = 32;
const HEIGHT: u32 = 16;
const AUDIO_FRAMES: usize = 735;

const NO_BUTTONS: [i16; JOYPAD_BUTTONS] = [0; JOYPAD_BUTTONS];

/// Localise la bibliothèque du cœur d'essai à côté du binaire de test.
fn test_core_path() -> PathBuf {
    let name = if cfg!(target_os = "windows") {
        "evachi_test_core.dll"
    } else if cfg!(target_os = "macos") {
        "libevachi_test_core.dylib"
    } else {
        "libevachi_test_core.so"
    };

    // L'exécutable de test vit dans target/<profil>/deps/ ; les bibliothèques
    // dynamiques du même profil sont un cran au-dessus.
    let exe = std::env::current_exe().expect("chemin de l'exécutable de test");
    let candidate = exe
        .parent()
        .and_then(|deps| deps.parent())
        .map(|profile| profile.join(name))
        .expect("arborescence de compilation inattendue");

    if !candidate.exists() {
        build_test_core();
    }

    assert!(
        candidate.exists(),
        "cœur d'essai introuvable en {} — lancez `cargo build -p evachi-test-core`",
        candidate.display()
    );
    candidate
}

/// Construit le cœur d'essai.
///
/// Ni `cargo test`, ni `cargo test --workspace`, ni `cargo build` ne produisent
/// le cdylib d'un membre de l'espace de travail : seul un `-p` explicite le
/// fait. Plutôt que d'exiger deux commandes de qui lance les tests, on la passe
/// nous-mêmes quand la bibliothèque manque.
fn build_test_core() {
    let mut cargo = std::process::Command::new(env!("CARGO"));
    cargo
        .args(["build", "-p", "evachi-test-core"])
        .current_dir(env!("CARGO_MANIFEST_DIR"));

    if !cfg!(debug_assertions) {
        cargo.arg("--release");
    }

    match cargo.status() {
        Ok(status) if status.success() => {}
        Ok(status) => panic!("`cargo build -p evachi-test-core` a échoué : {status}"),
        Err(error) => panic!("`cargo build -p evachi-test-core` n'a pas pu démarrer : {error}"),
    }
}

/// Monte une session, charge le cœur d'essai et un contenu factice.
///
/// Le verrou vient en premier dans le triplet : les liaisons sont détruites en
/// ordre inverse de déclaration, il faut donc qu'il tombe après la session pour
/// que le cœur soit bien déchargé avant qu'un autre test ne le reprenne.
fn session_with_content() -> (MutexGuard<'static, ()>, Session, tempdir::TempDir) {
    let guard = exclusive();
    let scratch = tempdir::TempDir::new();
    let session = Session::spawn();

    session
        .load_core(&test_core_path(), scratch.path(), scratch.path())
        .expect("chargement du cœur d'essai");

    let content = scratch.path().join("factice.test");
    std::fs::write(&content, b"contenu sans importance").expect("écriture du contenu");

    session
        .load_content(&content, b"contenu sans importance".to_vec())
        .expect("chargement du contenu");

    (guard, session, scratch)
}

/// Lit un pixel de la trame, en RGBA.
fn pixel(rgba: &[u8], x: u32, y: u32) -> [u8; 4] {
    let offset = ((y * WIDTH + x) * 4) as usize;
    [
        rgba[offset],
        rgba[offset + 1],
        rgba[offset + 2],
        rgba[offset + 3],
    ]
}

#[test]
fn le_coeur_annonce_son_identite() {
    let _guard = exclusive();
    let scratch = tempdir::TempDir::new();
    let session = Session::spawn();

    let info = session
        .load_core(&test_core_path(), scratch.path(), scratch.path())
        .expect("chargement du cœur d'essai");

    assert_eq!(info.name, "EvaChi Test Core");
    assert_eq!(info.version, "1.0");
    assert_eq!(info.extensions, vec!["test", "bin"]);
    assert!(!info.need_fullpath);
}

#[test]
fn le_chargement_du_contenu_livre_la_geometrie() {
    let (_guard, session, _scratch) = session_with_content();

    // La géométrie n'est valide qu'après le chargement du contenu : c'est
    // pourquoi `load_content` la renvoie plutôt que `load_core`.
    let frame = session.run_frame(NO_BUTTONS).expect("première trame");
    let video = frame.video.expect("le cœur produit une image");

    assert_eq!(video.width, WIDTH);
    assert_eq!(video.height, HEIGHT);
    assert_eq!(video.rgba.len(), (WIDTH * HEIGHT * 4) as usize);
}

#[test]
fn les_canaux_de_couleur_sont_dans_le_bon_ordre() {
    let (_guard, session, _scratch) = session_with_content();
    let frame = session.run_frame(NO_BUTTONS).expect("trame");
    let video = frame.video.expect("image");

    // Le cœur peint rouge, vert, bleu, blanc sur les quatre premiers pixels.
    // Un hôte qui inverse R et B — l'erreur classique avec XRGB8888, dont les
    // octets arrivent en BGRA en petit-boutiste — échoue ici.
    assert_eq!(pixel(&video.rgba, 0, 0), [0xff, 0x00, 0x00, 0xff], "rouge");
    assert_eq!(pixel(&video.rgba, 1, 0), [0x00, 0xff, 0x00, 0xff], "vert");
    assert_eq!(pixel(&video.rgba, 2, 0), [0x00, 0x00, 0xff, 0xff], "bleu");
    assert_eq!(pixel(&video.rgba, 3, 0), [0xff, 0xff, 0xff, 0xff], "blanc");
}

#[test]
fn le_rembourrage_de_ligne_est_respecte() {
    let (_guard, session, _scratch) = session_with_content();
    let frame = session.run_frame(NO_BUTTONS).expect("trame");
    let video = frame.video.expect("image");

    // Le cœur écrit ses lignes avec quatre pixels de marge, remplis de magenta.
    // Cette couleur n'appartient pas au motif : la voir apparaître dans l'image
    // signifie que l'hôte a confondu `pitch` et `width * 4`, et décalé chaque
    // ligne d'autant.
    const POISON: [u8; 4] = [0xff, 0x00, 0xff, 0xff];

    for y in 0..HEIGHT {
        for x in 0..WIDTH {
            assert_ne!(
                pixel(&video.rgba, x, y),
                POISON,
                "rembourrage visible en ({x}, {y}) : le pas de ligne est ignoré"
            );
        }
    }
}

#[test]
fn les_boutons_traversent_jusqu_au_coeur() {
    let (_guard, session, _scratch) = session_with_content();

    let mut buttons = NO_BUTTONS;
    buttons[0] = 1;
    buttons[5] = 1;
    buttons[15] = 1;

    let frame = session.run_frame(buttons).expect("trame");
    let video = frame.video.expect("image");

    // Le cœur allume un pixel de la ligne 1 par bouton enfoncé : l'image dit
    // donc ce que le cœur a réellement lu, pas ce qu'on croit lui avoir envoyé.
    for index in 0..16u32 {
        // Un bouton enfoncé allume son pixel dans la couleur du curseur.
        let expected = if matches!(index, 0 | 5 | 15) {
            [0x9e, 0xe3, 0x7d, 0xff]
        } else {
            [0x00, 0x00, 0x00, 0xff]
        };
        assert_eq!(
            pixel(&video.rgba, index, 1),
            expected,
            "bouton {index}"
        );
    }
}

#[test]
fn le_son_arrive_entrelace_et_dans_le_bon_canal() {
    let (_guard, session, _scratch) = session_with_content();
    let frame = session.run_frame(NO_BUTTONS).expect("trame");

    assert_eq!(frame.audio.len(), AUDIO_FRAMES * 2, "stéréo entrelacé");

    // Rampes distinctes par canal : un hôte qui les intervertit ou qui perd
    // l'entrelacement produit des valeurs qui ne collent plus.
    for index in 0..AUDIO_FRAMES {
        // Deux rampes de périodes différentes, volontairement de faible
        // amplitude : le motif doit être vérifiable sans être assourdissant.
        let left = ((index % 128) as i16) * 2;
        let right = -(((index % 96) as i16) * 2);
        assert_eq!(frame.audio[index * 2], left, "canal gauche, échantillon {index}");
        assert_eq!(
            frame.audio[index * 2 + 1],
            right,
            "canal droit, échantillon {index}"
        );
    }
}

#[test]
fn les_trames_avancent() {
    let (_guard, session, _scratch) = session_with_content();

    let first = session.run_frame(NO_BUTTONS).expect("trame 0").video.unwrap();
    let second = session.run_frame(NO_BUTTONS).expect("trame 1").video.unwrap();

    // Le motif de fond dépend du numéro de trame : deux trames consécutives
    // diffèrent forcément hors des lignes fixes.
    assert_ne!(
        first.rgba, second.rgba,
        "l'image doit changer d'une trame à l'autre"
    );
}

#[test]
fn la_sauvegarde_d_etat_rembobine_la_partie() {
    let (_guard, session, _scratch) = session_with_content();

    session.run_frame(NO_BUTTONS).expect("trame 0");
    let snapshot = session.save_state().expect("sauvegarde");
    let reference = session.run_frame(NO_BUTTONS).expect("trame 1").video.unwrap();

    // On laisse la partie filer, puis on rembobine.
    for _ in 0..10 {
        session.run_frame(NO_BUTTONS).expect("trames intermédiaires");
    }
    let diverged = session.run_frame(NO_BUTTONS).expect("trame divergente").video.unwrap();
    assert_ne!(reference.rgba, diverged.rgba, "la partie a bien avancé");

    session.load_state(snapshot).expect("restauration");
    let restored = session.run_frame(NO_BUTTONS).expect("trame rejouée").video.unwrap();

    assert_eq!(
        reference.rgba, restored.rgba,
        "après restauration, la même trame doit se rejouer à l'identique"
    );
}

#[test]
fn la_reinitialisation_repart_de_zero() {
    let (_guard, session, _scratch) = session_with_content();

    let first = session.run_frame(NO_BUTTONS).expect("trame 0").video.unwrap();
    for _ in 0..5 {
        session.run_frame(NO_BUTTONS).expect("trames");
    }

    session.reset().expect("réinitialisation");
    let after = session.run_frame(NO_BUTTONS).expect("trame après reset").video.unwrap();

    assert_eq!(first.rgba, after.rgba, "reset doit rejouer la trame 0");
}

#[test]
fn une_session_sans_coeur_refuse_de_tourner() {
    let _guard = exclusive();
    let session = Session::spawn();
    let error = session.run_frame(NO_BUTTONS).expect_err("doit échouer");
    assert!(error.contains("aucun cœur"), "message inattendu : {error}");
}

#[test]
fn un_fichier_qui_n_est_pas_un_coeur_est_rejete() {
    let _guard = exclusive();
    let scratch = tempdir::TempDir::new();
    let session = Session::spawn();

    let bogus = scratch.path().join("pas-un-coeur.dll");
    std::fs::write(&bogus, b"ceci n'est pas une bibliotheque").expect("écriture");

    let error = session
        .load_core(&bogus, scratch.path(), scratch.path())
        .expect_err("doit échouer");
    assert!(
        error.contains("illisible") || error.contains("symbole"),
        "message inattendu : {error}"
    );
}

#[test]
fn le_dechargement_libere_le_coeur() {
    let (_guard, session, _scratch) = session_with_content();

    session.run_frame(NO_BUTTONS).expect("trame");
    session.unload().expect("déchargement");

    let error = session.run_frame(NO_BUTTONS).expect_err("doit échouer après déchargement");
    assert!(error.contains("aucun cœur"), "message inattendu : {error}");
}

/// Répertoire temporaire minimal, effacé à la destruction.
///
/// Écrit sur place plutôt que tiré d'une dépendance : le besoin tient en vingt
/// lignes, et un test d'intégration qui vérifie du chargement dynamique se
/// passe volontiers d'arbre de dépendances supplémentaire.
mod tempdir {
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    pub struct TempDir {
        path: PathBuf,
    }

    impl TempDir {
        pub fn new() -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::SeqCst);
            let path = std::env::temp_dir().join(format!(
                "evachi-test-{}-{}-{unique}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(0),
            ));
            std::fs::create_dir_all(&path).expect("création du répertoire temporaire");
            Self { path }
        }

        pub fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }
}
