//! Le processus qui tient le cœur.
//!
//! Il n'a pas de fenêtre, ne lit aucune manette, ne connaît ni la bibliothèque
//! ni les réglages. Il ouvre un tuyau, attend des demandes, et y répond
//! jusqu'à ce qu'on lui dise de décharger — ou jusqu'à ce qu'il meure, ce qui
//! est prévu.
//!
//! Tout se passe sur **un seul fil**, et ce n'est pas un raccourci : l'état de
//! l'hôte vit dans une variable de fil, et le contexte OpenGL n'est utilisable
//! que là où il a été créé. Un second fil qui appellerait le cœur ne
//! planterait même pas : il lirait un état vide, en silence.

#![cfg(windows)]

use std::io::Write;
use std::path::Path;
use std::time::Duration;

use windows_sys::Win32::System::Diagnostics::Debug::{
    SetErrorMode, SetUnhandledExceptionFilter, EXCEPTION_POINTERS, SEM_FAILCRITICALERRORS,
    SEM_NOGPFAULTERRORBOX, SEM_NOOPENFILEERRORBOX,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, TerminateProcess};

use super::super::core::Core;
use super::super::host;
use super::partage::Segment;
use super::protocole::{self, Demande, Ouverture, Rendu, Requete, Tranche, BON, MAUVAIS};

/// Code de sortie que ce processus se donne quand le cœur a fauté.
///
/// La fenêtre s'en sert pour dire « il a planté » plutôt que « il ne répond
/// plus », qui ne veut pas dire la même chose et n'appelle pas le même conseil.
pub const CODE_PLANTAGE: u32 = 0xE7A0_C001;

/// Combien de temps on insiste pour se brancher sur le tuyau.
const PATIENCE: Duration = Duration::from_secs(10);

/// Tient un cœur jusqu'à ce que la fenêtre n'en veuille plus.
///
/// Rend le code de sortie du processus.
pub fn servir(nom_tuyau: &str, nom_segment: &str) -> i32 {
    se_preparer_a_mal_finir();

    let mut fil = match super::tuyau::brancher(nom_tuyau, PATIENCE) {
        Ok(fil) => fil,
        Err(raison) => {
            eprintln!("[cœur] {raison}");
            return 2;
        }
    };

    let mut segment = match Segment::ouvrir(nom_segment) {
        Ok(segment) => segment,
        Err(raison) => {
            eprintln!("[cœur] {raison}");
            return 2;
        }
    };

    let mut coeur: Option<Core> = None;
    let mut sequence = 0u32;

    // Le tuyau qui se ferme fait sortir la boucle : la fenêtre est partie, et
    // l'on s'en va avec elle — en déchargeant proprement, car c'est là que le
    // cœur écrit ses sauvegardes.
    while let Ok((etiquette, jeton, charge)) = protocole::recevoir(&mut fil) {
        let issue = traiter(
            etiquette,
            &charge,
            &mut coeur,
            &mut segment,
            &mut sequence,
        );

        // Toute réponse porte ce que le cœur a dit depuis la précédente. C'est
        // le seul chemin par lequel un « BIOS introuvable » atteint la fenêtre
        // quand le chargement échoue : il n'y a alors aucune trame pour le
        // porter.
        let mut messages = host::take_core_log();
        messages.extend(host::prendre_messages());

        let (marque, charge) = match issue {
            Ok(charge) => (BON, charge),
            Err(raison) => (MAUVAIS, raison.into_bytes()),
        };

        if protocole::envoyer(&mut fil, marque, jeton, &protocole::composer(&messages, &charge))
            .is_err()
        {
            break;
        }

        if etiquette == Demande::Decharger as u32 {
            break;
        }
    }

    // Le cœur est détruit ici, et attendu : `retro_unload_game` puis
    // `retro_deinit`, dans cet ordre, sont le seul moment où la plupart des
    // cœurs écrivent leur sauvegarde de pile sur le disque.
    drop(coeur);
    let _ = fil.flush();

    // Et on s'en va sans repasser par la sortie ordinaire.
    //
    // `mem::forget` laisse la bibliothèque du cœur projetée, volontairement :
    // la rendre au système fige le processus quand le cœur a laissé des fils en
    // vie, ce que Dolphin fait. Mais une sortie ordinaire appellerait quand
    // même le détachement de la bibliothèque, et l'on retomberait dessus — un
    // processus irrécupérable par partie, ce que la sonde de cœurs avait déjà
    // constaté sur Citra et Flycast. `TerminateProcess` ne le fait pas.
    // SAFETY : on se termine soi-même, après avoir rendu tout ce qu'on devait.
    unsafe { TerminateProcess(GetCurrentProcess(), 0) };
    0
}

