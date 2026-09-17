import type { AsyncEmulatorCore, Frame } from '../core/types.ts';
import { Chip8 } from '../chip8/chip8.ts';
import { QUIRK_PRESETS } from '../chip8/quirks.ts';
import type { QuirkPreset } from '../chip8/quirks.ts';
import type {
  EmulatorOffer,
  ExternalPreset,
  ExternalSystem,
  InstallableCore,
  RomEntry,
  SystemFile,
  Placed,
} from '../libretro/client.ts';
import {
  addLibraryFolder,
  installCore,
  installEmulator,
  installableCores,
  installableEmulators,
  systemFiles,
  revealSystemDir,
  pickSystemFile,
  adoptSystemFile,
  pickSystemFolder,
  adoptSystemFolder,
  beginSession,
  clearManualCover,
  coverImage,
  coverIndex,
  coverOriginal,
  croppedCovers,
  crashReport,
  dismissCrash,
  deleteShot,
  deleteStateSlot,
  directories,
  libraryFolders,
  listRoms,
  listShots,
  listStates,
  loadStateSlot,
  manualCovers,
  pickContent,
  pickFolder,
  readContent,
  removeLibraryFolder,
  revealShotsDir,
  setCoreUsable,
  saveShot,
  saveStateSlot,
  setCroppedCover,
  setManualCover,
  note,
  takeMessages,
  adoptExternal,
  externalSystems,
  knownExternals,
  launchExternal,
  pickExecutable,
  removeExternalSystem,
  setExternalSystem,
} from '../libretro/client.ts';

import { AudioSink } from './audio.ts';
import {
  discover,
  discoveryErrors,
  discoveryReport,
  inShell,
  rejectedCores,
} from './catalog.ts';
import type { CatalogEntry } from './catalog.ts';
import type { Shot, StateSlot } from '../libretro/client.ts';
import {
  FAVORIS,
  collapseDiscs,
  collapseExtracted,
  coresFor,
  effectiveCore,
  gameLabel,
  groupLibrary,
  withFavourites,
} from './library.ts';
import type { Playable, Shelf } from './library.ts';
import {
  BUTTON_COUNT,
  FALLBACK_KEY_LABELS,
  HEX_KEYPAD,
  choosePad,
  PAD_DOWN,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_UP,
  STICK_DEADZONE,
} from './input.ts';
import type { ButtonLayout } from './input.ts';
import { THEMES, applyTheme, themeById } from './themes.ts';
import {
  aTraduire,
  compte,
  dit,
  langueDuSysteme,
  localeCourante,
  poserLangue,
  t,
  traduireDocument,
} from './i18n.ts';
import type { Langue } from './i18n.ts';
import { FRANCAIS, LANGUES } from './langues/index.ts';
import {
  padButtonShort,
  parseOverrides,
  resolveBindings,
  withBinding,
  withoutBindings,
} from './bindings.ts';
import type { AllOverrides } from './bindings.ts';
import { chooseCover, coverUrl, index as indexCovers, thumbnailFolders } from './covers.ts';
import type { Candidate } from './covers.ts';
import { TOUT, change, deplacer, etirer, tirer, zoomer } from './recadre.ts';
import type { Cadre, Coin } from './recadre.ts';
import {
  Held,
  cranSuivant,
  echelle,
  initiale,
  sautInitiale,
  step,
  voisin,
} from './navigation.ts';
import type { Boite } from './navigation.ts';
import { forget, formatPlaytime, formatWhen, parse as parseRecents, remember } from './recents.ts';
import type { Recent } from './recents.ts';
import type { Direction } from './navigation.ts';
import { draw as dessinerRubans } from './ribbon.ts';
import { arreterMusique, demarrerMusique, musiqueEnCours, ticDeplacement, ticValidation } from './sound.ts';
import { SELECTEUR_ACTIF, gestePour, premierUtile, tourne } from './focus.ts';

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Élément introuvable : #${id}`);
  return element as T;
};

const canvas = $<HTMLCanvasElement>('screen');
const context = canvas.getContext('2d');
if (!context) throw new Error('Contexte 2D indisponible');
context.imageSmoothingEnabled = false;

const menubar = $<HTMLElement>('menubar');
const toolbar = $<HTMLDivElement>('toolbar');
const libraryView = $<HTMLDivElement>('library');
const playerView = $<HTMLDivElement>('player');
const appView = $<HTMLDivElement>('app');
const shelvesBox = $<HTMLDivElement>('games');
const grilleView = $<HTMLDivElement>('grille');
const grilleTuiles = $<HTMLDivElement>('grille-tuiles');
const grilleTitre = $<HTMLElement>('grille-titre');
const grilleDetail = $<HTMLElement>('grille-detail');
const grilleLettre = $<HTMLDivElement>('grille-lettre');
const xmbView = $<HTMLDivElement>('xmb');
const xmbFond = $<HTMLCanvasElement>('xmb-fond');
const xmbColonnes = $<HTMLDivElement>('xmb-colonnes');
const xmbEntrees = $<HTMLDivElement>('xmb-entrees');
const xmbConsole = $<HTMLElement>('xmb-console');
const xmbHeure = $<HTMLElement>('xmb-heure');
const xmbPied = $<HTMLElement>('xmb-pied');
const xmbLettre = $<HTMLDivElement>('xmb-lettre');
const xmbRail = $<HTMLDivElement>('xmb-rail');
const xmbAfficheInitiale = $<HTMLElement>('xmb-affiche-initiale');
const xmbAfficheImage = $<HTMLImageElement>('xmb-affiche-image');
const placeholder = $<HTMLDivElement>('placeholder');
const placeholderPath = $<HTMLElement>('placeholder-path');
const searchInput = $<HTMLInputElement>('search');
const countsOut = $<HTMLElement>('counts');
const nowPlaying = $<HTMLElement>('now-playing');
const statusOut = $<HTMLElement>('status');
const fpsOut = $<HTMLElement>('fps');
const resOut = $<HTMLElement>('res');
const logBox = $<HTMLDivElement>('log');
const keypadBox = $<HTMLDivElement>('keypad');
const padStatus = $<HTMLElement>('pad-status');
const folderList = $<HTMLUListElement>('folder-list');
const aboutBody = $<HTMLDListElement>('about-body');
const raccourcisClavier = $<HTMLDListElement>('raccourcis-clavier');
const presetList = $<HTMLUListElement>('preset-list');
const installOffer = $<HTMLButtonElement>('placeholder-install');
const installList = $<HTMLUListElement>('install-list');
const emulatorList = $<HTMLUListElement>('emulator-list');
const biosList = $<HTMLUListElement>('bios-list');
const biosSummary = $<HTMLElement>('bios-summary');
const biosFolder = $<HTMLButtonElement>('bios-folder');
const themeList = $<HTMLDivElement>('theme-list');
const menuList = $<HTMLDivElement>('menu-list');
const langueList = $<HTMLDivElement>('langue-list');
const echelleList = $<HTMLDivElement>('echelle-list');
const lissageList = $<HTMLDivElement>('lissage-list');
const raccourcisEtatBoite = $<HTMLDListElement>('raccourcis-etat');
const galerieBoite = $<HTMLDivElement>('galerie');
const galerieVide = $<HTMLElement>('gallery-vide');
const galerieDossier = $<HTMLButtonElement>('gallery-folder');
const emplacementsBoite = $<HTMLDivElement>('emplacements');
const crashQuoi = $<HTMLElement>('crash-quoi');
const crashEcarter = $<HTMLButtonElement>('crash-ecarter');
const ecartesBloc = $<HTMLDivElement>('ecartes-bloc');
const ecartesList = $<HTMLUListElement>('ecartes-list');
const jaquettesCase = $<HTMLInputElement>('jaquettes');
const disquesCase = $<HTMLInputElement>('disques');
const musiqueCase = $<HTMLInputElement>('musique');
const sonsCase = $<HTMLInputElement>('sons');
const biosAdopt = $<HTMLButtonElement>('bios-adopt');
const biosAdoptFolder = $<HTMLButtonElement>('bios-adopt-folder');
const biosAdopted = $<HTMLElement>('bios-adopted');
const installProgress = $<HTMLElement>('install-progress');
const installButton = $<HTMLButtonElement>('install-selected');
const extName = $<HTMLInputElement>('ext-name');
const extExe = $<HTMLInputElement>('ext-exe');
const extExtensions = $<HTMLInputElement>('ext-ext');
const extArgs = $<HTMLInputElement>('ext-args');
const fileInput = $<HTMLInputElement>('file');
const chip8Options = $<HTMLDivElement>('chip8-options');
const presetSelect = $<HTMLSelectElement>('preset');
const speedInput = $<HTMLInputElement>('speed');
const speedValue = $<HTMLElement>('speed-value');
const tempoInput = $<HTMLInputElement>('tempo');
const tempoValue = $<HTMLElement>('tempo-value');
const soundToggle = $<HTMLInputElement>('sound');

const dialogs = {
  folders: $<HTMLDialogElement>('folders-dialog'),
  controls: $<HTMLDialogElement>('controls-dialog'),
  settings: $<HTMLDialogElement>('settings-dialog'),
  log: $<HTMLDialogElement>('log-dialog'),
  external: $<HTMLDialogElement>('external-dialog'),
  install: $<HTMLDialogElement>('install-dialog'),
  about: $<HTMLDialogElement>('about-dialog'),
  themes: $<HTMLDialogElement>('theme-dialog'),
  graphics: $<HTMLDialogElement>('graphics-dialog'),
  gallery: $<HTMLDialogElement>('gallery-dialog'),
  states: $<HTMLDialogElement>('states-dialog'),
  crash: $<HTMLDialogElement>('crash-dialog'),
  crop: $<HTMLDialogElement>('crop-dialog'),
};

// --- Habillage --------------------------------------------------------------

/**
 * Ce qu'on retient d'un lancement à l'autre, côté interface.
 *
 * Le stockage du navigateur plutôt que les réglages natifs : ces choix ne
 * regardent que l'affichage, et les lire coûterait un aller-retour au
 * démarrage — celui-là même qu'on vient de dégager.
 */
const RETENU = {
  theme: 'evachi.theme',
  liaisons: 'evachi.liaisons',
  menu: 'evachi.menu',
  jaquettes: 'evachi.jaquettes',
  disques: 'evachi.disques',
  musique: 'evachi.musique',
  sons: 'evachi.sons',
  favoris: 'evachi.favoris',
  echelle: 'evachi.echelle',
  lissage: 'evachi.lissage',
  etats: 'evachi.etats',
  emplacement: 'evachi.emplacement',
  recents: 'evachi.recents',
  langue: 'evachi.langue',
  tempo: 'evachi.tempo',
} as const;

/** Lit une valeur retenue, en survivant à un stockage indisponible. */
function retenu(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

/** Retient une valeur, sans faire d'histoire si c'est refusé. */
function retenir(cle: string, valeur: string): void {
  try {
    localStorage.setItem(cle, valeur);
  } catch {
    // Mode privé, stockage plein : le choix vaudra pour cette séance.
  }
}

let themeActuel = themeById(retenu(RETENU.theme));

/** Pose un thème, le retient, et rafraîchit la fenêtre de choix. */
function choisirTheme(id: string): void {
  themeActuel = themeById(id);
  applyTheme(themeActuel, document.documentElement);
  retenir(RETENU.theme, themeActuel.id);
  renderThemes();
}

/** Dessine les vignettes, chacune peinte de ses propres couleurs. */
function renderThemes(): void {
  themeList.replaceChildren();

  for (const theme of THEMES) {
    const vignette = document.createElement('button');
    vignette.type = 'button';
    vignette.className = 'theme';
    vignette.setAttribute('aria-pressed', String(theme.id === themeActuel.id));
    vignette.title = theme.scheme === 'light' ? t('thème clair') : t('thème sombre');

    const apercu = document.createElement('span');
    apercu.className = 'apercu';
    // La vignette ne se peint pas des couleurs en cours mais des siennes :
    // on choisit sur ce qu'on voit, pas sur un nom.
    apercu.style.background = theme.palette.bg;
    apercu.style.color = theme.palette.ink;

    const nom = document.createElement('span');
    nom.className = 'nom';
    nom.textContent = t(theme.label);

    const barres = document.createElement('span');
    barres.className = 'barres';
    for (const couleur of [theme.palette.ink, theme.palette.muted, theme.palette.accent]) {
      const barre = document.createElement('i');
      barre.style.background = couleur;
      barres.append(barre);
    }

    const coche = document.createElement('span');
    coche.className = 'coche';
    coche.style.color = theme.palette.accent;
    coche.textContent = theme.id === themeActuel.id ? `● ${t('en cours')}` : '';

    apercu.append(nom, barres, coche);
    vignette.append(apercu);
    vignette.addEventListener('click', () => choisirTheme(theme.id));
    themeList.append(vignette);
  }
}

// --- Langue -----------------------------------------------------------------

/**
 * La langue de l'interface.
 *
 * Retenue par son étiquette plutôt que par son rang : ajouter une langue au
 * milieu de la liste ferait autrement basculer tout le monde dans une autre.
 */
function langueRetenue(): Langue {
  const garde = retenu(RETENU.langue);
  if (garde) {
    const connue = LANGUES.find((langue) => langue.code === garde);
    if (connue) return connue;
  }
  // Rien de choisi : on suit ce que le système demande, et on retombe sur le
  // français, qui est la langue d'origine des textes.
  return langueDuSysteme(LANGUES, navigator.languages ?? [navigator.language]) ?? FRANCAIS;
}

/**
 * Pose une langue et repeint tout ce qui porte du texte.
 *
 * Les fenêtres et les menus sont traduits sur place ; le reste est redessiné,
 * car ses libellés sont écrits par le code et non par la page.
 */
function choisirLangue(code: string): void {
  const langue = LANGUES.find((autre) => autre.code === code) ?? FRANCAIS;
  poserLangue(langue.code === 'fr' ? null : langue);
  retenir(RETENU.langue, langue.code);

  document.documentElement.lang = langue.code;
  // Les écritures de droite à gauche retournent toute la mise en page : sans
  // cela l'arabe s'afficherait aligné à gauche, avec la ponctuation du mauvais
  // côté.
  document.documentElement.dir = langue.rtl ? 'rtl' : 'ltr';

  traduireDocument(document);
  renderLangues();
  renderMenus();
  renderThemes();
  renderGraphisme();
  renderGames();
  // La grille de commandes et les raccourcis de sauvegarde ne sont pas
  // redessinés à l'ouverture de leur fenêtre : sans ces deux appels, leurs
  // libellés resteraient dans la langue précédente jusqu'au prochain jeu
  // chargé. Les autres listes se refont en s'ouvrant, et n'ont rien à faire
  // ici.
  buildKeypad();
  renderRaccourcisEtat();
  // Le pourcentage de la jauge passe par `Intl` : « 100 % » en français,
  // « 100% » en anglais.
  renderTempo();
  refreshMenus();
}

/**
 * Dessine le menu des langues, le dernier de la barre.
 *
 * Un menu à soi plutôt qu'une ligne dans les thèmes : on cherche sa langue
 * tout de suite, et sans savoir lire ce qui est écrit autour. Le nom de chaque
 * langue y est écrit dans cette langue-là — c'est ainsi qu'on reconnaît la
 * sienne dans une liste qu'on ne sait pas lire.
 */
function renderLangues(): void {
  langueList.replaceChildren();
  const courante = retenu(RETENU.langue) ?? langueRetenue().code;

  for (const langue of LANGUES) {
    const choix = document.createElement('button');
    choix.type = 'button';
    const active = langue.code === courante;
    choix.setAttribute('aria-pressed', String(active));
    choix.lang = langue.code;
    if (langue.rtl) choix.dir = 'rtl';

    // Un point, et non une coche ou le mot « actif » : c'est la seule marque
    // qui se lise dans les cinquante alphabets.
    const coche = document.createElement('span');
    coche.className = 'coche';
    coche.textContent = active ? '●' : '';

    const nom = document.createElement('span');
    nom.textContent = langue.nom;

    choix.append(coche, nom);
    choix.addEventListener('click', () => choisirLangue(langue.code));
    langueList.append(choix);
  }

  // Cinquante entrées dans un volet qui défile : sans cela, ouvrir le menu en
  // tamoul montrait le haut de la liste, et la langue en cours restait
  // invisible douze rangées plus bas.
  const choisie = langueList.querySelector<HTMLElement>('[aria-pressed="true"]');
  if (choisie) {
    langueList.scrollTop = Math.max(
      0,
      choisie.offsetTop - langueList.clientHeight / 2 + choisie.offsetHeight / 2,
    );
  }
}

/** Les deux façons de présenter la bibliothèque. */
const MENUS = [
  {
    id: 'liste',
    label: aTraduire('Liste'),
    detail: aTraduire('Un volet par console, en tableau. Le plus dense à la souris.'),
  },
  {
    id: 'grille',
    label: aTraduire('Grille'),
    detail: aTraduire('Les jaquettes en grand, parcourues à la manette. Pensé pour le canapé.'),
  },
  {
    id: 'xmb',
    label: aTraduire('Menu animé'),
    detail: aTraduire(
      'Les consoles en rangée, les jeux en colonne, un fond qui ondule. Façon console de salon.',
    ),
  },
] as const;

/** Le mode d'affichage retenu ; la liste tant que rien n'a été choisi. */
function menuActuel(): string {
  const garde = retenu(RETENU.menu);
  return MENUS.some((menu) => menu.id === garde) ? (garde as string) : 'liste';
}

/** Change de présentation et redessine aussitôt la bibliothèque. */
function choisirMenu(id: string): void {
  retenir(RETENU.menu, id);
  renderMenus();
  renderGames();
}

/**
 * Vrai quand on veut voir les jaquettes.
 *
 * Elles sont là par défaut — c'est ce qu'on attend d'une bibliothèque de jeux —
 * mais elles vont chercher des images sur le réseau et changent beaucoup
 * l'allure de la liste. On doit donc pouvoir les refuser.
 */
function jaquettesVoulues(): boolean {
  return retenu(RETENU.jaquettes) !== 'non';
}

jaquettesCase.addEventListener('change', () => {
  retenir(RETENU.jaquettes, jaquettesCase.checked ? 'oui' : 'non');
  renderGames();
});

/**
 * Vrai quand un jeu sur disque ne doit apparaître qu'une fois.
 *
 * Par défaut, oui : c'est ce qu'on attend d'une bibliothèque. Mais le réglage
 * existe, car une collection mal rangée peut vouloir tout voir pour comprendre
 * ce qu'elle contient.
 */
function disquesReplies(): boolean {
  return retenu(RETENU.disques) !== 'non';
}

disquesCase.addEventListener('change', () => {
  retenir(RETENU.disques, disquesCase.checked ? 'oui' : 'non');
  renderGames();
});

/**
 * Les jeux mis de côté, dans l'ordre où on les a choisis.
 *
 * Retenus par chemin et non par nom : deux consoles peuvent contenir un
 * « Sonic », et un favori doit désigner celui qu'on a vraiment mis de côté.
 */
let favoris: string[] = lireFavoris();

function lireFavoris(): string[] {
  try {
    const brut = JSON.parse(retenu(RETENU.favoris) ?? '[]');
    return Array.isArray(brut) ? brut.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Vrai quand ce jeu est dans les favoris. */
function estFavori(chemin: string): boolean {
  return favoris.includes(chemin);
}

/**
 * Met un jeu de côté, ou l'en retire.
 *
 * Ajouté à la fin : la liste garde l'ordre dans lequel on l'a faite, ce qui la
 * rend reconnaissable d'une fois sur l'autre.
 */
function basculerFavori(chemin: string): boolean {
  favoris = estFavori(chemin) ? favoris.filter((autre) => autre !== chemin) : [...favoris, chemin];
  retenir(RETENU.favoris, JSON.stringify(favoris));
  renderGames();
  return estFavori(chemin);
}

/**
 * Le menu du clic droit.
 *
 * Une seule liste pour toute l'application, quelle que soit la vue : deux menus
 * contextuels finiraient par ne plus dire la même chose. Chaque vue se contente
 * de désigner le jeu sous le curseur.
 */
const contextuel = $<HTMLDivElement>('contextuel');

galerieDossier.addEventListener('click', () => void revealShotsDir());

/** Ferme le menu du clic droit, sans faire d'histoire s'il est déjà fermé. */
function fermerContextuel(): void {
  contextuel.hidden = true;
  contextuel.replaceChildren();
}

document.addEventListener('click', fermerContextuel);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') fermerContextuel();
});

/**
 * Ouvre le menu du clic droit sur un jeu.
 *
 * Replacé dans la fenêtre s'il déborde : ouvert sur le dernier jeu d'une
 * colonne, il sortait par le bas et ses entrées devenaient inatteignables.
 */
function ouvrirContextuel(event: MouseEvent, item: Playable): void {
  event.preventDefault();
  event.stopPropagation();
  contextuel.replaceChildren();

  const favori = estFavori(item.rom.path);
  const posee = jaquettesPosees[item.rom.path] !== undefined;

  const entrees: [string, string, () => void][] = [
    [
      favori ? '★' : '☆',
      favori ? t('Retirer des favoris') : t('Mettre en favoris'),
      () => basculerFavori(item.rom.path),
    ],
    ['▶', t('Lancer'), () => void jouerItem(item)],
    ['⛶', t('Recadrer la jaquette…'), () => void ouvrirRecadrage(item)],
    [
      '🖼',
      posee ? t('Changer la jaquette…') : t('Choisir une jaquette…'),
      () => void poserJaquette(item),
    ],
  ];
  if (posee) entrees.push(['✕', t('Retirer la jaquette'), () => void enleverJaquette(item)]);

  for (const [signe, texte, faire] of entrees) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    const marque = document.createElement('span');
    marque.className = 'etoile';
    marque.textContent = signe;
    const nom = document.createElement('span');
    nom.textContent = texte;
    bouton.append(marque, nom);
    bouton.addEventListener('click', () => {
      fermerContextuel();
      faire();
    });
    contextuel.append(bouton);
  }

  contextuel.hidden = false;
  const cadre = contextuel.getBoundingClientRect();
  contextuel.style.left = `${Math.min(event.clientX, window.innerWidth - cadre.width - 6)}px`;
  contextuel.style.top = `${Math.min(event.clientY, window.innerHeight - cadre.height - 6)}px`;
  contextuel.querySelector('button')?.focus();
}

/**
 * Désigne une image pour un jeu.
 *
 * C'est la seule réponse qui vaille pour la Switch et le CHIP-8 : le serveur de
 * vignettes n'a même pas de dossier pour ces machines, et aucun réglage ne les
 * y fera apparaître.
 */
async function poserJaquette(item: Playable): Promise<void> {
  try {
    const adresse = await setManualCover(item.rom.path);
    if (!adresse) return;
    jaquettesPosees = { ...jaquettesPosees, [item.rom.path]: adresse };
    renderGames();
    log(`${item.rom.name} — jaquette posée`, 'ok');
  } catch (error) {
    log(`jaquette — ${reason(error)}`, 'err');
  }
}

/** Retire l'image posée sur un jeu, qui reprend celle du serveur s'il y en a une. */
async function enleverJaquette(item: Playable): Promise<void> {
  try {
    await clearManualCover(item.rom.path);
    const reste = { ...jaquettesPosees };
    delete reste[item.rom.path];
    jaquettesPosees = reste;
    renderGames();
  } catch (error) {
    log(`jaquette — ${reason(error)}`, 'err');
  }
}

