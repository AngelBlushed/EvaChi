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
  coverIndex,
  directories,
  libraryFolders,
  listRoms,
  pickContent,
  pickFolder,
  readContent,
  removeLibraryFolder,
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
import { coresFor, effectiveCore, folderLabel, groupLibrary } from './library.ts';
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
  padButtonName,
  padButtonShort,
  parseOverrides,
  resolveBindings,
  withBinding,
  withoutBindings,
} from './bindings.ts';
import type { AllOverrides } from './bindings.ts';
import { chooseCover, coverUrl, index as indexCovers, thumbnailFolders } from './covers.ts';
import type { Candidate } from './covers.ts';
import { Held, columnsFor, move } from './navigation.ts';
import type { Direction } from './navigation.ts';

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
const shelvesBox = $<HTMLDivElement>('games');
const grilleView = $<HTMLDivElement>('grille');
const grilleTuiles = $<HTMLDivElement>('grille-tuiles');
const grilleTitre = $<HTMLElement>('grille-titre');
const grilleDetail = $<HTMLElement>('grille-detail');
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
const presetList = $<HTMLUListElement>('preset-list');
const installOffer = $<HTMLButtonElement>('placeholder-install');
const installList = $<HTMLUListElement>('install-list');
const emulatorList = $<HTMLUListElement>('emulator-list');
const biosList = $<HTMLUListElement>('bios-list');
const biosSummary = $<HTMLElement>('bios-summary');
const biosFolder = $<HTMLButtonElement>('bios-folder');
const themeList = $<HTMLDivElement>('theme-list');
const menuList = $<HTMLDivElement>('menu-list');
const jaquettesCase = $<HTMLInputElement>('jaquettes');
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
    vignette.title = theme.scheme === 'light' ? 'thème clair' : 'thème sombre';

    const apercu = document.createElement('span');
    apercu.className = 'apercu';
    // La vignette ne se peint pas des couleurs en cours mais des siennes :
    // on choisit sur ce qu'on voit, pas sur un nom.
    apercu.style.background = theme.palette.bg;
    apercu.style.color = theme.palette.ink;

    const nom = document.createElement('span');
    nom.className = 'nom';
    nom.textContent = theme.label;

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
    coche.textContent = theme.id === themeActuel.id ? '● en cours' : '';

    apercu.append(nom, barres, coche);
    vignette.append(apercu);
    vignette.addEventListener('click', () => choisirTheme(theme.id));
    themeList.append(vignette);
  }
}

/** Les deux façons de présenter la bibliothèque. */
const MENUS = [
  {
    id: 'liste',
    label: 'Liste',
    detail: 'Un volet par console, en tableau. Le plus dense à la souris.',
  },
  {
    id: 'grille',
    label: 'Grille',
    detail: 'Les jaquettes en grand, parcourues à la manette. Pensé pour le canapé.',
  },
] as const;

