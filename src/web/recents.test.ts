/**
 * Les jeux récemment joués.
 *
 * Ce qui casserait ici ne se voit qu'à l'usage, des semaines plus tard : un
 * temps de jeu qui repart de zéro, un jeu en double dans la liste, un ordre qui
 * ne suit pas. Ces épreuves fixent les trois.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { COMBIEN, forget, formatPlaytime, formatWhen, parse, remember } from './recents.ts';

const jeu = (nom: string) => ({ path: `D:/roms/${nom}.md`, name: `${nom}.md`, folder: 'Md' });

/**
 * Les espaces insécables ramenées à des espaces ordinaires.
 *
 * `Intl` écrit « 30 min » avec une insécable entre le nombre et l'unité —
 * c'est la bonne typographie, et c'est invisible dans un fichier d'épreuves,
 * où la comparaison échouait sur deux textes rigoureusement identiques à
 * l'œil.
 */
const lisible = (texte: string) => texte.replace(/[\u00a0\u202f]/g, ' ');

describe('mémoire des parties', () => {
  it('met le dernier joué en tête', () => {
    let liste = remember([], jeu('Sonic'), 100);
    liste = remember(liste, jeu('Doom'), 200);
    assert.deepEqual(liste.map((r) => r.name), ['Doom.md', 'Sonic.md']);
  });

  it('ne garde jamais un jeu en double', () => {
    // Rejouer au même jeu doit le remonter, pas l'ajouter une seconde fois.
    let liste = remember([], jeu('Sonic'), 100);
    liste = remember(liste, jeu('Doom'), 200);
    liste = remember(liste, jeu('Sonic'), 300);

    assert.equal(liste.length, 2);
    assert.deepEqual(liste.map((r) => r.name), ['Sonic.md', 'Doom.md']);
  });

  it('cumule le temps de jeu au lieu de l’écraser', () => {
    // C'est le total d'heures passées sur un jeu qu'on veut lire, pas la durée
    // de la dernière partie.
    let liste = remember([], jeu('Sonic'), 100, 600);
    liste = remember(liste, jeu('Sonic'), 200, 900);
    assert.equal(liste[0].seconds, 1500);
  });

  it('ignore une durée aberrante', () => {
    // Une horloge qui recule donnerait une durée négative, et un total qui
    // diminue tout seul.
    const liste = remember([], jeu('Sonic'), 100, -5000);
    assert.equal(liste[0].seconds, 0);
  });

  it('ne dépasse pas le plafond', () => {
    let liste: ReturnType<typeof remember> = [];
    for (let i = 0; i < COMBIEN + 10; i += 1) liste = remember(liste, jeu(`Jeu${i}`), i);
    assert.equal(liste.length, COMBIEN);
    // Ce sont les plus récents qu'on garde.
    assert.equal(liste[0].name, `Jeu${COMBIEN + 9}.md`);
  });

  it('oublie un jeu sur demande', () => {
    let liste = remember([], jeu('Sonic'), 100);
    liste = remember(liste, jeu('Doom'), 200);
    assert.deepEqual(forget(liste, 'D:/roms/Sonic.md').map((r) => r.name), ['Doom.md']);
  });
});

describe('relecture du stockage', () => {
  it('relit ce qu’elle a écrit', () => {
    const liste = remember([], jeu('Sonic'), 100, 60);
    assert.deepEqual(parse(JSON.stringify(liste)), liste);
  });

  it('survit à un stockage vide ou abîmé', () => {
    assert.deepEqual(parse(null), []);
    assert.deepEqual(parse(''), []);
    assert.deepEqual(parse('pas du json'), []);
    assert.deepEqual(parse('{"pas":"un tableau"}'), []);
  });

  it('écarte une entrée qui ne désigne aucun jeu', () => {
    // La garder ferait une ligne qui ne mène nulle part.
    const brut = '[{"name":"sans chemin"},{"path":"","name":"vide"},{"path":"D:/a.md","name":"a.md"}]';
    assert.deepEqual(parse(brut).map((r) => r.path), ['D:/a.md']);
  });

  it('complète ce qui manque plutôt que de rejeter', () => {
    const lu = parse('[{"path":"D:/a.md","name":"a.md"}]');
    assert.equal(lu[0].folder, '');
    assert.equal(lu[0].seconds, 0);
    assert.equal(lu[0].played, 0);
  });
});

describe('temps de jeu écrit', () => {
  it('nomme les premières secondes plutôt que d’afficher zéro', () => {
    assert.equal(formatPlaytime(0), 'moins d’une minute');
    assert.equal(formatPlaytime(59), 'moins d’une minute');
  });

  it('passe aux minutes puis aux heures', () => {
    assert.equal(lisible(formatPlaytime(60)), '1 min');
    assert.equal(lisible(formatPlaytime(1800)), '30 min');
    assert.equal(lisible(formatPlaytime(3600)), '1 h');
    assert.equal(lisible(formatPlaytime(3600 * 3 + 720)), '3 h 12');
  });

  it('survit à une valeur impossible', () => {
    assert.equal(formatPlaytime(Number.NaN), 'moins d’une minute');
    assert.equal(formatPlaytime(-1), 'moins d’une minute');
  });

  it('écrit ses unités dans la langue demandée', () => {
    assert.equal(lisible(formatPlaytime(1800, 'de')), '30 Min.');
    assert.equal(formatPlaytime(0, 'en', 'less than a minute'), 'less than a minute');
  });
});

describe('date écrite', () => {
  const MAINTENANT = 1_700_000_000;

  it('dit l’écart, pas le jour du calendrier', () => {
    assert.equal(lisible(formatWhen(MAINTENANT, MAINTENANT)), 'maintenant');
    assert.equal(lisible(formatWhen(MAINTENANT - 600, MAINTENANT)), 'il y a 10 min');
    assert.equal(lisible(formatWhen(MAINTENANT - 7200, MAINTENANT)), 'il y a 2 h');
    assert.equal(lisible(formatWhen(MAINTENANT - 86_400, MAINTENANT)), 'hier');
    assert.equal(lisible(formatWhen(MAINTENANT - 86_400 * 3, MAINTENANT)), 'il y a 3 jours');
  });

  it('ne parle jamais du futur', () => {
    // Une horloge qui recule ne doit pas donner « il y a -2 h ».
    assert.equal(lisible(formatWhen(MAINTENANT + 5000, MAINTENANT)), 'maintenant');
  });

  it('suit la langue demandée, tournure comprise', () => {
    // Le nombre passe devant en français, derrière en japonais : c'est
    // exactement ce qu'une phrase assemblée à la main ne sait pas faire.
    assert.equal(lisible(formatWhen(MAINTENANT - 86_400 * 3, MAINTENANT, 'en')), '3 days ago');
    assert.equal(lisible(formatWhen(MAINTENANT - 86_400, MAINTENANT, 'de')), 'gestern');
    assert.equal(lisible(formatWhen(MAINTENANT - 86_400 * 3, MAINTENANT, 'ja')), '3 日前');
  });
});
