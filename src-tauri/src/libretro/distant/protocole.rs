//! Ce que la fenêtre et le processus du cœur se disent.
//!
//! Un seul canal, strictement question-réponse : la fenêtre demande, le
//! processus voisin répond, et rien ne part de lui-même. C'est ce qui rend le
//! reste simple — un seul écrivain dans la mémoire partagée à la fois, pas de
//! double tampon, pas de verrou, et une réponse en retard se reconnaît à son
//! jeton.
//!
//! Le cadrage est le même dans les deux sens : douze octets d'en-tête, puis la
//! charge. Les structures voyagent en JSON parce qu'elles sont petites et
//! rares ; ce qui est volumineux — les états de sauvegarde, le son, les pixels
//! — voyage en octets bruts, jamais en texte.

use std::io::{Read, Write};

use serde::{Deserialize, Serialize};

use super::super::abi::JOYPAD_BUTTONS;

/// Taille de l'en-tête de cadrage, en octets.
pub const ENTETE: usize = 12;

/// Au-delà, on refuse de lire : une longueur aberrante ne doit pas faire enfler
/// la mémoire avant qu'on s'en aperçoive. Trois cent mégaoctets laissent passer
/// le plus gros état de sauvegarde connu avec de la marge.
pub const MAX_CHARGE: u32 = 300 * 1024 * 1024;

// --- Étiquettes -------------------------------------------------------------

/// Ce que la fenêtre demande.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum Demande {
    ChargerCoeur = 1,
    ChargerContenu = 2,
    Trame = 3,
    Reinitialiser = 4,
    SauverEtat = 5,
    ReprendreEtat = 6,
    Decharger = 7,
    Messages = 8,
}

impl Demande {
    pub fn depuis(valeur: u32) -> Option<Self> {
        Some(match valeur {
            1 => Self::ChargerCoeur,
            2 => Self::ChargerContenu,
            3 => Self::Trame,
            4 => Self::Reinitialiser,
            5 => Self::SauverEtat,
            6 => Self::ReprendreEtat,
            7 => Self::Decharger,
            8 => Self::Messages,
            _ => return None,
        })
    }

    /// Combien de temps on accepte d'attendre cette réponse-là.
    ///
    /// Les échéances ne sont pas les mêmes selon ce qu'on demande, et aucune
    /// n'est infinie : une commande sans échéance, c'est le figement qui
    /// revient par la seule porte restée ouverte.
    ///
    /// Celle du déchargement est large à dessein. C'est pendant qu'il décharge
    /// que le cœur écrit sa sauvegarde de pile sur le disque — la couper, c'est
    /// perdre la partie.
    pub fn echeance(self) -> std::time::Duration {
        use std::time::Duration;
        match self {
            Self::ChargerCoeur => Duration::from_secs(60),
            // Une image de PlayStation 2 fait quatre gigaoctets, et elle est
            // parfois sur un disque externe.
            Self::ChargerContenu => Duration::from_secs(300),
            // Assez court pour qu'on puisse abandonner une partie figée sans
            // attendre, assez long pour qu'une trame lourde passe.
            Self::Trame => Duration::from_secs(5),
            Self::Reinitialiser => Duration::from_secs(30),
            Self::SauverEtat | Self::ReprendreEtat => Duration::from_secs(120),
            // Généreuse, mais pas au point de faire attendre qui ferme la
            // fenêtre : on décharge aussi à l'extinction, et un cœur sain rend
            // la main en quelques millisecondes.
            Self::Decharger => Duration::from_secs(20),
            Self::Messages => Duration::from_secs(5),
        }
    }
}

/// Ce que le processus du cœur répond. Toute réponse porte d'abord les lignes
/// que le cœur a écrites depuis la précédente.
pub const BON: u32 = 128;
pub const MAUVAIS: u32 = 129;

// --- Charges ----------------------------------------------------------------

/// De quoi charger un cœur.
#[derive(Debug, Serialize, Deserialize)]
pub struct Ouverture {
    pub coeur: String,
    pub dossier_systeme: String,
    pub dossier_sauvegardes: String,
}