// --- Recadrage d'une jaquette -----------------------------------------------

const recadreBoite = $<HTMLElement>('recadre');
const recadreImage = $<HTMLImageElement>('recadre-image');
const recadreCadre = $<HTMLElement>('recadre-cadre');

/** Le jeu dont on recadre la jaquette, l'image d'origine, et le cadre en cours. */
let recadreJeu: Playable | null = null;
let recadreSource = '';
let cadre: Cadre = TOUT;

/**
 * L'adresse de la jaquette d'un jeu, telle qu'on la montrerait.
 *
 * La posée d'abord : elle est déjà entre nos mains. Sinon celle du serveur de
 * vignettes, qu'on retrouve par le même chemin que la bibliothèque.
 */
async function adresseJaquette(item: Playable): Promise<string | null> {
  const posee = jaquettesPosees[item.rom.path];
  if (posee) return posee;
  try {
    const trouve = chooseCover(await inventaire(item.rom.folder), item.rom.name);
    return trouve ? coverUrl(trouve.folder, trouve.name, trouve.kind) : null;
  } catch {
    return null;
  }
}

/**
 * Ouvre le recadrage sur la jaquette d'un jeu.
 *
 * Une image du serveur est rapportée par le code natif plutôt que prise telle
 * qu'elle s'affiche : redessinée dans un canevas, elle le souille, et l'export
 * échoue au moment d'enregistrer. Une jaquette posée à la main est déjà une
 * adresse `data:`, et n'a pas ce détour à faire.
 */
async function ouvrirRecadrage(item: Playable): Promise<void> {
  // L'image d'avant tout recadrage, si on l'a gardée : recadrer un recadrage
  // perdrait un peu plus de l'image à chaque fois, et rien ne le rattraperait.
  let source = await coverOriginal(item.rom.path).catch(() => null);

  if (!source) {
    const adresse = await adresseJaquette(item);
    if (!adresse) {
      log(dit('{0} — pas de jaquette à recadrer', item.rom.name), 'err');
      return;
    }
    if (adresse.startsWith('data:')) {
      source = adresse;
    } else {
      try {
        source = await coverImage(adresse);
      } catch (error) {
        log(dit('jaquette illisible — {0}', reason(error)), 'err');
        return;
      }
    }
  }

  recadreJeu = item;
  recadreSource = source;
  cadre = TOUT;
  recadreImage.src = source;
  if (!recadreImage.complete) {
    await new Promise((fini) => {
      recadreImage.addEventListener('load', fini, { once: true });
      recadreImage.addEventListener('error', fini, { once: true });
    });
  }

  openDialog(dialogs.crop);
  placerCadre();
  recadreBoite.focus();
}

/** Où l'image est dessinée dans la vue, en pixels : coin haut-gauche et taille. */
let vueImage = { x: 0, y: 0, w: 0, h: 0 };

/**
 * Pose l'image et son cadre dans la vue.
 *
 * L'image ne remplit pas la vue une fois pour toutes : c'est la réunion de
 * l'image et du cadre qui y tient. Un cadre qui déborde fait donc reculer
 * l'image, et l'on voit d'un coup d'œil la bande qu'on est en train d'ajouter.
 * Sans cela, dézoomer se ferait à l'aveugle, le cadre sortant de la vue.
 */
function placerCadre(): void {
  const hote = recadreBoite.getBoundingClientRect();
  const large = recadreImage.naturalWidth;
  const haut = recadreImage.naturalHeight;
  if (hote.width === 0 || large === 0 || haut === 0) return;

  const x0 = Math.min(0, cadre.x);
  const y0 = Math.min(0, cadre.y);
  const x1 = Math.max(1, cadre.x + cadre.w);
  const y1 = Math.max(1, cadre.y + cadre.h);

  // Une marge constante : collée aux bords, la poignée d'un coin sortirait à
  // moitié de la vue et deviendrait impossible à saisir.
  const marge = 14;
  const proportion = large / haut;
  const echelle = Math.min(
    (hote.width - 2 * marge) / ((x1 - x0) * proportion),
    (hote.height - 2 * marge) / (y1 - y0),
  );

  const imageW = proportion * echelle;
  const imageH = echelle;
  vueImage = {
    x: (hote.width - (x1 - x0) * imageW) / 2 - x0 * imageW,
    y: (hote.height - (y1 - y0) * imageH) / 2 - y0 * imageH,
    w: imageW,
    h: imageH,
  };

  recadreImage.style.left = `${vueImage.x}px`;
  recadreImage.style.top = `${vueImage.y}px`;
  recadreImage.style.width = `${vueImage.w}px`;
  recadreImage.style.height = `${vueImage.h}px`;

  recadreCadre.style.left = `${vueImage.x + cadre.x * vueImage.w}px`;
  recadreCadre.style.top = `${vueImage.y + cadre.y * vueImage.h}px`;
  recadreCadre.style.width = `${cadre.w * vueImage.w}px`;
  recadreCadre.style.height = `${cadre.h * vueImage.h}px`;
}

/**
 * Pose un nouveau cadre, avec un cran si le geste l'a vraiment déplacé.
 *
 * Un tic par pixel parcouru ferait une mitraillette à la souris : on ne le fait
 * entendre qu'au centième d'image franchi, ce qui donne au geste le grain d'un
 * cran qu'on sent passer.
 */
function poserCadre(neuf: Cadre): void {
  const bouge = change(cadre, neuf);
  cadre = neuf;
  placerCadre();
  if (bouge && sonsVoulus()) ticDeplacement();
}

recadreBoite.addEventListener('pointerdown', (event) => {
  if (vueImage.w === 0) return;
  event.preventDefault();
  recadreBoite.focus();

  const coin = (event.target as HTMLElement).dataset?.coin as Coin | undefined;

  // La vue est figée le temps du geste. L'image recule quand le cadre déborde,
  // et mesurer sur une vue qui bouge ferait fuir le point sous le doigt : on
  // tirerait un coin, l'image reculerait, le coin se retrouverait ailleurs, et
  // le geste s'emballerait tout seul.
  const hote = recadreBoite.getBoundingClientRect();
  const fige = { ...vueImage };
  const surVue = (x: number, y: number) => ({
    x: (x - hote.left - fige.x) / fige.w,
    y: (y - hote.top - fige.y) / fige.h,
  });

  const depart = surVue(event.clientX, event.clientY);
  const origine = cadre;

  const bouger = (suite: PointerEvent) => {
    const ici = surVue(suite.clientX, suite.clientY);
    poserCadre(
      coin
        ? tirer(origine, coin, ici.x, ici.y)
        : deplacer(origine, ici.x - depart.x, ici.y - depart.y),
    );
  };

  const lacher = () => {
    window.removeEventListener('pointermove', bouger);
    window.removeEventListener('pointerup', lacher);
  };

  window.addEventListener('pointermove', bouger);
  window.addEventListener('pointerup', lacher);
});

/** Le pas des flèches : fin, mais qui se voit. */
const PAS_CADRE = 0.01;

recadreBoite.addEventListener('keydown', (event) => {
  const sens: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const pousse = sens[event.key];
  if (!pousse) return;
  event.preventDefault();
  event.stopPropagation();

  const [dx, dy] = pousse;
  // Avec Maj, les flèches ne déplacent plus mais resserrent : gauche et droite
  // sur la largeur, haut et bas sur la hauteur.
  poserCadre(
    event.shiftKey
      ? etirer(cadre, dx * PAS_CADRE * 2, dy * PAS_CADRE * 2)
      : deplacer(cadre, dx * PAS_CADRE, dy * PAS_CADRE),
  );
});

$('recadre-tout').addEventListener('click', () => {
  poserCadre(TOUT);
  recadreBoite.focus();
});

/**
 * Découpe l'image et l'enregistre comme jaquette du jeu.
 *
 * Découpée à la taille d'origine et non à celle de l'aperçu : on garde tout le
 * détail de l'image, quelle que soit la fenêtre où on l'a choisie.
 */
async function appliquerRecadrage(): Promise<void> {
  const item = recadreJeu;
  if (!item) return;

  // Le cadre peut déborder de l'image : la toile est alors plus grande qu'elle,
  // et ce qui dépasse reste transparent. C'est ainsi qu'on dézoome une jaquette
  // trop serrée — le décor se voit à travers les bandes.
  const PLAFOND = 2048;
  const brut = Math.max(1, recadreImage.naturalWidth * cadre.w);
  const reduction = Math.min(1, PLAFOND / Math.max(brut, recadreImage.naturalHeight * cadre.h));
  const largeur = Math.max(1, Math.round(recadreImage.naturalWidth * cadre.w * reduction));
  const hauteur = Math.max(1, Math.round(recadreImage.naturalHeight * cadre.h * reduction));

  const canevas = document.createElement('canvas');
  canevas.width = largeur;
  canevas.height = hauteur;
  const pinceau = canevas.getContext('2d');
  if (!pinceau) return;

  // Posée d'après le cadre plutôt que découpée dedans : une source qui sort de
  // l'image ne se dessine pas, et c'est justement ce qu'on veut — du vide.
  pinceau.drawImage(
    recadreImage,
    (-cadre.x / cadre.w) * largeur,
    (-cadre.y / cadre.h) * hauteur,
    largeur / cadre.w,
    hauteur / cadre.h,
  );

  try {
    const adresse = await setCroppedCover(
      item.rom.path,
      canevas.toDataURL('image/png'),
      recadreSource,
    );
    jaquettesPosees = { ...jaquettesPosees, [item.rom.path]: adresse };
    // Elle rejoint les recadrées : c'est ce qui décide de la montrer en entier
    // plutôt que de la recouper une seconde fois à l'affichage.
    jaquettesRecadrees = new Set([...jaquettesRecadrees, item.rom.path]);
    if (sonsVoulus()) ticValidation();
    dialogs.crop.close();
    renderGames();
    log(dit('{0} — jaquette recadrée', item.rom.name), 'ok');
  } catch (error) {
    log(dit('recadrage impossible — {0}', reason(error)), 'err');
  }
}

$('recadre-poser').addEventListener('click', () => void appliquerRecadrage());

// La fenêtre peut changer de taille pendant qu'on recadre : le cadre est tenu
// en fractions de l'image, mais sa place à l'écran, elle, est en pixels.
window.addEventListener('resize', () => {
  if (dialogs.crop.open) placerCadre();
});

// --- Captures d'écran -------------------------------------------------------

/**
 * Prend une capture de l'image en cours.
 *
 * C'est le canevas qu'on photographie, pas la fenêtre : on veut l'image du jeu
 * telle que le cœur l'a produite, sans la barre de menus ni les bords noirs
 * ajoutés pour l'ajuster.
 *
 * Cœurs internes seulement : un émulateur externe dessine dans sa propre
 * fenêtre, où EvaChi n'a rien à photographier.
 */
async function prendreCapture(): Promise<void> {
  if (!core || libraryView.hidden === false) return;
  try {
    const adresse = canvas.toDataURL('image/png');
    const fichier = await saveShot(contentName || 'capture', adresse);
    if (sonsVoulus()) ticValidation();
    log(`capture — ${fichier}`, 'ok');
    await relireCaptures();
  } catch (error) {
    log(`capture impossible — ${reason(error)}`, 'err');
  }
}

/** Les captures relues à l'ouverture de la galerie et au démarrage. */
let captures: Shot[] = [];

async function relireCaptures(): Promise<void> {
  try {
    captures = await listShots();
  } catch {
    captures = [];
  }
}

// --- Jeux récemment joués ---------------------------------------------------

/** La clé du volet des parties récentes. */
const REPRENDRE = 'reprendre';

/**
 * Les jeux récemment joués, et le temps passé dessus.
 *
 * Avec cinq cents jeux, la question posée en ouvrant l'application n'est pas
 * « lequel choisir » mais « où en étais-je ».
 */
let recents: Recent[] = parseRecents(retenu(RETENU.recents));

/** L'instant où la partie en cours a commencé, ou zéro hors partie. */
let departPartie = 0;

/** Le jeu de la partie en cours, pour le retenir quand elle s'arrête. */
let jeuEnCours: { path: string; name: string; folder: string } | null = null;

function ecrireRecents(): void {
  retenir(RETENU.recents, JSON.stringify(recents));
}

/**
 * Referme la partie en cours et ajoute son temps au total.
 *
 * Appelée au changement de jeu comme à la fermeture : sans cela, quitter par
 * la croix perdrait toute la session, qui est justement la plus longue.
 */
function clorePartie(): void {
  if (!jeuEnCours || departPartie === 0) return;
  const secondes = (Date.now() - departPartie) / 1000;
  recents = remember(recents, jeuEnCours, Math.floor(Date.now() / 1000), secondes);
  ecrireRecents();
  departPartie = 0;
  jeuEnCours = null;
}

/** Note qu'une partie commence. */
function ouvrirPartie(jeu: { path: string; name: string; folder: string }): void {
  clorePartie();
  jeuEnCours = jeu;
  departPartie = Date.now();
  // Noté tout de suite, sans temps : un jeu lancé puis abandonné doit tout de
  // même apparaître dans « Reprendre », c'est là qu'on ira le rechercher.
  recents = remember(recents, jeu, Math.floor(Date.now() / 1000));
  ecrireRecents();
}

// Fermer la fenêtre est la façon la plus courante de finir une partie.
window.addEventListener('beforeunload', clorePartie);

/**
 * Le volet des parties récentes.
 *
 * Les jeux y sont repris de la bibliothèque, pour que le cœur et la jaquette
 * soient ceux qu'on connaît déjà. Un jeu dont le fichier a disparu est
 * simplement omis : la liste ne doit jamais proposer ce qui ne se lance plus.
 */
function voletReprendre(shelves: readonly Shelf[]): Shelf | null {
  if (recents.length === 0) return null;

  const parChemin = new Map<string, Playable>();
  for (const shelf of shelves) {
    if (shelf.key === FAVORIS) continue;
    for (const item of shelf.games) parChemin.set(item.rom.path, item);
  }

  const games = recents
    .map((recent) => parChemin.get(recent.path))
    .filter((item): item is Playable => item !== undefined);

  if (games.length === 0) return null;

  const candidates = [
    ...new Map(games.flatMap((item) => item.cores).map((c) => [c.id, c])).values(),
  ];
  return {
    key: REPRENDRE,
    label: aTraduire('Reprendre'),
    games,
    candidates,
    preferred: undefined,
  };
}

/** Ce qu'on sait d'un jeu récemment joué, s'il en fait partie. */
function detailRecent(chemin: string): Recent | undefined {
  return recents.find((recent) => recent.path === chemin);
}

/** La clé du volet réservé aux captures, dans le menu animé. */
const GALERIE = 'galerie';

/**
 * Le volet des captures, tout à gauche du menu animé.
 *
 * Une case à part plutôt qu'une entrée de menu : dans un menu qu'on parcourt à
 * la manette, ce qui n'est pas sur la rangée n'existe pas. Les jeux y sont
 * faux — ce sont des images, pas des cartouches — mais ils se parcourent et
 * s'affichent exactement de la même façon, ce qui évite une seconde grille.
 */
function voletGalerie(): Shelf | null {
  if (captures.length === 0) return null;
  return {
    key: GALERIE,
    label: aTraduire('Galerie'),
    games: captures.map((capture) => ({
      rom: {
        name: capture.game,
        path: `capture:${capture.file}`,
        extension: 'png',
        size: 0,
        folder: '',
      },
      cores: [],
    })),
    candidates: [],
    preferred: undefined,
  };
}

/** Dessine la galerie. */
function renderGalerie(): void {
  galerieBoite.replaceChildren();
  galerieVide.hidden = captures.length > 0;

  for (const capture of captures) {
    const vignette = document.createElement('button');
    vignette.type = 'button';
    vignette.className = 'capture';
    vignette.title = dit('{0} — clic droit pour effacer', capture.game);

    const image = document.createElement('img');
    image.alt = capture.game;
    image.loading = 'lazy';
    image.src = capture.data;

    const quoi = document.createElement('span');
    quoi.className = 'quoi';
    quoi.textContent = capture.game;
    const quand = document.createElement('span');
    quand.className = 'quand';
    quand.textContent = capture.taken
      ? new Date(capture.taken * 1000).toLocaleString(localeCourante(), {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
    quoi.append(quand);

    vignette.append(image, quoi);
    // Un clic ouvre l'image en grand dans une nouvelle vue ; ici on se contente
    // d'ouvrir le dossier, qui est ce que l'on veut neuf fois sur dix.
    vignette.addEventListener('click', () => void revealShotsDir());
    vignette.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      void effacerCapture(capture.file);
    });
    galerieBoite.append(vignette);
  }
}

async function ouvrirGalerie(): Promise<void> {
  try {
    captures = await listShots();
  } catch (error) {
    captures = [];
    log(`galerie — ${reason(error)}`, 'err');
  }
  renderGalerie();
  openDialog(dialogs.gallery);
}

async function effacerCapture(fichier: string): Promise<void> {
  try {
    await deleteShot(fichier);
    captures = captures.filter((capture) => capture.file !== fichier);
    renderGalerie();
  } catch (error) {
    log(`effacement — ${reason(error)}`, 'err');
  }
}

// --- Arrêt brutal -----------------------------------------------------------

/**
 * Signale une partie qui ne s'est pas terminée, et propose d'écarter le cœur.
 *
 * Un cœur libretro tourne dans la même fenêtre qu'EvaChi : quand il tombe, il
 * l'emporte avec lui, sans message ni journal. Flycast l'a fait — il a fallu
 * fouiller le journal d'événements de Windows pour apprendre lequel des
 * cinquante-quatre cœurs était en cause. Une note posée au chargement et
 * effacée au déchargement suffit à répondre à la question suivante : « qu'est-ce
 * qui vient de se passer ? »
 */
/**
 * Les émulateurs écartés, avec de quoi les rétablir.
 *
 * Un cœur écarté reste installé : on cesse seulement de le proposer. Sans
 * cette liste, la seule façon de revenir en arrière serait de le réinstaller —
 * un téléchargement pour annuler un réglage.
 */
function renderEcartes(): void {
  ecartesList.replaceChildren();
  ecartesBloc.hidden = rejectedCores.length === 0;

  for (const id of rejectedCores) {
    const ligne = document.createElement('li');

    const nom = document.createElement('span');
    nom.className = 'name';
    nom.textContent = id;

    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'lien';
    bouton.textContent = t('Rétablir');
    bouton.addEventListener('click', async () => {
      try {
        await setCoreUsable(id, true);
        log(dit('{0} rétabli', id), 'ok');
        // Le catalogue, pas seulement la liste des jeux : c'est lui qui écarte
        // les cœurs inutilisables, et il n'est relu qu'ici.
        await reloadCatalog();
        await refreshLibrary();
        renderEcartes();
      } catch (error) {
        log(dit('rétablissement impossible — {0}', reason(error)), 'err');
      }
    });

    ligne.append(nom, bouton);
    ecartesList.append(ligne);
  }
}

async function signalerIncident(): Promise<void> {
  let rapport = null;
  try {
    rapport = await crashReport();
  } catch {
    return;
  }
  if (!rapport) return;

  const nom = rapport.label || rapport.core;
  crashQuoi.textContent = rapport.game
    ? dit("EvaChi s'est arrêtée en lançant « {0} », avec l'émulateur {1}.", rapport.game, nom)
    : dit("EvaChi s'est arrêtée, avec l'émulateur {0}.", nom);
  log(dit('arrêt brutal la fois précédente — {0}', nom), 'err');

  crashEcarter.onclick = async () => {
    try {
      await setCoreUsable(rapport.core, false);
      log(`${rapport.label} écarté`, 'ok');
      await reloadCatalog();
      await refreshLibrary();
    } catch (error) {
      log(`mise à l'écart impossible — ${reason(error)}`, 'err');
    }
    dialogs.crash.close();
  };

  // La note est effacée dès qu'on l'a montrée : on ne prévient qu'une fois.
  dialogs.crash.addEventListener('close', () => void dismissCrash().catch(() => {}), {
    once: true,
  });
  openDialog(dialogs.crash);
}

// --- Emplacements de sauvegarde ---------------------------------------------

/**
 * L'emplacement que visent les raccourcis.
 *
 * Retenu d'un lancement à l'autre : on se fait une habitude d'un emplacement,
 * et repartir du premier à chaque ouverture obligerait à y penser.
 */
let emplacementVise = Number(retenu(RETENU.emplacement) ?? '0') || 0;

/** Le jeu en cours, par son chemin — c'est lui qui nomme le dossier d'états. */
let cheminEnCours = '';

/**
 * Range l'état du cœur dans un emplacement.
 *
 * L'image de l'écran est prise au même instant : devant quatre emplacements
 * datés, c'est la vignette qui dit lequel est le bon, pas l'heure.
 */
async function sauverEmplacement(slot: number): Promise<void> {
  if (!core || !cheminEnCours) return;
  try {
    const etat = await core.saveState();
    const vignette = canvas.width > 0 ? canvas.toDataURL('image/png') : '';
    await saveStateSlot(cheminEnCours, slot, encodeBase64(etat), vignette);
    savedState = etat;
    refreshMenus();
    log(dit('emplacement {0} — {1}', slot + 1, humanSize(etat.length)), 'ok');
  } catch (error) {
    log(`sauvegarde impossible — ${reason(error)}`, 'err');
  }
}

/** Reprend l'état rangé dans un emplacement. */
async function chargerEmplacement(slot: number): Promise<void> {
  if (!core || !cheminEnCours) return;
  try {
    const texte = await loadStateSlot(cheminEnCours, slot);
    await core.loadState(decodeBase64(texte));
    log(`emplacement ${slot + 1} — repris`, 'ok');
  } catch (error) {
    log(`reprise impossible — ${reason(error)}`, 'err');
  }
}

/**
 * Encode et décode les octets d'un état.
 *
 * Le pont vers la coque native ne transporte que du texte ; un tableau de
 * plusieurs mégaoctets converti en JSON coûterait dix fois plus cher que ces
 * deux fonctions réunies.
 */
function encodeBase64(octets: Uint8Array): string {
  let texte = '';
  // Par tranches : passer un million d'octets d'un coup à `fromCharCode`
  // dépasse la taille d'appel que le moteur accepte.
  for (let debut = 0; debut < octets.length; debut += 0x8000) {
    texte += String.fromCharCode(...octets.subarray(debut, debut + 0x8000));
  }
  return btoa(texte);
}

function decodeBase64(texte: string): Uint8Array {
  const brut = atob(texte);
  const octets = new Uint8Array(brut.length);
  for (let rang = 0; rang < brut.length; rang += 1) octets[rang] = brut.charCodeAt(rang);
  return octets;
}

