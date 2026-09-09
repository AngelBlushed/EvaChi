import { invoke } from '@tauri-apps/api/core';

import type { AsyncEmulatorCore, Frame, Framebuffer, InputState, SystemInfo } from '../core/types.ts';

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
  static async open(entry: CoreEntry): Promise<LibretroCore> {
    const identity = await invoke<CoreIdentity>('load_core', { path: entry.path });
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

  async runFrame(input: InputState): Promise<Frame> {
    // La manette libretro compte seize boutons ; l'interface envoie un tableau
    // plat de booléens, converti ici en pressions 0 ou 1.
    const buttons = Array.from({ length: 16 }, (_, index) => (input[index] ? 1 : 0));

    const raw = await invoke<ArrayBuffer>('run_frame', { input: buttons });
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
    await invoke('load_state', { state: Array.from(state) });
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
