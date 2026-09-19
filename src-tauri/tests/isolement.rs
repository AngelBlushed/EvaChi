//! Éprouve le cœur quand il vit dans un processus voisin.
//!
//! Ces épreuves-ci étaient **inécrivables** jusqu'au chantier de l'isolement :
//! un cœur qui plante tuait le programme d'épreuve lui-même, et libtest n'a
//! aucun équivalent de `#[should_panic]` pour une violation d'accès. Qu'elles
//! existent est en soi la démonstration.
//!
//! Le cœur d'essai sait mal se conduire sur commande — quatre boutons tenus
//! ensemble, que rien d'autre n'emploie. Les valeurs sont réécrites ici plutôt
//! qu'importées : `test-core` est un cdylib, on ne peut pas en dépendre, et
//! c'est aussi bien — deux moitiés qui divergent doivent se voir.

use std::path::PathBuf;

use evachi::libretro::{Consignes, Entrees, Poke, Session};

/// Dimensions annoncées par le cœur d'essai.
const WIDTH: u32 = 32;
const HEIGHT: u32 = 16;
const AUDIO_FRAMES: usize = 735;

const NO_BUTTONS: Entrees = Entrees {
    boutons: [0; 16],
    manches: [0; 4],
};

/// Les quatre boutons qui demandent au cœur d'essai de mal tourner : L2, R2,
/// L3 et R3 dans la numérotation de libretro. Voir `test-core/src/lib.rs`.
const SABOTAGE: [usize; 4] = [12, 13, 14, 15];
/// Avec A (bouton 8) en plus, le cœur ne rend plus la main.
const FIGE: usize = 8;
/// Avec X (bouton 9) en plus, il abandonne de lui-même.
const ABANDON: usize = 9;

fn boutons(tenus: &[usize]) -> Entrees {
    let mut etat = NO_BUTTONS;
    for index in tenus {
        etat.boutons[*index] = 1;
    }
    etat
}

fn saboter(avec: Option<usize>) -> Entrees {
    let mut tenus = SABOTAGE.to_vec();
    if let Some(bouton) = avec {
        tenus.push(bouton);
    }
    boutons(&tenus)
}

/// Localise la bibliothèque du cœur d'essai à côté du binaire de test.
///
/// Recopié de `libretro.rs` : deux programmes d'épreuve sont deux binaires
/// séparés, et un module partagé pour quarante lignes coûterait plus à lire
/// qu'à écrire deux fois.
fn test_core_path() -> PathBuf {
    let name = if cfg!(target_os = "windows") {
        "evachi_test_core.dll"
    } else if cfg!(target_os = "macos") {
        "libevachi_test_core.dylib"
    } else {
        "libevachi_test_core.so"
    };

    let exe = std::env::current_exe().expect("chemin de l'exécutable de test");
    let candidate = exe
        .parent()
        .and_then(|deps| deps.parent())
        .map(|profile| profile.join(name))
        .expect("arborescence de compilation inattendue");

    if !candidate.exists() {
        let mut cargo = std::process::Command::new(env!("CARGO"));
        cargo
            .args(["build", "-p", "evachi-test-core"])
            .current_dir(env!("CARGO_MANIFEST_DIR"));
        if !cfg!(debug_assertions) {
            cargo.arg("--release");
        }
        let _ = cargo.status();
    }

    assert!(
        candidate.exists(),
        "cœur d'essai introuvable en {} — lancez `cargo build -p evachi-test-core`",
        candidate.display()
    );
    candidate
}

/// Le vrai EvaChi, celui que la session relancera pour tenir le cœur.
///
/// `current_exe()` ne conviendrait pas : dans un programme d'épreuve, il
/// désigne le programme d'épreuve. Lancé avec le drapeau interne, libtest le
/// prendrait pour un filtre de nom, n'exécuterait aucun test, et ressortirait
/// avec zéro — le tuyau ne s'ouvrirait jamais, et l'on chercherait pourquoi
/// pendant une demi-journée.
fn evachi() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_evachi"))
}

