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
  COEUR_TOMBE,
  claimedSystemFile,
  credits,
  coverOriginal,
  decodeBase64,
  encodeBase64,
  croppedCovers,
  crashReport,
  dismissCrash,
  deleteShot,
  deleteStateSlot,
  clearSaves,
  listSaves,
  listDrops,
  fileDrop,
  sweepDrop,
  knownFolders,
  writePadBindings,
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
  lireMemoire,
  poserTriches,
  trichesCatalogue,
  trichesContenu,
  trichesInstaller,
  trichesPosees,
  trichesRetirer,
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
import type { Credit, Poke, Shot, StateSlot } from '../libretro/client.ts';
import {
  FAVORIS,
  collapseDiscs,
  collapseExtracted,
  coresFor,
  effectiveCore,
  folderLabel,
  gameLabel,
  groupLibrary,
  withFavourites,
} from './library.ts';
import type { Playable, Shelf } from './library.ts';
import {
  BUTTON_COUNT,
  FALLBACK_KEY_LABELS,
  HEX_KEYPAD,
  JOYPAD,
  choosePad,
  PAD_DOWN,
  PAD_L3,
  PAD_LEFT,
  PAD_R3,
  PAD_RIGHT,
  PAD_UP,
  STICK_DEADZONE,
  vitesseAvance,
} from './input.ts';
import type { ButtonLayout } from './input.ts';
import type { Depose } from '../libretro/client.ts';
import { THEMES, applyTheme, themeById } from './themes.ts';
import { COMME_INTERFACE, PARLERS, langueDemandee, parlerParCode } from './parlers.ts';
import { fichesPour, lireFiche } from './triches.ts';
import type { Triche } from './triches.ts';
import { MONTRABLES, borner, montrer, premierTri, trier } from './chercheur.ts';
import type { Question, Taille } from './chercheur.ts';
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
  Verrou,
  avancer,
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
import { bandes, fenetre, place } from './carrousel.ts';
import { fenetre as fenetrePaquet, main as mainDuPaquet } from './eventail.ts';
import { dessinerMoire } from './moire.ts';
import { NUANCES, Peintre, nuanceParId } from './nuances.ts';
import { dessinerFaisceau, panier as panierSeance } from './seance.ts';
import { dessinerCourant } from './courant.ts';
import { dessiner as dessinerPoussiere } from './poussiere.ts';
import { arreterMusique, demarrerMusique, musiqueEnCours, ticDeplacement, ticValidation } from './sound.ts';
import { SELECTEUR_ACTIF, gestePour, premierUtile, tourne } from './focus.ts';
import { DUREE_SECOUSSE, enSix, ressenti } from './capteurs.ts';

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Élément introuvable : #${id}`);
  return element as T;
};

const canvas = $<HTMLCanvasElement>('screen');
const context = canvas.getContext('2d');
const nuanceCanvas = $<HTMLCanvasElement>('nuance');
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
const carrView = $<HTMLDivElement>('carrousel');
const carrFond = $<HTMLCanvasElement>('carrousel-fond');
const carrPile = $<HTMLDivElement>('carrousel-pile');
const carrConsoles = $<HTMLDivElement>('carrousel-consoles');
const carrCartes = $<HTMLDivElement>('carrousel-cartes');
const carrConsole = $<HTMLElement>('carrousel-console');
const carrHeure = $<HTMLElement>('carrousel-heure');
const carrTitre = $<HTMLElement>('carrousel-titre');
const carrDetail = $<HTMLElement>('carrousel-detail');
const carrPied = $<HTMLElement>('carrousel-pied');
const paqView = $<HTMLElement>('paquet');
const paqFond = $<HTMLCanvasElement>('paquet-fond');
const paqMain = $<HTMLDivElement>('paquet-main');
const paqConsole = $<HTMLElement>('paquet-console');
const paqHeure = $<HTMLElement>('paquet-heure');
const paqTitre = $<HTMLElement>('paquet-titre');
const paqDetail = $<HTMLElement>('paquet-detail');
const paqPied = $<HTMLElement>('paquet-pied');
const seaView = $<HTMLElement>('seance');
const seaFaisceau = $<HTMLCanvasElement>('seance-faisceau');
const seaEcran = $<HTMLElement>('seance-ecran');
const seaBoite = $<HTMLElement>('seance-boite');
const seaImage = $<HTMLImageElement>('seance-image');
const seaInitiale = $<HTMLElement>('seance-initiale');
const seaPanier = $<HTMLDivElement>('seance-panier');
const seaConsole = $<HTMLElement>('seance-console');
const seaHeure = $<HTMLElement>('seance-heure');
const seaTitre = $<HTMLElement>('seance-titre');
const seaDetail = $<HTMLElement>('seance-detail');
const seaPied = $<HTMLElement>('seance-pied');
const carrLettre = $<HTMLDivElement>('carrousel-lettre');
const trichesScan = $<HTMLButtonElement>('triches-scan');
const trichesEtat = $<HTMLElement>('triches-etat');
const trichesListe = $<HTMLDivElement>('triches-liste');
const trichesTout = $<HTMLButtonElement>('triches-tout');
const trichesAppliquer = $<HTMLButtonElement>('triches-appliquer');
const modOnglets = $<HTMLDivElement>('mod-onglets');
const modFiches = $<HTMLDivElement>('mod-fiches');
const modChercher = $<HTMLDivElement>('mod-chercher');
const modTaille = $<HTMLSelectElement>('mod-taille');
const modValeur = $<HTMLInputElement>('mod-valeur');
const modPremier = $<HTMLButtonElement>('mod-premier');
const modReprendre = $<HTMLButtonElement>('mod-reprendre');
const modQuestions = $<HTMLDivElement>('mod-questions');
const modRestantes = $<HTMLElement>('mod-restantes');
const modAdresses = $<HTMLDivElement>('mod-adresses');
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
const creditsBody = $<HTMLElement>('credits-body');
const creditsNote = $<HTMLElement>('credits-note');
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
const langueMenu = $<HTMLDivElement>('menu-langue');
const echelleList = $<HTMLDivElement>('echelle-list');
const lissageList = $<HTMLDivElement>('lissage-list');
const nuanceList = $<HTMLDivElement>('nuance-list');
const etirementList = $<HTMLDivElement>('etirement-list');
const croquisManette = $<HTMLTemplateElement>('croquis-manette');
const raccourcisEtatBoite = $<HTMLDListElement>('raccourcis-etat');
const secousseBoite = $<HTMLDListElement>('raccourci-secousse');
const zoneMorteJauge = $<HTMLInputElement>('zone-morte');
const zoneMorteValeur = $<HTMLElement>('zone-morte-valeur');
const galerieBoite = $<HTMLDivElement>('galerie');
const galerieVide = $<HTMLElement>('gallery-vide');
const galerieDossier = $<HTMLButtonElement>('gallery-folder');
const emplacementsBoite = $<HTMLDivElement>('emplacements');
const triPart = $<HTMLDivElement>('tri-part');
const triEtat = $<HTMLParagraphElement>('tri-etat');
const triQuestions = $<HTMLDivElement>('tri-questions');
const triAppliquer = $<HTMLButtonElement>('tri-appliquer');
const surQuoi = $<HTMLParagraphElement>('sur-quoi');
const surOui = $<HTMLButtonElement>('sur-oui');
const surNon = $<HTMLButtonElement>('sur-non');
const crashTitre = $<HTMLElement>('crash-titre');
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
  triches: $<HTMLDialogElement>('triches-dialog'),
  mod: $<HTMLDialogElement>('mod-dialog'),
  sur: $<HTMLDialogElement>('sur-dialog'),
  tri: $<HTMLDialogElement>('tri-dialog'),
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
  nuance: 'evachi.nuance',
  jaquettes: 'evachi.jaquettes',
  disques: 'evachi.disques',
  musique: 'evachi.musique',
  sons: 'evachi.sons',
  favoris: 'evachi.favoris',
  echelle: 'evachi.echelle',
  lissage: 'evachi.lissage',
  etirement: 'evachi.etirement',
  zoneMorte: 'evachi.zone-morte',
  etats: 'evachi.etats',
  emplacement: 'evachi.emplacement',
  recents: 'evachi.recents',
  langue: 'evachi.langue',
  parler: 'evachi.langue-jeux',
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

/*
 * Le menu des langues, le dernier de la barre.
 *
 * Un menu à soi plutôt qu'une ligne dans les thèmes : on cherche sa langue tout
 * de suite, et sans savoir lire ce qui est écrit autour. Le nom de chaque
 * langue y est écrit dans cette langue-là — c'est ainsi qu'on reconnaît la
 * sienne dans une liste qu'on ne sait pas lire.
 *
 * Deux langues s'y règlent, qui n'ont rien à voir l'une avec l'autre : celle
 * de l'interface, et celle qu'on voudrait entendre parler aux jeux. La seconde
 * n'a d'endroit naturel nulle part ailleurs — ce n'est ni un thème, ni un
 * réglage de cœur — et la mettre ici évite d'avoir à chercher.
 */

/**
 * Lequel des trois volets le menu « Langue » montre en ce moment.
 *
 * Un seul volet dans la page, dont on redessine le contenu : deux listes
 * posées côte à côte demanderaient à la feuille de style de savoir laquelle
 * cacher, et à la manette de savoir laquelle parcourir. Ici il n'y a jamais
 * qu'une liste, et tout ce qui la parcourt marche sans rien apprendre.
 */
let voletLangue: 'accueil' | 'interface' | 'jeux' = 'accueil';

/** Montre un volet du menu des langues, et vise sa première entrée. */
function ouvrirVoletLangue(volet: 'accueil' | 'interface' | 'jeux'): void {
  voletLangue = volet;
  renderLangues();
  langueList.querySelector<HTMLButtonElement>('button')?.focus();
}

/** Dessine le volet en cours du menu des langues. */
function renderLangues(): void {
  langueList.replaceChildren();
  // La liste est une grille de quatre colonnes ancrée à droite ; l'accueil, un
  // menu ordinaire sous son titre. C'est la seule différence de forme.
  const liste = voletLangue !== 'accueil';
  langueList.classList.toggle('langues', liste);
  if (liste) langueMenu.dataset.volet = 'liste';
  else delete langueMenu.dataset.volet;

  if (voletLangue === 'accueil') return renderAccueilLangues();
  if (voletLangue === 'jeux') return renderParlers();
  return renderLanguesInterface();
}

/**
 * Les deux lignes d'accueil.
 *
 * Elles disent laquelle des deux langues on va régler. Sans elles, la liste des
 * cinquante s'ouvrait directement, et la langue des jeux n'aurait eu nulle part
 * où se mettre — ou serait allée se perdre dans une fenêtre de réglages, loin
 * de la seule autre chose qui lui ressemble.
 */
function renderAccueilLangues(): void {
  const entrees: [string, 'interface' | 'jeux', string][] = [
    [t("Langue de l'interface"), 'interface', langueRetenue().nom],
    [t('Langue des jeux'), 'jeux', nomDuParler()],
  ];

  for (const [libelle, volet, etat] of entrees) {
    const choix = document.createElement('button');
    choix.type = 'button';
    choix.textContent = libelle;

    const dit = document.createElement('span');
    dit.className = 'shortcut';
    dit.textContent = etat;
    choix.append(dit);

    // Le menu se referme au moindre clic dans la page : celui-ci change de
    // volet, il ne choisit rien.
    choix.addEventListener('click', (event) => {
      event.stopPropagation();
      ouvrirVoletLangue(volet);
    });
    langueList.append(choix);
  }
}

/** Le nom de la langue demandée aux jeux, tel qu'il s'écrit sur la ligne. */
function nomDuParler(): string {
  const garde = retenu(RETENU.parler);
  return parlerParCode(garde)?.nom ?? t("Comme l'interface");
}

/** La ligne par laquelle on remonte à l'accueil, en tête de chaque liste. */
function retourAuxLangues(): void {
  const retour = document.createElement('button');
  retour.type = 'button';
  retour.className = 'retour';
  retour.textContent = `‹ ${t('Retour')}`;
  retour.addEventListener('click', (event) => {
    event.stopPropagation();
    ouvrirVoletLangue('accueil');
  });
  langueList.append(retour);
}

/**
 * Les langues qu'on peut demander aux jeux.
 *
 * Onze, et non cinquante : ce sont celles que les jeux parlent. Proposer d'en
 * demander une dans laquelle aucun jeu n'existe serait promettre quelque chose
 * qui n'arrivera pas.
 */
function renderParlers(): void {
  retourAuxLangues();
  const courante = retenu(RETENU.parler) ?? COMME_INTERFACE;

  const lignes: [string, string][] = [
    [COMME_INTERFACE, t("Comme l'interface")],
    ...PARLERS.map((parler): [string, string] => [parler.code, parler.nom]),
  ];

  for (const [code, nom] of lignes) {
    const choix = document.createElement('button');
    choix.type = 'button';
    const active = code === courante;
    choix.setAttribute('aria-pressed', String(active));
    if (code !== COMME_INTERFACE) choix.lang = code;

    const coche = document.createElement('span');
    coche.className = 'coche';
    coche.textContent = active ? '●' : '';

    const etiquette = document.createElement('span');
    etiquette.textContent = nom;

    choix.append(coche, etiquette);
    choix.addEventListener('click', () => choisirParler(code));
    langueList.append(choix);
  }
}

/**
 * Retient la langue à demander aux jeux.
 *
 * Elle ne rattrape pas la partie en cours : un cœur lit ses options une fois,
 * au chargement, et la plupart des consoles émulées liraient leur langue au
 * démarrage de toute façon. On le dit plutôt que de laisser croire à une panne.
 */
function choisirParler(code: string): void {
  retenir(RETENU.parler, code);
  renderLangues();
  log(dit('Langue des jeux : {0}. Elle vaudra au prochain lancement.', nomDuParler()), 'ok');
}

/** La langue à demander au prochain cœur chargé. */
function langueDesJeux(): string {
  return langueDemandee(retenu(RETENU.parler), langueRetenue().code);
}

