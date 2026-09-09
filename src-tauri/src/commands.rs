//! Commandes exposées à l'interface.
//!
//! Les trames circulent en binaire brut plutôt qu'en JSON : une image 640×448
//! pèse 1,1 Mo, et l'encoder soixante fois par seconde coûterait plus cher que
//! l'émulation elle-même.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::{Manager, State};

use evachi::libretro::{AvInfo, CoreInfo, Session, VideoFrame, JOYPAD_BUTTONS};

/// Dossiers de travail, créés au premier lancement.
#[derive(Clone)]
pub struct Paths {
    /// Bibliothèques de cœurs.
    pub cores: PathBuf,
    /// BIOS et fichiers système que certains cœurs réclament.
    pub system: PathBuf,
    /// Sauvegardes de jeu et états.
    pub saves: PathBuf,
    /// Bibliothèque de jeux par défaut.
    pub roms: PathBuf,
    /// Réglages conservés entre deux lancements.
    pub config: PathBuf,
}

impl Paths {
    pub fn resolve(app: &tauri::AppHandle) -> Result<Self, String> {
        let base = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("dossier de données introuvable : {error}"))?;

        let paths = Self {
            cores: base.join("cores"),
            system: base.join("system"),
            saves: base.join("saves"),
            roms: base.join("roms"),
            config: base.join("config.json"),
        };

        for directory in [&paths.cores, &paths.system, &paths.saves, &paths.roms] {
            fs::create_dir_all(directory)
                .map_err(|error| format!("{} : {error}", directory.display()))?;
        }
        Ok(paths)
    }
}

/// Fiche d'un cœur déjà interrogé, valable tant que le fichier ne bouge pas.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedCore {
    /// Date de modification du fichier au moment de l'interrogation.
    modified: u64,
    entry: CoreEntry,
}

/// Un émulateur autonome, lancé comme un programme séparé.
///
/// Certaines consoles n'ont pas de cœur libretro : leur émulateur existe, mais
/// personne ne l'a porté. Plutôt que de renoncer, EvaChi le lance avec le jeu
/// en argument — l'émulateur démarre directement dans la partie, sans passer
/// par son propre menu.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSystem {
    /// Nom affiché, ex. « Xbox 360 ».
    pub name: String,
    /// Chemin du programme à lancer.
    pub executable: String,
    /// Arguments, où `{rom}` sera remplacé par le chemin du jeu.
    ///
    /// Sans `{rom}`, le chemin est simplement ajouté à la fin : c'est ce
    /// qu'attendent la plupart des émulateurs.
    #[serde(default)]
    pub args: Vec<String>,
    /// Extensions prises en charge, en minuscules et sans le point.
    #[serde(default)]
    pub extensions: Vec<String>,
}

/// Réglages conservés d'un lancement à l'autre.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    /// Dossiers de jeux ajoutés par l'utilisateur, en plus de celui par défaut.
    #[serde(default)]
    library_folders: Vec<String>,
    /// Ce que chaque cœur a déclaré, indexé par chemin.
    #[serde(default)]
    cores: std::collections::HashMap<String, CachedCore>,
    /// Émulateurs autonomes déclarés par l'utilisateur.
    #[serde(default)]
    external: Vec<ExternalSystem>,
    /// Systèmes déjà installés une fois, d'eux-mêmes ou à la main.
    ///
    /// Sans cette mémoire, retirer un émulateur ne servirait à rien : la
    /// détection suivante le redéclarerait aussitôt. Le nom y reste après le
    /// retrait, ce qui se lit « ne le remets pas tout seul ».
    #[serde(default)]
    auto_declared: Vec<String>,
}

/// Lit les réglages.
///
/// Distingue trois cas là où une première version n'en voyait qu'un :
/// - fichier absent : réglages par défaut, c'est un premier lancement ;
/// - fichier lisible : les réglages ;
/// - fichier présent mais illisible : **erreur**.
///
/// La confusion des deux derniers coûtait cher. Un fichier surpris en cours
/// d'écriture — deux instances ouvertes, par exemple — se lisait comme « pas de
/// réglages », et la sauvegarde suivante écrasait dossiers de jeux et
/// émulateurs déclarés par du vide.
fn load_config(paths: &Paths) -> Result<Config, String> {
    match fs::read_to_string(&paths.config) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Config::default()),
        Err(error) => Err(format!("{} : {error}", paths.config.display())),
        Ok(text) => serde_json::from_str(&text)
            .map_err(|error| format!("{} : {error}", paths.config.display())),
    }
}

/// Les réglages, ou les réglages par défaut si on n'a pas pu les lire.
///
/// À n'utiliser que pour *lire* : écrire par-dessus un échec de lecture
/// effacerait les réglages de l'utilisateur.
fn read_config(paths: &Paths) -> Config {
    load_config(paths).unwrap_or_else(|error| {
        write_log(paths, &format!("réglages illisibles, ignorés : {error}"));
        Config::default()
    })
}

/// Écrit les réglages sans jamais laisser le fichier à moitié écrit.
///
/// On passe par un fichier temporaire renommé ensuite : un remplacement de nom
/// est atomique, alors qu'une écriture directe laisse une fenêtre pendant
/// laquelle une autre instance lirait du JSON tronqué.
fn write_config(paths: &Paths, config: &Config) -> Result<(), String> {
    let text = serde_json::to_string_pretty(config)
        .map_err(|error| format!("réglages illisibles : {error}"))?;

    // Le nom du fichier temporaire porte le numéro du processus : deux
    // instances ouvertes en même temps écriraient sinon dans le même fichier,
    // et l'une renommerait ce que l'autre était en train d'y mettre.
    let temporary = paths
        .config
        .with_extension(format!("json.{}.tmp", std::process::id()));
    fs::write(&temporary, text).map_err(|error| format!("{} : {error}", temporary.display()))?;
    fs::rename(&temporary, &paths.config)
        .map_err(|error| format!("{} : {error}", paths.config.display()))
}

/// Modifie les réglages, en refusant d'écrire si on n'a pas su les lire.
///
/// C'est la seule voie d'écriture : elle garantit qu'un réglage existant n'est
/// jamais remplacé par un défaut né d'une lecture ratée.
fn update_config(paths: &Paths, change: impl FnOnce(&mut Config)) -> Result<Config, String> {
    let mut config = load_config(paths)?;
    change(&mut config);
    write_config(paths, &config)?;
    Ok(config)
}

/// Taille au-delà de laquelle le journal repart de zéro.
///
/// Un demi-mégaoctet tient plusieurs sessions et reste lisible ; au-delà, le
/// fichier n'intéresse plus personne.
const LOG_LIMIT: u64 = 512 * 1024;

/// Écrit une ligne dans le journal de l'application.
///
/// Un utilisateur lance l'application d'un double-clic : ni terminal, ni
/// sortie d'erreur. Sans trace sur disque, un démarrage qui tourne mal ne
/// laisse aucune prise — on en est réduit aux captures d'écran et aux
/// hypothèses.
pub fn write_log(paths: &Paths, message: &str) {
    use std::io::Write;

    let file = paths.config.with_file_name("evachi.log");
    if fs::metadata(&file).map(|meta| meta.len()).unwrap_or(0) > LOG_LIMIT {
        let _ = fs::remove_file(&file);
    }

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|age| age.as_secs())
        .unwrap_or(0);

    if let Ok(mut handle) = fs::OpenOptions::new().create(true).append(true).open(&file) {
        let _ = writeln!(handle, "{stamp} {message}");
    }
}

/// Recopie une ligne du journal de l'interface côté natif.
#[tauri::command]
pub fn note(message: String, paths: State<'_, Paths>) {
    eprintln!("[interface] {message}");
    write_log(&paths, &message);
}

