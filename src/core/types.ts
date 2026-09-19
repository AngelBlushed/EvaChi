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

/**
 * Position des manches analogiques : X puis Y du gauche, X puis Y du droit.
 *
 * De -1 à 1, zéro au repos, comme le rend le navigateur. Les machines qui n'ont
 * pas de manche l'ignorent ; celles qui en ont un ne savent pas s'en passer —
 * une Nintendo 64 à qui l'on n'envoie que la croix donne un personnage qui ne
 * bouge pas, sans qu'aucun message ne le dise.
 */
export type StickState = readonly number[];

/**
 * Ce que la machine émulée croit sentir : trois axes d'accélération en g, puis
 * trois de rotation en radians par seconde.
 *
 * Quelques cartouches ne se jouent pas qu'aux boutons — on penche la console,
 * on la secoue — et le cœur réclame alors ces six nombres. Sans eux le jeu ne
 * bouge pas, et rien ne dit pourquoi.
 */
export type SensorState = readonly number[];

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
  /**
   * Émule `trames` trames et rend la dernière image, avec tout le son produit.
   *
   * Plus d'une seule sert l'avance rapide : à neuf cents pour cent, on en
   * exécute neuf pour n'en regarder qu'une, et un cœur qui vit derrière une
   * frontière de processus paierait l'aller-retour neuf fois.
   *
   * `image` dit si l'appelant compte peindre celle-ci. Quand il ne le compte
   * pas, un cœur distant s'épargne de la faire traverser.
   */
  runFrame(
    input: InputState,
    trames?: number,
    image?: boolean,
    manches?: StickState,
    capteurs?: SensorState,
  ): Promise<Frame>;
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
    async runFrame(input, trames = 1) {
      let derniere = core.runFrame(input);
      if (trames <= 1) return derniere;

      // Le son de toutes les trames, et non celui de la dernière : sans quoi
      // l'accéléré ne ferait plus entendre qu'un neuvième du jeu. Chaque
      // morceau est recopié — le contrat dit que les tampons appartiennent au
      // cœur et sont réutilisés à la trame suivante.
      const morceaux: Float32Array[] = [Float32Array.from(derniere.audio)];
      for (let reste = trames - 1; reste > 0; reste -= 1) {
        derniere = core.runFrame(input);
        morceaux.push(Float32Array.from(derniere.audio));
      }

      const total = morceaux.reduce((somme, part) => somme + part.length, 0);
      const audio = new Float32Array(total);
      let ou = 0;
      for (const part of morceaux) {
        audio.set(part, ou);
        ou += part.length;
      }
      return { ...derniere, audio };
    },
    async saveState() {
      return core.saveState();
    },
    async loadState(state) {
      core.loadState(state);
    },
  };
}
