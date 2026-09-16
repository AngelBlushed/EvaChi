//! Le témoin de partie en cours.
//!
//! Un cœur libretro tourne dans le processus de l'application. S'il exécute une
//! instruction impossible ou écrit hors de sa mémoire, c'est toute la fenêtre
//! qui disparaît — sans message, sans journal, sans rien. C'est arrivé avec
//! Flycast : l'application s'est évanouie et il a fallu fouiller le journal
//! d'événements de Windows pour apprendre lequel des cinquante-quatre cœurs
//! était en cause.
//!
//! Isoler chaque cœur dans son propre processus réglerait la chose à la
//! racine, mais demande de faire passer huit mégaoctets d'image soixante fois
//! par seconde entre deux processus. En attendant, ce module fait le plus
//! simple : il note sur le disque quel cœur vient d'être chargé et efface la
//! note quand il est déchargé proprement. Une note retrouvée au démarrage ne
//! peut vouloir dire qu'une chose — la fois d'avant s'est mal terminée, et
//! voici avec quoi.

use std::path::{Path, PathBuf};

/// Le nom du témoin, à la racine des données de l'application.
const TEMOIN: &str = "partie-en-cours.txt";

/// Ce qu'on retrouve après un arrêt brutal.
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Rapport {
    /// Le chemin du cœur qui était chargé.
    pub core: String,
    /// Son nom, tel qu'il s'annonce.
    pub label: String,
    /// Le jeu en cours, s'il y en avait un.
    pub game: String,
}

fn fichier(base: &Path) -> PathBuf {
    base.join(TEMOIN)
}

/// Note qu'un cœur vient d'être chargé.
///
/// Les trois champs sont séparés par des retours à la ligne plutôt que par un
/// format structuré : le fichier est écrit à chaque lancement de jeu, et doit
/// coûter aussi peu que possible à écrire comme à relire.
pub fn ouvrir(base: &Path, core: &str, label: &str, game: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(base)?;
    let propre = |texte: &str| texte.replace(['\n', '\r'], " ");
    std::fs::write(
        fichier(base),
        format!("{}\n{}\n{}", propre(core), propre(label), propre(game)),
    )
}

/// Efface la note : la partie s'est terminée comme il faut.
pub fn fermer(base: &Path) {
    let _ = std::fs::remove_file(fichier(base));
}

/// Relit la note laissée par une partie qui ne s'est pas terminée.
pub fn relever(base: &Path) -> Option<Rapport> {
    let texte = std::fs::read_to_string(fichier(base)).ok()?;
    let mut lignes = texte.lines();
    let core = lignes.next().unwrap_or_default().trim().to_owned();
    if core.is_empty() {
        return None;
    }
    Some(Rapport {
        core,
        label: lignes.next().unwrap_or_default().trim().to_owned(),
        game: lignes.next().unwrap_or_default().trim().to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bac(nom: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!("evachi-temoin-{}-{nom}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("dossier");
        base
    }

    #[test]
    fn rien_a_relever_quand_tout_va_bien() {
        let base = bac("propre");
        assert_eq!(relever(&base), None);

        ouvrir(&base, "D:/cores/flycast.dll", "Flycast", "Cool Cool Toon.cue").expect("note");
        fermer(&base);
        assert_eq!(relever(&base), None, "une partie close ne laisse rien");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn retrouve_le_coeur_apres_un_arret_brutal() {
        // Le cas réel : la fenêtre disparaît sans rien dire, et c'est la note
        // restée sur le disque qui apprend lequel des cœurs était en cause.
        let base = bac("brutal");
        ouvrir(&base, "D:/cores/flycast.dll", "Flycast", "Cool Cool Toon.cue").expect("note");

        let rapport = relever(&base).expect("rapport");
        assert_eq!(rapport.core, "D:/cores/flycast.dll");
        assert_eq!(rapport.label, "Flycast");
        assert_eq!(rapport.game, "Cool Cool Toon.cue");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn une_note_remplace_la_precedente() {
        // Deux parties de suite ne doivent pas accuser la première.
        let base = bac("suite");
        ouvrir(&base, "a.dll", "A", "Jeu A").expect("un");
        ouvrir(&base, "b.dll", "B", "Jeu B").expect("deux");
        assert_eq!(relever(&base).expect("rapport").label, "B");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn un_nom_sur_plusieurs_lignes_ne_casse_pas_la_note() {
        // Le nom vient du cœur lui-même : rien ne garantit qu'il soit propre.
        let base = bac("lignes");
        ouvrir(&base, "a.dll", "Nom\nsur deux lignes", "Jeu\r\nbizarre").expect("note");

        let rapport = relever(&base).expect("rapport");
        assert_eq!(rapport.core, "a.dll");
        assert_eq!(rapport.label, "Nom sur deux lignes");
        assert_eq!(rapport.game, "Jeu  bizarre");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn une_note_vide_ne_raconte_rien() {
        let base = bac("vide");
        std::fs::write(fichier(&base), "").expect("note");
        assert_eq!(relever(&base), None);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn fermer_ce_qui_n_existe_pas_ne_fache_personne() {
        let base = bac("neant");
        fermer(&base);
        assert_eq!(relever(&base), None);
        let _ = std::fs::remove_dir_all(&base);
    }
}
