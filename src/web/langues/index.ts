/**
 * Les langues proposées.
 *
 * Ce fichier est écrit par `outils/langues.mjs`. Ajouter une langue tient en
 * deux gestes : une ligne dans la liste de cet outil, un fichier de
 * traductions à côté de celui-ci.
 *
 * Le français n'a pas de table : c'est la langue d'origine, et ses phrases
 * sont les clés. Choisir « Français » revient donc à n'appliquer aucune
 * traduction, ce qui est aussi le repli quand une phrase manque ailleurs.
 */

import type { Langue } from '../i18n.ts';
import { table } from './table.ts';

import { af } from './af.ts';
import { id } from './id.ts';
import { ms } from './ms.ts';
import { ca } from './ca.ts';
import { cs } from './cs.ts';
import { da } from './da.ts';
import { de } from './de.ts';
import { et } from './et.ts';
import { en } from './en.ts';
import { es } from './es.ts';
import { eu } from './eu.ts';
import { fil } from './fil.ts';
import { ga } from './ga.ts';
import { gl } from './gl.ts';
import { hr } from './hr.ts';
import { is } from './is.ts';
import { it } from './it.ts';
import { sw } from './sw.ts';
import { lv } from './lv.ts';
import { lt } from './lt.ts';
import { hu } from './hu.ts';
import { nl } from './nl.ts';
import { nb } from './nb.ts';
import { pl } from './pl.ts';
import { pt } from './pt.ts';
import { ptBR } from './pt-br.ts';
import { ro } from './ro.ts';
import { sk } from './sk.ts';
import { sl } from './sl.ts';
import { fi } from './fi.ts';
import { sv } from './sv.ts';
import { vi } from './vi.ts';
import { tr } from './tr.ts';
import { el } from './el.ts';
import { bg } from './bg.ts';
import { ru } from './ru.ts';
import { sr } from './sr.ts';
import { uk } from './uk.ts';
import { he } from './he.ts';
import { ar } from './ar.ts';
import { fa } from './fa.ts';
import { hi } from './hi.ts';
import { bn } from './bn.ts';
import { ta } from './ta.ts';
import { th } from './th.ts';
import { ko } from './ko.ts';
import { ja } from './ja.ts';
import { zhHans } from './zh-hans.ts';
import { zhHant } from './zh-hant.ts';

/** Le français, sans table : les clés sont déjà en français. */
export const FRANCAIS: Langue = { code: 'fr', nom: 'Français', table: {} };

