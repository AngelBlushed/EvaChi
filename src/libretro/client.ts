import { invoke } from '@tauri-apps/api/core';

import type {
  AsyncEmulatorCore,
  AutreManette,
  Frame,
  Framebuffer,
  InputState,
  SensorState,
  StickState,
  SystemInfo,
} from '../core/types.ts';

/**
 * Un cœur installé, tel que la coque native l'a interrogé.
 *
 * L'interrogation a lieu dans un processus séparé : un cœur qui se termine
 * brutalement est simplement marqué inutilisable, sans emporter l'application.
 */
export interface CoreEntry {
  readonly id: string;
  readonly path: string;
  /** Nom que le cœur se donne, ou son identifiant s'il n'a pas répondu. */
  readonly name: string;
  /** Extensions acceptées, en minuscules et sans le point. */
  readonly extensions: readonly string[];
  /** Faux quand l'interrogation a échoué. */
  readonly usable: boolean;
}

/**
 * Ouvre le sélecteur de fichiers du système et rend le chemin choisi, ou `null`
 * si l'utilisateur annule.
 *
 * Un `<input type="file">` ne livre qu'un objet `File` sans chemin ; or un cœur
 * libretro veut souvent le fichier lui-même. D'où le passage par le système.
 *
 * @param extensions extensions acceptées, sans le point.
 */
export async function pickContent(extensions: readonly string[]): Promise<string | null> {
  return invoke<string | null>('pick_content', { extensions: [...extensions] });
}

/** Recopie une ligne de journal côté natif, visible depuis un terminal. */
export function note(message: string): void {
  // Diagnostic seulement : un échec ici ne doit rien interrompre.
  void invoke('note', { message }).catch(() => {});
}

/** Relève les messages émis par le cœur depuis le dernier appel. */
export async function takeMessages(): Promise<string[]> {
  return invoke<string[]>('take_messages');
}

/** Un fichier de la bibliothèque. */
export interface RomEntry {
  readonly name: string;
  readonly path: string;
  /** Extension en minuscules, sans le point. */
  readonly extension: string;
  readonly size: number;
  /**
   * Dossier qui contient le fichier, vide s'il est à la racine.
   *
   * C'est le classement de l'utilisateur : il tranche ce que l'extension ne
   * peut pas dire.
   */
  readonly folder: string;
}

// --- Les triches ------------------------------------------------------------

/** Une valeur qu'on maintient en mémoire, réécrite avant chaque trame. */
export interface Poke {
  /** Décalage depuis le début de la RAM de travail. */
  readonly adresse: number;
  /** Largeur en octets : 1, 2 ou 4. */
  readonly taille: number;
  readonly valeur: number;
}

/** Ce qu'on demande au cœur de faire tourner. */
export interface Consignes {
  /** Les codes des fiches, dans le dialecte de la console. Nul ne les lit. */
  readonly codes: string[];
  /** Les valeurs qu'on maintient soi-même. */
  readonly pokes: Poke[];
}

/** Ce que le cœur a fait des consignes. */
export interface EtatTriches {
  /** Combien de valeurs sont réellement maintenues. */
  readonly retenus: number;
  /** La taille de sa RAM de travail, zéro s'il ne l'ouvre pas. */
  readonly ram: number;
}

/**
 * Ce que le dépôt publie comme fiches, pour ces consoles-là.
 *
 * Une seule demande au réseau pour toute une bibliothèque, puis plus rien :
 * l'inventaire reste sur le disque. `rafraichir` y retourne quand même.
 */
export async function trichesCatalogue(
  systemes: readonly string[],
  rafraichir = false,
): Promise<Record<string, string[]>> {
  return invoke<Record<string, string[]>>('triches_catalogue', {
    systemes: [...systemes],
    rafraichir,
  });
}

/** Va chercher des fiches et les pose. Rend ce qui n'a pas pu l'être. */
export async function trichesInstaller(systeme: string, noms: readonly string[]): Promise<string[]> {
  return invoke<string[]>('triches_installer', { systeme, noms: [...noms] });
}

/** Les fiches déjà posées, console par console. */
export async function trichesPosees(): Promise<Record<string, string[]>> {
  return invoke<Record<string, string[]>>('triches_posees');
}

/** Le contenu d'une fiche posée. C'est la fenêtre qui la découpe. */
export async function trichesContenu(systeme: string, nom: string): Promise<string> {
  return invoke<string>('triches_contenu', { systeme, nom });
}

/** Retire une fiche du disque. */
export async function trichesRetirer(systeme: string, nom: string): Promise<void> {
  await invoke('triches_retirer', { systeme, nom });
}

