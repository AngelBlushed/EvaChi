//! Installation des émulateurs autonomes.
//!
//! Certaines consoles n'ont pas de cœur libretro : leur émulateur existe, mais
//! il vit comme un programme à part. Jusqu'ici EvaChi savait le reconnaître sur
//! le disque — encore fallait-il que l'utilisateur l'ait installé lui-même, ce
//! qui revenait à lui demander de faire la moitié du travail.
//!
//! Ici, EvaChi le télécharge : elle demande à la forge du projet quelle est sa
//! dernière version, prend l'archive prévue pour Windows, et la déballe dans son
//! propre dossier. Rien n'est redistribué avec EvaChi ; tout vient de l'endroit
//! où les auteurs publient.
//!
//! Un émulateur y échappe. Ryubing (Switch) est hébergé derrière un test
//! anti-robot : passer outre serait exactement ce qu'il interdit. Il reste donc
//! détecté sur le disque, jamais téléchargé — voir [`Standalone::site`].

use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Un émulateur autonome, et où le trouver.
pub struct Standalone {
    /// Console, du même nom que dans le tableau des émulateurs externes.
    pub system: &'static str,
    pub label: &'static str,
    /// Dépôt GitHub `propriétaire/nom`, vide si l'émulateur n'est pas
    /// téléchargeable et doit être installé à la main.
    pub repository: &'static str,
    /// Fragments que le nom de l'archive doit tous contenir.
    pub wants: &'static [&'static str],
    /// Fragments qui disqualifient une archive — versions de débogage, autres
    /// architectures.
    pub rejects: &'static [&'static str],
    /// Nom de l'exécutable à retrouver après le déballage.
    pub executable: &'static str,
    /// Fichier ou dossier à créer pour que l'émulateur range ses réglages chez
    /// lui plutôt que dans le profil de l'utilisateur. Vide s'il n'en a pas.
    pub portable: &'static str,
    pub license: &'static str,
    /// Page officielle, pour ceux qu'on ne peut pas télécharger.
    pub site: &'static str,
}

/// Les émulateurs autonomes qu'EvaChi sait installer ou reconnaître.
pub const STANDALONES: &[Standalone] = &[
    Standalone {
        system: "Wii U",
        label: "Cemu",
        repository: "cemu-project/Cemu",
        wants: &["windows", "x64", ".zip"],
        rejects: &["ubuntu", "macos"],
        executable: "Cemu.exe",
        // Cemu bascule en mode portable dès qu'un dossier `portable` existe à
        // côté de lui : tout reste alors dans le dossier d'EvaChi.
        portable: "portable/",
        license: "MPL-2.0",
        site: "https://cemu.info",
    },
    Standalone {
        system: "PlayStation 2",
        label: "PCSX2",
        repository: "PCSX2/pcsx2",
        wants: &["windows", "x64", "Qt.7z"],
        rejects: &["symbols"],
        executable: "pcsx2-qt.exe",
        portable: "portable.ini",
        license: "GPL-3.0",
        site: "https://pcsx2.net",
    },
    Standalone {
        system: "Xbox 360",
        label: "Xenia Canary",
        repository: "xenia-canary/xenia-canary",
        wants: &["windows", ".7z"],
        rejects: &[],
        executable: "xenia_canary.exe",
        portable: "",
        license: "BSD-3-Clause",
        site: "https://xenia.jp",
    },
    Standalone {
        system: "Xbox",
        label: "xemu",
        repository: "xemu-project/xemu",
        // Nom stable d'une version à l'autre, contrairement à celui qui porte
        // le numéro de version.
        wants: &["xemu-win-x86_64-release.zip"],
        rejects: &[],
        executable: "xemu.exe",
        portable: "",
        license: "GPL-2.0",
        site: "https://xemu.app",
    },
    Standalone {
        system: "PS Vita",
        label: "Vita3K",
        repository: "Vita3K/Vita3K",
        wants: &["windows-latest.zip"],
        rejects: &["arm64"],
        executable: "Vita3K.exe",
        portable: "",
        license: "GPL-2.0",
        site: "https://vita3k.org",
    },
    Standalone {
        system: "Nintendo Switch",
        label: "Ryubing",
        // Hébergé derrière un test anti-robot : à installer soi-même. EvaChi le
        // reconnaîtra ensuite toute seule, où qu'il soit sur les disques.
        repository: "",
        wants: &[],
        rejects: &[],
        executable: "Ryujinx.exe",
        portable: "",
        license: "MIT",
        site: "https://ryujinx.app",
    },
];

