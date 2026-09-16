/**
 * De la liste de traductions à la table qu'interroge `t()`.
 *
 * Chaque langue est écrite comme un tableau de phrases, dans l'ordre exact de
 * `CLES`. C'est le seul format qui rende l'alignement vérifiable : une table
 * écrite en clair — la phrase française à gauche, sa traduction à droite —
 * paraît plus lisible, mais il suffit d'une apostrophe courbe au lieu d'une
 * droite pour qu'une entrée ne serve jamais, sans que rien ne le signale.
 * Ici, une ligne oubliée décale tout le reste, et l'épreuve le voit
 * immédiatement.
 */

import type { Table } from '../i18n.ts';
import { CLES } from './cles.ts';

/**
 * Associe chaque phrase française à sa traduction.
 *
 * Une entrée vide est passée : la phrase française reparaîtra telle quelle,
 * ce qui vaut mieux qu'une case vide dans la fenêtre.
 */
export function table(traductions: readonly string[]): Table {
  const faite: Record<string, string> = {};
  for (const [rang, clef] of CLES.entries()) {
    const traduite = traductions[rang];
    if (traduite) faite[clef] = traduite;
  }
  return faite;
}
