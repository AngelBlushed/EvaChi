// EvaChi — hôte d'émulation multi-systèmes
// Copyright (C) 2026  contributeurs d'EvaChi
//
// Ce programme est un logiciel libre : vous pouvez le redistribuer et/ou le
// modifier selon les termes de la Licence publique générale GNU telle que
// publiée par la Free Software Foundation, soit la version 3, soit (à votre
// choix) toute version ultérieure.
//
// Il est distribué dans l'espoir qu'il sera utile, mais SANS AUCUNE GARANTIE.
// Voir la Licence publique générale GNU pour plus de détails. Vous devriez en
// avoir reçu une copie avec ce programme ; sinon, voir <https://www.gnu.org/licenses/>.

// Empêche l'ouverture d'une console derrière la fenêtre sur Windows, hors debug.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod adopt;
mod b64;
mod bios;
mod commands;
mod covers;
mod credits;
mod emulators;
mod install;
mod manual;
mod pads;
mod piles;
mod sentinel;
mod shots;
mod skeleton;
mod states;
mod triches;

use evachi::libretro::Session;
use tauri::Manager;

/// Argument interne : interroge un cœur et ressort, sans ouvrir de fenêtre.
///
/// Un cœur libretro est du code étranger chargé dans notre processus. Certains
/// se terminent brutalement quand l'hôte ne leur offre pas ce qu'ils attendent
/// — un contexte graphique matériel, par exemple. Les interroger dans un
/// processus séparé fait qu'un cœur défaillant ne tue plus que lui-même.
const PROBE_FLAG: &str = "--probe-core";

/// Argument interne : liste les cœurs vus par la coque, puis ressort.
///
/// Le même chemin de code que l'interface, mais observable depuis un terminal.
/// Sans lui, un catalogue vide dans la fenêtre ne dit rien de sa cause.
const LIST_FLAG: &str = "--list-cores";

/// Argument interne : installe les cœurs manquants, puis ressort.
///
/// Équiper l'application sans ouvrir sa fenêtre a une vertu : c'est le seul
/// moyen de le faire depuis un raccourci ou un script, et le journal en garde
/// la trace même lancé d'un double-clic.
const INSTALL_FLAG: &str = "--install-cores";

/// Argument interne : installe les émulateurs autonomes manquants.
const INSTALL_EMULATORS_FLAG: &str = "--install-emulators";

/// Argument interne : range un fichier système, puis ressort.
///
/// Le même chemin de code que le bouton « Ranger un fichier… », mais qui dit à
/// haute voix où il pose ce qu'on lui donne — le seul moyen de vérifier un
/// rangement sans le chercher à l'aveugle dans `%APPDATA%`.
const ADOPT_FLAG: &str = "--ranger";

