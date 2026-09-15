/**
 * Les habillages de l'interface.
 *
 * Dix palettes, une seule forme : chacune renseigne les mêmes dix variables,
 * et l'interface ne connaît qu'elles. Ajouter un thème ne demande donc pas
 * de toucher une ligne de mise en page.
 *
 * Le contraste n'est pas laissé au goût : un test vérifie que le texte reste
 * lisible sur son fond dans chacune des dix. Une palette qu'on trouve jolie et
 * qu'on ne peut pas lire est une palette ratée.
 */

/** Les couleurs que toute palette doit donner. */
export interface Palette {
  /** Fond général de la fenêtre. */
  readonly bg: string;
  /** Panneaux : barre d'outils, dialogues. */
  readonly panel: string;
  /** Éléments posés sur un panneau : champs, boutons. */
  readonly raised: string;
  /** Traits de séparation et bordures. */
  readonly edge: string;
  /** Texte courant. */
  readonly ink: string;
  /** Texte secondaire, moins pressant. */
  readonly muted: string;
  /** Couleur d'accent : titres de section, liens, sélection. */
  readonly accent: string;
  /** Fond d'un élément accentué, sur lequel `ink` doit rester lisible. */
  readonly accentSoft: string;
  /** Ce qui manque ou inquiète. */
  readonly warn: string;
  /** Une ligne sur deux dans les listes. */
  readonly row: string;
}

export interface Theme {
  /** Identifiant retenu entre deux lancements. */
  readonly id: string;
  readonly label: string;
  /** Dit au navigateur quoi faire des ascenseurs et des champs natifs. */
  readonly scheme: 'dark' | 'light';
  readonly palette: Palette;
}

export const THEMES: readonly Theme[] = [
  {
    id: 'nuit-rose',
    label: 'Nuit rose',
    scheme: 'dark',
    palette: {
      bg: '#191317',
      panel: '#201920',
      raised: '#291f28',
      edge: '#3a2c37',
      ink: '#ece0e7',
      muted: '#a4909d',
      accent: '#e59bbb',
      accentSoft: '#4a2e3d',
      warn: '#e0a458',
      row: '#241c23',
    },
  },
  {
    id: 'rose-blanc',
    label: 'Rose et blanc',
    scheme: 'light',
    palette: {
      bg: '#fff5f9',
      panel: '#ffffff',
      raised: '#fdeaf2',
      edge: '#f0c2d8',
      ink: '#38222e',
      muted: '#7d5d6c',
      accent: '#d31e6b',
      accentSoft: '#ffd9e7',
      warn: '#b1400b',
      row: '#fffafc',
    },
  },
  {
    id: 'ardoise',
    label: 'Ardoise',
    scheme: 'dark',
    palette: {
      bg: '#14171a',
      panel: '#1b1f24',
      raised: '#232830',
      edge: '#333a44',
      ink: '#e3e8ee',
      muted: '#96a2b0',
      accent: '#79b0ff',
      accentSoft: '#1d3557',
      warn: '#e0a458',
      row: '#1e2329',
    },
  },
  {
    id: 'papier',
    label: 'Papier',
    scheme: 'light',
    palette: {
      bg: '#f7f3ea',
      panel: '#fffdf8',
      raised: '#efe8da',
      edge: '#d8cbb4',
      ink: '#2f2a22',
      muted: '#726858',
      accent: '#9a4f18',
      accentSoft: '#f0dcc4',
      warn: '#a3450a',
      row: '#fbf8f1',
    },
  },
  {
    id: 'menthe',
    label: 'Menthe',
    scheme: 'dark',
    palette: {
      bg: '#0e1a17',
      panel: '#14241f',
      raised: '#1b2f28',
      edge: '#2a463c',
      ink: '#d9efe7',
      muted: '#8fada3',
      accent: '#52d6a8',
      accentSoft: '#1d4438',
      warn: '#e0a458',
      row: '#172822',
    },
  },
  {
    id: 'ambre',
    label: 'Ambre',
    scheme: 'dark',
    palette: {
      bg: '#1a1410',
      panel: '#241b14',
      raised: '#2f231a',
      edge: '#453427',
      ink: '#f0e2cf',
      muted: '#b09c85',
      accent: '#f0a338',
      accentSoft: '#4a3418',
      warn: '#e8714a',
      row: '#211910',
    },
  },
  {
    id: 'ocean',
    label: 'Océan',
    scheme: 'dark',
    palette: {
      bg: '#0c1524',
      panel: '#111e33',
      raised: '#17283f',
      edge: '#24395a',
      ink: '#dce8f7',
      muted: '#90a5c2',
      accent: '#56aeff',
      accentSoft: '#133455',
      warn: '#e0a458',
      row: '#101b2d',
    },
  },
  {
    id: 'lavande',
    label: 'Lavande',
    scheme: 'light',
    palette: {
      bg: '#f6f3fd',
      panel: '#ffffff',
      raised: '#ece5fb',
      edge: '#cfbff0',
      ink: '#2e2540',
      muted: '#6f6289',
      accent: '#6d28d9',
      accentSoft: '#e4d9fb',
      warn: '#a3450a',
      row: '#faf8ff',
    },
  },
  {
    id: 'contraste',
    label: 'Contraste élevé',
    scheme: 'dark',
    palette: {
      bg: '#000000',
      panel: '#0d0d0d',
      raised: '#1a1a1a',
      edge: '#585858',
      ink: '#ffffff',
      muted: '#d0d0d0',
      accent: '#ffe600',
      accentSoft: '#3d3800',
      warn: '#ff9a52',
      row: '#141414',
    },
  },
  {
    id: 'game-boy',
    label: 'Game Boy',
    scheme: 'dark',
    palette: {
      bg: '#0d1f0b',
      panel: '#122c10',
      raised: '#1a3d16',
      edge: '#2b5c24',
      ink: '#b8d94a',
      muted: '#87a840',
      accent: '#d4e86b',
      accentSoft: '#274d1f',
      warn: '#e0b341',
      row: '#10280e',
    },
  },
];

