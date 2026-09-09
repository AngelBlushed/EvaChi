import type { AudioBuffer, EmulatorCore, Frame, Framebuffer, InputState, SystemInfo } from '../core/types.ts';
import type { Quirks } from './quirks.ts';
import { COSMAC_VIP } from './quirks.ts';

const MEMORY_SIZE = 4096;
const PROGRAM_START = 0x200;
const FONT_START = 0x50;
const SCREEN_WIDTH = 64;
const SCREEN_HEIGHT = 32;
const STACK_DEPTH = 16;
const SAMPLE_RATE = 44100;
const FPS = 60;
const BEEP_HZ = 440;

/** Glyphes hexadécimaux 4x5, un octet par ligne, quartet haut significatif. */
const FONT = new Uint8Array([
  0xf0, 0x90, 0x90, 0x90, 0xf0, // 0
  0x20, 0x60, 0x20, 0x20, 0x70, // 1
  0xf0, 0x10, 0xf0, 0x80, 0xf0, // 2
  0xf0, 0x10, 0xf0, 0x10, 0xf0, // 3
  0x90, 0x90, 0xf0, 0x10, 0x10, // 4
  0xf0, 0x80, 0xf0, 0x10, 0xf0, // 5
  0xf0, 0x80, 0xf0, 0x90, 0xf0, // 6
  0xf0, 0x10, 0x20, 0x40, 0x40, // 7
  0xf0, 0x90, 0xf0, 0x90, 0xf0, // 8
  0xf0, 0x90, 0xf0, 0x10, 0xf0, // 9
  0xf0, 0x90, 0xf0, 0x90, 0x90, // A
  0xe0, 0x90, 0xe0, 0x90, 0xe0, // B
  0xf0, 0x80, 0x80, 0x80, 0xf0, // C
  0xe0, 0x90, 0x90, 0x90, 0xe0, // D
  0xf0, 0x80, 0xf0, 0x80, 0xf0, // E
  0xf0, 0x80, 0xf0, 0x80, 0x80, // F
]);

/** "EVA8" en ASCII, en tête des états sauvegardés. */
const STATE_MAGIC = 0x45564138;
const STATE_VERSION = 1;
const STATE_SIZE = 6212;

export interface Chip8Options {
  /** Écarts de comportement à appliquer. Par défaut : COSMAC VIP. */
  quirks?: Partial<Quirks>;
  /**
   * Instructions exécutées par trame. 11 donne ~660 Hz, le réglage qui rend
   * jouable la majorité des ROMs de l'époque.
   */
  cyclesPerFrame?: number;
  /** Couleur des pixels allumés, en 0xRRGGBB. */
  foreground?: number;
  /** Couleur des pixels éteints, en 0xRRGGBB. */
  background?: number;
  /**
   * Graine du générateur pseudo-aléatoire de CXNN. Fixer une graine rend une
   * partie reproductible, ce dont dépendent les tests.
   */
  seed?: number;
}

export const CHIP8_INFO: SystemInfo = {
  id: 'chip8',
  name: 'CHIP-8',
  maxWidth: SCREEN_WIDTH,
  maxHeight: SCREEN_HEIGHT,
  aspectRatio: SCREEN_WIDTH / SCREEN_HEIGHT,
  fps: FPS,
  sampleRate: SAMPLE_RATE,
  extensions: ['.ch8', '.c8'],
};

/**
 * Interpréteur CHIP-8 complet : les 35 instructions, les six écarts de
 * comportement connus, et un état sauvegardable.
 *
 * Une trame correspond à un pas de 1/60 s : `cyclesPerFrame` instructions
 * s'exécutent, puis les deux minuteurs sont décrémentés une fois.
 */
export class Chip8 implements EmulatorCore {
  readonly info = CHIP8_INFO;
  readonly quirks: Quirks;

  cyclesPerFrame: number;