/// Ouvre le sélecteur de dossier du système et rend le chemin choisi.
///
/// Renvoie `None` si l'utilisateur annule.
#[tauri::command]
pub fn pick_folder(app: tauri::AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;

    app.dialog()
        .file()
        .set_title("Choisir un dossier de jeux")
        .blocking_pick_folder()
        .map(|folder| folder.to_string())
}

/// Les dossiers de jeux ajoutés par l'utilisateur.
#[tauri::command]
pub fn library_folders(paths: State<'_, Paths>) -> Vec<String> {
    read_config(&paths).library_folders
}

/// Ajoute un dossier à la bibliothèque et rend la liste à jour.
///
/// Ajouter deux fois le même dossier est sans effet : mieux vaut une commande
/// idempotente qu'une liste qui se remplit de doublons.
#[tauri::command]
pub fn add_library_folder(path: String, paths: State<'_, Paths>) -> Result<Vec<String>, String> {
    let config = update_config(&paths, |config| {
        if !config.library_folders.iter().any(|known| known == &path) {
            config.library_folders.push(path);
            config.library_folders.sort();
        }
    })?;
    Ok(config.library_folders)
}

/// Retire un dossier de la bibliothèque et rend la liste à jour.
#[tauri::command]
pub fn remove_library_folder(path: String, paths: State<'_, Paths>) -> Result<Vec<String>, String> {
    let config = update_config(&paths, |config| {
        config.library_folders.retain(|known| known != &path);
    })?;
    Ok(config.library_folders)
}

/// Un émulateur autonome connu d'avance, prêt à l'emploi.
///
/// EvaChi ne distribue aucun de ces programmes — chacun a sa licence et pèse
/// des centaines de mégaoctets. Il sait en revanche les reconnaître et les
/// configurer seul : l'utilisateur n'a rien à saisir, au pire à désigner le
/// fichier si l'installation est à un endroit inhabituel.
struct KnownExternal {
    /// Nom de la console, tel qu'il apparaîtra dans la bibliothèque.
    system: &'static str,
    /// Noms d'exécutable possibles, du plus souhaitable au moins souhaitable.
    ///
    /// L'ordre tranche : quand plusieurs de ces programmes sont installés, le
    /// premier de la liste l'emporte. C'est ainsi qu'on exprime une préférence
    /// entre deux émulateurs d'une même console.
    executables: &'static [&'static str],
    /// Arguments, `{rom}` marquant la place du jeu.
    args: &'static [&'static str],
    extensions: &'static [&'static str],
}

/// Les émulateurs autonomes qu'EvaChi sait configurer sans aide.
const KNOWN_EXTERNALS: &[KnownExternal] = &[
    KnownExternal {
        system: "Nintendo Switch",
        // Ryubing poursuit Ryujinx et en garde le nom d'exécutable ; il vient
        // en tête parce qu'on le préfère. Les autres ne servent que s'il
        // manque.
        executables: &[
            "Ryujinx.exe",
            "Ryubing.exe",
            "Ryujinx.Ava.exe",
            "sudachi.exe",
            "citron.exe",
            "eden.exe",
        ],
        args: &[],
        extensions: &["nsp", "xci", "nca", "nro", "nso"],
    },
    KnownExternal {
        system: "Wii U",
        executables: &["Cemu.exe"],
        args: &["-g", "{rom}"],
        extensions: &["wud", "wux", "wua", "rpx", "wad"],
    },
    KnownExternal {
        system: "Xbox 360",
        executables: &["xenia_canary.exe", "xenia.exe"],
        args: &[],
        extensions: &["iso", "xex", "zar"],
    },
    KnownExternal {
        system: "PlayStation 2",
        executables: &["pcsx2-qt.exe", "pcsx2.exe", "pcsx2x64.exe"],
        args: &[],
        extensions: &["iso", "chd", "cso", "gz", "bin", "mdf", "nrg"],
    },
    KnownExternal {
        system: "PS Vita",
        executables: &["Vita3K.exe"],
        args: &["-r", "{rom}"],
        extensions: &["vpk"],
    },
    KnownExternal {
        system: "Xbox",
        executables: &["xemu.exe"],
        args: &["-dvd_path", "{rom}"],
        extensions: &["iso", "xiso"],
    },
];

/// Un préréglage tel que l'interface le voit, avec ce qu'on a trouvé.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalPreset {
    pub system: String,
    pub extensions: Vec<String>,
    pub args: Vec<String>,
    /// Chemin trouvé sur la machine, vide si l'émulateur n'est pas installé.
    pub detected: String,
    /// Vrai si l'utilisateur l'a déjà déclaré.
    pub configured: bool,
}

/// Profondeur explorée sous chaque racine à la recherche d'un émulateur.
///
/// Quatre niveaux couvrent `D:\Émulateurs\Ryubing\Ryujinx.exe` comme
/// `Téléchargements\ryubing-1.3\publish\Ryujinx.exe`, sans descendre jusqu'aux
/// dossiers de données.
const DETECT_DEPTH: usize = 4;

/// Nombre de dossiers que la détection s'autorise à ouvrir.
///
/// La recherche part de la racine des disques : sans plafond, un disque de
/// sauvegarde bien rempli tiendrait le démarrage en otage. Le parcours étant en
/// largeur, ce sont les recoins les plus profonds qu'on abandonne en premier —
/// jamais les emplacements probables.
const DETECT_BUDGET: usize = 40_000;

/// Dossiers qu'on ne traverse jamais : rien d'installé ne s'y trouve.
fn is_uninteresting(name: &str) -> bool {
    const SKIP: &[&str] = &[
        "windows",
        "$recycle.bin",
        "system volume information",
        "windowsapps",
        "node_modules",
        ".git",
        "recovery",
        "$windows.~ws",
        "$windows.~bt",
        "onedrivetemp",
    ];
    SKIP.iter().any(|skip| name.eq_ignore_ascii_case(skip))
}

/// Cherche tous les émulateurs connus en une seule traversée.
///
/// La version précédente relançait une descente par émulateur, et seulement
/// sous le profil utilisateur et `Program Files`. Elle ne trouvait donc rien
/// chez qui range ses émulateurs ailleurs — sur un second disque, par exemple,
/// ce qui est le cas le plus courant dès qu'on en a plusieurs.
///
/// Ici on descend une fois, en largeur, et chaque fichier croisé est confronté
/// à la liste entière. Le rang du nom dans `executables` départage : c'est ce
/// qui fait gagner Ryubing sur les autres émulateurs Switch.
fn detect_externals(roots: &[PathBuf]) -> std::collections::HashMap<&'static str, PathBuf> {
    use std::collections::{HashMap, HashSet, VecDeque};

    let mut best: HashMap<&'static str, (usize, PathBuf)> = HashMap::new();
    let mut visited: HashSet<PathBuf> = HashSet::new();
    let mut queue: VecDeque<(PathBuf, usize)> = roots
        .iter()
        .map(|root| (root.clone(), DETECT_DEPTH))
        .collect();
    let mut budget = DETECT_BUDGET;

    while let Some((directory, depth)) = queue.pop_front() {
        if budget == 0 {
            break;
        }
        budget -= 1;

        if !visited.insert(directory.clone()) {
            continue;
        }
        let Ok(entries) = fs::read_dir(&directory) else {
            continue;
        };

        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else { continue };
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };

            if kind.is_dir() {
                if depth > 1 && !is_uninteresting(name) {
                    queue.push_back((path, depth - 1));
                }
                continue;
            }

            for known in KNOWN_EXTERNALS {
                let Some(rank) = known
                    .executables
                    .iter()
                    .position(|wanted| name.eq_ignore_ascii_case(wanted))
                else {
                    continue;
                };
                match best.get(known.system) {
                    Some((found, _)) if *found <= rank => {}
                    _ => {
                        best.insert(known.system, (rank, path.clone()));
                    }
                }
            }
        }
    }

    best.into_iter()
        .map(|(system, (_, path))| (system, path))
        .collect()
}

