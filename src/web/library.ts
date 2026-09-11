/**
 * Classement de la bibliothèque en volets.
 *
 * Isolé de l'interface et testé à part : c'est la seule règle qui décide où
 * apparaît un jeu, et une erreur ici se voit comme une bibliothèque presque
 * vide sans qu'on sache pourquoi.
 */

import type { RomEntry } from '../libretro/client.ts';
import type { CatalogEntry } from './catalog.ts';

/** Un jeu et les cœurs capables de l'ouvrir. */
export interface Playable {
  readonly rom: RomEntry;
  readonly cores: CatalogEntry[];
}

/** Un volet de la bibliothèque : une console, ses jeux, son émulateur. */
export interface Shelf {
  /** Clé stable, pour retenir le repli et le cœur choisi. */
  readonly key: string;
  readonly label: string;
  readonly games: Playable[];
  /** Cœurs capables d'ouvrir au moins un jeu du volet. */
  readonly candidates: CatalogEntry[];
  /** Cœur retenu pour ce volet. */
  readonly preferred: string | undefined;
}

/** Les cœurs installés capables d'ouvrir ce fichier. */
export function coresFor(rom: RomEntry, catalog: readonly CatalogEntry[]): CatalogEntry[] {
  return catalog.filter((candidate) => candidate.extensions.includes(rom.extension));
}

/**
 * Nettoie un nom de dossier pour l'affichage.
 *
 * Les dossiers bien rangés portent souvent leurs formats entre parenthèses —
 * « 3DO (.iso .cue .chd) ». C'est utile dans l'explorateur, superflu ici.
 */
export function folderLabel(folder: string): string {
  return folder.replace(/\s*[([][^)\]]*[)\]]\s*$/, '').trim() || folder;
}

/**
 * L'émulateur qui convient à une console, quand son nom se lit dans le dossier.
 *
 * Le classement par nombre de fichiers ouverts ne suffit pas à départager des
 * cœurs qui acceptent les mêmes formats. Un dossier « 3DO » ne contient que des
 * `.iso` et des `.chd` — formats qu'une dizaine de cœurs déclarent — et c'est le
 * hasard du décompte qui tranchait, désignant parfois un cœur prévu pour une
 * tout autre machine. Le nom que l'utilisateur a donné au dossier dit la
 * console : c'est le renseignement le plus sûr, et il passe donc avant.
 *
 * L'ordre compte : « neo geo pocket » doit être essayé avant « neo geo », et
 * « gameboy advance » avant « gameboy ».
 */
const SYSTEM_HINTS: readonly (readonly [string, string])[] = [
  // Les consoles servies par un emulateur autonome viennent en premier. Sans
  // cela le nom du dossier trahit son contenu : « PlayStation 2 » contient
  // « playstation » et partirait chez SwanStation, « Wii U » contient « wii »
  // et partirait chez Dolphin — qui accepte justement les `.iso` et les `.wad`.
  ['nintendo 3ds', 'externe:Nintendo 3DS'],
  ['3ds', 'externe:Nintendo 3DS'],
  ['nintendo switch', 'externe:Nintendo Switch'],
  ['switch', 'externe:Nintendo Switch'],
  ['wii u', 'externe:Wii U'],
  ['wiiu', 'externe:Wii U'],
  ['playstation 2', 'externe:PlayStation 2'],
  ['ps2', 'externe:PlayStation 2'],
  ['xbox 360', 'externe:Xbox 360'],
  ['xbox360', 'externe:Xbox 360'],
  ['xbox', 'externe:Xbox'],
  ['ps vita', 'externe:PS Vita'],
  ['psvita', 'externe:PS Vita'],
  ['vita', 'externe:PS Vita'],
  ['3do', 'opera'],
  ['neo geo pocket', 'mednafen_ngp'],
  ['neo geo', 'fbneo'],
  ['arcade', 'fbneo'],
  ['mame', 'fbneo'],
  ['gameboy advance', 'mgba'],
  ['game boy advance', 'mgba'],
  ['gba', 'mgba'],
  ['gameboy', 'sameboy'],
  ['game boy', 'sameboy'],
  ['game watch', 'gw'],
  // Repli quand l'emulateur autonome n'est pas installe : le coeur Azahar
  // ouvre les cartouches, mais pas les paquets .cia.
  ['3ds', 'azahar'],
  ['nintendo ds', 'melonds'],
  ['nds', 'melonds'],
  ['nintendo 64', 'mupen64plus_next'],
  ['n64', 'mupen64plus_next'],
  ['super nintendo', 'snes9x'],
  ['snes', 'snes9x'],
  ['nes', 'mesen'],
  ['famicom', 'mesen'],
  ['gamecube', 'dolphin'],
  ['wii', 'dolphin'],
  ['virtual boy', 'mednafen_vb'],
  ['playstation', 'swanstation'],
  ['ps1', 'swanstation'],
  ['psx', 'swanstation'],
  ['psp', 'ppsspp'],
  ['saturn', 'mednafen_saturn'],
  ['dreamcast', 'flycast'],
  ['mega cd', 'genesis_plus_gx'],
  ['sega cd', 'genesis_plus_gx'],
  ['mega drive', 'genesis_plus_gx'],
  ['genesis', 'genesis_plus_gx'],
  ['master system', 'genesis_plus_gx'],
  ['game gear', 'genesis_plus_gx'],
  ['32x', 'picodrive'],
  ['pc engine', 'mednafen_pce_fast'],
  ['turbografx', 'mednafen_pce_fast'],
  ['wonderswan', 'mednafen_wswan'],
  ['atari 2600', 'stella'],
  ['atari 7800', 'prosystem'],
  ['atari 800', 'atari800'],
  ['atari 5200', 'atari800'],
  ['jaguar', 'virtualjaguar'],
  ['lynx', 'mednafen_lynx'],
  ['intellivision', 'freeintv'],
  ['vectrex', 'vecx'],
  ['amiga', 'puae'],
  ['commodore', 'vice_x64'],
  ['c64', 'vice_x64'],
  ['amstrad', 'cap32'],
  ['cpc', 'cap32'],
  ['zx spectrum', 'fuse'],
  ['spectrum', 'fuse'],
  ['msx', 'bluemsx'],
  ['colecovision', 'bluemsx'],
  ['x68000', 'px68k'],
  ['pc 98', 'np2kai'],
  ['thomson', 'theodore'],
  ['ms dos', 'dosbox_pure'],
  ['dos', 'dosbox_pure'],
  ['scummvm', 'scummvm'],
  ['point click', 'scummvm'],
  ['chip 8', 'chip8'],
];

