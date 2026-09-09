/**
 * Génère `roms/defile.gb`, une ROM Game Boy écrite pour ce projet.
 *
 * Elle dessine des bandes diagonales et les fait défiler. Contrairement à un
 * simple clignotement, ça exerce vraiment le processeur graphique : écriture de
 * tuiles en mémoire vidéo, remplissage de la carte de fond, palette, et les
 * registres de défilement à chaque trame.
 *
 *   node scripts/make-gb-rom.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Une cartouche sans contrôleur mémoire fait 32 Kio. */
const ROM_SIZE = 32 * 1024;

const ENTRY = 0x100;
const TITLE = 0x134;
const CARTRIDGE_TYPE = 0x147;
const ROM_SIZE_CODE = 0x148;
const RAM_SIZE_CODE = 0x149;
const HEADER_CHECKSUM = 0x14d;
const GLOBAL_CHECKSUM = 0x14e;
const CODE = 0x150;

/**
 * Assembleur minimal pour le LR35902 : on empile des octets et on retient les
 * positions, puis on corrige les sauts relatifs. Douze instructions ne valaient
 * pas ça, cinquante si.
 */
class Code {
  bytes = [];

  /** Adresse de la prochaine instruction émise. */
  get address() {
    return CODE + this.bytes.length;
  }

  emit(...bytes) {
    this.bytes.push(...bytes);
    return this;
  }

  /**
   * Émet un saut relatif vers une adresse déjà connue.
   * @param opcode `0x18` pour un saut sec, `0x20` pour « si non nul ».
   */
  jumpBack(opcode, target) {
    this.emit(opcode, 0);
    // Le déplacement se compte depuis l'instruction *suivante*, que l'on vient
    // justement d'atteindre en émettant les deux octets.
    const offset = target - this.address;
    if (offset < -128 || offset > 127) {
      throw new Error(`saut relatif hors de portée : ${offset}`);
    }
    this.bytes[this.bytes.length - 1] = offset & 0xff;
    return this;
  }

  /** Réserve l'opérande 16 bits d'une instruction, à remplir plus tard. */
  placeholder16(...opcode) {
    this.emit(...opcode, 0, 0);
    return this.bytes.length - 2;
  }

  patch16(at, value) {
    this.bytes[at] = value & 0xff;
    this.bytes[at + 1] = (value >> 8) & 0xff;
  }
}

const asm = new Code();

// --- Extinction de l'écran --------------------------------------------------
// La mémoire vidéo n'est librement accessible que l'écran éteint ; sinon il
// faut attendre les intervalles de retour, ce qui compliquerait pour rien.
asm.emit(0x3e, 0x00); // LD A, $00
asm.emit(0xe0, 0x40); // LDH ($40), A   — LCDC

// --- Copie de la tuile en $8010 ---------------------------------------------
asm.emit(0x21, 0x10, 0x80); // LD HL, $8010
const tileSource = asm.placeholder16(0x11); // LD DE, <données de la tuile>
asm.emit(0x06, 0x10); // LD B, 16

const copyLoop = asm.address;
asm.emit(0x1a); // LD A, (DE)
asm.emit(0x22); // LD (HL+), A
asm.emit(0x13); // INC DE
asm.emit(0x05); // DEC B
asm.jumpBack(0x20, copyLoop); // JR NZ, copie

// --- Remplissage de la carte de fond ----------------------------------------
// 32×32 cases en $9800, toutes sur la tuile 1.
asm.emit(0x21, 0x00, 0x98); // LD HL, $9800
asm.emit(0x01, 0x00, 0x04); // LD BC, $0400
asm.emit(0x16, 0x01); // LD D, $01   — le numéro de tuile, gardé au chaud

const fillLoop = asm.address;
asm.emit(0x7a); // LD A, D
asm.emit(0x22); // LD (HL+), A
asm.emit(0x0b); // DEC BC
asm.emit(0x78); // LD A, B
asm.emit(0xb1); // OR C
asm.jumpBack(0x20, fillLoop); // JR NZ, remplissage

