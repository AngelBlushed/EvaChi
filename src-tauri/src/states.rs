//! Les sauvegardes d'état, sur le disque.
//!
//! Un cœur libretro sait rendre son état en un bloc d'octets et le reprendre
//! plus tard. Jusqu'ici EvaChi gardait ce bloc dans une variable : il était
//! perdu en fermant la fenêtre, perdu en changeant de jeu, et il n'y en avait
//! qu'un. Une sauvegarde qu'on perd n'est pas une sauvegarde.
//!
//! Chaque jeu a ses emplacements, dans un dossier à lui. À côté de l'état on
//! range une image de l'écran au moment de la sauvegarde : devant quatre
//! emplacements datés, c'est la vignette qui dit lequel est le bon, pas
//! l'heure.

use std::path::{Path, PathBuf};

/// Taille au-delà de laquelle un état est refusé.
///
/// Les plus gros — PlayStation, Saturn — tiennent sous une vingtaine de
/// mégaoctets. Au-delà, quelque chose s'est mal passé en chemin.
const MAX_ETAT: usize = 64 * 1024 * 1024;

/// Taille au-delà de laquelle la vignette est refusée.
const MAX_VIGNETTE: usize = 4 * 1024 * 1024;

/// Combien d'emplacements par jeu.
///
/// Quatre : assez pour garder un début de niveau, un passage difficile et un
/// essai en cours, pas assez pour qu'on hésite devant la liste.
pub const EMPLACEMENTS: u8 = 4;

/// Un emplacement, occupé ou non.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Emplacement {
    pub slot: u8,
    /// Vrai quand quelque chose y est rangé.
    pub filled: bool,
    /// Quand la sauvegarde a été faite, en secondes depuis 1970.
    pub taken: u64,
    /// Taille de l'état, en octets.
    pub size: u64,
    /// L'image de l'écran au moment de la sauvegarde, prête à afficher.
    pub shot: String,
}

/// Le dossier des sauvegardes d'un jeu.
///
/// Nommé d'après le chemin du jeu et non d'après son titre : deux jeux de même
/// nom dans deux dossiers doivent avoir des sauvegardes distinctes, et un jeu
/// renommé ne doit pas hériter de celles d'un autre.
fn dossier_du_jeu(base: &Path, rom_path: &str) -> PathBuf {
    base.join("etats").join(crate::manual::nom_de_dossier(rom_path))
}

fn fichier_etat(base: &Path, rom_path: &str, slot: u8) -> PathBuf {
    dossier_du_jeu(base, rom_path).join(format!("{slot}.etat"))
}

fn fichier_vignette(base: &Path, rom_path: &str, slot: u8) -> PathBuf {
    dossier_du_jeu(base, rom_path).join(format!("{slot}.png"))
}

/// Vrai quand l'emplacement demandé existe.
fn emplacement_valide(slot: u8) -> bool {
    slot < EMPLACEMENTS
}

/// Écrit un état et sa vignette.
pub fn poser(
    base: &Path,
    rom_path: &str,
    slot: u8,
    etat: &str,
    vignette: &str,
    instant: u64,
) -> Result<(), String> {
    if !emplacement_valide(slot) {
        return Err(format!("emplacement {slot} inconnu"));
    }

    let octets = crate::b64::decode(etat, MAX_ETAT)?;
    if octets.is_empty() {
        return Err("état vide".into());
    }

    let dossier = dossier_du_jeu(base, rom_path);
    std::fs::create_dir_all(&dossier).map_err(|error| format!("dossier : {error}"))?;

    // L'état d'abord, la vignette ensuite : si l'écriture échoue en chemin,
    // mieux vaut un état sans image qu'une image sans état.
    std::fs::write(fichier_etat(base, rom_path, slot), &octets)
        .map_err(|error| format!("écriture : {error}"))?;

    // L'heure est rangée dans le nom d'un fichier témoin plutôt que lue sur le
    // fichier lui-même : une copie de dossier remet toutes les dates à
    // aujourd'hui, et on perdrait l'ordre des sauvegardes.
    std::fs::write(dossier.join(format!("{slot}.heure")), instant.to_string())
        .map_err(|error| format!("écriture : {error}"))?;

    if let Ok(image) = crate::b64::depuis_data(vignette, MAX_VIGNETTE) {
        let _ = std::fs::write(fichier_vignette(base, rom_path, slot), image);
    }
    Ok(())
}

/// Relit un état, prêt à être renvoyé au cœur.
pub fn lire(base: &Path, rom_path: &str, slot: u8) -> Result<String, String> {
    if !emplacement_valide(slot) {
        return Err(format!("emplacement {slot} inconnu"));
    }
    let octets = std::fs::read(fichier_etat(base, rom_path, slot))
        .map_err(|_| format!("emplacement {} vide", slot + 1))?;
    Ok(crate::b64::encode(&octets))
}

/// L'heure d'une sauvegarde, ou zéro si on ne la connaît pas.
fn heure(base: &Path, rom_path: &str, slot: u8) -> u64 {
    std::fs::read_to_string(dossier_du_jeu(base, rom_path).join(format!("{slot}.heure")))
        .ok()
        .and_then(|texte| texte.trim().parse().ok())
        .unwrap_or_default()
}