/** Le mode d'affichage retenu ; la liste tant que rien n'a été choisi. */
function menuActuel(): string {
  return retenu(RETENU.menu) === 'grille' ? 'grille' : 'liste';
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
    nom.textContent = menu.label;
    const detail = document.createElement('span');
    detail.textContent = menu.detail;

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

/** Accorde un nom en nombre. En français, zéro reste au singulier. */
const plural = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count > 1 ? plural : singular}`;

// --- Journal et barre d'état ------------------------------------------------

function log(message: string, kind: 'info' | 'ok' | 'err' = 'info'): void {
  const line = document.createElement('div');
  if (kind !== 'info') line.className = kind;
  line.textContent = `${new Date().toLocaleTimeString('fr-FR')}  ${message}`;
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
    restore: playing && savedState !== null,
    stop: playing,
  };

  for (const [action, on] of Object.entries(enabled)) {
    const button = menubar.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (button) button.disabled = !on;
  }

  const toggle = menubar.querySelector<HTMLButtonElement>('[data-action="toggle"]');
  if (toggle) toggle.textContent = running ? 'Pause' : 'Reprendre';
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
    context!.imageSmoothingEnabled = false;
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

document.addEventListener('fullscreenchange', () => fitScreen());
window.addEventListener('resize', () => fitScreen());

function setRunning(next: boolean): void {
  running = next;
  refreshMenus();
  if (next) void runLoop();
}

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

  while (running && core && token === loopToken) {
    const frameMs = 1000 / (core.info.fps || 60);

    sampleInput();

    let frame: Frame;
    try {
      frame = await core.runFrame(buttons);
    } catch (error) {
      if (token === loopToken) {
        setRunning(false);
        log(`arrêt — ${reason(error)}`, 'err');
      }
      return;
    }

    // Le cœur a pu changer pendant l'attente : cette trame ne vaut plus rien.
    if (token !== loopToken) return;

    present(frame);
    audio.push(frame.audio, core.info.sampleRate);
    framesThisSecond += 1;

    const now = performance.now();
    if (now - lastReport >= 1000) {
      fpsOut.textContent = `${framesThisSecond} im/s`;
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
    for (const message of await takeMessages()) log(`cœur : ${message}`);
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
  log(`${name} — chargé`, 'ok');
  await drainMessages();
}

/** Repose le jeu et revient à la bibliothèque. */
async function stopPlaying(): Promise<void> {
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
    log(`déchargement incomplet — ${reason(error)}`, 'err');
  }
}

/** Lance un jeu de la bibliothèque avec le cœur choisi pour lui. */
async function play(target: CatalogEntry, rom: RomEntry): Promise<void> {
  // Un émulateur externe est un autre programme : on le démarre avec le jeu en
  // argument et on n'en attend rien de plus.
  if (target.kind === 'externe') {
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

function humanSize(bytes: number): string {
  // Une image de Wii U pèse six mille méga-octets ; annoncée ainsi, le nombre
  // ne se lit plus.
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Go`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${bytes} o`;
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

/** Largeur d'une tuile et écart entre deux, tels que la feuille de style les pose. */
const TUILE = { largeur: 124, ecart: 18 };

/** Le nombre de colonnes réellement affichées. */
function colonnes(): number {
  return columnsFor(grilleTuiles.clientWidth - 44, TUILE.largeur, TUILE.ecart);
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

/** Dessine la grille à partir des volets déjà classés. */
function renderGrille(shelves: Shelf[]): void {
  grilleTuiles.replaceChildren();
  tuiles = shelves.flatMap((shelf) => shelf.games);

  // Une sélection ne se transporte pas d'une liste à l'autre : la case 40 d'une
  // recherche ne désigne pas le même jeu que la case 40 de la bibliothèque.
  const empreinte = signature(tuiles);
  if (empreinte !== signatureAffichee) choisie = 0;
  signatureAffichee = empreinte;

  for (const [rang, item] of tuiles.entries()) {
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
      // La jaquette remplace l'initiale une fois arrivée, et pas avant : une
      // image à moitié chargée sur fond vide fait clignoter toute la grille.
      jaquette.addEventListener('load', () => {
        initiale.hidden = true;
      });
      boite.append(jaquette);
      regarderJaquette(jaquette);
    }

    const nom = document.createElement('span');
    nom.className = 'nom';
    nom.textContent = folderLabel(item.rom.name.replace(/\.[^.]+$/, ''));

    tuile.append(boite, nom);
    tuile.addEventListener('click', () => {
      choisir(rang);
      void jouerChoisie();
    });
    grilleTuiles.append(tuile);
  }

  choisir(choisie);
}

/** Désigne une case, la met en vue, et annonce ce qu'elle porte. */
function choisir(rang: number): void {
  choisie = Math.min(Math.max(rang, 0), Math.max(0, tuiles.length - 1));

  const cases = [...grilleTuiles.children] as HTMLElement[];
  for (const [index, element] of cases.entries()) {
    element.setAttribute('aria-selected', String(index === choisie));
  }

  const courante = cases[choisie];
  if (courante) courante.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

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

/** Le volet d'où ce jeu vient. */
function voletDe(item: Playable): Shelf | undefined {
  return volets.find((shelf) => shelf.games.includes(item));
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
 * Fait vivre la grille à la manette.
 *
 * Appelée depuis la même boucle que le panneau des commandes. Les directions
 * passent par un filtre d'appui : sans lui, une direction tenue traverse six
 * cents jeux en deux secondes.
 */
const directions = {
  gauche: new Held(),
  droite: new Held(),
  haut: new Held(),
  bas: new Held(),
};
const valider = new Held(1000, 1000);

function naviguerGrille(): void {
  if (!enGrille() || libraryView.hidden || tuiles.length === 0) return;
  // Une fenêtre ouverte prend la main : sans cela, régler ses touches ferait
  // défiler la bibliothèque derrière.
  if (document.querySelector('dialog[open]')) return;

  // `currentPad` et non `padIndex` : sous Windows la manette ne s'annonce
  // qu'au premier bouton pressé, et ce bouton-là est souvent le nôtre.
  const pad = currentPad();
  if (!pad) return;

  const [x = 0, y = 0] = pad.axes;
  const maintenant = performance.now();
  const pousse: Record<Direction, boolean> = {
    gauche: pad.buttons[14]?.pressed || x < -STICK_DEADZONE,
    droite: pad.buttons[15]?.pressed || x > STICK_DEADZONE,
    haut: pad.buttons[12]?.pressed || y < -STICK_DEADZONE,
    bas: pad.buttons[13]?.pressed || y > STICK_DEADZONE,
  };

  for (const sens of ['gauche', 'droite', 'haut', 'bas'] as Direction[]) {
    const etat = directions[sens].update(pousse[sens], maintenant);
    if (etat.pressed || etat.repeat) choisir(move(choisie, tuiles.length, colonnes(), sens));
  }

  if (valider.update(pad.buttons[0]?.pressed ?? false, maintenant).pressed) {
    void jouerChoisie();
  }
}

/** Les flèches du clavier, comme la croix de la manette. */
const FLECHES: Record<string, Direction> = {
  ArrowLeft: 'gauche',
  ArrowRight: 'droite',
  ArrowUp: 'haut',
  ArrowDown: 'bas',
};

/*
 * La grille se parcourt aussi au clavier.
 *
 * Elle est faite pour la manette, mais elle reste en place une fois choisie :
 * s'en servir sans manette ne doit pas obliger à repasser en liste. Les
 * flèches horizontales sont laissées au champ de recherche quand on y écrit —
 * elles y déplacent le curseur, et on ne prend pas ce qui sert déjà.
 */
document.addEventListener('keydown', (event) => {
  if (!enGrille() || libraryView.hidden || tuiles.length === 0) return;
  if (document.querySelector('dialog[open]')) return;

  const dansLaRecherche = event.target === searchInput;
  const sens = FLECHES[event.key];

  if (sens) {
    if (dansLaRecherche && (sens === 'gauche' || sens === 'droite')) return;
    event.preventDefault();
    choisir(move(choisie, tuiles.length, colonnes(), sens));
    return;
  }

  if (event.key === 'Enter' && !dansLaRecherche) {
    event.preventDefault();
    void jouerChoisie();
  }
});

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

/** Cherche la jaquette qui convient et la pose, ou laisse la place vide. */
async function habiller(img: HTMLImageElement): Promise<void> {
  const consoleLabel = img.dataset.console ?? '';
  const jeu = img.dataset.jeu ?? '';
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
  titre.textContent = rom.name;

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
  return row;
}

/** Redessine la bibliothèque, filtrée par la recherche. */
function renderGames(): void {
  const needle = searchInput.value.trim().toLowerCase();
  const shelves = groupLibrary(games, catalog, readFolderCores(), chosenCore, needle);
  volets = shelves;

  shelvesBox.replaceChildren();

  const known = games.filter((rom) => coresFor(rom, catalog).length > 0).length;
  countsOut.textContent = `${plural(known, 'jeu', 'jeux')} · ${plural(catalog.length, 'cœur')}`;

  // Un cœur interne existe toujours ; ce sont les autres qui manquent quand
  // rien n'est installé.
  const bare = inShell && catalog.every((candidate) => candidate.kind === 'interne');
  installOffer.hidden = !bare;

  if (shelves.length === 0) {
    shelvesBox.hidden = true;
    viderGrille();
    placeholder.hidden = false;

    const heading = placeholder.querySelector('strong');
    const detail = placeholder.querySelector('span');
    if (bare) {
      // Sans émulateur, indiquer un dossier de jeux ne donnerait rien : c'est
      // l'installation qu'il faut proposer, et le dire franchement.
      if (heading) heading.textContent = 'Aucun émulateur installé';
      if (detail) {
        detail.textContent =
          "EvaChi peut les télécharger depuis la forge officielle libretro. Choisissez les consoles qui vous intéressent.";
      }
    } else if (games.length === 0) {
      if (heading) heading.textContent = 'Aucun jeu';
      if (detail) detail.textContent = 'Indiquez le dossier où se trouvent vos jeux.';
    } else if (needle) {
      if (heading) heading.textContent = 'Aucun résultat';
      if (detail) detail.textContent = `Rien ne correspond à « ${searchInput.value.trim()} ».`;
    } else {
      if (heading) heading.textContent = 'Aucun jeu reconnu';
      if (detail) {
        const found = plural(games.length, 'fichier');
        detail.textContent = `${found} sur le disque, mais aucun cœur installé ne l'ouvre.`;
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
    grilleView.hidden = false;
    renderGrille(shelves);
    return;
  }

  viderGrille();
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
    label.textContent = shelf.label;
    heading.append(label);

    if (shelf.candidates.length > 1) {
      const picker = document.createElement('select');
      picker.className = 'shelf-core';
      picker.title = 'Émulateur utilisé pour ce dossier';
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
    log(`bibliothèque illisible — ${reason(error)}`, 'err');
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
      note.textContent = 'par défaut';
      item.append(note);
    } else {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Retirer';
      remove.addEventListener('click', async () => {
        try {
          folders = await removeLibraryFolder(path);
          renderFolders();
          await refreshLibrary();
        } catch (error) {
          log(`retrait impossible — ${reason(error)}`, 'err');
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
    log(`dossier ajouté : ${chosen}`, 'ok');
  } catch (error) {
    log(`ajout impossible — ${reason(error)}`, 'err');
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
      state.textContent = 'installé';
    } else {
      state.textContent = 'à télécharger';
    }

    item.append(name, state);
    installList.append(item);
  }

  const waiting = offers.filter((offer) => !offer.installed).length;
  installButton.disabled = waiting === 0;
  installProgress.textContent = waiting === 0 ? 'tout est installé' : '';
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
      button.textContent = offer.owned ? 'Mettre à jour' : 'Installer';
      button.addEventListener('click', () => void fetchEmulator(offer, button));
      actions.append(button);
    }

    // Toujours de quoi désigner le sien. Sans ce bouton, une console dont la
    // forge refuse les robots — la Switch — n'offrait aucune issue depuis cette
    // fenêtre : le texte disait où aller chercher l'émulateur, et rien ne
    // permettait ensuite de dire où on l'avait mis.
    const browse = document.createElement('button');
    browse.type = 'button';
    browse.textContent = offer.owned || offer.declared ? 'Changer…' : 'Parcourir…';
    browse.title = `Désigner soi-même le programme de ${offer.label}`;
    browse.addEventListener('click', async () => {
      try {
        const chosen = await pickExecutable();
        if (!chosen) return;
        await adopt(offer.system, chosen);
        await refreshInstall();
      } catch (error) {
        log(`sélection impossible — ${reason(error)}`, 'err');
      }
    });
    actions.append(browse);

    if (offer.owned) {
      state.classList.add('ready');
      state.textContent = `installé par EvaChi · ${offer.license}`;
    } else if (offer.declared) {
      state.classList.add('ready');
      state.textContent = offer.declared;
      state.title = offer.declared;
    } else if (offer.downloadable) {
      state.textContent = `à télécharger · ${offer.license}`;
    } else {
      // Sa forge refuse les robots : dire où aller le chercher, et rappeler
      // qu'on peut le désigner soi-même une fois installé.
      state.textContent = `à prendre sur ${offer.site.replace(/^https?:\/\//, '')}, puis « Parcourir… »`;
    }

    item.append(name, actions, state);
    emulatorList.append(item);
  }
}

