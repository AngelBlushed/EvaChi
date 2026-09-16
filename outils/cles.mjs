/**
 * Relève les phrases françaises de l'interface et écrit `src/web/langues/cles.ts`.
 *
 * Générées plutôt que recopiées : une apostrophe droite prise pour une courbe,
 * et la traduction ne se trouve plus. C'est exactement ce qui est arrivé au
 * premier essai, à la main.
 *
 * Trois sources, parce que le texte vient de trois endroits :
 *   - la page, pour tout ce qui est écrit d'avance ;
 *   - le code de la fenêtre, pour ce qu'il compose lui-même — `t()` et `dit()` ;
 *   - `bios.rs`, pour les notes des micrologiciels, tenues côté natif.
 *
 *     node outils/cles.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const RACINE = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const WEB = path.join(RACINE, 'src', 'web');

/** Une phrase réduite à ce qui compte : sans retour à la ligne ni indentation. */
const propre = (texte) => texte.trim().replace(/\s+/g, ' ');

// --- La page ----------------------------------------------------------------

const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const corps = html
  .slice(html.indexOf('<body>'))
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<(style|script)[\s\S]*?<\/\1>/g, '');

/**
 * Les paragraphes dont le français mêle texte et mise en forme.
 *
 * Traduits d'un seul tenant, balises comprises : « — et » ou « revient en
 * arrière, » traduits séparément ne se recollent pas, l'ordre des mots
 * changeant d'une langue à l'autre.
 */
const blocs = [];
let reste = corps;
for (const trouve of corps.matchAll(/<(\w+)([^>]*\bdata-i18n-html\b[^>]*)>([\s\S]*?)<\/\1>/g)) {
  blocs.push(propre(trouve[3]));
  reste = reste.replace(trouve[0], '');
}

/** Ce qui n'est pas une phrase : des noms propres, des extensions, des exemples. */
const HORS = new Set([
  'EvaChi',
  'COSMAC VIP',
  'buildbot.libretro.com',
  'iso xex zar',
  String.raw`C:\…\xenia.exe`,
  '{rom}',
  '.bin',
  '.cue',
  'Select + L1',
  'Select + R1',
  'Select + Start',
  'Select + Y',
  'Fichier → Émulateurs',
  'SUPER-CHIP',
  'XO-CHIP',
  'Xbox 360',
]);

const page = new Set();
for (const morceau of reste.split(/<[^>]*>/)) {
  const phrase = propre(morceau);
  if (phrase.length > 1 && /[a-zà-ÿA-ZÀ-Ÿ]{2}/.test(phrase) && !HORS.has(phrase)) page.add(phrase);
}
for (const trouve of reste.matchAll(/(?:title|placeholder|aria-label)="([^"]+)"/g)) {
  const phrase = propre(trouve[1]);
  if (phrase.length > 1 && !HORS.has(phrase)) page.add(phrase);
}

// --- Le code de la fenêtre --------------------------------------------------

/**
 * Les phrases que le code compose lui-même.
 *
 * Relevées sur les appels plutôt que déclarées ailleurs : la clé est
 * littéralement l'argument écrit dans le source, et les deux ne peuvent donc
 * pas diverger.
 */
const SOURCES = ['main.ts', 'recents.ts', 'themes.ts', 'library.ts', 'catalog.ts'];
const code = new Set();
const appels =
  /\b(?:t|dit|aTraduire)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*[,)]/g;

const litteral = (brut) =>
  brut.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\t/g, '\t');

for (const fichier of SOURCES) {
  const source = fs.readFileSync(path.join(WEB, fichier), 'utf8');
  for (const trouve of source.matchAll(appels)) {
    const phrase = litteral(trouve[1] ?? trouve[2]);
    // `t(shelf.label)` et consorts n'ont rien de littéral : ils passent par
    // les clés déjà relevées ailleurs, et la capture ne les voit pas.
    if (phrase.length > 1) code.add(phrase);
  }
}

// --- Les notes des micrologiciels, tenues côté natif ------------------------

const bios = fs.readFileSync(path.join(RACINE, 'src-tauri', 'src', 'bios.rs'), 'utf8');
const notes = new Set();
for (const trouve of bios.matchAll(/note:\s*"((?:[^"\\]|\\.)*)"/g)) {
  notes.add(litteral(trouve[1]));
}

// --- Les noms qui s'accordent en nombre -------------------------------------

/**
 * Les noms comptés dans l'interface, et les catégories de pluriel possibles.
 *
 * Toutes les catégories sont demandées à chaque langue, même celles qu'elle
 * n'emploie pas : c'est plus simple à écrire qu'à deviner, et une forme en
 * trop ne coûte qu'une ligne. `Intl.PluralRules` choisira la bonne.
 */
const NOMS = [
  ['jeu', 'jeux'],
  ['cœur', 'cœurs'],
  ['fichier', 'fichiers'],
  ['émulateur', 'émulateurs'],
  ['capture', 'captures'],
];
const CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

// Garde-fou : un nom compté que cette liste ignorerait s'afficherait sans
// accord dans toutes les langues, et rien ne le signalerait.
const connus = new Set(NOMS.map(([singulier]) => singulier));
const mainTs = fs.readFileSync(path.join(WEB, 'main.ts'), 'utf8');
for (const trouve of mainTs.matchAll(/\bplural\([^,]+,\s*'([^']+)'/g)) {
  if (!connus.has(trouve[1])) {
    throw new Error(`« ${trouve[1] } » est compté mais absent de NOMS, dans outils/cles.mjs`);
  }
}

