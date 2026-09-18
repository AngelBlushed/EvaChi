/**
 * Les fiches de triche : les lire, et décider si l'une va vraiment à un jeu.
 *
 * Le projet libretro publie une fiche par jeu, dans un format commun. Ce
 * qu'elle contient, en revanche, n'a rien de commun : chaque console a son
 * dialecte de codes, et EvaChi n'en décode aucun — c'est le cœur qui s'en
 * charge. Ici on ne fait que deux choses, et toutes deux sans rien interpréter :
 * découper le fichier, et dire s'il s'adresse bien à ce jeu-là.
 *
 * **Le rapprochement est volontairement sévère.** Les adresses d'une triche
 * sont celles d'une version précise : l'édition japonaise et l'européenne d'un
 * même jeu ne sont pas le même programme, et une révision non plus. Une fiche
 * appliquée à la mauvaise version n'écrit pas un peu à côté — elle écrit
 * ailleurs, et ce qu'on y trouve n'a aucun rapport.
 *
 * On préfère donc dire « il n'y a rien pour ce jeu » que proposer un à-peu-près.
 * Un jeu sans triche déçoit une fois ; une triche qui abîme une partie fait
 * douter de tout le reste.
 */

import { normalise, regions } from './covers.ts';

/** Une triche, telle que la fiche la déclare. */
export interface Triche {
  /** Ce qu'elle fait, dans les mots de celui qui l'a écrite. */
  readonly nom: string;
  /** Le code, dans le dialecte de la console. On ne le lit pas. */
  readonly code: string;
}

/**
 * Le plus grand nombre de triches qu'on accepte d'une fiche.
 *
 * Les plus fournies en portent quelques milliers — celles de Nintendo DS
 * dépassent le millier sans peine. Au-delà de dix mille, ce n'est plus une
 * fiche, c'est un fichier abîmé ou autre chose qu'on aurait pris pour une
 * fiche, et le lire entier ne ferait que remplir la mémoire.
 */
const MAX_TRICHES = 10_000;

/**
 * Découpe une fiche.
 *
 * Le format tient en trois lignes par triche :
 *
 * ```
 * cheat0_desc = "Vies infinies"
 * cheat0_code = "0754:00+0756:01"
 * cheat0_enable = false
 * ```
 *
 * Les guillemets peuvent enjamber plusieurs lignes — certaines descriptions
 * expliquent une manipulation sur deux ou trois — d'où une lecture qui ne se
 * fie pas aux fins de ligne.
 *
 * Ce qui n'a pas de code est écarté : une triche sans code ne ferait rien, et
 * l'afficher quand même serait promettre ce qui n'arrivera pas.
 */
export function lireFiche(texte: string): Triche[] {
  const champs = new Map<number, { nom?: string; code?: string }>();

  for (const trouve of texte.matchAll(/cheat(\d+)_(desc|code)\s*=\s*"([\s\S]*?)"/g)) {
    const rang = Number(trouve[1]);
    if (!Number.isSafeInteger(rang) || rang < 0 || rang >= MAX_TRICHES) continue;

    const entree = champs.get(rang) ?? {};
    // Les retours à la ligne d'une description deviennent des espaces : elle
    // s'affiche sur une ligne, dans une liste.
    const valeur = trouve[3].replace(/\s+/g, ' ').trim();
    if (trouve[2] === 'desc') entree.nom = valeur;
    else entree.code = valeur;
    champs.set(rang, entree);
  }

  return [...champs.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, entree]) => Boolean(entree.code))
    .map(([rang, entree]) => ({
      nom: entree.nom || `#${rang + 1}`,
      code: entree.code as string,
    }));
}

/**
 * Les régions qu'un nom annonce.
 *
 * Bâtie sur celle des jaquettes, avec les étiquettes que les fiches emploient
 * en plus : `[EU]`, `(FR)`, `(GER)`. Une jaquette de la mauvaise région reste
 * une jaquette ; une triche de la mauvaise région ne marche pas.
 */
export function regionsDe(titre: string): Set<string> {
  const trouvees = regions(titre);
  for (const groupe of titre.matchAll(/[([]([^)\]]*)[)\]]/g)) {
    for (const mot of groupe[1].split(/[,\s]+/)) {
      const propre = mot.trim().toLowerCase();
      if (propre === 'eu' || propre === 'pal') trouvees.add('europe');
      else if (propre === 'us' || propre === 'ntsc') trouvees.add('usa');
      else if (propre === 'jpn' || propre === 'ntsc-j') trouvees.add('japan');
    }
  }
  return trouvees;
}

/**
 * Les mots qui désignent une autre édition du jeu, et non une autre région.
 *
 * Une démonstration, une version d'essai, une traduction de fan : ce n'est pas
 * le même programme, et ses adresses n'ont aucune raison de coïncider.
 */
const EDITIONS = [
  'demo',
  'beta',
  'proto',
  'prototype',
  'sample',
  'preview',
  'kiosk',
  'alpha',
  'unl',
  'pirate',
  'hack',
  'aftermarket',
];

