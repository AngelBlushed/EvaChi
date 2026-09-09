import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RomEntry } from '../libretro/client.ts';
import type { CatalogEntry } from './catalog.ts';
import { JOYPAD } from './input.ts';
import { coresFor, folderLabel, groupLibrary, hintedCore } from './library.ts';

/** Fabrique un cœur du catalogue. */
function core(id: string, extensions: string[], label = id): CatalogEntry {
  return {
    kind: 'libretro',
    id,
    label,
    extensions,
    layout: JOYPAD,
    needsPath: true,
    async open() {
      throw new Error('sans objet dans les tests');
    },
  };
}

/** Fabrique une entrée de bibliothèque. */
function rom(name: string, folder = ''): RomEntry {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return { name, path: `${folder}/${name}`, extension, size: 1024, folder };
}

/**
 * Le catalogue tel qu'il est réellement installé, réduit aux cœurs qui
 * comptent pour ces cas. Les extensions sont celles que les cœurs déclarent.
 */
const CATALOG: CatalogEntry[] = [
  core('chip8', ['ch8', 'c8'], 'CHIP-8'),
  core('picodrive', ['bin', 'gen', 'smd', 'md', '32x', 'cue', 'iso', 'chd', 'sms', 'gg'], 'PicoDrive'),
  core('mednafen_lynx', ['lnx', 'lyx', 'bll', 'o'], 'Beetle Lynx'),
  core('prosystem', ['a78', 'bin', 'cdf'], 'ProSystem'),
  core('stella', ['a26', 'bin'], 'Stella'),
  core('opera', ['iso', 'bin', 'chd', 'cue'], 'Opera'),
  core('dolphin', ['elf', 'dol', 'gcm', 'iso', 'tgc', 'wbfs'], 'dolphin-emu'),
  core('mgba', ['gba', 'gb', 'gbc', 'sgb'], 'mGBA'),
  core('sameboy', ['gb', 'gbc'], 'SameBoy'),
  core('mesen', ['nes', 'fds', 'unf'], 'Mesen'),
  core('snes9x', ['smc', 'sfc', 'swc', 'fig'], 'Snes9x'),
  core('puae', ['adf', 'adz', 'dms', 'ipf'], 'PUAE'),
  core('vice', ['d64', 'd71', 'd81', 'g64'], 'VICE x64'),
];

const NO_CHOICE = new Map<string, string>();

describe('nom de volet', () => {
  it('retire les formats entre parenthèses', () => {
    assert.equal(folderLabel('3DO (.iso .cue .chd .bin)'), '3DO');
    assert.equal(folderLabel('Nes (nes-fds-unf)'), 'Nes');
    assert.equal(folderLabel('32X (32x)'), '32X');
  });

  it('garde un nom sans parenthèses', () => {
    assert.equal(folderLabel('Dreamcast'), 'Dreamcast');
  });

  it("ne vide pas un nom qui n'est qu'une parenthèse", () => {
    assert.equal(folderLabel('(bin)'), '(bin)');
  });
});