/**
 * Pose les triches actives sur le cœur en cours.
 *
 * Tout part d'un coup : le cœur oublie les précédentes puis reprend les
 * nouvelles. Décocher arrête donc l'écriture à l'instant.
 */
export async function poserTriches(consignes: Consignes): Promise<EtatTriches> {
  return invoke<EtatTriches>('poser_triches', { consignes });
}

/** Une tranche de la RAM de travail, pour la recherche de valeurs. */
export async function lireMemoire(debut: number, longueur: number): Promise<Uint8Array> {
  return new Uint8Array(await invoke<ArrayBuffer>('lire_memoire', { debut, longueur }));
}

/** Énumère les fichiers déposés dans le dossier des jeux. */
export async function listRoms(): Promise<RomEntry[]> {
  return invoke<RomEntry[]>('list_roms');
}

/**
 * Lit un fichier depuis le disque.
 *
 * Nécessaire aux cœurs internes : ils vivent dans la page et n'ont aucun accès
 * au système de fichiers, alors qu'un cœur libretro se fait livrer son contenu
 * directement par la coque native.
 */
export async function readContent(path: string): Promise<Uint8Array> {
  return new Uint8Array(await invoke<ArrayBuffer>('read_content', { path }));
}

/** Les dossiers de travail de l'application, pour y guider l'utilisateur. */
export async function directories(): Promise<[string, string][]> {
  return invoke<[string, string][]>('directories');
}

/** Ouvre le sélecteur de dossier du système. `null` si l'utilisateur annule. */
export async function pickFolder(): Promise<string | null> {
  return invoke<string | null>('pick_folder');
}

/** Les dossiers de jeux ajoutés par l'utilisateur. */
export async function libraryFolders(): Promise<string[]> {
  return invoke<string[]>('library_folders');
}

/** Ajoute un dossier de jeux et rend la liste à jour. */
export async function addLibraryFolder(path: string): Promise<string[]> {
  return invoke<string[]>('add_library_folder', { path });
}

/** Retire un dossier de jeux et rend la liste à jour. */
export async function removeLibraryFolder(path: string): Promise<string[]> {
  return invoke<string[]>('remove_library_folder', { path });
}

/**
 * Un émulateur autonome, lancé comme un programme séparé.
 *
 * Certaines consoles n'ont pas de cœur libretro : leur émulateur existe, mais
 * personne ne l'a porté. EvaChi le lance alors avec le jeu en argument, si bien
 * que l'émulateur démarre directement dans la partie sans passer par son menu.
 */
export interface ExternalSystem {
  readonly name: string;
  readonly executable: string;
  /** Arguments, où `{rom}` sera remplacé par le chemin du jeu. */
  readonly args: readonly string[];
  /** Extensions prises en charge, en minuscules et sans le point. */
  readonly extensions: readonly string[];
}

/**
 * Un émulateur autonome qu'EvaChi sait configurer seul.
 *
 * Le programme n'est pas fourni — chacun a sa licence et pèse des centaines de
 * mégaoctets. EvaChi le reconnaît, le trouve, et sait quels arguments il attend.
 */
export interface ExternalPreset {
  readonly system: string;
  readonly extensions: readonly string[];
  readonly args: readonly string[];
  /** Chemin trouvé sur la machine, vide si l'émulateur n'est pas installé. */
  readonly detected: string;
  /** Vrai si l'émulateur est déjà déclaré. */
  readonly configured: boolean;
}

/**
 * Un cœur qu'EvaChi sait aller chercher sur la forge officielle libretro.
 *
 * EvaChi ne redistribue aucun émulateur : elle télécharge, à la demande, les
 * versions publiées par leurs auteurs.
 */
export interface InstallableCore {
  /** Nom du fichier sur la forge, sans extension. */
  readonly name: string;
  /** Nom de l'émulateur, tel que ses auteurs l'écrivent. */
  readonly label: string;
  /** Console émulée. */
  readonly system: string;
  readonly installed: boolean;
}

/** Les cœurs proposés, avec ceux déjà installés. */
export async function installableCores(): Promise<InstallableCore[]> {
  return invoke<InstallableCore[]>('installable_cores');
}

/** Installe un cœur. Rend sa taille en octets. */
export async function installCore(name: string): Promise<number> {
  return invoke<number>('install_core', { name });
}

/**
 * Un fichier système qu'un cœur réclame.
 *
 * EvaChi n'en fournit aucun : ce sont les micrologiciels des machines
 * d'origine. Elle dit lesquels manquent, sous quel nom, et à quel endroit —
 * faute de quoi un cœur privé du sien se contente d'un écran noir.
 */
