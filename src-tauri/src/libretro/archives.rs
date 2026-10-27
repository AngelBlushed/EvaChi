//! Les jeux livrés dans une archive zip.
//!
//! Les collections de ROMs arrivent presque toujours ainsi : un `.zip` par jeu,
//! qu'une ROM de Super Nintendo, de Mega Drive ou de Game Boy porte autant que
//! n'importe quelle autre. Mais la plupart des cœurs libretro ne lisent pas
//! les archives — ils déclarent `sfc|smc`, pas `zip` —, et seuls ceux de
//! l'arcade et de quelques micro-ordinateurs les ouvrent eux-mêmes.
//!
//! Un jeu rangé dans un zip, dans le dossier d'une console dont le cœur ne
//! lit pas les zips, n'avait donc aucun preneur : il n'était pas refusé, il
//! disparaissait de la liste, sans un mot.
//!
//! Ce module comble l'écart. Il dit ce qu'une archive contient — pour que la
//! bibliothèque sache quels cœurs peuvent l'ouvrir —, et il en sort la ROM que
//! le cœur attend, dans un dossier à part.

use std::io::Read;
use std::path::{Path, PathBuf};

/// Taille au-delà de laquelle on refuse de déballer un fichier.
///
/// Une image de PlayStation 2 fait quatre gigaoctets et ne vit presque jamais
/// dans un zip ; ce plafond n'est pas pour elle mais pour l'archive piégée,
/// minuscule à l'état comprimé et grande comme un disque une fois ouverte.
const PLAFOND: u64 = 2 * 1024 * 1024 * 1024;

/// Combien d'entrées on accepte de lire dans un répertoire d'archive.
///
/// Un ensemble arcade peut en compter des centaines ; au-delà de quelques
/// milliers, ce n'est plus un jeu, et lire la liste coûterait plus qu'il ne
/// rapporte.
const ENTREES_MAX: usize = 4096;

/// Les feuillets qui décrivent un disque : leurs pistes sont d'autres fichiers.
const FEUILLETS: &[&str] = &["cue", "gdi", "ccd", "toc", "m3u"];

/// L'extension d'un nom d'entrée, en minuscules, sans le point.
fn extension(nom: &str) -> Option<String> {
    let fichier = nom.rsplit(['/', '\\']).next().unwrap_or(nom);
    let (souche, ext) = fichier.rsplit_once('.')?;
    // Un fichier caché (`.gitkeep`) n'a pas d'extension, il a un nom.
    if souche.is_empty() || ext.is_empty() {
        return None;
    }
    Some(ext.to_lowercase())
}

/// Les extensions des fichiers que l'archive contient, sans doublon.
///
/// Rend un tableau vide quand l'archive est illisible : la bibliothèque n'en
/// tire alors rien, et le fichier reste dans l'état où il était — visible
/// pour les cœurs qui lisent les zips, absent pour les autres.
pub fn contenus(archive: &Path) -> Vec<String> {
    let Ok(fichier) = std::fs::File::open(archive) else {
        return Vec::new();
    };
    let Ok(mut zip) = zip::ZipArchive::new(fichier) else {
        return Vec::new();
    };

    let mut vues: Vec<String> = Vec::new();
    for rang in 0..zip.len().min(ENTREES_MAX) {
        let Ok(entree) = zip.by_index_raw(rang) else {
            continue;
        };
        if entree.is_dir() {
            continue;
        }
        if let Some(ext) = extension(entree.name()) {
            if !vues.contains(&ext) {
                vues.push(ext);
            }
        }
    }
    vues
}

/// Ce que le déballage a produit.
#[derive(Debug)]
pub struct Deballe {
    /// Le fichier à donner au cœur.
    pub fichier: PathBuf,
    /// Le dossier à effacer quand on en a fini.
    pub dossier: PathBuf,
}

