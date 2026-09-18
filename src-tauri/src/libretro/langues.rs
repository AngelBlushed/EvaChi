//! La langue qu'on demande aux jeux.
//!
//! Beaucoup de cartouches et de disques européens portent leur texte en cinq ou
//! six langues, et choisissent laquelle afficher d'après un réglage de la
//! console : la langue de la console portable, celle du BIOS, celle du menu
//! système. L'émulateur, lui, prend l'anglais par défaut — d'où des jeux
//! français qui démarrent en anglais sans qu'on comprenne pourquoi.
//!
//! libretro offre deux chemins pour le dire, et ils ne se recouvrent pas :
//!
//! 1. `RETRO_ENVIRONMENT_GET_LANGUAGE`, que le cœur interroge s'il le veut ;
//! 2. une **option de cœur** nommée, du genre `melonds_language`, dont la
//!    valeur par défaut est presque toujours l'anglais.
//!
//! On emprunte les deux. Le second compte davantage : c'est celui que les cœurs
//! lisent réellement pour la langue de la machine émulée.
//!
//! Les options ne sont pas énumérées ici cœur par cœur. Une table de ce genre
//! se périme au premier cœur mis à jour, et rien ne le signalerait. On lit à la
//! place ce que le cœur déclare lui-même — sa clé et les valeurs qu'il propose
//! — exactement comme les crédits sont relevés sur les fiches du projet
//! libretro plutôt qu'écrits de mémoire.
//!
//! Ce module ne touche à rien : il dit quelle valeur choisir. Il se vérifie
//! donc sans cœur chargé, ce qui est heureux — l'erreur qu'on veut éviter, un
//! jeu qui démarre dans la mauvaise langue, ne se voit qu'une manette en main.

/// Une langue qu'on peut demander aux jeux.
pub struct Parler {
    /// L'étiquette que la fenêtre retient, en BCP 47.
    pub code: &'static str,
    /// La valeur `retro_language` correspondante.
    pub retro: u32,
    /// Les mots par lesquels un cœur peut la nommer dans ses options.
    ///
    /// Du plus précis au plus vague : « chinese (simplified) » avant
    /// « chinese », faute de quoi on choisirait le chinois traditionnel dès
    /// qu'un cœur propose les deux.
    pub noms: &'static [&'static str],
}

/// Les langues proposées, dans l'ordre de leur code.
///
/// Celles que portent réellement les jeux multilingues : les cinq ou six
/// langues des boîtes européennes, plus celles des éditions asiatiques et
/// russes. Une langue que nul jeu ne parle n'aurait rien à faire dans un menu
/// où l'on cherche la sienne.
pub const PARLERS: &[Parler] = &[
    Parler {
        code: "de",
        retro: 4,
        noms: &["german", "deutsch", "ger", "deu", "de"],
    },
    Parler {
        code: "en",
        retro: 0,
        noms: &["english", "eng", "en"],
    },
    Parler {
        code: "es",
        retro: 3,
        noms: &["spanish", "español", "espanol", "castellano", "spa", "es"],
    },
    Parler {
        code: "fr",
        retro: 2,
        noms: &["french", "français", "francais", "fra", "fre", "fr"],
    },
    Parler {
        code: "it",
        retro: 5,
        noms: &["italian", "italiano", "ita", "it"],
    },
    Parler {
        code: "ja",
        retro: 1,
        noms: &["japanese", "日本語", "jpn", "ja", "jp"],
    },
    Parler {
        code: "ko",
        retro: 10,
        noms: &["korean", "한국어", "kor", "ko"],
    },
    Parler {
        code: "nl",
        retro: 6,
        noms: &["dutch", "nederlands", "nld", "nl"],
    },
    Parler {
        code: "pt",
        retro: 8,
        noms: &["portuguese", "português", "portugues", "por", "pt"],
    },
    Parler {
        code: "ru",
        retro: 9,
        noms: &["russian", "русский", "rus", "ru"],
    },
    Parler {
        code: "zh",
        retro: 12,
        noms: &[
            "chinese (simplified)",
            "simplified chinese",
            "chinese simplified",
            "简体中文",
            "chinese",
            "zho",
            "zh",
        ],
    },
];

/// L'anglais, faute de mieux.
///
/// C'est déjà ce que fait un cœur à qui l'on ne dit rien : choisir autre chose
/// comme repli changerait le comportement de jeux qui marchaient très bien.
pub fn defaut() -> &'static Parler {
    parler("en").expect("l'anglais est toujours dans la table")
}

/// La langue portant ce code, ou rien.
///
/// Le code peut être régional — « pt-br », « zh-hans » : on retient alors la
/// langue seule. Une variante qu'aucun jeu ne distingue n'a pas à priver
/// quelqu'un de sa langue.
pub fn parler(code: &str) -> Option<&'static Parler> {
    let propre = code.trim().to_lowercase();
    let racine = propre.split(['-', '_']).next().unwrap_or("");
    PARLERS
        .iter()
        .find(|parler| parler.code == propre)
        .or_else(|| PARLERS.iter().find(|parler| parler.code == racine))
}

/// Vrai si cette clé d'option désigne la langue de la machine émulée.
///
/// Reconnue sur le mot, et non sur une liste de cœurs : `melonds_language`,
/// `desmume_firmware_language`, `flycast_language`, `ppsspp_language` et leurs
/// pareils s'écrivent tous ainsi, et un cœur à venir qui suivra l'usage sera
/// reconnu sans qu'on ait rien à écrire.
pub fn cle_de_langue(cle: &str) -> bool {
    cle.to_lowercase().contains("language")
}

