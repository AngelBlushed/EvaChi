/**
 * Les liaisons de manette choisies par l'utilisateur.
 *
 * Chaque disposition — pavé hexadécimal du CHIP-8, manette libretro — vient
 * avec une correspondance par défaut. Elle convient à la plupart des manettes,
 * mais pas à toutes, et pas à tous les goûts : on peut vouloir A et B inversés
 * comme sur une Super Nintendo japonaise, ou les gâchettes ailleurs.
 *
 * Ce module ne touche ni au DOM ni au stockage : il dit seulement quelle
 * liaison s'applique, et se vérifie donc sans navigateur.
 */

/** Ce que l'utilisateur a changé : bouton de manette → bouton du cœur. */
export type Overrides = Readonly<Record<string, number>>;

/** Toutes les liaisons, par disposition. */
export type AllOverrides = Readonly<Record<string, Overrides>>;

/**
 * La correspondance à appliquer : celle d'origine, corrigée de ce que
 * l'utilisateur a changé.
 *
 * Une liaison personnelle remplace la liaison d'origine du même bouton de
 * manette. Un bouton qu'on assigne à une touche déjà prise **libère** l'autre :
 * deux boutons de manette sur la même touche du cœur passeraient pour une
 * panne, la touche restant enfoncée dès que l'un des deux est tenu.
 */
export function resolveBindings(
  defaults: ReadonlyMap<number, number>,
  overrides: Overrides | undefined,
): Map<number, number> {
  const resolved = new Map(defaults);
  if (!overrides) return resolved;

  for (const [source, cible] of Object.entries(overrides)) {
    const bouton = Number(source);
    if (!Number.isInteger(bouton) || bouton < 0) continue;

    // La cible change de main : on la retire à qui la tenait.
    for (const [autre, deja] of [...resolved]) {
      if (deja === cible && autre !== bouton) resolved.delete(autre);
    }
    resolved.set(bouton, cible);
  }
  return resolved;
}

/** Ajoute une liaison à ce qui était déjà enregistré. */
export function withBinding(
  overrides: Overrides | undefined,
  padButton: number,
  coreButton: number,
): Overrides {
  const suivant: Record<string, number> = { ...(overrides ?? {}) };

  // Le même bouton du cœur ne peut être tenu que par un bouton de manette.
  for (const [source, cible] of Object.entries(suivant)) {
    if (cible === coreButton) delete suivant[source];
  }
  suivant[String(padButton)] = coreButton;
  return suivant;
}

/** Oublie ce qui a été changé pour cette disposition. */
export function withoutBindings(all: AllOverrides, layoutId: string): AllOverrides {
  const suivant: Record<string, Overrides> = { ...all };
  delete suivant[layoutId];
  return suivant;
}

/**
 * Relit ce qui a été enregistré, en se méfiant de ce qu'on y trouve.
 *
 * Le stockage du navigateur survit aux mises à jour : une version plus
 * ancienne, ou une main curieuse, peut y avoir laissé n'importe quoi. Ce qui
 * n'a pas la bonne forme est écarté sans bruit plutôt que de faire tomber le
 * démarrage.
 */
export function parseOverrides(raw: string | null): AllOverrides {
  if (!raw) return {};
  try {
    const lu: unknown = JSON.parse(raw);
    if (typeof lu !== 'object' || lu === null || Array.isArray(lu)) return {};

    const propre: Record<string, Overrides> = {};
    for (const [layout, liaisons] of Object.entries(lu)) {
      if (typeof liaisons !== 'object' || liaisons === null || Array.isArray(liaisons)) continue;

      const retenues: Record<string, number> = {};
      for (const [source, cible] of Object.entries(liaisons as Record<string, unknown>)) {
        const bouton = Number(source);
        if (!Number.isInteger(bouton) || bouton < 0) continue;
        if (typeof cible !== 'number' || !Number.isInteger(cible) || cible < 0) continue;
        retenues[String(bouton)] = cible;
      }
      if (Object.keys(retenues).length > 0) propre[layout] = retenues;
    }
    return propre;
  } catch {
    return {};
  }
}

/**
 * L'étiquette courte d'un bouton, telle qu'elle tient dans une case carrée.
 *
 * Les noms de la manette Xbox, parce que c'est la sérigraphie que la plupart
 * des joueurs ont sous les doigts sous Windows — et surtout parce que « A »
 * tient là où « bouton du bas » débordait de sa case et chevauchait la voisine.
 */
export function padButtonShort(index: number): string {
  const COURTS: Record<number, string> = {
    0: 'A',
    1: 'B',
    2: 'X',
    3: 'Y',
    4: 'LB',
    5: 'RB',
    6: 'LT',
    7: 'RT',
    8: 'Back',
    9: 'Start',
    10: 'LS',
    11: 'RS',
    12: '↑',
    13: '↓',
    14: '←',
    15: '→',
    16: 'Guide',
  };
  return COURTS[index] ?? `b${index}`;
}

/*
 * Il existait ici un second jeu de noms, en toutes lettres : « bouton du bas »,
 * « sélection », « croix gauche ». Il a été retiré en même temps qu'arrivaient
 * les cinquante langues. Deux raisons, dans cet ordre : sur la manette, c'est
 * « Start » qui est gravé, pas « départ » — la sérigraphie est le nom que le
 * joueur a sous les doigts, dans toutes les langues ; et ces dix-sept noms
 * auraient été dix-sept phrases de plus à traduire pour nommer ce qui est déjà
 * écrit sur le matériel.
 */