/** Dessine les quatre emplacements du jeu en cours. */
async function renderEmplacements(): Promise<void> {
  emplacementsBoite.replaceChildren();
  if (!cheminEnCours) return;

  let liste: StateSlot[] = [];
  try {
    liste = await listStates(cheminEnCours);
  } catch (error) {
    log(`emplacements — ${reason(error)}`, 'err');
    return;
  }

  for (const place of liste) {
    const carte = document.createElement('button');
    carte.type = 'button';
    carte.className = 'emplacement';
    carte.setAttribute('aria-current', String(place.slot === emplacementVise));
    carte.title = place.filled
      ? t('Reprendre cette sauvegarde — clic droit pour la vider')
      : t('Sauvegarder ici');

    const apercu = document.createElement('span');
    apercu.className = 'apercu';
    if (place.shot) {
      const image = document.createElement('img');
      image.alt = '';
      image.src = place.shot;
      apercu.append(image);
    } else {
      const rien = document.createElement('span');
      rien.className = 'rien';
      rien.textContent = place.filled ? t('sans image') : t('vide');
      apercu.append(rien);
    }

    const titre = document.createElement('span');
    titre.className = 'titre';
    titre.textContent = dit('Emplacement {0}', place.slot + 1);

    const quand = document.createElement('span');
    quand.className = 'quand';
    quand.textContent = place.filled
      ? `${new Date(place.taken * 1000).toLocaleString(localeCourante(), {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })} · ${humanSize(place.size)}`
      : '—';

    carte.append(apercu, titre, quand);
    // Un emplacement occupé se reprend, un emplacement vide se remplit : c'est
    // ce qu'on veut faire neuf fois sur dix, et l'autre geste reste à portée.
    carte.addEventListener('click', async () => {
      emplacementVise = place.slot;
      retenir(RETENU.emplacement, String(place.slot));
      if (place.filled) await chargerEmplacement(place.slot);
      else await sauverEmplacement(place.slot);
      await renderEmplacements();
    });
    carte.addEventListener('contextmenu', async (event) => {
      event.preventDefault();
      if (!place.filled) return;
      await deleteStateSlot(cheminEnCours, place.slot);
      await renderEmplacements();
    });
    emplacementsBoite.append(carte);
  }
}

// --- Sauvegarde rapide ------------------------------------------------------

/**
 * Les raccourcis de sauvegarde d'état, clavier et manette.
 *
 * Cœurs internes seulement : un émulateur externe a ses propres sauvegardes et
 * ses propres touches, et EvaChi n'a aucun moyen de les lui commander.
 *
 * À la manette on prend deux boutons à la fois. Chacun d'eux sert au jeu — il
 * n'y a pas de bouton libre sur une manette — et deux ensemble ne se pressent
 * jamais par accident.
 */
interface Raccourci {
  /** Code de touche clavier, ou vide. */
  clavier: string;
  /** Indices des boutons de manette à tenir ensemble, ou vide. */
  pad: number[];
}

// Select + L1 pour sauvegarder, Select + R1 pour charger : les numéros du
// format standard du W3C, écrits ici plutôt que pris dans la table des boutons,
// qui est déclarée plus bas avec le reste de la navigation.
const RACCOURCIS_PAR_DEFAUT: Record<'sauver' | 'charger', Raccourci> = {
  sauver: { clavier: 'F2', pad: [8, 4] },
  charger: { clavier: 'F4', pad: [8, 5] },
};

let raccourcisEtat: Record<'sauver' | 'charger', Raccourci> = lireRaccourcis();

function lireRaccourcis(): Record<'sauver' | 'charger', Raccourci> {
  try {
    const brut = JSON.parse(retenu(RETENU.etats) ?? 'null');
    if (!brut || typeof brut !== 'object') return structuredClone(RACCOURCIS_PAR_DEFAUT);
    const lu = (quoi: 'sauver' | 'charger'): Raccourci => ({
      clavier: typeof brut[quoi]?.clavier === 'string' ? brut[quoi].clavier : '',
      pad: Array.isArray(brut[quoi]?.pad) ? brut[quoi].pad.filter(Number.isInteger) : [],
    });
    return { sauver: lu('sauver'), charger: lu('charger') };
  } catch {
    return structuredClone(RACCOURCIS_PAR_DEFAUT);
  }
}

/** Écrit un raccourci en toutes lettres. */
function direRaccourci(raccourci: Raccourci): string {
  const morceaux: string[] = [];
  if (raccourci.clavier) morceaux.push(raccourci.clavier);
  if (raccourci.pad.length > 0) {
    morceaux.push(raccourci.pad.map((index) => padButtonShort(index)).join(' + '));
  }
  return morceaux.join(`   ${t('ou')}   `) || t('aucun');
}

/** Le raccourci qu'on est en train de redéfinir, s'il y en a un. */
let raccourciEnAttente: 'sauver' | 'charger' | null = null;

function renderRaccourcisEtat(): void {
  raccourcisEtatBoite.replaceChildren();

  for (const quoi of ['sauver', 'charger'] as const) {
    const dt = document.createElement('dt');
    dt.textContent = quoi === 'sauver' ? t('Sauvegarder') : t('Charger');

    const dd = document.createElement('dd');
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'lien';
    bouton.textContent =
      raccourciEnAttente === quoi ? t('pressez une touche…') : direRaccourci(raccourcisEtat[quoi]);
    bouton.addEventListener('click', () => {
      raccourciEnAttente = raccourciEnAttente === quoi ? null : quoi;
      renderRaccourcisEtat();
    });
    dd.append(bouton);
    raccourcisEtatBoite.append(dt, dd);
  }
}

function poserRaccourci(quoi: 'sauver' | 'charger', raccourci: Partial<Raccourci>): void {
  raccourcisEtat = {
    ...raccourcisEtat,
    [quoi]: { ...raccourcisEtat[quoi], ...raccourci },
  };
  retenir(RETENU.etats, JSON.stringify(raccourcisEtat));
  raccourciEnAttente = null;
  renderRaccourcisEtat();
}

/** Vrai quand tous les boutons d'un raccourci sont tenus en même temps. */
function raccourciTenu(pad: Gamepad, boutons: readonly number[]): boolean {
  return boutons.length > 0 && boutons.every((index) => pad.buttons[index]?.pressed);
}

const etats = { sauver: new Held(1200, 1200), charger: new Held(1200, 1200) };

/**
 * Regarde si un raccourci de sauvegarde vient d'être fait à la manette.
 *
 * Seulement en cours de partie et sur un cœur interne : ailleurs il n'y a rien
 * à sauvegarder, et laisser la combinaison agir donnerait l'impression d'un
 * raccourci cassé.
 */
function surveillerEtats(pad: Gamepad, maintenant: number): void {
  if (!core) return;
  for (const quoi of ['sauver', 'charger'] as const) {
    const tenu = raccourciTenu(pad, raccourcisEtat[quoi].pad);
    if (etats[quoi].update(tenu, maintenant).pressed) {
      if (sonsVoulus()) ticValidation();
      void actions[quoi === 'sauver' ? 'save' : 'restore']?.();
    }
  }
}

// --- Graphisme --------------------------------------------------------------

/**
 * Comment l'image du jeu occupe la fenêtre.
 *
 * « Ajuster » remplit la place disponible en gardant les proportions ; les
 * multiples entiers affichent chaque pixel de la console sur exactement deux,
 * trois ou quatre pixels de l'écran. C'est ce qui fait la différence entre une
 * image nette et une image dont une ligne sur trois est plus épaisse que les
 * autres.
 */
const ECHELLES = [
  ['ajuster', aTraduire('Ajuster'), aTraduire('Remplit la fenêtre en gardant les proportions')],
  ['1', '×1', aTraduire('Taille d’origine de la console, au pixel près')],
  ['2', '×2', aTraduire('Chaque pixel sur quatre : net, sans déformation')],
  ['3', '×3', aTraduire('Chaque pixel sur neuf')],
  ['4', '×4', aTraduire('Chaque pixel sur seize — pour les grands écrans')],
] as const;

const LISSAGES = [
  ['net', aTraduire('Net'), aTraduire('Les pixels restent carrés, comme sur la machine d’origine')],
  [
    'doux',
    aTraduire('Adouci'),
    aTraduire('Les contours sont fondus — plus proche d’un vieux téléviseur'),
  ],
] as const;

function echelleImage(): string {
  const garde = retenu(RETENU.echelle);
  return ECHELLES.some(([id]) => id === garde) ? (garde as string) : 'ajuster';
}

function lissageImage(): string {
  return retenu(RETENU.lissage) === 'doux' ? 'doux' : 'net';
}

/** Dessine un choix de réglage graphique, à la façon des présentations. */
function renderChoix(
  boite: HTMLElement,
  options: readonly (readonly [string, string, string])[],
  courant: string,
  poser: (id: string) => void,
): void {
  boite.replaceChildren();
  for (const [id, label, detail] of options) {
    const choix = document.createElement('button');
    choix.type = 'button';
    choix.className = 'menu-choix';
    choix.setAttribute('aria-pressed', String(id === courant));
    const nom = document.createElement('strong');
    nom.textContent = t(label);
    const explication = document.createElement('span');
    explication.textContent = t(detail);
    choix.append(nom, explication);
    choix.addEventListener('click', () => poser(id));
    boite.append(choix);
  }
}

function renderGraphisme(): void {
  renderChoix(echelleList, ECHELLES, echelleImage(), (id) => {
    retenir(RETENU.echelle, id);
    renderGraphisme();
    fitScreen();
  });
  renderChoix(lissageList, LISSAGES, lissageImage(), (id) => {
    retenir(RETENU.lissage, id);
    renderGraphisme();
    appliquerLissage();
  });
}

/** Pose le lissage sur le canvas et sur le contexte de dessin. */
function appliquerLissage(): void {
  const doux = lissageImage() === 'doux';
  canvas.style.imageRendering = doux ? 'auto' : 'pixelated';
  if (context) context.imageSmoothingEnabled = doux;
}

/** Lance un jeu donné, avec le cœur retenu pour son volet. */
async function jouerItem(item: Playable): Promise<void> {
  const cœur = effectiveCore(item.rom, item.cores, chosenCore, preferePour(item));
  if (cœur) await play(cœur, item.rom);
}

/** Le jeu actuellement visé, quelle que soit la vue. */
function jeuVise(): Playable | undefined {
  if (enGrille()) return tuiles[choisie];
  if (enXmb()) return voletsXmb[colonneXmb]?.games[entreeXmb];
  return undefined;
}

/** Vrai quand le menu animé doit avoir sa musique. */
function musiqueVoulue(): boolean {
  return retenu(RETENU.musique) !== 'non';
}

/** Vrai quand la manette doit faire un bruit en se déplaçant. */
function sonsVoulus(): boolean {
  return retenu(RETENU.sons) !== 'non';
}

musiqueCase.addEventListener('change', () => {
  retenir(RETENU.musique, musiqueCase.checked ? 'oui' : 'non');
  // Décochée en cours d'écoute, la musique doit se taire tout de suite ;
  // recochée, repartir sans qu'on ait à quitter le menu.
  if (musiqueCase.checked && enXmb() && !libraryView.hidden) demarrerMusique();
  else arreterMusique();
});

sonsCase.addEventListener('change', () => {
  retenir(RETENU.sons, sonsCase.checked ? 'oui' : 'non');
  if (sonsCase.checked) ticDeplacement();
});

/** Dessine le choix de présentation, dans la même fenêtre que les thèmes. */
function renderMenus(): void {
  menuList.replaceChildren();
  const courant = menuActuel();

  for (const menu of MENUS) {
    const choix = document.createElement('button');
    choix.type = 'button';
    choix.className = 'menu-choix';
    choix.setAttribute('aria-pressed', String(menu.id === courant));

    const nom = document.createElement('strong');
    nom.textContent = t(menu.label);
    const detail = document.createElement('span');
    detail.textContent = t(menu.detail);

    choix.append(nom, detail);
    choix.addEventListener('click', () => choisirMenu(menu.id));
    menuList.append(choix);
  }
}

const audio = new AudioSink();

/**
 * Ce que le cœur reçoit : la réunion du clavier et de la manette.
 *
 * Les deux sources sont tenues séparément puis fusionnées à chaque trame.
 * Confondre les deux ferait qu'un relâchement de touche annule une direction
 * tenue à la manette, et réciproquement.
 */
const buttons: boolean[] = new Array(BUTTON_COUNT).fill(false);
const keyboard: boolean[] = new Array(BUTTON_COUNT).fill(false);
const buttonCells = new Map<number, HTMLButtonElement>();

/**
 * Les boutons de la manette, au format standard du W3C.
 *
 * Nommés plutôt que numérotés : `pad.buttons[9]` ne dit rien à la relecture, et
 * confondre 8 et 9 donne une application qui se referme quand on voulait
 * l'ouvrir.
 */
const BOUTON = { a: 0, b: 1, x: 2, y: 3, select: 8, start: 9, guide: 16 } as const;

/** Index de la manette utilisée, ou -1 tant qu'aucune n'est branchée. */
let padIndex = -1;

let catalog: CatalogEntry[] = [];
let entry: CatalogEntry | null = null;
let core: AsyncEmulatorCore | null = null;
let layout: ButtonLayout = HEX_KEYPAD;
let running = false;
let contentName = '';
/** Derniers octets chargés, pour recharger après un changement de réglage. */
let contentBytes: Uint8Array | null = null;
let contentPath: string | null = null;
let savedState: Uint8Array | null = null;
let frameImage = new ImageData(1, 1);

let games: RomEntry[] = [];
/** Cœur choisi pour un jeu donné, quand plusieurs l'acceptent. */
const chosenCore = new Map<string, string>();
let folders: string[] = [];
let defaultRomsPath = '';

/**
 * Jeton de la boucle en cours. Changer de cœur l'incrémente, ce qui fait sortir
 * l'ancienne boucle sans attendre : sans lui, deux boucles se disputeraient le
 * canvas le temps qu'une trame en vol se termine.
 */
let loopToken = 0;
/** Taille annoncée dans la barre d’état, pour ne la réécrire qu’au besoin. */
let shownSize = '';

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Accorde un nom en nombre.
 *
 * Passe par les règles de la langue en cours : le français a deux formes, le
 * russe trois, le japonais une seule. En français, zéro reste au singulier.
 */
const plural = (count: number, singular: string, pluriel = `${singular}s`): string =>
  compte(count, singular, pluriel);

// --- Journal et barre d'état ------------------------------------------------

function log(message: string, kind: 'info' | 'ok' | 'err' = 'info'): void {
  const line = document.createElement('div');
  if (kind !== 'info') line.className = kind;
  line.textContent = `${new Date().toLocaleTimeString(localeCourante())}  ${message}`;
  logBox.append(line);
  logBox.scrollTop = logBox.scrollHeight;

  statusOut.textContent = message;
  statusOut.classList.toggle('err', kind === 'err');

  // Recopié côté natif : le journal de la fenêtre est invisible depuis un
  // terminal, ce qui rend un démarrage raté impossible à diagnostiquer.
  if (inShell) note(kind === 'err' ? `ERREUR ${message}` : message);
}

// --- Menus ------------------------------------------------------------------

function closeMenus(): void {
  for (const menu of menubar.querySelectorAll('[data-menu]')) {
    menu.removeAttribute('data-open');
  }
}

/** Active ou grise les entrées de menu selon ce qui est possible maintenant. */
function refreshMenus(): void {
  const playing = core !== null && contentName !== '';
  const enabled: Record<string, boolean> = {
    toggle: playing,
    reset: playing,
    save: playing,
    restore: playing,
    states: playing,
    shot: playing,
    stop: playing,
  };

  for (const [action, on] of Object.entries(enabled)) {
    const button = menubar.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (button) button.disabled = !on;
  }

  // Ce libellé-ci est le seul de la barre que le code réécrit. Au changement de
  // langue, `traduireDocument` le ramène d'abord à ce que la page portait —
  // « Pause » — parce que c'est ce texte-là qu'il a retenu comme origine. D'où
  // l'appel à `refreshMenus` juste après, qui remet le bon des deux.
  const toggle = menubar.querySelector<HTMLButtonElement>('[data-action="toggle"]');
  if (toggle) toggle.textContent = running ? t('Pause') : t('Reprendre');
}

for (const menu of menubar.querySelectorAll<HTMLElement>('[data-menu]')) {
  const title = menu.querySelector<HTMLButtonElement>('.menu-title');
  title?.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = menu.hasAttribute('data-open');
    closeMenus();
    if (!wasOpen) menu.setAttribute('data-open', '');
  });

  // Survoler un autre titre pendant qu'un menu est ouvert bascule dessus,
  // comme dans n'importe quelle barre de menus.
  title?.addEventListener('mouseenter', () => {
    if (!menubar.querySelector('[data-open]')) return;
    closeMenus();
    menu.setAttribute('data-open', '');
  });
}

document.addEventListener('click', closeMenus);

/** Ouvre une boîte de dialogue, en fermant les menus au passage. */
function openDialog(dialog: HTMLDialogElement): void {
  closeMenus();
  dialog.showModal();
}

for (const dialog of Object.values(dialogs)) {
  for (const close of dialog.querySelectorAll('[data-close]')) {
    close.addEventListener('click', () => dialog.close());
  }
}

// --- Vues -------------------------------------------------------------------

/** Bascule entre la bibliothèque et le jeu en cours. */
function showLibrary(show: boolean): void {
  libraryView.hidden = !show;
  toolbar.hidden = !show;
  playerView.hidden = show;
  if (!show) fitScreen();
}

// --- Affichage --------------------------------------------------------------

/**
 * Redimensionne l'écran pour occuper la place disponible sans se déformer.
 *
 * Calculé plutôt que laissé au CSS : `max-width` limite mais n'agrandit pas, et
 * un rapport d'affichage venu du cœur ne se déduit pas des dimensions de la
 * trame — la NES sort du 256×240 et s'affiche en 4/3, ses pixels n'étant pas
 * carrés.
 */
function fitScreen(available?: { width: number; height: number }): void {
  if (playerView.hidden) return;

  const ratio = core?.info.aspectRatio || canvas.width / Math.max(1, canvas.height) || 1;
  // La taille rapportée par l'observateur est celle d'après la mise en page ;
  // la relire soi-même juste après un redimensionnement rend l'ancienne.
  const box = available ?? playerView.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return;

  let width = box.width;
  let height = width / ratio;
  if (height > box.height) {
    height = box.height;
    width = height * ratio;
  }

  // Un multiple entier plutôt que la place disponible : chaque pixel de la
  // console couvre alors exactement le même nombre de pixels d'écran. Sans
  // cela, une ligne sur trois se dessine plus épaisse que ses voisines, et
  // c'est ce qui donne aux vieux jeux un air de photocopie.
  const voulu = echelleImage();
  if (voulu !== 'ajuster') {
    const facteur = Number(voulu);
    const entier = canvas.width * facteur;
    // On n'agrandit jamais au-delà de la fenêtre : mieux vaut un multiple plus
    // petit qu'une image dont les bords sortent de l'écran.
    if (entier <= box.width && canvas.height * facteur <= box.height) {
      width = entier;
      height = canvas.height * facteur;
    }
  }

  canvas.style.width = `${Math.floor(width)}px`;
  canvas.style.height = `${Math.floor(height)}px`;
}

/**
 * Affiche une trame en suivant ses dimensions. Un cœur peut changer de
 * géométrie en cours de partie : on réaligne le canvas plutôt que de tronquer.
 */
function present(frame: Frame): void {
  if (frame.width === 0 || frame.height === 0) return;

  if (frame.width !== frameImage.width || frame.height !== frameImage.height) {
    canvas.width = frame.width;
    canvas.height = frame.height;
    frameImage = new ImageData(frame.width, frame.height);
    appliquerLissage();
    fitScreen();
  }

  // L'étiquette suit sa propre mémoire, et non le redimensionnement du canevas.
  // Deux jeux de même taille s'enchaînant, le second n'aurait rien réécrit :
  // la barre restait sur le tiret laissé par le retour à la bibliothèque.
  const taille = `${frame.width}×${frame.height}`;
  if (taille !== shownSize) {
    shownSize = taille;
    resOut.textContent = taille;
  }

  frameImage.data.set(frame.video);
  context!.putImageData(frameImage, 0, 0);
}

// La fenêtre change de taille, le plein écran va et vient : dans les deux cas
// la place disponible change et l'écran doit se recalculer.
new ResizeObserver((entries) => {
  const rect = entries[0]?.contentRect;
  fitScreen(rect ? { width: rect.width, height: rect.height } : undefined);
}).observe(playerView);

document.addEventListener('fullscreenchange', () => {
  // On peut sortir du plein écran sans passer par nous — Échap, ou la fenêtre
  // qui rend la main. Le compte des trois temps doit le suivre, faute de quoi
  // le prochain appui sur P dépouillerait une fenêtre qui n'est plus en plein
  // écran.
  if (!document.fullscreenElement && tempsPleinEcran !== PLEIN.fenetre) {
    poserPleinEcran(PLEIN.fenetre);
    return;
  }
  fitScreen();
});
window.addEventListener('resize', () => fitScreen());

function setRunning(next: boolean): void {
  running = next;
  refreshMenus();
  if (next) void runLoop();
}

// --- Vitesse du jeu ---------------------------------------------------------

/** Les bornes de la jauge, en pourcentage de la vitesse de la console. */
const TEMPO = { plancher: 50, normal: 100, plafond: 900 } as const;

/**
 * La vitesse voulue, en multiple de celle de la console.
 *
 * Cent pour cent par défaut, et on y revient dès que la valeur retenue n'a pas
 * de sens : une jauge abîmée dans le stockage ne doit pas rendre un jeu
 * injouable sans qu'on comprenne pourquoi.
 */
function tempoJeu(): number {
  const garde = Number(retenu(RETENU.tempo));
  if (!Number.isFinite(garde) || garde < TEMPO.plancher || garde > TEMPO.plafond) return 1;
  return garde / 100;
}

