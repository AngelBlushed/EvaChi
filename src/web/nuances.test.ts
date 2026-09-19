/**
 * Les filtres se tiennent-ils ?
 *
 * Une carte graphique n'existe pas ici : ce qui se vérifie sans elle, c'est le
 * catalogue et le texte des calculs. Un shader qui oublie une déclaration ne
 * se compile pas, et ne se plaint qu'à l'écran — c'est-à-dire trop tard.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { NUANCES, SOMMETS, nuanceParId } from './nuances.ts';

describe('le catalogue des filtres', () => {
  it('commence par « aucun », qui ne calcule rien', () => {
    assert.equal(NUANCES[0].id, 'aucun');
    assert.equal(NUANCES[0].source, null);
  });

  it('en propose trois, plus le sans-filtre', () => {
    assert.equal(NUANCES.length, 4);
    assert.equal(NUANCES.filter((nuance) => nuance.source !== null).length, 3);
  });

  it('ne donne jamais deux fois le même identifiant ni le même nom', () => {
    assert.equal(new Set(NUANCES.map((nuance) => nuance.id)).size, NUANCES.length);
    assert.equal(new Set(NUANCES.map((nuance) => nuance.label)).size, NUANCES.length);
    assert.equal(new Set(NUANCES.map((nuance) => nuance.detail)).size, NUANCES.length);
  });

  it('retombe sur « aucun » pour un identifiant inconnu', () => {
    assert.equal(nuanceParId('n’existe pas').id, 'aucun');
    assert.equal(nuanceParId(null).id, 'aucun');
    assert.equal(nuanceParId('tube').id, 'tube');
  });
});

describe('le texte des calculs', () => {
  it('donne à chaque filtre ce que le passage des sommets lui envoie', () => {
    // `uv` est produit là-bas et lu ici : les deux doivent s'accorder, et
    // rien dans le langage ne le vérifie avant l'exécution.
    assert.match(SOMMETS, /varying vec2 uv;/);
    assert.match(SOMMETS, /attribute vec2 place;/);
    for (const nuance of NUANCES) {
      if (!nuance.source) continue;
      assert.match(nuance.source, /varying vec2 uv;/, nuance.id);
      assert.match(nuance.source, /uniform sampler2D image;/, nuance.id);
      assert.match(nuance.source, /precision mediump float;/, nuance.id);
    }
  });

  it('écrit une couleur dans tous les cas', () => {
    for (const nuance of NUANCES) {
      if (!nuance.source) continue;
      assert.match(nuance.source, /gl_FragColor\s*=/, nuance.id);
    }
  });

  it('n’emploie que les deux tailles annoncées', () => {
    // Un uniforme jamais renseigné vaut zéro, et une division par zéro rend
    // une image noire sans rien dire.
    const connus = new Set(['image', 'taille', 'ecran']);
    for (const nuance of NUANCES) {
      if (!nuance.source) continue;
      for (const trouve of nuance.source.matchAll(/uniform\s+\w+\s+(\w+);/g)) {
        assert.ok(connus.has(trouve[1]), `${nuance.id} attend « ${trouve[1]} »`);
      }
    }
  });

  it('ferme toutes ses accolades', () => {
    for (const nuance of NUANCES) {
      if (!nuance.source) continue;
      const ouvertes = (nuance.source.match(/\{/g) ?? []).length;
      const fermees = (nuance.source.match(/\}/g) ?? []).length;
      assert.equal(ouvertes, fermees, `${nuance.id} : accolades dépareillées`);
    }
  });

  it('se garde d’une division par la taille de la trame', () => {
    // Une trame de hauteur nulle n'arrive pas jusqu'ici, mais un uniforme
    // oublié, si : chaque division passe donc par un plancher.
    for (const nuance of NUANCES) {
      if (!nuance.source) continue;
      for (const trouve of nuance.source.matchAll(/\/\s*(taille\.[xy])/g)) {
        assert.fail(`${nuance.id} divise par ${trouve[1]} sans plancher`);
      }
    }
  });
});