export interface SystemFile {
  readonly system: string;
  /** Chemin attendu sous le dossier système, séparateurs en avant. */
  readonly file: string;
  readonly need: 'required' | 'optional';
  /** Ce que change sa présence, en une phrase. */
  readonly note: string;
  readonly present: boolean;
  /** Faux quand le cœur concerné n'est pas installé : la ligne ne presse pas. */
  readonly coreInstalled: boolean;
  /** Chemin complet où le déposer. */
  readonly path: string;
}

/** Fait le tour des fichiers système attendus, et dit lesquels manquent. */
export async function systemFiles(): Promise<SystemFile[]> {
  return invoke<SystemFile[]>('system_files');
}

/** Un fichier système qu'un cœur vient de réclamer dans son journal. */
export interface Reclamation {
  /** Le nom du fichier, tel qu'EvaChi le connaît ou tel que le cœur l'a écrit. */
  readonly fichier: string;
  /** Où le déposer, quand EvaChi connaît ce fichier-là. */
  readonly ou: string | null;
  readonly systeme: string | null;
}

/**
 * Cherche, dans ce que le cœur vient de dire, un fichier système réclamé.
 *
 * La liste des fichiers attendus sait d'avance ce que réclament les cœurs
 * qu'EvaChi connaît. Elle ne peut rien dire des autres, ni des cas particuliers.
 * Le cœur, lui, le dit — et depuis que son journal traverse pour de bon, on peut
 * enfin l'écouter.
 */
export async function claimedSystemFile(lignes: readonly string[]): Promise<Reclamation | null> {
  return invoke<Reclamation | null>('claimed_system_file', { lines: lignes });
}

/** À qui l'on doit un émulateur, et sous quelles conditions. */
export interface Credit {
  readonly nom: string;
  readonly auteurs: readonly string[];
  readonly licence: string;
  readonly systeme: string;
  /** `coeur` s'il tourne dans EvaChi, `externe` s'il a sa propre fenêtre. */
  readonly genre: string;
  /** Vrai si la licence porte une clause non commerciale. */
  readonly restreint: boolean;
  readonly site: string;
  readonly installe: boolean;
}

/**
 * À qui l'on doit chaque émulateur.
 *
 * EvaChi n'en écrit aucun et n'en redistribue aucun : elle va les chercher chez
 * leurs auteurs, à la demande. Leur travail est pourtant partout dans ce
 * qu'elle donne à voir, et cette liste est le seul endroit où il se lit.
 */
export async function credits(): Promise<Credit[]> {
  return invoke<Credit[]>('credits');
}

/** Ouvre le dossier des fichiers système dans l'explorateur. */
export async function revealSystemDir(): Promise<string> {
  return invoke<string>('reveal_system_dir');
}

/** Ce qu'est devenu un fichier confié au rangement automatique. */
export interface Placed {
  readonly name: string;
  /** Console ou usage reconnu, vide si personne ne réclamait ce fichier. */
  readonly system: string;
  /** Où il a été posé, vide s'il n'a pas bougé. */
  readonly destination: string;
  readonly placed: boolean;
  /** Ce qui s'est passé, en une phrase. */
  readonly note: string;
}

/** Ouvre le sélecteur pour désigner un BIOS, une clé ou une archive. */
export async function pickSystemFile(): Promise<string | null> {
  return invoke<string | null>('pick_system_file');
}

/**
 * Range un fichier système là où l'émulateur concerné ira le chercher.
 *
 * Une archive est ouverte et vidée de ce qu'on sait placer : un lot entier se
 * confie d'un seul geste.
 */
export async function adoptSystemFile(path: string): Promise<Placed[]> {
  return invoke<Placed[]>('adopt_system_file', { path });
}

/**
 * Les noms de jaquettes publiés pour cette console.
 *
 * Le serveur n'autorise pas la lecture de son index depuis la fenêtre : c'est
 * la coque native qui va le chercher, et le garde sur le disque.
 */
export async function coverIndex(system: string): Promise<CoverIndex> {
  return invoke<CoverIndex>('cover_index', { system });
}

/**
 * L'inventaire des vignettes d'une console.
 *
 * `kind` dit de quelle sorte d'image il s'agit : toutes les consoles n'ont pas
 * de boîtes, et l'écran-titre ou une capture de jeu prennent alors le relais.
 */
export interface CoverIndex {
  readonly kind: string;
  readonly names: string[];
}

/** Ce qu'une partie mal terminée a laissé derrière elle. */
export interface CrashReport {
  readonly core: string;
  readonly label: string;
  readonly game: string;
}

