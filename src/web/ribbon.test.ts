/**
 * Le fond animé.
 *
 * Un fond qui bat, qui déborde ou qui se fige derrière un menu se voit tout de
 * suite mais ne se lit nulle part. Ces épreuves fixent ce qu'on attend de
 * l'onde : qu'elle reste chez elle, qu'elle bouge, et qu'elle ne se répète pas
 * trop vite.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { BANDS, draw, swing, wave } from './ribbon.ts';

describe('onde du fond', () => {
  it('ne s’éloigne jamais plus que son amplitude annoncée', () => {
    // Un ruban qui sort de l'écran laisse une bande de couleur franche en
    // bas, ou un vide en haut : c'est la panne la plus visible.
    for (const band of BANDS) {
      const ecart = swing(band);
      for (let t = 0; t < 400; t += 0.37) {
        for (let x = 0; x <= 1; x += 0.05) {
          const y = wave(x, t, band);
          assert.ok(
            y >= band.base - ecart - 1e-9 && y <= band.base + ecart + 1e-9,
            `ruban ${band.base} sorti à x=${x} t=${t} : ${y}`,
          );
        }
      }
    }
  });

  it('reste dans l’image', () => {
    // Un ruban qui remonterait dans le tiers haut passerait derrière la rangée
    // des consoles et brouillerait les pastilles ; un ruban qui plongerait
    // sous le bord laisserait une bande de couleur franche en bas.
    for (const band of BANDS) {
      assert.ok(band.base - swing(band) > 0.25, 'ruban trop haut');
      assert.ok(band.base + swing(band) < 1.05, 'ruban trop bas');
    }
  });

  it('les échelonne du haut vers le bas', () => {
    // Des nappes qui se recouvrent dans l'ordre : c'est ce recouvrement qui
    // donne la profondeur. Deux rubans à la même hauteur n'en font qu'un.
    for (let i = 1; i < BANDS.length; i += 1) {
      assert.ok(BANDS[i].base > BANDS[i - 1].base, `ruban ${i} mal rangé`);
    }
  });

  it('bouge vraiment d’une trame à l’autre', () => {
    // Une onde dont la vitesse serait nulle donnerait un fond peint.
    for (const band of BANDS) {
      assert.notEqual(wave(0.5, 0, band), wave(0.5, 1, band));
    }
  });

  it('avance doucement', () => {
    // Un déplacement de plus d'un centième de hauteur par trame se voit
    // sauter. À soixante trames par seconde, une trame dure 1/60 de seconde.
    for (const band of BANDS) {
      for (let t = 0; t < 60; t += 1 / 60) {
        const bond = Math.abs(wave(0.5, t + 1 / 60, band) - wave(0.5, t, band));
        assert.ok(bond < 0.01, `saut de ${bond} sur le ruban ${band.base}`);
      }
    }
  });

  it('ne fait pas battre le fond', () => {
    // Deux rubans de même vitesse se rejoindraient régulièrement et le fond
    // se mettrait à pulser. Des vitesses toutes différentes l'évitent.
    const vitesses = BANDS.map((band) => band.speed);
    assert.equal(new Set(vitesses.map(Math.abs)).size, vitesses.length);
  });

  it('en compte assez pour faire une profondeur', () => {
    assert.ok(BANDS.length >= 4);
  });
});

describe('peinture du fond', () => {
  /** Un canevas de comptoir : on note ce qu'on lui demande, sans rien peindre. */
  function canevas() {
    const appels: string[] = [];
    const ctx = {
      clearRect: () => appels.push('efface'),
      beginPath: () => appels.push('debut'),
      moveTo: () => appels.push('va'),
      lineTo: () => appels.push('trait'),
      closePath: () => appels.push('ferme'),
      fill: () => appels.push('remplit'),
      fillStyle: '',
    };
    return { ctx, appels };
  }

  it('efface avant de peindre, et remplit un ruban par bande', () => {
    // Sans l'effacement, les trames s'empilent et le fond devient opaque en
    // quelques secondes.
    const { ctx, appels } = canevas();
    draw(ctx as unknown as CanvasRenderingContext2D, 800, 600, 3, '255, 255, 255');

    assert.equal(appels[0], 'efface');
    assert.equal(appels.filter((a) => a === 'remplit').length, BANDS.length);
  });

  it('survit à une fenêtre réduite à rien', () => {
    // Une fenêtre repliée donne une largeur nulle ; ce n'est pas une raison
    // pour lever une exception dans la boucle d'affichage.
    const { ctx } = canevas();
    assert.doesNotThrow(() =>
      draw(ctx as unknown as CanvasRenderingContext2D, 0, 0, 1, '0, 0, 0'),
    );
  });
});
