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

/// Relit la table « chemin du jeu → nom de fichier », pour la modifier ensuite.
///
/// Un index illisible n'est pas traité comme un index vide : on refuse. La
/// version précédente repartait de zéro en silence, et la première écriture qui
/// suivait effaçait toutes les jaquettes posées — les images restaient sur le
/// disque, mais plus rien ne disait à quel jeu elles appartenaient. C'est
/// arrivé, et il a fallu reconstruire la table à partir des noms de fichiers.
///
/// Un index absent, lui, est bien un index vide : c'est le premier lancement.
fn lire_index_sur(covers: &Path) -> Result<BTreeMap<String, String>, String> {
    let fichier = dossier(covers).join(INDEX);
    match std::fs::read_to_string(&fichier) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
        Err(error) => Err(format!("index illisible : {error}")),
        Ok(texte) if texte.trim().is_empty() => Ok(BTreeMap::new()),
        Ok(texte) => serde_json::from_str(&texte)
            .map_err(|error| format!("index abîmé, rien n'a été touché : {error}")),
    }
}

/// La table telle qu'elle est, pour la lire seulement.
///
/// Ici un index abîmé ne doit pas faire échouer l'affichage de la
/// bibliothèque : on rend ce qu'on peut, c'est-à-dire rien.
fn lire_index(covers: &Path) -> BTreeMap<String, String> {
    lire_index_sur(covers).unwrap_or_default()
}

/// Écrit la table, d'un bloc.
///
/// Par un fichier temporaire puis un renommage : une écriture interrompue
/// laisserait sinon un index tronqué, que la lecture suivante refuserait.
fn ecrire_index(covers: &Path, table: &BTreeMap<String, String>) -> Result<(), String> {
    let base = dossier(covers);
    std::fs::create_dir_all(&base).map_err(|error| format!("dossier : {error}"))?;
    let texte = serde_json::to_string_pretty(table).map_err(|error| format!("{error}"))?;

    let brouillon = base.join(format!("{INDEX}.nouveau"));
    std::fs::write(&brouillon, texte).map_err(|error| format!("écriture : {error}"))?;
    std::fs::rename(&brouillon, base.join(INDEX)).map_err(|error| format!("échange : {error}"))
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

    let octets = std::fs::read(image).map_err(|error| format!("image illisible : {error}"))?;
    ranger(covers, rom_path, &extension, &octets)
}

/// Enregistre une image qu'on a déjà en main, plutôt qu'un fichier à recopier.
///
/// C'est par là que passe le recadrage : la fenêtre a redessiné la jaquette
/// dans un canevas et n'en rend qu'une adresse `data:`. Écrire d'abord un
/// fichier temporaire pour le recopier aussitôt ne servirait à rien.
///
/// `source` est l'image d'avant le recadrage. Elle est mise de côté, une seule
/// fois : un recadrage écrase ce qui dépasse, et sans cet original on ne
/// pourrait que recadrer par-dessus un recadrage, en perdant un peu plus à
/// chaque fois. Avec lui, on repart toujours de l'image entière.
pub fn poser_donnees(
    covers: &Path,
    rom_path: &str,
    adresse: &str,
    source: Option<&str>,
) -> Result<String, String> {
    let octets = crate::b64::depuis_data(adresse, MAX_IMAGE as usize)?;
    if octets.is_empty() {
        return Err("image vide".into());
    }

    if let Some(source) = source {
        if original(covers, rom_path).is_none() {
            let bruts = crate::b64::depuis_data(source, MAX_IMAGE as usize)?;
            let base = dossier(covers);
            std::fs::create_dir_all(&base).map_err(|error| format!("dossier : {error}"))?;
            let nom = nom_de_fichier(rom_path, &format!("{ORIGINAL}.png"));
            std::fs::write(base.join(nom), &bruts)
                .map_err(|error| format!("original : {error}"))?;
        }
    }

    ranger(covers, rom_path, "png", &octets)
}

/// Le morceau qui distingue l'image d'origine de celle qu'on affiche.
const ORIGINAL: &str = "origine";

/// Les jeux dont la jaquette a été recadrée à la main.
///
/// On les distingue des jaquettes simplement désignées : celles-là gardent
/// l'affichage habituel, tandis qu'une jaquette recadrée se montre telle qu'on
/// l'a cadrée, bandes comprises. Changer l'allure des premières parce qu'on a
/// ajouté de quoi recadrer les secondes serait une surprise qu'on n'a pas
/// demandée.
pub fn recadrees(covers: &Path) -> Vec<String> {
    lire_index(covers)
        .into_keys()
        .filter(|jeu| a_un_original(covers, jeu))
        .collect()
}

/// Vrai quand l'image d'avant recadrage a été gardée pour ce jeu.
fn a_un_original(covers: &Path, rom_path: &str) -> bool {
    let base = dossier(covers);
    FORMATS
        .iter()
        .any(|extension| base.join(nom_de_fichier(rom_path, &format!("{ORIGINAL}.{extension}"))).exists())
}

