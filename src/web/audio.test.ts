import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { niveauRetenu, resampleStereo } from './audio.ts';

/** Construit un flux entrelacé à partir des deux canaux. */
function interleave(left: number[], right: number[]): Float32Array {
  const out = new Float32Array(left.length * 2);
  for (let f = 0; f < left.length; f += 1) {
    out[f * 2] = left[f];
    out[f * 2 + 1] = right[f];
  }
  return out;
}

describe('rééchantillonnage stéréo', () => {
  it('sépare les canaux sans les mélanger', () => {
    const source = interleave([1, 2, 3, 4], [-1, -2, -3, -4]);
    const { left, right } = resampleStereo(source, 4);

    assert.deepEqual(Array.from(left), [1, 2, 3, 4]);
    assert.deepEqual(Array.from(right), [-1, -2, -3, -4]);
  });

  it('conserve les extrémités en changeant de cadence', () => {
    // Le premier et le dernier échantillon doivent retomber exactement sur
    // ceux d'entrée : c'est là que se logent les erreurs d'indice.
    const source = interleave([0, 1, 2, 3, 4], [10, 11, 12, 13, 14]);
    const { left, right } = resampleStereo(source, 3);

    assert.equal(left[0], 0, 'première valeur');
    assert.equal(left[2], 4, 'dernière valeur');
    assert.equal(right[0], 10);
    assert.equal(right[2], 14);
  });

  it('interpole entre deux échantillons', () => {
    const source = interleave([0, 10], [0, -10]);
    const { left, right } = resampleStereo(source, 3);

    assert.deepEqual(Array.from(left), [0, 5, 10], 'milieu interpolé');
    assert.deepEqual(Array.from(right), [0, -5, -10]);
  });

  it('suréchantillonne sans dépasser le tampon', () => {
    // 735 trames à 2 097 152 Hz vers 48 000 Hz : le cas SameBoy, à l'envers.
    const frames = 64;
    const source = interleave(
      Array.from({ length: frames }, (_, i) => i / frames),
      Array.from({ length: frames }, (_, i) => -i / frames),
    );
    const { left, right } = resampleStereo(source, 512);

    assert.equal(left.length, 512);
    assert.ok(left.every(Number.isFinite), 'aucune valeur indéfinie');
    assert.ok(right.every(Number.isFinite));
    assert.ok(left[511] <= 1 && left[511] >= 0, 'la fin reste dans la plage');
  });

  it('sous-échantillonne fortement sans erreur', () => {
    // Le cas réel : 2 097 152 Hz annoncés par SameBoy vers les 48 kHz du
    // navigateur, soit un rapport de plus de quarante.
    const frames = 4096;
    const source = interleave(
      Array.from({ length: frames }, (_, i) => Math.sin(i / 50)),
      Array.from({ length: frames }, (_, i) => Math.cos(i / 50)),
    );
    const { left, right } = resampleStereo(source, 94);

    assert.equal(left.length, 94);
    assert.ok(left.every((v) => v >= -1 && v <= 1), 'reste dans [-1, 1]');
    assert.ok(right.every(Number.isFinite));
  });

  it('accepte un flux vide', () => {
    const { left, right } = resampleStereo(new Float32Array(0), 10);
    assert.equal(left.length, 10);
    assert.ok(left.every((v) => v === 0), 'silence plutôt que valeurs indéfinies');
    assert.ok(right.every((v) => v === 0));
  });

  it('accepte une sortie vide', () => {
    const { left } = resampleStereo(interleave([1, 2], [3, 4]), 0);
    assert.equal(left.length, 0);
  });

  it('gère une seule trame en entrée', () => {
    const { left, right } = resampleStereo(interleave([0.5], [-0.5]), 4);
    assert.ok(left.every((v) => v === 0.5), 'la valeur unique est tenue');
    assert.ok(right.every((v) => v === -0.5));
  });
});

describe('niveau de volume retenu', () => {
  it('vaut plein quand rien n’a jamais été réglé', () => {
    // Le piège : `Number(null)` vaut zéro, qui est un volume valide. La
    // première ouverture se faisait donc en silence.
    assert.equal(niveauRetenu(null), 1);
    assert.equal(niveauRetenu(''), 1);
    assert.equal(niveauRetenu('   '), 1);
  });

  it('rend la part écrite, zéro compris', () => {
    assert.equal(niveauRetenu('0'), 0);
    assert.equal(niveauRetenu('50'), 0.5);
    assert.equal(niveauRetenu('100'), 1);
  });

  it('ignore ce qui n’est pas un réglage', () => {
    assert.equal(niveauRetenu('beaucoup'), 1);
    assert.equal(niveauRetenu('-10'), 1);
    assert.equal(niveauRetenu('1000'), 1);
  });
});
