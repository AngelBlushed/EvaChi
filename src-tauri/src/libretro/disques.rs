//! Les disques d'un jeu qui en a plusieurs.
//!
//! Un jeu de PlayStation tient parfois sur trois ou quatre disques, et le
//! demande en cours de partie : « veuillez insérer le disque 2 ». libretro
//! prévoit pour cela une table que le cœur tend à l'hôte — éjecter, changer,
//! refermer. Encore faut-il que le cœur sache qu'il y a d'autres disques.
//!
//! Chargé depuis un `.m3u`, il le sait : le feuillet les énumère. Chargé
//! depuis le premier disque, il n'en connaît qu'un, et c'est ainsi que la
//! plupart des jeux arrivent — `Final Fantasy IX (Europe) (Disc 1).cue` et ses
//! voisins, rangés côte à côte. Ce module retrouve les voisins par leur nom.

use std::path::{Path, PathBuf};

/// Les façons d'écrire « disque » dans un nom de fichier.
///
/// Celles des deux catalogues qui font référence — `(Disc 1)` chez Redump et
/// No-Intro —, plus les abréviations qu'on trouve partout ailleurs. La
/// comparaison ignore la casse.
const MOTS: &[&str] = &["disc", "disk", "disque", "cd"];

/// Découpe un nom en ce qui précède le numéro de disque, le numéro tel qu'il
/// est écrit, et la suite. Rend `None` quand le nom ne parle pas de disque.
///
/// Le numéro est rendu en chiffres et non en nombre : « 01 » et « 1 » sont le
/// même disque, mais pas le même nom de fichier, et le voisin qu'on cherchera
/// s'écrit comme celui qu'on a.
///
/// Le numéro se reconnaît à ce qui l'entoure : un mot de [`MOTS`] juste avant,
/// éventuellement séparé par une espace. « Track 02 » n'en est pas un — c'est
/// une piste audio du même disque —, et « Sonic 3 » non plus.
fn decouper(nom: &str) -> Option<(String, String, String)> {
    let bas = nom.to_lowercase();

    for mot in MOTS {
        let mut depuis = 0;
        while let Some(trouve) = bas[depuis..].find(mot) {
            let debut = depuis + trouve;
            depuis = debut + mot.len();

            // Le mot doit commencer un mot : « discographie » n'en est pas un,
            // et « CD » dans « SCD » non plus.
            let avant_ok = debut == 0 || !bas.as_bytes()[debut - 1].is_ascii_alphanumeric();
            if !avant_ok {
                continue;
            }

            // Puis le numéro, avec ou sans espace entre les deux.
            let reste = &bas[depuis..];
            let sans_espace = reste.trim_start_matches([' ', '_', '-']);
            let mange = reste.len() - sans_espace.len();
            let chiffres: String = sans_espace.chars().take_while(char::is_ascii_digit).collect();
            if chiffres.is_empty() {
                continue;
            }
            let coupe = depuis + mange;
            return Some((
                nom[..coupe].to_owned(),
                nom[coupe..coupe + chiffres.len()].to_owned(),
                nom[coupe + chiffres.len()..].to_owned(),
            ));
        }
    }
    None
}

/// Le nom du même jeu, au disque demandé, en gardant la forme du nom d'origine.
///
/// « Disc 01 » et « Disc 1 » sont deux façons de nommer : le voisin porte
/// celle du fichier qu'on a ouvert, sans quoi on le chercherait où il n'est
/// pas.
fn renommer(nom: &str, numero: u32, largeur: usize) -> Option<String> {
    let (avant, _, apres) = decouper(nom)?;
    Some(format!("{avant}{numero:0largeur$}{apres}"))
}

