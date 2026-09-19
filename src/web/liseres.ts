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
