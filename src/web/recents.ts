/**
 * Les jeux récemment joués, et le temps passé dessus.
 *
 * Avec cinq cents jeux, la question posée neuf fois sur dix en ouvrant
 * l'application n'est pas « lequel choisir » mais « où en étais-je ». C'est la
 * première chose qu'une console de salon met sous la main, et la seule qui
 * évite de traverser toute la bibliothèque pour reprendre la partie d'hier.
 *
 * Ce module ne touche à rien : il reçoit une liste et en rend une autre. Les
 * règles qui comptent — l'ordre, le plafond, le cumul du temps — se vérifient
 * donc sans fenêtre.
 */

/** Un jeu joué, avec ce qu'on en retient. */
export interface Recent {
  /** Le chemin du fichier : c'est lui qui identifie le jeu. */
  readonly path: string;
  readonly name: string;
  /** Le dossier d'où il vient, pour retrouver sa jaquette. */
  readonly folder: string;
  /** Dernière partie, en secondes depuis 1970. */
  readonly played: number;
  /** Temps cumulé, en secondes. */
  readonly seconds: number;
}

/**
 * Combien de jeux on retient.
 *
 * Assez pour couvrir ce qu'on a touché ces dernières semaines, pas assez pour
 * que la liste redevienne une bibliothèque — auquel cas elle ne servirait plus
 * à rien.
 */
export const COMBIEN = 24;

/**
 * Note qu'on vient de jouer à un jeu.
 *
 * Le jeu remonte en tête et son temps s'ajoute à ce qui était déjà compté : on
 * veut le total d'heures passées dessus, pas celui de la dernière partie.
 */
export function remember(
  liste: readonly Recent[],
  jeu: { path: string; name: string; folder: string },
  now: number,
  seconds = 0,
): Recent[] {
  const connu = liste.find((autre) => autre.path === jeu.path);

  const tete: Recent = {
    path: jeu.path,
    name: jeu.name,
    folder: jeu.folder,
    played: now,
    seconds: (connu?.seconds ?? 0) + Math.max(0, Math.round(seconds)),
  };

  return [tete, ...liste.filter((autre) => autre.path !== jeu.path)].slice(0, COMBIEN);
}

/** Retire un jeu de la liste. */
export function forget(liste: readonly Recent[], path: string): Recent[] {
  return liste.filter((autre) => autre.path !== path);
}

/**
 * Relit une liste venue du stockage, en écartant ce qui n'a plus de forme.
 *
 * Le stockage peut avoir été écrit par une version précédente, ou à la main.
 * Une entrée sans chemin ne désigne aucun jeu : la garder ferait une ligne qui
 * ne mène nulle part.
 */
export function parse(brut: string | null): Recent[] {
  try {
    const lu = JSON.parse(brut ?? '[]');
    if (!Array.isArray(lu)) return [];

    return lu
      .filter(
        (entree): entree is Recent =>
          entree !== null &&
          typeof entree === 'object' &&
          typeof entree.path === 'string' &&
          entree.path.length > 0 &&
          typeof entree.name === 'string',
      )
      .map((entree) => ({
        path: entree.path,
        name: entree.name,
        folder: typeof entree.folder === 'string' ? entree.folder : '',
        played: Number.isFinite(entree.played) ? entree.played : 0,
        seconds: Number.isFinite(entree.seconds) ? Math.max(0, entree.seconds) : 0,
      }))
      .slice(0, COMBIEN);
  } catch {
    return [];
  }
}

/**
 * Le temps de jeu, écrit comme on le dirait.
 *
 * Arrondi franchement : à personne il n'importe d'avoir joué 3 h 12 min 47 s.
 * Les premières secondes sont nommées à part — « moins d'une minute » se lit,
 * « 0 min » ressemble à une panne.
 */
export function formatPlaytime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return 'moins d’une minute';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, '0')}`;
}

/**
 * Depuis quand, écrit comme on le dirait.
 *
 * « il y a 3 jours » plutôt qu'une date : sur une liste de jeux récents, c'est
 * l'écart qui renseigne, pas le jour du calendrier.
 */
export function formatWhen(played: number, now: number): string {
  const ecart = Math.max(0, now - played);
  if (ecart < 90) return 'à l’instant';
  if (ecart < 3600) return `il y a ${Math.round(ecart / 60)} min`;
  if (ecart < 86_400) {
    const heures = Math.round(ecart / 3600);
    return `il y a ${heures} h`;
  }
  const jours = Math.round(ecart / 86_400);
  return jours === 1 ? 'hier' : `il y a ${jours} jours`;
}
