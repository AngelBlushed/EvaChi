/**
 * La géométrie de l'archipel.
 *
 * Une mer sombre, une île par console, et sur chaque île les jeux semés en
 * fleur de tournesol. La caméra survole le tout et se pose sur celui qu'on
 * regarde ; le décor, lui, ne bouge jamais.
 *
 * C'est le mouvement inverse du carrousel. Là-bas, un présentoir tourne devant
 * un spectateur immobile ; ici, un décor immobile est survolé par un spectateur
 * qui se déplace. La conséquence est celle qu'on cherche : la place d'un jeu
 * est absolue et ne change jamais, si bien qu'on finit par savoir qu'un tel est
 * au nord-est de l'île Mega Drive. Une grille ne permet pas cela — la place
 * d'une tuile y dépend de la largeur de la fenêtre.
 *
 * Le semis est celui de la fleur de tournesol : l'angle d'or entre deux voisins,
 * et un rayon en racine du rang. C'est la seule disposition connue qui remplisse
 * un disque régulièrement sans laisser de rayon ni de couronne — un semis en
 * spirale d'angle rationnel donnerait des branches, et l'œil ne verrait plus
 * que les branches.
 */

/**
 * L'angle d'or, en radians.
 *
 * Environ 137,5 degrés. Sa vertu tient à ce qu'il est le plus irrationnel des
 * nombres : aucun multiple ne retombe jamais sur un tour entier, et les points
 * ne s'alignent donc jamais.
 */
export const ANGLE_OR = Math.PI * (3 - Math.sqrt(5));

/** Un point du monde, en unités. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** L'écart entre deux îles voisines, en unités. */
export const LARGE = 420;

/** L'écart entre deux jeux d'une même île. */
export const SERRE = 54;

/**
 * Où se pose une île.
 *
 * Même semis que les jeux, à une autre échelle : les consoles sont à
 * l'archipel ce que les jeux sont à l'île, et user de deux dispositions
 * différentes ferait deux décors superposés au lieu d'un seul.
 */
export function ile(rang: number): Point {
  if (!Number.isInteger(rang) || rang < 0) return { x: 0, y: 0 };
  const rayon = LARGE * Math.sqrt(rang);
  const angle = rang * ANGLE_OR;
  return { x: rayon * Math.cos(angle), y: rayon * Math.sin(angle) };
}

/** Où se pose un jeu, relativement au centre de son île. */
export function graine(rang: number): Point {
  if (!Number.isInteger(rang) || rang < 0) return { x: 0, y: 0 };
  const rayon = SERRE * Math.sqrt(rang);
  const angle = rang * ANGLE_OR;
  return { x: rayon * Math.cos(angle), y: rayon * Math.sin(angle) };
}

/** Le rayon qu'occupe une île portant ce nombre de jeux. */
export function etendue(combien: number): number {
  if (!Number.isFinite(combien) || combien <= 0) return SERRE;
  return SERRE * Math.sqrt(Math.max(1, combien - 1)) + SERRE;
}

/** Où se pose un jeu dans le monde entier. */
export function place(rangIle: number, rangJeu: number): Point {
  const centre = ile(rangIle);
  const autour = graine(rangJeu);
  return { x: centre.x + autour.x, y: centre.y + autour.y };
}

/**
 * L'altitude : plus on regarde une île de haut, plus on en voit.
 *
 * Deux hauteurs seulement, et non un zoom continu : on survole une île pour y
 * choisir un jeu, on prend de la hauteur pour en changer. Un zoom libre
 * demanderait une commande de plus, et l'on ne saurait jamais à quelle échelle
 * on est.
 */
export const PRES = 1;
export const LOIN = 0.34;

/**
 * Ce qu'il faut translater pour amener un point au milieu de l'écran.
 *
 * L'échelle s'applique avant la translation — c'est l'ordre du CSS, `scale()`
 * puis `translate()` se lisant de droite à gauche — et la translation se compte
 * donc en unités de monde, pas en pixels.
 */
export function camera(vise: Point): Point {
  return { x: -vise.x, y: -vise.y };
}

/**
 * Le pas d'une avancée douce vers une cible.
 *
 * Un lissage exponentiel, et non une transition : la cible change pendant que
 * l'on avance — on pousse la direction trois fois de suite — et une transition
 * repartirait de zéro à chaque fois, ce qui donne une caméra qui hoquette.
 *
 * Le pas dépend du temps écoulé et non du nombre de trames : sur une machine
 * qui en saute, la caméra doit avancer autant, pas moins.
 *
 * @param ms temps écoulé depuis la trame précédente, en millisecondes.
 * @param constante temps au bout duquel il reste un tiers du chemin.
 * @param arret en deçà, on est arrivé — un dixième d'unité pour une position,
 *   bien moins pour une échelle, qui se compte en fractions.
 */
export function avancer(
  depuis: number,
  vers: number,
  ms: number,
  constante = 110,
  arret = 0.1,
): number {
  if (!Number.isFinite(ms) || ms <= 0) return depuis;
  const part = 1 - Math.exp(-ms / Math.max(1, constante));
  const suivant = depuis + (vers - depuis) * part;
  // Sans cet arrêt net, la caméra poursuit indéfiniment une cible qu'elle
  // n'atteint jamais, et le navigateur repeint la scène pour rien.
  return Math.abs(vers - suivant) < arret ? vers : suivant;
}

/**
 * Au-delà de cette distance, le voyage vaut qu'on prenne de la hauteur.
 *
 * Passer d'un jeu au suivant est un pas de côté ; passer d'une île à l'autre
 * est un vol, et l'on ne vole pas le nez sur la carte. Le seuil est entre les
 * deux : plus large qu'une île, plus étroit que l'écart entre deux.
 */
export const VOYAGE = 260;

/**
 * Les îles à dessiner : celle qu'on regarde, et ses voisines.
 *
 * Quarante îles et cinq cents jeux ne tiennent pas dans une page qu'on
 * redessine ; on n'en construit donc qu'une poignée. Les voisines comptent
 * parce qu'on les voit en prenant de la hauteur — une mer vide autour de son
 * île ferait un archipel d'une seule.
 */
export const VOISINES = 6;

export function autour(choisie: number, combien: number): number[] {
  if (combien <= 0) return [];
  const rangs: number[] = [];
  for (let ecart = -VOISINES; ecart <= VOISINES; ecart += 1) {
    const rang = choisie + ecart;
    if (rang >= 0 && rang < combien) rangs.push(rang);
  }
  return rangs;
}
