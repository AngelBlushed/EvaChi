/**
 * La géométrie du carrousel.
 *
 * Un présentoir se juge à trois choses : que l'ordre à l'écran soit celui de
 * la liste, que la sélection se détache, et que rien n'apparaisse ni ne
 * disparaisse d'un coup. Les trois se vérifient sans écran.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { MARGE, RATIO_CARTE, RAYON, bandes, fenetre, place } from './carrousel.ts';

/** La place d'une jaquette, avec la certitude qu'elle en a une. */
function posee(ecart: number) {
  const trouvee = place(ecart);
  assert.ok(trouvee, `aucune place pour l'écart ${ecart}`);
  return trouvee;
}

describe('les bandes vides d’une jaquette recadrée', () => {
  it('n’en laisse aucune quand la jaquette a la forme de sa case', () => {
    const vide = bandes(RATIO_CARTE);
    assert.equal(vide.x, 0);
    assert.equal(vide.y, 0);
  });

  it('en laisse en haut et en bas quand la jaquette est large', () => {
    // Une jaquette carrée dans une case en trois quarts : elle touche les
    // bords gauche et droit, et il reste un huitième de vide de chaque côté.
    const carree = bandes(1);
    assert.equal(carree.x, 0);
    assert.ok(Math.abs(carree.y - 0.125) < 1e-9, `${carree.y} au lieu de 0,125`);
  });

  it('en laisse à gauche et à droite quand la jaquette est étroite', () => {
    const haute = bandes(0.5);
    assert.equal(haute.y, 0);
    assert.ok(Math.abs(haute.x - 1 / 6) < 1e-9, `${haute.x} au lieu d'un sixième`);
  });

  it('ne resserre rien sur une image sans dimensions', () => {
    // Une image qui n'a pas chargé rend zéro : sans cette garde, le liseré
    // disparaîtrait ou se refermerait sur lui-même.
    for (const impossible of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.deepEqual(bandes(impossible), { x: 0, y: 0 }, `pour ${impossible}`);
    }
  });

  it('ne rend jamais une bande qui mangerait la moitié de la case', () => {
    // Une bande d'une demi-case fermerait le liseré sur un trait.
    for (const rapport of [0.01, 0.3, 1, 3, 100]) {
      const trouvee = bandes(rapport);
      assert.ok(trouvee.x < 0.5 && trouvee.y < 0.5, `${rapport} : ${JSON.stringify(trouvee)}`);
      assert.ok(trouvee.x >= 0 && trouvee.y >= 0);
    }
  });
});

describe('la place d’une jaquette', () => {
  it('met celle qu’on regarde droite, entière et devant', () => {
    // C'est la seule chose qu'on lit de loin : laquelle serait lancée.
    const centre = posee(0);
    assert.equal(centre.x, 0);
    assert.equal(centre.rotation, 0);
    assert.equal(centre.echelle, 1);
    assert.equal(centre.opacite, 1);
    for (let loin = 1; loin <= MARGE; loin += 1) {
      assert.ok(centre.z > posee(loin).z, `la voisine ${loin} n’est pas derrière`);
      assert.ok(centre.plan > posee(loin).plan, `la voisine ${loin} passe devant`);
    }
  });

  it('range les voisines dans l’ordre de la liste', () => {
    // La panne la plus déroutante : pousser à droite et voir la jaquette
    // partir à gauche, ou deux voisines se croiser en chemin.
    let precedent = Number.NEGATIVE_INFINITY;
    for (let ecart = -MARGE; ecart <= MARGE; ecart += 1) {
      const x = posee(ecart).x;
      assert.ok(x > precedent, `l’écart ${ecart} revient en arrière : ${x} après ${precedent}`);
      precedent = x;
    }
  });

  it('traite les deux côtés à l’identique', () => {
    // Un carrousel dont la gauche et la droite ne se ressemblent pas donne
    // l'impression d'être de travers, sans qu'on sache dire pourquoi.
    for (let loin = 1; loin <= MARGE; loin += 1) {
      const droite = posee(loin);
      const gauche = posee(-loin);
      assert.equal(gauche.x, -droite.x);
      assert.equal(gauche.rotation, -droite.rotation);
      assert.equal(gauche.z, droite.z);
      assert.equal(gauche.echelle, droite.echelle);
      assert.equal(gauche.opacite, droite.opacite);
      assert.equal(gauche.plan, droite.plan);
    }
  });

  it('éloigne, rétrécit et efface à mesure', () => {
    for (let loin = 2; loin <= MARGE; loin += 1) {
      const ici = posee(loin);
      const avant = posee(loin - 1);
      assert.ok(ici.echelle <= avant.echelle, `la voisine ${loin} grandit`);
      assert.ok(ici.opacite < avant.opacite, `la voisine ${loin} s’éclaircit`);
      assert.ok(ici.z < avant.z, `la voisine ${loin} avance`);
      assert.ok(ici.plan < avant.plan, `la voisine ${loin} remonte la pile`);
    }
  });

  it('ne montre jamais une jaquette par la tranche', () => {
    // À quatre-vingt-dix degrés, une jaquette n'a plus de surface : elle
    // clignote au lieu de tourner.
    for (let ecart = -MARGE; ecart <= MARGE; ecart += 1) {
      assert.ok(Math.abs(posee(ecart).rotation) < 80);
    }
  });

  it('fait entrer et sortir les jaquettes par la transparence', () => {
    // Le rang de réserve est posé mais invisible : sans lui, une jaquette
    // apparaîtrait d'un coup au lieu de glisser depuis le bord.
    assert.equal(posee(MARGE).opacite, 0);
    assert.equal(posee(-MARGE).opacite, 0);
    assert.ok(posee(RAYON).opacite > 0, 'la dernière visible doit se voir');
    assert.equal(place(MARGE + 1), null);
    assert.equal(place(-MARGE - 1), null);
    assert.equal(place(400), null);
  });

  it('en montre assez pour qu’on voie où l’on va', () => {
    assert.ok(RAYON >= 3);
  });
});

describe('la fenêtre des jaquettes posées', () => {
  it('ne pose que le voisinage de la sélection', () => {
    const rangs = fenetre(50, 600);
    assert.equal(rangs[0], 50 - MARGE);
    assert.equal(rangs.at(-1), 50 + MARGE);
    assert.equal(rangs.length, MARGE * 2 + 1);
  });

  it('ne sort pas de la liste à ses deux bouts', () => {
    // Sans cette borne, le premier jeu d'une console demanderait des rangs
    // négatifs, et le dernier des rangs qui n'existent pas.
    assert.equal(fenetre(0, 4)[0], 0);
    assert.deepEqual(fenetre(0, 3), [0, 1, 2]);
    assert.deepEqual(fenetre(2, 3), [0, 1, 2]);
  });

  it('supporte une console vide et une sélection aberrante', () => {
    assert.deepEqual(fenetre(0, 0), []);
    assert.deepEqual(fenetre(-7, 2), [0, 1]);
    assert.deepEqual(fenetre(99, 2), [0, 1]);
  });
});
