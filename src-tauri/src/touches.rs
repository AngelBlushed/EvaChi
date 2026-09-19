//! Les touches, portées jusqu'aux émulateurs autonomes.
//!
//! EvaChi lance ces programmes-là avec le jeu en argument, et n'en attend rien
//! de plus. Leurs commandes, elles, leur appartiennent : on réassigne un bouton
//! dans EvaChi, et Dolphin continue de croire qu'on joue au clavier. C'est la
//! seule chose de l'application qui ne suive pas le réglage — et c'est celle
//! qu'on remarque, parce qu'elle arrive manette en main.
//!
//! Chacun garde sa correspondance dans un fichier de configuration, et chacun
//! l'écrit à sa façon : PCSX2 nomme les boutons comme SDL, PPSSPP les numérote
//! comme Android, Dolphin les désigne comme XInput. Ce sont trois dialectes
//! pour la même chose, et ce module les parle.
//!
//! Règles qu'on ne transgresse pas :
//!   - on ne réécrit que les lignes qu'on sait écrire, jamais le fichier entier ;
//!   - la marque d'octets et les fins de ligne sont rendues telles quelles ;
//!   - le premier passage met l'ancien fichier de côté, sous un nom lisible.

use std::path::{Path, PathBuf};

use evachi::libretro::JOYPAD_BUTTONS;

/// Pour chaque bouton de la manette libretro, le bouton physique qui le tient.
///
/// C'est l'inverse de ce que garde la fenêtre — elle va du bouton physique vers
/// celui du cœur — parce qu'un émulateur pose la question dans l'autre sens :
/// « quel bouton fait la croix ? », et non « que fait ce bouton ? ».
pub type Liaisons = [Option<u8>; JOYPAD_BUTTONS];

/// Comment un émulateur nomme les boutons d'une manette.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dialecte {
    /// PCSX2 : `SDL-0/FaceSouth`.
    Sdl,
    /// PPSSPP : `20-96`, le numéro de touche d'Android, précédé du périphérique.
    Android,
    /// Dolphin : `` `Button A` ``, entre accents graves.
    XInput,
}

/// Un émulateur dont on sait écrire les touches.
pub struct Cible {
    /// Le système, tel que le dossier des émulateurs le nomme.
    pub systeme: &'static str,
    pub label: &'static str,
    /// Le fichier à écrire, relatif au dossier de l'émulateur — ou au dossier
    /// personnel quand `chez_soi` est renseigné.
    pub fichier: &'static str,
    /// Non vide quand l'émulateur range ses réglages chez l'utilisateur plutôt
    /// que dans son propre dossier : Dolphin le fait, faute d'être portable.
    pub chez_soi: &'static str,
    pub section: &'static str,
    pub dialecte: Dialecte,
    /// Les lignes qu'on écrit toujours pareil : l'appareil, les manches, les
    /// gâchettes analogiques. Rien là-dedans ne dépend des liaisons.
    pub fixes: &'static [(&'static str, &'static str)],
    /// La clé du fichier, et le bouton libretro qui doit la tenir.
    pub liaisons: &'static [(&'static str, usize)],
}

/// Le nom SDL de chaque bouton, dans la numérotation du W3C.
const SDL: [&str; JOYPAD_BUTTONS] = [
    "FaceSouth",
    "FaceEast",
    "FaceWest",
    "FaceNorth",
    "LeftShoulder",
    "RightShoulder",
    "+LeftTrigger",
    "+RightTrigger",
    "Back",
    "Start",
    "LeftStick",
    "RightStick",
    "DPadUp",
    "DPadDown",
    "DPadLeft",
    "DPadRight",
];

/// Le numéro de touche d'Android, dans la même numérotation.
const ANDROID: [u16; JOYPAD_BUTTONS] = [
    96, 97, 99, 100, 102, 103, 104, 105, 109, 108, 106, 107, 19, 20, 21, 22,
];

/// Le nom XInput, dans la même numérotation.
const XINPUT: [&str; JOYPAD_BUTTONS] = [
    "Button A",
    "Button B",
    "Button X",
    "Button Y",
    "Shoulder L",
    "Shoulder R",
    "Trigger L",
    "Trigger R",
    "Back",
    "Start",
    "Thumb L",
    "Thumb R",
    "Pad N",
    "Pad S",
    "Pad W",
    "Pad E",
];