/// Sort d'une archive le fichier qu'un cœur sait ouvrir.
///
/// `acceptees` est la liste des extensions que le cœur déclare. L'archive peut
/// en contenir plusieurs — une ROM et sa notice, ou une ROM et son rapport de
/// vérification — : on prend la plus grosse parmi celles qu'il accepte, qui est
/// presque toujours le jeu.
///
/// Un disque est un cas à part : le feuillet (`.cue`) ne désigne rien tout
/// seul, ses pistes sont d'autres fichiers de l'archive. On sort alors tout.
///
/// Sous quel nom : celui de l'archive, avec l'extension de ce qu'elle contient.
/// C'est lui que les cœurs prennent pour nommer la sauvegarde, et celui de
/// l'archive est ce que l'utilisateur reconnaît — l'intérieur porte souvent
/// un nom de catalogue différent, qui changerait d'une version à l'autre.
pub fn deballer(archive: &Path, acceptees: &[String], dans: &Path) -> Result<Deballe, String> {
    let fichier = std::fs::File::open(archive)
        .map_err(|erreur| format!("{} : {erreur}", archive.display()))?;
    let mut zip = zip::ZipArchive::new(fichier)
        .map_err(|erreur| format!("archive illisible : {erreur}"))?;

    let acceptees: Vec<String> = acceptees.iter().map(|ext| ext.to_lowercase()).collect();

    // Ce qu'on retient : le rang, l'extension, la taille.
    let mut candidats: Vec<(usize, String, u64)> = Vec::new();
    let mut feuillet: Option<usize> = None;
    for rang in 0..zip.len().min(ENTREES_MAX) {
        let Ok(entree) = zip.by_index_raw(rang) else {
            continue;
        };
        if entree.is_dir() {
            continue;
        }
        let Some(ext) = extension(entree.name()) else {
            continue;
        };
        if FEUILLETS.contains(&ext.as_str()) && acceptees.contains(&ext) && feuillet.is_none() {
            feuillet = Some(rang);
        }
        if acceptees.contains(&ext) {
            candidats.push((rang, ext, entree.size()));
        }
    }

    let racine = archive
        .file_stem()
        .map(|nom| nom.to_string_lossy().into_owned())
        .unwrap_or_else(|| "jeu".to_owned());

    std::fs::create_dir_all(dans).map_err(|erreur| format!("{} : {erreur}", dans.display()))?;

    // Un disque : tout sort, sous les noms de l'archive, et le feuillet désigne.
    if let Some(rang_feuillet) = feuillet {
        let mut principal = None;
        for rang in 0..zip.len().min(ENTREES_MAX) {
            let Some(sortie) = sortir(&mut zip, rang, dans)? else {
                continue;
            };
            if rang == rang_feuillet {
                principal = Some(sortie);
            }
        }
        return principal
            .map(|fichier| Deballe {
                fichier,
                dossier: dans.to_path_buf(),
            })
            .ok_or_else(|| "le feuillet du disque n'a pas pu être déballé".to_owned());
    }

    // Une ROM seule : la plus grosse que le cœur accepte.
    let Some((rang, ext, taille)) = candidats.into_iter().max_by_key(|(_, _, taille)| *taille)
    else {
        return Err(format!(
            "aucun fichier de l'archive n'est d'un format que ce cœur ouvre ({})",
            if acceptees.is_empty() {
                "il n'en déclare aucun".to_owned()
            } else {
                acceptees.join(", ")
            }
        ));
    };
    if taille > PLAFOND {
        return Err(format!(
            "{} Mo une fois déballé : au-delà de ce qu'on accepte d'ouvrir depuis une archive",
            taille / (1024 * 1024)
        ));
    }

    let destination = dans.join(format!("{racine}.{ext}"));
    let mut entree = zip
        .by_index(rang)
        .map_err(|erreur| format!("entrée illisible : {erreur}"))?;
    ecrire(&mut entree, &destination)?;

    Ok(Deballe {
        fichier: destination,
        dossier: dans.to_path_buf(),
    })
}

