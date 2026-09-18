//! Les triches, et ce qu'elles ont le droit de toucher.
//!
//! Deux sources, deux chemins, et aucun des deux ne devine quoi que ce soit.
//!
//! **Les fiches publiées** portent des codes écrits dans le dialecte de leur
//! console : `0754:00` sur NES, `7E0DBF63` sur Super Nintendo, `ATGA-AA56` sur
//! Mega Drive, `8005FA8A+3C00` sur PlayStation. Plusieurs sont chiffrés. On ne
//! les décode pas : l'ABI libretro impose à chaque cœur d'exporter
//! `retro_cheat_set`, et le cœur sait lire son propre dialecte. On lui passe la
//! chaîne telle quelle. Se tromper d'un bit en décodant une seule de ces
//! familles reviendrait à écrire n'importe quoi n'importe où, et rien ne le
//! signalerait avant que le jeu ne parte de travers.
//!
//! **Les adresses trouvées à la main**, elles, ne sont l'affaire de personne
//! d'autre : c'est nous qui les avons relevées dans la RAM, et c'est nous qui
//! les réécrivons. D'où ce second chemin, où rien n'est interprété.
//!
//! Ce qu'une triche ne touche jamais :
//!
//! - **la mémoire de sauvegarde.** libretro la distingue de la RAM de travail
//!   (`RETRO_MEMORY_SAVE_RAM` contre `RETRO_MEMORY_SYSTEM_RAM`), et on ne
//!   s'adresse qu'à la seconde. Une triche peut abîmer une partie en cours ;
//!   elle ne peut pas abîmer la pile de sauvegardes sur le disque.
//! - **ce qui déborde.** Une écriture qui sortirait de la RAM est refusée, pas
//!   tronquée : une adresse hors-bornes vient d'une erreur, et l'exécuter
//!   quand même serait le seul moyen de la rendre grave.

use serde::{Deserialize, Serialize};

/// Une valeur qu'on maintient en mémoire, réécrite avant chaque trame.
///
/// « Poke » est le mot d'usage depuis le BASIC des années 1980, et c'est
/// exactement le geste : déposer un octet à une adresse.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Poke {
    /// Décalage depuis le début de la RAM de travail.
    pub adresse: u32,
    /// Largeur en octets : 1, 2 ou 4. Rien d'autre n'a de sens.
    pub taille: u8,
    /// La valeur à déposer, en petit-boutiste.
    pub valeur: u32,
}

/// Largeurs qu'une valeur peut prendre.
pub const TAILLES: [u8; 3] = [1, 2, 4];

impl Poke {
    /// Vrai si cette écriture tient dans une RAM de cette taille.
    ///
    /// La largeur est vérifiée aussi : une taille inventée ferait une écriture
    /// de longueur inconnue, ce qui est précisément ce qu'on ne veut pas voir
    /// arriver près d'un tampon.
    pub fn tient(&self, ram: usize) -> bool {
        if !TAILLES.contains(&self.taille) {
            return false;
        }
        match (self.adresse as usize).checked_add(self.taille as usize) {
            Some(fin) => fin <= ram,
            None => false,
        }
    }

    /// Les octets à déposer, du premier au dernier.
    pub fn octets(&self) -> Vec<u8> {
        self.valeur.to_le_bytes()[..self.taille as usize].to_vec()
    }
}

/// Dépose une valeur dans la RAM, si et seulement si elle y tient.
///
/// Rend vrai quand l'écriture a eu lieu. Le refus est silencieux ici — c'est
/// l'appelant qui sait s'il doit s'en plaindre — mais il n'est jamais partiel :
/// on écrit tout, ou rien.
pub fn deposer(ram: &mut [u8], poke: &Poke) -> bool {
    if !poke.tient(ram.len()) {
        return false;
    }
    let debut = poke.adresse as usize;
    ram[debut..debut + poke.taille as usize].copy_from_slice(&poke.octets());
    true
}

/// Lit une valeur de la RAM, si elle y tient.
pub fn relever(ram: &[u8], adresse: u32, taille: u8) -> Option<u32> {
    let poke = Poke {
        adresse,
        taille,
        valeur: 0,
    };
    if !poke.tient(ram.len()) {
        return None;
    }
    let debut = adresse as usize;
    let mut octets = [0_u8; 4];
    octets[..taille as usize].copy_from_slice(&ram[debut..debut + taille as usize]);
    Some(u32::from_le_bytes(octets))
}

/// Ce que le cœur a fait des consignes.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Etat {
    /// Combien de valeurs sont réellement maintenues.
    ///
    /// Moins que ce qu'on a demandé quand des adresses ne tenaient pas dans
    /// cette RAM-là : c'est ainsi que la fenêtre apprend qu'une consigne a été
    /// écartée, plutôt que de croire qu'elle s'applique.
    pub retenus: usize,
    /// La taille de la RAM de travail, zéro quand le cœur ne l'expose pas.
    ///
    /// Zéro n'est pas une panne : plusieurs cœurs ne la publient pas, et il
    /// faut pouvoir le dire au lieu de chercher dans le vide.
    pub ram: usize,
}

