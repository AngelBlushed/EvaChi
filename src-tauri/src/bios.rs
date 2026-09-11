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
}