/** Note qu'une partie commence, pour qu'un arrêt brutal laisse une trace. */
export async function beginSession(core: string, label: string, game: string): Promise<void> {
  return invoke<void>('begin_session', { core, label, game });
}

/** La note laissée par une partie qui ne s'est pas terminée, s'il y en a une. */
export async function crashReport(): Promise<CrashReport | null> {
  return invoke<CrashReport | null>('crash_report');
}

/** Efface la note : on a pris connaissance de l'incident. */
export async function dismissCrash(): Promise<void> {
  return invoke<void>('dismiss_crash');
}

/** Écarte un cœur, ou le rétablit. */
export async function setCoreUsable(path: string, usable: boolean): Promise<void> {
  return invoke<void>('set_core_usable', { path, usable });
}

/** Un emplacement de sauvegarde d'état. */
export interface StateSlot {
  readonly slot: number;
  readonly filled: boolean;
  /** Secondes depuis 1970. */
  readonly taken: number;
  readonly size: number;
  /** L'image de l'écran au moment de la sauvegarde. */
  readonly shot: string;
}

/** Range un état, avec l'image de l'écran. */
export async function saveStateSlot(
  romPath: string,
  slot: number,
  state: string,
  shot: string,
): Promise<void> {
  return invoke<void>('save_state_slot', { romPath, slot, state, shot });
}

/** Relit un état rangé, en base64. */
export async function loadStateSlot(romPath: string, slot: number): Promise<string> {
  return invoke<string>('load_state_slot', { romPath, slot });
}

/** L'état des quatre emplacements d'un jeu. */
export async function listStates(romPath: string): Promise<StateSlot[]> {
  return invoke<StateSlot[]>('list_states', { romPath });
}

/** Vide un emplacement. */
export async function deleteStateSlot(romPath: string, slot: number): Promise<void> {
  return invoke<void>('delete_state_slot', { romPath, slot });
}

/**
 * Un fichier qui attend dans le dépôt.
 *
 * `dossiers` dit ce qu'on sait en faire : vide quand l'extension n'est
 * reconnue par personne, un seul quand le rangement est évident, plusieurs
 * quand il faut demander.
 */
export interface Depose {
  readonly nom: string;
  readonly chemin: string;
  readonly taille: number;
  readonly dossiers: string[];
  /** Le fichier de même nom déjà rangé, s'il y en a un. */
  readonly double: string | null;
}

/** Ce qui attend dans le dépôt, du plus évident au moins évident. */
export async function listDrops(): Promise<Depose[]> {
  return invoke<Depose[]>('list_drops');
}

/** Range un fichier déposé, ou le jette. Rend son nouveau chemin. */
export async function fileDrop(
  file: string,
  folder: string,
  action: 'ranger' | 'remplacer' | 'jeter',
): Promise<string> {
  return invoke<string>('file_drop', { file, folder, action });
}

/** Retire du dépôt les dossiers restés vides. */
export async function sweepDrop(): Promise<number> {
  return invoke<number>('sweep_drop');
}

/** Ce qu'une écriture de touches a changé chez un émulateur. */
export interface Ecrit {
  readonly label: string;
  readonly fichier: string;
  readonly lignes: number;
  readonly sauvegarde: boolean;
}

/**
 * Porte les touches d'EvaChi jusqu'aux émulateurs autonomes installés.
 *
 * `bindings` donne, pour chaque bouton de la manette libretro, le numéro du
 * bouton physique qui le tient — ou -1 quand personne ne le tient.
 */
export async function writePadBindings(bindings: readonly number[]): Promise<Ecrit[]> {
  return invoke<Ecrit[]>('write_pad_bindings', { bindings });
}

/** Les dossiers de consoles que l'ossature crée, dans l'ordre. */
export async function knownFolders(): Promise<string[]> {
  return invoke<string[]>('known_folders');
}

/**
 * Un fichier de sauvegarde écrit par le jeu lui-même.
 *
 * C'est la pile de la cartouche, pas un emplacement : le jeu y note ses
 * parties, et la relit au démarrage suivant.
 */
export interface Pile {
  readonly nom: string;
  readonly taille: number;
}

/** Ce que ce jeu a écrit de lui-même, sur le disque. */
export async function listSaves(romPath: string): Promise<Pile[]> {
  return invoke<Pile[]>('list_saves', { romPath });
}

/** Efface la pile d'un jeu, et rend le nombre de fichiers retirés. */
export async function clearSaves(romPath: string): Promise<number> {
  return invoke<number>('clear_saves', { romPath });
}