fn main() {
    // Doit passer avant toute initialisation de Tauri : ce mode ne doit rien
    // afficher, seulement écrire sur la sortie standard.
    let args: Vec<String> = std::env::args().collect();

    // Celui-ci d'abord : c'est le seul qui ne ressorte pas tout de suite, et
    // c'est celui qu'EvaChi se donne à elle-même à chaque partie.
    #[cfg(windows)]
    if let Some(position) = args
        .iter()
        .position(|arg| arg == evachi::libretro::distant::DRAPEAU)
    {
        let (Some(tuyau), Some(segment)) = (args.get(position + 1), args.get(position + 2)) else {
            eprintln!(
                "{} attend un nom de tuyau et un nom de mémoire partagée",
                evachi::libretro::distant::DRAPEAU
            );
            std::process::exit(2);
        };
        std::process::exit(evachi::libretro::distant::enfant::servir(tuyau, segment));
    }

    if let Some(position) = args.iter().position(|arg| arg == PROBE_FLAG) {
        let Some(path) = args.get(position + 1) else {
            eprintln!("{PROBE_FLAG} attend un chemin de cœur");
            std::process::exit(2);
        };
        std::process::exit(commands::probe_core_to_stdout(std::path::Path::new(path)));
    }
    if args.iter().any(|arg| arg == LIST_FLAG) {
        std::process::exit(commands::list_cores_to_stdout());
    }
    if args.iter().any(|arg| arg == INSTALL_FLAG) {
        std::process::exit(commands::install_cores_to_stdout());
    }
    if args.iter().any(|arg| arg == INSTALL_EMULATORS_FLAG) {
        std::process::exit(commands::install_emulators_to_stdout());
    }
    if let Some(position) = args.iter().position(|arg| arg == ADOPT_FLAG) {
        let Some(path) = args.get(position + 1) else {
            eprintln!("{ADOPT_FLAG} attend un chemin de fichier");
            std::process::exit(2);
        };
        std::process::exit(commands::adopt_to_stdout(std::path::Path::new(path)));
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let paths = commands::Paths::resolve(app.handle())?;

            // Trace d'entrée : sans elle, impossible de savoir quels dossiers
            // l'application a réellement ouverts sur la machine de qui s'en
            // sert. C'est le premier renseignement qu'on cherche quand rien
            // n'apparaît.
            commands::write_log(&paths, "--- démarrage ---");
            commands::write_log(&paths, &format!("cœurs   {}", paths.cores.display()));
            commands::write_log(&paths, &format!("jeux    {}", paths.roms.display()));
            commands::write_log(&paths, &format!("réglages {}", paths.config.display()));

            // Un dossier par console, vide, pour n'avoir plus qu'à y déposer
            // ses jeux. Au premier lancement seulement.
            commands::seed_library(&paths);
            // Ce qui se lancera vraiment pour les consoles sans cœur libretro.
            // Un chemin périmé ici ne se voit nulle part ailleurs.
            for line in commands::declared_externals_summary(&paths) {
                commands::write_log(&paths, &line);
            }
            // Une manette branchée doit répondre dès la première partie ; ces
            // programmes lisent la leur eux-mêmes, et n'en ont parfois aucune.
            commands::configure_pads(&paths);

            // Le cœur vit dans un processus voisin, relancé à chaque partie :
            // celui qui plante ne fait plus disparaître la fenêtre. On lui passe
            // le chemin de cet exécutable — c'est lui-même qu'il relancera — au
            // lieu de le laisser le deviner.
            let session = match std::env::current_exe() {
                Ok(exe) => Session::isolee(exe),
                Err(erreur) => {
                    commands::write_log(
                        &paths,
                        &format!("programme introuvable ({erreur}) : le cœur restera dans la fenêtre"),
                    );
                    Session::locale()
                }
            };

            app.manage(paths);
            app.manage(std::sync::Arc::new(session));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_cores,
            commands::load_core,
            commands::load_content,
            commands::triches_catalogue,
            commands::triches_installer,
            commands::triches_posees,
            commands::triches_contenu,
            commands::triches_retirer,
            commands::poser_triches,
            commands::lire_memoire,
            commands::run_frame,
            commands::reset,
            commands::take_messages,
            commands::save_state,
            commands::load_state,
            commands::unload,
            commands::directories,
            commands::pick_content,
            commands::list_roms,
            commands::read_content,
            commands::pick_folder,
            commands::library_folders,
            commands::add_library_folder,
            commands::remove_library_folder,
            commands::pick_executable,
            commands::external_systems,
            commands::set_external_system,
            commands::remove_external_system,
            commands::launch_external,
            commands::known_externals,
            commands::adopt_external,
            commands::installable_cores,
            commands::install_core,
            commands::system_files,
            commands::claimed_system_file,
            commands::credits,
            commands::reveal_system_dir,
            commands::pick_system_file,
            commands::adopt_system_file,
            commands::pick_system_folder,
            commands::adopt_system_folder,
            commands::installable_emulators,
            commands::install_emulator,
            commands::cover_index,
            commands::begin_session,
            commands::crash_report,
            commands::dismiss_crash,
            commands::set_core_usable,
            commands::save_state_slot,
            commands::load_state_slot,
            commands::list_states,
            commands::delete_state_slot,
            commands::list_saves,
            commands::clear_saves,
            commands::save_shot,
            commands::list_shots,
            commands::delete_shot,
            commands::reveal_shots_dir,
            commands::manual_covers,
            commands::set_manual_cover,
            commands::set_cropped_cover,
            commands::cover_image,
            commands::cover_original,
            commands::cropped_covers,
            commands::clear_manual_cover,
            commands::note,
        ])
        .build(tauri::generate_context!())
        .expect("le lancement d'EvaChi a échoué")
        .run(|app, evenement| {
            // Le témoin de partie ne doit survivre qu'à une fin brutale : c'est
            // tout son sens. Une fermeture ordinaire l'efface — sans quoi
            // quitter EvaChi en pleine partie ferait annoncer, au lancement
            // suivant, un plantage qui n'a pas eu lieu. Et maintenant que les
            // cœurs vivent à côté, ce cas-là n'est plus rare : c'est devenu la
            // façon ordinaire de s'arrêter.
            if matches!(evenement, tauri::RunEvent::Exit) {
                // Et le cœur est déchargé pour de bon. C'est là, et nulle part
                // ailleurs, que la plupart des cœurs écrivent leur sauvegarde de
                // pile : fermer la fenêtre en pleine partie ne doit pas coûter
                // les deux dernières heures de jeu.
                if let Some(session) = app.try_state::<std::sync::Arc<Session>>() {
                    if let Err(raison) = session.unload() {
                        eprintln!("[sortie] {raison}");
                    }
                }
                if let Some(paths) = app.try_state::<commands::Paths>() {
                    sentinel::fermer(&commands::racine(&paths));
                }
            }
        });
}
