/**
 * La géométrie de l'étagère.
 *
 * Ce qui casse ici ne se voit pas tout de suite : un boîtier trop mince
 * disparaît entre ses voisins, un boîtier ouvert qui ne pousse pas les siens
 * recouvre ce qu'on venait lire, et une planche qui ne se centre pas laisse la
 * sélection hors de l'écran. Les trois se vérifient sans écran.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  EPAIS,
  JOUR,
  MINCE,
  OUVERT,
  PLANCHES,
  decalage,
  epaisseur,
  largeur,
  murs,
  places,
} from './etagere.ts';

const Mo = 1024 * 1024;

describe('l’épaisseur d’un boîtier', () => {
  it('suit la taille du fichier', () => {
    assert.ok(epaisseur(32 * 1024) < epaisseur(4 * Mo), 'une cartouche contre un CD');
    assert.ok(epaisseur(4 * Mo) < epaisseur(700 * Mo), 'un CD contre un DVD');
    assert.ok(epaisseur(700 * Mo) < epaisseur(4400 * Mo), 'un DVD contre un Blu-ray');
  });

  it('garde tout entre le trait et le pavé', () => {
    // Une épaisseur proportionnelle ferait d'une cartouche de trente-deux
    // kilo-octets un trait invisible à côté d'une image de huit gigaoctets.
    for (const octets of [1, 32 * 1024, Mo, 700 * Mo, 9 * 1024 * Mo, 5e12]) {
      const trouvee = epaisseur(octets);
      assert.ok(trouvee >= MINCE, `${octets} octets : ${trouvee}`);
      assert.ok(trouvee <= EPAIS, `${octets} octets : ${trouvee}`);
    }
  });

  it('donne une épaisseur ordinaire à ce qu’on ne sait pas peser', () => {
    // Un fichier sans taille connue ne doit ni disparaître ni faire un mur.
    for (const inconnu of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const trouvee = epaisseur(inconnu);
      assert.ok(trouvee > MINCE && trouvee < EPAIS, `${inconnu} : ${trouvee}`);
    }
  });
});

describe('les boîtiers d’une planche', () => {
  const trois = [1, 2, 3];

  it('les range de gauche à droite, sans chevauchement', () => {
    const posees = places(trois, -1);
    for (const [rang, place] of posees.entries()) {
      if (rang === 0) continue;
      const avant = posees[rang - 1];
      assert.ok(place.x >= avant.x + avant.largeur, `le boîtier ${rang} chevauche son voisin`);
    }
  });

  it('ouvre celui qu’on regarde, et pousse les autres', () => {
    // Sans la poussée, la jaquette ouverte recouvrirait les tranches d'à côté,
    // qu'on est précisément en train de lire.
    const posees = places(trois, 1);
    assert.ok(posees[1].ouvert);
    assert.equal(posees[1].largeur, OUVERT);
    assert.ok(posees[2].x > places(trois, -1)[2].x, 'le voisin n’a pas reculé');
  });

  it('n’en ouvre aucun quand le rang ne désigne rien', () => {
    for (const nulle_part of [-1, 3, 99]) {
      assert.ok(places(trois, nulle_part).every((place) => !place.ouvert), `rang ${nulle_part}`);
    }
  });

  it('survit à une planche vide', () => {
    assert.deepEqual(places([], 0), []);
    assert.equal(largeur([]), 0);
    assert.equal(decalage([], 0), 0);
  });

  it('compte la largeur d’une planche, jour compris', () => {
    const posees = places([2, 2], -1);
    assert.ok(Math.abs(largeur(posees) - (2 + JOUR + 2)) < 1e-9, `${largeur(posees)}`);
  });
});

describe('le centrage d’une planche', () => {
  it('amène le boîtier ouvert au milieu', () => {
    const posees = places([1, 2, 3, 4], 2);
    const vise = posees[2];
    const milieu = vise.x + vise.largeur / 2 + decalage(posees, 2);
    assert.ok(Math.abs(milieu) < 1e-9, `le milieu tombe à ${milieu}`);
  });

  it('ne se borne pas aux extrémités', () => {
    // Une planche de trois jeux se centre sur eux ; bornée, elle collerait le
    // premier au bord gauche et l'on ne saurait plus lequel est choisi.
    const posees = places([1, 1, 1], 0);
    assert.ok(decalage(posees, 0) < 0, 'le premier n’a pas été ramené au milieu');
  });

  it('ne bouge pas pour un rang qui n’existe pas', () => {
    assert.equal(decalage(places([1, 1], -1), -1), 0);
  });
});

describe('les planches qu’on garde en vie', () => {
  it('en garde une poignée autour de celle qu’on regarde', () => {
    const vues = murs(10, 40);
    assert.ok(vues.includes(10));
    assert.equal(vues.length, PLANCHES * 2 + 1);
  });

  it('ne sort jamais du mur', () => {
    for (const [choisie, combien] of [[0, 40], [39, 40], [0, 1], [2, 3]] as const) {
      for (const rang of murs(choisie, combien)) {
        assert.ok(rang >= 0 && rang < combien, `${rang} hors de ${combien}`);
      }
    }
  });

  it('ne rend rien pour un mur vide', () => {
    assert.deepEqual(murs(0, 0), []);
  });
});
