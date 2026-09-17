//! Les fichiers système que les cœurs réclament, et ce qu'EvaChi en sait.
//!
//! Un cœur d'émulation ne remplace pas toujours le micrologiciel de la machine
//! d'origine. Certains savent s'en passer, d'autres refusent de démarrer sans,
//! et quelques-uns — c'est le pire cas — démarrent, produisent du son, et
//! n'affichent qu'un écran noir. C'est ce qui est arrivé avec la Lynx : le
//! cœur tournait, rien ne le disait, et rien ne l'expliquait.
//!
//! Ce module ne fournit aucun de ces fichiers. Ce sont des micrologiciels sous
//! copyright, qui se copient depuis la machine qu'on possède. Il dit en
//! revanche exactement lesquels manquent, sous quel nom, et à quel endroit —
//! ce qui transforme un écran noir inexplicable en une ligne à lire.

use std::path::Path;

use serde::Serialize;

/// À quel point un fichier système est indispensable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Need {
    /// Sans lui, le cœur ne démarre pas, ou n'affiche rien.
    Required,
    /// Le cœur s'en passe, mais le résultat est moins fidèle ou plus limité.
    Optional,
}

/// Un fichier système attendu par un cœur.
struct Expected {
    /// Console, dans les mots de l'utilisateur.
    system: &'static str,
    /// Cœur concerné, tel qu'il se nomme sur le disque.
    core: &'static str,
    /// Chemin attendu sous le dossier système, séparateurs en avant.
    file: &'static str,
    need: Need,
    /// Ce que change sa présence, en une phrase.
    note: &'static str,
}

