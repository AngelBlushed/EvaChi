/**
 * Le déplacement dans la grille.
 *
 * Une grille qui saute une case ou qui perd sa sélection se sent manette en
 * main et ne se lit nulle part. Ces épreuves fixent le comportement attendu,
 * bords compris — c'est toujours là que ça casse.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { Held, columnsFor, move, step } from './navigation.ts';

/*  Grille de référence, 4 colonnes, 10 jeux :
 *
 *    0  1  2  3
 *    4  5  6  7
 *    8  9
 */
const COUNT = 10;
const COLS = 4;

describe('déplacement dans la grille', () => {
  it('avance et recule sur une ligne', () => {
    assert.equal(move(1, COUNT, COLS, 'droite'), 2);
    assert.equal(move(2, COUNT, COLS, 'gauche'), 1);
  });

  it('ne sort pas par les côtés', () => {
    // Rester en place plutôt que passer à la ligne : on ne perd jamais de vue
    // où l'on est.
    assert.equal(move(0, COUNT, COLS, 'gauche'), 0);
    assert.equal(move(3, COUNT, COLS, 'droite'), 3);
    assert.equal(move(7, COUNT, COLS, 'droite'), 7);
  });

  it('monte et descend d’une ligne entière', () => {
    assert.equal(move(5, COUNT, COLS, 'bas'), 9);
    assert.equal(move(9, COUNT, COLS, 'haut'), 5);
  });

  it('ne sort pas par le haut', () => {
    assert.equal(move(2, COUNT, COLS, 'haut'), 2);
  });

  it('descend jusqu’à la dernière case quand la ligne est incomplète', () => {
    // Depuis la case 6, la case 10 n'existe pas — mais il reste des jeux
    // dessous. Refuser le mouvement donnerait une grille qui paraît bloquée.
    assert.equal(move(6, COUNT, COLS, 'bas'), 9);
    assert.equal(move(7, COUNT, COLS, 'bas'), 9);
  });

  it('ne bouge plus quand on est déjà sur la dernière ligne', () => {
    assert.equal(move(8, COUNT, COLS, 'bas'), 8);
    assert.equal(move(9, COUNT, COLS, 'bas'), 9);
  });

  it('ne sort pas de la grille même avec un indice aberrant', () => {
    // La sélection survit à un changement de bibliothèque : elle peut désigner
    // une case qui n'existe plus.
    assert.equal(move(99, COUNT, COLS, 'gauche'), 8);
    assert.equal(move(-4, COUNT, COLS, 'droite'), 1);
  });

  it('survit à une grille vide', () => {
    assert.equal(move(0, 0, COLS, 'bas'), 0);
  });

  it('survit à une grille d’une seule colonne', () => {
    assert.equal(move(0, 3, 1, 'bas'), 1);
    assert.equal(move(2, 3, 1, 'droite'), 2);
  });
});

describe('pas dans une file', () => {
  it('avance et recule', () => {
    assert.equal(step(2, 5, 1), 3);
    assert.equal(step(2, 5, -1), 1);
  });

  it('s’arrête aux deux bouts plutôt que de boucler', () => {
    assert.equal(step(0, 5, -1), 0);
    assert.equal(step(4, 5, 1), 4);
  });

  it('rattrape un indice devenu impossible', () => {
    // La bibliothèque change ; la sélection peut désigner une console qui
    // n'est plus là.
    assert.equal(step(99, 5, 1), 4);
    assert.equal(step(-3, 5, -1), 0);
  });

  it('survit à une file vide', () => {
    assert.equal(step(0, 0, 1), 0);
  });
});

describe('nombre de colonnes', () => {
  it('compte ce qui tient dans la largeur', () => {
    // Quatre tuiles de 100 avec 20 d'écart : 100+20+100+20+100+20+100 = 460.
    assert.equal(columnsFor(460, 100, 20), 4);
    assert.equal(columnsFor(459, 100, 20), 3);
  });

  it('en garde toujours au moins une', () => {
    assert.equal(columnsFor(10, 100, 20), 1);
    assert.equal(columnsFor(0, 100, 20), 1);
  });
});

describe('appui tenu', () => {
  it('rend un appui au moment où le bouton s’enfonce', () => {
    const bouton = new Held(400, 100);
    assert.deepEqual(bouton.update(true, 0), { pressed: true, repeat: false });
  });

  it('ne rend rien tant que le bouton est simplement tenu', () => {
    const bouton = new Held(400, 100);
    bouton.update(true, 0);
    assert.deepEqual(bouton.update(true, 100), { pressed: false, repeat: false });
    assert.deepEqual(bouton.update(true, 399), { pressed: false, repeat: false });
  });

  it('répète après l’attente, puis régulièrement', () => {
    const bouton = new Held(400, 100);
    bouton.update(true, 0);
    assert.equal(bouton.update(true, 400).repeat, true);
    assert.equal(bouton.update(true, 450).repeat, false);
    assert.equal(bouton.update(true, 500).repeat, true);
  });

  it('repart à zéro quand on relâche', () => {
    const bouton = new Held(400, 100);
    bouton.update(true, 0);
    bouton.update(false, 50);
    assert.deepEqual(bouton.update(true, 60), { pressed: true, repeat: false });
  });
});
