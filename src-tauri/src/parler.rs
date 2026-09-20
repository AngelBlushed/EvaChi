//! La langue de la console, portée chez les émulateurs autonomes.
//!
//! EvaChi demande déjà cette langue aux cœurs qu'elle charge elle-même. Un
//! émulateur autonome, lui, garde la sienne dans son propre fichier : un jeu
//! Wii U lancé depuis EvaChi démarre donc dans la langue que Cemu a retenue,
//! et non dans celle qu'on a choisie ici.
//!
//! Et il n'y a pas moyen de la lui dire en passant. EvaChi le lance dans le
//! jeu et en plein écran — c'est ce qu'on veut quand on choisit un jeu — si
//! bien que sa fenêtre de réglages ne s'ouvre jamais. Le réglage existait donc
//! sans qu'on puisse l'atteindre. On écrit chez lui, comme on écrit déjà ses
//! touches.
//!
//! Comme pour les touches : l'émulateur réécrit son fichier en se fermant.
//! Écrire pendant qu'il tourne ne sert à rien.

use std::path::{Path, PathBuf};

/// Un émulateur dont on sait régler la langue de console.
pub struct Cible {
    /// Le système, tel qu'EvaChi le déclare dans ses émulateurs externes.
    pub systeme: &'static str,
    pub label: &'static str,
    /// Le fichier de réglages, à côté de l'exécutable quand il est portable.
    pub fichier: &'static str,
    /// Le même, sous le dossier personnel, quand il ne l'est pas.
    pub chez_soi: &'static str,
    /// La balise qui porte la langue de la console.
    pub balise: &'static str,
}

/// Les émulateurs dont on sait régler la langue.
///
/// Un seul pour l'instant, et c'est voulu : chaque émulateur range la sienne à
/// sa façon, et une table écrite de mémoire pour cinq d'un coup serait fausse
/// pour quatre. Celui-ci est vérifié.
pub const CIBLES: &[Cible] = &[Cible {
    systeme: "Wii U",
    label: "Cemu",
    fichier: "settings.xml",
    chez_soi: "Cemu/settings.xml",
    balise: "console_language",
}];

/// La valeur qu'une cible donne à une langue.
///
/// L'ordre est celui de la console elle-même, et non un ordre alphabétique :
/// c'est la Wii U qui numérote ses langues, Cemu ne fait que la suivre.
pub fn valeur(label: &str, code: &str) -> Option<String> {
    if label != "Cemu" {
        return None;
    }
    let rang: u8 = match code {
        "ja" => 0,
        "en" => 1,
        "fr" => 2,
        "de" => 3,
        "it" => 4,
        "es" => 5,
        "zh" => 6,
        "ko" => 7,
        "nl" => 8,
        "pt" => 9,
        "ru" => 10,
        _ => return None,
    };
    Some(rang.to_string())
}

/// Le contenu d'une balise simple, s'il y en a une.
pub fn lire(xml: &str, balise: &str) -> Option<String> {
    let ouvre = format!("<{balise}>");
    let ferme = format!("</{balise}>");
    let debut = xml.find(&ouvre)? + ouvre.len();
    let fin = xml[debut..].find(&ferme)? + debut;
    let dedans = &xml[debut..fin];
    // Une balise qui en contient d'autres n'est pas celle qu'on croit : on ne
    // touche qu'à une valeur simple.
    (!dedans.contains('<')).then(|| dedans.to_owned())
}

/// Le fichier, avec cette balise changée. `None` si elle n'y est pas.
///
/// Par remplacement et non par réécriture : le fichier garde ses fins de
/// ligne, sa marque d'octets, ses espaces et l'ordre de ses balises. Un
/// émulateur qui relit un fichier reformaté n'y perd rien, mais l'utilisateur
/// qui le compare, si.
pub fn poser(xml: &str, balise: &str, valeur: &str) -> Option<String> {
    let ouvre = format!("<{balise}>");
    let ferme = format!("</{balise}>");
    let debut = xml.find(&ouvre)? + ouvre.len();
    let fin = xml[debut..].find(&ferme)? + debut;
    if xml[debut..fin].contains('<') {
        return None;
    }
    Some(format!("{}{valeur}{}", &xml[..debut], &xml[fin..]))
}

/// Le fichier de réglages d'une cible, s'il existe.
///
/// À côté de l'exécutable d'abord : Cemu bascule en mode portable dès qu'un
/// dossier `portable` se trouve près de lui, et c'est ainsi qu'EvaChi
/// l'installe. Un Cemu déjà présent sur la machine, lui, garde ses réglages
/// dans le dossier personnel.
pub fn fichier(cible: &Cible, executable: &Path, personnel: &Path) -> Option<PathBuf> {
    if let Some(dossier) = executable.parent() {
        let cote = dossier.join(cible.fichier);
        if cote.is_file() {
            return Some(cote);
        }
    }
    let errant = personnel.join(cible.chez_soi);
    errant.is_file().then_some(errant)
}

/// Le nom de la copie de sauvegarde, à côté du fichier.
fn ecart(chemin: &Path) -> PathBuf {
    let mut nom = chemin.as_os_str().to_owned();
    nom.push(".avant-evachi");
    PathBuf::from(nom)
}

/// Ce qu'une écriture a changé.
pub struct Ecrit {
    pub label: String,
    pub chemin: String,
    /// La valeur qui y était, pour pouvoir dire ce qu'on a remplacé.
    pub avant: String,
    pub apres: String,
}