/** Une capture d'écran conservée. */
export interface Shot {
  readonly file: string;
  readonly game: string;
  /** Secondes depuis 1970. */
  readonly taken: number;
  /** L'image, prête à afficher. */
  readonly data: string;
}

/** Écrit une capture et rend son nom de fichier. */
export async function saveShot(game: string, data: string): Promise<string> {
  return invoke<string>('save_shot', { game, data });
}

/** Toutes les captures, la plus récente d'abord. */
export async function listShots(): Promise<Shot[]> {
  return invoke<Shot[]>('list_shots');
}

/** Efface une capture. */
export async function deleteShot(file: string): Promise<void> {
  return invoke<void>('delete_shot', { file });
}

/** Ouvre le dossier des captures dans l'explorateur. */
export async function revealShotsDir(): Promise<string> {
  return invoke<string>('reveal_shots_dir');
}

/** Les jaquettes posées à la main, par chemin de jeu. */
export async function manualCovers(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('manual_covers');
}

/** Ouvre le sélecteur d'image et rattache le choix à un jeu. */
export async function setManualCover(romPath: string): Promise<string | null> {
  return invoke<string | null>('set_manual_cover', { romPath });
}

/**
 * Rapporte une jaquette du serveur, sous forme d'adresse `data:`.
 *
 * La page l'affiche très bien elle-même ; c'est la redessiner dans un canevas
 * pour la recadrer qui échoue, faute d'autorisation d'origine. Le détour par le
 * code natif n'existe que pour cela.
 */
export async function coverImage(url: string): Promise<string> {
  return invoke<string>('cover_image', { url });
}

/**
 * Enregistre une jaquette recadrée. Rend l'adresse à afficher.
 *
 * `source` est l'image d'avant recadrage : gardée de côté une fois pour toutes,
 * elle permet de recadrer autrement sans repartir de ce qu'il restait.
 */
export async function setCroppedCover(
  romPath: string,
  data: string,
  source?: string,
): Promise<string> {
  return invoke<string>('set_cropped_cover', { romPath, data, source });
}

/** L'image d'avant tout recadrage, si elle a été gardée. */
export async function coverOriginal(romPath: string): Promise<string | null> {
  return invoke<string | null>('cover_original', { romPath });
}

/** Les jeux dont la jaquette a été recadrée à la main. */
export async function croppedCovers(): Promise<string[]> {
  return invoke<string[]>('cropped_covers');
}

/** Détache la jaquette posée sur un jeu. */
export async function clearManualCover(romPath: string): Promise<void> {
  return invoke<void>('clear_manual_cover', { romPath });
}

/** Ouvre le sélecteur pour désigner un dossier entier à ranger. */
export async function pickSystemFolder(): Promise<string | null> {
  return invoke<string | null>('pick_system_folder');
}

/**
 * Range tout ce qu'un dossier contient, aussi loin qu'il s'emboîte.
 *
 * Le cas ordinaire : un lot récupéré quelque part, posé en vrac. Ce qui n'est
 * réclamé par personne est compté, pas énuméré.
 */
export async function adoptSystemFolder(path: string): Promise<Placed[]> {
  return invoke<Placed[]>('adopt_system_folder', { path });
}

/**
 * Un émulateur autonome qu'EvaChi sait installer.
 *
 * `downloadable` est faux pour ceux dont la forge se protège des robots : ils
 * restent à installer soi-même, EvaChi les reconnaîtra ensuite.
 */
export interface EmulatorOffer {
  readonly system: string;
  readonly label: string;
  readonly license: string;
  readonly site: string;
  readonly downloadable: boolean;
  /** Chemin du programme si EvaChi s'en sert déjà, vide sinon. */
  readonly declared: string;
  /** Vrai si c'est EvaChi qui l'a installé. */
  readonly owned: boolean;
}

/** Les émulateurs autonomes proposés, avec leur état. */
export async function installableEmulators(): Promise<EmulatorOffer[]> {
  return invoke<EmulatorOffer[]>('installable_emulators');
}

/** Télécharge, installe et déclare un émulateur autonome. */
export async function installEmulator(system: string): Promise<ExternalSystem[]> {
  return invoke<ExternalSystem[]>('install_emulator', { system });
}

/** Les émulateurs connus, avec leur état sur cette machine. */
export async function knownExternals(): Promise<ExternalPreset[]> {
  return invoke<ExternalPreset[]>('known_externals');
}

/** Déclare un émulateur connu à partir de son préréglage. */
export async function adoptExternal(
  system: string,
  executable: string,
): Promise<ExternalSystem[]> {
  return invoke<ExternalSystem[]>('adopt_external', { system, executable });
}