/// Ce que réclament les cœurs qu'EvaChi sait installer.
///
/// Seuls figurent ici les cœurs qui demandent réellement quelque chose. Les
/// absents — Mesen, Snes9x, SameBoy, Stella, Mupen64Plus, DOSBox, ScummVM,
/// VICE, Fuse, Caprice32, Theodore, et les autres — n'ont besoin de rien.
const EXPECTED: &[Expected] = &[
    Expected {
        system: "Atari Lynx",
        core: "mednafen_lynx_libretro",
        file: "lynxboot.img",
        need: Need::Required,
        note: "sans lui le cœur tourne mais l'écran reste noir",
    },
    Expected {
        system: "Intellivision",
        core: "freeintv_libretro",
        file: "exec.bin",
        need: Need::Required,
        note: "micrologiciel de la console",
    },
    Expected {
        system: "Intellivision",
        core: "freeintv_libretro",
        file: "grom.bin",
        need: Need::Required,
        note: "table de caractères de la console",
    },
    Expected {
        system: "3DO",
        core: "opera_libretro",
        // Éprouvé : Opera choisit ce nom-là par défaut. Un panafz1.bin seul est
        // ignoré, et le jeu reste sur un écran noir sans que rien ne l'explique.
        file: "panafz10.bin",
        need: Need::Required,
        note: "micrologiciel Panasonic FZ-10 ; c'est ce nom qu'Opera prend par défaut",
    },
    Expected {
        system: "PlayStation",
        core: "swanstation_libretro",
        file: "scph5500.bin",
        need: Need::Required,
        note: "BIOS japonais",
    },
    Expected {
        system: "PlayStation",
        core: "swanstation_libretro",
        file: "scph5501.bin",
        need: Need::Required,
        note: "BIOS américain",
    },
    Expected {
        system: "PlayStation",
        core: "swanstation_libretro",
        file: "scph5502.bin",
        need: Need::Required,
        note: "BIOS européen",
    },
    Expected {
        system: "Saturn",
        core: "mednafen_saturn_libretro",
        file: "sega_101.bin",
        need: Need::Required,
        note: "BIOS japonais",
    },
    Expected {
        system: "Saturn",
        core: "mednafen_saturn_libretro",
        file: "mpr-17933.bin",
        need: Need::Required,
        note: "BIOS américain et européen",
    },
    Expected {
        system: "Sharp X68000",
        core: "px68k_libretro",
        file: "keropi/iplrom.dat",
        need: Need::Required,
        note: "amorce de la machine",
    },
    Expected {
        system: "Sharp X68000",
        core: "px68k_libretro",
        file: "keropi/cgrom.dat",
        need: Need::Required,
        note: "polices de caractères",
    },
    Expected {
        system: "PC-98",
        core: "np2kai_libretro",
        file: "np2kai/bios.rom",
        need: Need::Required,
        note: "micrologiciel de la machine",
    },
    Expected {
        system: "PC-98",
        core: "np2kai_libretro",
        file: "np2kai/font.rom",
        need: Need::Required,
        note: "polices de caractères",
    },
    Expected {
        system: "MSX · ColecoVision",
        core: "bluemsx_libretro",
        // Éprouvé : à la racine du dossier système, et non sous `bluemsx/`.
        // Rangé ailleurs, le cœur refuse le contenu sans un mot d'explication.
        file: "Machines",
        need: Need::Required,
        note: "dossier des machines de la distribution blueMSX, avec Databases à côté",
    },
    Expected {
        system: "Dreamcast",
        core: "flycast_libretro",
        file: "dc/dc_boot.bin",
        need: Need::Optional,
        note: "beaucoup de jeux démarrent sans ; le menu de la console non",
    },
    Expected {
        system: "Dreamcast",
        core: "flycast_libretro",
        file: "dc/dc_flash.bin",
        need: Need::Optional,
        note: "réglages et date de la console",
    },
    Expected {
        system: "Nintendo DS",
        core: "melonds_libretro",
        file: "bios7.bin",
        need: Need::Optional,
        note: "melonDS émule le BIOS par défaut ; le vrai est plus fidèle",
    },
    Expected {
        system: "Nintendo DS",
        core: "melonds_libretro",
        file: "bios9.bin",
        need: Need::Optional,
        note: "idem",
    },
    Expected {
        system: "Nintendo DS",
        core: "melonds_libretro",
        file: "firmware.bin",
        need: Need::Optional,
        // melonDS y écrit les réglages de la console à chaque partie, et garde
        // l'original sous `firmware.bin.bak`. Le dépôt d'origine n'est donc plus
        // celui du fichier au bout d'une session : c'est voulu, pas une avarie.
        note: "modifié par melonDS, qui préserve l'original en .bak",
    },
    Expected {
        system: "Game Boy Advance",
        core: "mgba_libretro",
        file: "gba_bios.bin",
        need: Need::Optional,
        note: "mGBA s'en passe ; quelques jeux l'exigent pour leur écran d'accueil",
    },
    Expected {
        system: "Atari 7800",
        core: "prosystem_libretro",
        file: "7800 BIOS (U).rom",
        need: Need::Optional,
        note: "ajoute l'écran d'accueil de la console",
    },
    Expected {
        system: "Mega-CD · Sega CD",
        core: "genesis_plus_gx_libretro",
        file: "bios_CD_E.bin",
        need: Need::Optional,
        note: "indispensable aux jeux Mega-CD, inutile aux cartouches",
    },
    // Les trois régions coexistent : un jeu japonais refuse le micrologiciel
    // européen. Qui n'a que des jeux d'une région n'a besoin que du sien.
    Expected {
        system: "Mega-CD · Sega CD",
        core: "genesis_plus_gx_libretro",
        file: "bios_CD_U.bin",
        need: Need::Optional,
        note: "variante américaine, pour les jeux Sega CD des États-Unis",
    },
    Expected {
        system: "Mega-CD · Sega CD",
        core: "genesis_plus_gx_libretro",
        file: "bios_CD_J.bin",
        need: Need::Optional,
        note: "variante japonaise, pour les jeux Mega-CD japonais",
    },
    Expected {
        system: "PC Engine · TurboGrafx",
        core: "mednafen_pce_fast_libretro",
        file: "syscard3.pce",
        need: Need::Optional,
        note: "indispensable aux jeux CD, inutile aux cartes HuCard",
    },
    Expected {
        system: "Amiga",
        core: "puae_libretro",
        file: "kick34005.A500",
        need: Need::Optional,
        note: "Kickstart 1.3 ; PUAE se rabat sinon sur AROS, libre mais moins compatible",
    },
    Expected {
        system: "Amiga",
        core: "puae_libretro",
        file: "kick40068.A1200",
        need: Need::Optional,
        note: "Kickstart 3.1 ; nécessaire aux jeux AGA, que l'A500 ne sait pas faire tourner",
    },
    Expected {
        system: "Nintendo 3DS",
        core: "azahar_libretro",
        file: "azahar/sysdata/aes_keys.txt",
        need: Need::Required,
        note: "clés de déchiffrement ; sans elles un dépôt chiffré est refusé",
    },
    Expected {
        system: "Arcade",
        core: "fbneo_libretro",
        file: "fbneo/neogeo.zip",
        need: Need::Optional,
        note: "a poser ici, comme les romsets de jeux : FinalBurn Neo ne cherche que dans ce dossier",
    },
];

