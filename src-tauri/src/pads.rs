//! Manettes des émulateurs autonomes.
//!
//! EvaChi ne peut pas relayer les entrées vers un programme séparé : Dolphin,
//! Cemu ou Ryubing lisent la manette eux-mêmes, chacun à sa façon. Ce qu'elle
//! peut faire, c'est leur poser une configuration de départ — pour qu'une
//! manette branchée réponde dès le premier lancement, sans passer par leurs
//! menus.
//!
//! Une configuration qui lie déjà un appareil appartient à l'utilisateur et
//! n'est pas touchée. Celle que l'émulateur a écrite d'usine — clavier et
//! souris, aucune manette — est remplacée, l'ancienne gardée à côté.

use std::path::{Path, PathBuf};

/// Le dossier de configuration de Dolphin, dans l'ordre où lui-même le cherche.
///
/// Trois emplacements possibles, et se tromper ne produit aucune erreur : les
/// fichiers sont écrits, ignorés, et la manette reste muette. C'est exactement
/// ce qui est arrivé — une clé de registre déplaçait le dossier sans que rien
/// ne le dise.
///
/// 1. `portable.txt` posé à côté du programme : tout vit sous `User/` ;
/// 2. sinon la clé `HKCU\Software\Dolphin Emulator\UserConfigPath`, qu'il
///    écrit quand on lui a désigné un autre dossier ;
/// 3. sinon les documents de l'utilisateur.
pub fn dolphin_config(
    executable: &Path,
    documents: &Path,
    registry: Option<&Path>,
) -> Option<PathBuf> {
    let home = executable.parent()?;
    if home.join("portable.txt").is_file() {
        return Some(home.join("User").join("Config"));
    }
    if let Some(declared) = registry.filter(|path| !path.as_os_str().is_empty()) {
        return Some(declared.join("Config"));
    }
    Some(documents.join("Dolphin Emulator").join("Config"))
}

/// Le dossier que Dolphin s'est choisi, s'il l'a inscrit dans le registre.
#[cfg(windows)]
fn dolphin_registry_path() -> Option<PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::System::Registry::{
        RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ,
    };

    /// Convertit une chaîne Rust en chaîne large terminée par un zéro.
    fn large(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    let sous_cle = large("Software\\Dolphin Emulator");
    let valeur = large("UserConfigPath");
    let mut tampon = [0u16; 520];
    let mut taille = (tampon.len() * 2) as u32;

    // SAFETY : les deux chaînes sont terminées par un zéro, et la taille
    // annoncée est bien celle du tampon.
    let statut = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            sous_cle.as_ptr(),
            valeur.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            tampon.as_mut_ptr().cast(),
            &mut taille,
        )
    };
    if statut != 0 {
        return None;
    }

    let mots = (taille as usize / 2).saturating_sub(1);
    let texte = std::ffi::OsString::from_wide(&tampon[..mots.min(tampon.len())]);
    let chemin = PathBuf::from(texte);
    (!chemin.as_os_str().is_empty()).then_some(chemin)
}

#[cfg(not(windows))]
fn dolphin_registry_path() -> Option<PathBuf> {
    None
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
    match system {
        "GameCube · Wii" => {
            let registre = dolphin_registry_path();
            match dolphin_config(executable, documents, registre.as_deref()) {
                Some(config) => install_into(&config),
                None => Vec::new(),
            }
        }
        "PlayStation 2" => match executable.parent() {
            Some(home) => install_pcsx2(&home.join("inis")),
            None => Vec::new(),
        },
        _ => Vec::new(),
    }
}

/// La manette de la PlayStation 2, câblée sur la première manette SDL.
///
/// PCSX2 désigne les appareils par leur rang — `SDL-0` — et non par un
/// identifiant propre à l'exemplaire : la même configuration vaut donc pour
/// n'importe quelle manette, sur n'importe quelle machine.
const PCSX2_PAD: &str = "\
[Pad1]
Type = DualShock2
Up = SDL-0/DPadUp
Right = SDL-0/DPadRight
Down = SDL-0/DPadDown
Left = SDL-0/DPadLeft
Triangle = SDL-0/FaceNorth
Circle = SDL-0/FaceEast
Cross = SDL-0/FaceSouth
Square = SDL-0/FaceWest
Select = SDL-0/Back
Start = SDL-0/Start
L1 = SDL-0/LeftShoulder
R1 = SDL-0/RightShoulder
L2 = SDL-0/+LeftTrigger
R2 = SDL-0/+RightTrigger
L3 = SDL-0/LeftStick
R3 = SDL-0/RightStick
LUp = SDL-0/-LeftY
LRight = SDL-0/+LeftX
LDown = SDL-0/+LeftY
LLeft = SDL-0/-LeftX
RUp = SDL-0/-RightY
RRight = SDL-0/+RightX
RDown = SDL-0/+RightY
RLeft = SDL-0/-RightX
LargeMotor = SDL-0/LargeMotor
SmallMotor = SDL-0/SmallMotor
";

