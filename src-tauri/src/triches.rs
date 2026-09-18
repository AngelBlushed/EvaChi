//! Les fiches de triche : les trouver, les poser sur le disque, les relire.
//!
//! Le projet libretro publie une fiche par jeu, rangée par console, dans son
//! dépôt de données. On n'en télécharge aucune d'office : rien ne descend du
//! réseau sans que quelqu'un ait coché la case. C'est le même principe que les
//! émulateurs, et pour la même raison — ce sont des fichiers, et on demande.
//!
//! Ce module ne lit pas ce qu'il télécharge. Découper une fiche et décider si
//! elle va bien à un jeu sont deux affaires de la fenêtre, où elles s'éprouvent
//! mieux. Ici on ne fait que le va-et-vient avec le disque et le réseau.

use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Le dépôt de données du projet libretro, et le dossier des triches.
const DEPOT: &str = "https://api.github.com/repos/libretro/libretro-database";
const FICHIERS: &str = "https://raw.githubusercontent.com/libretro/libretro-database/master/cht";

/// Ce qu'on accepte de lire d'un inventaire. L'arbre entier pèse trois
/// mégaoctets et quelque ; au-delà de vingt, c'est autre chose.
const MAX_ARBRE: u64 = 20 * 1024 * 1024;

/// Et d'une fiche. Les plus fournies dépassent le mégaoctet ; aucune n'atteint
/// quatre, et un fichier qui les dépasserait n'est pas une fiche.
const MAX_FICHE: u64 = 4 * 1024 * 1024;

/// Le nom d'un fichier de cache pour une console.
///
/// Les noms de console portent des espaces et des tirets ; on les ramène à ce
/// qu'un système de fichiers accepte partout, sans se soucier de pouvoir
/// revenir en arrière — le nom d'origine est dans le contenu.
fn sous_nom(systeme: &str) -> String {
    systeme
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

/// Encode un morceau de chemin pour une adresse.
fn encode(brut: &str) -> String {
    brut.bytes()
        .map(|octet| match octet {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (octet as char).to_string()
            }
            _ => format!("%{octet:02X}"),
        })
        .collect()
}

/// Lit une adresse, jusqu'à une borne.
fn aller_chercher(url: &str, borne: u64) -> Result<Vec<u8>, String> {
    let mut corps = Vec::new();
    ureq::get(url)
        .set("User-Agent", "EvaChi")
        .call()
        .map_err(|erreur| erreur.to_string())?
        .into_reader()
        .take(borne)
        .read_to_end(&mut corps)
        .map_err(|erreur| erreur.to_string())?;
    Ok(corps)
}

/// L'empreinte du dossier des triches dans le dépôt.
fn empreinte() -> Result<String, String> {
    let brut = aller_chercher(&format!("{DEPOT}/git/trees/master"), MAX_ARBRE)?;
    let arbre: serde_json::Value =
        serde_json::from_slice(&brut).map_err(|erreur| erreur.to_string())?;

    arbre
        .get("tree")
        .and_then(|liste| liste.as_array())
        .and_then(|liste| {
            liste.iter().find(|entree| {
                entree.get("path").and_then(|p| p.as_str()) == Some("cht")
                    && entree.get("type").and_then(|t| t.as_str()) == Some("tree")
            })
        })
        .and_then(|entree| entree.get("sha"))
        .and_then(|sha| sha.as_str())
        .map(str::to_owned)
        .ok_or_else(|| "le dépôt ne publie plus de dossier de triches".to_owned())
}

/// Relève l'inventaire complet, console par console.
///
/// Une seule demande pour tout le dépôt : parcourir console par console
/// coûterait cinquante appels, et le service qui les compte les refuserait
/// avant la fin.
fn relever() -> Result<BTreeMap<String, Vec<String>>, String> {
    let sha = empreinte()?;
    let brut = aller_chercher(&format!("{DEPOT}/git/trees/{sha}?recursive=1"), MAX_ARBRE)?;
    let arbre: serde_json::Value =
        serde_json::from_slice(&brut).map_err(|erreur| erreur.to_string())?;

    let entrees = arbre
        .get("tree")
        .and_then(|liste| liste.as_array())
        .ok_or_else(|| "inventaire des triches illisible".to_owned())?;

    let mut par_systeme: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for entree in entrees {
        if entree.get("type").and_then(|t| t.as_str()) != Some("blob") {
            continue;
        }
        let Some(chemin) = entree.get("path").and_then(|p| p.as_str()) else {
            continue;
        };
        let Some((systeme, fichier)) = chemin.split_once('/') else {
            continue;
        };
        let Some(nom) = fichier.strip_suffix(".cht") else {
            continue;
        };
        if nom.is_empty() || nom.contains('/') {
            continue;
        }
        par_systeme
            .entry(systeme.to_owned())
            .or_default()
            .push(nom.to_owned());
    }

    if par_systeme.is_empty() {
        return Err("le dépôt n'a rendu aucune fiche".to_owned());
    }
    Ok(par_systeme)
}

