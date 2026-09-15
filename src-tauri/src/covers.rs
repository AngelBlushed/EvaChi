//! L'inventaire des jaquettes publiées par le projet libretro.
//!
//! Le serveur rend un simple index HTML par console. La fenêtre ne peut pas
//! l'aller chercher elle-même : le serveur n'autorise pas la lecture depuis une
//! autre origine, et le navigateur refuse donc la réponse. Les images, elles,
//! passent très bien — une balise `img` n'est pas soumise à cette règle. C'est
//! donc l'index, et lui seul, qui remonte par ici.
//!
//! La liste est conservée sur le disque : quelques milliers de noms par
//! console, qu'il serait absurde de redemander à chaque ouverture.

use std::path::Path;

/// Taille au-delà de laquelle on refuse un index.
///
/// Le plus gros — la NES et ses treize mille jeux — tient sous deux mégaoctets.
const MAX_INDEX: u64 = 8 * 1024 * 1024;

/// Décode les échappements `%xx` d'une adresse.
///
/// Les noms de fichiers portent des espaces, des apostrophes et des virgules,
/// que le serveur échappe. Sans ce passage, on chercherait « Sonic%20The%20… »
/// dans une bibliothèque qui dit « Sonic The… ».
pub fn percent_decode(raw: &str) -> String {
    let octets = raw.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(octets.len());
    let mut index = 0;

    while index < octets.len() {
        if octets[index] == b'%' && index + 2 < octets.len() {
            let haut = (octets[index + 1] as char).to_digit(16);
            let bas = (octets[index + 2] as char).to_digit(16);
            if let (Some(haut), Some(bas)) = (haut, bas) {
                out.push((haut * 16 + bas) as u8);
                index += 3;
                continue;
            }
        }
        out.push(octets[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Extrait les noms de jaquettes d'un index HTML.
///
/// On ne lit pas le HTML, on y cueille les liens : le format de la page peut
/// changer, la forme d'un lien non.
pub fn parse_index(html: &str) -> Vec<String> {
    let mut noms = Vec::new();
    for morceau in html.split("href=\"").skip(1) {
        let Some(fin) = morceau.find('"') else { continue };
        let lien = &morceau[..fin];
        let Some(nom) = lien.strip_suffix(".png") else {
            continue;
        };
        // Un index en liste aussi le dossier parent : on ne garde que ce qui
        // ressemble à un fichier de ce dossier-ci.
        if nom.contains('/') {
            continue;
        }
        noms.push(percent_decode(nom));
    }
    noms
}

/// Rend un nom de console utilisable comme nom de fichier.
fn cache_name(system: &str) -> String {
    system
        .chars()
        .map(|c| match c.is_ascii_alphanumeric() {
            true => c,
            false => '-',
        })
        .collect()
}

/// L'inventaire d'une console : depuis le disque s'il y est, du serveur sinon.
pub fn index(system: &str, cache_dir: &Path) -> Result<Vec<String>, String> {
    let cache = cache_dir.join(format!("{}.txt", cache_name(system)));
    if let Ok(texte) = std::fs::read_to_string(&cache) {
        return Ok(texte.lines().map(str::to_owned).collect());
    }

    let url = format!(
        "https://thumbnails.libretro.com/{}/Named_Boxarts/",
        urlencode(system)
    );
    use std::io::Read;

    let mut html = Vec::new();
    ureq::get(&url)
        .set("User-Agent", "EvaChi")
        .call()
        .map_err(|error| format!("{system} : {error}"))?
        .into_reader()
        .take(MAX_INDEX)
        .read_to_end(&mut html)
        .map_err(|error| format!("{system} : {error}"))?;

    let noms = parse_index(&String::from_utf8_lossy(&html));

    // Un inventaire vide ne se met pas en cache : ce serait retenir une panne
    // de réseau pour toujours.
    if !noms.is_empty() {
        let _ = std::fs::create_dir_all(cache_dir);
        let _ = std::fs::write(&cache, noms.join("\n"));
    }
    Ok(noms)
}

/// Échappe ce qui doit l'être dans un segment d'adresse.
fn urlencode(raw: &str) -> String {
    raw.bytes()
        .map(|octet| match octet {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (octet as char).to_string()
            }
            _ => format!("%{octet:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_les_echappements() {
        assert_eq!(percent_decode("Sonic%20The%20Hedgehog"), "Sonic The Hedgehog");
        assert_eq!(percent_decode("Mario%20%26%20Yoshi"), "Mario & Yoshi");
        assert_eq!(percent_decode("rien-a-decoder"), "rien-a-decoder");
    }

    #[test]
    fn laisse_passer_un_pourcent_isole() {
        // Un « % » qui ne commence pas un échappement valide n'est pas une
        // raison de perdre le reste du nom.
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("50%zz"), "50%zz");
    }

    #[test]
    fn cueille_les_noms_dans_un_index() {
        let html = r#"
            <html><body>
            <a href="../">../</a>
            <a href="Sonic%20The%20Hedgehog%20(USA,%20Europe).png">Sonic…</a>
            <a href="Doom%20(Europe).png">Doom…</a>
            <a href="lisez-moi.txt">notes</a>
            </body></html>
        "#;

        assert_eq!(
            parse_index(html),
            vec!["Sonic The Hedgehog (USA, Europe)", "Doom (Europe)"]
        );
    }

    #[test]
    fn un_index_vide_ne_rend_rien() {
        assert!(parse_index("<html></html>").is_empty());
    }

    #[test]
    fn le_nom_de_cache_tient_sur_un_systeme_de_fichiers() {
        assert_eq!(cache_name("Sega - Mega Drive - Genesis"), "Sega---Mega-Drive---Genesis");
        assert!(!cache_name("Philips - CD-i").contains(' '));
    }

    #[test]
    fn l_adresse_echappe_ce_qu_il_faut() {
        assert_eq!(urlencode("Sega - 32X"), "Sega%20-%2032X");
        assert_eq!(urlencode("DOS"), "DOS");
    }

    #[test]
    fn relit_l_inventaire_depuis_le_disque_sans_reseau() {
        let base = std::env::temp_dir().join(format!("evachi-jaquettes-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("dossier");
        std::fs::write(base.join("Sega---32X.txt"), "Doom (Europe)\nAfter Burner (USA)")
            .expect("cache");

        let lu = index("Sega - 32X", &base).expect("lecture");
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(lu, vec!["Doom (Europe)", "After Burner (USA)"]);
    }
}
