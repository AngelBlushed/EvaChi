# EvaChi

Hôte d'émulation multi-systèmes. Une seule interface, des cœurs interchangeables.

EvaChi n'est pas un lanceur : il héberge les cœurs dans son propre processus,
sous sa propre interface. Deux familles de cœurs cohabitent derrière le même
contrat :

- les **cœurs internes**, écrits pour ce projet en TypeScript — aujourd'hui
  CHIP-8, complet, avec ses six écarts de comportement ;
- les **cœurs libretro**, chargés dynamiquement par la coque native, qui
  ouvrent NES, Game Boy, SNES, GBA, PS1, DS, GameCube, PS2, PSP et au-delà.

Distribué sous **GPL-3.0-or-later** : voir [LICENSE](LICENSE) et
[docs/coeurs.md](docs/coeurs.md) pour ce que cela implique.

## État

| Partie | État |
|---|---|
| Contrat `EmulatorCore` + variante asynchrone | fait |
| Cœur CHIP-8 | fait, 47 tests |
| Hôte libretro en Rust | fait, éprouvé contre un vrai cœur chargé dynamiquement |
| Format binaire des trames | testé des deux côtés, séparément |
| Interface : sélection de cœur, commandes, son, états | fait |
| Coque Tauri | démarre, fenêtre et dossiers de travail créés |
| Cœur du commerce | **SameBoy fait tourner une ROM Game Boy de bout en bout** |

## Démarrer

```bash
npm install
node scripts/make-demo-rom.mjs
npm run dev
```

L'interface écoute sur <http://localhost:5173>. Le bouton **Démo** charge
`roms/bounce.ch8`, une ROM écrite pour ce projet.

```bash
npm test                                    # tests TypeScript : CHIP-8, trames, audio, bibliothèque, manette
npm run typecheck                           # tsc sur tout le TypeScript
npm run build                               # bundle statique dans dist/
node scripts/run-headless.mjs roms/bounce.ch8 --frames 180 --every 60
```

Le mode sans interface rend l'écran en ASCII dans le terminal : pratique pour
valider un cœur sans navigateur.

## L'application native

```bash
npm run app:dev                             # fenêtre Tauri + rechargement à chaud
npm run app:build                           # exécutable optimisé
```

### Ce qu'il faut installer sous Windows

