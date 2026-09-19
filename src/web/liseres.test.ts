/**
 * Le liseré trouve-t-il le bord de la jaquette ?
 *
 * C'est le genre de calcul qu'on ne peut pas juger à l'œil : un liseré posé
 * deux pixels trop loin se remarque sans qu'on sache dire pourquoi, et l'on
 * finit par tout changer sauf ce qui cloche. Ces épreuves fixent le résultat
 * sur des images qu'on écrit soi-même, point par point.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { PLEIN, ROGNAGE_MAX, cadre, contenu } from './liseres.ts';

/**
 * Peint une image : un fond, et un rectangle de dessin dedans.
 *
 * @param marge épaisseur du fond autour du dessin, en points.
 */
function image(
  largeur: number,
  hauteur: number,
  fond: readonly [number, number, number, number],
  marge: number,
  dessin: readonly [number, number, number, number] = [200, 30, 40, 255],
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(largeur * hauteur * 4);
  for (let y = 0; y < hauteur; y += 1) {
    for (let x = 0; x < largeur; x += 1) {
      const dedans =
        x >= marge && y >= marge && x < largeur - marge && y < hauteur - marge;
      const couleur = dedans ? dessin : fond;
      pixels.set(couleur, (y * largeur + x) * 4);
    }
  }
  return pixels;
}

describe('trouver le dessin', () => {
  it('ne rogne rien quand le dessin va jusqu’au bord', () => {
    assert.deepEqual(contenu(image(40, 40, [200, 30, 40, 255], 0), 40, 40), PLEIN);
  });

  it('retrouve une marge blanche, sur les quatre côtés', () => {
    const trouve = contenu(image(40, 40, [255, 255, 255, 255], 4), 40, 40);
    assert.deepEqual(trouve, { gauche: 0.1, haut: 0.1, droite: 0.9, bas: 0.9 });
  });

  it('retrouve une marge transparente', () => {
    const trouve = contenu(image(40, 40, [0, 0, 0, 0], 4), 40, 40);
    assert.deepEqual(trouve, { gauche: 0.1, haut: 0.1, droite: 0.9, bas: 0.9 });
  });

  it('retrouve une marge noire', () => {
    const trouve = contenu(image(40, 40, [0, 0, 0, 255], 8), 40, 40);
    assert.equal(trouve.gauche, 0.2);
    assert.equal(trouve.droite, 0.8);
  });

  it('pardonne les petites salissures d’un fichier compressé', () => {
    // Un blanc enregistré en JPEG n'est jamais tout à fait le même d'un point
    // à l'autre : refuser de rogner pour deux unités d'écart ne servirait
    // personne.
    const pixels = image(40, 40, [255, 255, 255, 255], 4);
    for (let i = 0; i < 40 * 4 * 4; i += 4) pixels[i] = 250;
    const trouve = contenu(pixels, 40, 40);
    assert.equal(trouve.haut, 0.1);
  });

  it('ne rogne pas quand les quatre coins ne s’accordent pas', () => {
    // Un dégradé va jusqu'au bord : il n'y a pas de marge, et rogner
    // couperait le dessin.
    const pixels = new Uint8ClampedArray(40 * 40 * 4);
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        pixels.set([x * 6, y * 6, 128, 255], (y * 40 + x) * 4);
      }
    }
    assert.deepEqual(contenu(pixels, 40, 40), PLEIN);
  });

  it('ne rogne jamais plus du quart d’un côté', () => {
    // Une jaquette presque vide existe — un fond uni et un titre au milieu —
    // et la ceinturer au plus près en ferait un timbre.
    const trouve = contenu(image(40, 40, [255, 255, 255, 255], 18), 40, 40);
    assert.equal(trouve.gauche, ROGNAGE_MAX);
    assert.equal(trouve.droite, 1 - ROGNAGE_MAX);
  });

  it('ne dit rien d’une image trop petite pour être lue', () => {
    assert.deepEqual(contenu(new Uint8ClampedArray(4), 1, 1), PLEIN);
    assert.deepEqual(contenu(new Uint8ClampedArray(0), 10, 10), PLEIN);
  });
});

describe('poser le liseré', () => {
  const PLEINE = PLEIN;

  it('ne retire rien d’une image de la forme de sa case', () => {
    assert.deepEqual(cadre(PLEINE, 0.75, 0.75, false), {
      haut: 0,
      droite: 0,
      bas: 0,
      gauche: 0,
    });
  });

  it('retrouve les bandes d’une image montrée en entier', () => {
    // Deux fois plus large que la case : l'image occupe la moitié de la
    // hauteur, et il reste un quart de vide en haut et en bas.
    const marges = cadre(PLEINE, 1.5, 0.75, false);
    assert.ok(Math.abs(marges.haut - 0.25) < 1e-9);
    assert.ok(Math.abs(marges.bas - 0.25) < 1e-9);
    assert.equal(marges.gauche, 0);
    assert.equal(marges.droite, 0);
  });

  it('ne laisse aucune bande quand l’image remplit la case', () => {
    const marges = cadre(PLEINE, 1.5, 0.75, true);
    assert.deepEqual(marges, { haut: 0, droite: 0, bas: 0, gauche: 0 });
  });

  it('ajoute la marge du fichier aux bandes de la case', () => {
    // Un dixième de marge sur une image qui occupe la moitié de la hauteur
    // vaut un vingtième de la case, en plus du quart de bande.
    const dessin = { gauche: 0.1, haut: 0.1, droite: 0.9, bas: 0.9 };
    const marges = cadre(dessin, 1.5, 0.75, false);
    assert.ok(Math.abs(marges.haut - (0.25 + 0.05)) < 1e-9);
    assert.ok(Math.abs(marges.gauche - 0.1) < 1e-9);
  });

  it('rogne la marge de ce qui déborde, sans sortir de la case', () => {
    // En « cover », l'image dépasse : une marge prise dans le débord ne se
    // voit pas, et le liseré reste au bord de la case.
    const dessin = { gauche: 0, haut: 0.05, droite: 1, bas: 0.95 };
    const marges = cadre(dessin, 0.5, 0.75, true);
    assert.equal(marges.gauche, 0);
    assert.equal(marges.haut, 0);
    for (const valeur of Object.values(marges)) {
      assert.ok(valeur >= 0 && valeur <= 1);
    }
  });

  it('ne rend rien d’utile pour un rapport impossible', () => {
    assert.deepEqual(cadre(PLEINE, 0, 0.75, false), { haut: 0, droite: 0, bas: 0, gauche: 0 });
    assert.deepEqual(cadre(PLEINE, Number.NaN, 0.75, true), {
      haut: 0,
      droite: 0,
      bas: 0,
      gauche: 0,
    });
  });

  it('laisse toujours de quoi dessiner un liseré', () => {
    // Les quatre retraits réunis ne doivent pas se croiser, sans quoi le
    // liseré se replie sur lui-même.
    const dessin = { gauche: 0.25, haut: 0.25, droite: 0.75, bas: 0.75 };
    for (const [ri, rc, remplit] of [
      [0.75, 0.75, false],
      [1.6, 0.75, false],
      [0.4, 0.75, true],
      [2.2, 0.75, true],
    ] as const) {
      const m = cadre(dessin, ri, rc, remplit);
      assert.ok(m.gauche + m.droite < 1, `${ri} ${remplit}`);
      assert.ok(m.haut + m.bas < 1, `${ri} ${remplit}`);
    }
  });
});
