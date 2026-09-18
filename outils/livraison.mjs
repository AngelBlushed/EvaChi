// Monte le dossier de livraison : l'exécutable, le code source, les crédits,
// l'ossature des ROMs, le droit.
//
//     node outils/livraison.mjs <dossier cible>
//
// La liste des consoles est lue dans `skeleton.rs`, et les crédits dans
// `credits.rs` : ce sont les mêmes sources que celles dont l'application se
// sert, et elles ne peuvent donc pas diverger d'une version à l'autre.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve(import.meta.dirname, '..');
const CIBLE = process.argv[2];

if (!CIBLE) {
  console.error('usage : node outils/livraison.mjs <dossier cible>');
  process.exit(2);
}

const lire = (relatif) => fs.readFileSync(path.join(RACINE, relatif), 'utf8').replace(/\r\n/g, '\n');

// --- L'ossature des ROMs ----------------------------------------------------

const skeleton = lire('src-tauri/src/skeleton.rs');
const blocConsoles = skeleton.slice(
  skeleton.indexOf('pub const FOLDERS'),
  skeleton.indexOf('];', skeleton.indexOf('pub const FOLDERS')),
);
const consoles = [...blocConsoles.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

if (consoles.length < 40) {
  console.error(`liste de consoles suspecte : ${consoles.length} lues`);
  process.exit(1);
}

fs.rmSync(CIBLE, { recursive: true, force: true });
for (const nom of consoles) {
  fs.mkdirSync(path.join(CIBLE, 'roms', nom), { recursive: true });
}

// --- Le programme et le droit -----------------------------------------------

fs.copyFileSync(path.join(RACINE, 'src-tauri/target/release/evachi.exe'), path.join(CIBLE, 'evachi.exe'));
fs.copyFileSync(path.join(RACINE, 'LICENSE'), path.join(CIBLE, 'LICENSE'));
fs.copyFileSync(path.join(RACINE, 'docs/livraison/LISEZ-MOI.txt'), path.join(CIBLE, 'LISEZ-MOI.txt'));

// --- Le code source ---------------------------------------------------------
//
// La GPL demande que le code source accompagne le programme. Une adresse
// suffirait, mais un dossier ne se périme pas : celui qui a le zip a la source,
// sans dépendre d'un hébergeur ni d'une connexion. `git archive` rend l'arbre
// tel qu'il est au dernier commit, sans les artefacts de compilation.

// On recopie fichier par fichier plutôt que de passer par une archive : le
// `tar` de Windows prend « C: » pour un nom d'hôte et cherche à s'y connecter.

const propre = execFileSync('git', ['status', '--porcelain'], { cwd: RACINE, encoding: 'utf8' }).trim();
if (propre) {
  console.error('le dépôt a des changements non commités : le code livré ne correspondrait pas');
  console.error(propre.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
}

const source = path.join(CIBLE, 'code-source');
const suivis = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], {
  cwd: RACINE,
  encoding: 'utf8',
})
  .split('\n')
  .map((ligne) => ligne.trim())
  .filter(Boolean);

for (const relatif of suivis) {
  const destination = path.join(source, relatif);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(RACINE, relatif), destination);
}

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: RACINE, encoding: 'utf8' }).trim();

// --- Les crédits ------------------------------------------------------------

