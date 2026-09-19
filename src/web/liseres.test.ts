/**
 * Le liseré tombe-t-il sur la jaquette ?
 *
 * C'est le genre de calcul qu'on ne peut pas juger à l'œil : un liseré posé
 * deux pixels trop loin se remarque sans qu'on sache dire pourquoi, et l'on
 * finit par tout changer sauf ce qui cloche. Ces épreuves fixent le résultat
 * pour les deux façons de poser une image dans une case : en entier, où elle
 * laisse des bandes, et en grand, où elle déborde.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { JAQUETTE, cadre } from './liseres.ts';

/** La forme d'une boîte de jeu, celle des cartes et des cases. */
const CASE = 0.75;

describe('poser le liseré', () => {
  it('ne retire rien d’une image de la forme de sa case', () => {
    assert.deepEqual(cadre(JAQUETTE, CASE, CASE, false), {
      haut: 0,
      droite: 0,
      bas: 0,
      gauche: 0,
    });
  });

  it('retrouve les bandes d’une image plus large que sa case', () => {
    // Deux fois plus large que la case : l'image occupe la moitié de la
    // hauteur, et il reste un quart de vide en haut et en bas.
    const marges = cadre(JAQUETTE, 1.5, CASE, false);
    assert.ok(Math.abs(marges.haut - 0.25) < 1e-9);
    assert.ok(Math.abs(marges.bas - 0.25) < 1e-9);
    assert.equal(marges.gauche, 0);
    assert.equal(marges.droite, 0);
  });

  it('retrouve les bandes d’une image plus étroite que sa case', () => {
    const marges = cadre(JAQUETTE, 0.5, CASE, false);
    assert.ok(Math.abs(marges.gauche - (1 - 0.5 / CASE) / 2) < 1e-9);
    assert.ok(Math.abs(marges.droite - marges.gauche) < 1e-9);
    assert.equal(marges.haut, 0);
    assert.equal(marges.bas, 0);
  });

  it('ne laisse aucune bande quand l’image remplit la case', () => {
    // En « cover » l'image déborde : ce qui dépasse est rogné par la case, et
    // le liseré reste sur ses bords.
    for (const rapport of [0.4, 0.75, 1, 1.5, 2.4]) {
      assert.deepEqual(
        cadre(JAQUETTE, rapport, CASE, true),
        { haut: 0, droite: 0, bas: 0, gauche: 0 },
        `au rapport ${rapport}`,
      );
    }
  });

  it('ne rend rien d’utile pour un rapport impossible', () => {
    assert.deepEqual(cadre(JAQUETTE, 0, CASE, false), { haut: 0, droite: 0, bas: 0, gauche: 0 });
    assert.deepEqual(cadre(JAQUETTE, Number.NaN, CASE, true), {
      haut: 0,
      droite: 0,
      bas: 0,
      gauche: 0,
    });
    assert.deepEqual(cadre(JAQUETTE, 1.2, 0, false), { haut: 0, droite: 0, bas: 0, gauche: 0 });
  });

  it('laisse toujours de quoi dessiner un liseré', () => {
    // Les quatre retraits réunis ne doivent jamais se croiser, sans quoi le
    // liseré se replie sur lui-même — une bande au milieu de l'image, et l'on
    // ne comprend pas ce qu'on regarde.
    for (const rapport of [0.2, 0.5, 0.75, 1, 1.4, 3]) {
      for (const remplit of [true, false]) {
        const m = cadre(JAQUETTE, rapport, CASE, remplit);
        assert.ok(m.gauche + m.droite < 1, `${rapport} ${remplit}`);
        assert.ok(m.haut + m.bas < 1, `${rapport} ${remplit}`);
      }
    }
  });

  it('reste dans la case, quelle que soit la forme', () => {
    for (const rapport of [0.1, 0.75, 4]) {
      for (const remplit of [true, false]) {
        for (const valeur of Object.values(cadre(JAQUETTE, rapport, CASE, remplit))) {
          assert.ok(valeur >= 0 && valeur <= 1, `${rapport} ${remplit} : ${valeur}`);
        }
      }
    }
  });
});
