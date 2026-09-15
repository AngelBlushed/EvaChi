/**
 * Le son de l'interface : la musique du menu et les petits bruits de sélection.
 *
 * Tout est synthétisé. Aucun fichier à télécharger, rien à décoder, rien dont
 * il faille démêler la licence — et la musique ne peut donc pas boucler,
 * puisqu'il n'y a pas de boucle.
 *
 * Un contexte audio à part de celui du jeu, délibérément. Le son du jeu est le
 * chemin qu'il ne faut casser sous aucun prétexte ; le partager pour économiser
 * un objet ferait courir un risque sans contrepartie. Les deux ne jouent de
 * toute façon jamais ensemble : la musique s'arrête quand une partie commence.
 */

import { MESURE, frequence, prochaineMesure } from './ambience.ts';

/** Le contexte, ouvert au premier son et jamais refermé. */
let contexte: AudioContext | null = null;
/** Le volume général de l'interface, entre la synthèse et la sortie. */
let sortie: GainNode | null = null;

/**
 * Prépare la sortie audio.
 *
 * À appeler depuis un geste de l'utilisateur : le navigateur refuse d'ouvrir
 * un contexte autrement, et un contexte refusé reste suspendu en silence sans
 * lever la moindre erreur — la panne la plus difficile à voir.
 */
function ouvrir(): { ctx: AudioContext; out: GainNode } | null {
  if (!contexte) {
    try {
      contexte = new AudioContext();
    } catch {
      return null;
    }
    sortie = contexte.createGain();
    sortie.gain.value = 1;
    sortie.connect(contexte.destination);
  }
  if (contexte.state === 'suspended') void contexte.resume();
  return sortie ? { ctx: contexte, out: sortie } : null;
}

// --- Petits bruits ----------------------------------------------------------

/**
 * Le « tic » d'un déplacement, et celui d'un lancement.
 *
 * Deux sons très courts, faits d'une ou deux sinusoïdes qui s'éteignent
 * aussitôt. Le déplacement est bref et haut, le lancement monte d'une quinte :
 * l'oreille distingue un mouvement d'une validation sans qu'on ait rien à
 * apprendre.
 *
 * L'enveloppe ne descend jamais jusqu'à zéro mais jusqu'à un millième :
 * `exponentialRampToValueAtTime` refuse la valeur nulle, et une rampe linéaire
 * laisserait un claquement à la coupure.
 */
function bip(frequences: readonly number[], duree: number, force: number): void {
  const audio = ouvrir();
  if (!audio) return;
  const { ctx, out } = audio;

  const depart = ctx.currentTime;
  for (const [rang, hertz] of frequences.entries()) {
    const quand = depart + rang * duree * 0.55;
    const oscillateur = ctx.createOscillator();
    oscillateur.type = 'triangle';
    oscillateur.frequency.value = hertz;

    const enveloppe = ctx.createGain();
    enveloppe.gain.setValueAtTime(0.0001, quand);
    enveloppe.gain.exponentialRampToValueAtTime(force, quand + 0.006);
    enveloppe.gain.exponentialRampToValueAtTime(0.0001, quand + duree);

    oscillateur.connect(enveloppe);
    enveloppe.connect(out);
    oscillateur.start(quand);
    oscillateur.stop(quand + duree + 0.02);
  }
}

/** Le déplacement d'une case à l'autre. */
export function ticDeplacement(): void {
  bip([1180], 0.045, 0.06);
}

/** La validation : on lance le jeu. */
export function ticValidation(): void {
  bip([784, 1175], 0.13, 0.08);
}

// --- Musique ----------------------------------------------------------------

/** Ce qui joue en ce moment, pour pouvoir tout arrêter d'un coup. */
let fond: GainNode | null = null;
let minuterie = 0;
let accordCourant = 0;
let graine = (Date.now() >>> 0) || 1;

/** Vrai quand la musique tourne. */
export function musiqueEnCours(): boolean {
  return fond !== null;
}

