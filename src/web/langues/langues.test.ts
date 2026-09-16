/**
 * L'épreuve des traductions.
 *
 * Une langue se vérifie mal à l'œil : personne ici ne lit le tamoul, et une
 * ligne oubliée au milieu de deux cent soixante-dix-neuf décale tout ce qui
 * suit sans rien casser — l'interface afficherait simplement la mauvaise
 * phrase au mauvais endroit. Ce qui se vérifie, en revanche, c'est la forme :
 * le compte, les trous à remplir, les balises, les formes de pluriel.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AVEC_BALISES, CLES } from './cles.ts';
import { LANGUES, LISTES } from './index.ts';
import { table } from './table.ts';
import { compte, poserLangue, t } from '../i18n.ts';

/** Les balises d'une phrase, dans l'ordre : `<code>`, `</strong>`, etc. */
const balises = (phrase: string): string[] => phrase.match(/<\/?[a-z]+>/g) ?? [];

/** Les trous d'une phrase à remplir : `{0}`, `{1}`… */
const trous = (phrase: string): string[] => [...new Set(phrase.match(/\{\d\}/g) ?? [])].sort();

describe('les clés', () => {
  it('ne se répètent pas', () => {
    assert.equal(new Set(CLES).size, CLES.length);
  });

  it('désignent les paragraphes à balises par leur rang', () => {
    assert.ok(AVEC_BALISES.length > 0, 'il y a des paragraphes mis en forme');
    for (const rang of AVEC_BALISES) {
      assert.ok(balises(CLES[rang]).length > 0, `sans balise : ${CLES[rang]}`);
    }
  });
});

describe('les langues proposées', () => {
  it('portent chacune un code distinct', () => {
    const codes = LANGUES.map((langue) => langue.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  it('comptent le français, qui n’a pas de table', () => {
    const francais = LANGUES.find((langue) => langue.code === 'fr');
    assert.ok(francais, 'le français doit être proposé');
    assert.deepEqual(francais.table, {});
  });

  it('se rangent par leur nom propre', () => {
    // Pas le français d'abord : quelqu'un qui ne lit pas la langue en cours
    // cherche le nom de la sienne, et le cherche là où l'alphabet le met.
    const noms = LANGUES.map((langue) => langue.nom);
    assert.deepEqual(noms, [...noms].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('portent un code qu’`Intl` reconnaît', () => {
    // Un code inventé ferait tomber tout accord de pluriel, toute date et
    // toute taille de fichier — et seulement dans cette langue-là.
    for (const langue of LANGUES) {
      const rendu = new Intl.PluralRules(langue.code);
      assert.equal(
        rendu.resolvedOptions().locale.split('-')[0].toLowerCase(),
        langue.code.split('-')[0].toLowerCase(),
        `code méconnu : ${langue.code}`,
      );
    }
  });

  it('en proposent assez pour que le choix ait un sens', () => {
    assert.ok(LANGUES.length >= 25, `seulement ${LANGUES.length} langues`);
  });
});

describe('chaque table de traduction', () => {
  for (const { code, textes } of LISTES) {
    describe(code, () => {
      it('compte exactement autant de lignes que de clés', () => {
        assert.equal(
          textes.length,
          CLES.length,
          `${textes.length} traductions pour ${CLES.length} clés`,
        );
      });

      it('ne laisse aucune ligne vide', () => {
        for (const [rang, texte] of textes.entries()) {
          assert.ok(texte.trim().length > 0, `ligne ${rang + 1} vide : ${CLES[rang]}`);
        }
      });

      it('garde les trous à remplir', () => {
        // `dit('{0} installé', nom)` compte sur ce trou. Une traduction qui
        // l'oublie ferait disparaître le nom du jeu, en silence.
        for (const [rang, clef] of CLES.entries()) {
          const attendus = trous(clef);
          if (attendus.length === 0) continue;
          assert.deepEqual(trous(textes[rang]), attendus, `trous perdus : ${clef}`);
        }
      });

      it('garde les balises des paragraphes', () => {
        for (const rang of AVEC_BALISES) {
          assert.deepEqual(
            balises(textes[rang]),
            balises(CLES[rang]),
            `balises changées : ${CLES[rang].slice(0, 40)}…`,
          );
        }
      });

      it('donne une forme à chaque catégorie de pluriel employée', () => {
        // Le russe en emploie trois, l'arabe six, le japonais une seule. On
        // demande à chaque langue les formes qu'elle emploie réellement.
        const faite = table(textes);
        const regles = new Intl.PluralRules(code);
        const noms = [...new Set(CLES.filter((clef) => clef.includes('#')).map((clef) => clef.split('#')[0]))];
        const employees = new Set(
          [0, 1, 2, 3, 5, 11, 21, 100, 1000].map((nombre) => regles.select(nombre)),
        );
        for (const nom of noms) {
          for (const categorie of employees) {
            assert.ok(faite[`${nom}#${categorie}`], `${nom}#${categorie} manque`);
          }
        }
      });
    });
  }
});

describe('la traduction à l’usage', () => {
  it('rend la phrase française quand la langue est le français', () => {
    poserLangue(null);
    assert.equal(t('Bibliothèque'), 'Bibliothèque');
  });

  it('traduit, puis accorde le nom avec le nombre', () => {
    const anglais = LANGUES.find((langue) => langue.code === 'en');
    assert.ok(anglais, 'l’anglais doit être proposé');
    poserLangue(anglais);

    assert.equal(t('Bibliothèque'), anglais.table['Bibliothèque']);
    assert.equal(compte(1, 'jeu', 'jeux'), `1 ${anglais.table['jeu#one']}`);
    assert.equal(compte(4, 'jeu', 'jeux'), `4 ${anglais.table['jeu#other']}`);

    poserLangue(null);
  });

  it('rend la phrase d’origine plutôt qu’une case vide', () => {
    poserLangue({ code: 'en', nom: 'English', table: {} });
    assert.equal(t('Bibliothèque'), 'Bibliothèque');
    poserLangue(null);
  });
});