/** Le thème posé quand rien n'a été choisi. */
export const DEFAULT_THEME = 'nuit-rose';

/** Le thème portant cet identifiant, ou celui par défaut. */
export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

/** Les variables CSS d'une palette, prêtes à être posées. */
export function variables(palette: Palette): [string, string][] {
  return [
    ['--bg', palette.bg],
    ['--panel', palette.panel],
    ['--raised', palette.raised],
    ['--edge', palette.edge],
    ['--ink', palette.ink],
    ['--muted', palette.muted],
    ['--accent', palette.accent],
    ['--accent-soft', palette.accentSoft],
    ['--warn', palette.warn],
    ['--row', palette.row],
  ];
}

/** Applique un thème à un élément — la racine du document, en pratique. */
export function applyTheme(theme: Theme, root: HTMLElement): void {
  for (const [name, value] of variables(theme.palette)) {
    root.style.setProperty(name, value);
  }
  root.style.setProperty('color-scheme', theme.scheme);
  // Le voile des dialogues se règle là-dessus : un noir à cinquante-cinq pour
  // cent convient à une palette sombre et transforme une palette claire en
  // gris dès qu'une fenêtre s'ouvre — et elles s'ouvrent souvent.
  root.dataset.scheme = theme.scheme;
}

/** Les trois canaux d'une couleur `#rrggbb`, de 0 à 255. */
function channels(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

/**
 * Luminance relative, au sens du W3C.
 *
 * Ce n'est pas la moyenne des canaux : l'œil est bien plus sensible au vert
 * qu'au bleu, et une formule naïve déclarerait lisible un texte bleu sur noir.
 */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((canal) => {
    const v = canal / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Rapport de contraste entre deux couleurs, de 1 (identiques) à 21.
 *
 * Le seuil usuel pour du texte courant est 4,5.
 */
export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  const [clair, sombre] = a > b ? [a, b] : [b, a];
  return (clair + 0.05) / (sombre + 0.05);
}