/// Monte une session isolée avec un cœur et un contenu.
///
/// Aucun verrou, contrairement aux épreuves de l'hôte : chaque session a son
/// propre processus, donc son propre exemplaire du cœur. C'est précisément ce
/// que le chantier apporte, et le vérifier vaut autant que le reste.
fn partie() -> (Session, tempdir::TempDir) {
    let bac = tempdir::TempDir::new();
    let session = Session::isolee(evachi());

    session
        .load_core(&test_core_path(), bac.path(), bac.path(), "en")
        .expect("chargement du cœur d'essai");

    let contenu = bac.path().join("factice.test");
    std::fs::write(&contenu, b"contenu sans importance").expect("écriture du contenu");
    session
        .load_content(&contenu)
        .expect("chargement du contenu");

    assert!(session.isolee_en_cours(), "le cœur doit vivre à côté");
    (session, bac)
}

#[test]
fn le_coeur_repond_depuis_son_processus() {
    let bac = tempdir::TempDir::new();
    let session = Session::isolee(evachi());

    let info = session
        .load_core(&test_core_path(), bac.path(), bac.path(), "en")
        .expect("chargement du cœur d'essai");

    assert_eq!(info.name, "EvaChi Test Core");
    assert_eq!(info.version, "1.0");
    assert!(!info.need_fullpath);
    assert!(session.isolee_en_cours());
}

#[test]
fn une_trame_traverse_la_frontiere_intacte() {
    let (session, _bac) = partie();

    let trame = session.run_frame(NO_BUTTONS).expect("trame");
    let image = trame.video.expect("image");

    assert_eq!(image.width, WIDTH);
    assert_eq!(image.height, HEIGHT);
    assert_eq!(image.rgba.len(), (WIDTH * HEIGHT * 4) as usize);

    // Le cœur d'essai peint la première ligne en rouge, vert, bleu, blanc purs.
    // Ces quatre pixels-là démasquent une inversion de canaux, un rembourrage
    // de ligne mal sauté, ou une mémoire partagée décalée d'un octet.
    let pixel = |x: u32| {
        let debut = (x * 4) as usize;
        [
            image.rgba[debut],
            image.rgba[debut + 1],
            image.rgba[debut + 2],
            image.rgba[debut + 3],
        ]
    };
    assert_eq!(pixel(0), [255, 0, 0, 255], "rouge");
    assert_eq!(pixel(1), [0, 255, 0, 255], "vert");
    assert_eq!(pixel(2), [0, 0, 255, 255], "bleu");
    assert_eq!(pixel(3), [255, 255, 255, 255], "blanc");

    assert_eq!(trame.audio.len(), AUDIO_FRAMES * 2, "son stéréo entrelacé");
}

#[test]
fn deux_trames_tenues_ensemble_restent_deux_images() {
    // La mémoire partagée est réécrite à chaque trame. Si la fenêtre rendait une
    // vue dessus plutôt qu'une copie, ces deux images seraient les mêmes octets
    // et ce test passerait pour une mauvaise raison — c'est la leçon que le
    // côté page avait déjà apprise et mise sous épreuve.
    let (session, _bac) = partie();

    let une = session.run_frame(NO_BUTTONS).expect("une").video.expect("image");
    let deux = session.run_frame(NO_BUTTONS).expect("deux").video.expect("image");

    assert_ne!(une.rgba, deux.rgba, "le curseur avance d'une trame à l'autre");
}

#[test]
fn les_boutons_arrivent_jusqu_au_coeur() {
    let (session, _bac) = partie();

    // Le cœur d'essai allume un pixel de la deuxième ligne par bouton tenu :
    // c'est l'image elle-même qui dit ce qu'il a réellement lu.
    let trame = session.run_frame(boutons(&[0, 5, 15])).expect("trame");
    let image = trame.video.expect("image");

    /// La couleur dont le cœur d'essai marque un bouton tenu.
    const ALLUME: [u8; 3] = [0x9e, 0xe3, 0x7d];

    let allume = |x: u32| {
        let debut = ((WIDTH + x) * 4) as usize;
        image.rgba[debut..debut + 3] == ALLUME
    };
    assert!(allume(0), "le bouton 0 doit se voir");
    assert!(allume(5), "le bouton 5 doit se voir");
    assert!(allume(15), "le dernier bouton aussi");
    assert!(!allume(1), "le bouton 1 n'est pas tenu");
}