/// Les endroits où un émulateur a des chances d'être installé.
///
/// Les racines des disques viennent d'abord : c'est là que se trouvent les
/// dossiers d'émulateurs qu'on se constitue soi-même, et le parcours en largeur
/// fait qu'un `D:\EM\...` est atteint bien avant les profondeurs de `C:`.
fn search_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();

    if cfg!(target_os = "windows") {
        // `C:` est déjà couvert par le profil et les dossiers de programmes ;
        // on l'inclut quand même, un dossier d'émulateurs pouvant y être posé
        // à la racine.
        roots.extend(
            ('C'..='Z')
                .map(|letter| PathBuf::from(format!("{letter}:\\")))
                .filter(|drive| drive.is_dir()),
        );
    }

    roots.extend(
        ["LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "USERPROFILE"]
            .iter()
            .filter_map(std::env::var_os)
            .map(PathBuf::from)
            .flat_map(|root| {
                vec![
                    root.join("Desktop"),
                    root.join("Downloads"),
                    root.join("Bureau"),
                    root.join("Téléchargements"),
                    root,
                ]
            }),
    );

    roots.retain(|path| path.is_dir());
    roots
}

/// Les émulateurs autonomes connus, avec leur état sur cette machine.
#[tauri::command]
pub fn known_externals(paths: State<'_, Paths>) -> Vec<ExternalPreset> {
    // Ouvrir cette liste, c'est demander « regarde maintenant » : on refouille
    // le disque, même si le balayage d'ouverture a déjà eu lieu.
    install_detected(&paths, true);

    let declared = read_config(&paths).external;
    let found = detect_externals(&search_roots());

    KNOWN_EXTERNALS
        .iter()
        .map(|known| ExternalPreset {
            system: known.system.to_owned(),
            extensions: known.extensions.iter().map(|e| (*e).to_owned()).collect(),
            args: known.args.iter().map(|a| (*a).to_owned()).collect(),
            detected: found
                .get(known.system)
                .map(|path| path.to_string_lossy().into_owned())
                .unwrap_or_default(),
            configured: declared.iter().any(|system| system.name == known.system),
        })
        .collect()
}

/// Vrai une fois le balayage d'ouverture effectué.
///
/// Le parcours du disque coûte quelques secondes ; le refaire à chaque
/// rafraîchissement de la bibliothèque se paierait à chaque dossier ajouté.
/// Une fois par lancement suffit — l'utilisateur qui installe un émulateur en
/// cours de route ouvre la liste des émulateurs, ce qui force un nouveau
/// passage.
static SWEPT: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Déclare seule les émulateurs trouvés sur la machine.
///
/// Un émulateur installé mais non déclaré ne sert à rien : ses jeux
/// n'apparaissent nulle part. Puisqu'EvaChi sait le reconnaître, lui faire
/// demander l'autorisation de s'en servir n'aide personne — il est déjà là, il
/// n'est ni téléchargé ni modifié, et un retrait reste possible d'un clic.
///
/// Ce qui a déjà été déclaré une fois n'est jamais redéclaré : c'est ce qui
/// rend le retrait durable.
fn install_detected(paths: &Paths, forced: bool) {
    use std::sync::atomic::Ordering;

    if !forced && SWEPT.swap(true, Ordering::SeqCst) {
        return;
    }
    SWEPT.store(true, Ordering::SeqCst);

    let Ok(config) = load_config(paths) else {
        // Réglages illisibles : surtout ne rien déclarer, l'écriture
        // effacerait ce qu'on n'a pas su lire.
        return;
    };

    let pending: Vec<&KnownExternal> = KNOWN_EXTERNALS
        .iter()
        .filter(|known| !config.external.iter().any(|s| s.name == known.system))
        .filter(|known| !config.auto_declared.iter().any(|n| n == known.system))
        .collect();
    if pending.is_empty() {
        return;
    }

    let started = std::time::Instant::now();
    let found = detect_externals(&search_roots());
    write_log(
        paths,
        &format!(
            "recherche d'émulateurs : {} trouvé(s) en {} ms",
            found.len(),
            started.elapsed().as_millis()
        ),
    );

    for known in pending {
        let Some(executable) = found.get(known.system) else {
            continue;
        };
        let outcome = declare_external(
            paths,
            ExternalSystem {
                name: known.system.to_owned(),
                executable: executable.to_string_lossy().into_owned(),
                args: known.args.iter().map(|a| (*a).to_owned()).collect(),
                extensions: known.extensions.iter().map(|e| (*e).to_owned()).collect(),
            },
        );
        match outcome {
            Ok(_) => write_log(
                paths,
                &format!("{} reconnu : {}", known.system, executable.display()),
            ),
            Err(error) => write_log(paths, &format!("{} : {error}", known.system)),
        }
    }
}

/// Déclare un émulateur connu à partir de son préréglage.
///
/// `executable` peut venir de la détection automatique ou du sélecteur de
/// fichiers : dans les deux cas, les arguments et extensions sont ceux que le
/// programme attend, sans que l'utilisateur ait à les connaître.
#[tauri::command]
pub fn adopt_external(
    system: String,
    executable: String,
    paths: State<'_, Paths>,
) -> Result<Vec<ExternalSystem>, String> {
    let Some(known) = KNOWN_EXTERNALS.iter().find(|known| known.system == system) else {
        return Err(format!("émulateur inconnu : {system}"));
    };

    set_external_system(
        ExternalSystem {
            name: known.system.to_owned(),
            executable,
            args: known.args.iter().map(|a| (*a).to_owned()).collect(),
            extensions: known.extensions.iter().map(|e| (*e).to_owned()).collect(),
        },
        paths,
    )
}

/// Ouvre le sélecteur de fichiers pour désigner un émulateur.
#[tauri::command]
pub fn pick_executable(app: tauri::AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;

    let mut dialog = app.dialog().file().set_title("Choisir un émulateur");
    if cfg!(target_os = "windows") {
        dialog = dialog.add_filter("Programmes", &["exe"]);
    }
    dialog.blocking_pick_file().map(|file| file.to_string())
}

/// Les cœurs qu'EvaChi sait aller chercher, et ceux déjà installés.
#[tauri::command]
pub fn installable_cores(paths: State<'_, Paths>) -> Vec<InstallableCore> {
    let present: std::collections::HashSet<String> = scan_cores(&paths.cores)
        .unwrap_or_default()
        .iter()
        .filter_map(|path| path.file_stem().and_then(|s| s.to_str()).map(str::to_owned))
        .collect();

    crate::install::catalogue()
        .into_iter()
        .map(|offer| InstallableCore {
            installed: present.contains(&offer.name),
            offer,
        })
        .collect()
}

/// Un cœur proposé, avec son état sur cette machine.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallableCore {
    #[serde(flatten)]
    pub offer: crate::install::CoreOffer,
    pub installed: bool,
}

/// Installe un cœur depuis la forge officielle libretro.
///
/// Un cœur à la fois : l'interface appelle cette commande en boucle, ce qui lui
/// donne une progression sans qu'on ait à inventer un canal d'événements, et
/// laisse l'utilisateur voir ce qui échoue quand quelque chose échoue.
#[tauri::command]
pub async fn install_core(name: String, paths: State<'_, Paths>) -> Result<u64, String> {
    let journal = (*paths).clone();
    let cores = journal.cores.clone();

    // Le téléchargement bloque : le confier à un fil dédié laisse la fenêtre
    // répondre pendant les quelques centaines de mégaoctets.
    let outcome = tauri::async_runtime::spawn_blocking(move || crate::install::install(&name, &cores))
        .await
        .map_err(|error| format!("installation interrompue : {error}"))?;

    match &outcome {
        Ok(size) => write_log(&journal, &format!("cœur installé : {size} octets")),
        Err(error) => write_log(&journal, &format!("installation refusée : {error}")),
    }
    outcome
}

