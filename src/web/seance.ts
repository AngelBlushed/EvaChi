/**
 * La séance : une salle obscure, un faisceau, et le jeu projeté au fond.
 *
 * Les autres présentations montrent beaucoup de jeux et laissent choisir. Celle
 * -ci n'en montre qu'un, en grand, et fait voir le reste comme ce qu'il est
 * dans une salle de projection : des vues en attente dans le panier, qui
 * tournent jusqu'à la fenêtre du projecteur. On ne parcourt pas une liste, on
 * fait défiler des diapositives.
 *
 * Deux choses vivent ici : la géométrie du panier, et la poussière dans le
 * faisceau. Les deux sont calculées à part de l'affichage — en fractions de la
 * vue, jamais en pixels — et se vérifient donc seules.
 */

const TOUR = Math.PI * 2;

/** Vues montrées de chaque côté de celle qui est dans la fenêtre. */
export const AILE = 9;

/** Degrés d'une vue à la suivante, sur le panier. */
export const PAS = 7.4;

/** Rayon du panier, en largeurs de vue. */
export const RAYON = 7.2;

/**
 * Écrasement du panier.
 *
 * Un panier de projecteur est un disque posé à plat, qu'on regarde de biais :
 * son cercle devient une ellipse très écrasée. Sans cet aplatissement les vues
 * décriraient un grand arc vertical, et l'on croirait à une roue.
 */
export const APLATI = 0.3;

export interface Vue {
  readonly rang: number;
  /** Position du centre, en largeurs de vue, depuis le milieu du panier. */
  readonly x: number;
  /** Vers le bas, en largeurs de vue. */
  readonly y: number;
  readonly echelle: number;
  readonly opacite: number;
  /** Ordre d'empilement : ce qui est devant passe devant. */
  readonly z: number;
  readonly dansLaFenetre: boolean;
}

/**
 * Les rangs que le panier montre, de part et d'autre de la fenêtre.
 *
 * Centrés sur la vue projetée, et non calés pour remplir le panier : au
 * premier jeu d'une console, un panier plein mettrait dix-huit lamelles d'un
 * seul côté, soit plus d'un tiers de tour — les dernières repasseraient
 * derrière les premières et le plateau se lirait à l'envers.
 */
export function panierVisible(choisi: number, total: number): number[] {
  if (total <= 0) return [];
  const premier = Math.max(0, choisi - AILE);
  const dernier = Math.min(total - 1, choisi + AILE);
  return Array.from({ length: dernier - premier + 1 }, (_, pas) => premier + pas);
}

/**
 * Où se trouve une vue du panier.
 *
 * `position` n'est pas forcément un rang entier : le panier tourne, et il
 * passe par tous les angles intermédiaires. Ce qui distingue la vue dans la
 * fenêtre du projecteur est donc affaire de degré, et non un cas à part.
 */
export function vue(rang: number, position: number): Vue {
  const ecart = rang - position;
  const radians = (ecart * PAS * Math.PI) / 180;
  const profondeur = Math.cos(radians);
  const dedans = Math.max(0, 1 - Math.abs(ecart));
  const fondue = Math.max(0.2, 0.85 - Math.abs(ecart) * 0.06);

  return {
    rang,
    x: RAYON * Math.sin(radians),
    y: RAYON * (1 - profondeur) * APLATI,
    // Ce qui s'éloigne rapetisse. La fenêtre du projecteur est au plus près :
    // c'est le seul endroit du panier où une vue se lit.
    echelle: (0.6 + 0.4 * profondeur) * (1 + 0.18 * dedans),
    opacite: fondue + (1 - fondue) * dedans,
    z: AILE + 2 * dedans - Math.abs(ecart),
    dansLaFenetre: ecart === 0,
  };
}

/** Le panier entier, prêt à être posé. */
export function panier(position: number, total: number): Vue[] {
  return panierVisible(Math.round(position), total).map((rang) => vue(rang, position));
}

// --- Le faisceau --------------------------------------------------------------

/** Le sommet du cône, en fractions de la vue : l'objectif, devant nous. */
export const OBJECTIF = { x: 0.5, y: 1.08 } as const;

/**
 * Le bas de l'écran, et sa demi-largeur, en fractions de la vue.
 *
 * La demi-largeur n'est qu'une valeur de repli : la fenêtre mesure l'écran et
 * la donne. Un faisceau plus large que l'image qu'il porte se voit tout de
 * suite — la lumière déborderait dans le vide.
 */
export const ECRAN = { x: 0.5, y: 0.56, demi: 0.2 } as const;

/** Grains de poussière tenus dans le faisceau. */
export const GRAINS = 80;

