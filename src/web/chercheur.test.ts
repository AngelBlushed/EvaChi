/**
 * La recherche d'une valeur en mémoire.
 *
 * Une adresse proposée par erreur est une écriture au mauvais endroit, et une
 * partie abîmée sans qu'on comprenne pourquoi. Ces épreuves fixent donc le
 * contraire de l'abondance : ce qui doit tomber à chaque tri.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  MONTRABLES,
  borner,
  montrer,
  plafond,
  premierTri,
  trier,
  valeurA,
} from './chercheur.ts';

/** Une mémoire de comptoir, écrite en petit-boutiste. */
function memoire(octets: number[]): Uint8Array {
  return Uint8Array.from(octets);
}

describe('la lecture d’une valeur', () => {
  it('lit les trois largeurs en petit-boutiste', () => {
    const ram = memoire([0x2a, 0x34, 0x12, 0xbb, 0xaa, 0x99, 0x88, 0x00]);
    assert.equal(valeurA(ram, 0, 1), 0x2a);
    assert.equal(valeurA(ram, 1, 2), 0x1234);
    assert.equal(valeurA(ram, 3, 4), 0x8899_aabb);
  });

  it('refuse ce qui déborde plutôt que de rendre un demi-chiffre', () => {
    const ram = memoire([1, 2, 3, 4]);
    assert.equal(valeurA(ram, 3, 2), null);
    assert.equal(valeurA(ram, 4, 1), null);
    assert.equal(valeurA(ram, -1, 1), null);
  });
});

describe('le premier tri', () => {
  it('retient les adresses qui portent le chiffre cherché', () => {
    // Trois vies, et deux endroits où le jeu range un trois.
    const ram = memoire([3, 0, 7, 3, 9]);
    assert.deepEqual(premierTri(ram, 1, 3), [0, 3]);
    assert.deepEqual(premierTri(ram, 1, 9), [4]);
    assert.deepEqual(premierTri(ram, 1, 42), []);
  });

  it('prend toute la mémoire quand on ne sait pas le chiffre', () => {
    // Une barre de vie n'a pas de nombre écrit dessus : on part de tout, et
    // c'est « ça a baissé » qui fera le tri.
    const ram = memoire([1, 2, 3, 4, 5, 6]);
    assert.equal(premierTri(ram, 1, null).length, 6);
  });

  it('avance d’une valeur à la fois, pas d’un octet', () => {
    // Une valeur de quatre octets rangée de travers n'existe pas. Parcourir
    // octet par octet rendrait quatre adresses pour la même chose, dont trois
    // qui n'écriraient nulle part de sensé.
    const ram = memoire([0, 0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(premierTri(ram, 4, 0), [0, 4]);
    assert.deepEqual(premierTri(ram, 2, 0), [0, 2, 4, 6]);
  });
});

describe('les tris suivants', () => {
  const avant = memoire([10, 20, 30, 40]);
  const apres = memoire([12, 20, 25, 40]);
  const toutes = [0, 1, 2, 3];

  it('répond à chacune des questions', () => {
    assert.deepEqual(trier(avant, apres, toutes, 1, 'monte', null), [0]);
    assert.deepEqual(trier(avant, apres, toutes, 1, 'baisse', null), [2]);
    assert.deepEqual(trier(avant, apres, toutes, 1, 'change', null), [0, 2]);
    assert.deepEqual(trier(avant, apres, toutes, 1, 'stable', null), [1, 3]);
    assert.deepEqual(trier(avant, apres, toutes, 1, 'egale', 25), [2]);
  });

  it('ne garde jamais une adresse qu’on ne sait plus lire', () => {
    // La mémoire a rétréci — un cœur déchargé, un relevé tronqué. Garder une
    // adresse sur la foi d'un relevé qui ne la contient plus, ce serait la
    // proposer à l'écriture sans jamais l'avoir vérifiée.
    const court = memoire([12, 20]);
    assert.deepEqual(trier(avant, court, toutes, 1, 'stable', null), [1]);
    assert.deepEqual(trier(avant, court, toutes, 1, 'change', null), [0]);
  });

  it('ne retient rien sur « égale » sans chiffre à comparer', () => {
    assert.deepEqual(trier(avant, apres, toutes, 1, 'egale', null), []);
  });

  it('se resserre à chaque passage, jamais l’inverse', () => {
    // La propriété qui fait toute la méthode : un tri ne peut que réduire.
    // S'il pouvait ajouter, une adresse écartée reviendrait sans être passée
    // par les épreuves qui l'avaient écartée.
    let restantes = premierTri(avant, 1, null);
    for (const question of ['change', 'stable', 'monte', 'baisse'] as const) {
      const apresTri = trier(avant, apres, restantes, 1, question, null);
      assert.ok(apresTri.length <= restantes.length, question);
      for (const adresse of apresTri) {
        assert.ok(restantes.includes(adresse), `${adresse} est revenue de nulle part`);
      }
      restantes = apresTri;
    }
  });
});

describe('ce qu’on montre', () => {
  it('n’en montre jamais plus qu’on n’en peut lire', () => {
    const ram = memoire(Array.from({ length: 500 }, (_, i) => i % 256));
    const toutes = premierTri(ram, 1, null);
    assert.equal(montrer(ram, toutes, 1).length, MONTRABLES);
  });

  it('rend chaque adresse avec ce qu’elle vaut', () => {
    const ram = memoire([7, 8, 9]);
    assert.deepEqual(montrer(ram, [0, 2], 1), [
      { adresse: 0, valeur: 7 },
      { adresse: 2, valeur: 9 },
    ]);
  });

  it('laisse tomber une adresse devenue illisible', () => {
    assert.deepEqual(montrer(memoire([1]), [0, 5], 1), [{ adresse: 0, valeur: 1 }]);
  });
});

describe('la valeur qu’on écrit', () => {
  it('connaît le plafond de chaque largeur', () => {
    assert.equal(plafond(1), 255);
    assert.equal(plafond(2), 65535);
    assert.equal(plafond(4), 4294967295);
  });

  it('borne au lieu de déborder sur l’adresse voisine', () => {
    // Écrire 999 dans un octet en abîmerait deux. Quelqu'un qui tape 999 veut
    // « le plus possible », et le plus possible ici vaut 255.
    assert.equal(borner(999, 1), 255);
    assert.equal(borner(70000, 2), 65535);
    assert.equal(borner(-5, 1), 0);
    assert.equal(borner(12.7, 1), 12);
    assert.equal(borner(Number.NaN, 1), 0);
    assert.equal(borner(Number.POSITIVE_INFINITY, 2), 0);
  });
});
