/**
 * Écrit `src/web/langues/index.ts` à partir de la liste ci-dessous.
 *
 * Cinquante langues, cinquante lignes d'import : les écrire à la main, c'est
 * se tromper une fois sur trente. La liste est ici, le registre en découle.
 *
 * Une langue dont le fichier manque encore est simplement omise : la fenêtre
 * reste compilable pendant qu'on traduit.
 *
 *     node outils/langues.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const RACINE = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const DOSSIER = path.join(RACINE, 'src', 'web', 'langues');

/**
 * Les langues proposées.
 *
 * Le nom est écrit dans la langue elle-même : c'est ainsi qu'on reconnaît la
 * sienne dans une liste qu'on ne sait pas lire. Le code est l'étiquette
 * BCP 47, celle qu'attendent `Intl` et l'attribut `lang` — les accords de
 * pluriel, les dates et les tailles de fichier en dépendent.
 *
 * L'ordre écrit ici n'a pas d'importance : le registre est rangé par nom au
 * moment d'être écrit. Le français n'est donc pas en tête — quelqu'un qui ne
 * lit pas la langue en cours cherche le nom de la sienne, et le cherche là où
 * l'alphabet le met.
 */
export const LANGUES = [
  { code: 'af', nom: 'Afrikaans' },
  { code: 'ar', nom: 'العربية', rtl: true },
  { code: 'bg', nom: 'Български' },
  { code: 'bn', nom: 'বাংলা' },
  { code: 'ca', nom: 'Català' },
  { code: 'cs', nom: 'Čeština' },
  { code: 'da', nom: 'Dansk' },
  { code: 'de', nom: 'Deutsch' },
  { code: 'el', nom: 'Ελληνικά' },
  { code: 'en', nom: 'English' },
  { code: 'es', nom: 'Español' },
  { code: 'et', nom: 'Eesti' },
  { code: 'eu', nom: 'Euskara' },
  { code: 'fa', nom: 'فارسی', rtl: true },
  { code: 'fi', nom: 'Suomi' },
  { code: 'fil', nom: 'Filipino' },
  { code: 'fr', nom: 'Français', source: true },
  { code: 'ga', nom: 'Gaeilge' },
  { code: 'gl', nom: 'Galego' },
  { code: 'he', nom: 'עברית', rtl: true },
  { code: 'hi', nom: 'हिन्दी' },
  { code: 'hr', nom: 'Hrvatski' },
  { code: 'hu', nom: 'Magyar' },
  { code: 'id', nom: 'Bahasa Indonesia' },
  { code: 'is', nom: 'Íslenska' },
  { code: 'it', nom: 'Italiano' },
  { code: 'ja', nom: '日本語' },
  { code: 'ko', nom: '한국어' },
  { code: 'lt', nom: 'Lietuvių' },
  { code: 'lv', nom: 'Latviešu' },
  { code: 'ms', nom: 'Bahasa Melayu' },
  { code: 'nb', nom: 'Norsk bokmål' },
  { code: 'nl', nom: 'Nederlands' },
  { code: 'pl', nom: 'Polski' },
  { code: 'pt', nom: 'Português' },
  { code: 'pt-BR', nom: 'Português (Brasil)' },
  { code: 'ro', nom: 'Română' },
  { code: 'ru', nom: 'Русский' },
  { code: 'sk', nom: 'Slovenčina' },
  { code: 'sl', nom: 'Slovenščina' },
  { code: 'sr', nom: 'Српски' },
  { code: 'sv', nom: 'Svenska' },
  { code: 'sw', nom: 'Kiswahili' },
  { code: 'ta', nom: 'தமிழ்' },
  { code: 'th', nom: 'ไทย' },
  { code: 'tr', nom: 'Türkçe' },
  { code: 'uk', nom: 'Українська' },
  { code: 'vi', nom: 'Tiếng Việt' },
  { code: 'zh-Hans', nom: '简体中文' },
  { code: 'zh-Hant', nom: '繁體中文' },
].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

/** Le nom du fichier d'une langue : son code, en minuscules. */
export const fichierDe = (code) => `${code.toLowerCase()}.ts`;

/** Le nom de la constante exportée : son code, sans tiret. */
export const variableDe = (code) =>
  code.replace(/-(.)/g, (_, lettre) => lettre.toUpperCase()).replace(/-/g, '');

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  const traduites = LANGUES.filter(
    (langue) => !langue.source && fs.existsSync(path.join(DOSSIER, fichierDe(langue.code))),
  );
  const manquantes = LANGUES.filter(
    (langue) => !langue.source && !fs.existsSync(path.join(DOSSIER, fichierDe(langue.code))),
  );

  const imports = traduites
    .map((langue) => `import { ${variableDe(langue.code)} } from './${fichierDe(langue.code)}';`)
    .join('\n');

  const entrees = LANGUES.filter((langue) => langue.source || traduites.includes(langue))
    .map((langue) => {
      if (langue.source) return '  FRANCAIS,';
      const rtl = langue.rtl ? ' rtl: true,' : '';
      return `  { code: ${JSON.stringify(langue.code)}, nom: ${JSON.stringify(langue.nom)},${rtl} table: table(${variableDe(langue.code)}) },`;
    })
    .join('\n');

  const listes = traduites
    .map((langue) => `  { code: ${JSON.stringify(langue.code)}, textes: ${variableDe(langue.code)} },`)
    .join('\n');

  const fichier = `/**
 * Les langues proposées.
 *
 * Ce fichier est écrit par \`outils/langues.mjs\`. Ajouter une langue tient en
 * deux gestes : une ligne dans la liste de cet outil, un fichier de
 * traductions à côté de celui-ci.
 *
 * Le français n'a pas de table : c'est la langue d'origine, et ses phrases
 * sont les clés. Choisir « Français » revient donc à n'appliquer aucune
 * traduction, ce qui est aussi le repli quand une phrase manque ailleurs.
 */

import type { Langue } from '../i18n.ts';
import { table } from './table.ts';

${imports}

/** Le français, sans table : les clés sont déjà en français. */
export const FRANCAIS: Langue = { code: 'fr', nom: 'Français', table: {} };

export const LANGUES: readonly Langue[] = [
${entrees}
];

/**
 * Les traductions telles qu'elles sont écrites, avant d'être appariées.
 *
 * L'épreuve en a besoin : une fois la table faite, une ligne oubliée ne se
 * distingue plus d'une phrase laissée en français.
 */
export const LISTES: readonly { code: string; textes: readonly string[] }[] = [
${listes}
];
`;

  fs.writeFileSync(path.join(DOSSIER, 'index.ts'), fichier);
  console.log(`${traduites.length + 1} langues écrites`);
  if (manquantes.length > 0) {
    console.log(`en attente : ${manquantes.map((langue) => langue.code).join(' ')}`);
  }
}
