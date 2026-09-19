/**
 * La géométrie de l'étagère.
 *
 * Un mur de rayonnages : une planche par console, et sur chacune les jeux
 * debout, serrés les uns contre les autres comme des boîtiers sur une vraie
 * étagère. Celui qu'on regarde sort du rang et s'ouvre vers nous ; les autres
 * ne montrent que leur tranche.
 *
 * Deux choses la distinguent des quatre autres présentations. La première :
 * l'épaisseur d'un boîtier est celle de son fichier. Une cartouche de Game Boy
 * fait deux millimètres, une image de PlayStation 2 en fait deux centimètres,
 * et la planche dit d'un coup d'œil ce qu'on a — ce qu'aucune grille de
 * vignettes identiques ne montre. La seconde : quatre consoles sont visibles
 * en même temps, avec leur contenu, au lieu d'une seule.
 *
 * Tout ce qui décide d'une position est ici, à part du dessin, pour se
 * vérifier sans écran.
 */

/** L'épaisseur d'un boîtier ordinaire, en unités de tranche. */
export const MINCE = 1;

/** Celle du plus gros fichier qu'on puisse ranger. */
export const EPAIS = 4.6;

/** Celle du boîtier ouvert : il montre sa jaquette, il lui faut sa largeur. */
export const OUVERT = 11;

/** Le jour entre deux boîtiers, en unités. */
export const JOUR = 0.16;

/**
 * L'épaisseur d'un boîtier, d'après la taille de son fichier.
 *
 * Par le logarithme, et non par la taille : entre une cartouche de trente-deux
 * kilo-octets et une image de huit gigaoctets il y a un facteur deux cent
 * cinquante mille, et une épaisseur proportionnelle ferait de la première un
 * trait invisible à côté d'un mur. Le logarithme range les deux sur la même
 * étagère tout en gardant l'ordre — ce qui est gros reste gros.
 */
export function epaisseur(octets: number): number {
  if (!Number.isFinite(octets) || octets <= 0) return (MINCE + EPAIS) / 2;

  const mega = Math.max(octets / (1024 * 1024), 1 / 32);
  // De 32 ko (−5) à 8 Go (13) : dix-huit doublements, étalés sur l'écart
  // d'épaisseur.
  const part = (Math.log2(mega) + 5) / 18;
  return MINCE + Math.max(0, Math.min(1, part)) * (EPAIS - MINCE);
}

/** Un boîtier posé sur sa planche. */
export interface Place {
  /** Bord gauche, en unités, depuis le début de la planche. */
  readonly x: number;
  /** Largeur, en unités. */
  readonly largeur: number;
  /** Vrai pour celui qu'on regarde, seul à montrer sa jaquette. */
  readonly ouvert: boolean;
}

/**
 * Où se pose chaque boîtier d'une planche.
 *
 * Celui qu'on regarde prend la place d'une jaquette, et pousse ses voisins :
 * c'est le geste de sortir un boîtier du rang, et c'est ce qui fait qu'on voit
 * la jaquette sans qu'elle recouvre quoi que ce soit.
 *
 * @param choisi le rang du boîtier ouvert, hors bornes pour n'en ouvrir aucun.
 */
export function places(epaisseurs: readonly number[], choisi: number): Place[] {
  const posees: Place[] = [];
  let x = 0;
  for (const [rang, epaisse] of epaisseurs.entries()) {
    const ouvert = rang === choisi;
    const largeur = ouvert ? OUVERT : Math.max(MINCE, epaisse);
    posees.push({ x, largeur, ouvert });
    x += largeur + JOUR;
  }
  return posees;
}

/**
 * De combien glisser la planche pour amener le boîtier choisi au milieu.
 *
 * On ne borne pas aux extrémités : une planche de trois jeux se centre alors
 * sur eux, et une planche de cent se parcourt sans que le premier ni le
 * dernier ne restent collés au bord. C'est le boîtier ouvert qu'on regarde,
 * pas la planche.
 */
export function decalage(posees: readonly Place[], choisi: number): number {
  const vise = posees[choisi];
  if (!vise) return 0;
  return -(vise.x + vise.largeur / 2);
}

/**
 * La largeur totale d'une planche, jour compris.
 *
 * Sert à dire si une console tient sur l'écran ou s'il faudra la parcourir :
 * une étagère où tout tient d'un coup et une où l'on défile ne se lisent pas
 * de la même façon, et c'est une chose qu'on veut pouvoir éprouver.
 */
export function largeur(posees: readonly Place[]): number {
  const dernier = posees[posees.length - 1];
  return dernier ? dernier.x + dernier.largeur : 0;
}

/** Combien de planches on garde en vie autour de celle qu'on regarde. */
export const PLANCHES = 3;

/**
 * Les planches à dessiner autour de celle qu'on regarde.
 *
 * Une bibliothèque compte quarante consoles et cinq cents jeux : les construire
 * toutes coûterait le même prix que de les afficher, alors qu'on n'en voit que
 * sept d'un coup. On n'en garde donc qu'une poignée, et les autres attendent.
 */
export function murs(choisie: number, combien: number): number[] {
  if (combien <= 0) return [];
  const premiere = Math.max(0, choisie - PLANCHES);
  const derniere = Math.min(combien - 1, choisie + PLANCHES);
  const rangs: number[] = [];
  for (let rang = premiere; rang <= derniere; rang += 1) rangs.push(rang);
  return rangs;
}
