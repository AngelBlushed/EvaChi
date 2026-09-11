/**
 * Convertit une trame brute écrite par la sonde en image PNG.
 *
 * Certains cœurs n'écrivent rien dans le journal et affichent leur message
 * d'erreur à l'écran — FinalBurn Neo le fait. Le seul moyen de le lire est
 * alors de regarder l'image que le cœur a dessinée.
 *
 * Le format d'entrée est celui de `probe --dump` : largeur et hauteur sur
 * quatre octets chacune, puis les pixels en RGBA.
 *
 *   node scripts/trame-en-png.mjs trame.raw trame.png
 */

import fs from 'node:fs';
import zlib from 'node:zlib';

/** Table des restes pour le contrôle de redondance cyclique du PNG. */
const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(octets) {
  let c = 0xffffffff;
  for (const octet of octets) c = TABLE[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Assemble un bloc PNG : longueur, type, contenu, empreinte. */
function bloc(type, contenu) {
  const entete = Buffer.alloc(8);
  entete.writeUInt32BE(contenu.length, 0);
  entete.write(type, 4, 'latin1');
  const empreinte = Buffer.alloc(4);
  empreinte.writeUInt32BE(crc32(Buffer.concat([entete.subarray(4), contenu])), 0);
  return Buffer.concat([entete, contenu, empreinte]);
}

function png(largeur, hauteur, rgba) {
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete[8] = 8; // huit bits par canal
  entete[9] = 6; // couleur vraie avec transparence
  // Chaque ligne est préfixée de son mode de filtrage ; zéro veut dire aucun.
  const brut = Buffer.alloc(hauteur * (1 + largeur * 4));
  for (let y = 0; y < hauteur; y += 1) {
    const source = y * largeur * 4;
    const cible = y * (1 + largeur * 4);
    brut[cible] = 0;
    rgba.copy(brut, cible + 1, source, source + largeur * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', entete),
    bloc('IDAT', zlib.deflateSync(brut, { level: 6 })),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  console.error('usage : node scripts/trame-en-png.mjs <trame.raw> <sortie.png>');
  process.exit(2);
}

const octets = fs.readFileSync(source);
const largeur = octets.readUInt32LE(0);
const hauteur = octets.readUInt32LE(4);
const attendu = largeur * hauteur * 4;
const pixels = octets.subarray(8);

if (pixels.length < attendu) {
  console.error(`trame incomplète : ${pixels.length} octets pour ${attendu} attendus`);
  process.exit(1);
}

fs.writeFileSync(destination, png(largeur, hauteur, pixels.subarray(0, attendu)));
console.log(`${largeur}×${hauteur} → ${destination}`);