/// Ce qu'on demande au cœur de faire tourner : ses triches, et nos valeurs.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Consignes {
    /// Les codes des fiches, dans le dialecte de la console. On ne les lit pas.
    #[serde(default)]
    pub codes: Vec<String>,
    /// Les valeurs qu'on maintient soi-même.
    #[serde(default)]
    pub pokes: Vec<Poke>,
}

impl Consignes {
    /// Vrai quand il n'y a rien à faire.
    pub fn vides(&self) -> bool {
        self.codes.is_empty() && self.pokes.is_empty()
    }

    /// Celles des valeurs qui tiennent dans une RAM de cette taille.
    ///
    /// Filtrées une fois pour toutes plutôt qu'à chaque trame : une adresse
    /// hors-bornes ne le devient pas en cours de partie, et vérifier soixante
    /// fois par seconde ce qui ne change pas est du travail perdu.
    pub fn retenues(&self, ram: usize) -> Vec<Poke> {
        self.pokes
            .iter()
            .copied()
            .filter(|poke| poke.tient(ram))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn depose_une_valeur_de_chaque_largeur() {
        let mut ram = vec![0_u8; 16];

        assert!(deposer(&mut ram, &Poke { adresse: 0, taille: 1, valeur: 0x2a }));
        assert_eq!(ram[0], 0x2a);

        assert!(deposer(&mut ram, &Poke { adresse: 4, taille: 2, valeur: 0x1234 }));
        assert_eq!(&ram[4..6], &[0x34, 0x12]);

        assert!(deposer(&mut ram, &Poke { adresse: 8, taille: 4, valeur: 0x8899_aabb }));
        assert_eq!(&ram[8..12], &[0xbb, 0xaa, 0x99, 0x88]);
    }

    #[test]
    fn n_ecrit_rien_du_tout_quand_ca_deborde() {
        // Une écriture partielle serait pire qu'un refus : elle laisserait la
        // mémoire dans un état que personne n'a demandé, à moitié.
        let mut ram = vec![7_u8; 8];
        assert!(!deposer(&mut ram, &Poke { adresse: 6, taille: 4, valeur: 0xffff_ffff }));
        assert_eq!(ram, vec![7_u8; 8], "la mémoire a bougé malgré le refus");

        assert!(!deposer(&mut ram, &Poke { adresse: 8, taille: 1, valeur: 1 }));
        assert_eq!(ram, vec![7_u8; 8]);
    }

    #[test]
    fn refuse_une_largeur_qui_n_existe_pas() {
        // Trois octets, zéro octet, huit octets : rien de tout cela n'a de sens
        // et rien ne doit s'écrire sur cette foi-là.
        let mut ram = vec![0_u8; 16];
        for taille in [0, 3, 5, 8, 255] {
            assert!(
                !deposer(&mut ram, &Poke { adresse: 0, taille, valeur: 1 }),
                "largeur {taille} acceptée"
            );
        }
        assert_eq!(ram, vec![0_u8; 16]);
    }

    #[test]
    fn ne_deborde_pas_non_plus_en_comptant() {
        // Une adresse tout en haut de l'intervalle : son addition avec la
        // largeur ne doit jamais repasser par zéro, ce qui rendrait « ça
        // tient » sur une mémoire minuscule.
        let poke = Poke { adresse: u32::MAX, taille: 4, valeur: 0 };
        assert!(!poke.tient(2048), "quatre milliards logés dans deux kilooctets");
        assert!(!poke.tient(u32::MAX as usize), "elle déborde de sa propre borne");

        // Et la RAM la plus grande qu'une console ait jamais eue reste très
        // loin de là : huit mégaoctets sur Nintendo 64 avec l'extension.
        assert!(!poke.tient(8 * 1024 * 1024));
    }

    #[test]
    fn releve_ce_qu_elle_a_depose() {
        let mut ram = vec![0_u8; 8];
        let poke = Poke { adresse: 2, taille: 2, valeur: 0xbeef };
        assert!(deposer(&mut ram, &poke));
        assert_eq!(relever(&ram, 2, 2), Some(0xbeef));
        assert_eq!(relever(&ram, 2, 1), Some(0xef));
        assert_eq!(relever(&ram, 7, 2), None, "une lecture hors bornes doit refuser");
    }

    #[test]
    fn ecarte_les_adresses_qui_ne_tiennent_pas_dans_cette_ram() {
        let consignes = Consignes {
            codes: vec!["0754:00".to_owned()],
            pokes: vec![
                Poke { adresse: 0x10, taille: 1, valeur: 1 },
                Poke { adresse: 0x7ff, taille: 4, valeur: 1 },
                Poke { adresse: 0x9000, taille: 1, valeur: 1 },
            ],
        };
        // Une RAM de deux kilooctets, celle de la NES.
        let retenues = consignes.retenues(2048);
        assert_eq!(retenues.len(), 1);
        assert_eq!(retenues[0].adresse, 0x10);
        assert!(!consignes.vides());
    }
}