/** Écrit le pourcentage à côté de la jauge, dans la langue en cours. */
function renderTempo(): void {
  const pourcent = Math.round(tempoJeu() * 100);
  tempoInput.value = String(pourcent);
  // `Intl` sait où va le signe et s'il prend une espace : « 100 % » en
  // français, « 100% » en anglais et en japonais.
  tempoValue.textContent = new Intl.NumberFormat(localeCourante(), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(pourcent / 100);
}

tempoInput.addEventListener('input', () => {
  retenir(RETENU.tempo, tempoInput.value);
  renderTempo();
});

// --- Boucle d'exécution -----------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let framesThisSecond = 0;
let lastReport = performance.now();

/**
 * Fait tourner le cœur trame par trame.
 *
 * La boucle est asynchrone parce qu'un cœur libretro vit derrière une frontière
 * de processus : chaque trame est un aller-retour. On vise une horloge absolue
 * plutôt que d'ajouter des délais, sinon le moindre retard s'accumulerait.
 */
async function runLoop(): Promise<void> {
  const token = ++loopToken;
  let next = performance.now();

  let dernierDessin = 0;

  while (running && core && token === loopToken) {
    // Relue à chaque trame : la jauge se glisse en cours de partie, et la
    // vitesse doit suivre le doigt.
    const tempo = tempoJeu();
    const frameMs = 1000 / (core.info.fps || 60) / tempo;

    sampleInput();

    let frame: Frame;
    try {
      frame = await core.runFrame(buttons);
    } catch (error) {
      if (token === loopToken) {
        setRunning(false);
        log(dit('arrêt — {0}', reason(error)), 'err');
      }
      return;
    }

    // Le cœur a pu changer pendant l'attente : cette trame ne vaut plus rien.
    if (token !== loopToken) return;

    const now = performance.now();

    // En accéléré, on ne dessine pas chaque trame : l'écran n'en montre que
    // soixante par seconde, et neuf cents mises en page pour en voir soixante
    // met la machine à genoux pour rien. À vitesse normale ou ralentie, chaque
    // trame compte.
    if (tempo <= 1 || now - dernierDessin >= 1000 / 60) {
      present(frame);
      dernierDessin = now;
    }

    // Le son est rééchantillonné plutôt que joué tel quel : annoncer une
    // cadence multipliée le comprime d'autant, et il reste à l'heure au lieu de
    // prendre une avance qui grandirait sans fin. Le prix est un son plus aigu
    // en accéléré, plus grave au ralenti — c'est ce qu'on attend.
    audio.push(frame.audio, core.info.sampleRate * tempo);
    framesThisSecond += 1;

    if (now - lastReport >= 1000) {
      // La vitesse s'affiche dès qu'elle n'est plus celle de la console : sans
      // cela, une jauge oubliée à 400 % d'un lancement à l'autre passerait pour
      // un jeu détraqué. Le pourcentage est déjà écrit à côté de la jauge, on
      // le reprend tel quel.
      const images = dit('{0} im/s', framesThisSecond);
      fpsOut.textContent = tempo === 1 ? images : `${images} · ${tempoValue.textContent}`;
      framesThisSecond = 0;
      lastReport = now;
      void drainMessages();
    }

    next += frameMs;
    const delay = next - performance.now();
    // Un retard de plus de quatre trames ne se rattrape pas : on repart de zéro
    // plutôt que d'enchaîner des trames en accéléré.
    if (delay < -frameMs * 4) next = performance.now();
    if (delay > 0) await sleep(delay);
  }
}

/** Remonte ce que le cœur a voulu dire : BIOS manquant, avertissements. */
async function drainMessages(): Promise<void> {
  if (!inShell || entry?.kind !== 'libretro') return;
  try {
    for (const message of await takeMessages()) log(dit('cœur : {0}', message));
  } catch {
    // Un échec de relève ne doit pas interrompre la partie.
  }
}

// --- Cœurs et contenus ------------------------------------------------------

function makeChip8(): Chip8 {
  return new Chip8({
    quirks: QUIRK_PRESETS[presetSelect.value as QuirkPreset],
    cyclesPerFrame: Number(speedInput.value),
  });
}

/** Charge le cœur demandé et remet l'état de lecture à zéro. */
async function selectCore(next: CatalogEntry): Promise<boolean> {
  loopToken += 1;
  running = false;
  audio.flush();

  entry = next;
  core = null;
  contentBytes = null;
  contentPath = null;
  contentName = '';
  savedState = null;
  chip8Options.hidden = next.id !== 'chip8';

  try {
    core = await next.open();
  } catch (error) {
    log(`${next.label} — ${reason(error)}`, 'err');
    entry = null;
    refreshMenus();
    return false;
  }

  layout = next.layout;
  buildKeypad();
  refreshMenus();
  await drainMessages();
  return true;
}

/** Charge un contenu dans le cœur actif et passe en lecture. */
async function loadContent(name: string, bytes: Uint8Array, path?: string): Promise<void> {
  if (!core) return;

  // C'est le chemin du jeu qui nomme son dossier de sauvegardes : retenu ici,
  // là où on le connaît, plutôt que cherché plus tard dans la bibliothèque —
  // qui peut avoir changé entre-temps.
  cheminEnCours = path ?? '';
  if (path) ouvrirPartie({ path, name, folder: dossierDuJeu(path) });

  // Le témoin est posé avant l'appel au cœur, pas après : c'est justement
  // pendant le chargement que les cœurs fragiles tombent, et une fenêtre qui
  // disparaît sans rien dire ne laisserait autrement aucune trace.
  if (entry && entry.kind !== 'interne') {
    void beginSession(entry.id, entry.label, name).catch(() => {});
  }

  loopToken += 1;
  running = false;
  audio.flush();

  try {
    await core.load(bytes, path);
  } catch (error) {
    log(`${name} — ${reason(error)}`, 'err');
    // Le cœur a presque toujours dit pourquoi avant de refuser. Sans cette
    // relève, son explication attendait le jeu suivant, où elle n'éclairait
    // plus rien.
    await drainMessages();
    return;
  }

  contentName = name;
  contentBytes = bytes;
  contentPath = path ?? null;
  savedState = null;

  nowPlaying.textContent = `${name} — ${core.info.name || entry?.label || ''}`;
  showLibrary(false);

  await audio.unlock();
  setRunning(true);
  log(dit('{0} — chargé', name), 'ok');
  await drainMessages();
}

/** Repose le jeu et revient à la bibliothèque. */
async function stopPlaying(): Promise<void> {
  // Le temps de la partie est ajouté avant tout le reste : ce qui suit peut
  // échouer, et on ne veut pas perdre le compte pour autant.
  clorePartie();
  renderGames();

  loopToken += 1;
  running = false;
  audio.flush();

  // Revenir à la bibliothèque doit tout relâcher. Une première version se
  // contentait de masquer l'écran : le cœur restait chargé derrière, avec sa
  // bibliothèque, ses fils d'exécution, son contexte graphique et, pour un jeu
  // GameCube, quatre-vingt-dix mégaoctets d'état. Rien ne le disait, et rien ne
  // le rendait avant le jeu suivant.
  const partant = core;
  core = null;
  entry = null;

  contentName = '';
  contentBytes = null;
  contentPath = null;
  savedState = null;
  nowPlaying.textContent = 'EvaChi';
  fpsOut.textContent = '—';
  resOut.textContent = '—';
  shownSize = '';
  showLibrary(true);
  refreshMenus();

  try {
    await partant?.close?.();
  } catch (error) {
    log(dit('déchargement incomplet — {0}', reason(error)), 'err');
  }
}

/**
 * Le dossier d'un jeu, tiré de son chemin.
 *
 * On ne garde que le dernier segment : c'est lui que la recherche de jaquette
 * compare aux noms de consoles, et le chemin complet ne lui dirait rien.
 */
function dossierDuJeu(chemin: string): string {
  const morceaux = chemin.replace(/\\/g, '/').split('/');
  return morceaux.length > 1 ? morceaux[morceaux.length - 2] : '';
}

/** Lance un jeu de la bibliothèque avec le cœur choisi pour lui. */
async function play(target: CatalogEntry, rom: RomEntry): Promise<void> {
  // Un émulateur externe est un autre programme : on le démarre avec le jeu en
  // argument et on n'en attend rien de plus.
  if (target.kind === 'externe') {
    // La bibliothèque reste affichée derrière l'émulateur : la musique du menu
    // ne s'arrêtait donc pas d'elle-même, et jouait par-dessus le jeu.
    arreterMusique();
    // Un émulateur externe compte comme une partie : on ne saura pas combien
    // de temps elle dure, mais le jeu doit apparaître dans « Reprendre ».
    recents = remember(recents, { path: rom.path, name: rom.name, folder: rom.folder }, Math.floor(Date.now() / 1000));
    ecrireRecents();
    renderGames();
    try {
      const started = await launchExternal(target.label, rom.path);
      log(`${rom.name} — ${started}`, 'ok');
    } catch (error) {
      log(`${target.label} — ${reason(error)}`, 'err');
    }
    return;
  }

  if (entry?.id !== target.id && !(await selectCore(target))) return;

  try {
    // Un cœur libretro lit le fichier lui-même ; un cœur interne vit dans la
    // page et n'a aucun accès au disque : il faut lui apporter les octets.
    const bytes = target.needsPath ? new Uint8Array(0) : await readContent(rom.path);
    await loadContent(rom.name, bytes, rom.path);
  } catch (error) {
    log(`${rom.name} — ${reason(error)}`, 'err');
  }
}

// --- Bibliothèque -----------------------------------------------------------

/**
 * Les formats de taille déjà construits, par langue et par unité.
 *
 * Une bibliothèque affiche la taille de chaque jeu : en construire un par
 * ligne coûterait plus cher que tout le reste du dessin.
 */
const formatsTaille = new Map<string, Intl.NumberFormat>();

function formatTaille(unite: string, decimales: number): Intl.NumberFormat {
  const langue = localeCourante();
  const cle = `${langue} ${unite}`;
  let format = formatsTaille.get(cle);
  if (!format) {
    format = new Intl.NumberFormat(langue, {
      style: 'unit',
      unit: unite,
      unitDisplay: 'short',
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    });
    formatsTaille.set(cle, format);
  }
  return format;
}

/**
 * Une taille de fichier, écrite dans la langue en cours.
 *
 * Les unités ne se traduisent pas à la main : « Go » s'écrit « GB » en
 * anglais, « ГБ » en russe et « غ.ب » en arabe, et le navigateur connaît déjà
 * les trois. Une image de Wii U pèse six mille méga-octets ; annoncée ainsi,
 * le nombre ne se lit plus, d'où l'échelon en giga-octets.
 */
function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return formatTaille('gigabyte', 1).format(bytes / (1024 * 1024 * 1024));
  }
  if (bytes >= 1024 * 1024) return formatTaille('megabyte', 1).format(bytes / (1024 * 1024));
  if (bytes >= 1024) return formatTaille('kilobyte', 0).format(Math.round(bytes / 1024));
  return formatTaille('byte', 0).format(bytes);
}

/** Les cœurs installés capables d'ouvrir ce fichier. */
/** Cœur retenu pour un dossier, mémorisé d'une session à l'autre. */
const FOLDER_CORE_KEY = 'evachi.dossiers.v1';

