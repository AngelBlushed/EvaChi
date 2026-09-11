//! Installation des cœurs depuis la forge officielle libretro.
//!
//! EvaChi ne redistribue aucun émulateur. Elle sait en revanche aller les
//! chercher là où leurs auteurs les publient — `buildbot.libretro.com`, la
//! forge du projet libretro — et les déposer dans son propre dossier. Pour qui
//! s'en sert, l'application arrive « déjà équipée » ; pour qui la distribue,
//! rien n'est copié, tout est cité.
//!
//! Chaque cœur est un projet libre à part entière, sous sa propre licence.
//! `docs/coeurs.md` les nomme un par un.

use std::io::Read;
use std::path::Path;

use serde::Serialize;

/// Un cœur qu'EvaChi sait installer, et la console qu'il fait tourner.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreOffer {
    /// Nom du fichier sur la forge, sans extension.
    pub name: String,
    /// Nom de l'émulateur, tel que ses auteurs l'écrivent.
    pub label: String,
    /// Console émulée, dans les mots de l'utilisateur.
    pub system: String,
}

/// Le nécessaire : un émulateur par console, choisi pour sa fidélité.
///
/// Là où plusieurs cœurs se disputent une console, c'est celui que la
/// bibliothèque désignera par défaut qui figure ici — inutile d'en installer
/// deux pour le même travail.
const CATALOGUE: &[(&str, &str, &str)] = &[
    ("mesen_libretro", "Mesen", "Nintendo NES"),
    ("snes9x_libretro", "Snes9x", "Super Nintendo"),
    ("sameboy_libretro", "SameBoy", "Game Boy · Game Boy Color"),
    ("mgba_libretro", "mGBA", "Game Boy Advance"),
    ("melonds_libretro", "melonDS", "Nintendo DS"),
    ("azahar_libretro", "Azahar", "Nintendo 3DS"),
    ("mupen64plus_next_libretro", "Mupen64Plus-Next", "Nintendo 64"),
    ("dolphin_libretro", "Dolphin", "GameCube · Wii"),
    ("mednafen_vb_libretro", "Beetle VB", "Virtual Boy"),
    ("gw_libretro", "Game & Watch", "Game & Watch"),
    ("genesis_plus_gx_libretro", "Genesis Plus GX", "Mega Drive · Master System · Game Gear · Mega-CD"),
    ("picodrive_libretro", "PicoDrive", "Sega 32X"),
    ("flycast_libretro", "Flycast", "Dreamcast"),
    ("mednafen_saturn_libretro", "Beetle Saturn", "Saturn"),
    ("swanstation_libretro", "SwanStation", "PlayStation"),
    ("ppsspp_libretro", "PPSSPP", "PSP"),
    ("mednafen_pce_fast_libretro", "Beetle PCE Fast", "PC Engine · TurboGrafx"),
    ("mednafen_ngp_libretro", "Beetle NeoPop", "Neo Geo Pocket"),
    ("mednafen_wswan_libretro", "Beetle WonderSwan", "WonderSwan"),
    ("mednafen_lynx_libretro", "Beetle Lynx", "Atari Lynx"),
    ("stella_libretro", "Stella", "Atari 2600"),
    ("prosystem_libretro", "ProSystem", "Atari 7800"),
    ("atari800_libretro", "Atari800", "Atari 800 · 5200"),
    ("virtualjaguar_libretro", "Virtual Jaguar", "Atari Jaguar"),
    ("freeintv_libretro", "FreeIntv", "Intellivision"),
    ("vecx_libretro", "VecX", "Vectrex"),
    ("opera_libretro", "Opera", "3DO"),
    ("fbneo_libretro", "FinalBurn Neo", "Arcade"),
    ("puae_libretro", "PUAE", "Amiga"),
    ("vice_x64_libretro", "VICE x64", "Commodore 64"),
    ("cap32_libretro", "Caprice32", "Amstrad CPC"),
    ("fuse_libretro", "Fuse", "ZX Spectrum"),
    ("bluemsx_libretro", "blueMSX", "MSX · ColecoVision"),
    ("px68k_libretro", "PX68K", "Sharp X68000"),
    ("np2kai_libretro", "Neko Project II kai", "PC-98"),
    ("theodore_libretro", "Theodore", "Thomson MO5 · TO7"),
    ("dosbox_pure_libretro", "DOSBox-pure", "MS-DOS"),
    ("scummvm_libretro", "ScummVM", "Point & click"),
];

/// Les cœurs qu'EvaChi propose d'installer.
pub fn catalogue() -> Vec<CoreOffer> {
    CATALOGUE
        .iter()
        .map(|(name, label, system)| CoreOffer {
            name: (*name).to_owned(),
            label: (*label).to_owned(),
            system: (*system).to_owned(),
        })
        .collect()
}