/** Ouvre le sélecteur de fichiers pour désigner un émulateur. */
export async function pickExecutable(): Promise<string | null> {
  return invoke<string | null>('pick_executable');
}

export async function externalSystems(): Promise<ExternalSystem[]> {
  return invoke<ExternalSystem[]>('external_systems');
}

/** Déclare ou remplace un émulateur autonome. */
export async function setExternalSystem(system: ExternalSystem): Promise<ExternalSystem[]> {
  return invoke<ExternalSystem[]>('set_external_system', { system });
}

export async function removeExternalSystem(name: string): Promise<ExternalSystem[]> {
  return invoke<ExternalSystem[]>('remove_external_system', { name });
}

/** Lance un jeu dans son émulateur autonome. */
export async function launchExternal(system: string, rom: string): Promise<string> {
  return invoke<string>('launch_external', { system, rom });
}

/** Porte la langue des jeux chez les émulateurs autonomes qui la gardent. */
export async function writeConsoleLanguage(code: string): Promise<string[]> {
  return invoke<string[]>('write_console_language', { code });
}

/** Ouvre un émulateur autonome sur sa propre fenêtre, sans jeu. */
export async function openExternal(system: string): Promise<string> {
  return invoke<string>('open_external', { system });
}

/** Identité déclarée par un cœur une fois sa bibliothèque chargée. */
export interface CoreIdentity {
  readonly name: string;
  readonly version: string;
  /** Extensions acceptées, sans le point. */
  readonly extensions: readonly string[];
  /** Vrai si le cœur lit le contenu depuis le disque plutôt qu'en mémoire. */
  readonly needFullpath: boolean;
}

/** Caractéristiques audiovisuelles du contenu chargé. */
export interface AvInfo {
  readonly width: number;
  readonly height: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly aspectRatio: number;
  readonly fps: number;
  readonly sampleRate: number;
}

/**
 * Disposition du bloc binaire que `run_frame` renvoie. Elle doit rester
 * synchronisée avec `pack_frame` dans `src-tauri/src/commands.rs`, qui l'écrit.
 */
const HEADER_BYTES = 16;
const FLAG_VIDEO = 1 << 0;
const FLAG_SHUTDOWN = 1 << 1;

/** Convertit un entier 16 bits signé en flottant dans [-1, 1]. */
const SAMPLE_SCALE = 1 / 32768;

/** Une trame telle qu'elle sort du bloc binaire, avant tout report. */
export interface DecodedFrame {
  /** `null` quand le cœur a demandé de réafficher la trame précédente. */
  readonly video: Framebuffer | null;
  readonly width: number;
  readonly height: number;
  /** Stéréo entrelacé, dans [-1, 1]. */
  readonly audio: Float32Array;
  readonly shutdown: boolean;
}

/**
 * La marque que porte une erreur venue d'un cœur qui n'est plus là.
 *
 * L'autre moitié est `TOMBE`, dans `src-tauri/src/libretro/distant/tuyau.rs`.
 * Écrite des deux côtés plutôt que partagée : il n'y a pas de canal entre les
 * deux, et une marque qui divergerait se verrait tout de suite — l'incident ne
 * s'annoncerait plus.
 */
export const COEUR_TOMBE = 'coeur-tombe';

/**
 * Encode et décode les octets qui traversent le pont.
 *
 * Le pont vers la coque native ne transporte que du texte dans ce sens-là ; un
 * tableau de plusieurs mégaoctets converti en JSON coûterait dix fois plus cher
 * que ces deux fonctions réunies.
 */
export function encodeBase64(octets: Uint8Array): string {
  let texte = '';
  // Par tranches : passer un million d'octets d'un coup à `fromCharCode`
  // dépasse la taille d'appel que le moteur accepte.
  for (let debut = 0; debut < octets.length; debut += 0x8000) {
    texte += String.fromCharCode(...octets.subarray(debut, debut + 0x8000));
  }
  return btoa(texte);
}

export function decodeBase64(texte: string): Uint8Array {
  const brut = atob(texte);
  const octets = new Uint8Array(brut.length);
  for (let rang = 0; rang < brut.length; rang += 1) octets[rang] = brut.charCodeAt(rang);
  return octets;
}

/**
 * Découpe le bloc binaire renvoyé par la coque native.
 *
 * Fonction pure, exportée pour être testée : elle est l'autre moitié du format
 * décrit sur `pack_frame`, et rien d'autre ne le décrit côté interface.
 *
 * @throws si le bloc est trop court pour ce qu'il annonce.
 */