export const LANGUES: readonly Langue[] = [
  { code: "af", nom: "Afrikaans", table: table(af) },
  { code: "id", nom: "Bahasa Indonesia", table: table(id) },
  { code: "ms", nom: "Bahasa Melayu", table: table(ms) },
  { code: "ca", nom: "Català", table: table(ca) },
  { code: "cs", nom: "Čeština", table: table(cs) },
  { code: "da", nom: "Dansk", table: table(da) },
  { code: "de", nom: "Deutsch", table: table(de) },
  { code: "et", nom: "Eesti", table: table(et) },
  { code: "en", nom: "English", table: table(en) },
  { code: "es", nom: "Español", table: table(es) },
  { code: "eu", nom: "Euskara", table: table(eu) },
  { code: "fil", nom: "Filipino", table: table(fil) },
  FRANCAIS,
  { code: "ga", nom: "Gaeilge", table: table(ga) },
  { code: "gl", nom: "Galego", table: table(gl) },
  { code: "hr", nom: "Hrvatski", table: table(hr) },
  { code: "is", nom: "Íslenska", table: table(is) },
  { code: "it", nom: "Italiano", table: table(it) },
  { code: "sw", nom: "Kiswahili", table: table(sw) },
  { code: "lv", nom: "Latviešu", table: table(lv) },
  { code: "lt", nom: "Lietuvių", table: table(lt) },
  { code: "hu", nom: "Magyar", table: table(hu) },
  { code: "nl", nom: "Nederlands", table: table(nl) },
  { code: "nb", nom: "Norsk bokmål", table: table(nb) },
  { code: "pl", nom: "Polski", table: table(pl) },
  { code: "pt", nom: "Português", table: table(pt) },
  { code: "pt-BR", nom: "Português (Brasil)", table: table(ptBR) },
  { code: "ro", nom: "Română", table: table(ro) },
  { code: "sk", nom: "Slovenčina", table: table(sk) },
  { code: "sl", nom: "Slovenščina", table: table(sl) },
  { code: "fi", nom: "Suomi", table: table(fi) },
  { code: "sv", nom: "Svenska", table: table(sv) },
  { code: "vi", nom: "Tiếng Việt", table: table(vi) },
  { code: "tr", nom: "Türkçe", table: table(tr) },
  { code: "el", nom: "Ελληνικά", table: table(el) },
  { code: "bg", nom: "Български", table: table(bg) },
  { code: "ru", nom: "Русский", table: table(ru) },
  { code: "sr", nom: "Српски", table: table(sr) },
  { code: "uk", nom: "Українська", table: table(uk) },
  { code: "he", nom: "עברית", rtl: true, table: table(he) },
  { code: "ar", nom: "العربية", rtl: true, table: table(ar) },
  { code: "fa", nom: "فارسی", rtl: true, table: table(fa) },
  { code: "hi", nom: "हिन्दी", table: table(hi) },
  { code: "bn", nom: "বাংলা", table: table(bn) },
  { code: "ta", nom: "தமிழ்", table: table(ta) },
  { code: "th", nom: "ไทย", table: table(th) },
  { code: "ko", nom: "한국어", table: table(ko) },
  { code: "ja", nom: "日本語", table: table(ja) },
  { code: "zh-Hans", nom: "简体中文", table: table(zhHans) },
  { code: "zh-Hant", nom: "繁體中文", table: table(zhHant) },
];

/**
 * Les traductions telles qu'elles sont écrites, avant d'être appariées.
 *
 * L'épreuve en a besoin : une fois la table faite, une ligne oubliée ne se
 * distingue plus d'une phrase laissée en français.
 */
export const LISTES: readonly { code: string; textes: readonly string[] }[] = [
  { code: "af", textes: af },
  { code: "id", textes: id },
  { code: "ms", textes: ms },
  { code: "ca", textes: ca },
  { code: "cs", textes: cs },
  { code: "da", textes: da },
  { code: "de", textes: de },
  { code: "et", textes: et },
  { code: "en", textes: en },
  { code: "es", textes: es },
  { code: "eu", textes: eu },
  { code: "fil", textes: fil },
  { code: "ga", textes: ga },
  { code: "gl", textes: gl },
  { code: "hr", textes: hr },
  { code: "is", textes: is },
  { code: "it", textes: it },
  { code: "sw", textes: sw },
  { code: "lv", textes: lv },
  { code: "lt", textes: lt },
  { code: "hu", textes: hu },
  { code: "nl", textes: nl },
  { code: "nb", textes: nb },
  { code: "pl", textes: pl },
  { code: "pt", textes: pt },
  { code: "pt-BR", textes: ptBR },
  { code: "ro", textes: ro },
  { code: "sk", textes: sk },
  { code: "sl", textes: sl },
  { code: "fi", textes: fi },
  { code: "sv", textes: sv },
  { code: "vi", textes: vi },
  { code: "tr", textes: tr },
  { code: "el", textes: el },
  { code: "bg", textes: bg },
  { code: "ru", textes: ru },
  { code: "sr", textes: sr },
  { code: "uk", textes: uk },
  { code: "he", textes: he },
  { code: "ar", textes: ar },
  { code: "fa", textes: fa },
  { code: "hi", textes: hi },
  { code: "bn", textes: bn },
  { code: "ta", textes: ta },
  { code: "th", textes: th },
  { code: "ko", textes: ko },
  { code: "ja", textes: ja },
  { code: "zh-Hans", textes: zhHans },
  { code: "zh-Hant", textes: zhHant },
];