/// L'état d'un fichier système sur cette machine.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFile {
    pub system: String,
    pub file: String,
    pub need: Need,
    pub note: String,
    /// Vrai si le fichier est déjà en place.
    pub present: bool,
    /// Vrai si le cœur concerné est installé — les autres n'intéressent personne.
    pub core_installed: bool,
    /// Chemin complet où le déposer, à afficher tel quel.
    pub path: String,
}

/// Où va un fichier système reconnu, sous le dossier système.
///
/// Rendu depuis le même tableau que la liste affichée : un fichier reconnu ici
/// est forcément un fichier annoncé là-bas, et les deux ne peuvent pas diverger.
pub fn destinations() -> Vec<(&'static str, &'static str, &'static str)> {
    EXPECTED
        .iter()
        .map(|expected| {
            let basename = expected.file.rsplit('/').next().unwrap_or(expected.file);
            (basename, expected.file, expected.system)
        })
        .collect()
}

/// Ce qu'un cœur réclame quand il se plaint.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reclamation {
    /// Le nom du fichier, tel que le cœur l'a écrit.
    pub fichier: String,
    /// Le chemin où le déposer, quand EvaChi connaît ce fichier.
    pub ou: Option<String>,
    /// La console concernée, si on la connaît.
    pub systeme: Option<String>,
}

/// Les mots par lesquels un cœur dit qu'il lui manque quelque chose.
///
/// En anglais : les cœurs libretro ne parlent pas français, et ce qu'ils
/// écrivent n'est pas traduit. En minuscules, la comparaison l'étant aussi.
const PLAINTES: &[&str] = &[
    "bios",
    "firmware",
    "boot rom",
    "bootrom",
    "boot image",
    "system file",
    "ipl",
];

/// Et les mots par lesquels ils disent que ça ne s'est pas bien passé.
const ENNUIS: &[&str] = &[
    "missing",
    "not found",
    "cannot find",
    "can't find",
    "could not find",
    "couldn't find",
    "failed to",
    "unable to",
    "no such file",
    "required",
    "error",
];

/// Les extensions qu'un micrologiciel porte.
///
/// Elles ne servent qu'au repli, pour les fichiers qu'EvaChi ne connaît pas :
/// ceux du tableau se reconnaissent à leur nom, ce qui vaut mieux. Plusieurs y
/// échapperaient — `7800 BIOS (U).rom` porte des espaces, `Machines` est un
/// dossier, `neogeo.zip` une archive.
const EXTENSIONS: &[&str] = &[".bin", ".img", ".rom", ".bios", ".dat", ".nds", ".fd", ".e32"];

