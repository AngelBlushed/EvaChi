/**
 * La musique du menu.
 *
 * Elle n'est pas enregistrée, elle est composée à mesure : quelques accords
 * tenus et des notes éparses, décidés par une suite qui ne se répète pas. Une
 * boucle de deux minutes, même douce, s'entend au troisième passage et devient
 * alors une gêne ; celle-ci ne repasse jamais au même endroit.
 *
 * Ce module ne fait aucun son : il dit quoi jouer et quand. Il se vérifie donc
 * sans carte son, et c'est là que tiennent les choix musicaux — l'accord qui
 * suit, la note qui tombe, le silence qu'on laisse.
 */

/** Une note à jouer : hauteur MIDI, retard en secondes, durée, force. */
export interface Note {
  readonly midi: number;
  readonly delay: number;
  readonly duration: number;
  readonly gain: number;
}

/** Ce qu'il y a à jouer pendant une mesure. */
export interface Mesure {
  /** L'accord tenu en fond, en notes MIDI. */
  readonly accord: readonly number[];
  /** L'indice de cet accord, à repasser au tour suivant. */
  readonly indice: number;
  /** Les notes égrenées par-dessus, éventuellement aucune. */
  readonly notes: readonly Note[];
  /** La nouvelle graine, à repasser au tour suivant. */
  readonly graine: number;
}

/**
 * Les accords, en la mineur.
 *
 * Tous consonants et voisins les uns des autres : on passe de l'un à l'autre
 * sans que l'oreille ait quoi que ce soit à résoudre. C'est la condition pour
 * qu'une musique accompagne sans demander d'attention.
 */
export const ACCORDS: readonly (readonly number[])[] = [
  [45, 57, 60, 64], // la mineur
  [41, 53, 57, 60], // fa majeur
  [48, 55, 60, 64], // do majeur
  [43, 55, 59, 62], // sol majeur
  [38, 50, 57, 62], // ré mineur
  [40, 52, 59, 64], // mi mineur
];

/**
 * Les notes qu'on peut égrener par-dessus, quel que soit l'accord.
 *
 * La gamme pentatonique de la mineur : aucune de ses notes ne peut sonner
 * fausse sur ces six accords-là. C'est ce qui permet de tirer la mélodie au
 * hasard sans jamais tomber sur une fausse note.
 */
export const PENTATONIQUE: readonly number[] = [69, 72, 74, 76, 79, 81, 84, 86];

/** Durée d'une mesure, en secondes. Lente : c'est ce qui rend la chose douce. */
export const MESURE = 13;

/**
 * Le tirage pseudo-aléatoire.
 *
 * Un générateur à congruence linéaire, aux constantes de Numerical Recipes.
 * Déterministe — la même graine rend la même suite, ce qui permet de
 * l'éprouver — mais d'une période de quatre milliards : à une mesure toutes
 * les treize secondes, la musique se répéterait au bout de dix-sept siècles.
 */
export function tirage(graine: number): number {
  return (Math.imul(graine, 1664525) + 1013904223) >>> 0;
}

/** Ramène un tirage dans `[0, borne[`. */
function jusqua(graine: number, borne: number): number {
  return graine % borne;
}

/**
 * L'accord qui suit, jamais le même que le précédent.
 *
 * Répéter un accord donnerait l'impression d'un morceau arrêté ; c'est le seul
 * moment où l'on remarque une musique de fond.
 */
export function prochainAccord(precedent: number, graine: number): number {
  const saut = 1 + jusqua(graine, ACCORDS.length - 1);
  return (precedent + saut) % ACCORDS.length;
}

/**
 * Ce qu'on joue pendant la mesure suivante.
 *
 * Une mesure porte de zéro à trois notes. Le zéro compte autant que le reste :
 * une musique qui joue sans arrêt finit par occuper l'esprit, alors qu'un
 * silence de temps en temps la laisse passer au second plan.
 */
export function prochaineMesure(precedent: number, graine: number): Mesure {
  let etat = tirage(graine);
  const indice = prochainAccord(precedent, etat);

  etat = tirage(etat);
  const combien = jusqua(etat, 4) === 0 ? 0 : 1 + jusqua(etat >>> 8, 2);

  const notes: Note[] = [];
  for (let i = 0; i < combien; i += 1) {
    etat = tirage(etat);
    const midi = PENTATONIQUE[jusqua(etat, PENTATONIQUE.length)];
    etat = tirage(etat);
    // Réparties sur la mesure, jamais sur le premier temps : une note qui
    // tombe pile avec le changement d'accord s'entend comme un départ.
    const delay = 1.5 + (jusqua(etat, 1000) / 1000) * (MESURE - 3);
    etat = tirage(etat);
    const duration = 2.5 + (jusqua(etat, 1000) / 1000) * 3;
    etat = tirage(etat);
    // Les notes hautes sonnent plus fort à volume égal : on les rend plus
    // discrètes, sinon elles percent au-dessus de tout le reste.
    const gain = (0.1 + (jusqua(etat, 1000) / 1000) * 0.07) * (midi > 80 ? 0.6 : 1);
    notes.push({ midi, delay, duration, gain });
  }

  return { accord: ACCORDS[indice], indice, notes, graine: tirage(etat) };
}

/** La fréquence d'une note MIDI, en hertz. Le la 440 est le numéro 69. */
export function frequence(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