/// La requête d'une trame, en octets fixes plutôt qu'en JSON : c'est la seule
/// qui parte soixante fois par seconde, et parfois cinq cents.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Requete {
    pub boutons: [i16; JOYPAD_BUTTONS],
    /// Combien de trames faire tourner d'affilée. En avance rapide, demander
    /// les trames une par une paie l'aller-retour autant de fois ; on ne
    /// regarde de toute façon que la dernière image.
    pub trames: u32,
    /// Faux quand la fenêtre ne peindra pas cette image : le processus voisin
    /// n'a alors pas à l'écrire dans la mémoire partagée.
    pub image: bool,
}

impl Requete {
    /// Taille de la requête une fois écrite.
    pub const TAILLE: usize = JOYPAD_BUTTONS * 2 + 8;

    pub fn ecrire(&self) -> Vec<u8> {
        let mut octets = Vec::with_capacity(Self::TAILLE);
        for bouton in self.boutons {
            octets.extend_from_slice(&bouton.to_le_bytes());
        }
        octets.extend_from_slice(&self.trames.to_le_bytes());
        octets.extend_from_slice(&u32::from(self.image).to_le_bytes());
        octets
    }

    pub fn lire(octets: &[u8]) -> Result<Self, String> {
        if octets.len() < Self::TAILLE {
            return Err(format!(
                "requête de trame tronquée : {} octets, {} attendus",
                octets.len(),
                Self::TAILLE
            ));
        }
        let mut boutons = [0i16; JOYPAD_BUTTONS];
        for (rang, place) in boutons.iter_mut().enumerate() {
            *place = i16::from_le_bytes([octets[rang * 2], octets[rang * 2 + 1]]);
        }
        let base = JOYPAD_BUTTONS * 2;
        let nombre = |debut: usize| {
            u32::from_le_bytes([
                octets[debut],
                octets[debut + 1],
                octets[debut + 2],
                octets[debut + 3],
            ])
        };
        Ok(Self {
            boutons,
            trames: nombre(base).clamp(1, 64),
            image: nombre(base + 4) != 0,
        })
    }
}

/// Ce qu'une trame rapporte, hors les pixels — ceux-là sont dans la mémoire
/// partagée, et n'empruntent jamais le tuyau.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rendu {
    /// Le numéro de la trame écrite dans la mémoire partagée. La fenêtre
    /// vérifie qu'il correspond à ce qu'elle y lit.
    pub sequence: u32,
    /// Absentes quand le cœur a redemandé la trame précédente, ou quand la
    /// fenêtre n'avait pas besoin de l'image.
    pub geometrie: Option<(u32, u32)>,
    pub arret: bool,
    pub audio: Vec<i16>,
}

impl Rendu {
    const FIXE: usize = 20;
    const DRAPEAU_IMAGE: u32 = 1;
    const DRAPEAU_ARRET: u32 = 2;

    pub fn ecrire(&self) -> Vec<u8> {
        let mut drapeaux = 0u32;
        if self.geometrie.is_some() {
            drapeaux |= Self::DRAPEAU_IMAGE;
        }
        if self.arret {
            drapeaux |= Self::DRAPEAU_ARRET;
        }
        let (largeur, hauteur) = self.geometrie.unwrap_or((0, 0));

        let mut octets = Vec::with_capacity(Self::FIXE + self.audio.len() * 2);
        octets.extend_from_slice(&self.sequence.to_le_bytes());
        octets.extend_from_slice(&drapeaux.to_le_bytes());
        octets.extend_from_slice(&largeur.to_le_bytes());
        octets.extend_from_slice(&hauteur.to_le_bytes());
        octets.extend_from_slice(&(self.audio.len() as u32).to_le_bytes());
        for echantillon in &self.audio {
            octets.extend_from_slice(&echantillon.to_le_bytes());
        }
        octets
    }

