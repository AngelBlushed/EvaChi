/**
 * Les filtres d'image : balayage, quadrillage, tube cathodique.
 *
 * Un jeu de 1991 a été dessiné pour un téléviseur cathodique, et le
 * téléviseur faisait la moitié du travail : il espaçait les lignes, il
 * séparait les couleurs en trois bandes, il arrondissait les coins et il
 * laissait déborder les blancs. Montré tel quel sur une dalle, le même jeu
 * paraît plus dur et plus plat qu'il ne l'a jamais été. Ces filtres rendent
 * une partie de ce travail.
 *
 * Le calcul est fait par la carte graphique, une fois par pixel affiché et non
 * par pixel de la console : c'est ce qui permet d'avoir une ligne de balayage
 * fine sur un écran moderne, là où un filtre appliqué à la trame d'origine
 * n'aurait qu'un pixel sur deux à noircir.
 *
 * Ces filtres ne valent que pour les cœurs joués dans la fenêtre. Un émulateur
 * autonome affiche son image lui-même, dans sa propre fenêtre, et garde ses
 * propres réglages.
 */

import { aTraduire } from './i18n.ts';

export interface Nuance {
  /** Identifiant retenu entre deux lancements. */
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  /** Le corps du calcul, ou `null` quand il n'y a rien à faire. */
  readonly source: string | null;
}

/**
 * Le passage des sommets : deux triangles qui couvrent l'écran.
 *
 * Le même pour tous les filtres — seule la couleur de chaque point change
 * d'un filtre à l'autre. L'image est retournée ici une fois pour toutes : une
 * trame arrive du cœur la première ligne en haut, et une texture se lit la
 * première ligne en bas.
 */
export const SOMMETS = `
attribute vec2 place;
varying vec2 uv;
void main() {
  uv = vec2(place.x * 0.5 + 0.5, 0.5 - place.y * 0.5);
  gl_Position = vec4(place, 0.0, 1.0);
}
`;

/** Ce que tout filtre reçoit. */
const ENTETE = `
precision mediump float;
varying vec2 uv;
uniform sampler2D image;
/** La taille de la trame, en pixels de la console. */
uniform vec2 taille;
/** La taille affichée, en pixels de l'écran. */
uniform vec2 ecran;
`;

/**
 * Le balayage : une ligne sur deux, comme un téléviseur les traçait.
 *
 * Le creux suit les lignes de la console et non celles de l'écran : c'est
 * ainsi qu'on le voyait, une ligne noire entre deux lignes d'image, quelle
 * que soit la taille du téléviseur. On rend un peu de lumière ensuite, sans
 * quoi l'image s'assombrit de moitié et l'on croit le filtre cassé.
 */
const BALAYAGE = `${ENTETE}
void main() {
  vec3 couleur = texture2D(image, uv).rgb;
  float ligne = uv.y * taille.y;
  float creux = 0.5 + 0.5 * cos(ligne * 6.2831853);
  // Les lignes ne se voient que si une ligne de console couvre au moins deux
  // pixels d'écran : en dessous, on les efface plutôt que de faire du bruit.
  float visible = clamp(ecran.y / max(taille.y, 1.0) - 1.0, 0.0, 1.0);
  couleur *= mix(1.0, 0.42 + 0.58 * creux, 0.75 * visible);
  gl_FragColor = vec4(couleur * (1.0 + 0.22 * visible), 1.0);
}
`;

/**
 * Le quadrillage : les trois bandes de couleur d'un masque à fentes.
 *
 * Un pixel de la console était trois fentes — une rouge, une verte, une bleue
 * — et c'est de leur mélange que naissait sa couleur. De près on voyait les
 * fentes ; de loin, une couleur unie plus douce que celle d'une dalle.
 */
const QUADRILLAGE = `${ENTETE}
void main() {
  vec3 couleur = texture2D(image, uv).rgb;
  float fente = mod(floor(uv.x * taille.x * 3.0), 3.0);
  vec3 masque = fente < 1.0
    ? vec3(1.0, 0.72, 0.72)
    : (fente < 2.0 ? vec3(0.72, 1.0, 0.72) : vec3(0.72, 0.72, 1.0));
  // Trois fentes par pixel de console ne se voient qu'à partir de trois pixels
  // d'écran par pixel de console. En dessous, le masque devient du bruit.
  float visible = clamp(ecran.x / max(taille.x, 1.0) - 1.5, 0.0, 1.0);
  couleur *= mix(vec3(1.0), masque, visible);
  gl_FragColor = vec4(couleur * (1.0 + 0.16 * visible), 1.0);
}
`;

