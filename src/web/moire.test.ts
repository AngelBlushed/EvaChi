/**
 * Le fond tient-il sans surveillance ?
 *
 * Un décor tourne des heures sans que personne ne le regarde vraiment, et
 * c'est là qu'il dérape : un centre qui s'en va, un anneau qui s'inverse, une
 * pâleur qui passe au noir. Ces épreuves fixent ce qui doit rester vrai à
 * n'importe quelle heure.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { ANNEAUX, ECART, FAMILLES, PALEUR, centre, paleur, rayon } from './moire.ts';

/** Des instants jusqu'à trois heures : un fond de menu tourne longtemps. */
const INSTANTS = [0, 1.7, 13, 60, 337, 1200, 4000, 10_800];

describe('les centres', () => {
  it('restent près de la vue, sans jamais s’y planter au milieu', () => {
    for (const secondes of INSTANTS) {
      for (let famille = 0; famille < FAMILLES; famille += 1) {
        const { x, y } = centre(famille, secondes);
        assert.ok(x > -0.2 && x < 1.2, `famille ${famille} en x : ${x}`);
        assert.ok(y > -0.2 && y < 1.2, `famille ${famille} en y : ${y}`);
      }
    }
  });

  it('ne se superposent jamais tout à fait', () => {
    // Deux centres confondus, c'est une seule famille : plus d'interférence,
    // plus de moiré, et le fond devient une cible.
    for (const secondes of INSTANTS) {
      const [un, deux] = [centre(0, secondes), centre(1, secondes)];
      assert.ok(Math.hypot(un.x - deux.x, un.y - deux.y) > 0.05, `à ${secondes} s`);
    }
  });

  it('dérivent assez lentement pour qu’on ne les voie pas courir', () => {
    for (let famille = 0; famille < FAMILLES; famille += 1) {
      const avant = centre(famille, 500);
      const apres = centre(famille, 500 + 1 / 60);
      assert.ok(Math.hypot(apres.x - avant.x, apres.y - avant.y) < 0.0004);
    }
  });
});

describe('les anneaux', () => {
  it('grandissent du centre vers le bord, sans se croiser', () => {
    for (const secondes of INSTANTS) {
      for (let famille = 0; famille < FAMILLES; famille += 1) {
        for (let rang = 1; rang < ANNEAUX; rang += 1) {
          assert.ok(
            rayon(famille, rang, secondes) > rayon(famille, rang - 1, secondes),
            `famille ${famille}, rang ${rang}`,
          );
        }
      }
    }
  });

  it('couvrent la diagonale d’une vue large', () => {
    // Seize neuvièmes de large sur un de haut : la diagonale vaut environ 2,06
    // hauteurs. Le dernier anneau doit passer au-delà, sinon le fond s'arrête
    // en rond au milieu de l'écran.
    const dernier = rayon(0, ANNEAUX - 1, 0);
    assert.ok(dernier > 1.2, `le dernier anneau ne fait que ${dernier.toFixed(2)} hauteur`);
  });

  it('respirent, sans que l’écart s’inverse', () => {
    for (const secondes of INSTANTS) {
      for (let famille = 0; famille < FAMILLES; famille += 1) {
        const ecart = rayon(famille, 1, secondes) - rayon(famille, 0, secondes);
        assert.ok(ecart > ECART * 0.9 && ecart < ECART * 1.1, `écart de ${ecart}`);
      }
    }
  });

  it('font glisser les figures : les deux familles ne respirent pas ensemble', () => {
    // Si les deux écarts restaient égaux, le moiré serait figé et le fond ne
    // bougerait qu'en se déplaçant — ce qui se remarque.
    const ecarts = INSTANTS.map((secondes) => rayon(0, 9, secondes) - rayon(1, 9, secondes));
    assert.ok(new Set(ecarts.map((v) => v.toFixed(6))).size > 1);
  });
});

describe('la pâleur', () => {
  it('reste discrète et jamais nulle', () => {
    for (let rang = 0; rang < ANNEAUX; rang += 1) {
      const valeur = paleur(rang);
      assert.ok(valeur > 0.01 && valeur <= PALEUR, `rang ${rang} : ${valeur}`);
    }
  });

  it('efface les grands anneaux plus que les petits', () => {
    assert.ok(paleur(ANNEAUX - 1) < paleur(0));
  });
});