/// Les trois émulateurs dont le fichier de touches est sûr.
///
/// Sûr veut dire : lu sur le disque, dans sa forme réelle, et non deviné. Les
/// autres — Cemu, Xenia, Vita3K — gardent leurs touches dans des formats qu'on
/// n'a pas vérifiés, et écrire au jugé dans le fichier de quelqu'un est
/// exactement ce qu'il ne faut pas faire.
pub const CIBLES: &[Cible] = &[
    Cible {
        systeme: "PlayStation 2",
        label: "PCSX2",
        fichier: "inis/PCSX2.ini",
        chez_soi: "",
        section: "Pad1",
        dialecte: Dialecte::Sdl,
        fixes: &[
            ("Type", "DualShock2"),
            ("LUp", "SDL-0/-LeftY"),
            ("LDown", "SDL-0/+LeftY"),
            ("LLeft", "SDL-0/-LeftX"),
            ("LRight", "SDL-0/+LeftX"),
            ("RUp", "SDL-0/-RightY"),
            ("RDown", "SDL-0/+RightY"),
            ("RLeft", "SDL-0/-RightX"),
            ("RRight", "SDL-0/+RightX"),
        ],
        liaisons: &[
            ("Up", 4),
            ("Down", 5),
            ("Left", 6),
            ("Right", 7),
            ("Cross", 0),
            ("Square", 1),
            ("Circle", 8),
            ("Triangle", 9),
            ("Select", 2),
            ("Start", 3),
            ("L1", 10),
            ("R1", 11),
            ("L2", 12),
            ("R2", 13),
            ("L3", 14),
            ("R3", 15),
        ],
    },
    Cible {
        systeme: "PSP",
        label: "PPSSPP",
        fichier: "memstick/PSP/SYSTEM/controls.ini",
        chez_soi: "",
        section: "ControlMapping",
        dialecte: Dialecte::Android,
        fixes: &[],
        liaisons: &[
            ("Up", 4),
            ("Down", 5),
            ("Left", 6),
            ("Right", 7),
            ("Cross", 0),
            ("Square", 1),
            ("Circle", 8),
            ("Triangle", 9),
            ("Select", 2),
            ("Start", 3),
            ("L", 10),
            ("R", 11),
        ],
    },
    // Le port 1 de Dolphin est débranché par défaut : `SIDevice0 = 0` veut
    // dire « aucune manette », et tant qu'il vaut cela, les touches qu'on écrit
    // dans GCPadNew.ini sont lues et ignorées. Six est la manette GameCube.
    // C'est la première chose à réparer, avant même les boutons — sans elle,
    // on croit avoir mal réglé alors qu'il n'y avait rien à régler.
    Cible {
        systeme: "GameCube · Wii",
        label: "Dolphin",
        fichier: "Config/Dolphin.ini",
        chez_soi: "Dolphin Emulator",
        section: "Core",
        dialecte: Dialecte::XInput,
        fixes: &[("SIDevice0", "6")],
        liaisons: &[],
    },
    // La manette GameCube n'a pas de second bouton d'épaule : Z prend celui de
    // droite, et les deux gâchettes analogiques prennent les vraies gâchettes.
    Cible {
        systeme: "GameCube · Wii",
        label: "Dolphin",
        fichier: "Config/GCPadNew.ini",
        chez_soi: "Dolphin Emulator",
        section: "GCPad1",
        dialecte: Dialecte::XInput,
        fixes: &[
            ("Device", "XInput/0/Gamepad"),
            ("Main Stick/Up", "`Left Y+`"),
            ("Main Stick/Down", "`Left Y-`"),
            ("Main Stick/Left", "`Left X-`"),
            ("Main Stick/Right", "`Left X+`"),
            ("C-Stick/Up", "`Right Y+`"),
            ("C-Stick/Down", "`Right Y-`"),
            ("C-Stick/Left", "`Right X-`"),
            ("C-Stick/Right", "`Right X+`"),
            ("Triggers/L-Analog", "`Trigger L`"),
            ("Triggers/R-Analog", "`Trigger R`"),
            ("Rumble/Motor", "`Motor L`"),
        ],
        liaisons: &[
            ("Buttons/A", 8),
            ("Buttons/B", 0),
            ("Buttons/X", 9),
            ("Buttons/Y", 1),
            ("Buttons/Z", 11),
            ("Buttons/Start", 3),
            ("D-Pad/Up", 4),
            ("D-Pad/Down", 5),
            ("D-Pad/Left", 6),
            ("D-Pad/Right", 7),
            ("Triggers/L", 12),
            ("Triggers/R", 13),
        ],
    },
];

