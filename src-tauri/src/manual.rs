//! Les jaquettes qu'on pose soi-même.
//!
//! Le serveur de vignettes ne couvre pas tout : la Switch et le CHIP-8 n'y ont
//! même pas de dossier, et aucun réglage ne les y fera apparaître. Rien
//! n'empêche en revanche de désigner une image pour un jeu — c'est la seule
//! solution qui marche pour toutes les consoles à la fois, y compris celles qui
//! n'existeront jamais chez libretro.
//!
//! L'image est recopiée dans les données de l'application plutôt que désignée
//! là où elle se trouve : une image laissée sur le bureau ou sur une clé finit
//! par disparaître, et la bibliothèque se retrouverait trouée sans raison
//! visible.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Taille au-delà de laquelle on refuse une image.
///
/// Une jaquette de boîte fait rarement plus de deux mégaoctets. Au-delà, c'est
/// une photographie ou une capture d'écran entière, qu'il vaut mieux refuser
/// que d'embarquer dans le démarrage de la fenêtre.
const MAX_IMAGE: u64 = 8 * 1024 * 1024;

/// Les formats qu'un navigateur sait afficher sans conversion.
const FORMATS: [&str; 5] = ["png", "jpg", "jpeg", "webp", "gif"];

/// Le nom du fichier qui relie un jeu à son image.
const INDEX: &str = "index.json";

/// Le dossier des jaquettes posées à la main.
fn dossier(covers: &Path) -> PathBuf {
    covers.join("manuel")
}

/// Relit la table « chemin du jeu → nom de fichier ».
fn lire_index(covers: &Path) -> BTreeMap<String, String> {
    let fichier = dossier(covers).join(INDEX);
    std::fs::read_to_string(fichier)
        .ok()
        .and_then(|texte| serde_json::from_str(&texte).ok())
        .unwrap_or_default()
}

fn ecrire_index(covers: &Path, table: &BTreeMap<String, String>) -> Result<(), String> {
    let base = dossier(covers);
    std::fs::create_dir_all(&base).map_err(|error| format!("dossier : {error}"))?;
    let texte = serde_json::to_string_pretty(table).map_err(|error| format!("{error}"))?;
    std::fs::write(base.join(INDEX), texte).map_err(|error| format!("écriture : {error}"))
}

/// Un nom de fichier sûr, tiré du chemin du jeu.
///
/// Le chemin lui-même ne peut pas servir : il contient des séparateurs et des
/// deux-points. On le réduit donc à ses caractères sûrs et on lui accroche une
/// empreinte, faute de quoi deux jeux de même nom dans deux dossiers
/// écraseraient mutuellement leur image.
pub fn nom_de_fichier(rom_path: &str, extension: &str) -> String {
    let empreinte = empreinte(rom_path);

    let queue: String = rom_path
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(40)
        .collect();

    format!("{queue}-{empreinte:016x}.{extension}")
}

/// Une empreinte simple et stable du chemin.
///
/// FNV-1a : quelques lignes, aucune dépendance, et amplement suffisant pour
/// distinguer les chemins d'une bibliothèque. Il ne s'agit pas de résister à
/// quiconque, seulement d'éviter deux jeux sur le même fichier.
fn empreinte(texte: &str) -> u64 {
    let mut valeur: u64 = 0xcbf2_9ce4_8422_2325;
    for octet in texte.as_bytes() {
        valeur ^= u64::from(*octet);
        valeur = valeur.wrapping_mul(0x0000_0100_0000_01b3);
    }
    valeur
}

/// Un nom de dossier sûr et stable, tiré du chemin du jeu.
///
/// Partagé avec les sauvegardes d'état : les deux ont besoin de désigner un
/// jeu par un nom de fichier, et deux règles différentes finiraient par ne
/// plus désigner le même.
pub fn nom_de_dossier(rom_path: &str) -> String {
    let queue: String = rom_path
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(40)
        .collect();
    format!("{queue}-{:016x}", empreinte(rom_path))
}

/// Le type de contenu d'une image, d'après son extension.
fn type_mime(extension: &str) -> &'static str {
    match extension {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    }
}

/// Lit une image du dossier et la rend sous forme d'adresse `data:`.
///
/// Une adresse plutôt qu'un fichier servi : la fenêtre n'a aucun accès au
/// disque, et ouvrir un protocole rien que pour quelques jaquettes serait un
/// détour coûteux pour ce que c'est.
fn en_adresse(chemin: &Path) -> Option<String> {
    let taille = std::fs::metadata(chemin).ok()?.len();
    if taille > MAX_IMAGE {
        return None;
    }
    let octets = std::fs::read(chemin).ok()?;
    let extension = chemin
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    Some(format!(
        "data:{};base64,{}",
        type_mime(&extension),
        crate::b64::encode(&octets)
    ))
}

