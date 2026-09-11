//! Ranger un fichier système à la place qui lui revient.
//!
//! Savoir qu'il manque `lynxboot.img` ne suffit pas : encore faut-il le poser
//! au bon endroit, sous le bon nom, et les endroits ne se ressemblent pas. Un
//! micrologiciel libretro va sous le dossier système, les clés de la Switch
//! dans le profil de Ryubing, celle de la Wii U à côté de `Cemu.exe`, les
//! fichiers de la Xbox dans le dossier de xemu — qui exige en plus qu'on les
//! lui déclare dans son fichier de réglages.
//!
//! Ce module reconnaît un fichier à son nom, parfois à sa taille, et s'occupe
//! du reste. Il accepte aussi une archive et y prend ce qu'il sait ranger, ce
//! qui permet de déverser un lot entier d'un seul geste.
//!
//! Rien n'est deviné : un fichier que personne ne réclame est laissé où il est,
//! et on le dit. Rien n'est promis non plus — le micrologiciel de la Switch
//! s'installe depuis Ryubing et nulle part ailleurs, et c'est ce qui est
//! répondu plutôt que de faire semblant.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// Ce qu'est devenu un fichier qu'on a tenté de ranger.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Placed {
    /// Nom du fichier tel qu'il se présentait.
    pub name: String,
    /// Console ou usage reconnu, vide si le fichier n'a pas été reconnu.
    pub system: String,
    /// Où il a été posé, vide s'il n'a pas bougé.
    pub destination: String,
    /// Vrai si le fichier a effectivement été rangé.
    pub placed: bool,
    /// Ce qui s'est passé, en une phrase lisible.
    pub note: String,
}

/// Les dossiers particuliers, hors du dossier système.
///
/// Chacun vaut `None` quand l'émulateur n'est pas installé : mieux vaut dire
/// qu'on ne sait pas où poser une clé que la poser dans le vide.
#[derive(Default)]
pub struct Targets {
    /// Dossier système des cœurs libretro.
    pub system: PathBuf,
    /// Dossier de Ryubing qui contient `prod.keys`.
    pub switch_data: Option<PathBuf>,
    /// Dossier de Cemu qui contient `keys.txt`.
    pub wiiu_home: Option<PathBuf>,
    /// Dossier de xemu.
    pub xbox_home: Option<PathBuf>,
    /// Dossier `sysdata` d'Azahar.
    pub threeds_sysdata: Option<PathBuf>,
}

/// Où va un fichier reconnu.
struct Landing {
    system: String,
    /// Emplacements à remplir ; le premier est celui qu'on affiche.
    paths: Vec<PathBuf>,
}

/// Les fichiers propres aux émulateurs autonomes, reconnus à leur nom.
const STANDALONE: &[(&str, &str)] = &[
    ("prod.keys", "Nintendo Switch"),
    ("title.keys", "Nintendo Switch"),
    ("keys.txt", "Wii U"),
    ("mcpx_1.0.bin", "Xbox"),
    ("mcpx_1.1.bin", "Xbox"),
    ("eeprom.bin", "Xbox"),
    ("boot9.bin", "Nintendo 3DS"),
    ("secret_sector.bin", "Nintendo 3DS"),
];

/// Taille exacte de la mémoire flash de la Xbox.
///
/// Ce fichier ne porte pas de nom convenu — les uns l'appellent `flash.bin`,
/// les autres du nom de leur version. Sa taille, elle, ne varie pas.
const XBOX_FLASH: u64 = 1024 * 1024;

/// Vrai si le nom ressemble à un ensemble arcade.
///
/// Ces archives portent le code du jeu, jamais son titre : `mslug.zip`,
/// `pbobblen.zip`, `neogeo.zip`. Une archive nommée « Double Dragon.zip » n'en
/// est pas un, et la ranger comme tel ne ferait qu'égarer l'utilisateur.
fn looks_like_romset(stem: &str) -> bool {
    !stem.is_empty()
        && stem.len() <= 12
        && stem
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

/// Extensions qu'aucune puce de borne d'arcade ne porte.
///
/// Le nom seul ne suffit pas à reconnaître un ensemble arcade : `photos.zip`
/// en a exactement la forme. Ce que l'archive contient tranche — un ensemble
/// est un tas de puces, pas un dossier de documents.
const NOT_A_CHIP: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "bmp", "webp", "txt", "md", "pdf", "doc", "docx", "odt", "mp3",
    "wav", "ogg", "mp4", "avi", "mkv", "exe", "dll", "zip", "7z", "rar", "iso", "chd", "cue",
    "html", "json", "xml",
];