/// Sort une entrée sous son propre nom, dans le dossier. `None` pour un dossier.
///
/// `enclosed_name` écarte les chemins absolus et les `..` : une archive hostile
/// ne doit pas pouvoir écrire ailleurs que chez elle.
fn sortir(
    zip: &mut zip::ZipArchive<std::fs::File>,
    rang: usize,
    dans: &Path,
) -> Result<Option<PathBuf>, String> {
    let mut entree = zip
        .by_index(rang)
        .map_err(|erreur| format!("entrée {rang} illisible : {erreur}"))?;
    if entree.is_dir() {
        return Ok(None);
    }
    let Some(relatif) = entree.enclosed_name() else {
        return Ok(None);
    };
    let destination = dans.join(relatif);
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|erreur| format!("{} : {erreur}", parent.display()))?;
    }
    ecrire(&mut entree, &destination)?;
    Ok(Some(destination))
}

/// Écrit une entrée sur le disque, sans jamais dépasser le plafond.
fn ecrire(entree: &mut impl Read, destination: &Path) -> Result<(), String> {
    let mut sortie = std::fs::File::create(destination)
        .map_err(|erreur| format!("{} : {erreur}", destination.display()))?;
    // Un octet de plus que le plafond : si on le lit, c'est qu'il y en avait
    // davantage, et on le dit plutôt que de livrer un fichier tronqué.
    let mut limite = entree.take(PLAFOND + 1);
    let ecrits = std::io::copy(&mut limite, &mut sortie)
        .map_err(|erreur| format!("{} : {erreur}", destination.display()))?;
    if ecrits > PLAFOND {
        let _ = std::fs::remove_file(destination);
        return Err("fichier trop grand pour être déballé".to_owned());
    }
    Ok(())
}