/// Réécrit la section `[Pad1]` de PCSX2 si elle ne tient qu'au clavier.
///
/// Le fichier porte tous les réglages de l'émulateur — graphismes, dossiers,
/// jeux récents. On n'en remplace qu'une section, et on garde l'ancien à côté.
fn install_pcsx2(inis: &Path) -> Vec<String> {
    let config = inis.join("PCSX2.ini");
    let Ok(existing) = std::fs::read_to_string(&config) else {
        return Vec::new();
    };
    if binds_a_pad_pcsx2(&existing) {
        return Vec::new();
    }

    let backup = inis.join("PCSX2.ini.avant-evachi");
    if !backup.exists() {
        let _ = std::fs::write(&backup, &existing);
    }

    let remplace = replace_section(&existing, "[Pad1]", PCSX2_PAD);
    match std::fs::write(&config, remplace) {
        Ok(()) => vec![format!("{} ([Pad1])", config.to_string_lossy())],
        Err(_) => Vec::new(),
    }
}

/// Vrai si la manette 1 de PCSX2 tient à autre chose qu'au clavier.
fn binds_a_pad_pcsx2(contents: &str) -> bool {
    contents
        .lines()
        .skip_while(|line| line.trim() != "[Pad1]")
        .skip(1)
        .take_while(|line| !line.trim_start().starts_with('['))
        .filter_map(|line| line.split_once('='))
        .any(|(_, value)| {
            // La section mêle des liens — « SDL-0/DPadUp » — et des réglages
            // ordinaires — « Type = DualShock2 », « AxisScale = 1.33 ». Seul un
            // lien porte une barre oblique : c'est ce qui les départage.
            let value = value.trim();
            value.contains('/') && !value.starts_with("Keyboard") && !value.starts_with("Mouse")
        })
}

/// Remplace une section d'un fichier INI par un contenu tout prêt.
///
/// Le reste du fichier est rendu tel quel, à la ligne près : ce sont les
/// réglages de quelqu'un d'autre.
fn replace_section(contents: &str, section: &str, remplacement: &str) -> String {
    let mut out = String::with_capacity(contents.len() + remplacement.len());
    let mut dedans = false;
    let mut pose = false;

    for line in contents.lines() {
        let titre = line.trim_start().starts_with('[');
        if titre {
            if line.trim() == section {
                dedans = true;
                out.push_str(remplacement);
                pose = true;
                continue;
            }
            dedans = false;
        }
        if dedans {
            continue;
        }
        out.push_str(line);
        out.push('\n');
    }

    if !pose {
        out.push('\n');
        out.push_str(remplacement);
    }
    out
}

/// Vrai si cette configuration lie un véritable appareil de jeu.
///
/// Dolphin ne livre pas un fichier vide : il écrit sa configuration d'usine,
/// clavier et souris. Le fichier existe donc toujours, et « ne jamais écraser »
/// revenait à ne jamais rien faire — c'est ce qui laissait la manette muette.
///
/// Tant qu'aucun appareil n'est lié, remplacer ne prend le travail de personne.
/// Dès qu'il y en a un, le fichier appartient à quelqu'un et on n'y touche pas.
/// Seule la première section compte — `[GCPad1]`, `[Wiimote1]`. Le fichier en
/// porte d'autres, pour les manettes 2 à 4 et la Balance Board, et l'une
/// d'elles peut mentionner un appareil oublié depuis longtemps. Juger sur le
/// fichier entier protégeait ainsi une configuration que personne n'utilisait.
fn binds_a_gamepad(contents: &str, section: &str) -> bool {
    contents
        .lines()
        .skip_while(|line| line.trim() != section)
        .skip(1)
        .take_while(|line| !line.trim_start().starts_with('['))
        .filter_map(|line| line.split_once('='))
        .filter(|(key, _)| key.trim() == "Device")
        .any(|(_, value)| !value.trim().ends_with("Keyboard Mouse"))
}