/**
 * Le tube : le verre bombé, les lignes, le masque, et les bords qui s'éteignent.
 *
 * Les quatre défauts d'un téléviseur d'alors, ensemble, parce qu'ils allaient
 * ensemble. Pris séparément, chacun n'est qu'un effet ; réunis, on reconnaît
 * une image qu'on a déjà vue.
 */
const TUBE = `${ENTETE}
/** Le renflement du verre : les bords sont plus loin que le centre. */
vec2 bombe(vec2 point) {
  vec2 p = point * 2.0 - 1.0;
  vec2 creux = abs(p.yx) / vec2(5.2, 4.1);
  p += p * creux * creux;
  return p * 0.5 + 0.5;
}

void main() {
  vec2 place = bombe(uv);
  // Hors du verre, le noir du capot. Rien ne déborde du tube.
  if (place.x < 0.0 || place.x > 1.0 || place.y < 0.0 || place.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 couleur = texture2D(image, place).rgb;

  float ligne = place.y * taille.y;
  float creux = 0.5 + 0.5 * cos(ligne * 6.2831853);
  float visible = clamp(ecran.y / max(taille.y, 1.0) - 1.0, 0.0, 1.0);
  couleur *= mix(1.0, 0.48 + 0.52 * creux, 0.7 * visible);

  float fente = mod(floor(place.x * taille.x * 3.0), 3.0);
  vec3 masque = fente < 1.0
    ? vec3(1.0, 0.78, 0.78)
    : (fente < 2.0 ? vec3(0.78, 1.0, 0.78) : vec3(0.78, 0.78, 1.0));
  couleur *= mix(vec3(1.0), masque, clamp(ecran.x / max(taille.x, 1.0) - 1.5, 0.0, 1.0));

  // Le coin d'un tube reçoit moins de faisceau que son centre.
  vec2 bord = place * (1.0 - place.yx);
  float coins = clamp(pow(bord.x * bord.y * 26.0, 0.22), 0.0, 1.0);

  gl_FragColor = vec4(couleur * coins * (1.0 + 0.3 * visible), 1.0);
}
`;

export const NUANCES: readonly Nuance[] = [
  {
    id: 'aucun',
    label: aTraduire('Aucun'),
    detail: aTraduire('L’image du cœur, pixel pour pixel'),
    source: null,
  },
  {
    id: 'balayage',
    label: aTraduire('Balayage'),
    detail: aTraduire('Une ligne sur deux assombrie, comme sur un téléviseur'),
    source: BALAYAGE,
  },
  {
    id: 'quadrillage',
    label: aTraduire('Quadrillage'),
    detail: aTraduire('Chaque pixel rendu en trois fentes, rouge, verte et bleue'),
    source: QUADRILLAGE,
  },
  {
    id: 'tube',
    label: aTraduire('Tube cathodique'),
    detail: aTraduire('Le verre bombé, les lignes, les fentes et les bords éteints'),
    source: TUBE,
  },
];

/** Le filtre portant cet identifiant, ou aucun. */
export function nuanceParId(id: string | null | undefined): Nuance {
  return NUANCES.find((nuance) => nuance.id === id) ?? NUANCES[0];
}

/**
 * Peint les trames avec un filtre.
 *
 * Tenu à part de la fenêtre : ce qui touche à WebGL est verbeux, plein d'états
 * globaux, et n'a rien à faire au milieu de la logique de l'application. Le
 * reste du programme ne voit qu'« ouvrir », « poser un filtre » et « peindre ».
 */
export class Peintre {
  readonly #gl: WebGLRenderingContext;
  readonly #texture: WebGLTexture;
  /** Les programmes déjà compilés, par identifiant de filtre. */
  readonly #programmes = new Map<string, WebGLProgram>();
  #courant: WebGLProgram | null = null;
  #largeurTrame = 0;
  #hauteurTrame = 0;
  #doux = false;

  private constructor(gl: WebGLRenderingContext, texture: WebGLTexture) {
    this.#gl = gl;
    this.#texture = texture;
  }

