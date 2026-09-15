//! Les captures d'écran.
//!
//! La fenêtre sait dessiner l'image du jeu ; elle ne sait pas l'écrire sur le
//! disque, et un navigateur refuse tout téléchargement lancé par la page
//! elle-même. C'est donc ici qu'on la pose, dans un dossier à part que la
//! galerie relit ensuite.
//!
//! Les images sont nommées d'après le jeu et l'instant : deux captures du même
//! jeu doivent coexister, et un nom qui se relit permet de retrouver la bonne
//! sans ouvrir vingt vignettes.

use std::path::{Path, PathBuf};

/// Taille au-delà de laquelle une capture est refusée.
///
/// Une image de console tient largement sous cinq mégaoctets. Au-delà, ce
/// n'est plus une capture mais une erreur de calcul quelque part.
const MAX_SHOT: usize = 16 * 1024 * 1024;

/// Combien de captures la galerie relit au plus.
///
/// Elles sont rendues en `data:`, donc chacune traverse le pont vers la
/// fenêtre. Passé quelques centaines, l'ouverture de la galerie se sentirait.
pub const MAX_GALERIE: usize = 300;

/// Une capture posée sur le disque.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shot {
    /// Nom du fichier, qui sert aussi d'identifiant.
    pub file: String,
    /// Le jeu d'où elle vient, tel qu'il était nommé.
    pub game: String,
    /// Quand elle a été prise, en secondes depuis 1970.
    pub taken: u64,
    /// L'image, prête à afficher.
    pub data: String,
}

/// Réduit un nom de jeu à ce qui tient dans un nom de fichier.
pub fn nom_sain(jeu: &str) -> String {
    let sans_extension = jeu.rsplit_once('.').map_or(jeu, |(tete, _)| tete);
    let propre: String = sans_extension
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();

    // Les tirets s'accumulent vite — « Sonic (USA, Europe) » en donne cinq à la
    // suite — et un nom de fichier n'en a que faire.
    let mut sortie = String::with_capacity(propre.len());
    let mut tiret = false;
    for c in propre.chars() {
        if c == '-' {
            if !tiret {
                sortie.push('-');
            }
            tiret = true;
        } else {
            sortie.push(c);
            tiret = false;
        }
    }
    let taille = sortie.trim_matches('-').chars().take(60).collect::<String>();
    if taille.is_empty() {
        "capture".to_owned()
    } else {
        taille
    }
}

/// Le dossier des captures.
pub fn dossier(base: &Path) -> PathBuf {
    base.join("captures")
}

/// Décode une adresse `data:image/png;base64,…` en octets.
///
/// La fenêtre nous envoie l'image sous cette forme : c'est ce que rend le
/// canevas, et la convertir en tableau d'octets avant l'envoi coûterait un
/// aller-retour de plus pour rien.
pub fn depuis_data(adresse: &str) -> Result<Vec<u8>, String> {
    let (entete, charge) = adresse
        .split_once(',')
        .ok_or_else(|| "image sans en-tête".to_string())?;
    if !entete.contains("base64") {
        return Err("image non encodée en base64".into());
    }
    decode_base64(charge)
}

/// Décode du base64, sans dépendance.
fn decode_base64(texte: &str) -> Result<Vec<u8>, String> {
    let valeur = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => u32::from(c - b'A'),
            b'a'..=b'z' => u32::from(c - b'a') + 26,
            b'0'..=b'9' => u32::from(c - b'0') + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        })
    };

    let utiles: Vec<u8> = texte
        .bytes()
        .filter(|c| !c.is_ascii_whitespace() && *c != b'=')
        .collect();

    let mut sortie = Vec::with_capacity(utiles.len() / 4 * 3);
    for morceau in utiles.chunks(4) {
        let mut assemble = 0u32;
        for (rang, c) in morceau.iter().enumerate() {
            let v = valeur(*c).ok_or_else(|| format!("caractère inattendu : {}", *c as char))?;
            assemble |= v << (18 - 6 * rang);
        }
        // Un morceau de n caractères porte n-1 octets utiles.
        for rang in 0..morceau.len().saturating_sub(1) {
            sortie.push(((assemble >> (16 - 8 * rang)) & 0xFF) as u8);
        }
        if sortie.len() > MAX_SHOT {
            return Err("capture trop lourde".into());
        }
    }
    Ok(sortie)
}

/// Écrit une capture et rend son nom de fichier.
pub fn poser(base: &Path, jeu: &str, adresse: &str, instant: u64) -> Result<String, String> {
    let octets = depuis_data(adresse)?;
    if octets.is_empty() {
        return Err("capture vide".into());
    }

    let dossier = dossier(base);
    std::fs::create_dir_all(&dossier).map_err(|error| format!("dossier : {error}"))?;

    let nom = format!("{}-{instant}.png", nom_sain(jeu));
    std::fs::write(dossier.join(&nom), &octets).map_err(|error| format!("écriture : {error}"))?;
    Ok(nom)
}

