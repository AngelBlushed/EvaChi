//! Manettes des émulateurs autonomes.
//!
//! EvaChi ne peut pas relayer les entrées vers un programme séparé : Dolphin,
//! Cemu ou Ryubing lisent la manette eux-mêmes, chacun à sa façon. Ce qu'elle
//! peut faire, c'est leur poser une configuration de départ — pour qu'une
//! manette branchée réponde dès le premier lancement, sans passer par leurs
//! menus.
//!
//! Rien n'est jamais écrasé. Une configuration déjà présente appartient à
//! l'utilisateur, même si elle est vide : il l'a peut-être voulue ainsi.

use std::path::{Path, PathBuf};

/// Le dossier de configuration de Dolphin, portable ou non.
///
/// Dolphin bascule en mode portable dès qu'un `portable.txt` est posé à côté de
/// lui ; il range alors tout sous `User/`. Sinon ses réglages vivent dans les
/// documents de l'utilisateur.
pub fn dolphin_config(executable: &Path, documents: &Path) -> Option<PathBuf> {
    let home = executable.parent()?;
    match home.join("portable.txt").is_file() {
        true => Some(home.join("User").join("Config")),
        false => Some(documents.join("Dolphin Emulator").join("Config")),
    }
}

/// La manette GameCube, câblée sur une manette XInput.
///
/// Les noms viennent du greffon XInput de Dolphin : « Button A », « Pad N »,
/// « Left X+ ». Ce sont ceux qu'il écrit lui-même quand on configure à la main.
const GCPAD: &str = "\
[GCPad1]
Device = XInput/0/Gamepad
Buttons/A = `Button A`
Buttons/B = `Button B`
Buttons/X = `Button X`
Buttons/Y = `Button Y`
Buttons/Z = `Shoulder R`
Buttons/Start = `Start`
D-Pad/Up = `Pad N`
D-Pad/Down = `Pad S`
D-Pad/Left = `Pad W`
D-Pad/Right = `Pad E`
Main Stick/Up = `Left Y+`
Main Stick/Down = `Left Y-`
Main Stick/Left = `Left X-`
Main Stick/Right = `Left X+`
C-Stick/Up = `Right Y+`
C-Stick/Down = `Right Y-`
C-Stick/Left = `Right X-`
C-Stick/Right = `Right X+`
Triggers/L = `Shoulder L`
Triggers/R = `Shoulder R`
Triggers/L-Analog = `Trigger L`
Triggers/R-Analog = `Trigger R`
Rumble/Motor = `Motor L`
";

/// La télécommande Wii et son nunchuk, sur la même manette.
///
/// Le pointeur infrarouge suit le manche droit : sans lui, les jeux qui visent
/// à l'écran seraient injouables, et ils sont nombreux.
const WIIMOTE: &str = "\
[Wiimote1]
Device = XInput/0/Gamepad
Source = 1
Buttons/A = `Button A`
Buttons/B = `Trigger R`
Buttons/1 = `Button X`
Buttons/2 = `Button Y`
Buttons/- = `Back`
Buttons/+ = `Start`
Buttons/Home = `Thumb L`
D-Pad/Up = `Pad N`
D-Pad/Down = `Pad S`
D-Pad/Left = `Pad W`
D-Pad/Right = `Pad E`
IR/Up = `Right Y+`
IR/Down = `Right Y-`
IR/Left = `Right X-`
IR/Right = `Right X+`
Extension = Nunchuk
Nunchuk/Buttons/C = `Shoulder L`
Nunchuk/Buttons/Z = `Trigger L`
Nunchuk/Stick/Up = `Left Y+`
Nunchuk/Stick/Down = `Left Y-`
Nunchuk/Stick/Left = `Left X-`
Nunchuk/Stick/Right = `Left X+`
Rumble/Motor = `Motor L`
";