/// Écrit l'inventaire sur le disque, une console par fichier.
fn ranger(dossier: &Path, releve: &BTreeMap<String, Vec<String>>) -> Result<(), String> {
    let index = dossier.join("index");
    std::fs::create_dir_all(&index).map_err(|erreur| erreur.to_string())?;

    for (systeme, noms) in releve {
        let fichier = index.join(format!("{}.txt", sous_nom(systeme)));
        // La première ligne porte le nom d'origine : le nom de fichier l'a
        // aplati, et c'est lui qu'il faudra pour construire une adresse.
        let contenu = format!("{systeme}\n{}", noms.join("\n"));
        std::fs::write(&fichier, contenu).map_err(|erreur| erreur.to_string())?;
    }
    Ok(())
}

/// L'inventaire d'une console, s'il est déjà sur le disque.
fn relu(dossier: &Path, systeme: &str) -> Option<Vec<String>> {
    let fichier = dossier.join("index").join(format!("{}.txt", sous_nom(systeme)));
    let texte = std::fs::read_to_string(fichier).ok()?;
    let mut lignes = texte.lines();
    // La première ligne est le nom d'origine ; si elle ne correspond pas, deux
    // consoles se sont aplaties en un même nom de fichier et l'inventaire n'est
    // pas celui qu'on demande.
    if lignes.next()? != systeme {
        return None;
    }
    Some(lignes.filter(|l| !l.is_empty()).map(str::to_owned).collect())
}

/// Ce que le dépôt propose pour ces consoles-là.
///
/// L'inventaire entier est relevé d'un coup puis gardé sur le disque : c'est
/// une seule demande au réseau pour toute une bibliothèque, et les fois
/// suivantes n'en coûtent aucune. `rafraichir` le redemande quand même — le
/// dépôt s'enrichit, et on doit pouvoir aller revoir.
pub fn catalogue(
    dossier: &Path,
    systemes: &[String],
    rafraichir: bool,
) -> Result<BTreeMap<String, Vec<String>>, String> {
    let manque = systemes.iter().any(|systeme| relu(dossier, systeme).is_none());
    if rafraichir || manque {
        let releve = relever()?;
        ranger(dossier, &releve)?;
    }

    let mut rendu = BTreeMap::new();
    for systeme in systemes {
        if let Some(noms) = relu(dossier, systeme) {
            rendu.insert(systeme.clone(), noms);
        }
    }
    Ok(rendu)
}

/// Le chemin d'une fiche posée sur le disque.
fn chemin(dossier: &Path, systeme: &str, nom: &str) -> PathBuf {
    dossier
        .join("fiches")
        .join(sous_nom(systeme))
        .join(format!("{}.cht", sous_nom(nom)))
}

/// Va chercher des fiches et les pose sur le disque.
///
/// Rend ce qui n'a pas pu être posé, avec sa raison. Une fiche manquante ne
/// fait pas échouer les autres : on en installe souvent plusieurs d'un coup, et
/// une console retirée du dépôt ne doit pas emporter le reste.
pub fn installer(
    dossier: &Path,
    systeme: &str,
    noms: &[String],
) -> Result<Vec<String>, String> {
    let repertoire = dossier.join("fiches").join(sous_nom(systeme));
    std::fs::create_dir_all(&repertoire).map_err(|erreur| erreur.to_string())?;

    let mut plaintes = Vec::new();
    for nom in noms {
        let url = format!("{FICHIERS}/{}/{}.cht", encode(systeme), encode(nom));
        match aller_chercher(&url, MAX_FICHE) {
            Ok(corps) => {
                // Le nom d'origine ouvre le fichier : celui du disque est
                // aplati, et c'est le vrai qu'il faudra pour s'y retrouver.
                let mut contenu = format!("# {nom}\n").into_bytes();
                contenu.extend_from_slice(&corps);
                if let Err(erreur) = std::fs::write(chemin(dossier, systeme, nom), contenu) {
                    plaintes.push(format!("{nom} : {erreur}"));
                }
            }
            Err(erreur) => plaintes.push(format!("{nom} : {erreur}")),
        }
    }
    Ok(plaintes)
}

/// Les fiches déjà posées, console par console, sous leur nom d'origine.
pub fn posees(dossier: &Path) -> BTreeMap<String, Vec<String>> {
    let mut rendu: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let Ok(consoles) = std::fs::read_dir(dossier.join("fiches")) else {
        return rendu;
    };

    for console in consoles.flatten() {
        let Ok(fiches) = std::fs::read_dir(console.path()) else {
            continue;
        };
        for fiche in fiches.flatten() {
            let Some((systeme, nom)) = entete(&fiche.path()) else {
                continue;
            };
            rendu.entry(systeme).or_default().push(nom);
        }
    }

    for noms in rendu.values_mut() {
        noms.sort();
    }
    rendu
}