  /**
   * Prépare un canevas, ou rend `null` si la carte graphique ne suit pas.
   *
   * `preserveDrawingBuffer` coûte un peu, et l'on paie sciemment : sans lui,
   * une capture d'écran prise après la trame rend une image vide, et c'est
   * précisément avec un filtre qu'on a envie d'en prendre une.
   */
  static ouvrir(canevas: HTMLCanvasElement): Peintre | null {
    const gl = (canevas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: true,
    }) ?? null) as WebGLRenderingContext | null;
    if (!gl) return null;

    const tampon = gl.createBuffer();
    const texture = gl.createTexture();
    if (!tampon || !texture) return null;

    gl.bindBuffer(gl.ARRAY_BUFFER, tampon);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    return new Peintre(gl, texture);
  }

  /** Le filtre à appliquer. Faux quand il n'a pas pu être compilé. */
  poser(nuance: Nuance): boolean {
    if (!nuance.source) {
      this.#courant = null;
      return true;
    }
    const deja = this.#programmes.get(nuance.id);
    if (deja) {
      this.#courant = deja;
      return true;
    }
    const programme = this.#compiler(nuance.source);
    if (!programme) return false;
    this.#programmes.set(nuance.id, programme);
    this.#courant = programme;
    return true;
  }

  /** Les pixels de la console restent-ils carrés ? */
  lissage(doux: boolean): void {
    if (doux === this.#doux) return;
    this.#doux = doux;
    const gl = this.#gl;
    const filtre = doux ? gl.LINEAR : gl.NEAREST;
    gl.bindTexture(gl.TEXTURE_2D, this.#texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtre);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtre);
  }

  /** Envoie une trame et la peint, à la taille où le canevas est réglé. */
  peindre(largeur: number, hauteur: number, pixels: Uint8Array | Uint8ClampedArray): void {
    const gl = this.#gl;
    const programme = this.#courant;
    if (!programme || largeur <= 0 || hauteur <= 0) return;

    gl.bindTexture(gl.TEXTURE_2D, this.#texture);
    const octets = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels.buffer);
    // Une trame de même taille se remplace en place : réallouer la texture à
    // chaque image ferait travailler le pilote soixante fois par seconde pour
    // rien.
    if (largeur === this.#largeurTrame && hauteur === this.#hauteurTrame) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, largeur, hauteur, gl.RGBA, gl.UNSIGNED_BYTE, octets);
    } else {
      this.#largeurTrame = largeur;
      this.#hauteurTrame = hauteur;
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        largeur,
        hauteur,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        octets,
      );
    }

    const canevas = gl.canvas as HTMLCanvasElement;
    gl.viewport(0, 0, canevas.width, canevas.height);
    gl.useProgram(programme);

    const place = gl.getAttribLocation(programme, 'place');
    gl.enableVertexAttribArray(place);
    gl.vertexAttribPointer(place, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(gl.getUniformLocation(programme, 'image'), 0);
    gl.uniform2f(gl.getUniformLocation(programme, 'taille'), largeur, hauteur);
    gl.uniform2f(gl.getUniformLocation(programme, 'ecran'), canevas.width, canevas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  #compiler(corps: string): WebGLProgram | null {
    const gl = this.#gl;
    const sommets = this.#etage(gl.VERTEX_SHADER, SOMMETS);
    const points = this.#etage(gl.FRAGMENT_SHADER, corps);
    if (!sommets || !points) return null;

    const programme = gl.createProgram();
    if (!programme) return null;
    gl.attachShader(programme, sommets);
    gl.attachShader(programme, points);
    gl.linkProgram(programme);
    gl.deleteShader(sommets);
    gl.deleteShader(points);
    if (!gl.getProgramParameter(programme, gl.LINK_STATUS)) {
      gl.deleteProgram(programme);
      return null;
    }
    return programme;
  }

  #etage(type: number, source: string): WebGLShader | null {
    const gl = this.#gl;
    const etage = gl.createShader(type);
    if (!etage) return null;
    gl.shaderSource(etage, source);
    gl.compileShader(etage);
    if (!gl.getShaderParameter(etage, gl.COMPILE_STATUS)) {
      gl.deleteShader(etage);
      return null;
    }
    return etage;
  }
}