- **Rust** via [rustup](https://rustup.rs) ;
- **Build Tools for Visual Studio** avec la charge de travail C++ — Rust cible
  `x86_64-pc-windows-msvc` et a besoin de `link.exe` et du SDK Windows ;
- **WebView2**, déjà présent sur Windows 11.

```bash
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

La chaîne `x86_64-pc-windows-gnu` ne convient pas : le MinGW que rustup embarque
est incomplet (`dlltool` sans assembleur), et Tauri y est mal supporté.

### Les cœurs

Au premier lancement, l'application crée trois dossiers sous
`%APPDATA%\app.evachi` :

| Dossier | Contenu |
|---|---|
| `cores/` | bibliothèques de cœurs libretro (`.dll`) |
| `system/` | BIOS et fichiers que certains cœurs réclament |
| `saves/` | sauvegardes de jeu et états |

Les cœurs ne sont pas distribués avec EvaChi : chacun a sa licence. EvaChi va
les chercher à leur source, `buildbot.libretro.com`, à la demande — un cœur par
console, une case à cocher par console.

```
Fichier → Émulateurs…            depuis la fenêtre
EvaChi.exe --install-cores       sans ouvrir la fenêtre
EvaChi.exe --install-emulators   les consoles sans cœur libretro
EvaChi.exe --list-cores          ce que l'application voit réellement
```

[docs/coeurs.md](docs/coeurs.md) donne la liste complète et dit pourquoi ces
cœurs-là.

Les consoles sans portage libretro — Wii U, PS2, Xbox, Xbox 360, PS Vita —
passent par un émulateur autonome, qu'EvaChi installe dans
`%APPDATA%\app.evachi\emulators\` depuis la forge de chaque projet, et qu'elle
lance directement dans le jeu, en plein écran, sans montrer son menu.

La GameCube et la PSP les ont rejointes, bien qu'un cœur existe pour elles : ces
cœurs-là dessinent par le processeur graphique, et notre intégration de ce rendu
n'est pas au point. Dolphin et PPSSPP d'origine tournent sans faute et prennent
la place ; les cœurs restent choisissables dans le volet.

Ces programmes lisent la manette eux-mêmes — EvaChi ne peut rien leur
transmettre. Elle leur pose en revanche une configuration de départ quand ils
n'en ont aucune, pour que la manette réponde dès la première partie. Voir
[docs/coeurs.md](docs/coeurs.md) pour qui peut en bénéficier et pourquoi pas
tout le monde.

La Switch fait exception : la forge de Ryubing est protégée par un test
anti-robot, qu'EvaChi ne cherche pas à contourner. Installez-le depuis
<https://ryujinx.app> — EvaChi le trouvera ensuite toute seule, où qu'il soit.

Ni jeux, ni BIOS, ni clés : ceux-là viennent de vos propres consoles.

### Où poser ses jeux

Au premier lancement, EvaChi crée sous `%APPDATA%\app.evachi\roms` un dossier
vide par console, formats attendus compris — « Nintendo 64 (n64-z64-v64) »,
« Dreamcast (.gdi .cdi .chd .cue) ». Il suffit d'y glisser ses fichiers : le nom
du dossier désigne la console, et donc l'émulateur employé, même quand plusieurs
savent lire le même format.

On peut aussi désigner ses propres dossiers — `Fichier → Ajouter un dossier de
jeux…` — auquel cas c'est ce classement-là qui fait loi.

Une exception : si un dossier `roms` se trouve **à côté de l'exécutable**, c'est
lui qui sert de bibliothèque, et le dossier caché n'est plus touché. C'est ce
qui rend une copie distribuée portable — les jeux se déposent à la vue de tous
plutôt que dans un `%APPDATA%` qu'il faudrait d'abord expliquer.

## Architecture

Tout passe par un contrat unique, [`src/core/types.ts`](src/core/types.ts) :

```ts
interface EmulatorCore {
  readonly info: SystemInfo;
  load(rom: Uint8Array): void;
  reset(): void;
  runFrame(input: InputState): Frame;   // une trame vidéo + ses échantillons
  saveState(): Uint8Array;
  loadState(state: Uint8Array): void;
}
```

Le frontend ne sait rien du système émulé : il pousse des entrées, réclame des
trames, affiche et joue. Ajouter la NES revient à écrire une implémentation de
plus, sans toucher au shell.

Un cœur interne répond immédiatement ; un cœur libretro vit derrière une
frontière de processus. `AsyncEmulatorCore` est la même chose en asynchrone, et
`toAsync` y ramène les cœurs internes sans les alourdir.

```
src/core/types.ts            contrat commun, synchrone et asynchrone
src/chip8/                   cœur CHIP-8 : interpréteur, écarts, tests
src/libretro/client.ts       pont vers la coque native, décodage des trames
src/web/
  main.ts                    interface : sélection, boucle, commandes
  catalog.ts                 ce qui est disponible : cœurs internes et libretro
  input.ts                   dispositions clavier : pavé hexadécimal, manette
  audio.ts                   sortie audio : file d'attente et rééchantillonnage
scripts/                     génération de ROM, exécution sans interface, build

src-tauri/src/libretro/
  abi.rs                     l'ABI C de libretro, transcrite
  host.rs                    état hôte et rappels ; conversion vidéo en RGBA
  core.rs                    chargement dynamique, pilotage, sauvegardes
  session.rs                 le thread propriétaire du cœur
src-tauri/src/commands.rs    commandes exposées à l'interface
src-tauri/test-core/         cœur libretro d'essai, à valeurs connues
src-tauri/tests/libretro.rs  tests d'intégration de l'hôte
src-tauri/examples/probe.rs  sonde : interroge un cœur hors interface
```

### Pourquoi libretro

Se brancher sur les entrailles de dix émulateurs différents serait dix
intégrations à maintenir. libretro est une ABI C stable que la plupart d'entre
eux exposent déjà : un cœur est une bibliothèque dynamique qui exporte une
trentaine de symboles connus. EvaChi en implémente le côté hôte une seule fois.

Les trames traversent la frontière en binaire brut, pas en JSON : une image
640×448 pèse 1,1 Mo, et l'encoder soixante fois par seconde coûterait plus cher
que l'émulation. La disposition est documentée sur `pack_frame`.

### Comment l'hôte est vérifié

Le dépôt contient son propre cœur libretro,
[`src-tauri/test-core/`](src-tauri/test-core/src/lib.rs). Il n'émule rien : il
produit des valeurs **connues** sur chaque chemin de l'ABI, pour que les tests
puissent affirmer exactement ce qu'ils doivent recevoir.

| Ce que le cœur d'essai produit | Ce que ça démasque |
|---|---|
| rouge, vert, bleu, blanc purs en tête de la première ligne | l'inversion R↔B, l'erreur classique avec XRGB8888 dont les octets arrivent en BGRA |
| des lignes écrites avec quatre pixels de marge | un hôte qui confond `pitch` et `width × 4`, et penche l'image |
| un pixel par bouton enfoncé, sur la deuxième ligne | des entrées qui n'arrivent pas jusqu'au cœur — l'image dit ce qu'il a *lu* |
| deux rampes audio distinctes par canal | l'entrelacement perdu ou les canaux intervertis |
| un compteur de trames comme état sérialisable | une sauvegarde qui ne rembobine pas vraiment |

```bash
npm run test:rust                           # 27 tests : 15 unitaires, 12 d'intégration
npm run test:all                            # TypeScript + types + Rust
```

Un vrai défaut en est sorti : `Session` ne garantissait pas que son cœur était
déchargé au retour de `drop`. Le ménage se faisait plus tard, sur le thread
d'émulation, et déinitialisait un cœur chargé entre-temps. Un cœur libretro
n'existant qu'en un exemplaire par processus, changer de cœur pouvait donc
casser le suivant.

### Éprouvé sur un vrai cœur

Un cœur écrit pour l'occasion prouve que l'hôte respecte l'ABI ; il ne prouve
pas qu'il survit à ce que font les vrais. `examples/probe.rs` charge n'importe
quel cœur hors interface et rapporte ce qu'il déclare :

```bash
cargo run --example probe -- <coeur.dll> [contenu] [--frames N]
```

Sur **SameBoy 1.0.3** (Game Boy, MIT) avec [`roms/defile.gb`](scripts/make-gb-rom.mjs),
une cartouche assemblée à la main par ce dépôt — elle écrit une tuile en mémoire
vidéo, remplit la carte de fond et fait défiler l'écran :

```
résolution  160×144 (max 256×224)
cadence     59,728 images/s
240 trames : 240 images neuves, 16 803 000 échantillons audio
images      171 changements, 170 distinctes sur 240
dernière    2880 pixels sombres sur 23040 (12,5 %)
```

Ces 12,5 % valent preuve : c'est exactement un pixel sur huit, soit la diagonale
attendue au pixel près.

Un défaut en est sorti, invisible autrement : **SameBoy annonce 2 097 152 Hz**,
l'horloge brute de la Game Boy. Web Audio refuse cette cadence et
`createBuffer` aurait levé une exception. La sortie audio rééchantillonne
maintenant vers la cadence du contexte, quelle que soit celle du cœur.

### Le format des trames

`pack_frame` (Rust) et `decodeFrame` (TypeScript) sont les deux moitiés d'un
même format binaire, et rien ne les relie à la compilation. Chacune est donc
testée contre la **description écrite** du format plutôt que contre l'autre :
les tests réécrivent la disposition au lieu de l'importer, si bien qu'une
divergence se voit au lieu de se propager.

### Le son

`AudioSink` (dans [`src/web/audio.ts`](src/web/audio.ts)) met les échantillons en
file sur une horloge qui court devant le temps réel. Le CHIP-8 n'a qu'un buzzer,
mais la plomberie vaut telle quelle pour les systèmes à plusieurs voies : c'est
le cœur qui produit ses échantillons, pas le frontend.

## Les écarts de comportement CHIP-8

Le CHIP-8 n'a jamais eu de spécification. Le COSMAC VIP de 1977 fait référence,
le SUPER-CHIP des HP-48 a changé plusieurs instructions en silence, et les ROMs
sont écrites pour l'un **ou** pour l'autre. D'où trois préréglages sélectionnables
à chaud, détaillés dans [`src/chip8/quirks.ts`](src/chip8/quirks.ts) :

| Écart | Effet | VIP | SUPER-CHIP |
|---|---|:--:|:--:|
| `vfReset` | OR/AND/XOR remettent VF à zéro | ✓ | — |
| `memoryIncrement` | FX55/FX65 font avancer I | ✓ | — |
| `displayWait` | un sprite par trame au maximum | ✓ | — |
| `clipping` | sprite tronqué au bord, pas replié | ✓ | ✓ |
| `shifting` | 8XY6/8XYE décalent VX sur place | — | ✓ |
| `jumping` | BNNN se lit BXNN | — | ✓ |

Si une ROM s'affiche de travers, c'est presque toujours l'un de ces six.

## Commandes

Tout se mappe par **position physique** (`KeyboardEvent.code`) et non par
caractère : la disposition tombe au même endroit en AZERTY et en QWERTY, sans
réglage. L'interface affiche les vraies étiquettes quand le navigateur publie la
disposition du clavier.

Un cœur reçoit toujours seize boutons ; c'est à chaque système de dire ce qu'ils
signifient. Le CHIP-8 y voit le clavier hexadécimal du COSMAC VIP, un cœur
libretro une manette.

```
CHIP-8 — pavé hexadécimal        libretro — manette

1 2 3 4  →  1 2 3 C              flèches      →  croix directionnelle
A Z E R  →  4 5 6 D              X  /  W       →  B  /  A
Q S D F  →  7 8 9 E              S  /  Q       →  Y  /  X
W X C V  →  A 0 B F              A  /  Z       →  L  /  R
                                 ⇧ droite / ⏎  →  SELECT / START
```

(Étiquettes AZERTY ; l'interface affiche celles de votre clavier.)

La manette se réassigne depuis la même fenêtre : `Affichage → Commandes…`, puis
**Réassigner**. On clique la touche à changer, on presse le bouton voulu, c'est
lié. Un bouton du cœur n'est jamais tenu par deux boutons de manette à la fois
— le nouveau venu libère l'ancien, sans quoi la touche resterait enfoncée dès
que l'un des deux est pressé. `Liaisons d'origine` revient au réglage d'usine.

### Habillages

`Affichage → Thèmes…` propose dix palettes, dont trois claires. Le choix est
retenu d'un lancement à l'autre, dans le stockage du navigateur — un réglage
d'affichage n'a pas à coûter un aller-retour natif au démarrage.

Chacune renseigne les mêmes dix variables CSS, et rien d'autre dans la mise en
page ne connaît de couleur : ajouter un thème ne demande donc pas d'y toucher.
Un test vérifie le contraste de chaque palette — texte sur fond, texte discret,
accent — parce qu'une palette qu'on trouve jolie et qu'on ne peut pas lire est
une palette ratée.

## ROMs

Le dépôt ne contient et ne contiendra **aucune ROM commerciale ni BIOS**. Écrire
un émulateur est légal — c'est du reverse engineering de comportement, pas de la
copie de code, et la jurisprudence est établie (*Sony v. Connectix*, *Bleem!*).
Distribuer les ROMs ne l'est pas.

Pour tester : `roms/bounce.ch8` (CHIP-8) et `roms/defile.gb` (Game Boy) sont
générés par ce projet — voir `scripts/make-demo-rom.mjs` et
`scripts/make-gb-rom.mjs`. La suite
`chip8-test-suite` de Timendus (libre) couvre chacun des écarts ci-dessus. Les
jeux CHIP-8 historiques sont pour l'essentiel dans le domaine public.

## Feuille de route

Deux voies coexistent, et il vaut mieux savoir laquelle on emprunte.

**Héberger** un cœur libretro existant, c'est le déposer dans `cores/` et le
piloter par l'ABI déjà implémentée. C'est ainsi qu'arrivent la quasi-totalité
des systèmes visés — NES, Game Boy, SNES, GBA, PS1, DS, GameCube, PS2, PSP.

**Écrire** un cœur, c'est le chemin réservé à ce qui mérite l'effort : on
apprend l'architecture au lieu de la consommer. CHIP-8 est fait ; la NES serait
le prochain candidat raisonnable.

| Reste hors de portée | Pourquoi |
|---|---|
| PS3, Wii U, 3DS, Vita | pas de cœur libretro viable ; RPCS3, Cemu, Azahar et Vita3K s'intègrent chacun à la main, et sont des projets de plusieurs années à plusieurs |

L'ancienne feuille de route « tout écrire de zéro » est conservée ci-dessous
pour mémoire du coût réel.

| Palier | Systèmes | Ce qu'il faudrait écrire |
|---|---|---|
| **0** ✅ | CHIP-8 | interpréteur, tracé XOR, minuteurs |
| **1** | NES, Game Boy, GBC | 6502 / LR35902, PPU ligne à ligne, APU, mappers |
| **2** | SNES, GBA, PS1 | 65816 / ARM7, modes vidéo, GTE et GPU pour la PS1 |
| **3** | N64, DS, PSP, PS2, GameCube | recompilateur dynamique, HLE graphique — des années |
| **4** | PS3, Vita, Wii U, 3DS | hors de portée en solo (RPCS3 : ~10 ans, des dizaines de contributeurs) |

Prochaine étape : le 6502 de la NES, en le validant instruction par instruction
avec `nestest`, puis le PPU.
