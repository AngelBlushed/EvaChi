/**
 * L'air que la poussière traverse.
 *
 * Le fond du carrousel portait, derrière ses grains, une couche de brume :
 * une dizaine de taches larges et floues, peintes au dégradé radial. Elles
 * remplissaient le vide, mais elles le remplissaient mal — un flou se voit
 * comme un flou, et rien d'autre.
 *
 * À leur place, des touches : cent quatre-vingts petits traits d'un pixel,
 * tous couchés dans le sens d'un courant invisible qui s'incurve très
 * lentement. Aucun ne traverse l'écran ; chacun fait de dix à trente pixels,
 * si bien que l'œil n'a rien à suivre — il lit une direction, comme la touche
 * d'un pinceau sur une toile sombre. Le fond cesse d'être un décor derrière
 * les grains et devient l'air que les grains traversent.
 *
 * Le champ vient d'une fonction de courant, et non de trois sinus pris au
 * hasard. La différence n'est pas théorique : un champ tiré d'une fonction de
 * courant est à divergence nulle par construction, donc il n'existe aucun
 * point où les traits convergent et formeraient une tache. C'est exactement ce
 * qu'on ne veut pas derrière des jaquettes.
 *
 * Tout est analytique : la position d'un trait à un instant donné ne dépend
 * pas de celle d'avant. Une trame sautée, une pause, une épreuve à cinq mille
 * secondes rendent le même dessin.
 */

/** Deux fois pi, écrit une fois. */
const TOUR = Math.PI * 2;

/**
 * Une onde de la fonction de courant.
 *
 * Trois suffisent : deux donnent un damier, quatre un bruit où l'on ne lit
 * plus de direction. Leurs périodes ne sont pas multiples l'une de l'autre,
 * faute de quoi le motif se répéterait à l'écran.
 */
interface Onde {
  /** Amplitude. */
  readonly a: number;
  /** Nombre de tours sur la largeur. */
  readonly n: number;
  /** Nombre de tours sur la hauteur. */
  readonly m: number;
  /** Tours par seconde — c'est la lenteur avec laquelle le courant vire. */
  readonly w: number;
  /** Décalage, pour que les trois ne s'alignent jamais. */
  readonly p: number;
}

export const ONDES: readonly Onde[] = [
  { a: 1.0, n: 2, m: 1, w: 0.009, p: 0 },
  { a: 0.62, n: 1, m: 2, w: -0.0063, p: 0.275 },
  { a: 0.44, n: 3, m: -2, w: 0.0044, p: 0.543 },
];

/**
 * La vitesse du courant en un point, à un instant donné.
 *
 * C'est le gradient de la fonction de courant, tourné d'un quart de tour : la
 * vitesse suit les lignes de niveau au lieu de les traverser. Les trois mêmes
 * cosinus servent aux deux composantes — trois calculs par trait, pas six.
 */
export function vitesse(x: number, y: number, secondes: number): { ux: number; uy: number } {
  let ux = 0;
  let uy = 0;
  for (const onde of ONDES) {
    const angle = TOUR * (onde.n * x + onde.m * y + onde.w * secondes + onde.p);
    const cos = Math.cos(angle);
    ux += onde.a * onde.m * cos;
    uy -= onde.a * onde.n * cos;
  }
  return { ux, uy };
}

/** Une touche de pinceau : où elle est, sa longueur, et sa pâleur. */
export interface Marque {
  /** Position de départ, en fraction de la largeur. */
  readonly x: number;
  /** Position de départ, en fraction de la hauteur. */
  readonly y: number;
  /** Longueur, en fraction de la hauteur. */
  readonly longueur: number;
  /** Ce qui multiplie sa dérive : toutes ne vont pas à la même allure. */
  readonly lenteur: number;
  /** Le plan auquel elle appartient, de 0 (lointain) à 2 (proche). */
  readonly plan: number;
}

/**
 * Les trois pâleurs, du plan le plus lointain au plus proche.
 *
 * Assez pour qu'on sente une direction, pas assez pour qu'on la regarde : au
 * repos, les traits couvrent un pour cent de l'écran. La brume qu'ils
 * remplacent en couvrait le quart.
 */
export const PALEURS: readonly number[] = [0.05, 0.085, 0.13];

/** Combien de touches, et le réseau sur lequel on les sème. */
const COLONNES = 18;
const RANGEES = 10;
export const COMBIEN = COLONNES * RANGEES;

/** Le tirage pseudo-aléatoire, aux constantes de Numerical Recipes. */
function tirage(graine: number): number {
  return (Math.imul(graine, 1664525) + 1013904223) >>> 0;
}

/**
 * Sème les touches sur un réseau tremblé.
 *
 * Un semis franchement aléatoire laisse des trous et des paquets, que l'œil
 * lit comme une forme ; un réseau régulier se lit comme un quadrillage. On
 * pose donc une touche par case et on la bouscule à l'intérieur.
 *
 * @param graine de quoi rejouer exactement le même semis.
 */
