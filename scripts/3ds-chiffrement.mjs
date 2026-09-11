/**
 * Dit si un dépôt 3DS est chiffré ou non.
 *
 * Un émulateur sans les clés de la console ne sait ouvrir qu'un dépôt
 * déchiffré. Rien dans le nom du fichier ne le dit : un `.3ds` peut être l'un
 * ou l'autre, et l'émulateur se contente de répondre « type différent de
 * l'extension », ce qui n'éclaire personne.
 *
 * La reconnaissance tient à une signature de quatre lettres. Un dépôt déchiffré
 * porte `NCSD` ou `NCCH` en clair à des positions connues ; un dépôt chiffré n'a
 * à ces mêmes endroits que des octets brouillés.
 *
 *   node scripts/3ds-chiffrement.mjs "mon jeu.3ds"
 */

import fs from 'node:fs';
import path from 'node:path';

/** Lit quelques octets à une position donnée, sans charger tout le fichier. */
function lire(fd, position, longueur) {
  const tampon = Buffer.alloc(longueur);
  const lus = fs.readSync(fd, tampon, 0, longueur, position);
  return tampon.subarray(0, lus);
}

const signature = (fd, position) => lire(fd, position, 4).toString('latin1');

/** Arrondit au multiple de 64 supérieur, comme l'exige l'en-tête CIA. */
const aligne = (n) => Math.ceil(n / 64) * 64;

/**
 * Où commence le contenu d'un CIA.
 *
 * L'archive empile en-tête, chaîne de certificats, ticket puis métadonnées,
 * chacun aligné sur 64 octets. Le contenu suit.
 */
function debutContenuCia(fd) {
  const entete = lire(fd, 0, 0x20);
  if (entete.length < 0x20 || entete.readUInt32LE(0) !== 0x2020) return null;

  return (
    aligne(entete.readUInt32LE(0)) +
    aligne(entete.readUInt32LE(8)) +
    aligne(entete.readUInt32LE(12)) +
    aligne(entete.readUInt32LE(16))
  );
}

function examine(fichier) {
  const fd = fs.openSync(fichier, 'r');
  try {
    const nom = path.basename(fichier);
    const extension = path.extname(fichier).toLowerCase();

    if (extension === '.cia') {
      const debut = debutContenuCia(fd);
      if (debut === null) {
        return `${nom}\n  ce n'est pas un CIA : en-tête d'archive absent`;
      }
      const magie = signature(fd, debut + 0x100);
      return magie === 'NCCH'
        ? `${nom}\n  CIA DÉCHIFFRÉ — Citra devrait l'ouvrir`
        : `${nom}\n  CIA CHIFFRÉ — signature NCCH illisible à 0x${(debut + 0x100).toString(16)}\n` +
            `  il faut un dépôt déchiffré, ou un .3ds décrypté`;
    }

    // .3ds et .cci : image de cartouche. `NCSD` en tête, puis une première
    // partition à 0x4000 dont l'en-tête porte `NCCH`.
    const carte = signature(fd, 0x100);
    if (carte !== 'NCSD') {
      return `${nom}\n  ni NCSD ni CIA reconnu — fichier inhabituel ou tronqué`;
    }
    const partition = signature(fd, 0x4000 + 0x100);
    return partition === 'NCCH'
      ? `${nom}\n  .3ds DÉCHIFFRÉ — c'est ce qu'il faut`
      : `${nom}\n  .3ds CHIFFRÉ — l'en-tête de partition est brouillé`;
  } finally {
    fs.closeSync(fd);
  }
}

const fichiers = process.argv.slice(2);
if (fichiers.length === 0) {
  console.error('usage : node scripts/3ds-chiffrement.mjs <fichier.3ds|.cia> …');
  process.exit(2);
}
for (const fichier of fichiers) {
  try {
    console.log(examine(fichier));
  } catch (erreur) {
    console.log(`${path.basename(fichier)}\n  illisible : ${erreur.message}`);
  }
}
