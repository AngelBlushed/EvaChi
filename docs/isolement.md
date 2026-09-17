# Isoler les cœurs : un processus par partie

Note de décision. Elle décrit ce qu'on change, pourquoi, et ce qu'on accepte de
perdre au passage.

## Le défaut

Un cœur libretro est une bibliothèque étrangère chargée dans le processus
d'EvaChi. Elle y a tous les droits. Quand elle lit hors de sa mémoire —
Flycast l'a fait, le 12 septembre — Windows tue le processus fautif, c'est-à-dire
**la fenêtre entière**. Pas de message, pas de journal, pas de retour à la
bibliothèque : l'application disparaît, et il faut fouiller l'observateur
d'événements de Windows pour apprendre lequel des cinquante-quatre cœurs était en
cause.

Trois symptômes connus tiennent tous à cette racine :

1. **Un cœur qui plante emporte l'application.** Le pire, parce qu'il est muet.
2. **Un cœur qui se fige fige l'application.** Dolphin le fait. Rien ne reprend
   la main, il faut tuer EvaChi.
3. **Trois cœurs 3D d'affilée refusent le contenu au dernier.** Dolphin puis
   Flycast passe ; Dolphin, N64, puis Flycast échoue. Un cœur laisse derrière lui
   des variables globales C que `retro_deinit` ne remet pas à zéro — et
   [`core.rs`](../src-tauri/src/libretro/core.rs) ne rend jamais la bibliothèque
   au système (`mem::forget`), parce que la rendre fige le processus.

Le témoin de partie ([`sentinel.rs`](../src-tauri/src/sentinel.rs)) est le
garde-fou posé en attendant : il note sur le disque quel cœur vient d'être
chargé, et une note retrouvée au démarrage suivant apprend ce qui a tué
l'application. Il explique après coup. Il ne répare rien.

## Le remède

Le cœur ne tourne plus dans la fenêtre. Il tourne dans **un processus enfant,
un par partie**, et la fenêtre lui parle par un tuyau.

Un cœur qui meurt ne tue alors que lui-même. La fenêtre le voit mourir, le dit,
et rentre à la bibliothèque. Un cœur qui se fige ne répond plus : au bout d'un
délai, on le tue et on rentre pareil. Et comme chaque partie démarre un
processus neuf, les variables globales du cœur précédent n'existent plus — le
troisième symptôme disparaît de lui-même.

L'enfant est **le même exécutable**, relancé avec un drapeau interne. C'est déjà
ce que fait `--probe-core` pour interroger un cœur sans risquer la fenêtre
([`commands.rs`](../src-tauri/src/commands.rs), `probe_core_with_reason`). On
suit le chemin déjà tracé : même binaire, mêmes dossiers, même journal.

## Ce qui passe entre les deux, et par où

Trois natures de données, trois traitements.

### Les commandes et les réponses — un tuyau nommé

Sept commandes, exactement celles de l'`enum Request` d'aujourd'hui : charger un
cœur, charger un contenu, tourner une trame, réinitialiser, sauver un état,
restaurer un état, décharger. Chacune attend sa réponse. Le canal est un **tuyau
nommé Windows**, duplex, créé par le parent et ouvert par l'enfant.

Pas la sortie standard : les cœurs y écrivent. La sonde le constate déjà — « un
cœur bavard écrit sur la sortie standard avant nous » — et s'en tire en ne
gardant que la dernière ligne. Un protocole binaire n'aurait pas cette chance.
La sortie standard et la sortie d'erreur de l'enfant restent donc au cœur, et le
parent les recopie dans le journal de l'application.

Cadrage des messages : quatre octets de longueur, un octet d'étiquette, puis la
charge. Les structures voyagent en JSON — elles sont petites et rares ; seuls les
états de sauvegarde sont volumineux, et ils voyagent en octets bruts.

### L'image — une mémoire partagée

Une trame de 640×480 pèse 1,2 Mo ; en 1080p, 8,3 Mo. À soixante par seconde,
c'est un demi-gigaoctet par seconde qu'il est absurde de faire passer par un
tuyau.

Le parent crée donc un **segment de mémoire partagée** de 32 Mio, nommé, et en
donne le nom à l'enfant. L'enfant y écrit les pixels ; le parent les y lit. Le
segment commence par un en-tête de seize octets : numéro de trame, largeur,
hauteur, longueur utile.

Le protocole est strictement question-réponse : l'enfant n'écrit dans le segment
que pendant une trame demandée, et le parent ne lit qu'après avoir reçu la
réponse. Il n'y a donc pas deux écrivains, pas de déchirure possible, et pas
besoin de double tampon. Le numéro de trame est vérifié des deux côtés : c'est
une ceinture, pas une bretelle.

