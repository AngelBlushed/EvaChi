/**
 * Dispositions de commandes.
 *
 * Un cœur reçoit un tableau plat de seize boutons ; c'est à chaque système de
 * dire ce qu'ils signifient. Le CHIP-8 y voit un clavier hexadécimal, un cœur
 * libretro une manette. Ce fichier décrit les deux et leur correspondance
 * clavier.
 *
 * Les liaisons se font par **position physique** (`KeyboardEvent.code`) et non
 * par caractère : la disposition tombe donc au même endroit sur un clavier
 * AZERTY et sur un QWERTY, sans réglage.
 */

export interface ButtonLayout {
  readonly id: string;
  /** Position physique du clavier vers l'index du bouton. */
  readonly bindings: ReadonlyMap<string, number>;
  /**
   * Index de bouton de manette vers index du cœur.
   *
   * Les clés suivent la disposition « standard » du W3C, celle que les
   * navigateurs présentent pour une manette reconnue : 0 est le bouton du bas,
   * 12 à 15 la croix directionnelle.
   */
  readonly gamepad: ReadonlyMap<number, number>;
  /** Étiquette de chaque bouton, indexée comme le cœur les numérote. */
  readonly labels: readonly string[];
  /** Ordre d'affichage sur la grille, quatre par ligne. */
  readonly display: readonly number[];
}

/** Index des directions dans la disposition standard d'une manette. */
export const PAD_UP = 12;
export const PAD_DOWN = 13;
export const PAD_LEFT = 14;
export const PAD_RIGHT = 15;

/**
 * Les clics de manche, dans cette même disposition.
 *
 * Ils portent l'avance rapide : aucun geste de jeu ne les demande tous les
 * deux à la fois, et un pouce ne les enfonce pas par mégarde.
 */
export const PAD_L3 = 10;
export const PAD_R3 = 11;

/** L'allure de l'avance rapide, en multiple de la vitesse de la console. */
export const AVANCE_RAPIDE = 3;

/**
 * La vitesse à appliquer, avance rapide comprise.
 *
 * L'avance rapide vise une allure absolue plutôt que de multiplier la jauge :
 * elle sert à passer un dialogue ou un couloir, et on veut la même allure qu'on
 * ait ralenti le jeu ou non. Elle ne ralentit jamais — une jauge déjà poussée
 * plus haut reste la plus rapide des deux.
 */
export function vitesseAvance(tempo: number, tenue: boolean): number {
  return tenue ? Math.max(tempo, AVANCE_RAPIDE) : tempo;
}

/**
 * En deçà, un manche analogique au repos est considéré comme centré.
 *
 * Les manches ne reviennent jamais exactement à zéro : sans ce seuil, une
 * manette posée sur la table enverrait des directions en continu.
 */
export const STICK_DEADZONE = 0.5;

/** Étiquettes de repli quand le navigateur ne publie pas la disposition réelle. */
export const FALLBACK_KEY_LABELS: Record<string, string> = {
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R',
  KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyF: 'F',
  KeyZ: 'Z', KeyX: 'X', KeyC: 'C', KeyV: 'V',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Enter: '⏎', ShiftRight: '⇧',
};

/**
 * Clavier hexadécimal du COSMAC VIP. Les seize touches formaient un pavé 4×4 ;
 * la grille moderne se pose au même endroit sur le clavier.
 *
 * ```
 * 1 2 3 4        1 2 3 C
 * A Z E R   →    4 5 6 D
 * Q S D F        7 8 9 E
 * W X C V        A 0 B F
 * ```
 */