/// L'image d'avant tout recadrage, si on l'a gardée.
///
/// Elle n'est pas dans l'index : ce n'est pas une jaquette à montrer, c'est ce
/// qu'on reprend quand on veut recadrer autrement. On la retrouve par son nom,
/// qui se déduit de celui du jeu.
pub fn original(covers: &Path, rom_path: &str) -> Option<String> {
    let base = dossier(covers);
    for extension in FORMATS {
        let chemin = base.join(nom_de_fichier(rom_path, &format!("{ORIGINAL}.{extension}")));
        if chemin.exists() {
            return en_adresse(&chemin);
        }
    }
    None
}

/// Écrit l'image, la rattache au jeu, et rend l'adresse à afficher.
fn ranger(covers: &Path, rom_path: &str, extension: &str, octets: &[u8]) -> Result<String, String> {
    let base = dossier(covers);
    std::fs::create_dir_all(&base).map_err(|error| format!("dossier : {error}"))?;

    let nom = nom_de_fichier(rom_path, extension);
    std::fs::write(base.join(&nom), octets).map_err(|error| format!("écriture : {error}"))?;

    // L'ancienne image est retirée : garder les deux remplirait le dossier de
    // jaquettes que plus rien ne désigne.
    let mut table = lire_index_sur(covers)?;
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
    let base = dossier(covers);

    // L'original s'en va avec : retirer la jaquette veut dire revenir à celle du
    // serveur, et garder de côté l'image d'un recadrage qu'on vient d'annuler ne
    // servirait qu'à remplir le dossier.
    for extension in FORMATS {
        let _ = std::fs::remove_file(base.join(nom_de_fichier(
            rom_path,
            &format!("{ORIGINAL}.{extension}"),
        )));
    }

    let mut table = lire_index_sur(covers)?;
    if let Some(nom) = table.remove(rom_path) {
        let _ = std::fs::remove_file(base.join(nom));
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
    fn pose_une_jaquette_recadree_sans_passer_par_un_fichier() {
        // Le recadrage rend une adresse `data:` : elle doit se ranger comme une
        // image désignée au sélecteur, et remplacer celle qui était là.
        let base = bac("recadre");
        let jeu = "D:/roms/Nes/Zelda.nes";

        let adresse = format!("data:image/png;base64,{}", crate::b64::encode(PIXEL));
        let rendue = poser_donnees(&base, jeu, &adresse, None).expect("pose");
        assert!(rendue.starts_with("data:image/png;base64,"));
        assert_eq!(toutes(&base).get(jeu), Some(&rendue));

        let restants = std::fs::read_dir(dossier(&base))
            .expect("lecture")
            .filter_map(Result::ok)
            .filter(|e| e.file_name() != INDEX)
            .count();
        assert_eq!(restants, 1);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn un_index_abime_ne_s_efface_pas_tout_seul() {
        // C'est arrivé : l'index illisible était pris pour un index vide, et la
        // première écriture qui suivait détachait toutes les jaquettes posées.
        // Les images restaient sur le disque, orphelines.
        let base = bac("abime");
        let image = base.join("boite.png");
        std::fs::write(&image, PIXEL).expect("image");

        let jeu = "D:/roms/Nes/Zelda.nes";
        poser(&base, jeu, &image).expect("pose");

        let index = dossier(&base).join(INDEX);
        std::fs::write(&index, b"{ ceci n'est pas du json").expect("abime");

        let autre = "D:/roms/Nes/Metroid.nes";
        assert!(poser(&base, autre, &image).is_err(), "la pose doit refuser");
        assert!(retirer(&base, jeu).is_err(), "le retrait doit refuser");

        // Et l'index abîmé est toujours là : on ne l'a pas remplacé par du vide.
        let reste = std::fs::read_to_string(&index).expect("relecture");
        assert!(reste.starts_with("{ ceci"), "l'index a été écrasé : {reste}");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn refuse_une_image_vide_ou_sans_en_tete() {
        let base = bac("vide");
        let jeu = "D:/roms/Nes/Zelda.nes";

        assert!(poser_donnees(&base, jeu, "data:image/png;base64,", None).is_err());
        assert!(poser_donnees(&base, jeu, "pas une adresse", None).is_err());
        assert!(toutes(&base).is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn garde_l_original_pour_qu_un_second_recadrage_reparte_de_l_image_entiere() {
        // Sans cela, recadrer deux fois rognerait le recadrage : ce qui dépasse
        // au premier passage serait perdu pour toujours.
        let base = bac("original");
        let jeu = "D:/roms/Nes/Zelda.nes";
        let entiere = format!("data:image/png;base64,{}", crate::b64::encode(PIXEL));

        assert!(original(&base, jeu).is_none(), "rien avant le premier recadrage");

        let premier = poser_donnees(&base, jeu, &entiere, Some(&entiere)).expect("premier");
        let garde = original(&base, jeu).expect("l'original est mis de côté");
        assert_eq!(garde, entiere);

        // Un second recadrage part de l'original et ne le remplace pas par la
        // version déjà rognée.
        poser_donnees(&base, jeu, &premier, Some(&premier)).expect("second");
        assert_eq!(original(&base, jeu).as_deref(), Some(entiere.as_str()));

        // Retirer la jaquette emporte l'original avec elle.
        retirer(&base, jeu).expect("retrait");
        assert!(original(&base, jeu).is_none());
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
