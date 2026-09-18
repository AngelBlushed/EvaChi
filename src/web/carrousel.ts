/**
 * La géométrie du carrousel.
 *
 * Les jaquettes sont posées de front, sur un arc : celle qu'on regarde est
 * droite et devant, ses voisines s'écartent de part et d'autre en se tournant
 * vers elle, en reculant et en pâlissant. C'est le mouvement d'un présentoir
 * qu'on fait tourner.
 *
 * Toutes les distances sont exprimées en **largeurs de jaquette**, et non en
 * pixels : la taille d'une jaquette change avec la fenêtre, et une géométrie
 * écrite en pixels se déferait au premier agrandissement. La feuille de style
 * n'a donc qu'une taille à connaître, et ce module n'en connaît aucune.
 *
 * Il ne touche à rien d'affiché — il dit où va chaque jaquette — et se vérifie
 * donc seul, ce qui compte : un carrousel dont l'ordre à l'écran ne suit pas
 * l'ordre de la liste se sent tout de suite et s'explique mal.
 */

/** Combien de jaquettes se voient de part et d'autre de celle qu'on regarde. */
export const RAYON = 6;

/**
 * Une de plus, posée mais transparente.
 *
 * C'est par elle qu'une jaquette entre dans le carrousel. Sans ce rang de
 * réserve, une jaquette apparaîtrait d'un coup à sa place au lieu d'y glisser :
 * elle n'aurait aucune position d'où venir.
 */
export const MARGE = RAYON + 1;

/** Où se tient une jaquette, et de quoi elle a l'air. */
export interface Place {
  /** Décalage horizontal depuis le centre, en largeurs de jaquette. */
  readonly x: number;
  /** Éloignement, en largeurs de jaquette. Positif : vers le spectateur. */
  readonly z: number;
  /** Rotation autour de l'axe vertical, en degrés. */
  readonly rotation: number;
  /** Facteur de taille, 1 pour celle qu'on regarde. */
  readonly echelle: number;
  readonly opacite: number;
  /** Ordre d'empilement : le plus grand est devant. */
  readonly plan: number;
}

/**
 * Ce qui sépare la jaquette regardée de sa première voisine.
 *
 * Plus large que l'écart entre deux voisines : c'est ce dégagement qui la
 * détache du reste. Sans lui, la sélection se confond avec la file et l'on ne
 * sait plus laquelle on lancerait.
 */
const SAILLIE = 0.62;

/** Ce qui sépare deux voisines, en largeurs de jaquette. */
const ECART = 0.3;

/**
 * L'angle d'une jaquette de côté, en degrés.
 *
 * Assez pour qu'on la voie tournée vers le centre, pas assez pour qu'elle
 * disparaisse : à quatre-vingt-dix degrés une jaquette est vue par la tranche,
 * c'est-à-dire plus vue du tout.
 */
const ANGLE = 54;

/**
 * Où poser une jaquette, d'après sa distance à celle qu'on regarde.
 *
 * @param ecart rang de la jaquette moins rang de la sélection : négatif à
 *   gauche, positif à droite.
 * @returns `null` quand la jaquette est trop loin pour être posée.
 */
export function place(ecart: number): Place | null {
  const loin = Math.abs(ecart);
  if (loin > MARGE) return null;

  if (loin === 0) {
    // Franchement devant : c'est ce détachement qui dit ce qu'on lancerait.
    return { x: 0, z: 0.55, rotation: 0, echelle: 1, opacite: 1, plan: MARGE + 1 };
  }

  const cote = Math.sign(ecart);
  return {
    x: cote * (SAILLIE + (loin - 1) * ECART),
    // Une jaquette de droite tourne sa tranche droite vers le fond, donc sa
    // face vers le centre. À gauche, l'inverse.
    rotation: cote * ANGLE,
    z: -0.07 * loin,
    echelle: Math.max(0.58, 0.86 - (loin - 1) * 0.04),
    // Le rang de réserve est transparent : il existe pour qu'on en vienne.
    opacite: loin > RAYON ? 0 : Math.max(0.12, 0.92 - (loin - 1) * 0.13),
    plan: MARGE - loin,
  };
}

/**
 * Les rangs à poser autour d'une sélection.
 *
 * Six cents jaquettes ne se replacent pas à chaque pas : on ne touche qu'à
 * celles qui se voient, et à celle de réserve de chaque côté. Le reste n'est
 * pas dessiné du tout — ce qui évite aussi de demander six cents images au
 * serveur de jaquettes pour en montrer treize.
 */
export function fenetre(selection: number, combien: number): number[] {
  if (combien <= 0) return [];
  const centre = Math.min(Math.max(selection, 0), combien - 1);
  const rangs: number[] = [];
  for (
    let rang = Math.max(0, centre - MARGE);
    rang <= Math.min(combien - 1, centre + MARGE);
    rang += 1
  ) {
    rangs.push(rang);
  }
  return rangs;
}