/** Réduit un nom de dossier à des mots comparables : minuscules, sans accents. */
function words(label: string): string {
  return ` ${label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

/**
 * L'émulateur que le nom du dossier désigne, s'il est parmi les candidats.
 *
 * Rend `undefined` dès que le nom ne dit rien ou que le cœur voulu n'est pas
 * installé : le classement habituel reprend alors la main.
 */
export function hintedCore(label: string, candidates: readonly CatalogEntry[]): string | undefined {
  // Les identifiants viennent du nom de la bibliothèque installée, d'où le
  // suffixe. Le retirer laisse le nom du cœur lui-même — « opera », « fbneo » —
  // qui est ce que le tableau désigne. `citra2018` reste distinct de `citra`.
  const named = (id: string) => id.replace(/_libretro$/, '');

  const haystack = words(label);
  for (const [keyword, core] of SYSTEM_HINTS) {
    if (!haystack.includes(` ${keyword} `)) continue;
    const match = candidates.find((candidate) => named(candidate.id) === core);
    if (match) return match.id;
  }
  return undefined;
}

/** Le cœur qui ouvrira ce jeu : le choix explicite, sinon celui du volet. */
export function effectiveCore(
  rom: RomEntry,
  cores: CatalogEntry[],
  chosen?: ReadonlyMap<string, string>,
  preferred?: string,
): CatalogEntry {
  const wanted = chosen?.get(rom.path) ?? preferred;
  return cores.find((candidate) => candidate.id === wanted) ?? cores[0];
}

/**
 * Range les jeux en volets, un par dossier.
 *
 * Le classement de l'utilisateur fait loi : une image `.iso` dans un dossier
 * « 3DO » est un jeu 3DO, et n'a rien à faire sous GameCube même si Dolphin
 * accepte aussi les `.iso`. Un fichier laissé à la racine n'a personne pour le
 * classer : il se range alors sous le cœur qui l'ouvrira.
 *
 * @param needle recherche en cours, en minuscules ; vide pour tout garder.
 */
export function groupLibrary(
  games: readonly RomEntry[],
  catalog: readonly CatalogEntry[],
  folderCores: Readonly<Record<string, string>>,
  chosen: ReadonlyMap<string, string>,
  needle: string,
): Shelf[] {
  const playable: Playable[] = games
    .map((rom) => ({ rom, cores: coresFor(rom, catalog) }))
    .filter(({ cores }) => cores.length > 0)
    .filter(({ rom }) => !needle || rom.name.toLowerCase().includes(needle));

  const grouped = new Map<string, { label: string; games: Playable[] }>();
  for (const item of playable) {
    const fallback = effectiveCore(item.rom, item.cores, chosen);
    const key = item.rom.folder || ` ${fallback.id}`;
    const label = item.rom.folder ? folderLabel(item.rom.folder) : fallback.label;

    const shelf = grouped.get(key) ?? { label, games: [] };
    shelf.games.push(item);
    grouped.set(key, shelf);
  }

  const shelves: Shelf[] = [];
  for (const [key, shelf] of grouped) {
    const candidates = catalog.filter((candidate) =>
      shelf.games.some(({ cores }) => cores.some((core) => core.id === candidate.id)),
    );

    // À défaut de choix : le cœur qui ouvre le plus de fichiers du dossier et,
    // à égalité, le plus spécialisé.
    //
    // La seconde règle compte autant que la première. PicoDrive déclare dix-huit
    // extensions — `bin`, `iso`, `chd`, `cue`… — et gagnait donc partout par
    // accident : en 3DO, en arcade, en Atari 2600. Un cœur qui n'accepte que
    // quatre formats en sait plus long sur eux qu'un généraliste.
    const reach = (core: CatalogEntry) =>
      shelf.games.filter(({ cores }) => cores.some((c) => c.id === core.id)).length;
    const ranked = [...candidates].sort(
      (a, b) => reach(b) - reach(a) || a.extensions.length - b.extensions.length,
    );

    // Un fichier laissé en vrac n'a pas de dossier pour le nommer : son volet
    // porte le nom du cœur, qui ne renseigne sur rien.
    const named = !key.startsWith(' ');

    shelves.push({
      key,
      label: shelf.label,
      games: shelf.games,
      candidates,
      preferred:
        folderCores[key] ??
        (named ? hintedCore(shelf.label, candidates) : undefined) ??
        ranked[0]?.id,
    });
  }

  return shelves.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}
