//! Le dépôt : un dossier où l'on jette ses jeux sans les ranger.
//!
//! La bibliothèque d'EvaChi se tient par ses dossiers — c'est le nom du dossier
//! qui dit la console, et donc l'émulateur. Ranger soi-même quarante fichiers
//! téléchargés dans la journée n'a pourtant rien d'amusant, et on finit par
//! tout laisser en vrac quelque part.
//!
//! D'où ce dossier-ci. On y dépose, EvaChi range au démarrage suivant, et le
//! dépôt se retrouve vide.
//!
//! Le classement se fait sur l'extension, et sur elle seule : c'est le seul
//! renseignement sûr qu'un nom de fichier porte. Une extension qui ne désigne
//! qu'une console part toute seule ; `.iso` en désigne huit, et celle-là
//! attend qu'on dise laquelle plutôt que de parier.

use std::path::{Path, PathBuf};

use crate::skeleton::FOLDERS;

/// Le nom du dossier de dépôt, tel qu'il apparaît dans l'explorateur.
pub const DEPOT: &str = "drop u'r rom";

/// Jusqu'où descendre dans le dépôt.
///
/// On y jette parfois une archive décompressée telle quelle, avec ses
/// sous-dossiers. Trois étages couvrent le cas ordinaire sans partir explorer
/// un disque entier.
const PROFONDEUR: usize = 3;

/// Un fichier déposé, et ce qu'on sait en faire.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Depose {
    /// Le nom du fichier.
    pub nom: String,
    /// Son chemin complet, tel qu'il faudra le redonner pour le ranger.
    pub chemin: String,
    pub taille: u64,
    /// Les dossiers de la bibliothèque qui acceptent cette extension.
    ///
    /// Vide quand personne ne la reconnaît ; un seul quand le rangement est
    /// évident ; plusieurs quand il faut demander.
    pub dossiers: Vec<String>,
    /// Le fichier de même nom déjà rangé, s'il y en a un.
    ///
    /// C'est la définition du doublon : même nom de fichier, donc même titre,
    /// même code et même région — tout cela est écrit dans le nom.
    pub double: Option<String>,
}

/// Les extensions qu'un nom de dossier annonce entre parenthèses.
///
/// « Nes (nes-fds-unf) » en annonce trois, « 3DO (.iso .cue .chd .bin) »
/// quatre. Les deux écritures se croisent dans l'ossature : le point est
/// facultatif, le séparateur est l'espace ou le tiret.
pub fn extensions_du_dossier(dossier: &str) -> Vec<String> {
    let Some(debut) = dossier.find('(') else {
        return Vec::new();
    };
    let Some(fin) = dossier[debut..].find(')') else {
        return Vec::new();
    };

    dossier[debut + 1..debut + fin]
        .split(['-', ' ', '.', ','])
        .filter(|morceau| !morceau.is_empty())
        .map(|morceau| morceau.to_lowercase())
        .collect()
}

/// Les dossiers de la bibliothèque qui acceptent cette extension.
///
/// L'ordre est celui de l'ossature, qui est alphabétique : rien n'y est
/// « préféré », et ce n'est pas à cette fonction de trancher entre une image
/// PlayStation et une image Saturn.
pub fn dossiers_pour_extension(extension: &str) -> Vec<String> {
    let cherchee = extension.to_lowercase();
    if cherchee.is_empty() {
        return Vec::new();
    }
    FOLDERS
        .iter()
        .filter(|dossier| extensions_du_dossier(dossier).contains(&cherchee))
        .map(|dossier| (*dossier).to_string())
        .collect()
}

