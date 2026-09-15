/**
 * Le fond animé du menu.
 *
 * Les rubans qui traversent lentement l'écran d'une console de salon. Ce sont
 * des ondes, pas une vidéo : quelques sinusoïdes superposées, redessinées à
 * chaque trame. Rien à télécharger, rien à décoder, et la couleur suit le thème
 * en cours au lieu d'être peinte dans une image.
 *
 * Le calcul de l'onde est ici, à part du dessin, pour qu'il se vérifie sans
 * canevas : c'est lui qui décide si le mouvement est doux ou s'il bat.
 */

/** Un ruban : sa hauteur de repos, son amplitude, sa longueur d'onde, sa vitesse. */
export interface Band {
  /** Hauteur de repos, en fraction de la hauteur totale (0 en haut, 1 en bas). */
  readonly base: number;
  /** Écart maximal à cette hauteur, dans la même unité. */
  readonly amplitude: number;
  /** Nombre d'ondulations sur toute la largeur. */
  readonly periods: number;
  /** Tours par seconde. Négative, le ruban va dans l'autre sens. */
  readonly speed: number;
  /** Décalage de départ, pour que deux rubans ne soient pas jumeaux. */
  readonly phase: number;
  /** Opacité du ruban, de 0 à 1. */
  readonly opacity: number;
}

/**
 * Les rubans du fond, du plus lointain au plus proche.
 *
 * Trois vitesses différentes et des périodes qui ne se divisent pas entre elles :
 * sans cela les rubans se rejoignent régulièrement et le fond se met à battre,
 * ce qui se remarque tout de suite et fatigue.
 */
export const BANDS: readonly Band[] = [
  { base: 0.40, amplitude: 0.10, periods: 1.0, speed: 0.021, phase: 0.0, opacity: 0.05 },
  { base: 0.54, amplitude: 0.13, periods: 1.3, speed: -0.017, phase: 1.7, opacity: 0.06 },
  { base: 0.68, amplitude: 0.09, periods: 0.7, speed: 0.029, phase: 3.1, opacity: 0.07 },
  { base: 0.81, amplitude: 0.11, periods: 1.9, speed: -0.024, phase: 4.6, opacity: 0.06 },
  { base: 0.93, amplitude: 0.06, periods: 1.1, speed: 0.034, phase: 5.9, opacity: 0.08 },
];

/** Deux fois pi, écrit une fois. */
const TOUR = Math.PI * 2;

/**
 * La hauteur d'un ruban à une abscisse donnée, en fraction de la hauteur.
 *
 * Deux sinusoïdes plutôt qu'une : une seule donne une vague de piscine, trop
 * régulière pour qu'on y croie. La seconde, plus courte, plus lente et trois
 * fois moins ample, suffit à casser la régularité sans faire de vagues.
 *
 * @param x fraction de la largeur, de 0 à 1.
 * @param seconds temps écoulé, en secondes.
 */
export function wave(x: number, seconds: number, band: Band): number {
  const principale = Math.sin(TOUR * (x * band.periods + seconds * band.speed) + band.phase);
  const seconde = Math.sin(TOUR * (x * band.periods * 2.3 - seconds * band.speed * 0.6) + band.phase * 1.7);
  return band.base + band.amplitude * (principale + 0.33 * seconde) * 0.75;
}

/** L'écart maximal qu'un ruban peut prendre par rapport à sa hauteur de repos. */
export function swing(band: Band): number {
  return band.amplitude * 1.33 * 0.75;
}

/**
 * Peint le fond sur un canevas déjà dimensionné.
 *
 * Chaque ruban est rempli depuis sa courbe jusqu'au bas de l'image : ce sont
 * des nappes qui se recouvrent, pas des traits, et c'est ce recouvrement qui
 * donne la profondeur.
 *
 * @param seconds temps écoulé, en secondes.
 * @param ink couleur des rubans, en `r, g, b`.
 */
export function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seconds: number,
  ink: string,
): void {
  ctx.clearRect(0, 0, width, height);

  // Un point tous les huit pixels : au-delà les courbes se voient anguleuses,
  // en deçà on calcule pour rien — l'écart tient dans l'épaisseur du trait.
  const pas = Math.max(6, Math.round(width / 120));

  for (const band of BANDS) {
    ctx.beginPath();
    ctx.moveTo(0, wave(0, seconds, band) * height);
    for (let x = pas; x <= width; x += pas) {
      ctx.lineTo(x, wave(x / width, seconds, band) * height);
    }
    ctx.lineTo(width, wave(1, seconds, band) * height);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = `rgba(${ink}, ${band.opacity})`;
    ctx.fill();
  }
}
