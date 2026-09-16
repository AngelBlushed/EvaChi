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
 * Une durée écrite dans la langue demandée.
 *
 * `Intl` sait déjà écrire « 30 min », « 30 Min. » et « 30 分 » ; le faire à la
 * main reviendrait à recopier dans une table ce que le navigateur porte déjà.
 */
function duree(valeur: number, unite: 'minute' | 'hour', langue: string): string {
  return new Intl.NumberFormat(langue, {
    style: 'unit',
    unit: unite,
    unitDisplay: 'short',
    maximumFractionDigits: 0,
  }).format(valeur);
}

/**
 * Le temps de jeu, écrit comme on le dirait.
 *
 * Arrondi franchement : à personne il n'importe d'avoir joué 3 h 12 min 47 s.
 * Les premières secondes sont nommées à part — « moins d'une minute » se lit,
 * « 0 min » ressemble à une panne. Cette phrase-là est la seule qui passe par
 * la table de traduction ; les unités viennent d'`Intl`.
 */
export function formatPlaytime(
  seconds: number,
  langue = 'fr',
  moinsDUneMinute = 'moins d’une minute',
): string {
  if (!Number.isFinite(seconds) || seconds < 60) return moinsDUneMinute;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return duree(minutes, 'minute', langue);

  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0
    ? duree(heures, 'hour', langue)
    : `${duree(heures, 'hour', langue)} ${String(reste).padStart(2, '0')}`;
}

/**
 * Depuis quand, écrit comme on le dirait.
 *
 * « il y a 3 jours » plutôt qu'une date : sur une liste de jeux récents, c'est
 * l'écart qui renseigne, pas le jour du calendrier. `Intl` connaît la tournure
 * de chaque langue, « hier » et « вчера » compris — et l'ordre des mots, qui
 * place le nombre avant en français et après en japonais.
 *
 * Les minutes et les heures sont dites court, les jours en toutes lettres :
 * « il y a 3 j » se lit mal, « il y a 10 minutes » prend trop de place.
 */
export function formatWhen(played: number, now: number, langue = 'fr'): string {
  const ecart = Math.max(0, now - played);
  const bref = new Intl.RelativeTimeFormat(langue, { numeric: 'auto', style: 'short' });

  if (ecart < 90) return bref.format(0, 'second');
  if (ecart < 3600) return bref.format(-Math.round(ecart / 60), 'minute');
  if (ecart < 86_400) return bref.format(-Math.round(ecart / 3600), 'hour');

  const long = new Intl.RelativeTimeFormat(langue, { numeric: 'auto' });
  return long.format(-Math.round(ecart / 86_400), 'day');
}