/// La valeur à choisir parmi celles que le cœur propose, s'il y en a une.
///
/// `valeurs` est la liste séparée par des barres verticales que le cœur écrit
/// après le point-virgule de sa description : « English|Japanese|French ».
///
/// On cherche d'abord un nom exact, puis un début de nom. Sans cette seconde
/// passe, « English (US) » et « Français (France) » ne seraient jamais
/// reconnus ; avec elle en premier, « Chinese » emporterait le chinois
/// traditionnel alors que le simplifié était écrit juste à côté.
pub fn valeur_choisie(parler: &Parler, valeurs: &str) -> Option<String> {
    let offertes: Vec<&str> = valeurs.split('|').map(str::trim).filter(|v| !v.is_empty()).collect();

    for nom in parler.noms {
        if let Some(trouve) = offertes.iter().find(|v| v.to_lowercase() == *nom) {
            return Some((*trouve).to_owned());
        }
    }

    for nom in parler.noms {
        // Les codes de deux ou trois lettres ne se cherchent pas par leur
        // début : « it » attraperait « Italian » mais aussi bien « Italy » et
        // n'importe quel mot commençant par ces lettres-là.
        if nom.len() <= 3 {
            continue;
        }
        if let Some(trouve) = offertes.iter().find(|v| v.to_lowercase().starts_with(nom)) {
            return Some((*trouve).to_owned());
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chaque_langue_dit_son_code_et_ses_noms() {
        for parler in PARLERS {
            assert!(!parler.code.is_empty(), "une langue sans code");
            assert!(!parler.noms.is_empty(), "{} : sans nom", parler.code);
            // Les noms servent à comparer en minuscules : écrits autrement, ils
            // ne trouveraient jamais rien, et en silence.
            for nom in parler.noms {
                assert_eq!(*nom, nom.to_lowercase(), "{} : {nom} n'est pas en bas de casse", parler.code);
            }
        }
    }

    #[test]
    fn aucun_code_ni_aucune_valeur_retro_en_double() {
        let mut codes: Vec<&str> = PARLERS.iter().map(|p| p.code).collect();
        codes.sort_unstable();
        let combien = codes.len();
        codes.dedup();
        assert_eq!(codes.len(), combien, "deux langues portent le même code");

        let mut valeurs: Vec<u32> = PARLERS.iter().map(|p| p.retro).collect();
        valeurs.sort_unstable();
        let combien = valeurs.len();
        valeurs.dedup();
        assert_eq!(valeurs.len(), combien, "deux langues portent la même valeur retro");
    }

    #[test]
    fn retrouve_une_langue_par_son_code_regional() {
        // La fenêtre parle « pt-br » et « zh-hans » ; aucun jeu ne distingue le
        // portugais du Brésil de celui du Portugal dans son menu de langues.
        assert_eq!(parler("pt-br").map(|p| p.code), Some("pt"));
        assert_eq!(parler("zh-hans").map(|p| p.code), Some("zh"));
        assert_eq!(parler("FR").map(|p| p.code), Some("fr"));
        assert_eq!(parler("ta").map(|p| p.code), None);
        assert_eq!(defaut().code, "en");
    }

    #[test]
    fn reconnait_les_cles_de_langue_des_coeurs() {
        // Les clés réelles de cœurs qu'EvaChi propose. Elles n'ont en commun
        // que ce mot-là, et c'est sur lui qu'on se règle.
        for cle in [
            "melonds_language",
            "desmume_firmware_language",
            "flycast_language",
            "ppsspp_language",
            "citra_language",
            "dolphin_language",
        ] {
            assert!(cle_de_langue(cle), "{cle} n'est pas reconnue");
        }
        for cle in ["melonds_console_mode", "flycast_region", "ppsspp_cpu_core"] {
            assert!(!cle_de_langue(cle), "{cle} prise pour une langue");
        }
    }

    #[test]
    fn choisit_la_valeur_que_le_coeur_propose() {
        let francais = parler("fr").expect("le français est proposé");
        assert_eq!(
            valeur_choisie(francais, "English|Japanese|French|German|Italian|Spanish"),
            Some("French".to_owned())
        );
        // Écrite autrement, elle doit se trouver quand même.
        assert_eq!(valeur_choisie(francais, "en|fr|de"), Some("fr".to_owned()));
        assert_eq!(
            valeur_choisie(francais, "English (US)|Français (France)"),
            Some("Français (France)".to_owned())
        );
    }

    #[test]
    fn ne_choisit_rien_quand_la_langue_n_est_pas_offerte() {
        // Un cœur japonais qui ne propose que deux langues ne doit pas se voir
        // imposer une valeur qu'il ne connaît pas : il la refuserait, ou pire,
        // la prendrait pour une autre.
        let coreen = parler("ko").expect("le coréen est proposé");
        assert_eq!(valeur_choisie(coreen, "English|Japanese"), None);
        assert_eq!(valeur_choisie(coreen, ""), None);
    }

    #[test]
    fn prefere_le_chinois_simplifie_quand_les_deux_sont_offerts() {
        // « Chinese » seul attraperait le traditionnel, écrit juste à côté.
        let chinois = parler("zh").expect("le chinois est proposé");
        assert_eq!(
            valeur_choisie(chinois, "English|Chinese (Traditional)|Chinese (Simplified)"),
            Some("Chinese (Simplified)".to_owned())
        );
    }

    #[test]
    fn ne_confond_pas_un_code_court_avec_un_mot_qui_commence_pareil() {
        // « it » ne doit pas attraper « Italy », ni « es » attraper « Estonian ».
        let italien = parler("it").expect("l'italien est proposé");
        assert_eq!(valeur_choisie(italien, "Italy|Japan"), None);
        let espagnol = parler("es").expect("l'espagnol est proposé");
        assert_eq!(valeur_choisie(espagnol, "Estonian|Esperanto"), None);
    }
}
