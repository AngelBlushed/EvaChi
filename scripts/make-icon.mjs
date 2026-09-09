/**
 * Génère `src-tauri/icons/icon.ico`, requis par tauri-build pour la ressource
 * Windows de l'exécutable.
 *
 * L'icône reprend le sprite de la balle de `roms/bounce.ch8` : c'est le premier
 * dessin qu'un cœur de ce projet ait produit.
 *
 * Encodeur PNG écrit à la main plutôt qu'une dépendance : `zlib` suffit, et le
 * format tient en trois blocs.
 *
 *   node scripts/make-icon.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 256;
const CORNER_RADIUS = 52;

const BACKGROUND = [0x12, 0x1a, 0x12];
const BALL = [0x9e, 0xe3, 0x7d];

/** Le sprite de la démo : 8 pixels de large, 6 de haut. */
const SPRITE = [
  0b00111100,
  0b01111110,
  0b11111111,
  0b11111111,
  0b01111110,
  0b00111100,
];

// --- Encodage PNG -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Assemble un bloc PNG : longueur, type, données, somme de contrôle. */
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encode une image RGBA en PNG. */
function encodePng(rgba, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8 bits par canal
  header[9] = 6; // RGBA
  header[10] = 0; // compression standard
  header[11] = 0; // filtrage standard
  header[12] = 0; // non entrelacé

  // Chaque ligne est précédée de son octet de filtre ; 0 signifie « aucun ».
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const target = y * (1 + width * 4);
    raw[target] = 0;
    rgba.copy(raw, target + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Dessin -----------------------------------------------------------------

/** Vrai si le point tombe dans un rectangle à coins arrondis. */
function insideRoundedSquare(x, y, size, radius) {
  const nx = Math.min(x, size - 1 - x);
  const ny = Math.min(y, size - 1 - y);
  if (nx >= radius || ny >= radius) return true;
  const dx = radius - nx;
  const dy = radius - ny;
  return dx * dx + dy * dy <= radius * radius;
}

const image = Buffer.alloc(SIZE * SIZE * 4);

// La balle occupe 8 cellules de large sur 6 de haut, centrée avec une marge.
const cell = Math.floor(SIZE / 11);
const spriteWidth = 8 * cell;
const spriteHeight = 6 * cell;
const originX = Math.floor((SIZE - spriteWidth) / 2);
const originY = Math.floor((SIZE - spriteHeight) / 2);

for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const offset = (y * SIZE + x) * 4;

    if (!insideRoundedSquare(x, y, SIZE, CORNER_RADIUS)) {
      image.writeUInt32BE(0, offset); // transparent hors du carré
      continue;
    }

    let colour = BACKGROUND;
    const sx = Math.floor((x - originX) / cell);
    const sy = Math.floor((y - originY) / cell);
    if (sx >= 0 && sx < 8 && sy >= 0 && sy < 6 && SPRITE[sy] & (0x80 >> sx)) {
      colour = BALL;
    }

    image[offset] = colour[0];
    image[offset + 1] = colour[1];
    image[offset + 2] = colour[2];
    image[offset + 3] = 0xff;
  }
}

const png = encodePng(image, SIZE, SIZE);

// --- Emballage ICO ----------------------------------------------------------
// Un ICO peut porter directement un PNG depuis Windows Vista, ce qui évite
// d'avoir à produire un DIB et son masque de transparence.

const directory = Buffer.alloc(6 + 16);
directory.writeUInt16LE(0, 0); // réservé
directory.writeUInt16LE(1, 2); // type : icône
directory.writeUInt16LE(1, 4); // une seule image
directory[6] = 0; // largeur : 0 signifie 256
directory[7] = 0; // hauteur : idem
directory[8] = 0; // palette : sans objet en 32 bits
directory[9] = 0; // réservé
directory.writeUInt16LE(1, 10); // plans
directory.writeUInt16LE(32, 12); // bits par pixel
directory.writeUInt32LE(png.length, 14);
directory.writeUInt32LE(directory.length, 18);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = join(root, 'src-tauri', 'icons');
mkdirSync(iconDir, { recursive: true });

writeFileSync(join(iconDir, 'icon.ico'), Buffer.concat([directory, png]));
writeFileSync(join(iconDir, 'icon.png'), png);

console.log(`src-tauri/icons/icon.ico — ${directory.length + png.length} octets`);
console.log(`src-tauri/icons/icon.png — ${png.length} octets`);
