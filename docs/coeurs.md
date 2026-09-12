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
| Saturn | Beetle Saturn | Atari 2600 | Stella 2014 |
| PlayStation | SwanStation | Atari 7800 | ProSystem |
| PSP | PPSSPP | Atari 800 · 5200 | Atari800 |
| PC Engine · TurboGrafx | Beetle PCE Fast | Atari Jaguar | Virtual Jaguar |
| Neo Geo Pocket | Beetle NeoPop | Atari Lynx | Beetle Lynx |
| WonderSwan | Beetle WonderSwan | Intellivision | FreeIntv |
| | | Vectrex | VecX |

## Ce qui a été vu tourner

Un tableau de cœurs ne dit pas ce qui marche. Voici ce qui a été lancé pour de
bon, image à l'appui, et ce qui reste à éprouver.

**Vérifiées** — image à l'écran, animée ou répondant aux commandes : Mega
Drive, Master System · Game Gear, Game Boy · Color, Game Boy Advance, NES,
Super Nintendo, Nintendo 64, Nintendo DS, PlayStation, Neo Geo Pocket Color,
WonderSwan, Virtual Boy, Vectrex, Intellivision, Atari 2600, Atari 7800, Atari
800 · 5200, Atari Jaguar, Atari Lynx, Amiga, Commodore 64, Amstrad CPC, ZX
Spectrum, Thomson MO5 · TO7, MSX · ColecoVision, MS-DOS, Arcade, CHIP-8.

**Particularités relevées, qui ne sont pas des défauts :**

- *Thomson* — le jeu essayé réclame un crayon optique, pas une manette. Il
  affiche « APPUYEZ LE CRAYON OPTIQUE AU CENTRE DU CARRÉ ».
- *Intellivision* — FreeIntv démarre en pause, sur « HELP — PRESS A ».
- *Virtual Boy* — l'écran est presque entièrement noir : la console est rouge
  sur noir, c'est sa nature.
- *WonderSwan* — GunPey s'affiche de côté. Beetle WonderSwan ne demande pas la
  rotation à l'hôte, il la laisse en option de cœur.
- *Vectrex* — fond noir à quatre-vingts pour cent, comme un écran vectoriel.

