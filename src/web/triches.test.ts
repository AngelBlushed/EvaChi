/**
 * Les fiches de triche, et le rapprochement sévère.
 *
 * C'est ici que se joue la promesse : une fiche proposée doit aller au jeu, et
 * dans le doute il ne faut rien proposer du tout. Ces épreuves sont donc
 * écrites à l'envers des autres — elles disent surtout ce qu'il faut refuser.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  correspond,
  editionsDe,
  fichesPour,
  lireFiche,
  regionsDe,
  revisionDe,
} from './triches.ts';

describe('la lecture d’une fiche', () => {
  it('découpe les triches dans l’ordre, sans toucher aux codes', () => {
    // Le format réel du projet libretro, avec son dialecte de NES : le code
    // doit ressortir intact, ponctuation comprise. On ne le décode pas.
    const fiche = `cheats = 3

cheat0_desc = "Always Big"
cheat0_code = "0754:00+0756:01"
cheat0_enable = false

cheat1_desc = "Totally Invincible"
cheat1_code = "079E:07"
cheat1_enable = false
`;
    assert.deepEqual(lireFiche(fiche), [
      { nom: 'Always Big', code: '0754:00+0756:01' },
      { nom: 'Totally Invincible', code: '079E:07' },
    ]);
  });

  it('accepte une description qui court sur plusieurs lignes', () => {
    // Certaines expliquent une manipulation, et le guillemet ne se referme
    // qu'une ou deux lignes plus bas. Se fier aux fins de ligne les coupait.
    const fiche = `cheat0_desc = "Justifier l'écran
avec Select et les flèches"
cheat0_code = "E00C954C+1100"
`;
    assert.deepEqual(lireFiche(fiche), [
      { nom: "Justifier l'écran avec Select et les flèches", code: 'E00C954C+1100' },
    ]);
  });

  it('écarte ce qui n’a pas de code', () => {
    // Une triche sans code ne ferait rien. L'afficher serait promettre ce qui
    // n'arrivera pas — et laisser croire que c'est la triche qui est ratée.
    const fiche = `cheat0_desc = "Sans code"
cheat1_desc = "Avec code"
cheat1_code = "7E0DBF63"
`;
    assert.deepEqual(lireFiche(fiche), [{ nom: 'Avec code', code: '7E0DBF63' }]);
  });

  it('donne un nom à celle qui n’en a pas', () => {
    assert.deepEqual(lireFiche('cheat0_code = "ABCD"'), [{ nom: '#1', code: 'ABCD' }]);
  });

  it('survit à un fichier qui n’en est pas un', () => {
    for (const texte of ['', 'n’importe quoi', '\0\0\0', 'cheats = 40000']) {
      assert.deepEqual(lireFiche(texte), []);
    }
  });
});

describe('ce qu’un nom annonce', () => {
  it('reconnaît les régions, y compris celles que les fiches emploient', () => {
    assert.deepEqual([...regionsDe('Sonic (USA)')], ['usa']);
    assert.deepEqual([...regionsDe('Sonic (NA)')], ['usa']);
    assert.deepEqual([...regionsDe('Sonic [EU]')], ['europe']);
    assert.deepEqual([...regionsDe('Sonic (Japan)')], ['japan']);
    assert.deepEqual([...regionsDe('Sonic')], []);
  });

  it('reconnaît les révisions', () => {
    assert.equal(revisionDe('Sonic (USA) (Rev A)'), 'a');
    assert.equal(revisionDe('Gran Turismo (USA) (v1.1)'), '1.1');
    assert.equal(revisionDe('Sonic (USA)'), '');
  });

  it('distingue une autre édition d’un simple appareil à triches', () => {
    // « (GameShark) » dit d'où viennent les codes, pas quel jeu c'est. Le
    // prendre pour une édition écarterait la moitié des fiches.
    assert.deepEqual([...editionsDe('Zelda (USA) (Demo)')], ['demo']);
    assert.deepEqual([...editionsDe('Zelda (USA) (GameShark)')], []);
    assert.deepEqual([...editionsDe('Zelda (USA) (Code Breaker)')], []);
    assert.deepEqual([...editionsDe('Alien Brigade (Rumbles)')], []);
    assert.deepEqual([...editionsDe('SNK vs Capcom [T-En by CFC2]')], ['traduction']);
  });
});

describe('le rapprochement d’un jeu et d’une fiche', () => {
  it('accepte le même jeu, à la région près quand l’une se tait', () => {
    assert.ok(correspond('Super Mario Kart (U) [!].smc', 'Super Mario Kart (USA)'));
    assert.ok(correspond('Alien Brigade (NA).a78', 'Alien Brigade'));
    assert.ok(correspond('Sonic The Hedgehog (USA, Europe).md', 'Sonic The Hedgehog (USA, Europe)'));
  });

  it('refuse un titre seulement ressemblant', () => {
    // Le rapprochement souple des jaquettes mariait « After Burner » à
    // « After Burner Complete ». Pour une image, c'est sans conséquence ; pour
    // des adresses mémoire, ce sont deux programmes différents.
    assert.ok(!correspond('After Burner (USA).32x', 'After Burner Complete _ After Burner (Japan, USA)'));
    assert.ok(!correspond('Doom (Europe).chd', 'Doom II (USA)'));
    assert.ok(!correspond('', 'Doom (USA)'));
  });

  it('refuse une région qui en contredit une autre', () => {
    // Le cas qu'on veut rendre impossible : des codes européens sur une
    // cartouche japonaise. Ce ne sont pas les mêmes adresses.
    assert.ok(!correspond('Cool Cool Toon (Japan).cue', 'Cool Cool Toon (Europe)'));
    assert.ok(!correspond('Doom (Europe).chd', 'Doom (USA)'));
    // Une édition mondiale, elle, est la même partout.
    assert.ok(correspond('Sonic 2 (World).md', 'Sonic 2 (Europe)'));
  });

  it('refuse une autre révision', () => {
    assert.ok(!correspond('Sonic (USA) (Rev A).md', 'Sonic (USA)'));
    assert.ok(!correspond('Sonic (USA).md', 'Sonic (USA) (Rev A)'));
    assert.ok(correspond('Sonic (USA) (Rev A).md', 'Sonic (USA) (Rev A)'));
  });

  it('refuse une démonstration, une version d’essai, une traduction', () => {
    // Trois marques relevées dans la vraie base, sur de vraies fiches.
    assert.ok(
      !correspond(
        'Legend of Zelda, The - The Minish Cap (U).gba',
        'Legend of Zelda, The - The Minish Cap (USA) (Demo) (Code Breaker)',
      ),
    );
    assert.ok(!correspond('Metroid (USA).nes', 'Metroid (USA) (Beta)'));
    assert.ok(
      !correspond(
        'SNK vs. Capcom (Japan) [T-En by CFC2].ngc',
        'SNK vs. Capcom (Japan)',
      ),
    );
    // Mais l'appareil à triches n'est pas une édition.
    assert.ok(correspond('Metroid (USA).nes', 'Metroid (USA) (GameShark)'));
  });
});

describe('les fiches d’un jeu', () => {
  const base = [
    'Metroid (USA)',
    'Metroid (USA) (GameShark)',
    'Metroid (Japan)',
    'Metroid II (USA)',
    'Metroid (USA) (Demo)',
  ];

  it('les rend toutes, la plus explicite d’abord', () => {
    // Un même jeu a souvent une fiche par appareil : elles se complètent, et
    // il n'y a aucune raison d'en écarter une qui a passé les quatre épreuves.
    assert.deepEqual(fichesPour('Metroid (USA).nes', base), [
      'Metroid (USA)',
      'Metroid (USA) (GameShark)',
    ]);
  });

  it('ne rend rien plutôt que n’importe quoi', () => {
    // C'est la réponse qu'on préfère : « il n'y a rien pour ce jeu ». Un jeu
    // sans triche déçoit une fois ; une triche qui abîme une partie fait
    // douter de tout le reste.
    assert.deepEqual(fichesPour('Metroid Prime (USA).iso', base), []);
    assert.deepEqual(fichesPour('Metroid (Europe).nes', base), []);
    assert.deepEqual(fichesPour('Metroid (USA).nes', []), []);
  });

  it('préfère une région annoncée des deux côtés', () => {
    const melange = ['Contra', 'Contra (USA)'];
    assert.deepEqual(fichesPour('Contra (USA).nes', melange), ['Contra (USA)', 'Contra']);
  });
});