const credits = lire('src-tauri/src/credits.rs');
const coeurs = [...credits.matchAll(/Credit \{\s*id: "([^"]*)",\s*nom: "([^"]*)",\s*auteurs: "([^"]*)",\s*licence: "([^"]*)",\s*systeme: "([^"]*)",\s*propose: (\w+),/g)]
  .map((m) => ({ id: m[1], nom: m[2], auteurs: m[3], licence: m[4], systeme: m[5], propose: m[6] === 'true' }));

// Chaque entrée est découpée puis lue champ par champ. Une seule expression
// couvrant tout le bloc paraissait plus courte — et laissait tomber Ryubing,
// dont l'entrée porte un commentaire entre deux champs. Un crédit manquant est
// précisément ce qu'on veut éviter, alors on compte ce qu'on a trouvé.
const emulateurs = lire('src-tauri/src/emulators.rs');
const tableau = emulateurs.slice(
  emulateurs.indexOf('pub const STANDALONES'),
  emulateurs.indexOf('\n];', emulateurs.indexOf('pub const STANDALONES')),
);

const champ = (bloc, nom) => (bloc.match(new RegExp(`${nom}: "([^"]*)"`)) ?? [, ''])[1];
const externes = tableau
  .split('Standalone {')
  .slice(1)
  .map((bloc) => ({
    systeme: champ(bloc, 'system'),
    nom: champ(bloc, 'label'),
    depot: champ(bloc, 'repository'),
    licence: champ(bloc, 'license'),
    site: champ(bloc, 'site'),
  }));

const attendus = (tableau.match(/\blabel: "/g) ?? []).length;
if (externes.length !== attendus || externes.some((e) => !e.nom || !e.licence)) {
  console.error(`${externes.length} émulateurs autonomes lus, ${attendus} annoncés`);
  process.exit(1);
}

if (coeurs.length < 30 || externes.length < 5) {
  console.error(`crédits suspects : ${coeurs.length} cœurs, ${externes.length} externes`);
  process.exit(1);
}

const restreints = coeurs.filter((c) => /non.?commercial|^MAME$/i.test(c.licence));
const colonne = (texte, largeur) => texte.padEnd(largeur);

const lignes = [
  'EvaChi — à qui l\'on doit les émulateurs',
  '========================================',
  '',
  'EvaChi n\'écrit aucun émulateur. Elle en héberge : des cœurs libretro, et',
  'quelques programmes autonomes. Chacun est un projet libre à part entière,',
  'écrit par d\'autres.',
  '',
  'Rien de leur travail n\'est redistribué ici. EvaChi va chercher chaque',
  'émulateur chez ses auteurs, à la demande — les cœurs sur la forge du projet',
  'libretro, les programmes autonomes sur celle de chaque projet. Ce dossier ne',
  'contient aucun d\'eux.',
  '',
  'Les noms, les auteurs et les licences ci-dessous sont ceux que chaque projet',
  'déclare lui-même, relevés dans les fiches que le projet libretro publie et',
  'dans les dépôts des émulateurs autonomes. Une erreur ici serait la nôtre :',
  'écrivez-nous plutôt que de supposer.',
  '',
  '',
  'Les cœurs libretro',
  '------------------',
  '',
];

for (const coeur of coeurs.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) {
  lignes.push(`${colonne(coeur.nom, 24)}${colonne(coeur.licence, 24)}${coeur.auteurs.split('|').join(', ')}`);
  if (coeur.systeme) lignes.push(`${' '.repeat(24)}${coeur.systeme}`);
  lignes.push('');
}

lignes.push('', 'Les émulateurs autonomes', '------------------------', '');
for (const externe of externes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) {
  const ou = externe.site || (externe.depot ? `https://github.com/${externe.depot}` : '');
  lignes.push(`${colonne(externe.nom, 24)}${colonne(externe.licence, 24)}${externe.systeme}`);
  if (ou) lignes.push(`${' '.repeat(24)}${ou}`);
  lignes.push('');
}

if (restreints.length) {
  lignes.push(
    '',
    'Licences non commerciales',
    '-------------------------',
    '',
    'Ces cœurs-là ne portent pas une licence libre ordinaire : leur licence',
    'interdit l\'usage ou la redistribution commerciale. Cela ne change rien pour',
    'EvaChi, qui ne redistribue aucun émulateur et ne se vend pas — mais qui',
    'reprendrait ce travail pour en faire un produit doit le savoir.',
    '',
  );
  for (const coeur of restreints) {
    lignes.push(`${colonne(coeur.nom, 24)}${coeur.licence}`);
  }
  lignes.push('');
}

lignes.push(
  '',
  'EvaChi elle-même',
  '----------------',
  '',
  'GNU GPL version 3 ou ultérieure. Le texte complet est dans LICENSE, et le',
  'code source complet dans le dossier « code-source » à côté de ce fichier.',
  '',
  `Version du code : ${commit}`,
  '',
);

fs.writeFileSync(path.join(CIBLE, 'CREDITS.txt'), lignes.join('\n'), 'utf8');

const compte = (dossier) =>
  fs.readdirSync(dossier, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;

console.log(`${consoles.length} dossiers de console`);
console.log(`${coeurs.length} cœurs et ${externes.length} émulateurs autonomes crédités`);
console.log(`${restreints.length} licences non commerciales signalées`);
console.log(`${compte(source)} fichiers de code source, au commit ${commit.slice(0, 8)}`);
