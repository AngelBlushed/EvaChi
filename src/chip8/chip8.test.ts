import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Chip8 } from './chip8.ts';
import { COSMAC_VIP, SUPER_CHIP } from './quirks.ts';
import type { Quirks } from './quirks.ts';

const NO_KEYS: boolean[] = new Array(16).fill(false);

/** Assemble une suite d'opcodes 16 bits en ROM chargeable. */
function rom(...opcodes: number[]): Uint8Array {
  const bytes = new Uint8Array(opcodes.length * 2);
  opcodes.forEach((op, index) => {
    bytes[index * 2] = (op >> 8) & 0xff;
    bytes[index * 2 + 1] = op & 0xff;
  });
  return bytes;
}

/** Monte une machine sur la ROM donnée et exécute `steps` instructions. */
function run(opcodes: number[], steps: number, quirks?: Partial<Quirks>): Chip8 {
  const machine = new Chip8({ quirks, seed: 12345 });
  machine.load(rom(...opcodes));
  for (let s = 0; s < steps; s += 1) machine.step();
  return machine;
}

/** Nombre de pixels allumés à l'écran. */
function litPixels(machine: Chip8): number {
  return machine.getDisplay().reduce((count, pixel) => count + pixel, 0);
}

describe('amorçage', () => {
  it('charge la police à $050 et démarre le programme à $200', () => {
    const machine = run([0x1200], 0);
    assert.equal(machine.getPC(), 0x200);
    assert.equal(machine.peek(0x050), 0xf0, 'premier octet du glyphe 0');
    assert.equal(machine.peek(0x09f), 0x80, 'dernier octet du glyphe F');
    assert.equal(machine.peek(0x200), 0x12, 'premier octet de la ROM');
  });

  it('refuse une ROM trop grosse pour la mémoire adressable', () => {
    const machine = new Chip8();
    assert.throws(() => machine.load(new Uint8Array(4096 - 0x200 + 1)), /n'en adresse que/);
  });

  it('refuse une ROM vide', () => {
    const machine = new Chip8();
    assert.throws(() => machine.load(new Uint8Array(0)), /ROM vide/);
  });
});

describe('flot de contrôle', () => {
  it('1NNN saute à l\'adresse absolue', () => {
    assert.equal(run([0x1234], 1).getPC(), 0x234);
  });

  it('2NNN empile l\'adresse de retour, 00EE la dépile', () => {
    // $200 appelle $204 ; $204 contient un retour ; on revient donc en $202.
    const machine = run([0x2204, 0x0000, 0x00ee], 2);
    assert.equal(machine.getPC(), 0x202);
  });

  it('3XNN saute l\'instruction suivante quand la valeur correspond', () => {
    const machine = run([0x6042, 0x3042], 2); // V0 = 0x42 ; V0 == 0x42 ?
    assert.equal(machine.getPC(), 0x206);
  });

  it('4XNN ne saute rien quand la valeur correspond', () => {
    const machine = run([0x6042, 0x4042], 2);
    assert.equal(machine.getPC(), 0x204);
  });

  it('5XY0 compare deux registres', () => {
    const machine = run([0x6007, 0x6107, 0x5010], 3);
    assert.equal(machine.getPC(), 0x208);
  });

  it('9XY0 saute quand les registres diffèrent', () => {
    const machine = run([0x6007, 0x6108, 0x9010], 3);
    assert.equal(machine.getPC(), 0x208);
  });

  it('signale un débordement de pile plutôt que d\'écraser la mémoire', () => {
    // Un appel qui se rappelle lui-même sature les 16 niveaux.
    const machine = new Chip8();
    machine.load(rom(0x2200));
    assert.throws(() => {
      for (let s = 0; s < 20; s += 1) machine.step();
    }, /Débordement de pile/);
  });

  it('signale un retour hors sous-programme', () => {
    const machine = new Chip8();
    machine.load(rom(0x00ee));
    assert.throws(() => machine.step(), /hors sous-programme/);
  });
});

describe('arithmétique', () => {
  it('7XNN additionne sans reporter la retenue dans VF', () => {
    const machine = run([0x60ff, 0x7002], 2); // 0xFF + 2 = 0x01, VF intact
    assert.equal(machine.getRegisters()[0x0], 0x01);
    assert.equal(machine.getRegisters()[0xf], 0x00);
  });

  it('8XY4 lève VF sur dépassement', () => {
    const machine = run([0x60ff, 0x6102, 0x8014], 3);
    assert.equal(machine.getRegisters()[0x0], 0x01);
    assert.equal(machine.getRegisters()[0xf], 1);
  });

  it('8XY4 écrit VF en dernier quand la destination est VF', () => {
    // VF = 0xFF, V1 = 0x02 : le résultat 0x01 est écrasé par l'indicateur 1.
    const machine = run([0x6fff, 0x6102, 0x8f14], 3);
    assert.equal(machine.getRegisters()[0xf], 1);
  });

  it('8XY5 pose VF à 1 en l\'absence d\'emprunt', () => {
    const machine = run([0x600a, 0x6103, 0x8015], 3);
    assert.equal(machine.getRegisters()[0x0], 0x07);
    assert.equal(machine.getRegisters()[0xf], 1);
  });

  it('8XY5 pose VF à 0 quand il y a emprunt', () => {
    const machine = run([0x6003, 0x610a, 0x8015], 3);
    assert.equal(machine.getRegisters()[0x0], 0xf9);
    assert.equal(machine.getRegisters()[0xf], 0);
  });

  it('8XY7 soustrait dans l\'autre sens', () => {
    const machine = run([0x6003, 0x610a, 0x8017], 3); // V0 = V1 - V0
    assert.equal(machine.getRegisters()[0x0], 0x07);
    assert.equal(machine.getRegisters()[0xf], 1);
  });
});

describe('écarts de comportement', () => {
  it('vfReset remet VF à zéro après un OU logique', () => {
    const withReset = run([0x6fff, 0x6001, 0x6102, 0x8011], 4, COSMAC_VIP);
    assert.equal(withReset.getRegisters()[0xf], 0);

    const without = run([0x6fff, 0x6001, 0x6102, 0x8011], 4, SUPER_CHIP);
    assert.equal(without.getRegisters()[0xf], 0xff);
  });

  it('shifting choisit la source du décalage : VY sur VIP, VX sur SUPER-CHIP', () => {
    // V0 = 0x0F, V1 = 0x02. 8016 décale, mais quelle source ?
    const vip = run([0x600f, 0x6102, 0x8016], 3, { shifting: false });
    assert.equal(vip.getRegisters()[0x0], 0x01, 'VY (0x02) décalé vers V0');

    const schip = run([0x600f, 0x6102, 0x8016], 3, { shifting: true });
    assert.equal(schip.getRegisters()[0x0], 0x07, 'V0 (0x0F) décalé sur place');
    assert.equal(schip.getRegisters()[0xf], 1, 'le bit sorti passe dans VF');
  });

  it('jumping bascule BNNN en BXNN', () => {
    // V0 = 0x10, V2 = 0x20. B204 : NNN + V0, ou XNN + VX avec X = 2 ?
    const vip = run([0x6010, 0x6220, 0xb204], 3, { jumping: false });
    assert.equal(vip.getPC(), 0x214);

    const schip = run([0x6010, 0x6220, 0xb204], 3, { jumping: true });
    assert.equal(schip.getPC(), 0x224);
  });

  it('memoryIncrement fait avancer I après FX55 et FX65', () => {
    const withInc = run([0xa300, 0xf255], 2, { memoryIncrement: true });
    assert.equal(withInc.getI(), 0x303, 'I avance de X+1 = 3');

    const without = run([0xa300, 0xf255], 2, { memoryIncrement: false });
    assert.equal(without.getI(), 0x300, 'I reste en place');
  });

  it('displayWait plafonne l\'affichage à un sprite par trame', () => {
    // Trois DXYN d'affilée sur des colonnes distinctes, puis boucle sur place.
    const program = [0xa050, 0xd005, 0x610a, 0xd105, 0x6214, 0xd205, 0x120c];
    const waiting = new Chip8({ quirks: { displayWait: true }, cyclesPerFrame: 20 });
    waiting.load(rom(...program));
    waiting.runFrame(NO_KEYS);
    const afterOneFrame = litPixels(waiting);

    const free = new Chip8({ quirks: { displayWait: false }, cyclesPerFrame: 20 });
    free.load(rom(...program));
    free.runFrame(NO_KEYS);

    assert.ok(afterOneFrame > 0, 'un sprite au moins est tracé');
    assert.ok(litPixels(free) > afterOneFrame, 'sans attente, plusieurs sprites passent');
  });
});

describe('affichage', () => {
  it('DXYN trace le glyphe 0 de la police, soit 14 pixels', () => {
    // I pointe le glyphe "0" : quatre lignes pleines de 4 pixels moins le centre.
    const machine = run([0xa050, 0xd005], 2);
    assert.equal(litPixels(machine), 14);
  });

  it('DXYN lève VF quand un pixel allumé s\'éteint', () => {
    // Le même sprite tracé deux fois se rature lui-même.
    const machine = run([0xa050, 0xd005, 0xd005], 3);
    assert.equal(machine.getRegisters()[0xf], 1);
    assert.equal(litPixels(machine), 0, 'le second tracé efface le premier');
  });

  it('DXYN laisse VF à zéro sans collision', () => {
    const machine = run([0xa050, 0xd005], 2);
    assert.equal(machine.getRegisters()[0xf], 0);
  });

  it('clipping tronque le sprite au bord au lieu de le replier', () => {
    // Origine en x = 62 : seules deux colonnes du glyphe tiennent à l'écran.
    const clipped = run([0x603e, 0x6100, 0xa050, 0xd015], 4, { clipping: true });
    const wrapped = run([0x603e, 0x6100, 0xa050, 0xd015], 4, { clipping: false });

    assert.ok(litPixels(wrapped) > litPixels(clipped), 'le repli rallume les colonnes perdues');

    const display = clipped.getDisplay();
    const leftEdge = Array.from({ length: 32 }, (_, row) => display[row * 64]);
    assert.ok(leftEdge.every((pixel) => pixel === 0), 'rien ne réapparaît sur le bord gauche');
  });

  it('l\'origine du sprite se replie toujours, même avec clipping', () => {
    // x = 64 doit se comporter comme x = 0.
    const machine = run([0x6040, 0x6100, 0xa050, 0xd015], 4, { clipping: true });
    assert.equal(litPixels(machine), 14, 'le glyphe complet est tracé depuis la colonne 0');
  });

  it('00E0 efface l\'écran', () => {
    const machine = run([0xa050, 0xd005, 0x00e0], 3);
    assert.equal(litPixels(machine), 0);
  });
});

describe('mémoire et registres spéciaux', () => {
  it('FX33 décompose un octet en trois décimales', () => {
    const machine = run([0x60ff, 0xa300, 0xf033], 3); // 255
    assert.equal(machine.peek(0x300), 2);
    assert.equal(machine.peek(0x301), 5);
    assert.equal(machine.peek(0x302), 5);
  });

  it('FX55 puis FX65 restituent les registres à l\'identique', () => {
    const machine = run(
      [0x600a, 0x610b, 0x620c, 0xa300, 0xf255, 0x6000, 0x6100, 0x6200, 0xa300, 0xf265],
      10,
    );
    const registers = machine.getRegisters();
    assert.deepEqual([registers[0], registers[1], registers[2]], [0x0a, 0x0b, 0x0c]);
  });

  it('FX29 pointe le glyphe de la police correspondant au chiffre', () => {
    const machine = run([0x600a, 0xf029], 2); // chiffre A, 11e glyphe
    assert.equal(machine.getI(), 0x50 + 10 * 5);
  });

  it('FX1E accumule dans I', () => {
    const machine = run([0xa300, 0x6010, 0xf01e], 3);
    assert.equal(machine.getI(), 0x310);
  });

  it('CXNN masque le tirage aléatoire', () => {
    // Le masque 0x0F interdit tout bit au-delà du quartet bas.
    const machine = new Chip8({ seed: 999 });
    machine.load(rom(0xc00f, 0xc00f, 0xc00f, 0xc00f));
    for (let s = 0; s < 4; s += 1) {
      machine.step();
      assert.ok(machine.getRegisters()[0] <= 0x0f);
    }
  });

  it('la graine rend le tirage reproductible', () => {
    const first = run([0xc0ff, 0xc0ff, 0xc0ff], 3);
    const second = run([0xc0ff, 0xc0ff, 0xc0ff], 3);
    assert.equal(first.getRegisters()[0], second.getRegisters()[0]);
  });
});

describe('clavier', () => {
  it('EX9E saute quand la touche est enfoncée', () => {
    const machine = new Chip8();
    machine.load(rom(0x6005, 0xe09e));
    const keys = NO_KEYS.slice();
    keys[5] = true;
    machine.runFrame(keys);
    assert.ok(machine.getPC() >= 0x206);
  });

  it('EXA1 saute quand la touche est relâchée', () => {
    const machine = run([0x6005, 0xe0a1], 2);
    assert.equal(machine.getPC(), 0x206);
  });

  it('FX0A fige le processeur puis valide au relâchement', () => {
    const machine = new Chip8({ cyclesPerFrame: 4 });
    machine.load(rom(0xf00a, 0x6142)); // attendre une touche, puis V1 = 0x42

    machine.runFrame(NO_KEYS);
    assert.equal(machine.getRegisters()[1], 0, 'rien ne progresse sans appui');

    const pressed = NO_KEYS.slice();
    pressed[7] = true;
    machine.runFrame(pressed);
    assert.equal(machine.getRegisters()[0], 0, 'l\'appui seul ne valide pas');
    assert.equal(machine.getRegisters()[1], 0, 'le processeur est toujours figé');

    machine.runFrame(NO_KEYS);
    assert.equal(machine.getRegisters()[0], 7, 'le relâchement livre la touche');
    assert.equal(machine.getRegisters()[1], 0x42, 'puis l\'exécution reprend');
  });
});

describe('minuteurs et son', () => {
  it('les minuteurs perdent une unité par trame', () => {
    const machine = new Chip8({ cyclesPerFrame: 4 });
    machine.load(rom(0x600a, 0xf015, 0x1206)); // délai = 10, puis boucle
    machine.runFrame(NO_KEYS);
    assert.equal(machine.getDelayTimer(), 9);
    machine.runFrame(NO_KEYS);
    assert.equal(machine.getDelayTimer(), 8);
  });

  it('les minuteurs s\'arrêtent à zéro sans repasser en dessous', () => {
    const machine = new Chip8({ cyclesPerFrame: 4 });
    machine.load(rom(0x6001, 0xf015, 0x1206));
    for (let f = 0; f < 5; f += 1) machine.runFrame(NO_KEYS);
    assert.equal(machine.getDelayTimer(), 0);
  });

  it('le minuteur sonore produit une onde, et le silence sinon', () => {
    const machine = new Chip8({ cyclesPerFrame: 4 });
    machine.load(rom(0x6005, 0xf018, 0x1206)); // son = 5, puis boucle
    const sounding = machine.runFrame(NO_KEYS);
    assert.ok(sounding.audio.some((sample) => sample !== 0), 'le buzzer sort du signal');

    const silent = new Chip8({ cyclesPerFrame: 4 });
    silent.load(rom(0x1200));
    const quiet = silent.runFrame(NO_KEYS);
    assert.ok(quiet.audio.every((sample) => sample === 0), 'silence hors minuteur');
  });

  it('sort du stéréo entrelacé, deux valeurs par échantillon', () => {
    const machine = new Chip8({ cyclesPerFrame: 4 });
    machine.load(rom(0x6005, 0xf018, 0x1206));
    const { audio } = machine.runFrame(NO_KEYS);

    assert.equal(audio.length, Math.round(44100 / 60) * 2, 'une paire par échantillon');
    for (let s = 0; s < audio.length; s += 2) {
      assert.equal(audio[s], audio[s + 1], 'le buzzer mono part identique sur les deux canaux');
    }
  });
});

describe('trame vidéo', () => {
  it('sort une image RGBA opaque aux dimensions du système', () => {
    const machine = new Chip8();
    machine.load(rom(0xa050, 0xd005, 0x1204));
    const frame = machine.runFrame(NO_KEYS);

    assert.equal(frame.video.length, 64 * 32 * 4);
    for (let p = 3; p < frame.video.length; p += 4) {
      assert.equal(frame.video[p], 255, 'canal alpha toujours opaque');
    }
  });

  it('applique les couleurs demandées', () => {
    const machine = new Chip8({ foreground: 0xff0000, background: 0x0000ff });
    machine.load(rom(0xa050, 0xd005, 0x1204));
    const { video } = machine.runFrame(NO_KEYS);
    const display = machine.getDisplay();
    const litIndex = display.indexOf(1);

    assert.ok(litIndex >= 0, 'au moins un pixel est allumé');
    assert.deepEqual(Array.from(video.slice(litIndex * 4, litIndex * 4 + 3)), [0xff, 0, 0]);

    const darkIndex = display.indexOf(0);
    assert.deepEqual(Array.from(video.slice(darkIndex * 4, darkIndex * 4 + 3)), [0, 0, 0xff]);
  });
});

describe('sauvegarde d\'état', () => {
  it('restaure une machine à l\'identique', () => {
    const machine = new Chip8({ cyclesPerFrame: 8 });
    machine.load(rom(0x600a, 0x6114, 0xa050, 0xd005, 0x6f05, 0xff15));
    for (let f = 0; f < 3; f += 1) machine.runFrame(NO_KEYS);

    const snapshot = machine.saveState();
    const before = {
      pc: machine.getPC(),
      i: machine.getI(),
      registers: Array.from(machine.getRegisters()),
      display: Array.from(machine.getDisplay()),
    };

    // On laisse la machine diverger, puis on rembobine.
    for (let f = 0; f < 10; f += 1) machine.runFrame(NO_KEYS);
    machine.loadState(snapshot);

    assert.equal(machine.getPC(), before.pc);
    assert.equal(machine.getI(), before.i);
    assert.deepEqual(Array.from(machine.getRegisters()), before.registers);
    assert.deepEqual(Array.from(machine.getDisplay()), before.display);
  });

  it('rejette un état de taille incorrecte', () => {
    const machine = new Chip8();
    assert.throws(() => machine.loadState(new Uint8Array(10)), /octets attendus|attendus/);
  });

  it('rejette un fichier qui n\'est pas un état CHIP-8', () => {
    const machine = new Chip8();
    const bogus = machine.saveState();
    bogus[0] = 0x00;
    assert.throws(() => machine.loadState(bogus), /pas un état CHIP-8/);
  });

  it('rejette une version d\'état inconnue', () => {
    const machine = new Chip8();
    const future = machine.saveState();
    future[4] = 99;
    assert.throws(() => machine.loadState(future), /version 99/);
  });
});
