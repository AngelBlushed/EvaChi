/**
 * Le rapprochement des jaquettes.
 *
 * Mesuré sur une bibliothèque réelle, un rapprochement exact trouve moins de
 * quatre jaquettes sur dix ; ce rapprochement-ci en trouve huit et demie. Tout
 * se joue dans la réduction du titre, et ces épreuves en fixent les règles.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { chooseCover, coverUrl, index, normalise, regions, thumbnailFolders } from './covers.ts';

describe('réduction d’un titre', () => {
  it('laisse tomber l’extension', () => {
    assert.equal(normalise('Sonic.md'), 'sonic');
  });

  it('laisse tomber la région et les marques de version', () => {
    // Ce sont elles qui diffèrent d'un jeu de noms à l'autre : (NA) chez
    // Atari, (U) et [!] dans les vieux jeux, (USA) dans les récents.
    // Ce qui compte n'est pas la forme obtenue mais que les deux côtés se
    // rejoignent : c'est là-dessus que le rapprochement repose.
    assert.equal(normalise('A.P.B. (NA).lnx'), normalise('A.P.B. (USA, Europe).png'));
    assert.equal(normalise('A.P.B. (NA).lnx'), 'a p b');
    assert.equal(normalise('Super Mario Kart (U) [!].sfc'), 'super mario kart');
  });

  it('laisse tomber le numéro de piste et le code éditeur', () => {
    assert.equal(
      normalise('Rayman 2 - The Great Escape (E) (En,Es,It) (Track 1) [SLES-02906].bin'),
      normalise('Rayman 2 - The Great Escape (Europe) (En,Es,It).png'),
    );
  });

  it('ne touche pas aux articles', () => {
    // On a essayé de les retirer pour rejoindre « Legend of Zelda, The » et
    // « The Legend of Zelda ». Le remède était pire : « A.P.B. » perdait son
    // A initial et devenait « p b ». Les deux jeux de noms écrivent de toute
    // façon l'article du même côté.
    assert.equal(normalise('Legend of Zelda, The - The Minish Cap (U).gba'), normalise('Legend of Zelda, The - The Minish Cap (USA).png'));
    assert.equal(normalise('A Bug’s Life (USA).bin'), 'a bug s life');
  });

  it('ignore les accents et la ponctuation', () => {
    assert.equal(normalise('Astérix & Obélix'), 'asterix obelix');
  });
});

describe('régions annoncées', () => {
  it('ramène les abréviations à une étiquette commune', () => {
    assert.deepEqual([...regions('A.P.B. (NA)')], ['usa']);
    assert.deepEqual([...regions('Doom (U) [!]')], ['usa']);
    assert.deepEqual([...regions('Sonic (Japan)')], ['japan']);
  });

  it('en relève plusieurs quand le nom en porte plusieurs', () => {
    assert.deepEqual([...regions('Sonic The Hedgehog (USA, Europe)')].sort(), ['europe', 'usa']);
  });

  it('ne relève rien quand le nom n’en annonce pas', () => {
    assert.equal(regions('Sonic The Hedgehog').size, 0);
  });
});

describe('choix d’une jaquette', () => {
  const disponibles = index('Sega - 32X', [
    'Sonic The Hedgehog (USA, Europe)',
    'Sonic The Hedgehog (Japan)',
    'Doom (Europe)',
    'Doom (Japan, USA) (En) (Beta) (1994-09-06)',
  ]);

  it('préfère le nom exact quand il existe', () => {
    assert.equal(chooseCover(disponibles, 'Doom (Europe).32x')?.name, 'Doom (Europe)');
  });

  it('rapproche par le titre quand la région diffère', () => {
    assert.equal(
      chooseCover(disponibles, 'Sonic The Hedgehog (USA).md')?.name,
      'Sonic The Hedgehog (USA, Europe)',
    );
  });

  it('dit de quel dossier vient la jaquette', () => {
    // Un volet réunit parfois deux machines : construire l'adresse avec le
    // premier dossier venu donnait une image introuvable chaque fois que la
    // jaquette venait du second. C'est ce qui vidait tout le volet PC Engine.
    const deux = [
      ...index('NEC - PC Engine - TurboGrafx 16', ['Bomberman (Japan)']),
      ...index('NEC - PC Engine CD - TurboGrafx-CD', ['1552 Tenka Tairan (Japan)']),
    ];
    assert.equal(
      chooseCover(deux, '1552 Tenka Tairan (Japan) (Track 01).bin')?.folder,
      'NEC - PC Engine CD - TurboGrafx-CD',
    );
  });

  it('prend le nom le plus court quand plusieurs conviennent', () => {
    // Les autres portent « Beta », « Proto » ou une date : l'édition
    // ordinaire est presque toujours celle au nom le plus court.
    assert.equal(chooseCover(disponibles, 'Doom (Allemagne).32x')?.name, 'Doom (Europe)');
  });

  it('ne rend rien plutôt qu’une jaquette au hasard', () => {
    assert.equal(chooseCover(disponibles, 'Un Jeu Qui N’Existe Pas.md'), null);
    assert.equal(chooseCover([], 'Doom (Europe).32x'), null);
  });

  it('ne rend rien pour un nom qui se réduit à rien', () => {
    assert.equal(chooseCover(disponibles, '(USA).bin'), null);
  });
});

describe('rapprochement approximatif', () => {
  // Les cas qui laissaient une case vide alors que la jaquette existait.
  const nes = index('Nintendo - Nintendo Entertainment System', [
    'Mega Man (USA)',
    'Mega Man 2 (USA)',
    'Mega Man 3 (USA)',
    'Castlevania (USA)',
    'Castlevania II - Simon’s Quest (USA)',
    'Super Mario Bros. (World)',
    'Bomberman (USA)',
    'Zelda II - The Adventure of Link (USA)',
  ]);

  it('se moque des espaces manquants', () => {
    // C'est le cas qui revient le plus : les fichiers d'une collection
    // écrivent « megaman », les jeux de noms officiels « Mega Man ».
    assert.equal(chooseCover(nes, 'megaman.nes')?.name, 'Mega Man (USA)');
    assert.equal(chooseCover(nes, 'MegaMan2.nes')?.name, 'Mega Man 2 (USA)');
    assert.equal(chooseCover(nes, 'Bomber Man.nes')?.name, 'Bomberman (USA)');
  });

  it('accepte qu’un titre commence par l’autre', () => {
    assert.equal(chooseCover(nes, 'Castlevania II.nes')?.name, 'Castlevania (USA)');
  });

  it('préfère se tromper de peu que ne rien montrer', () => {
    // « Mega Man 6 » n'est pas là ; sa boîte manquera, mais la grille
    // continuera de ressembler à une grille de jeux.
    assert.equal(chooseCover(nes, 'Mega Man 6.nes')?.name, 'Mega Man (USA)');
  });

  it('rejoint deux écritures d’un même titre', () => {
    // Ce que les deux ont en commun n'est pas au début du nom : c'est la
    // ressemblance d'ensemble qui les réunit.
    assert.equal(
      chooseCover(nes, 'Zelda II - Adventure of Link.nes')?.name,
      'Zelda II - The Adventure of Link (USA)',
    );
  });

  it('ne rapproche pas deux jeux qui n’ont que le début en commun', () => {
    // « Superman » et « Super Mario Bros. » partagent « super » : cinq
    // lettres, mais pas la moitié du plus court. On préfère la case vide.
    assert.equal(chooseCover(nes, 'Superman.nes'), null);
    assert.equal(chooseCover(nes, 'Tetris.nes'), null);
  });

  it('ne joue pas à ce jeu-là sur un titre trop court', () => {
    // Sur trois lettres, tout ressemble à tout.
    assert.equal(chooseCover(nes, 'Zzz.nes'), null);
  });
});

describe('dossiers de vignettes', () => {
  it('trouve le dossier d’un volet nommé comme une console', () => {
    assert.deepEqual(thumbnailFolders('Mega Drive-Genesis'), ['Sega - Mega Drive - Genesis']);
    assert.deepEqual(thumbnailFolders('Nes'), ['Nintendo - Nintendo Entertainment System']);
  });

  it('en propose deux quand le volet réunit deux machines', () => {
    assert.equal(thumbnailFolders('Gameboy-Gameboy Color').length, 2);
    assert.equal(thumbnailFolders('Master System-Game Gear').length, 2);
  });

  it('respecte l’ordre des noms qui se contiennent', () => {
    // « Neo Geo Pocket » contient « Neo Geo », « Game Boy Advance » contient
    // « Game Boy » : le plus précis doit être essayé le premier.
    assert.deepEqual(thumbnailFolders('Neo Geo Pocket  Color'), [
      'SNK - Neo Geo Pocket Color',
      'SNK - Neo Geo Pocket',
    ]);
    assert.deepEqual(thumbnailFolders('Gameboy Advance'), ['Nintendo - Game Boy Advance']);
    assert.deepEqual(thumbnailFolders('Xbox 360'), ['Microsoft - Xbox 360']);
  });

  it('ne rend rien pour un volet inconnu', () => {
    assert.deepEqual(thumbnailFolders('Machine Imaginaire'), []);
  });
});

describe('adresse d’une jaquette', () => {
  it('échappe le nom du dossier et celui du jeu', () => {
    const url = coverUrl('Sega - 32X', 'Doom (Europe)');
    assert.ok(url.startsWith('https://thumbnails.libretro.com/'));
    assert.ok(url.includes('Sega%20-%2032X'));
    assert.ok(url.endsWith('Doom%20(Europe).png'));
  });
});