**Pas encore éprouvées** : PC-98 (le cœur trouve ses deux fichiers système mais
l'image reste noire), Sharp X68000, Point & click, Game & Watch, 3DO,
Dreamcast, Saturn, Mega-CD, PC Engine, Sega 32X, Philips CD-i.

## Les consoles sans cœur libretro

Switch, Wii U, PS2, Xbox, Xbox 360, PS Vita : leur émulateur existe, mais comme
programme séparé. EvaChi les installe de la même façon que les cœurs — elle
demande à leur forge quelle est la dernière version, prend l'archive Windows, et
la déballe dans `%APPDATA%\app.evachi\emulators\`.

Deux consoles les ont rejointes bien qu'un cœur libretro existe pour elles : la
GameCube et la PSP. Leurs cœurs dessinent par le processeur graphique, et notre
intégration de ce rendu n'est pas au point — Dolphin fige sur une image noire,
PPSSPP emporte l'application. Les deux programmes d'origine tournent sans
faute, et prennent donc la place. Les cœurs restent installés et restent
choisissables dans le volet de la bibliothèque.

| Console | Émulateur | Source | Licence |
|---|---|---|---|
| Wii U | Cemu | `github.com/cemu-project/Cemu` | MPL-2.0 |
| PlayStation 2 | PCSX2 | `github.com/PCSX2/pcsx2` | GPL-3.0 |
| GameCube · Wii | Dolphin | <https://dolphin-emu.org> (flux du projet) | GPL-2.0+ |
| PSP | PPSSPP | `github.com/hrydgard/ppsspp` | GPL-2.0+ |
| Xbox 360 | Xenia Canary | `github.com/xenia-canary/xenia-canary` | BSD-3-Clause |
| Xbox | xemu | `github.com/xemu-project/xemu` | GPL-2.0 |
| PS Vita | Vita3K | `github.com/Vita3K/Vita3K` | GPL-2.0 |
| Switch | Ryubing | **à installer soi-même** — <https://ryujinx.app> | MIT |

Dolphin fait exception dans l'autre sens : son dépôt GitHub n'attache aucun
fichier à ses versions, tout passe par la forge du projet, qui publie un flux
où les archives sont étiquetées par système plutôt que nommées. EvaChi sait
lire les deux formes.

Ryubing fait exception aussi : sa forge est protégée par un test anti-robot,
qu'on ne cherche pas à contourner. EvaChi le reconnaît en revanche partout où
il se trouve sur les disques, et s'en sert sans réglage.

### Les manettes des programmes séparés

EvaChi ne peut pas leur transmettre les entrées : chacun lit la manette
lui-même, à sa façon. Ce qu'elle fait, au démarrage, c'est leur poser une
configuration de départ quand ils n'en ont aucune — pour qu'une manette
branchée réponde dès la première partie, sans passer par leurs menus.

| Émulateur | Fichier posé | Possible parce que |
|---|---|---|
| Dolphin | `GCPadNew.ini`, `WiimoteNew.ini` | les appareils s'y désignent par rang (`XInput/0/Gamepad`) |
| PCSX2 | section `[Pad1]` de `PCSX2.ini` | même chose (`SDL-0/…`) |

Les autres — Cemu, Ryubing, xemu — désignent l'exemplaire précis du matériel
par un identifiant unique, qu'on ne peut pas deviner. Ils restent à régler dans
leurs propres menus.

Rien n'est jamais écrasé quand un appareil est déjà lié. Une configuration
d'usine, elle, l'est — ces programmes n'écrivent jamais un fichier vide, mais
un fichier câblé sur le clavier, et « ne jamais écraser » revenait donc à ne
jamais rien faire. L'ancien fichier est gardé à côté, suffixé `.avant-evachi`.

### Pourquoi télécharger plutôt qu'empaqueter

Mettre ces programmes *dans* l'exécutable d'EvaChi les redistribuerait. Pour les
émulateurs sous GPL, cela obligerait à fournir avec chaque copie d'EvaChi le
source correspondant à la version exacte incluse — et à le refaire à chaque mise
à jour de l'un d'eux. Aller les chercher à leur source donne le même résultat
pour qui s'en sert — rien à installer soi-même — sans rien redistribuer.

### Le jeu, pas le menu

Chaque émulateur est lancé avec les arguments qui l'amènent directement dans la
partie, en plein écran :

| Émulateur | Arguments |
|---|---|
| Cemu | `-f -g <jeu>` |
| PCSX2 | `-batch -fullscreen <jeu>` — `-batch` supprime sa bibliothèque |
| Xenia | `--fullscreen <jeu>` |
| xemu | `-full-screen -dvd_path <jeu>` |
| Ryubing | `--fullscreen <jeu>` |

Cemu et PCSX2 sont installés en mode portable — un dossier `portable`, un
fichier `portable.ini` — pour que leurs réglages restent chez EvaChi plutôt que
dans le profil Windows.

Ce qu'EvaChi ne fournit pas et ne fournira pas : les jeux, les BIOS, les clés et
les micrologiciels. Cemu réclame ses fichiers système Wii U, Ryubing ses clés
Switch, PCSX2 son BIOS PS2 — ils viennent de vos propres consoles.

## Sources

- <https://buildbot.libretro.com/> — la forge d'où viennent les cœurs
- <https://docs.libretro.com/> — l'interface que ces cœurs implémentent
- <https://www.gamingonlinux.com/2024/09/playstation-1-emulator-duckstation-changes-license-for-no-commercial-use-and-no-derivatives/>
- <https://emulation.gametechwiki.com/index.php/Ares>
- <https://emulation.gametechwiki.com/index.php/Nintendo_DS_emulators>
- <https://github.com/azahar-emu/azahar>
- <https://en.wikipedia.org/wiki/Cemu>