function renderLanguesInterface(): void {
  retourAuxLangues();
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

/** Les quatre façons de présenter la bibliothèque. */
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
  {
    id: 'carrousel',
    label: aTraduire('Carrousel'),
    detail: aTraduire(
      'Les jaquettes de face, les consoles en pile, une poussière qui monte. Façon présentoir.',
    ),
  },
  {
    id: 'paquet',
    label: aTraduire('Paquet'),
    detail: aTraduire(
      'Les jaquettes tenues en éventail, comme une main de cartes. Le poignet tourne, la carte lue se redresse.',
    ),
  },
  {
    id: 'seance',
    label: aTraduire('Séance'),
    detail: aTraduire(
      'Une salle obscure, un faisceau plein de poussière, et le jeu projeté en grand. Le reste attend dans le panier.',
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
    const adresse = ecranVisible().toDataURL('image/png');
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
  oublierTriches();
  // Un panneau resté ouvert sur un jeu qui n'est plus là ne montrerait que des
  // lignes qui ne commandent plus rien.
  if (dialogs.mod.open) dialogs.mod.close();
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
  log(dit('arrêt brutal la fois précédente — {0}', nom), 'err');

  montrerIncident(
    t("La fois précédente s'est mal terminée"),
    rapport.game
      ? dit("EvaChi s'est arrêtée en lançant « {0} », avec l'émulateur {1}.", rapport.game, nom)
      : dit("EvaChi s'est arrêtée, avec l'émulateur {0}.", nom),
    rapport.core,
    nom,
    // La note est effacée dès qu'on l'a montrée : on ne prévient qu'une fois.
    () => void dismissCrash().catch(() => {}),
  );
}

/**
 * Montre la fenêtre d'incident, et propose d'écarter le cœur en cause.
 *
 * Deux moments s'y retrouvent : le plantage qu'on découvre au démarrage
 * suivant, et celui qu'on vient de voir arriver. Ils n'annoncent pas la même
 * chose, mais la suite est la même — écarter cet émulateur, ou le garder.
 */
function montrerIncident(
  titre: string,
  quoi: string,
  coeur: string,
  nom: string,
  apres?: () => void,
): void {
  crashTitre.textContent = titre;
  crashQuoi.textContent = quoi;

  crashEcarter.onclick = async () => {
    try {
      await setCoreUsable(coeur, false);
      log(dit('{0} écarté', nom), 'ok');
      await reloadCatalog();
      await refreshLibrary();
    } catch (error) {
      log(dit("mise à l'écart impossible — {0}", reason(error)), 'err');
    }
    dialogs.crash.close();
  };

  if (apres) dialogs.crash.addEventListener('close', apres, { once: true });
  openDialog(dialogs.crash);
}

/**
 * Dit ce qui vient d'arrêter la partie, et range derrière.
 *
 * Un cœur qui tombe ne fait plus disparaître la fenêtre — il vit dans son
 * propre processus. Encore faut-il que la fenêtre en tire les conséquences :
 * sans cela, la boucle s'arrêtait et écrivait une ligne, mais le cœur, le jeu
 * et le nom restaient posés, la bibliothèque ne revenait pas, et « Reprendre »
 * aurait relancé la boucle sur un cœur mort.
 */
async function signalerArret(raison: string): Promise<void> {
  const tombe = raison.startsWith(COEUR_TOMBE);
  // La marque sert au code, pas à l'utilisateur : elle sort du journal.
  const dire = tombe ? raison.slice(COEUR_TOMBE.length).replace(/^\s*:\s*/, '') : raison;
  // Relevés avant de ranger : `stopPlaying` efface tout cela.
  const coeur = entry?.id ?? '';
  const nom = entry?.label ?? '';
  const jeu = contentName;

  log(dit('arrêt — {0}', dire), 'err');
  // Ce que le cœur a dit juste avant de tomber explique souvent pourquoi. On le
  // relève tant qu'on sait encore à qui il appartient : `stopPlaying` oublie le
  // cœur, et la relève se taira ensuite.
  await signalerFichierSysteme(await drainMessages());
  await stopPlaying();

  if (!tombe || !coeur) return;
  montrerIncident(
    t("L'émulateur s'est arrêté"),
    jeu
      ? dit("L'émulateur {0} s'est arrêté pendant « {1} ».", nom, jeu)
      : dit("L'émulateur {0} s'est arrêté.", nom),
    coeur,
    nom,
  );
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
    const ecran = ecranVisible();
    const vignette = ecran.width > 0 ? ecran.toDataURL('image/png') : '';
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
    const carte = document.createElement('div');
    carte.className = 'emplacement';
    carte.setAttribute('aria-current', String(place.slot === emplacementVise));

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

    const gestes = document.createElement('div');
    gestes.className = 'gestes';

    /** Un geste écrit sous la carte. Le faire vise aussi cet emplacement. */
    const geste = (texte: string, faire: () => Promise<void>): void => {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'lien';
      bouton.textContent = texte;
      bouton.addEventListener('click', async () => {
        emplacementVise = place.slot;
        retenir(RETENU.emplacement, String(place.slot));
        await faire();
        await renderEmplacements();
      });
      gestes.append(bouton);
    };

    if (place.filled) {
      geste(t('Reprendre'), () => chargerEmplacement(place.slot));
      geste(t('Remplacer'), async () => {
        const sur = await demanderSur(
          dit('Remplacer l’emplacement {0} ? Ce qui y est rangé sera perdu.', place.slot + 1),
        );
        if (sur) await sauverEmplacement(place.slot);
      });
      geste(t('Vider'), async () => {
        const sur = await demanderSur(
          dit('Vider l’emplacement {0} ? Ce qui y est rangé sera perdu.', place.slot + 1),
        );
        if (sur) await deleteStateSlot(cheminEnCours, place.slot);
      });
    } else {
      geste(t('Sauvegarder ici'), () => sauverEmplacement(place.slot));
    }

    carte.append(apercu, titre, quand, gestes);
    emplacementsBoite.append(carte);
  }
}

/** Montre les emplacements du jeu en cours, à jour. */
async function ouvrirEmplacements(): Promise<void> {
  await renderEmplacements();
  openDialog(dialogs.states);
}

/**
 * Efface ce que le jeu a écrit de lui-même, et le relance neuf.
 *
 * Trois temps, et l'ordre compte. Le cœur tient la pile en mémoire et ne
 * l'écrit sur le disque qu'en se déchargeant : effacer d'abord ne ferait que
 * la voir réapparaître une seconde plus tard. On arrête donc la partie, on
 * efface ensuite, et on relance le jeu — qui ne trouve plus rien, et
 * recommence.
 *
 * Les emplacements de sauvegarde ne sont pas touchés : ce sont les vôtres, et
 * ils restent là si l'on veut revenir en arrière.
 */
async function repartirDeZero(): Promise<void> {
  const chemin = cheminEnCours;
  const coeur = entry;
  const jeu = contentName;
  if (!chemin || !coeur) return;
  const rom = games.find((candidat) => candidat.path === chemin);

  try {
    const piles = (await listSaves(chemin)) ?? [];
    for (const pile of piles) log(`${pile.nom} — ${humanSize(pile.taille)}`);
  } catch (error) {
    log(reason(error), 'err');
  }

  const sur = await demanderSur(
    dit(
      'Effacer la sauvegarde de {0} et reprendre depuis le début ? La partie en cours sera arrêtée, et ce que le jeu avait noté sera perdu.',
      jeu,
    ),
  );
  if (!sur) return;

  await stopPlaying();
  try {
    const retires = await clearSaves(chemin);
    log(
      retires > 0
        ? dit('sauvegarde effacée — {0}', plural(retires, 'fichier'))
        : t('aucune sauvegarde à effacer'),
      'ok',
    );
  } catch (error) {
    log(reason(error), 'err');
  }

  if (rom) await play(coeur, rom);
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
type Geste = 'sauver' | 'charger' | 'secousse';

/** Les trois gestes, dans l'ordre où ils s'affichent. */
const GESTES: readonly Geste[] = ['sauver', 'charger', 'secousse'];

const RACCOURCIS_PAR_DEFAUT: Record<Geste, Raccourci> = {
  sauver: { clavier: 'F2', pad: [8, 4] },
  charger: { clavier: 'F4', pad: [8, 5] },
  // Select et A : les quatre autres combinaisons avec Select sont déjà prises
  // — B les triches, X le plein écran, Y la capture, Start le retour.
  secousse: { clavier: 'F6', pad: [8, 0] },
};

let raccourcisEtat: Record<Geste, Raccourci> = lireRaccourcis();

function lireRaccourcis(): Record<Geste, Raccourci> {
  try {
    const brut = JSON.parse(retenu(RETENU.etats) ?? 'null');
    if (!brut || typeof brut !== 'object') return structuredClone(RACCOURCIS_PAR_DEFAUT);
    const lu = (quoi: Geste): Raccourci => ({
      // Un réglage écrit par une version qui ne connaissait pas la secousse
      // n'en porte rien : on reprend alors le raccourci d'origine plutôt que
      // de laisser un geste sans touche.
      clavier:
        typeof brut[quoi]?.clavier === 'string'
          ? brut[quoi].clavier
          : RACCOURCIS_PAR_DEFAUT[quoi].clavier,
      pad: Array.isArray(brut[quoi]?.pad)
        ? brut[quoi].pad.filter(Number.isInteger)
        : [...RACCOURCIS_PAR_DEFAUT[quoi].pad],
    });
    return { sauver: lu('sauver'), charger: lu('charger'), secousse: lu('secousse') };
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
let raccourciEnAttente: Geste | null = null;

/** Le nom d'un geste, tel qu'il s'écrit dans le panneau. */
function nomDuGeste(quoi: Geste): string {
  if (quoi === 'sauver') return t('Sauvegarder');
  if (quoi === 'charger') return t('Charger');
  return t('Secouer');
}

/** Dessine une liste de raccourcis, chacun cliquable pour être redéfini. */
function renderRaccourcis(boite: HTMLElement, gestes: readonly Geste[]): void {
  boite.replaceChildren();

  for (const quoi of gestes) {
    const dt = document.createElement('dt');
    dt.textContent = nomDuGeste(quoi);

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
    boite.append(dt, dd);
  }
}

function renderRaccourcisEtat(): void {
  renderRaccourcis(raccourcisEtatBoite, ['sauver', 'charger']);
  renderRaccourcis(secousseBoite, ['secousse']);
}

function poserRaccourci(quoi: Geste, raccourci: Partial<Raccourci>): void {
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

const etats: Record<Geste, Held> = {
  sauver: new Held(1200, 1200),
  charger: new Held(1200, 1200),
  // Plus court pour la secousse : on en enchaîne parfois plusieurs, et
  // attendre une seconde entre deux rendrait le geste inutile.
  secousse: new Held(600, 600),
};

/**
 * Regarde si un raccourci de sauvegarde vient d'être fait à la manette.
 *
 * Seulement en cours de partie et sur un cœur interne : ailleurs il n'y a rien
 * à sauvegarder, et laisser la combinaison agir donnerait l'impression d'un
 * raccourci cassé.
 */
function surveillerEtats(pad: Gamepad, maintenant: number): void {
  if (!core) return;
  for (const quoi of GESTES) {
    const tenu = raccourciTenu(pad, raccourcisEtat[quoi].pad);
    if (etats[quoi].update(tenu, maintenant).pressed) {
      if (sonsVoulus()) ticValidation();
      faireLeGeste(quoi);
    }
  }
}

/**
 * L'instant où la secousse a commencé, ou rien quand la machine est calme.
 *
 * Gardé en millisecondes de l'horloge de la page : c'est elle qui rythme les
 * trames, et une secousse mesurée sur une autre horloge se décalerait.
 */
let secousseDepuis: number | null = null;

/** Ce que fait un raccourci : droit au but, sans rien demander. */
function faireLeGeste(quoi: Geste): void {
  if (quoi === 'sauver') void sauverEmplacement(emplacementVise);
  else if (quoi === 'charger') void chargerEmplacement(emplacementVise);
  else secousseDepuis = performance.now();
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

/**
 * Les crans d'étirement, de zéro à cent pour cent.
 *
 * Onze plutôt qu'une jauge continue : on ne règle pas cela finement, on
 * l'essaie. Et un cran retrouvé à l'identique d'un lancement à l'autre vaut
 * mieux qu'un curseur qu'on ne remet jamais exactement où il était.
 */
const ETIREMENTS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

/** De combien l'image déborde de ses proportions, en centièmes. */
function etirementImage(): number {
  const garde = Number(retenu(RETENU.etirement));
  return ETIREMENTS.includes(garde as (typeof ETIREMENTS)[number]) ? garde : 0;
}

function echelleImage(): string {
  const garde = retenu(RETENU.echelle);
  return ECHELLES.some(([id]) => id === garde) ? (garde as string) : 'ajuster';
}

function lissageImage(): string {
  return retenu(RETENU.lissage) === 'doux' ? 'doux' : 'net';
}

/** Le filtre retenu, ou aucun. */
function nuanceImage(): string {
  return nuanceParId(retenu(RETENU.nuance)).id;
}

/**
 * Le peintre des filtres, ouvert à la première demande.
 *
 * Pas au démarrage : ouvrir un contexte graphique réserve de la mémoire sur la
 * carte, et la plupart des parties se jouent sans filtre. `false` dit qu'on a
 * essayé et que la machine n'a pas suivi — on ne réessaie pas à chaque trame.
 */
let peintre: Peintre | null | false = null;

/** Vrai quand la trame doit passer par un filtre, et qu'elle le peut. */
function filtreActif(): boolean {
  const nuance = nuanceParId(retenu(RETENU.nuance));
  if (!nuance.source) return false;
  if (peintre === null) peintre = Peintre.ouvrir(nuanceCanvas) ?? false;
  if (peintre === false) return false;
  if (!peintre.poser(nuance)) return false;
  peintre.lissage(lissageImage() === 'doux');
  return true;
}

/**
 * Montre l'écran qui convient, et cache l'autre.
 *
 * Deux canevas parce qu'un canevas ne change pas d'avis : on lui demande une
 * fois pour toutes s'il se peint pixel par pixel ou par la carte graphique, et
 * la réponse vaut pour sa vie entière.
 */
function poserEcran(): void {
  const filtre = filtreActif();
  canvas.hidden = filtre;
  nuanceCanvas.hidden = !filtre;
  fitScreen();
}

/** Celui des deux écrans qu'on voit : c'est de lui qu'on tire une capture. */
function ecranVisible(): HTMLCanvasElement {
  return nuanceCanvas.hidden ? canvas : nuanceCanvas;
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
  etirementList.replaceChildren();
  for (const cran of ETIREMENTS) {
    const choix = document.createElement('button');
    choix.type = 'button';
    // Un pourcentage se lit dans toutes les langues : rien à traduire ici.
    choix.textContent = `${cran} %`;
    choix.setAttribute('aria-pressed', String(cran === etirementImage()));
    choix.addEventListener('click', () => {
      retenir(RETENU.etirement, String(cran));
      renderGraphisme();
      fitScreen();
    });
    etirementList.append(choix);
  }

  renderChoix(lissageList, LISSAGES, lissageImage(), (id) => {
    retenir(RETENU.lissage, id);
    renderGraphisme();
    appliquerLissage();
  });

  renderChoix(
    nuanceList,
    NUANCES.map((nuance) => [nuance.id, nuance.label, nuance.detail] as const),
    nuanceImage(),
    (id) => {
      retenir(RETENU.nuance, id);
      renderGraphisme();
      poserEcran();
      // La trame en cours est déjà passée : sans cela, le filtre n'apparaît
      // qu'au mouvement suivant, et sur un jeu en pause il n'apparaît jamais.
      repeindre();
    },
  );
}

/** Pose le lissage sur le canvas et sur le contexte de dessin. */
function appliquerLissage(): void {
  const doux = lissageImage() === 'doux';
  canvas.style.imageRendering = doux ? 'auto' : 'pixelated';
  if (context) context.imageSmoothingEnabled = doux;
  if (peintre) {
    peintre.lissage(doux);
    repeindre();
  }
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
  if (enCarrousel()) return voletsCarr[etageCarr]?.games[carteCarr];
  if (enPaquet()) return voletsPaq[consolePaq]?.games[cartePaq];
  if (enSeance()) return voletsSea[consoleSea]?.games[lameSea];
  return undefined;
}

/** Vrai quand un menu de salon doit avoir sa musique. */
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
  if (musiqueCase.checked && enMenuAnime() && !libraryView.hidden) demarrerMusique();
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

/** Les deux manches, de -1 à 1 : X et Y du gauche, puis X et Y du droit. */
const manches: number[] = [0, 0, 0, 0];

/**
 * En deçà, un manche est tenu pour centré.
 *
 * Bien plus fin que le seuil des directions : celui-ci décide d'un oui ou d'un
 * non, alors qu'ici on transmet la position elle-même, et un jeu qui attend un
 * pas prudent doit pouvoir le recevoir.
 *
 * Réglable, parce qu'une manette usée ne revient plus au centre : douze pour
 * cent suffisent à une manette neuve et laissent dériver une vieille, où il en
 * faut parfois trente.
 */
const REPOS_PAR_DEFAUT = 12;

function zoneMorte(): number {
  const garde = Number(retenu(RETENU.zoneMorte));
  const cran = Number.isFinite(garde) && garde >= 4 && garde <= 40 ? garde : REPOS_PAR_DEFAUT;
  return cran / 100;
}

/** Les six capteurs, tels qu'ils partiront au cœur à la trame suivante. */
const capteurs: number[] = enSix(ressenti(0, 0, null));
const buttonCells = new Map<number, HTMLElement>();

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
/**
 * Vrai tant que les deux manches sont enfoncés pendant une partie.
 *
 * Un maintien, pas une bascule : la manette n'est lue que lorsqu'elle répond,
 * et une bascule restée armée sur une manette débranchée laisserait le jeu
 * emballé sans plus aucun moyen de le calmer.
 */
let avanceRapide = false;
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
  // Le menu des langues revient toujours a son accueil : rouvrir « Langue » et
  // tomber sur la liste ou l'on etait la fois d'avant se lit comme une panne.
  if (voletLangue !== 'accueil') {
    voletLangue = 'accueil';
    renderLangues();
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
    wipe: playing,
    shot: playing,
    stop: playing,
    mod: playing,
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

/**
 * Les fenêtres ouvertes, la dernière par-dessus.
 *
 * Une question posée par-dessus un panneau en laisse deux ouvertes à la fois.
 * Chercher « la fenêtre ouverte » dans la page rendrait alors la première
 * écrite dans le document, pas celle qu'on a sous les yeux : la manette
 * conduirait le panneau du dessous pendant qu'on lit la question.
 */
const fenetresOuvertes: HTMLDialogElement[] = [];

/** Celle qui est par-dessus, et qui a donc la main. */
function fenetreDessus(): HTMLDialogElement | null {
  return fenetresOuvertes.at(-1) ?? null;
}

/** Ouvre une boîte de dialogue, en fermant les menus au passage. */
function openDialog(dialog: HTMLDialogElement): void {
  closeMenus();
  fenetresOuvertes.push(dialog);
  dialog.showModal();
}

for (const dialog of Object.values(dialogs)) {
  // Une fenêtre se referme de bien des façons — un bouton, la touche d'échappement,
  // le code. Une seule les voit toutes.
  dialog.addEventListener('close', () => {
    const rang = fenetresOuvertes.lastIndexOf(dialog);
    if (rang >= 0) fenetresOuvertes.splice(rang, 1);
  });
}

/**
 * Pose une question dont la réponse engage, et attend.
 *
 * Rien de ce qui se perd ne doit partir d'un seul clic. « Annuler » a le focus
 * à l'ouverture : la manette et la touche d'entrée retombent donc sur le geste
 * qui ne coûte rien.
 */
function demanderSur(question: string): Promise<boolean> {
  surQuoi.textContent = question;
  return new Promise((repondre) => {
    let accepte = false;
    const oui = (): void => {
      accepte = true;
      dialogs.sur.close();
    };
    surOui.addEventListener('click', oui);
    dialogs.sur.addEventListener(
      'close',
      () => {
        surOui.removeEventListener('click', oui);
        repondre(accepte);
      },
      { once: true },
    );
    openDialog(dialogs.sur);
    surNon.focus();
  });
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
  // `poserEcran` choisit lequel des deux canevas se montre, et appelle
  // `fitScreen` : le filtre doit être en place avant la première trame, sinon
  // le jeu démarre sans lui.
  if (!show) poserEcran();
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

  // Et pour finir, l'étirement. Il s'applique à ce qui précède plutôt qu'à
  // la place de tout : demandé sur un multiple entier, il en garde le point de
  // départ, et l'utilisateur voit exactement ce qu'il a réglé.
  const tirage = etirementImage() / 100;
  if (tirage > 0) {
    width += (box.width - width) * tirage;
    height += (box.height - height) * tirage;
  }

  canvas.style.width = `${Math.floor(width)}px`;
  canvas.style.height = `${Math.floor(height)}px`;

  // Le canevas des filtres est réglé à la taille affichée, et non à celle de la
  // trame : c'est ce qui permet une ligne de balayage fine sur un grand écran.
  // Peindre à la taille de la console ne donnerait qu'un pixel sur deux à
  // noircir, et l'agrandissement en ferait des barres.
  nuanceCanvas.style.width = `${Math.floor(width)}px`;
  nuanceCanvas.style.height = `${Math.floor(height)}px`;
  if (!nuanceCanvas.hidden) {
    const points = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const large = Math.max(1, Math.floor(width * points));
    const haut = Math.max(1, Math.floor(height * points));
    if (nuanceCanvas.width !== large || nuanceCanvas.height !== haut) {
      nuanceCanvas.width = large;
      nuanceCanvas.height = haut;
      repeindre();
    }
  }
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
  if (peintre && !nuanceCanvas.hidden) {
    peintre.peindre(frame.width, frame.height, frameImage.data);
    return;
  }
  context!.putImageData(frameImage, 0, 0);
}

/**
 * Repeint la dernière trame connue.
 *
 * Changer de filtre pendant une pause, ou depuis le panneau alors que le jeu
 * attend, ne produit aucune trame neuve : sans cela le réglage semblerait sans
 * effet jusqu'au prochain mouvement.
 */
function repeindre(): void {
  if (frameImage.width <= 1) return;
  if (peintre && !nuanceCanvas.hidden) {
    peintre.peindre(frameImage.width, frameImage.height, frameImage.data);
    return;
  }
  context?.putImageData(frameImage, 0, 0);
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
  // Une partie qu'on quitte les manches enfoncés ne doit pas armer l'avance
  // rapide de la suivante.
  if (!next) avanceRapide = false;
  refreshMenus();
  if (next) void runLoop();
}

// --- Vitesse du jeu ---------------------------------------------------------

/** Les bornes de la jauge, en pourcentage de la vitesse de la console. */
const TEMPO = { plancher: 50, normal: 100, plafond: 900 } as const;

/**
 * Combien de trames on demande au plus d'un seul coup.
 *
 * Neuf suffisent à couvrir la jauge entière. La borne existe pour qu'une valeur
 * aberrante — un stockage abîmé, un jour — ne fasse pas partir le cœur pour un
 * travail dont il ne reviendrait qu'après l'échéance.
 */
const LOT_MAXIMUM = 9;

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

/**
 * Une part écrite en pourcentage, dans la langue en cours.
 *
 * `Intl` sait où va le signe et s'il prend une espace : « 100 % » en français,
 * « 100% » en anglais et en japonais. Le format est gardé d'un appel à l'autre :
 * la boucle l'emploie une fois par seconde, et en construire un à chaque fois
 * pour cinq caractères coûterait plus que de les écrire.
 */
const formatsPourcent = new Map<string, Intl.NumberFormat>();

function pourcentage(part: number): string {
  const langue = localeCourante();
  let format = formatsPourcent.get(langue);
  if (!format) {
    format = new Intl.NumberFormat(langue, { style: 'percent', maximumFractionDigits: 0 });
    formatsPourcent.set(langue, format);
  }
  return format.format(part);
}

/** Écrit le pourcentage à côté de la jauge, dans la langue en cours. */
function renderTempo(): void {
  const pourcent = Math.round(tempoJeu() * 100);
  tempoInput.value = String(pourcent);
  tempoValue.textContent = pourcentage(pourcent / 100);
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
    // vitesse doit suivre le doigt. L'avance rapide se pose par-dessus, le
    // temps qu'on tienne les deux manches.
    const tempo = vitesseAvance(tempoJeu(), avanceRapide);
    // En accéléré, on demande plusieurs trames d'un coup. L'écran n'en montre
    // que soixante par seconde de toute façon, et le cœur vit derrière une
    // frontière de processus : les demander une par une paierait l'aller-retour
    // autant de fois, pour huit images sur neuf que personne ne verra.
    const lot = tempo > 1 ? Math.max(1, Math.min(Math.round(tempo), LOT_MAXIMUM)) : 1;
    const frameMs = (1000 * lot) / (core.info.fps || 60) / tempo;

    sampleInput();

    // On dit d'avance si on peindra : l'image d'une trame qu'on ne regardera
    // pas n'a aucune raison de traverser.
    //
    // Un lot se peint toujours. La cadence est déjà réglée par le lot lui-même —
    // un tour de boucle vaut une image d'écran —, et remesurer le temps écoulé
    // par-dessus tombait tantôt à 16,6 ms tantôt à 16,7 pour un seuil fixé à
    // 16,67 : une trame sur deux était sautée, et l'avance rapide s'affichait à
    // trente images par seconde au lieu de soixante.
    const peindra =
      lot > 1 || tempo <= 1 || performance.now() - dernierDessin >= 1000 / 60;

    let frame: Frame;
    try {
      frame = await core.runFrame(buttons, lot, peindra, manches, capteurs);
    } catch (error) {
      if (token === loopToken) {
        setRunning(false);
        await signalerArret(reason(error));
      }
      return;
    }

    // Le cœur a pu changer pendant l'attente : cette trame ne vaut plus rien.
    if (token !== loopToken) return;

    const now = performance.now();

    if (peindra) {
      present(frame);
      dernierDessin = now;
    }

    // Le son est rééchantillonné plutôt que joué tel quel : annoncer une
    // cadence multipliée le comprime d'autant, et il reste à l'heure au lieu de
    // prendre une avance qui grandirait sans fin. Le prix est un son plus aigu
    // en accéléré, plus grave au ralenti — c'est ce qu'on attend.
    audio.push(frame.audio, core.info.sampleRate * tempo);
    // Le lot compte pour ce qu'il vaut : ce sont des trames émulées, même si
    // l'écran n'en a montré qu'une.
    framesThisSecond += lot;

    if (now - lastReport >= 1000) {
      // La vitesse s'affiche dès qu'elle n'est plus celle de la console : sans
      // cela, une jauge oubliée à 400 % d'un lancement à l'autre passerait pour
      // un jeu détraqué. On l'écrit à partir de la vitesse réellement tenue, et
      // non de la jauge : l'avance rapide ne la déplace pas.
      const images = dit('{0} im/s', framesThisSecond);
      fpsOut.textContent = tempo === 1 ? images : `${images} · ${pourcentage(tempo)}`;
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

/**
 * Remonte ce que le cœur a voulu dire : BIOS manquant, avertissements.
 *
 * Rend les lignes relevées, pour qui veut les relire de plus près.
 */
async function drainMessages(): Promise<string[]> {
  if (!inShell || entry?.kind !== 'libretro') return [];
  try {
    const dits = await takeMessages();
    for (const message of dits) log(dit('cœur : {0}', message));
    return dits;
  } catch {
    // Un échec de relève ne doit pas interrompre la partie.
    return [];
  }
}

/**
 * Dit ce qu'il manque, quand un cœur a refusé un jeu faute d'un micrologiciel.
 *
 * C'est le pire des refus, parce qu'il est muet : le cœur écrit sa plainte dans
 * son journal, au milieu de cinquante lignes de démarrage, et l'écran n'affiche
 * que « contenu refusé ». Personne ne va lire le journal. Ici, on le lit pour
 * lui — et quand EvaChi connaît ce fichier-là, elle dit aussi où le déposer.
 */
async function signalerFichierSysteme(dits: readonly string[]): Promise<void> {
  if (!inShell || dits.length === 0) return;
  let manque = null;
  try {
    manque = await claimedSystemFile(dits);
  } catch {
    return;
  }
  if (!manque) return;

  log(dit('il manque un fichier système : {0}', manque.fichier), 'err');
  if (manque.ou) log(dit('à déposer ici : {0}', manque.ou));
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
    core = await next.open(langueDesJeux());
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
  // Les triches du jeu précédent n'ont rien à faire sur celui-ci : ses
  // adresses ne sont pas les mêmes, et ses codes encore moins.
  oublierTriches();
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
    await signalerFichierSysteme(await drainMessages());
    return;
  }

  contentName = name;
  contentBytes = bytes;
  contentPath = path ?? null;
  savedState = null;

  // Un cœur qui démarre sans son micrologiciel ne refuse pas toujours : il
  // tourne, produit du son, et n'affiche qu'un écran noir. C'est le pire des
  // cas, parce que rien ne le dit. On regarde donc aussi quand tout s'est bien
  // passé — une fois, ici, et pas à chaque seconde de la partie.
  await signalerFichierSysteme(await drainMessages());

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
  // Oublié ici aussi : c'est lui qui nomme le dossier des emplacements de
  // sauvegarde, et le laisser en place faisait pointer les emplacements sur le
  // dernier jeu joué alors qu'on était revenu à la bibliothèque.
  cheminEnCours = '';
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

/** Les présentations qui se parcourent à la manette. */
type Vue = 'grille' | 'xmb' | 'carrousel' | 'paquet' | 'seance';

/** Vrai quand une vue manette est à l'écran et qu'elle a de quoi montrer. */
function vueManette(): Vue | null {
  if (libraryView.hidden) return null;
  if (enGrille() && tuiles.length > 0) return 'grille';
  if (enXmb() && voletsXmb.length > 0) return 'xmb';
  if (enCarrousel() && voletsCarr.length > 0) return 'carrousel';
  if (enPaquet() && voletsPaq.length > 0) return 'paquet';
  if (enSeance() && voletsSea.length > 0) return 'seance';
  return null;
}

/** Lance ce que la vue en cours tient sous son repère. */
function jouerVue(vue: Vue): Promise<void> {
  if (vue === 'grille') return jouerChoisie();
  if (vue === 'xmb') return jouerXmb();
  if (vue === 'paquet') return jouerPaquet();
  if (vue === 'seance') return jouerSeance();
  return jouerCarr();
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
  triches: new Held(1000, 1000),
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
  // Une case qui attend son bouton écoute la manette ; la laisser conduire en
  // même temps ferait qu'un seul appui lie la commande *et* déplace le focus,
  // ou pire, actionne ce qui se trouvait dessous.
  if (enAttente !== null || raccourciEnAttente !== null) {
    verrouPad.fermer();
    return;
  }

  // `currentPad` et non `padIndex` : sous Windows la manette ne s'annonce
  // qu'au premier bouton pressé, et ce bouton-là est souvent le nôtre.
  const pad = currentPad();
  // Plus de manette, plus d'avance rapide : elle ne tient que par un appui
  // qu'on voit, et rien ne relâcherait un maintien devenu invisible.
  if (!pad) {
    avanceRapide = false;
    return;
  }

  // La capture vient de prendre son bouton, et ce bouton est encore enfoncé :
  // on ne conduit pas avec, sans quoi le « B » qu'on vient de lier refermerait
  // la fenêtre dans la foulée.
  if (!verrouPad.ouvert(pad.buttons.some((bouton) => bouton?.pressed))) return;

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
  // Un état continu, pas un geste : on le relit à chaque trame plutôt que d'en
  // guetter le front. Hors partie il retombe de lui-même, si bien qu'un retour
  // à la bibliothèque les manches enfoncés ne laisse rien d'armé.
  avanceRapide = libraryView.hidden && appuye(PAD_L3) && appuye(PAD_R3);
  /** Le petit bruit, partagé par toutes les branches manette. */
  const tic = (lance = false) => bruit(lance);
  const a = valider.update(appuye(BOUTON.a), maintenant).pressed;
  const b = boutons.b.update(appuye(BOUTON.b), maintenant).pressed;
  const start = boutons.start.update(appuye(BOUTON.start), maintenant).pressed;

  const enMenu = !libraryView.hidden && !document.querySelector('dialog[open]') && enMenuAnime();

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
    // Quatre menus de salon, les mêmes commandes, et l'axe des jeux qui
    // change d'un à l'autre : en colonne dans le menu animé, en rangée
    // ailleurs. Tout le reste est écrit une fois pour les quatre.
    const bouger = enCarrousel()
      ? deplacerCarr
      : enPaquet()
        ? deplacerPaq
        : enSeance()
          ? deplacerSea
          : deplacerXmb;
    /** L'axe des jeux : c'est là que la croix enjambe cinq crans. */
    const enRangee = !enXmb();
    const jeux: Direction[] = enRangee ? ['gauche', 'droite'] : ['haut', 'bas'];
    /** Celui des consoles : la croix y reste fine, les gâchettes y enjambent.
        Deux commandes pour le même saut se gêneraient. */
    const consoles: Direction[] = enRangee ? ['haut', 'bas'] : ['gauche', 'droite'];

    for (const sens of jeux) {
      const etat = croix[sens].update(dpad[sens], maintenant);
      if (etat.pressed || etat.repeat) {
        tic();
        bouger(sens, ENJAMBEE);
      }
    }
    for (const sens of consoles) {
      const etat = croix[sens].update(dpad[sens], maintenant);
      if (etat.pressed || etat.repeat) {
        tic();
        bouger(sens);
      }
    }

    const [arriere, avant] = consoles;
    const filer = rails.avant.update(!select0 && appuye(5), maintenant);
    const revenir = rails.arriere.update(!select0 && appuye(4), maintenant);
    if (filer.pressed || filer.repeat) {
      tic();
      bouger(avant, ENJAMBEE);
    }
    if (revenir.pressed || revenir.repeat) {
      tic();
      bouger(arriere, ENJAMBEE);
    }
  }


  // Pendant une partie, Select et Start ensemble ramènent à la bibliothèque.
  // Deux boutons à la fois plutôt qu'un seul : chacun d'eux sert au jeu, et
  // les deux ensemble ne se pressent jamais par hasard.
  if (libraryView.hidden) {
    // Une fenêtre ouverte pendant une partie prend la manette, comme dans la
    // bibliothèque : sans cela le panneau de triches s'ouvrirait sans qu'on
    // puisse le parcourir, et les directions partiraient au jeu derrière.
    const ouverte = fenetreDessus();
    if (ouverte) {
      // Les directions déjà relevées plus haut, et surtout pas relues ici :
      // un filtre d'appui ne rend son front qu'une fois. Le second appel
      // rendait donc toujours « rien », et le panneau ouvert en pleine partie
      // ne se parcourait pas — il s'ouvrait, se refermait, et n'obéissait à
      // rien entre les deux.
      // B referme, sauf quand Select est tenu : c'est alors le raccourci
      // d'ouverture qu'on relâche.
      conduireFenetre(ouverte, { pas, a, b: b && !select0 }, tic);
      return;
    }

    surveillerEtats(pad, maintenant);
    if (boutons.capture.update(appuye(BOUTON.select) && appuye(BOUTON.y), maintenant).pressed) {
      void prendreCapture();
    }
    // Le même raccourci qu'au menu : en pleine partie, X seul sert au jeu, d'où
    // les deux boutons.
    if (boutons.plein.update(select0 && appuye(BOUTON.x), maintenant).pressed) {
      void toggleFullscreen();
    }
    // Select et B ouvrent le panneau de triches, et le referment. Deux
    // boutons plutôt qu'un : B seul sert au jeu, et il sert beaucoup.
    if (boutons.triches.update(select0 && appuye(BOUTON.b), maintenant).pressed) {
      tic();
      if (dialogs.mod.open) dialogs.mod.close();
      else void ouvrirPanneauTriches();
    }

    const ensemble = appuye(BOUTON.select) && appuye(BOUTON.start);
    if (boutons.retour.update(ensemble, maintenant).pressed) {
      tic(true);
      void actions.stop?.();
    }
    return;
  }

  const fenetre = fenetreDessus();
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
    void jouerVue(vue);
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

    if ((sens === 'gauche' || sens === 'droite') && geste === 'compter') {
      const champ = vise as HTMLInputElement;
      const enjambee = Number(champ.step) || 1;
      const suivant = (Number(champ.value) || 0) + (sens === 'droite' ? enjambee : -enjambee);
      const bas = champ.min === '' ? -Infinity : Number(champ.min);
      const haut = champ.max === '' ? Infinity : Number(champ.max);
      champ.value = String(Math.min(haut, Math.max(bas, suivant)));
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      champ.dispatchEvent(new Event('change', { bubbles: true }));
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

/**
 * Les crans qu'une rotation vaut, une fois le seuil atteint.
 *
 * Deux rotations séparées par un silence ne s'additionnent pas : sans cela un
 * reliquat oublié ferait sauter un cran au coup d'après. Un seul compteur pour
 * les deux menus de salon : ils ne sont jamais à l'écran ensemble, et deux
 * compteurs finiraient par se partager une même rotation.
 */
function cransDeMolette(deltaY: number): number {
  const maintenant = performance.now();
  if (maintenant - molettePrecedente > 400) molette = 0;
  molettePrecedente = maintenant;

  molette += deltaY;
  const crans = Math.trunc(molette / CRAN);
  molette -= crans * CRAN;
  return crans;
}

xmbView.addEventListener(
  'wheel',
  (event) => {
    if (xmbView.hidden || libraryView.hidden) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();

    const crans = cransDeMolette(event.deltaY);
    if (crans === 0) return;

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
  // Le paquet et la séance n'ont pas de repère de lettre à eux : ils
  // empruntent celui du carrousel, qui est posé au même endroit de l'écran.
  const boite = enGrille() ? grilleLettre : enXmb() ? xmbLettre : carrLettre;
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
function initialesVue(vue: Vue): string[] {
  const liste =
    vue === 'grille'
      ? tuiles
      : vue === 'xmb'
        ? (voletsXmb[colonneXmb]?.games ?? [])
        : vue === 'paquet'
          ? (voletsPaq[consolePaq]?.games ?? [])
          : vue === 'seance'
            ? (voletsSea[consoleSea]?.games ?? [])
            : (voletsCarr[etageCarr]?.games ?? []);
  return liste.map((item) => initiale(gameLabel(item.rom.name)));
}

/**
 * Saute à la lettre suivante ou précédente.
 *
 * C'est la réponse à la recherche sans clavier : le champ de recherche demande
 * un clavier qu'on n'a pas manette en main, et cinq cents jeux ne se
 * parcourent pas case par case.
 */
function sauterLettre(vue: Vue, sens: 1 | -1): void {
  const initiales = initialesVue(vue);
  if (initiales.length === 0) return;

  const depuis =
    vue === 'grille'
      ? choisie
      : vue === 'xmb'
        ? entreeXmb
        : vue === 'paquet'
          ? cartePaq
          : vue === 'seance'
            ? lameSea
            : carteCarr;
  const vers = sautInitiale(depuis, initiales, sens);
  if (vers === depuis) return;

  if (vue === 'grille') choisir(vers);
  else if (vue === 'xmb') allerEntree(vers);
  else if (vue === 'paquet') allerCartePaq(vers);
  else if (vue === 'seance') allerLame(vers);
  else allerCarte(vers);
  montrerLettre(initiales[vers]);
}

/** Déplace la sélection de la vue en cours. */
function pousser(vue: Vue, sens: Direction): void {
  if (vue === 'grille') choisir(voisin(choisie, boitesGrille, sens));
  else if (vue === 'xmb') deplacerXmb(sens);
  else if (vue === 'paquet') deplacerPaq(sens);
  else if (vue === 'seance') deplacerSea(sens);
  else deplacerCarr(sens);
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

    if (event.key === 'F3') {
      event.preventDefault();
      if (dialogs.mod.open) dialogs.mod.close();
      else void ouvrirPanneauTriches();
      return;
    }

    for (const quoi of GESTES) {
      if (raccourcisEtat[quoi].clavier && raccourcisEtat[quoi].clavier === event.key) {
        event.preventDefault();
        faireLeGeste(quoi);
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
    void jouerVue(vue);
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
/** Le sien pour le carrousel : les deux vues ne sont jamais montrées ensemble,
 *  mais chacune se mesure sur sa propre hauteur. */
let echelleCarr = 1;

function poserEchelle(): void {
  echelleXmb = echelle(xmbView.clientHeight);
  xmbView.style.setProperty('--ech', String(echelleXmb));
  echelleCarr = echelle(carrView.clientHeight);
  carrView.style.setProperty('--ech', String(echelleCarr));
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

/**
 * Ce qu'on inscrit dans la pastille d'un volet.
 *
 * Les favoris portent une étoile plutôt que des initiales : c'est le seul
 * volet qu'on ne reconnaît pas à sa console. La galerie et « Reprendre » de
 * même — ce ne sont pas des machines.
 */
function symboleVolet(shelf: Shelf): string {
  if (shelf.key === FAVORIS) return '★';
  if (shelf.key === GALERIE) return '📷';
  if (shelf.key === REPRENDRE) return '▶';
  return initiales(shelf.label);
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
    rond.textContent = symboleVolet(shelf);

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

/**
 * Ce qu'on dit d'un jeu sous son titre.
 *
 * Trois volets, trois réponses : dans la galerie c'est la date de la capture,
 * dans « Reprendre » la dernière fois et le temps passé, ailleurs l'émulateur
 * et la taille. Écrite une fois pour les deux menus de salon — la même ligne y
 * répond à la même question, et deux copies finiraient par se contredire.
 */
function detailJeu(shelf: Shelf, item: Playable, rang: number): string {
  if (shelf.key === GALERIE) {
    const capture = captures[rang];
    return capture?.taken
      ? new Date(capture.taken * 1000).toLocaleString(localeCourante(), {
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        })
      : t('capture');
  }

  if (shelf.key === REPRENDRE) {
    // Ici on veut savoir quand et combien, pas avec quel émulateur.
    const vu = detailRecent(item.rom.path);
    return vu
      ? `${formatWhen(vu.played, Math.floor(Date.now() / 1000), localeCourante())} · ${formatPlaytime(
          vu.seconds,
          localeCourante(),
          t('moins d’une minute'),
        )}`
      : '';
  }

  const cœur = effectiveCore(item.rom, item.cores, chosenCore, shelf.preferred);
  return `${cœur?.label ?? t('aucun émulateur')} · ${humanSize(item.rom.size)}`;
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
    detail.textContent = detailJeu(shelf, item, rang);

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
  if (xmbView.hidden && carrView.hidden && paqView.hidden && seaView.hidden) return;
  const maintenant = new Date();
  const heure = maintenant.toLocaleString(localeCourante(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  xmbHeure.textContent = heure;
  carrHeure.textContent = heure;
  paqHeure.textContent = heure;
  seaHeure.textContent = heure;
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
  replacerMenus();
});

/**
 * Remet les menus de salon à l'échelle, et replace ce qu'elle décale.
 *
 * Poser l'échelle ne suffit pas : les décalages des pistes et la position de
 * chaque jaquette sont calculés en pixels, donc à partir d'elle. Changer l'une
 * sans refaire les autres laisse la sélection à côté de son repère — et dans
 * le carrousel, les jaquettes empilées les unes sur les autres.
 */
function replacerMenus(): void {
  poserEchelle();
  if (!xmbView.hidden) placerXmb();
  if (!carrView.hidden) placerCarr();
  // Le paquet et la séance replacent tout à chaque trame : l'échelle suffit,
  // la boucle fera le reste au seizième de seconde près.
  if (!paqView.hidden) poserEchellePaq();
  if (!seaView.hidden) poserEchelleSea();
}

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
  // Très loin dans le passé, pour que la première trame mesure : à zéro, la
  // mesure attend que l'horloge de la page ait dépassé deux secondes, et
  // pendant ce temps le canevas garde sa taille d'origine — trois cents pixels
  // sur cent cinquante, étirés sur tout l'écran. Un trait d'un pixel y devient
  // une plaque.
  let derniereMesure = Number.NEGATIVE_INFINITY;
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

// --- Carrousel ---------------------------------------------------------------

/**
 * La présentation en présentoir : les consoles en pile, les jaquettes de face.
 *
 * C'est le menu animé tourné d'un quart. Rien n'y défile non plus : la pile
 * des consoles est translatée sous un repère fixe, et les jaquettes viennent à
 * la sélection, qui ne bouge jamais du milieu de l'écran.
 *
 * Deux choses changent, et elles suffisent à en faire autre chose. Les axes
 * d'abord — les jeux se parcourent de gauche à droite, les consoles de haut en
 * bas, l'inverse du menu animé. Le relief ensuite : les voisines sont
 * réellement tournées et reculées dans l'espace, si bien qu'on voit d'un coup
 * d'œil laquelle serait lancée, sans avoir à chercher un liseré.
 */

/**
 * Hauteur d'une plaque de console, largeur d'une jaquette, et à quel rang de
 * la pile se tient la console en cours.
 *
 * Les deux premières valeurs doivent suivre la feuille de style : c'est d'elles
 * que se déduisent le décalage de la pile et la place de chaque jaquette.
 *
 * L'ancre est à deux : la console en cours a deux voisines au-dessus d'elle,
 * assez pour qu'on voie d'où l'on vient, assez peu pour que la pile ait de la
 * place sous elle.
 */
const CARR = { plaque: 46, carte: 200, ancre: 2 };

/** Les volets tels que le carrousel les montre. */
let voletsCarr: Shelf[] = [];
/** La console en cours, et le jeu en cours dans cette console. */
let etageCarr = 0;
let carteCarr = 0;
/** Le rang retenu pour chaque console : on y revient là où on l'avait laissée. */
const rangsCarr = new Map<string, number>();
/** Les jaquettes construites, dans l'ordre des jeux. */
let cartesCarr: HTMLElement[] = [];
/** Celles qui sont posées en ce moment, et qu'il faudra donc retirer. */
const poseesCarr = new Set<number>();

/** Vrai quand la bibliothèque s'affiche en carrousel. */
function enCarrousel(): boolean {
  return menuActuel() === 'carrousel';
}

/** Vrai quand l'une des présentations de salon est à l'écran. */
function enMenuAnime(): boolean {
  return enXmb() || enCarrousel() || enPaquet() || enSeance();
}

/** Redessine la pile des consoles. */
function renderConsolesCarr(): void {
  carrConsoles.replaceChildren();

  for (const [rang, shelf] of voletsCarr.entries()) {
    const plaque = document.createElement('button');
    plaque.type = 'button';
    plaque.className = 'carr-console';
    plaque.title = `${t(shelf.label)} — ${plural(shelf.games.length, 'jeu', 'jeux')}`;

    const carre = document.createElement('span');
    carre.className = 'plaque';
    carre.textContent = symboleVolet(shelf);

    const etiquette = document.createElement('span');
    etiquette.className = 'etiquette';
    etiquette.textContent = t(shelf.label);

    plaque.append(carre, etiquette);
    // Le même cran qu'à la manette : choisir une console d'un clic est le même
    // geste, et le silence donnait l'impression que le clic n'avait pas porté.
    plaque.addEventListener('click', () => {
      if (rang !== etageCarr && sonsVoulus()) ticDeplacement();
      allerEtage(rang);
    });
    carrConsoles.append(plaque);
  }
}

/**
 * Construit les jaquettes de la console en cours.
 *
 * Toutes sont bâties, aucune n'est posée : c'est `placerCarr` qui montre celles
 * du voisinage. Six cents jaquettes affichées d'un coup, ce seraient six cents
 * images demandées au serveur pour en montrer treize — et l'observateur qui les
 * guette ne voit rien tant qu'elles sont retirées de la mise en page.
 */
/**
 * Resserre le liseré de la sélection sur l'image plutôt que sur la case.
 *
 * Une jaquette recadrée à la main est montrée entière, et laisse donc des
 * bandes vides quand sa forme ne suit pas celle de la case. On les mesure une
 * fois, au chargement de l'image, et le CSS s'en sert pour poser le liseré là
 * où la jaquette s'arrête vraiment.
 */
function resserrerLisere(boite: HTMLElement, image: HTMLImageElement): void {
  if (!image.classList.contains('recadree') || image.naturalHeight === 0) {
    boite.style.removeProperty('--bande-x');
    boite.style.removeProperty('--bande-y');
    return;
  }
  const { x, y } = bandes(image.naturalWidth / image.naturalHeight);
  boite.style.setProperty('--bande-x', `${(x * 100).toFixed(3)}%`);
  boite.style.setProperty('--bande-y', `${(y * 100).toFixed(3)}%`);
}

function renderCartesCarr(): void {
  carrCartes.replaceChildren();
  cartesCarr = [];
  poseesCarr.clear();

  const shelf = voletsCarr[etageCarr];
  if (!shelf) return;

  for (const [rang, item] of shelf.games.entries()) {
    const carte = document.createElement('button');
    carte.type = 'button';
    carte.className = 'carr-carte';
    carte.title = item.rom.path;
    carte.hidden = true;

    const boite = document.createElement('span');
    boite.className = 'boite';

    const marque = document.createElement('span');
    marque.className = 'initiale';
    marque.textContent = item.rom.name.slice(0, 1).toUpperCase();
    boite.append(marque);

    if (shelf.key === GALERIE) {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.className = 'vue';
      image.src = captures[rang]?.data ?? '';
      image.addEventListener('load', () => {
        marque.hidden = true;
      });
      boite.append(image);
    } else if (jaquettesVoulues()) {
      const jaquette = document.createElement('img');
      jaquette.alt = '';
      jaquette.loading = 'lazy';
      jaquette.dataset.console = item.rom.folder;
      jaquette.dataset.jeu = item.rom.name;
      jaquette.dataset.chemin = item.rom.path;
      jaquette.addEventListener('load', () => {
        marque.hidden = true;
        resserrerLisere(boite, jaquette);
      });
      boite.append(jaquette);
      regarderJaquette(jaquette);
    }

    if (estFavori(item.rom.path)) {
      const etoile = document.createElement('span');
      etoile.className = 'etoile';
      etoile.textContent = '★';
      etoile.title = t('Favori');
      boite.append(etoile);
    }

    carte.append(boite);
    carte.addEventListener('click', () => {
      if (rang === carteCarr) {
        if (sonsVoulus()) ticValidation();
        void jouerCarr();
      } else {
        if (sonsVoulus()) ticDeplacement();
        allerCarte(rang);
      }
    });
    carte.addEventListener('contextmenu', (event) => {
      allerCarte(rang);
      ouvrirContextuel(event, item);
    });

    cartesCarr.push(carte);
    carrCartes.append(carte);
  }
}

/**
 * Fait tourner le présentoir jusqu'à la sélection.
 *
 * Seul le voisinage est touché : treize jaquettes replacées par pas, et non six
 * cents. Une jaquette qui sort de ce voisinage est retirée de la mise en page,
 * ce qui empêche l'observateur d'aller chercher son image — c'est ce qui permet
 * de tenir une console de six cents jeux sans rien demander au réseau.
 */
function placerCarr(): void {
  const shelf = voletsCarr[etageCarr];

  const plaques = [...carrConsoles.children] as HTMLElement[];
  for (const [rang, plaque] of plaques.entries()) {
    plaque.setAttribute('aria-selected', String(rang === etageCarr));
  }
  // La console en cours vient se placer sous deux autres, en haut de la pile.
  carrConsoles.style.transform = `translateY(${
    (CARR.ancre - etageCarr) * CARR.plaque * echelleCarr
  }px)`;

  const jeux = shelf?.games ?? [];
  const large = CARR.carte * echelleCarr;
  const voulus = fenetre(carteCarr, jeux.length);
  const garder = new Set(voulus);

  for (const rang of [...poseesCarr]) {
    if (garder.has(rang)) continue;
    const partie = cartesCarr[rang];
    if (partie) partie.hidden = true;
    poseesCarr.delete(rang);
  }

  for (const rang of voulus) {
    const carte = cartesCarr[rang];
    const ou = place(rang - carteCarr);
    if (!carte || !ou) continue;

    carte.hidden = false;
    poseesCarr.add(rang);
    carte.setAttribute('aria-selected', String(rang === carteCarr));
    carte.style.transform =
      `translate3d(${ou.x * large}px, 0, ${ou.z * large}px)` +
      ` rotateY(${ou.rotation}deg) scale(${ou.echelle})`;
    carte.style.opacity = String(ou.opacite);
    carte.style.zIndex = String(ou.plan);
    // Le rang de réserve ne se voit pas : il ne doit pas se cliquer non plus.
    // Un bouton invisible qui répond au clic est un piège, pas une commande.
    carte.style.pointerEvents = ou.opacite === 0 ? 'none' : '';
  }

  const item = jeux[carteCarr];
  const galerie = shelf?.key === GALERIE;

  carrConsole.textContent = shelf ? t(shelf.label) : '—';
  carrTitre.textContent = item ? gameLabel(item.rom.name) : '';
  carrDetail.textContent = shelf && item ? detailJeu(shelf, item, carteCarr) : '';

  const quoi = galerie ? (['capture', 'captures'] as const) : (['jeu', 'jeux'] as const);
  carrPied.textContent = shelf
    ? `${plural(shelf.games.length, quoi[0], quoi[1])} · ${dit(
        '{0} sur {1}',
        carteCarr + 1,
        shelf.games.length,
      )}${item && !galerie ? ` · ${item.rom.extension}` : ''}`
    : '';
}

/** Change de console, en retrouvant le jeu où on l'avait laissé. */
function allerEtage(rang: number): void {
  const precedente = voletsCarr[etageCarr];
  if (precedente) rangsCarr.set(precedente.key, carteCarr);

  etageCarr = step(rang, voletsCarr.length, 0);
  const suivante = voletsCarr[etageCarr];
  carteCarr = suivante
    ? Math.min(rangsCarr.get(suivante.key) ?? 0, Math.max(0, suivante.games.length - 1))
    : 0;

  renderCartesCarr();
  placerCarr();
}

/** Fait tourner le carrousel jusqu'à un jeu de la console en cours. */
function allerCarte(rang: number): void {
  const shelf = voletsCarr[etageCarr];
  carteCarr = step(rang, shelf?.games.length ?? 0, 0);
  placerCarr();
}

/**
 * Un pas dans le carrousel.
 *
 * Les axes sont l'inverse de ceux du menu animé : les jeux se parcourent de
 * gauche à droite — c'est le sens du présentoir — et les consoles de haut en
 * bas, c'est-à-dire dans le sens de leur pile.
 */
function deplacerCarr(sens: Direction, pas = 1): void {
  const shelf = voletsCarr[etageCarr];
  if (sens === 'haut' || sens === 'bas') {
    allerEtage(step(etageCarr, voletsCarr.length, sens === 'bas' ? pas : -pas));
  } else {
    allerCarte(step(carteCarr, shelf?.games.length ?? 0, sens === 'droite' ? pas : -pas));
  }
}

/** Lance la jaquette qui est de face. */
async function jouerCarr(): Promise<void> {
  const shelf = voletsCarr[etageCarr];
  const item = shelf?.games[carteCarr];
  if (!shelf || !item) return;

  // Dans la galerie, valider ouvre la galerie : il n'y a rien à lancer.
  if (shelf.key === GALERIE) {
    await ouvrirGalerie();
    return;
  }
  const cœur = effectiveCore(item.rom, item.cores, chosenCore, shelf.preferred);
  if (cœur) await play(cœur, item.rom);
}

/** Dessine tout le carrousel à partir des volets déjà classés. */
function renderCarrousel(shelves: Shelf[]): void {
  // On retient la console d'avant pour y revenir : mettre un jeu en favori
  // insère un volet en tête, et la sélection glisserait alors d'un cran.
  const avant = voletsCarr[etageCarr]?.key;

  voletsCarr = shelves;
  const retrouve = avant === undefined ? -1 : shelves.findIndex((shelf) => shelf.key === avant);
  if (retrouve >= 0) etageCarr = retrouve;
  etageCarr = step(etageCarr, shelves.length, 0);
  const shelf = shelves[etageCarr];
  carteCarr = step(carteCarr, shelf?.games.length ?? 0, 0);

  poserEchelle();
  if (musiqueVoulue()) demarrerMusique();
  renderConsolesCarr();
  renderCartesCarr();
  placerCarr();
  poserHeure();
  animerPoussiere();
}

/** Range le carrousel : plus de jaquettes, plus de sélection, plus de fond. */
function viderCarrousel(): void {
  arreterMusique();
  carrView.hidden = true;
  carrConsoles.replaceChildren();
  carrCartes.replaceChildren();
  cartesCarr = [];
  poseesCarr.clear();
  voletsCarr = [];
}

/**
 * La molette dans le carrousel.
 *
 * Au-dessus de la pile des consoles elle change de console ; partout ailleurs
 * elle fait tourner le présentoir. C'est la règle du menu animé, sur l'autre
 * axe : la molette agit sur ce que l'on survole.
 */
carrView.addEventListener(
  'wheel',
  (event) => {
    if (carrView.hidden || libraryView.hidden) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();

    const crans = cransDeMolette(event.deltaY);
    if (crans === 0) return;

    const pile = carrPile.getBoundingClientRect();
    const surLaPile = event.clientX >= pile.left && event.clientX <= pile.right;
    const sens: Direction = surLaPile
      ? crans > 0
        ? 'bas'
        : 'haut'
      : crans > 0
        ? 'droite'
        : 'gauche';

    // Jamais plus de huit crans d'un coup : une roulette lancée traverserait
    // la console entière, et il faudrait revenir.
    for (let reste = Math.min(Math.abs(crans), 8); reste > 0; reste -= 1) {
      deplacerCarr(sens);
    }
    // Le même bruit qu'à la manette : c'est le même déplacement.
    bruit();
  },
  { passive: false },
);

/**
 * La poussière monte tant qu'on la regarde, et pas une trame de plus.
 *
 * Même règle que les rubans du menu animé : une boucle qui tournerait pendant
 * la partie volerait des trames au jeu, et sur un portable elle viderait la
 * batterie devant un menu fermé.
 */
let poussiereEnCours = false;

function animerPoussiere(): void {
  if (poussiereEnCours) return;
  const contexte = carrFond.getContext('2d');
  if (!contexte) return;

  poussiereEnCours = true;
  let encre = encreDuFond();
  // Très loin dans le passé, pour que la première trame mesure : à zéro, la
  // mesure attend que l'horloge de la page ait dépassé deux secondes, et
  // pendant ce temps le canevas garde sa taille d'origine — trois cents pixels
  // sur cent cinquante, étirés sur tout l'écran. Un trait d'un pixel y devient
  // une plaque.
  let derniereMesure = Number.NEGATIVE_INFINITY;
  let dernierDessin = 0;

  const trame = (temps: number): void => {
    if (carrView.hidden || libraryView.hidden) {
      poussiereEnCours = false;
      return;
    }

    // Trente images par seconde suffisent : le grain le plus rapide met une
    // demi-minute à traverser l'écran.
    if (temps - dernierDessin < 32) {
      requestAnimationFrame(trame);
      return;
    }
    dernierDessin = temps;

    // Le canevas est redimensionné et la couleur relue deux fois par seconde :
    // les lire à chaque trame obligerait le navigateur à recalculer la mise en
    // page pour des valeurs qui ne bougent pas.
    if (temps - derniereMesure > 500) {
      derniereMesure = temps;
      encre = encreDuFond();
      const largeur = carrView.clientWidth;
      const hauteur = carrView.clientHeight;
      if (carrFond.width !== largeur || carrFond.height !== hauteur) {
        carrFond.width = largeur;
        carrFond.height = hauteur;
      }
    }

    dessinerPoussiere(contexte, carrFond.width, carrFond.height, temps / 1000, encre);
    requestAnimationFrame(trame);
  };

  requestAnimationFrame(trame);
}

// --- Triches ----------------------------------------------------------------

/**
 * Les triches : celles qu'on télécharge, celles qu'on allume, celles qu'on
 * trouve soi-même.
 *
 * Deux panneaux, deux moments. Celui de la bibliothèque cherche les fiches que
 * le projet libretro publie et pose sur le disque celles qu'on lui désigne ;
 * il ne télécharge rien tout seul. Celui qu'on ouvre en pleine partie allume
 * ce qui est posé, et sait chercher une valeur dans la mémoire de la console
 * quand aucune fiche n'existe — ce qui est le cas le plus fréquent dès qu'on
 * sort des jeux connus.
 *
 * Ce que ce code ne fait jamais : deviner. Une fiche n'est proposée que si elle
 * va exactement au jeu — [`fichesPour`] s'en assure — et une valeur n'est
 * écrite qu'à une adresse relevée dans la mémoire de ce cœur-ci, jamais tapée
 * au clavier. Entre les deux, le cœur refuse encore ce qui déborde.
 */

/** Un jeu de la bibliothèque et les fiches qui lui vont. */
interface Trouvaille {
  /** Le dossier de triches chez libretro. */
  readonly systeme: string;
  /** Le nom du fichier, celui sur lequel se fait le rapprochement. */
  readonly jeu: string;
  /** Le volet où il se range, pour l'afficher. */
  readonly console: string;
  /** Les fiches qui lui vont, de la plus sûre à la moins sûre. */
  readonly fiches: string[];
}

let trouvailles: Trouvaille[] = [];
/** Les fiches déjà posées sur le disque, console par console. */
let fichesPosees: Record<string, string[]> = {};

/**
 * Le dossier de triches qui répond à un dossier de ROMs.
 *
 * Le projet libretro emploie le même vocabulaire pour ses vignettes et pour ses
 * triches : « Nintendo - Game Boy », « Sega - 32X ». EvaChi sait déjà le
 * traduire, et s'en sert deux fois.
 */
function systemeDeTriches(dossier: string, connus: readonly string[]): string | null {
  for (const nom of thumbnailFolders(dossier)) {
    if (connus.includes(nom)) return nom;
  }
  return null;
}

/** Ouvre le panneau des fiches, avec ce qu'on sait déjà. */
async function ouvrirPanneauFiches(): Promise<void> {
  openDialog(dialogs.triches);
  try {
    fichesPosees = await trichesPosees();
  } catch {
    fichesPosees = {};
  }
  if (trouvailles.length === 0) trichesEtat.textContent = '';
  renderTrouvailles();
}

/**
 * Cherche, pour chaque jeu de la bibliothèque, s'il existe une fiche.
 *
 * L'inventaire du dépôt descend une fois puis reste sur le disque : une
 * bibliothèque entière ne coûte qu'une demande au réseau. Ce qu'on en retient,
 * en revanche, est passé au crible du rapprochement strict — c'est là que la
 * plupart des fiches approchantes tombent, et c'est voulu.
 */
async function scannerTriches(): Promise<void> {
  trichesScan.disabled = true;
  trichesEtat.textContent = t('Recherche en cours…');

  try {
    const dossiers = [...new Set(games.map((rom) => rom.folder))].filter(Boolean);
    const candidats = [...new Set(dossiers.flatMap((dossier) => thumbnailFolders(dossier)))];
    const catalogue = await trichesCatalogue(candidats);
    const connus = Object.keys(catalogue);

    trouvailles = [];
    for (const rom of games) {
      const systeme = systemeDeTriches(rom.folder, connus);
      if (!systeme) continue;
      const fiches = fichesPour(rom.name, catalogue[systeme] ?? []);
      if (fiches.length === 0) continue;
      trouvailles.push({ systeme, jeu: rom.name, console: folderLabel(rom.folder), fiches });
    }

    fichesPosees = await trichesPosees();
    trichesEtat.textContent = dit(
      '{0} jeux sur {1} ont une fiche',
      trouvailles.length,
      games.length,
    );
  } catch (error) {
    trichesEtat.textContent = reason(error);
  } finally {
    trichesScan.disabled = false;
    renderTrouvailles();
  }
}

/** Vrai si toutes les fiches de ce jeu sont déjà sur le disque. */
function dejaPosee(trouvaille: Trouvaille): boolean {
  const posees = fichesPosees[trouvaille.systeme] ?? [];
  return trouvaille.fiches.every((fiche) => posees.includes(fiche));
}

/** Dessine la liste des jeux qui ont une fiche. */
function renderTrouvailles(): void {
  trichesListe.replaceChildren();

  for (const [rang, trouvaille] of trouvailles.entries()) {
    const ligne = document.createElement('label');

    const case_ = document.createElement('input');
    case_.type = 'checkbox';
    case_.dataset.rang = String(rang);
    case_.checked = dejaPosee(trouvaille);

    const nom = document.createElement('span');
    nom.textContent = gameLabel(trouvaille.jeu);
    if (case_.checked) nom.className = 'posee';

    const ou = document.createElement('span');
    ou.className = 'console';
    ou.textContent = trouvaille.console;

    ligne.append(case_, nom, ou);
    trichesListe.append(ligne);
  }

  const rien = trouvailles.length === 0;
  trichesTout.disabled = rien;
  trichesAppliquer.disabled = rien;
}

/** Pose ce qui est coché, retire ce qui ne l'est plus. */
async function appliquerTriches(): Promise<void> {
  const cases = [...trichesListe.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  trichesAppliquer.disabled = true;
  trichesEtat.textContent = t('Recherche en cours…');

  let posees = 0;
  let retirees = 0;
  const plaintes: string[] = [];

  for (const case_ of cases) {
    const trouvaille = trouvailles[Number(case_.dataset.rang)];
    if (!trouvaille) continue;
    const deja = dejaPosee(trouvaille);

    try {
      if (case_.checked && !deja) {
        const manques = await trichesInstaller(trouvaille.systeme, trouvaille.fiches);
        plaintes.push(...manques);
        posees += trouvaille.fiches.length - manques.length;
      } else if (!case_.checked && deja) {
        for (const fiche of trouvaille.fiches) {
          await trichesRetirer(trouvaille.systeme, fiche);
          retirees += 1;
        }
      }
    } catch (error) {
      plaintes.push(reason(error));
    }
  }

  fichesPosees = await trichesPosees();
  renderTrouvailles();
  trichesAppliquer.disabled = trouvailles.length === 0;
  trichesEtat.textContent = dit('{0} fiches posées, {1} retirées', posees, retirees);
  for (const plainte of plaintes.slice(0, 5)) log(plainte, 'err');
}

trichesScan.addEventListener('click', () => void scannerTriches());
trichesAppliquer.addEventListener('click', () => void appliquerTriches());
trichesTout.addEventListener('click', () => {
  const cases = [...trichesListe.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  const tout = cases.some((case_) => !case_.checked);
  for (const case_ of cases) case_.checked = tout;
});

// --- Le panneau qu'on ouvre en jeu -------------------------------------------

/** Les triches lisibles pour le jeu en cours. */
let trichesDuJeu: Triche[] = [];
/** Celles qui sont allumées, par leur code. */
let allumees = new Set<string>();
/** Les valeurs qu'on maintient, trouvées par la recherche. */
let figees: Poke[] = [];
/** La taille de la RAM que le cœur ouvre, zéro quand il la garde pour lui. */
let ramOuverte = 0;

/**
 * L'état du jeu avant qu'aucune triche n'ait été posée.
 *
 * Gardé en mémoire, et nulle part ailleurs : il ne doit toucher ni la
 * sauvegarde rapide ni les emplacements, qui appartiennent à l'utilisateur.
 * C'est le filet — si une triche abîme la partie, on revient à l'instant
 * d'avant sans avoir rien perdu.
 */
let etatAvantTriches: Uint8Array | null = null;

/** Oublie tout ce qui touchait au jeu précédent. */
function oublierTriches(): void {
  trichesDuJeu = [];
  allumees = new Set();
  figees = [];
  etatAvantTriches = null;
  ramOuverte = 0;
  releveAvant = null;
  candidats = [];
}

/** Ouvre le panneau de triches sur le jeu en cours. */
async function ouvrirPanneauTriches(): Promise<void> {
  if (!jeuEnCours || !core) return;

  if (trichesDuJeu.length === 0) {
    try {
      fichesPosees = await trichesPosees();
      const systeme = systemeDeTriches(jeuEnCours.folder, Object.keys(fichesPosees));
      if (systeme) {
        for (const fiche of fichesPour(jeuEnCours.name, fichesPosees[systeme] ?? [])) {
          trichesDuJeu.push(...lireFiche(await trichesContenu(systeme, fiche)));
        }
      }
    } catch (error) {
      log(reason(error), 'err');
    }
  }

  renderPanneauTriches();
  renderChercheur();
  openDialog(dialogs.mod);
}

/** Dessine la liste des triches du jeu. */
function renderPanneauTriches(): void {
  modFiches.replaceChildren();

  if (trichesDuJeu.length === 0) {
    const rien = document.createElement('p');
    rien.className = 'hint-text';
    rien.textContent = t(
      'Aucune fiche pour ce jeu. Le panneau « Triches… » du menu Émulation en cherche une ; à défaut, la recherche de valeurs marche sur n’importe quel jeu.',
    );
    modFiches.append(rien);
    return;
  }

  for (const triche of trichesDuJeu) {
    const ligne = document.createElement('button');
    ligne.type = 'button';
    ligne.className = 'mod-triche';
    ligne.setAttribute('aria-pressed', String(allumees.has(triche.code)));
    ligne.title = triche.code;

    const voyant = document.createElement('span');
    voyant.className = 'voyant';

    const nom = document.createElement('span');
    nom.className = 'nom';
    nom.textContent = triche.nom;

    ligne.append(voyant, nom);
    ligne.addEventListener('click', () => {
      if (allumees.has(triche.code)) allumees.delete(triche.code);
      else allumees.add(triche.code);
      ligne.setAttribute('aria-pressed', String(allumees.has(triche.code)));
      void appliquerConsignes();
    });
    modFiches.append(ligne);
  }
}

/**
 * Envoie au cœur ce qui est allumé.
 *
 * Tout part d'un coup, à chaque changement : le cœur oublie les précédentes
 * puis reprend les nouvelles. Décocher arrête donc l'écriture à l'instant, ce
 * qui est la seule chose qui compte quand une triche a mal tourné.
 *
 * Et avant la toute première, on met la partie de côté. Une triche peut abîmer
 * ce qui est en mémoire — pas la sauvegarde sur le disque, à laquelle rien ici
 * ne touche, mais la partie en cours, et personne n'a envie de la refaire.
 */
async function appliquerConsignes(): Promise<void> {
  if (!core) return;

  const rien = allumees.size === 0 && figees.length === 0;
  if (!rien && !etatAvantTriches) {
    try {
      etatAvantTriches = await core.saveState();
      log(t('Partie mise de côté avant la première triche.'), 'ok');
    } catch {
      // Un cœur qui ne sait pas sauver son état ne doit pas empêcher de
      // tricher ; on le dit en ne proposant pas le retour en arrière.
      etatAvantTriches = null;
    }
  }

  try {
    const etat = await poserTriches({ codes: [...allumees], pokes: figees });
    ramOuverte = etat.ram;
    if (etat.retenus < figees.length) {
      log(dit('{0} valeurs écartées : hors de la mémoire de ce jeu', figees.length - etat.retenus), 'err');
    }
  } catch (error) {
    log(reason(error), 'err');
  }
  renderChercheur();
}

// --- La recherche d'une valeur ------------------------------------------------

/** Le dernier relevé de la mémoire, pour comparer au suivant. */
let releveAvant: Uint8Array | null = null;
/** Les adresses qui tiennent encore. */
let candidats: number[] = [];

function tailleChoisie(): Taille {
  const brut = Number(modTaille.value);
  return brut === 2 || brut === 4 ? brut : 1;
}

/** La valeur tapée, ou rien quand le champ est vide. */
function valeurTapee(): number | null {
  const brut = modValeur.value.trim();
  if (!brut) return null;
  const nombre = Number(brut);
  return Number.isFinite(nombre) ? borner(nombre, tailleChoisie()) : null;
}

/** Relève toute la mémoire de travail. */
async function relever(): Promise<Uint8Array | null> {
  try {
    return await lireMemoire(0, 0xffff_ffff);
  } catch (error) {
    log(reason(error), 'err');
    return null;
  }
}

/** Le premier tri : tout, ou ce qui vaut le chiffre donné. */
async function chercherDabord(): Promise<void> {
  const releve = await relever();
  if (!releve) return;
  ramOuverte = releve.length;

  releveAvant = releve;
  candidats = premierTri(releve, tailleChoisie(), valeurTapee());
  renderChercheur();
}

/** Les tris suivants : ce qui reste après une nouvelle question. */
async function affiner(question: Question): Promise<void> {
  if (!releveAvant) {
    await chercherDabord();
    return;
  }
  const releve = await relever();
  if (!releve) return;

  candidats = trier(releveAvant, releve, candidats, tailleChoisie(), question, valeurTapee());
  releveAvant = releve;
  renderChercheur();
}

/** Fige une adresse à la valeur tapée, ou la libère si elle l'était déjà. */
function basculerFigee(adresse: number): void {
  const taille = tailleChoisie();
  const deja = figees.findIndex((poke) => poke.adresse === adresse);
  if (deja >= 0) {
    figees = figees.filter((_, rang) => rang !== deja);
  } else {
    const voulue = valeurTapee();
    const actuelle = releveAvant ? (montrer(releveAvant, [adresse], taille)[0]?.valeur ?? 0) : 0;
    figees = [...figees, { adresse, taille, valeur: voulue ?? actuelle }];
  }
  renderChercheur();
  void appliquerConsignes();
}

/** Dessine l'état de la recherche. */
function renderChercheur(): void {
  modAdresses.replaceChildren();

  // Un cœur n'est pas tenu d'ouvrir sa mémoire, et plusieurs ne le font pas.
  // Le dire vaut mieux que laisser chercher dans le vide.
  const ferme = ramOuverte === 0 && releveAvant === null;
  for (const bouton of [modPremier, modReprendre]) bouton.disabled = false;
  for (const bouton of modQuestions.querySelectorAll('button')) {
    bouton.disabled = releveAvant === null;
  }

  if (ferme) {
    modRestantes.textContent = '';
  } else if (releveAvant === null) {
    modRestantes.textContent = dit('{0} octets de mémoire', ramOuverte);
  } else {
    modRestantes.textContent = dit('{0} adresses possibles', candidats.length);
  }

  if (releveAvant === null) return;

  if (candidats.length > MONTRABLES) {
    const trop = document.createElement('p');
    trop.className = 'hint-text';
    trop.textContent = t('Jouez un peu, puis dites ce que la valeur a fait.');
    modAdresses.append(trop);
    return;
  }

  for (const trouvee of montrer(releveAvant, candidats, tailleChoisie())) {
    const ligne = document.createElement('button');
    ligne.type = 'button';
    const figee = figees.some((poke) => poke.adresse === trouvee.adresse);
    ligne.setAttribute('aria-pressed', String(figee));

    const adresse = document.createElement('span');
    adresse.className = 'adresse';
    adresse.textContent = `0x${trouvee.adresse.toString(16).toUpperCase().padStart(4, '0')}`;

    const quoi = document.createElement('span');
    quoi.textContent = figee ? t('Figée') : t('Figer');

    const valeur = document.createElement('span');
    valeur.className = 'valeur';
    valeur.textContent = String(trouvee.valeur);

    ligne.append(adresse, quoi, valeur);
    ligne.addEventListener('click', () => basculerFigee(trouvee.adresse));
    modAdresses.append(ligne);
  }
}

modPremier.addEventListener('click', () => void chercherDabord());
modReprendre.addEventListener('click', () => {
  releveAvant = null;
  candidats = [];
  renderChercheur();
});
modQuestions.addEventListener('click', (event) => {
  const bouton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-question]');
  if (!bouton) return;
  void affiner(bouton.dataset.question as Question);
});
modTaille.addEventListener('change', () => {
  releveAvant = null;
  candidats = [];
  renderChercheur();
});

modOnglets.addEventListener('click', (event) => {
  const bouton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-onglet]');
  if (!bouton) return;
  for (const autre of modOnglets.querySelectorAll('button')) {
    autre.setAttribute('aria-pressed', String(autre === bouton));
  }
  const fiches = bouton.dataset.onglet === 'fiches';
  modFiches.hidden = !fiches;
  modChercher.hidden = fiches;
});


/** Vrai quand la molette est passée sur l'un de ces éléments. */
function survole(event: WheelEvent, selecteur: string): boolean {
  return event.target instanceof Element && event.target.closest(selecteur) !== null;
}

/** Le sens d'un cran de molette, selon qu'il vise les jeux ou les consoles. */
function sensDeMolette(crans: number, jeux: boolean): Direction {
  if (jeux) return crans > 0 ? 'droite' : 'gauche';
  return crans > 0 ? 'bas' : 'haut';
}

// --- Le paquet ----------------------------------------------------------------

/** Vrai quand la main de cartes est à l'écran. */
function enPaquet(): boolean {
  return menuActuel() === 'paquet';
}

/**
 * Le temps d'arrêt avant qu'une jaquette soit demandée.
 *
 * Traverser une console en tenant la direction faisait demander une image par
 * jeu traversé : cinq cents requêtes dont on ne voyait aucune, et le décodage
 * de chacune volait une trame au mouvement — c'est ce qui donnait l'impression
 * que la main avançait par à-coups. Les initiales tiennent donc la place tant
 * que ça bouge, et l'on habille ce qui reste une fois posé.
 */
const ATTENTE_JAQUETTE = 170;

/** Les jaquettes qui attendent, et le compte à rebours commun. */
const jaquettesEnAttente = new Set<HTMLImageElement>();
let minuterieJaquettes = 0;

function habillerPlusTard(image: HTMLImageElement): void {
  jaquettesEnAttente.add(image);
  clearTimeout(minuterieJaquettes);
  minuterieJaquettes = window.setTimeout(() => {
    for (const attendue of [...jaquettesEnAttente]) {
      jaquettesEnAttente.delete(attendue);
      // Une carte partie entre-temps n'a plus besoin de sa jaquette.
      if (attendue.isConnected) void habiller(attendue);
    }
  }, ATTENTE_JAQUETTE);
}

/** La hauteur d'une carte, avant mise à l'échelle. */
const HAUTEUR_CARTE = 300;

/** Les volets tels que le paquet les montre. */
let voletsPaq: Shelf[] = [];
/** La console en cours, et la carte visée dans cette console. */
let consolePaq = 0;
let cartePaq = 0;
/** Le rang retenu pour chaque console : on y revient là où on l'avait laissée. */
const rangsPaq = new Map<string, number>();
/**
 * Où le poignet en est vraiment, pendant qu'il rejoint la carte visée.
 *
 * Le paquet ne saute pas d'une carte à l'autre : il tourne. La position est
 * donc un réel, que la boucle rapproche du rang visé — et non une transition,
 * qui repartirait de zéro à chaque appui et ferait hoqueter la main quand on
 * pousse la direction trois fois de suite.
 */
let poignetPaq = 0;
/** Les cartes construites, par rang : on ne rebâtit que ce qui entre et sort. */
const cartesPaq = new Map<number, HTMLElement>();
/**
 * L'échelle de la vue, relevée à l'affichage et au redimensionnement.
 *
 * Retenue, et non relue à chaque trame : lire `clientHeight` force le
 * navigateur à recalculer la mise en page, et le faire juste après avoir posé
 * quinze transformations lui fait tout refaire soixante fois par seconde. La
 * main tournait alors par saccades, d'autant plus visibles qu'on va vite.
 */
let echellePaq = 1;
/** Les rangs posés en ce moment, pour ne pas refaire la liste pour rien. */
let montreesPaq = '';

function poserEchellePaq(): void {
  echellePaq = echelle(paqView.clientHeight);
  paqView.style.setProperty('--ech', String(echellePaq));
}

/** Repose la main : plus de cartes, plus de sélection. */
function viderPaquet(): void {
  arreterMusique();
  paqView.hidden = true;
  paqMain.replaceChildren();
  cartesPaq.clear();
  voletsPaq = [];
}

/** Dessine la main à partir des volets déjà classés. */
function renderPaquet(shelves: Shelf[]): void {
  const avant = voletsPaq[consolePaq]?.key;

  voletsPaq = shelves;
  const retrouve = avant === undefined ? -1 : shelves.findIndex((shelf) => shelf.key === avant);
  if (retrouve >= 0) consolePaq = retrouve;
  consolePaq = step(consolePaq, shelves.length, 0);
  const shelf = shelves[consolePaq];
  cartePaq = step(cartePaq, shelf?.games.length ?? 0, 0);
  // La main est distribuée telle quelle : voir le poignet rejoindre sa place
  // en arrivant sur la vue donnerait l'impression d'avoir raté quelque chose.
  poignetPaq = cartePaq;

  poserEchellePaq();
  if (musiqueVoulue()) demarrerMusique();
  cartesPaq.clear();
  montreesPaq = '';
  paqMain.replaceChildren();
  renderCartes();
  ecrireLegendePaq();
  poserHeure();
  animerPaquet();
}

/**
 * Construit les cartes que la main montre, et elles seules.
 *
 * Cinq cents jaquettes demandées pour une main de quinze cartes rempliraient
 * le réseau sans que personne ne les voie. Celles qui sortent de la main sont
 * retirées, celles qui y entrent sont bâties, et les autres restent en place —
 * une carte reconstruite perdrait son image le temps de la recharger.
 */
function renderCartes(): void {
  const shelf = voletsPaq[consolePaq];
  const jeux = shelf?.games ?? [];
  const montrees = fenetrePaquet(Math.round(poignetPaq), jeux.length);

  // La main ne change que lorsqu'on franchit une carte : entre deux, rebâtir
  // la liste reviendrait à remplacer quinze nœuds pour les remettre au même
  // endroit, à chaque appui.
  const signature = `${consolePaq}:${montrees[0] ?? -1}:${montrees.length}`;
  if (signature === montreesPaq && cartesPaq.size === montrees.length) return;
  montreesPaq = signature;
  const garder = new Set(montrees);

  for (const [rang, carte] of [...cartesPaq]) {
    if (garder.has(rang)) continue;
    carte.remove();
    cartesPaq.delete(rang);
  }

  const posees: HTMLElement[] = [];
  for (const rang of montrees) {
    const item = jeux[rang];
    if (!shelf || !item) continue;
    let carte = cartesPaq.get(rang);
    if (!carte) {
      carte = construireCarte(item, rang);
      cartesPaq.set(rang, carte);
    }
    posees.push(carte);
  }
  // Toujours dans l'ordre des rangs : l'ordre du document est celui que suit
  // un lecteur d'écran, et l'empilement se règle ailleurs.
  paqMain.replaceChildren(...posees);
}

/** Une carte : la jaquette, son initiale en attendant, et l'étoile. */
function construireCarte(item: Playable, rang: number): HTMLElement {
  const carte = document.createElement('button');
  carte.type = 'button';
  carte.className = 'paq-carte';
  carte.title = item.rom.path;

  const boite = document.createElement('span');
  boite.className = 'boite';

  const marque = document.createElement('span');
  marque.className = 'initiale';
  marque.textContent = item.rom.name.slice(0, 1).toUpperCase();
  boite.append(marque);

  if (jaquettesVoulues()) {
    const jaquette = document.createElement('img');
    jaquette.alt = '';
    jaquette.dataset.console = item.rom.folder;
    jaquette.dataset.jeu = item.rom.name;
    jaquette.dataset.chemin = item.rom.path;
    jaquette.addEventListener('load', () => {
      marque.hidden = true;
    });
    boite.append(jaquette);
    habillerPlusTard(jaquette);
  }
  carte.append(boite);

  if (estFavori(item.rom.path)) {
    const etoile = document.createElement('span');
    etoile.className = 'etoile';
    etoile.textContent = '★';
    carte.append(etoile);
  }

  carte.addEventListener('click', () => {
    if (rang === cartePaq) {
      if (sonsVoulus()) ticValidation();
      void jouerPaquet();
      return;
    }
    allerCartePaq(rang);
  });

  return carte;
}

/** Pose chaque carte à sa place, à cet instant de la respiration. */
function placerPaquet(secondes: number): void {
  const total = voletsPaq[consolePaq]?.games.length ?? 0;
  if (total === 0) return;
  const hauteur = HAUTEUR_CARTE * echellePaq;

  for (const carte of mainDuPaquet(poignetPaq, total, secondes)) {
    const element = cartesPaq.get(carte.rang);
    if (!element) continue;
    element.style.transform =
      `translate(${(carte.x * hauteur).toFixed(1)}px, ${(carte.y * hauteur).toFixed(1)}px) ` +
      `rotate(${carte.angle.toFixed(2)}deg) scale(${carte.echelle.toFixed(3)})`;
    element.style.opacity = carte.opacite.toFixed(3);
    // Le rang d'empilement se compte en centièmes : la proximité est un réel,
    // et deux cartes arrondies au même entier se recouvriraient au hasard.
    element.style.zIndex = String(Math.round(carte.z * 100));
    element.setAttribute('aria-selected', String(carte.rang === cartePaq));
  }
}

/** Écrit ce que la main tient, sous les cartes. */
function ecrireLegendePaq(): void {
  const shelf = voletsPaq[consolePaq];
  const item = shelf?.games[cartePaq];
  paqConsole.textContent = shelf ? t(shelf.label) : '—';
  paqTitre.textContent = item ? gameLabel(item.rom.name) : '';
  paqDetail.textContent = shelf && item ? detailJeu(shelf, item, cartePaq) : '';
  paqPied.textContent = shelf
    ? `${plural(shelf.games.length, 'jeu', 'jeux')} · ${dit('{0} sur {1}', cartePaq + 1, shelf.games.length)}`
    : '';
}

/**
 * Fait respirer la main, et tourner le poignet.
 *
 * Une seule boucle pour les deux : la position des cartes dépend à la fois du
 * rang visé et de l'instant, et les séparer demanderait de les accorder.
 */
let paquetEnCours = false;

function animerPaquet(): void {
  if (paquetEnCours) return;
  paquetEnCours = true;
  const contexte = paqFond.getContext('2d');
  let derniere = 0;
  let encre = encreDuFond();
  // Très loin dans le passé, pour que la première trame mesure : à zéro, la
  // mesure attend que l'horloge de la page ait dépassé deux secondes, et
  // pendant ce temps le canevas garde sa taille d'origine, étirée sur tout
  // l'écran.
  let derniereMesure = Number.NEGATIVE_INFINITY;
  let dernierFond = 0;

  const trame = (temps: number): void => {
    if (paqView.hidden || libraryView.hidden) {
      paquetEnCours = false;
      return;
    }
    const ms = derniere === 0 ? 16.7 : Math.min(96, temps - derniere);
    derniere = temps;

    // Les cartes, à chaque trame : c'est le mouvement qu'on suit des yeux, et
    // un souffle rendu une fois sur deux se voit tout de suite.
    const avant = Math.round(poignetPaq);
    poignetPaq = avancer(poignetPaq, cartePaq, ms, 95, 0.002);
    // La fenêtre suit le poignet et non la carte visée : les cartes qui
    // arrivent doivent être là avant d'entrer dans le champ.
    if (Math.round(poignetPaq) !== avant) renderCartes();
    placerPaquet(temps / 1000);

    // Le fond, deux fois moins souvent : des anneaux qui dérivent d'un
    // millième de hauteur par seconde n'ont que faire de soixante images.
    if (contexte && temps - dernierFond > 33) {
      dernierFond = temps;
      if (temps - derniereMesure > 2000) {
        derniereMesure = temps;
        encre = encreDuFond();
        const largeur = paqView.clientWidth;
        const hauteur = paqView.clientHeight;
        if (paqFond.width !== largeur || paqFond.height !== hauteur) {
          paqFond.width = largeur;
          paqFond.height = hauteur;
        }
      }
      contexte.clearRect(0, 0, paqFond.width, paqFond.height);
      dessinerMoire(contexte, paqFond.width, paqFond.height, temps / 1000, encre);
    }

    requestAnimationFrame(trame);
  };
  requestAnimationFrame(trame);
}

/** Change de console, en retrouvant le jeu où on l'avait laissé. */
function allerConsolePaq(rang: number): void {
  const precedente = voletsPaq[consolePaq];
  if (precedente) rangsPaq.set(precedente.key, cartePaq);

  consolePaq = step(rang, voletsPaq.length, 0);
  const suivante = voletsPaq[consolePaq];
  cartePaq = suivante
    ? Math.min(rangsPaq.get(suivante.key) ?? 0, Math.max(0, suivante.games.length - 1))
    : 0;

  // Une console entière change : la main est jetée et redistribuée, plutôt que
  // de faire tourner le poignet sur cinq cents cartes qui ne sont plus là.
  poignetPaq = cartePaq;
  cartesPaq.clear();
  paqMain.replaceChildren();
  paqMain.classList.remove('distribue');
  void paqMain.offsetWidth;
  paqMain.classList.add('distribue');
  renderCartes();
  ecrireLegendePaq();
}

/** Va droit à une carte de la console en cours. */
function allerCartePaq(rang: number): void {
  const shelf = voletsPaq[consolePaq];
  cartePaq = step(rang, shelf?.games.length ?? 0, 0);
  renderCartes();
  ecrireLegendePaq();
}

/** Un pas de manette sur le paquet. */
function deplacerPaq(sens: Direction, pas = 1): void {
  const shelf = voletsPaq[consolePaq];
  if (sens === 'haut' || sens === 'bas') {
    allerConsolePaq(step(consolePaq, voletsPaq.length, sens === 'bas' ? pas : -pas));
    return;
  }
  allerCartePaq(step(cartePaq, shelf?.games.length ?? 0, sens === 'droite' ? pas : -pas));
}

/** Lance la carte qui est sortie du paquet. */
async function jouerPaquet(): Promise<void> {
  const shelf = voletsPaq[consolePaq];
  const item = shelf?.games[cartePaq];
  if (!shelf || !item) return;
  const cœur = effectiveCore(item.rom, item.cores, chosenCore, shelf.preferred);
  if (cœur) await play(cœur, item.rom);
}

/**
 * La molette sur le paquet.
 *
 * Ce qu'elle fait dépend de ce qu'elle survole : sur les cartes elle les fait
 * défiler, ailleurs elle change de console. Une molette qui change toujours de
 * console oblige à trouver la molette horizontale — que la plupart des souris
 * n'ont pas — pour faire la seule chose qu'on vienne y faire.
 */
paqView.addEventListener(
  'wheel',
  (event) => {
    if (paqView.hidden || libraryView.hidden) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();

    const cotes = cransDeMolette(event.deltaX);
    const crans = cotes !== 0 ? cotes : cransDeMolette(event.deltaY);
    if (crans === 0) return;

    const sens = sensDeMolette(crans, cotes !== 0 || survole(event, '.paq-carte'));
    // Jamais plus de huit crans d'un coup : une roulette lancée traverserait
    // la console entière, et il faudrait revenir.
    for (let reste = Math.min(Math.abs(crans), 8); reste > 0; reste -= 1) deplacerPaq(sens);
    bruit();
  },
  { passive: false },
);

// --- La séance ------------------------------------------------------------------

/** Vrai quand la salle de projection est à l'écran. */
function enSeance(): boolean {
  return menuActuel() === 'seance';
}

/** La largeur d'une lamelle du panier, avant mise à l'échelle. */
const LARGEUR_LAMELLE = 46;

/** Le temps qu'une vue doit rester en place avant d'être projetée. */
const AVANT_PROJECTION = 150;

let voletsSea: Shelf[] = [];
let consoleSea = 0;
let lameSea = 0;
const rangsSea = new Map<string, number>();
/** Où le panier en est vraiment, pendant qu'il tourne vers la vue visée. */
let plateauSea = 0;
/** Les lamelles construites, par rang. */
const lamellesSea = new Map<number, HTMLElement>();
/** L'échelle de la salle, relevée à l'affichage et au redimensionnement. */
let echelleSea = 1;
/** Les rangs posés en ce moment, pour ne pas refaire le panier pour rien. */
let montreesSea = '';

function poserEchelleSea(): void {
  echelleSea = echelle(seaView.clientHeight);
  seaView.style.setProperty('--ech', String(echelleSea));
}
/** Ce qui est projeté en ce moment, et le compte à rebours de la prochaine. */
let projetee = '';
let minuterieProjection = 0;

function viderSeance(): void {
  arreterMusique();
  seaView.hidden = true;
  seaPanier.replaceChildren();
  lamellesSea.clear();
  clearTimeout(minuterieProjection);
  projetee = '';
  voletsSea = [];
}

function renderSeance(shelves: Shelf[]): void {
  const avant = voletsSea[consoleSea]?.key;

  voletsSea = shelves;
  const retrouve = avant === undefined ? -1 : shelves.findIndex((shelf) => shelf.key === avant);
  if (retrouve >= 0) consoleSea = retrouve;
  consoleSea = step(consoleSea, shelves.length, 0);
  const shelf = shelves[consoleSea];
  lameSea = step(lameSea, shelf?.games.length ?? 0, 0);
  plateauSea = lameSea;

  poserEchelleSea();
  if (musiqueVoulue()) demarrerMusique();
  lamellesSea.clear();
  montreesSea = '';
  seaPanier.replaceChildren();
  renderLamelles();
  ecrireLegendeSea();
  projeter();
  poserHeure();
  animerSalle();
}

/** Construit les lamelles que le panier montre, et elles seules. */
function renderLamelles(): void {
  const shelf = voletsSea[consoleSea];
  const jeux = shelf?.games ?? [];
  const montrees = panierSeance(plateauSea, jeux.length);

  // Le panier ne change qu'au franchissement d'une lamelle ; entre deux, la
  // liste est la même et la refaire remplacerait dix-neuf nœuds pour rien.
  const signature = `${consoleSea}:${montrees[0]?.rang ?? -1}:${montrees.length}`;
  if (signature === montreesSea && lamellesSea.size === montrees.length) return;
  montreesSea = signature;
  const garder = new Set(montrees.map((vue) => vue.rang));

  for (const [rang, lamelle] of [...lamellesSea]) {
    if (garder.has(rang)) continue;
    lamelle.remove();
    lamellesSea.delete(rang);
  }

  const posees: HTMLElement[] = [];
  for (const { rang } of montrees) {
    const item = jeux[rang];
    if (!item) continue;
    let lamelle = lamellesSea.get(rang);
    if (!lamelle) {
      lamelle = construireLamelle(item, rang);
      lamellesSea.set(rang, lamelle);
    }
    posees.push(lamelle);
  }
  seaPanier.replaceChildren(...posees);
}

/** Une lamelle du panier : une vignette, et rien d'autre. */
function construireLamelle(item: Playable, rang: number): HTMLElement {
  const lamelle = document.createElement('button');
  lamelle.type = 'button';
  lamelle.className = 'sea-lamelle';
  lamelle.title = gameLabel(item.rom.name);

  const marque = document.createElement('span');
  marque.className = 'initiale';
  marque.textContent = item.rom.name.slice(0, 1).toUpperCase();
  lamelle.append(marque);

  if (jaquettesVoulues()) {
    const jaquette = document.createElement('img');
    jaquette.alt = '';
    jaquette.dataset.console = item.rom.folder;
    jaquette.dataset.jeu = item.rom.name;
    jaquette.dataset.chemin = item.rom.path;
    jaquette.addEventListener('load', () => {
      marque.hidden = true;
    });
    lamelle.append(jaquette);
    habillerPlusTard(jaquette);
  }

  lamelle.addEventListener('click', () => {
    if (rang === lameSea) {
      if (sonsVoulus()) ticValidation();
      void jouerSeance();
      return;
    }
    allerLame(rang);
  });

  return lamelle;
}

/** Pose chaque lamelle là où le panier en est. */
function placerPanier(): void {
  const total = voletsSea[consoleSea]?.games.length ?? 0;
  if (total === 0) return;
  const largeur = LARGEUR_LAMELLE * echelleSea;

  for (const vue of panierSeance(plateauSea, total)) {
    const element = lamellesSea.get(vue.rang);
    if (!element) continue;
    element.style.transform =
      `translate(${(vue.x * largeur).toFixed(1)}px, ${(vue.y * largeur).toFixed(1)}px) ` +
      `scale(${vue.echelle.toFixed(3)})`;
    element.style.opacity = vue.opacite.toFixed(3);
    element.style.zIndex = String(Math.round(vue.z * 100));
    element.setAttribute('aria-selected', String(vue.rang === lameSea));
  }
}

/**
 * Met la vue choisie dans la fenêtre du projecteur.
 *
 * La diapositive suivante est chargée en coulisses, et ne prend la place de la
 * précédente qu'une fois prête. Vider l'écran d'abord laissait une grande
 * lettre pâle sur fond sombre le temps du chargement — un éclair blanc à
 * chaque pas — et cette lettre restait par-dessus la jaquette quand elle
 * arrivait. Un projecteur ne montre jamais sa fenêtre vide : la diapositive
 * en place y reste jusqu'à ce que la suivante tombe.
 *
 * Avec un temps d'arrêt, aussi : traverser une console en tenant la direction
 * demanderait sinon cinq cents images au serveur de vignettes, dont on ne
 * verrait aucune.
 */
function projeter(): void {
  const shelf = voletsSea[consoleSea];
  const item = shelf?.games[lameSea];
  clearTimeout(minuterieProjection);
  if (!shelf || !item) return;

  // La console fait partie de la clé : deux consoles ont toutes deux un jeu
  // de rang zéro, et changer de console sans changer de rang laissait l'écran
  // sur la jaquette d'avant.
  const clef = `${shelf.key}#${lameSea}`;
  if (clef === projetee) return;
  projetee = clef;

  if (!jaquettesVoulues()) {
    montrerDiapo(null, item);
    return;
  }

  minuterieProjection = window.setTimeout(() => {
    const coulisse = new Image();
    coulisse.alt = '';
    coulisse.dataset.console = item.rom.folder;
    coulisse.dataset.jeu = item.rom.name;
    coulisse.dataset.chemin = item.rom.path;
    void habiller(coulisse).then(async () => {
      // La sélection a pu repartir pendant le chargement : une diapositive en
      // retard ne doit pas chasser celle qu'on regarde.
      if (clef !== projetee) return;
      const adresse = coulisse.getAttribute('src');
      if (!adresse) {
        montrerDiapo(null, item);
        return;
      }
      // Décodée avant d'être posée : une image posée puis décodée apparaît une
      // trame plus tard, et c'est cette trame-là qui se voit.
      try {
        await coulisse.decode();
      } catch {
        // Une jaquette qui n'arrive pas laisse simplement l'initiale.
      }
      if (clef !== projetee) return;
      montrerDiapo(coulisse, item);
    });
  }, AVANT_PROJECTION);
}

/**
 * Pose une diapositive dans la fenêtre, et la fait tomber.
 *
 * L'écran prend la forme de ce qu'il porte : une image plus large que haute
 * laissée dans un cadre de jaquette serait bordée de deux bandes éclairées, et
 * l'on verrait la lumière tomber à côté.
 */
function montrerDiapo(image: HTMLImageElement | null, item: Playable): void {
  const adresse = image?.getAttribute('src') ?? '';
  seaInitiale.textContent = item.rom.name.slice(0, 1).toUpperCase();
  seaInitiale.hidden = adresse !== '';

  if (adresse && image) {
    seaImage.src = adresse;
    seaImage.classList.add('vue');
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      seaEcran.style.setProperty(
        '--rapport',
        (image.naturalWidth / image.naturalHeight).toFixed(4),
      );
    }
  } else {
    seaImage.classList.remove('vue');
    seaImage.removeAttribute('src');
    seaEcran.style.removeProperty('--rapport');
  }

  seaBoite.classList.remove('tombe');
  void seaBoite.offsetWidth;
  seaBoite.classList.add('tombe');
}

/** Écrit sous l'écran ce qui y est projeté. */
function ecrireLegendeSea(): void {
  const shelf = voletsSea[consoleSea];
  const item = shelf?.games[lameSea];
  seaConsole.textContent = shelf ? t(shelf.label) : '—';
  seaTitre.textContent = item ? gameLabel(item.rom.name) : '';
  seaDetail.textContent = shelf && item ? detailJeu(shelf, item, lameSea) : '';
  seaPied.textContent = shelf
    ? `${plural(shelf.games.length, 'jeu', 'jeux')} · ${dit('{0} sur {1}', lameSea + 1, shelf.games.length)}`
    : '';
}

/**
 * Fait tourner le panier et vivre le faisceau.
 *
 * Le faisceau est peint, et non posé en dégradé : c'est la poussière qui le
 * rend visible, et une poussière qui ne bouge pas est une tache.
 */
let salleEnCours = false;

function animerSalle(): void {
  if (salleEnCours) return;
  const contexte = seaFaisceau.getContext('2d');
  if (!contexte) return;

  salleEnCours = true;
  let encre = encreDuFond();
  // Très loin dans le passé, pour que la première trame mesure : à zéro, la
  // mesure attend que l'horloge de la page ait dépassé deux secondes, et
  // pendant ce temps le canevas garde sa taille d'origine, étirée sur tout
  // l'écran.
  let derniereMesure = Number.NEGATIVE_INFINITY;
  let dernierDessin = 0;
  let demi = 0.2;

  const trame = (temps: number): void => {
    if (seaView.hidden || libraryView.hidden) {
      salleEnCours = false;
      return;
    }
    if (temps - dernierDessin < 32) {
      requestAnimationFrame(trame);
      return;
    }
    const ms = dernierDessin === 0 ? 16.7 : Math.min(96, temps - dernierDessin);
    dernierDessin = temps;

    if (temps - derniereMesure > 2000) {
      derniereMesure = temps;
      encre = encreDuFond();
      const largeur = seaView.clientWidth;
      const hauteur = seaView.clientHeight;
      if (seaFaisceau.width !== largeur || seaFaisceau.height !== hauteur) {
        seaFaisceau.width = largeur;
        seaFaisceau.height = hauteur;
      }
      // Le cône s'arrête aux bords de l'écran, qu'on mesure : le faisceau doit
      // porter l'image, pas déborder autour.
      if (largeur > 0) demi = seaEcran.getBoundingClientRect().width / 2 / largeur;
    }

    const avant = Math.round(plateauSea);
    plateauSea = avancer(plateauSea, lameSea, ms, 105, 0.002);
    if (Math.round(plateauSea) !== avant) renderLamelles();
    placerPanier();

    contexte.clearRect(0, 0, seaFaisceau.width, seaFaisceau.height);
    // Le moiré d'abord : c'est le mur du fond, et la lumière passe devant.
    dessinerMoire(contexte, seaFaisceau.width, seaFaisceau.height, temps / 1000, encre);
    dessinerFaisceau(contexte, seaFaisceau.width, seaFaisceau.height, temps / 1000, encre, demi);
    requestAnimationFrame(trame);
  };
  requestAnimationFrame(trame);
}

/** Change de console, en retrouvant le jeu où on l'avait laissé. */
function allerConsoleSea(rang: number): void {
  const precedente = voletsSea[consoleSea];
  if (precedente) rangsSea.set(precedente.key, lameSea);

  consoleSea = step(rang, voletsSea.length, 0);
  const suivante = voletsSea[consoleSea];
  lameSea = suivante
    ? Math.min(rangsSea.get(suivante.key) ?? 0, Math.max(0, suivante.games.length - 1))
    : 0;

  // Le panier entier est remplacé : le faire tourner jusqu'au rang du nouveau
  // jeu ferait défiler des lamelles qui n'existent plus.
  plateauSea = lameSea;
  lamellesSea.clear();
  seaPanier.replaceChildren();
  renderLamelles();
  ecrireLegendeSea();
  projeter();
}

/** Va droit à une vue du panier. */
function allerLame(rang: number): void {
  const shelf = voletsSea[consoleSea];
  lameSea = step(rang, shelf?.games.length ?? 0, 0);
  renderLamelles();
  ecrireLegendeSea();
  projeter();
}

/** Un pas de manette dans la salle. */
function deplacerSea(sens: Direction, pas = 1): void {
  const shelf = voletsSea[consoleSea];
  if (sens === 'haut' || sens === 'bas') {
    allerConsoleSea(step(consoleSea, voletsSea.length, sens === 'bas' ? pas : -pas));
    return;
  }
  allerLame(step(lameSea, shelf?.games.length ?? 0, sens === 'droite' ? pas : -pas));
}

/** Lance ce qui est projeté. */
async function jouerSeance(): Promise<void> {
  const shelf = voletsSea[consoleSea];
  const item = shelf?.games[lameSea];
  if (!shelf || !item) return;
  const cœur = effectiveCore(item.rom, item.cores, chosenCore, shelf.preferred);
  if (cœur) await play(cœur, item.rom);
}

/**
 * La molette dans la salle.
 *
 * Sur l'écran ou sur le panier, elle fait tourner le panier ; sur le reste de
 * la salle, elle change de console.
 */
seaView.addEventListener(
  'wheel',
  (event) => {
    if (seaView.hidden || libraryView.hidden) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();

    const cotes = cransDeMolette(event.deltaX);
    const crans = cotes !== 0 ? cotes : cransDeMolette(event.deltaY);
    if (crans === 0) return;

    const surJeu = survole(event, '.sea-lamelle, .sea-ecran');
    const sens = sensDeMolette(crans, cotes !== 0 || surJeu);
    for (let reste = Math.min(Math.abs(crans), 8); reste > 0; reste -= 1) deplacerSea(sens);
    bruit();
  },
  { passive: false },
);

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
/**
 * Range toutes les présentations d'un coup.
 *
 * Écrit une fois plutôt qu'à chaque branche : ajouter une vue en oubliant un
 * `vider` laissait deux présentations empilées, et c'est arrivé.
 */
function rangerLesVues(): void {
  viderGrille();
  viderXmb();
  viderCarrousel();
  viderPaquet();
  viderSeance();
}

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
  // La galerie n'existe que là où son volet sait se dessiner : le menu animé
  // et le carrousel la montrent, le paquet et la séance n'auraient qu'une
  // carte par capture, qui ne se lance pas.
  const galerie = (enXmb() || enCarrousel()) && !needle ? voletGalerie() : null;
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
    rangerLesVues();
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

  // Les six vues partagent le même classement ; seul le dessin diffère. On ne
  // dessine que celle qu'on regarde : six cents lignes construites pour rester
  // masquées coûtent exactement le même temps que six cents affichées.
  const dessinees: [() => boolean, HTMLElement, (shelves: Shelf[]) => void][] = [
    [enGrille, grilleView, renderGrille],
    [enXmb, xmbView, renderXmb],
    [enCarrousel, carrView, renderCarrousel],
    [enPaquet, paqView, renderPaquet],
    [enSeance, seaView, renderSeance],
  ];

  for (const [regarde, vue, dessiner] of dessinees) {
    if (!regarde()) continue;
    shelvesBox.hidden = true;
    rangerLesVues();
    vue.hidden = false;
    dessiner(shelves);
    return;
  }

  rangerLesVues();
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

// --- Le dépôt ---------------------------------------------------------------

/**
 * Range ce qui a été déposé, et demande ce qu'on ne peut pas deviner.
 *
 * Deux temps, et l'ordre compte. Ce qui est évident part d'abord, sans rien
 * demander : c'est le gros du tas, et personne n'a envie de valider quarante
 * fois « oui, un .nes va dans le dossier NES ». Ce qui reste — une image
 * disque qui pourrait venir de huit consoles, un jeu déjà rangé ailleurs — se
 * pose ensuite, d'un bloc, quand le travail est fait.
 *
 * @param silencieux vrai au démarrage : un dépôt vide ne doit alors rien
 *   afficher du tout, pas même une fenêtre qui dit qu'il n'y a rien à faire.
 */
async function rangerDepot(silencieux: boolean): Promise<void> {
  let attente: Depose[] = [];
  try {
    // Une commande qui répond « rien » ne doit pas casser le démarrage : on
    // prend une liste vide plutôt que de croire ce qu'on reçoit.
    attente = (await listDrops()) ?? [];
  } catch (error) {
    if (!silencieux) log(reason(error), 'err');
    return;
  }

  if (attente.length === 0) {
    if (!silencieux) {
      triQuestions.replaceChildren();
      triAppliquer.hidden = true;
      avancementTri(0, 0, t('Le dépôt est vide.'));
      openDialog(dialogs.tri);
    }
    return;
  }

  triQuestions.replaceChildren();
  triAppliquer.hidden = true;
  avancementTri(0, attente.length, '');
  openDialog(dialogs.tri);

  // La liste des consoles sert à ranger à la main ce qu'aucune extension ne
  // désigne. Demandée une fois, et seulement quand le dépôt n'est pas vide.
  if (dossiersConnus.length === 0) {
    try {
      dossiersConnus = (await knownFolders()) ?? [];
    } catch {
      // Sans elle, on ne proposera que les consoles que l'extension désigne.
    }
  }

  // Évident : une seule console possible, et rien de ce nom dans la
  // bibliothèque. Tout le reste attendra la fin.
  const evident = (depose: Depose): boolean => depose.dossiers.length === 1 && !depose.double;
  const seuls = attente.filter(evident);
  const adecider = attente.filter((depose) => !evident(depose));

  let ranges = 0;
  for (const [rang, depose] of seuls.entries()) {
    avancementTri(rang, seuls.length, depose.nom);
    try {
      await fileDrop(depose.chemin, depose.dossiers[0], 'ranger');
      ranges += 1;
    } catch (error) {
      log(reason(error), 'err');
    }
  }
  avancementTri(seuls.length, seuls.length, '');

  try {
    await sweepDrop();
  } catch {
    // Un dossier vide qui reste ne gêne personne.
  }

  if (ranges > 0) {
    log(dit('rangement : {0}', plural(ranges, 'jeu', 'jeux')), 'ok');
    await refreshLibrary();
  }

  renderQuestionsTri(adecider);

  // Rien à décider, et personne n'a rien demandé : la fenêtre se retire d'elle
  // -même, le temps qu'on voie la barre pleine. Ouverte à chaque lancement pour
  // dire « c'est fait », elle deviendrait une porte à refermer tous les matins.
  if (silencieux && adecider.length === 0) {
    setTimeout(() => dialogs.tri.close(), 1400);
  }
}

/** Avance la barre, et dit où l'on en est. */
function avancementTri(faits: number, total: number, quoi: string): void {
  const part = total > 0 ? Math.round((faits / total) * 100) : 100;
  triPart.style.width = `${part}%`;
  triEtat.textContent = total > 0 ? [dit('{0} sur {1}', faits, total), quoi].filter(Boolean).join(' · ') : quoi;
}

/**
 * Dessine ce qui reste à décider.
 *
 * Une ligne par fichier, avec le choix de la console et, pour un jeu déjà
 * rangé, ce qu'on fait du nouveau. Rien n'est coché d'avance : c'est
 * précisément parce qu'EvaChi ne sait pas choisir qu'on en est là.
 */
function renderQuestionsTri(attente: readonly Depose[]): void {
  triQuestions.replaceChildren();
  triAppliquer.hidden = attente.length === 0;
  if (attente.length === 0) return;

  for (const depose of attente) {
    const ligne = document.createElement('div');
    ligne.className = 'tri-ligne';

    const nom = document.createElement('span');
    nom.className = 'nom';
    nom.textContent = `${depose.nom} · ${humanSize(depose.taille)}`;
    ligne.append(nom);

    if (depose.double) {
      const deja = document.createElement('span');
      deja.className = 'deja';
      deja.textContent = dit('Déjà dans la bibliothèque : {0}', depose.double);
      ligne.append(deja);
    }

    const choix = document.createElement('div');
    choix.className = 'choix';

    // Les consoles que l'extension désigne ; toutes quand elle ne dit rien,
    // parce qu'un fichier qu'on ne reconnaît pas doit quand même pouvoir être
    // rangé à la main.
    const ou = document.createElement('select');
    const laisser = document.createElement('option');
    laisser.value = '';
    laisser.textContent = t('Laisser dans le dépôt');
    ou.append(laisser);
    for (const dossier of depose.dossiers.length > 0 ? depose.dossiers : dossiersConnus) {
      const option = document.createElement('option');
      option.value = dossier;
      option.textContent = folderLabel(dossier);
      ou.append(option);
    }
    choix.append(ou);

    const quoi = document.createElement('select');
    if (depose.double) {
      for (const [valeur, texte] of [
        ['ranger', aTraduire('Garder les deux')],
        ['remplacer', aTraduire('Remplacer')],
        ['jeter', aTraduire('Jeter')],
      ] as const) {
        const option = document.createElement('option');
        option.value = valeur;
        option.textContent = t(texte);
        quoi.append(option);
      }
      choix.append(quoi);
    }

    ligne.append(choix);
    ligne.dataset.chemin = depose.chemin;
    triQuestions.append(ligne);

    lignesTri.set(depose.chemin, { ou, quoi, double: Boolean(depose.double) });
  }
}

/** Les dossiers de l'ossature, pour ce qu'aucune extension ne désigne. */
let dossiersConnus: string[] = [];

/** Les choix en cours, par fichier. */
const lignesTri = new Map<
  string,
  { ou: HTMLSelectElement; quoi: HTMLSelectElement; double: boolean }
>();

triAppliquer.addEventListener('click', async () => {
  const choisis = [...lignesTri].filter(([, ligne]) => ligne.ou.value !== '');
  if (choisis.length === 0) {
    dialogs.tri.close();
    return;
  }

  triAppliquer.disabled = true;
  let ranges = 0;
  for (const [rang, [chemin, ligne]] of choisis.entries()) {
    avancementTri(rang, choisis.length, '');
    const geste = ligne.double
      ? (ligne.quoi.value as 'ranger' | 'remplacer' | 'jeter')
      : 'ranger';
    try {
      await fileDrop(chemin, ligne.ou.value, geste);
      ranges += 1;
    } catch (error) {
      log(reason(error), 'err');
    }
  }
  avancementTri(choisis.length, choisis.length, '');
  triAppliquer.disabled = false;

  try {
    await sweepDrop();
  } catch {
    // Sans importance.
  }

  if (ranges > 0) {
    log(dit('rangement : {0}', plural(ranges, 'jeu', 'jeux')), 'ok');
    await refreshLibrary();
  }
  await rangerDepot(false);
});

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
  // La scène et les menus de salon se dimensionnent sur la place disponible,
  // qui vient de changer sans qu'aucune fenêtre ne soit redimensionnée.
  fitScreen();
  replacerMenus();
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
  tri: () => void rangerDepot(false),
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
  // Les trois ouvrent le panneau : par le menu, on désigne l'emplacement
  // plutôt que d'en deviner un. Les raccourcis, eux, vont droit au but.
  save: ouvrirEmplacements,
  restore: ouvrirEmplacements,
  states: ouvrirEmplacements,
  wipe: repartirDeZero,
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
    renderZoneMorte();
    openDialog(dialogs.controls);
  },
  settings: () => {
    renderTempo();
    openDialog(dialogs.settings);
  },
  triches: () => void ouvrirPanneauFiches(),
  mod: () => void ouvrirPanneauTriches(),
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
  [aTraduire('Flèches'), aTraduire('Parcourir la grille et les menus animés')],
  [aTraduire('Entrée'), aTraduire('Lancer le jeu choisi')],
  ['P', aTraduire('Plein écran')],
  ['F3', aTraduire('Panneau de triches')],
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

  void renderCredits();
}

/**
 * Dit à qui l'on doit chaque émulateur, et sous quelle licence.
 *
 * EvaChi n'en écrit aucun : elle en héberge. Leur travail est partout dans ce
 * qu'elle donne à voir, et c'est ici — et nulle part ailleurs — qu'il se lit.
 *
 * Les noms, les auteurs et les licences ne se traduisent pas : ce sont des noms
 * propres et des déclarations, et les réécrire serait les trahir.
 */
async function renderCredits(): Promise<void> {
  if (!inShell) return;

  let lignes: Credit[] = [];
  try {
    lignes = await credits();
  } catch {
    return;
  }

  creditsBody.replaceChildren();

  // Deux groupes, parce que le même nom peut désigner deux choses : Azahar est
  // à la fois un cœur libretro et un programme autonome, et ils n'ont ni la
  // même version ni la même licence. Les lister pêle-mêle les ferait passer
  // pour une contradiction.
  const groupes: [string, Credit[]][] = [
    [t('cœurs libretro'), lignes.filter((ligne) => ligne.genre === 'coeur')],
    [t('émulateurs externes'), lignes.filter((ligne) => ligne.genre !== 'coeur')],
  ];

  for (const [titre, membres] of groupes) {
    if (membres.length === 0) continue;

    const entete = document.createElement('h4');
    entete.textContent = titre;
    creditsBody.append(entete);

    const liste = document.createElement('dl');
    liste.className = 'about credits';
    for (const ligne of membres) {
      const dt = document.createElement('dt');
      dt.textContent = ligne.nom;
      // Ce qui est posé sur la machine se distingue de ce qu'on propose : la
      // liste sert autant à savoir ce qu'on a qu'à créditer ce qu'on doit.
      dt.classList.toggle('pose', ligne.installe);

      const dd = document.createElement('dd');
      // Les auteurs quand le projet les nomme ; son adresse sinon. Un crédit
      // qui ne mène nulle part ne crédite qu'à moitié.
      const qui = ligne.auteurs.join(' · ') || ligne.site;
      dd.textContent = [ligne.systeme, ligne.licence, qui].filter(Boolean).join(' — ');
      if (ligne.restreint) dd.classList.add('restreint');

      liste.append(dt, dd);
    }
    creditsBody.append(liste);
  }

  // Une licence non commerciale n'empêche rien ici — EvaChi ne redistribue
  // aucun émulateur, elle va les chercher chez leurs auteurs. Mais qui
  // reprendrait ce travail pour en faire un produit doit le savoir, et
  // l'application est le seul endroit où il le lira.
  const restreints = lignes.filter((ligne) => ligne.restreint).map((ligne) => ligne.nom);
  creditsNote.textContent = restreints.length
    ? dit(
        'Licence non commerciale, à savoir avant toute reprise : {0}.',
        restreints.join(', '),
      )
    : '';
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

  // Et le manche tel quel, en plus de la croix qu'il imite. Les deux, parce
  // que ce sont deux commandes différentes sur la machine émulée : la
  // Nintendo 64 a une croix *et* un manche, et ses jeux lisent le second.
  manches.fill(0);
  if (pad) {
    for (let axe = 0; axe < manches.length; axe += 1) {
      const pousse = pad.axes[axe] ?? 0;
      // Un manche au repos ne rend jamais exactement zéro : sans ce seuil, le
      // personnage dérive tout seul, manette posée sur la table.
      manches[axe] = Math.abs(pousse) < zoneMorte() ? 0 : pousse;
    }
  }

  // Un clavier n'a pas de manche. Ses flèches en tiennent lieu, à fond, tant
  // que le vrai manche est au repos — sinon la Nintendo 64 serait injouable
  // sans manette. La croix de la manette, elle, reste la croix : elle existe
  // sur la machine, et certains jeux s'en servent pour autre chose.
  if (manches[0] === 0 && manches[1] === 0) {
    const tenue = (direction: number): boolean => {
      const cible = padBindings().get(direction);
      return cible !== undefined && keyboard[cible];
    };
    if (tenue(PAD_LEFT)) manches[0] = -1;
    if (tenue(PAD_RIGHT)) manches[0] = 1;
    if (tenue(PAD_UP)) manches[1] = -1;
    if (tenue(PAD_DOWN)) manches[1] = 1;
  }

  // Ce que la console croit sentir : le manche droit la penche, et la
  // secousse s'y ajoute le temps qu'elle dure.
  const depuis = secousseDepuis === null ? null : (performance.now() - secousseDepuis) / 1000;
  if (depuis !== null && depuis >= DUREE_SECOUSSE) secousseDepuis = null;
  const senti = enSix(
    ressenti(manches[2], manches[3], depuis !== null && depuis < DUREE_SECOUSSE ? depuis : null),
  );
  for (const [rang, valeur] of senti.entries()) capteurs[rang] = valeur;

  if (dialogs.controls.open) {
    for (const [index, cell] of buttonCells) {
      cell.classList.toggle('down', buttons[index]);
    }
    eclairerCroquis(pad);
  }
}

/**
 * Allume sur le portrait ce que la manette a sous les doigts.
 *
 * C'est la réponse à « est-ce qu'elle est branchée ? » : une case qui
 * s'allume dans une liste se cherche, une touche qui s'allume sur un dessin de
 * manette se voit sans lever les yeux.
 */
function eclairerCroquis(pad: Gamepad | null): void {
  for (const [index, piece] of piecesManette) {
    piece.classList.toggle('presse', pad?.buttons[index]?.pressed ?? false);
  }
  const repos = zoneMorte();
  for (const [manche, capuchon] of manchesManette) {
    const x = pad?.axes[manche * 2] ?? 0;
    const y = pad?.axes[manche * 2 + 1] ?? 0;
    const dx = Math.abs(x) < repos ? 0 : Math.max(-1, Math.min(1, x));
    const dy = Math.abs(y) < repos ? 0 : Math.max(-1, Math.min(1, y));
    capuchon.style.transform = `translate(${(dx * 5).toFixed(2)}px, ${(dy * 5).toFixed(2)}px)`;
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
  // La musique appartient aux menus de salon et à eux seuls. Surveillé ici
  // plutôt qu'au lancement d'un jeu : il y a plusieurs façons de quitter un
  // menu, et une seule oubliée laisserait la musique jouer sous la partie.
  const salon = !xmbView.hidden || !carrView.hidden || !paqView.hidden || !seaView.hidden;
  if (musiqueEnCours() && (libraryView.hidden || !salon)) {
    arreterMusique();
  }

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

/** Tient la conduite des menus à l'écart le temps d'une capture. */
const verrouPad = new Verrou();

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
  void porterLesTouches(true);
}

/**
 * Porte les touches jusqu'aux émulateurs autonomes.
 *
 * Un émulateur autonome est un autre programme : il garde sa correspondance
 * dans son propre fichier, et ne sait rien de ce qu'on a réglé ici. Jusqu'à
 * présent, réassigner un bouton dans EvaChi laissait donc Dolphin croire qu'on
 * jouait au clavier — la seule chose de l'application qui ne suivît pas le
 * réglage, et celle qu'on remarque, manette en main.
 *
 * La disposition envoyée est toujours celle de la manette, jamais le pavé
 * hexadécimal du CHIP-8 : un émulateur de PlayStation 2 n'a que faire d'une
 * touche « F ».
 *
 * @param discret vrai quand l'écriture suit un changement de liaison : on ne
 *   dit alors que ce qui a changé, et rien quand rien n'a bougé.
 */
async function porterLesTouches(discret: boolean): Promise<void> {
  if (!inShell) return;

  // L'inverse de ce que garde la fenêtre : un émulateur demande « quel bouton
  // fait la croix ? », et non « que fait ce bouton ? ».
  const resolues = resolveBindings(JOYPAD.gamepad, liaisons[JOYPAD.id]);
  const pour = new Array<number>(BUTTON_COUNT).fill(-1);
  for (const [physique, cœur] of resolues) {
    if (cœur >= 0 && cœur < pour.length) pour[cœur] = physique;
  }

  try {
    const ecrits = (await writePadBindings(pour)) ?? [];
    const changes = ecrits.filter((ecrit) => ecrit.lignes > 0);
    if (changes.length > 0) {
      // Un émulateur peut avoir deux fichiers à recevoir — Dolphin en a un pour
      // ses touches et un pour le branchement de son port. On ne le nomme
      // qu'une fois.
      const noms = [...new Set(changes.map((ecrit) => ecrit.label))];
      log(dit('touches portées : {0}', noms.join(', ')), 'ok');
    } else if (!discret) {
      log(
        ecrits.length > 0
          ? t('les émulateurs externes avaient déjà ces touches')
          : t('aucun émulateur externe n’a encore écrit ses réglages'),
      );
    }
  } catch (error) {
    log(reason(error), 'err');
  }
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

const resetBindings = $<HTMLButtonElement>('controls-reset');
const porterTouches = $<HTMLButtonElement>('controls-porter');
porterTouches.addEventListener('click', () => void porterLesTouches(false));

/** Écrit la zone morte sous la jauge, et la retient. */
function renderZoneMorte(): void {
  const cran = Math.round(zoneMorte() * 100);
  zoneMorteJauge.value = String(cran);
  zoneMorteValeur.textContent = `${cran} %`;
}

zoneMorteJauge.addEventListener('input', () => {
  retenir(RETENU.zoneMorte, zoneMorteJauge.value);
  renderZoneMorte();
});

resetBindings.addEventListener('click', () => {
  if (!liaisons[layout.id]) return;
  enAttente = null;
  poserLiaisons(withoutBindings(liaisons, layout.id));
  log(t('liaisons de manette remises d’origine'));
});

/**
 * Comment la manette se range, par zones.
 *
 * Seize cases en vrac ne ressemblent à rien qu'on tienne en main : on cherche
 * « le bouton du bas » dans une grille où rien ne dit où est le bas. Rangées
 * comme sur la manette — la croix, les quatre boutons, les gâchettes, les deux
 * du milieu — les mêmes seize cases se lisent sans réfléchir.
 *
 * Le pavé hexadécimal du CHIP-8 n'y figure pas : c'est un objet réel, carré,
 * et le dessiner tel quel vaut mieux que de le découper.
 */
const ZONES: Record<string, readonly (readonly [string, string, readonly number[]])[]> = {
  joypad: [
    ['zone-croix', aTraduire('Croix directionnelle'), [4, 5, 6, 7]],
    ['zone-boutons', aTraduire('Boutons'), [8, 0, 9, 1]],
    ['zone-gachettes', aTraduire('Gâchettes'), [10, 11, 12, 13, 14, 15]],
    ['zone-systeme', aTraduire('Système'), [2, 3]],
  ],
};

/** Les pièces du portrait, par le numéro que le navigateur donne au bouton. */
const piecesManette = new Map<number, SVGElement>();
/** Les deux capuchons de manche, par leur rang. */
const manchesManette = new Map<number, SVGElement>();

let keyLabels: Map<string, string> | null = null;

/**
 * Dessine une commande : ce qu'elle fait, la touche qui la tient, le bouton
 * qui la tient.
 *
 * Deux boutons dans la case, et non un seul. Le grand se presse pour jouer —
 * c'est ainsi qu'on essaie un pavé au CHIP-8, et qu'on vérifie qu'une touche
 * arrive. Le petit, en bas, porte le bouton de manette : on le clique, on
 * presse le bouton voulu, et c'est fait. L'ancien panneau demandait de passer
 * d'abord en « réassignation », un mode qu'il fallait connaître et penser à
 * quitter.
 */
function caseDeCommande(index: number, physical: string): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'key';

  const touche = document.createElement('button');
  touche.type = 'button';
  touche.className = 'touche';

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = layout.labels[index] ?? String(index);

  const key = document.createElement('span');
  key.className = 'phys';
  key.textContent = physical.toUpperCase();
  touche.append(label, key);

  const attribution = document.createElement('button');
  attribution.type = 'button';
  attribution.className = 'attribution';
  const source = [...padBindings()].find(([, cible]) => cible === index)?.[0];
  if (enAttente === index) {
    attribution.textContent = '…';
    attribution.title = t('pressez le bouton voulu sur la manette');
    cell.classList.add('attente');
  } else if (source !== undefined) {
    attribution.textContent = padButtonShort(source);
    attribution.title = dit('manette : {0}', padButtonShort(source));
  } else {
    // Un tiret plutôt que le vide : une case vide se lit comme un défaut
    // d'affichage, un tiret dit « rien, et c'est voulu ».
    attribution.textContent = '—';
    attribution.classList.add('vide');
    attribution.title = t('aucun');
  }
  attribution.addEventListener('click', () => {
    enAttente = enAttente === index ? null : index;
    buildKeypad();
  });

  touche.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    touche.setPointerCapture(event.pointerId);
    setButton(index, true);
    void audio.unlock();
  });
  const release = (): void => setButton(index, false);
  touche.addEventListener('pointerup', release);
  touche.addEventListener('pointercancel', release);
  touche.addEventListener('lostpointercapture', release);

  cell.append(touche, attribution);
  buttonCells.set(index, cell);
  return cell;
}

/** Redessine le panneau des commandes pour la disposition du cœur actif. */
function buildKeypad(): void {
  keypadBox.replaceChildren();
  buttonCells.clear();
  keyboard.fill(false);
  buttons.fill(false);

  const physicalFor = new Map<number, string>();
  for (const [code, index] of layout.bindings) physicalFor.set(index, code);
  const touchePhysique = (index: number): string => {
    const code = physicalFor.get(index);
    return code ? keyLabels?.get(code) ?? FALLBACK_KEY_LABELS[code] ?? '' : '';
  };

  const zones = ZONES[layout.id];
  keypadBox.classList.toggle('zones', zones !== undefined);
  keypadBox.classList.toggle('grille', zones === undefined);
  piecesManette.clear();
  manchesManette.clear();

  if (!zones) {
    for (const index of layout.display) {
      keypadBox.append(caseDeCommande(index, touchePhysique(index)));
    }
    return;
  }

  // Le portrait au milieu, les liaisons autour : c'est ainsi qu'on cherche un
  // bouton — par l'endroit où il est sous les doigts, pas par son nom dans une
  // liste.
  const place = document.createElement('div');
  place.className = 'croquis-place';
  const dessin = croquisManette.content.firstElementChild?.cloneNode(true);
  if (dessin instanceof SVGElement) {
    for (const piece of dessin.querySelectorAll<SVGElement>('[data-bouton]')) {
      piecesManette.set(Number(piece.dataset.bouton), piece);
    }
    for (const capuchon of dessin.querySelectorAll<SVGElement>('[data-manche]')) {
      manchesManette.set(Number(capuchon.dataset.manche), capuchon);
    }
    place.append(dessin);
  }
  keypadBox.append(place);

  for (const [ou, titre, boutons] of zones) {
    const zone = document.createElement('div');
    zone.className = `zone ${ou}`;

    const nom = document.createElement('h4');
    nom.textContent = t(titre);

    const rangee = document.createElement('div');
    rangee.className = 'rangee';
    for (const index of boutons) {
      rangee.append(caseDeCommande(index, touchePhysique(index)));
    }

    zone.append(nom, rangee);
    keypadBox.append(zone);
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

  // Ce qui a été déposé depuis la dernière fois est rangé avant que la
  // bibliothèque ne se dessine : autrement elle s'afficherait sans les jeux
  // qu'on vient d'y mettre, et se redessinerait sous les yeux.
  if (inShell) await rangerDepot(true);

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