describe('classement en volets', () => {
  it('crée un volet par dossier', () => {
    const games = [
      rom('mario.nes', 'Nes (nes-fds-unf)'),
      rom('zelda.gba', 'Gameboy Advance (gba)'),
      rom('kart.smc', 'Super Nintendo (smc-sfc-swc-fig)'),
    ];

    const shelves = groupLibrary(games, CATALOG, {}, NO_CHOICE, '');
    assert.deepEqual(
      shelves.map((shelf) => shelf.label),
      ['Gameboy Advance', 'Nes', 'Super Nintendo'],
    );
  });

  it("n'affiche un jeu que dans le dossier où il est rangé", () => {
    // Le cas qui motive tout : trois cœurs acceptent `.iso`, mais le fichier
    // est rangé en 3DO et ne doit apparaître que là.
    const games = [rom('jeu.iso', '3DO (.iso .cue .chd .bin)')];
    const shelves = groupLibrary(games, CATALOG, {}, NO_CHOICE, '');

    assert.equal(shelves.length, 1);
    assert.equal(shelves[0].label, '3DO');
    assert.ok(
      shelves[0].candidates.length > 1,
      'plusieurs cœurs restent proposables dans ce volet',
    );
  });

  it('sépare deux dossiers qui partagent une extension', () => {
    const games = [
      rom('jeu3do.iso', '3DO (.iso .cue .chd .bin)'),
      rom('jeugc.iso', 'Gamecube-Wii (iso-gcm-dol-wbfs)'),
    ];

    const shelves = groupLibrary(games, CATALOG, {}, NO_CHOICE, '');
    assert.equal(shelves.length, 2, 'un volet chacun, pas de mélange');
    assert.deepEqual(
      shelves.map((shelf) => shelf.games.length),
      [1, 1],
    );
  });

  it('écarte les fichiers qu’aucun cœur n’ouvre', () => {
    // `.crt` (cartouche Commodore 64) n'est déclaré par aucun cœur installé.
    const games = [
      rom('jeu.crt', 'Commodore 64 (.d64 .d71 .d81 .g64)'),
      rom('disquette.d64', 'Commodore 64 (.d64 .d71 .d81 .g64)'),
    ];

    const shelves = groupLibrary(games, CATALOG, {}, NO_CHOICE, '');
    assert.equal(shelves.length, 1);
    assert.equal(shelves[0].games.length, 1, 'seul le .d64 est jouable');
  });

  it('ne crée aucun volet quand rien n’est ouvrable', () => {
    const games = [rom('jeu.crt', 'Commodore 64 (.d64)')];
    assert.equal(groupLibrary(games, CATALOG, {}, NO_CHOICE, '').length, 0);
  });

  it('range les fichiers de la racine sous leur cœur', () => {
    const games = [rom('perdu.nes'), rom('autre.gba')];
    const shelves = groupLibrary(games, CATALOG, {}, NO_CHOICE, '');

    assert.deepEqual(
      shelves.map((shelf) => shelf.label).sort(),
      ['Mesen', 'mGBA'].sort(),
    );
  });

  it('choisit par défaut le cœur qui ouvre le plus de fichiers du dossier', () => {
    const folder = 'Atari 2600 (.a26 .bin)';
    const games = [rom('a.a26', folder), rom('b.a26', folder), rom('c.bin', folder)];

    const shelves = groupLibrary(games, CATALOG, {}, NO_CHOICE, '');
    // Stella ouvre les trois, ProSystem et PicoDrive seulement le `.bin`.
    assert.equal(shelves[0].preferred, 'stella');
  });

  it('préfère le cœur spécialisé au généraliste, à égalité', () => {
    // Trois cœurs acceptent `.iso`. PicoDrive en déclare dix-huit en tout,
    // Opera quatre : c'est lui qui connaît le format, pas le généraliste.
    const shelves = groupLibrary(
      [rom('jeu.iso', '3DO (.iso .cue .chd .bin)')],
      CATALOG,
      {},
      NO_CHOICE,
      '',
    );
    assert.equal(shelves[0].preferred, 'opera');
  });

  it('laisse le généraliste gagner quand il est seul à savoir', () => {
    // Personne d'autre n'ouvre les `.32x`.
    const shelves = groupLibrary([rom('jeu.32x', '32X (32x)')], CATALOG, {}, NO_CHOICE, '');
    assert.equal(shelves[0].preferred, 'picodrive');
  });

  it('préfère le cœur le plus étroit pour la Game Boy', () => {
    const folder = 'Gameboy-Gameboy Color (gb-gbc)';
    const shelves = groupLibrary(
      [rom('a.gb', folder), rom('b.gbc', folder)],
      CATALOG,
      {},
      NO_CHOICE,
      '',
    );
    // SameBoy n'accepte que gb et gbc ; mGBA en accepte quatre.
    assert.equal(shelves[0].preferred, 'sameboy');
  });

  it('respecte le cœur choisi pour un dossier', () => {
    const folder = '3DO (.iso)';
    const games = [rom('jeu.iso', folder)];

    const shelves = groupLibrary(games, CATALOG, { [folder]: 'opera' }, NO_CHOICE, '');
    assert.equal(shelves[0].preferred, 'opera');
  });

  it('filtre par la recherche sans casser les volets', () => {
    const games = [
      rom('Mario Kart.smc', 'Super Nintendo (smc)'),
      rom('Zelda.gba', 'Gameboy Advance (gba)'),
    ];

    const shelves = groupLibrary(games, CATALOG, {}, NO_CHOICE, 'zelda');
    assert.equal(shelves.length, 1);
    assert.equal(shelves[0].games[0].rom.name, 'Zelda.gba');
  });
});