/// Vrai si le chemin désigne une archive zip.
pub fn est_une_archive(chemin: &Path) -> bool {
    chemin
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("zip"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn atelier(nom: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!("evachi-arch-{nom}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("dossier de test");
        base
    }

    /// Une archive de test : (nom dans l'archive, contenu).
    fn archive(dans: &Path, nom: &str, fichiers: &[(&str, &[u8])]) -> PathBuf {
        let chemin = dans.join(nom);
        let sortie = std::fs::File::create(&chemin).expect("archive");
        let mut ecrivain = zip::ZipWriter::new(sortie);
        let options = zip::write::SimpleFileOptions::default();
        for (nom, contenu) in fichiers {
            ecrivain.start_file(*nom, options).expect("entrée");
            ecrivain.write_all(contenu).expect("écriture");
        }
        ecrivain.finish().expect("fin");
        chemin
    }

    fn exts(liste: &[&str]) -> Vec<String> {
        liste.iter().map(|ext| (*ext).to_owned()).collect()
    }

    #[test]
    fn dit_ce_que_l_archive_contient() {
        let base = atelier("contenu");
        let zip = archive(
            &base,
            "Zelda.zip",
            &[("Zelda.sfc", b"rom"), ("notice.txt", b"lisez-moi"), ("Zelda.SFC.bak", b"x")],
        );

        let vus = contenus(&zip);
        let _ = std::fs::remove_dir_all(&base);

        assert!(vus.contains(&"sfc".to_owned()));
        assert!(vus.contains(&"txt".to_owned()));
        assert!(vus.contains(&"bak".to_owned()));
        assert_eq!(vus.len(), 3, "sans doublon : {vus:?}");
    }

    #[test]
    fn une_archive_illisible_ne_dit_rien() {
        let base = atelier("illisible");
        let faux = base.join("faux.zip");
        std::fs::write(&faux, b"ceci n'est pas une archive").expect("fichier");

        let vus = contenus(&faux);
        let _ = std::fs::remove_dir_all(&base);

        assert!(vus.is_empty(), "elle ne doit ni planter ni inventer");
    }

    #[test]
    fn sort_la_rom_et_la_nomme_comme_l_archive() {
        // L'intérieur porte un nom de catalogue : c'est celui de l'archive que
        // l'utilisateur reconnaît, et c'est lui qui nomme la sauvegarde.
        let base = atelier("nom");
        let zip = archive(
            &base,
            "Zelda.zip",
            &[("The Legend of Zelda (USA) (Rev 1).sfc", b"la rom")],
        );

        let sortie = deballer(&zip, &exts(&["sfc", "smc"]), &base.join("sortie")).expect("déballage");
        let nom = sortie.fichier.file_name().unwrap().to_string_lossy().into_owned();
        let contenu = std::fs::read(&sortie.fichier).expect("relecture");
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(nom, "Zelda.sfc");
        assert_eq!(contenu, b"la rom");
    }

    #[test]
    fn prend_la_plus_grosse_des_roms_acceptees() {
        // Une ROM et sa version abrégée : le jeu est le plus gros fichier.
        let base = atelier("grosse");
        let zip = archive(
            &base,
            "Jeu.zip",
            &[("demo.gb", b"petit"), ("jeu.gb", b"un contenu bien plus gros que l'autre")],
        );

        let sortie = deballer(&zip, &exts(&["gb", "gbc"]), &base.join("sortie")).expect("déballage");
        let contenu = std::fs::read(&sortie.fichier).expect("relecture");
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(contenu, b"un contenu bien plus gros que l'autre");
    }

    #[test]
    fn ignore_ce_que_le_coeur_n_ouvre_pas() {
        let base = atelier("ignore");
        let zip = archive(
            &base,
            "Jeu.zip",
            &[("jeu.nes", b"la rom"), ("notice.txt", b"bien plus long que la rom, mais pas un jeu")],
        );

        let sortie = deballer(&zip, &exts(&["nes"]), &base.join("sortie")).expect("déballage");
        let contenu = std::fs::read(&sortie.fichier).expect("relecture");
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(contenu, b"la rom", "la notice est plus grosse, mais n'est pas un jeu");
    }

    #[test]
    fn refuse_avec_des_mots_une_archive_sans_rom_utile() {
        let base = atelier("vide");
        let zip = archive(&base, "Photos.zip", &[("vacances.jpg", b"x")]);

        let refus = deballer(&zip, &exts(&["sfc"]), &base.join("sortie")).expect_err("refus attendu");
        let _ = std::fs::remove_dir_all(&base);

        assert!(refus.contains("aucun fichier"), "refus peu clair : {refus}");
        assert!(refus.contains("sfc"), "il doit dire ce qu'il cherchait : {refus}");
    }

    #[test]
    fn un_disque_sort_en_entier() {
        // Un feuillet ne désigne rien seul : ses pistes sont d'autres fichiers.
        let base = atelier("disque");
        let zip = archive(
            &base,
            "Jeu.zip",
            &[
                ("Jeu.cue", b"FILE \"Jeu.bin\" BINARY"),
                ("Jeu.bin", b"les donnees du disque"),
            ],
        );

        let sortie = deballer(&zip, &exts(&["cue", "bin", "chd"]), &base.join("sortie")).expect("déballage");
        let piste = sortie.dossier.join("Jeu.bin").exists();
        let nom = sortie.fichier.file_name().unwrap().to_string_lossy().into_owned();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(nom, "Jeu.cue", "c'est le feuillet qu'on donne au cœur");
        assert!(piste, "et sa piste est à côté, là où il la cherche");
    }

    #[test]
    fn ne_sort_pas_de_son_dossier() {
        // Une entrée qui prétend écrire hors de la destination est ignorée.
        let base = atelier("evasion");
        let zip = archive(
            &base,
            "Piege.zip",
            &[("../evade.cue", b"non"), ("Piege.cue", b"oui")],
        );

        let _ = deballer(&zip, &exts(&["cue"]), &base.join("sortie"));
        let dehors = base.join("evade.cue").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert!(!dehors, "un chemin qui remonte ne doit rien écrire");
    }

    #[test]
    fn reconnait_une_archive_a_son_extension() {
        assert!(est_une_archive(Path::new("C:/jeux/Zelda.zip")));
        assert!(est_une_archive(Path::new("C:/jeux/ZELDA.ZIP")));
        assert!(!est_une_archive(Path::new("C:/jeux/Zelda.sfc")));
        assert!(!est_une_archive(Path::new("C:/jeux/zip")));
    }
}
