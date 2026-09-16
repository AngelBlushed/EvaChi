/**
 * Les langues de l'interface.
 *
 * Le français sert de clé. Une table de traduction associe donc la phrase
 * française à sa version dans une autre langue, et le code continue de se lire
 * en français : `t('Ajouter un dossier…')` plutôt que
 * `t('toolbar.addFolder')`. C'est le choix de gettext, et il a deux mérites
 * ici — le fichier HTML n'a pas une seule étiquette à porter, et une phrase
 * sans traduction s'affiche dans la langue d'origine au lieu de montrer une
 * clé technique à l'utilisateur.
 *
 * La contrepartie est qu'une phrase française modifiée perd sa traduction.
 * Une épreuve le rattrape : elle relève les clés inconnues des tables.
 */

/** Une table : la phrase française, puis sa traduction. */
export type Table = Readonly<Record<string, string>>;

/** Une langue proposée. */
export interface Langue {
  /** Étiquette BCP 47, celle qu'attendent `Intl` et l'attribut `lang`. */
  readonly code: string;
  /** Le nom de la langue, écrit dans cette langue. */
  readonly nom: string;
  /** Vrai pour les écritures de droite à gauche. */
  readonly rtl?: boolean;
  readonly table: Table;
}

/**
 * Le pluriel, selon les règles de la langue.
 *
 * Le français en a deux formes, le russe trois, l'arabe six, le japonais une
 * seule. Compter « 2 jeu » ou « 5 игра » se remarque immédiatement et donne
 * l'impression d'une traduction bâclée — ce qu'elle serait.
 *
 * Les formes sont rangées sous la phrase française suivie d'un dièse et de la
 * catégorie : `jeu#one`, `jeu#few`, `jeu#many`, `jeu#other`.
 */
const SEPARATEUR = '#';

let courante: Langue | null = null;
let regles: Intl.PluralRules | null = null;

/** La langue en cours, ou le français si rien n'a été choisi. */
export function langueCourante(): Langue | null {
  return courante;
}

/**
 * Marque une phrase à traduire, sans la traduire tout de suite.
 *
 * Certains libellés sont rangés dans une table — les thèmes, les modes
 * d'affichage, les raccourcis — et ne s'affichent qu'ailleurs, où `t()` les
 * prend au passage. L'outil qui relève les clés ne voit alors rien : il lit
 * `t(theme.label)`, et le texte français est trois fichiers plus loin.
 *
 * Cette fonction ne fait rien, sinon rendre la phrase visible à l'outil. C'est
 * le `N_()` de gettext, et il existe pour exactement la même raison.
 */
export function aTraduire<T extends string>(phrase: T): T {
  return phrase;
}

/**
 * L'étiquette à donner à `Intl`.
 *
 * Les dates, les heures et les écarts de temps ne se traduisent pas mot à mot :
 * le navigateur sait déjà les écrire dans chaque langue, pourvu qu'on lui dise
 * laquelle.
 */
export function localeCourante(): string {
  return courante?.code ?? 'fr';
}

/**
 * Remplit les trous d'une phrase traduite.
 *
 * Les valeurs sont désignées par leur rang — `{0}`, `{1}` — et non collées bout
 * à bout : l'ordre des mots change d'une langue à l'autre, et une phrase
 * assemblée par concaténation ne peut pas suivre.
 */
export function dit(phrase: string, ...valeurs: readonly (string | number)[]): string {
  return t(phrase).replace(/\{(\d)\}/g, (_, rang: string) => String(valeurs[Number(rang)] ?? ''));
}

/** Pose la langue à utiliser. `null` revient au français d'origine. */
export function poserLangue(langue: Langue | null): void {
  courante = langue;
  regles = langue ? new Intl.PluralRules(langue.code) : null;
}

/**
 * Traduit une phrase française.
 *
 * Rend la phrase d'origine quand la traduction manque : mieux vaut une phrase
 * française au milieu d'une interface anglaise qu'une case vide ou un nom de
 * variable.
 */
export function t(phrase: string): string {
  return courante?.table[phrase] ?? phrase;
}

/**
 * Accorde un nom avec un nombre.
 *
 * @param nom la phrase française au singulier, telle qu'elle sert de clé.
 * @param formes les deux formes françaises, pour le cas sans traduction.
 */
export function compte(nombre: number, singulier: string, pluriel: string): string {
  if (!courante || !regles) {
    return `${nombre} ${nombre > 1 ? pluriel : singulier}`;
  }

  const categorie = regles.select(nombre);
  const forme =
    courante.table[`${singulier}${SEPARATEUR}${categorie}`] ??
    courante.table[`${singulier}${SEPARATEUR}other`] ??
    courante.table[singulier] ??
    (nombre > 1 ? pluriel : singulier);

  return `${nombre} ${forme}`;
}

