/**
 * La musique du menu.
 *
 * Ce qui la rendrait pénible se vérifie : un accord qui se répète, une note
 * hors gamme, un morceau qui boucle, un silence jamais laissé. Rien de tout
 * cela ne s'entend au premier passage — seulement au dixième, quand il est
 * trop tard pour s'en apercevoir.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  ACCORDS,
  MESURE,
  PENTATONIQUE,
  frequence,
  prochainAccord,
  prochaineMesure,
  tirage,
} from './ambience.ts';

describe('suite des accords', () => {
  it('ne répète jamais l’accord qu’on vient d’entendre', () => {
    // Un accord tenu deux mesures s'entend comme un morceau arrêté.
    let indice = 0;
    let graine = 12345;
    for (let mesure = 0; mesure < 5000; mesure += 1) {
      graine = tirage(graine);
      const suivant = prochainAccord(indice, graine);
      assert.notEqual(suivant, indice, `accord répété à la mesure ${mesure}`);
      indice = suivant;
    }
  });

  it('les parcourt tous', () => {
    // Un accord jamais tiré rétrécirait le morceau sans qu'on sache pourquoi.
    const vus = new Set<number>();
    let indice = 0;
    let graine = 7;
    for (let mesure = 0; mesure < 500; mesure += 1) {
      graine = tirage(graine);
      indice = prochainAccord(indice, graine);
      vus.add(indice);
    }
    assert.equal(vus.size, ACCORDS.length);
  });

  it('les garde dans une tessiture jouable', () => {
    for (const accord of ACCORDS) {
      for (const note of accord) {
        assert.ok(note >= 36 && note <= 72, `note ${note} hors de portée`);
      }
      assert.ok(accord.length >= 3, 'un accord de moins de trois notes sonne creux');
    }
  });
});

describe('mélodie', () => {
  it('ne tombe jamais hors de la gamme', () => {
    // C'est ce qui permet de tirer les notes au hasard : dans cette gamme-là,
    // aucune ne peut sonner fausse sur ces accords.
    let indice = 0;
    let graine = 99;
    for (let mesure = 0; mesure < 3000; mesure += 1) {
      const suite = prochaineMesure(indice, graine);
      for (const note of suite.notes) {
        assert.ok(PENTATONIQUE.includes(note.midi), `note ${note.midi} hors gamme`);
      }
      indice = suite.indice;
      graine = suite.graine;
    }
  });

  it('laisse des mesures entièrement silencieuses', () => {
    // Une musique qui joue sans arrêt finit par occuper l'esprit.
    let indice = 0;
    let graine = 4;
    let vides = 0;
    for (let mesure = 0; mesure < 400; mesure += 1) {
      const suite = prochaineMesure(indice, graine);
      if (suite.notes.length === 0) vides += 1;
      indice = suite.indice;
      graine = suite.graine;
    }
    assert.ok(vides > 40, `seulement ${vides} mesures sur 400 sans note`);
    assert.ok(vides < 200, `${vides} mesures sur 400 sans note, c'est un morceau absent`);
  });

  it('tient les notes dans la mesure', () => {
    // Une note qui commencerait après la fin de sa mesure se superposerait à
    // l'accord suivant, avec lequel elle n'a pas été choisie.
    let indice = 0;
    let graine = 2024;
    for (let mesure = 0; mesure < 2000; mesure += 1) {
      const suite = prochaineMesure(indice, graine);
      for (const note of suite.notes) {
        assert.ok(note.delay >= 1.5 && note.delay < MESURE, `retard ${note.delay} impossible`);
        assert.ok(note.duration > 0 && note.duration < 7, `durée ${note.duration} impossible`);
        assert.ok(note.gain > 0 && note.gain < 0.2, `force ${note.gain} trop forte`);
      }
      indice = suite.indice;
      graine = suite.graine;
    }
  });

  it('ne rejoue pas deux fois la même minute', () => {
    // Le point de tout ceci : une boucle de deux minutes s'entend au troisième
    // passage. Sur mille mesures -- plus de trois heures -- aucune suite de
    // quatre mesures ne doit revenir identique.
    const empreintes = new Set<string>();
    let indice = 0;
    let graine = 1;
    const recent: string[] = [];

    for (let mesure = 0; mesure < 1000; mesure += 1) {
      const suite = prochaineMesure(indice, graine);
      recent.push(
        `${suite.indice}:${suite.notes.map((n) => `${n.midi}@${n.delay.toFixed(2)}`).join(',')}`,
      );
      if (recent.length > 4) recent.shift();
      if (recent.length === 4) empreintes.add(recent.join('|'));
      indice = suite.indice;
      graine = suite.graine;
    }

    assert.equal(empreintes.size, 997, 'une suite de quatre mesures est revenue');
  });
});

describe('hauteur des notes', () => {
  it('place le la 440 là où il faut', () => {
    assert.equal(frequence(69), 440);
    assert.equal(Math.round(frequence(57)), 220);
    assert.equal(Math.round(frequence(81)), 880);
  });
});

describe('tirage', () => {
  it('reste un entier positif', () => {
    let graine = 0;
    for (let i = 0; i < 1000; i += 1) {
      graine = tirage(graine);
      assert.ok(Number.isInteger(graine) && graine >= 0 && graine <= 0xffffffff);
    }
  });

  it('rend la même suite pour la même graine', () => {
    // Sans cela, rien de tout ce qui précède ne serait vérifiable.
    assert.equal(tirage(tirage(42)), tirage(tirage(42)));
  });
});
