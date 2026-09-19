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

import { JAQUETTE, cadre, margeClaire } from './liseres.ts';

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

/**
 * Peint une image : une marge, et un dessin dedans.
 *
 * @param marge épaisseur de la marge, en points.
 */
function avecMarge(
  largeur: number,
  hauteur: number,
  fond: readonly [number, number, number, number],
  marge: number,
  dessin: readonly [number, number, number, number] = [40, 90, 160, 255],
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(largeur * hauteur * 4);
  for (let y = 0; y < hauteur; y += 1) {
    for (let x = 0; x < largeur; x += 1) {
      const dedans = x >= marge && y >= marge && x < largeur - marge && y < hauteur - marge;
      pixels.set(dedans ? dessin : fond, (y * largeur + x) * 4);
    }
  }
  return pixels;
}

const BLANC = [255, 255, 255, 255] as const;
const VIDE = [0, 0, 0, 0] as const;
const NOIR = [0, 0, 0, 255] as const;

describe('la marge claire d’une jaquette', () => {
  it('retrouve une marge blanche', () => {
    assert.deepEqual(margeClaire(avecMarge(40, 40, BLANC, 4), 40, 40), {
      gauche: 0.1,
      haut: 0.1,
      droite: 0.9,
      bas: 0.9,
    });
  });

  it('retrouve une marge transparente', () => {
    assert.deepEqual(margeClaire(avecMarge(40, 40, VIDE, 4), 40, 40), {
      gauche: 0.1,
      haut: 0.1,
      droite: 0.9,
      bas: 0.9,
    });
  });

  it('laisse une bordure sombre tranquille', () => {
    // C'est la jaquette de Rayman 2 : un cadre noir, qui fait partie du dessin.
    // La version précédente le prenait pour une marge, rognait jusqu'à son
    // plafond, et réduisait le liseré à une bande au milieu de l'image.
    assert.deepEqual(margeClaire(avecMarge(40, 40, NOIR, 4), 40, 40), JAQUETTE);
  });

  it('ne touche pas à une jaquette dont le dessin va au bord', () => {
    assert.deepEqual(margeClaire(avecMarge(40, 40, [40, 90, 160, 255], 0), 40, 40), JAQUETTE);
  });

  it('renonce entièrement quand la marge dépasse le quart', () => {
    // Une marge d'un quart n'est plus une marge : on n'a pas compris l'image,
    // et un liseré arbitraire se voit plus qu'une marge laissée.
    assert.deepEqual(margeClaire(avecMarge(40, 40, BLANC, 12), 40, 40), JAQUETTE);
  });

  it('renonce quand un seul coin n’est pas clair', () => {
    const pixels = avecMarge(40, 40, BLANC, 4);
    pixels.set([10, 10, 10, 255], (39 * 40 + 39) * 4);
    assert.deepEqual(margeClaire(pixels, 40, 40), JAQUETTE);
  });

  it('renonce devant une image entièrement blanche', () => {
    assert.deepEqual(margeClaire(avecMarge(40, 40, BLANC, 0, BLANC), 40, 40), JAQUETTE);
  });

  it('ne dit rien d’une image trop petite pour être lue', () => {
    assert.deepEqual(margeClaire(new Uint8ClampedArray(4 * 4 * 4), 4, 4), JAQUETTE);
  });

  it('accepte un blanc de fichier compressé, pas un gris', () => {
    const presqueBlanc = avecMarge(40, 40, [243, 245, 240, 255], 4);
    assert.equal(margeClaire(presqueBlanc, 40, 40).haut, 0.1);
    const gris = avecMarge(40, 40, [200, 200, 200, 255], 4);
    assert.deepEqual(margeClaire(gris, 40, 40), JAQUETTE);
  });
});