function readFolderCores(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(FOLDER_CORE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writeFolderCore(folder: string, coreId: string): void {
  try {
    const known = readFolderCores();
    known[folder] = coreId;
    localStorage.setItem(FOLDER_CORE_KEY, JSON.stringify(known));
  } catch {
    // Sans mémoire, le choix vaudra pour cette session seulement.
  }
}

const COLLAPSED_KEY = 'evachi.volets.v1';

/** Volets repliés, retenus d'une session à l'autre. */
function readCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function writeCollapsed(collapsed: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Sans mémoire, tous les volets rouvriront au prochain lancement.
  }
}


// --- Vue en grille ----------------------------------------------------------

/** Les jeux de la grille, à plat, dans l'ordre affiché. */
let tuiles: Playable[] = [];
/** La case choisie. */
let choisie = 0;

/** Vrai quand la bibliothèque s'affiche en grille plutôt qu'en liste. */
function enGrille(): boolean {
  return menuActuel() === 'grille';
}

/**
 * Range la grille : ni cases affichées, ni sélection qui traîne.
 *
 * Sans cela, une recherche sans résultat masquait la grille mais lui laissait
 * ses six cents cases et sa sélection : le bouton A lançait alors un jeu qui
 * n'était plus à l'écran.
 */
function viderGrille(): void {
  grilleView.hidden = true;
  grilleTuiles.replaceChildren();
  tuiles = [];
  grilleTitre.textContent = '';
  grilleDetail.textContent = '';
}

/** De quoi reconnaître que la grille montre bien les mêmes jeux qu'avant. */
function signature(liste: readonly Playable[]): string {
  return `${liste.length}|${liste[0]?.rom.path ?? ''}|${liste.at(-1)?.rom.path ?? ''}`;
}
let signatureAffichee = '';

/**
 * Les positions des cases, relevées après le dessin.
 *
 * C'est sur elles que se fait le déplacement : une grille coupée par des
 * titres de section n'a plus de rangées régulières, et l'arithmétique en
 * colonnes envoyait alors la sélection au hasard d'une section à l'autre.
 */
let boitesGrille: Boite[] = [];

/** Les cases de la grille, dans l'ordre, relevées en même temps que leurs boîtes. */
let casesGrille: HTMLElement[] = [];

/** Le défilement en attente, s'il y en a un. */
let defilementPrevu = 0;

/**
 * Met une case en vue, à la trame suivante.
 *
 * Poser la marque de sélection invalide la mise en page ; demander aussitôt le
 * défilement oblige le navigateur à la refaire sur-le-champ, et cinq cents
 * vignettes recalculées coûtaient quarante millisecondes par touche. La grille
 * paraissait alors figée tant qu'on tenait une flèche, puis sautait d'un coup à
 * l'arrivée.
 *
 * Reporté d'une trame, le calcul se fait une seule fois pour toutes les touches
 * reçues entre-temps — et c'est le calcul que le navigateur allait faire de
 * toute façon pour dessiner.
 */
function mettreEnVue(element: HTMLElement): void {
  cancelAnimationFrame(defilementPrevu);
  defilementPrevu = requestAnimationFrame(() => {
    element.scrollIntoView({ block: 'nearest' });
  });
}

function releverBoites(): void {
  // Les cases sont retenues en même temps que leurs positions. Les redemander
  // à chaque changement de sélection coûtait une recherche sur six cents
  // éléments par pression de touche, et la grille s'engorgeait dès qu'on
  // tenait une flèche.
  casesGrille = [...grilleTuiles.querySelectorAll<HTMLElement>('.tuile')];
  boitesGrille = casesGrille.map((element) => ({
    x: element.offsetLeft,
    y: element.offsetTop,
    w: element.offsetWidth,
    h: element.offsetHeight,
  }));
}

/** Dessine la grille à partir des volets déjà classés. */
function renderGrille(shelves: Shelf[]): void {
  grilleTuiles.replaceChildren();
  tuiles = shelves.flatMap((shelf) => shelf.games);

  // Une sélection ne se transporte pas d'une liste à l'autre : la case 40 d'une
  // recherche ne désigne pas le même jeu que la case 40 de la bibliothèque.
  const empreinte = signature(tuiles);
  if (empreinte !== signatureAffichee) choisie = 0;
  signatureAffichee = empreinte;

  let rang = -1;
  for (const shelf of shelves) {
    // Un titre par volet : sans lui, les favoris et les parties récentes se
    // fondaient dans le tas, et on ne comprenait ni pourquoi ils étaient là ni
    // pourquoi certains jeux apparaissaient deux fois.
    const titre = document.createElement('h3');
    titre.className = 'section-grille';
    // Les volets d'une console portent le nom du dossier, qui ne se traduit
    // pas ; « Favoris », « Reprendre » et « Galerie », si. Une clé inconnue
    // ressort telle quelle, ce qui règle les deux cas d'un seul geste.
    titre.textContent = t(shelf.label);
    const combien = document.createElement('span');
    combien.textContent = plural(shelf.games.length, 'jeu', 'jeux');
    titre.append(combien);
    grilleTuiles.append(titre);

    for (const item of shelf.games) {
    rang += 1;
    // Le rang figé pour cette case-là.
    //
    // `rang` est un compteur qui court sur toute la grille : les gestionnaires
    // d'événements le capturaient lui, et non sa valeur du moment. Tous
    // désignaient donc la dernière case au moment d'être appelés — un clic
    // droit n'importe où sautait au dernier jeu de la bibliothèque.
    const ici = rang;
    const tuile = document.createElement('button');
    tuile.type = 'button';
    tuile.className = 'tuile';
    tuile.title = item.rom.path;

    const boite = document.createElement('span');
    boite.className = 'boite';

    const initiale = document.createElement('span');
    initiale.className = 'initiale';
    initiale.textContent = item.rom.name.slice(0, 1).toUpperCase();
    boite.append(initiale);

    // Transparente et non masquée : un élément `hidden` n'a pas de boîte, et
    // l'observateur ne le voit donc jamais approcher de l'écran — la grille
    // restait entièrement dépourvue de jaquettes.
    if (jaquettesVoulues()) {
      const jaquette = document.createElement('img');
      jaquette.alt = '';
      jaquette.loading = 'lazy';
      jaquette.dataset.console = item.rom.folder;
      jaquette.dataset.jeu = item.rom.name;
      jaquette.dataset.chemin = item.rom.path;
      // La jaquette remplace l'initiale une fois arrivée, et pas avant : une
      // image à moitié chargée sur fond vide fait clignoter toute la grille.
      jaquette.addEventListener('load', () => {
        initiale.hidden = true;
      });
      boite.append(jaquette);
      regarderJaquette(jaquette);
    }

    if (estFavori(item.rom.path)) {
      const etoile = document.createElement('span');
      etoile.className = 'etoile';
      etoile.textContent = '★';
      boite.append(etoile);
    }

    const nom = document.createElement('span');
    nom.className = 'nom';
    nom.textContent = gameLabel(item.rom.name);

    tuile.append(boite, nom);
    tuile.addEventListener('click', () => {
      choisir(ici);
      void jouerChoisie();
    });
    tuile.addEventListener('contextmenu', (event) => {
      choisir(ici);
      ouvrirContextuel(event, item);
    });
    grilleTuiles.append(tuile);
    }
  }

  releverBoites();
  choisir(choisie);
}

/**
 * Désigne une case, la met en vue, et annonce ce qu'elle porte.
 *
 * Deux cases changent de marque, pas six cents : parcourir toute la grille à
 * chaque pression de touche la faisait bégayer dès qu'on tenait une flèche.
 * Et la mise en vue est immédiate, sans glissé : chaque appui relançait
 * l'animation du précédent, si bien que la grille semblait figée tant qu'on
 * tenait la touche, puis sautait d'un coup à l'arrivée.
 */
function choisir(rang: number): void {
  const avant = choisie;
  choisie = Math.min(Math.max(rang, 0), Math.max(0, tuiles.length - 1));

  // Les cases seules, sans les titres de section : ceux-ci sont aussi des
  // enfants de la grille, et les compter décalait la sélection d'un cran par
  // section traversée — la marque se posait alors sur un titre.
  casesGrille[avant]?.setAttribute('aria-selected', 'false');
  const courante = casesGrille[choisie];
  if (courante) {
    courante.setAttribute('aria-selected', 'true');
    mettreEnVue(courante);
  }

  const item = tuiles[choisie];
  grilleTitre.textContent = item ? item.rom.name : '';
  if (item) {
    // La console d'abord : la grille est à plat, et six cents jaquettes à la
    // suite ne disent plus sur quelle machine on se trouve.
    const volet = voletDe(item);
    const cœur = effectiveCore(item.rom, item.cores, chosenCore, volet?.preferred);
    grilleDetail.textContent = [volet?.label, cœur?.label ?? '—', humanSize(item.rom.size)]
      .filter(Boolean)
      .join(' · ');
  } else {
    grilleDetail.textContent = '';
  }
}

/** Les volets tels qu'ils viennent d'être classés. */
let volets: Shelf[] = [];

/**
 * Le volet d'où vient chaque jeu, tout prêt.
 *
 * Cherché à la volée, c'était un parcours de toute la bibliothèque à chaque
 * pression de touche — six cents jeux comparés un à un pour retrouver la
 * console d'une seule case.
 */
let voletParJeu = new Map<Playable, Shelf>();

function relierVolets(shelves: readonly Shelf[]): void {
  voletParJeu = new Map();
  for (const shelf of shelves) {
    for (const item of shelf.games) if (!voletParJeu.has(item)) voletParJeu.set(item, shelf);
  }
}

/** Le volet d'où ce jeu vient. */
function voletDe(item: Playable): Shelf | undefined {
  return voletParJeu.get(item);
}

/** Le cœur retenu pour le volet dont ce jeu vient. */
function preferePour(item: Playable): string | undefined {
  return voletDe(item)?.preferred;
}

/** Lance le jeu choisi. */
async function jouerChoisie(): Promise<void> {
  const item = tuiles[choisie];
  if (!item) return;
  const cœur = effectiveCore(item.rom, item.cores, chosenCore, preferePour(item));
  if (cœur) await play(cœur, item.rom);
}

/**
 * Fait vivre les vues manette à la manette.
 *
 * Appelée depuis la même boucle que le panneau des commandes. Les directions
 * passent par un filtre d'appui : sans lui, une direction tenue traverse six
 * cents jeux en deux secondes.
 *
 * Les filtres sont partagés entre la grille et le menu animé. Deux jeux de
 * filtres liraient la même manette deux fois par trame, et un appui compterait
 * double le jour où les deux vues seraient éveillées ensemble.
 */
// 260 ms avant la première répétition puis une toutes les 55 ms : à la
// manette on parcourt vite, et l'attente d'origine se sentait comme un retard
// alors qu'elle n'était qu'une prudence de clavier.
const directions = {
  gauche: new Held(260, 55),
  droite: new Held(260, 55),
  haut: new Held(260, 55),
  bas: new Held(260, 55),
};

/**
 * La croix directionnelle, suivie à part du stick.
 *
 * Les deux faisaient le même pas, ce qui gaspillait la moitié des commandes.
 * La croix enjambe cinq jeux, le stick en avance un : le pouce choisit la
 * vitesse sans qu'on ait à apprendre quoi que ce soit.
 */
const croix = {
  gauche: new Held(300, 90),
  droite: new Held(300, 90),
  haut: new Held(300, 90),
  bas: new Held(300, 90),
};

/** Les gâchettes du dessus, qui font sauter de cinq consoles. */
const rails = { avant: new Held(320, 130), arriere: new Held(320, 130) };
const valider = new Held(1000, 1000);

/** Vrai quand une vue manette est à l'écran et qu'elle a de quoi montrer. */
function vueManette(): 'grille' | 'xmb' | null {
  if (libraryView.hidden) return null;
  if (enGrille() && tuiles.length > 0) return 'grille';
  if (enXmb() && voletsXmb.length > 0) return 'xmb';
  return null;
}

/** Les filtres d'appui des boutons autres que les directions. */
const boutons = {
  b: new Held(1000, 1000),
  start: new Held(1000, 1000),
  retour: new Held(1000, 1000),
  favori: new Held(1000, 1000),
  recadre: new Held(1000, 1000),
  plein: new Held(1000, 1000),
  capture: new Held(1200, 1200),
  // Dans le recadrage, les gâchettes se tiennent pour resserrer d'un trait.
  serrer: new Held(320, 90),
  elargir: new Held(320, 90),
  // Les gâchettes hautes se tiennent pour traverser vite : elles répètent.
  lettreAvant: new Held(380, 200),
  lettreArriere: new Held(380, 200),
};

/**
 * Conduit toute l'application à la manette.
 *
 * Trois terrains, dans cet ordre : une fenêtre ouverte, la barre de menus
 * dépliée, sinon la bibliothèque. Le premier qui répond prend tout — sans quoi
 * un même appui ferait deux choses à la fois, et on ne saurait jamais laquelle.
 */
function naviguerMenu(): void {
  // `currentPad` et non `padIndex` : sous Windows la manette ne s'annonce
  // qu'au premier bouton pressé, et ce bouton-là est souvent le nôtre.
  const pad = currentPad();
  if (!pad) return;

  const [x = 0, y = 0] = pad.axes;
  const maintenant = performance.now();
  const stick: Record<Direction, boolean> = {
    gauche: x < -STICK_DEADZONE,
    droite: x > STICK_DEADZONE,
    haut: y < -STICK_DEADZONE,
    bas: y > STICK_DEADZONE,
  };
  const dpad: Record<Direction, boolean> = {
    gauche: pad.buttons[14]?.pressed ?? false,
    droite: pad.buttons[15]?.pressed ?? false,
    haut: pad.buttons[12]?.pressed ?? false,
    bas: pad.buttons[13]?.pressed ?? false,
  };
  // Hors du menu animé, les deux commandent la même chose : une grille n'a pas
  // de « cinq crans » qui veuille dire quelque chose.
  const pousse: Record<Direction, boolean> = {
    gauche: stick.gauche || dpad.gauche,
    droite: stick.droite || dpad.droite,
    haut: stick.haut || dpad.haut,
    bas: stick.bas || dpad.bas,
  };

  const appuye = (index: number) => pad.buttons[index]?.pressed ?? false;
  const select0 = appuye(BOUTON.select);
  /** Le petit bruit, partagé par toutes les branches manette. */
  const tic = (lance = false) => bruit(lance);
  const a = valider.update(appuye(BOUTON.a), maintenant).pressed;
  const b = boutons.b.update(appuye(BOUTON.b), maintenant).pressed;
  const start = boutons.start.update(appuye(BOUTON.start), maintenant).pressed;

  const enMenu = !libraryView.hidden && !document.querySelector('dialog[open]') && enXmb();

  const pas: Direction[] = [];
  for (const sens of ['gauche', 'droite', 'haut', 'bas'] as Direction[]) {
    // Dans le menu animé, la croix et le stick sont deux commandes distinctes :
    // l'une enjambe, l'autre avance d'un cran. Partout ailleurs elles font la
    // même chose, et les confondre évite deux déplacements pour un seul geste.
    const source = enMenu ? stick[sens] : pousse[sens];
    const etat = directions[sens].update(source, maintenant);
    if (etat.pressed || etat.repeat) pas.push(sens);
  }

  if (enMenu) {
    for (const sens of ['haut', 'bas'] as Direction[]) {
      const etat = croix[sens].update(dpad[sens], maintenant);
      if (etat.pressed || etat.repeat) {
        tic();
        deplacerXmb(sens, ENJAMBEE);
      }
    }
    // À gauche et à droite la croix reste fine : les gâchettes font déjà le
    // saut de cinq consoles, et deux commandes pour la même chose se gênent.
    for (const sens of ['gauche', 'droite'] as Direction[]) {
      const etat = croix[sens].update(dpad[sens], maintenant);
      if (etat.pressed || etat.repeat) {
        tic();
        deplacerXmb(sens);
      }
    }

    const filer = rails.avant.update(!select0 && appuye(5), maintenant);
    const revenir = rails.arriere.update(!select0 && appuye(4), maintenant);
    if (filer.pressed || filer.repeat) {
      tic();
      deplacerXmb('droite', ENJAMBEE);
    }
    if (revenir.pressed || revenir.repeat) {
      tic();
      deplacerXmb('gauche', ENJAMBEE);
    }
  }


  // Pendant une partie, Select et Start ensemble ramènent à la bibliothèque.
  // Deux boutons à la fois plutôt qu'un seul : chacun d'eux sert au jeu, et
  // les deux ensemble ne se pressent jamais par hasard.
  if (libraryView.hidden) {
    surveillerEtats(pad, maintenant);
    if (boutons.capture.update(appuye(BOUTON.select) && appuye(BOUTON.y), maintenant).pressed) {
      void prendreCapture();
    }
    // Le même raccourci qu'au menu : en pleine partie, X seul sert au jeu, d'où
    // les deux boutons.
    if (boutons.plein.update(select0 && appuye(BOUTON.x), maintenant).pressed) {
      void toggleFullscreen();
    }
    const ensemble = appuye(BOUTON.select) && appuye(BOUTON.start);
    if (boutons.retour.update(ensemble, maintenant).pressed) {
      tic(true);
      void actions.stop?.();
    }
    return;
  }

  const fenetre = document.querySelector<HTMLDialogElement>('dialog[open]');
  if (fenetre === dialogs.crop) {
    // Le recadrage ne se parcourt pas comme une fenêtre de réglages : les
    // directions n'y changent pas de champ, elles déplacent le cadre.
    conduireRecadrage({ pas, a, b }, appuye, maintenant, tic);
    return;
  }
  if (fenetre) {
    conduireFenetre(fenetre, { pas, a, b }, tic);
    return;
  }

  if (menubar.querySelector('[data-open]')) {
    conduireBarre({ pas, a, b: b || start }, tic);
    return;
  }

  if (start) {
    tic();
    // Dépouillée, la barre de menus n'existe plus : Start la rend plutôt que de
    // ne rien faire. Sans cela, le plein écran de salon serait un cul-de-sac
    // pour qui n'a qu'une manette en main.
    if (tempsPleinEcran === PLEIN.depouille) poserPleinEcran(PLEIN.ecran);
    else ouvrirBarre(0);
    return;
  }

  const vue = vueManette();
  if (!vue) return;

  for (const sens of pas) {
    pousser(vue, sens);
    tic();
  }

  if (a) {
    tic(true);
    void (vue === 'grille' ? jouerChoisie() : jouerXmb());
  }

  // Les gâchettes hautes sautent d'initiale — sauf quand Select est tenu,
  // auquel cas la combinaison appartient aux sauvegardes rapides.
  // Les gâchettes basses : le saut par initiale. Elles ont pris la place des
  // gâchettes du dessus, passées au saut de cinq consoles.
  const avant = boutons.lettreAvant.update(!select0 && appuye(7), maintenant);
  const arriere = boutons.lettreArriere.update(!select0 && appuye(6), maintenant);
  if (avant.pressed || avant.repeat) {
    tic();
    sauterLettre(vue, 1);
  }
  if (arriere.pressed || arriere.repeat) {
    tic();
    sauterLettre(vue, -1);
  }

  // Select tenu, X ne met plus en favori : c'est le plein écran. Sans cette
  // réserve, le raccourci ferait les deux d'un coup.
  if (boutons.plein.update(select0 && appuye(BOUTON.x), maintenant).pressed) {
    tic();
    void toggleFullscreen();
    return;
  }

  if (boutons.favori.update(!select0 && appuye(BOUTON.x), maintenant).pressed) {
    const item = jeuVise();
    if (item) {
      tic();
      const mis = basculerFavori(item.rom.path);
      log(
        mis
          ? dit('{0} — mis en favori', item.rom.name)
          : dit('{0} — retiré des favoris', item.rom.name),
        'ok',
      );
    }
  }

  // Y ouvre le recadrage de la jaquette visée — le geste que la souris fait
  // d'un clic droit, et le menu animé d'un clic sur la grande image.
  if (boutons.recadre.update(appuye(BOUTON.y), maintenant).pressed) {
    const item = jeuVise();
    if (item) {
      tic();
      void ouvrirRecadrage(item);
    }
  }
}

/**
 * Conduit le recadrage à la manette.
 *
 * Les directions déplacent le cadre, les gâchettes basses le resserrent ou
 * l'élargissent, A l'applique et B renonce. Les directions ne changent pas de
 * bouton comme ailleurs : dans cette fenêtre il n'y a qu'une chose à faire, et
 * c'est déplacer le cadre.
 */
function conduireRecadrage(
  entree: { pas: Direction[]; a: boolean; b: boolean },
  appuye: (index: number) => boolean,
  maintenant: number,
  tic: (lance?: boolean) => void,
): void {
  if (entree.b) {
    tic();
    dialogs.crop.close();
    return;
  }
  if (entree.a) {
    tic(true);
    void appliquerRecadrage();
    return;
  }

  for (const sens of entree.pas) {
    const dx = sens === 'droite' ? 1 : sens === 'gauche' ? -1 : 0;
    const dy = sens === 'bas' ? 1 : sens === 'haut' ? -1 : 0;
    poserCadre(deplacer(cadre, dx * PAS_CADRE * 2, dy * PAS_CADRE * 2));
  }

  // Les quatre gâchettes, hautes et basses : toutes les manettes n'annoncent
  // pas les basses comme des boutons, et se priver des hautes laissait la
  // fenêtre sans moyen de resserrer.
  const serrer = boutons.serrer.update(appuye(4) || appuye(6), maintenant);
  const elargir = boutons.elargir.update(appuye(5) || appuye(7), maintenant);
  if (serrer.pressed || serrer.repeat) poserCadre(zoomer(cadre, 0.96));
  if (elargir.pressed || elargir.repeat) poserCadre(zoomer(cadre, 1 / 0.96));
}

// --- Barre de menus à la manette --------------------------------------------

/**
 * Déplie un menu de la barre et vise sa première entrée.
 *
 * Quand tout y est grisé — « Émulation » hors partie — c'est le titre du menu
 * qu'on vise. Sans cela la sélection disparaissait, et la manette semblait ne
 * plus répondre alors qu'elle attendait sagement.
 */
function ouvrirBarre(rang: number): void {
  const menus = [...menubar.querySelectorAll<HTMLElement>('[data-menu]')];
  const menu = menus[Math.min(Math.max(rang, 0), menus.length - 1)];
  if (!menu) return;

  closeMenus();
  menu.setAttribute('data-open', '');
  const premier = menu.querySelector<HTMLButtonElement>('.menu-items button:not([disabled])');
  (premier ?? menu.querySelector<HTMLButtonElement>('.menu-title'))?.focus();
}

/**
 * Parcourt la barre de menus dépliée.
 *
 * Gauche et droite changent de menu, haut et bas d'entrée, A valide, B replie.
 * C'est exactement ce que fait un clavier sur n'importe quelle barre de menus :
 * il n'y a rien à apprendre.
 */
function conduireBarre(
  entree: { pas: Direction[]; a: boolean; b: boolean },
  tic: (lance?: boolean) => void,
): void {
  // Rien de pressé, rien à faire : interroger le document à chaque trame pour
  // constater qu'on n'a rien demandé coûte une mise en page pour rien.
  if (entree.pas.length === 0 && !entree.a && !entree.b) return;

  const menus = [...menubar.querySelectorAll<HTMLElement>('[data-menu]')];
  const ouvert = menus.findIndex((menu) => menu.hasAttribute('data-open'));

  if (entree.b) {
    tic();
    closeMenus();
    return;
  }

  const cote = (sens: Direction) =>
    ouvrirBarre(tourne(ouvert, menus.length, sens === 'droite' ? 1 : -1));

  for (const sens of entree.pas) {
    const items = [
      ...(menus[ouvert]?.querySelectorAll<HTMLButtonElement>(
        '.menu-items button:not([disabled])',
      ) ?? []),
    ];

    // Un volet sur plusieurs colonnes — celui des langues — se parcourt à la
    // géométrie. En file indienne, atteindre le tamoul demanderait quarante
    // appuis, et gauche-droite n'y servirait à rien. On reconnaît la grille à
    // ce que deux entrées partagent une rangée.
    const enGrille = items.some((item, rang) => rang > 0 && item.offsetTop === items[0].offsetTop);

    if (enGrille) {
      const boites: Boite[] = items.map((item) => ({
        x: item.offsetLeft,
        y: item.offsetTop,
        w: item.offsetWidth,
        h: item.offsetHeight,
      }));
      const depart = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
      const vise = voisin(depart, boites, sens);
      if (vise !== depart) {
        tic();
        items[vise].focus();
        continue;
      }
      // Rien de ce côté : on sort du menu comme dans une barre ordinaire.
      // Sans cela, la première colonne serait un cul-de-sac.
      if (sens === 'gauche' || sens === 'droite') {
        tic();
        cote(sens);
      }
      continue;
    }

    if (sens === 'gauche' || sens === 'droite') {
      tic();
      cote(sens);
      continue;
    }

    const courant = items.indexOf(document.activeElement as HTMLButtonElement);
    const suivant = items[tourne(courant < 0 ? 0 : courant, items.length, sens === 'bas' ? 1 : -1)];
    if (suivant) {
      tic();
      suivant.focus();
    }
  }

  if (entree.a) {
    tic(true);
    const vise = document.activeElement as HTMLElement | null;
    closeMenus();
    vise?.click();
  }
}

// --- Fenêtres à la manette --------------------------------------------------

/** Les éléments d'une fenêtre qui répondent, dans l'ordre où on les voit. */
function actifsDe(fenetre: HTMLElement): HTMLElement[] {
  return [...fenetre.querySelectorAll<HTMLElement>(SELECTEUR_ACTIF)].filter(
    // Mesuré plutôt que déduit d'un style : viser un élément replié ou masqué
    // donnerait une manette qui ne répond plus, sans explication. L'élément
    // déjà visé est gardé quoi qu'il arrive, faute de quoi la position se
    // perdrait au moment même où une section se déplie.
    (element) => element.getBoundingClientRect().width > 0 || element === document.activeElement,
  );
}

/**
 * Parcourt une fenêtre ouverte.
 *
 * Haut et bas passent d'un réglage à l'autre, A l'actionne, B referme. Gauche
 * et droite servent à ce qu'un appui ne peut pas faire : pousser un curseur,
 * dérouler une liste — et, à défaut, se déplacent comme haut et bas, ce qui
 * rend les grilles de vignettes naturelles à parcourir.
 */
function conduireFenetre(
  fenetre: HTMLDialogElement,
  entree: { pas: Direction[]; a: boolean; b: boolean },
  tic: (lance?: boolean) => void,
): void {
  if (entree.b) {
    tic();
    fenetre.close();
    return;
  }
  if (entree.pas.length === 0 && !entree.a) return;

  const actifs = actifsDe(fenetre);
  if (actifs.length === 0) return;

  let courant = actifs.indexOf(document.activeElement as HTMLElement);
  if (courant < 0) {
    courant = premierUtile(actifs.map((element) => element.textContent ?? ''));
    actifs[courant]?.focus();
  }

  for (const sens of entree.pas) {
    const vise = actifs[courant];
    const geste = gestePour(vise?.tagName ?? '', (vise as HTMLInputElement)?.type ?? '');

    if ((sens === 'gauche' || sens === 'droite') && geste === 'glisser') {
      const curseur = vise as HTMLInputElement;
      const valeur = Number(curseur.value);

      // Une jauge peut porter des paliers, et la manette n'y passe alors que
      // par eux.
      const crans = (curseur.dataset.crans ?? '')
        .split(/\s+/)
        .map(Number)
        .filter((cran) => Number.isFinite(cran));

      if (crans.length > 0) {
        const suivant = cranSuivant(valeur, crans, sens);
        if (suivant === null) continue;
        curseur.value = String(suivant);
      } else {
        const enjambee = Number(curseur.step) || 1;
        curseur.value = String(valeur + (sens === 'droite' ? enjambee : -enjambee));
      }

      curseur.dispatchEvent(new Event('input', { bubbles: true }));
      curseur.dispatchEvent(new Event('change', { bubbles: true }));
      tic();
      continue;
    }

    if ((sens === 'gauche' || sens === 'droite') && geste === 'derouler') {
      const liste = vise as HTMLSelectElement;
      liste.selectedIndex = tourne(
        liste.selectedIndex,
        liste.options.length,
        sens === 'droite' ? 1 : -1,
      );
      liste.dispatchEvent(new Event('change', { bubbles: true }));
      tic();
      continue;
    }

    courant = tourne(courant, actifs.length, sens === 'bas' || sens === 'droite' ? 1 : -1);
    actifs[courant]?.focus();
    tic();
  }

  if (entree.a) {
    const vise = actifs[courant];
    if (!vise) return;
    tic(true);
    // Une case à cocher se clique, ce qui la bascule et prévient l'application.
    // Un curseur et une liste ne répondent pas au clic : ils ont déjà été
    // servis par gauche et droite, et un appui ne doit rien leur faire.
    const geste = gestePour(vise.tagName, (vise as HTMLInputElement).type ?? '');
    if (geste === 'cliquer' || geste === 'cocher') vise.click();
  }
}

/**
 * Le petit bruit d'un déplacement ou d'une validation.
 *
 * Partagé entre la manette et le clavier : les deux conduisent les mêmes
 * menus, et n'en sonoriser qu'un donnerait l'impression que l'autre ne compte
 * pas tout à fait.
 */
function bruit(lance = false): void {
  if (!sonsVoulus()) return;
  if (lance) ticValidation();
  else ticDeplacement();
}

// --- Molette dans le menu animé ---------------------------------------------

/**
 * Ce que la molette commande dépend de l'endroit où se trouve le pointeur.
 *
 * Au-dessus de la rangée des consoles, elle change de console ; partout
 * ailleurs, elle parcourt les jeux. C'est ce qu'on attend d'un menu en deux
 * axes : la molette agit sur ce que l'on survole, comme n'importe quelle liste.
 */
let molette = 0;
let molettePrecedente = 0;

/**
 * Un cran de molette, quelle que soit la souris.
 *
 * Les souris n'envoient pas toutes la même chose : une souris ordinaire donne
 * cent à cent vingt pixels par cran, un pavé tactile une pluie de petits pas.
 * On accumule donc jusqu'à un seuil plutôt que d'agir à chaque message, faute
 * de quoi la même rotation traverserait un jeu sur l'une et trente sur l'autre.
 *
 * Cent, et non soixante : un cran de souris vaut cent vingt, et un seuil plus
 * bas faisait avancer de deux jeux pour un seul cran.
 */
const CRAN = 100;

xmbView.addEventListener(
  'wheel',
  (event) => {
    if (xmbView.hidden || libraryView.hidden) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();

    // Deux rotations séparées par un silence ne s'additionnent pas : sans cela
    // un reliquat oublié ferait sauter un cran au coup d'après.
    const maintenant = performance.now();
    if (maintenant - molettePrecedente > 400) molette = 0;
    molettePrecedente = maintenant;

    molette += event.deltaY;
    const crans = Math.trunc(molette / CRAN);
    if (crans === 0) return;
    molette -= crans * CRAN;

    const rail = xmbRail.getBoundingClientRect();
    const surLesConsoles = event.clientY >= rail.top && event.clientY <= rail.bottom;
    const sens: Direction = surLesConsoles
      ? crans > 0
        ? 'droite'
        : 'gauche'
      : crans > 0
        ? 'bas'
        : 'haut';

    for (let reste = Math.min(Math.abs(crans), 8); reste > 0; reste -= 1) {
      deplacerXmb(sens);
    }
    // Le même bruit qu'à la manette : c'est le même déplacement.
    bruit();
  },
  { passive: false },
);

// --- Saut par initiale ------------------------------------------------------

/**
 * Montre la lettre atteinte, le temps d'un saut.
 *
 * Sans ce repère, sauter de lettre en lettre revient à avancer les yeux
 * fermés : la liste bouge, mais rien ne dit où l'on vient d'arriver.
 */
let lettreMinuterie = 0;

function montrerLettre(texte: string): void {
  const boite = enGrille() ? grilleLettre : xmbLettre;
  clearTimeout(lettreMinuterie);
  boite.textContent = texte;
  boite.hidden = false;
  // L'animation repart de zéro à chaque saut : sans ce retrait, deux sauts
  // rapprochés laisseraient la première lettre s'effacer sous la seconde.
  boite.style.animation = 'none';
  void boite.offsetWidth;
  boite.style.animation = '';
  lettreMinuterie = window.setTimeout(() => {
    boite.hidden = true;
  }, 700);
}

/** Les initiales des jeux de la vue en cours, dans l'ordre affiché. */
function initialesVue(vue: 'grille' | 'xmb'): string[] {
  const liste = vue === 'grille' ? tuiles : (voletsXmb[colonneXmb]?.games ?? []);
  return liste.map((item) => initiale(gameLabel(item.rom.name)));
}

/**
 * Saute à la lettre suivante ou précédente.
 *
 * C'est la réponse à la recherche sans clavier : le champ de recherche demande
 * un clavier qu'on n'a pas manette en main, et cinq cents jeux ne se
 * parcourent pas case par case.
 */
function sauterLettre(vue: 'grille' | 'xmb', sens: 1 | -1): void {
  const initiales = initialesVue(vue);
  if (initiales.length === 0) return;

  const depuis = vue === 'grille' ? choisie : entreeXmb;
  const vers = sautInitiale(depuis, initiales, sens);
  if (vers === depuis) return;

  if (vue === 'grille') choisir(vers);
  else allerEntree(vers);
  montrerLettre(initiales[vers]);
}

/** Déplace la sélection de la vue en cours. */
function pousser(vue: 'grille' | 'xmb', sens: Direction): void {
  if (vue === 'grille') choisir(voisin(choisie, boitesGrille, sens));
  else deplacerXmb(sens);
}

/**
 * Les raccourcis d'état au clavier : capture et déclenchement.
 *
 * Posé avant tout le reste de la page — `capture` — pour prendre la touche
 * avant qu'un champ de saisie ne s'en empare.
 */
document.addEventListener(
  'keydown',
  (event) => {
    if (raccourciEnAttente) {
      event.preventDefault();
      if (event.key === 'Escape') {
        raccourciEnAttente = null;
        renderRaccourcisEtat();
        return;
      }
      poserRaccourci(raccourciEnAttente, { clavier: event.key });
      return;
    }

    if (!core || !libraryView.hidden) return;

    if (event.key === 'F12') {
      event.preventDefault();
      void prendreCapture();
      return;
    }

    for (const quoi of ['sauver', 'charger'] as const) {
      if (raccourcisEtat[quoi].clavier && raccourcisEtat[quoi].clavier === event.key) {
        event.preventDefault();
        void actions[quoi === 'sauver' ? 'save' : 'restore']?.();
      }
    }
  },
  true,
);

/** Les flèches du clavier, comme la croix de la manette. */
const FLECHES: Record<string, Direction> = {
  ArrowLeft: 'gauche',
  ArrowRight: 'droite',
  ArrowUp: 'haut',
  ArrowDown: 'bas',
};

/*
 * Les deux vues se parcourent aussi au clavier.
 *
 * Elles sont faites pour la manette, mais elles restent en place une fois
 * choisies : s'en servir sans manette ne doit pas obliger à repasser en liste.
 * Les flèches horizontales sont laissées au champ de recherche quand on y
 * écrit — elles y déplacent le curseur, et on ne prend pas ce qui sert déjà.
 */
document.addEventListener('keydown', (event) => {
  const vue = vueManette();
  if (!vue) return;
  // Une fenêtre ouverte prend la main : sans cela, régler ses touches ferait
  // défiler la bibliothèque derrière, hors de vue.
  if (document.querySelector('dialog[open]') || menubar.querySelector('[data-open]')) return;

  const dansLaRecherche = event.target === searchInput;
  const sens = FLECHES[event.key];

  if (sens) {
    if (dansLaRecherche && (sens === 'gauche' || sens === 'droite')) return;
    event.preventDefault();
    pousser(vue, sens);
    bruit();
    return;
  }

  if ((event.key === 'PageDown' || event.key === 'PageUp') && !dansLaRecherche) {
    event.preventDefault();
    bruit();
    sauterLettre(vue, event.key === 'PageDown' ? 1 : -1);
    return;
  }

  if (event.key === 'Enter' && !dansLaRecherche) {
    event.preventDefault();
    bruit(true);
    void (vue === 'grille' ? jouerChoisie() : jouerXmb());
  }
});

// --- Menu animé -------------------------------------------------------------

/**
 * La présentation façon console de salon : une rangée de consoles, une colonne
 * de jeux, un fond qui ondule.
 *
 * Rien ne défile au sens habituel. Les deux pistes sont translatées pour
 * amener la sélection sous un repère fixe — la pastille en haut à gauche, la
 * ligne en vue à mi-hauteur. La sélection ne bouge donc jamais des yeux, ce
 * qui est tout l'intérêt d'un menu qu'on parcourt à trois mètres de l'écran.
 */

/**
 * Largeur d'une pastille de console, hauteur d'une entrée, et à quelle ligne
 * se tient la sélection. Les deux premières valeurs doivent suivre la feuille
 * de style : c'est d'elles que se déduit le décalage des pistes.
 *
 * L'ancre est à zéro : le jeu choisi se tient juste sous la rangée des
 * consoles, et la liste descend sous lui. C'est la disposition d'une console
 * de salon — ce qui est choisi est en haut, ce qui reste à voir en dessous.
 * Ancré plus bas, le menu s'ouvrait sur un grand vide.
 */
const XMB = { colonne: 86, entree: 54, ancre: 0 };

/**
 * Le facteur d'agrandissement en cours, posé sur la vue et lu par le calcul
 * des décalages. Une seule source : la feuille de style et le script doivent
 * s'accorder au pixel près, sinon la sélection dérive d'une ligne tous les
 * vingt jeux.
 */
let echelleXmb = 1;

function poserEchelle(): void {
  echelleXmb = echelle(xmbView.clientHeight);
  xmbView.style.setProperty('--ech', String(echelleXmb));
}

/** Les volets tels que le menu animé les montre. */
let voletsXmb: Shelf[] = [];
/** La console en cours, et le jeu en cours dans cette console. */
let colonneXmb = 0;
let entreeXmb = 0;
/** Le rang retenu pour chaque console : on y revient là où on l'avait laissée. */
const rangsXmb = new Map<string, number>();

/** Vrai quand la bibliothèque s'affiche façon console de salon. */
function enXmb(): boolean {
  return menuActuel() === 'xmb';
}

/**
 * Les initiales d'une console, pour sa pastille.
 *
 * Trois lettres au plus : au-delà, le texte ne tient plus dans le rond. Ce sont
 * des repères de position, pas des noms — le nom complet est écrit sous la
 * pastille en cours et dans le titre, en haut à gauche.
 */
function initiales(label: string): string {
  const propre = label.replace(/[^a-z0-9 ]/gi, ' ').trim();
  // « 32X », « NES », « PSP » se lisent tels quels.
  if (propre.length <= 4 && !propre.includes(' ')) return propre.toUpperCase();

  const mots = propre.split(/\s+/).filter(Boolean);
  if (mots.length === 0) return '?';
  if (mots.length === 1) return mots[0].slice(0, 3).toUpperCase();
  return mots
    .slice(0, 3)
    .map((mot) => mot[0])
    .join('')
    .toUpperCase();
}

/** Redessine la rangée des consoles. */
function renderColonnesXmb(): void {
  xmbColonnes.replaceChildren();

  for (const [rang, shelf] of voletsXmb.entries()) {
    const pastille = document.createElement('button');
    pastille.type = 'button';
    pastille.className = 'xmb-console';
    pastille.title = `${t(shelf.label)} — ${plural(shelf.games.length, 'jeu', 'jeux')}`;

    const rond = document.createElement('span');
    rond.className = 'rond';
    // Les favoris portent une étoile plutôt que des initiales : c'est le seul
    // volet qu'on ne reconnaît pas à sa console.
    rond.textContent =
      shelf.key === FAVORIS
        ? '★'
        : shelf.key === GALERIE
          ? '📷'
          : shelf.key === REPRENDRE
            ? '▶'
            : initiales(shelf.label);

    const etiquette = document.createElement('span');
    etiquette.className = 'etiquette';
    etiquette.textContent = shelf.label;

    pastille.append(rond, etiquette);
    // Le même cran qu'à la manette : choisir une console d'un clic est le même
    // geste, et le silence donnait l'impression que le clic n'avait pas porté.
    pastille.addEventListener('click', () => {
      if (rang !== colonneXmb && sonsVoulus()) ticDeplacement();
      allerColonne(rang);
    });
    xmbColonnes.append(pastille);
  }
}

/** Redessine la colonne des jeux de la console en cours. */
function renderEntreesXmb(): void {
  xmbEntrees.replaceChildren();
  const shelf = voletsXmb[colonneXmb];
  if (!shelf) return;

  for (const [rang, item] of shelf.games.entries()) {
    const entree = document.createElement('button');
    entree.type = 'button';
    entree.className = 'xmb-entree';
    entree.title = item.rom.path;

    const vignette = document.createElement('span');
    vignette.className = 'vignette';

    const initiale = document.createElement('span');
    initiale.textContent = item.rom.name.slice(0, 1).toUpperCase();
    vignette.append(initiale);

    if (shelf.key === GALERIE) {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.className = 'vue';
      image.src = captures[rang]?.data ?? '';
      image.addEventListener('load', () => {
        initiale.hidden = true;
      });
      vignette.append(image);
    } else if (jaquettesVoulues()) {
      const jaquette = document.createElement('img');
      jaquette.alt = '';
      jaquette.loading = 'lazy';
      jaquette.dataset.console = item.rom.folder;
      jaquette.dataset.jeu = item.rom.name;
      jaquette.dataset.chemin = item.rom.path;
      jaquette.addEventListener('load', () => {
        initiale.hidden = true;
      });
      vignette.append(jaquette);
      regarderJaquette(jaquette);
    }

    const texte = document.createElement('span');
    texte.className = 'texte';

    const titre = document.createElement('span');
    titre.className = 'titre';
    titre.textContent = gameLabel(item.rom.name);

    const detail = document.createElement('span');
    detail.className = 'detail';
    if (shelf.key === GALERIE) {
      const capture = captures[rang];
      detail.textContent = capture?.taken
        ? new Date(capture.taken * 1000).toLocaleString(localeCourante(), {
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })
        : t('capture');
    } else if (shelf.key === REPRENDRE) {
      // Ici on veut savoir quand et combien, pas avec quel émulateur.
      const vu = detailRecent(item.rom.path);
      detail.textContent = vu
        ? `${formatWhen(vu.played, Math.floor(Date.now() / 1000), localeCourante())} · ${formatPlaytime(
            vu.seconds,
            localeCourante(),
            t('moins d’une minute'),
          )}`
        : '';
    } else {
      const cœur = effectiveCore(item.rom, item.cores, chosenCore, shelf.preferred);
      detail.textContent = `${cœur?.label ?? t('aucun émulateur')} · ${humanSize(item.rom.size)}`;
    }

    texte.append(titre, detail);
    entree.append(vignette, texte);
    if (estFavori(item.rom.path)) {
      const etoile = document.createElement('span');
      etoile.className = 'etoile';
      etoile.textContent = '★';
      etoile.title = t('Favori');
      entree.append(etoile);
    }
    entree.addEventListener('click', () => {
      if (rang === entreeXmb) {
        if (sonsVoulus()) ticValidation();
        void jouerXmb();
      } else {
        if (sonsVoulus()) ticDeplacement();
        allerEntree(rang);
      }
    });
    entree.addEventListener('contextmenu', (event) => {
      allerEntree(rang);
      ouvrirContextuel(event, item);
    });
    xmbEntrees.append(entree);
  }
}

/**
 * Amène la sélection sous son repère et marque ce qui est choisi.
 *
 * Les pistes sont translatées plutôt que défilées : une transformation ne
 * refait aucune mise en page, et c'est ce qui permet d'animer soixante fois
 * par seconde sans que la fenêtre s'essouffle.
 */
function placerXmb(): void {
  const shelf = voletsXmb[colonneXmb];

  const consoles = [...xmbColonnes.children] as HTMLElement[];
  for (const [rang, pastille] of consoles.entries()) {
    pastille.setAttribute('aria-selected', String(rang === colonneXmb));
  }
  // La console en cours vient se placer à gauche, à une pastille du bord.
  xmbColonnes.style.transform = `translateX(${(1 - colonneXmb) * XMB.colonne * echelleXmb}px)`;

  const entrees = [...xmbEntrees.children] as HTMLElement[];
  for (const [rang, entree] of entrees.entries()) {
    entree.setAttribute('aria-selected', String(rang === entreeXmb));
  }
  // Le jeu en cours vient se placer à la troisième ligne : assez bas pour
  // qu'on voie d'où l'on vient, assez haut pour qu'on voie où l'on va.
  xmbEntrees.style.transform = `translateY(${(XMB.ancre - entreeXmb) * XMB.entree * echelleXmb}px)`;

  xmbConsole.textContent = shelf ? t(shelf.label) : '—';
  const item = shelf?.games[entreeXmb];
  const galerie = shelf?.key === GALERIE;
  const quoi = galerie ? (['capture', 'captures'] as const) : (['jeu', 'jeux'] as const);
  xmbPied.textContent = shelf
    ? `${plural(shelf.games.length, quoi[0], quoi[1])} · ${dit('{0} sur {1}', entreeXmb + 1, shelf.games.length)}${
        item && !galerie ? ` · ${item.rom.extension}` : ''
      }`
    : '';

  // Dans la galerie, la grande image est la capture elle-même : rien à aller
  // chercher, elle est déjà entre nos mains.
  if (galerie) {
    afficheJeton += 1;
    clearTimeout(afficheMinuterie);
    xmbAfficheInitiale.hidden = true;
    xmbAfficheImage.src = captures[entreeXmb]?.data ?? '';
  } else {
    poserAffiche(item);
  }
}

/**
 * Pose la jaquette en grand du jeu sous le repère.
 *
 * Un jeton plutôt qu'une file d'attente : à la manette, on traverse dix jeux
 * avant que la première jaquette soit résolue, et sans ce garde-fou la
 * dernière arrivée l'emporterait sur la bonne.
 */
let afficheJeton = 0;
let afficheMinuterie = 0;

/**
 * La grande jaquette attend qu'on se pose.
 *
 * Elle n'est demandée qu'après un court arrêt : à la manette on traverse vingt
 * jeux en une seconde, et demander vingt images dont dix-neuf seront jetées
 * aussitôt rend le défilement saccadé pour rien. Le nom, lui, change tout de
 * suite — c'est lui qu'on lit en défilant.
 */
function poserAffiche(item: Playable | undefined): void {
  const jeton = ++afficheJeton;
  clearTimeout(afficheMinuterie);

  xmbAfficheInitiale.textContent = item ? item.rom.name.slice(0, 1).toUpperCase() : '';
  xmbAfficheInitiale.hidden = false;
  xmbAfficheImage.classList.remove('vue');
  xmbAfficheImage.removeAttribute('src');

  if (!item || !jaquettesVoulues()) return;

  // Une jaquette posée à la main n'a rien à aller chercher : elle est déjà là.
  const posee = jaquettesPosees[item.rom.path];
  const recadree = jaquettesRecadrees.has(item.rom.path);
  xmbAfficheImage.classList.toggle('recadree', recadree);
  xmbAfficheImage.parentElement?.classList.toggle('recadree', recadree);
  if (posee) {
    xmbAfficheImage.src = posee;
    return;
  }

  afficheMinuterie = window.setTimeout(async () => {
    try {
      const trouve = chooseCover(await inventaire(item.rom.folder), item.rom.name);
      if (jeton !== afficheJeton || !trouve) return;
      xmbAfficheImage.src = coverUrl(trouve.folder, trouve.name, trouve.kind);
    } catch {
      // Pas de réseau : l'initiale reste, et le menu marche sans.
    }
  }, 140);
}

// Un clic sur la grande jaquette ouvre son recadrage : c'est là qu'on voit
// qu'elle est mal cadrée, et c'est donc là qu'on veut pouvoir la reprendre.
// La galerie est exclue : ce qu'on y montre est une capture, pas une jaquette.
xmbAfficheImage.addEventListener('click', () => {
  if (voletsXmb[colonneXmb]?.key === GALERIE) return;
  const item = voletsXmb[colonneXmb]?.games[entreeXmb];
  if (item) void ouvrirRecadrage(item);
});

xmbAfficheImage.addEventListener('load', () => {
  xmbAfficheImage.classList.add('vue');
  xmbAfficheInitiale.hidden = true;
});

/** Change de console, en retrouvant le jeu où on l'avait laissé. */
function allerColonne(rang: number): void {
  const precedente = voletsXmb[colonneXmb];
  if (precedente) rangsXmb.set(precedente.key, entreeXmb);

  colonneXmb = step(rang, voletsXmb.length, 0);
  const suivante = voletsXmb[colonneXmb];
  entreeXmb = suivante
    ? Math.min(rangsXmb.get(suivante.key) ?? 0, Math.max(0, suivante.games.length - 1))
    : 0;

  renderEntreesXmb();
  placerXmb();
}

/** Change de jeu dans la console en cours. */
function allerEntree(rang: number): void {
  const shelf = voletsXmb[colonneXmb];
  entreeXmb = step(rang, shelf?.games.length ?? 0, 0);
  placerXmb();
}

/** Un pas de manette dans le menu animé. */
/**
 * Combien de crans à la fois quand on pousse fort.
 *
 * Assez pour traverser une longue liste sans s'endormir, pas assez pour qu'on
 * doive revenir en arrière à chaque fois. Cinq est le compromis que prennent
 * les consoles de salon.
 */
const ENJAMBEE = 5;

function deplacerXmb(sens: Direction, pas = 1): void {
  const shelf = voletsXmb[colonneXmb];
  if (sens === 'gauche' || sens === 'droite') {
    allerColonne(step(colonneXmb, voletsXmb.length, sens === 'droite' ? pas : -pas));
  } else {
    allerEntree(step(entreeXmb, shelf?.games.length ?? 0, sens === 'bas' ? pas : -pas));
  }
}

/** Lance le jeu sous le repère. */
async function jouerXmb(): Promise<void> {
  const shelf = voletsXmb[colonneXmb];
  const item = shelf?.games[entreeXmb];
  if (!shelf || !item) return;

  // Dans la galerie, valider ouvre la galerie : il n'y a rien à lancer.
  if (shelf.key === GALERIE) {
    await ouvrirGalerie();
    return;
  }
  const cœur = effectiveCore(item.rom, item.cores, chosenCore, shelf.preferred);
  if (cœur) await play(cœur, item.rom);
}

/** Dessine tout le menu animé à partir des volets déjà classés. */
function renderXmb(shelves: Shelf[]): void {
  // On retient la console d'avant pour y revenir : mettre un jeu en favori
  // insère un volet en tête, et la sélection glissait alors d'un cran — on
  // pressait « favori » sur un jeu 32X et on se retrouvait dans les favoris.
  const avant = voletsXmb[colonneXmb]?.key;

  voletsXmb = shelves;
  const retrouve = avant === undefined ? -1 : shelves.findIndex((shelf) => shelf.key === avant);
  if (retrouve >= 0) colonneXmb = retrouve;
  colonneXmb = step(colonneXmb, shelves.length, 0);
  const shelf = shelves[colonneXmb];
  entreeXmb = step(entreeXmb, shelf?.games.length ?? 0, 0);

  poserEchelle();
  if (musiqueVoulue()) demarrerMusique();
  renderColonnesXmb();
  renderEntreesXmb();
  placerXmb();
  poserHeure();
  animerFond();
}

/**
 * L'heure, en haut à droite.
 *
 * Un menu de salon donne l'heure : on y passe le temps qu'on veut, et c'est
 * souvent la seule horloge en vue quand la fenêtre occupe l'écran. Mise à jour
 * à la demi-minute, et seulement quand le menu est là.
 */
function poserHeure(): void {
  if (xmbView.hidden) return;
  const maintenant = new Date();
  xmbHeure.textContent = maintenant.toLocaleString(localeCourante(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
setInterval(poserHeure, 30_000);

/*
 * La fenêtre change de taille : tout le menu se remet à l'échelle.
 *
 * Le décalage des pistes se calcule en pixels, donc il dépend de l'échelle :
 * sans ce rappel, agrandir la fenêtre laisserait la sélection à côté de son
 * repère, et l'écart grandirait à mesure qu'on descend dans la liste.
 */
window.addEventListener('resize', () => {
  // La grille se recompose à toute largeur : ses positions sont à relever.
  if (!grilleView.hidden) {
    releverBoites();
    choisir(choisie);
  }
  if (xmbView.hidden) return;
  poserEchelle();
  placerXmb();
});

/** Range le menu animé : plus d'entrées, plus de sélection, plus de fond qui tourne. */
function viderXmb(): void {
  arreterMusique();
  xmbView.hidden = true;
  xmbColonnes.replaceChildren();
  xmbEntrees.replaceChildren();
  voletsXmb = [];
}

// --- Fond animé -------------------------------------------------------------

/**
 * Le fond ondule tant qu'on le regarde, et pas une trame de plus.
 *
 * Une boucle qui tournerait pendant la partie volerait des trames au jeu, et
 * sur un portable elle viderait la batterie devant un menu fermé. La boucle
 * s'arrête donc d'elle-même dès que le menu n'est plus à l'écran.
 */
let fondEnCours = false;

/** La couleur des rubans, relue à chaque changement de thème. */
function encreDuFond(): string {
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim();
  const composantes = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(accent);
  if (!composantes) return '255, 255, 255';
  return composantes
    .slice(1)
    .map((paire) => Number.parseInt(paire, 16))
    .join(', ');
}

function animerFond(): void {
  if (fondEnCours) return;
  const contexte = xmbFond.getContext('2d');
  if (!contexte) return;

  fondEnCours = true;
  let encre = encreDuFond();
  let derniereMesure = 0;
  let dernierDessin = 0;

  const trame = (temps: number): void => {
    if (xmbView.hidden || libraryView.hidden) {
      fondEnCours = false;
      return;
    }

    // Trente images par seconde suffisent largement : les rubans mettent une
    // minute à faire un tour. Sur un écran à cent quarante hertz, dessiner à
    // chaque rafraîchissement quadruplerait le travail sans que rien ne se
    // voie de plus — et viderait la batterie devant un menu.
    if (temps - dernierDessin < 32) {
      requestAnimationFrame(trame);
      return;
    }
    dernierDessin = temps;

    // Le canevas est redimensionné et la couleur relue deux fois par seconde :
    // les lire à chaque trame obligerait le navigateur à recalculer la mise en
    // page soixante fois par seconde pour des valeurs qui ne bougent pas.
    if (temps - derniereMesure > 500) {
      derniereMesure = temps;
      encre = encreDuFond();
      const largeur = xmbView.clientWidth;
      const hauteur = xmbView.clientHeight;
      if (xmbFond.width !== largeur || xmbFond.height !== hauteur) {
        xmbFond.width = largeur;
        xmbFond.height = hauteur;
      }
    }

    dessinerRubans(contexte, xmbFond.width, xmbFond.height, temps / 1000, encre);
    requestAnimationFrame(trame);
  };

  requestAnimationFrame(trame);
}

// --- Jaquettes --------------------------------------------------------------

/** Les inventaires déjà relevés, par console. */
const inventaires = new Map<string, Promise<Candidate[]>>();

/** L'inventaire d'une console, demandé une seule fois par séance. */
function inventaire(consoleLabel: string): Promise<Candidate[]> {
  const deja = inventaires.get(consoleLabel);
  if (deja) return deja;

  const dossiers = thumbnailFolders(consoleLabel);
  const promesse: Promise<Candidate[]> = dossiers.length
    ? Promise.all(
        dossiers.map((dossier) =>
          coverIndex(dossier)
            .then((inventaire) => indexCovers(dossier, inventaire.names, inventaire.kind))
            .catch(() => [] as Candidate[]),
        ),
      ).then((listes) => listes.flat())
    : Promise.resolve([]);

  inventaires.set(consoleLabel, promesse);
  return promesse;
}

/**
 * Va chercher la jaquette d'une ligne quand elle approche de l'écran.
 *
 * Un observateur plutôt qu'un chargement à la construction : une bibliothèque
 * de six cents jeux demanderait six cents images dont trente sont visibles.
 * L'image est ensuite lâchée — elle ne sera plus redemandée, le cache du
 * navigateur s'en charge.
 */
const guetteur =
  typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver(
        (entrees, moi) => {
          for (const entree of entrees) {
            if (!entree.isIntersecting) continue;
            const img = entree.target as HTMLImageElement;
            moi.unobserve(img);
            void habiller(img);
          }
        },
        { rootMargin: '300px' },
      );

/** Met une ligne sous surveillance. */
function regarderJaquette(img: HTMLImageElement): void {
  if (guetteur) guetteur.observe(img);
  else void habiller(img);
}

/**
 * Les jaquettes posées à la main, relues une fois au démarrage.
 *
 * Elles passent avant le serveur de vignettes : si quelqu'un a pris la peine
 * d'en désigner une, c'est qu'aucune autre ne convenait.
 */
let jaquettesPosees: Record<string, string> = {};

/** Celles qui ont été recadrées, et non simplement désignées. */
let jaquettesRecadrees = new Set<string>();

async function relireJaquettesPosees(): Promise<void> {
  try {
    jaquettesPosees = await manualCovers();
  } catch {
    jaquettesPosees = {};
  }
  try {
    jaquettesRecadrees = new Set(await croppedCovers());
  } catch {
    jaquettesRecadrees = new Set();
  }
}

/** Cherche la jaquette qui convient et la pose, ou laisse la place vide. */
async function habiller(img: HTMLImageElement): Promise<void> {
  const consoleLabel = img.dataset.console ?? '';
  const jeu = img.dataset.jeu ?? '';
  const chemin = img.dataset.chemin ?? '';

  const posee = jaquettesPosees[chemin];
  if (posee) {
    // Recadrée à la main : on la montre telle qu'elle a été cadrée, en entier,
    // et le fond de la case s'efface pour laisser voir le décor par les bandes.
    // Une jaquette simplement désignée garde, elle, l'affichage habituel.
    if (jaquettesRecadrees.has(chemin)) {
      img.classList.add('recadree');
      img.parentElement?.classList.add('recadree');
    }
    img.addEventListener('load', () => img.classList.add('vue'), { once: true });
    img.src = posee;
    return;
  }

  if (!consoleLabel || !jeu) return;

  try {
    const disponibles = await inventaire(consoleLabel);
    const trouve = chooseCover(disponibles, jeu);
    if (!trouve) return;

    // Une image qui n'arrive pas ne laisse pas de cadre brisé : la vignette
    // disparaît, et la ligne reprend sa place.
    img.addEventListener('error', () => img.classList.remove('vue'), { once: true });
    img.addEventListener('load', () => img.classList.add('vue'), { once: true });
    img.src = coverUrl(trouve.folder, trouve.name, trouve.kind);
  } catch {
    // Pas de réseau, pas de jaquette : la bibliothèque marche sans.
  }
}

/** Construit la ligne d'un jeu. */
function gameRow(rom: RomEntry, cores: CatalogEntry[], preferred?: string): HTMLTableRowElement {
  const target = effectiveCore(rom, cores, chosenCore, preferred);

  const row = document.createElement('tr');
  row.title = rom.path;

  const name = document.createElement('td');
  name.className = 'name';

  const titre = document.createElement('span');
  titre.textContent = estFavori(rom.path) ? `★ ${rom.name}` : rom.name;

  // La jaquette précède le titre. Elle n'est pas chargée ici : la vignette
  // s'annonce, et l'observateur ira la chercher quand la ligne approchera de
  // l'écran. Six cents images demandées d'un coup ne serviraient à rien.
  // Refusées, elles ne sont pas seulement masquées : une vignette vide
  // réserverait sa place et décalerait tous les titres.
  if (jaquettesVoulues()) {
    const jaquette = document.createElement('img');
    jaquette.className = 'jaquette';
    jaquette.loading = 'lazy';
    jaquette.alt = '';
    jaquette.dataset.console = rom.folder;
    jaquette.dataset.jeu = rom.name;
    jaquette.dataset.chemin = rom.path;
    regarderJaquette(jaquette);
    name.append(jaquette);
  }

  name.append(titre);

  // Le cœur se choisit au niveau du dossier ; la ligne dit lequel s'appliquera,
  // sauf pour un fichier hors dossier, que personne n'a classé.
  const system = document.createElement('td');
  system.className = 'system';

  if (rom.folder === '' && cores.length > 1) {
    const picker = document.createElement('select');
    for (const candidate of cores) {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = candidate.label;
      picker.append(option);
    }
    picker.value = target.id;
    picker.addEventListener('click', (event) => event.stopPropagation());
    picker.addEventListener('change', () => {
      chosenCore.set(rom.path, picker.value);
      renderGames();
    });
    system.append(picker);
  } else {
    const only = document.createElement('span');
    only.className = 'single';
    only.textContent = target.label;
    system.append(only);
  }

  const format = document.createElement('td');
  format.className = 'format';
  format.textContent = rom.extension;

  const size = document.createElement('td');
  size.className = 'size';
  size.textContent = humanSize(rom.size);

  row.append(name, system, format, size);
  row.addEventListener('dblclick', () => void play(target, rom));
  row.addEventListener('contextmenu', (event) =>
    ouvrirContextuel(event, { rom, cores }),
  );
  return row;
}

/** Redessine la bibliothèque, filtrée par la recherche. */
function renderGames(): void {
  const needle = searchInput.value.trim().toLowerCase();
  const classes = withFavourites(
    groupLibrary(games, catalog, readFolderCores(), chosenCore, needle, disquesReplies()),
    favoris,
  );
  // La galerie n'existe que dans le menu animé : en liste et en grille, elle a
  // son entrée dans la barre de menus, qui y est toujours sous la main.
  // « Reprendre » d'abord : c'est ce qu'on vient chercher en ouvrant l'app.
  // Puis la galerie, puis les favoris, puis les consoles.
  const reprendre = needle ? null : voletReprendre(classes);
  const galerie = enXmb() && !needle ? voletGalerie() : null;
  const shelves = [
    ...(reprendre ? [reprendre] : []),
    ...(galerie ? [galerie] : []),
    ...classes,
  ];
  volets = shelves;
  relierVolets(shelves);

  shelvesBox.replaceChildren();

  // Compté sur ce qui est réellement montré : replier les disques change le
  // nombre de jeux, et un compteur qui ne bouge pas donne l'impression que le
  // réglage n'a rien fait.
  const montres = disquesReplies() ? collapseExtracted(collapseDiscs(games)) : games;
  const known = montres.filter((rom) => coresFor(rom, catalog).length > 0).length;
  countsOut.textContent = `${plural(known, 'jeu', 'jeux')} · ${plural(catalog.length, 'cœur')}`;

  // Un cœur interne existe toujours ; ce sont les autres qui manquent quand
  // rien n'est installé.
  const bare = inShell && catalog.every((candidate) => candidate.kind === 'interne');
  installOffer.hidden = !bare;

  if (shelves.length === 0) {
    shelvesBox.hidden = true;
    viderGrille();
    viderXmb();
    placeholder.hidden = false;

    const heading = placeholder.querySelector('strong');
    const detail = placeholder.querySelector('span');
    if (bare) {
      // Sans émulateur, indiquer un dossier de jeux ne donnerait rien : c'est
      // l'installation qu'il faut proposer, et le dire franchement.
      if (heading) heading.textContent = t('Aucun émulateur installé');
      if (detail) {
        detail.textContent = t(
          'EvaChi peut les télécharger depuis la forge officielle libretro. Choisissez les consoles qui vous intéressent.',
        );
      }
    } else if (games.length === 0) {
      if (heading) heading.textContent = t('Aucun jeu');
      if (detail) detail.textContent = t('Indiquez le dossier où se trouvent vos jeux.');
    } else if (needle) {
      if (heading) heading.textContent = t('Aucun résultat');
      if (detail) {
        detail.textContent = dit('Rien ne correspond à « {0} ».', searchInput.value.trim());
      }
    } else {
      if (heading) heading.textContent = t('Aucun jeu reconnu');
      if (detail) {
        const found = plural(games.length, 'fichier');
        detail.textContent = dit(
          "{0} sur le disque, mais aucun cœur installé ne l'ouvre.",
          found,
        );
      }
    }
    return;
  }

  placeholder.hidden = true;

  // Les deux vues partagent le même classement ; seul le dessin diffère. On ne
  // dessine que celle qu'on regarde : six cents lignes construites pour rester
  // masquées coûtent exactement le même temps que six cents lignes affichées.
  if (enGrille()) {
    shelvesBox.hidden = true;
    viderXmb();
    grilleView.hidden = false;
    renderGrille(shelves);
    return;
  }

  if (enXmb()) {
    shelvesBox.hidden = true;
    viderGrille();
    xmbView.hidden = false;
    renderXmb(shelves);
    return;
  }

  viderGrille();
  viderXmb();
  shelvesBox.hidden = false;

  const collapsed = readCollapsed();

  for (const shelf of shelves) {
    const section = document.createElement('details');
    section.className = 'shelf';
    // Une recherche en cours ouvre tout : masquer un résultat trouvé serait
    // contraire à ce qu'on vient de demander.
    section.open = needle !== '' || !collapsed.has(shelf.key);

    const heading = document.createElement('summary');
    const label = document.createElement('span');
    label.className = 'console';
    label.textContent = t(shelf.label);
    heading.append(label);

    if (shelf.candidates.length > 1) {
      const picker = document.createElement('select');
      picker.className = 'shelf-core';
      picker.title = t('Émulateur utilisé pour ce dossier');
      for (const candidate of shelf.candidates) {
        const option = document.createElement('option');
        option.value = candidate.id;
        option.textContent = candidate.label;
        picker.append(option);
      }
      picker.value = shelf.preferred ?? shelf.candidates[0].id;
      // Sans cela, cliquer la liste replierait le volet.
      picker.addEventListener('click', (event) => event.preventDefault());
      picker.addEventListener('change', () => {
        writeFolderCore(shelf.key, picker.value);
        renderGames();
      });
      heading.append(picker);
    }

    const count = document.createElement('span');
    count.className = 'tally';
    count.textContent = plural(shelf.games.length, 'jeu', 'jeux');
    heading.append(count);

    section.addEventListener('toggle', () => {
      if (needle !== '') return;
      const memory = readCollapsed();
      if (section.open) memory.delete(shelf.key);
      else memory.add(shelf.key);
      writeCollapsed(memory);
    });

    const table = document.createElement('table');
    table.className = 'games';
    const body = document.createElement('tbody');
    for (const { rom, cores } of shelf.games) body.append(gameRow(rom, cores, shelf.preferred));
    table.append(body);

    section.append(heading, table);
    shelvesBox.append(section);
  }
}


async function refreshLibrary(): Promise<void> {
  if (!inShell) {
    games = [];
    renderGames();
    return;
  }
  try {
    games = await listRoms();
  } catch (error) {
    log(dit('bibliothèque illisible — {0}', reason(error)), 'err');
    games = [];
  }
  renderGames();
}

searchInput.addEventListener('input', renderGames);

// --- Dossiers ---------------------------------------------------------------

function renderFolders(): void {
  folderList.replaceChildren();

  const rows: [string, boolean][] = [
    ...(defaultRomsPath ? ([[defaultRomsPath, true]] as [string, boolean][]) : []),
    ...folders.map((path) => [path, false] as [string, boolean]),
  ];

  for (const [path, fixed] of rows) {
    const item = document.createElement('li');

    const label = document.createElement('span');
    label.className = fixed ? 'path fixed' : 'path';
    label.textContent = path;
    item.append(label);

    if (fixed) {
      const note = document.createElement('span');
      note.className = 'fixed';
      note.style.marginLeft = 'auto';
      note.textContent = t('par défaut');
      item.append(note);
    } else {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = t('Retirer');
      remove.addEventListener('click', async () => {
        try {
          folders = await removeLibraryFolder(path);
          renderFolders();
          await refreshLibrary();
        } catch (error) {
          log(dit('retrait impossible — {0}', reason(error)), 'err');
        }
      });
      item.append(remove);
    }

    folderList.append(item);
  }
}

/** Demande un dossier au système, l'enregistre, et relit la bibliothèque. */
async function addFolder(): Promise<void> {
  if (!inShell) {
    log("les dossiers de jeux n'existent que dans l'application", 'err');
    return;
  }
  try {
    const chosen = await pickFolder();
    if (!chosen) return;

    folders = await addLibraryFolder(chosen);
    renderFolders();
    await refreshLibrary();
    log(dit('dossier ajouté : {0}', chosen), 'ok');
  } catch (error) {
    log(dit('ajout impossible — {0}', reason(error)), 'err');
  }
}

$('add-folder').addEventListener('click', () => void addFolder());
$('placeholder-add').addEventListener('click', () => void addFolder());
installOffer.addEventListener('click', () => void openInstall());
$('folders-add').addEventListener('click', () => void addFolder());

// --- Installation des cœurs -------------------------------------------------

let offers: InstallableCore[] = [];

/**
 * Dessine la liste des émulateurs installables, cochés par défaut.
 *
 * Ce qui est déjà installé reste affiché, décoché et signalé : c'est ainsi
 * qu'on voit d'un coup d'œil ce dont on dispose, sans le réinstaller.
 */
function renderInstall(): void {
  installList.replaceChildren();

  for (const offer of offers) {
    const item = document.createElement('li');

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = offer.name;
    box.checked = !offer.installed;
    box.disabled = offer.installed;

    const name = document.createElement('label');
    name.className = 'system';
    name.textContent = `${offer.system} — ${offer.label}`;
    name.prepend(box);

    const state = document.createElement('span');
    state.className = 'state';
    if (offer.installed) {
      state.classList.add('ready');
      state.textContent = t('installé');
    } else {
      state.textContent = t('à télécharger');
    }

    item.append(name, state);
    installList.append(item);
  }

  const waiting = offers.filter((offer) => !offer.installed).length;
  installButton.disabled = waiting === 0;
  installProgress.textContent = waiting === 0 ? t('tout est installé') : '';
}

let standalones: EmulatorOffer[] = [];

/**
 * Dessine les émulateurs autonomes : ceux des consoles sans cœur libretro.
 *
 * Trois états, et un bouton qui ne ment pas sur ce qu'il fera — installer,
 * remplacer, ou rien du tout quand la forge de l'émulateur se protège des
 * robots et qu'il faut passer par elle à la main.
 */
function renderEmulators(): void {
  emulatorList.replaceChildren();

  for (const offer of standalones) {
    const item = document.createElement('li');

    const name = document.createElement('span');
    name.className = 'system';
    name.textContent = `${offer.system} — ${offer.label}`;

    const actions = document.createElement('div');
    actions.className = 'actions';

    const state = document.createElement('span');
    state.className = 'state';

    if (offer.downloadable) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = offer.owned ? t('Mettre à jour') : t('Installer');
      button.addEventListener('click', () => void fetchEmulator(offer, button));
      actions.append(button);
    }

    // Toujours de quoi désigner le sien. Sans ce bouton, une console dont la
    // forge refuse les robots — la Switch — n'offrait aucune issue depuis cette
    // fenêtre : le texte disait où aller chercher l'émulateur, et rien ne
    // permettait ensuite de dire où on l'avait mis.
    const browse = document.createElement('button');
    browse.type = 'button';
    browse.textContent = offer.owned || offer.declared ? t('Changer…') : t('Parcourir…');
    browse.title = dit('Désigner soi-même le programme de {0}', offer.label);
    browse.addEventListener('click', async () => {
      try {
        const chosen = await pickExecutable();
        if (!chosen) return;
        await adopt(offer.system, chosen);
        await refreshInstall();
      } catch (error) {
        log(dit('sélection impossible — {0}', reason(error)), 'err');
      }
    });
    actions.append(browse);

    if (offer.owned) {
      state.classList.add('ready');
      state.textContent = `${t('installé par EvaChi')} · ${offer.license}`;
    } else if (offer.declared) {
      state.classList.add('ready');
      state.textContent = offer.declared;
      state.title = offer.declared;
    } else if (offer.downloadable) {
      state.textContent = `${t('à télécharger')} · ${offer.license}`;
    } else {
      // Sa forge refuse les robots : dire où aller le chercher, et rappeler
      // qu'on peut le désigner soi-même une fois installé.
      state.textContent = dit(
        'à prendre sur {0}, puis « Parcourir… »',
        offer.site.replace(/^https?:\/\//, ''),
      );
    }

    item.append(name, actions, state);
    emulatorList.append(item);
  }
}

/** Installe un émulateur autonome et rafraîchit ce qui en dépend. */
async function fetchEmulator(offer: EmulatorOffer, button: HTMLButtonElement): Promise<void> {
  const before = button.textContent;
  button.disabled = true;
  button.textContent = t('Installation…');
  installProgress.textContent = dit('{0} — téléchargement…', offer.label);

  try {
    externals = await installEmulator(offer.system);
    log(dit('{0} installé et prêt', offer.label), 'ok');
    installProgress.textContent = dit('{0} installé', offer.label);
    presets = await knownExternals();
    renderExternals();
    await reloadCatalog();
    await refreshLibrary();
  } catch (error) {
    log(`${offer.label} — ${reason(error)}`, 'err');
    installProgress.textContent = dit('{0} : échec, voir le journal', offer.label);
  } finally {
    button.disabled = false;
    button.textContent = before;
    await refreshInstall();
  }
}

let systemeFichiers: SystemFile[] = [];

/**
 * Dessine les fichiers système attendus, les plus pressants en tête.
 *
 * L'ordre porte le message : ce qui bloque une console installée passe avant
 * ce qui l'améliore, et ce qui concerne un cœur absent ferme la marche. Sans ce
 * classement, la ligne qui explique un écran noir se perdrait au milieu de
 * vingt autres.
 */
function renderBios(): void {
  biosList.replaceChildren();

  const rang = (fichier: SystemFile): number => {
    if (fichier.present) return 3;
    if (!fichier.coreInstalled) return 2;
    return fichier.need === 'required' ? 0 : 1;
  };

  const triés = [...systemeFichiers].sort(
    (a, b) => rang(a) - rang(b) || a.system.localeCompare(b.system, 'fr'),
  );

  for (const fichier of triés) {
    const item = document.createElement('li');

    const nom = document.createElement('span');
    nom.className = 'system';
    nom.textContent = `${fichier.system} — ${fichier.file}`;

    const état = document.createElement('span');
    état.className = 'state';
    état.title = fichier.path;

    // La note vient du code natif, où la liste des micrologiciels est tenue.
    // Elle passe par la même table que le reste : ses phrases sont relevées
    // dans `bios.rs` au moment d'écrire les clés.
    const note = t(fichier.note);
    if (fichier.present) {
      état.classList.add('ready');
      état.textContent = `${t('en place')} · ${note}`;
    } else if (!fichier.coreInstalled) {
      état.textContent = `${t('cœur non installé')} · ${note}`;
    } else if (fichier.need === 'required') {
      état.classList.add('manque');
      état.textContent = `${t('MANQUANT')} · ${note}`;
    } else {
      état.textContent = `${t('absent, facultatif')} · ${note}`;
    }

    item.append(nom, état);
    biosList.append(item);
  }

  const bloquants = systemeFichiers.filter(
    (f) => !f.present && f.coreInstalled && f.need === 'required',
  ).length;
  biosSummary.textContent = bloquants
    ? dit('il manque {0} à des consoles installées', plural(bloquants, 'fichier'))
    : t('rien ne bloque');
}

/** Recharge l'état des cœurs et des émulateurs proposés. */
async function refreshInstall(): Promise<void> {
  if (!inShell) return;
  try {
    offers = await installableCores();
    renderInstall();
  } catch (error) {
    log(dit('liste des cœurs indisponible — {0}', reason(error)), 'err');
  }
  try {
    standalones = await installableEmulators();
    renderEmulators();
  } catch (error) {
    log(dit('liste des émulateurs indisponible — {0}', reason(error)), 'err');
  }
  try {
    systemeFichiers = await systemFiles();
    renderBios();
  } catch (error) {
    log(dit('fichiers système illisibles — {0}', reason(error)), 'err');
  }
}

biosFolder.addEventListener('click', async () => {
  try {
    log(dit('dossier ouvert : {0}', await revealSystemDir()));
  } catch (error) {
    log(dit('ouverture impossible — {0}', reason(error)), 'err');
  }
});

/**
 * Range un fichier choisi par l'utilisateur, où qu'il doive aller.
 *
 * Le geste est le même pour un BIOS de PlayStation, une clé de Switch et une
 * archive de vingt fichiers : désigner, et c'est fait. Ce qui n'a pas été
 * reconnu est nommé plutôt que passé sous silence — un fichier resté sur le
 * bureau sans explication vaut moins qu'un refus clair.
 */
/**
 * Le geste de rangement, qu'on désigne un fichier ou un dossier entier.
 *
 * Les deux ne diffèrent que par ce qu'on montre : ce qui suit — le compte
 * rendu, le journal, la liste rafraîchie — est le même, et n'a donc aucune
 * raison d'être écrit deux fois.
 */
async function ranger(
  bouton: HTMLButtonElement,
  choisir: () => Promise<string | null>,
  confier: (chemin: string) => Promise<Placed[]>,
): Promise<void> {
  bouton.disabled = true;
  biosAdopted.textContent = '';
  try {
    const choisi = await choisir();
    if (!choisi) return;

    const faits = await confier(choisi);
    for (const fait of faits) {
      const détail = fait.placed ? `${fait.note} → ${fait.destination}` : fait.note;
      log(`${fait.name} : ${détail}`, fait.placed ? 'ok' : 'err');
    }

    const rangés = faits.filter((fait) => fait.placed);
    const consoles = [...new Set(rangés.map((fait) => fait.system))].join(', ');
    biosAdopted.textContent = rangés.length
      ? dit('rangement : {0} · {1}', plural(rangés.length, 'fichier'), consoles)
      : (faits[0]?.note ?? t('rien à ranger'));

    systemeFichiers = await systemFiles();
    renderBios();
  } catch (error) {
    log(dit('rangement impossible — {0}', reason(error)), 'err');
  } finally {
    bouton.disabled = false;
  }
}

biosAdoptFolder.addEventListener('click', () => {
  void ranger(biosAdoptFolder, pickSystemFolder, adoptSystemFolder);
});

biosAdopt.addEventListener('click', () => {
  void ranger(biosAdopt, pickSystemFile, adoptSystemFile);
});

/**
 * Installe les cœurs cochés, un par un.
 *
 * Un par un plutôt qu'en bloc : la progression est réelle, et l'échec d'un cœur
 * n'emporte pas les autres. Ce qui rate est nommé, pas avalé.
 */
async function installSelected(): Promise<void> {
  const wanted = [...installList.querySelectorAll<HTMLInputElement>('input:checked')].map(
    (box) => box.value,
  );
  if (wanted.length === 0) return;

  installButton.disabled = true;
  let done = 0;
  let failed = 0;

  for (const name of wanted) {
    const offer = offers.find((candidate) => candidate.name === name);
    installProgress.textContent = `${done + failed + 1} / ${wanted.length} — ${offer?.system ?? name}…`;
    try {
      const size = await installCore(name);
      done += 1;
      log(dit('{0} installé — {1}', offer?.label ?? name, humanSize(size)), 'ok');
    } catch (error) {
      failed += 1;
      log(`${offer?.label ?? name} — ${reason(error)}`, 'err');
    }
  }

  installProgress.textContent =
    failed === 0
      ? dit('installation terminée : {0}', plural(done, 'émulateur'))
      : dit('{0} installés, {1} en échec — voir le journal', done, failed);

  await refreshInstall();
  await reloadCatalog();
  await refreshLibrary();
}

installButton.addEventListener('click', () => void installSelected());

/** Ouvre la liste des émulateurs, après l'avoir remise à jour. */
async function openInstall(): Promise<void> {
  await refreshInstall();
  renderEcartes();
  openDialog(dialogs.install);
}

// --- Émulateurs externes ----------------------------------------------------

let externals: ExternalSystem[] = [];
let presets: ExternalPreset[] = [];

/**
 * Dessine les émulateurs autonomes connus et leur état.
 *
 * Trois cas : déjà déclaré, trouvé sur le disque et prêt à l'être, ou absent.
 * Dans les deux premiers, l'utilisateur n'a rien à saisir.
 */
function renderExternals(): void {
  presetList.replaceChildren();

  for (const preset of presets) {
    const declared = externals.find((system) => system.name === preset.system);

    const item = document.createElement('li');

    const name = document.createElement('span');
    name.className = 'system';
    name.textContent = `${preset.system} — ${preset.extensions.join(' ')}`;

    const state = document.createElement('span');
    state.className = 'state';
    if (declared) {
      state.classList.add('ready');
      state.textContent = declared.executable;
      state.title = declared.executable;
    } else if (preset.detected) {
      state.textContent = dit('trouvé : {0}', preset.detected);
      state.title = preset.detected;
    } else {
      state.textContent = t('non installé sur cette machine');
    }

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (declared) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = t('Retirer');
      remove.addEventListener('click', () => void detach(preset.system));
      actions.append(remove);
    } else if (preset.detected) {
      const use = document.createElement('button');
      use.type = 'button';
      use.textContent = t('Activer');
      use.addEventListener('click', () => void adopt(preset.system, preset.detected));
      actions.append(use);
    }

    const browse = document.createElement('button');
    browse.type = 'button';
    browse.textContent = declared ? t('Changer…') : t('Parcourir…');
    browse.addEventListener('click', async () => {
      try {
        const chosen = await pickExecutable();
        if (chosen) await adopt(preset.system, chosen);
      } catch (error) {
        log(dit('sélection impossible — {0}', reason(error)), 'err');
      }
    });
    actions.append(browse);

    item.append(name, actions, state);
    presetList.append(item);
  }
}

/** Déclare un émulateur connu et rafraîchit tout ce qui en dépend. */
async function adopt(system: string, executable: string): Promise<void> {
  try {
    externals = await adoptExternal(system, executable);
    presets = await knownExternals();
    renderExternals();
    await reloadCatalog();
    log(`${system} : ${executable}`, 'ok');
  } catch (error) {
    log(`${system} — ${reason(error)}`, 'err');
  }
}

async function detach(system: string): Promise<void> {
  try {
    externals = await removeExternalSystem(system);
    presets = await knownExternals();
    renderExternals();
    await reloadCatalog();
    log(dit('{0} retiré', system));
  } catch (error) {
    log(dit('retrait impossible — {0}', reason(error)), 'err');
  }
}

$('ext-browse').addEventListener('click', async () => {
  try {
    const chosen = await pickExecutable();
    if (chosen) {
      extExe.value = chosen;
      // Le nom du programme est un point de départ raisonnable.
      if (!extName.value.trim()) {
        extName.value = chosen.split(/[\\/]/).pop()?.replace(/\.exe$/i, '') ?? '';
      }
    }
  } catch (error) {
    log(dit('sélection impossible — {0}', reason(error)), 'err');
  }
});

$('ext-save').addEventListener('click', async () => {
  const name = extName.value.trim();
  const executable = extExe.value.trim();
  const extensions = extExtensions.value
    .split(/[\s,]+/)
    .map((extension) => extension.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);

  if (!name || !executable || extensions.length === 0) {
    log(t('nom, programme et extensions sont tous nécessaires'), 'err');
    return;
  }

  try {
    externals = await setExternalSystem({
      name,
      executable,
      // Découpage naïf sur les espaces : suffisant pour les quelques options
      // qu'un émulateur demande, et un chemin ne passe jamais par là.
      args: extArgs.value.trim() ? extArgs.value.trim().split(/\s+/) : [],
      extensions,
    });
    renderExternals();
    await reloadCatalog();
    log(dit('{0} enregistré', name), 'ok');

    for (const field of [extName, extExe, extExtensions, extArgs]) field.value = '';
  } catch (error) {
    log(dit('enregistrement impossible — {0}', reason(error)), 'err');
  }
});

/**
 * Reconstruit le catalogue et la bibliothèque après un changement de sources.
 *
 * Rapporte les échecs comme le fait le démarrage. Sans cela, déclarer un
 * émulateur externe pouvait faire fondre le catalogue en silence : seul
 * `start` racontait ce qui s'était mal passé, et cette voie-ci se taisait.
 */
async function reloadCatalog(): Promise<void> {
  catalog = await discover(makeChip8);
  for (const line of discoveryReport) log(dit('découverte : {0}', line));
  for (const failure of discoveryErrors) {
    log(dit('découverte interrompue — {0}', failure), 'err');
  }
  renderGames();
}

// --- Actions des menus ------------------------------------------------------

/** Ouvre un jeu par le sélecteur de fichiers, avec le cœur actif. */
async function openContent(): Promise<void> {
  if (!entry || !core) {
    log(t("choisissez d'abord un jeu dans la bibliothèque"), 'err');
    return;
  }

  if (entry.needsPath) {
    try {
      const path = await pickContent(core.info.extensions.map((e) => e.replace(/^\./, '')));
      if (!path) return;
      await loadContent(path.split(/[\\/]/).pop() ?? path, new Uint8Array(0), path);
    } catch (error) {
      log(dit('sélection impossible — {0}', reason(error)), 'err');
    }
    return;
  }

  fileInput.accept = core.info.extensions.join(',');
  fileInput.click();
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) await loadContent(file.name, new Uint8Array(await file.arrayBuffer()));
});

/** Bascule le plein écran sur la zone de jeu, pas sur toute la page. */
/**
 * Les trois temps du plein écran, dans le menu.
 *
 * Fenêtré, plein écran, puis plein écran dépouillé : la barre de menus, la
 * barre d'outils et la barre d'état s'en vont, et il ne reste que la
 * bibliothèque. C'est ce que montre une console de salon — rien que ce qu'on
 * regarde.
 */
const PLEIN = { fenetre: 0, ecran: 1, depouille: 2 } as const;
let tempsPleinEcran: number = PLEIN.fenetre;

/** Pose un temps et redonne aux vues la place qu'elles ont désormais. */
function poserPleinEcran(temps: number): void {
  tempsPleinEcran = temps;
  appView.classList.toggle('depouille', temps === PLEIN.depouille);
  // La scène et le menu animé se dimensionnent sur la place disponible, qui
  // vient de changer sans qu'aucune fenêtre ne soit redimensionnée.
  fitScreen();
  poserEchelle();
}

/**
 * Bascule le plein écran.
 *
 * En partie, il ne concerne que l'image : il n'y a ni barre d'outils ni rien
 * d'autre à retirer, et c'est l'affichage seul qui prend l'écran.
 *
 * Dans le menu, c'est toute la fenêtre qui passe en plein écran, et non la
 * zone de jeu — celle-ci y est masquée, et la demander revenait à demander le
 * plein écran d'un élément qui n'a pas de surface : refusé, ou noir.
 */
async function toggleFullscreen(): Promise<void> {
  try {
    if (libraryView.hidden) {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await playerView.requestFullscreen();
      return;
    }

    if (tempsPleinEcran === PLEIN.fenetre) {
      await appView.requestFullscreen();
      poserPleinEcran(PLEIN.ecran);
    } else if (tempsPleinEcran === PLEIN.ecran) {
      poserPleinEcran(PLEIN.depouille);
    } else {
      poserPleinEcran(PLEIN.fenetre);
      if (document.fullscreenElement) await document.exitFullscreen();
    }
  } catch (error) {
    log(dit('plein écran refusé — {0}', reason(error)), 'err');
  }
}

const actions: Record<string, () => void | Promise<void>> = {
  open: openContent,
  'add-folder': addFolder,
  folders: () => openDialog(dialogs.folders),
  install: openInstall,
  external: () => openDialog(dialogs.external),
  themes: () => {
    renderThemes();
    renderMenus();
    jaquettesCase.checked = jaquettesVoulues();
    disquesCase.checked = disquesReplies();
    musiqueCase.checked = musiqueVoulue();
    sonsCase.checked = sonsVoulus();
    openDialog(dialogs.themes);
  },
  refresh: refreshLibrary,

  toggle: async () => {
    await audio.unlock();
    setRunning(!running);
  },
  reset: async () => {
    if (!core) return;
    loopToken += 1;
    running = false;
    try {
      await core.reset();
      log(dit('{0} — réinitialisé', contentName));
      setRunning(true);
    } catch (error) {
      log(dit('réinitialisation impossible — {0}', reason(error)), 'err');
    }
  },
  save: () => sauverEmplacement(emplacementVise),
  restore: () => chargerEmplacement(emplacementVise),
  states: async () => {
    await renderEmplacements();
    openDialog(dialogs.states);
  },
  stop: stopPlaying,

  fullscreen: toggleFullscreen,
  gallery: () => void ouvrirGalerie(),
  shot: () => void prendreCapture(),
  'shots-folder': () => void revealShotsDir(),
  graphics: () => {
    renderGraphisme();
    openDialog(dialogs.graphics);
  },
  controls: () => {
    renderRaccourcisEtat();
    openDialog(dialogs.controls);
  },
  settings: () => {
    renderTempo();
    openDialog(dialogs.settings);
  },
  log: () => openDialog(dialogs.log),
  about: () => {
    renderAbout();
    openDialog(dialogs.about);
  },
};

menubar.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
  if (!button || button.disabled) return;
  closeMenus();
  void actions[button.dataset.action ?? '']?.();
});