/**
 * Les mots qui ne nomment qu'un appareil à triches.
 *
 * `(GameShark)`, `(Code Breaker)`, `(Rumbles)` : ils disent d'où viennent les
 * codes, pas de quel jeu il s'agit. Les prendre pour des éditions écarterait
 * la moitié des fiches, qui n'en portent pas d'autre marque.
 */
const APPAREILS = [
  'gameshark',
  'codebreaker',
  'code',
  'breaker',
  'action',
  'replay',
  'game',
  'genie',
  'gamegenie',
  'par',
  'rumbles',
  'xploder',
  'shark',
];

/** Les marques d'édition qu'un nom porte. */
export function editionsDe(titre: string): Set<string> {
  const trouvees = new Set<string>();
  for (const groupe of titre.matchAll(/[([]([^)\]]*)[)\]]/g)) {
    const dedans = groupe[1].toLowerCase();
    // Une traduction de fan se marque « T-En », « T+Fr » : le texte est
    // réécrit, et souvent déplacé avec lui.
    if (/\bt[-+][a-z]{2}\b/.test(dedans)) trouvees.add('traduction');
    for (const mot of dedans.split(/[^a-z0-9]+/)) {
      if (EDITIONS.includes(mot) && !APPAREILS.includes(mot)) trouvees.add(mot);
    }
  }
  return trouvees;
}

/**
 * La révision qu'un nom annonce, vide s'il n'en annonce aucune.
 *
 * « Rev A », « Rev 2 », « v1.1 » : une révision est une recompilation, et rien
 * ne garantit qu'une adresse y soit restée à sa place.
 */
export function revisionDe(titre: string): string {
  const trouve = titre.match(/[([][^)\]]*?\b(?:rev\s*([a-z0-9]+)|v(\d+(?:\.\d+)*))\b[^)\]]*[)\]]/i);
  if (!trouve) return '';
  return (trouve[1] ?? trouve[2] ?? '').toLowerCase();
}

/** Vrai si deux jeux de régions peuvent désigner la même version. */
function regionsCompatibles(jeu: Set<string>, fiche: Set<string>): boolean {
  // Ce qui n'annonce rien ne contredit rien : beaucoup de fiches anciennes
  // portent le seul titre, et les écarter toutes reviendrait à n'en garder
  // aucune sur les consoles les plus modestes.
  if (jeu.size === 0 || fiche.size === 0) return true;
  // Une édition mondiale est la même partout : c'est le seul cas où deux
  // étiquettes différentes désignent le même programme.
  if (jeu.has('world') || fiche.has('world')) return true;
  for (const region of jeu) {
    if (fiche.has(region)) return true;
  }
  return false;
}

/** Vrai si deux ensembles portent exactement les mêmes marques. */
function memesMarques(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const marque of a) {
    if (!b.has(marque)) return false;
  }
  return true;
}

/**
 * Vrai si cette fiche s'adresse bien à ce jeu.
 *
 * Quatre conditions, et il les faut toutes :
 *
 * 1. **le même titre, au mot près.** Pas « approchant » : « After Burner » et
 *    « After Burner Complete » sont deux jeux, et le rapprochement souple des
 *    jaquettes les confondait ;
 * 2. **des régions qui ne se contredisent pas** ;
 * 3. **la même révision**, ou aucune des deux côtés ;
 * 4. **la même édition** : une démonstration, une version d'essai ou une
 *    traduction de fan ne sont pas le jeu.
 */
export function correspond(jeu: string, fiche: string): boolean {
  const titre = normalise(jeu);
  if (!titre || titre !== normalise(fiche)) return false;
  if (!regionsCompatibles(regionsDe(jeu), regionsDe(fiche))) return false;
  if (revisionDe(jeu) !== revisionDe(fiche)) return false;
  return memesMarques(editionsDe(jeu), editionsDe(fiche));
}

/**
 * Les fiches qui vont à ce jeu, de la plus sûre à la moins sûre.
 *
 * Plusieurs peuvent convenir — un même jeu a souvent une fiche par appareil à
 * triches — et il n'y a aucune raison d'en écarter : elles se complètent. Les
 * régions qui se répondent explicitement passent devant, puis les plus courtes,
 * qui sont les éditions ordinaires.
 *
 * La liste est vide quand rien ne correspond, et c'est une réponse : « il n'y a
 * rien pour ce jeu » vaut mieux qu'un à-peu-près.
 */
export function fichesPour(jeu: string, fiches: readonly string[]): string[] {
  const attendues = regionsDe(jeu);

  return fiches
    .filter((fiche) => correspond(jeu, fiche))
    .map((fiche) => {
      const siennes = regionsDe(fiche);
      const explicite = attendues.size > 0 && siennes.size > 0;
      return { fiche, rang: explicite ? 0 : 1 };
    })
    .sort((a, b) => a.rang - b.rang || a.fiche.length - b.fiche.length)
    .map((entree) => entree.fiche);
}
