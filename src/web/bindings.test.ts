/**
 * Le remappage de la manette.
 *
 * C'est la seule règle qui décide quel bouton fait quoi. Une erreur ici ne se
 * lit nulle part : elle se découvre manette en main, en pleine partie.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  parseOverrides,
  padButtonShort,
  resolveBindings,
  withBinding,
  withoutBindings,
} from './bindings.ts';

/** Deux boutons de manette vers deux touches du cœur. */
const defauts = new Map([
  [0, 8], // bouton du bas → A
  [1, 0], // bouton de droite → B
]);

describe('liaisons de manette', () => {
  it('garde les liaisons d’origine quand rien n’a été changé', () => {
    assert.deepEqual([...resolveBindings(defauts, undefined)], [...defauts]);
    assert.deepEqual([...resolveBindings(defauts, {})], [...defauts]);
  });

  it('remplace la liaison d’un bouton', () => {
    const obtenu = resolveBindings(defauts, { 0: 1 });
    assert.equal(obtenu.get(0), 1, 'le bouton du bas a changé de touche');
    assert.equal(obtenu.get(1), 0, 'l’autre est intact');
  });

  it('libère la touche que l’on vient de réassigner', () => {
    // Sans cela, deux boutons enverraient la même touche : elle resterait
    // enfoncée dès que l'un des deux est tenu, et passerait pour une panne.
    const obtenu = resolveBindings(defauts, { 3: 8 });
    assert.equal(obtenu.get(3), 8);
    assert.equal(obtenu.has(0), false, 'l’ancien porteur a lâché la touche');
  });

  it('ajoute une liaison sans perdre les autres', () => {
    const apres = withBinding({ 0: 1 }, 5, 9);
    assert.deepEqual(apres, { 0: 1, 5: 9 });
  });

  it('ne laisse jamais deux boutons sur la même touche', () => {
    const apres = withBinding({ 0: 8, 1: 0 }, 4, 8);
    assert.deepEqual(apres, { 1: 0, 4: 8 });
  });

  it('oublie une disposition sans toucher aux autres', () => {
    const tout = { joypad: { 0: 1 }, hex: { 2: 3 } };
    assert.deepEqual(withoutBindings(tout, 'joypad'), { hex: { 2: 3 } });
  });
});

describe('relecture de ce qui a été enregistré', () => {
  it('relit ce qu’elle a écrit', () => {
    const tout = { joypad: { 0: 8, 12: 4 } };
    assert.deepEqual(parseOverrides(JSON.stringify(tout)), tout);
  });

  it('rend vide quand il n’y a rien', () => {
    assert.deepEqual(parseOverrides(null), {});
    assert.deepEqual(parseOverrides(''), {});
  });

  it('ne tombe pas sur du contenu abîmé', () => {
    // Le stockage survit aux mises à jour, et à ce qu'on y met à la main.
    assert.deepEqual(parseOverrides('pas du json'), {});
    assert.deepEqual(parseOverrides('[1,2,3]'), {});
    assert.deepEqual(parseOverrides('"une chaîne"'), {});
    assert.deepEqual(parseOverrides('null'), {});
  });

  it('écarte les liaisons qui n’ont pas de sens', () => {
    const douteux = JSON.stringify({
      joypad: { 0: 8, '-1': 2, abc: 3, 4: 'sept', 5: 1.5, 6: -2 },
      vide: {},
      pasUnObjet: 12,
    });
    assert.deepEqual(parseOverrides(douteux), { joypad: { 0: 8 } });
  });
});

describe('noms des boutons', () => {
  it('nomme ceux de la disposition standard comme la sérigraphie', () => {
    // Ce sont les noms gravés sur la manette, les mêmes dans toutes les
    // langues : c'est ce que le joueur a sous les doigts.
    assert.equal(padButtonShort(0), 'A');
    assert.equal(padButtonShort(9), 'Start');
    assert.equal(padButtonShort(14), '←');
  });

  it('se rabat sur le numéro pour un bouton inconnu', () => {
    assert.equal(padButtonShort(23), 'b23');
  });

  it('donne des étiquettes courtes qui tiennent dans une case', () => {
    // La case est carrée et petite : au-delà de cinq signes, le texte
    // débordait sur sa voisine.
    for (let index = 0; index <= 16; index += 1) {
      const court = padButtonShort(index);
      assert.ok(court.length >= 1 && court.length <= 5, `bouton ${index} : « ${court} »`);
    }
  });

  it('ne donne jamais la même étiquette courte à deux boutons', () => {
    const vues = new Set<string>();
    for (let index = 0; index <= 16; index += 1) vues.add(padButtonShort(index));
    assert.equal(vues.size, 17);
  });
});
