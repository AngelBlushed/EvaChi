/**
 * La main de cartes tient-elle en main ?
 *
 * Un éventail se juge à l'oeil, mais ce qui le casse ne se voit qu'une fois
 * posé : une carte qui repasse derrière sa voisine, une main qui maigrit au
 * dernier jeu, un souffle si large que l'ordre des cartes s'inverse. Ces
 * épreuves fixent ce qui doit rester vrai à toute heure de la respiration.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { AILE, GROSSIT, PAS, SORTIE, SOUFFLE, carte, fenetre, main, souffle } from './eventail.ts';

/** Quelques instants répartis sur plusieurs respirations. */
const INSTANTS = [0, 0.7, 1.6, 3.2, 4.9, 6.1, 9.4, 13.3];

describe('la fenêtre du paquet', () => {
  it('montre toute la console quand elle tient dans la main', () => {
    assert.deepEqual(fenetre(2, 5), [0, 1, 2, 3, 4]);
  });

  it('garde la main pleine dès qu’il y a de quoi des deux côtés', () => {
    const combien = AILE * 2 + 1;
    for (const choisi of [7, 240, 481]) {
      assert.equal(fenetre(choisi, 489).length, combien, `au rang ${choisi}`);
    }
  });

  it('se raccourcit au bord plutôt que de s’ouvrir d’un seul côté', () => {
    // Quatorze cartes du même côté ouvriraient l'éventail à soixante-quinze
    // degrés, et les dernières sortiraient de l'écran.
    for (const choisi of [0, 1, 487, 488]) {
      for (const rang of fenetre(choisi, 489)) {
        assert.ok(Math.abs(rang - choisi) <= AILE, `le rang ${rang} est trop loin de ${choisi}`);
      }
    }
    assert.equal(fenetre(0, 489).length, AILE + 1);
  });

  it('contient toujours la carte choisie', () => {
    for (const choisi of [0, 3, 250, 488]) {
      assert.ok(fenetre(choisi, 489).includes(choisi), `au rang ${choisi}`);
    }
  });

  it('ne rend rien pour une console vide', () => {
    assert.deepEqual(fenetre(0, 0), []);
  });
});

describe('le souffle', () => {
  it('reste dans son amplitude', () => {
    for (let rang = 0; rang < 40; rang += 1) {
      for (const secondes of INSTANTS) {
        assert.ok(Math.abs(souffle(rang, secondes)) <= SOUFFLE + 1e-9);
      }
    }
  });

  it('ne fait pas balancer toutes les cartes ensemble', () => {
    // Une main rigide est un panneau : c'est le décalage d'une carte à l'autre
    // qui donne l'impression que quelqu'un la tient.
    const ecarts = [0, 1, 2, 3].map((rang) => souffle(rang, 1.3));
    assert.ok(new Set(ecarts.map((v) => v.toFixed(4))).size === 4);
  });
});

describe('la main', () => {
  it('redresse la carte choisie et la sort du paquet', () => {
    for (const secondes of INSTANTS) {
      const choisie = carte(12, 12, secondes);
      assert.equal(choisie.angle, 0, 'la carte lue penche');
      assert.ok(choisie.y < 0, 'la carte lue ne sort pas');
      assert.equal(choisie.y, -SORTIE);
      assert.equal(choisie.echelle, GROSSIT);
      assert.equal(choisie.opacite, 1);
    }
  });

  it('passe la carte choisie devant toutes les autres', () => {
    for (const secondes of INSTANTS) {
      const cartes = main(20, 489, secondes);
      const devant = cartes.find((c) => c.choisie);
      assert.ok(devant);
      for (const autre of cartes) {
        if (autre.choisie) continue;
        assert.ok(devant.z > autre.z, `le rang ${autre.rang} passe devant`);
      }
    }
  });

  it('garde les cartes dans l’ordre, quoi que fasse le souffle', () => {
    // Le souffle est plus petit que le pas, et doit le rester : deux cartes
    // qui s'échangent le temps d'une respiration font clignoter la main.
    assert.ok(SOUFFLE * 2 < PAS, 'le souffle peut dépasser le pas');
    for (const secondes of INSTANTS) {
      const cartes = main(200, 489, secondes);
      for (let i = 1; i < cartes.length; i += 1) {
        assert.ok(
          cartes[i].x > cartes[i - 1].x,
          `rangs ${cartes[i - 1].rang} et ${cartes[i].rang} croisés à ${secondes} s`,
        );
        assert.ok(cartes[i].angle > cartes[i - 1].angle, `angles croisés à ${secondes} s`);
      }
    }
  });

  it('écarte les cartes de part et d’autre, symétriquement', () => {
    const gauche = carte(9, 12, 0);
    const droite = carte(15, 12, 0);
    assert.ok(gauche.x < 0 && droite.x > 0);
    // Le souffle mis à part, la main est symétrique : c'est ce qui la fait
    // lire comme un éventail plutôt que comme une pile penchée.
    assert.ok(Math.abs(gauche.x + droite.x) < 0.09);
  });

  it('efface doucement ce qui est loin, sans jamais l’effacer tout à fait', () => {
    const cartes = main(200, 489, 0);
    for (const c of cartes) assert.ok(c.opacite >= 0.42 && c.opacite <= 1);
    const bord = cartes[0];
    const proche = cartes.find((c) => c.rang === 199);
    assert.ok(proche);
    assert.ok(bord.opacite < proche.opacite);
  });

  it('ne descend jamais si bas qu’une carte quitte l’écran', () => {
    // Le pivot est loin, mais l'arc reste peu profond : à sept cartes de la
    // choisie on ne doit pas être tombé d'une hauteur de carte.
    for (const secondes of INSTANTS) {
      for (const c of main(200, 489, secondes)) {
        assert.ok(c.y < 1, `le rang ${c.rang} sort par le bas (${c.y.toFixed(2)})`);
      }
    }
  });
});
