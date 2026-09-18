/**
 * Le fond animé du carrousel.
 *
 * Une poussière qui monte : des grains de tailles inégales, répartis sur
 * quatre plans, qui traversent lentement l'écran en oblique. C'est le pendant
 * des rubans du menu animé — même matière, même couleur prise au thème, rien
 * à télécharger — mais l'inverse de leur mouvement : là où les rubans sont de
 * larges nappes qui glissent de côté, ce sont ici de petits points qui
 * s'élèvent, et le fond respire au lieu d'ondoyer.
 *
 * Les plans donnent la profondeur, et c'est la parallaxe qui la fait sentir :
 * un grain lointain est petit, pâle et lent ; un grain proche est gros, franc
 * et rapide. Sans cet écart, la poussière se lit comme un motif plat.
 *
 * Le calcul de la position est ici, à part du dessin, pour qu'il se vérifie
 * sans canevas : c'est lui qui décide si le mouvement est doux ou s'il saute.
 */

/** Deux fois pi, écrit une fois. */
const TOUR = Math.PI * 2;

/**
 * Un plan de la poussière, du plus lointain au plus proche.
 *
 * Les bornes sont données par plan plutôt que par grain : c'est le plan qui
 * fait la profondeur, et laisser chaque grain tirer sa taille au hasard sur
 * toute l'étendue rendrait les quatre couches indiscernables.
 */
export interface Couche {
  /** Combien de grains ce plan porte. */
  readonly combien: number;
  /** Rayon minimal et maximal, en fraction de la hauteur. */
  readonly rayon: readonly [number, number];
  /** Vitesse minimale et maximale, en largeurs d'écran par seconde. */
  readonly vitesse: readonly [number, number];
  /** Opacité de référence des grains de ce plan. */
  readonly opacite: number;
  /**
   * Vrai quand les grains de ce plan s'éteignent vers leur bord.
   *
   * Un petit point se peint d'un trait sans qu'on voie son contour. Une tache
   * large, non : peinte d'une seule teinte, elle se lit comme un rond posé sur
   * le fond, ce qu'un fond ne doit surtout pas donner à voir.
   */
  readonly flou: boolean;
}

/**
 * Les quatre plans.
 *
 * Le premier n'est pas de la poussière mais de la brume : quelques taches
 * larges et presque invisibles, qui remplissent le vide entre les grains. Sans
 * elles, le fond est un semis de points sur du noir et se lit comme un écran
 * de veille ; avec elles, il a une épaisseur. C'est pour cela qu'il fait
 * exception à la règle des trois autres — le plus grand, le plus lent, le plus
 * pâle.
 */
export const COUCHES: readonly Couche[] = [
  { combien: 10, rayon: [0.06, 0.11], vitesse: [0.003, 0.007], opacite: 0.11, flou: true },
  { combien: 24, rayon: [0.0025, 0.0045], vitesse: [0.008, 0.014], opacite: 0.08, flou: false },
  { combien: 18, rayon: [0.0045, 0.0075], vitesse: [0.014, 0.024], opacite: 0.12, flou: false },
  { combien: 12, rayon: [0.008, 0.013], vitesse: [0.024, 0.04], opacite: 0.19, flou: false },
];

/** Un grain : où il est parti, à quelle allure, et de quelle taille. */
export interface Grain {
  /** Position de départ, en fraction de la largeur. */
  readonly x: number;
  /** Position de départ, en fraction de la hauteur. */
  readonly y: number;
  /** Rayon, en fraction de la hauteur. */
  readonly rayon: number;
  /** Largeurs d'écran par seconde, vers la droite. */
  readonly vitesse: number;
  /** Hauteurs d'écran par seconde, vers le haut. */
  readonly montee: number;
  /** Amplitude du va-et-vient latéral, en fraction de la largeur. */
  readonly balan: number;
  /** Tours par seconde de ce va-et-vient. */
  readonly cadence: number;
  readonly opacite: number;
  /** Vrai si le grain s'éteint vers son bord au lieu d'avoir un contour. */
  readonly flou: boolean;
}

/**
 * Le tirage pseudo-aléatoire, aux constantes de Numerical Recipes.
 *
 * Déterministe : la même graine rend la même poussière. C'est ce qui permet
 * d'éprouver un fond dont chaque grain est tiré au sort, et c'est aussi ce qui
 * garantit qu'il a la même allure d'un lancement à l'autre — un décor qui
 * change de composition à chaque ouverture se remarque.
 */
function tirage(graine: number): number {
  return (Math.imul(graine, 1664525) + 1013904223) >>> 0;
}