/// Le nom d'origine d'une fiche posée, et sa console.
///
/// Relus dans le fichier plutôt que devinés depuis son chemin : les noms y ont
/// été aplatis, et un nom aplati ne se remonte pas.
fn entete(fichier: &Path) -> Option<(String, String)> {
    let texte = std::fs::read_to_string(fichier).ok()?;
    let nom = texte.lines().next()?.strip_prefix("# ")?.trim().to_owned();
    if nom.is_empty() {
        return None;
    }
    // La console est le dossier parent, dont le nom a été aplati aussi : on la
    // retrouve en relisant l'index, mais pour l'usage courant le nom du dossier
    // suffit — il ne sert qu'à regrouper.
    let console = fichier
        .parent()
        .and_then(|parent| parent.file_name())
        .map(|nom| nom.to_string_lossy().into_owned())?;
    Some((console, nom))
}

/// Le contenu d'une fiche posée, sans sa ligne d'en-tête.
pub fn contenu(dossier: &Path, systeme: &str, nom: &str) -> Result<String, String> {
    let texte = std::fs::read_to_string(chemin(dossier, systeme, nom))
        .map_err(|erreur| format!("{nom} : {erreur}"))?;
    Ok(match texte.split_once('\n') {
        Some((premiere, reste)) if premiere.starts_with("# ") => reste.to_owned(),
        _ => texte,
    })
}

/// Retire une fiche du disque.
pub fn retirer(dossier: &Path, systeme: &str, nom: &str) -> Result<(), String> {
    let cible = chemin(dossier, systeme, nom);
    if !cible.exists() {
        return Ok(());
    }
    std::fs::remove_file(&cible).map_err(|erreur| format!("{nom} : {erreur}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un bac à sable qui se range tout seul.
    struct Bac(PathBuf);

    impl Bac {
        fn neuf(nom: &str) -> Self {
            let chemin = std::env::temp_dir().join(format!("evachi-triches-{nom}"));
            let _ = std::fs::remove_dir_all(&chemin);
            std::fs::create_dir_all(&chemin).expect("bac");
            Self(chemin)
        }
    }

    impl Drop for Bac {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn aplatit_les_noms_sans_jamais_sortir_du_dossier() {
        // Un nom de fiche vient du réseau. S'il pouvait porter des barres ou
        // des points, il écrirait où il veut sur le disque.
        for mauvais in ["../../evade", "C:\\ailleurs", "avec/barre", "deux..points"] {
            let plat = sous_nom(mauvais);
            assert!(!plat.contains('/'), "{mauvais}");
            assert!(!plat.contains('\\'), "{mauvais}");
            assert!(!plat.contains(".."), "{mauvais}");
        }
    }

    #[test]
    fn range_et_relit_un_inventaire() {
        let bac = Bac::neuf("inventaire");
        let mut releve = BTreeMap::new();
        releve.insert(
            "Nintendo - Game Boy".to_owned(),
            vec!["Tetris (World)".to_owned(), "Metroid II".to_owned()],
        );
        ranger(&bac.0, &releve).expect("rangement");

        assert_eq!(
            relu(&bac.0, "Nintendo - Game Boy"),
            Some(vec!["Tetris (World)".to_owned(), "Metroid II".to_owned()])
        );
        assert_eq!(relu(&bac.0, "Console inconnue"), None);
    }

    #[test]
    fn retrouve_le_nom_d_origine_d_une_fiche_posee() {
        // Le nom du fichier est aplati et ne se remonte pas : c'est l'en-tête
        // qui porte le vrai, et c'est lui qu'on relit.
        let bac = Bac::neuf("posees");
        let systeme = "Nintendo - Game Boy";
        let nom = "Tetris (World) (Rev A)";
        std::fs::create_dir_all(bac.0.join("fiches").join(sous_nom(systeme))).expect("dossier");
        std::fs::write(
            chemin(&bac.0, systeme, nom),
            format!("# {nom}\ncheat0_code = \"ABCD\"\n"),
        )
        .expect("écriture");

        let toutes = posees(&bac.0);
        let noms: Vec<&String> = toutes.values().flatten().collect();
        assert_eq!(noms, vec![&nom.to_owned()]);

        // Et le contenu revient sans l'en-tête, qui n'appartient pas à la fiche.
        let lu = contenu(&bac.0, systeme, nom).expect("relecture");
        assert_eq!(lu, "cheat0_code = \"ABCD\"\n");

        retirer(&bac.0, systeme, nom).expect("retrait");
        assert!(posees(&bac.0).is_empty());
        // Retirer ce qui n'est plus là n'est pas une erreur.
        retirer(&bac.0, systeme, nom).expect("second retrait");
    }

    #[test]
    fn encode_ce_qu_une_adresse_n_accepte_pas() {
        assert_eq!(encode("Nintendo - Game Boy"), "Nintendo%20-%20Game%20Boy");
        assert_eq!(encode("Tetris (World)"), "Tetris%20%28World%29");
    }
}
