/**
 * Génère `roms/bounce.ch8`, une ROM de démonstration écrite pour ce projet.
 *
 * Elle sert de test de bout en bout : une balle qui rebondit exerce le tracé
 * de sprites, l'arithmétique sur registres, les sauts conditionnels, le
 * minuteur de délai et le minuteur sonore. Si elle s'anime et bipe aux bords,
 * l'essentiel du cœur fonctionne.
 *
 *   node scripts/make-demo-rom.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROGRAM_START = 0x200;

/**
 * Assembleur CHIP-8 minimal, avec étiquettes résolues en seconde passe.
 * Juste assez pour écrire des démos lisibles sans compter les adresses à la main.
 */
class Assembler {
  #words = [];
  #labels = new Map();
  #fixups = [];

  /** Adresse de la prochaine instruction émise. */
  get address() {
    return PROGRAM_START + this.#words.length * 2;
  }

  /** Pose une étiquette sur l'adresse courante. */
  label(name) {
    if (this.#labels.has(name)) throw new Error(`Étiquette en double : ${name}`);
    this.#labels.set(name, this.address);
    return this;
  }

  #emit(word) {
    this.#words.push(word & 0xffff);
    return this;
  }

  /** Émet une instruction dont les 12 bits bas sont une adresse à résoudre. */
  #emitRef(highNibble, labelName) {
    this.#fixups.push({ index: this.#words.length, highNibble, labelName });
    this.#words.push(0);
    return this;
  }

  cls() { return this.#emit(0x00e0); }
  ret() { return this.#emit(0x00ee); }
  jp(label) { return this.#emitRef(0x1, label); }
  ldI(label) { return this.#emitRef(0xa, label); }

  /** LD Vx, octet */
  ld(x, byte) { return this.#emit(0x6000 | (x << 8) | (byte & 0xff)); }
  /** ADD Vx, Vy — la retenue part dans VF, ignorée ici. */
  addReg(x, y) { return this.#emit(0x8004 | (x << 8) | (y << 4)); }
  /** SE Vx, octet — saute l'instruction suivante en cas d'égalité. */
  se(x, byte) { return this.#emit(0x3000 | (x << 8) | (byte & 0xff)); }
  /** DRW Vx, Vy, n */
  drw(x, y, rows) { return this.#emit(0xd000 | (x << 8) | (y << 4) | (rows & 0xf)); }
  /** LD DT, Vx */
  setDelay(x) { return this.#emit(0xf015 | (x << 8)); }
  /** LD Vx, DT */
  getDelay(x) { return this.#emit(0xf007 | (x << 8)); }
  /** LD ST, Vx */
  setSound(x) { return this.#emit(0xf018 | (x << 8)); }

  /** Insère des octets bruts, complétés à la parité si besoin. */
  data(...bytes) {
    const padded = bytes.length % 2 === 0 ? bytes : [...bytes, 0x00];
    for (let b = 0; b < padded.length; b += 2) {
      this.#emit((padded[b] << 8) | padded[b + 1]);
    }
    return this;
  }

  assemble() {
    for (const { index, highNibble, labelName } of this.#fixups) {
      const target = this.#labels.get(labelName);
      if (target === undefined) throw new Error(`Étiquette inconnue : ${labelName}`);
      this.#words[index] = (highNibble << 12) | (target & 0xfff);
    }

    const rom = new Uint8Array(this.#words.length * 2);
    this.#words.forEach((word, index) => {
      rom[index * 2] = (word >> 8) & 0xff;
      rom[index * 2 + 1] = word & 0xff;
    });
    return rom;
  }
}

// Registres : V0 = x, V1 = y, V2 = dx, V3 = dy, V5 = durée du bip, VA = délai.
const X = 0;
const Y = 1;
const DX = 2;
const DY = 3;
const BEEP = 5;
const TIMER = 0xa;

// La balle fait 8 pixels de large sur 6 de haut : les bords utiles sont donc
// 64 - 8 et 32 - 6.
const X_MAX = 56;
const Y_MAX = 26;

const asm = new Assembler();

asm
  .ld(X, 20)
  .ld(Y, 10)
  .ld(DX, 1)
  .ld(DY, 1)
  .ld(BEEP, 2);

asm.label('loop')
  .cls()
  .ldI('ball')
  .drw(X, Y, 6)
  .addReg(X, DX)
  .addReg(Y, DY);

// Rebond sur le bord gauche : SE saute le JP quand la position vaut la limite.
asm
  .se(X, 0)
  .jp('check_x_max')
  .ld(DX, 0x01)
  .setSound(BEEP);

asm.label('check_x_max')
  .se(X, X_MAX)
  .jp('check_y_min')
  .ld(DX, 0xff) // -1 en complément à deux sur 8 bits
  .setSound(BEEP);

asm.label('check_y_min')
  .se(Y, 0)
  .jp('check_y_max')
  .ld(DY, 0x01)
  .setSound(BEEP);

asm.label('check_y_max')
  .se(Y, Y_MAX)
  .jp('pace')
  .ld(DY, 0xff)
  .setSound(BEEP);

// Le minuteur de délai cadence le déplacement indépendamment de la vitesse
// d'exécution choisie pour le cœur.
asm.label('pace')
  .ld(TIMER, 1)
  .setDelay(TIMER);

asm.label('wait')
  .getDelay(TIMER)
  .se(TIMER, 0)
  .jp('wait');

asm.jp('loop');

asm.label('ball').data(
  0b00111100,
  0b01111110,
  0b11111111,
  0b11111111,
  0b01111110,
  0b00111100,
);

const rom = asm.assemble();
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'roms', 'bounce.ch8');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, rom);

console.log(`roms/bounce.ch8 — ${rom.length} octets`);
