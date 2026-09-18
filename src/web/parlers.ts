/**
 * Les langues qu'on peut demander aux jeux.
 *
 * À ne pas confondre avec celle de l'interface. Beaucoup de cartouches et de
 * disques européens portent leur texte en cinq ou six langues et choisissent
 * laquelle afficher d'après un réglage de la console — la langue du menu
 * système, celle du BIOS. L'émulateur prend l'anglais par défaut, d'où des jeux
 * français qui démarrent en anglais sans qu'on comprenne pourquoi.
 *
 * La liste est courte à dessein : seulement les langues que les jeux parlent
 * réellement. Les cinquante de l'interface n'auraient ici aucun sens — aucun
 * jeu n'a jamais été traduit en tamoul, et proposer de le demander serait
 * promettre quelque chose qui n'arrivera pas.
 *
 * Les codes sont les mêmes que côté natif, où une table jumelle les convertit
 * en valeurs `retro_language` et en options de cœur.
 */

/** Une langue qu'on peut demander aux jeux. */
export interface Parler {
  /** Étiquette BCP 47, celle que la fenêtre retient et que le natif attend. */
  readonly code: string;
  /** Le nom de la langue, écrit dans cette langue. */
  readonly nom: string;
}

/**
 * Le choix qui suit l'interface.
 *
 * Ce n'est pas un code de langue mais une règle, d'où un mot à part : quelqu'un
 * qui met EvaChi en espagnol veut ses jeux en espagnol, et n'a pas à le dire
 * deux fois.
 */
export const COMME_INTERFACE = 'auto';

/**
 * Les langues proposées, rangées par leur nom propre.
 *
 * Comme celles de l'interface : quelqu'un qui ne lit pas la langue en cours
 * cherche le nom de la sienne, et le cherche là où l'alphabet le met.
 */
export const PARLERS: readonly Parler[] = [
  { code: 'de', nom: 'Deutsch' },
  { code: 'en', nom: 'English' },
  { code: 'es', nom: 'Español' },
  { code: 'fr', nom: 'Français' },
  { code: 'it', nom: 'Italiano' },
  { code: 'nl', nom: 'Nederlands' },
  { code: 'pt', nom: 'Português' },
  { code: 'ru', nom: 'Русский' },
  { code: 'ko', nom: '한국어' },
  { code: 'ja', nom: '日本語' },
  { code: 'zh', nom: '简体中文' },
];

/** La langue portant ce code, ou rien. */
export function parlerParCode(code: string | null | undefined): Parler | undefined {
  return PARLERS.find((parler) => parler.code === code);
}

/**
 * La langue à demander aux jeux, d'après le choix et celle de l'interface.
 *
 * Un choix inconnu — une version plus ancienne, un réglage recopié d'ailleurs —
 * retombe sur l'interface plutôt que de partir en erreur : le pire qui puisse
 * arriver à ce réglage-là est qu'il donne une langue inattendue, jamais qu'il
 * empêche un jeu de se lancer.
 */
export function langueDemandee(
  choisi: string | null | undefined,
  interfaceCode: string,
): string {
  if (!choisi || choisi === COMME_INTERFACE) return interfaceCode;
  return parlerParCode(choisi) ? choisi : interfaceCode;
}