/// Les émulateurs autonomes déclarés.
///
/// Premier appel du lancement : c'est ici que les émulateurs présents sur la
/// machine se déclarent seuls, avant que l'interface ne construise son
/// catalogue. Les jeux d'une console dont l'émulateur est installé apparaissent
/// donc dès la première ouverture, sans réglage.
#[tauri::command]
pub fn external_systems(paths: State<'_, Paths>) -> Vec<ExternalSystem> {
    install_detected(&paths, false);
    read_config(&paths).external
}

/// Déclare ou remplace un émulateur autonome, et rend la liste à jour.
#[tauri::command]
pub fn set_external_system(
    system: ExternalSystem,
    paths: State<'_, Paths>,
) -> Result<Vec<ExternalSystem>, String> {
    declare_external(&paths, system)
}

/// Enregistre un émulateur autonome. Cœur commun aux deux voies de déclaration.
fn declare_external(paths: &Paths, system: ExternalSystem) -> Result<Vec<ExternalSystem>, String> {
    if system.name.trim().is_empty() {
        return Err("un émulateur doit avoir un nom".into());
    }
    if !Path::new(&system.executable).is_file() {
        return Err(format!("{} : programme introuvable", system.executable));
    }

    let normalised = ExternalSystem {
        extensions: system
            .extensions
            .iter()
            .map(|extension| extension.trim().trim_start_matches('.').to_lowercase())
            .filter(|extension| !extension.is_empty())
            .collect(),
        ..system
    };

    let config = update_config(paths, |config| {
        // Retenir qu'on s'en est occupé, quelle que soit la voie : c'est ce qui
        // fait qu'un retrait tient, la détection ne reproposant jamais deux
        // fois le même système.
        if !config.auto_declared.iter().any(|n| n == &normalised.name) {
            config.auto_declared.push(normalised.name.clone());
        }
        match config
            .external
            .iter_mut()
            .find(|known| known.name == normalised.name)
        {
            Some(slot) => *slot = normalised,
            None => config.external.push(normalised),
        }
        config.external.sort_by(|a, b| a.name.cmp(&b.name));
    })?;

    Ok(config.external)
}

/// Retire un émulateur autonome, et rend la liste à jour.
#[tauri::command]
pub fn remove_external_system(
    name: String,
    paths: State<'_, Paths>,
) -> Result<Vec<ExternalSystem>, String> {
    let config = update_config(&paths, |config| {
        config.external.retain(|known| known.name != name);
    })?;
    Ok(config.external)
}

/// Lance un jeu dans son émulateur autonome.
///
/// Le processus est laissé libre : EvaChi ne l'attend pas et ne le surveille
/// pas. L'utilisateur veut jouer, pas garder une fenêtre ouverte derrière.
#[tauri::command]
pub fn launch_external(
    system: String,
    rom: String,
    paths: State<'_, Paths>,
) -> Result<String, String> {
    let config = read_config(&paths);
    let Some(target) = config.external.iter().find(|known| known.name == system) else {
        return Err(format!("émulateur inconnu : {system}"));
    };

    if !Path::new(&target.executable).is_file() {
        return Err(format!("{} : programme introuvable", target.executable));
    }

    let mut command = std::process::Command::new(&target.executable);

    // Le jeu prend la place du marqueur ; sans marqueur, il vient en dernier,
    // ce qu'attendent la plupart des émulateurs.
    let mut placed = false;
    for argument in &target.args {
        if argument.contains("{rom}") {
            command.arg(argument.replace("{rom}", &rom));
            placed = true;
        } else {
            command.arg(argument);
        }
    }
    if !placed {
        command.arg(&rom);
    }

    // Beaucoup d'émulateurs cherchent leurs ressources à côté d'eux-mêmes.
    if let Some(home) = Path::new(&target.executable).parent() {
        command.current_dir(home);
    }

    command
        .spawn()
        .map(|child| format!("{} lancé (processus {})", target.name, child.id()))
        .map_err(|error| format!("{} : {error}", target.executable))
}

/// Rejoue la découverte des cœurs et la raconte sur la sortie standard.
///
/// Emprunte exactement le chemin de l'interface — mêmes dossiers, même cache,
/// même interrogation — mais depuis un terminal, où l'on voit ce qui échoue.
pub fn list_cores_to_stdout() -> i32 {
    let Some(base) = dirs_app_data() else {
        eprintln!("dossier de données introuvable");
        return 1;
    };

    let paths = Paths {
        cores: base.join("cores"),
        system: base.join("system"),
        saves: base.join("saves"),
        roms: base.join("roms"),
        config: base.join("config.json"),
    };

    println!("données   {}", base.display());
    println!("cœurs     {}", paths.cores.display());

    match scan_cores(&paths.cores) {
        Ok(found) => println!("trouvés   {} bibliothèque(s)", found.len()),
        Err(error) => {
            println!("ERREUR    {error}");
            return 1;
        }
    }

    let config = read_config(&paths);
    println!("cache     {} fiche(s)", config.cores.len());
    println!("dossiers  {}", config.library_folders.join(" | "));

    match resolve_cores(&paths) {
        Ok(cores) => {
            let usable = cores.iter().filter(|core| core.usable).count();
            println!("\nutilisables {usable} / {}", cores.len());
            for core in cores.iter().filter(|core| !core.usable) {
                println!("  écarté : {}", core.id);
            }
            0
        }
        Err(error) => {
            println!("\nERREUR    {error}");
            1
        }
    }
}

/// Installe tous les cœurs manquants, puis ressort. Rend un code de sortie.
///
/// Le pendant de `--list-cores` : utilisable depuis un terminal, mais surtout
/// depuis un raccourci, ce qui permet d'équiper l'application sans passer par
/// sa fenêtre. Tout est aussi écrit dans le journal, seul témoin quand le
/// programme est lancé d'un double-clic.
pub fn install_cores_to_stdout() -> i32 {
    let Some(base) = dirs_app_data() else {
        eprintln!("dossier de données introuvable");
        return 1;
    };

    let paths = Paths {
        cores: base.join("cores"),
        system: base.join("system"),
        saves: base.join("saves"),
        roms: base.join("roms"),
        config: base.join("config.json"),
    };

    let present: std::collections::HashSet<String> = scan_cores(&paths.cores)
        .unwrap_or_default()
        .iter()
        .filter_map(|path| path.file_stem().and_then(|s| s.to_str()).map(str::to_owned))
        .collect();

    let wanted: Vec<_> = crate::install::catalogue()
        .into_iter()
        .filter(|offer| !present.contains(&offer.name))
        .collect();

    write_log(
        &paths,
        &format!(
            "--- installation : {} cœur(s) à télécharger, {} déjà là ---",
            wanted.len(),
            present.len()
        ),
    );
    println!("{} cœur(s) à installer dans {}", wanted.len(), paths.cores.display());

    let mut failures = 0;
    for (index, offer) in wanted.iter().enumerate() {
        let step = format!("{}/{} {}", index + 1, wanted.len(), offer.system);
        match crate::install::install(&offer.name, &paths.cores) {
            Ok(size) => {
                let line = format!("{step} — {} ({} Ko)", offer.label, size / 1024);
                println!("{line}");
                write_log(&paths, &line);
            }
            Err(error) => {
                failures += 1;
                let line = format!("{step} — ÉCHEC {error}");
                println!("{line}");
                write_log(&paths, &line);
            }
        }
    }

    let summary = format!(
        "installation terminée : {} posé(s), {failures} en échec",
        wanted.len() - failures
    );
    println!("{summary}");
    write_log(&paths, &summary);

    i32::from(failures > 0)
}

/// Le dossier de données de l'application, hors de tout contexte Tauri.
///
/// Doit rester aligné sur ce que `Paths::resolve` obtient d'`app_data_dir` :
/// c'est `%APPDATA%\<identifiant>` sous Windows.
fn dirs_app_data() -> Option<PathBuf> {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .map(|roaming| roaming.join("app.evachi"))
}

