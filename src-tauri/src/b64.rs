//! Le base64, dans les deux sens.
//!
//! Trois modules en ont besoin — les jaquettes posées à la main, les captures
//! d'écran et les sauvegardes d'état — pour la même raison : la fenêtre n'a
//! aucun accès au disque, et tout ce qui est binaire traverse le pont sous
//! forme de texte. Une seule mise en œuvre, éprouvée une fois.
//!
//! Aucune dépendance : c'est quarante lignes, et une caisse de plus dans
//! l'arbre de compilation coûterait plus cher à vérifier qu'à écrire.

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Encode des octets en base64.
pub fn encode(octets: &[u8]) -> String {
    let mut sortie = String::with_capacity(octets.len().div_ceil(3) * 4);

    for morceau in octets.chunks(3) {
        let a = u32::from(morceau[0]);
        let b = u32::from(*morceau.get(1).unwrap_or(&0));
        let c = u32::from(*morceau.get(2).unwrap_or(&0));
        let trois = (a << 16) | (b << 8) | c;

        sortie.push(ALPHABET[(trois >> 18) as usize & 63] as char);
        sortie.push(ALPHABET[(trois >> 12) as usize & 63] as char);
        sortie.push(if morceau.len() > 1 {
            ALPHABET[(trois >> 6) as usize & 63] as char
        } else {
            '='
        });
        sortie.push(if morceau.len() > 2 {
            ALPHABET[trois as usize & 63] as char
        } else {
            '='
        });
    }
    sortie
}

/// La valeur d'un caractère de l'alphabet, s'il en fait partie.
fn valeur(c: u8) -> Option<u32> {
    Some(match c {
        b'A'..=b'Z' => u32::from(c - b'A'),
        b'a'..=b'z' => u32::from(c - b'a') + 26,
        b'0'..=b'9' => u32::from(c - b'0') + 52,
        b'+' => 62,
        b'/' => 63,
        _ => return None,
    })
}

/// Décode du base64. Les espaces et le remplissage sont ignorés.
///
/// @param maximum taille au-delà de laquelle on abandonne, pour qu'une entrée
/// aberrante ne remplisse pas la mémoire avant qu'on s'en aperçoive.
pub fn decode(texte: &str, maximum: usize) -> Result<Vec<u8>, String> {
    let utiles: Vec<u8> = texte
        .bytes()
        .filter(|c| !c.is_ascii_whitespace() && *c != b'=')
        .collect();

    let mut sortie = Vec::with_capacity(utiles.len() / 4 * 3);
    for morceau in utiles.chunks(4) {
        // Un morceau d'un seul caractère ne porte aucun octet : c'est du
        // remplissage mal formé, pas une donnée.
        if morceau.len() == 1 {
            return Err("base64 tronqué".into());
        }
        let mut assemble = 0u32;
        for (rang, c) in morceau.iter().enumerate() {
            let v = valeur(*c).ok_or_else(|| format!("caractère inattendu : {}", *c as char))?;
            assemble |= v << (18 - 6 * rang);
        }
        for rang in 0..morceau.len() - 1 {
            sortie.push(((assemble >> (16 - 8 * rang)) & 0xFF) as u8);
        }
        if sortie.len() > maximum {
            return Err("données trop lourdes".into());
        }
    }
    Ok(sortie)
}

/// Extrait les octets d'une adresse `data:…;base64,…`.
pub fn depuis_data(adresse: &str, maximum: usize) -> Result<Vec<u8>, String> {
    let (entete, charge) = adresse
        .split_once(',')
        .ok_or_else(|| "donnée sans en-tête".to_string())?;
    if !entete.contains("base64") {
        return Err("donnée non encodée en base64".into());
    }
    decode(charge, maximum)
}

#[cfg(test)]
mod tests {
    use super::*;

    const GRAND: usize = 1 << 20;

    #[test]
    fn encode_comme_la_norme() {
        // Les exemples de la RFC 4648, remplissage compris.
        assert_eq!(encode(b""), "");
        assert_eq!(encode(b"f"), "Zg==");
        assert_eq!(encode(b"fo"), "Zm8=");
        assert_eq!(encode(b"foo"), "Zm9v");
        assert_eq!(encode(b"foob"), "Zm9vYg==");
        assert_eq!(encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn decode_ce_qu_il_encode() {
        for exemple in ["", "f", "fo", "foo", "foob", "fooba", "foobar"] {
            assert_eq!(decode(&encode(exemple.as_bytes()), GRAND).unwrap(), exemple.as_bytes());
        }
    }

    #[test]
    fn survit_a_tous_les_octets() {
        // Une sauvegarde d'état est du binaire quelconque : les 256 valeurs
        // doivent traverser sans se déformer.
        let tous: Vec<u8> = (0..=255).collect();
        assert_eq!(decode(&encode(&tous), GRAND).unwrap(), tous);
    }

    #[test]
    fn refuse_ce_qui_n_est_pas_du_base64() {
        assert!(decode("pas du base64 !", GRAND).is_err());
        assert!(decode("Z", GRAND).is_err());
    }

    #[test]
    fn s_arrete_avant_de_remplir_la_memoire() {
        let gros = encode(&vec![0u8; 4096]);
        assert!(decode(&gros, 100).is_err());
    }

    #[test]
    fn lit_une_adresse_data() {
        assert_eq!(depuis_data("data:image/png;base64,Zm9vYmFy", GRAND).unwrap(), b"foobar");
        assert!(depuis_data("pas une adresse", GRAND).is_err());
        assert!(depuis_data("data:image/png,brut", GRAND).is_err());
    }
}