/**
 * Les raccourcis clavier, énumérés là où on les cherche.
 *
 * Écrits ici plutôt que dans la page : ceux des menus se lisent déjà à côté de
 * leur entrée, et les répéter à la main dans deux endroits garantit qu'ils
 * finiront par se contredire.
 */
const RACCOURCIS_CLAVIER: readonly (readonly [string, string])[] = [
  [aTraduire('Flèches'), aTraduire('Parcourir la grille et le menu animé')],
  [aTraduire('Entrée'), aTraduire('Lancer le jeu choisi')],
  ['P', aTraduire('Plein écran')],
  ['F5', aTraduire('Actualiser la bibliothèque')],
  [aTraduire('Échap'), aTraduire('Refermer une fenêtre')],
];

function renderAbout(): void {
  raccourcisClavier.replaceChildren();
  for (const [touche, quoi] of RACCOURCIS_CLAVIER) {
    const dt = document.createElement('dt');
    // Le nom de la touche se traduit aussi : « Entrée » se lit « Enter » sur
    // un clavier anglais et « Intro » sur un clavier espagnol.
    dt.textContent = t(touche);
    const dd = document.createElement('dd');
    dd.textContent = t(quoi);
    raccourcisClavier.append(dt, dd);
  }

  aboutBody.replaceChildren();

  const rows: [string, string][] = [
    [
      aTraduire('Cœurs installés'),
      catalog.map((candidate) => candidate.label).join(', ') || t('aucun'),
    ],
    [aTraduire('Dossier par défaut'), defaultRomsPath || '—'],
    [aTraduire('Dossiers ajoutés'), folders.length ? folders.join('\n') : t('aucun')],
    [aTraduire('Manette'), padIndex >= 0 ? t('branchée') : t('aucune')],
  ];

  for (const [term, detail] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = t(term);
    const dd = document.createElement('dd');
    dd.textContent = detail;
    aboutBody.append(dt, dd);
  }
}

