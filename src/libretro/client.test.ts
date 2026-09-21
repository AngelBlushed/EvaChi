import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { decodeFrame, portsSuivants } from './client.ts';

const HEADER_BYTES = 16;
const FLAG_VIDEO = 1 << 0;
const FLAG_SHUTDOWN = 1 << 1;

/**
 * Fabrique un bloc de trame comme le fait `pack_frame` côté Rust.
 *
 * Le format est réécrit ici plutôt qu'importé, et c'est tout l'intérêt : si
 * les deux moitiés divergent, ces tests le disent.
 */
function packFrame(options: {
  width?: number;
  height?: number;
  pixels?: number[] | null;
  audio?: number[];
  shutdown?: boolean;
}): ArrayBuffer {
  const { width = 0, height = 0, pixels = null, audio = [], shutdown = false } = options;

  let flags = 0;
  if (pixels) flags |= FLAG_VIDEO;
  if (shutdown) flags |= FLAG_SHUTDOWN;

  const buffer = new ArrayBuffer(HEADER_BYTES + (pixels?.length ?? 0) + audio.length * 2);
  const view = new DataView(buffer);

  view.setUint32(0, width, true);
  view.setUint32(4, height, true);
  view.setUint32(8, flags, true);
  view.setUint32(12, audio.length / 2, true);

  let offset = HEADER_BYTES;
  for (const byte of pixels ?? []) {
    view.setUint8(offset, byte);
    offset += 1;
  }
  for (const sample of audio) {
    view.setInt16(offset, sample, true);
    offset += 2;
  }

  return buffer;
}

describe('décodage des trames', () => {
  it('lit les dimensions et les pixels', () => {
    const raw = packFrame({
      width: 2,
      height: 1,
      pixels: [0xff, 0x00, 0x00, 0xff, 0x00, 0xff, 0x00, 0xff],
    });

    const frame = decodeFrame(raw);
    assert.equal(frame.width, 2);
    assert.equal(frame.height, 1);
    assert.deepEqual(Array.from(frame.video ?? []), [255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it('convertit le son en flottants dans [-1, 1]', () => {
    const raw = packFrame({ audio: [32767, -32768, 0, 16384] });
    const frame = decodeFrame(raw);

    assert.equal(frame.audio.length, 4, 'deux trames stéréo');
    assert.ok(Math.abs(frame.audio[0] - 0.99997) < 0.0001, 'maximum positif');
    assert.equal(frame.audio[1], -1, 'minimum');
    assert.equal(frame.audio[2], 0);
    assert.equal(frame.audio[3], 0.5);
  });

  it('conserve l\'entrelacement des canaux', () => {
    // Gauche croissante, droite décroissante : un décodeur qui les mélange
    // produirait une suite monotone.
    const raw = packFrame({ audio: [100, -100, 200, -200, 300, -300] });
    const frame = decodeFrame(raw);

    for (let index = 0; index < 3; index += 1) {
      assert.ok(frame.audio[index * 2] > 0, `canal gauche positif, trame ${index}`);
      assert.ok(frame.audio[index * 2 + 1] < 0, `canal droit négatif, trame ${index}`);
    }
  });

  it('signale une trame sans image neuve', () => {
    const raw = packFrame({ audio: [1, 2] });
    const frame = decodeFrame(raw);

    assert.equal(frame.video, null, 'aucune image : le cœur a demandé un report');
    assert.equal(frame.width, 0);
    assert.equal(frame.height, 0);
    assert.equal(frame.audio.length, 2);
  });

  it('remonte la demande d\'arrêt du cœur', () => {
    assert.equal(decodeFrame(packFrame({ shutdown: true })).shutdown, true);
    assert.equal(decodeFrame(packFrame({})).shutdown, false);
  });

  it('accepte une trame muette', () => {
    const raw = packFrame({ width: 1, height: 1, pixels: [1, 2, 3, 4] });
    const frame = decodeFrame(raw);

    assert.equal(frame.audio.length, 0);
    assert.deepEqual(Array.from(frame.video ?? []), [1, 2, 3, 4]);
  });

  it('copie les pixels au lieu d\'en garder une vue', () => {
    // Le tampon source est réutilisé d'une trame à l'autre côté natif : une vue
    // se ferait écraser sous les pieds de l'appelant.
    const raw = packFrame({ width: 1, height: 1, pixels: [10, 20, 30, 40] });
    const frame = decodeFrame(raw);

    new Uint8Array(raw).fill(0);
    assert.deepEqual(Array.from(frame.video ?? []), [10, 20, 30, 40]);
  });

  it('rejette un en-tête tronqué', () => {
    assert.throws(() => decodeFrame(new ArrayBuffer(8)), /tronquée/);
  });

  it('rejette un bloc plus court que ce qu\'il annonce', () => {
    // On annonce une image 4×4 mais on ne fournit que l'en-tête.
    const buffer = new ArrayBuffer(HEADER_BYTES);
    const view = new DataView(buffer);
    view.setUint32(0, 4, true);
    view.setUint32(4, 4, true);
    view.setUint32(8, FLAG_VIDEO, true);

    assert.throws(() => decodeFrame(buffer), /tronquée/);
  });
});

describe('manettes des joueurs suivants', () => {
  it('convertit les pressions et les axes comme pour le premier joueur', () => {
    const [deuxieme] = portsSuivants([
      { boutons: [false, true], manches: [1, -1, 0, 0.5] },
    ]);

    assert.equal(deuxieme?.input.length, 16, 'un cœur lit toujours les seize');
    assert.equal(deuxieme?.input[0], 0);
    assert.equal(deuxieme?.input[1], 1);
    assert.deepEqual(deuxieme?.axes, [32767, -32767, 0, 16384]);
  });

  it('borne un axe qui déborde plutôt que de le faire tourner', () => {
    // Une manette mal calibrée rend parfois 1,02 : sans borne, le tour du
    // compteur enverrait « à fond à gauche » pour un joueur qui pousse à
    // droite.
    const [manette] = portsSuivants([{ boutons: [], manches: [1.02, -3, 0, 0] }]);

    assert.equal(manette?.axes[0], 32767);
    assert.equal(manette?.axes[1], -32767);
  });

  it('ne rend rien quand personne d’autre ne joue', () => {
    assert.deepEqual(portsSuivants([]), []);
  });
});
