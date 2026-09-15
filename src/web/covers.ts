/**
 * Les jaquettes.
 *
 * Le projet libretro publie une bibliothèque de vignettes libre d'accès, rangée
 * par console et nommée d'après les jeux de noms officiels. Encore faut-il
 * relier nos fichiers aux siens — et c'est là que tout se joue.
 *
 * Une correspondance exacte ne suffit pas : mesurée sur une bibliothèque réelle,
 * elle trouve moins de quatre jaquettes sur dix. Les fichiers de quelqu'un
 * mélangent les conventions d'une console à l'autre — `(NA)` chez Atari, `(U)`
 * et `[!]` dans les vieux jeux de noms, `(Track 1) [SLES-02906]` sur les
 * disques. Le titre, lui, ne change pas. C'est donc sur lui qu'on rapproche.
 *
 * Ce module ne parle à personne : il reçoit une liste de noms disponibles et
 * dit lequel convient. Il se vérifie donc sans réseau.
 */

/** L'adresse du serveur de vignettes du projet libretro. */
export const THUMBNAIL_HOST = 'https://thumbnails.libretro.com';

/**
 * Les dossiers de vignettes qui correspondent à un volet de la bibliothèque.
 *
 * Plusieurs quand le dossier réunit deux machines — « Gameboy-Gameboy Color »,
 * « Master System-Game Gear » : on essaie l'un puis l'autre.
 *
 * L'ordre compte, comme pour les cœurs : « neo geo pocket » avant « neo geo »,
 * « game boy advance » avant « game boy ».
 */
const SYSTEMS: readonly (readonly [string, readonly string[]])[] = [
  ['32x', ['Sega - 32X']],
  ['3do', ['The 3DO Company - 3DO']],
  ['amiga', ['Commodore - Amiga']],
  ['amstrad', ['Amstrad - CPC']],
  ['arcade', ['FBNeo - Arcade Games', 'MAME']],
  ['atari 2600', ['Atari - 2600']],
  ['atari 7800', ['Atari - 7800']],
  ['atari 800', ['Atari - 8-bit', 'Atari - 5200']],
  ['jaguar', ['Atari - Jaguar']],
  ['lynx', ['Atari - Lynx']],
  ['colecovision', ['Coleco - ColecoVision', 'Microsoft - MSX']],
  ['msx', ['Microsoft - MSX', 'Microsoft - MSX2']],
  ['commodore 64', ['Commodore - 64']],
  ['c64', ['Commodore - 64']],
  ['dreamcast', ['Sega - Dreamcast']],
  ['game watch', ['Handheld Electronic Game']],
  ['gameboy advance', ['Nintendo - Game Boy Advance']],
  ['game boy advance', ['Nintendo - Game Boy Advance']],
  ['gba', ['Nintendo - Game Boy Advance']],
  ['gameboy', ['Nintendo - Game Boy', 'Nintendo - Game Boy Color']],
  ['game boy', ['Nintendo - Game Boy', 'Nintendo - Game Boy Color']],
  ['gamecube', ['Nintendo - GameCube', 'Nintendo - Wii']],
  ['intellivision', ['Mattel - Intellivision']],
  ['ms dos', ['DOS']],
  ['dos', ['DOS']],
  ['master system', ['Sega - Master System - Mark III', 'Sega - Game Gear']],
  ['mega cd', ['Sega - Mega-CD - Sega CD']],
  ['sega cd', ['Sega - Mega-CD - Sega CD']],
  ['mega drive', ['Sega - Mega Drive - Genesis']],
  ['genesis', ['Sega - Mega Drive - Genesis']],
  ['neo geo pocket', ['SNK - Neo Geo Pocket Color', 'SNK - Neo Geo Pocket']],
  ['neo geo', ['SNK - Neo Geo']],
  ['nes', ['Nintendo - Nintendo Entertainment System']],
  ['famicom', ['Nintendo - Nintendo Entertainment System']],
  ['nintendo 3ds', ['Nintendo - Nintendo 3DS']],
  ['3ds', ['Nintendo - Nintendo 3DS']],
  ['nintendo 64', ['Nintendo - Nintendo 64']],
  ['n64', ['Nintendo - Nintendo 64']],
  ['nintendo ds', ['Nintendo - Nintendo DS']],
  ['nds', ['Nintendo - Nintendo DS']],
  ['pc engine', ['NEC - PC Engine - TurboGrafx 16', 'NEC - PC Engine CD - TurboGrafx-CD']],
  ['turbografx', ['NEC - PC Engine - TurboGrafx 16']],
  ['pc 98', ['NEC - PC-98']],
  ['ps vita', ['Sony - PlayStation Vita']],
  ['psp', ['Sony - PlayStation Portable']],
  ['cd i', ['Philips - CD-i']],
  ['playstation 2', ['Sony - PlayStation 2']],
  ['playstation', ['Sony - PlayStation']],
  ['point click', ['ScummVM']],
  ['saturn', ['Sega - Saturn']],
  ['x68000', ['Sharp - X68000']],
  ['super nintendo', ['Nintendo - Super Nintendo Entertainment System']],
  ['snes', ['Nintendo - Super Nintendo Entertainment System']],
  ['thomson', ['Thomson - MOTO']],
  ['vectrex', ['GCE - Vectrex']],
  ['virtual boy', ['Nintendo - Virtual Boy']],
  ['wii u', ['Nintendo - Wii U']],
  ['wonderswan', ['Bandai - WonderSwan Color', 'Bandai - WonderSwan']],
  ['xbox 360', ['Microsoft - Xbox 360']],
  ['xbox', ['Microsoft - Xbox']],
  ['zx spectrum', ['Sinclair - ZX Spectrum']],
  ['spectrum', ['Sinclair - ZX Spectrum']],
];

