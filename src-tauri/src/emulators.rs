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
    /// Flux de versions propre au projet, pour ceux qui ne publient pas leurs
    /// binaires sur GitHub.
    ///
    /// Dolphin est de ceux-là : son dépôt n'attache aucun fichier à ses
    /// versions, tout passe par sa propre forge. Le flux rend la même chose
    /// sous un autre nom — une version, et une liste de fichiers étiquetés par
    /// système. `wants` s'applique alors à l'étiquette, pas au nom de fichier.
    pub feed: &'static str,
}

impl Standalone {
    /// Vrai si EvaChi sait aller le chercher toute seule.
    ///
    /// Deux forges valent mieux qu'une condition recopiée à trois endroits :
    /// la question se pose dans l'interface, dans l'installation en ligne de
    /// commande et dans les épreuves, et une seule d'entre elles oubliée
    /// suffisait à rendre Dolphin introuvable.
    pub fn downloadable(&self) -> bool {
        !self.repository.is_empty() || !self.feed.is_empty()
    }
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
        feed: "",
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
        feed: "",
    },
    // Le cœur libretro existe, mais il fait tomber l'application : il dessine
    // par le processeur graphique, et notre intégration de ce rendu n'est pas
    // au point. PPSSPP d'origine tourne sans faute.
    Standalone {
        system: "PSP",
        label: "PPSSPP",
        repository: "hrydgard/ppsspp",
        wants: &["windows", "x64", ".zip"],
        rejects: &["arm64"],
        executable: "PPSSPPWindows64.exe",
        portable: "",
        license: "GPL-2.0-or-later",
        site: "https://www.ppsspp.org",
        feed: "",
    },
    // Le dépôt GitHub de Dolphin n'attache aucun fichier à ses versions : tout
    // passe par sa propre forge, qui publie un flux. L'étiquette « Windows
    // x64 » y désigne l'archive, et non son nom de fichier.
    Standalone {
        system: "GameCube · Wii",
        label: "Dolphin",
        repository: "",
        wants: &["windows x64"],
        rejects: &[],
        executable: "Dolphin.exe",
        portable: "",
        license: "GPL-2.0-or-later",
        site: "https://dolphin-emu.org",
        feed: "https://dolphin-emu.org/update/latest/beta",
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
        feed: "",
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
        feed: "",
    },
    Standalone {
        system: "Nintendo 3DS",
        label: "Azahar",
        repository: "azahar-emu/azahar",
        // Le projet publie sept archives Windows : trois chaînes de
        // compilation, chacune en archive et en installeur, plus un cœur
        // libretro. C'est la version MSVC en archive qu'on veut.
        wants: &["windows", "msvc", ".zip"],
        rejects: &["installer", "libretro"],
        executable: "azahar.exe",
        portable: "user/",
        license: "GPL-3.0",
        site: "https://azahar-emu.org",
        feed: "",
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
        feed: "",
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
        feed: "",
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
            downloadable: known.downloadable(),
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

/// Ce que rend le flux d'un projet qui publie chez lui.
#[derive(Deserialize)]
struct Feed {
    shortrev: String,
    artifacts: Vec<Artifact>,
}

#[derive(Deserialize)]
struct Artifact {
    /// Étiquette du système, par exemple « Windows x64 ».
    system: String,
    url: String,
}

/// Une archive retenue : d'où la prendre, et sous quelle version.
struct Pick {
    version: String,
    url: String,
    name: String,
}

/// Demande au flux du projet quelle archive prendre.
fn from_feed(known: &Standalone) -> Result<Pick, String> {
    let answer = ureq::get(known.feed)
        .set("User-Agent", "EvaChi")
        .call()
        .map_err(|error| format!("{} : {error}", known.label))?
        .into_string()
        .map_err(|error| format!("{} : réponse illisible ({error})", known.label))?;

    let feed: Feed = serde_json::from_str(&answer)
        .map_err(|error| format!("{} : réponse inattendue ({error})", known.label))?;

    let labels: Vec<&str> = feed.artifacts.iter().map(|a| a.system.as_str()).collect();
    let Some(chosen) = choose(&labels, known) else {
        return Err(format!(
            "{} {} : aucune archive Windows parmi {}",
            known.label,
            feed.shortrev,
            labels.join(", ")
        ));
    };
    let artifact = feed
        .artifacts
        .iter()
        .find(|a| a.system == chosen)
        .expect("l'étiquette vient de cette liste");

    Ok(Pick {
        version: feed.shortrev.clone(),
        url: artifact.url.clone(),
        // Le nom de fichier sert au message d'erreur et à reconnaître le format
        // de l'archive : il se lit à la fin de l'adresse.
        name: artifact
            .url
            .rsplit('/')
            .next()
            .unwrap_or(&artifact.url)
            .to_owned(),
    })
}

/// Demande à GitHub quelle archive prendre.
fn from_github(known: &Standalone) -> Result<Pick, String> {
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

    Ok(Pick {
        version: release.tag_name.clone(),
        url: asset.browser_download_url.clone(),
        name: asset.name.clone(),
    })
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
/// L'archive est déballée à côté, puis posée sur l'installation en place par
/// [`settle`] : la mise à jour remplace l'émulateur sans emporter ce que
/// l'utilisateur a mis à côté de lui.
pub fn install(known: &Standalone, into: &Path) -> Result<Installed, String> {
    // Deux forges, une seule suite : on demande d'abord où prendre l'archive,
    // le reste ne dépend plus de qui la publie.
    let pick = match (known.repository.is_empty(), known.feed.is_empty()) {
        (true, true) => {
            return Err(format!(
                "{} ne se télécharge pas : à installer depuis {}",
                known.label, known.site
            ))
        }
        (true, false) => from_feed(known)?,
        _ => from_github(known)?,
    };

    let mut archive = Vec::new();
    ureq::get(&pick.url)
        .set("User-Agent", "EvaChi")
        .call()
        .map_err(|error| format!("{} : {error}", pick.name))?
        .into_reader()
        .take(MAX_DOWNLOAD)
        .read_to_end(&mut archive)
        .map_err(|error| format!("{} : {error}", pick.name))?;

    // On déballe à côté, puis on échange : tant que le nouveau dossier n'est pas
    // complet, l'ancienne installation reste utilisable.
    let staging = into.with_extension("nouveau");
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|error| format!("{} : {error}", staging.display()))?;

    let outcome = if pick.name.to_lowercase().ends_with(".7z") {
        unpack_7z(archive, &staging)
    } else {
        unpack_zip(archive, &staging)
    };
    if let Err(error) = outcome {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(error);
    }

    let relative = settle(&staging, into, known, &pick.version)?;

    Ok(Installed {
        executable: into.join(relative),
        version: pick.version,
    })
}

/// Le relevé de ce qu'EvaChi a déballé la dernière fois, laissé sur place.
///
/// Sans lui, rien ne distingue un fichier de l'émulateur d'un fichier de
/// l'utilisateur, et la mise à jour effaçait le dossier entier — les BIOS, les
/// cartes mémoire et les réglages par jeu que l'émulateur y range avec. Le
/// relevé dit ce qu'EvaChi a posé ; le reste ne lui appartient pas.
const MANIFEST: &str = ".evachi-installe.json";

/// Ce qu'une installation a déposé dans le dossier.
#[derive(Default, Serialize, Deserialize)]
struct Manifest {
    /// La version posée, telle que la forge la nomme.
    version: String,
    /// L'exécutable, relatif au dossier ; son parent est le foyer.
    executable: String,
    /// Tout ce qui a été déballé, relatif au dossier, séparé par des `/`.
    files: Vec<String>,
}

/// Lit le relevé d'une installation. Une installation plus ancienne que lui,
/// ou faite à la main, n'en a pas : on n'y touchera alors à rien.
fn read_manifest(into: &Path) -> Manifest {
    std::fs::read_to_string(into.join(MANIFEST))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Un chemin relatif écrit avec des `/`, pour se comparer et se retenir.
fn slashed(path: &Path) -> String {
    path.components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

/// Le dossier d'un chemin relatif, vide s'il est à la racine.
fn parent_of(relative: &str) -> String {
    match relative.rsplit_once('/') {
        Some((parent, _)) => parent.to_owned(),
        None => String::new(),
    }
}

/// Le contenu d'un dossier : chaque chemin relatif, et s'il est un dossier.
///
/// Les dossiers en font partie : une archive peut en contenir un vide, et
/// l'émulateur compter dessus.
fn contents(root: &Path) -> Vec<(String, bool)> {
    let mut found = Vec::new();
    let mut queue = vec![root.to_path_buf()];

    while let Some(current) = queue.pop() {
        let Ok(entries) = std::fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let directory = path.is_dir();
            if directory {
                queue.push(path.clone());
            }
            if let Ok(relative) = path.strip_prefix(root) {
                found.push((slashed(relative), directory));
            }
        }
    }
    found
}

/// Les fichiers seuls, sans les dossiers.
fn files_of(root: &Path) -> Vec<String> {
    contents(root)
        .into_iter()
        .filter(|(_, directory)| !directory)
        .map(|(path, _)| path)
        .collect()
}

/// Le même chemin, mais sous le nouveau foyer.
///
/// Cemu et Azahar écrivent le numéro de version dans le nom de leur dossier :
/// d'une version à l'autre, tout change de place. Sans cette translation, la
/// version d'avant resterait à côté de la neuve, et les sauvegardes de
/// l'utilisateur avec elle.
fn moved(relative: &str, from: &str, to: &str) -> String {
    if from == to {
        return relative.to_owned();
    }
    if from.is_empty() {
        return format!("{to}/{relative}");
    }
    match relative.strip_prefix(&format!("{from}/")) {
        Some(rest) if to.is_empty() => rest.to_owned(),
        Some(rest) => format!("{to}/{rest}"),
        None => relative.to_owned(),
    }
}

/// Déplace un fichier, en écartant ce qui occupe déjà la place.
fn transfer(source: &Path, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("{} : {error}", parent.display()))?;
    }
    if destination.is_dir() {
        let _ = std::fs::remove_dir_all(destination);
    } else {
        let _ = std::fs::remove_file(destination);
    }
    std::fs::rename(source, destination)
        .map_err(|error| format!("{} : {error}", destination.display()))
}

