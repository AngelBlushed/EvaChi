/**
 * Divergences de comportement entre interpréteurs CHIP-8.
 *
 * Le CHIP-8 n'a jamais eu de spécification : le COSMAC VIP de 1977 est la
 * référence de fait, mais le SUPER-CHIP des calculatrices HP a changé plusieurs
 * instructions en silence. Les ROMs sont écrites pour l'un ou pour l'autre, et
 * une ROM SUPER-CHIP tourne de travers sur un interpréteur fidèle au VIP. D'où
 * ces bascules : ce sont elles qui séparent un émulateur utilisable d'un jouet
 * qui ne fait tourner que la moitié des jeux.
 */
export interface Quirks {
  /** 8XY1/8XY2/8XY3 (OR/AND/XOR) remettent VF à zéro. VIP : oui. */
  vfReset: boolean;
  /** FX55/FX65 avancent I de X+1 après le transfert. VIP : oui. */
  memoryIncrement: boolean;
  /** DXYN attend le retour vertical, plafonnant l'affichage à un sprite par trame. VIP : oui. */
  displayWait: boolean;
  /** Les sprites sont tronqués au bord de l'écran au lieu de réapparaître en face. VIP : oui. */
  clipping: boolean;
  /** 8XY6/8XYE décalent VX sur place au lieu de décaler VY vers VX. SUPER-CHIP : oui. */
  shifting: boolean;
  /** BNNN devient BXNN : saut vers XNN + VX au lieu de NNN + V0. SUPER-CHIP : oui. */
  jumping: boolean;
}

/** Interpréteur d'origine du COSMAC VIP (1977). */
export const COSMAC_VIP: Quirks = {
  vfReset: true,
  memoryIncrement: true,
  displayWait: true,
  clipping: true,
  shifting: false,
  jumping: false,
};

/** SUPER-CHIP 1.1 sur HP-48 : le dialecte de la plupart des ROMs tardives. */
export const SUPER_CHIP: Quirks = {
  vfReset: false,
  memoryIncrement: false,
  displayWait: false,
  clipping: true,
  shifting: true,
  jumping: true,
};

/** XO-CHIP, l'extension moderne : sémantique VIP, sans l'attente vidéo. */
export const XO_CHIP: Quirks = {
  vfReset: false,
  memoryIncrement: true,
  displayWait: false,
  clipping: false,
  shifting: false,
  jumping: false,
};

export const QUIRK_PRESETS = {
  'cosmac-vip': COSMAC_VIP,
  'super-chip': SUPER_CHIP,
  'xo-chip': XO_CHIP,
} as const;

export type QuirkPreset = keyof typeof QUIRK_PRESETS;