/// Un cœur trouvé sur le disque, avec ce qu'il a déclaré à l'interrogation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreEntry {
    /// Nom de fichier sans extension.
    pub id: String,
    pub path: String,
    /// Nom que le cœur se donne, ou son identifiant s'il n'a pas répondu.
    #[serde(default)]
    pub name: String,
    /// Extensions acceptées, en minuscules et sans le point.
    #[serde(default)]
    pub extensions: Vec<String>,
    /// Faux quand l'interrogation a échoué : le cœur est listé mais inutilisable.
    #[serde(default)]
    pub usable: bool,
}

/// Interroge un cœur et écrit sa fiche en JSON sur la sortie standard.
///
/// Destinée à tourner dans un processus séparé : si le cœur se termine
/// brutalement, seul ce processus meurt.
pub fn probe_core_to_stdout(path: &Path) -> i32 {
    let workdir = path.parent().unwrap_or(Path::new(".")).to_path_buf();

    // SAFETY : charger une bibliothèque exécute son code d'initialisation. Ce
    // processus n'existe que pour ça et se termine juste après.
    let outcome = unsafe { evachi::libretro::Core::load(path, &workdir, &workdir) };

    let Ok(core) = outcome else {
        return 1;
    };

    let info = core.info().clone();
    let entry = CoreEntry {
        id: path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_owned(),
        path: path.to_string_lossy().into_owned(),
        name: info.name,
        extensions: info
            .extensions
            .iter()
            .map(|extension| extension.to_lowercase())
            .collect(),
        usable: true,
    };

    match serde_json::to_string(&entry) {
        Ok(json) => {
            println!("{json}");
            0
        }
        Err(_) => 1,
    }
}

/// Extension des bibliothèques dynamiques de la plateforme courante.
pub(crate) const CORE_EXTENSION: &str = if cfg!(target_os = "windows") {
    "dll"
} else if cfg!(target_os = "macos") {
    "dylib"
} else {
    "so"
};

/// Énumère les bibliothèques de cœurs d'un répertoire, triées par nom.
///
/// Ne regarde que l'extension : un fichier peut porter le bon suffixe sans être
/// un cœur, et c'est au chargement que ça se découvre.
fn scan_cores(directory: &Path) -> Result<Vec<PathBuf>, String> {
    let entries =
        fs::read_dir(directory).map_err(|error| format!("{} : {error}", directory.display()))?;

    let mut cores: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|e| e.to_str()) == Some(CORE_EXTENSION))
        .collect();

    cores.sort();
    Ok(cores)
}

/// Date de dernière modification, en secondes, pour savoir si une fiche a vieilli.
fn modified_at(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|age| age.as_secs())
        .unwrap_or(0)
}

/// Interroge un cœur dans un processus séparé.
///
/// Un cœur qui se termine brutalement — faute d'un contexte graphique matériel,
/// par exemple — ne fait alors tomber que ce processus-là. Le faire dans le
/// nôtre emporterait toute l'application au premier démarrage.
fn probe_core(path: &Path) -> CoreEntry {
    let fallback = || CoreEntry {
        id: path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_owned(),
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_owned(),
        extensions: Vec::new(),
        usable: false,
    };

    let Ok(exe) = std::env::current_exe() else {
        return fallback();
    };

    let output = std::process::Command::new(exe)
        .arg("--probe-core")
        .arg(path)
        .output();

    match output {
        Ok(result) if result.status.success() => {
            let text = String::from_utf8_lossy(&result.stdout);
            // Un cœur bavard écrit sur la sortie standard avant nous : on ne
            // garde que la dernière ligne, celle que la sonde a produite.
            text.lines()
                .rev()
                .find_map(|line| serde_json::from_str::<CoreEntry>(line.trim()).ok())
                .unwrap_or_else(fallback)
        }
        _ => fallback(),
    }
}

/// Les cœurs installés, avec ce qu'ils déclarent.
///
/// Le résultat est conservé dans les réglages : interroger quinze cœurs prend
/// plusieurs secondes, et ils ne changent qu'au gré des installations.
#[tauri::command]
pub fn list_cores(paths: State<'_, Paths>) -> Result<Vec<CoreEntry>, String> {
    resolve_cores(&paths)
}

