//! Les sauvegardes que le jeu écrit lui-même.
//!
//! Rien à voir avec les emplacements : ceux-là sont des instantanés de la
//! console entière, pris par EvaChi et rangés par elle. Ici, c'est la pile de
//! la cartouche — le fichier où le jeu note ses trois parties, ses records et
//! ses réglages, et qu'il relit au démarrage suivant. C'est le cœur qui l'écrit,
//! sous le nom du jeu, dans le dossier des sauvegardes.
//!
//! Recommencer un jeu depuis le début demande donc de retirer ce fichier-là,
//! et lui seul. On ne le devine pas : on va le chercher, on le nomme, et on ne
//! touche à rien d'autre.

use std::path::{Path, PathBuf};

/// Jusqu'où descendre dans le dossier des sauvegardes.
///
/// Presque tous les cœurs écrivent à plat ; quelques-uns rangent par système
/// ou par cœur. Deux étages couvrent les deux, sans partir explorer un disque
/// entier si quelqu'un a désigné un dossier de sauvegardes mal choisi.
const PROFONDEUR: usize = 2;

/// Un fichier de sauvegarde retrouvé.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Pile {
    /// Le nom du fichier, tel qu'il s'affiche.
    pub nom: String,
    /// Sa taille, en octets.
    pub taille: u64,
}