// --- Palette et allumage ----------------------------------------------------
asm.emit(0x3e, 0xe4); // LD A, $E4    — quatre teintes, de la plus claire
asm.emit(0xe0, 0x47); // LDH ($47), A — BGP
asm.emit(0x3e, 0x91); // LD A, $91    — écran allumé, fond visible, tuiles en $8000
asm.emit(0xe0, 0x40); // LDH ($40), A — LCDC

// --- Défilement -------------------------------------------------------------
asm.emit(0x0e, 0x00); // LD C, $00    — position courante

// Les deux axes doivent bouger en sens contraire. Défiler de (+1, +1) sur un
// motif à 45° le recopierait sur lui-même : l'image resterait parfaitement
// immobile alors que le programme tourne.
const scrollLoop = asm.address;
asm.emit(0x79); // LD A, C
asm.emit(0xe0, 0x43); // LDH ($43), A — SCX
asm.emit(0x79); // LD A, C
asm.emit(0x2f); // CPL           — sens inverse
asm.emit(0xe0, 0x42); // LDH ($42), A — SCY
asm.emit(0x11, 0x00, 0x08); // LD DE, $0800 — temporisation

const waitLoop = asm.address;
asm.emit(0x1b); // DEC DE
asm.emit(0x7a); // LD A, D
asm.emit(0xb3); // OR E
asm.jumpBack(0x20, waitLoop); // JR NZ, attente

asm.emit(0x0c); // INC C
asm.jumpBack(0x18, scrollLoop); // JR défilement

// --- Données de la tuile ----------------------------------------------------
// Une tuile fait 8×8 pixels sur deux plans de bits : le bit de poids faible de
// la couleur vient du premier octet, celui de poids fort du second. Les deux
// plans portant le même motif, la diagonale sort en teinte 3.
const tileAddress = CODE + asm.bytes.length;
asm.patch16(tileSource, tileAddress);
for (let row = 0; row < 8; row += 1) {
  const line = 0x80 >> row;
  asm.emit(line, line);
}

// --- Assemblage de la cartouche ---------------------------------------------

const rom = new Uint8Array(ROM_SIZE);

// Le processeur démarre en $0100 avec quatre octets devant lui, juste de quoi
// sauter par-dessus l'en-tête.
rom.set([0x00, 0xc3, CODE & 0xff, CODE >> 8], ENTRY);

const title = 'EVACHI';
for (let i = 0; i < 16; i += 1) {
  rom[TITLE + i] = i < title.length ? title.charCodeAt(i) : 0;
}

rom[CARTRIDGE_TYPE] = 0x00; // ROM seule, sans contrôleur
rom[ROM_SIZE_CODE] = 0x00; // 32 Kio
rom[RAM_SIZE_CODE] = 0x00; // pas de RAM sauvegardée

rom.set(asm.bytes, CODE);

// La ROM de démarrage refuse la cartouche si cette somme ne colle pas : c'est
// le seul contrôle qu'elle applique aux octets de l'en-tête.
let header = 0;
for (let address = TITLE; address <= 0x14c; address += 1) {
  header = (header - rom[address] - 1) & 0xff;
}
rom[HEADER_CHECKSUM] = header;

// Celle-ci n'est vérifiée par rien, mais un en-tête complet coûte deux lignes.
let global = 0;
for (let address = 0; address < ROM_SIZE; address += 1) {
  if (address === GLOBAL_CHECKSUM || address === GLOBAL_CHECKSUM + 1) continue;
  global = (global + rom[address]) & 0xffff;
}
rom[GLOBAL_CHECKSUM] = global >> 8;
rom[GLOBAL_CHECKSUM + 1] = global & 0xff;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'roms', 'defile.gb');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, rom);

console.log(`roms/defile.gb — ${rom.length} octets`);
console.log(`  ${asm.bytes.length} octets de programme, tuile en $${tileAddress.toString(16)}`);
console.log("  Le champ logo de l'en-tête est laissé vide : une ROM de démarrage");
console.log('  qui le vérifie refusera la cartouche.');