/// Vrai si une archive porte le micrologiciel de la Neo Geo.
///
/// FBNeo ne le cherche que sous le nom `neogeo.zip`, et les archives qui
/// circulent s'appellent tout autrement — `NeoGeo_Bios.zip`, `neogeo bios.zip`.
/// Leur contenu, lui, ne trompe pas : la puce de caractères et celle du son
/// s'y trouvent toujours, sous un nom ou un autre.
fn is_neogeo_bios(names: &[String]) -> bool {
    let holds = |needle: &str| names.iter().any(|name| name.contains(needle));
    holds("sfix") && holds("sm1")
}

/// Vrai si le contenu d'une archive ressemble à un ensemble arcade.
///
/// Un ensemble est plat — les puces sont côte à côte, sans sous-dossier — et
/// rien dedans ne se lit ni ne s'écoute.
fn contents_look_like_romset(names: &[String], flat: bool) -> bool {
    flat
        && !names.is_empty()
        && !names.iter().any(|name| {
            name.rsplit_once('.')
                .is_some_and(|(_, extension)| NOT_A_CHIP.contains(&extension))
        })
}

/// Vrai si le tableau des fichiers système nomme ce fichier.
fn named_in_table(name: &str) -> bool {
    let lower = name.to_lowercase();
    crate::bios::destinations()
        .iter()
        .any(|(basename, _, _)| basename.to_lowercase() == lower)
}

/// Décide où va un fichier, d'après son nom et, faute de nom parlant, sa taille.
fn landing(name: &str, size: Option<u64>, targets: &Targets) -> Option<Landing> {
    let lower = name.to_lowercase();

    // Les micrologiciels annoncés par le tableau des fichiers système.
    for (basename, relative, system) in crate::bios::destinations() {
        if lower != basename.to_lowercase() {
            continue;
        }
        let mut paths = vec![targets
            .system
            .join(relative.replace('/', std::path::MAIN_SEPARATOR_STR))];
        // Les clés du 3DS servent aussi bien au cœur qu'à l'émulateur autonome,
        // qui ne partagent pas leur dossier. Les deux les réclament.
        if lower == "aes_keys.txt" {
            paths.extend(targets.threeds_sysdata.iter().map(|dir| dir.join(&lower)));
        }
        return Some(Landing {
            system: system.to_owned(),
            paths,
        });
    }

    // Les fichiers des émulateurs autonomes, chacun chez lui.
    for (basename, system) in STANDALONE {
        if lower != *basename {
            continue;
        }
        let home = match *system {
            "Nintendo Switch" => targets.switch_data.as_ref(),
            "Wii U" => targets.wiiu_home.as_ref(),
            "Nintendo 3DS" => targets.threeds_sysdata.as_ref(),
            _ => targets.xbox_home.as_ref(),
        };
        return home.map(|dir| Landing {
            system: (*system).to_owned(),
            paths: vec![dir.join(basename)],
        });
    }

    // Le disque dur virtuel de la Xbox, dont le nom varie.
    if lower.ends_with(".qcow2") {
        return targets.xbox_home.as_ref().map(|dir| Landing {
            system: "Xbox".to_owned(),
            paths: vec![dir.join(name)],
        });
    }

    // Sa mémoire flash, reconnue à sa taille faute de nom convenu.
    if lower.ends_with(".bin") && size == Some(XBOX_FLASH) {
        return targets.xbox_home.as_ref().map(|dir| Landing {
            system: "Xbox".to_owned(),
            paths: vec![dir.join(name)],
        });
    }

    // Un ensemble arcade, reconnu à la forme de son nom.
    if let Some(stem) = lower.strip_suffix(".zip") {
        if looks_like_romset(stem) {
            return Some(Landing {
                system: "Arcade".to_owned(),
                paths: vec![targets.system.join("fbneo").join(&lower)],
            });
        }
    }

    None
}