/// Reconnaît, dans une ligne de journal, un cœur qui réclame un fichier système.
///
/// C'est le pendant de ce que ce module fait déjà par la liste : celle-ci sait
/// d'avance ce que réclament les trente cœurs qu'on connaît, mais elle ne peut
/// rien dire des autres — ni des cas particuliers, un jeu japonais qui veut un
/// BIOS japonais. Le cœur, lui, le dit. Encore fallait-il l'écouter : jusqu'à ce
/// que son journal traverse pour de bon, sa plainte se perdait.
///
/// On ne devine pas : il faut à la fois le mot du fichier et le mot de l'ennui.
/// Un cœur qui annonce paisiblement « Loading boot image: … » ne réclame rien.
pub fn reclame(ligne: &str) -> Option<Reclamation> {
    let bas = ligne.to_lowercase();

    // Sans mot d'ennui, rien n'est réclamé. C'est le garde-fou qui compte : un
    // cœur annonce paisiblement « Loading boot image: … » à chaque partie, et
    // le prendre pour une plainte ferait crier au loup à chaque lancement.
    if !ENNUIS.iter().any(|mot| bas.contains(mot)) {
        return None;
    }

    // Ce qu'on connaît d'abord, par son nom entier : le nom fait la preuve à lui
    // seul. Découper la ligne en mots perdrait « 7800 BIOS (U).rom », qui en
    // contient trois, et `Machines` n'est même pas un fichier.
    if let Some((base, chemin, systeme)) = destinations()
        .into_iter()
        .find(|(base, _, _)| cite(&bas, &base.to_lowercase()))
    {
        return Some(Reclamation {
            fichier: base.to_owned(),
            ou: Some(chemin.to_owned()),
            systeme: Some(systeme.to_owned()),
        });
    }

    // Puis le repli, pour les cœurs qu'EvaChi ne connaît pas encore. Là, le nom
    // ne prouve rien : il faut en plus le mot du genre — « bios », « firmware ».
    // On ne saura pas où le ranger, mais dire lequel manque vaut mieux que se
    // taire.
    if !PLAINTES.iter().any(|mot| bas.contains(mot)) {
        return None;
    }
    Some(Reclamation {
        fichier: nom_de_fichier(ligne)?,
        ou: None,
        systeme: None,
    })
}

/// Vrai si la ligne cite ce nom sans qu'il soit noyé dans un mot plus long.
///
/// `Machines` est un nom de dossier très ordinaire : le chercher au milieu des
/// lettres ferait reconnaître `submachines` ou `machinesX`. Les deux chaînes
/// sont déjà en minuscules.
fn cite(ligne: &str, nom: &str) -> bool {
    let mot = |c: Option<char>| c.is_some_and(|c| c.is_alphanumeric());
    let mut depuis = 0usize;
    while let Some(trouve) = ligne[depuis..].find(nom) {
        let debut = depuis + trouve;
        let fin = debut + nom.len();
        let avant = ligne[..debut].chars().next_back();
        let apres = ligne[fin..].chars().next();
        if !mot(avant) && !mot(apres) {
            return true;
        }
        depuis = debut + nom.chars().next().map_or(1, char::len_utf8);
    }
    false
}

/// Tire d'une ligne le premier mot qui ressemble à un nom de fichier.
fn nom_de_fichier(ligne: &str) -> Option<String> {
    ligne
        .split(|c: char| c.is_whitespace() || "\"'`(),;:[]<>".contains(c))
        .map(|mot| mot.trim_matches(|c: char| c == '.' || c == '!'))
        // Un chemin complet se réduit à son dernier segment : c'est sous ce
        // nom-là qu'on saura où le ranger.
        .map(|mot| mot.rsplit(['/', '\\']).next().unwrap_or(mot))
        .find(|mot| {
            let bas = mot.to_lowercase();
            EXTENSIONS.iter().any(|fin| bas.ends_with(fin)) && bas.len() > 4
        })
        .map(|mot| mot.to_owned())
}