/// Ce qu'une cible attend comme valeur pour un bouton physique donné.
pub fn valeur(dialecte: Dialecte, bouton: u8) -> Option<String> {
    let rang = bouton as usize;
    if rang >= JOYPAD_BUTTONS {
        return None;
    }
    Some(match dialecte {
        Dialecte::Sdl => format!("SDL-0/{}", SDL[rang]),
        Dialecte::Android => format!("20-{}", ANDROID[rang]),
        Dialecte::XInput => format!("`{}`", XINPUT[rang]),
    })
}

/// Le chemin du fichier de touches d'une cible.
pub fn fichier(cible: &Cible, emulateurs: &Path, personnel: &Path) -> PathBuf {
    if cible.chez_soi.is_empty() {
        // Le dossier d'un émulateur porte le nom du système, barres obliques
        // remplacées : c'est ce que fait l'installateur.
        emulateurs
            .join(cible.systeme.replace(' ', "-"))
            .join(cible.fichier)
    } else {
        personnel.join(cible.chez_soi).join(cible.fichier)
    }
}

/// Le nom de la copie de sauvegarde, à côté du fichier.
fn ecart(chemin: &Path) -> PathBuf {
    let mut nom = chemin.as_os_str().to_owned();
    nom.push(".avant-evachi");
    PathBuf::from(nom)
}

/// Ce qu'on écrit pour une clé, en tenant compte de ce qui y était déjà.
///
/// PPSSPP empile plusieurs sources sur la même ligne — le clavier, la première
/// manette, la seconde — séparées par des virgules. Écraser la ligne entière
/// retirerait le clavier, que personne n'a demandé à perdre : on ne remplace
/// donc que les morceaux qui parlent de la manette.
pub fn fondre(dialecte: Dialecte, ancienne: Option<&str>, neuve: &str) -> String {
    if dialecte != Dialecte::Android {
        return neuve.to_owned();
    }

    let mut morceaux: Vec<String> = ancienne
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|morceau| !morceau.is_empty() && !morceau.starts_with("20-"))
        .map(str::to_owned)
        .collect();
    morceaux.push(neuve.to_owned());
    morceaux.join(",")
}

/// Ce qu'un passage a changé.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ecrit {
    pub label: String,
    pub fichier: String,
    /// Combien de lignes ont changé de valeur.
    pub lignes: usize,
    /// Vrai si l'ancien fichier vient d'être mis de côté.
    pub sauvegarde: bool,
}