/// Le nom du jeu et l'instant, relus depuis un nom de fichier.
pub fn depuis_nom(fichier: &str) -> (String, u64) {
    let tige = fichier.strip_suffix(".png").unwrap_or(fichier);
    match tige.rsplit_once('-') {
        Some((jeu, instant)) => match instant.parse() {
            Ok(secondes) => (jeu.replace('-', " "), secondes),
            Err(_) => (tige.replace('-', " "), 0),
        },
        None => (tige.replace('-', " "), 0),
    }
}

/// Toutes les captures, la plus récente d'abord.
pub fn toutes(base: &Path) -> Vec<Shot> {
    let dossier = dossier(base);
    let Ok(entrees) = std::fs::read_dir(&dossier) else {
        return Vec::new();
    };

    let mut fichiers: Vec<String> = entrees
        .filter_map(Result::ok)
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|nom| nom.ends_with(".png"))
        .collect();

    // Le nom porte l'instant : trier dessus revient à trier par date, sans
    // interroger le système de fichiers une fois par image.
    fichiers.sort_by_key(|nom| std::cmp::Reverse(depuis_nom(nom).1));
    fichiers.truncate(MAX_GALERIE);

    fichiers
        .into_iter()
        .filter_map(|fichier| {
            let octets = std::fs::read(dossier.join(&fichier)).ok()?;
            let (jeu, instant) = depuis_nom(&fichier);
            Some(Shot {
                file: fichier,
                game: jeu,
                taken: instant,
                data: format!("data:image/png;base64,{}", crate::manual::encode_base64(&octets)),
            })
        })
        .collect()
}

/// Efface une capture. Le nom est vérifié : il vient de la fenêtre.
pub fn effacer(base: &Path, fichier: &str) -> Result<(), String> {
    // Un nom qui contiendrait un séparateur pourrait désigner un fichier hors
    // du dossier des captures. On n'accepte donc qu'un nom simple.
    if fichier.contains(['/', '\\']) || fichier.contains("..") || !fichier.ends_with(".png") {
        return Err("nom de capture refusé".into());
    }
    std::fs::remove_file(dossier(base).join(fichier)).map_err(|error| format!("{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nettoie_un_nom_de_jeu() {
        assert_eq!(nom_sain("Sonic The Hedgehog (USA, Europe).md"), "Sonic-The-Hedgehog-USA-Europe");
        assert_eq!(nom_sain("Zelda.nes"), "Zelda");
    }

    #[test]
    fn ne_rend_jamais_un_nom_vide() {
        // Un jeu dont le nom ne tient qu'en ponctuation donnerait un fichier
        // sans nom, que le système refuserait.
        assert_eq!(nom_sain("!!!.bin"), "capture");
        assert_eq!(nom_sain(""), "capture");
    }

    #[test]
    fn le_nom_se_relit() {
        let nom = format!("{}-{}.png", nom_sain("Sonic (USA).md"), 1_700_000_000_u64);
        let (jeu, instant) = depuis_nom(&nom);
        assert_eq!(jeu, "Sonic USA");
        assert_eq!(instant, 1_700_000_000);
    }

    #[test]
    fn decode_ce_que_le_canevas_envoie() {
        // Les exemples de la RFC 4648, dans l'autre sens.
        assert_eq!(decode_base64("Zm9vYmFy").unwrap(), b"foobar");
        assert_eq!(decode_base64("Zg==").unwrap(), b"f");
        assert_eq!(decode_base64("Zm8=").unwrap(), b"fo");
    }

    #[test]
    fn refuse_une_adresse_qui_n_en_est_pas_une() {
        assert!(depuis_data("pas une adresse").is_err());
        assert!(depuis_data("data:image/png,brut").is_err());
    }

    #[test]
    fn refuse_un_nom_qui_sort_du_dossier() {
        let base = std::env::temp_dir();
        assert!(effacer(&base, "../config.json").is_err());
        assert!(effacer(&base, "sous/dossier.png").is_err());
        assert!(effacer(&base, "notes.txt").is_err());
    }

    #[test]
    fn pose_et_relit_une_capture() {
        let base = std::env::temp_dir().join(format!("evachi-shots-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("dossier");

        // « foobar » n'est pas un PNG, mais rien ici ne le décode.
        let adresse = "data:image/png;base64,Zm9vYmFy";
        let nom = poser(&base, "Sonic (USA).md", adresse, 1_700_000_000).expect("pose");
        assert!(nom.starts_with("Sonic-USA-"));

        let liste = toutes(&base);
        assert_eq!(liste.len(), 1);
        assert_eq!(liste[0].game, "Sonic USA");
        assert_eq!(liste[0].taken, 1_700_000_000);

        effacer(&base, &nom).expect("effacement");
        assert!(toutes(&base).is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn range_la_plus_recente_en_tete() {
        let base = std::env::temp_dir().join(format!("evachi-shots-ordre-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("dossier");

        let adresse = "data:image/png;base64,Zm9v";
        poser(&base, "Ancien.md", adresse, 1_000).expect("un");
        poser(&base, "Recent.md", adresse, 2_000).expect("deux");

        let liste = toutes(&base);
        assert_eq!(liste[0].game, "Recent");
        assert_eq!(liste[1].game, "Ancien");
        let _ = std::fs::remove_dir_all(&base);
    }
}
