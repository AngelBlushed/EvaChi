/**
 * Où s'arrête vraiment une jaquette.
 *
 * Le liseré de la sélection doit ceinturer l'image, et une image n'occupe pas
 * toujours tout le fichier qui la porte. Trois choses s'ajoutent :
 *
 * - la case a sa forme et l'image la sienne, d'où des bandes vides quand on
 *   montre l'image entière ;
 * - beaucoup de jaquettes sont enregistrées avec une marge autour — du blanc,
 *   du noir, ou du transparent — qui ne fait pas partie du dessin ;
 * - et l'on ne s'en aperçoit qu'au cas par cas, puisque cela dépend de qui a
 *   fait le fichier.
 *
 * D'où ce module : il regarde les pixels et dit où le dessin commence. Le
 * calcul est fait sur un échantillon réduit — quelques milliers de points
 * suffisent à trouver une marge, et lire une jaquette entière pour cela
 * coûterait cent fois plus cher pour la même réponse.
 *
 * Rien ici ne touche à l'affichage : on reçoit des pixels et des rapports, on
 * rend des fractions. Le module se vérifie donc seul.
 */

/** Côté du plus grand échantillon lu. */
export const ECHANTILLON = 160;

/**
 * Part d'un côté qu'on accepte de rogner, au plus.
 *
 * Une jaquette n'est pas faite que de marges : passé le quart, ce n'est plus
 * une bordure qu'on retire mais du dessin, et mieux vaut un liseré un peu
 * large qu'un liseré qui coupe l'image.
 */
export const ROGNAGE_MAX = 0.25;

/** Écart admis à la couleur du bord, par composante, sur 255. */
export const TOLERANCE = 12;

/** En deçà, un pixel est tenu pour transparent. */
const TRANSPARENT = 24;

/** La part de l'image qui porte le dessin, en fractions de l'image. */
export interface Contenu {
  readonly gauche: number;
  readonly haut: number;
  readonly droite: number;
  readonly bas: number;
}

/** L'image entière : rien à rogner. */
export const PLEIN: Contenu = { gauche: 0, haut: 0, droite: 1, bas: 1 };

/** Les quatre retraits d'un liseré, en fractions de la case. */
export interface Marges {
  readonly haut: number;
  readonly droite: number;
  readonly bas: number;
  readonly gauche: number;
}

export const SANS_MARGE: Marges = { haut: 0, droite: 0, bas: 0, gauche: 0 };

/**
 * La couleur de la marge, si les quatre coins s'accordent.
 *
 * On ne devine pas : si les coins ne disent pas la même chose, c'est que le
 * dessin va jusqu'au bord, et l'on ne rogne rien. Se tromper ici revient à
 * couper la jaquette, ce qui se voit bien plus qu'une marge laissée.
 */
function couleurDuBord(
  pixels: Uint8ClampedArray,
  largeur: number,
  hauteur: number,
): { r: number; v: number; b: number; transparent: boolean } | null {
  const coin = (x: number, y: number): number[] => {
    const rang = (y * largeur + x) * 4;
    return [pixels[rang], pixels[rang + 1], pixels[rang + 2], pixels[rang + 3]];
  };
  const coins = [
    coin(0, 0),
    coin(largeur - 1, 0),
    coin(0, hauteur - 1),
    coin(largeur - 1, hauteur - 1),
  ];

  // Un seul coin transparent suffit : une jaquette détourée a des coins vides
  // et un fond quelconque ailleurs.
  if (coins.some((c) => c[3] < TRANSPARENT)) return { r: 0, v: 0, b: 0, transparent: true };

  const moyenne = [0, 1, 2].map((canal) => coins.reduce((s, c) => s + c[canal], 0) / coins.length);
  for (const c of coins) {
    for (const canal of [0, 1, 2]) {
      if (Math.abs(c[canal] - moyenne[canal]) > TOLERANCE) return null;
    }
  }
  return { r: moyenne[0], v: moyenne[1], b: moyenne[2], transparent: false };
}