/// L'état de tous les emplacements d'un jeu.
pub fn lister(base: &Path, rom_path: &str) -> Vec<Emplacement> {
    (0..EMPLACEMENTS)
        .map(|slot| {
            let chemin = fichier_etat(base, rom_path, slot);
            let taille = std::fs::metadata(&chemin).map(|m| m.len()).unwrap_or_default();
            let rempli = taille > 0;

            let shot = if rempli {
                std::fs::read(fichier_vignette(base, rom_path, slot))
                    .map(|octets| format!("data:image/png;base64,{}", crate::b64::encode(&octets)))
                    .unwrap_or_default()
            } else {
                String::new()
            };

            Emplacement {
                slot,
                filled: rempli,
                taken: if rempli { heure(base, rom_path, slot) } else { 0 },
                size: taille,
                shot,
            }
        })
        .collect()
}

/// Vide un emplacement.
pub fn effacer(base: &Path, rom_path: &str, slot: u8) -> Result<(), String> {
    if !emplacement_valide(slot) {
        return Err(format!("emplacement {slot} inconnu"));
    }
    let dossier = dossier_du_jeu(base, rom_path);
    let _ = std::fs::remove_file(fichier_etat(base, rom_path, slot));
    let _ = std::fs::remove_file(fichier_vignette(base, rom_path, slot));
    let _ = std::fs::remove_file(dossier.join(format!("{slot}.heure")));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bac(nom: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!("evachi-etats-{}-{nom}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("dossier");
        base
    }

    const JEU: &str = r"D:\roms\Nes\Zelda.nes";

    #[test]
    fn range_relit_et_efface() {
        let base = bac("cycle");
        let etat = crate::b64::encode(b"etat du coeur");
        let vignette = "data:image/png;base64,Zm9vYmFy";

        poser(&base, JEU, 1, &etat, vignette, 1_700_000_000).expect("pose");

        let emplacements = lister(&base, JEU);
        assert_eq!(emplacements.len(), EMPLACEMENTS as usize);
        assert!(!emplacements[0].filled);
        assert!(emplacements[1].filled);
        assert_eq!(emplacements[1].taken, 1_700_000_000);
        assert_eq!(emplacements[1].size, 13);
        assert!(emplacements[1].shot.starts_with("data:image/png;base64,"));

        assert_eq!(lire(&base, JEU, 1).expect("relecture"), etat);

        effacer(&base, JEU, 1).expect("effacement");
        assert!(!lister(&base, JEU)[1].filled);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn deux_jeux_ne_partagent_pas_leurs_emplacements() {
        // Deux dossiers, un même titre : la sauvegarde de l'un ne doit pas
        // apparaître chez l'autre.
        let base = bac("separes");
        let etat = crate::b64::encode(b"un");
        poser(&base, r"D:\usa\Sonic.md", 0, &etat, "", 1).expect("pose");

        assert!(lister(&base, r"D:\usa\Sonic.md")[0].filled);
        assert!(!lister(&base, r"D:\japon\Sonic.md")[0].filled);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn un_emplacement_vide_se_relit_sans_exploser() {
        let base = bac("vide");
        assert!(lire(&base, JEU, 0).is_err());
        assert!(lister(&base, JEU).iter().all(|e| !e.filled));
        // Effacer ce qui n'existe pas n'est pas une erreur : c'est déjà fait.
        assert!(effacer(&base, JEU, 0).is_ok());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn refuse_un_emplacement_hors_liste() {
        let base = bac("hors");
        assert!(poser(&base, JEU, 9, "Zm9v", "", 1).is_err());
        assert!(lire(&base, JEU, 9).is_err());
        assert!(effacer(&base, JEU, 9).is_err());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn refuse_un_etat_vide() {
        // Un cœur qui ne sait pas se sauvegarder rend un bloc vide ; l'écrire
        // donnerait un emplacement qui paraît occupé et ne recharge rien.
        let base = bac("nul");
        assert!(poser(&base, JEU, 0, "", "", 1).is_err());
        assert!(!lister(&base, JEU)[0].filled);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn une_sauvegarde_en_remplace_une_autre() {
        let base = bac("remplace");
        poser(&base, JEU, 0, &crate::b64::encode(b"ancien"), "", 1).expect("un");
        poser(&base, JEU, 0, &crate::b64::encode(b"nouveau long"), "", 2).expect("deux");

        let emplacements = lister(&base, JEU);
        assert_eq!(emplacements[0].size, 12);
        assert_eq!(emplacements[0].taken, 2);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn garde_l_etat_meme_sans_vignette() {
        // Une vignette illisible ne doit pas emporter la sauvegarde avec elle.
        let base = bac("sans-image");
        poser(&base, JEU, 0, &crate::b64::encode(b"etat"), "n'importe quoi", 5).expect("pose");
        assert!(lister(&base, JEU)[0].filled);
        assert!(lister(&base, JEU)[0].shot.is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }
}