/** Le cône de lumière, du plus étroit au plus large. */
export function cone(demi: number = ECRAN.demi): { x: number; y: number }[] {
  return [
    { x: OBJECTIF.x - 0.012, y: OBJECTIF.y },
    { x: OBJECTIF.x + 0.012, y: OBJECTIF.y },
    { x: ECRAN.x + demi, y: ECRAN.y },
    { x: ECRAN.x - demi, y: ECRAN.y },
  ];
}

/**
 * Un nombre stable entre zéro et un, tiré d'un rang.
 *
 * Pas de hasard : la poussière doit être la même d'une trame à l'autre, et
 * d'un lancement à l'autre. Un vrai tirage ferait scintiller les grains au
 * lieu de les faire dériver.
 */
function tirage(graine: number): number {
  const v = Math.sin(graine * 127.1 + 311.7) * 43_758.545_3;
  return v - Math.floor(v);
}

export interface Grain {
  /** En fractions de la vue. */
  readonly x: number;
  readonly y: number;
  /** Rayon, en fractions de la hauteur de la vue. */
  readonly r: number;
  readonly a: number;
}

/**
 * Un grain de poussière, à l'instant donné.
 *
 * Il remonte le faisceau de l'objectif vers l'écran — la lumière l'entraîne —
 * et repart au début en arrivant. Près de l'objectif il est gros et proche de
 * nous ; près de l'écran il est petit et loin. C'est ce qui donne au cône sa
 * profondeur, alors qu'il est peint à plat.
 */
export function grain(rang: number, secondes: number, demiEcran: number = ECRAN.demi): Grain {
  const lenteur = 0.035 + tirage(rang) * 0.055;
  const depart = tirage(rang + 101);
  const t = (depart + secondes * lenteur) % 1;

  // De côté, un lent va-et-vient : sans lui, les grains montent en lignes
  // parallèles et l'on voit la grille qui les a semés.
  const derive = Math.sin(secondes * (0.22 + tirage(rang + 7) * 0.3) + rang) * 0.35;
  // Borné : un grain qui sort du cône est une étincelle dans le noir, et l'on
  // ne comprend pas ce qu'elle fait là.
  const cote = Math.max(-1, Math.min(1, (tirage(rang + 53) * 2 - 1) * 0.78 + derive));

  const demi = 0.012 + (demiEcran - 0.012) * t;
  const x = OBJECTIF.x + (ECRAN.x - OBJECTIF.x) * t + cote * demi;
  const y = OBJECTIF.y + (ECRAN.y - OBJECTIF.y) * t;

  // On s'éteint aux deux bouts : à l'objectif on sort du champ, à l'écran on
  // se confond avec l'image. Un grain qui disparaît net se voit disparaître.
  const vif = Math.sin(t * Math.PI) ** 0.7;
  return {
    x,
    y,
    r: (0.0034 - 0.0022 * t) * (0.6 + tirage(rang + 17) * 0.8),
    a: vif * (0.1 + tirage(rang + 31) * 0.22),
  };
}

/** L'éclat de la lampe : un tremblement lent, et un battement plus rapide. */
export function lampe(secondes: number): number {
  return 1 + 0.035 * Math.sin(secondes * TOUR * 0.35) + 0.018 * Math.sin(secondes * TOUR * 3.1);
}

/**
 * Peint le faisceau et sa poussière.
 *
 * Le contexte est effacé par l'appelant : la salle porte aussi une vignette en
 * CSS, et deux effaçages se marcheraient dessus.
 *
 * @param encre les trois composantes de la couleur, séparées par des virgules,
 *   comme le reste de la fenêtre les passe — l'opacité est réglée à part.
 */
export function dessinerFaisceau(
  ctx: CanvasRenderingContext2D,
  largeur: number,
  hauteur: number,
  secondes: number,
  encre: string,
  demi: number = ECRAN.demi,
): void {
  if (largeur <= 0 || hauteur <= 0) return;
  const eclat = lampe(secondes);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgb(${encre})`;

  const points = cone(demi);
  ctx.globalAlpha = 0.075 * eclat;
  ctx.beginPath();
  ctx.moveTo(points[0].x * largeur, points[0].y * hauteur);
  for (const point of points.slice(1)) ctx.lineTo(point.x * largeur, point.y * hauteur);
  ctx.closePath();
  ctx.fill();

  for (let rang = 0; rang < GRAINS; rang += 1) {
    const poussiere = grain(rang, secondes, demi);
    ctx.globalAlpha = poussiere.a * eclat;
    ctx.beginPath();
    ctx.arc(
      poussiere.x * largeur,
      poussiere.y * hauteur,
      Math.max(0.4, poussiere.r * hauteur),
      0,
      TOUR,
    );
    ctx.fill();
  }

  ctx.restore();
}
