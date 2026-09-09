/**
 * Ce qu'EvaChi sait faire tourner, à un instant donné.
 *
 * Deux familles de cœurs se présentent sous la même forme : ceux écrits pour ce
 * projet, qui vivent dans la page, et ceux au format libretro, chargés par la
 * coque native. L'interface ne les distingue que pour deux choses — la
 * disposition des commandes, et la manière dont le contenu arrive.
 */

import type { AsyncEmulatorCore } from '../core/types.ts';
import { toAsync } from '../core/types.ts';
import { Chip8 } from '../chip8/chip8.ts';
import { LibretroCore, externalSystems } from '../libretro/client.ts';
import type { ButtonLayout } from './input.ts';
import { HEX_KEYPAD, JOYPAD } from './input.ts';

/**
 * Trois manières de faire tourner un jeu.
 *
 * `interne` vit dans la page, `libretro` dans la coque native, `externe` est un
 * programme séparé qu'on lance avec le jeu en argument — la seule voie pour les
 * consoles dont l'émulateur n'a pas de portage libretro.
 */
export type CoreKind = 'interne' | 'libretro' | 'externe';

export interface CatalogEntry {
  readonly kind: CoreKind;
  readonly id: string;
  readonly label: string;
  /** Extensions acceptées, en minuscules et sans le point. */
  readonly extensions: readonly string[];
  readonly layout: ButtonLayout;
  /**
   * Vrai si le contenu doit venir d'un chemin sur disque plutôt que d'octets.
   * Les cœurs libretro lisent souvent le fichier eux-mêmes, pour en deviner le
   * format ou trouver ses voisins.
   */
  readonly needsPath: boolean;
  open(): Promise<AsyncEmulatorCore>;
}

/**
 * Vrai quand la page tourne dans la coque native.
 *
 * Dans un simple navigateur, seuls les cœurs internes existent : rien ne peut
 * charger une bibliothèque dynamique.
 */
export const inShell: boolean =
  typeof (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined';

/** Les cœurs écrits pour ce projet. Toujours disponibles. */
export function internalCores(makeChip8: () => Chip8): CatalogEntry[] {
  return [
    {
      kind: 'interne',
      id: 'chip8',
      label: 'CHIP-8',
      extensions: ['ch8', 'c8'],
      layout: HEX_KEYPAD,
      needsPath: false,
      async open() {
        return toAsync(makeChip8());
      },
    },
  ];
}

/** Cœurs installés que la coque native a écartés à l'interrogation. */
export let rejectedCores: string[] = [];

/**
 * Les cœurs libretro utilisables.
 *
 * L'identité de chaque cœur — son nom, les formats qu'il accepte — est établie
 * côté natif, dans un processus séparé : rien dans le nom d'un fichier ne dit
 * quelle console il émule, et un cœur qui se termine brutalement à
 * l'interrogation ne doit pas emporter l'application.
 */
/**
 * Derniers cœurs libretro obtenus.
 *
 * La découverte est rejouée à chaque changement — un émulateur externe déclaré,
 * un dossier ajouté. Si l'un de ces passages échoue, le catalogue ne doit pas
 * fondre : mieux vaut une liste un peu vieille qu'une bibliothèque qui se vide
 * sous les yeux de l'utilisateur.
 */
let lastLibretro: CatalogEntry[] = [];

export async function libretroCores(): Promise<CatalogEntry[]> {
  if (!inShell) return [];

  const found = await LibretroCore.list();
  discoveryReport.push(`list_cores → ${found.length} entrée(s)`);
  rejectedCores = found.filter((entry) => !entry.usable).map((entry) => entry.id);

  const usable = found
    .filter((entry) => entry.usable && entry.extensions.length > 0)
    .map((entry) => ({
      kind: 'libretro' as const,
      id: entry.id,
      label: entry.name || entry.id,
      extensions: entry.extensions,
      layout: JOYPAD,
      needsPath: true,
      async open() {
        return LibretroCore.open(entry);
      },
    }));

  // Une réponse vide alors qu'on avait des cœurs est presque toujours un raté
  // passager, pas une désinstallation. On garde ce qu'on savait, et on le dit.
  if (usable.length === 0 && lastLibretro.length > 0) {
    throw new Error(
      `aucun cœur renvoyé alors que ${lastLibretro.length} étaient connus — liste précédente conservée`,
    );
  }

  lastLibretro = usable;
  return usable;
}

/**
 * Les émulateurs autonomes déclarés par l'utilisateur.
 *
 * `open` n'a pas de sens ici : rien ne tourne dans EvaChi. C'est `play` qui
 * reconnaît le genre `externe` et lance le programme.
 */
export async function externalEntries(): Promise<CatalogEntry[]> {
  if (!inShell) return [];

  const systems = await externalSystems();
  discoveryReport.push(`external_systems → ${systems.length} déclaré(s)`);
  return systems.map((system) => ({
    kind: 'externe' as const,
    id: `externe:${system.name}`,
    label: system.name,
    extensions: system.extensions,
    layout: JOYPAD,
    needsPath: true,
    async open() {
      throw new Error(`${system.name} est un émulateur externe : il se lance, il ne s'héberge pas`);
    },
  }));
}

/**
 * Ce qui a échoué pendant la découverte, en clair.
 *
 * Une première version se contentait d'avaler les erreurs pour qu'une source
 * défaillante ne prive pas l'utilisateur des autres. L'intention était bonne,
 * le silence non : quand les cœurs libretro ont cessé d'apparaître, ni
 * l'utilisateur ni le journal n'avaient la moindre indication.
 */
export let discoveryErrors: string[] = [];

/**
 * Compte-rendu de la dernière découverte, succès compris.
 *
 * Les erreurs ne suffisent pas : une source peut répondre sans se plaindre et
 * ne rien rendre. Sans ces chiffres bruts, un catalogue vide reste inexplicable
 * — et deux lancements du même binaire peuvent différer sans qu'on sache où.
 */
export let discoveryReport: string[] = [];

/** Le catalogue complet : cœurs internes, cœurs libretro, émulateurs externes. */
export async function discover(makeChip8: () => Chip8): Promise<CatalogEntry[]> {
  const internal = internalCores(makeChip8);
  const rest: CatalogEntry[] = [];
  discoveryErrors = [];
  discoveryReport = [`coque native : ${inShell ? 'oui' : 'NON'}`];

  const sources: [string, () => Promise<CatalogEntry[]>][] = [
    ['cœurs libretro', libretroCores],
    ['émulateurs externes', externalEntries],
  ];

  for (const [what, source] of sources) {
    try {
      rest.push(...(await source()));
    } catch (error) {
      // La source a échoué : on dit pourquoi, et on reprend ce qu'on savait
      // d'elle plutôt que de laisser le catalogue se vider.
      discoveryErrors.push(
        `${what} : ${error instanceof Error ? error.message : String(error)}`,
      );
      if (source === libretroCores) rest.push(...lastLibretro);
    }
  }

  return [...internal, ...rest];
}