/// Retire les dossiers que ces départs ont laissés vides, en remontant.
fn prune(into: &Path, departed: &[String]) {
    for relative in departed {
        let mut folder = into.join(relative);
        while folder.pop() && folder.as_path() != into {
            if std::fs::remove_dir(&folder).is_err() {
                break;
            }
        }
    }
}

/// Vrai si l'on peut écrire sur ce fichier maintenant.
///
/// Windows verrouille l'image d'un programme tant qu'il tourne. Sans cette
/// question posée avant de rien déplacer, la mise à jour s'arrêterait au
/// milieu : moitié ancienne version, moitié neuve.
fn writable(path: &Path) -> bool {
    !path.exists() || std::fs::OpenOptions::new().write(true).open(path).is_ok()
}

/// Pose une version fraîchement déballée par-dessus celle qui est en place.
///
/// Trois règles, dans cet ordre :
///
/// - ce que l'utilisateur a mis là reste, et suit l'exécutable si l'archive a
///   changé le nom de son dossier ;
/// - ce que la nouvelle version apporte écrase ce qui portait le même nom ;
/// - ce qu'EvaChi avait posé et que la nouvelle version n'apporte plus s'en va.
///
/// À défaut de relevé — une installation plus ancienne que lui — rien n'est
/// effacé qui ne soit aussitôt remplacé : on ne devine pas ce qui appartient à
/// l'émulateur, on ne touche qu'à ce que l'archive recouvre elle-même.
fn overlay(staging: &Path, into: &Path, known: &Standalone, new_exe: &Path) -> Result<(), String> {
    let manifest = read_manifest(into);
    let brought: std::collections::HashSet<String> = manifest.files.into_iter().collect();
    let arriving: std::collections::HashSet<String> = files_of(staging).into_iter().collect();
    let before = files_of(into);

    // Le foyer : le dossier où se tient l'exécutable, relatif à l'installation.
    let new_home = parent_of(&slashed(new_exe));
    let old_home = if manifest.executable.is_empty() {
        locate(into, known.executable)
            .and_then(|exe| exe.strip_prefix(into).ok().map(slashed))
            .map(|exe| parent_of(&exe))
            .unwrap_or_default()
    } else {
        parent_of(&manifest.executable)
    };

    // À l'émulateur : ce qu'on avait posé, ou ce que l'archive rapporte au même
    // endroit — le même chemin, au changement de foyer près.
    let his = |relative: &String| {
        brought.contains(relative) || arriving.contains(&moved(relative, &old_home, &new_home))
    };

    let mut departed: Vec<String> = Vec::new();

    // 1. Ce qui est à l'utilisateur suit l'émulateur dans son nouveau dossier.
    if old_home != new_home {
        // Les dossiers vides d'abord, tant qu'on peut encore les reconnaître :
        // Cemu range ses sauvegardes par compte et par titre, et un compte sans
        // partie n'est rien d'autre qu'un dossier vide. Les autres dossiers
        // suivront leurs fichiers.
        for (relative, directory) in contents(into) {
            let vide = directory
                && std::fs::read_dir(into.join(&relative))
                    .map(|mut entries| entries.next().is_none())
                    .unwrap_or(false);
            if !vide {
                continue;
            }
            let destination = moved(&relative, &old_home, &new_home);
            if destination == relative {
                continue;
            }
            std::fs::create_dir_all(into.join(&destination))
                .map_err(|error| format!("{destination} : {error}"))?;
        }

        for relative in before.iter() {
            if relative == MANIFEST || his(relative) {
                continue;
            }
            let destination = moved(relative, &old_home, &new_home);
            if destination == *relative {
                continue;
            }
            transfer(&into.join(relative), &into.join(&destination))?;
            departed.push(relative.clone());
        }
    }

    // 2. La nouvelle version se pose par-dessus.
    for (relative, directory) in contents(staging) {
        let destination = into.join(&relative);
        if directory {
            std::fs::create_dir_all(&destination)
                .map_err(|error| format!("{} : {error}", destination.display()))?;
            continue;
        }
        transfer(&staging.join(&relative), &destination)?;
    }

    // 3. Ce qu'EvaChi avait posé et que l'archive n'apporte plus s'efface.
    for relative in before.iter() {
        if relative == MANIFEST || arriving.contains(relative) || !his(relative) {
            continue;
        }
        let _ = std::fs::remove_file(into.join(relative));
        departed.push(relative.clone());
    }

    prune(into, &departed);

    // 4. Le foyer d'avant n'a plus lieu d'être — mais seulement s'il ne reste
    // vraiment rien dedans : un fichier oublié vaut mieux qu'un fichier perdu.
    if old_home != new_home && !old_home.is_empty() {
        let ancien = into.join(&old_home);
        if files_of(&ancien).is_empty() {
            let _ = std::fs::remove_dir_all(&ancien);
        }
    }

    let _ = std::fs::remove_dir_all(staging);
    Ok(())
}