#[test]
fn plusieurs_trames_d_un_coup_rendent_la_derniere_image_et_tout_le_son() {
    // C'est ce qui rend l'avance rapide tenable : à neuf cents pour cent, on
    // exécute neuf trames pour n'en regarder qu'une, et les demander une par
    // une paierait l'aller-retour neuf fois.
    let (session, _bac) = partie();

    let seule = session.run_frames(NO_BUTTONS, 1, true).expect("une trame");
    let lot = session.run_frames(NO_BUTTONS, 4, true).expect("quatre trames");

    assert_eq!(
        lot.audio.len(),
        seule.audio.len() * 4,
        "le son des quatre trames revient en entier"
    );
    assert!(lot.video.is_some(), "l'image de la dernière trame revient");
}

#[test]
fn une_trame_dont_la_fenetre_ne_veut_pas_ne_traverse_pas() {
    // En avance rapide, l'écran n'en montre que soixante par seconde : les
    // autres n'ont aucune raison d'être recopiées.
    let (session, _bac) = partie();

    let muette = session.run_frames(NO_BUTTONS, 1, false).expect("trame");
    assert!(muette.video.is_none(), "l'image ne devait pas être écrite");
    assert!(!muette.audio.is_empty(), "le son, lui, revient toujours");
}

#[test]
fn un_coeur_qui_plante_n_emporte_pas_la_fenetre() {
    // L'épreuve qui justifie tout le chantier. Elle s'exécute dans ce processus
    // d'épreuve — donc si elle échoue mal, c'est libtest entier qui disparaît.
    let (session, _bac) = partie();

    let erreur = session.run_frame(saboter(None)).expect_err("le cœur a fauté");
    assert!(erreur.contains("coeur-tombe"), "{erreur}");

    // Et l'on sait dire de quoi il est mort : « il a fauté » n'appelle pas le
    // même conseil que « il ne répond plus ».
    assert!(erreur.contains("fauté"), "{erreur}");

    // La preuve que ce processus-ci va bien : il continue.
    let suivante = session.run_frame(NO_BUTTONS);
    assert!(suivante.is_err(), "le cœur est mort, on ne joue plus");
}

#[test]
fn un_coeur_qui_abandonne_est_reconnu_lui_aussi() {
    let (session, _bac) = partie();

    let erreur = session
        .run_frame(saboter(Some(ABANDON)))
        .expect_err("le cœur s'est arrêté");
    assert!(erreur.contains("coeur-tombe"), "{erreur}");
}

#[test]
fn un_coeur_qui_se_fige_est_abrege() {
    // L'autre défaut de fond : Dolphin se fige, et il fallait tuer EvaChi. La
    // fenêtre doit reprendre la main d'elle-même, au bout de l'échéance.
    let (session, _bac) = partie();

    let debut = std::time::Instant::now();
    let erreur = session
        .run_frame(saboter(Some(FIGE)))
        .expect_err("le cœur ne répond plus");
    let attendu = debut.elapsed();

    assert!(erreur.contains("coeur-tombe"), "{erreur}");
    assert!(
        erreur.contains("pas de réponse"),
        "on doit dire qu'il ne répond plus, pas qu'il a fauté : {erreur}"
    );
    // L'échéance d'une trame est de cinq secondes : on l'accepte, mais pas plus.
    assert!(
        attendu < std::time::Duration::from_secs(30),
        "abrégé en {attendu:?}"
    );
}

#[test]
fn un_fichier_absent_est_dit_comme_tel() {
    let bac = tempdir::TempDir::new();
    let session = Session::isolee(evachi());
    session
        .load_core(&test_core_path(), bac.path(), bac.path(), "en")
        .expect("chargement du cœur d'essai");

    let absent = bac.path().join("ce-fichier-n-existe-pas.test");
    let erreur = session.load_content(&absent).expect_err("refus attendu");
    assert!(erreur.contains("chemin illisible") || erreur.contains("os error"), "{erreur}");
}

/// La RAM que le cœur d'essai expose, et l'octet qu'il y compte.
const RAM_TAILLE: usize = 2048;
const RAM_COMPTEUR: u32 = 0;

/// Fait tourner quelques trames, sans toucher à la manette.
fn tourner(session: &Session, combien: usize) {
    for _ in 0..combien {
        session.run_frame(NO_BUTTONS).expect("trame");
    }
}