    pub fn lire(octets: &[u8]) -> Result<Self, String> {
        if octets.len() < Self::FIXE {
            return Err("réponse de trame tronquée".into());
        }
        let nombre = |debut: usize| {
            u32::from_le_bytes([
                octets[debut],
                octets[debut + 1],
                octets[debut + 2],
                octets[debut + 3],
            ])
        };
        let sequence = nombre(0);
        let drapeaux = nombre(4);
        let largeur = nombre(8);
        let hauteur = nombre(12);
        let echantillons = nombre(16) as usize;

        let attendu = Self::FIXE + echantillons * 2;
        if octets.len() < attendu {
            return Err(format!(
                "réponse de trame tronquée : {} octets, {attendu} annoncés",
                octets.len()
            ));
        }

        let mut audio = Vec::with_capacity(echantillons);
        for rang in 0..echantillons {
            let debut = Self::FIXE + rang * 2;
            audio.push(i16::from_le_bytes([octets[debut], octets[debut + 1]]));
        }

        Ok(Self {
            sequence,
            geometrie: (drapeaux & Self::DRAPEAU_IMAGE != 0).then_some((largeur, hauteur)),
            arret: drapeaux & Self::DRAPEAU_ARRET != 0,
            audio,
        })
    }
}

// --- Cadrage ----------------------------------------------------------------

/// Écrit un message cadré : longueur, étiquette, jeton, puis la charge.
pub fn envoyer(
    sortie: &mut impl Write,
    etiquette: u32,
    jeton: u32,
    charge: &[u8],
) -> std::io::Result<()> {
    let mut entete = [0u8; ENTETE];
    entete[0..4].copy_from_slice(&(charge.len() as u32).to_le_bytes());
    entete[4..8].copy_from_slice(&etiquette.to_le_bytes());
    entete[8..12].copy_from_slice(&jeton.to_le_bytes());
    sortie.write_all(&entete)?;
    sortie.write_all(charge)?;
    sortie.flush()
}

/// Relit un en-tête de cadrage déjà en main.
///
/// La fenêtre ne peut pas se servir de [`recevoir`] : elle lit par une poignée
/// en recouvrement, qui ne s'offre pas sous la forme d'un flux ordinaire.
pub fn decoder_entete(entete: &[u8; ENTETE]) -> Result<(u32, u32, u32), String> {
    let nombre = |debut: usize| {
        u32::from_le_bytes([
            entete[debut],
            entete[debut + 1],
            entete[debut + 2],
            entete[debut + 3],
        ])
    };
    let longueur = nombre(0);
    if longueur > MAX_CHARGE {
        return Err(format!(
            "message de {longueur} octets annoncé, au-delà de ce qu'on accepte"
        ));
    }
    Ok((longueur, nombre(4), nombre(8)))
}

/// Lit un message cadré. Rend l'étiquette, le jeton et la charge.
pub fn recevoir(entree: &mut impl Read) -> std::io::Result<(u32, u32, Vec<u8>)> {
    let mut entete = [0u8; ENTETE];
    entree.read_exact(&mut entete)?;
    let longueur = u32::from_le_bytes([entete[0], entete[1], entete[2], entete[3]]);
    let etiquette = u32::from_le_bytes([entete[4], entete[5], entete[6], entete[7]]);
    let jeton = u32::from_le_bytes([entete[8], entete[9], entete[10], entete[11]]);

    if longueur > MAX_CHARGE {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("message de {longueur} octets, au-delà de ce qu'on accepte"),
        ));
    }

    let mut charge = vec![0u8; longueur as usize];
    entree.read_exact(&mut charge)?;
    Ok((etiquette, jeton, charge))
}

