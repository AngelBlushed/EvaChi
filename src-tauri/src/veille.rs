//! Empêcher l'écran de s'éteindre pendant qu'on joue.
//!
//! Windows compte les minutes d'inactivité à partir du clavier et de la
//! souris. Une manette n'en fait pas partie : on joue vingt minutes sans
//! toucher ni l'un ni l'autre, et l'écran s'éteint au milieu d'un niveau, puis
//! la machine se met en veille. Il faut donc le dire — c'est à cela que sert
//! `SetThreadExecutionState`.
//!
//! La fonction s'applique **au fil qui l'appelle**, et l'état tombe avec lui.
//! Une commande Tauri s'exécute sur un fil emprunté à une réserve, qui peut
//! disparaître aussitôt après : l'annonce serait oubliée sans qu'on le sache.
//! D'où le fil dédié qui vit ici, et qui la répète de loin en loin.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;

/// Vrai tant qu'une partie est en cours.
static EN_JEU: AtomicBool = AtomicBool::new(false);

/// De quoi réveiller le fil sans attendre son prochain tour.
static REVEIL: OnceLock<(Mutex<bool>, Condvar)> = OnceLock::new();

/// Tous les combien on redit à Windows qu'on est là.
///
/// Bien plus court que le premier délai d'extinction, qui vaut une minute au
/// minimum : même si l'annonce se perdait, elle serait reposée avant que
/// l'écran n'ait eu le temps de s'éteindre.
const RAPPEL: Duration = Duration::from_secs(30);

/// Dit si une partie est en cours. Rien d'autre à faire : le fil s'en charge.
///
/// Rend vrai si l'état a changé, pour que l'appelant puisse l'écrire au
/// journal sans le répéter à chaque pause reprise.
pub fn veiller(en_jeu: bool) -> bool {
    let change = EN_JEU.swap(en_jeu, Ordering::SeqCst) != en_jeu;
    demarrer();

    let (verrou, signal) = REVEIL.get_or_init(|| (Mutex::new(false), Condvar::new()));
    if let Ok(mut reveille) = verrou.lock() {
        *reveille = true;
        signal.notify_all();
    }
    change
}

/// Lance le fil, une fois pour toutes.
fn demarrer() {
    static UNE_FOIS: OnceLock<()> = OnceLock::new();
    UNE_FOIS.get_or_init(|| {
        let _ = std::thread::Builder::new()
            .name("evachi-veille".into())
            .spawn(tenir);
    });
}

/// Le fil : il annonce, il attend, il recommence.
fn tenir() {
    let (verrou, signal) = REVEIL.get_or_init(|| (Mutex::new(false), Condvar::new()));

    loop {
        // Réaffirmée à chaque tour, et pas seulement au changement : c'est ce
        // qui rattrape une annonce qui se serait perdue.
        annoncer(EN_JEU.load(Ordering::SeqCst));

        let Ok(change) = verrou.lock() else { return };
        let Ok((mut change, _)) = signal.wait_timeout(change, RAPPEL) else {
            return;
        };
        *change = false;
    }
}

/// L'annonce elle-même, ou rien du tout hors de Windows.
#[cfg(windows)]
fn annoncer(en_jeu: bool) {
    use windows_sys::Win32::System::Power::{
        SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
    };

    // `ES_CONTINUOUS` seul remet l'état ordinaire : l'écran peut de nouveau
    // s'éteindre. Avec les deux autres, il reste allumé et la machine éveillée
    // jusqu'à nouvel ordre.
    let etat = if en_jeu {
        ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED
    } else {
        ES_CONTINUOUS
    };
    // SAFETY : un appel système sans pointeur ni allocation, toujours licite.
    unsafe { SetThreadExecutionState(etat) };
}

#[cfg(not(windows))]
fn annoncer(_en_jeu: bool) {}

#[cfg(test)]
mod tests {
    use super::*;

    /// Vrai si l'on tient l'écran allumé en ce moment.
    fn en_jeu() -> bool {
        EN_JEU.load(Ordering::SeqCst)
    }

    #[test]
    fn retient_qu_une_partie_est_en_cours() {
        veiller(false);

        assert!(veiller(true), "le passage en jeu est un changement");
        assert!(en_jeu(), "une partie lancée tient l'écran allumé");
        assert!(!veiller(true), "le redire n'en est pas un");

        assert!(veiller(false), "et la fin de partie en est un");
        assert!(!en_jeu(), "une partie finie le laisse s'éteindre");
    }

    /// Windows reçoit-il vraiment ce qu'on lui dit ?
    ///
    /// `SetThreadExecutionState` rend l'état **précédent** du fil appelant :
    /// on annonce, puis on remet l'état ordinaire, et ce que le second appel
    /// rend est ce que le premier avait posé. C'est le seul moyen de vérifier
    /// les drapeaux sans droits d'administrateur — `powercfg /requests`, qui
    /// nomme les programmes qui tiennent la machine éveillée, en demande.
    #[cfg(windows)]
    #[test]
    fn windows_retient_bien_l_annonce() {
        use windows_sys::Win32::System::Power::{
            SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
        };

        annoncer(true);
        // SAFETY : un appel système sans pointeur ni allocation.
        let pose = unsafe { SetThreadExecutionState(ES_CONTINUOUS) };

        assert!(
            pose & ES_DISPLAY_REQUIRED != 0,
            "l'écran doit être retenu allumé : {pose:#x}"
        );
        assert!(
            pose & ES_SYSTEM_REQUIRED != 0,
            "et la machine éveillée : {pose:#x}"
        );
    }

    #[test]
    fn le_fil_ne_naît_qu_une_fois() {
        // Rien à observer de l'extérieur, sinon qu'enchaîner les annonces ne
        // fait ni erreur ni fil de plus : le `OnceLock` s'en charge.
        for tour in 0..20 {
            veiller(tour % 2 == 0);
        }
        veiller(false);
        assert!(!en_jeu());
    }
}
