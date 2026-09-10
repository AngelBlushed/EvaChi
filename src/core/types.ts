/**
 * Contrat commun à tous les cœurs d'émulation du projet.
 *
 * L'idée directrice : le frontend ne sait rien du système émulé. Il pousse des
 * entrées, réclame des trames, et affiche/joue ce qui sort. Ajouter la NES ou
 * la Game Boy revient à fournir une nouvelle implémentation de `EmulatorCore`,
 * sans toucher au shell.
 */

/** Description statique d'un système émulé, connue avant tout chargement de ROM. */
export interface SystemInfo {
  /** Identifiant machine, ex. "chip8", "nes", "gb". */
  readonly id: string;
  /** Nom affiché, ex. "CHIP-8". */
  readonly name: string;
  /**
   * Dimensions maximales de la trame, qui bornent l'allocation des tampons.
   * La taille réelle est portée par chaque [`Frame`] : elle peut changer en
   * cours de partie, ce que font couramment les cœurs libretro.
   */
  readonly maxWidth: number;
  readonly maxHeight: number;
  /**
   * Rapport largeur sur hauteur voulu à l'affichage.
   *
   * Distinct du rapport des pixels : la NES sort du 256×240 mais s'affiche en
   * 4/3, ses pixels n'étant pas carrés. Un cœur qui n'a pas d'avis met 0.
   */
  readonly aspectRatio: number;
  /** Cadence vidéo nominale, en trames par seconde. */
  readonly fps: number;
  /** Fréquence d'échantillonnage audio produite par le cœur, en Hz. */
  readonly sampleRate: number;
  /** Extensions de fichier acceptées, point inclus, ex. [".ch8"]. */
  readonly extensions: readonly string[];
}

/**
 * Trame vidéo en RGBA8888, prête pour un `ImageData` ou une texture GPU.
 * Longueur attendue : screenWidth * screenHeight * 4.
 */
export type Framebuffer = Uint8ClampedArray;

/**
 * Échantillons audio **toujours stéréo entrelacés** — gauche, droite, gauche…
 * — dans l'intervalle [-1, 1].
 *
 * Le format est imposé même aux systèmes monophoniques, qui recopient leur voie
 * sur les deux canaux : sans cela, chaque cœur imposerait sa disposition et la
 * sortie audio devrait toutes les connaître.
 */
export type AudioBuffer = Float32Array;

/**
 * État des entrées pour une trame. Les cœurs exposent un espace de boutons
 * plat : à chaque système de définir la signification des index dans
 * `SystemInfo`. `true` = enfoncé.
 */
export type InputState = readonly boolean[];

/** Résultat d'une trame émulée. */
export interface Frame {
  readonly video: Framebuffer;
  /** Dimensions réelles de `video`, qui peuvent varier d'une trame à l'autre. */
  readonly width: number;
  readonly height: number;
  readonly audio: AudioBuffer;
}

export interface EmulatorCore {
  readonly info: SystemInfo;

  /**
   * Charge une ROM et réinitialise la machine.
   * @throws si la ROM est invalide ou trop volumineuse pour le système.
   */
  load(rom: Uint8Array): void;

  /** Remet la machine dans son état de démarrage, ROM conservée. */
  reset(): void;

  /**
   * Émule exactement une trame vidéo et retourne ce qu'il faut afficher et
   * jouer. Les tampons retournés appartiennent au cœur et sont réutilisés à la
   * trame suivante : à l'appelant de les copier s'il veut les conserver.
   */
  runFrame(input: InputState): Frame;

  /** Sérialise l'état complet de la machine. */
  saveState(): Uint8Array;

  /**
   * Restaure un état produit par `saveState` sur la même version du cœur.
   * @throws si l'état est corrompu ou destiné à un autre système/version.
   */
  loadState(state: Uint8Array): void;
}

/**
 * Même contrat, mais asynchrone.
 *
 * Un cœur qui vit dans le processus courant répond immédiatement ; un cœur
 * libretro tourne derrière une frontière de processus et répond par messages.
 * L'interface cible cette forme-ci, et [`toAsync`] y ramène les cœurs
 * synchrones sans les alourdir.
 */
export interface AsyncEmulatorCore {
  readonly info: SystemInfo;
  load(rom: Uint8Array, path?: string): Promise<void>;
  reset(): Promise<void>;
  runFrame(input: InputState): Promise<Frame>;
  saveState(): Promise<Uint8Array>;
  loadState(state: Uint8Array): Promise<void>;
  /**
   * Rend ce que le cœur tient hors de la page.
   *
   * Optionnel : un cœur écrit ici ne détient que de la mémoire, que le
   * ramasse-miettes reprendra. Un cœur libretro, lui, garde une bibliothèque
   * chargée, des fils d'exécution et parfois un contexte graphique — autant de
   * choses qu'il faut lui demander de relâcher.
   */
  close?(): Promise<void>;
}

/** Présente un cœur synchrone sous la forme asynchrone attendue par l'interface. */
export function toAsync(core: EmulatorCore): AsyncEmulatorCore {
  return {
    info: core.info,
    async load(rom) {
      core.load(rom);
    },
    async reset() {
      core.reset();
    },
    async runFrame(input) {
      return core.runFrame(input);
    },
    async saveState() {
      return core.saveState();
    },
    async loadState(state) {
      core.loadState(state);
    },
  };
}
