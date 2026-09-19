/**
 * Ce qu'une console croit sentir.
 *
 * Un capteur simulé se vérifie mal à l'œil : on secoue, il se passe quelque
 * chose ou rien, et on ne sait pas dire quoi. Ce qui se vérifie, en revanche,
 * c'est la forme du signal — qu'il parte, qu'il retombe, qu'il change de sens,
 * et qu'il ne sorte jamais de ce qu'une main peut faire.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { DUREE_SECOUSSE, enSix, pencher, repos, ressenti, secouer } from './capteurs.ts';

/** La norme du vecteur d'accélération. */
const norme = (accel: readonly [number, number, number]): number =>
  Math.hypot(accel[0], accel[1], accel[2]);

describe('la machine au repos', () => {
  it('sent la pesanteur, et rien d’autre', () => {
    // Zéro partout, c'est la chute libre : quelques cœurs s'en servent pour
    // conclure que le capteur est en panne.
    const calme = repos();
    assert.deepEqual([...calme.accel], [0, -1, 0]);
    assert.deepEqual([...calme.gyro], [0, 0, 0]);
  });
});

describe('l’inclinaison au manche', () => {
  it('ne penche rien quand le manche est centré', () => {
    assert.deepEqual([...pencher(0, 0).accel], [0, -1, 0]);
  });

  it('penche du côté où l’on pousse', () => {
    assert.ok(pencher(1, 0).accel[0] > 0, 'à droite');
    assert.ok(pencher(-1, 0).accel[0] < 0, 'à gauche');
    assert.ok(pencher(0, 1).accel[2] > 0, 'vers le bas');
  });

  it('garde une pesanteur d’un g, quelle que soit l’inclinaison', () => {
    // Une machine penchée ne pèse pas plus lourd. Un cœur qui mesure la norme
    // du vecteur verrait autrement un capteur déréglé.
    for (const [x, y] of [[0, 0], [1, 0], [0, -1], [0.6, 0.6], [-1, -1]] as const) {
      const trouve = norme(pencher(x, y).accel);
      assert.ok(Math.abs(trouve - 1) < 0.02, `(${x}, ${y}) pèse ${trouve.toFixed(3)} g`);
    }
  });

  it('ne se laisse pas emporter par un manche mal calibré', () => {
    // Une manette usée rend parfois 1,4 : sans bornage, la machine se
    // retournerait.
    assert.deepEqual([...pencher(9, 0).accel], [...pencher(1, 0).accel]);
    assert.ok(Number.isFinite(norme(pencher(Number.NaN, Number.NaN).accel)));
  });
});

describe('la secousse', () => {
  it('ne secoue rien avant d’avoir commencé, ni après la fin', () => {
    assert.deepEqual([...secouer(-1).accel], [...repos().accel]);
    assert.deepEqual([...secouer(DUREE_SECOUSSE).accel], [...repos().accel]);
    assert.deepEqual([...secouer(99).accel], [...repos().accel]);
  });

  it('frappe fort au début', () => {
    // On cherche le premier pic : la plupart des jeux guettent un seuil.
    let pointe = 0;
    for (let t = 0; t < 0.12; t += 0.002) pointe = Math.max(pointe, Math.abs(secouer(t).accel[0]));
    assert.ok(pointe > 1.5, `seulement ${pointe.toFixed(2)} g`);
  });

  it('retombe avant la fin', () => {
    const tard = Math.abs(secouer(DUREE_SECOUSSE - 0.02).accel[0]);
    assert.ok(tard < 0.2, `encore ${tard.toFixed(2)} g à la fin`);
  });

  it('va et vient plutôt que de pousser dans un seul sens', () => {
    // Une poussée continue n'est pas une secousse : les jeux qui comptent les
    // allers-retours ne la verraient pas.
    const valeurs = [];
    for (let t = 0; t < 0.25; t += 0.005) valeurs.push(secouer(t).accel[0]);
    assert.ok(valeurs.some((v) => v > 0.5), 'jamais dans un sens');
    assert.ok(valeurs.some((v) => v < -0.5), 'jamais dans l’autre');
  });

  it('tourne le poignet en même temps', () => {
    let pointe = 0;
    for (let t = 0; t < 0.2; t += 0.005) pointe = Math.max(pointe, Math.abs(secouer(t).gyro[1]));
    assert.ok(pointe > 2, `gyroscope à ${pointe.toFixed(2)} rad/s`);
  });

  it('ne demande jamais l’impossible', () => {
    // Au-delà d'une dizaine de g, un cœur prudent écarte la mesure.
    for (let t = 0; t < DUREE_SECOUSSE; t += 0.004) {
      const coup = secouer(t);
      assert.ok(norme(coup.accel) < 8, `${norme(coup.accel).toFixed(2)} g à ${t.toFixed(3)} s`);
      for (const tour of coup.gyro) assert.ok(Math.abs(tour) < 20, `${tour} rad/s`);
    }
  });
});

describe('ce que le cœur reçoit', () => {
  it('ajoute la secousse à l’inclinaison au lieu de la remplacer', () => {
    // Secouer une console tenue penchée ne la remet pas à plat.
    const penche = pencher(1, 0).accel[0];
    const ensemble = ressenti(1, 0, 0.3).accel[0];
    assert.notEqual(ensemble, penche);
    assert.ok(ressenti(1, 0, null).accel[0] === penche, 'sans secousse, l’inclinaison seule');
  });

  it('rend six valeurs, dans l’ordre de libretro', () => {
    // L'ordre est celui des identifiants : trois d'accéléromètre, trois de
    // gyroscope. L'inverser ferait pencher les jeux de travers, sans panne.
    const six = enSix(pencher(1, 0));
    assert.equal(six.length, 6);
    assert.ok(six[0] > 0, 'le premier est l’accélération en X');
    assert.deepEqual(six.slice(3), [0, 0, 0], 'les trois derniers sont le gyroscope');
  });
});