/// Le dossier de la forge correspondant à la machine courante.
///
/// Rend `None` là où libretro ne publie pas de version compatible avec ce
/// qu'EvaChi sait charger.
fn platform() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Some("windows/x86_64"),
        ("windows", "aarch64") => Some("windows/arm64"),
        ("linux", "x86_64") => Some("linux/x86_64"),
        ("macos", "x86_64") => Some("apple/osx/x86_64"),
        ("macos", "aarch64") => Some("apple/osx/arm64"),
        _ => None,
    }
}

/// L'adresse d'un cœur sur la forge officielle.
fn url(name: &str) -> Result<String, String> {
    let platform = platform().ok_or_else(|| {
        format!(
            "aucun cœur publié pour {} {}",
            std::env::consts::OS,
            std::env::consts::ARCH
        )
    })?;
    Ok(format!(
        "https://buildbot.libretro.com/nightly/{platform}/latest/{name}.{}.zip",
        crate::commands::CORE_EXTENSION
    ))
}

/// Taille au-delà de laquelle on refuse une réponse.
///
/// Les cœurs les plus lourds — Citra, Dolphin — tiennent sous trente mégaoctets
/// compressés. Ce plafond arrête une redirection qui nous enverrait autre chose
/// avant qu'elle ne remplisse la mémoire.
const MAX_DOWNLOAD: u64 = 128 * 1024 * 1024;

/// Télécharge un cœur et l'installe. Rend la taille écrite, en octets.
///
/// L'écriture passe par un fichier temporaire renommé ensuite : un cœur à
/// moitié téléchargé ne doit jamais se retrouver chargé comme s'il était
/// complet.
pub fn install(name: &str, cores: &Path) -> Result<u64, String> {
    let address = url(name)?;

    let response = ureq::get(&address)
        .call()
        .map_err(|error| format!("{address} : {error}"))?;

    let mut archive = Vec::new();
    response
        .into_reader()
        .take(MAX_DOWNLOAD)
        .read_to_end(&mut archive)
        .map_err(|error| format!("{address} : {error}"))?;

    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(archive))
        .map_err(|error| format!("{name} : archive illisible ({error})"))?;

    let wanted = format!("{name}.{}", crate::commands::CORE_EXTENSION);
    let mut entry = zip
        .by_name(&wanted)
        .map_err(|_| format!("{name} : l'archive ne contient pas {wanted}"))?;

    let mut library = Vec::new();
    entry
        .read_to_end(&mut library)
        .map_err(|error| format!("{name} : {error}"))?;
    if library.is_empty() {
        return Err(format!("{name} : bibliothèque vide"));
    }

    std::fs::create_dir_all(cores).map_err(|error| format!("{} : {error}", cores.display()))?;
    let destination = cores.join(&wanted);
    let temporary = destination.with_extension("part");

    std::fs::write(&temporary, &library)
        .map_err(|error| format!("{} : {error}", temporary.display()))?;
    std::fs::rename(&temporary, &destination)
        .map_err(|error| format!("{} : {error}", destination.display()))?;

    Ok(library.len() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_catalogue_ne_propose_jamais_deux_fois_le_meme_coeur() {
        let mut noms: Vec<&str> = CATALOGUE.iter().map(|(name, _, _)| *name).collect();
        noms.sort_unstable();
        let total = noms.len();
        noms.dedup();

        assert_eq!(noms.len(), total, "un cœur figure deux fois");
    }

    #[test]
    fn chaque_coeur_porte_le_suffixe_attendu() {
        // Le nom sert à la fois d'adresse sur la forge et de nom de fichier
        // installé : une faute ici se verrait comme un cœur introuvable.
        for (name, _, _) in CATALOGUE {
            assert!(
                name.ends_with("_libretro"),
                "{name} ne suit pas la convention libretro"
            );
        }
    }

    #[test]
    fn chaque_coeur_nomme_sa_console() {
        for offer in catalogue() {
            assert!(!offer.label.trim().is_empty(), "{} sans nom", offer.name);
            assert!(!offer.system.trim().is_empty(), "{} sans console", offer.name);
        }
    }

    #[test]
    fn l_adresse_vise_la_forge_officielle() {
        let Ok(address) = url("mesen_libretro") else {
            return; // Plateforme sans publication : rien à vérifier.
        };

        assert!(address.starts_with("https://buildbot.libretro.com/nightly/"));
        assert!(address.ends_with("/mesen_libretro.dll.zip") || address.contains("mesen_libretro."));
    }
}