/// Un émulateur autonome tel que l'interface le voit.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StandaloneOffer {
    pub system: String,
    pub label: String,
    pub license: String,
    pub site: String,
    /// Vrai si EvaChi sait aller le chercher toute seule.
    pub downloadable: bool,
}

/// Ce qu'EvaChi propose d'installer, dans l'ordre du tableau.
pub fn catalogue() -> Vec<StandaloneOffer> {
    STANDALONES
        .iter()
        .map(|known| StandaloneOffer {
            system: known.system.to_owned(),
            label: known.label.to_owned(),
            license: known.license.to_owned(),
            site: known.site.to_owned(),
            downloadable: !known.repository.is_empty(),
        })
        .collect()
}

/// Ce que la forge répond quand on lui demande sa dernière version.
#[derive(Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

/// Choisit l'archive qui convient à cette machine parmi celles publiées.
///
/// Sorti de la fonction de téléchargement pour être vérifiable : c'est la seule
/// partie qui décide, et une erreur y donnerait un émulateur de débogage ou
/// compilé pour une autre architecture.
fn choose<'a>(names: &[&'a str], known: &Standalone) -> Option<&'a str> {
    names
        .iter()
        .find(|name| {
            let lower = name.to_lowercase();
            known
                .wants
                .iter()
                .all(|want| lower.contains(&want.to_lowercase()))
                && !known
                    .rejects
                    .iter()
                    .any(|reject| lower.contains(&reject.to_lowercase()))
        })
        .copied()
}

/// Taille au-delà de laquelle on refuse une archive.
const MAX_DOWNLOAD: u64 = 512 * 1024 * 1024;

/// Ce qu'une installation réussie laisse derrière elle.
pub struct Installed {
    pub executable: PathBuf,
    pub version: String,
}

/// Télécharge un émulateur autonome et l'installe sous `into`.
///
/// Le dossier de destination est remplacé : une installation à moitié écrite
/// par une tentative précédente ne doit pas se mélanger à la nouvelle.
pub fn install(known: &Standalone, into: &Path) -> Result<Installed, String> {
    if known.repository.is_empty() {
        return Err(format!(
            "{} ne se télécharge pas : à installer depuis {}",
            known.label, known.site
        ));
    }

    let answer = ureq::get(&format!(
        "https://api.github.com/repos/{}/releases/latest",
        known.repository
    ))
    .set("User-Agent", "EvaChi")
    .set("Accept", "application/vnd.github+json")
    .call()
    .map_err(|error| format!("{} : {error}", known.repository))?
    .into_string()
    .map_err(|error| format!("{} : réponse illisible ({error})", known.repository))?;

    let release: Release = serde_json::from_str(&answer)
        .map_err(|error| format!("{} : réponse inattendue ({error})", known.repository))?;

    let names: Vec<&str> = release.assets.iter().map(|a| a.name.as_str()).collect();
    let Some(chosen) = choose(&names, known) else {
        return Err(format!(
            "{} {} : aucune archive Windows parmi {}",
            known.label,
            release.tag_name,
            names.join(", ")
        ));
    };
    let asset = release
        .assets
        .iter()
        .find(|a| a.name == chosen)
        .expect("le nom vient de cette liste");

    let mut archive = Vec::new();
    ureq::get(&asset.browser_download_url)
        .set("User-Agent", "EvaChi")
        .call()
        .map_err(|error| format!("{} : {error}", asset.name))?
        .into_reader()
        .take(MAX_DOWNLOAD)
        .read_to_end(&mut archive)
        .map_err(|error| format!("{} : {error}", asset.name))?;

    // On déballe à côté, puis on échange : tant que le nouveau dossier n'est pas
    // complet, l'ancienne installation reste utilisable.
    let staging = into.with_extension("nouveau");
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|error| format!("{} : {error}", staging.display()))?;

    let outcome = if asset.name.to_lowercase().ends_with(".7z") {
        unpack_7z(archive, &staging)
    } else {
        unpack_zip(archive, &staging)
    };
    if let Err(error) = outcome {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(error);
    }

    let Some(found) = locate(&staging, known.executable) else {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(format!(
            "{} : {} introuvable dans l'archive",
            known.label, known.executable
        ));
    };

    // Réglages chez soi plutôt que dans le profil : c'est ce qui rend
    // l'ensemble transportable, et ce que ces émulateurs prévoient eux-mêmes.
    if !known.portable.is_empty() {
        let home = found.parent().unwrap_or(&staging);
        let marker = home.join(known.portable.trim_end_matches('/'));
        let _ = if known.portable.ends_with('/') {
            std::fs::create_dir_all(&marker)
        } else {
            std::fs::write(&marker, b"")
        };
    }

    let relative = found
        .strip_prefix(&staging)
        .map(Path::to_path_buf)
        .unwrap_or_else(|_| PathBuf::from(known.executable));

    let _ = std::fs::remove_dir_all(into);
    std::fs::rename(&staging, into).map_err(|error| {
        let _ = std::fs::remove_dir_all(&staging);
        format!("{} : {error}", into.display())
    })?;

    Ok(Installed {
        executable: into.join(relative),
        version: release.tag_name,
    })
}