/// L'extension d'un nom de fichier, en minuscules.
fn extension(nom: &str) -> String {
    Path::new(nom)
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

/// Cherche, dans la bibliothèque, un fichier qui porte déjà ce nom.
///
/// Dans tous les dossiers et non seulement dans celui où l'on s'apprête à
/// ranger : une cartouche déposée deux fois peut avoir été classée ailleurs la
/// première fois, et la retrouver vaut mieux que d'en faire une seconde copie.
fn deja_range(roms: &Path, nom: &str) -> Option<String> {
    let Ok(entrees) = std::fs::read_dir(roms) else {
        return None;
    };
    for entree in entrees.flatten() {
        let dossier = entree.path();
        if !dossier.is_dir() || dossier.file_name().is_some_and(|nom| nom == DEPOT) {
            continue;
        }
        if let Some(trouve) = cherche_nom(&dossier, nom, PROFONDEUR) {
            return Some(trouve);
        }
    }
    None
}

fn cherche_nom(dossier: &Path, nom: &str, etage: usize) -> Option<String> {
    if etage == 0 {
        return None;
    }
    let entrees = std::fs::read_dir(dossier).ok()?;
    for entree in entrees.flatten() {
        let chemin = entree.path();
        if chemin.is_dir() {
            if let Some(trouve) = cherche_nom(&chemin, nom, etage - 1) {
                return Some(trouve);
            }
            continue;
        }
        if chemin
            .file_name()
            .and_then(|trouve| trouve.to_str())
            .is_some_and(|trouve| trouve.eq_ignore_ascii_case(nom))
        {
            return Some(chemin.to_string_lossy().into_owned());
        }
    }
    None
}

/// Crée le dépôt s'il manque. Rend son chemin.
pub fn depot(roms: &Path) -> PathBuf {
    let chemin = roms.join(DEPOT);
    let _ = std::fs::create_dir_all(&chemin);
    chemin
}

/// Ce qui attend dans le dépôt, du plus évident au moins évident.
///
/// Les fichiers qu'on sait ranger viennent d'abord : la barre d'avancement les
/// traite sans rien demander, et ce qui reste à décider se pose une seule fois,
/// à la fin, quand le gros du travail est fait.
pub fn inventaire(roms: &Path) -> Vec<Depose> {
    let depot = depot(roms);
    let mut trouves = Vec::new();
    ramasser(&depot, roms, PROFONDEUR, &mut trouves);

    trouves.sort_by_key(|depose| {
        let rang = match (depose.double.is_some(), depose.dossiers.len()) {
            (false, 1) => 0,
            (true, _) => 2,
            _ => 1,
        };
        (rang, depose.nom.to_lowercase())
    });
    trouves
}

fn ramasser(dossier: &Path, roms: &Path, etage: usize, dans: &mut Vec<Depose>) {
    let Ok(entrees) = std::fs::read_dir(dossier) else {
        return;
    };

    for entree in entrees.flatten() {
        let chemin = entree.path();
        if chemin.is_dir() {
            if etage > 1 {
                ramasser(&chemin, roms, etage - 1, dans);
            }
            continue;
        }
        let Some(nom) = chemin.file_name().and_then(|nom| nom.to_str()) else {
            continue;
        };

        dans.push(Depose {
            nom: nom.to_owned(),
            chemin: chemin.to_string_lossy().into_owned(),
            taille: entree.metadata().map(|info| info.len()).unwrap_or(0),
            dossiers: dossiers_pour_extension(&extension(nom)),
            double: deja_range(roms, nom),
        });
    }
}

/// Ce qu'on fait d'un fichier déposé.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Geste {
    /// Le ranger dans le dossier demandé.
    Ranger,
    /// Le ranger en remplaçant celui qui portait déjà ce nom.
    Remplacer,
    /// Le jeter.
    Jeter,
}

impl Geste {
    pub fn depuis(mot: &str) -> Option<Self> {
        Some(match mot {
            "ranger" => Self::Ranger,
            "remplacer" => Self::Remplacer,
            "jeter" => Self::Jeter,
            _ => return None,
        })
    }
}

/// Range un fichier du dépôt dans un dossier de la bibliothèque.
///
/// Le déplacement est tenté d'abord : c'est instantané sur un même disque.
/// Il échoue d'un disque à l'autre — le dépôt peut être sur une clé — et on
/// recopie alors avant d'effacer la source, jamais l'inverse : une copie
/// interrompue laisse deux fichiers, un effacement anticipé n'en laisse aucun.
pub fn ranger(roms: &Path, fichier: &str, dossier: &str, geste: Geste) -> Result<String, String> {
    let source = PathBuf::from(fichier);
    if !source.is_file() {
        return Err(format!("{fichier} : introuvable"));
    }
    // Le fichier doit venir du dépôt : cette commande déplace et efface, et
    // rien d'autre qu'un dépôt n'a à lui être confié.
    if !source.starts_with(depot(roms)) {
        return Err(format!("{fichier} : hors du dépôt"));
    }

    if geste == Geste::Jeter {
        std::fs::remove_file(&source).map_err(|erreur| format!("{fichier} : {erreur}"))?;
        return Ok(String::new());
    }

    // Le nom du dossier vient de la fenêtre : il doit être l'un de ceux de
    // l'ossature, et pas un chemin qu'on remonterait.
    if !FOLDERS.contains(&dossier) {
        return Err(format!("{dossier} : dossier inconnu"));
    }

    let nom = source
        .file_name()
        .ok_or_else(|| format!("{fichier} : sans nom"))?
        .to_owned();
    let cible = roms.join(dossier);
    std::fs::create_dir_all(&cible).map_err(|erreur| format!("{} : {erreur}", cible.display()))?;

    let mut destination = cible.join(&nom);
    if destination.exists() {
        match geste {
            Geste::Remplacer => {
                std::fs::remove_file(&destination)
                    .map_err(|erreur| format!("{} : {erreur}", destination.display()))?;
            }
            // Deux fichiers de même nom ne peuvent pas cohabiter : celui qui
            // arrive prend un numéro, et les deux restent lisibles.
            _ => destination = libre(&cible, &nom),
        }
    }

    if std::fs::rename(&source, &destination).is_err() {
        std::fs::copy(&source, &destination)
            .map_err(|erreur| format!("{} : {erreur}", destination.display()))?;
        std::fs::remove_file(&source).map_err(|erreur| format!("{fichier} : {erreur}"))?;
    }
    Ok(destination.to_string_lossy().into_owned())
}