describe('bibliothèque réelle', () => {
  /** La répartition observée chez l'utilisateur, dossier par dossier. */
  const REAL: [string, string, number][] = [
    ['CHIP-8 (.ch8 .c8)', 'ch8', 103],
    ['Atari Lynx (.lnx .lyx)', 'lnx', 93],
    ['Atari Lynx (.lnx .lyx)', 'lyx', 12],
    ['Atari 7800 (.a78)', 'a78', 70],
    ['32X (32x)', '32x', 31],
    ['Commodore 64 (.d64 .d71 .d81 .g64)', 'crt', 4],
    ['Amiga (.adf .adz .dms .ipf)', 'adf', 3],
    ['Gameboy-Gameboy Color (gb-gbc)', 'gb', 2],
    ['3DO (.iso .cue .chd .bin)', 'iso', 2],
    ['Super Nintendo (smc-sfc-swc-fig)', 'smc', 1],
    ['Nes (nes-fds-unf)', 'nes', 1],
    ['Gameboy-Gameboy Color (gb-gbc)', 'gbc', 1],
    ['Arcade (.zip .7z .chd)', 'chd', 1],
    ['Atari 2600 (.a26 .bin)', 'bin', 1],
    ['Gameboy Advance (gba)', 'gba', 1],
    ['Atari 2600 (.a26 .bin)', 'a26', 1],
  ];

  const games: RomEntry[] = REAL.flatMap(([folder, extension, count]) =>
    Array.from({ length: count }, (_, index) => rom(`jeu${index}.${extension}`, folder)),
  );

  it('produit un volet par dossier peuplé', () => {
    const shelves = groupLibrary(games, CATALOG, {}, NO_CHOICE, '');

    const labels = shelves.map((shelf) => shelf.label);
    for (const expected of [
      '32X',
      '3DO',
      'Amiga',
      'Arcade',
      'Atari 2600',
      'Atari 7800',
      'Atari Lynx',
      'CHIP-8',
      'Gameboy Advance',
      'Gameboy-Gameboy Color',
      'Nes',
      'Super Nintendo',
    ]) {
      assert.ok(labels.includes(expected), `volet manquant : ${expected}`);
    }

    // Le dossier Commodore 64 ne contient que des `.crt`, qu'aucun cœur
    // installé n'accepte : il n'a donc pas de volet, et c'est correct.
    assert.ok(!labels.includes('Commodore 64'), 'un dossier sans jeu jouable ne paraît pas');
    assert.equal(shelves.length, 12, "douze dossiers contiennent des jeux jouables");
  });

  it('donne le bon émulateur à chaque console', () => {
    const shelves = groupLibrary(games, CATALOG, {}, NO_CHOICE, '');
    const choice = (label: string) => shelves.find((shelf) => shelf.label === label)?.preferred;

    assert.equal(choice('3DO'), 'opera', 'pas le généraliste PicoDrive');
    assert.equal(choice('32X'), 'picodrive');
    assert.equal(choice('Atari 2600'), 'stella');
    assert.equal(choice('Atari 7800'), 'prosystem');
    assert.equal(choice('Atari Lynx'), 'mednafen_lynx');
    assert.equal(choice('CHIP-8'), 'chip8');
    assert.equal(choice('Nes'), 'mesen');
    assert.equal(choice('Super Nintendo'), 'snes9x');
    assert.equal(choice('Gameboy Advance'), 'mgba');
    assert.equal(choice('Amiga'), 'puae');
  });

  it('ne perd que les fichiers réellement sans preneur', () => {
    const shelves = groupLibrary(games, CATALOG, {}, NO_CHOICE, '');
    const shown = shelves.reduce((total, shelf) => total + shelf.games.length, 0);

    // Les quatre `.crt` n'ont aucun cœur : tout le reste doit apparaître.
    const playable = games.filter((game) => coresFor(game, CATALOG).length > 0).length;
    assert.equal(shown, playable);
    assert.equal(games.length - shown, 4, 'seuls les .crt sont écartés');
  });
});