  private readonly memory = new Uint8Array(MEMORY_SIZE);
  private readonly v = new Uint8Array(16);
  private readonly stack = new Uint16Array(STACK_DEPTH);
  private readonly display = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);

  private i = 0;
  private pc = PROGRAM_START;
  private sp = 0;
  private delayTimer = 0;
  private soundTimer = 0;

  /** Registre en attente dans FX0A, ou -1 si le processeur n'est pas suspendu. */
  private awaitingKeyReg = -1;
  /** Touche pressée pendant l'attente, dont on guette maintenant le relâchement. */
  private awaitedKey = -1;
  /** Vrai si DXYN s'est exécuté dans la trame courante, pour l'écart `displayWait`. */
  private drewThisFrame = false;

  private rngState: number;
  private readonly seed: number;

  private keys: InputState = new Array(16).fill(false);
  private rom: Uint8Array = new Uint8Array(0);

  private readonly video: Framebuffer = new Uint8ClampedArray(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
  /** Stéréo entrelacé, comme l'impose le contrat : deux valeurs par échantillon. */
  private readonly audio: AudioBuffer = new Float32Array(Math.round(SAMPLE_RATE / FPS) * 2);
  private beepPhase = 0;

  private readonly foreground: number;
  private readonly background: number;

  constructor(options: Chip8Options = {}) {
    this.quirks = { ...COSMAC_VIP, ...options.quirks };
    this.cyclesPerFrame = options.cyclesPerFrame ?? 11;
    this.foreground = options.foreground ?? 0xe8f0d8;
    this.background = options.background ?? 0x121a12;
    this.seed = ((options.seed ?? 0x1a2b3c4d) >>> 0) || 1;
    this.rngState = this.seed;
    this.reset();
  }

  load(rom: Uint8Array): void {
    const capacity = MEMORY_SIZE - PROGRAM_START;
    if (rom.length === 0) {
      throw new Error('ROM vide');
    }
    if (rom.length > capacity) {
      throw new Error(`ROM de ${rom.length} octets : le CHIP-8 n'en adresse que ${capacity}`);
    }
    this.rom = rom.slice();
    this.reset();
  }

  reset(): void {
    this.memory.fill(0);
    this.memory.set(FONT, FONT_START);
    this.memory.set(this.rom, PROGRAM_START);
    this.v.fill(0);
    this.stack.fill(0);
    this.display.fill(0);
    this.i = 0;
    this.pc = PROGRAM_START;
    this.sp = 0;
    this.delayTimer = 0;
    this.soundTimer = 0;
    this.awaitingKeyReg = -1;
    this.awaitedKey = -1;
    this.drewThisFrame = false;
    this.rngState = this.seed;
    this.beepPhase = 0;
  }

  runFrame(input: InputState): Frame {
    this.keys = input;
    this.drewThisFrame = false;

    for (let cycle = 0; cycle < this.cyclesPerFrame; cycle += 1) {
      if (this.quirks.displayWait && this.drewThisFrame) {
        break;
      }
      this.step();
    }

    if (this.delayTimer > 0) this.delayTimer -= 1;
    if (this.soundTimer > 0) this.soundTimer -= 1;

    this.renderVideo();
    this.renderAudio();
    return {
      video: this.video,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
      audio: this.audio,
    };
  }

  /** Exécute une instruction, ou fait tourner l'attente de touche de FX0A. */
  step(): void {
    if (this.awaitingKeyReg >= 0) {
      this.pollAwaitedKey();
      return;
    }

    const opcode = (this.memory[this.pc] << 8) | this.memory[this.pc + 1];
    this.pc = (this.pc + 2) & 0xfff;

    const x = (opcode & 0x0f00) >> 8;
    const y = (opcode & 0x00f0) >> 4;
    const n = opcode & 0x000f;
    const nn = opcode & 0x00ff;
    const nnn = opcode & 0x0fff;

    switch (opcode & 0xf000) {
      case 0x0000:
        if (opcode === 0x00e0) {
          this.display.fill(0);
        } else if (opcode === 0x00ee) {
          if (this.sp === 0) throw new Error(`Retour hors sous-programme en $${this.hex(this.pc - 2)}`);
          this.sp -= 1;
          this.pc = this.stack[this.sp];
        }
        // 0NNN appelait du code machine 1802 natif : sans objet ici, ignoré.
        break;

      case 0x1000:
        this.pc = nnn;
        break;

      case 0x2000:
        if (this.sp >= STACK_DEPTH) throw new Error(`Débordement de pile en $${this.hex(this.pc - 2)}`);
        this.stack[this.sp] = this.pc;
        this.sp += 1;
        this.pc = nnn;
        break;

      case 0x3000:
        if (this.v[x] === nn) this.skip();
        break;

      case 0x4000:
        if (this.v[x] !== nn) this.skip();
        break;

      case 0x5000:
        if (n === 0 && this.v[x] === this.v[y]) this.skip();
        break;

      case 0x6000:
        this.v[x] = nn;
        break;

      case 0x7000:
        this.v[x] = (this.v[x] + nn) & 0xff;
        break;

      case 0x8000:
        this.arithmetic(x, y, n);
        break;

      case 0x9000:
        if (n === 0 && this.v[x] !== this.v[y]) this.skip();
        break;

      case 0xa000:
        this.i = nnn;
        break;

      case 0xb000:
        // BNNN saute en NNN + V0 ; le SUPER-CHIP relit l'opcode comme BXNN.
        this.pc = (nnn + this.v[this.quirks.jumping ? x : 0]) & 0xfff;
        break;

      case 0xc000:
        this.v[x] = this.random() & nn;
        break;

      case 0xd000:
        this.draw(this.v[x], this.v[y], n);
        break;

      case 0xe000:
        if (nn === 0x9e && this.isKeyDown(this.v[x])) this.skip();
        else if (nn === 0xa1 && !this.isKeyDown(this.v[x])) this.skip();
        break;

      case 0xf000:
        this.misc(x, nn);
        break;
    }
  }

  /** Groupe 8XY_ : affectation, logique et arithmétique entre registres. */
  private arithmetic(x: number, y: number, n: number): void {
    switch (n) {
      case 0x0:
        this.v[x] = this.v[y];
        break;

      case 0x1:
        this.v[x] |= this.v[y];
        if (this.quirks.vfReset) this.v[0xf] = 0;
        break;

      case 0x2:
        this.v[x] &= this.v[y];
        if (this.quirks.vfReset) this.v[0xf] = 0;
        break;

      case 0x3:
        this.v[x] ^= this.v[y];
        if (this.quirks.vfReset) this.v[0xf] = 0;
        break;

      case 0x4: {
        const sum = this.v[x] + this.v[y];
        // VF s'écrit en dernier : quand x vaut 0xF, l'indicateur écrase le résultat.
        this.v[x] = sum & 0xff;
        this.v[0xf] = sum > 0xff ? 1 : 0;
        break;
      }

      case 0x5: {
        const noBorrow = this.v[x] >= this.v[y] ? 1 : 0;
        this.v[x] = (this.v[x] - this.v[y]) & 0xff;
        this.v[0xf] = noBorrow;
        break;
      }

      case 0x6: {
        const src = this.quirks.shifting ? this.v[x] : this.v[y];
        this.v[x] = src >> 1;
        this.v[0xf] = src & 1;
        break;
      }

      case 0x7: {
        const noBorrow = this.v[y] >= this.v[x] ? 1 : 0;
        this.v[x] = (this.v[y] - this.v[x]) & 0xff;
        this.v[0xf] = noBorrow;
        break;
      }

      case 0xe: {
        const src = this.quirks.shifting ? this.v[x] : this.v[y];
        this.v[x] = (src << 1) & 0xff;
        this.v[0xf] = (src >> 7) & 1;
        break;
      }
    }
  }

  /** Groupe FX__ : minuteurs, clavier bloquant, index, police et mémoire. */
  private misc(x: number, nn: number): void {
    switch (nn) {
      case 0x07:
        this.v[x] = this.delayTimer;
        break;

      case 0x0a:
        // Le processeur se fige ici jusqu'au relâchement d'une touche.
        this.awaitingKeyReg = x;
        this.awaitedKey = -1;
        break;

      case 0x15:
        this.delayTimer = this.v[x];
        break;

      case 0x18:
        this.soundTimer = this.v[x];
        break;

      case 0x1e:
        this.i = (this.i + this.v[x]) & 0xffff;
        break;

      case 0x29:
        this.i = FONT_START + (this.v[x] & 0xf) * 5;
        break;

      case 0x33: {
        const value = this.v[x];
        this.memory[this.i & 0xfff] = Math.floor(value / 100);
        this.memory[(this.i + 1) & 0xfff] = Math.floor(value / 10) % 10;
        this.memory[(this.i + 2) & 0xfff] = value % 10;
        break;
      }

      case 0x55:
        for (let r = 0; r <= x; r += 1) this.memory[(this.i + r) & 0xfff] = this.v[r];
        if (this.quirks.memoryIncrement) this.i = (this.i + x + 1) & 0xffff;
        break;

      case 0x65:
        for (let r = 0; r <= x; r += 1) this.v[r] = this.memory[(this.i + r) & 0xfff];
        if (this.quirks.memoryIncrement) this.i = (this.i + x + 1) & 0xffff;
        break;
    }
  }

  /**
   * DXYN : trace un sprite de N lignes par OU exclusif, et lève VF si au moins
   * un pixel allumé s'est éteint. L'origine se replie toujours sur l'écran ;
   * seul le corps du sprite est tronqué ou replié selon l'écart `clipping`.
   */
  private draw(vx: number, vy: number, height: number): void {
    const originX = vx % SCREEN_WIDTH;
    const originY = vy % SCREEN_HEIGHT;
    this.v[0xf] = 0;
    this.drewThisFrame = true;

    for (let row = 0; row < height; row += 1) {
      const spriteY = originY + row;
      if (this.quirks.clipping && spriteY >= SCREEN_HEIGHT) break;
      const py = spriteY % SCREEN_HEIGHT;
      const bits = this.memory[(this.i + row) & 0xfff];

      for (let col = 0; col < 8; col += 1) {
        if ((bits & (0x80 >> col)) === 0) continue;
        const spriteX = originX + col;
        if (this.quirks.clipping && spriteX >= SCREEN_WIDTH) break;
        const px = spriteX % SCREEN_WIDTH;

        const index = py * SCREEN_WIDTH + px;
        if (this.display[index]) this.v[0xf] = 1;
        this.display[index] ^= 1;
      }
    }
  }

  /**
   * Fait avancer l'attente de FX0A. Le VIP valide au relâchement, pas à
   * l'appui : on mémorise la touche enfoncée, puis on rend la main quand elle
   * remonte.
   */
  private pollAwaitedKey(): void {
    if (this.awaitedKey < 0) {
      for (let key = 0; key < 16; key += 1) {
        if (this.keys[key]) {
          this.awaitedKey = key;
          return;
        }
      }
      return;
    }

    if (!this.keys[this.awaitedKey]) {
      this.v[this.awaitingKeyReg] = this.awaitedKey;
      this.awaitingKeyReg = -1;
      this.awaitedKey = -1;
    }
  }

  private isKeyDown(value: number): boolean {
    return this.keys[value & 0xf] === true;
  }

  private skip(): void {
    this.pc = (this.pc + 2) & 0xfff;
  }

  /** xorshift32 : reproductible d'une exécution à l'autre, donc testable. */
  private random(): number {
    let s = this.rngState;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.rngState = s >>> 0;
    return this.rngState & 0xff;
  }

  private renderVideo(): void {
    const fgR = (this.foreground >> 16) & 0xff;
    const fgG = (this.foreground >> 8) & 0xff;
    const fgB = this.foreground & 0xff;
    const bgR = (this.background >> 16) & 0xff;
    const bgG = (this.background >> 8) & 0xff;
    const bgB = this.background & 0xff;

    for (let p = 0; p < this.display.length; p += 1) {
      const on = this.display[p] !== 0;
      const o = p * 4;
      this.video[o] = on ? fgR : bgR;
      this.video[o + 1] = on ? fgG : bgG;
      this.video[o + 2] = on ? fgB : bgB;
      this.video[o + 3] = 0xff;
    }
  }

  /** Onde carrée continue tant que le minuteur sonore n'est pas retombé à zéro. */
  private renderAudio(): void {
    if (this.soundTimer === 0) {
      this.audio.fill(0);
      return;
    }
    const step = BEEP_HZ / SAMPLE_RATE;
    // Le buzzer est monophonique : la même valeur part sur les deux canaux.
    for (let s = 0; s < this.audio.length; s += 2) {
      const level = this.beepPhase < 0.5 ? 0.18 : -0.18;
      this.audio[s] = level;
      this.audio[s + 1] = level;
      this.beepPhase = (this.beepPhase + step) % 1;
    }
  }

  private hex(value: number): string {
    return value.toString(16).toUpperCase().padStart(3, '0');
  }

  saveState(): Uint8Array {
    const buffer = new ArrayBuffer(STATE_SIZE);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    view.setUint32(0, STATE_MAGIC);
    view.setUint8(4, STATE_VERSION);
    view.setUint8(5, this.drewThisFrame ? 1 : 0);
    view.setInt8(6, this.awaitingKeyReg);
    view.setInt8(7, this.awaitedKey);
    view.setUint16(8, this.i);
    view.setUint16(10, this.pc);
    view.setUint8(12, this.sp);
    view.setUint8(13, this.delayTimer);
    view.setUint8(14, this.soundTimer);
    view.setUint32(16, this.rngState);
    for (let s = 0; s < STACK_DEPTH; s += 1) view.setUint16(20 + s * 2, this.stack[s]);
    bytes.set(this.v, 52);
    bytes.set(this.memory, 68);
    bytes.set(this.display, 4164);

    return bytes;
  }

  loadState(state: Uint8Array): void {
    if (state.length !== STATE_SIZE) {
      throw new Error(`État de ${state.length} octets, ${STATE_SIZE} attendus`);
    }
    const view = new DataView(state.buffer, state.byteOffset, state.byteLength);
    if (view.getUint32(0) !== STATE_MAGIC) {
      throw new Error("Ce fichier n'est pas un état CHIP-8");
    }
    const version = view.getUint8(4);
    if (version !== STATE_VERSION) {
      throw new Error(`État en version ${version}, ce cœur lit la version ${STATE_VERSION}`);
    }

    this.drewThisFrame = view.getUint8(5) === 1;
    this.awaitingKeyReg = view.getInt8(6);
    this.awaitedKey = view.getInt8(7);
    this.i = view.getUint16(8);
    this.pc = view.getUint16(10);
    this.sp = view.getUint8(12);
    this.delayTimer = view.getUint8(13);
    this.soundTimer = view.getUint8(14);
    this.rngState = view.getUint32(16);
    for (let s = 0; s < STACK_DEPTH; s += 1) this.stack[s] = view.getUint16(20 + s * 2);
    this.v.set(state.subarray(52, 68));
    this.memory.set(state.subarray(68, 4164));
    this.display.set(state.subarray(4164, 6212));
  }

  // --- Accès en lecture, pour le débogueur et les tests ---

  /** Copie de l'écran, un octet par pixel, 0 ou 1. */
  getDisplay(): Uint8Array {
    return this.display.slice();
  }

  /** Copie des seize registres généraux V0..VF. */
  getRegisters(): Uint8Array {
    return this.v.slice();
  }

  getPC(): number {
    return this.pc;
  }

  getI(): number {
    return this.i;
  }

  getSoundTimer(): number {
    return this.soundTimer;
  }

  getDelayTimer(): number {
    return this.delayTimer;
  }

  /** Lit un octet de la mémoire adressable. */
  peek(address: number): number {
    return this.memory[address & 0xfff];
  }
}
