/**
 * Exécute une ROM sans interface et dessine l'écran en ASCII dans le terminal.
 * Sert à vérifier un cœur sans dépendre du navigateur.
 *
 *   node scripts/run-headless.mjs roms/bounce.ch8 --frames 60 --every 20
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { Chip8 } from '../src/chip8/chip8.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    frames: { type: 'string', default: '120' },
    every: { type: 'string', default: '40' },
    cycles: { type: 'string', default: '11' },
  },
});

const romPath = positionals[0];
if (!romPath) {
  console.error('Usage : node scripts/run-headless.mjs <rom.ch8> [--frames N] [--every N]');
  process.exit(1);
}

const totalFrames = Number(values.frames);
const snapshotEvery = Number(values.every);

const machine = new Chip8({ cyclesPerFrame: Number(values.cycles) });
machine.load(new Uint8Array(readFileSync(romPath)));

const noKeys = new Array(16).fill(false);

/** Rend l'écran 64x32 en deux lignes de texte par ligne de pixels compressée. */
function render(display) {
  const rows = [];
  for (let y = 0; y < 32; y += 2) {
    let line = '';
    for (let x = 0; x < 64; x += 1) {
      const top = display[y * 64 + x] !== 0;
      const bottom = display[(y + 1) * 64 + x] !== 0;
      if (top && bottom) line += '█';
      else if (top) line += '▀';
      else if (bottom) line += '▄';
      else line += ' ';
    }
    rows.push(line);
  }
  return rows.join('\n');
}

let beeps = 0;
for (let frame = 1; frame <= totalFrames; frame += 1) {
  machine.runFrame(noKeys);
  if (machine.getSoundTimer() > 0) beeps += 1;

  if (frame % snapshotEvery === 0) {
    console.log(`\n── trame ${frame} ─ PC $${machine.getPC().toString(16).toUpperCase()} ─────────`);
    console.log(render(machine.getDisplay()));
  }
}

const lit = machine.getDisplay().reduce((sum, pixel) => sum + pixel, 0);
console.log(`\n${totalFrames} trames · ${lit} pixels allumés · ${beeps} trames sonores`);
