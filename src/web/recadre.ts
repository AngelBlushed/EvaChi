/**
 * Le cadre de recadrage d'une jaquette.
 *
 * Toute la géométrie est ici, en fractions de l'image et non en pixels : le
 * même cadre vaut alors pour l'aperçu à l'écran, quelle que soit sa taille, et
 * pour l'image d'origine au moment de la découper. Sans cela, agrandir la
 * fenêtre déplacerait le recadrage.
 *
 * Rien dans ce fichier ne touche à la page : c'est ce qui permet d'en éprouver
 * les bords, et les bords sont tout le sujet — un cadre qui sort de l'image ou
 * qui se retourne sur lui-même ne se voit qu'à l'usage.
 */

/** Un rectangle en fractions de l'image : 0 à gauche, 1 à droite. */
export interface Cadre {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Les quatre coins qu'on peut tirer. */
export type Coin = 'hg' | 'hd' | 'bg' | 'bd';

/**
 * La plus petite part d'image qu'on puisse garder.
 *
 * Un cadre réduit à rien donnerait une jaquette d'un pixel, et il n'y aurait
 * plus de quoi le rattraper à la souris.
 */
export const MINIMUM = 0.08;

const borne = (valeur: number, bas: number, haut: number) =>
  Math.min(haut, Math.max(bas, valeur));

/** Le cadre entier, tel qu'on le propose en ouvrant. */
export const TOUT: Cadre = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Ramène un cadre dans l'image, et lui garde une taille tenable.
 *
 * La largeur est corrigée avant la position : un cadre trop large qu'on
 * déplacerait d'abord se retrouverait collé au bord, puis rétréci depuis là,
 * et aurait glissé sans qu'on l'ait demandé.
 */
export function borner(cadre: Cadre): Cadre {
  const w = borne(cadre.w, MINIMUM, 1);
  const h = borne(cadre.h, MINIMUM, 1);
  return { x: borne(cadre.x, 0, 1 - w), y: borne(cadre.y, 0, 1 - h), w, h };
}

/** Déplace le cadre sans le laisser sortir, ni changer de taille. */
export function deplacer(cadre: Cadre, dx: number, dy: number): Cadre {
  return borner({ ...cadre, x: cadre.x + dx, y: cadre.y + dy });
}

/**
 * Resserre ou élargit le cadre autour de son centre.
 *
 * Autour du centre, et non depuis un coin : c'est ce que fait la main quand
 * elle veut « un peu plus » de l'image, et cela évite que le cadre parte en
 * diagonale à chaque appui.
 */
export function zoomer(cadre: Cadre, facteur: number): Cadre {
  const cx = cadre.x + cadre.w / 2;
  const cy = cadre.y + cadre.h / 2;
  const w = borne(cadre.w * facteur, MINIMUM, 1);
  const h = borne(cadre.h * facteur, MINIMUM, 1);
  return borner({ x: cx - w / 2, y: cy - h / 2, w, h });
}

/**
 * Change la largeur et la hauteur séparément, autour du centre.
 *
 * Les flèches du clavier avec Maj : gauche et droite sur la largeur, haut et
 * bas sur la hauteur.
 */
export function etirer(cadre: Cadre, dw: number, dh: number): Cadre {
  const cx = cadre.x + cadre.w / 2;
  const cy = cadre.y + cadre.h / 2;
  const w = borne(cadre.w + dw, MINIMUM, 1);
  const h = borne(cadre.h + dh, MINIMUM, 1);
  return borner({ x: cx - w / 2, y: cy - h / 2, w, h });
}

/**
 * Tire un coin jusqu'à un point, celui d'en face restant où il est.
 *
 * Le cadre se retourne volontiers : tirer le coin haut-gauche au-delà du
 * coin bas-droit donne un rectangle valide, l'un prenant la place de l'autre.
 * Refuser le retournement donnerait un cadre qui se coince contre lui-même,
 * et la souris semblerait décrochée.
 */
export function tirer(cadre: Cadre, coin: Coin, x: number, y: number): Cadre {
  const gauche = coin === 'hg' || coin === 'bg';
  const haut = coin === 'hg' || coin === 'hd';

  const fixeX = gauche ? cadre.x + cadre.w : cadre.x;
  const fixeY = haut ? cadre.y + cadre.h : cadre.y;

  const tireX = borne(x, 0, 1);
  const tireY = borne(y, 0, 1);

  return borner({
    x: Math.min(fixeX, tireX),
    y: Math.min(fixeY, tireY),
    w: Math.abs(fixeX - tireX),
    h: Math.abs(fixeY - tireY),
  });
}

/**
 * Vrai quand deux cadres ne désignent plus tout à fait la même part d'image.
 *
 * Sert à savoir quand faire entendre un cran : à la souris, un tic par pixel
 * parcouru ferait une mitraillette. Le pas est celui d'un centième d'image,
 * assez fin pour suivre le geste, assez large pour se compter.
 */
export function change(avant: Cadre, apres: Cadre, pas = 0.01): boolean {
  const cran = (valeur: number) => Math.round(valeur / pas);
  return (
    cran(avant.x) !== cran(apres.x) ||
    cran(avant.y) !== cran(apres.y) ||
    cran(avant.w) !== cran(apres.w) ||
    cran(avant.h) !== cran(apres.h)
  );
}