/// Écrit un contenu à sa place, en créant les dossiers manquants.
fn write_at(destination: &Path, contents: &[u8]) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{} : {e}", parent.display()))?;
    }
    std::fs::write(destination, contents).map_err(|e| format!("{} : {e}", destination.display()))
}

/// Recopie un fichier à chacune de ses places.
fn install(source: &Path, landing: &Landing) -> Result<(), String> {
    for destination in &landing.paths {
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("{} : {e}", parent.display()))?;
        }
        std::fs::copy(source, destination)
            .map_err(|e| format!("{} : {e}", destination.display()))?;
    }
    Ok(())
}

/// Rend compte d'un fichier posé, en nommant les places supplémentaires.
fn success(name: String, landing: &Landing, origin: Option<&str>) -> Placed {
    let note = match (origin, landing.paths.len()) {
        (None, 1) => "rangé".to_owned(),
        (None, n) => format!("rangé à {n} endroits"),
        (Some(archive), 1) => format!("extrait de {archive}"),
        (Some(archive), n) => format!("extrait de {archive}, rangé à {n} endroits"),
    };
    Placed {
        name,
        system: landing.system.clone(),
        destination: landing.paths[0].to_string_lossy().into_owned(),
        placed: true,
        note,
    }
}

/// Range un fichier, ou le contenu reconnaissable d'une archive.
pub fn adopt(source: &Path, targets: &Targets) -> Vec<Placed> {
    let name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_owned();
    let size = std::fs::metadata(source).ok().map(|meta| meta.len());

    // Une archive que le tableau nomme — `neogeo.zip` — se range telle quelle ;
    // c'est son contenu que le cœur ira lire. Les autres, on les ouvre pour
    // voir ce qu'elles portent, quitte à conclure ensuite que c'était un
    // ensemble arcade : leur nom seul ne le dit pas assez sûrement.
    if name.to_lowercase().ends_with(".zip") && !named_in_table(&name) {
        return adopt_archive(source, &name, targets);
    }

    let results = match landing(&name, size, targets) {
        Some(landing) => match install(source, &landing) {
            Ok(()) => vec![success(name, &landing, None)],
            Err(error) => vec![Placed {
                name,
                system: landing.system,
                destination: String::new(),
                placed: false,
                note: error,
            }],
        },
        None => vec![Placed {
            name,
            system: String::new(),
            destination: String::new(),
            placed: false,
            note: "aucun cœur ni émulateur ne réclame ce fichier".into(),
        }],
    };

    finish(results, targets)
}

/// Le sous-arbre du dossier système où va une entrée d'archive, s'il y en a un.
///
/// blueMSX ne cherche pas des fichiers mais deux arborescences, `Machines` et
/// `Databases`, qu'il veut à la racine du dossier système. Leurs fichiers
/// portent des noms qu'aucun tableau ne saurait énumérer : c'est le dossier qui
/// les désigne, pas eux.
fn tree_member(relative: &Path) -> Option<PathBuf> {
    let mut components = relative.components();
    let root = components.find(|component| {
        let name = component.as_os_str().to_string_lossy().to_lowercase();
        name == "machines" || name == "databases"
    })?;

    let mut kept = PathBuf::from(root.as_os_str());
    kept.extend(components);
    Some(kept)
}

