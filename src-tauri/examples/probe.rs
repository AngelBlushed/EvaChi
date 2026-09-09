//! Interroge un cœur libretro sans lancer l'interface.
//!
//! Diagnostiquer un cœur récalcitrant depuis la fenêtre est pénible : on ne
//! voit ni ce qu'il déclare, ni pourquoi il refuse un contenu. Cet outil le
//! charge, rapporte son identité, et fait tourner quelques trames si on lui
//! donne de quoi.
//!
//! ```text
//! cargo run --example probe -- <coeur.dll> [contenu] [--frames N]
//! ```

use std::path::{Path, PathBuf};

use evachi::libretro::{Session, JOYPAD_BUTTONS};

fn main() {
    let mut args = std::env::args().skip(1);

    let Some(core_path) = args.next().map(PathBuf::from) else {
        eprintln!("usage : cargo run --example probe -- <coeur.dll> [contenu] [--frames N]");
        std::process::exit(2);
    };

    let mut content: Option<PathBuf> = None;
    let mut frames = 5usize;

    while let Some(arg) = args.next() {
        if arg == "--frames" {
            frames = args
                .next()
                .and_then(|value| value.parse().ok())
                .unwrap_or(frames);
        } else {
            content = Some(PathBuf::from(arg));
        }
    }

    // Les cœurs cherchent leur BIOS et écrivent leurs sauvegardes à côté du
    // cœur lui-même : c'est le choix le moins surprenant pour une sonde.
    let workdir = core_path.parent().unwrap_or(Path::new(".")).to_path_buf();

    let session = Session::spawn();

    let info = match session.load_core(&core_path, &workdir, &workdir) {
        Ok(info) => info,
        Err(error) => {
            eprintln!("chargement impossible : {error}");
            std::process::exit(1);
        }
    };

    println!("cœur        {} {}", info.name, info.version);
    println!("extensions  {}", info.extensions.join(", "));
    println!(
        "contenu     {}",
        if info.need_fullpath {
            "lu depuis le disque par le cœur"
        } else {
            "passé en mémoire"
        }
    );

    let Some(content) = content else {
        println!("\nAucun contenu fourni : le cœur est chargé, rien n'est exécuté.");
        return;
    };

    let bytes = match std::fs::read(&content) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("{} : {error}", content.display());
            std::process::exit(1);
        }
    };

    let av = match session.load_content(&content, bytes) {
        Ok(av) => av,
        Err(error) => {
            eprintln!("contenu refusé : {error}");
            report_messages(&session);
            std::process::exit(1);
        }
    };

    println!("\nrésolution  {}×{} (max {}×{})", av.width, av.height, av.max_width, av.max_height);
    println!("cadence     {:.3} images/s", av.fps);
    println!("audio       {:.0} Hz", av.sample_rate);

    let no_buttons = [0i16; JOYPAD_BUTTONS];
    let mut fresh = 0usize;
    let mut samples = 0usize;

    // Empreinte de l'image entière, trame après trame.
    //
    // Une première version ne relevait que le pixel central. C'était trop peu :
    // un motif en diagonale qui défile peut parfaitement ne jamais croiser ce
    // point précis, et la sonde concluait à une image figée alors que tout
    // bougeait autour.
    let mut previous: Option<u64> = None;
    let mut distinct = std::collections::HashSet::new();
    let mut changes = 0usize;
    let mut last_ink = 0usize;
    let mut last_pixels = 0usize;

    for index in 1..=frames {
        match session.run_frame(no_buttons) {
            Ok(frame) => {
                if let Some(video) = &frame.video {
                    fresh += 1;
                    if index == 1 {
                        println!(
                            "\npremière trame : {}×{}, {} octets RGBA",
                            video.width,
                            video.height,
                            video.rgba.len()
                        );
                    }

                    let fingerprint = fingerprint(&video.rgba);
                    if previous.replace(fingerprint) != Some(fingerprint) {
                        changes += 1;
                    }
                    distinct.insert(fingerprint);

                    last_pixels = video.rgba.len() / 4;
                    last_ink = video
                        .rgba
                        .chunks_exact(4)
                        .filter(|pixel| pixel[0] < 0x80)
                        .count();
                }
                samples += frame.audio.len();
            }
            Err(error) => {
                eprintln!("trame {index} : {error}");
                break;
            }
        }
    }

    println!("{frames} trames : {fresh} images neuves, {samples} échantillons audio");

    if fresh > 0 {
        println!(
            "images       {changes} changements, {} distinctes sur {fresh}",
            distinct.len()
        );
        let ratio = 100.0 * last_ink as f64 / last_pixels.max(1) as f64;
        println!("dernière     {last_ink} pixels sombres sur {last_pixels} ({ratio:.1} %)");

        if distinct.len() == 1 {
            println!("\n⚠ image parfaitement figée : le programme ne dessine peut-être rien.");
        }
    }

    match session.save_state() {
        Ok(state) => println!("état       {} octets", state.len()),
        Err(error) => println!("état       indisponible ({error})"),
    }

    report_messages(&session);
}

/// Affiche ce que le cœur a eu à dire — typiquement un BIOS introuvable.
fn report_messages(session: &Session) {
    let messages = session.take_messages();
    if messages.is_empty() {
        return;
    }
    println!("\nmessages du cœur :");
    for message in messages {
        println!("  {message}");
    }
}

/// Empreinte 64 bits d'une image, façon FNV-1a.
///
/// On ne compare jamais deux images entre elles, seulement leurs empreintes :
/// à 92 Ko la trame et deux cent quarante trames, garder les images coûterait
/// vingt mégaoctets pour répondre à une question binaire.
fn fingerprint(rgba: &[u8]) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    for byte in rgba {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}