/// L'octet que le cœur d'essai compte, relu depuis son processus.
fn compteur(session: &Session) -> u8 {
    let lu = session.lire_memoire(RAM_COMPTEUR, 1).expect("lecture de la RAM");
    assert_eq!(lu.len(), 1, "la tranche demandée n'est pas revenue entière");
    lu[0]
}

#[test]
fn une_valeur_maintenue_est_reecrite_avant_chaque_trame() {
    // La différence entre une triche et une valeur posée une fois tient
    // là-dedans. Le cœur d'essai incrémente un octet de sa RAM à chaque trame :
    // si la valeur n'était déposée qu'au moment où on la demande, le compteur
    // repartirait de là et continuerait de monter. Maintenue, elle le ramène à
    // son point de départ avant chaque trame, et il ne monte plus que d'un.
    let (session, _bac) = partie();

    tourner(&session, 5);
    assert_eq!(compteur(&session), 5, "le cœur doit compter ses trames");

    let etat = session
        .poser_triches(Consignes {
            codes: Vec::new(),
            pokes: vec![Poke { adresse: RAM_COMPTEUR, taille: 1, valeur: 100 }],
        })
        .expect("pose des triches");
    assert_eq!(etat.retenus, 1, "la valeur devait être retenue");
    assert_eq!(etat.ram, RAM_TAILLE, "le cœur d'essai expose deux kilooctets");

    tourner(&session, 5);
    assert_eq!(
        compteur(&session),
        101,
        "cent, réécrit avant chaque trame, plus l'incrément de la dernière"
    );

    // Et décocher arrête l'écriture à l'instant : le compte repart d'où il en
    // était, sans qu'on ait eu à recharger quoi que ce soit.
    session
        .poser_triches(Consignes::default())
        .expect("retrait des triches");
    tourner(&session, 3);
    assert_eq!(compteur(&session), 104, "le compteur devait repartir");
}

#[test]
fn une_adresse_hors_de_la_ram_est_ecartee_et_le_jeu_continue() {
    // L'erreur qu'on veut rendre impossible : une adresse relevée sur une autre
    // console, ou une fiche mal lue, qui irait écrire au-delà de la mémoire.
    // Elle est écartée, on le dit en le comptant, et la partie continue.
    let (session, _bac) = partie();

    let etat = session
        .poser_triches(Consignes {
            codes: Vec::new(),
            pokes: vec![
                Poke { adresse: RAM_TAILLE as u32, taille: 1, valeur: 1 },
                Poke { adresse: RAM_TAILLE as u32 - 1, taille: 4, valeur: 1 },
                Poke { adresse: 0x10, taille: 1, valeur: 0x2a },
            ],
        })
        .expect("pose des triches");

    assert_eq!(etat.retenus, 1, "seule celle qui tient devait être retenue");

    tourner(&session, 2);
    let lu = session.lire_memoire(0x10, 1).expect("lecture de la RAM");
    assert_eq!(lu[0], 0x2a, "celle qui tenait devait s'appliquer");
}

#[test]
fn les_codes_partent_au_coeur_sans_qu_on_y_touche() {
    // Chaque console a son dialecte, et plusieurs sont chiffrés. EvaChi n'en
    // décode aucun : elle passe la chaîne au cœur, à qui l'ABI confie ce
    // travail. L'épreuve vérifie qu'elle arrive intacte, ponctuation comprise,
    // et qu'on a bien fait oublier les précédentes d'abord.
    let (session, _bac) = partie();
    let _ = session.take_messages();

    let etat = session
        .poser_triches(Consignes {
            codes: vec![
                "ATGA-AA56".to_owned(),
                "8005FA8A+3C00".to_owned(),
                "0754:00+0756:01".to_owned(),
            ],
            pokes: Vec::new(),
        })
        .expect("pose des triches");
    assert_eq!(etat.retenus, 0, "aucune valeur maintenue ici");

    // Une trame pour que ce que le cœur a dit revienne.
    tourner(&session, 1);
    let dits = session.take_messages();
    let dit = |quoi: &str| {
        assert!(
            dits.iter().any(|ligne| ligne.contains(quoi)),
            "« {quoi} » n'est pas arrivé : {dits:?}"
        );
    };

    dit("triches oubliées");
    dit("triche posée : 0 true ATGA-AA56");
    dit("triche posée : 1 true 8005FA8A+3C00");
    dit("triche posée : 2 true 0754:00+0756:01");
}