export function decodeFrame(raw: ArrayBuffer): DecodedFrame {
  if (raw.byteLength < HEADER_BYTES) {
    throw new Error(`trame tronquée : ${raw.byteLength} octets, ${HEADER_BYTES} au minimum`);
  }

  const view = new DataView(raw);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  const flags = view.getUint32(8, true);
  const audioFrames = view.getUint32(12, true);

  const pixels = flags & FLAG_VIDEO ? width * height * 4 : 0;
  const expected = HEADER_BYTES + pixels + audioFrames * 4;
  if (raw.byteLength < expected) {
    throw new Error(`trame tronquée : ${raw.byteLength} octets, ${expected} attendus`);
  }

  let offset = HEADER_BYTES;

  // Copie plutôt que vue : le tampon sous-jacent est réutilisé à la trame
  // suivante, et l'appelant garde souvent l'image d'une trame sur l'autre.
  const video =
    flags & FLAG_VIDEO ? new Uint8ClampedArray(raw.slice(offset, offset + pixels)) : null;
  offset += pixels;

  const audio = new Float32Array(audioFrames * 2);
  for (let s = 0; s < audio.length; s += 1) {
    audio[s] = view.getInt16(offset + s * 2, true) * SAMPLE_SCALE;
  }

  return {
    video,
    width: video ? width : 0,
    height: video ? height : 0,
    audio,
    shutdown: (flags & FLAG_SHUTDOWN) !== 0,
  };
}

/**
 * Un cœur libretro, piloté par la coque native.
 *
 * L'objet ne détient rien : le cœur vit côté Rust, sur son propre thread. Cette
 * classe n'est que la façade qui lui donne la forme attendue par l'interface.
 */
/**
 * Ce que les joueurs suivants envoient, au format de la commande de trame.
 *
 * Les mêmes conversions que pour le premier : seize pressions, et des axes
 * bornés avant d'être mis à l'échelle — une manette mal calibrée rend parfois
 * 1,02, et le tour du compteur enverrait « à fond à gauche » là où le joueur
 * poussait à fond à droite.
 *
 * Pas de capteurs : ils décrivent la console, et une console n'en a qu'une.
 */
export function portsSuivants(
  autres: readonly AutreManette[],
): { input: number[]; axes: number[] }[] {
  return autres.map((manette) => ({
    input: Array.from({ length: 16 }, (_, index) => (manette.boutons[index] ? 1 : 0)),
    axes: Array.from({ length: 4 }, (_, index) =>
      Math.round(Math.max(-1, Math.min(1, manette.manches[index] ?? 0)) * 32_767),
    ),
  }));
}

export class LibretroCore implements AsyncEmulatorCore {
  #info: SystemInfo;
  #identity: CoreIdentity;
  #av: AvInfo | null = null;
  #contentPath: string | null = null;
  /** Dernière trame reçue, réaffichée quand le cœur n'en produit pas de neuve. */
  #lastVideo: Framebuffer = new Uint8ClampedArray(0);
  #lastWidth = 0;
  #lastHeight = 0;
  #shutdown = false;