/// Fait le tour des fichiers système attendus, et dit lesquels sont là.
///
/// `installed` porte les identifiants des cœurs présents : un fichier réclamé
/// par un cœur qu'on n'a pas ne sert à rien, et l'afficher sans le dire ferait
/// une liste décourageante de vingt lignes rouges.
pub fn survey(system_dir: &Path, installed: &[String]) -> Vec<SystemFile> {
    EXPECTED
        .iter()
        .map(|expected| {
            let path = system_dir.join(expected.file.replace('/', std::path::MAIN_SEPARATOR_STR));
            SystemFile {
                system: expected.system.to_owned(),
                file: expected.file.to_owned(),
                need: expected.need,
                note: expected.note.to_owned(),
                present: path.exists(),
                core_installed: installed.iter().any(|core| core == expected.core),
                path: path.to_string_lossy().into_owned(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);

        let base = std::env::temp_dir().join(format!(
            "evachi-bios-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("répertoire temporaire");
        base
    }

    #[test]
    fn un_fichier_absent_est_signale_comme_tel() {
        let base = scratch();
        let liste = survey(&base, &["mednafen_lynx_libretro".to_owned()]);
        let _ = std::fs::remove_dir_all(&base);

        let lynx = liste
            .iter()
            .find(|f| f.file == "lynxboot.img")
            .expect("la Lynx figure au tableau");
        assert!(!lynx.present);
        assert!(lynx.core_installed);
        assert_eq!(lynx.need, Need::Required);
    }

    #[test]
    fn un_fichier_pose_est_reconnu() {
        let base = scratch();
        std::fs::write(base.join("lynxboot.img"), b"512 octets, en principe").expect("fichier");

        let liste = survey(&base, &[]);
        let lynx = liste.iter().find(|f| f.file == "lynxboot.img").unwrap();
        let present = lynx.present;
        let _ = std::fs::remove_dir_all(&base);

        assert!(present);
    }

    #[test]
    fn un_fichier_range_dans_un_sous_dossier_est_trouve() {
        // `dc/dc_boot.bin` et compagnie : le chemin porte un séparateur, qu'il
        // faut traduire pour la plateforme avant de tester l'existence.
        let base = scratch();
        std::fs::create_dir_all(base.join("dc")).expect("sous-dossier");
        std::fs::write(base.join("dc").join("dc_boot.bin"), b"x").expect("fichier");

        let liste = survey(&base, &[]);
        let boot = liste.iter().find(|f| f.file == "dc/dc_boot.bin").unwrap();
        let present = boot.present;
        let _ = std::fs::remove_dir_all(&base);

        assert!(present);
    }

    #[test]
    fn le_coeur_absent_se_distingue_du_coeur_installe() {
        let base = scratch();
        let liste = survey(&base, &["opera_libretro".to_owned()]);
        let _ = std::fs::remove_dir_all(&base);

        let trois_do = liste.iter().find(|f| f.system == "3DO").unwrap();
        let saturn = liste.iter().find(|f| f.system == "Saturn").unwrap();

        assert!(trois_do.core_installed);
        assert!(!saturn.core_installed);
    }

    #[test]
    fn chaque_entree_dit_ou_deposer_le_fichier() {
        let base = scratch();
        let liste = survey(&base, &[]);
        let _ = std::fs::remove_dir_all(&base);

        for entree in &liste {
            assert!(!entree.path.trim().is_empty(), "{} sans chemin", entree.file);
            assert!(
                !entree.note.trim().is_empty(),
                "{} sans explication",
                entree.file
            );
        }
    }

    #[test]
    fn tout_coeur_cite_figure_au_catalogue_installable() {
        // Les deux tableaux se répondent : annoncer un fichier pour un cœur
        // qu'EvaChi ne sait pas installer n'aiderait personne.
        let connus: Vec<String> = crate::install::catalogue()
            .into_iter()
            .map(|offre| offre.name)
            .collect();

        for expected in EXPECTED {
            assert!(
                connus.iter().any(|nom| nom == expected.core),
                "{} n'est pas au catalogue des cœurs",
                expected.core
            );
        }
    }

    // --- Ce qu'un cœur dit quand il lui manque un fichier -------------------

    #[test]
    fn une_plainte_ordinaire_est_reconnue_et_situee() {
        // La phrase vient d'un vrai cœur : c'est ainsi que Beetle PSX la dit.
        let vu = reclame("error: Missing BIOS file: scph5501.bin").expect("plainte reconnue");
        assert_eq!(vu.fichier, "scph5501.bin");
        assert_eq!(vu.systeme.as_deref(), Some("PlayStation"));
        assert!(vu.ou.is_some(), "EvaChi connaît ce fichier, elle doit dire où");
    }

    #[test]
    fn un_chemin_complet_se_reduit_a_son_nom() {
        // Certains cœurs citent le chemin entier, qui ne veut rien dire chez
        // l'utilisateur : c'est le nom du fichier qui sait où il va.
        let vu = reclame("Could not find BIOS at /usr/share/dc/dc_boot.bin").expect("plainte");
        assert_eq!(vu.fichier, "dc_boot.bin");
        assert_eq!(vu.systeme.as_deref(), Some("Dreamcast"));
    }

    #[test]
    fn un_fichier_inconnu_est_quand_meme_rapporte() {
        // EvaChi ne connaît pas tous les micrologiciels du monde. Ne rien dire
        // parce qu'on ne sait pas où le ranger, ce serait le pire des deux.
        let vu = reclame("Failed to load firmware: mystere_v2.rom").expect("plainte");
        assert_eq!(vu.fichier, "mystere_v2.rom");
        assert_eq!(vu.ou, None);
        assert_eq!(vu.systeme, None);
    }

    #[test]
    fn une_annonce_paisible_n_est_pas_une_plainte() {
        // Gambatte écrit cette ligne à chaque partie, et tout va bien. La
        // prendre pour une plainte ferait crier au loup à chaque lancement.
        assert_eq!(
            reclame("Loading boot image: C:\\Users\\Eve\\AppData\\Roaming\\app.evachi\\system\\dmg_boot.bin"),
            None
        );
        assert_eq!(reclame("[Gambatte] Plain ROM loaded."), None);
        assert_eq!(reclame("sram: 200000 - 203fff; eeprom: 0"), None);
    }

    #[test]
    fn un_ennui_sans_fichier_ne_dit_rien() {
        // Le mot « error » ne suffit pas : sans nom de fichier, on n'aurait
        // rien à montrer ni rien à proposer.
        assert_eq!(reclame("error: BIOS checksum mismatch"), None);
        assert_eq!(reclame("could not find anything at all"), None);
    }

    #[test]
    fn la_casse_ne_change_rien() {
        assert!(reclame("ERROR: MISSING BIOS FILE: SCPH5501.BIN").is_some());
        assert!(reclame("Cannot find Firmware.nds").is_some());
    }

    #[test]
    fn un_nom_a_espaces_ne_se_perd_pas_en_route() {
        // Découper la ligne en mots perdrait celui-là, qui en contient trois.
        // C'est ce qui a fait reprendre la reconnaissance par le bon bout.
        let vu = reclame("error: could not find \"7800 BIOS (U).rom\"").expect("plainte");
        assert_eq!(vu.fichier, "7800 BIOS (U).rom");
        assert!(vu.ou.is_some());
    }

    #[test]
    fn un_dossier_reclame_est_reconnu_comme_les_autres() {
        // blueMSX ne réclame pas un fichier mais un dossier entier. Il n'a donc
        // pas d'extension, et aucune heuristique de nom ne l'attraperait.
        let vu = reclame("bluemsx: Machines directory missing").expect("plainte");
        assert_eq!(vu.fichier, "Machines");
        assert_eq!(vu.systeme.as_deref(), Some("MSX · ColecoVision"));
    }

    #[test]
    fn un_nom_noye_dans_un_mot_plus_long_ne_compte_pas() {
        // « Machines » est un mot très ordinaire : le chercher au milieu des
        // lettres ferait crier au loup sur n'importe quelle phrase.
        assert_eq!(reclame("bios error: submachines not found"), None);
    }

    #[test]
    fn tout_fichier_du_tableau_se_retrouve_par_son_nom() {
        // La reconnaissance s'appuie sur `destinations` : si un fichier du
        // tableau portait une extension que la reconnaissance ignore, il ne
        // serait jamais situé, et personne ne s'en apercevrait.
        for (base, _, systeme) in destinations() {
            let plainte = format!("error: missing bios file {base}");
            let vu = reclame(&plainte)
                .unwrap_or_else(|| panic!("{base} n'est pas reconnu comme nom de fichier"));
            assert_eq!(vu.fichier, base);
            assert_eq!(vu.systeme.as_deref(), Some(systeme));
        }
    }
}
