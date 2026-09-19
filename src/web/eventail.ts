/**
 * Le paquet : une main de jaquettes, tenue en éventail.
 *
 * Les autres présentations posent les jeux quelque part — sur une rangée, dans
 * une grille — et l'on s'y déplace. Ici on les *tient* : le paquet pivote sous
 * le bas de l'écran, la carte regardée sort du lot et se redresse, les autres
 * s'inclinent de part et d'autre. Changer de jeu ne fait pas défiler une liste,
 * ça fait tourner le poignet.
 *
 * Tout est en hauteurs de carte plutôt qu'en pixels : la fenêtre décide de la
 * taille d'une carte, ce module décide seulement où elle va. Il ne touche donc
 * à rien d'affiché et se vérifie seul.
 */

/** Cartes montrées de chaque côté de la choisie. */
export const AILE = 7;

/** Degrés entre deux cartes voisines. */
export const PAS = 5.4;

/**
 * Distance du pivot au centre d'une carte, en hauteurs de carte.
 *
 * C'est ce rayon qui fait la main : trop court, les cartes tournent sur
 * elles-mêmes et se recouvrent en pile ; trop long, l'éventail devient une
 * rangée plate et l'on retombe sur le carrousel.
 */
export const RAYON = 2.05;

/** De combien la carte choisie sort du paquet, en hauteurs de carte. */
export const SORTIE = 0.16;

/** Ce que la carte choisie gagne en taille. */
export const GROSSIT = 1.14;

/** Amplitude du souffle, en degrés. */
export const SOUFFLE = 1.05;

/** Durée d'une respiration complète, en secondes. */
export const RESPIRATION = 6.4;

/**
 * Décalage de phase d'une carte à sa voisine, en radians.
 *
 * Sans lui, la main entière balance d'un bloc comme un panneau rigide. Avec, le
 * souffle traverse l'éventail et les cartes se suivent — c'est ce qui donne
 * l'impression qu'une main les tient.
 */
const ONDULATION = 0.3;

export interface Carte {
  /** Le rang du jeu dans la console, tel qu'il est rangé. */
  readonly rang: number;
  /** Inclinaison, en degrés ; zéro pour la carte choisie. */
  readonly angle: number;
  /** Position du centre, en hauteurs de carte, depuis le centre du paquet. */
  readonly x: number;
  /** Vers le bas, en hauteurs de carte. */
  readonly y: number;
  /** Ordre d'empilement : la choisie passe devant. */
  readonly z: number;
  readonly echelle: number;
  readonly opacite: number;
  readonly choisie: boolean;
}

/**
 * Les rangs que la main montre, autour de la carte lue.
 *
 * La fenêtre est centrée sur la carte, et non calée pour rester pleine : au
 * premier jeu d'une console, une fenêtre pleine mettrait quatorze cartes d'un
 * seul côté et l'éventail s'ouvrirait à soixante-quinze degrés, jusqu'à sortir
 * de l'écran. La main est donc plus courte en bout de liste — ce qui se
 * comprend tout seul : il n'y a rien avant le premier jeu.
 */
export function fenetre(choisi: number, total: number): number[] {
  if (total <= 0) return [];
  const premier = Math.max(0, choisi - AILE);
  const dernier = Math.min(total - 1, choisi + AILE);
  return Array.from({ length: dernier - premier + 1 }, (_, pas) => premier + pas);
}

/**
 * Le souffle d'une carte, en degrés.
 *
 * La carte choisie n'en reçoit pas : c'est celle qu'on lit, et un titre qui
 * oscille se lit mal.
 */
export function souffle(rang: number, secondes: number): number {
  const tour = (Math.PI * 2 * secondes) / RESPIRATION;
  return SOUFFLE * Math.sin(tour + rang * ONDULATION);
}

/**
 * Où va une carte.
 *
 * `position` n'est pas forcément un rang entier : entre deux jeux, le poignet
 * tourne et la main passe par tous les états intermédiaires. Tout se calcule
 * donc en continu, et « la carte choisie » devient une affaire de degré — ce
 * qui évite d'avoir à écrire à part l'état de départ, l'état d'arrivée et ce
 * qu'il y a entre les deux.
 */
export function carte(rang: number, position: number, secondes: number): Carte {
  const ecart = rang - position;
  const dedans = Math.max(0, 1 - Math.abs(ecart));
  const choisie = ecart === 0;
  const angle = ecart * PAS + souffle(rang, secondes) * (1 - dedans);
  const radians = (angle * Math.PI) / 180;

  // La carte tourne autour d'un pivot posé sous elle : c'est la rotation qui
  // écarte les cartes, et non un décalage ajouté après coup. Un éventail dont
  // les cartes sont d'abord espacées puis inclinées ne ferme jamais bien.
  const x = RAYON * Math.sin(radians);
  const y = RAYON * (1 - Math.cos(radians)) - SORTIE * dedans;
  const loin = Math.abs(ecart);
  const fondue = Math.max(0.42, 1 - loin * 0.075);

  return {
    rang,
    angle,
    x,
    y,
    z: AILE + 2 * dedans - loin,
    echelle: (1 - Math.min(loin, AILE) * 0.018) * (1 + (GROSSIT - 1) * dedans),
    opacite: fondue + (1 - fondue) * dedans,
    choisie,
  };
}

/** La main entière, prête à être posée. */
export function main(position: number, total: number, secondes: number): Carte[] {
  return fenetre(Math.round(position), total).map((rang) => carte(rang, position, secondes));
}