/// Écrit les touches d'une cible. Rend `None` quand l'émulateur n'est pas là.
///
/// Un fichier absent n'est pas une erreur : l'émulateur ne l'écrit qu'à son
/// premier lancement, et on n'a pas à le devancer — il reprendrait ses propres
/// réglages par-dessus les nôtres.
pub fn ecrire(
    cible: &Cible,
    emulateurs: &Path,
    personnel: &Path,
    liaisons: &Liaisons,
) -> Result<Option<Ecrit>, String> {
    let chemin = fichier(cible, emulateurs, personnel);
    if !chemin.is_file() {
        return Ok(None);
    }

    let brut = std::fs::read_to_string(&chemin)
        .map_err(|erreur| format!("{} : {erreur}", chemin.display()))?;

    // La marque d'octets d'en-tête et les fins de ligne sont celles du fichier :
    // les changer ferait de chaque écriture une réécriture complète aux yeux
    // d'un outil de comparaison, et PPSSPP tient à la sienne.
    let marque = brut.starts_with('\u{feff}');
    let corps = brut.strip_prefix('\u{feff}').unwrap_or(&brut);
    let crlf = corps.contains("\r\n");
    let sans_retours = corps.replace("\r\n", "\n");

    let mut voulues: Vec<(String, String)> = cible
        .fixes
        .iter()
        .map(|(cle, valeur)| ((*cle).to_owned(), (*valeur).to_owned()))
        .collect();
    for (cle, bouton) in cible.liaisons {
        let Some(physique) = liaisons.get(*bouton).copied().flatten() else {
            continue;
        };
        let Some(ecrite) = valeur(cible.dialecte, physique) else {
            continue;
        };
        voulues.push(((*cle).to_owned(), ecrite));
    }

    let (sortie, lignes) = poser(&sans_retours, cible.section, cible.dialecte, &voulues);
    if lignes == 0 {
        return Ok(Some(Ecrit {
            label: cible.label.to_owned(),
            fichier: chemin.to_string_lossy().into_owned(),
            lignes: 0,
            sauvegarde: false,
        }));
    }

    // Le premier passage met l'ancien de côté : on touche au réglage de
    // quelqu'un, et il doit pouvoir revenir en arrière sans nous.
    let garde = ecart(&chemin);
    let sauvegarde = !garde.exists();
    if sauvegarde {
        std::fs::copy(&chemin, &garde).map_err(|erreur| format!("{} : {erreur}", garde.display()))?;
    }

    let fini = if crlf {
        sortie.replace('\n', "\r\n")
    } else {
        sortie
    };
    let avec_marque = if marque {
        format!("\u{feff}{fini}")
    } else {
        fini
    };
    std::fs::write(&chemin, avec_marque)
        .map_err(|erreur| format!("{} : {erreur}", chemin.display()))?;

    Ok(Some(Ecrit {
        label: cible.label.to_owned(),
        fichier: chemin.to_string_lossy().into_owned(),
        lignes,
        sauvegarde,
    }))
}