/// Installe les configurations de manette dans ce dossier.
///
/// Séparé de la recherche du dossier : l'un dépend de la machine — registre,
/// mode portable — l'autre non, et seul le second se vérifie.
fn install_into(config: &Path) -> Vec<String> {
    let mut written = Vec::new();
    for (name, contents, section) in [
        ("GCPadNew.ini", GCPAD, "[GCPad1]"),
        ("WiimoteNew.ini", WIIMOTE, "[Wiimote1]"),
    ] {
        let target = config.join(name);

        if let Ok(existing) = std::fs::read_to_string(&target) {
            if binds_a_gamepad(&existing, section) {
                continue;
            }
            // Ce qu'on remplace, on le garde : l'utilisateur doit pouvoir
            // revenir en arrière sans réinstaller quoi que ce soit.
            let backup = config.join(format!("{name}.avant-evachi"));
            if !backup.exists() {
                let _ = std::fs::write(&backup, &existing);
            }
        }

        if std::fs::create_dir_all(config).is_err() {
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

        let trouve = dolphin_config(&exe, &base.join("Documents"), None).expect("chemin");
        let attendu = base.join("Documents").join("Dolphin Emulator").join("Config");
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(trouve, attendu);
    }

    #[test]
    fn une_cle_de_registre_deplace_le_dossier() {
        // Le cas qui a coûté une soirée : les fichiers étaient écrits dans les
        // documents, Dolphin lisait ailleurs, et rien ne signalait l'écart.
        let base = scratch("registre");
        let home = base.join("Dolphin-x64");
        std::fs::create_dir_all(&home).expect("dossier");
        let ailleurs = base.join("Roaming").join("Dolphin Emulator");

        let trouve = dolphin_config(
            &home.join("Dolphin.exe"),
            &base.join("Documents"),
            Some(&ailleurs),
        )
        .expect("chemin");
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(trouve, ailleurs.join("Config"));
    }

    #[test]
    fn le_mode_portable_l_emporte_sur_le_registre() {
        let base = scratch("priorite");
        let home = base.join("Dolphin-x64");
        std::fs::create_dir_all(&home).expect("dossier");
        std::fs::write(home.join("portable.txt"), b"").expect("marqueur");

        let trouve = dolphin_config(
            &home.join("Dolphin.exe"),
            &base.join("Documents"),
            Some(&base.join("Roaming")),
        )
        .expect("chemin");
        let attendu = home.join("User").join("Config");
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(trouve, attendu);
    }

    #[test]
    fn une_installation_portable_garde_tout_chez_elle() {
        let base = scratch("portable");
        let home = base.join("Dolphin-x64");
        std::fs::create_dir_all(&home).expect("dossier");
        std::fs::write(home.join("portable.txt"), b"").expect("marqueur");

        let trouve = dolphin_config(&home.join("Dolphin.exe"), &base.join("Documents"), None).expect("chemin");
        let attendu = home.join("User").join("Config");
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(trouve, attendu);
    }

    #[test]
    fn pose_les_deux_fichiers_quand_ils_manquent() {
        let base = scratch("pose");
        let config = base.join("Dolphin Emulator").join("Config");

        let ecrits = install_into(&config);
        let gc = std::fs::read_to_string(config.join("GCPadNew.ini")).unwrap_or_default();
        let wii = config.join("WiimoteNew.ini").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(ecrits.len(), 2);
        assert!(wii);
        assert!(gc.contains("XInput/0/Gamepad"), "{gc}");
        assert!(gc.contains("Buttons/A"));
    }

    #[test]
    fn une_manette_deja_liee_n_est_jamais_touchee() {
        // Reconfigurer la manette de quelqu'un en pleine partie est pire
        // qu'une manette muette.
        let base = scratch("respect");
        let config = base.join("Dolphin Emulator").join("Config");
        std::fs::create_dir_all(&config).expect("dossier");
        std::fs::write(
            config.join("GCPadNew.ini"),
            b"[GCPad1]\nDevice = DInput/0/Ma manette a moi\nButtons/A = `1`\n",
        )
        .expect("fichier");

        let ecrits = install_into(&config);
        let garde = std::fs::read_to_string(config.join("GCPadNew.ini")).expect("relecture");
        let _ = std::fs::remove_dir_all(&base);

        assert!(garde.contains("Ma manette a moi"), "{garde}");
        assert_eq!(ecrits.len(), 1, "seule la télécommande Wii est posée");
    }

    #[test]
    fn la_configuration_d_usine_clavier_est_remplacee_et_gardee() {
        // Le cas réel : Dolphin écrit toujours un fichier, câblé sur le clavier
        // et la souris. « Ne jamais écraser » revenait donc à ne jamais rien
        // faire, et la manette restait muette.
        let base = scratch("usine");
        let config = base.join("Dolphin Emulator").join("Config");
        std::fs::create_dir_all(&config).expect("dossier");
        let usine = "[GCPad1]\nDevice = DInput/0/Keyboard Mouse\nButtons/A = `X`\n";
        std::fs::write(config.join("GCPadNew.ini"), usine).expect("fichier");

        let ecrits = install_into(&config);
        let pose = std::fs::read_to_string(config.join("GCPadNew.ini")).expect("relecture");
        let sauvegarde =
            std::fs::read_to_string(config.join("GCPadNew.ini.avant-evachi")).expect("sauvegarde");
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(ecrits.len(), 2);
        assert!(pose.contains("XInput/0/Gamepad"), "{pose}");
        assert_eq!(sauvegarde, usine, "l'ancienne reste récupérable");
    }

    #[test]
    fn on_reconnait_une_configuration_qui_lie_un_appareil() {
        let section = |device: &str| format!("[Wiimote1]\nDevice = {device}\n");
        assert!(!binds_a_gamepad(&section("DInput/0/Keyboard Mouse"), "[Wiimote1]"));
        assert!(binds_a_gamepad(&section("XInput/0/Gamepad"), "[Wiimote1]"));
        assert!(binds_a_gamepad(&section("DInput/0/Xbox Controller"), "[Wiimote1]"));
        assert!(!binds_a_gamepad("pas de section du tout", "[Wiimote1]"));
    }

    #[test]
    fn une_autre_section_ne_protege_pas_la_premiere() {
        // Le cas rencontré : la télécommande 1 était sur le clavier, mais une
        // section plus bas citait un Joy-Con oublié — et tout le fichier s'en
        // trouvait protégé.
        let fichier = "\
[Wiimote1]
Device = DInput/0/Keyboard Mouse
Buttons/A = `Click 0`
[Wiimote2]
Device = SDL/0/Nintendo Switch Joy-Con (L)
";
        assert!(!binds_a_gamepad(fichier, "[Wiimote1]"));
        assert!(binds_a_gamepad(fichier, "[Wiimote2]"));
    }

    #[test]
    fn pcsx2_garde_ses_autres_reglages() {
        let base = scratch("pcsx2");
        let inis = base.join("inis");
        std::fs::create_dir_all(&inis).expect("dossier");
        std::fs::write(
            inis.join("PCSX2.ini"),
            "[UI]\nTheme = dark\n\n[Pad1]\nType = DualShock2\nUp = Keyboard/Up\n\n[GS]\nRenderer = 12\n",
        )
        .expect("réglages");

        let ecrits = install_pcsx2(&inis);
        let texte = std::fs::read_to_string(inis.join("PCSX2.ini")).expect("relecture");
        let sauvegarde = inis.join("PCSX2.ini.avant-evachi").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(ecrits.len(), 1);
        assert!(texte.contains("Theme = dark"), "{texte}");
        assert!(texte.contains("Renderer = 12"), "les autres sections restent");
        assert!(texte.contains("SDL-0/FaceSouth"), "la manette est câblée");
        assert!(!texte.contains("Keyboard/Up"), "l'ancien lien disparaît");
        assert!(sauvegarde);
    }

    #[test]
    fn pcsx2_deja_configure_n_est_pas_touche() {
        let base = scratch("pcsx2-respect");
        let inis = base.join("inis");
        std::fs::create_dir_all(&inis).expect("dossier");
        let mien = "[Pad1]\nType = DualShock2\nCross = SDL-1/FaceSouth\n";
        std::fs::write(inis.join("PCSX2.ini"), mien).expect("réglages");

        let ecrits = install_pcsx2(&inis);
        let texte = std::fs::read_to_string(inis.join("PCSX2.ini")).expect("relecture");
        let _ = std::fs::remove_dir_all(&base);

        assert!(ecrits.is_empty());
        assert_eq!(texte, mien);
    }

    #[test]
    fn on_distingue_un_reglage_d_un_appareil() {
        // `Type = DualShock2` et `AxisScale = 1.33` sont des réglages, pas des
        // appareils : les prendre pour tels ferait croire la manette déjà
        // configurée, et on n'y toucherait jamais.
        assert!(!binds_a_pad_pcsx2(
            "[Pad1]\nType = DualShock2\nDeadzone = 0\nAxisScale = 1.33\nUp = Keyboard/Up\n"
        ));
        assert!(binds_a_pad_pcsx2("[Pad1]\nUp = SDL-0/DPadUp\n"));
        assert!(binds_a_pad_pcsx2("[Pad1]\nCross = XInput-0/A\n"));
    }

    #[test]
    fn une_section_absente_est_ajoutee_a_la_fin() {
        let sortie = replace_section("[UI]\nTheme = dark\n", "[Pad1]", "[Pad1]\nUp = SDL-0/DPadUp\n");
        assert!(sortie.contains("Theme = dark"));
        assert!(sortie.contains("[Pad1]"));
    }

    #[test]
    fn un_emulateur_qu_on_ne_sait_pas_configurer_ne_rend_rien() {
        let base = scratch("inconnu");
        let ecrits = ensure("Nintendo Switch", &base.join("Ryujinx.exe"), &base);
        let _ = std::fs::remove_dir_all(&base);

        assert!(ecrits.is_empty());
    }
}
