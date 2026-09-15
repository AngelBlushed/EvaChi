/**
 * Le parcours au clavier d'une fenêtre, conduit à la manette.
 *
 * Une manette n'a pas de touche de tabulation. Pour que tout soit atteignable
 * sans lâcher la manette, il faut donc savoir dire, d'un panneau quelconque,
 * quels éléments répondent et dans quel ordre — puis avancer de l'un à l'autre
 * sans jamais sortir ni rester coincé.
 *
 * Ce module ne touche à rien : il reçoit une liste et rend un indice. C'est ce
 * qui permet de l'éprouver sans fenêtre.
 */

/** Ce qui, dans une fenêtre, peut recevoir le focus et répondre à un appui. */
export const SELECTEUR_ACTIF = [
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Ce qu'on peut faire d'un élément une fois dessus. */
export type Geste = 'cliquer' | 'cocher' | 'glisser' | 'derouler';

/**
 * Ce qu'un appui doit faire sur cet élément.
 *
 * Cliquer une case à cocher marche, mais cliquer un curseur ou une liste
 * déroulante ne fait rien du tout : il faut les pousser à gauche ou à droite.
 * Sans cette distinction, un réglage sur trois reste inatteignable à la
 * manette sans qu'on comprenne pourquoi.
 */
export function gestePour(balise: string, type: string): Geste {
  const nom = balise.toLowerCase();
  if (nom === 'select') return 'derouler';
  if (nom === 'input') {
    if (type === 'range') return 'glisser';
    if (type === 'checkbox' || type === 'radio') return 'cocher';
    return 'cliquer';
  }
  return 'cliquer';
}

/**
 * L'indice suivant dans une liste qui fait le tour.
 *
 * Ici on boucle, contrairement à la bibliothèque : une fenêtre de réglages
 * compte une dizaine d'entrées, et descendre encore une fois pour revenir au
 * début est plus rapide que de remonter toute la liste. Au-delà d'une dizaine,
 * personne ne tient le bouton assez longtemps pour s'y perdre.
 */
export function tourne(index: number, total: number, pas: number): number {
  if (total <= 0) return 0;
  return (((index + pas) % total) + total) % total;
}

/**
 * Le premier élément qui mérite le focus à l'ouverture.
 *
 * On évite les boutons de fermeture : ouvrir une fenêtre pour se retrouver sur
 * « Fermer » invite à en sortir plutôt qu'à s'en servir, et un appui
 * malencontreux la referme aussitôt.
 */
export function premierUtile(etiquettes: readonly string[]): number {
  const sortie = /^(fermer|annuler|ok|close|cancel)$/i;
  const trouve = etiquettes.findIndex((texte) => !sortie.test(texte.trim()));
  return trouve < 0 ? 0 : trouve;
}