// --- Réglages ---------------------------------------------------------------

presetSelect.addEventListener('change', async () => {
  const chip8 = entry;
  if (chip8?.id !== 'chip8') return;

  // Les écarts se choisissent à la construction du cœur. Il faut donc le
  // remonter — mais `selectCore` oublie le contenu au passage, d'où cette copie
  // prise avant l'appel.
  const previous = contentBytes
    ? { name: contentName, bytes: contentBytes, path: contentPath ?? undefined }
    : null;

  if (!(await selectCore(chip8))) return;
  log(dit('interpréteur : {0}', presetSelect.selectedOptions[0]?.text ?? '?'));
  if (previous) await loadContent(previous.name, previous.bytes, previous.path);
});

speedInput.addEventListener('input', () => {
  speedValue.textContent = speedInput.value;
  // Le CHIP-8 accepte le réglage à chaud ; les autres cœurs l'ignorent.
  const chip8 = core as unknown as { cyclesPerFrame?: number } | null;
  if (chip8 && typeof chip8.cyclesPerFrame === 'number') {
    chip8.cyclesPerFrame = Number(speedInput.value);
  }
});

soundToggle.addEventListener('change', async () => {
  audio.setEnabled(soundToggle.checked);
  if (soundToggle.checked) await audio.unlock();
});

