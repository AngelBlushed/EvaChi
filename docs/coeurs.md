# Choisir les cœurs : licences et conséquences

Note de décision. Écrire quinze émulateurs de zéro n'a pas de sens ; intégrer
des cœurs existants, si. Reste à savoir **lesquels**, et ce que chacun impose au
reste d'EvaChi.

## Ce que la GPL exige vraiment

Une idée fausse à évacuer d'abord : **aucune licence n'oblige à afficher le nom
du cœur dans l'interface.** EvaChi peut porter son propre nom, sa propre UI, et
ne ressembler en rien à un lanceur. Ce que la GPL demande réellement :

| Obligation | Où ça se joue |
|---|---|
| Conserver les en-têtes de copyright | dans les fichiers source, pas dans l'UI |
| Fournir le texte de licence | un écran « Licences » dans les réglages suffit |
| Signaler les modifications apportées | notes de version ou fichier dédié |
| **Publier le source de l'œuvre combinée sous GPL** | tout le programme, cœur *et* frontend |

La dernière ligne est la seule qui contraigne vraiment. Elle n'empêche pas
EvaChi d'être « notre app » — elle empêche EvaChi d'être fermée.

La MPL-2.0 est nettement plus souple : son copyleft s'applique **fichier par
fichier**. Les fichiers MPL modifiés restent MPL ; tout code neuf écrit dans des
fichiers séparés reste sous la licence de ton choix.

## Les cœurs, par licence

### Voie permissive — ton code reste à toi

| Cœur | Systèmes | Licence |
|---|---|---|
| **ares** | NES, SNES, GB/GBC/GBA, N64, PS1 (expérimental), Saturn, Master System, Mega Drive, PC Engine… | ISC |
| **SameBoy** | GB, GBC | MIT |
| **mGBA** | GBA, GB/GBC | MPL-2.0 |
| **Cemu** | Wii U | MPL-2.0 |

`ares` est la trouvaille : un seul dépôt, une licence de type BSD, et il couvre
à lui seul presque tout le palier 1-2 **plus la N64**. Ses JIT N64 (CPU et RSP)
ont été réécrits récemment, et le cœur PS1 progresse.

### Voie GPL — EvaChi devient open source

| Cœur | Systèmes | Licence |
|---|---|---|
| DeSmuME | DS | GPL-2.0 |
| melonDS | DS | GPL-3.0 |
| Dolphin | GameCube, Wii | GPL-2.0+ |
| PCSX2 | PS2 | GPL-3.0 |
| PPSSPP | PSP | GPL-2.0+ |
| RPCS3 | PS3 | GPL-2.0 |
| Vita3K | PS Vita | GPL-2.0 |
| Azahar | 3DS | GPL-2.0 |
| SwanStation, Beetle PSX | PS1 | GPL |

Aucun équivalent permissif n'existe pour la DS, la PS2, la GameCube, la PSP, la
PS3, la Vita ni la 3DS. Pour ces sept systèmes, c'est GPL ou rien.

### Écarté

**DuckStation** est passé sous CC BY-NC-ND en septembre 2024 : pas de dérivés,
pas d'usage commercial, et même le simple empaquetage est interdit. Inutilisable
ici, quelle que soit la voie choisie. Le fork **SwanStation** est resté GPL.

## L'autre fourche : navigateur ou natif

EvaChi est du TypeScript qui tourne dans un navigateur. Ces cœurs sont du C/C++.

**WebAssembly (emscripten).** On garde l'app web, tout tourne dans l'onglet,
partageable par lien. Mais wasm n'a pas de génération de code dynamique
confortable : les systèmes qui ont besoin d'un recompilateur (N64, PS2, PSP,
PS3) y sont lents ou hors sujet. Plafond réaliste : NES, GB/GBC, GBA, SNES,
PS1 — soit le palier 1-2.

**Coque native (Tauri, Qt, Electron + module natif).** On garde l'UI en TS, les
cœurs tournent en natif avec leur JIT complet. C'est la seule voie qui mène
réellement à la DS, la PS2, la GameCube et au-delà.

## Sur « comprendre puis améliorer »

L'ordre compte. DeSmuME, c'est de l'ordre de 500 000 lignes de C++ et vingt ans
d'histoire. L'**intégrer** derrière l'interface `EmulatorCore` : quelques
semaines. L'**améliorer** de façon significative : après des mois passés dedans,
pas avant. La séquence honnête est intégrer d'abord, comprendre en s'en servant,
améliorer ensuite.

## Comment les cœurs arrivent sur la machine

EvaChi **ne redistribue aucun émulateur**. Elle sait les nommer, les chercher, et
aller les télécharger à leur source : `buildbot.libretro.com`, la forge du projet
libretro, où chaque cœur est publié par ses propres auteurs.

`Fichier → Émulateurs…` liste les consoles, une ligne par émulateur, et n'installe
que ce qui est coché. `EvaChi.exe --install-cores` fait la même chose sans ouvrir
la fenêtre. Les fichiers atterrissent dans
`%APPDATA%\app.evachi\cores`, hors du dépôt et hors de l'exécutable.

Un cœur par console, choisi pour sa fidélité :

| Console | Cœur | Console | Cœur |
|---|---|---|---|
| NES | Mesen | 3DO | Opera |
| Super Nintendo | Snes9x | Philips CD-i | SAME_CDI |
| Game Boy · Color | SameBoy | Arcade | FinalBurn Neo |
| Game Boy Advance | mGBA | Amiga | PUAE |
| Nintendo DS | melonDS | Commodore 64 | VICE x64 |
| Nintendo 3DS | Citra | Amstrad CPC | Caprice32 |
| Nintendo 64 | Mupen64Plus-Next | ZX Spectrum | Fuse |
| GameCube · Wii | Dolphin | MSX · ColecoVision | blueMSX |
| Virtual Boy | Beetle VB | Sharp X68000 | PX68K |
| Game & Watch | gw | PC-98 | Neko Project II kai |
| Mega Drive · Master System · Mega-CD | Genesis Plus GX | Thomson MO5 · TO7 | Theodore |
| Sega 32X | PicoDrive | MS-DOS | DOSBox-pure |
| Dreamcast | Flycast | Point & click | ScummVM |
| Saturn | Beetle Saturn | Atari 2600 | Stella |
| PlayStation | SwanStation | Atari 7800 | ProSystem |
| PSP | PPSSPP | Atari 800 · 5200 | Atari800 |
| PC Engine · TurboGrafx | Beetle PCE Fast | Atari Jaguar | Virtual Jaguar |
| Neo Geo Pocket | Beetle NeoPop | Atari Lynx | Beetle Lynx |
| WonderSwan | Beetle WonderSwan | Intellivision | FreeIntv |
| | | Vectrex | VecX |

Les consoles sans portage libretro — Switch, Wii U, PS2, Xbox, Xbox 360, PS Vita —
passent par leur émulateur autonome, qu'EvaChi cherche sur les disques et déclare
seule quand elle le trouve. Là non plus rien n'est installé : le programme doit
déjà être là.

## Sources

- <https://buildbot.libretro.com/> — la forge d'où viennent les cœurs
- <https://docs.libretro.com/> — l'interface que ces cœurs implémentent
- <https://www.gamingonlinux.com/2024/09/playstation-1-emulator-duckstation-changes-license-for-no-commercial-use-and-no-derivatives/>
- <https://emulation.gametechwiki.com/index.php/Ares>
- <https://emulation.gametechwiki.com/index.php/Nintendo_DS_emulators>
- <https://github.com/azahar-emu/azahar>
- <https://en.wikipedia.org/wiki/Cemu>