#[test]
fn la_lecture_de_memoire_est_bornee_par_la_ram_elle_meme() {
    // La recherche demande volontiers « tout depuis ici » sans savoir où la RAM
    // s'arrête : la borne est justement ce qu'elle vient apprendre. On rogne
    // donc, on ne refuse pas — et on ne lit jamais au-delà.
    let (session, _bac) = partie();

    assert_eq!(
        session.lire_memoire(0, u32::MAX).expect("lecture").len(),
        RAM_TAILLE,
        "la tranche devait être rognée à la taille réelle"
    );
    assert!(
        session.lire_memoire(RAM_TAILLE as u32, 16).expect("lecture").is_empty(),
        "une lecture qui commence après la fin ne rend rien"
    );
    assert_eq!(
        session.lire_memoire(RAM_TAILLE as u32 - 4, 16).expect("lecture").len(),
        4,
        "une tranche à cheval sur la fin s'arrête à la fin"
    );
}

#[test]
fn la_langue_demandee_arrive_jusqu_au_coeur() {
    // Le réglage ne vaut que s'il traverse tout : la commande, le tuyau, le
    // processus voisin, l'hôte, puis l'option que le cœur relit. Rien de moins
    // ne prouve qu'une cartouche européenne démarrera en français.
    //
    // Le cœur d'essai propose « English|French|Japanese|Spanish » et dit ce
    // qu'il a reçu. L'anglais est sa valeur d'usine — celle que retiendrait un
    // hôte qui ne fait rien — donc voir « French » prouve qu'on l'a changée.
    let bac = tempdir::TempDir::new();
    let session = Session::isolee(evachi());
    session
        .load_core(&test_core_path(), bac.path(), bac.path(), "fr")
        .expect("chargement du cœur d'essai");

    let dits = session.take_messages();
    assert!(
        dits.iter().any(|ligne| ligne.contains("option de langue : French")),
        "le cœur n'a pas reçu le français : {dits:?}"
    );
    // 2, c'est `RETRO_LANGUAGE_FRENCH` : l'autre chemin, celui que le cœur
    // interroge de lui-même.
    assert!(
        dits.iter().any(|ligne| ligne.contains("langue annoncée : 2")),
        "GET_LANGUAGE n'a rien répondu : {dits:?}"
    );
}

#[test]
fn une_langue_que_le_coeur_ne_parle_pas_lui_laisse_la_sienne() {
    // Le coréen n'est pas dans ce que ce cœur-là propose. Lui imposer une
    // valeur qu'il ne connaît pas serait pire que de ne rien faire : selon le
    // cœur, il la refuserait ou la prendrait pour une autre. On le laisse donc
    // sur sa valeur d'usine — mais on continue de répondre à GET_LANGUAGE,
    // qui, lui, ne demande pas au cœur de reconnaître quoi que ce soit.
    let bac = tempdir::TempDir::new();
    let session = Session::isolee(evachi());
    session
        .load_core(&test_core_path(), bac.path(), bac.path(), "ko")
        .expect("chargement du cœur d'essai");

    let dits = session.take_messages();
    assert!(
        dits.iter().any(|ligne| ligne.contains("option de langue : English")),
        "le cœur aurait dû garder sa valeur d'usine : {dits:?}"
    );
    // 10, c'est `RETRO_LANGUAGE_KOREAN`.
    assert!(
        dits.iter().any(|ligne| ligne.contains("langue annoncée : 10")),
        "GET_LANGUAGE n'a rien répondu : {dits:?}"
    );
}