Une trame qui ne tiendrait pas dans le segment — cela demanderait plus de
2800 pixels de côté — repasse par le tuyau. Le cas n'est pas attendu ; il est
prévu pour ne pas avoir à y penser.

### Le son et les messages — dans la réponse

Une trame de son pèse six kilo-octets. Les lignes de journal du cœur, quelques
centaines d'octets. Les deux voyagent dans la réponse de la trame, comme
aujourd'hui.

## Ce qu'on gagne en chemin

Deux choses qui ne coûtent rien de plus.

**L'image qu'on ne demande pas.** En avance rapide, on exécute jusqu'à neuf
cents pour cent des trames mais on n'en peint que soixante par seconde : le reste
est converti, recopié, transporté, puis jeté. La requête de trame porte
désormais un « j'ai besoin de l'image » ; quand il est faux, le rappel vidéo
n'écrit rien du tout. C'est autant de travail en moins, y compris pour les cœurs
3D, dont chaque trame coûte un `glReadPixels` bloquant.

**Une copie de moins.** Aujourd'hui une image est écrite quatre fois entre le
cœur et le canevas : conversion, `clone()`, `pack_frame`, IPC. L'enfant écrit
directement dans le segment partagé, et le parent en tire le bloc binaire :
la première des quatre disparaît.

## Quand ça se passe mal

| Ce qui arrive | Comment on le voit | Ce qu'on fait |
|---|---|---|
| Le cœur plante | le tuyau se ferme, l'enfant a un code de sortie | on rentre à la bibliothèque en le disant |
| Le cœur se fige | pas de réponse avant l'échéance | on tue l'enfant, on rentre pareil |
| L'enfant ne démarre pas | `spawn` échoue | on retombe sur l'ancien mode, dans la fenêtre, et on l'écrit au journal |
| L'enfant meurt pendant le chargement | même chose, avec son journal | on dit ce que le cœur a écrit avant de mourir |

Les échéances ne sont pas les mêmes selon la demande : une trame doit répondre en
quelques secondes, un chargement de contenu peut prendre une minute sur un jeu
PS2, une sauvegarde d'état de quatre-vingt-dix mégaoctets prend le temps qu'il
faut. Elles sont déclarées au même endroit, dans le protocole.

L'erreur rendue à la fenêtre porte une marque reconnaissable — `coeur-tombe:` —
pour que l'interface la distingue d'un refus ordinaire. C'est la seule chose
qu'elle a besoin de savoir.

## Ce que la fenêtre doit apprendre à faire

Quatre choses, toutes déjà à moitié écrites.

1. **Rentrer vraiment.** Aujourd'hui, quand une trame échoue, la boucle s'arrête
   et écrit une ligne — mais le cœur, le jeu et le nom restent posés, la
   bibliothèque ne revient pas, et « Reprendre » relancerait la boucle sur un
   cœur mort. Il faut appeler `stopPlaying()`.
2. **Effacer le témoin.** Le témoin de partie sert à reconnaître une fenêtre qui
   a disparu. Si le cœur tombe désormais sans emporter la fenêtre, la note reste
   armée et le lancement suivant annonce un plantage qui n'a pas eu lieu.
3. **Compter le temps de jeu.** `clorePartie()` est appelée quand on quitte
   proprement. Une partie qui finit par un plantage doit compter comme les
   autres.
4. **Le dire.** La fenêtre d'incident existe déjà, et son texte explique que
   l'émulateur « tourne dans la même fenêtre qu'EvaChi ». Ce n'est plus vrai :
   il faut le réécrire, et proposer la même issue qu'avant — écarter ce cœur, ou
   le garder.

## Ce qu'on ne fait pas

- **On ne répare aucun cœur.** Dolphin figera toujours, PPSSPP tombera toujours.
  Simplement, sans emporter la fenêtre.
- **On ne rend pas la manette au natif.** Elle est lue par la page, et les seize
  booléens continuent de voyager dans la requête de trame. C'est ce qui garde les
  raccourcis vivants quand le cœur, lui, ne l'est plus.
- **On ne touche pas aux émulateurs autonomes.** Ils sont déjà dans leur propre
  processus, par construction.
- **On ne supprime pas le mode d'avant.** Il reste, sous un réglage, et sert de
  repli quand le processus enfant ne peut pas démarrer.

## Ce qu'on éprouve

Le faux cœur de `test-core` apprend à mal se comporter sur commande — une
combinaison de boutons réservée déclenche, au choix, une écriture hors mémoire
ou une boucle sans fin. C'était impossible à éprouver jusqu'ici : un cœur qui
plante tuait le programme de test lui-même. C'est précisément ce que le chantier
change.

Trois épreuves neuves, alors : une partie survit à un cœur qui plante ; une
partie survit à un cœur qui se fige ; et ce qu'un cœur a écrit avant de mourir
arrive quand même à la fenêtre.