/// La souche d'un jeu : son nom de fichier sans extension, en minuscules.
pub fn souche(rom_path: &str) -> String {
    Path::new(rom_path)
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

/// Vrai quand ce fichier est une sauvegarde de ce jeu-là.
///
/// Les cœurs nomment la pile d'après le contenu chargé, en changeant
/// l'extension : `Mario.nes` donne `Mario.srm`, `Mario.sav`, `Mario.eep` selon
/// la machine. Certains empilent les suffixes — `Mario.srm.bak` — d'où le cas
/// du point.
///
/// La comparaison est stricte sur la souche entière. « Mario » ne doit pas
/// emporter la pile de « Mario Kart » : ce sont deux jeux, et l'un des deux
/// perdrait sa partie sans qu'on lui ait rien demandé.
pub fn appartient(fichier: &str, souche: &str) -> bool {
    if souche.is_empty() {
        return false;
    }
    let nom = fichier.to_lowercase();
    let Some(sans_extension) = Path::new(&nom).file_stem().map(|s| s.to_string_lossy().into_owned())
    else {
        return false;
    };

    // Le fichier doit avoir une extension : le jeu lui-même n'en manque jamais,
    // et un dossier ou un fichier nu qui porterait le nom du jeu n'est pas une
    // pile.
    if !nom.contains('.') {
        return false;
    }

    sans_extension == souche
        || (sans_extension.starts_with(souche) && sans_extension[souche.len()..].starts_with('.'))
}

/// Les fichiers de sauvegarde d'un jeu, du plus proche au plus lointain.
pub fn trouvees(base: &Path, rom_path: &str) -> Vec<PathBuf> {
    let souche = souche(rom_path);
    if souche.is_empty() {
        return Vec::new();
    }

    let mut trouvees = Vec::new();
    ramasser(base, &souche, 0, &mut trouvees);
    trouvees.sort();
    trouvees
}

fn ramasser(dossier: &Path, souche: &str, etage: usize, dans: &mut Vec<PathBuf>) {
    let Ok(entrees) = std::fs::read_dir(dossier) else {
        return;
    };

    for entree in entrees.flatten() {
        let chemin = entree.path();
        if chemin.is_dir() {
            if etage < PROFONDEUR {
                ramasser(&chemin, souche, etage + 1, dans);
            }
            continue;
        }
        let Some(nom) = chemin.file_name().map(|nom| nom.to_string_lossy().into_owned()) else {
            continue;
        };
        if appartient(&nom, souche) {
            dans.push(chemin);
        }
    }
}

/// Ce qu'on s'apprête à effacer, nommé et pesé.
pub fn listees(base: &Path, rom_path: &str) -> Vec<Pile> {
    trouvees(base, rom_path)
        .into_iter()
        .map(|chemin| Pile {
            nom: chemin
                .file_name()
                .map(|nom| nom.to_string_lossy().into_owned())
                .unwrap_or_default(),
            taille: std::fs::metadata(&chemin).map(|info| info.len()).unwrap_or(0),
        })
        .collect()
}

/// Efface la pile d'un jeu. Rend le nombre de fichiers retirés.
///
/// Le premier échec arrête tout et le dit : effacer la moitié d'une sauvegarde
/// laisserait un jeu dans un état que personne n'a voulu.
pub fn effacer(base: &Path, rom_path: &str) -> Result<usize, String> {
    let mut retires = 0;
    for chemin in trouvees(base, rom_path) {
        std::fs::remove_file(&chemin)
            .map_err(|error| format!("{} : {error}", chemin.display()))?;
        retires += 1;
    }
    Ok(retires)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);

        let base = std::env::temp_dir().join(format!(
            "evachi-piles-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("dossier");
        base
    }

    #[test]
    fn reconnait_la_pile_du_jeu() {
        assert!(appartient("Mario.srm", "mario"));
        assert!(appartient("MARIO.SAV", "mario"));
        assert!(appartient("Mario.srm.bak", "mario"));
    }

    #[test]
    fn ne_prend_pas_la_pile_du_voisin() {
        // Le piège : deux jeux dont l'un commence comme l'autre. Effacer la
        // partie de quelqu'un parce qu'il a deux Mario serait impardonnable.
        assert!(!appartient("Mario Kart.srm", "mario"));
        assert!(!appartient("Mario2.srm", "mario"));
        assert!(!appartient("Super Mario.srm", "mario"));
    }

    #[test]
    fn ne_prend_ni_dossier_ni_fichier_nu() {
        assert!(!appartient("Mario", "mario"));
        assert!(!appartient("", "mario"));
    }

    #[test]
    fn ne_prend_rien_sans_souche() {
        // Un jeu sans nom de fichier n'a pas de pile : tout ramasser serait
        // la seule autre réponse possible, et c'est la pire.
        assert!(!appartient("Mario.srm", ""));
        assert!(trouvees(Path::new("."), "").is_empty());
    }

    #[test]
    fn trouve_la_pile_a_plat_et_d_un_etage() {
        let base = scratch();
        std::fs::write(base.join("Zelda.srm"), b"une partie").expect("pile");
        std::fs::create_dir_all(base.join("mesen")).expect("dossier");
        std::fs::write(base.join("mesen").join("Zelda.sav"), b"une autre").expect("pile");
        std::fs::write(base.join("Autre.srm"), b"pas la sienne").expect("pile");

        let piles = listees(&base, "C:/jeux/Zelda.nes");
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(piles.len(), 2, "les deux étages sont visités");
        assert!(piles.iter().all(|pile| pile.nom.starts_with("Zelda")));
    }

    #[test]
    fn efface_la_sienne_et_laisse_les_autres() {
        let base = scratch();
        std::fs::write(base.join("Zelda.srm"), b"une partie").expect("pile");
        std::fs::write(base.join("Autre.srm"), b"pas la sienne").expect("pile");

        let retires = effacer(&base, "C:/jeux/Zelda.nes").expect("effacement");
        let reste = base.join("Autre.srm").exists();
        let partie = base.join("Zelda.srm").exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(retires, 1);
        assert!(reste, "la sauvegarde d'un autre jeu a été emportée");
        assert!(!partie);
    }

    #[test]
    fn n_a_rien_a_dire_quand_il_n_y_a_rien() {
        let base = scratch();
        let piles = listees(&base, "C:/jeux/Zelda.nes");
        let retires = effacer(&base, "C:/jeux/Zelda.nes").expect("effacement");
        let _ = std::fs::remove_dir_all(&base);

        assert!(piles.is_empty());
        assert_eq!(retires, 0);
    }
}