/// Écrit la langue chez une cible. Rend `None` quand il n'y a rien à faire.
pub fn ecrire(
    cible: &Cible,
    executable: &Path,
    personnel: &Path,
    code: &str,
) -> Result<Option<Ecrit>, String> {
    let Some(valeur) = valeur(cible.label, code) else {
        return Ok(None);
    };
    let Some(chemin) = fichier(cible, executable, personnel) else {
        return Ok(None);
    };

    let brut = std::fs::read_to_string(&chemin)
        .map_err(|erreur| format!("{} : {erreur}", chemin.display()))?;
    let Some(avant) = lire(&brut, cible.balise) else {
        return Err(format!(
            "{} : pas de <{}> dans ce fichier",
            chemin.display(),
            cible.balise
        ));
    };
    if avant == valeur {
        return Ok(None);
    }

    let Some(sortie) = poser(&brut, cible.balise, &valeur) else {
        return Err(format!("{} : balise illisible", chemin.display()));
    };

    // Une copie avant la première écriture, et une seule : la deuxième
    // écraserait l'état d'origine par celui qu'on vient d'écrire.
    let copie = ecart(&chemin);
    if !copie.exists() {
        std::fs::copy(&chemin, &copie)
            .map_err(|erreur| format!("{} : {erreur}", copie.display()))?;
    }

    std::fs::write(&chemin, sortie).map_err(|erreur| format!("{} : {erreur}", chemin.display()))?;
    Ok(Some(Ecrit {
        label: cible.label.to_owned(),
        chemin: chemin.display().to_string(),
        avant,
        apres: valeur,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un fichier de réglages qui ressemble à celui de Cemu.
    const REGLAGES: &str = concat!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n",
        "<content>\n",
        "    <logflag>0</logflag>\n",
        "    <language>0</language>\n",
        "    <console_language>1</console_language>\n",
        "    <window_position>\n",
        "        <x>-1</x>\n",
        "    </window_position>\n",
        "</content>\n",
    );

    #[test]
    fn numerote_les_langues_comme_la_console() {
        assert_eq!(valeur("Cemu", "ja").as_deref(), Some("0"));
        assert_eq!(valeur("Cemu", "en").as_deref(), Some("1"));
        assert_eq!(valeur("Cemu", "fr").as_deref(), Some("2"));
        assert_eq!(valeur("Cemu", "ru").as_deref(), Some("10"));
    }

    #[test]
    fn ignore_une_langue_ou_un_emulateur_qu_elle_ne_connait_pas() {
        assert!(valeur("Cemu", "ta").is_none());
        assert!(valeur("Cemu", "auto").is_none());
        assert!(valeur("PCSX2", "fr").is_none());
    }

    #[test]
    fn lit_la_langue_de_la_console_et_non_celle_de_la_fenetre() {
        // `<language>` est la langue de l'interface de Cemu, et n'a rien à voir
        // avec celle des jeux. Les deux se ressemblent assez pour qu'une
        // recherche trop large prenne l'une pour l'autre.
        assert_eq!(lire(REGLAGES, "console_language").as_deref(), Some("1"));
        assert_eq!(lire(REGLAGES, "language").as_deref(), Some("0"));
    }

    #[test]
    fn remplace_la_valeur_sans_toucher_au_reste() {
        let sortie = poser(REGLAGES, "console_language", "2").expect("balise trouvée");
        assert!(sortie.contains("<console_language>2</console_language>"));
        assert!(sortie.contains("<language>0</language>"));
        assert!(sortie.contains("<x>-1</x>"));
        assert_eq!(sortie.lines().count(), REGLAGES.lines().count());
    }

    #[test]
    fn garde_les_fins_de_ligne_du_fichier() {
        let windows = REGLAGES.replace('\n', "\r\n");
        let sortie = poser(&windows, "console_language", "5").expect("balise trouvée");
        assert!(sortie.contains("\r\n"));
        assert_eq!(sortie.matches("\r\n").count(), windows.matches("\r\n").count());
    }

    #[test]
    fn refuse_une_balise_absente_ou_composee() {
        assert!(poser(REGLAGES, "console_langauge", "2").is_none());
        assert!(lire(REGLAGES, "window_position").is_none());
        assert!(poser(REGLAGES, "window_position", "2").is_none());
    }

    #[test]
    fn ecrit_une_fois_et_garde_une_copie() {
        let temp = std::env::temp_dir().join(format!("evachi-parler-{}", std::process::id()));
        let dossier = temp.join("Cemu");
        std::fs::create_dir_all(&dossier).expect("dossier");
        let reglages = dossier.join("settings.xml");
        std::fs::write(&reglages, REGLAGES).expect("écriture");

        let cible = &CIBLES[0];
        let faux_exe = temp.join("ailleurs").join("Cemu.exe");
        let ecrit = ecrire(cible, &faux_exe, &temp, "fr")
            .expect("écriture")
            .expect("quelque chose à écrire");
        assert_eq!(ecrit.avant, "1");
        assert_eq!(ecrit.apres, "2");
        let relu = std::fs::read_to_string(&reglages).expect("relecture");
        assert!(relu.contains("<console_language>2</console_language>"));
        let copie = std::fs::read_to_string(ecart(&reglages)).expect("copie");
        assert!(copie.contains("<console_language>1</console_language>"));

        // Deux fois la même langue : plus rien à écrire.
        assert!(ecrire(cible, &faux_exe, &temp, "fr").expect("écriture").is_none());

        // Et la copie garde l'état d'origine, pas celui qu'on vient de poser.
        ecrire(cible, &faux_exe, &temp, "de").expect("écriture");
        let copie = std::fs::read_to_string(ecart(&reglages)).expect("copie");
        assert!(copie.contains("<console_language>1</console_language>"));

        std::fs::remove_dir_all(&temp).ok();
    }
}