/// Les disques d'un jeu, le premier compris, dans l'ordre de leur numéro.
///
/// Rend un tableau vide quand le nom ne parle pas de disque ou qu'aucun voisin
/// n'existe : il n'y a alors rien à proposer, et proposer un seul disque à
/// changer serait une commande qui ne sert à rien.
///
/// Les voisins sont cherchés par leur nom dans le même dossier, du disque un
/// jusqu'au premier manquant. On s'arrête au premier trou plutôt que de
/// parcourir le dossier : un jeu dont le disque deux manque n'a pas un disque
/// trois utile, et une bibliothèque de mille fichiers n'a pas à être lue.
pub fn voisins(chemin: &Path) -> Vec<PathBuf> {
    let Some(nom) = chemin.file_name().and_then(|nom| nom.to_str()) else {
        return Vec::new();
    };
    let Some((_, chiffres, _)) = decouper(nom) else {
        return Vec::new();
    };
    let Ok(numero) = chiffres.parse::<u32>() else {
        return Vec::new();
    };
    let dossier = chemin.parent().unwrap_or_else(|| Path::new("."));
    let largeur = chiffres.len();

    let mut trouves = Vec::new();
    for rang in 1..=32u32 {
        let Some(voisin) = renommer(nom, rang, largeur) else {
            break;
        };
        let candidat = dossier.join(&voisin);
        if !candidat.is_file() {
            // Le premier disque manquant arrête la recherche, sauf s'il s'agit
            // d'un numéro plus petit que celui qu'on a ouvert : un jeu peut
            // être rangé à partir de zéro, ou avoir été ouvert par son
            // deuxième disque.
            if rang > numero {
                break;
            }
            continue;
        }
        trouves.push(candidat);
    }

    if trouves.len() < 2 {
        return Vec::new();
    }
    trouves
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconnait_les_facons_d_ecrire_disque() {
        assert_eq!(
            decouper("Final Fantasy IX (Europe) (Disc 1).cue"),
            Some((
                "Final Fantasy IX (Europe) (Disc ".to_owned(),
                "1".to_owned(),
                ").cue".to_owned()
            ))
        );
        let numero = |nom: &str| decouper(nom).map(|(_, chiffres, _)| chiffres);
        assert_eq!(numero("Jeu (CD2).bin").as_deref(), Some("2"));
        assert_eq!(numero("Jeu (Disque 3).chd").as_deref(), Some("3"));
        assert_eq!(numero("Jeu (disk 04).cue").as_deref(), Some("04"), "la forme est gardée");
    }

    #[test]
    fn ne_prend_pas_une_piste_pour_un_disque() {
        // Un disque de Saturn arrive en dix pistes : les confondre ferait
        // proposer dix « disques » qui sont le même.
        assert_eq!(decouper("Dead or Alive (Japan) (2M) (Track 02).bin"), None);
        assert_eq!(decouper("Sonic 3.md"), None);
        assert_eq!(decouper("Discographie 2.iso"), None, "un mot qui commence pareil");
    }

    #[test]
    fn garde_la_forme_du_nom() {
        assert_eq!(
            renommer("Jeu (Disc 1).cue", 2, 1).as_deref(),
            Some("Jeu (Disc 2).cue")
        );
        assert_eq!(
            renommer("Jeu (Disc 01).cue", 2, 2).as_deref(),
            Some("Jeu (Disc 02).cue")
        );
    }

    /// Un dossier de travail à soi.
    fn atelier(nom: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!("evachi-disques-{nom}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("dossier de test");
        base
    }

    #[test]
    fn retrouve_les_disques_voisins() {
        let base = atelier("voisins");
        for rang in 1..=3 {
            std::fs::write(base.join(format!("Final Fantasy IX (Disc {rang}).cue")), b"")
                .expect("disque");
        }
        // Un fichier qui ressemble mais n'en est pas un.
        std::fs::write(base.join("Final Fantasy IX (Disc 1).bin"), b"").expect("piste");

        let trouves = voisins(&base.join("Final Fantasy IX (Disc 1).cue"));
        let noms: Vec<String> = trouves
            .iter()
            .map(|chemin| chemin.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(
            noms,
            vec![
                "Final Fantasy IX (Disc 1).cue",
                "Final Fantasy IX (Disc 2).cue",
                "Final Fantasy IX (Disc 3).cue",
            ]
        );
    }

    #[test]
    fn un_disque_seul_ne_propose_rien() {
        // Le cas d'aujourd'hui sur cette machine : le premier disque, et rien
        // d'autre. Une commande « changer de disque » avec un seul disque
        // serait une commande qui ne fait rien.
        let base = atelier("seul");
        std::fs::write(base.join("Final Fantasy IX (Disc 1).cue"), b"").expect("disque");

        let trouves = voisins(&base.join("Final Fantasy IX (Disc 1).cue"));
        let _ = std::fs::remove_dir_all(&base);

        assert!(trouves.is_empty());
    }

    #[test]
    fn s_arrete_au_premier_trou() {
        // Les disques 1, 2 et 4 : le quatrième ne se propose pas, le jeu ne
        // saurait pas quoi en faire à la place du troisième.
        let base = atelier("trou");
        for rang in [1, 2, 4] {
            std::fs::write(base.join(format!("Jeu (Disc {rang}).cue")), b"").expect("disque");
        }

        let trouves = voisins(&base.join("Jeu (Disc 1).cue"));
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(trouves.len(), 2);
    }

    #[test]
    fn se_retrouve_meme_ouvert_par_le_deuxieme() {
        let base = atelier("deuxieme");
        for rang in 1..=2 {
            std::fs::write(base.join(format!("Jeu (Disc {rang}).cue")), b"").expect("disque");
        }

        let trouves = voisins(&base.join("Jeu (Disc 2).cue"));
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(trouves.len(), 2, "les deux, dans l'ordre");
        assert!(trouves[0].to_string_lossy().contains("Disc 1"));
    }
}
