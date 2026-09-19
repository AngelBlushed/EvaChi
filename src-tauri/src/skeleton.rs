//! L'ossature de la bibliothèque : un dossier par console, créé vide.
//!
//! Une bibliothèque vide ne dit pas où poser ses jeux. EvaChi crée donc, au
//! premier lancement, un dossier par console qu'elle sait faire tourner — avec
//! les formats attendus écrits dans le nom. Il ne reste qu'à y glisser ses
//! fichiers ; le classement se fait tout seul, le nom du dossier tranchant sur
//! l'émulateur à employer.
//!
//! Aucun jeu n'est fourni, et ces dossiers restent vides jusqu'à ce que
//! quelqu'un y dépose les siens.

use std::path::Path;

/// Les dossiers créés au premier lancement, un par console.
///
/// Le nom porte les extensions entre parenthèses : c'est un pense-bête dans
/// l'explorateur, et l'interface le retire à l'affichage. Le début du nom sert
/// à reconnaître la console, d'où l'importance de ne pas l'abréger.
pub const FOLDERS: &[&str] = &[
    "32X (32x)",
    "3DO (.iso .cue .chd .bin)",
    "Amiga (.adf .adz .dms .ipf)",
    "Amstrad CPC (.dsk .sna .cdt .cpr)",
    "Arcade (.zip .7z .chd)",
    "Atari 2600 (.a26 .bin)",
    "Atari 7800 (.a78)",
    "Atari 800-5200 (.a52 .atr .xfd .cas)",
    "Atari Jaguar (.j64 .jag .abs)",
    "Atari Lynx (.lnx .lyx)",
    "CHIP-8 (.ch8 .c8)",
    "ColecoVision  MSX (.rom .col .dsk .mx1 .mx2)",
    "Commodore 64 (.d64 .d71 .d81 .g64)",
    "Dreamcast (.gdi .cdi .chd .cue)",
    "Game & Watch (mgw)",
    "Gameboy Advance (gba)",
    "Gameboy-Gameboy Color (gb-gbc)",
    "Gamecube-Wii (iso-gcm-dol-wbfs)",
    "Intellivision (.int .bin .rom)",
    "Master System-Game Gear (.sms .gg .sg)",
    "Mega Drive-Genesis (.md .gen .smd .bin)",
    "Mega-CD-Sega CD (.cue .chd .iso)",
    "MS-DOS (.zip .exe .iso .conf)",
    "Neo Geo Pocket  Color (.ngp .ngc .ngpc)",
    "Nes (nes-fds-unf)",
    "Nintendo 3ds (3ds-cia-3dsx)",
    "Nintendo 64 (n64-z64-v64)",
    "Nintendo Ds (nds-dsi)",
    "Nintendo Switch (.nsp .xci .nca .nro .nso)",
    "PC Engine  TurboGrafx (.pce .cue .chd)",
    "PC-98 (.d88 .fdi .hdm)",
    "Philips CD-i (.chd .cue .iso)",
    "PlayStation (.cue .bin .chd .pbp .iso)",
    "PlayStation 2 (.iso .chd .cso .bin .mdf .nrg)",
    "Point & click (.scummvm)",
    "PS Vita (.vpk)",
    "PSP (.iso .cso .pbp .elf)",
    "Saturn (.cue .chd .ccd)",
    "Sharp X68000 (.dim .d88 .hdm)",
    "Super Nintendo (smc-sfc-swc-fig)",
    "Thomson MO5-TO7 (.fd .k7 .sap)",
    "Vectrex (.vec .bin)",
    "Virtual Boy (vb-vboy)",
    "Wii U (.wud .wux .wua .rpx .wad)",
    "WonderSwan  Color (.ws .wsc)",
    "Xbox (.iso .xiso)",
    "Xbox 360 (.iso .xex .zar)",
    "ZX Spectrum (.tzx .tap .z80 .rzx)",
];

