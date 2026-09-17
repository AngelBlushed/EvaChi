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

/**
 * Jusqu'où le cadre peut déborder de l'image.
 *
 * Il le peut, et c'est voulu : une jaquette trop serrée — un logo qui touche
 * les bords — ne se répare qu'en prenant *plus* que l'image. Ce qui dépasse
 * devient une bande transparente, à travers laquelle on voit le décor. Sans
 * cela, on ne saurait que zoomer, jamais dézoomer.
 */
export const DEBORD = 1;

const borne = (valeur: number, bas: number, haut: number) =>
  Math.min(haut, Math.max(bas, valeur));

/** Le cadre entier, tel qu'on le propose en ouvrant. */
export const TOUT: Cadre = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Garde au cadre une taille tenable, et un pied dans l'image.
 *
 * Il peut sortir, mais pas s'en aller : on exige qu'il en recouvre toujours au
 * moins un quart de côté. Un cadre parti tout à fait à côté ne donnerait
 * qu'une jaquette vide, et on ne saurait plus comment le ramener.
 */
export function borner(cadre: Cadre): Cadre {
  const w = borne(cadre.w, MINIMUM, 1 + 2 * DEBORD);
  const h = borne(cadre.h, MINIMUM, 1 + 2 * DEBORD);

  // Le cadre doit mordre sur l'image : son bord droit au-delà d'un quart de
  // largeur, son bord gauche en deçà des trois quarts, et de même en hauteur.
  const morsure = 0.25;
  return {
    x: borne(cadre.x, morsure - w, 1 - morsure),
    y: borne(cadre.y, morsure - h, 1 - morsure),
    w,
    h,
  };
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
  const w = cadre.w * facteur;
  const h = cadre.h * facteur;
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
  const w = cadre.w + dw;
  const h = cadre.h + dh;
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

  const tireX = borne(x, -DEBORD, 1 + DEBORD);
  const tireY = borne(y, -DEBORD, 1 + DEBORD);

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