/**
 * Les consoles que le seul décompte des formats ne sait pas départager.
 *
 * Le catalogue précédent, réduit, ne contenait pas les cœurs qui se disputent
 * `.iso`, `.chd` et `.cue` — ce qui laissait passer le défaut qu'on cherchait :
 * un dossier « 3DO » attribué à SAME_CDI, un dossier « Arcade » aussi. Celui-ci
 * reproduit la concurrence réelle, avec les extensions que ces cœurs déclarent.
 */
describe('consoles ambiguës', () => {
  const FULL: CatalogEntry[] = [
    core('opera_libretro', ['iso', 'bin', 'chd', 'cue'], 'Opera'),
    core('same_cdi_libretro', ['chd', 'iso', 'cue'], 'SAME_CDI'),
    core('fbneo_libretro', ['zip', '7z', 'cue', 'ccd', 'chd'], 'FinalBurn Neo'),
    core('flycast_libretro', ['chd', 'cdi', 'cue', 'gdi', 'bin', 'iso', 'zip'], 'Flycast'),
    core('mednafen_saturn_libretro', ['cue', 'ccd', 'chd', 'zip'], 'Beetle Saturn'),
    core('mednafen_pce_fast_libretro', ['pce', 'cue', 'ccd', 'chd'], 'Beetle PCE Fast'),
    core('swanstation_libretro', ['cue', 'bin', 'img', 'iso', 'chd', 'pbp'], 'SwanStation'),
    core('ppsspp_libretro', ['elf', 'iso', 'cso', 'prx', 'pbp', 'chd'], 'PPSSPP'),
    core('dolphin_libretro', ['elf', 'dol', 'gcm', 'iso', 'wbfs', 'rvz'], 'dolphin-emu'),
    core('dosbox_pure_libretro', ['zip', 'exe', 'iso', 'chd', 'cue', 'img'], 'DOSBox-pure'),
    core(
      'picodrive_libretro',
      ['bin', 'gen', 'smd', 'md', '32x', 'cue', 'iso', 'chd', 'sms', 'gg'],
      'PicoDrive',
    ),
    core(
      'genesis_plus_gx_libretro',
      ['md', 'gen', 'smd', 'bin', 'cue', 'iso', 'chd', 'sms', 'gg'],
      'Genesis Plus GX',
    ),
    core('mednafen_ngp_libretro', ['ngp', 'ngc', 'ngpc'], 'Beetle NeoPop'),
    core('mgba_libretro', ['gba', 'gb', 'gbc', 'sgb'], 'mGBA'),
    core('sameboy_libretro', ['gb', 'gbc'], 'SameBoy'),
    core('citra_libretro', ['3ds', 'cia', '3dsx'], 'Citra'),
    core('citra2018_libretro', ['3ds', 'cia', '3dsx'], 'Citra2018'),
    core('melonds_libretro', ['nds', 'dsi'], 'melonDS'),
  ];

  /** Un dossier, son contenu, et l'émulateur qu'il doit obtenir. */
  const CASES: [string, string[], string][] = [
    ['3DO (.iso .cue .chd .bin)', ['iso', 'chd'], 'opera_libretro'],
    ['Philips CD-i (.chd .cue .iso)', ['chd', 'cue'], 'same_cdi_libretro'],
    ['Arcade (.zip .7z .chd)', ['chd', 'zip'], 'fbneo_libretro'],
    ['Dreamcast (.gdi .cdi .chd .cue)', ['chd', 'cue'], 'flycast_libretro'],
    ['Saturn (.cue .chd .ccd)', ['chd', 'cue'], 'mednafen_saturn_libretro'],
    ['PC Engine  TurboGrafx (.pce .cue .chd)', ['chd', 'cue'], 'mednafen_pce_fast_libretro'],
    ['PlayStation (.cue .bin .chd .pbp .iso)', ['chd', 'bin'], 'swanstation_libretro'],
    ['PSP (.iso .cso .pbp .elf)', ['iso', 'pbp'], 'ppsspp_libretro'],
    ['Gamecube-Wii (iso-gcm-dol-wbfs)', ['iso', 'wbfs'], 'dolphin_libretro'],
    ['MS-DOS (.zip .exe .iso .conf)', ['zip', 'iso'], 'dosbox_pure_libretro'],
    ['Mega-CD-Sega CD (.cue .chd .iso)', ['chd', 'cue'], 'genesis_plus_gx_libretro'],
    ['Neo Geo Pocket  Color (.ngp .ngc)', ['ngp'], 'mednafen_ngp_libretro'],
    ['Nintendo 3ds (3ds-cia-3dsx)', ['3ds', 'cia'], 'citra_libretro'],
    ['Nintendo Ds (nds-dsi)', ['nds'], 'melonds_libretro'],
    ['Gameboy Advance (gba)', ['gba'], 'mgba_libretro'],
    ['Gameboy-Gameboy Color (gb-gbc)', ['gb', 'gbc'], 'sameboy_libretro'],
    ['32X (32x)', ['32x'], 'picodrive_libretro'],
  ];

  for (const [folder, extensions, expected] of CASES) {
    it(`donne ${expected} à « ${folderLabel(folder)} »`, () => {
      const games = extensions.map((extension, index) => rom(`jeu${index}.${extension}`, folder));
      const [shelf] = groupLibrary(games, FULL, {}, NO_CHOICE, '');

      assert.ok(shelf, 'le dossier doit produire un volet');
      assert.equal(shelf.preferred, expected);
    });
  }

  it('laisse le classement décider quand le nom ne dit rien', () => {
    const games = [rom('jeu.chd', 'Trucs en vrac')];
    const [shelf] = groupLibrary(games, FULL, {}, NO_CHOICE, '');

    assert.ok(shelf.preferred, 'un volet garde toujours un cœur');
    assert.ok(
      shelf.candidates.some((candidate) => candidate.id === shelf.preferred),
      'le cœur retenu doit figurer parmi les candidats',
    );
  });

  it("n'impose rien quand le cœur désigné n'est pas installé", () => {
    const sansOpera = FULL.filter((candidate) => candidate.id !== 'opera_libretro');
    assert.equal(hintedCore('3DO', sansOpera), undefined);
    assert.equal(hintedCore('3DO', FULL), 'opera_libretro');
  });

  it('respecte le choix explicite de l’utilisateur malgré l’indice', () => {
    const folder = '3DO (.iso .cue .chd .bin)';
    const games = [rom('jeu.iso', folder)];
    const [shelf] = groupLibrary(games, FULL, { [folder]: 'flycast_libretro' }, NO_CHOICE, '');

    assert.equal(shelf.preferred, 'flycast_libretro');
  });
});