/** Réduit un nom de volet à des mots comparables. */
function words(label: string): string {
  return ` ${label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

/** Les dossiers de vignettes à essayer pour ce volet, dans l'ordre. */
export function thumbnailFolders(label: string): readonly string[] {
  const haystack = words(label);
  for (const [keyword, folders] of SYSTEMS) {
    if (haystack.includes(` ${keyword} `)) return folders;
  }
  return [];
}

/**
 * Réduit un titre à ce qui ne change pas d'une édition à l'autre.
 *
 * Tombent : l'extension, tout ce qui est entre parenthèses ou entre crochets —
 * région, langue, révision, numéro de piste, code éditeur — la ponctuation, et
 * les articles rejetés en fin de titre. « Legend of Zelda, The - The Minish Cap
 * (U) » et « The Legend of Zelda - The Minish Cap (USA) » se rejoignent ainsi.
 */
export function normalise(title: string): string {
  return title
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Les régions qu'un nom annonce, sous une forme commune.
 *
 * Les jeux de noms ne s'accordent pas : `(NA)` chez Atari, `(U)` dans les
 * anciens, `(USA)` dans les récents. Ramenés à la même étiquette, ils servent à
 * départager deux jaquettes qui portent le même titre.
 */
export function regions(title: string): Set<string> {
  const trouvees = new Set<string>();
  for (const groupe of title.matchAll(/[([]([^)\]]*)[)\]]/g)) {
    for (const mot of groupe[1].split(/[,\s]+/)) {
      const propre = mot.trim().toLowerCase();
      if (!propre) continue;
      if (propre === 'usa' || propre === 'u' || propre === 'na') trouvees.add('usa');
      else if (propre === 'europe' || propre === 'e' || propre === 'eur') trouvees.add('europe');
      else if (propre === 'japan' || propre === 'j' || propre === 'jp') trouvees.add('japan');
      else if (propre === 'world' || propre === 'w') trouvees.add('world');
    }
  }
  return trouvees;
}

/**
 * Un nom disponible : le nom exact, sa forme réduite, et d'où il vient.
 *
 * Le dossier compte autant que le nom. Un volet réunit parfois deux machines —
 * « PC Engine » et « PC Engine CD », « Gameboy » et « Gameboy Color » — et on
 * cherche alors dans les deux inventaires. Construire ensuite l'adresse avec le
 * premier dossier venu donnait une image introuvable à chaque fois que la
 * jaquette venait du second.
 */
export interface Candidate {
  readonly name: string;
  readonly key: string;
  readonly folder: string;
  /**
   * La sorte d'image : boîte, écran-titre ou capture de jeu.
   *
   * Toutes les consoles n'ont pas de boîtes — le DOS, ScummVM, l'arcade, les
   * ordinateurs anciens n'en ont presque aucune. Leurs volets restaient vides ;
   * ils montrent désormais l'écran-titre, à défaut de la boîte.
   */
  readonly kind: string;
}

/** La sorte d'image par défaut : la boîte du jeu. */
export const BOXART = 'Named_Boxarts';

/** Prépare les noms d'un dossier pour le rapprochement. */
export function index(
  folder: string,
  names: readonly string[],
  kind: string = BOXART,
): Candidate[] {
  return names.map((name) => ({ name, key: normalise(name), folder, kind }));
}

/**
 * Le titre réduit, espaces compris.
 *
 * Personne ne s'accorde sur les espaces d'un titre : « megaman » sur le disque,
 * « Mega Man » chez libretro ; « Bomberman » ici, « Bomber Man » là. Les
 * supprimer des deux côtés fait se rejoindre ce qui ne devrait jamais avoir été
 * séparé.
 */
function tight(key: string): string {
  return key.replace(/ /g, '');
}

/** Les paires de lettres voisines d'un titre. */
function bigrammes(mot: string): Set<string> {
  const paires = new Set<string>();
  for (let i = 0; i + 1 < mot.length; i += 1) paires.add(mot.slice(i, i + 2));
  return paires;
}

/**
 * Ce que deux titres ont en commun, entre 0 et 1.
 *
 * On compare les paires de lettres voisines plutôt que le début des mots.
 * Un début commun ne dit presque rien — « Superman » et « Super Mario Bros. »
 * partagent leurs cinq premières lettres sans avoir rien à voir — tandis que
 * deux écritures d'un même titre partagent leurs paires d'un bout à l'autre.
 */
function similitude(a: string, b: string): number {
  const gauche = bigrammes(a);
  const droite = bigrammes(b);
  if (gauche.size === 0 || droite.size === 0) return 0;

  let communes = 0;
  for (const paire of gauche) if (droite.has(paire)) communes += 1;
  return (2 * communes) / (gauche.size + droite.size);
}

/**
 * En dessous de quoi deux titres sont tenus pour étrangers.
 *
 * Réglé sur les cas qui comptent : « Mega Man 6 » et « Mega Man 3 » se
 * ressemblent à 0,86 — on accepte de se tromper de numéro plutôt que de
 * laisser un vide. « Superman » et « Super Mario Bros. » tombent à 0,60 — là,
 * la case vide est préférable.
 */
const PROCHE = 0.75;

/**
 * Entre plusieurs jaquettes de même titre, celle qui convient le mieux.
 *
 * La région tranche la première : donner la jaquette japonaise d'un jeu
 * américain se voit tout de suite, le texte de la boîte n'étant pas le même. À
 * défaut, le nom le plus court — les autres portent « Beta », « Proto » ou une
 * date.
 */
function departager(proches: readonly Candidate[], stem: string): Candidate {
  const voulues = regions(stem);
  const memeRegion = proches.filter((candidate) =>
    [...regions(candidate.name)].some((region) => voulues.has(region)),
  );

  const retenus = memeRegion.length > 0 ? memeRegion : proches;
  return [...retenus].sort((a, b) => a.name.length - b.name.length)[0];
}

/**
 * Le nom de vignette qui convient à ce fichier, s'il y en a un.
 *
 * Cinq passes, de la plus sûre à la plus hasardeuse : le nom exact, le titre
 * réduit, le titre sans ses espaces, un titre qui commence par l'autre, et
 * enfin le plus long début commun.
 *
 * Les deux dernières se trompent parfois — « Mega Man 6 » peut hériter de la
 * boîte de « Mega Man 5 » quand la sienne n'existe pas. C'est assumé : une case
 * vide au milieu d'une grille illustrée se lit comme une panne, une jaquette
 * voisine se lit comme un jeu. Le champ est de toute façon déjà restreint à la
 * console du volet, et non à toute la bibliothèque.
 */
export function chooseCover(
  available: readonly Candidate[],
  romName: string,
): Candidate | null {
  const stem = romName.replace(/\.[^.]+$/, '');

  const exact = available.find((candidate) => candidate.name === stem);
  if (exact) return exact;

  const key = normalise(stem);
  if (!key) return null;

  const memeTitre = available.filter((candidate) => candidate.key === key);
  if (memeTitre.length > 0) return departager(memeTitre, stem);

  // Au-delà d'ici on n'est plus sûr de rien. Un titre trop court ne se prête
  // pas au jeu : sur trois lettres, tout ressemble à tout.
  const serre = tight(key);
  if (serre.length < 4) return null;

  const colles = available.filter((candidate) => tight(candidate.key) === serre);
  if (colles.length > 0) return departager(colles, stem);

  // « Castlevania » et « Castlevania - The Adventure » : l'un commence par
  // l'autre. On prend le plus proche en longueur, faute de mieux.
  const prefixes = available.filter((candidate) => {
    const autre = tight(candidate.key);
    return autre.length >= 4 && (autre.startsWith(serre) || serre.startsWith(autre));
  });
  if (prefixes.length > 0) {
    return [...prefixes].sort(
      (a, b) =>
        Math.abs(tight(a.key).length - serre.length) -
          Math.abs(tight(b.key).length - serre.length) || a.name.length - b.name.length,
    )[0];
  }

  // Dernier recours : le titre qui se ressemble le plus, s'il se ressemble
  // assez. C'est ici qu'on accepte de se tromper.
  let meilleur: Candidate | null = null;
  let meilleurScore = 0;
  for (const candidate of available) {
    const score = similitude(serre, tight(candidate.key));
    if (score < PROCHE) continue;
    // À ressemblance égale, le nom le plus court : c'est l'édition ordinaire.
    const mieux =
      score > meilleurScore ||
      (score === meilleurScore && meilleur !== null && candidate.name.length < meilleur.name.length);
    if (mieux) {
      meilleur = candidate;
      meilleurScore = score;
    }
  }
  return meilleur;
}

/** L'adresse d'une vignette sur le serveur. */
export function coverUrl(folder: string, name: string, kind: string = BOXART): string {
  return `${THUMBNAIL_HOST}/${encodeURIComponent(folder)}/${kind}/${encodeURIComponent(name)}.png`;
}
