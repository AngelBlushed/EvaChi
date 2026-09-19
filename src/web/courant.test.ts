/**
 * L'air que la poussière traverse.
 *
 * Un fond se juge à l'œil, mais ce qui le gâche ne se voit qu'au bout de
 * plusieurs minutes : un trait qui saute, une direction qui vire d'un coup,
 * un point où tout converge et forme une tache derrière les jaquettes. Ces
 * épreuves-là regardent ce que l'œil ne regarderait qu'une fois lassé.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  COMBIEN,
  MARQUES,
  PALEURS,
  semerCourant,
  situerMarque,
  trait,
  vitesse,
} from './courant.ts';

/** L'écart entre deux fractions, en tenant compte du rebouclage. */
const ecart = (avant: number, apres: number): number => {
  const brut = Math.abs(apres - avant);
  return Math.min(brut, 1 - brut);
};

describe('le champ du courant', () => {
  it('ne converge nulle part', () => {
    // Un champ à divergence nulle n'a pas de point où les traits se
    // rassemblent. C'est toute la raison de passer par une fonction de
    // courant : une tache derrière une jaquette se voit immédiatement.
    const pas = 1e-4;
    let pire = 0;
    for (let x = 0; x < 1; x += 0.077) {
      for (let y = 0; y < 1; y += 0.083) {
        for (const t of [0, 37, 311]) {
          const dux = (vitesse(x + pas, y, t).ux - vitesse(x - pas, y, t).ux) / (2 * pas);
          const duy = (vitesse(x, y + pas, t).uy - vitesse(x, y - pas, t).uy) / (2 * pas);
          pire = Math.max(pire, Math.abs(dux + duy));
        }
      }
    }
    assert.ok(pire < 1e-5, `divergence de ${pire}`);
  });

  it('ne s’annule jamais assez longtemps pour qu’on le voie', () => {
    // Le champ a des points d'arrêt, c'est inévitable ; ils doivent rester
    // rares, sans quoi des traits s'effondreraient en points un peu partout.
    let plats = 0;
    let total = 0;
    for (let x = 0; x < 1; x += 0.01) {
      for (let y = 0; y < 1; y += 0.01) {
        const { ux, uy } = vitesse(x, y, 5);
        total += 1;
        if (Math.hypot(ux, uy) < 0.05) plats += 1;
      }
    }
    assert.ok(plats / total < 0.01, `${((plats / total) * 100).toFixed(1)} % de points morts`);
  });
});

describe('le semis des touches', () => {
  it('rejoue le même semis à graine égale', () => {
    // Un décor qui change de composition à chaque ouverture se remarque.
    assert.deepEqual(semerCourant(7), semerCourant(7));
    assert.notDeepEqual(semerCourant(7), semerCourant(8));
  });

  it('en pose assez pour faire un air, pas assez pour le charger', () => {
    assert.equal(MARQUES.length, COMBIEN);
    assert.ok(MARQUES.length >= 120 && MARQUES.length <= 260, `${MARQUES.length} touches`);
  });

  it('les répartit sur les trois plans', () => {
    // Sans les trois pâleurs, le fond est plat : c'est la parallaxe qui tenait
    // dans la brume, et il faut bien qu'elle vienne de quelque part.
    for (const plan of PALEURS.keys()) {
      assert.ok(
        MARQUES.some((marque) => marque.plan === plan),
        `le plan ${plan} est vide`,
      );
    }
  });

  it('les garde courtes : une touche, pas une ligne', () => {
    // Un trait qui traverse l'écran donne à l'œil quelque chose à suivre, et
    // c'est exactement ce qu'un fond ne doit pas faire.
    for (const marque of MARQUES) {
      assert.ok(marque.longueur > 0 && marque.longueur < 0.04, `longueur ${marque.longueur}`);
    }
  });
});

describe('le trait d’une touche', () => {
  it('ne dépasse jamais sa longueur, quels que soient l’instant et l’angle', () => {
    // Multiplier une composante par la largeur et l'autre par la hauteur
    // cisaillerait le trait : il s'allongerait en tournant. Il peut en
    // revanche raccourcir, là où l'air se calme — c'est voulu.
    let pleine = 0;
    for (const marque of MARQUES.slice(0, 40)) {
      for (const t of [0, 13, 97, 5000]) {
        const { dx, dy } = trait(marque, t);
        const trouvee = 2 * Math.hypot(dx, dy);
        assert.ok(trouvee <= marque.longueur + 1e-9, `${trouvee} pour ${marque.longueur}`);
        if (Math.abs(trouvee - marque.longueur) < 1e-9) pleine += 1;
      }
    }
    // Et la plupart du temps elle l'atteint : un fond de touches toutes
    // rabotées ne serait plus qu'un semis de points.
    assert.ok(pleine > 40 * 4 * 0.6, `seulement ${pleine} touches à pleine longueur`);
  });

  it('reste toujours dans l’écran, même très tard', () => {
    for (const marque of MARQUES) {
      for (const t of [0, 250, 9_999]) {
        const { x, y } = situerMarque(marque, t);
        assert.ok(x >= 0 && x < 1, `x = ${x}`);
        assert.ok(y >= 0 && y < 1, `y = ${y}`);
      }
    }
  });

  it('avance sans saut visible', () => {
    for (const marque of MARQUES.slice(0, 30)) {
      for (let t = 0; t < 120; t += 1 / 30) {
        const avant = situerMarque(marque, t);
        const apres = situerMarque(marque, t + 1 / 30);
        assert.ok(ecart(avant.x, apres.x) < 0.01, 'saut de côté');
        assert.ok(ecart(avant.y, apres.y) < 0.01, 'saut vers le haut');
      }
    }
  });

  it('vire lentement : rien qui scintille', () => {
    // Une direction qui tourne vite fait scintiller le fond, et c'est la seule
    // chose qu'on verrait. Deux mesures, parce qu'une seule mentirait : la
    // moyenne dit l'allure ordinaire, et le pire dit ce qui arrive près des
    // rares points où le champ s'annule — là, la direction bascule, et il faut
    // seulement que la bascule reste sous le seuil du visible.
    let pire = 0;
    let somme = 0;
    let combien = 0;
    for (const marque of MARQUES.slice(0, 30)) {
      for (let t = 0; t < 90; t += 1 / 30) {
        const avant = trait(marque, t);
        const apres = trait(marque, t + 1 / 30);
        const cos =
          (avant.dx * apres.dx + avant.dy * apres.dy) /
          Math.max(1e-12, Math.hypot(avant.dx, avant.dy) * Math.hypot(apres.dx, apres.dy));
        const degres = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
        // Une touche raccourcie par le calme de l'air ne compte pas : elle
        // bascule, mais elle ne fait qu'un ou deux pixels quand elle le fait.
        const entiere = 2 * Math.hypot(apres.dx, apres.dy) > marque.longueur * 0.5;
        if (entiere) pire = Math.max(pire, degres);
        somme += degres;
        combien += 1;
      }
    }
    assert.ok(pire < 3, `${pire.toFixed(2)}° dans le pire cas`);
    assert.ok(somme / combien < 0.5, `${(somme / combien).toFixed(3)}° en moyenne`);
  });
});