/// Pose une configuration de manette pour un émulateur, si elle manque.
///
/// Rend ce qui a été écrit, pour le journal. Un émulateur qu'on ne sait pas
/// configurer ne rend rien : ce n'est pas une erreur, seulement une limite
/// qu'il vaut mieux dire que masquer.
pub fn ensure(system: &str, executable: &Path, documents: &Path) -> Vec<String> {
    if system != "GameCube · Wii" {
        return Vec::new();
    }
    let Some(config) = dolphin_config(executable, documents) else {
        return Vec::new();
    };

    let mut written = Vec::new();
    for (name, contents) in [("GCPadNew.ini", GCPAD), ("WiimoteNew.ini", WIIMOTE)] {
        let target = config.join(name);
        if target.exists() {
            continue;
        }
        if std::fs::create_dir_all(&config).is_err() {
            continue;
        }
        if std::fs::write(&target, contents).is_ok() {
            written.push(target.to_string_lossy().into_owned());
        }
    }
    written
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(nom: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!("evachi-pads-{}-{nom}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("dossier temporaire");
        base
    }

    #[test]
    fn une_installation_ordinaire_range_ses_reglages_dans_les_documents() {
        let base = scratch("ordinaire");
        let exe = base.join("Dolphin-x64").join("Dolphin.exe");
        std::fs::create_dir_all(exe.parent().unwrap()).expect("dossier");

        let trouve = dolphin_config(&exe, &base.join("Documents")).expect("chemin");
        let _ = std::fs::remove_dir_all(&base);

        assert!(trouve.ends_with("Documents/Dolphin Emulator/Config".replace('/', std::path::MAIN_SEPARATOR_STR).as_str()));
    }

    #[test]
    fn une_installation_portable_garde_tout_chez_elle() {
        let base = scratch("portable");
        let home = base.join("Dolphin-x64");
        std::fs::create_dir_all(&home).expect("dossier");
        std::fs::write(home.join("portable.txt"), b"").expect("marqueur");

        let trouve = dolphin_config(&home.join("Dolphin.exe"), &base.join("Documents")).expect("chemin");
        let attendu = home.join("User").join("Config");
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(trouve, attendu);
    }

    #[test]
    fn pose_les_deux_fichiers_quand_ils_manquent() {
        let base = scratch("pose");
        let home = base.join("Dolphin-x64");
        std::fs::create_dir_all(&home).expect("dossier");
        let documents = base.join("Documents");

        let ecrits = ensure("GameCube · Wii", &home.join("Dolphin.exe"), &documents);
        let config = documents.join("Dolphin Emulator").join("Config");
        let gc = std::fs::read_to_string(config.join("GCPadNew.ini")).unwrap_or_default();
        let wii = config.join("WiimoteNew.ini").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(ecrits.len(), 2);
        assert!(wii);
        assert!(gc.contains("XInput/0/Gamepad"), "{gc}");
        assert!(gc.contains("Buttons/A"));
    }

    #[test]
    fn une_configuration_existante_n_est_jamais_ecrasee() {
        // Même vide : quelqu'un l'a peut-être voulue ainsi, et une manette mal
        // reconfigurée en pleine partie est pire qu'une manette muette.
        let base = scratch("respect");
        let home = base.join("Dolphin-x64");
        std::fs::create_dir_all(&home).expect("dossier");
        let documents = base.join("Documents");
        let config = documents.join("Dolphin Emulator").join("Config");
        std::fs::create_dir_all(&config).expect("dossier");
        std::fs::write(config.join("GCPadNew.ini"), b"le mien").expect("fichier");

        let ecrits = ensure("GameCube · Wii", &home.join("Dolphin.exe"), &documents);
        let garde = std::fs::read_to_string(config.join("GCPadNew.ini")).expect("relecture");
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(garde, "le mien");
        assert_eq!(ecrits.len(), 1, "seul le fichier manquant est posé");
    }

    #[test]
    fn un_emulateur_qu_on_ne_sait_pas_configurer_ne_rend_rien() {
        let base = scratch("inconnu");
        let ecrits = ensure("Nintendo Switch", &base.join("Ryujinx.exe"), &base);
        let _ = std::fs::remove_dir_all(&base);

        assert!(ecrits.is_empty());
    }
}