/** Installe un émulateur autonome et rafraîchit ce qui en dépend. */
async function fetchEmulator(offer: EmulatorOffer, button: HTMLButtonElement): Promise<void> {
  const before = button.textContent;
  button.disabled = true;
  button.textContent = 'Installation…';
  installProgress.textContent = `${offer.label} — téléchargement…`;

  try {
    externals = await installEmulator(offer.system);
    log(`${offer.label} installé et prêt`, 'ok');
    installProgress.textContent = `${offer.label} installé`;
    presets = await knownExternals();
    renderExternals();
    await reloadCatalog();
    await refreshLibrary();
  } catch (error) {
    log(`${offer.label} — ${reason(error)}`, 'err');
    installProgress.textContent = `${offer.label} : échec, voir le journal`;
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

    if (fichier.present) {
      état.classList.add('ready');
      état.textContent = `en place · ${fichier.note}`;
    } else if (!fichier.coreInstalled) {
      état.textContent = `cœur non installé · ${fichier.note}`;
    } else if (fichier.need === 'required') {
      état.classList.add('manque');
      état.textContent = `MANQUANT · ${fichier.note}`;
    } else {
      état.textContent = `absent, facultatif · ${fichier.note}`;
    }

    item.append(nom, état);
    biosList.append(item);
  }

  const bloquants = systemeFichiers.filter(
    (f) => !f.present && f.coreInstalled && f.need === 'required',
  ).length;
  biosSummary.textContent = bloquants
    ? `${plural(bloquants, 'fichier')} manque${bloquants > 1 ? 'nt' : ''} à des consoles installées`
    : 'rien ne bloque';
}