/**
 * Les éléments dont on traduit aussi un attribut.
 *
 * Un libellé d'aide ou un texte de substitution se lit autant que le reste de
 * l'interface, et rien ne le distingue à l'œil d'un texte ordinaire.
 */
const ATTRIBUTS = ['title', 'placeholder', 'aria-label'] as const;

/**
 * Le texte d'origine de chaque nœud déjà traduit.
 *
 * Sans cette mémoire, changer de langue une seconde fois chercherait la
 * traduction d'un texte déjà traduit — et ne trouverait rien.
 */
const origines = new WeakMap<Node, string>();
const originesAttributs = new WeakMap<Element, Map<string, string>>();

/** Le texte français d'origine d'un nœud, retenu au premier passage. */
function origine(noeud: Node, actuel: string): string {
  const connu = origines.get(noeud);
  if (connu !== undefined) return connu;
  origines.set(noeud, actuel);
  return actuel;
}

/**
 * Traduit tout le texte déjà posé dans la page.
 *
 * On parcourt les nœuds de texte plutôt que les éléments : une phrase coupée
 * par un `<strong>` compte pour trois nœuds, et remplacer le contenu de
 * l'élément entier effacerait la mise en forme.
 */
export function traduireDocument(racine: ParentNode = document): void {
  // D'abord les blocs entiers. Une phrase coupée par un `<strong>` compte pour
  // trois nœuds de texte, et traduire « — et » ou « revient en arrière, »
  // séparément ne veut rien dire : l'ordre des mots change d'une langue à
  // l'autre, et les morceaux ne se recollent pas.
  for (const bloc of racine.querySelectorAll('[data-i18n-html]')) {
    const brut = origine(bloc, bloc.innerHTML).trim().replace(/\s+/g, ' ');
    const traduit = t(brut);
    if (bloc.innerHTML.trim().replace(/\s+/g, ' ') !== traduit) bloc.innerHTML = traduit;
  }

  const marcheur = document.createTreeWalker(racine as Node, NodeFilter.SHOW_TEXT, {
    acceptNode(noeud) {
      // Ni le style, ni les scripts : leur contenu n'est pas du texte lu. Ni
      // l'intérieur d'un bloc, déjà traduit d'un seul tenant.
      const parent = noeud.parentElement;
      if (!parent || parent.closest('style, script, [data-i18n-html]')) {
        return NodeFilter.FILTER_REJECT;
      }
      return noeud.nodeValue && noeud.nodeValue.trim().length > 1
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const noeuds: Text[] = [];
  for (let noeud = marcheur.nextNode(); noeud; noeud = marcheur.nextNode()) {
    noeuds.push(noeud as Text);
  }

  for (const noeud of noeuds) {
    const brut = origine(noeud, noeud.nodeValue ?? '');
    // Les espaces d'indentation du fichier source ne font pas partie de la
    // phrase : on les met de côté et on les remet après.
    const avant = brut.slice(0, brut.length - brut.trimStart().length);
    const apres = brut.slice(brut.trimEnd().length);
    const phrase = brut.trim().replace(/\s+/g, ' ');
    const traduite = t(phrase);
    if (traduite !== phrase || noeud.nodeValue !== brut) {
      noeud.nodeValue = `${avant}${traduite}${apres}`;
    }
  }

  for (const element of (racine as ParentNode).querySelectorAll('*')) {
    for (const attribut of ATTRIBUTS) {
      const actuel = element.getAttribute(attribut);
      if (actuel === null || actuel.trim().length < 2) continue;

      let memoire = originesAttributs.get(element);
      if (!memoire) {
        memoire = new Map();
        originesAttributs.set(element, memoire);
      }
      const brut = memoire.get(attribut) ?? actuel;
      memoire.set(attribut, brut);

      element.setAttribute(attribut, t(brut));
    }
  }
}

/**
 * La langue que le système suggère, parmi celles qu'on propose.
 *
 * On compare d'abord l'étiquette entière — `pt-BR` n'est pas `pt` — puis la
 * seule langue. Rien ne correspond, on garde le français.
 */
export function langueDuSysteme(
  proposees: readonly Langue[],
  demandees: readonly string[],
): Langue | null {
  for (const demandee of demandees) {
    const exacte = proposees.find(
      (langue) => langue.code.toLowerCase() === demandee.toLowerCase(),
    );
    if (exacte) return exacte;
  }
  for (const demandee of demandees) {
    const racine = demandee.split('-')[0].toLowerCase();
    const proche = proposees.find((langue) => langue.code.split('-')[0].toLowerCase() === racine);
    if (proche) return proche;
  }
  return null;
}
