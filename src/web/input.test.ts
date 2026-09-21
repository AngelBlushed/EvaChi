/**
 * Le choix de la manette à lire.
 *
 * Cette règle est le seul endroit qui décide si une manette existe ou non pour
 * l'application. Une erreur ici ne se voit pas dans le journal : elle se voit
 * en pressant des boutons devant un écran qui ne bouge pas.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  AVANCE_RAPIDE,
  choosePad,
  lireManette,
  PAD_LEFT,
  PAD_UP,
  vitesseAvance,
} from './input.ts';

/** Un emplacement rempli, comme le navigateur en présente. */
const branchée = { connected: true };
/** Un emplacement qu'on a lâché : le navigateur garde la case, vidée. */
const débranchée = { connected: false };

describe('choix de la manette', () => {
  it('adopte une manette déjà branchée, sans attendre d’événement', () => {
    // Le cas du grief : la manette est là depuis le début, le navigateur n’a
    // rien annoncé, et l’ancienne version restait à -1 pour toujours.
    assert.equal(choosePad([branchée], -1), 0);
  });

  it('garde celle qu’on suit tant qu’elle répond', () => {
    assert.equal(choosePad([branchée, branchée], 1), 1);
  });

  it('en adopte une autre quand celle qu’on suivait a disparu', () => {
    assert.equal(choosePad([null, branchée], 0), 1);
  });

  it('lâche une manette débranchée sur place', () => {
    assert.equal(choosePad([débranchée], 0), -1);
  });

  it('ignore les emplacements vides, que le navigateur expose toujours', () => {
    // `getGamepads()` rend quatre cases, le plus souvent toutes nulles.
    assert.equal(choosePad([null, null, branchée, null], -1), 2);
  });

  it('rend -1 quand il n’y a rien', () => {
    assert.equal(choosePad([null, null, null, null], -1), -1);
  });

  it('ne prend pas un indice hors du tableau pour une manette', () => {
    // Un emplacement annoncé puis retiré laisse un indice qui ne désigne plus
    // rien : le lire sans vérifier rendrait `undefined` à chaque trame.
    assert.equal(choosePad([], 3), -1);
    assert.equal(choosePad([branchée], 7), 0);
  });
});

describe('avance rapide', () => {
  it('ne change rien tant que les manches ne sont pas enfoncés', () => {
    assert.equal(vitesseAvance(1, false), 1);
    assert.equal(vitesseAvance(0.5, false), 0.5);
    assert.equal(vitesseAvance(9, false), 9);
  });

  it('vise une allure absolue, quelle que soit la jauge', () => {
    // Au ralenti comme à vitesse normale, l'avance rapide donne la même allure :
    // c'est ce qu'on attend d'un bouton qui sert à passer un dialogue.
    assert.equal(vitesseAvance(1, true), AVANCE_RAPIDE);
    assert.equal(vitesseAvance(0.5, true), AVANCE_RAPIDE);
  });

  it('ne ralentit jamais un jeu déjà plus rapide qu’elle', () => {
    // Une jauge poussée à 900 % ne doit pas retomber à 300 % parce qu'un pouce
    // traîne sur les manches.
    assert.equal(vitesseAvance(9, true), 9);
    assert.equal(vitesseAvance(AVANCE_RAPIDE, true), AVANCE_RAPIDE);
  });
});

/** Une manette au repos : seize boutons relâchés, quatre axes centrés. */
function manetteVide(): { buttons: { pressed: boolean }[]; axes: number[] } {
  return {
    buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
    axes: [0, 0, 0, 0],
  };
}

/** Une correspondance minuscule, pour que l'épreuve dise ce qu'elle vérifie. */
const LIAISONS = new Map([
  [0, 8],
  [1, 0],
  [PAD_LEFT, 6],
  [PAD_UP, 4],
]);

describe('lecture d’une manette', () => {
  it('traduit les boutons par la correspondance qu’on lui donne', () => {
    const pad = manetteVide();
    pad.buttons[0] = { pressed: true };

    const lue = lireManette(pad, LIAISONS, 0.5, 0.12);

    assert.equal(lue.boutons[8], true, 'le bouton du bas vaut A');
    assert.equal(lue.boutons[0], false, 'et rien d’autre');
  });

  it('fait valoir le manche gauche pour la croix', () => {
    // Bien des manettes récentes n’ont qu’un manche confortable, et bien des
    // jeux n’attendent que la croix.
    const pad = manetteVide();
    pad.axes = [-0.9, 0, 0, 0];

    const lue = lireManette(pad, LIAISONS, 0.5, 0.12);

    assert.equal(lue.boutons[6], true, 'poussé à gauche, la croix va à gauche');
    assert.equal(lue.boutons[4], false);
  });

  it('laisse un manche usé tranquille', () => {
    // Une manette posée sur la table ne rend jamais exactement zéro : sans
    // cette zone morte, le personnage dérive tout seul.
    const pad = manetteVide();
    pad.axes = [0.05, -0.3, 0, 0];

    const lue = lireManette(pad, LIAISONS, 0.5, 0.12);

    assert.equal(lue.manches[0], 0, 'sous le seuil, au repos');
    assert.equal(lue.manches[1], -0.3, 'au-dessus, tel quel');
  });

  it('rend toujours seize boutons et quatre axes, manette muette comprise', () => {
    // Le navigateur présente parfois une manette sans axes ni boutons : le
    // cœur, lui, lit toujours les seize et les quatre.
    const lue = lireManette({ buttons: [], axes: [] }, LIAISONS, 0.5, 0.12);

    assert.equal(lue.boutons.length, 16);
    assert.equal(lue.manches.length, 4);
    assert.ok(lue.boutons.every((tenu) => tenu === false));
    assert.ok(lue.manches.every((axe) => axe === 0));
  });
});