fn traiter(
    etiquette: u32,
    charge: &[u8],
    coeur: &mut Option<Core>,
    segment: &mut Segment,
    sequence: &mut u32,
) -> Result<Vec<u8>, String> {
    let demande = Demande::depuis(etiquette).ok_or("demande inconnue")?;

    match demande {
        Demande::ChargerCoeur => {
            let ouverture: Ouverture =
                serde_json::from_slice(charge).map_err(|erreur| erreur.to_string())?;

            // Le cœur précédent part d'abord : deux cœurs vivants se
            // disputeraient la même variable de fil.
            *coeur = None;

            // SAFETY : charger une bibliothèque exécute son code
            // d'initialisation ; le chemin vient de la fenêtre, qui le tient de
            // l'utilisateur.
            let charge_ = unsafe {
                Core::load(
                    Path::new(&ouverture.coeur),
                    Path::new(&ouverture.dossier_systeme),
                    Path::new(&ouverture.dossier_sauvegardes),
                    &ouverture.langue,
                )
            }
            .map_err(|erreur| erreur.to_string())?;

            let identite = charge_.info().clone();
            *coeur = Some(charge_);
            serde_json::to_vec(&identite).map_err(|erreur| erreur.to_string())
        }

        Demande::Triches => {
            let consignes: crate::libretro::triches::Consignes =
                serde_json::from_slice(charge).map_err(|erreur| erreur.to_string())?;
            let coeur = coeur.as_mut().ok_or("aucun cœur chargé")?;
            let etat = coeur.poser_triches(&consignes);
            serde_json::to_vec(&etat).map_err(|erreur| erreur.to_string())
        }

        Demande::Memoire => {
            let tranche: Tranche =
                serde_json::from_slice(charge).map_err(|erreur| erreur.to_string())?;
            let coeur = coeur.as_ref().ok_or("aucun cœur chargé")?;
            Ok(tranche.decouper(coeur.ram()))
        }

        Demande::ChargerContenu => {
            let chemin = String::from_utf8_lossy(charge).into_owned();
            let coeur = coeur.as_mut().ok_or("aucun cœur chargé")?;
            let av = coeur
                .load_content(Path::new(&chemin))
                .map_err(|erreur| erreur.to_string())?;
            serde_json::to_vec(&av).map_err(|erreur| erreur.to_string())
        }

        Demande::Trame => {
            let requete = Requete::lire(charge)?;
            let coeur = coeur.as_mut().ok_or("aucun cœur chargé")?;
            tourner(requete, coeur, segment, sequence)
        }

        Demande::Reinitialiser => {
            let coeur = coeur.as_mut().ok_or("aucun cœur chargé")?;
            coeur.reset().map_err(|erreur| erreur.to_string())?;
            Ok(Vec::new())
        }

        Demande::SauverEtat => {
            let coeur = coeur.as_ref().ok_or("aucun cœur chargé")?;
            coeur.save_state().map_err(|erreur| erreur.to_string())
        }

        Demande::ReprendreEtat => {
            let coeur = coeur.as_mut().ok_or("aucun cœur chargé")?;
            coeur
                .load_state(charge)
                .map_err(|erreur| erreur.to_string())?;
            Ok(Vec::new())
        }

        Demande::Decharger => {
            *coeur = None;
            Ok(Vec::new())
        }

        Demande::Messages => Ok(Vec::new()),
    }
}

