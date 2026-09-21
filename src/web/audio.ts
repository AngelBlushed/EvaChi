/**
 * Sépare un flux stéréo entrelacé en deux canaux, en changeant de cadence au
 * passage.
 *
 * Interpolation linéaire, sans filtre anti-repliement : le but est qu'un cœur
 * annonçant une cadence exotique s'entende, pas qu'il s'entende parfaitement.
 *
 * @param interleaved gauche, droite, gauche… dans [-1, 1].
 * @param outFrames nombre de trames voulues en sortie.
 */
// Le type de retour est laissé à l'inférence : écrit à la main, `Float32Array`
// se généralise en `ArrayBufferLike`, que `copyToChannel` refuse.
export function resampleStereo(interleaved: Float32Array, outFrames: number) {
  const frames = interleaved.length >> 1;
  const left = new Float32Array(outFrames);
  const right = new Float32Array(outFrames);

  if (frames === 0 || outFrames === 0) return { left, right };

  if (outFrames === frames) {
    for (let f = 0; f < frames; f += 1) {
      left[f] = interleaved[f * 2];
      right[f] = interleaved[f * 2 + 1];
    }
    return { left, right };
  }

  // Le dernier échantillon de sortie doit retomber sur le dernier d'entrée,
  // d'où les `- 1` : sans eux, la fin du tampon est tronquée ou dépassée.
  const ratio = (frames - 1) / Math.max(1, outFrames - 1);

  for (let f = 0; f < outFrames; f += 1) {
    const position = f * ratio;
    const index = Math.min(Math.floor(position), frames - 1);
    const next = Math.min(index + 1, frames - 1);
    const blend = position - index;

    left[f] = interleaved[index * 2] * (1 - blend) + interleaved[next * 2] * blend;
    right[f] = interleaved[index * 2 + 1] * (1 - blend) + interleaved[next * 2 + 1] * blend;
  }

  return { left, right };
}

/**
 * Le niveau retenu, de 0 à 1, à partir de ce que le stockage rend.
 *
 * Rien d'écrit vaut plein, et non muet. La nuance a l'air d'une broutille :
 * `Number(null)` vaut zéro, qui est un volume parfaitement valide, et la
 * première ouverture se faisait donc en silence — une panne qu'on cherche
 * partout sauf dans le réglage qu'on n'a jamais touché.
 */
export function niveauRetenu(brut: string | null): number {
  if (brut === null || brut.trim() === '') return 1;
  const pourcent = Number(brut);
  if (!Number.isFinite(pourcent) || pourcent < 0 || pourcent > 100) return 1;
  return pourcent / 100;
}

/**
 * Sortie audio par file d'attente.
 *
 * Chaque trame émulée dépose ses échantillons sur une horloge qui court devant
 * le temps réel. Le cœur reste maître du son qu'il produit : la sortie ne fait
 * que l'ordonnancer, ce qui vaut aussi bien pour le buzzer du CHIP-8 que pour
 * les huit voies d'une console 16 bits.
 */
export class AudioSink {
  #context: AudioContext | null = null;
  #gain: GainNode | null = null;
  #cursor = 0;
  #enabled = true;
  /** Le niveau voulu, de 0 à 1. Retenu même avant l'ouverture du contexte. */
  #volume = 1;

  /** Marge de sécurité : sans elle, le moindre à-coup se traduit par un clic. */
  readonly #latency = 0.09;

  /** Ouvre le contexte audio. À appeler depuis un geste de l'utilisateur. */
  async unlock(): Promise<void> {
    if (!this.#context) {
      this.#context = new AudioContext();
      this.#gain = this.#context.createGain();
      this.#gain.gain.value = this.#sortie();
      this.#gain.connect(this.#context.destination);
    }
    if (this.#context.state === 'suspended') await this.#context.resume();
  }

  /**
   * Le niveau de sortie, de 0 à 1.
   *
   * Plein régime vaut soixante pour cent du maximum, et non cent : un cœur
   * rend des échantillons déjà proches de la butée, et sommer deux voies
   * saturées ferait craquer la sortie. C'est le réglage qui existait, figé ;
   * il devient réglable sans changer ce qu'on entendait jusqu'ici.
   */
  #sortie(): number {
    return 0.6 * Math.max(0, Math.min(1, this.#volume));
  }

  /** Règle le volume du jeu, de 0 à 1. Prend effet immédiatement. */
  setVolume(niveau: number): void {
    this.#volume = Number.isFinite(niveau) ? niveau : 1;
    if (this.#gain) this.#gain.gain.value = this.#sortie();
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) this.#cursor = 0;
  }

  /** Repart de zéro : à appeler en changeant de cœur ou de contenu. */
  flush(): void {
    this.#cursor = 0;
  }

  /**
   * `interleaved` est stéréo entrelacé, comme le veut le contrat des cœurs.
   *
   * Les cadences annoncées vont du raisonnable à l'extrême : SameBoy déclare
   * 2 097 152 Hz, l'horloge brute de la Game Boy. Web Audio refuse presque
   * tout au-delà de quelques centaines de kilohertz, et `createBuffer` lève
   * alors une exception. On rééchantillonne donc systématiquement vers la
   * cadence du contexte plutôt que de parier sur celle du cœur.
   */
  push(interleaved: Float32Array, sampleRate: number): void {
    if (!this.#enabled || !this.#context || !this.#gain) return;

    const frames = interleaved.length >> 1;
    if (frames === 0) return;

    const target = this.#context.sampleRate;
    const outFrames =
      sampleRate === target ? frames : Math.max(1, Math.round((frames * target) / sampleRate));

    const { left, right } = resampleStereo(interleaved, outFrames);

    const buffer = this.#context.createBuffer(2, outFrames, target);
    buffer.copyToChannel(left, 0);
    buffer.copyToChannel(right, 1);

    const source = this.#context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.#gain);

    const now = this.#context.currentTime;
    // Si le rendu a pris du retard, on se recale devant plutôt que de jouer
    // des échantillons déjà périmés.
    if (this.#cursor < now + 0.005) this.#cursor = now + this.#latency;
    source.start(this.#cursor);
    this.#cursor += buffer.duration;
  }
}
