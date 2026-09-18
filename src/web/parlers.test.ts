/**
 * Les langues qu'on demande aux jeux.
 *
 * Un réglage qui ne se voit qu'une manette en main, sur un jeu dont on ne sait
 * pas d'avance s'il est traduit : ce qui peut se vérifier ici doit l'être ici.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { COMME_INTERFACE, PARLERS, langueDemandee, parlerParCode } from './parlers.ts';
import { LANGUES } from './langues/index.ts';

describe('les langues des jeux', () => {
  it('portent chacune un code distinct et un nom', () => {
    const codes = PARLERS.map((parler) => parler.code);
    assert.equal(new Set(codes).size, codes.length, 'deux langues au même code');
    for (const parler of PARLERS) {
      assert.ok(parler.nom.trim().length > 0, `${parler.code} : sans nom`);
    }
  });

  it('se rangent par leur nom propre', () => {
    // Comme celles de l'interface : on cherche le nom de la sienne, et on le
    // cherche là où l'alphabet le met.
    const noms = PARLERS.map((parler) => parler.nom);
    assert.deepEqual(noms, [...noms].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('n’emploient pas le mot réservé au choix qui suit l’interface', () => {
    assert.equal(parlerParCode(COMME_INTERFACE), undefined);
  });

  it('couvrent les langues des boîtes européennes', () => {
    // Les cinq ou six langues d'une cartouche européenne : c'est le cas qui a
    // fait naître ce réglage, et celui qu'il doit couvrir en entier.
    for (const code of ['en', 'fr', 'es', 'de', 'it', 'nl']) {
      assert.ok(parlerParCode(code), `${code} manque`);
    }
  });

  it('en proposent peu, et seulement des langues que les jeux parlent', () => {
    // Les cinquante de l'interface n'auraient ici aucun sens : proposer de
    // demander une langue dans laquelle aucun jeu n'existe, c'est promettre
    // quelque chose qui n'arrivera pas.
    assert.ok(PARLERS.length >= 6, `seulement ${PARLERS.length} langues`);
    assert.ok(PARLERS.length < LANGUES.length, 'autant de langues que l’interface');
  });

  it('se retrouvent parmi celles de l’interface', () => {
    // Le premier choix — « comme l'interface » — n'a de sens que si les codes
    // se correspondent. Deux tables qui nommeraient le français autrement se
    // rateraient en silence.
    const connus = new Set(LANGUES.map((langue) => langue.code.split('-')[0]));
    for (const parler of PARLERS) {
      assert.ok(connus.has(parler.code), `${parler.code} inconnu de l’interface`);
    }
  });
});

describe('la langue demandée au cœur', () => {
  it('suit l’interface tant qu’on n’a rien choisi', () => {
    assert.equal(langueDemandee(null, 'fr'), 'fr');
    assert.equal(langueDemandee(undefined, 'es'), 'es');
    assert.equal(langueDemandee(COMME_INTERFACE, 'de'), 'de');
  });

  it('respecte un choix explicite, quelle que soit l’interface', () => {
    // C'est tout l'objet du réglage : jouer en japonais avec une interface
    // française doit rester possible.
    assert.equal(langueDemandee('ja', 'fr'), 'ja');
    assert.equal(langueDemandee('en', 'fr'), 'en');
  });

  it('retombe sur l’interface quand le choix retenu n’existe plus', () => {
    // Un réglage écrit par une version plus ancienne, ou recopié d'ailleurs.
    // Le pire que ce réglage puisse faire est de donner une langue inattendue,
    // jamais d'empêcher un jeu de se lancer.
    assert.equal(langueDemandee('klingon', 'it'), 'it');
    assert.equal(langueDemandee('', 'it'), 'it');
  });
});