/// Fait tourner le cœur, une fois ou plusieurs.
///
/// Plusieurs trames d'un coup servent l'avance rapide : à neuf cents pour cent
/// on exécute neuf trames pour n'en regarder qu'une, et les demander une par
/// une paierait l'aller-retour neuf fois. L'entrée est échantillonnée une fois
/// par lot — soit la même finesse que ce que l'écran montre de toute façon.
fn tourner(
    requete: Requete,
    coeur: &mut Core,
    segment: &mut Segment,
    sequence: &mut u32,
) -> Result<Vec<u8>, String> {
    let mut audio: Vec<i16> = Vec::new();
    let mut arret = false;
    let mut image = None;

    for _ in 0..requete.trames {
        let trame = coeur
            .run_frame(requete.entrees)
            .map_err(|erreur| erreur.to_string())?;

        // La dernière image *produite* du lot, et non celle de la dernière
        // trame : un cœur a le droit de redemander la trame précédente, et cela
        // arrive souvent — un jeu à trente images sur un cœur à soixante en
        // duplique une sur deux. Garder la dernière vraie évite de peindre du
        // passé au milieu d'une avance rapide.
        if trame.video.is_some() {
            image = trame.video;
        }
        audio.extend_from_slice(&trame.audio);
        arret |= trame.shutdown;
    }

    *sequence = sequence.wrapping_add(1);

    let geometrie = match image {
        // La fenêtre ne peindra pas cette trame : inutile de l'écrire.
        Some(_) if !requete.image => None,
        Some(video) => {
            let taille = video.rgba.len();
            match segment.zone(taille) {
                Some(zone) => {
                    zone.copy_from_slice(&video.rgba);
                    segment.marquer(*sequence);
                    Some((video.width, video.height))
                }
                // Plus grande que la zone partagée : on préfère une image
                // manquante à un débordement. La fenêtre rejouera la précédente.
                None => None,
            }
        }
        None => None,
    };

    Ok(Rendu {
        sequence: *sequence,
        geometrie,
        arret,
        audio,
    }
    .ecrire())
}

/// Fait en sorte qu'une faute du cœur se voie, et qu'elle soit brève.
///
/// Sans cela, une violation d'accès passe par le rapport d'erreurs de Windows :
/// `WerFault` démarre, collecte l'état du processus, et le cadavre reste ouvert
/// dix à soixante secondes. La fenêtre ne verrait pas une mort mais une absence
/// de réponse, et dirait « il s'est figé » pour un plantage — sans compter la
/// boîte « evachi.exe a cessé de fonctionner » posée par-dessus, au nom de
/// l'application qui, elle, va très bien.
fn se_preparer_a_mal_finir() {
    // SAFETY : modifie un réglage du processus courant, sans argument risqué.
    unsafe {
        SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
        SetUnhandledExceptionFilter(Some(dernier_mot));
    }

    // Une panique Rust ne doit pas laisser un processus muet derrière elle : la
    // fenêtre attendrait une réponse qui ne vient plus.
    let precedent = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        precedent(info);
        // SAFETY : on se termine soi-même.
        unsafe { TerminateProcess(GetCurrentProcess(), CODE_PLANTAGE) };
    }));
}

/// Dernier mot du processus avant qu'il s'arrête.
///
/// # Safety
/// Appelé par Windows, avec des pointeurs qu'il fournit.
unsafe extern "system" fn dernier_mot(infos: *const EXCEPTION_POINTERS) -> i32 {
    // Écrit sans rien allouer : le tas est peut-être justement ce qui vient
    // d'être abîmé.
    let mut ligne = [0u8; 64];
    let mut fin = 0usize;
    let mut poser = |texte: &[u8]| {
        for octet in texte {
            if fin < ligne.len() {
                ligne[fin] = *octet;
                fin += 1;
            }
        }
    };

    poser(b"[coeur] faute 0x");
    if !infos.is_null() {
        let dossier = (*infos).ExceptionRecord;
        let code = if dossier.is_null() {
            0
        } else {
            (*dossier).ExceptionCode as u32
        };
        for quartet in (0..8).rev() {
            let chiffre = ((code >> (quartet * 4)) & 0xf) as u8;
            poser(&[if chiffre < 10 {
                b'0' + chiffre
            } else {
                b'a' + chiffre - 10
            }]);
        }
    }
    poser(b"\n");

    let _ = std::io::stderr().write_all(&ligne[..fin]);
    // On ne rend pas la main à Windows : il ouvrirait son rapport d'erreurs.
    TerminateProcess(GetCurrentProcess(), CODE_PLANTAGE);
    0
}
