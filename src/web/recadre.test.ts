/**
 * Le cadre de recadrage.
 *
 * Ce qui casse ici ne se voit qu'en tirant un coin dans le mauvais sens, ou en
 * poussant le cadre contre un bord : deux gestes qu'on fait sans y penser, et
 * qui donnent un rectangle impossible si rien ne les borne.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { DEBORD, MINIMUM, TOUT, borner, change, deplacer, etirer, tirer, zoomer } from './recadre.ts';

const proche = (obtenu: number, attendu: number, quoi: string) =>
  assert.ok(Math.abs(obtenu - attendu) < 1e-9, `${quoi} : ${obtenu} au lieu de ${attendu}`);

const memeCadre = (obtenu: ReturnType<typeof borner>, attendu: Record<string, number>) => {
  for (const [nom, valeur] of Object.entries(attendu)) {
    proche(obtenu[nom as 'x' | 'y' | 'w' | 'h'], valeur, nom);
  }
};

describe('bornes du cadre', () => {
  it('part de l’image entière', () => {
    memeCadre(borner(TOUT), { x: 0, y: 0, w: 1, h: 1 });
  });

  it('laisse le cadre déborder, pour pouvoir dézoomer', () => {
    // Une jaquette trop serrée ne se répare qu'en prenant plus que l'image :
    // ce qui dépasse deviendra une bande transparente.
    const large = borner({ x: -0.3, y: -0.3, w: 1.6, h: 1.6 });
    proche(large.x, -0.3, 'x');
    proche(large.w, 1.6, 'largeur');
  });

  it('ne laisse pas le cadre se réduire à rien', () => {
    const petit = borner({ x: 0.5, y: 0.5, w: 0, h: -1 });
    proche(petit.w, MINIMUM, 'largeur');
    proche(petit.h, MINIMUM, 'hauteur');
  });

  it('garde toujours un pied dans l’image', () => {
    // Parti tout à fait à côté, le cadre ne donnerait qu'une jaquette vide, et
    // on ne saurait plus comment le ramener.
    const perdu = borner({ x: 9, y: -9, w: 0.5, h: 0.5 });
    proche(perdu.x, 0.75, 'x');
    proche(perdu.y, 0.25 - 0.5, 'y');
  });

  it('ne laisse pas le cadre grandir sans fin', () => {
    const geant = borner({ x: 0, y: 0, w: 99, h: 99 });
    proche(geant.w, 1 + 2 * DEBORD, 'largeur');
    proche(geant.h, 1 + 2 * DEBORD, 'hauteur');
  });
});

describe('déplacement', () => {
  const moitie = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };

  it('avance sans changer de taille', () => {
    memeCadre(deplacer(moitie, 0.1, -0.1), { x: 0.35, y: 0.15, w: 0.5, h: 0.5 });
  });

  it('garde sa taille en butant sur la limite', () => {
    // Poussé à bout, le cadre s'arrête en gardant sa taille : le rétrécir au
    // passage ferait perdre une part d'image sans le vouloir.
    const loin = deplacer(moitie, 5, 5);
    proche(loin.w, 0.5, 'largeur');
    proche(loin.x, 0.75, 'x');
  });

  it('peut sortir par la gauche pour ajouter une bande', () => {
    const dehors = deplacer(moitie, -0.4, 0);
    proche(dehors.x, -0.15, 'x');
    proche(dehors.w, 0.5, 'largeur');
  });
});

describe('resserrement', () => {
  it('garde le centre en place', () => {
    const serre = zoomer({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 0.5);
    proche(serre.x + serre.w / 2, 0.5, 'centre en x');
    proche(serre.y + serre.h / 2, 0.5, 'centre en y');
    proche(serre.w, 0.25, 'largeur');
  });

  it('peut dépasser l’image, et c’est là tout l’intérêt', () => {
    // Élargir au-delà de 1, c'est ajouter des bandes autour de la jaquette :
    // le seul moyen de la dézoomer quand elle est trop serrée.
    const large = zoomer({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 3);
    proche(large.w, 1.5, 'largeur');
    proche(large.x, -0.25, 'x');
  });

  it('étire une seule dimension à la fois', () => {
    const large = etirer({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 0.2, 0);
    proche(large.w, 0.7, 'largeur');
    proche(large.h, 0.5, 'hauteur inchangée');
    proche(large.x + large.w / 2, 0.5, 'centre en x');
  });
});

describe('coin tiré', () => {
  const moitie = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };

  it('laisse le coin d’en face où il est', () => {
    const tire = tirer(moitie, 'hg', 0.1, 0.2);
    memeCadre(tire, { x: 0.1, y: 0.2, w: 0.65, h: 0.55 });
  });

  it('accepte que le cadre se retourne', () => {
    // Tirer le coin haut-gauche au-delà du bas-droit : les deux échangent
    // leur rôle. Refuser donnerait une souris qui semble décrochée.
    const tire = tirer(moitie, 'hg', 0.9, 0.9);
    memeCadre(tire, { x: 0.75, y: 0.75, w: 0.15, h: 0.15 });
  });

  it('peut être tiré au-delà du bord', () => {
    const tire = tirer(moitie, 'bd', 4, 4);
    proche(tire.x, 0.25, 'x');
    proche(tire.w, 1 + DEBORD - 0.25, 'largeur');
  });
});

describe('crans du cadre', () => {
  const cadre = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };

  it('ne compte pas un frémissement', () => {
    // Un tic par pixel parcouru ferait une mitraillette à la souris.
    assert.equal(change(cadre, deplacer(cadre, 0.001, 0)), false);
  });

  it('compte un vrai déplacement', () => {
    assert.equal(change(cadre, deplacer(cadre, 0.02, 0)), true);
    assert.equal(change(cadre, zoomer(cadre, 0.8)), true);
  });
});
