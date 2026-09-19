/**
 * Le parcours d'une fenêtre à la manette.
 *
 * Ce qui casse ici ne se voit qu'en essayant : un réglage qu'on ne peut pas
 * atteindre, une fenêtre qu'on referme sans le vouloir, un tour de liste qui
 * reste bloqué au dernier élément.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { SELECTEUR_ACTIF, gestePour, premierUtile, tourne } from './focus.ts';

describe('geste attendu selon l’élément', () => {
  it('clique un bouton', () => {
    assert.equal(gestePour('BUTTON', ''), 'cliquer');
    assert.equal(gestePour('button', ''), 'cliquer');
  });

  it('coche une case', () => {
    assert.equal(gestePour('INPUT', 'checkbox'), 'cocher');
    assert.equal(gestePour('INPUT', 'radio'), 'cocher');
  });

  it('pousse un curseur plutôt que de le cliquer', () => {
    // Cliquer un curseur ne fait rien : sans cette distinction, le volume et
    // la vitesse resteraient inatteignables à la manette.
    assert.equal(gestePour('INPUT', 'range'), 'glisser');
  });

  it('compte un champ de nombre plutôt que de le cliquer', () => {
    // Une manette n'a pas de pavé numérique : la valeur cherchée se donne en
    // poussant à gauche et à droite, ou elle ne se donne pas du tout.
    assert.equal(gestePour('INPUT', 'number'), 'compter');
  });

  it('déroule une liste plutôt que de la cliquer', () => {
    assert.equal(gestePour('SELECT', ''), 'derouler');
  });

  it('clique tout le reste', () => {
    assert.equal(gestePour('INPUT', 'search'), 'cliquer');
    assert.equal(gestePour('A', ''), 'cliquer');
  });
});

describe('tour de liste', () => {
  it('avance et recule', () => {
    assert.equal(tourne(1, 5, 1), 2);
    assert.equal(tourne(1, 5, -1), 0);
  });

  it('fait le tour dans les deux sens', () => {
    // Ici on boucle, contrairement à la bibliothèque : dix entrées se
    // reparcourent plus vite en continuant qu'en remontant.
    assert.equal(tourne(4, 5, 1), 0);
    assert.equal(tourne(0, 5, -1), 4);
  });

  it('survit à une liste vide', () => {
    assert.equal(tourne(0, 0, 1), 0);
    assert.equal(tourne(3, 0, -1), 0);
  });

  it('rattrape un indice devenu impossible', () => {
    assert.equal(tourne(99, 5, 1), 0);
  });
});

describe('premier élément visé', () => {
  it('saute les boutons qui font sortir', () => {
    // Ouvrir une fenêtre pour se retrouver sur « Fermer » invite à en sortir.
    assert.equal(premierUtile(['Fermer', 'Thème clair', 'Thème sombre']), 1);
    assert.equal(premierUtile(['Annuler', 'Valider']), 1);
  });

  it('prend le premier quand rien ne fait sortir', () => {
    assert.equal(premierUtile(['Thème clair', 'Fermer']), 0);
  });

  it('ne se laisse pas tromper par les espaces ni la casse', () => {
    assert.equal(premierUtile(['  FERMER  ', 'Réglages']), 1);
  });

  it('retombe sur zéro quand tout fait sortir', () => {
    assert.equal(premierUtile(['Fermer', 'Annuler']), 0);
    assert.equal(premierUtile([]), 0);
  });
});

describe('sélecteur des éléments actifs', () => {
  it('écarte ce qui est désactivé', () => {
    // Une entrée grisée qui prendrait le focus donnerait une manette qui ne
    // répond plus, sans explication.
    assert.ok(SELECTEUR_ACTIF.includes('button:not([disabled])'));
    assert.ok(SELECTEUR_ACTIF.includes('select:not([disabled])'));
  });

  it('écarte ce qui est retiré du parcours', () => {
    assert.ok(SELECTEUR_ACTIF.includes('[tabindex]:not([tabindex="-1"])'));
  });
});
