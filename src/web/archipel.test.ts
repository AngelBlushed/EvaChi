/**
 * La géométrie de l'archipel.
 *
 * Ce qu'on vérifie ici, c'est ce qui rend une carte apprenable : que la place
 * d'un jeu ne change jamais, que rien ne se superpose, qu'aucun alignement ne
 * dessine de branches, et que la caméra arrive vraiment au lieu de s'en
 * approcher indéfiniment.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  ANGLE_OR,
  LOIN,
  PRES,
  SERRE,
  VOISINES,
  autour,
  avancer,
  camera,
  etendue,
  graine,
  ile,
  place,
} from './archipel.ts';

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('le semis en fleur de tournesol', () => {
  it('pose le premier au centre', () => {
    assert.deepEqual(graine(0), { x: 0, y: 0 });
    assert.deepEqual(ile(0), { x: 0, y: 0 });
  });

  it('ne pose jamais deux jeux au même endroit', () => {
    const vus: { x: number; y: number }[] = [];
    for (let rang = 0; rang < 120; rang += 1) {
      const point = graine(rang);
      for (const autre of vus) {
        assert.ok(distance(point, autre) > 1, `les rangs se superposent près de ${rang}`);
      }
      vus.push(point);
    }
  });

  it('remplit le disque sans laisser de branche', () => {
    // Un angle rationnel alignerait les jeux en rayons, et l'œil ne verrait
    // plus que les rayons. On mesure donc la répartition des directions : sur
    // douze secteurs, aucun ne doit être vide ni deux fois trop plein.
    const secteurs = new Array(12).fill(0);
    for (let rang = 1; rang < 240; rang += 1) {
      const { x, y } = graine(rang);
      const angle = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
      secteurs[Math.floor((angle / (Math.PI * 2)) * 12)] += 1;
    }
    const moyenne = 239 / 12;
    for (const [rang, compte] of secteurs.entries()) {
      assert.ok(compte > moyenne * 0.5, `le secteur ${rang} est presque vide (${compte})`);
      assert.ok(compte < moyenne * 1.6, `le secteur ${rang} est bondé (${compte})`);
    }
  });

  it('s’éloigne du centre à mesure qu’on ajoute', () => {
    for (let rang = 1; rang < 80; rang += 1) {
      const ici = Math.hypot(graine(rang).x, graine(rang).y);
      const avant = Math.hypot(graine(rang - 1).x, graine(rang - 1).y);
      assert.ok(ici >= avant - 1e-9, `le rang ${rang} est revenu vers le centre`);
    }
  });

  it('emploie bien l’angle d’or', () => {
    // Environ 137,5 degrés : c'est cette valeur-là, et pas une autre, qui
    // empêche les alignements.
    assert.ok(Math.abs((ANGLE_OR * 180) / Math.PI - 137.507) < 0.01);
  });

  it('rend le centre pour un rang impossible', () => {
    for (const impossible of [-1, 1.5, Number.NaN]) {
      assert.deepEqual(graine(impossible), { x: 0, y: 0 }, `${impossible}`);
      assert.deepEqual(ile(impossible), { x: 0, y: 0 }, `${impossible}`);
    }
  });
});

describe('les îles', () => {
  it('ne se touchent pas, même chargées', () => {
    // Deux îles voisines qui se recouvriraient mêleraient leurs jeux, et la
    // carte cesserait d'être apprenable.
    for (let rang = 1; rang < 40; rang += 1) {
      const ici = ile(rang);
      for (let autre = 0; autre < rang; autre += 1) {
        const ecart = distance(ici, ile(autre));
        assert.ok(ecart > etendue(30) * 0.8, `les îles ${autre} et ${rang} se touchent`);
      }
    }
  });

  it('grandit avec son contenu, sans jamais disparaître', () => {
    assert.ok(etendue(1) >= SERRE);
    assert.ok(etendue(100) > etendue(10));
    assert.ok(etendue(0) > 0, 'une console vide reste une île');
  });

  it('place un jeu au même endroit, toujours', () => {
    // C'est la promesse de la carte : on revient et on retrouve.
    assert.deepEqual(place(3, 7), place(3, 7));
    assert.notDeepEqual(place(3, 7), place(4, 7));
  });
});

describe('la caméra', () => {
  it('amène le point visé au milieu', () => {
    const vise = place(5, 9);
    const { x, y } = camera(vise);
    assert.ok(Math.abs(vise.x + x) < 1e-9);
    assert.ok(Math.abs(vise.y + y) < 1e-9);
  });

  it('avance vers sa cible et finit par y être', () => {
    let ou = 0;
    for (let trame = 0; trame < 240; trame += 1) ou = avancer(ou, 1000, 16.7);
    assert.equal(ou, 1000, 'la caméra poursuit encore');
  });

  it('avance autant quand une trame a été sautée', () => {
    // Un pas par trame ferait ralentir la caméra sur une machine chargée,
    // c'est-à-dire exactement quand on la regarde.
    const enUneFois = avancer(0, 100, 33.4);
    let enDeux = avancer(0, 100, 16.7);
    enDeux = avancer(enDeux, 100, 16.7);
    assert.ok(Math.abs(enUneFois - enDeux) < 0.5, `${enUneFois} contre ${enDeux}`);
  });

  it('ne bouge pas quand le temps ne passe pas', () => {
    assert.equal(avancer(4, 100, 0), 4);
    assert.equal(avancer(4, 100, Number.NaN), 4);
  });

  it('regarde de plus haut quand on prend de la hauteur', () => {
    assert.ok(LOIN < PRES, 'prendre de la hauteur devrait éloigner');
  });
});

describe('les îles qu’on garde en vie', () => {
  it('en garde de part et d’autre', () => {
    const vues = autour(10, 40);
    assert.ok(vues.includes(10));
    assert.equal(vues.length, VOISINES * 2 + 1);
  });

  it('ne sort jamais de l’archipel', () => {
    for (const [choisie, combien] of [[0, 40], [39, 40], [0, 1]] as const) {
      for (const rang of autour(choisie, combien)) {
        assert.ok(rang >= 0 && rang < combien, `${rang} hors de ${combien}`);
      }
    }
    assert.deepEqual(autour(0, 0), []);
  });
});