/** Recharge l'état des cœurs et des émulateurs proposés. */
async function refreshInstall(): Promise<void> {
  if (!inShell) return;
  try {
    offers = await installableCores();
    renderInstall();
  } catch (error) {
    log(`liste des cœurs indisponible — ${reason(error)}`, 'err');
  }
  try {
    standalones = await installableEmulators();
    renderEmulators();
  } catch (error) {
    log(`liste des émulateurs indisponible — ${reason(error)}`, 'err');
  }
  try {
    systemeFichiers = await systemFiles();
    renderBios();
  } catch (error) {
    log(`fichiers système illisibles — ${reason(error)}`, 'err');
  }
}

biosFolder.addEventListener('click', async () => {
  try {
    log(`dossier ouvert : ${await revealSystemDir()}`);
  } catch (error) {
    log(`ouverture impossible — ${reason(error)}`, 'err');
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
      ? `${plural(rangés.length, 'fichier')} rangé${rangés.length > 1 ? 's' : ''} · ${consoles}`
      : (faits[0]?.note ?? 'rien à ranger');

    systemeFichiers = await systemFiles();
    renderBios();
  } catch (error) {
    log(`rangement impossible — ${reason(error)}`, 'err');
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
      log(`${offer?.label ?? name} installé — ${Math.round(size / 1024)} Ko`, 'ok');
    } catch (error) {
      failed += 1;
      log(`${offer?.label ?? name} — ${reason(error)}`, 'err');
    }
  }

  installProgress.textContent =
    failed === 0
      ? `${plural(done, 'émulateur')} installé${done > 1 ? 's' : ''}`
      : `${done} installé(s), ${failed} en échec — voir le journal`;

  await refreshInstall();
  await reloadCatalog();
  await refreshLibrary();
}

