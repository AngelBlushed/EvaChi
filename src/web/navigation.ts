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
 * L'initiale sous laquelle un titre se range.
 *
 * Les accents sont ramenés à leur lettre — « Astérix » et « Asterix » doivent
 * se ranger ensemble — et tout ce qui n'est pas une lettre part sous le même
 * signe, qui vient avant l'alphabet comme dans n'importe quel index.
 */
export function initiale(titre: string): string {
  const propre = titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
  const premier = propre.charAt(0);
  return premier >= 'A' && premier <= 'Z' ? premier : '#';
}

/**
 * Le saut à la lettre suivante ou précédente.
 *
 * Cinq cents jeux ne se parcourent pas case par case, et le champ de recherche
 * demande un clavier qu'on n'a pas manette en main. Sauter d'initiale en
 * initiale traverse la bibliothèque en une dizaine d'appuis, ce qui suffit.
 *
 * Vers l'arrière on remonte jusqu'au **début** du bloc précédent, et non à sa
 * fin : c'est le premier « M » qu'on veut retrouver en revenant des « N », pas
 * le dernier.
 */
export function sautInitiale(
  index: number,
  initiales: readonly string[],
  sens: 1 | -1,
): number {
  if (initiales.length === 0) return 0;
  const courant = Math.min(Math.max(index, 0), initiales.length - 1);
  const ici = initiales[courant];

  if (sens === 1) {
    for (let rang = courant + 1; rang < initiales.length; rang += 1) {
      if (initiales[rang] !== ici) return rang;
    }
    return courant;
  }

  // Le début du bloc en cours, d'abord : si l'on n'y est pas déjà, c'est là
  // qu'on veut aller. Sans cela, revenir en arrière depuis le milieu des « M »
  // sauterait directement aux « L » en laissant des « M » derrière soi.
  let debut = courant;
  while (debut > 0 && initiales[debut - 1] === ici) debut -= 1;
  if (debut !== courant) return debut;

  if (debut === 0) return 0;
  const precedente = initiales[debut - 1];
  let rang = debut - 1;
  while (rang > 0 && initiales[rang - 1] === precedente) rang -= 1;
  return rang;
}