/// Toutes les jaquettes posées à la main, prêtes à afficher.
pub fn toutes(covers: &Path) -> BTreeMap<String, String> {
    let base = dossier(covers);
    lire_index(covers)
        .into_iter()
        .filter_map(|(jeu, fichier)| Some((jeu, en_adresse(&base.join(fichier))?)))
        .collect()
}

/// Recopie une image et la rattache à un jeu.
pub fn poser(covers: &Path, rom_path: &str, image: &Path) -> Result<String, String> {
    let extension = image
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !FORMATS.contains(&extension.as_str()) {
        return Err(format!("format non reconnu : .{extension}"));
    }

    let taille = std::fs::metadata(image)
        .map_err(|error| format!("image illisible : {error}"))?
        .len();
    if taille > MAX_IMAGE {
        return Err("image trop lourde (plus de 8 Mo)".into());
    }

    let base = dossier(covers);
    std::fs::create_dir_all(&base).map_err(|error| format!("dossier : {error}"))?;

    let nom = nom_de_fichier(rom_path, &extension);
    std::fs::copy(image, base.join(&nom)).map_err(|error| format!("copie : {error}"))?;

    // L'ancienne image est retirée : garder les deux remplirait le dossier de
    // jaquettes que plus rien ne désigne.
    let mut table = lire_index(covers);
    if let Some(ancien) = table.insert(rom_path.to_owned(), nom.clone()) {
        if ancien != nom {
            let _ = std::fs::remove_file(base.join(ancien));
        }
    }
    ecrire_index(covers, &table)?;

    en_adresse(&base.join(&nom)).ok_or_else(|| "image relue en vain".to_string())
}

/// Détache l'image d'un jeu, et l'efface.
pub fn retirer(covers: &Path, rom_path: &str) -> Result<(), String> {
    let mut table = lire_index(covers);
    if let Some(nom) = table.remove(rom_path) {
        let _ = std::fs::remove_file(dossier(covers).join(nom));
        ecrire_index(covers, &table)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bac(nom: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!("evachi-manuel-{}-{nom}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("dossier");
        base
    }

    /// Le plus petit PNG valide : un pixel transparent.
    const PIXEL: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];

    #[test]
    fn deux_jeux_de_meme_nom_ne_se_marchent_pas_dessus() {
        // Deux dossiers, un même titre : sans l'empreinte, la seconde image
        // remplaçait la première sans rien dire.
        let un = nom_de_fichier("D:/roms/usa/Sonic.md", "png");
        let deux = nom_de_fichier("D:/roms/japon/Sonic.md", "png");
        assert_ne!(un, deux);
        assert!(un.starts_with("Sonicmd-"));
    }

    #[test]
    fn le_nom_de_fichier_est_stable() {
        assert_eq!(
            nom_de_fichier("D:/roms/Nes/Zelda.nes", "png"),
            nom_de_fichier("D:/roms/Nes/Zelda.nes", "png")
        );
    }

    #[test]
    fn pose_relit_et_retire_une_jaquette() {
        let base = bac("cycle");
        let image = base.join("boite.png");
        std::fs::write(&image, PIXEL).expect("image");

        let jeu = "D:/roms/Switch/Kirby.nsp";
        let adresse = poser(&base, jeu, &image).expect("pose");
        assert!(adresse.starts_with("data:image/png;base64,"));

        let table = toutes(&base);
        assert_eq!(table.len(), 1);
        assert_eq!(table.get(jeu), Some(&adresse));

        retirer(&base, jeu).expect("retrait");
        assert!(toutes(&base).is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn refuse_ce_qui_n_est_pas_une_image() {
        let base = bac("format");
        let faux = base.join("notes.txt");
        std::fs::write(&faux, b"bonjour").expect("fichier");

        assert!(poser(&base, "D:/roms/x.nes", &faux).is_err());
        assert!(toutes(&base).is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn remplacer_une_jaquette_efface_l_ancienne() {
        let base = bac("remplace");
        let png = base.join("un.png");
        let gif = base.join("deux.gif");
        std::fs::write(&png, PIXEL).expect("png");
        std::fs::write(&gif, PIXEL).expect("gif");

        let jeu = "D:/roms/Switch/Kirby.nsp";
        poser(&base, jeu, &png).expect("premier");
        poser(&base, jeu, &gif).expect("second");

        let restants = std::fs::read_dir(dossier(&base))
            .expect("lecture")
            .filter_map(Result::ok)
            .filter(|e| e.file_name() != INDEX)
            .count();
        assert_eq!(restants, 1, "l'ancienne image n'a pas été effacée");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn un_dossier_vide_ne_rend_rien() {
        let base = bac("vide");
        assert!(toutes(&base).is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }
}