/**
 * Où le dessin commence, dans une image déjà lue.
 *
 * @param pixels quatre octets par point, comme les rend un canevas.
 */
export function contenu(pixels: Uint8ClampedArray, largeur: number, hauteur: number): Contenu {
  if (largeur < 2 || hauteur < 2 || pixels.length < largeur * hauteur * 4) return PLEIN;
  const bord = couleurDuBord(pixels, largeur, hauteur);
  if (!bord) return PLEIN;

  const vide = (x: number, y: number): boolean => {
    const rang = (y * largeur + x) * 4;
    if (pixels[rang + 3] < TRANSPARENT) return true;
    if (bord.transparent) return false;
    return (
      Math.abs(pixels[rang] - bord.r) <= TOLERANCE &&
      Math.abs(pixels[rang + 1] - bord.v) <= TOLERANCE &&
      Math.abs(pixels[rang + 2] - bord.b) <= TOLERANCE
    );
  };

  const ligneVide = (y: number): boolean => {
    for (let x = 0; x < largeur; x += 1) if (!vide(x, y)) return false;
    return true;
  };
  const colonneVide = (x: number): boolean => {
    for (let y = 0; y < hauteur; y += 1) if (!vide(x, y)) return false;
    return true;
  };

  // On cherche d'abord le vrai bord du dessin, sans plafond : une image
  // entièrement unie n'a pas de dessin du tout, et la rogner des quatre côtés
  // reviendrait à ceinturer son milieu au hasard.
  let haut = 0;
  while (haut < hauteur && ligneVide(haut)) haut += 1;
  if (haut === hauteur) return PLEIN;
  let bas = 0;
  while (bas < hauteur && ligneVide(hauteur - 1 - bas)) bas += 1;
  let gauche = 0;
  while (gauche < largeur && colonneVide(gauche)) gauche += 1;
  let droite = 0;
  while (droite < largeur && colonneVide(largeur - 1 - droite)) droite += 1;

  const plafondY = Math.floor(hauteur * ROGNAGE_MAX);
  const plafondX = Math.floor(largeur * ROGNAGE_MAX);

  return {
    gauche: Math.min(gauche, plafondX) / largeur,
    haut: Math.min(haut, plafondY) / hauteur,
    droite: 1 - Math.min(droite, plafondX) / largeur,
    bas: 1 - Math.min(bas, plafondY) / hauteur,
  };
}

/**
 * Les retraits du liseré, sachant où le dessin est et comment il est posé.
 *
 * @param rapportImage largeur sur hauteur du fichier.
 * @param rapportCase largeur sur hauteur de la case qui le montre.
 * @param remplit vrai quand l'image remplit la case en débordant — « cover » —
 *   et faux quand elle y tient en entier — « contain ».
 */
export function cadre(
  dessin: Contenu,
  rapportImage: number,
  rapportCase: number,
  remplit: boolean,
): Marges {
  if (
    !Number.isFinite(rapportImage) ||
    !Number.isFinite(rapportCase) ||
    rapportImage <= 0 ||
    rapportCase <= 0
  ) {
    return SANS_MARGE;
  }

  // Où l'image est peinte, en fractions de la case. En « contain » elle y
  // tient et laisse du vide ; en « cover » elle déborde, et ce qui dépasse est
  // rogné par la case.
  const plusLarge = rapportImage > rapportCase;
  const largeur = remplit
    ? plusLarge
      ? rapportImage / rapportCase
      : 1
    : plusLarge
      ? 1
      : rapportImage / rapportCase;
  const hauteur = remplit
    ? plusLarge
      ? 1
      : rapportCase / rapportImage
    : plusLarge
      ? rapportCase / rapportImage
      : 1;
  const x = (1 - largeur) / 2;
  const y = (1 - hauteur) / 2;

  const serre = (valeur: number): number => Math.min(1, Math.max(0, valeur));
  return {
    gauche: serre(x + dessin.gauche * largeur),
    haut: serre(y + dessin.haut * hauteur),
    droite: serre(1 - (x + dessin.droite * largeur)),
    bas: serre(1 - (y + dessin.bas * hauteur)),
  };
}