export const HEX_KEYPAD: ButtonLayout = {
  id: 'hex',
  bindings: new Map([
    ['Digit1', 0x1], ['Digit2', 0x2], ['Digit3', 0x3], ['Digit4', 0xc],
    ['KeyQ', 0x4], ['KeyW', 0x5], ['KeyE', 0x6], ['KeyR', 0xd],
    ['KeyA', 0x7], ['KeyS', 0x8], ['KeyD', 0x9], ['KeyF', 0xe],
    ['KeyZ', 0xa], ['KeyX', 0x0], ['KeyC', 0xb], ['KeyV', 0xf],
  ]),
  // Le pavé hexadécimal n'a pas de correspondance naturelle sur une manette :
  // on reprend la convention des jeux CHIP-8, qui utilisent 2/8/4/6 comme croix
  // directionnelle et 5 comme bouton d'action.
  gamepad: new Map([
    [PAD_UP, 0x2], [PAD_DOWN, 0x8], [PAD_LEFT, 0x4], [PAD_RIGHT, 0x6],
    [0, 0x5], [1, 0x1], [2, 0x3], [3, 0x7],
    [8, 0x0], [9, 0xf],
  ]),
  labels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'],
  display: [0x1, 0x2, 0x3, 0xc, 0x4, 0x5, 0x6, 0xd, 0x7, 0x8, 0x9, 0xe, 0xa, 0x0, 0xb, 0xf],
};

/**
 * Manette libretro standard. L'ordre des index est celui de l'ABI, pas celui
 * d'une console en particulier : chaque cœur y projette la sienne.
 *
 * Les liaisons reprennent les réglages par défaut de RetroArch, que la plupart
 * des joueurs connaissent déjà.
 */
export const JOYPAD: ButtonLayout = {
  id: 'joypad',
  bindings: new Map([
    ['ArrowUp', 4], ['ArrowDown', 5], ['ArrowLeft', 6], ['ArrowRight', 7],
    ['KeyX', 0], ['KeyZ', 8], ['KeyS', 1], ['KeyA', 9],
    ['KeyQ', 10], ['KeyW', 11],
    ['Enter', 3], ['ShiftRight', 2],
  ]),
  // La disposition standard du W3C et celle de libretro décrivent la même
  // manette dans un ordre différent : cette table est la traduction.
  gamepad: new Map([
    [0, 0], [1, 8], [2, 1], [3, 9],
    [4, 10], [5, 11], [6, 12], [7, 13],
    [8, 2], [9, 3], [10, 14], [11, 15],
    [PAD_UP, 4], [PAD_DOWN, 5], [PAD_LEFT, 6], [PAD_RIGHT, 7],
  ]),
  labels: [
    'B', 'Y', 'SEL', 'STA', '↑', '↓', '←', '→',
    'A', 'X', 'L', 'R', 'L2', 'R2', 'L3', 'R3',
  ],
  display: [4, 5, 6, 7, 8, 0, 9, 1, 10, 11, 12, 13, 2, 3, 14, 15],
};

/** Nombre de boutons qu'un cœur reçoit, quelle que soit la disposition. */
export const BUTTON_COUNT = 16;

/** Ce qu'on a besoin de savoir d'une manette pour décider laquelle lire. */
interface PadSlot {
  readonly connected: boolean;
}

/**
 * L'emplacement de manette à lire, d'après ce que le navigateur présente.
 *
 * Garde celle qu'on suivait tant qu'elle répond, en adopte une autre sinon, et
 * rend `-1` quand il n'y en a aucune.
 *
 * S'en remettre au seul événement `gamepadconnected` ne suffit pas. Il ne part
 * qu'au premier appui **et** fenêtre au premier plan : une manette branchée
 * avant le lancement, ou dont on a pressé un bouton pendant que la fenêtre
 * n'avait pas le dessus, restait invisible pour toujours — et aucun appui
 * ultérieur n'y changeait rien, puisque plus personne ne regardait. Il faut
 * aller voir, pas attendre qu'on nous dise.
 */
export function choosePad(pads: readonly (PadSlot | null | undefined)[], current: number): number {
  if (current >= 0 && pads[current]?.connected) return current;
  return pads.findIndex((pad) => pad?.connected);
}