/// Prend dans une archive tout ce qu'on sait ranger.
fn adopt_archive(source: &Path, archive_name: &str, targets: &Targets) -> Vec<Placed> {
    let ouvert = std::fs::File::open(source)
        .map_err(|e| e.to_string())
        .and_then(|file| zip::ZipArchive::new(file).map_err(|e| e.to_string()));

    let mut archive = match ouvert {
        Ok(archive) => archive,
        Err(error) => {
            return vec![Placed {
                name: archive_name.to_owned(),
                system: String::new(),
                destination: String::new(),
                placed: false,
                note: format!("archive illisible : {error}"),
            }]
        }
    };

    let mut results = Vec::new();
    let mut trees = 0usize;
    let mut ncas = 0usize;
    let mut members: Vec<String> = Vec::new();
    let mut flat = true;

    for index in 0..archive.len() {
        let Ok(mut entry) = archive.by_index(index) else {
            continue;
        };
        if entry.is_dir() {
            continue;
        }
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        let Some(entry_name) = relative
            .file_name()
            .and_then(|n| n.to_str())
            .map(str::to_owned)
        else {
            continue;
        };
        if entry_name.to_lowercase().ends_with(".nca") {
            ncas += 1;
        }
        flat = flat && relative.components().count() == 1;
        members.push(entry_name.to_lowercase());

        let placement = match tree_member(&relative) {
            Some(kept) => Some(Landing {
                system: MSX_TREE.to_owned(),
                paths: vec![targets.system.join(kept)],
            }),
            None => landing(&entry_name, Some(entry.size()), targets),
        };
        let Some(placement) = placement else { continue };

        let mut contents = Vec::new();
        use std::io::Read;
        if let Err(error) = entry.read_to_end(&mut contents) {
            results.push(Placed {
                name: entry_name,
                system: placement.system,
                destination: String::new(),
                placed: false,
                note: error.to_string(),
            });
            continue;
        }

        let outcome = placement
            .paths
            .iter()
            .try_for_each(|destination| write_at(destination, &contents));

        // Une arborescence de plusieurs centaines de fichiers ne se raconte pas
        // ligne à ligne : on la compte, et on en rend une seule.
        if placement.system == MSX_TREE && outcome.is_ok() {
            trees += 1;
            continue;
        }

        results.push(match outcome {
            Ok(()) => success(entry_name, &placement, Some(archive_name)),
            Err(error) => Placed {
                name: entry_name,
                system: placement.system,
                destination: String::new(),
                placed: false,
                note: error,
            },
        });
    }

    if trees > 0 {
        results.push(Placed {
            name: "Machines / Databases".into(),
            system: MSX_TREE.into(),
            destination: targets.system.to_string_lossy().into_owned(),
            placed: true,
            note: format!("{trees} fichiers extraits de {archive_name}"),
        });
    }

    if results.is_empty() {
        results.push(unopened(source, archive_name, targets, ncas, &members, flat));
    }

    finish(results, targets)
}

/// Que faire d'une archive dont rien n'a été reconnu.
///
/// Trois issues : c'est un ensemble arcade, qui se range entier ; c'est un
/// micrologiciel de Switch, qu'on ne sait pas installer et qu'on ne fait pas
/// semblant d'installer ; ou on ne sait pas, et on le dit.
fn unopened(
    source: &Path,
    archive_name: &str,
    targets: &Targets,
    ncas: usize,
    members: &[String],
    flat: bool,
) -> Placed {
    let stem = archive_name
        .to_lowercase()
        .strip_suffix(".zip")
        .unwrap_or_default()
        .to_owned();

    if is_neogeo_bios(members) {
        let destination = targets.system.join("fbneo").join("neogeo.zip");
        // Rebaptiser une archive est une supposition, si bien fondée soit-elle.
        // Une supposition ne chasse pas un fichier déjà en place : celui-là,
        // quelqu'un l'a mis là exprès, et il marche peut-être.
        if destination.exists() {
            return Placed {
                name: archive_name.to_owned(),
                system: "Neo Geo".into(),
                destination: destination.to_string_lossy().into_owned(),
                placed: false,
                note: "neogeo.zip est déjà en place ; renommez cette archive vous-même pour le remplacer".into(),
            };
        }
        let landing = Landing {
            system: "Neo Geo".to_owned(),
            paths: vec![destination],
        };
        return match install(source, &landing) {
            Ok(()) => success(archive_name.to_owned(), &landing, None),
            Err(error) => Placed {
                name: archive_name.to_owned(),
                system: landing.system,
                destination: String::new(),
                placed: false,
                note: error,
            },
        };
    }

    if looks_like_romset(&stem) && contents_look_like_romset(members, flat) {
        let landing = Landing {
            system: "Arcade".to_owned(),
            paths: vec![targets.system.join("fbneo").join(format!("{stem}.zip"))],
        };
        return match install(source, &landing) {
            Ok(()) => success(archive_name.to_owned(), &landing, None),
            Err(error) => Placed {
                name: archive_name.to_owned(),
                system: landing.system,
                destination: String::new(),
                placed: false,
                note: error,
            },
        };
    }

    // Un micrologiciel de Switch se reconnaît à ce qu'il porte, mais ne
    // s'installe que depuis Ryubing : le dire vaut mieux que le copier quelque
    // part où il ne servirait à rien.
    let firmware = ncas >= 4;
    Placed {
        name: archive_name.to_owned(),
        system: if firmware { "Nintendo Switch" } else { "" }.into(),
        destination: String::new(),
        placed: false,
        note: if firmware {
            "micrologiciel Switch : à installer depuis Ryubing, Outils → Installer le firmware"
        } else {
            "aucun fichier reconnu dans cette archive"
        }
        .into(),
    }
}