/// Crée les dossiers manquants sous `roms`. Rend le nombre de dossiers créés.
///
/// Ceux qui existent déjà sont laissés tels quels : quelqu'un a pu les renommer
/// à sa façon, et rien ici ne vaut son classement.
pub fn seed(roms: &Path) -> Result<usize, String> {
    std::fs::create_dir_all(roms).map_err(|error| format!("{} : {error}", roms.display()))?;

    // Le dépôt, à côté des consoles : c'est là qu'on jette ce qu'on n'a pas
    // envie de ranger, et EvaChi s'en charge au lancement suivant.
    let depot = roms.join(crate::tri::DEPOT);
    if !depot.exists() {
        std::fs::create_dir(&depot).map_err(|error| format!("{} : {error}", depot.display()))?;
    }

    let mut created = 0;
    for folder in FOLDERS {
        let path = roms.join(folder);
        if path.exists() {
            continue;
        }
        std::fs::create_dir(&path).map_err(|error| format!("{} : {error}", path.display()))?;
        created += 1;
    }
    Ok(created)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);

        let base = std::env::temp_dir().join(format!(
            "evachi-ossature-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = std::fs::remove_dir_all(&base);
        base
    }

    #[test]
    fn cree_un_dossier_par_console() {
        let base = scratch();
        let created = seed(&base).expect("création");
        let present = std::fs::read_dir(&base)
            .expect("lecture")
            .flatten()
            .filter(|entry| entry.path().is_dir())
            .count();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(created, FOLDERS.len());
        // Un de plus : le dépôt, qui n'est pas une console mais vit à côté
        // d'elles.
        assert_eq!(present, FOLDERS.len() + 1);
    }

    #[test]
    fn les_dossiers_crees_sont_vides() {
        // Aucun jeu n'est fourni : c'est le point de toute l'affaire.
        let base = scratch();
        seed(&base).expect("création");
        let fichiers = std::fs::read_dir(&base)
            .expect("lecture")
            .flatten()
            .filter_map(|entry| std::fs::read_dir(entry.path()).ok())
            .flat_map(|entries| entries.flatten())
            .count();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(fichiers, 0);
    }

    #[test]
    fn un_second_passage_ne_recree_rien() {
        let base = scratch();
        seed(&base).expect("premier passage");
        let encore = seed(&base).expect("second passage");
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(encore, 0);
    }

    #[test]
    fn un_dossier_renomme_par_l_utilisateur_survit() {
        // Quelqu'un range à sa façon : on ne défait pas son travail, on complète.
        let base = scratch();
        std::fs::create_dir_all(base.join("Mes jeux Game Boy")).expect("dossier");
        std::fs::write(base.join("Mes jeux Game Boy").join("jeu.gb"), b"").expect("fichier");

        seed(&base).expect("création");
        let survivant = base.join("Mes jeux Game Boy").join("jeu.gb").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert!(survivant);
    }

    #[test]
    fn aucun_nom_ne_se_repete() {
        let mut noms: Vec<&str> = FOLDERS.to_vec();
        noms.sort_unstable();
        let total = noms.len();
        noms.dedup();

        assert_eq!(noms.len(), total, "un dossier figure deux fois");
    }

    #[test]
    fn aucun_nom_n_est_illegal_sous_windows() {
        // `\ / : * ? " < > |` sont refusés par le système : un seul suffirait à
        // faire échouer la création, et donc le premier lancement.
        // Les octets de ces caracteres, ecrits ainsi pour que le tableau lui-meme
        // n echappe rien : antislash, barre oblique, deux-points, asterisque,
        // point d interrogation, guillemet, inferieur, superieur, barre verticale.
        const INTERDITS: &[u8] = &[92, 47, 58, 42, 63, 34, 60, 62, 124];

        for folder in FOLDERS {
            assert!(
                !folder.bytes().any(|byte| INTERDITS.contains(&byte)),
                "{folder} contient un caractère interdit"
            );
            assert!(!folder.ends_with([' ', '.']), "{folder} finit mal");
            assert!(!folder.trim().is_empty(), "nom vide");
        }
    }

    #[test]
    fn chaque_console_emulable_a_son_dossier() {
        // Le tableau des cœurs et celui des émulateurs autonomes disent ce
        // qu'EvaChi sait faire tourner ; l'ossature doit suivre. Un cœur ajouté
        // sans son dossier laisserait l'utilisateur sans endroit où ranger ses
        // jeux.
        // Les deux tableaux séparent les consoles jumelles à leur façon —
        // « Gamecube-Wii » d'un côté, « GameCube · Wii » de l'autre. C'est le
        // dossier qui compte, pas le trait d'union : on compare les mots.
        let mots = |texte: &str| {
            texte
                .to_lowercase()
                .replace(['·', '-', '_'], " ")
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        };

        let debuts: Vec<String> = FOLDERS
            .iter()
            .map(|folder| {
                mots(folder.split(['(', '[']).next().unwrap_or(folder))
            })
            .collect();

        for known in crate::emulators::STANDALONES {
            let attendu = mots(known.system);
            assert!(
                debuts.contains(&attendu),
                "{} n'a pas de dossier dans l'ossature",
                known.system
            );
        }
    }
}