/// Déballe une archive zip, en refusant les chemins qui sortent du dossier.
fn unpack_zip(bytes: Vec<u8>, into: &Path) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|error| format!("archive illisible : {error}"))?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("entrée {index} illisible : {error}"))?;

        // `enclosed_name` écarte les chemins absolus et les `..` : une archive
        // hostile ne doit pas pouvoir écrire ailleurs que chez elle.
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        let destination = into.join(relative);

        if entry.is_dir() {
            std::fs::create_dir_all(&destination)
                .map_err(|error| format!("{} : {error}", destination.display()))?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("{} : {error}", parent.display()))?;
        }

        let mut file = std::fs::File::create(&destination)
            .map_err(|error| format!("{} : {error}", destination.display()))?;
        std::io::copy(&mut entry, &mut file)
            .map_err(|error| format!("{} : {error}", destination.display()))?;
    }
    Ok(())
}

/// Déballe une archive 7z. PCSX2 et Xenia ne publient que dans ce format.
fn unpack_7z(bytes: Vec<u8>, into: &Path) -> Result<(), String> {
    let length = bytes.len() as u64;
    sevenz_rust::decompress(std::io::Cursor::new(bytes), into)
        .map_err(|error| format!("archive 7z illisible ({length} octets) : {error}"))
}

