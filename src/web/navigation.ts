/**
 * Le déplacement dans une grille de jaquettes.
 *
 * Tout l'agrément d'un menu à la manette tient là-dedans : une grille qui
 * refuse d'aller à droite sur la dernière ligne, ou qui saute une case en
 * descendant, se sent tout de suite et s'explique mal. Ce module ne touche à
 * rien d'affiché — il dit juste où l'on arrive — et se vérifie donc seul.
 */

export type Direction = 'gauche' | 'droite' | 'haut' | 'bas';

/**
 * L'indice atteint en poussant dans une direction.
 *
 * Deux règles qui ne vont pas de soi :
 *
 * - **On ne sort jamais de la grille.** Pousser à droite sur la dernière case
 *   n'emmène pas au néant : on y reste. Un menu qui perd sa sélection oblige à
 *   la retrouver, et c'est précisément ce qu'on veut éviter à la manette.
 * - **Descendre depuis une dernière ligne incomplète va à la dernière case.**
 *   La colonne visée n'existe pas toujours ; refuser le mouvement donnerait
 *   l'impression d'une grille bloquée alors qu'il reste des jeux dessous.
 */
export function move(index: number, count: number, columns: number, direction: Direction): number {
  if (count <= 0) return 0;
  const colonnes = Math.max(1, columns);
  const courant = Math.min(Math.max(index, 0), count - 1);

  switch (direction) {
    case 'gauche':
      return courant % colonnes === 0 ? courant : courant - 1;

    case 'droite':
      return courant % colonnes === colonnes - 1 || courant === count - 1
        ? courant
        : courant + 1;

    case 'haut':
      return courant < colonnes ? courant : courant - colonnes;

    case 'bas': {
      const vise = courant + colonnes;
      if (vise < count) return vise;
      // Il reste une ligne, mais pas sous cette colonne-là.
      const dejaSurLaDerniereLigne = Math.floor(courant / colonnes) === Math.floor((count - 1) / colonnes);
      return dejaSurLaDerniereLigne ? courant : count - 1;
    }
  }
}

/**
 * Un pas dans une simple file, sans en sortir.
 *
 * La grille a deux dimensions, le menu animé n'en a qu'une par axe : une
 * rangée de consoles, une colonne de jeux. On ne boucle pas — arriver à la
 * dernière console et se retrouver à la première déroute plus que ça n'aide.
 */
export function step(index: number, count: number, delta: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(index + delta, 0), count - 1);
}

/**
 * Le nombre de colonnes qui tiennent dans une largeur donnée.
 *
 * Calculé plutôt que figé : la fenêtre se redimensionne, et une grille dont le
 * nombre de colonnes ne suit pas déplacerait la sélection à chaque
 * redimensionnement.
 */
export function columnsFor(width: number, tile: number, gap: number): number {
  if (width <= 0 || tile <= 0) return 1;
  return Math.max(1, Math.floor((width + gap) / (tile + gap)));
}

/** Un appui qui vient d'avoir lieu, par opposition à un bouton tenu. */
export interface Edge {
  /** Vrai le temps d'une trame, au moment où le bouton s'enfonce. */
  readonly pressed: boolean;
  /** Vrai quand un bouton tenu doit se répéter. */
  readonly repeat: boolean;
}

/**
 * Suit un bouton pour distinguer l'appui, la tenue et la répétition.
 *
 * Sans ce filtre, une direction tenue un quart de seconde traverse la
 * bibliothèque entière : la boucle tourne soixante fois par seconde. Avec, on
 * obtient le comportement d'un clavier — un déplacement, une pause, puis une
 * répétition régulière.
 */
export class Held {
  #prochaine = 0;
  #tenu = false;
  readonly #delay: number;
  readonly #period: number;

  /** @param delay attente avant la première répétition, en millisecondes.
   *  @param period intervalle entre deux répétitions. */
  constructor(delay = 420, period = 90) {
    this.#delay = delay;
    this.#period = period;
  }

  /** À appeler à chaque trame avec l'état du bouton. */
  update(down: boolean, now: number): Edge {
    if (!down) {
      this.#tenu = false;
      return { pressed: false, repeat: false };
    }

    if (!this.#tenu) {
      this.#tenu = true;
      this.#prochaine = now + this.#delay;
      return { pressed: true, repeat: false };
    }

    if (now >= this.#prochaine) {
      this.#prochaine = now + this.#period;
      return { pressed: false, repeat: true };
    }

    return { pressed: false, repeat: false };
  }
}
