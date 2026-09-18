/**
 * La recherche d'une valeur dans la mémoire de la console.
 *
 * Le principe est celui des outils de triche depuis toujours : on ne sait pas
 * où le jeu range ses vies, mais on sait combien on en a. On relève donc toute
 * la mémoire, on en écarte tout ce qui ne vaut pas ce chiffre-là, on joue
 * jusqu'à ce que le chiffre change, on recommence — et il ne reste bientôt
 * qu'une poignée d'adresses, souvent une seule.
 *
 * Ce module ne parle ni au cœur ni à l'écran : on lui donne deux relevés de
 * mémoire et il dit quelles adresses tiennent encore. C'est donc là que se
 * vérifie la seule chose qui compte — qu'on ne propose jamais une adresse qui
 * n'a pas passé toutes les épreuves.
 */

/** Les largeurs qu'une valeur peut prendre. Rien d'autre n'a de sens. */
export const TAILLES = [1, 2, 4] as const;
export type Taille = (typeof TAILLES)[number];

/**
 * Ce qu'on demande à la mémoire entre deux relevés.
 *
 * `egale` sert quand on connaît le chiffre — c'est le cas le plus sûr, et le
 * plus rapide. Les quatre autres servent quand on ne le connaît pas : une
 * barre de vie sans nombre écrit dessus se trouve à coups de « ça a baissé ».
 */
export type Question = 'egale' | 'monte' | 'baisse' | 'change' | 'stable';

/** La valeur d'une adresse dans un relevé, ou `null` si elle en déborde. */
export function valeurA(releve: Uint8Array, adresse: number, taille: Taille): number | null {
  if (adresse < 0 || adresse + taille > releve.length) return null;
  let valeur = 0;
  // Petit-boutiste : c'est l'ordre de toutes les consoles qu'EvaChi héberge,
  // et celui dans lequel le cœur nous rend sa mémoire.
  for (let octet = taille - 1; octet >= 0; octet -= 1) {
    valeur = valeur * 256 + releve[adresse + octet];
  }
  return valeur;
}

/**
 * Le premier tri : toutes les adresses de la mémoire, ou celles qui valent un
 * chiffre donné.
 *
 * Les adresses sont prises de deux en deux pour une valeur large : une valeur
 * de quatre octets rangée de travers n'existe pas, et parcourir octet par
 * octet rendrait quatre adresses pour la même chose — dont trois fausses.
 */
export function premierTri(
  releve: Uint8Array,
  taille: Taille,
  attendue: number | null,
): number[] {
  const trouvees: number[] = [];
  const pas = taille;
  for (let adresse = 0; adresse + taille <= releve.length; adresse += pas) {
    if (attendue === null) {
      trouvees.push(adresse);
      continue;
    }
    if (valeurA(releve, adresse, taille) === attendue) trouvees.push(adresse);
  }
  return trouvees;
}

/**
 * Le tri suivant : ce qui reste après une nouvelle question.
 *
 * On compare le relevé neuf au précédent, adresse par adresse. Une adresse qui
 * a disparu — la mémoire a rétréci — est écartée : mieux vaut la perdre que la
 * garder sur la foi d'un relevé qui ne la contient plus.
 */
export function trier(
  avant: Uint8Array,
  apres: Uint8Array,
  adresses: readonly number[],
  taille: Taille,
  question: Question,
  attendue: number | null,
): number[] {
  return adresses.filter((adresse) => {
    const vieille = valeurA(avant, adresse, taille);
    const neuve = valeurA(apres, adresse, taille);
    if (vieille === null || neuve === null) return false;

    switch (question) {
      case 'egale':
        return attendue !== null && neuve === attendue;
      case 'monte':
        return neuve > vieille;
      case 'baisse':
        return neuve < vieille;
      case 'change':
        return neuve !== vieille;
      case 'stable':
        return neuve === vieille;
    }
  });
}

/** Une adresse retenue, avec ce qu'elle vaut en ce moment. */
export interface Trouvee {
  readonly adresse: number;
  readonly valeur: number;
}

/**
 * Combien d'adresses on accepte de montrer.
 *
 * Au-delà, la liste n'apprend rien : on ne choisit pas une adresse parmi deux
 * mille, on continue de chercher. Le compte, lui, s'affiche toujours — c'est
 * lui qui dit si l'on approche.
 */
export const MONTRABLES = 40;

/** Les adresses retenues, avec leur valeur, prêtes à être montrées. */
export function montrer(
  releve: Uint8Array,
  adresses: readonly number[],
  taille: Taille,
): Trouvee[] {
  return adresses.slice(0, MONTRABLES).flatMap((adresse) => {
    const valeur = valeurA(releve, adresse, taille);
    return valeur === null ? [] : [{ adresse, valeur }];
  });
}

/**
 * La plus grande valeur qui tienne dans cette largeur.
 *
 * Sert à borner ce qu'on écrit : une valeur trop grande pour son emplacement
 * déborderait sur l'adresse voisine, qui n'a rien demandé. C'est exactement le
 * genre d'écriture qui abîme une partie sans qu'on comprenne pourquoi.
 */
export function plafond(taille: Taille): number {
  return 256 ** taille - 1;
}

/**
 * Ramène une valeur dans ce qui tient à cette adresse.
 *
 * On borne plutôt qu'on ne refuse : quelqu'un qui tape 999 dans un emplacement
 * d'un octet veut « le plus possible », et 255 est la bonne réponse.
 */
export function borner(valeur: number, taille: Taille): number {
  if (!Number.isFinite(valeur)) return 0;
  return Math.min(Math.max(Math.trunc(valeur), 0), plafond(taille));
}