/// Compose une réponse : les messages du cœur d'abord, la charge ensuite.
///
/// Les messages voyagent sur *toutes* les réponses, pas seulement sur celles
/// des trames. C'est le seul endroit où l'on apprend pourquoi un contenu a été
/// refusé — un chargement raté n'a jamais produit de trame, et sans cela
/// l'écran dirait « contenu refusé » sans jamais dire de quel BIOS il manque.
pub fn composer(messages: &[String], charge: &[u8]) -> Vec<u8> {
    let mut octets = Vec::with_capacity(charge.len() + 8 + messages.len() * 32);
    octets.extend_from_slice(&(messages.len() as u32).to_le_bytes());
    for message in messages {
        let brut = message.as_bytes();
        octets.extend_from_slice(&(brut.len() as u32).to_le_bytes());
        octets.extend_from_slice(brut);
    }
    octets.extend_from_slice(charge);
    octets
}

/// Défait ce que [`composer`] a fait.
pub fn decomposer(octets: &[u8]) -> Result<(Vec<String>, Vec<u8>), String> {
    /// Lit un entier à la position donnée et avance.
    fn nombre(octets: &[u8], position: &mut usize) -> Result<u32, String> {
        if *position + 4 > octets.len() {
            return Err("réponse tronquée".to_string());
        }
        let valeur = u32::from_le_bytes([
            octets[*position],
            octets[*position + 1],
            octets[*position + 2],
            octets[*position + 3],
        ]);
        *position += 4;
        Ok(valeur)
    }

    let mut position = 0usize;
    let combien = nombre(octets, &mut position)? as usize;
    // Un message par octet serait déjà absurde : ce plafond n'existe que pour
    // qu'un compte aberrant ne fasse pas réserver la mémoire d'avance.
    if combien > octets.len() {
        return Err("réponse abîmée : trop de messages annoncés".into());
    }

    let mut messages = Vec::with_capacity(combien);
    for _ in 0..combien {
        let longueur = nombre(octets, &mut position)? as usize;
        if position + longueur > octets.len() {
            return Err("réponse tronquée dans un message".into());
        }
        messages.push(String::from_utf8_lossy(&octets[position..position + longueur]).into_owned());
        position += longueur;
    }

    Ok((messages, octets[position..].to_vec()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_message_cadre_se_relit_tel_quel() {
        let mut tuyau = Vec::new();
        envoyer(&mut tuyau, Demande::Trame as u32, 7, b"charge").expect("envoi");

        let (etiquette, jeton, charge) = recevoir(&mut tuyau.as_slice()).expect("réception");
        assert_eq!(etiquette, Demande::Trame as u32);
        assert_eq!(jeton, 7);
        assert_eq!(charge, b"charge");
    }

    #[test]
    fn deux_messages_a_la_suite_ne_se_melangent_pas() {
        // Le tuyau est un flux d'octets, pas une file de messages : c'est la
        // longueur en tête qui les sépare, et rien d'autre.
        let mut tuyau = Vec::new();
        envoyer(&mut tuyau, 1, 1, b"premier").expect("un");
        envoyer(&mut tuyau, 2, 2, b"second plus long").expect("deux");

        let mut flux = tuyau.as_slice();
        assert_eq!(recevoir(&mut flux).expect("un").2, b"premier");
        assert_eq!(recevoir(&mut flux).expect("deux").2, b"second plus long");
    }

    #[test]
    fn une_charge_vide_reste_un_message() {
        let mut tuyau = Vec::new();
        envoyer(&mut tuyau, Demande::Decharger as u32, 3, &[]).expect("envoi");
        let (etiquette, _, charge) = recevoir(&mut tuyau.as_slice()).expect("réception");
        assert_eq!(etiquette, Demande::Decharger as u32);
        assert!(charge.is_empty());
    }

    #[test]
    fn une_longueur_aberrante_est_refusee_sans_reserver_la_memoire() {
        // Le processus d'en face peut être devenu fou : c'est même tout l'objet
        // du dispositif. Une longueur de trois gigaoctets ne doit pas être crue.
        let mut entete = [0u8; ENTETE];
        entete[0..4].copy_from_slice(&u32::MAX.to_le_bytes());
        let erreur = recevoir(&mut entete.as_slice()).expect_err("refus attendu");
        assert_eq!(erreur.kind(), std::io::ErrorKind::InvalidData);
    }

    #[test]
    fn une_requete_de_trame_fait_l_aller_retour() {
        let mut boutons = [0i16; JOYPAD_BUTTONS];
        boutons[0] = 1;
        boutons[JOYPAD_BUTTONS - 1] = 1;
        let requete = Requete {
            boutons,
            trames: 9,
            image: false,
        };

        let relue = Requete::lire(&requete.ecrire()).expect("relecture");
        assert_eq!(relue, requete);
    }

    #[test]
    fn un_nombre_de_trames_aberrant_est_ramene_dans_ses_bornes() {
        // Zéro trame ferait une réponse vide que la fenêtre attendrait pour
        // rien ; un million bloquerait le processus voisin pour de bon.
        let mut brut = Requete {
            boutons: [0; JOYPAD_BUTTONS],
            trames: 0,
            image: true,
        }
        .ecrire();
        assert_eq!(Requete::lire(&brut).expect("zéro").trames, 1);

        let base = JOYPAD_BUTTONS * 2;
        brut[base..base + 4].copy_from_slice(&1_000_000u32.to_le_bytes());
        assert_eq!(Requete::lire(&brut).expect("trop").trames, 64);
    }

    #[test]
    fn un_rendu_porte_sa_geometrie_et_son_son() {
        let rendu = Rendu {
            sequence: 42,
            geometrie: Some((320, 240)),
            arret: true,
            audio: vec![-3, 0, 7, 12],
        };
        assert_eq!(Rendu::lire(&rendu.ecrire()).expect("relecture"), rendu);
    }

    #[test]
    fn une_trame_sans_image_neuve_le_dit() {
        // Le cœur a le droit de dire « rejoue la précédente » : c'est fréquent,
        // et cela ne doit pas se confondre avec une image noire.
        let rendu = Rendu {
            sequence: 1,
            geometrie: None,
            arret: false,
            audio: Vec::new(),
        };
        let relu = Rendu::lire(&rendu.ecrire()).expect("relecture");
        assert_eq!(relu.geometrie, None);
        assert!(relu.audio.is_empty());
    }

    #[test]
    fn les_messages_voyagent_avec_la_charge() {
        let messages = vec!["BIOS introuvable".to_string(), "cœur bavard".to_string()];
        let compose = composer(&messages, b"utile");

        let (relus, charge) = decomposer(&compose).expect("décomposition");
        assert_eq!(relus, messages);
        assert_eq!(charge, b"utile");
    }

    #[test]
    fn une_reponse_sans_message_garde_sa_charge() {
        let compose = composer(&[], b"utile");
        let (messages, charge) = decomposer(&compose).expect("décomposition");
        assert!(messages.is_empty());
        assert_eq!(charge, b"utile");
    }

    #[test]
    fn une_reponse_abimee_est_refusee_plutot_que_crue() {
        let mut compose = composer(&["quelque chose".to_string()], b"utile");
        // On ment sur la longueur du premier message.
        compose[4..8].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(decomposer(&compose).is_err());
    }

    #[test]
    fn chaque_demande_a_une_echeance_et_aucune_n_est_infinie() {
        // Une commande sans échéance, c'est le figement qui revient par la
        // seule porte restée ouverte.
        for valeur in 1..=8u32 {
            let demande = Demande::depuis(valeur).expect("étiquette connue");
            let echeance = demande.echeance();
            assert!(echeance.as_secs() >= 5, "{demande:?} : échéance trop courte");
            assert!(
                echeance.as_secs() <= 600,
                "{demande:?} : échéance sans fin déguisée"
            );
        }
        assert_eq!(Demande::depuis(0), None);
        assert_eq!(Demande::depuis(9), None);
    }

    #[test]
    fn le_dechargement_a_plus_de_temps_qu_une_trame() {
        // C'est pendant qu'il décharge que le cœur écrit la sauvegarde de pile.
        assert!(Demande::Decharger.echeance() > Demande::Trame.echeance());
    }
}