/// Établit la liste des cœurs, en s'appuyant sur le cache quand il est à jour.
fn resolve_cores(paths: &Paths) -> Result<Vec<CoreEntry>, String> {
    let found = scan_cores(&paths.cores)?;

    // Un catalogue vide est arrivé sans qu'on sache dire si le dossier était
    // vide, illisible, ou si les fiches avaient disparu. Ces deux nombres
    // tranchent, et ne coûtent qu'une ligne par démarrage.
    if found.is_empty() {
        let raw = match fs::read_dir(&paths.cores) {
            Ok(entries) => {
                let names: Vec<String> = entries
                    .map(|entry| match entry {
                        Ok(entry) => entry.file_name().to_string_lossy().into_owned(),
                        Err(error) => format!("<illisible : {error}>"),
                    })
                    .take(10)
                    .collect();
                format!("{} entrée(s) brutes : {}", names.len(), names.join(", "))
            }
            Err(error) => format!("lecture impossible : {error}"),
        };
        write_log(
            paths,
            &format!("AUCUN cœur dans {} — {raw}", paths.cores.display()),
        );
        let parent = paths
            .cores
            .parent()
            .and_then(|dir| fs::read_dir(dir).ok())
            .map(|entries| {
                entries
                    .flatten()
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_else(|| "<illisible>".into());
        write_log(paths, &format!("  dossier de données : {parent}"));
        write_log(
            paths,
            &format!(
                "  exe {:?} | APPDATA {:?} | réel {:?} | témoin {:?}",
                std::env::current_exe().ok(),
                std::env::var_os("APPDATA"),
                fs::canonicalize(&paths.cores).ok(),
                fs::metadata(paths.cores.join("mesen_libretro.dll")).map(|m| m.len()),
            ),
        );
    }

    // Lecture stricte : ré-interroger tous les cœurs coûte une vingtaine de
    // secondes, mais écrire par-dessus des réglages qu'on n'a pas su lire
    // effacerait les dossiers de jeux et les émulateurs déclarés.
    let mut config = load_config(paths)?;
    let mut changed = false;

    let mut cores = Vec::with_capacity(found.len());
    for path in &found {
        let key = path.to_string_lossy().into_owned();
        let stamp = modified_at(path);

        match config.cores.get(&key) {
            Some(known) if known.modified == stamp => cores.push(known.entry.clone()),
            _ => {
                let entry = probe_core(path);
                config.cores.insert(
                    key,
                    CachedCore {
                        modified: stamp,
                        entry: entry.clone(),
                    },
                );
                changed = true;
                cores.push(entry);
            }
        }
    }

    // Les fiches des cœurs disparus n'ont plus lieu d'être.
    let present: std::collections::HashSet<String> = found
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    if config.cores.keys().any(|key| !present.contains(key)) {
        config.cores.retain(|key, _| present.contains(key));
        changed = true;
    }

    if changed {
        if let Err(error) = write_config(paths, &config) {
            // Le cache non écrit n'empêche pas de jouer, mais il fait
            // ré-interroger tous les cœurs au prochain démarrage : ça se voit,
            // et ça mérite d'être dit.
            write_log(paths, &format!("cache des cœurs non écrit : {error}"));
        }
    }

    cores.sort_by_cached_key(|core| core.name.to_lowercase());
    write_log(
        paths,
        &format!(
            "cœurs : {} sur le disque, {} fiche(s) en cache, {} utilisable(s)",
            found.len(),
            config.cores.len(),
            cores.iter().filter(|core| core.usable).count()
        ),
    );
    Ok(cores)
}

/// Un fichier de la bibliothèque, avant tout chargement.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RomEntry {
    /// Nom du fichier, extension comprise.
    pub name: String,
    pub path: String,
    /// Extension en minuscules, sans le point.
    pub extension: String,
    pub size: u64,
    /// Nom du dossier qui contient le fichier, vide s'il est à la racine.
    ///
    /// C'est le classement de l'utilisateur, et il vaut mieux que toute
    /// déduction : une image `.iso` dans un dossier « 3DO » est un jeu 3DO,
    /// quelles que soient les consoles qui acceptent aussi cette extension.
    pub folder: String,
}

/// Profondeur maximale explorée dans la bibliothèque.
///
/// Assez pour une organisation par console puis par éditeur, pas assez pour
/// qu'un dossier mal placé fasse parcourir tout le disque.
const LIBRARY_DEPTH: usize = 4;

/// Vrai pour les fichiers qui accompagnent une collection sans en faire partie.
///
/// `README.md` se lisait comme une cartouche Mega Drive, `.md` étant à la fois
/// l'extension du Markdown et celle des jeux de cette console. Le nom du
/// fichier tranche là où l'extension ne peut pas.
fn is_documentation(name: &str) -> bool {
    const NAMES: &[&str] = &[
        "readme",
        "read me",
        "lisezmoi",
        "lisez moi",
        "license",
        "licence",
        "copying",
        "changelog",
        "notes",
        "note",
    ];

    let stem = name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(name)
        .trim();
    NAMES.iter().any(|known| stem.eq_ignore_ascii_case(known))
}

/// Parcourt la bibliothèque et rend les fichiers trouvés, triés par nom.
///
/// Aucun filtrage par extension ici : c'est l'interface qui sait quels cœurs
/// sont installés et ce qu'ils acceptent. Un fichier sans preneur sera
/// simplement écarté à l'affichage.
/// @param folder nom du dossier courant vu de la racine ; vide à la racine même.
fn scan_roms(directory: &Path, folder: &str, depth: usize, out: &mut Vec<RomEntry>) {
    if depth == 0 {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();

        if path.is_dir() {
            // Seul le premier niveau nomme la console : au-delà, on garde ce
            // nom-là, un sous-dossier « Europe » ne désignant aucun système.
            let deeper = if folder.is_empty() {
                path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default()
                    .to_owned()
            } else {
                folder.to_owned()
            };
            scan_roms(&path, &deeper, depth - 1, out);
            continue;
        }

        let Some(extension) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if is_documentation(name) {
            continue;
        }

        out.push(RomEntry {
            name: name.to_owned(),
            path: path.to_string_lossy().into_owned(),
            extension: extension.to_lowercase(),
            size: entry.metadata().map(|m| m.len()).unwrap_or(0),
            folder: folder.to_owned(),
        });
    }
}

/// Lit un fichier et le rend tel quel.
///
/// Les cœurs libretro se font livrer leur contenu par `load_content`, qui lit
/// depuis le disque. Les cœurs internes vivent dans la page et n'ont aucun
/// accès au système de fichiers : c'est par ici qu'ils reçoivent leurs octets.
#[tauri::command]
pub fn read_content(path: String) -> Result<Response, String> {
    fs::read(&path)
        .map(Response::new)
        .map_err(|error| format!("{path} : {error}"))
}

#[tauri::command]
pub fn list_roms(paths: State<'_, Paths>) -> Vec<RomEntry> {
    let mut found = Vec::new();

    // Le dossier par défaut d'abord, puis ceux que l'utilisateur a ajoutés.
    scan_roms(&paths.roms, "", LIBRARY_DEPTH, &mut found);
    for folder in read_config(&paths).library_folders {
        scan_roms(Path::new(&folder), "", LIBRARY_DEPTH, &mut found);
    }

    // Deux dossiers configurés peuvent se recouvrir : on ne montre qu'une fois
    // chaque fichier.
    let mut seen = std::collections::HashSet::new();
    found.retain(|rom| seen.insert(rom.path.clone()));
    // Tri insensible à la casse, la clé étant calculée une fois par élément
    // plutôt qu'à chaque comparaison.
    found.sort_by_cached_key(|rom| rom.name.to_lowercase());

    let folders: std::collections::HashSet<&str> =
        found.iter().map(|rom| rom.folder.as_str()).collect();
    write_log(
        &paths,
        &format!(
            "jeux : {} fichier(s) dans {} dossier(s)",
            found.len(),
            folders.len()
        ),
    );
    found
}

#[tauri::command]
pub fn load_core(
    path: String,
    session: State<'_, Session>,
    paths: State<'_, Paths>,
) -> Result<CoreInfo, String> {
    session.load_core(Path::new(&path), &paths.system, &paths.saves)
}

#[tauri::command]
pub fn load_content(path: String, session: State<'_, Session>) -> Result<AvInfo, String> {
    // Le contenu est lu ici même quand le cœur réclame un chemin : il en a
    // besoin pour déduire le format, et la lecture est de toute façon faite.
    let data = fs::read(&path).map_err(|error| format!("{path} : {error}"))?;
    session.load_content(Path::new(&path), data)
}

/// En-tête d'une trame : largeur, hauteur, drapeaux, nombre de trames audio.
const FRAME_HEADER: usize = 16;
const FLAG_VIDEO: u32 = 1 << 0;
const FLAG_SHUTDOWN: u32 = 1 << 1;

/// Sérialise une trame en un unique bloc binaire.
///
/// Disposition, en petit-boutiste :
///
/// | Position | Champ |
/// |---|---|
/// | 0 | largeur (u32) |
/// | 4 | hauteur (u32) |
/// | 8 | drapeaux (u32) — bit 0 : vidéo présente, bit 1 : arrêt demandé |
/// | 12 | trames audio (u32) |
/// | 16 | pixels RGBA, si le bit 0 est levé |
/// | … | échantillons stéréo entrelacés (i16) |
///
/// Isolée de la commande pour être vérifiable : c'est la seule description de
/// ce format côté Rust, et `src/libretro/client.ts` en tient l'autre moitié.
fn pack_frame(video: Option<&VideoFrame>, audio: &[i16], shutdown: bool) -> Vec<u8> {
    let mut flags = 0u32;
    if video.is_some() {
        flags |= FLAG_VIDEO;
    }
    if shutdown {
        flags |= FLAG_SHUTDOWN;
    }

    let (width, height) = video.map_or((0, 0), |video| (video.width, video.height));
    let pixels = video.map_or(0, |video| video.rgba.len());

    let mut out = Vec::with_capacity(FRAME_HEADER + pixels + audio.len() * 2);
    out.extend_from_slice(&width.to_le_bytes());
    out.extend_from_slice(&height.to_le_bytes());
    out.extend_from_slice(&flags.to_le_bytes());
    // Le nombre de *trames* audio, pas d'échantillons : le flux est stéréo.
    out.extend_from_slice(&((audio.len() / 2) as u32).to_le_bytes());

    if let Some(video) = video {
        out.extend_from_slice(&video.rgba);
    }
    for sample in audio {
        out.extend_from_slice(&sample.to_le_bytes());
    }
    out
}

/// Émule une trame et renvoie image et son au format décrit sur [`pack_frame`].
#[tauri::command]
pub fn run_frame(input: Vec<i16>, session: State<'_, Session>) -> Result<Response, String> {
    let mut buttons = [0i16; JOYPAD_BUTTONS];
    for (slot, value) in buttons.iter_mut().zip(input) {
        *slot = value;
    }

    let frame = session.run_frame(buttons)?;
    Ok(Response::new(pack_frame(
        frame.video.as_ref(),
        &frame.audio,
        frame.shutdown,
    )))
}

#[tauri::command]
pub fn reset(session: State<'_, Session>) -> Result<(), String> {
    session.reset()
}

/// Relève les messages que le cœur a émis depuis le dernier appel, et vide la
/// file. C'est par là qu'arrive un « BIOS introuvable » ou un avertissement de
/// compatibilité, que l'interface doit montrer plutôt que d'avaler.
#[tauri::command]
pub fn take_messages(session: State<'_, Session>) -> Vec<String> {
    session.take_messages()
}

#[tauri::command]
pub fn save_state(session: State<'_, Session>) -> Result<Response, String> {
    session.save_state().map(Response::new)
}

#[tauri::command]
pub fn load_state(state: Vec<u8>, session: State<'_, Session>) -> Result<(), String> {
    session.load_state(state)
}

#[tauri::command]
pub fn unload(session: State<'_, Session>) -> Result<(), String> {
    session.unload()
}

/// Ouvre une boîte de dialogue native et renvoie le chemin choisi.
///
/// Un `<input type="file">` ne livre qu'un objet `File`, sans chemin sur le
/// disque. Or un cœur libretro veut souvent le fichier lui-même : pour deviner
/// le format, ou pour trouver les fichiers voisins d'un jeu multi-pistes. Il
/// faut donc passer par le sélecteur du système.
///
/// Renvoie `None` si l'utilisateur annule.
#[tauri::command]
pub fn pick_content(
    app: tauri::AppHandle,
    extensions: Vec<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let mut dialog = app.dialog().file().set_title("Choisir un contenu");

    if !extensions.is_empty() {
        let filters: Vec<&str> = extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter("Contenus reconnus", &filters);
    }

    // Bloquant volontairement : Tauri exécute les commandes non asynchrones sur
    // un fil de son pool, jamais sur celui de l'interface.
    Ok(dialog
        .blocking_pick_file()
        .map(|file| file.to_string()))
}

/// Renvoie les dossiers de travail, pour que l'interface puisse y guider
/// l'utilisateur quand un cœur ou un BIOS manque.
#[tauri::command]
pub fn directories(paths: State<'_, Paths>) -> Vec<(String, String)> {
    vec![
        ("cœurs".into(), paths.cores.to_string_lossy().into_owned()),
        ("système".into(), paths.system.to_string_lossy().into_owned()),
        (
            "sauvegardes".into(),
            paths.saves.to_string_lossy().into_owned(),
        ),
        ("jeux".into(), paths.roms.to_string_lossy().into_owned()),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(width: u32, height: u32, rgba: Vec<u8>) -> VideoFrame {
        VideoFrame {
            rgba,
            width,
            height,
        }
    }

    /// Lit un entier 32 bits à la position donnée, en petit-boutiste.
    fn u32_at(bytes: &[u8], offset: usize) -> u32 {
        u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap())
    }

    #[test]
    fn l_en_tete_decrit_la_trame() {
        let video = frame(2, 1, vec![1, 2, 3, 4, 5, 6, 7, 8]);
        let audio = [10i16, -10, 20, -20];

        let packed = pack_frame(Some(&video), &audio, false);

        assert_eq!(u32_at(&packed, 0), 2, "largeur");
        assert_eq!(u32_at(&packed, 4), 1, "hauteur");
        assert_eq!(u32_at(&packed, 8), FLAG_VIDEO, "vidéo présente, pas d'arrêt");
        assert_eq!(u32_at(&packed, 12), 2, "deux trames audio pour quatre échantillons");
        assert_eq!(packed.len(), FRAME_HEADER + 8 + 8);
    }

    #[test]
    fn les_pixels_precedent_le_son() {
        let video = frame(1, 1, vec![0xaa, 0xbb, 0xcc, 0xff]);
        let audio = [0x1234i16, 0x5678];

        let packed = pack_frame(Some(&video), &audio, false);

        assert_eq!(&packed[FRAME_HEADER..FRAME_HEADER + 4], &[0xaa, 0xbb, 0xcc, 0xff]);
        assert_eq!(&packed[FRAME_HEADER + 4..], &[0x34, 0x12, 0x78, 0x56]);
    }

    #[test]
    fn une_trame_dupliquee_n_emporte_aucun_pixel() {
        // Sans image neuve, l'en-tête le dit et le bloc vidéo est absent :
        // c'est ce qui évite de repasser un mégaoctet inchangé à chaque trame.
        let audio = [1i16, 2];
        let packed = pack_frame(None, &audio, false);

        assert_eq!(u32_at(&packed, 0), 0, "largeur nulle");
        assert_eq!(u32_at(&packed, 4), 0, "hauteur nulle");
        assert_eq!(u32_at(&packed, 8) & FLAG_VIDEO, 0, "drapeau vidéo baissé");
        assert_eq!(packed.len(), FRAME_HEADER + 4, "en-tête et son seulement");
    }

    #[test]
    fn l_arret_demande_par_le_coeur_remonte() {
        let packed = pack_frame(None, &[], true);
        assert_eq!(u32_at(&packed, 8) & FLAG_SHUTDOWN, FLAG_SHUTDOWN);
    }

    #[test]
    fn une_trame_muette_tient_dans_l_en_tete() {
        let video = frame(1, 1, vec![0, 0, 0, 255]);
        let packed = pack_frame(Some(&video), &[], false);

        assert_eq!(u32_at(&packed, 12), 0, "aucune trame audio");
        assert_eq!(packed.len(), FRAME_HEADER + 4);
    }
}

#[cfg(test)]
mod config_tests {
    use super::*;

    /// Monte des chemins de travail dans un répertoire temporaire vierge.
    fn scratch() -> (PathBuf, Paths) {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);

        let base = std::env::temp_dir().join(format!(
            "evachi-config-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        fs::create_dir_all(&base).expect("répertoire temporaire");

        let paths = Paths {
            cores: base.join("cores"),
            system: base.join("system"),
            saves: base.join("saves"),
            roms: base.join("roms"),
            config: base.join("config.json"),
        };
        (base, paths)
    }

    #[test]
    fn un_fichier_absent_donne_les_reglages_par_defaut() {
        let (base, paths) = scratch();
        let config = load_config(&paths).expect("un premier lancement n'est pas une erreur");
        let _ = fs::remove_dir_all(&base);

        assert!(config.library_folders.is_empty());
        assert!(config.external.is_empty());
    }

    #[test]
    fn un_fichier_illisible_est_une_erreur_et_non_un_defaut() {
        // La confusion des deux coûtait les réglages de l'utilisateur : un
        // fichier surpris en cours d'écriture se lisait comme « rien », et la
        // sauvegarde suivante écrasait tout par du vide.
        let (base, paths) = scratch();
        fs::write(&paths.config, b"{ ceci n'est pas du JSON").expect("écriture");

        let outcome = load_config(&paths);
        let _ = fs::remove_dir_all(&base);

        assert!(outcome.is_err(), "un JSON cassé doit se signaler");
    }

    #[test]
    fn une_modification_refuse_d_ecrire_sur_des_reglages_illisibles() {
        let (base, paths) = scratch();
        let corrompu = b"{ tronque".to_vec();
        fs::write(&paths.config, &corrompu).expect("écriture");

        let outcome = update_config(&paths, |config| {
            config.library_folders.push("C:/jeux".into());
        });
        let apres = fs::read(&paths.config).expect("lecture");
        let _ = fs::remove_dir_all(&base);

        assert!(outcome.is_err(), "la modification doit échouer");
        assert_eq!(apres, corrompu, "le fichier ne doit pas avoir été touché");
    }

    #[test]
    fn une_modification_conserve_ce_qu_elle_ne_touche_pas() {
        let (base, paths) = scratch();

        update_config(&paths, |config| {
            config.library_folders.push("C:/jeux".into());
            config.external.push(ExternalSystem {
                name: "Nintendo Switch".into(),
                executable: "C:/Ryubing/Ryujinx.exe".into(),
                args: Vec::new(),
                extensions: vec!["nsp".into()],
            });
        })
        .expect("première écriture");

        // Une modification qui ne parle que des dossiers ne doit pas emporter
        // l'émulateur déclaré.
        let config = update_config(&paths, |config| {
            config.library_folders.push("D:/autres".into());
        })
        .expect("seconde écriture");
        let _ = fs::remove_dir_all(&base);

        assert_eq!(config.library_folders.len(), 2);
        assert_eq!(config.external.len(), 1, "l'émulateur externe survit");
        assert_eq!(config.external[0].name, "Nintendo Switch");
    }

    #[test]
    fn l_ecriture_ne_laisse_pas_de_fichier_temporaire() {
        let (base, paths) = scratch();
        update_config(&paths, |config| config.library_folders.push("C:/jeux".into()))
            .expect("écriture");

        let temporaire = paths.config.with_extension("json.tmp");
        let reste = temporaire.exists();
        let _ = fs::remove_dir_all(&base);

        assert!(!reste, "le fichier intermédiaire est renommé, pas laissé");
    }

    #[test]
    fn les_reglages_relus_sont_ceux_ecrits() {
        let (base, paths) = scratch();
        update_config(&paths, |config| {
            config.library_folders.push("C:/jeux".into());
        })
        .expect("écriture");

        let relu = load_config(&paths).expect("relecture");
        let _ = fs::remove_dir_all(&base);

        assert_eq!(relu.library_folders, vec!["C:/jeux".to_string()]);
    }
}

#[cfg(test)]
mod scan_tests {
    use super::*;

    /// Crée un répertoire temporaire garni des fichiers nommés.
    fn directory_with(files: &[&str]) -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);

        let path = std::env::temp_dir().join(format!(
            "evachi-scan-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        fs::create_dir_all(&path).expect("répertoire temporaire");
        for name in files {
            fs::write(path.join(name), b"").expect("fichier de test");
        }
        path
    }

    #[test]
    fn ne_retient_que_les_bibliotheques_dynamiques() {
        let directory = directory_with(&[
            &format!("un_coeur.{CORE_EXTENSION}"),
            "notes.txt",
            "archive.zip",
            "sans-extension",
        ]);

        let cores = scan_cores(&directory).expect("lecture");
        let _ = fs::remove_dir_all(&directory);

        assert_eq!(cores.len(), 1);
        assert_eq!(cores[0].file_stem().and_then(|s| s.to_str()), Some("un_coeur"));
    }

    #[test]
    fn trie_les_coeurs_par_nom() {
        let directory = directory_with(&[
            &format!("zeta.{CORE_EXTENSION}"),
            &format!("alpha.{CORE_EXTENSION}"),
            &format!("mu.{CORE_EXTENSION}"),
        ]);

        let cores = scan_cores(&directory).expect("lecture");
        let _ = fs::remove_dir_all(&directory);

        let names: Vec<&str> = cores
            .iter()
            .filter_map(|path| path.file_stem().and_then(|s| s.to_str()))
            .collect();
        assert_eq!(names, ["alpha", "mu", "zeta"]);
    }

    #[test]
    fn un_dossier_vide_ne_donne_aucun_coeur() {
        let directory = directory_with(&[]);
        let cores = scan_cores(&directory).expect("lecture");
        let _ = fs::remove_dir_all(&directory);
        assert!(cores.is_empty());
    }

    #[test]
    fn un_dossier_absent_est_une_erreur_lisible() {
        let missing = std::env::temp_dir().join("evachi-dossier-qui-n-existe-pas");
        let error = scan_cores(&missing).expect_err("doit échouer");
        assert!(
            error.contains("evachi-dossier-qui-n-existe-pas"),
            "le message doit nommer le dossier : {error}"
        );
    }
}

/// Reconnaissance des émulateurs autonomes posés sur la machine.
///
/// La version précédente ne cherchait que sous le profil utilisateur et les
/// dossiers de programmes : elle ne voyait rien chez qui range ses émulateurs
/// sur un second disque, ce qui est le cas dès qu'on en collectionne. Ces tests
/// tiennent la nouvelle règle — une seule descente, depuis n'importe quelle
/// racine, et un ordre de préférence explicite.
#[cfg(test)]
mod detect_tests {
    use super::*;

    /// Monte une arborescence : chaque chemin donné est créé comme fichier.
    fn tree(files: &[&str]) -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);

        let base = std::env::temp_dir().join(format!(
            "evachi-detect-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        for file in files {
            let path = base.join(file);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("arborescence de test");
            }
            fs::write(&path, b"").expect("fichier de test");
        }
        base
    }

    #[test]
    fn trouve_un_emulateur_range_dans_un_dossier_a_soi() {
        // La disposition qui échappait à l'ancienne recherche.
        let base = tree(&["EM/Ryubing/Ryujinx.exe"]);
        let found = detect_externals(std::slice::from_ref(&base));
        let _ = fs::remove_dir_all(&base);

        assert_eq!(
            found.get("Nintendo Switch"),
            Some(&base.join("EM").join("Ryubing").join("Ryujinx.exe"))
        );
    }

    #[test]
    fn prefere_le_premier_de_la_liste_quand_plusieurs_sont_installes() {
        // Cinq émulateurs Switch coexistent chez l'utilisateur ; c'est l'ordre
        // de `executables` qui exprime lequel on veut, pas l'ordre du disque.
        let base = tree(&[
            "EM/Sudachi/sudachi.exe",
            "EM/Citron/citron.exe",
            "EM/Eden/eden.exe",
            "EM/Ryubing/Ryujinx.exe",
        ]);
        let found = detect_externals(std::slice::from_ref(&base));
        let _ = fs::remove_dir_all(&base);

        assert_eq!(
            found.get("Nintendo Switch"),
            Some(&base.join("EM").join("Ryubing").join("Ryujinx.exe"))
        );
    }

    #[test]
    fn trouve_plusieurs_consoles_en_une_seule_descente() {
        let base = tree(&["EM/Ryubing/Ryujinx.exe", "EM/Cemu/Cemu.exe"]);
        let found = detect_externals(std::slice::from_ref(&base));
        let _ = fs::remove_dir_all(&base);

        assert_eq!(found.len(), 2);
        assert!(found.contains_key("Nintendo Switch"));
        assert!(found.contains_key("Wii U"));
    }

    #[test]
    fn ne_descend_pas_au_dela_de_la_profondeur_annoncee() {
        let deep = format!("{}/Cemu/Cemu.exe", "a/b/c/d/e");
        let base = tree(&[&deep]);
        let found = detect_externals(std::slice::from_ref(&base));
        let _ = fs::remove_dir_all(&base);

        assert!(
            found.is_empty(),
            "un exécutable enfoui n'est pas une installation"
        );
    }

    #[test]
    fn ignore_les_dossiers_systeme() {
        let base = tree(&["Windows/Cemu/Cemu.exe"]);
        let found = detect_externals(std::slice::from_ref(&base));
        let _ = fs::remove_dir_all(&base);

        assert!(found.is_empty(), "rien d'installé ne vit sous Windows\\");
    }

    #[test]
    fn ne_trouve_rien_quand_rien_n_est_installe() {
        let base = tree(&["EM/Jeux/note.txt"]);
        let found = detect_externals(std::slice::from_ref(&base));
        let _ = fs::remove_dir_all(&base);

        assert!(found.is_empty());
    }

    #[test]
    fn une_racine_inexistante_ne_fait_pas_echouer_la_recherche() {
        let base = tree(&["EM/Cemu/Cemu.exe"]);
        let found = detect_externals(&[PathBuf::from("Z:\\introuvable"), base.clone()]);
        let _ = fs::remove_dir_all(&base);

        assert!(found.contains_key("Wii U"));
    }

    #[test]
    fn les_fichiers_d_accompagnement_ne_sont_pas_des_jeux() {
        // `.md` est l'extension du Markdown autant que celle des cartouches
        // Mega Drive : c'est le nom qui tranche.
        assert!(is_documentation("README.md"));
        assert!(is_documentation("readme.txt"));
        assert!(is_documentation("LICENSE"));
        assert!(is_documentation("Changelog.md"));

        assert!(!is_documentation("Sonic the Hedgehog.md"));
        assert!(!is_documentation("Readme Racing.md"));
        assert!(!is_documentation("notes de version.md"));
    }
}