/**
 * Programme une mesure, puis la suivante.
 *
 * Les notes sont posées à l'avance sur l'horloge du contexte audio, pas jouées
 * à la volée : une note déclenchée par un minuteur du navigateur arriverait
 * avec le retard de ce minuteur, et une musique lente rend ce retard audible.
 */
function mesureSuivante(ctx: AudioContext, vers: GainNode): void {
  const suite = prochaineMesure(accordCourant, graine);
  accordCourant = suite.indice;
  graine = suite.graine;

  const depart = ctx.currentTime + 0.1;

  // L'accord, tenu tout du long, très doux et très filtré : c'est le tapis.
  for (const midi of suite.accord) {
    const oscillateur = ctx.createOscillator();
    oscillateur.type = 'sine';
    oscillateur.frequency.value = frequence(midi);
    // Un souffle de désaccord : deux sinusoïdes rigoureusement justes sonnent
    // comme un appareil de mesure, pas comme un instrument.
    oscillateur.detune.value = ((midi * 37) % 11) - 5;

    const enveloppe = ctx.createGain();
    enveloppe.gain.setValueAtTime(0.0001, depart);
    enveloppe.gain.exponentialRampToValueAtTime(0.072, depart + MESURE * 0.35);
    enveloppe.gain.exponentialRampToValueAtTime(0.0001, depart + MESURE + 1.5);

    oscillateur.connect(enveloppe);
    enveloppe.connect(vers);
    oscillateur.start(depart);
    oscillateur.stop(depart + MESURE + 2);
  }

  // Les notes égrenées par-dessus, adoucies par un filtre passe-bas.
  for (const note of suite.notes) {
    const quand = depart + note.delay;
    const oscillateur = ctx.createOscillator();
    oscillateur.type = 'triangle';
    oscillateur.frequency.value = frequence(note.midi);

    const doux = ctx.createBiquadFilter();
    doux.type = 'lowpass';
    doux.frequency.value = 1600;

    const enveloppe = ctx.createGain();
    enveloppe.gain.setValueAtTime(0.0001, quand);
    enveloppe.gain.exponentialRampToValueAtTime(note.gain, quand + 0.35);
    enveloppe.gain.exponentialRampToValueAtTime(0.0001, quand + note.duration);

    oscillateur.connect(doux);
    doux.connect(enveloppe);
    enveloppe.connect(vers);
    oscillateur.start(quand);
    oscillateur.stop(quand + note.duration + 0.05);
  }

  minuterie = window.setTimeout(() => mesureSuivante(ctx, vers), MESURE * 1000);
}

/**
 * Lance la musique, en la faisant monter doucement.
 *
 * Une musique qui démarre à plein volume surprend ; trois secondes de montée
 * la font paraître déjà là.
 */
export function demarrerMusique(): void {
  if (fond) return;
  const audio = ouvrir();
  if (!audio) return;
  const { ctx, out } = audio;

  fond = ctx.createGain();
  fond.gain.setValueAtTime(0.0001, ctx.currentTime);
  fond.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 3);
  fond.connect(out);

  mesureSuivante(ctx, fond);
}

/**
 * Arrête la musique en la laissant redescendre.
 *
 * Une coupure nette s'entend comme une panne, surtout au moment où un jeu se
 * lance : on croirait que c'est lui qui a fait taire le reste.
 */
export function arreterMusique(): void {
  clearTimeout(minuterie);
  const partant = fond;
  fond = null;
  if (!partant || !contexte) return;

  const fin = contexte.currentTime + 1.2;
  partant.gain.cancelScheduledValues(contexte.currentTime);
  partant.gain.setValueAtTime(Math.max(partant.gain.value, 0.0001), contexte.currentTime);
  partant.gain.exponentialRampToValueAtTime(0.0001, fin);
  // Débranché bien après la fin de la descente : les notes déjà programmées
  // continuent de sonner à travers lui, et couper trop tôt les tronquerait.
  setTimeout(() => partant.disconnect(), (MESURE + 3) * 1000);
}
