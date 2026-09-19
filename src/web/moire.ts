/**
 * Le fond du paquet et de la séance : deux familles d'ondes qui se croisent.
 *
 * Les deux autres présentations ont déjà leur décor — des rubans qui ondulent
 * dans le menu animé, un courant de petites touches dans le carrousel — et il
 * fallait un troisième qui ne rappelle ni l'un ni l'autre. Ni bandes, ni
 * traits : des cercles.
 *
 * Deux familles d'anneaux concentriques, dont les centres dérivent lentement
 * l'un par rapport à l'autre. Là où leurs traits se croisent naît un moiré —
 * ces figures qui apparaissent quand on superpose deux grilles presque
 * identiques. Personne ne dessine le moiré : il est le produit des deux
 * familles, et il se déplace parce que les centres bougent. C'est un décor qui
 * vit sans qu'on anime rien.
 *
 * Tout est en fractions de la vue, jamais en pixels : la fenêtre décide de sa
 * taille, ce module décide seulement de la figure. Il se vérifie donc seul.
 */

const TOUR = Math.PI * 2;

/** Les deux familles d'ondes. Trois feraient une soupe, une seule un ricochet. */
export const FAMILLES = 2;

/** Anneaux par famille. */
export const ANNEAUX = 26;

/** Écart entre deux anneaux, en hauteurs de vue. */
export const ECART = 0.05;

/**
 * De combien l'écart respire.
 *
 * C'est lui qui fait vivre le moiré sur place : deux centres immobiles mais
 * dont les pas diffèrent d'un millième font déjà glisser les figures. Sans
 * cela, le fond ne bougerait qu'en se déplaçant, ce qui se remarque.
 */
export const RESPIRE = 0.06;

/** Le trait, d'autant plus pâle que l'anneau est loin. */
export const PALEUR = 0.115;

export interface Centre {
  readonly x: number;
  readonly y: number;
}

/**
 * Où se tient le centre d'une famille, à cet instant.
 *
 * Une course de Lissajous, dont les périodes ne sont pas dans un rapport
 * simple : la figure ne se referme donc jamais tout à fait, et l'on ne voit
 * pas de cycle même en regardant longtemps. Les centres restent près de la
 * vue sans y être toujours — un centre bien au milieu donnerait une cible, et
 * une cible se regarde.
 */
export function centre(famille: number, secondes: number): Centre {
  const phase = famille * 2.2;
  const lent = secondes * 0.021;
  return famille === 0
    ? {
        x: 0.3 + 0.26 * Math.sin(lent + phase),
        y: 0.42 + 0.3 * Math.sin(lent * 1.37 + phase),
      }
    : {
        x: 0.72 + 0.24 * Math.sin(lent * 0.83 + phase),
        y: 0.56 + 0.28 * Math.sin(lent * 1.11 + phase),
      };
}

/** Le rayon d'un anneau, en hauteurs de vue. */
export function rayon(famille: number, rang: number, secondes: number): number {
  // Les deux familles ne respirent pas au même rythme : c'est la différence
  // des écarts qui fait glisser les figures d'interférence.
  const souffle = 1 + RESPIRE * Math.sin(secondes * (0.05 + famille * 0.017) + famille * 1.9);
  return ECART * souffle * (rang + 1);
}

/** La pâleur d'un anneau : les grands s'effacent, sinon le fond se remplit. */
export function paleur(rang: number): number {
  return PALEUR * (1 - (rang / ANNEAUX) * 0.72);
}

/**
 * Peint le fond.
 *
 * Le contexte est effacé par l'appelant : la séance peint son faisceau
 * par-dessus, et deux effaçages se marcheraient dessus.
 *
 * @param encre les trois composantes de la couleur, séparées par des virgules,
 *   comme le reste de la fenêtre les passe.
 */
export function dessinerMoire(
  ctx: CanvasRenderingContext2D,
  largeur: number,
  hauteur: number,
  secondes: number,
  encre: string,
): void {
  if (largeur <= 0 || hauteur <= 0) return;

  ctx.lineWidth = 1;
  for (let famille = 0; famille < FAMILLES; famille += 1) {
    const ou = centre(famille, secondes);
    const cx = ou.x * largeur;
    const cy = ou.y * hauteur;

    for (let rang = 0; rang < ANNEAUX; rang += 1) {
      const r = rayon(famille, rang, secondes) * hauteur;
      // Un anneau entièrement hors de la vue coûte autant qu'un autre à
      // tracer, et ne se voit pas. On s'arrête au premier.
      if (r > Math.hypot(largeur, hauteur)) break;
      ctx.strokeStyle = `rgba(${encre}, ${paleur(rang)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TOUR);
      ctx.stroke();
    }
  }
}