/// Met en place ce qui vient d'être déballé, et note ce qu'on a posé.
///
/// Sortie de [`install`] pour être vérifiable : c'est ici que se joue la
/// conservation des données de l'utilisateur, et une erreur y coûterait un
/// BIOS ou une carte mémoire. Rend le chemin de l'exécutable, relatif à
/// l'installation.
fn settle(
    staging: &Path,
    into: &Path,
    known: &Standalone,
    version: &str,
) -> Result<PathBuf, String> {
    let Some(found) = locate(staging, known.executable) else {
        let _ = std::fs::remove_dir_all(staging);
        return Err(format!(
            "{} : {} introuvable dans l'archive",
            known.label, known.executable
        ));
    };
    let relative = found
        .strip_prefix(staging)
        .map(Path::to_path_buf)
        .unwrap_or_else(|_| PathBuf::from(known.executable));

    let laid = files_of(staging);

    if into.exists() {
        // Un émulateur qui tourne garde son programme sous clé : on le dit
        // avant d'avoir rien déplacé, plutôt que de s'arrêter au milieu.
        if let Some(running) = locate(into, known.executable) {
            if !writable(&running) {
                let _ = std::fs::remove_dir_all(staging);
                return Err(format!(
                    "{} : l'émulateur tourne encore, à fermer avant de le mettre à jour",
                    known.label
                ));
            }
        }
        overlay(staging, into, known, &relative)?;
    } else {
        if let Some(parent) = into.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::rename(staging, into).map_err(|error| format!("{} : {error}", into.display()))?;
    }

    // Réglages chez soi plutôt que dans le profil : c'est ce qui rend
    // l'ensemble transportable, et ce que ces émulateurs prévoient eux-mêmes.
    // Posé après coup, et seulement s'il manque : le marqueur de PCSX2 est un
    // fichier que l'émulateur remplit, et celui de Cemu un dossier plein de
    // sauvegardes.
    if !known.portable.is_empty() {
        let home = into.join(&relative);
        let home = home.parent().unwrap_or(into);
        let marker = home.join(known.portable.trim_end_matches('/'));
        if !marker.exists() {
            let _ = if known.portable.ends_with('/') {
                std::fs::create_dir_all(&marker)
            } else {
                std::fs::write(&marker, b"")
            };
        }
    }

    // Le relevé, pour que la prochaine mise à jour sache ce qui est à elle. S'il
    // ne s'écrit pas, la suivante se contentera de ne rien effacer.
    let manifest = Manifest {
        version: version.to_owned(),
        executable: slashed(&relative),
        files: laid,
    };
    if let Ok(text) = serde_json::to_string_pretty(&manifest) {
        let _ = std::fs::write(into.join(MANIFEST), text);
    }

    Ok(relative)
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
        for known in STANDALONES.iter().filter(|known| known.downloadable()) {
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
            // L'un ou l'autre, jamais rien : un dépôt GitHub « propriétaire/nom »,
            // ou l'adresse du flux du projet.
            let source = match known.repository.is_empty() {
                true => known.feed.starts_with("https://"),
                false => known.repository.contains('/'),
            };
            assert!(source, "{} : source douteuse", known.label);
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

    /// Un dossier de travail à soi, vidé s'il traînait d'une fois d'avant.
    fn atelier(nom: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!("evachi-{nom}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("dossier de test");
        base
    }

    /// Écrit un fichier, et les dossiers qu'il lui faut.
    fn poser(root: &Path, relative: &str, contenu: &str) {
        let chemin = root.join(relative);
        if let Some(parent) = chemin.parent() {
            std::fs::create_dir_all(parent).expect("dossier");
        }
        std::fs::write(chemin, contenu).expect("fichier");
    }

    fn lire(root: &Path, relative: &str) -> Option<String> {
        std::fs::read_to_string(root.join(relative)).ok()
    }

    #[test]
    fn la_mise_a_jour_garde_ce_que_l_utilisateur_a_mis_la() {
        // Le manque qui a motivé tout ceci : « Mettre à jour » effaçait le
        // dossier entier, BIOS et cartes mémoire compris.
        let base = atelier("garde");
        let into = base.join("PlayStation-2");
        let pcsx2 = known("PlayStation 2");

        let premier = base.join("premier");
        poser(&premier, "pcsx2-qt.exe", "v1");
        poser(&premier, "Qt6Core.dll", "v1");
        poser(&premier, "translations/fr.qm", "v1");
        settle(&premier, &into, pcsx2, "v1").expect("première installation");

        // Ce que l'utilisateur et l'émulateur déposent ensuite.
        poser(&into, "bios/scph39001.bin", "le bios");
        poser(&into, "memcards/Mcd001.ps2", "la carte");
        poser(&into, "portable.ini", "[UI]");

        let second = base.join("second");
        poser(&second, "pcsx2-qt.exe", "v2");
        poser(&second, "Qt6Core.dll", "v2");
        settle(&second, &into, pcsx2, "v2").expect("mise à jour");

        let bios = lire(&into, "bios/scph39001.bin");
        let carte = lire(&into, "memcards/Mcd001.ps2");
        let reglages = lire(&into, "portable.ini");
        let programme = lire(&into, "pcsx2-qt.exe");
        let ancienne = into.join("translations").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(bios.as_deref(), Some("le bios"), "le BIOS doit survivre");
        assert_eq!(carte.as_deref(), Some("la carte"), "la carte mémoire aussi");
        assert_eq!(
            reglages.as_deref(),
            Some("[UI]"),
            "le marqueur portable ne doit pas être vidé"
        );
        assert_eq!(programme.as_deref(), Some("v2"), "le programme est remplacé");
        assert!(!ancienne, "ce qu'EvaChi avait posé et qui ne vient plus s'en va");
    }

    #[test]
    fn sans_releve_rien_ne_s_efface() {
        // Les installations d'avant le relevé : impossible de dire ce qui
        // appartient à l'émulateur. On ne remplace alors que ce que l'archive
        // recouvre elle-même, et on ne devine rien.
        let base = atelier("sans-releve");
        let into = base.join("PlayStation-2");
        let pcsx2 = known("PlayStation 2");

        poser(&into, "pcsx2-qt.exe", "v1");
        poser(&into, "Qt6Core.dll", "v1");
        poser(&into, "inconnu.dll", "v1");
        poser(&into, "bios/scph39001.bin", "le bios");

        let neuf = base.join("neuf");
        poser(&neuf, "pcsx2-qt.exe", "v2");
        poser(&neuf, "Qt6Core.dll", "v2");
        settle(&neuf, &into, pcsx2, "v2").expect("mise à jour");

        let inconnu = lire(&into, "inconnu.dll");
        let bios = lire(&into, "bios/scph39001.bin");
        let programme = lire(&into, "pcsx2-qt.exe");
        let releve = into.join(MANIFEST).exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(inconnu.as_deref(), Some("v1"), "dans le doute, on garde");
        assert_eq!(bios.as_deref(), Some("le bios"), "le BIOS doit survivre");
        assert_eq!(programme.as_deref(), Some("v2"), "le programme est remplacé");
        assert!(releve, "la mise à jour laisse un relevé pour la suivante");
    }

    #[test]
    fn les_sauvegardes_suivent_cemu_quand_il_change_de_dossier() {
        // L'archive de Cemu porte le numéro de version dans le nom de son
        // dossier : `Cemu_2.6` devient `Cemu_2.7`, et tout ce que l'utilisateur
        // gardait dans `portable/` doit faire le voyage.
        let base = atelier("foyer");
        let into = base.join("Wii-U");
        let cemu = known("Wii U");

        let premier = base.join("premier");
        poser(&premier, "Cemu_2.6/Cemu.exe", "2.6");
        poser(&premier, "Cemu_2.6/resources/fr.txt", "2.6");
        settle(&premier, &into, cemu, "2.6").expect("première installation");
        assert!(
            into.join("Cemu_2.6/portable").is_dir(),
            "le mode portable doit être posé à la première installation"
        );

        poser(&into, "Cemu_2.6/portable/mlc01/save.dat", "ma partie");
        poser(&into, "Cemu_2.6/keys.txt", "mes clés");

        let second = base.join("second");
        poser(&second, "Cemu_2.7/Cemu.exe", "2.7");
        poser(&second, "Cemu_2.7/resources/fr.txt", "2.7");
        let relative = settle(&second, &into, cemu, "2.7").expect("mise à jour");

        let partie = lire(&into, "Cemu_2.7/portable/mlc01/save.dat");
        let cles = lire(&into, "Cemu_2.7/keys.txt");
        let programme = lire(&into, "Cemu_2.7/Cemu.exe");
        let ancien = into.join("Cemu_2.6").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(slashed(&relative), "Cemu_2.7/Cemu.exe");
        assert_eq!(partie.as_deref(), Some("ma partie"), "la sauvegarde suit");
        assert_eq!(cles.as_deref(), Some("mes clés"), "le reste aussi");
        assert_eq!(programme.as_deref(), Some("2.7"), "la version neuve est là");
        assert!(!ancien, "l'ancien dossier ne reste pas à traîner");
    }

    #[cfg(windows)]
    #[test]
    fn un_emulateur_qui_tourne_arrete_la_mise_a_jour() {
        // Windows verrouille l'image d'un programme tant qu'il tourne : mieux
        // vaut le dire avant d'avoir rien déplacé qu'échouer au milieu.
        use std::os::windows::fs::OpenOptionsExt;

        let base = atelier("verrou");
        let into = base.join("PlayStation-2");
        let pcsx2 = known("PlayStation 2");

        poser(&into, "pcsx2-qt.exe", "v1");
        poser(&into, "bios/scph39001.bin", "le bios");

        let neuf = base.join("neuf");
        poser(&neuf, "pcsx2-qt.exe", "v2");

        // Ouvert sans rien partager : c'est ce que fait Windows d'un programme
        // en cours d'exécution.
        let tenu = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(into.join("pcsx2-qt.exe"))
            .expect("ouverture exclusive");

        let refus = settle(&neuf, &into, pcsx2, "v2").err();
        drop(tenu);

        let programme = lire(&into, "pcsx2-qt.exe");
        let bios = lire(&into, "bios/scph39001.bin");
        let _ = std::fs::remove_dir_all(&base);

        let refus = refus.expect("une mise à jour sur un émulateur ouvert doit refuser");
        assert!(refus.contains("tourne encore"), "refus peu clair : {refus}");
        assert_eq!(programme.as_deref(), Some("v1"), "rien ne doit avoir bougé");
        assert_eq!(bios.as_deref(), Some("le bios"), "le BIOS non plus");
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