/// Nom d'usage des deux arborescences de blueMSX, qui vont ensemble.
const MSX_TREE: &str = "MSX / ColecoVision";

/// Dernier geste : déclarer à xemu ce qu'on vient de poser chez lui.
///
/// xemu ne cherche aucun de ses fichiers tout seul ; il lit les chemins dans
/// son propre fichier de réglages. Poser la mémoire flash sans l'y écrire
/// reviendrait à ne rien faire.
fn finish(results: Vec<Placed>, targets: &Targets) -> Vec<Placed> {
    let touched = results
        .iter()
        .any(|placed| placed.placed && placed.system == "Xbox");
    if touched {
        if let Some(home) = &targets.xbox_home {
            let _ = declare_to_xemu(home);
        }
    }
    results
}

/// Les quatre chemins que xemu attend, tels qu'ils sont écrits dans son TOML.
const XEMU_KEYS: [&str; 4] = ["bootrom_path", "flashrom_path", "eeprom_path", "hdd_path"];

/// Réécrit la section `[sys.files]` de `xemu.toml` d'après ce qui est présent.
///
/// Ne touche à rien d'autre : les réglages d'affichage, de manette et de son
/// appartiennent à l'utilisateur.
pub fn declare_to_xemu(home: &Path) -> Result<(), String> {
    let mut found: [Option<PathBuf>; 4] = [None, None, None, None];

    let entries = std::fs::read_dir(home).map_err(|e| format!("{} : {e}", home.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_lowercase();
        let size = entry.metadata().map(|meta| meta.len()).unwrap_or(0);

        if name.starts_with("mcpx") && name.ends_with(".bin") {
            found[0] = Some(path);
        } else if name == "eeprom.bin" {
            found[2] = Some(path);
        } else if name.ends_with(".qcow2") {
            found[3] = Some(path);
        } else if name.ends_with(".bin") && size == XBOX_FLASH {
            found[1] = Some(path);
        }
    }

    let declared: Vec<String> = XEMU_KEYS
        .iter()
        .zip(found.iter())
        .filter_map(|(key, path)| {
            let path = path.as_ref()?;
            // Chemin en barres obliques : xemu les accepte, et une chaîne TOML
            // ordinaire n'a alors plus rien à échapper.
            let text = path.to_string_lossy().replace('\\', "/").replace('"', "");
            Some(format!("{key} = \"{text}\""))
        })
        .collect();
    if declared.is_empty() {
        return Ok(());
    }

    let config = home.join("xemu.toml");
    let existing = std::fs::read_to_string(&config).unwrap_or_default();
    let mut lines: Vec<String> = existing
        .lines()
        .filter(|line| {
            let trimmed = line.trim_start();
            !XEMU_KEYS.iter().any(|key| {
                trimmed
                    .strip_prefix(key)
                    .is_some_and(|rest| rest.trim_start().starts_with('='))
            })
        })
        .map(str::to_owned)
        .collect();

    // La section existante reste où elle est : la déplacer emporterait avec
    // elle les réglages voisins, qui appartiennent à l'utilisateur.
    match lines.iter().position(|line| line.trim() == "[sys.files]") {
        Some(index) => {
            for (offset, line) in declared.into_iter().enumerate() {
                lines.insert(index + 1 + offset, line);
            }
        }
        None => {
            lines.push(String::new());
            lines.push("[sys.files]".into());
            lines.extend(declared);
        }
    }

    let mut text = lines.join("\n");
    text.push('\n');
    std::fs::write(&config, text).map_err(|e| format!("{} : {e}", config.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);

        let base = std::env::temp_dir().join(format!(
            "evachi-rangement-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("répertoire temporaire");
        base
    }

    fn targets(base: &Path) -> Targets {
        Targets {
            system: base.join("system"),
            switch_data: Some(base.join("ryubing")),
            wiiu_home: Some(base.join("cemu")),
            xbox_home: Some(base.join("xemu")),
            threeds_sysdata: Some(base.join("azahar")),
        }
    }

    fn depose(base: &Path, nom: &str, taille: usize) -> PathBuf {
        let chemin = base.join(nom);
        std::fs::write(&chemin, vec![7u8; taille]).expect("fichier de test");
        chemin
    }

    fn archive(base: &Path, nom: &str, entrees: &[&str]) -> PathBuf {
        use std::io::Write;
        let chemin = base.join(nom);
        let fichier = std::fs::File::create(&chemin).expect("archive");
        let mut writer = zip::ZipWriter::new(fichier);
        let options = zip::write::SimpleFileOptions::default();
        for entree in entrees {
            writer.start_file(*entree, options).expect("entrée");
            writer.write_all(b"contenu").expect("écriture");
        }
        writer.finish().expect("archive close");
        chemin
    }

    #[test]
    fn un_micrologiciel_connu_va_sous_le_dossier_systeme() {
        let base = scratch();
        let source = depose(&base, "lynxboot.img", 512);

        let faits = adopt(&source, &targets(&base));
        let pose = base.join("system").join("lynxboot.img").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(faits.len(), 1);
        assert!(faits[0].placed, "{}", faits[0].note);
        assert_eq!(faits[0].system, "Atari Lynx");
        assert!(pose);
    }

    #[test]
    fn un_chemin_a_sous_dossier_est_respecte() {
        // `np2kai/bios.rom` ne se range pas à la racine du dossier système.
        let base = scratch();
        let source = depose(&base, "bios.rom", 16);

        adopt(&source, &targets(&base));
        let pose = base.join("system").join("np2kai").join("bios.rom").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert!(pose);
    }

    #[test]
    fn les_cles_de_la_switch_vont_chez_ryubing() {
        let base = scratch();
        let source = depose(&base, "prod.keys", 32);

        let faits = adopt(&source, &targets(&base));
        let pose = base.join("ryubing").join("prod.keys").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(faits[0].system, "Nintendo Switch");
        assert!(pose);
    }

    #[test]
    fn la_cle_de_la_wii_u_va_chez_cemu() {
        let base = scratch();
        let source = depose(&base, "keys.txt", 32);

        let faits = adopt(&source, &targets(&base));
        let pose = base.join("cemu").join("keys.txt").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(faits[0].system, "Wii U");
        assert!(pose);
    }

    #[test]
    fn les_cles_du_3ds_servent_au_coeur_et_a_l_emulateur() {
        let base = scratch();
        let source = depose(&base, "aes_keys.txt", 64);

        let faits = adopt(&source, &targets(&base));
        let coeur = base
            .join("system")
            .join("azahar")
            .join("sysdata")
            .join("aes_keys.txt")
            .exists();
        let autonome = base.join("azahar").join("aes_keys.txt").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert!(faits[0].placed, "{}", faits[0].note);
        assert!(coeur && autonome, "les deux en ont besoin");
    }

    #[test]
    fn le_disque_virtuel_de_la_xbox_est_reconnu_a_son_extension() {
        let base = scratch();
        let source = depose(&base, "xbox_hdd.qcow2", 64);

        let faits = adopt(&source, &targets(&base));
        let pose = base.join("xemu").join("xbox_hdd.qcow2").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(faits[0].system, "Xbox");
        assert!(pose);
    }

    #[test]
    fn la_flash_de_la_xbox_est_reconnue_a_sa_taille() {
        // Ce fichier n'a pas de nom convenu : « Complex_4627.bin » chez l'un,
        // « flash.bin » chez l'autre. Seul son mégaoctet exact le désigne.
        let base = scratch();
        let source = depose(&base, "Complex_4627.bin", XBOX_FLASH as usize);

        let faits = adopt(&source, &targets(&base));
        let pose = base.join("xemu").join("Complex_4627.bin").exists();
        let toml = std::fs::read_to_string(base.join("xemu").join("xemu.toml")).unwrap_or_default();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(faits[0].system, "Xbox");
        assert!(pose);
        assert!(toml.contains("flashrom_path"), "xemu doit l'apprendre");
    }

    #[test]
    fn un_bin_ordinaire_n_est_pas_pris_pour_la_flash() {
        let base = scratch();
        let source = depose(&base, "sauvegarde.bin", 2048);

        let faits = adopt(&source, &targets(&base));
        let _ = std::fs::remove_dir_all(&base);

        assert!(!faits[0].placed);
    }

    #[test]
    fn un_ensemble_arcade_va_dans_le_dossier_du_coeur() {
        let base = scratch();
        let source = archive(
            &base,
            "pbobblen.zip",
            &["pbn-ic1.bin", "pbn-ic2.c1", "pbn-ic3.v1"],
        );

        let faits = adopt(&source, &targets(&base));
        let pose = base
            .join("system")
            .join("fbneo")
            .join("pbobblen.zip")
            .exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(faits[0].system, "Arcade");
        assert!(pose);
    }

    #[test]
    fn un_titre_en_toutes_lettres_n_est_pas_un_ensemble_arcade() {
        // « Double Dragon.zip » est le piège : c'est une archive, mais pas un
        // ensemble arcade. La ranger comme tel ne ferait qu'égarer.
        assert!(looks_like_romset("pbobblen"));
        assert!(looks_like_romset("neogeo"));
        assert!(looks_like_romset("mslug3"));
        assert!(!looks_like_romset("double dragon"));
        assert!(!looks_like_romset("final fantasy ix (europe)"));
        assert!(!looks_like_romset(""));
    }

    #[test]
    fn un_fichier_inconnu_n_est_pas_deplace() {
        let base = scratch();
        let source = depose(&base, "mes-notes.txt", 8);

        let faits = adopt(&source, &targets(&base));
        let intact = source.exists();
        let _ = std::fs::remove_dir_all(&base);

        assert!(!faits[0].placed);
        assert!(faits[0].note.contains("aucun cœur"));
        assert!(intact, "un fichier non reconnu reste où il est");
    }

    #[test]
    fn une_archive_livre_ce_qu_elle_contient_de_connu() {
        let base = scratch();
        let chemin = archive(
            &base,
            "lot-de-bios.zip",
            &["lynxboot.img", "bios/exec.bin", "notes.txt"],
        );

        let faits = adopt(&chemin, &targets(&base));
        let lynx = base.join("system").join("lynxboot.img").exists();
        let exec = base.join("system").join("exec.bin").exists();
        let notes = base.join("system").join("notes.txt").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(faits.len(), 2, "seuls les fichiers connus sont rangés");
        assert!(lynx && exec, "y compris au fond d'un sous-dossier");
        assert!(!notes, "le reste de l'archive est ignoré");
    }

    #[test]
    fn une_archive_bluemsx_livre_ses_deux_arborescences() {
        let base = scratch();
        let chemin = archive(
            &base,
            "bluemsx.zip",
            &[
                "Machines/MSX2/config.ini",
                "Machines/MSX2/msx2.rom",
                "Databases/msxromdb.xml",
                "lisez-moi.txt",
            ],
        );

        let faits = adopt(&chemin, &targets(&base));
        let config = base
            .join("system")
            .join("Machines")
            .join("MSX2")
            .join("config.ini")
            .exists();
        let base_de_donnees = base
            .join("system")
            .join("Databases")
            .join("msxromdb.xml")
            .exists();
        let _ = std::fs::remove_dir_all(&base);

        assert!(config && base_de_donnees, "l'arborescence est reconstituée");
        assert_eq!(faits.len(), 1, "une ligne pour tout l'ensemble");
        assert!(faits[0].note.starts_with('3'));
    }

    #[test]
    fn le_micrologiciel_neo_geo_est_rebaptise_pour_fbneo() {
        // FBNeo ne le cherche que sous `neogeo.zip` ; l'archive, elle,
        // s'appelle comme celui qui l'a mise en ligne.
        let base = scratch();
        let chemin = archive(
            &base,
            "NeoGeo_Bios.zip",
            &["ng-lo.rom", "neo-geo.rom", "ng-sfix.rom", "ng-sm1.rom"],
        );

        let faits = adopt(&chemin, &targets(&base));
        let pose = base.join("system").join("fbneo").join("neogeo.zip").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert!(faits[0].placed, "{}", faits[0].note);
        assert_eq!(faits[0].system, "Neo Geo");
        assert!(pose);
    }

    #[test]
    fn un_neogeo_zip_deja_en_place_n_est_pas_remplace() {
        // Le sien est complet ; celui qu'on devine ne l'est peut-être pas.
        // Deviner un nom ne donne pas le droit d'écraser.
        let base = scratch();
        let en_place = base.join("system").join("fbneo").join("neogeo.zip");
        std::fs::create_dir_all(en_place.parent().expect("dossier")).expect("dossier");
        std::fs::write(&en_place, b"l'ensemble complet").expect("ensemble");

        let chemin = archive(&base, "NeoGeo_Bios.zip", &["ng-sfix.rom", "ng-sm1.rom"]);
        let faits = adopt(&chemin, &targets(&base));
        let intact = std::fs::read(&en_place).expect("relecture") == b"l'ensemble complet";
        let _ = std::fs::remove_dir_all(&base);

        assert!(!faits[0].placed);
        assert!(intact, "l'ensemble en place survit");
        assert!(faits[0].note.contains("déjà en place"));
    }

    #[test]
    fn une_archive_sans_rien_de_connu_le_dit() {
        // « photos » a la forme d'un nom d'ensemble arcade : court, en
        // minuscules. C'est son contenu qui le dément.
        let base = scratch();
        let chemin = archive(&base, "photos.zip", &["vacances.jpg"]);

        let faits = adopt(&chemin, &targets(&base));
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(faits.len(), 1);
        assert!(!faits[0].placed);
        assert!(faits[0].note.contains("aucun fichier reconnu"));
    }

    #[test]
    fn un_micrologiciel_de_switch_est_reconnu_mais_pas_range() {
        // Ryubing seul sait l'installer. Le copier quelque part donnerait
        // l'illusion d'avoir fait quelque chose.
        let base = scratch();
        let chemin = archive(
            &base,
            "Firmware 18.1.0.zip",
            &["0100.nca", "0101.nca", "0102.nca", "0103.nca", "0104.nca"],
        );

        let faits = adopt(&chemin, &targets(&base));
        let _ = std::fs::remove_dir_all(&base);

        assert!(!faits[0].placed);
        assert_eq!(faits[0].system, "Nintendo Switch");
        assert!(faits[0].note.contains("Ryubing"));
    }

    #[test]
    fn un_emulateur_absent_ne_fait_pas_ranger_ses_cles_n_importe_ou() {
        let base = scratch();
        let source = depose(&base, "prod.keys", 32);
        let sans_switch = Targets {
            system: base.join("system"),
            ..Targets::default()
        };

        let faits = adopt(&source, &sans_switch);
        let _ = std::fs::remove_dir_all(&base);

        assert!(!faits[0].placed);
    }

    #[test]
    fn les_reglages_voisins_de_xemu_survivent() {
        let base = scratch();
        let home = base.join("xemu");
        std::fs::create_dir_all(&home).expect("dossier");
        std::fs::write(home.join("mcpx_1.0.bin"), vec![0u8; 512]).expect("amorce");
        std::fs::write(
            home.join("xemu.toml"),
            "[general]\nshow_welcome = false\n\n[sys.files]\nbootrom_path = 'ancien'\n",
        )
        .expect("réglages");

        declare_to_xemu(&home).expect("déclaration");
        let texte = std::fs::read_to_string(home.join("xemu.toml")).expect("relecture");
        let _ = std::fs::remove_dir_all(&base);

        assert!(texte.contains("show_welcome = false"), "{texte}");
        assert!(!texte.contains("ancien"), "l'ancien chemin est remplacé");
        assert_eq!(texte.matches("bootrom_path").count(), 1);
        assert!(texte.contains("mcpx_1.0.bin"));
    }
}