/** Un rectangle, tel que la mise en page l'a posé. */
export interface Boite {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Le voisin le plus naturel dans une direction, d'après les positions réelles.
 *
 * L'arithmétique en colonnes ne vaut que pour une grille parfaitement
 * régulière. Dès qu'un titre de section coupe une rangée, les cases ne sont
 * plus au rang que le calcul leur suppose, et la sélection se met à sauter
 * d'une section à l'autre sans raison visible.
 *
 * On regarde donc où les cases sont vraiment. Ne sont retenues que celles
 * franchement situées du bon côté ; parmi elles, la plus proche, l'écart de
 * travers comptant triple — sans quoi, en descendant, on partirait volontiers
 * vers une case lointaine sur le côté plutôt que vers celle juste en dessous.
 */
export function voisin(index: number, boites: readonly Boite[], direction: Direction): number {
  if (boites.length === 0) return 0;
  const courant = Math.min(Math.max(index, 0), boites.length - 1);
  const ici = boites[courant];
  const cx = ici.x + ici.w / 2;
  const cy = ici.y + ici.h / 2;

  let meilleur = courant;
  let meilleurScore = Number.POSITIVE_INFINITY;

  for (const [rang, boite] of boites.entries()) {
    if (rang === courant) continue;
    const bx = boite.x + boite.w / 2;
    const by = boite.y + boite.h / 2;

    // « Franchement du bon côté » : le bord d'en face a dépassé notre milieu.
    // Sans cette marge, deux cases de hauteurs différentes sur la même rangée
    // se considèrent l'une au-dessus de l'autre.
    const passe =
      direction === 'bas'
        ? boite.y >= cy
        : direction === 'haut'
          ? boite.y + boite.h <= cy
          : direction === 'droite'
            ? boite.x >= cx
            : boite.x + boite.w <= cx;
    if (!passe) continue;

    const vertical = direction === 'bas' || direction === 'haut';
    const principal = Math.abs(vertical ? by - cy : bx - cx);
    const travers = Math.abs(vertical ? bx - cx : by - cy);

    // À gauche et à droite on ne quitte pas sa rangée. Sans cette règle, la
    // dernière case d'une rangée partait en diagonale vers la rangée suivante
    // — en sautant sa première case au passage, puisque celle-ci n'est pas « à
    // droite ». Monter et descendre, au contraire, doivent pouvoir franchir un
    // titre de section.
    if (!vertical && travers > ici.h / 2) continue;

    const score = principal + travers * 3;

    if (score < meilleurScore) {
      meilleurScore = score;
      meilleur = rang;
    }
  }

  return meilleur;
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

/**
 * De combien agrandir un menu prévu pour une petite fenêtre.
 *
 * Les tailles du menu animé sont posées pour une fenêtre d'environ six cents
 * pixels de haut, où tout tombe juste. En plein écran, les mêmes tailles se
 * perdent dans le vide : les pastilles deviennent minuscules et la liste
 * s'entasse dans un coin. On agrandit donc tout dans la même proportion, plutôt
 * que d'ajouter des lignes — un menu de salon se regarde de loin, il doit
 * grossir avec l'écran.
 *
 * Elle descend aussi : sous six cents pixels, les hauteurs d'origine ne
 * tiennent plus, la liste se retrouve à zéro hauteur et la rangée des consoles
 * vient se poser par-dessus les jeux. On s'arrête à 0,55 — en deçà plus rien
 * n'est lisible — et à 2,2 vers le haut, faute de quoi trois jeux rempliraient
 * un écran de cinéma.
 */
export function echelle(hauteur: number): number {
  const REFERENCE = 660;
  if (hauteur <= 0) return 1;
  return Math.min(2.2, Math.max(0.55, hauteur / REFERENCE));
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

/**
 * Retient la manette tant qu'un appui n'a pas été relâché.
 *
 * Deux lecteurs se partagent la même manette dans la même trame : la case qui
 * attend qu'on lui désigne un bouton, et la conduite des menus. La case prend
 * le bouton et se referme ; la conduite qui suit, dans la même trame, voit
 * l'appui encore tenu et l'exécute. On liait « B » à une commande et la fenêtre
 * se refermait aussitôt — le bouton qu'on venait de choisir servait deux fois.
 *
 * Le verrou se ferme dès qu'une capture est en cours, et ne se rouvre qu'une
 * fois tous les boutons lâchés. Le prix est d'une trame ; on ne le sent pas.
 */
export class Verrou {
  #tenu = false;

  /** Ferme le verrou : plus rien ne passera avant un relâchement. */
  fermer(): void {
    this.#tenu = true;
  }

  /**
   * Vrai quand la conduite peut reprendre.
   *
   * @param presse vrai tant qu'un bouton quelconque est enfoncé.
   */
  ouvert(presse: boolean): boolean {
    if (this.#tenu && !presse) this.#tenu = false;
    return !this.#tenu;
  }
}

/**
 * Le pas d'une avancée douce vers une cible.
 *
 * Un lissage exponentiel, et non une transition : la cible change pendant que
 * l'on avance — on pousse la direction trois fois de suite — et une transition
 * repartirait de zéro à chaque fois, ce qui donne un mouvement qui hoquette.
 *
 * Le pas dépend du temps écoulé et non du nombre de trames : sur une machine
 * qui en saute, il faut avancer autant, pas moins.
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
  // Sans cet arrêt net, on poursuit indéfiniment une cible qu'on n'atteint
  // jamais, et le navigateur repeint la scène pour rien.
  return Math.abs(vers - suivant) < arret ? vers : suivant;
}

/**
 * Le palier suivant d'une jauge, dans un sens donné.
 *
 * Une jauge se glisse finement à la souris, mais à la manette chaque appui doit
 * compter : de 50 à 900 par pas de cinq, il faudrait cent soixante-dix appuis
 * pour la traverser. On ne s'arrête donc qu'aux paliers, et on rend `null` à
 * bout de course plutôt que de boucler — une vitesse qui repasserait de 900 % à
 * 50 % sur un appui de trop serait une surprise désagréable.
 */
export function cranSuivant(
  valeur: number,
  crans: readonly number[],
  sens: 'gauche' | 'droite',
): number | null {
  const ranges = [...crans].sort((a, b) => a - b);
  const trouve =
    sens === 'droite'
      ? ranges.find((cran) => cran > valeur)
      : ranges.reverse().find((cran) => cran < valeur);
  return trouve ?? null;
}