  private constructor(id: string, identity: CoreIdentity) {
    this.#identity = identity;
    this.#info = {
      id,
      name: identity.name || id,
      // Bornes provisoires : la géométrie réelle n'est connue qu'après le
      // chargement du contenu, et `load` les remplace.
      maxWidth: 0,
      maxHeight: 0,
      aspectRatio: 0,
      fps: 60,
      sampleRate: 48000,
      extensions: identity.extensions.map((e) => `.${e}`),
    };
  }

  /** Énumère les cœurs présents dans le dossier prévu. */
  static async list(): Promise<CoreEntry[]> {
    return invoke<CoreEntry[]>('list_cores');
  }

  /** Renvoie les dossiers de travail, pour guider l'utilisateur. */
  static async directories(): Promise<[string, string][]> {
    return invoke<[string, string][]>('directories');
  }

  /**
   * Charge une bibliothèque de cœur. Un seul cœur tourne à la fois : celui-ci
   * remplace le précédent.
   */
  static async open(entry: CoreEntry, langue = 'en'): Promise<LibretroCore> {
    const identity = await invoke<CoreIdentity>('load_core', { path: entry.path, langue });
    return new LibretroCore(entry.id, identity);
  }

  get info(): SystemInfo {
    return this.#info;
  }

  get identity(): CoreIdentity {
    return this.#identity;
  }

  /** Vrai si le cœur a demandé de lui-même l'arrêt de la partie. */
  get hasShutDown(): boolean {
    return this.#shutdown;
  }

  /**
   * Charge un contenu.
   *
   * Le cœur lit le fichier lui-même : `path` est donc obligatoire, et le
   * paramètre `rom` du contrat est ignoré. C'est une contrainte de libretro,
   * dont beaucoup de cœurs exigent un chemin sur disque pour deviner le format
   * ou trouver les fichiers voisins.
   */
  async load(_rom: Uint8Array, path?: string): Promise<void> {
    if (!path) {
      throw new Error('un cœur libretro charge depuis un chemin de fichier');
    }

    const av = await invoke<AvInfo>('load_content', { path });
    this.#av = av;
    this.#contentPath = path;
    this.#shutdown = false;
    this.#lastVideo = new Uint8ClampedArray(0);
    this.#lastWidth = 0;
    this.#lastHeight = 0;

    this.#info = {
      ...this.#info,
      maxWidth: av.maxWidth,
      maxHeight: av.maxHeight,
      aspectRatio: av.aspectRatio,
      fps: av.fps,
      sampleRate: av.sampleRate,
    };
  }

  get avInfo(): AvInfo | null {
    return this.#av;
  }

  async reset(): Promise<void> {
    await invoke('reset');
  }

  async runFrame(
    input: InputState,
    trames = 1,
    image = true,
    manches: StickState = [],
    capteurs: SensorState = [],
    autres: readonly AutreManette[] = [],
  ): Promise<Frame> {
    // La manette libretro compte seize boutons ; l'interface envoie un tableau
    // plat de booléens, converti ici en pressions 0 ou 1.
    const buttons = Array.from({ length: 16 }, (_, index) => (input[index] ? 1 : 0));

    // Les manches arrivent de -1 à 1 ; libretro les veut en entiers de seize
    // bits. Bornés avant conversion : une manette mal calibrée rend parfois
    // 1,02, et le tour du compteur enverrait « à fond à gauche » là où le
    // joueur poussait à fond à droite.
    const axes = Array.from({ length: 4 }, (_, index) =>
      Math.round(Math.max(-1, Math.min(1, manches[index] ?? 0)) * 32_767),
    );

    // Les capteurs voyagent en nombres à virgule : une accélération se lit en
    // fractions de g, et l'arrondir à l'entier rendrait toute inclinaison nulle.
    const sensors = Array.from({ length: 6 }, (_, index) => {
      const valeur = capteurs[index] ?? 0;
      return Number.isFinite(valeur) ? valeur : 0;
    });

    // Les autres joueurs, dans l'ordre des ports. Le tableau est vide tant
    // qu'une seule manette est branchée, et ne coûte alors rien.
    const others = portsSuivants(autres);

    const raw = await invoke<ArrayBuffer>('run_frame', {
      input: buttons,
      axes,
      sensors,
      others,
      frames: trames,
      video: image,
    });
    return this.#decode(raw);
  }

  /**
   * Décode une trame et reporte la précédente quand le cœur n'en produit pas
   * de neuve : le contrat `Frame` veut toujours une image, alors que libretro
   * autorise le cœur à dire « rien n'a changé ».
   */
  #decode(raw: ArrayBuffer): Frame {
    const decoded = decodeFrame(raw);

    if (decoded.video) {
      this.#lastVideo = decoded.video;
      this.#lastWidth = decoded.width;
      this.#lastHeight = decoded.height;
    }
    if (decoded.shutdown) {
      this.#shutdown = true;
    }

    return {
      video: this.#lastVideo,
      width: this.#lastWidth,
      height: this.#lastHeight,
      audio: decoded.audio,
    };
  }

  async saveState(): Promise<Uint8Array> {
    const raw = await invoke<ArrayBuffer>('save_state');
    return new Uint8Array(raw);
  }

  async loadState(state: Uint8Array): Promise<void> {
    // En base64, et non en tableau de nombres. Un état de GameCube pèse
    // quatre-vingt-dix mégaoctets : `Array.from` en faisait quatre-vingt-dix
    // millions de nombres JavaScript, que le pont sérialisait ensuite en une
    // chaîne JSON de deux cent cinquante mégaoctets. La fenêtre s'arrêtait
    // plusieurs secondes — le temps que l'autre bout relise entier par entier.
    await invoke('load_state', { state: encodeBase64(state) });
  }

  /** Décharge le cœur et libère sa bibliothèque. */
  async close(): Promise<void> {
    await invoke('unload');
    this.#contentPath = null;
    this.#av = null;
  }

  get contentPath(): string | null {
    return this.#contentPath;
  }
}