export function semerCourant(graine = 20_260_919): Marque[] {
  let etat = tirage(graine >>> 0);
  const suivant = (): number => {
    etat = tirage(etat);
    return etat / 4_294_967_296;
  };
  const entre = (bas: number, haut: number): number => bas + (haut - bas) * suivant();

  const marques: Marque[] = [];
  for (let colonne = 0; colonne < COLONNES; colonne += 1) {
    for (let rangee = 0; rangee < RANGEES; rangee += 1) {
      marques.push({
        x: (colonne + entre(0.15, 0.85)) / COLONNES,
        y: (rangee + entre(0.15, 0.85)) / RANGEES,
        longueur: entre(0.01, 0.026),
        lenteur: entre(0.8, 1.25),
        plan: Math.min(PALEURS.length - 1, Math.floor(suivant() * PALEURS.length)),
      });
    }
  }
  return marques;
}

/** Les touches du fond. */
export const MARQUES: readonly Marque[] = semerCourant();

/** Ramène une fraction dans `[0, 1[`, quel que soit le nombre de tours faits. */
function cycle(valeur: number): number {
  const reste = valeur % 1;
  return reste < 0 ? reste + 1 : reste;
}

/**
 * Où se trouve une touche à un instant donné.
 *
 * La même forme que la poussière — une dérive plus un balancement — mais plus
 * lente : les traits appartiennent au même temps que les grains, et c'est ce
 * qui fait qu'on les lit ensemble plutôt que comme deux décors superposés.
 */
export function situerMarque(marque: Marque, secondes: number): { x: number; y: number } {
  return {
    x: cycle(
      marque.x +
        0.0042 * marque.lenteur * secondes +
        0.006 * Math.sin(TOUR * (0.011 * marque.lenteur * secondes + marque.x)),
    ),
    y: cycle(
      marque.y -
        0.0025 * marque.lenteur * secondes +
        0.005 * Math.sin(TOUR * (0.008 * marque.lenteur * secondes + marque.y)),
    ),
  };
}

/**
 * En deçà de cette vitesse, la touche raccourcit.
 *
 * Le champ s'annule en quelques points isolés, et la direction y bascule d'un
 * coup : un trait qui les traverse pivoterait de soixante degrés en une trame,
 * ce qui est exactement le scintillement qu'un fond ne doit pas produire. On
 * fait donc raccourcir la touche à mesure que l'air se calme — elle n'est plus
 * qu'un point quand elle bascule, et la bascule ne se voit pas. C'est d'ailleurs
 * ce que ferait un pinceau : une touche dans l'air immobile est courte.
 */
const SOUFFLE = 0.6;

/**
 * Le trait d'une touche : son milieu, et le demi-écart de ses deux bouts.
 *
 * Les deux composantes de l'écart se mesurent en fractions de la **hauteur**,
 * jamais l'une en largeur et l'autre en hauteur : autrement le trait serait
 * cisaillé par le format de la fenêtre, et sa longueur dépendrait de son
 * angle.
 */
export function trait(
  marque: Marque,
  secondes: number,
): { x: number; y: number; dx: number; dy: number } {
  const { x, y } = situerMarque(marque, secondes);
  const { ux, uy } = vitesse(x, y, secondes);
  const norme = Math.max(Math.hypot(ux, uy), 1e-9);
  const demi = (marque.longueur / 2) * Math.min(1, norme / SOUFFLE);
  return { x, y, dx: (demi * ux) / norme, dy: (demi * uy) / norme };
}

/**
 * Peint le courant sur un canevas déjà dimensionné.
 *
 * Trois passes, une par pâleur : un trait pâle se lit comme lointain, et c'est
 * ce qui redonne la profondeur que la brume tenait. Un seul chemin par passe,
 * et donc trois `stroke` en tout pour cent quatre-vingts segments.
 *
 * Une touche à cheval sur un bord est peinte des deux côtés, comme les grains :
 * sans ce doublon, elle disparaîtrait d'un coup au bord de l'écran.
 *
 * @param encre couleur des traits, en `r, g, b`.
 */
export function dessinerCourant(
  ctx: CanvasRenderingContext2D,
  largeur: number,
  hauteur: number,
  secondes: number,
  encre: string,
): void {
  ctx.lineWidth = 1;
  ctx.lineCap = 'butt';

  for (const [plan, paleur] of PALEURS.entries()) {
    ctx.strokeStyle = `rgba(${encre}, ${paleur})`;
    ctx.beginPath();

    for (const marque of MARQUES) {
      if (marque.plan !== plan) continue;

      const { x, y, dx, dy } = trait(marque, secondes);
      const px = x * largeur;
      const py = y * hauteur;
      const ex = dx * hauteur;
      const ey = dy * hauteur;
      const demi = (marque.longueur / 2) * hauteur;

      const abscisses =
        px < demi ? [px, px + largeur] : px > largeur - demi ? [px, px - largeur] : [px];
      const ordonnees =
        py < demi ? [py, py + hauteur] : py > hauteur - demi ? [py, py - hauteur] : [py];

      for (const cx of abscisses) {
        for (const cy of ordonnees) {
          ctx.moveTo(cx - ex, cy - ey);
          ctx.lineTo(cx + ex, cy + ey);
        }
      }
    }

    ctx.stroke();
  }
}