/**
 * Sème la poussière.
 *
 * @param graine de quoi rejouer exactement le même semis.
 */
export function semer(graine = 20_260_918): Grain[] {
  let etat = tirage(graine >>> 0);
  const suivant = (): number => {
    etat = tirage(etat);
    return etat / 4_294_967_296;
  };
  const entre = (bas: number, haut: number): number => bas + (haut - bas) * suivant();

  const grains: Grain[] = [];
  for (const couche of COUCHES) {
    for (let reste = couche.combien; reste > 0; reste -= 1) {
      const vitesse = entre(couche.vitesse[0], couche.vitesse[1]);
      grains.push({
        x: suivant(),
        y: suivant(),
        rayon: entre(couche.rayon[0], couche.rayon[1]),
        vitesse,
        // La montée suit la vitesse latérale : un grain qui filerait de côté
        // en restant à sa hauteur, ou l'inverse, casse l'illusion du plan.
        montee: vitesse * entre(0.35, 0.8),
        balan: entre(0.004, 0.018),
        cadence: entre(0.01, 0.045),
        // Les grains d'un même plan ne sont pas jumeaux : sans cet écart, la
        // poussière se voit comme quatre nappes de points identiques.
        opacite: couche.opacite * entre(0.7, 1.15),
        flou: couche.flou,
      });
    }
  }
  return grains;
}

/** La poussière du fond. */
export const GRAINS: readonly Grain[] = semer();

/** Ramène une fraction dans `[0, 1[`, quel que soit le nombre de tours faits. */
function cycle(valeur: number): number {
  const reste = valeur % 1;
  return reste < 0 ? reste + 1 : reste;
}

/**
 * Où se trouve un grain à un instant donné, en fractions d'écran.
 *
 * Le va-et-vient latéral compte autant que la dérive : sans lui, les grains
 * montent en lignes parfaitement droites et le fond devient une pluie à
 * l'envers. Sa cadence est très lente — un tour toutes les trente secondes au
 * plus vif — pour qu'il se sente sans se voir.
 */
export function situer(grain: Grain, secondes: number): { x: number; y: number } {
  const derive = grain.balan * Math.sin(TOUR * (secondes * grain.cadence + grain.x));
  return {
    x: cycle(grain.x + secondes * grain.vitesse + derive),
    y: cycle(grain.y - secondes * grain.montee),
  };
}

/**
 * Pose un grain.
 *
 * Les grands s'éteignent vers leur bord, les petits non : un dégradé par point
 * coûterait soixante fois plus cher par trame pour un fondu large de deux
 * pixels, que personne ne verrait.
 */
function poser(
  ctx: CanvasRenderingContext2D,
  grain: Grain,
  x: number,
  y: number,
  rayon: number,
  encre: string,
): void {
  if (grain.flou) {
    const fondu = ctx.createRadialGradient(x, y, 0, x, y, rayon);
    fondu.addColorStop(0, `rgba(${encre}, ${grain.opacite})`);
    fondu.addColorStop(1, `rgba(${encre}, 0)`);
    ctx.fillStyle = fondu;
  } else {
    ctx.fillStyle = `rgba(${encre}, ${grain.opacite})`;
  }
  ctx.beginPath();
  ctx.arc(x, y, rayon, 0, TOUR);
  ctx.fill();
}

/**
 * Peint le fond sur un canevas déjà dimensionné.
 *
 * Un grain qui sort par un bord rentre par celui d'en face. Tant qu'il est à
 * cheval, il est peint des deux côtés : sans ce doublon, les gros grains de
 * brume disparaîtraient d'un coup au bord de l'écran, ce qui est exactement ce
 * qu'un fond ne doit pas faire remarquer.
 *
 * @param secondes temps écoulé, en secondes.
 * @param encre couleur des grains, en `r, g, b`.
 */
export function dessiner(
  ctx: CanvasRenderingContext2D,
  largeur: number,
  hauteur: number,
  secondes: number,
  encre: string,
): void {
  ctx.clearRect(0, 0, largeur, hauteur);

  for (const grain of GRAINS) {
    const rayon = grain.rayon * hauteur;
    if (rayon <= 0) continue;

    const { x, y } = situer(grain, secondes);
    const px = x * largeur;
    const py = y * hauteur;

    const abscisses =
      px < rayon ? [px, px + largeur] : px > largeur - rayon ? [px, px - largeur] : [px];
    const ordonnees =
      py < rayon ? [py, py + hauteur] : py > hauteur - rayon ? [py, py - hauteur] : [py];

    for (const cx of abscisses) {
      for (const cy of ordonnees) poser(ctx, grain, cx, cy, rayon, encre);
    }
  }
}