/// Pose les clés voulues dans la bonne section. Rend le texte et le compte.
///
/// Ni réécriture complète ni fichier neuf : on remplace les lignes qu'on
/// connaît, on ajoute celles qui manquent à la fin de leur section, et on ne
/// touche à rien d'autre. Un fichier de réglages contient toujours des choses
/// qu'on ne comprend pas, et les perdre est bien pire que de ne rien changer.
pub fn poser(
    source: &str,
    section: &str,
    dialecte: Dialecte,
    voulues: &[(String, String)],
) -> (String, usize) {
    let entete = format!("[{section}]");
    let mut lignes: Vec<String> = source.split('\n').map(str::to_owned).collect();

    let debut = lignes.iter().position(|ligne| ligne.trim() == entete);
    let Some(debut) = debut else {
        // Section absente : on l'ajoute à la fin, avec tout ce qu'on sait.
        let mut ajout = vec![String::new(), entete];
        for (cle, valeur) in voulues {
            ajout.push(format!("{cle} = {}", fondre(dialecte, None, valeur)));
        }
        lignes.extend(ajout);
        return (lignes.join("\n"), voulues.len());
    };

    let fin = lignes[debut + 1..]
        .iter()
        .position(|ligne| ligne.trim_start().starts_with('['))
        .map_or(lignes.len(), |ecart| debut + 1 + ecart);

    let mut changees = 0;
    for (cle, valeur) in voulues {
        let prefixe = format!("{cle} =");
        let trouvee = lignes[debut + 1..fin]
            .iter()
            .position(|ligne| ligne.trim_start().starts_with(&prefixe))
            .map(|ecart| debut + 1 + ecart);

        let ancienne = trouvee.map(|rang| {
            lignes[rang]
                .split_once('=')
                .map(|(_, reste)| reste.trim().to_owned())
                .unwrap_or_default()
        });
        let ecrite = format!("{cle} = {}", fondre(dialecte, ancienne.as_deref(), valeur));

        match trouvee {
            Some(rang) => {
                if lignes[rang] != ecrite {
                    lignes[rang] = ecrite;
                    changees += 1;
                }
            }
            None => {
                // Ajoutée à la fin de sa section, et non n'importe où : une clé
                // posée après le crochet suivant appartiendrait à la section
                // d'après, et l'émulateur ne la lirait jamais.
                let mut place = fin;
                while place > debut + 1 && lignes[place - 1].trim().is_empty() {
                    place -= 1;
                }
                lignes.insert(place, ecrite);
                changees += 1;
            }
        }
    }

    (lignes.join("\n"), changees)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn aucune() -> Liaisons {
        [None; JOYPAD_BUTTONS]
    }

    /// Les liaisons d'origine : chaque bouton du cœur tenu par son homologue.
    fn ordinaires() -> Liaisons {
        let mut liaisons = aucune();
        // La table par défaut de la fenêtre, à l'envers.
        for (physique, coeur) in [
            (0u8, 0usize),
            (1, 8),
            (2, 1),
            (3, 9),
            (4, 10),
            (5, 11),
            (6, 12),
            (7, 13),
            (8, 2),
            (9, 3),
            (10, 14),
            (11, 15),
            (12, 4),
            (13, 5),
            (14, 6),
            (15, 7),
        ] {
            liaisons[coeur] = Some(physique);
        }
        liaisons
    }

    #[test]
    fn nomme_les_boutons_dans_les_trois_dialectes() {
        assert_eq!(valeur(Dialecte::Sdl, 0).unwrap(), "SDL-0/FaceSouth");
        assert_eq!(valeur(Dialecte::Android, 0).unwrap(), "20-96");
        assert_eq!(valeur(Dialecte::XInput, 0).unwrap(), "`Button A`");
        assert_eq!(valeur(Dialecte::Sdl, 15).unwrap(), "SDL-0/DPadRight");
    }

    #[test]
    fn refuse_un_bouton_qui_n_existe_pas() {
        // Seize boutons : le dix-septième n'a de nom dans aucun dialecte, et en
        // inventer un ferait écrire une ligne que l'émulateur rejetterait.
        assert!(valeur(Dialecte::Sdl, 16).is_none());
        assert!(valeur(Dialecte::Android, 200).is_none());
    }

    #[test]
    fn remplace_une_ligne_sans_toucher_au_reste() {
        let source = "[Pad1]\nType = DualShock2\nCross = SDL-0/FaceNorth\nAutre = laisse-moi\n\n[Pad2]\nCross = SDL-0/FaceSouth\n";
        let (sortie, combien) = poser(
            source,
            "Pad1",
            Dialecte::Sdl,
            &[("Cross".into(), "SDL-0/FaceSouth".into())],
        );

        assert_eq!(combien, 1);
        assert!(sortie.contains("[Pad1]\nType = DualShock2\nCross = SDL-0/FaceSouth\nAutre = laisse-moi"));
        assert!(sortie.contains("Autre = laisse-moi"), "une ligne inconnue a disparu");
        assert!(sortie.ends_with("[Pad2]\nCross = SDL-0/FaceSouth\n"), "la section voisine a bougé");
    }

    #[test]
    fn ajoute_une_cle_absente_a_la_fin_de_sa_section() {
        // Posée après le crochet suivant, elle appartiendrait à la section
        // d'après et l'émulateur ne la lirait jamais.
        let source = "[Pad1]\nType = DualShock2\n\n[Pad2]\nType = DualShock2\n";
        let (sortie, combien) = poser(
            source,
            "Pad1",
            Dialecte::Sdl,
            &[("Cross".into(), "SDL-0/FaceSouth".into())],
        );

        assert_eq!(combien, 1);
        let rang_cross = sortie.find("Cross").expect("la clé ajoutée");
        let rang_pad2 = sortie.find("[Pad2]").expect("la section voisine");
        assert!(rang_cross < rang_pad2);
    }

    #[test]
    fn cree_la_section_quand_elle_manque() {
        let (sortie, combien) = poser(
            "[Autre]\nx = 1\n",
            "Pad1",
            Dialecte::Sdl,
            &[("Cross".into(), "SDL-0/FaceSouth".into())],
        );
        assert_eq!(combien, 1);
        assert!(sortie.contains("[Pad1]"));
        assert!(sortie.contains("Cross = SDL-0/FaceSouth"));
        assert!(sortie.contains("[Autre]\nx = 1"));
    }

    #[test]
    fn ne_compte_rien_quand_tout_est_deja_en_place() {
        // Sans cela, chaque ouverture du panneau réécrirait le fichier et en
        // ferait une sauvegarde de plus.
        let source = "[Pad1]\nCross = SDL-0/FaceSouth\n";
        let (_, combien) = poser(
            source,
            "Pad1",
            Dialecte::Sdl,
            &[("Cross".into(), "SDL-0/FaceSouth".into())],
        );
        assert_eq!(combien, 0);
    }

    #[test]
    fn garde_le_clavier_de_ppsspp() {
        // Une ligne de PPSSPP empile le clavier, la première manette et la
        // seconde. On ne remplace que ce qui parle de la première.
        assert_eq!(
            fondre(Dialecte::Android, Some("1-54,20-96,10-189"), "20-97"),
            "1-54,10-189,20-97",
        );
        assert_eq!(fondre(Dialecte::Android, None, "20-97"), "20-97");
        assert_eq!(fondre(Dialecte::Android, Some(""), "20-97"), "20-97");
    }

    #[test]
    fn les_autres_dialectes_ecrasent_la_ligne() {
        assert_eq!(fondre(Dialecte::Sdl, Some("SDL-0/FaceNorth"), "SDL-0/FaceSouth"), "SDL-0/FaceSouth");
        assert_eq!(fondre(Dialecte::XInput, Some("`Button B`"), "`Button A`"), "`Button A`");
    }

    #[test]
    fn n_ecrit_rien_pour_un_bouton_sans_liaison() {
        // Un bouton que personne ne tient ne doit pas devenir une ligne vide :
        // l'émulateur la lirait comme « aucune touche », et le bouton
        // deviendrait muet chez lui aussi.
        let vide = aucune();
        let dossier = std::env::temp_dir();
        for cible in CIBLES {
            let mut voulues = Vec::new();
            for (cle, bouton) in cible.liaisons {
                if let Some(physique) = vide[*bouton] {
                    voulues.push(((*cle).to_owned(), valeur(cible.dialecte, physique).unwrap()));
                }
            }
            assert!(voulues.is_empty(), "{} : des lignes sans liaison", cible.label);
        }
        let _ = dossier;
    }

    #[test]
    fn chaque_cible_couvre_les_boutons_de_sa_console() {
        let liaisons = ordinaires();
        for cible in CIBLES {
            assert!(
                !cible.liaisons.is_empty() || !cible.fixes.is_empty(),
                "{} : ni liaison ni ligne fixe, ce fichier n'a rien à recevoir",
                cible.label
            );
            for (cle, bouton) in cible.liaisons {
                assert!(*bouton < JOYPAD_BUTTONS, "{} {cle} : bouton {bouton}", cible.label);
                assert!(
                    liaisons[*bouton].is_some(),
                    "{} {cle} : rien ne tient le bouton {bouton}",
                    cible.label
                );
            }
            // Deux clés sur le même bouton du cœur, c'est un doublon qu'on veut
            // voir ici plutôt que manette en main.
            let mut vus: Vec<&str> = cible.liaisons.iter().map(|(cle, _)| *cle).collect();
            let total = vus.len();
            vus.sort_unstable();
            vus.dedup();
            assert_eq!(vus.len(), total, "{} : une clé écrite deux fois", cible.label);
        }
    }

    #[test]
    fn range_le_fichier_de_chacun_au_bon_endroit() {
        let emulateurs = Path::new("C:/emus");
        let personnel = Path::new("C:/moi");
        for cible in CIBLES {
            let ou = fichier(cible, emulateurs, personnel);
            let chez_soi = ou.starts_with(personnel);
            assert_eq!(
                chez_soi,
                !cible.chez_soi.is_empty(),
                "{} : rangé du mauvais côté",
                cible.label
            );
        }
    }

    #[test]
    fn ne_touche_pas_a_un_emulateur_absent() {
        // Un fichier que l'émulateur n'a pas encore écrit ne doit pas être
        // devancé : il reprendrait ses propres réglages par-dessus les nôtres.
        let nulle_part = std::env::temp_dir().join("evachi-touches-absent");
        let issue = ecrire(&CIBLES[0], &nulle_part, &nulle_part, &ordinaires());
        assert!(matches!(issue, Ok(None)));
    }
}