/// Cherche un exécutable par son nom sous un dossier fraîchement déballé.
fn locate(directory: &Path, name: &str) -> Option<PathBuf> {
    let mut queue = vec![directory.to_path_buf()];

    while let Some(current) = queue.pop() {
        let entries = std::fs::read_dir(&current).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                queue.push(path);
                continue;
            }
            if path
                .file_name()
                .and_then(|file| file.to_str())
                .is_some_and(|file| file.eq_ignore_ascii_case(name))
            {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn known(system: &str) -> &'static Standalone {
        STANDALONES
            .iter()
            .find(|entry| entry.system == system)
            .expect("système connu")
    }

    #[test]
    fn choisit_l_archive_windows_de_cemu() {
        // Les noms réellement publiés par le projet.
        let published = [
            "cemu-2.6-macos-12-x64.dmg",
            "cemu-2.6-ubuntu-22.04-x64.zip",
            "cemu-2.6-windows-x64.zip",
        ];

        assert_eq!(
            choose(&published, known("Wii U")),
            Some("cemu-2.6-windows-x64.zip")
        );
    }

    #[test]
    fn ecarte_les_archives_de_debogage_de_pcsx2() {
        // `-symbols.7z` précède l'archive utile dans la liste publiée : sans
        // règle de rejet, c'est lui qu'on installerait.
        let published = [
            "pcsx2-v2.8.2-linux-appimage-x64-Qt.AppImage",
            "pcsx2-v2.8.2-windows-x64-installer.exe",
            "pcsx2-v2.8.2-windows-x64-Qt-symbols.7z",
            "pcsx2-v2.8.2-windows-x64-Qt.7z",
        ];

        assert_eq!(
            choose(&published, known("PlayStation 2")),
            Some("pcsx2-v2.8.2-windows-x64-Qt.7z")
        );
    }

    #[test]
    fn ne_confond_pas_les_architectures_de_xemu() {
        let published = [
            "xemu-0.8.136-dbg-windows-x86_64.zip",
            "xemu-win-aarch64-release.zip",
            "xemu-win-x86_64-release.zip",
        ];

        assert_eq!(
            choose(&published, known("Xbox")),
            Some("xemu-win-x86_64-release.zip")
        );
    }

    #[test]
    fn ne_prend_pas_la_version_arm_de_vita3k() {
        let published = ["windows-arm64-latest.zip", "windows-latest.zip"];

        assert_eq!(
            choose(&published, known("PS Vita")),
            Some("windows-latest.zip")
        );
    }

    #[test]
    fn une_liste_sans_archive_utilisable_ne_choisit_rien() {
        let published = ["sources.tar.gz", "notes.txt"];

        assert_eq!(choose(&published, known("Wii U")), None);
    }

    #[test]
    fn ryubing_n_est_pas_telechargeable_et_le_dit() {
        let switch = known("Nintendo Switch");
        assert!(switch.repository.is_empty());

        let refusal = install(switch, Path::new("."))
            .err()
            .expect("un émulateur non téléchargeable doit refuser");
        assert!(
            refusal.contains(switch.site),
            "le refus doit indiquer où le prendre : {refusal}"
        );
    }

    #[test]
    fn chaque_emulateur_telechargeable_sait_ce_qu_il_cherche() {
        for known in STANDALONES.iter().filter(|e| !e.repository.is_empty()) {
            assert!(
                !known.wants.is_empty(),
                "{} ne dit pas quelle archive prendre",
                known.label
            );
            assert!(
                known.executable.to_lowercase().ends_with(".exe"),
                "{} : exécutable douteux",
                known.label
            );
            assert!(known.repository.contains('/'), "{} : dépôt douteux", known.label);
        }
    }

    #[test]
    fn tout_emulateur_propose_correspond_a_une_console_connue() {
        // Les deux tableaux se répondent : l'un dit où trouver le programme,
        // l'autre comment le lancer. Un nom qui diverge casserait le lien.
        for known in STANDALONES {
            assert!(
                crate::commands::external_preset_names().contains(&known.system),
                "{} n'a pas de préréglage de lancement",
                known.system
            );
        }
    }

    #[test]
    fn le_deballage_refuse_de_sortir_du_dossier() {
        // Une archive qui prétend écrire hors de sa destination doit être
        // ignorée, pas suivie.
        let base = std::env::temp_dir().join(format!("evachi-zip-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("dossier de test");

        let mut buffer = Vec::new();
        {
            let mut writer = zip::ZipWriter::new(std::io::Cursor::new(&mut buffer));
            let options: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default();
            use std::io::Write;
            writer.start_file("../evade.txt", options).expect("entrée");
            writer.write_all(b"non").expect("écriture");
            writer.start_file("bon.txt", options).expect("entrée");
            writer.write_all(b"oui").expect("écriture");
            writer.finish().expect("archive");
        }

        unpack_zip(buffer, &base).expect("déballage");
        let escaped = base.parent().map(|parent| parent.join("evade.txt"));

        let inside = base.join("bon.txt").exists();
        let outside = escaped.as_ref().is_some_and(|path| path.exists());
        let _ = std::fs::remove_dir_all(&base);

        assert!(inside, "le fichier légitime doit être écrit");
        assert!(!outside, "un chemin qui remonte ne doit rien écrire");
    }
}