const pluriels = [];
for (const [singulier] of NOMS) {
  for (const categorie of CATEGORIES) pluriels.push(`${singulier}#${categorie}`);
}

// --- L'écriture -------------------------------------------------------------

const alphabetique = (a, b) => a.localeCompare(b, 'fr');

// Une même phrase peut venir de deux sources : « Réassigner… » est écrite dans
// la page, puis réécrite par le code quand on quitte la réassignation. Elle ne
// doit être demandée qu'une fois aux traducteurs.
const vues = new Set();
const inedites = (phrases) =>
  [...phrases].sort(alphabetique).filter((phrase) => {
    if (vues.has(phrase)) return false;
    vues.add(phrase);
    return true;
  });

const relevees = [
  ...inedites(page),
  ...inedites(code),
  ...inedites(notes),
  ...inedites(pluriels),
  ...inedites(blocs),
];

/**
 * L'ordre déjà en place, s'il y en a un.
 *
 * Chaque langue est un tableau aligné sur cet ordre : c'est le rang qui fait le
 * lien. Ranger les clés à neuf à chaque relevé décalerait donc les cinquante
 * fichiers dès qu'une phrase change dans la page — et il faudrait tout
 * retraduire pour une virgule.
 *
 * Les clés connues gardent donc leur rang, et les nouvelles s'ajoutent à la
 * fin. Ajouter une phrase devient alors une ligne à écrire par langue, au lieu
 * de trois cent vingt-huit.
 */
const cheminCles = path.join(WEB, 'langues', 'cles.ts');
let ancien = [];
if (fs.existsSync(cheminCles)) {
  const source = fs.readFileSync(cheminCles, 'utf8');
  const debut = source.indexOf('= [\n');
  if (debut > 0) {
    ancien = source
      .slice(debut + 3, source.indexOf('\n];', debut))
      .split('\n')
      .map((ligne) => ligne.trim())
      .filter(Boolean)
      .map((ligne) => JSON.parse(ligne.replace(/,$/, '')));
  }
}

const encore = new Set(relevees);
const gardees = ancien.filter((clef) => encore.has(clef));
const connues = new Set(gardees);
const neuves = relevees.filter((clef) => !connues.has(clef));
const perdues = ancien.filter((clef) => !encore.has(clef));

// Une clé retirée décale tout ce qui la suivait, et rend les traductions
// fausses sans que rien ne s'en plaigne. On refuse plutôt que de le faire en
// silence : `--tasser` rejoue le relevé à neuf, et il faut alors retraduire.
if (perdues.length > 0 && !process.argv.includes('--tasser')) {
  throw new Error(
    `${perdues.length} clés ont disparu du source, ce qui décalerait toutes les ` +
      `traductions :\n- ${perdues.join('\n- ')}\n` +
      `Relancez avec --tasser si vous acceptez de reprendre les traductions.`,
  );
}

const toutes = process.argv.includes('--tasser') ? relevees : [...gardees, ...neuves];

const fichier = `/**
 * Les phrases françaises de l'interface, dans l'ordre.
 *
 * Ce fichier est écrit par \`outils/cles.mjs\`, à partir du contenu réel de la
 * page, du code de la fenêtre et des notes tenues côté natif : une apostrophe
 * droite prise pour une courbe suffirait à ce qu'une traduction ne se trouve
 * plus, et c'est arrivé au premier essai. Chaque langue fournit ses
 * traductions dans ce même ordre, ce qui rend l'alignement vérifiable.
 *
 * Le rang d'une clé connue ne change plus : les nouvelles s'ajoutent à la fin.
 * Ajouter une phrase demande donc une ligne par langue, pas une traduction
 * entière. L'ordre n'est plus alphabétique pour cette raison.
 *
 * ${blocs.length} d'entre elles portent des balises : ce sont les paragraphes dont le
 * français mêle texte et mise en forme, traduits d'un seul tenant parce que
 * l'ordre des mots change d'une langue à l'autre.
 *
 * Les clés en \`nom#categorie\` sont les formes d'un nom compté. Elles ne
 * s'affichent jamais telles quelles : \`compte()\` choisit la bonne selon les
 * règles de la langue.
 */

export const CLES: readonly string[] = [
${toutes.map((phrase) => `  ${JSON.stringify(phrase)},`).join('\n')}
];

/**
 * Les rangs des phrases qui portent des balises.
 *
 * Relevés sur les clés elles-mêmes plutôt que comptés depuis la fin : les
 * nouvelles clés s'ajoutant après, « les sept dernières » a cessé d'être vrai.
 */
export const AVEC_BALISES: readonly number[] = CLES.reduce<number[]>(
  (rangs, clef, rang) => (/<\\/?[a-z]+>/.test(clef) ? [...rangs, rang] : rangs),
  [],
);
`;

fs.mkdirSync(path.join(WEB, 'langues'), { recursive: true });
fs.writeFileSync(path.join(WEB, 'langues', 'cles.ts'), fichier);
console.log(
  `${toutes.length} clés : ${page.size} de la page, ${code.size} du code, ` +
    `${notes.size} de bios.rs, ${pluriels.length} formes de pluriel, ${blocs.length} blocs`,
);
if (neuves.length > 0 && gardees.length > 0) {
  console.log(
    `${neuves.length} nouvelles, aux rangs ${gardees.length + 1} à ${toutes.length} :\n- ` +
      neuves.join('\n- '),
  );
}