/**
 * Les consoles servies par un émulateur autonome.
 *
 * Leur nom de dossier contient celui d'une autre console — « PlayStation 2 »
 * contient « playstation », « Wii U » contient « wii » — et leurs formats sont
 * ceux que réclament aussi des cœurs libretro. Sans indice explicite, un jeu PS2
 * partirait chez SwanStation et un titre Wii U chez Dolphin.
 */
describe('consoles à émulateur autonome', () => {
  /** Fabrique une entrée d'émulateur autonome, telle que le catalogue la crée. */
  function external(system: string, extensions: string[]): CatalogEntry {
    return {
      kind: 'externe',
      id: `externe:${system}`,
      label: system,
      extensions,
      layout: JOYPAD,
      needsPath: true,
      async open() {
        throw new Error('un émulateur externe se lance, il ne s’héberge pas');
      },
    };
  }

  const MIXED: CatalogEntry[] = [
    core('dolphin_libretro', ['elf', 'dol', 'gcm', 'iso', 'wbfs', 'wad', 'rvz'], 'dolphin-emu'),
    core('swanstation_libretro', ['cue', 'bin', 'img', 'iso', 'chd', 'pbp'], 'SwanStation'),
    core('flycast_libretro', ['chd', 'cdi', 'cue', 'iso', 'bin'], 'Flycast'),
    core('dosbox_pure_libretro', ['zip', 'exe', 'iso', 'chd', 'cue'], 'DOSBox-pure'),
    core('opera_libretro', ['iso', 'bin', 'chd', 'cue'], 'Opera'),
    external('Nintendo Switch', ['nsp', 'xci', 'nca', 'nro', 'nso']),
    external('Wii U', ['wud', 'wux', 'wua', 'rpx', 'wad']),
    external('PlayStation 2', ['iso', 'chd', 'cso', 'bin', 'mdf', 'nrg']),
    external('Xbox 360', ['iso', 'xex', 'zar']),
    external('Xbox', ['iso', 'xiso']),
    external('PS Vita', ['vpk']),
  ];

  /** Le dossier tel qu'il existe sur le disque, et l'émulateur qu'il doit obtenir. */
  const CASES: [string, string[], string][] = [
    ['Nintendo Switch (.nsp .xci .nca .nro .nso)', ['xci', 'nsp'], 'externe:Nintendo Switch'],
    ['Wii U (.wud .wux .wua .rpx .wad)', ['wad', 'wux'], 'externe:Wii U'],
    ['PlayStation 2 (.iso .chd .cso .bin .mdf .nrg)', ['iso', 'chd'], 'externe:PlayStation 2'],
    ['Xbox 360 (.iso .xex .zar)', ['iso', 'xex'], 'externe:Xbox 360'],
    ['Xbox (.iso .xiso)', ['iso'], 'externe:Xbox'],
    ['PS Vita (.vpk)', ['vpk'], 'externe:PS Vita'],
  ];

  for (const [folder, extensions, expected] of CASES) {
    it(`confie « ${folderLabel(folder)} » à ${expected}`, () => {
      const games = extensions.map((extension, index) => rom(`jeu${index}.${extension}`, folder));
      const [shelf] = groupLibrary(games, MIXED, {}, NO_CHOICE, '');

      assert.ok(shelf, 'le dossier doit produire un volet');
      assert.equal(shelf.preferred, expected);
    });
  }

  it('ne détourne pas les consoles voisines', () => {
    // « wii u » ne doit pas manger « Gamecube-Wii », ni « playstation 2 »
    // manger « PlayStation ».
    const voisins: [string, string, string][] = [
      ['Gamecube-Wii (iso-gcm-dol-wbfs)', 'iso', 'dolphin_libretro'],
      ['PlayStation (.cue .bin .chd .pbp .iso)', 'bin', 'swanstation_libretro'],
    ];

    for (const [folder, extension, expected] of voisins) {
      const [shelf] = groupLibrary([rom(`jeu.${extension}`, folder)], MIXED, {}, NO_CHOICE, '');
      assert.equal(shelf.preferred, expected, folder);
    }
  });

  it("laisse le classement décider quand l'émulateur n'est pas déclaré", () => {
    // Sans l'entrée externe, un `.iso` rangé en PS2 reste ouvrable par les cœurs
    // qui acceptent ce format : mieux vaut un volet imparfait qu'un jeu invisible.
    const sansPs2 = MIXED.filter((candidate) => candidate.id !== 'externe:PlayStation 2');
    const folder = 'PlayStation 2 (.iso .chd .cso .bin .mdf .nrg)';
    const [shelf] = groupLibrary([rom('jeu.iso', folder)], sansPs2, {}, NO_CHOICE, '');

    assert.ok(shelf, 'le jeu ne doit pas disparaître');
    assert.ok(
      shelf.candidates.some((candidate) => candidate.id === shelf.preferred),
      'le cœur retenu doit figurer parmi les candidats',
    );
  });

  it('respecte le choix explicite malgré l’indice', () => {
    const folder = 'Wii U (.wud .wux .wua .rpx .wad)';
    const [shelf] = groupLibrary(
      [rom('jeu.wad', folder)],
      MIXED,
      { [folder]: 'dolphin_libretro' },
      NO_CHOICE,
      '',
    );

    assert.equal(shelf.preferred, 'dolphin_libretro');
  });
});
