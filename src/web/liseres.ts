/**
 * Où une jaquette est peinte dans sa case.
 *
 * Le liseré de la sélection doit ceinturer l'image, et une image n'a pas
 * forcément la forme de la case qui la montre : montrée en entier, elle y
 * laisse des bandes vides ; montrée en grand, elle déborde et la case la
 * rogne. Ce module dit où elle tombe, des deux façons.
 *
 * Rien ici ne touche à l'affichage : on reçoit des rapports, on rend des
 * fractions. Il se vérifie donc seul.
 */

/** La part de la case qu'occupe le dessin, en fractions de l'image. */
export interface Contenu {
  readonly gauche: number;
  readonly haut: number;
  readonly droite: number;
  readonly bas: number;
}

/** Une jaquette entière : c'est toujours le cas, le fichier fait foi. */
export const JAQUETTE: Contenu = { gauche: 0, haut: 0, droite: 1, bas: 1 };

/** Les quatre retraits d'un liseré, en fractions de la case. */
export interface Marges {
  readonly haut: number;
  readonly droite: number;
  readonly bas: number;
  readonly gauche: number;
}

export const SANS_MARGE: Marges = { haut: 0, droite: 0, bas: 0, gauche: 0 };

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

/** Au-delà, sur les trois canaux, un point est tenu pour blanc. */
export const SEUIL_BLANC = 236;

/** En deçà, un point est tenu pour transparent. */
export const SEUIL_TRANSPARENT = 24;

/**
 * Part d'un côté au-delà de laquelle on renonce à rogner — et l'on y renonce
 * alors tout à fait.
 *
 * Une marge d'un quart n'est plus une marge : c'est qu'on n'a pas compris
 * l'image. Rogner quand même donnerait un liseré arbitraire, et rogner deux
 * côtés opposés jusqu'au plafond le réduirait à une bande au milieu du dessin.
 * Mieux vaut ne rien faire que faire n'importe quoi.
 */
export const ROGNAGE_MAX = 0.25;

/**
 * La marge claire enregistrée dans une jaquette, s'il y en a une.
 *
 * Beaucoup de jaquettes sont enregistrées sur un fond blanc ou détourées sur
 * du transparent : le dessin ne va pas jusqu'au bord du fichier, et un liseré
 * posé sur le fichier entoure du vide. C'est le cas de FIFA 96 sur Mega Drive,
 * et de toutes celles qui lui ressemblent.
 *
 * On ne cherche que du blanc et du transparent, jamais une couleur quelconque.
 * Une version précédente prenait la couleur des quatre coins pour celle de la
 * marge : sur une jaquette cernée de noir, les rangées sombres du haut et du
 * bas passaient pour du vide, le rognage montait jusqu'à son plafond, et le
 * liseré se réduisait à une bande au milieu de l'image. Une bordure sombre est
 * un élément du dessin ; une marge blanche n'en est pas un.
 *
 * @param pixels quatre octets par point, comme les rend un canevas.
 */
export function margeClaire(
  pixels: Uint8ClampedArray,
  largeur: number,
  hauteur: number,
): Contenu {
  if (largeur < 8 || hauteur < 8 || pixels.length < largeur * hauteur * 4) return JAQUETTE;

  const clair = (x: number, y: number): boolean => {
    const rang = (y * largeur + x) * 4;
    if (pixels[rang + 3] < SEUIL_TRANSPARENT) return true;
    return (
      pixels[rang] >= SEUIL_BLANC &&
      pixels[rang + 1] >= SEUIL_BLANC &&
      pixels[rang + 2] >= SEUIL_BLANC
    );
  };

  // Les quatre coins doivent l'être : un seul qui ne l'est pas, et le dessin
  // touche le bord quelque part.
  if (
    !clair(0, 0) ||
    !clair(largeur - 1, 0) ||
    !clair(0, hauteur - 1) ||
    !clair(largeur - 1, hauteur - 1)
  ) {
    return JAQUETTE;
  }

  const ligneClaire = (y: number): boolean => {
    for (let x = 0; x < largeur; x += 1) if (!clair(x, y)) return false;
    return true;
  };
  const colonneClaire = (x: number): boolean => {
    for (let y = 0; y < hauteur; y += 1) if (!clair(x, y)) return false;
    return true;
  };

  let haut = 0;
  while (haut < hauteur && ligneClaire(haut)) haut += 1;
  // Tout est clair : il n'y a pas de dessin à trouver.
  if (haut === hauteur) return JAQUETTE;
  let bas = 0;
  while (bas < hauteur && ligneClaire(hauteur - 1 - bas)) bas += 1;
  let gauche = 0;
  while (gauche < largeur && colonneClaire(gauche)) gauche += 1;
  let droite = 0;
  while (droite < largeur && colonneClaire(largeur - 1 - droite)) droite += 1;

  if (
    haut > hauteur * ROGNAGE_MAX ||
    bas > hauteur * ROGNAGE_MAX ||
    gauche > largeur * ROGNAGE_MAX ||
    droite > largeur * ROGNAGE_MAX
  ) {
    return JAQUETTE;
  }

  return {
    gauche: gauche / largeur,
    haut: haut / hauteur,
    droite: 1 - droite / largeur,
    bas: 1 - bas / hauteur,
  };
}