installButton.addEventListener('click', () => void installSelected());

/** Ouvre la liste des émulateurs, après l'avoir remise à jour. */
async function openInstall(): Promise<void> {
  await refreshInstall();
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
      state.textContent = `trouvé : ${preset.detected}`;
      state.title = preset.detected;
    } else {
      state.textContent = 'non installé sur cette machine';
    }

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (declared) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Retirer';
      remove.addEventListener('click', () => void detach(preset.system));
      actions.append(remove);
    } else if (preset.detected) {
      const use = document.createElement('button');
      use.type = 'button';
      use.textContent = 'Activer';
      use.addEventListener('click', () => void adopt(preset.system, preset.detected));
      actions.append(use);
    }

    const browse = document.createElement('button');
    browse.type = 'button';
    browse.textContent = declared ? 'Changer…' : 'Parcourir…';
    browse.addEventListener('click', async () => {
      try {
        const chosen = await pickExecutable();
        if (chosen) await adopt(preset.system, chosen);
      } catch (error) {
        log(`sélection impossible — ${reason(error)}`, 'err');
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
    log(`${system} retiré`);
  } catch (error) {
    log(`retrait impossible — ${reason(error)}`, 'err');
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
    log(`sélection impossible — ${reason(error)}`, 'err');
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
    log('nom, programme et extensions sont tous nécessaires', 'err');
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
    log(`${name} enregistré`, 'ok');

    for (const field of [extName, extExe, extExtensions, extArgs]) field.value = '';
  } catch (error) {
    log(`enregistrement impossible — ${reason(error)}`, 'err');
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
  for (const line of discoveryReport) log(`découverte : ${line}`);
  for (const failure of discoveryErrors) {
    log(`découverte interrompue — ${failure}`, 'err');
  }
  renderGames();
}

// --- Actions des menus ------------------------------------------------------

/** Ouvre un jeu par le sélecteur de fichiers, avec le cœur actif. */
async function openContent(): Promise<void> {
  if (!entry || !core) {
    log("choisissez d'abord un jeu dans la bibliothèque", 'err');
    return;
  }

  if (entry.needsPath) {
    try {
      const path = await pickContent(core.info.extensions.map((e) => e.replace(/^\./, '')));
      if (!path) return;
      await loadContent(path.split(/[\\/]/).pop() ?? path, new Uint8Array(0), path);
    } catch (error) {
      log(`sélection impossible — ${reason(error)}`, 'err');
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
async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await playerView.requestFullscreen();
  } catch (error) {
    log(`plein écran refusé — ${reason(error)}`, 'err');
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
      log(`${contentName} — réinitialisé`);
      setRunning(true);
    } catch (error) {
      log(`réinitialisation impossible — ${reason(error)}`, 'err');
    }
  },
  save: async () => {
    if (!core) return;
    try {
      savedState = await core.saveState();
      refreshMenus();
      log(`état sauvegardé — ${savedState.length} octets`, 'ok');
    } catch (error) {
      log(`sauvegarde impossible — ${reason(error)}`, 'err');
    }
  },
  restore: async () => {
    if (!core || !savedState) return;
    try {
      await core.loadState(savedState);
      log('état restauré', 'ok');
    } catch (error) {
      log(`restauration impossible — ${reason(error)}`, 'err');
    }
  },
  stop: stopPlaying,

  fullscreen: toggleFullscreen,
  controls: () => openDialog(dialogs.controls),
  settings: () => openDialog(dialogs.settings),
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

function renderAbout(): void {
  aboutBody.replaceChildren();

  const rows: [string, string][] = [
    ['Cœurs installés', catalog.map((candidate) => candidate.label).join(', ') || 'aucun'],
    ['Dossier par défaut', defaultRomsPath || '—'],
    ['Dossiers ajoutés', folders.length ? folders.join('\n') : 'aucun'],
    ['Manette', padIndex >= 0 ? 'branchée' : 'aucune'],
  ];

  for (const [term, detail] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = term;
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
  log(`interpréteur : ${presetSelect.selectedOptions[0]?.text ?? '?'}`);
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
    padStatus.textContent = pad ? `Manette : ${pad.id}` : 'Aucune manette détectée.';
    log(pad ? `manette : ${pad.id}` : 'manette débranchée', pad ? 'ok' : 'info');
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
  if (!running && dialogs.controls.open) sampleInput();
  capturerLiaison();
  naviguerGrille();
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
  log(`${layout.labels[cible] ?? cible} ← ${padButtonName(presse)}`, 'ok');
}

const remapButton = $<HTMLButtonElement>('controls-remap');
const resetBindings = $<HTMLButtonElement>('controls-reset');

remapButton.addEventListener('click', () => {
  remappage = !remappage;
  enAttente = null;
  remapButton.textContent = remappage ? 'Terminer' : 'Réassigner…';
  keypadBox.classList.toggle('remappage', remappage);
  buildKeypad();
});

resetBindings.addEventListener('click', () => {
  if (!liaisons[layout.id]) return;
  enAttente = null;
  poserLiaisons(withoutBindings(liaisons, layout.id));
  log('liaisons de manette remises d’origine');
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
      cell.title = 'pressez le bouton voulu sur la manette';
    } else if (source !== undefined) {
      manette.textContent = padButtonShort(source);
      cell.title = `manette : ${padButtonName(source)}`;
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
  if (inShell) log('interrogation des cœurs installés…');

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
      .catch((error) => log(`recherche des émulateurs interrompue — ${reason(error)}`, 'err'));
  } else {
    log("page web : seuls les cœurs internes sont disponibles, sans bibliothèque");
  }

  placeholderPath.textContent = defaultRomsPath;
  renderFolders();
  renderExternals();

  const first = catalog[0];
  if (first) await selectCore(first);

  await refreshLibrary();
  showLibrary(true);
  refreshMenus();
  log(`${plural(catalog.length, 'cœur')} ${catalog.length > 1 ? 'disponibles' : 'disponible'}`);

  for (const line of discoveryReport) log(`découverte : ${line}`);
  for (const failure of discoveryErrors) {
    log(`découverte interrompue — ${failure}`, 'err');
  }

  if (rejectedCores.length > 0) {
    // Ils ont été chargés dans un processus séparé et s'y sont terminés
    // brutalement — le plus souvent faute d'un contexte graphique matériel.
    const many = rejectedCores.length > 1;
    log(
      `${plural(rejectedCores.length, 'cœur')} écarté${many ? 's' : ''} : ${rejectedCores.join(', ')}`,
      'err',
    );
  }
}

void start();