#[test]
fn ce_que_le_coeur_a_dit_avant_de_refuser_arrive_quand_meme() {
    // L'épreuve qui compte pour les micrologiciels manquants. Ce que le cœur a
    // écrit avant de refuser est le seul endroit où l'on apprend ce qui lui
    // manque — et c'est le plus facile à perdre : aucune trame n'a eu lieu,
    // donc rien ne porte ces lignes sinon la réponse au refus elle-même.
    //
    // Elles l'étaient, justement : le parent les décodait puis les jetait avec
    // l'erreur. Tout marchait, sauf au seul moment où cela servait.
    let bac = tempdir::TempDir::new();
    let session = Session::isolee(evachi());
    session
        .load_core(&test_core_path(), bac.path(), bac.path(), "en")
        .expect("chargement du cœur d'essai");

    // Le cœur d'essai refuse ce contenu-là, après s'en être plaint.
    let refuse = bac.path().join("refuse.test");
    std::fs::write(&refuse, b"refuse").expect("écriture du contenu");

    let erreur = session.load_content(&refuse).expect_err("refus attendu");
    assert!(erreur.contains("refusé"), "{erreur}");

    let dits = session.take_messages();
    assert!(
        dits.iter().any(|ligne| ligne.contains("lynxboot.img")),
        "la plainte du cœur n'est pas arrivée : {dits:?}"
    );
}

#[test]
fn le_dechargement_laisse_au_coeur_le_temps_d_ecrire() {
    // C'est pendant qu'il décharge que le cœur pose sa sauvegarde de pile sur
    // le disque : le déchargement doit être attendu, pas abrégé.
    let (session, _bac) = partie();
    session.run_frame(NO_BUTTONS).expect("une trame");

    session.unload().expect("déchargement propre");

    // Le processus est parti avec le cœur : plus rien ne répond, et c'est dit.
    let erreur = session.run_frame(NO_BUTTONS).expect_err("plus de cœur");
    assert!(erreur.contains("aucun cœur"), "{erreur}");
}

#[test]
fn deux_parties_de_suite_ne_se_marchent_pas_dessus() {
    // Le troisième défaut, celui qu'on ne réparait pas : un cœur laisse des
    // variables globales C que `retro_deinit` ne remet pas à zéro, et la
    // bibliothèque n'est jamais rendue au système. Un processus neuf par partie
    // les efface pour de bon — ici, on vérifie simplement qu'enchaîner marche.
    let bac = tempdir::TempDir::new();
    let session = Session::isolee(evachi());
    let contenu = bac.path().join("factice.test");
    std::fs::write(&contenu, b"contenu").expect("écriture");

    for tour in 0..3 {
        session
            .load_core(&test_core_path(), bac.path(), bac.path(), "en")
            .unwrap_or_else(|erreur| panic!("tour {tour} : {erreur}"));
        session
            .load_content(&contenu)
            .unwrap_or_else(|erreur| panic!("tour {tour} : {erreur}"));
        session
            .run_frame(NO_BUTTONS)
            .unwrap_or_else(|erreur| panic!("tour {tour} : {erreur}"));
        session.unload().expect("déchargement");
    }
}

#[test]
fn une_partie_survit_a_la_partie_qui_a_plante() {
    // Le vrai enchaînement : un cœur tombe, et l'on relance un jeu derrière.
    let (session, bac) = partie();
    let _ = session.run_frame(saboter(None));

    session
        .load_core(&test_core_path(), bac.path(), bac.path(), "en")
        .expect("un cœur neuf après un plantage");
    let contenu = bac.path().join("factice.test");
    session.load_content(&contenu).expect("contenu");
    let trame = session.run_frame(NO_BUTTONS).expect("trame");
    assert!(trame.video.is_some());
}

#[test]
fn l_etat_de_sauvegarde_fait_l_aller_retour() {
    let (session, _bac) = partie();

    session.run_frame(NO_BUTTONS).expect("une trame");
    let repere = session.save_state().expect("sauvegarde");
    assert!(!repere.is_empty());

    let apres = session.run_frame(NO_BUTTONS).expect("une trame de plus");
    session.load_state(repere).expect("reprise");

    let reprise = session.run_frame(NO_BUTTONS).expect("trame après reprise");
    assert_eq!(
        apres.video.expect("image").rgba,
        reprise.video.expect("image").rgba,
        "revenu au même endroit, le cœur doit repeindre la même chose"
    );
}

/// Un répertoire temporaire qui se nettoie tout seul. Vingt lignes plutôt
/// qu'une dépendance de plus, comme dans `libretro.rs`.
mod tempdir {
    use std::path::{Path, PathBuf};

    pub struct TempDir {
        path: PathBuf,
    }

    impl TempDir {
        pub fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "evachi-isolement-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|age| age.as_nanos())
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