// --- Entrées ----------------------------------------------------------------

function setButton(index: number, down: boolean): void {
  keyboard[index] = down;
}

/**
 * La manette à lire maintenant, en la cherchant si on n'en tient aucune.
 *
 * Le navigateur ne prévient pas toujours : une manette branchée avant le
 * lancement n'émet rien, et l'événement de connexion ne part qu'au premier
 * appui, fenêtre au premier plan. Regarder à chaque trame coûte un tableau et
 * règle le cas une fois pour toutes.
 */
function currentPad(): Gamepad | null {
  const pads = navigator.getGamepads?.() ?? [];
  const found = choosePad(pads, padIndex);
  if (found !== padIndex) {
    padIndex = found;
    const pad = found >= 0 ? pads[found] : null;
    padStatus.textContent = pad ? dit('Manette : {0}', pad.id) : t('Aucune manette détectée.');
    log(pad ? dit('manette : {0}', pad.id) : t('manette débranchée'), pad ? 'ok' : 'info');
  }
  return padIndex >= 0 ? pads[padIndex] : null;
}

/**
 * Compose l'état à envoyer au cœur : clavier, plus manette si elle est là.
 *
 * Appelée juste avant chaque trame plutôt que sur événement, parce que l'API
 * des manettes n'en émet pas — il faut aller lire leur état.
 */
function sampleInput(): void {
  for (let index = 0; index < BUTTON_COUNT; index += 1) {
    buttons[index] = keyboard[index];
  }

  const pad = currentPad();
  if (pad) {
    for (const [source, target] of padBindings()) {
      if (pad.buttons[source]?.pressed) buttons[target] = true;
    }

    // Le manche gauche double la croix directionnelle : bien des manettes
    // récentes n'ont qu'un manche confortable, et bien des jeux n'attendent
    // que la croix.
    const [x = 0, y = 0] = pad.axes;
    const stick: [number, boolean][] = [
      [PAD_LEFT, x < -STICK_DEADZONE],
      [PAD_RIGHT, x > STICK_DEADZONE],
      [PAD_UP, y < -STICK_DEADZONE],
      [PAD_DOWN, y > STICK_DEADZONE],
    ];
    for (const [source, active] of stick) {
      const target = padBindings().get(source);
      if (active && target !== undefined) buttons[target] = true;
    }
  }

  if (dialogs.controls.open) {
    for (const [index, cell] of buttonCells) {
      cell.classList.toggle('down', buttons[index]);
    }
  }
}

// Les deux événements ne servent plus qu'à réagir tout de suite : c'est
// `currentPad` qui décide, et lui seul, pour qu'un branchement annoncé et un
// branchement découvert donnent exactement le même état.
window.addEventListener('gamepadconnected', () => void currentPad());
window.addEventListener('gamepaddisconnected', () => void currentPad());

/**
 * Fait vivre le panneau des commandes quand aucun jeu ne tourne.
 *
 * Sans cela, ouvrir « Commandes » pour essayer sa manette ne montrait rien :
 * les entrées n'étaient lues qu'entre deux trames, et à l'arrêt il n'y en a
 * pas. On pressait les boutons devant une grille immobile, et on en concluait
 * que la manette n'était pas reconnue — alors que le jeu, lui, l'aurait vue.
 */
function pollControls(): void {
  // La musique appartient au menu animé et à lui seul. Surveillé ici plutôt
  // qu'au lancement d'un jeu : il y a plusieurs façons de quitter le menu, et
  // une seule d'entre elles oubliée laisserait la musique jouer sous la partie.
  if (musiqueEnCours() && (libraryView.hidden || xmbView.hidden)) arreterMusique();

  // Tout est enveloppé : une exception ici romprait la chaîne des trames, et
  // la manette cesserait de répondre jusqu'au prochain lancement — sans rien
  // afficher qui permette de comprendre pourquoi.
  try {
    if (!running && dialogs.controls.open) sampleInput();
    capturerLiaison();
    capturerRaccourciPad();
    naviguerMenu();
  } catch (error) {
    log(`commandes : ${error instanceof Error ? error.message : String(error)}`, 'err');
  }
  requestAnimationFrame(pollControls);
}
requestAnimationFrame(pollControls);

// --- Réassignation de la manette --------------------------------------------

let liaisons: AllOverrides = parseOverrides(retenu(RETENU.liaisons));

/** Le bouton du cœur qui attend qu'on lui désigne un bouton de manette. */
let enAttente: number | null = null;

/** Vrai quand la grille sert à réassigner plutôt qu'à jouer. */
let remappage = false;

/**
 * Les liaisons à appliquer maintenant : celles d'origine, corrigées.
 *
 * Recalculées à chaque trame plutôt que gardées de côté : la disposition change
 * avec le cœur chargé, et une correspondance figée survivrait au changement en
 * envoyant les boutons d'une console dans ceux d'une autre.
 */
function padBindings(): ReadonlyMap<number, number> {
  return resolveBindings(layout.gamepad, liaisons[layout.id]);
}

/** Retient les liaisons et redessine la grille. */
function poserLiaisons(suivantes: AllOverrides): void {
  liaisons = suivantes;
  retenir(RETENU.liaisons, JSON.stringify(liaisons));
  buildKeypad();
}

/**
 * Regarde si un bouton vient d'être pressé, pour le lier à celui qui attend.
 *
 * Appelée entre deux trames, comme la lecture des entrées : l'API des manettes
 * n'émet rien, il faut aller voir. On ne retient que le premier bouton trouvé —
 * en presser deux à la fois ne doit pas en lier deux au hasard.
 */
/**
 * Capture une combinaison de manette pour un raccourci d'état.
 *
 * On attend que tous les boutons soient relâchés avant de valider : autrement
 * le premier bouton pressé serait pris seul, et on n'obtiendrait jamais une
 * combinaison à deux.
 */
let combinaisonEnCours: number[] = [];

function capturerRaccourciPad(): void {
  if (!raccourciEnAttente) {
    combinaisonEnCours = [];
    return;
  }
  const pads = navigator.getGamepads?.() ?? [];
  const pad = padIndex >= 0 ? pads[padIndex] : null;
  if (!pad) return;

  const presses = pad.buttons
    .map((bouton, index) => (bouton?.pressed ? index : -1))
    .filter((index) => index >= 0);

  if (presses.length > 0) {
    // On garde la plus grande combinaison vue pendant l'appui.
    if (presses.length >= combinaisonEnCours.length) combinaisonEnCours = presses;
    return;
  }

  if (combinaisonEnCours.length > 0) {
    poserRaccourci(raccourciEnAttente, { pad: combinaisonEnCours });
    combinaisonEnCours = [];
  }
}

function capturerLiaison(): void {
  if (enAttente === null) return;
  const pads = navigator.getGamepads?.() ?? [];
  const pad = padIndex >= 0 ? pads[padIndex] : null;
  if (!pad) return;

  const presse = pad.buttons.findIndex((bouton) => bouton?.pressed);
  if (presse < 0) return;

  const cible = enAttente;
  enAttente = null;
  poserLiaisons({
    ...liaisons,
    [layout.id]: withBinding(liaisons[layout.id], presse, cible),
  });
  log(`${layout.labels[cible] ?? cible} ← ${padButtonShort(presse)}`, 'ok');
}

const remapButton = $<HTMLButtonElement>('controls-remap');
const resetBindings = $<HTMLButtonElement>('controls-reset');

remapButton.addEventListener('click', () => {
  remappage = !remappage;
  enAttente = null;
  remapButton.textContent = remappage ? t('Terminer') : t('Réassigner…');
  keypadBox.classList.toggle('remappage', remappage);
  buildKeypad();
});

resetBindings.addEventListener('click', () => {
  if (!liaisons[layout.id]) return;
  enAttente = null;
  poserLiaisons(withoutBindings(liaisons, layout.id));
  log(t('liaisons de manette remises d’origine'));
});

let keyLabels: Map<string, string> | null = null;

/** Redessine la grille de commandes pour la disposition du cœur actif. */
function buildKeypad(): void {
  keypadBox.replaceChildren();
  buttonCells.clear();
  keyboard.fill(false);
  buttons.fill(false);

  const physicalFor = new Map<number, string>();
  for (const [code, index] of layout.bindings) physicalFor.set(index, code);

  for (const index of layout.display) {
    const cell = document.createElement('button');
    cell.className = 'key';
    cell.type = 'button';

    const code = physicalFor.get(index);
    const physical = code ? keyLabels?.get(code) ?? FALLBACK_KEY_LABELS[code] ?? '' : '';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = layout.labels[index] ?? String(index);

    const key = document.createElement('span');
    key.className = 'phys';
    key.textContent = physical.toUpperCase();

    // Ce que la manette envoie sur cette touche, en toutes lettres : sans
    // cela, réassigner revient à deviner ce qu'on est en train de changer.
    const manette = document.createElement('span');
    manette.className = 'pad';
    const source = [...padBindings()].find(([, cible]) => cible === index)?.[0];
    if (enAttente === index) {
      manette.textContent = '…';
      cell.title = t('pressez le bouton voulu sur la manette');
    } else if (source !== undefined) {
      manette.textContent = padButtonShort(source);
      cell.title = dit('manette : {0}', padButtonShort(source));
    } else {
      manette.textContent = '';
    }

    cell.append(label, key, manette);
    if (enAttente === index) cell.classList.add('attente');

    cell.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      // En mode réassignation, la grille ne joue plus : elle désigne.
      if (remappage) {
        enAttente = enAttente === index ? null : index;
        buildKeypad();
        return;
      }
      cell.setPointerCapture(event.pointerId);
      setButton(index, true);
      void audio.unlock();
    });
    const release = () => setButton(index, false);
    cell.addEventListener('pointerup', release);
    cell.addEventListener('pointercancel', release);
    cell.addEventListener('lostpointercapture', release);

    buttonCells.set(index, cell);
    keypadBox.append(cell);
  }
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'F5') {
    event.preventDefault();
    void refreshLibrary();
    return;
  }

  // Les raccourcis de jeu ne doivent pas partir pendant qu'on tape une
  // recherche ou qu'une boîte de dialogue a la main.
  const typing = document.activeElement === searchInput;
  if (typing || document.querySelector('dialog[open]')) return;

  // P plutôt que F : le pavé hexadécimal occupe déjà la touche F, et les deux
  // dispositions doivent garder toutes leurs touches.
  if (event.code === 'KeyP' && !event.repeat) {
    event.preventDefault();
    void toggleFullscreen();
    return;
  }

  const index = layout.bindings.get(event.code);
  if (index === undefined || event.repeat) return;
  event.preventDefault();
  setButton(index, true);
  void audio.unlock();
});

window.addEventListener('keyup', (event) => {
  const index = layout.bindings.get(event.code);
  if (index === undefined) return;
  event.preventDefault();
  setButton(index, false);
});

// Le focus perdu laisserait des touches bloquées en position enfoncée.
window.addEventListener('blur', () => {
  for (let index = 0; index < BUTTON_COUNT; index += 1) setButton(index, false);
});

// --- Démarrage --------------------------------------------------------------

async function start(): Promise<void> {
  // Avant tout le reste : la fenêtre doit apparaître aux couleurs choisies, et
  // non passer de l'une à l'autre sous les yeux.
  applyTheme(themeActuel, document.documentElement);

  // La langue avant tout dessin : traduire après coup ferait apparaître la
  // fenêtre en français une fraction de seconde, puis basculer sous les yeux.
  const langue = langueRetenue();
  poserLangue(langue.code === 'fr' ? null : langue);
  document.documentElement.lang = langue.code;
  document.documentElement.dir = langue.rtl ? 'rtl' : 'ltr';
  traduireDocument(document);
  // Le menu des langues est dans la barre, et non plus dans une fenêtre : il
  // doit donc être rempli au démarrage, et non à l'ouverture d'un dialogue.
  renderLangues();
  renderTempo();

  // Les jaquettes posées à la main sont relues une fois, avant le premier
  // dessin : les chercher après ferait clignoter la bibliothèque.
  await relireJaquettesPosees();
  await signalerIncident();
  await relireCaptures();

  try {
    // Chrome publie la disposition réelle du clavier ; on affiche alors les
    // vraies touches plutôt que celles d'un QWERTY supposé.
    const keys = (navigator as Navigator & {
      keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> };
    }).keyboard;
    if (keys?.getLayoutMap) keyLabels = await keys.getLayoutMap();
  } catch {
    keyLabels = null;
  }

  // Dit avant d'attendre. Au premier lancement, chaque cœur fraîchement
  // installé doit être interrogé un par un, et l'attente se compte en dizaines
  // de secondes : sans un mot, une bibliothèque vide passe pour une panne, et
  // on referme la fenêtre — ce qui fait tout recommencer au lancement suivant.
  if (inShell) log(t('interrogation des cœurs installés…'));

  catalog = await discover(makeChip8);

  if (inShell) {
    try {
      const known = await directories();
      defaultRomsPath = known.find(([label]) => label === 'jeux')?.[1] ?? '';
      folders = await libraryFolders();
      externals = await externalSystems();
    } catch {
      // Sans ces chemins, la bibliothèque sera juste moins bavarde.
    }

    // La recherche des émulateurs déjà installés parcourt les disques : elle
    // n'a aucune raison de retarder l'affichage, et tout intérêt à ne pas le
    // faire. Attendue ici, elle laissait la fenêtre blanche et le curseur en
    // sablier tant qu'un disque lent — ou un lecteur réseau déconnecté — ne
    // répondait pas. On l'annonce, et la liste se remplit quand elle revient.
    void knownExternals()
      .then((found) => {
        presets = found;
        renderExternals();
      })
      .catch((error) =>
        log(dit('recherche des émulateurs interrompue — {0}', reason(error)), 'err'),
      );
  } else {
    log(t('page web : seuls les cœurs internes sont disponibles, sans bibliothèque'));
  }

  placeholderPath.textContent = defaultRomsPath;
  renderFolders();
  renderExternals();

  const first = catalog[0];
  if (first) await selectCore(first);

  await refreshLibrary();
  showLibrary(true);
  refreshMenus();
  log(dit('{0} à disposition', plural(catalog.length, 'cœur')));

  for (const line of discoveryReport) log(dit('découverte : {0}', line));
  for (const failure of discoveryErrors) {
    log(dit('découverte interrompue — {0}', failure), 'err');
  }

  if (rejectedCores.length > 0) {
    // Ils ont été chargés dans un processus séparé et s'y sont terminés
    // brutalement — le plus souvent faute d'un contexte graphique matériel.
    log(
      dit(
        "mis à l'écart : {0} · {1}",
        plural(rejectedCores.length, 'cœur'),
        rejectedCores.join(', '),
      ),
      'err',
    );
  }
}

void start();
