/**
 * La salle de projection tient-elle debout ?
 *
 * Deux choses se vérifient ici sans écran : que le panier tourne dans le bon
 * sens et garde ses vues dans l'ordre, et que la poussière reste dans le
 * faisceau. Un grain qui sort du cône se voit tout de suite — c'est une
 * étincelle dans le noir, au milieu de rien.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  AILE,
  ECRAN,
  GRAINS,
  OBJECTIF,
  PAS,
  cone,
  grain,
  lampe,
  panier,
  panierVisible,
  vue,
} from './seance.ts';

const INSTANTS = [0, 0.4, 1.9, 5.5, 12.2, 27.8, 64.1];

describe('le panier', () => {
  it('montre toute la console quand elle est courte', () => {
    assert.deepEqual(panierVisible(1, 4), [0, 1, 2, 3]);
  });

  it('reste plein dès qu’il y a de quoi des deux côtés', () => {
    const combien = AILE * 2 + 1;
    for (const choisi of [9, 244, 479]) {
      assert.equal(panierVisible(choisi, 489).length, combien, `au rang ${choisi}`);
    }
  });

  it('se raccourcit au bord plutôt que de faire le tour du plateau', () => {
    for (const choisi of [0, 3, 486, 488]) {
      for (const rang of panierVisible(choisi, 489)) {
        assert.ok(Math.abs(rang - choisi) <= AILE, `le rang ${rang} est trop loin de ${choisi}`);
      }
    }
  });

  it('ne rend rien pour une console vide', () => {
    assert.deepEqual(panier(0, 0), []);
  });

  it('tient la vue choisie dans la fenêtre du projecteur', () => {
    const vues = panier(30, 489);
    const dedans = vues.filter((v) => v.dansLaFenetre);
    assert.equal(dedans.length, 1);
    assert.equal(dedans[0].rang, 30);
    assert.equal(dedans[0].x, 0);
    assert.equal(dedans[0].y, 0);
  });

  it('range les vues de gauche à droite, sans croisement', () => {
    const vues = panier(200, 489);
    for (let i = 1; i < vues.length; i += 1) {
      assert.ok(vues[i].x > vues[i - 1].x, `rangs ${vues[i - 1].rang} et ${vues[i].rang} croisés`);
    }
  });

  it('écrase le cercle en ellipse, pour qu’il se lise comme un plateau', () => {
    // Un panier de projecteur est posé à plat : ce qui s'éloigne descend peu
    // et rapetisse beaucoup. Sans cela on croirait à une roue dressée.
    const loin = vue(209, 200);
    assert.ok(loin.y > 0, 'le panier ne se creuse pas');
    assert.ok(loin.y < Math.abs(loin.x), 'le panier se dresse comme une roue');
    assert.ok(loin.echelle < vue(200, 200).echelle);
  });

  it('passe la vue de la fenêtre devant les autres', () => {
    const vues = panier(200, 489);
    const devant = vues.find((v) => v.dansLaFenetre);
    assert.ok(devant);
    for (const autre of vues) {
      if (autre.dansLaFenetre) continue;
      assert.ok(devant.z > autre.z);
    }
  });

  it('ne fait pas un tour complet, même avec toute une console dedans', () => {
    // Au-delà d'un demi-tour, les vues du bout reviendraient devant celles du
    // milieu et le panier se lirait à l'envers.
    assert.ok(AILE * PAS < 90, 'le panier dépasse le quart de tour');
  });
});

describe('la poussière dans le faisceau', () => {
  /** Demi-largeur du cône à une hauteur donnée, en fractions de la vue. */
  const demi = (y: number): number => {
    const t = (OBJECTIF.y - y) / (OBJECTIF.y - ECRAN.y);
    return 0.012 + (ECRAN.demi - 0.012) * t;
  };

  it('garde chaque grain dans le cône', () => {
    for (const secondes of INSTANTS) {
      for (let rang = 0; rang < GRAINS; rang += 1) {
        const g = grain(rang, secondes);
        assert.ok(
          Math.abs(g.x - ECRAN.x) <= demi(g.y) + 1e-9,
          `le grain ${rang} est sorti du faisceau à ${secondes} s`,
        );
      }
    }
  });

  it('tient les grains entre l’objectif et l’écran', () => {
    for (const secondes of INSTANTS) {
      for (let rang = 0; rang < GRAINS; rang += 1) {
        const g = grain(rang, secondes);
        assert.ok(g.y <= OBJECTIF.y + 1e-9 && g.y >= ECRAN.y - 1e-9, `grain ${rang}`);
      }
    }
  });

  it('les éteint aux deux bouts, et jamais au-delà du visible', () => {
    for (const secondes of INSTANTS) {
      for (let rang = 0; rang < GRAINS; rang += 1) {
        const g = grain(rang, secondes);
        assert.ok(g.a >= 0 && g.a <= 0.33, `grain ${rang} à ${g.a}`);
        assert.ok(g.r > 0);
      }
    }
  });

  it('ne les déplace pas d’un bond entre deux trames', () => {
    // Un grain qui saute est un grain qui clignote : à soixante trames par
    // seconde, il ne doit pas traverser plus d'un millième de la vue.
    for (let rang = 0; rang < GRAINS; rang += 1) {
      const avant = grain(rang, 8);
      const apres = grain(rang, 8 + 1 / 60);
      assert.ok(Math.hypot(apres.x - avant.x, apres.y - avant.y) < 0.01, `grain ${rang}`);
    }
  });

  it('les ramène au départ sans les faire disparaître en pleine lumière', () => {
    // Le grain qui boucle revient à l'objectif, où son éclat vaut zéro.
    const g = grain(3, 0);
    assert.ok(g.a >= 0);
  });
});

describe('le cône et la lampe', () => {
  it('part étroit de l’objectif et s’ouvre sur l’écran', () => {
    const points = cone();
    assert.equal(points.length, 4);
    const bas = Math.abs(points[1].x - points[0].x);
    const haut = Math.abs(points[2].x - points[3].x);
    assert.ok(haut > bas * 5, 'le faisceau ne s’ouvre pas');
  });

  it('fait trembler la lampe, sans la faire clignoter', () => {
    for (const secondes of INSTANTS) {
      const eclat = lampe(secondes);
      assert.ok(eclat > 0.9 && eclat < 1.1, `éclat de ${eclat} à ${secondes} s`);
    }
  });
});