/// Un nom libre dans ce dossier : « jeu (2).nes », puis « jeu (3).nes ».
fn libre(dossier: &Path, nom: &std::ffi::OsString) -> PathBuf {
    let brut = nom.to_string_lossy().into_owned();
    let (souche, extension) = match brut.rsplit_once('.') {
        Some((souche, extension)) => (souche.to_owned(), format!(".{extension}")),
        None => (brut.clone(), String::new()),
    };

    for numero in 2..1000 {
        let essai = dossier.join(format!("{souche} ({numero}){extension}"));
        if !essai.exists() {
            return essai;
        }
    }
    dossier.join(brut)
}

/// Retire du dépôt les dossiers restés vides après le rangement.
///
/// Sans cela, une archive décompressée laisse son arborescence derrière elle, et
/// le dépôt n'a l'air vide qu'une fois qu'on l'ouvre.
pub fn balayer(roms: &Path) -> usize {
    vider(&depot(roms))
}

/// Retire les sous-dossiers vides, du plus profond au plus proche.
///
/// L'ordre compte : un dossier ne devient vide qu'une fois le sien retire, et
/// remonter d'abord laisserait des coquilles imbriquees.
fn vider(dossier: &Path) -> usize {
    let Ok(entrees) = std::fs::read_dir(dossier) else {
        return 0;
    };
    let mut retires = 0;
    for entree in entrees.flatten() {
        let chemin = entree.path();
        if !chemin.is_dir() {
            continue;
        }
        retires += vider(&chemin);
        if std::fs::read_dir(&chemin).is_ok_and(|reste| reste.count() == 0)
            && std::fs::remove_dir(&chemin).is_ok()
        {
            retires += 1;
        }
    }
    retires
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);

        let base = std::env::temp_dir().join(format!(
            "evachi-depot-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("dossier");
        base
    }

    #[test]
    fn lit_les_extensions_des_deux_ecritures() {
        assert_eq!(
            extensions_du_dossier("Nes (nes-fds-unf)"),
            vec!["nes", "fds", "unf"]
        );
        assert_eq!(
            extensions_du_dossier("3DO (.iso .cue .chd .bin)"),
            vec!["iso", "cue", "chd", "bin"]
        );
        assert!(extensions_du_dossier("Sans parenthèses").is_empty());
    }

    #[test]
    fn une_extension_propre_ne_designe_qu_un_dossier() {
        assert_eq!(dossiers_pour_extension("nes"), vec!["Nes (nes-fds-unf)"]);
        assert_eq!(dossiers_pour_extension("gba"), vec!["Gameboy Advance (gba)"]);
        assert_eq!(dossiers_pour_extension("sfc"), vec!["Super Nintendo (smc-sfc-swc-fig)"]);
    }

    #[test]
    fn une_extension_partagee_les_designe_tous() {
        // C'est le cas qu'on ne veut surtout pas deviner : une image disque ne
        // dit pas de quelle console elle vient, et la ranger au hasard la
        // rendrait injouable sans qu'on comprenne pourquoi.
        let iso = dossiers_pour_extension("iso");
        assert!(iso.len() > 3, "seulement {} dossiers pour .iso", iso.len());
        assert!(iso.iter().any(|dossier| dossier.starts_with("PlayStation 2")));
        assert!(
            !iso.iter().any(|dossier| dossier.starts_with("Dreamcast")),
            "la Dreamcast n'annonce pas les images ISO"
        );
    }

    #[test]
    fn une_extension_inconnue_ne_designe_rien() {
        assert!(dossiers_pour_extension("txt").is_empty());
        assert!(dossiers_pour_extension("").is_empty());
    }

    #[test]
    fn range_ce_qui_est_evident_et_signale_le_reste() {
        let base = scratch();
        let depot = depot(&base);
        std::fs::write(depot.join("Zelda.nes"), b"rom").expect("dépôt");
        std::fs::write(depot.join("Disque.iso"), b"image").expect("dépôt");
        std::fs::write(depot.join("Notes.txt"), b"texte").expect("dépôt");

        let attente = inventaire(&base);
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(attente.len(), 3);
        // L'évident d'abord : c'est l'ordre dans lequel la barre les traite.
        assert_eq!(attente[0].nom, "Zelda.nes");
        assert_eq!(attente[0].dossiers.len(), 1);
        assert!(attente.iter().any(|depose| depose.nom == "Notes.txt"
            && depose.dossiers.is_empty()));
    }

    #[test]
    fn reconnait_un_doublon_deja_range() {
        let base = scratch();
        let depot = depot(&base);
        std::fs::create_dir_all(base.join("Nes (nes-fds-unf)")).expect("dossier");
        std::fs::write(base.join("Nes (nes-fds-unf)").join("Zelda.nes"), b"ancien")
            .expect("rangé");
        std::fs::write(depot.join("Zelda.nes"), b"neuf").expect("dépôt");

        let attente = inventaire(&base);
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(attente.len(), 1);
        assert!(attente[0].double.is_some(), "le doublon n'a pas été vu");
    }

    #[test]
    fn range_un_fichier_et_vide_le_depot() {
        let base = scratch();
        let depot = depot(&base);
        let source = depot.join("Zelda.nes");
        std::fs::write(&source, b"rom").expect("dépôt");

        let pose = ranger(
            &base,
            &source.to_string_lossy(),
            "Nes (nes-fds-unf)",
            Geste::Ranger,
        )
        .expect("rangement");
        let reste = source.exists();
        let arrive = Path::new(&pose).exists();
        let _ = std::fs::remove_dir_all(&base);

        assert!(!reste, "le fichier est resté dans le dépôt");
        assert!(arrive);
    }

    #[test]
    fn garde_les_deux_plutot_que_d_ecraser() {
        let base = scratch();
        let depot = depot(&base);
        let range = base.join("Nes (nes-fds-unf)");
        std::fs::create_dir_all(&range).expect("dossier");
        std::fs::write(range.join("Zelda.nes"), b"ancien").expect("rangé");
        let source = depot.join("Zelda.nes");
        std::fs::write(&source, b"neuf").expect("dépôt");

        let pose = ranger(
            &base,
            &source.to_string_lossy(),
            "Nes (nes-fds-unf)",
            Geste::Ranger,
        )
        .expect("rangement");
        let ancien = std::fs::read(range.join("Zelda.nes")).expect("ancien");
        let _ = std::fs::remove_dir_all(&base);

        assert!(pose.ends_with("Zelda (2).nes"), "posé en {pose}");
        assert_eq!(ancien, b"ancien", "l'ancien a été écrasé");
    }

    #[test]
    fn remplace_quand_on_le_demande() {
        let base = scratch();
        let depot = depot(&base);
        let range = base.join("Nes (nes-fds-unf)");
        std::fs::create_dir_all(&range).expect("dossier");
        std::fs::write(range.join("Zelda.nes"), b"ancien").expect("rangé");
        let source = depot.join("Zelda.nes");
        std::fs::write(&source, b"neuf").expect("dépôt");

        ranger(
            &base,
            &source.to_string_lossy(),
            "Nes (nes-fds-unf)",
            Geste::Remplacer,
        )
        .expect("rangement");
        let contenu = std::fs::read(range.join("Zelda.nes")).expect("relecture");
        let combien = std::fs::read_dir(&range).expect("lecture").count();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(contenu, b"neuf");
        assert_eq!(combien, 1, "le remplacement a laissé deux fichiers");
    }

    #[test]
    fn refuse_ce_qui_ne_vient_pas_du_depot() {
        // La fenêtre donne le chemin ; cette commande efface. Les deux ensemble
        // valent un garde-fou : personne ne doit pouvoir faire déplacer un
        // fichier quelconque de la machine.
        let base = scratch();
        let ailleurs = base.join("ailleurs.nes");
        std::fs::write(&ailleurs, b"rom").expect("fichier");

        let issue = ranger(
            &base,
            &ailleurs.to_string_lossy(),
            "Nes (nes-fds-unf)",
            Geste::Ranger,
        );
        let intact = ailleurs.exists();
        let _ = std::fs::remove_dir_all(&base);

        assert!(issue.is_err());
        assert!(intact);
    }

    #[test]
    fn refuse_un_dossier_invente() {
        let base = scratch();
        let depot = depot(&base);
        let source = depot.join("Zelda.nes");
        std::fs::write(&source, b"rom").expect("dépôt");

        let issue = ranger(&base, &source.to_string_lossy(), "../ailleurs", Geste::Ranger);
        let intact = source.exists();
        let _ = std::fs::remove_dir_all(&base);

        assert!(issue.is_err());
        assert!(intact);
    }

    #[test]
    fn balaie_les_dossiers_restes_vides() {
        let base = scratch();
        let depot = depot(&base);
        std::fs::create_dir_all(depot.join("archive").join("dedans")).expect("dossiers");

        let retires = balayer(&base);
        let reste = depot.join("archive").exists();
        let debout = depot.exists();
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(retires, 2);
        assert!(!reste);
        assert!(debout, "le dépôt lui-même doit rester");
    }
}
