/**
 * Les habillages tiennent-ils leurs promesses ?
 *
 * Une palette se juge à l'œil, mais un écart de contraste ne se voit pas
 * toujours — surtout sur un bon écran, dans une pièce éclairée. Ces épreuves
 * disent ce que l'œil laisse passer.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { THEMES, contrastRatio, themeById, variables, DEFAULT_THEME } from './themes.ts';

/** Seuil du W3C pour du texte courant. */
const LISIBLE = 4.5;
/** Seuil pour du texte secondaire, plus grand ou moins pressant. */
const SECONDAIRE = 3;

describe('habillages', () => {
  it('en propose dix', () => {
    assert.equal(THEMES.length, 10);
  });

  it('ne donne jamais deux fois le même identifiant', () => {
    const vus = new Set(THEMES.map((theme) => theme.id));
    assert.equal(vus.size, THEMES.length);
  });

  it('ne donne jamais deux fois le même nom', () => {
    const vus = new Set(THEMES.map((theme) => theme.label));
    assert.equal(vus.size, THEMES.length);
  });

  it('nomme un thème par défaut qui existe', () => {
    assert.ok(THEMES.some((theme) => theme.id === DEFAULT_THEME));
  });

  it('rend le premier thème pour un identifiant inconnu', () => {
    assert.equal(themeById('n’existe pas').id, THEMES[0].id);
    assert.equal(themeById(null).id, THEMES[0].id);
  });

  it('renseigne les dix variables, en couleurs valides', () => {
    for (const theme of THEMES) {
      const couleurs = variables(theme.palette);
      assert.equal(couleurs.length, 10, `${theme.label} : variables manquantes`);
      for (const [nom, valeur] of couleurs) {
        assert.match(valeur, /^#[0-9a-f]{6}$/, `${theme.label} ${nom} : « ${valeur} »`);
      }
    }
  });

  it('garde le texte lisible sur son fond', () => {
    for (const theme of THEMES) {
      const { bg, panel, raised, ink } = theme.palette;
      for (const [nom, fond] of [['fond', bg], ['panneau', panel], ['relief', raised]] as const) {
        const rapport = contrastRatio(ink, fond);
        assert.ok(
          rapport >= LISIBLE,
          `${theme.label} : texte sur ${nom} à ${rapport.toFixed(2)}, il faut ${LISIBLE}`,
        );
      }
    }
  });

  it('garde le texte secondaire lisible', () => {
    for (const theme of THEMES) {
      const rapport = contrastRatio(theme.palette.muted, theme.palette.bg);
      assert.ok(
        rapport >= SECONDAIRE,
        `${theme.label} : texte discret à ${rapport.toFixed(2)}, il faut ${SECONDAIRE}`,
      );
    }
  });

  it('garde l’accent lisible sur le fond', () => {
    // L'accent porte les titres de section et les liens : illisible, il rend
    // la fenêtre décorative et inutilisable.
    for (const theme of THEMES) {
      const rapport = contrastRatio(theme.palette.accent, theme.palette.bg);
      assert.ok(
        rapport >= SECONDAIRE,
        `${theme.label} : accent à ${rapport.toFixed(2)}, il faut ${SECONDAIRE}`,
      );
    }
  });

  it('garde le texte lisible sur un fond accentué', () => {
    for (const theme of THEMES) {
      const rapport = contrastRatio(theme.palette.ink, theme.palette.accentSoft);
      assert.ok(
        rapport >= LISIBLE,
        `${theme.label} : texte sur accent à ${rapport.toFixed(2)}, il faut ${LISIBLE}`,
      );
    }
  });

  it('distingue les lignes alternées de leur fond, sans les crier', () => {
    for (const theme of THEMES) {
      const rapport = contrastRatio(theme.palette.row, theme.palette.bg);
      assert.ok(rapport > 1, `${theme.label} : lignes indistinctes du fond`);
      assert.ok(rapport < 2, `${theme.label} : lignes trop marquées (${rapport.toFixed(2)})`);
    }
  });

  it('compte le contraste comme le W3C', () => {
    // Deux repères connus : noir sur blanc vaut 21, une couleur sur elle-même 1.
    assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
    assert.equal(contrastRatio('#3a2c37', '#3a2c37'), 1);
  });

  it('propose au moins un thème clair et un sombre', () => {
    assert.ok(THEMES.some((theme) => theme.scheme === 'light'));
    assert.ok(THEMES.some((theme) => theme.scheme === 'dark'));
  });
});
