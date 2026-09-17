# Isoler les cœurs : un processus par partie

Note de décision. Elle décrit ce qu'on change, pourquoi, ce qu'on accepte de
perdre au passage — et ce que le chantier **ne** fait **pas**, ce qui importe
tout autant.

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
ce que fait `--probe-core` pour interroger un cœur sans risquer la fenêtre. On
suit le chemin déjà tracé : même binaire, mêmes dossiers, même journal.

## Ce qui passe entre les deux, et par où

Trois natures de données, trois traitements.

### Les commandes et les réponses — un tuyau nommé

Huit demandes : charger un cœur, charger un contenu, tourner des trames,
réinitialiser, sauver un état, reprendre un état, décharger, relever les
messages. Chacune attend sa réponse, et porte un jeton — une réponse en retard
se reconnaît et ne se prend pas pour la suivante.

Pas la sortie standard : les cœurs y écrivent. La sonde le constate déjà — « un
cœur bavard écrit sur la sortie standard avant nous » — et s'en tire en ne
gardant que la dernière ligne. Un protocole binaire n'aurait pas cette chance.

Côté fenêtre, **toutes les lectures et écritures sont en recouvrement**. Ce
n'est pas un raffinement : c'est ce qui donne une échéance à chaque échange sans
fil lecteur intermédiaire, et ce qui permet d'attendre en même temps la réponse
*et* la mort du processus d'en face. Un cœur qui tombe réveille l'attente tout
de suite, au lieu de la laisser courir jusqu'au bout du délai.

### L'image — une mémoire partagée

Une trame de 640×480 pèse 1,2 Mo ; en 1080p, 8,3 Mo. À soixante par seconde,
c'est un demi-gigaoctet par seconde qu'il serait absurde de faire passer par un
tuyau. **C'est le seul argument de la mémoire partagée, et il suffit** — voir
plus bas ce qu'elle ne rapporte pas.

Le parent crée un segment de 32 Mio, au nom unique, et en donne le nom à
l'enfant. Le protocole étant strictement question-réponse, il n'y a qu'un
écrivain à la fois : ni double tampon, ni verrou, ni déchirure possible.

Reste ceci, et c'est sérieux : **ce que l'enfant écrit dans l'en-tête est une
déclaration, jamais une consigne.** Le processus d'en face peut être devenu fou,
c'est même tout l'objet du dispositif ; un pointeur égaré a autant de chances de
tomber sur la zone partagée que sur le reste. La fenêtre vérifie donc chaque
champ — géométrie bornée, taille recalculée, numéro de trame comparé — **avant**
de toucher un octet, puis recopie hors du segment. Croire une longueur annoncée,
ce serait faire tomber la fenêtre par le symptôme exact qu'on supprime.

### Le son et les messages — dans la réponse

Une trame de son pèse trois kilo-octets. Les lignes de journal du cœur, quelques
centaines. Les deux voyagent dans la réponse, en octets bruts.

Les messages voyagent sur **toutes** les réponses, et pas seulement sur celles
des trames. C'est le seul endroit où l'on apprend *pourquoi* un contenu a été
refusé : un chargement raté n'a jamais produit de trame, et sans cela l'écran
dirait « contenu refusé » sans jamais dire quel BIOS il manque.

## Plusieurs trames d'un coup

La requête de trame porte un nombre. En avance rapide à neuf cents pour cent, on
exécute neuf trames pour n'en regarder qu'une : les demander une par une
paierait l'aller-retour neuf fois. L'entrée est échantillonnée une fois par lot,
soit la même finesse que ce que l'écran montre de toute façon.

Elle porte aussi un « j'ai besoin de l'image ». Quand il est faux, l'enfant
n'écrit rien dans le segment. Attention à la nuance : le drapeau coupe le
**transport**, pas la **capture**. Un cœur a le droit de redemander la trame
précédente, et cela arrive souvent — un jeu à trente images sur un cœur à
soixante en duplique une sur deux. Si l'on cessait de capturer, la trame qu'on
voulait vraiment tomberait sur une duplication et l'écran montrerait du passé,
précisément pendant la seule manœuvre où l'on regarde l'écran pour savoir quand
relâcher.

## Quand ça se passe mal

| Ce qui arrive | Comment on le voit | Ce qu'on fait |
|---|---|---|
| Le cœur plante | le tuyau se ferme, code de sortie réservé | on rentre à la bibliothèque en disant qu'il a fauté |
| Le cœur se fige | pas de réponse avant l'échéance | on le tue, et on dit qu'il ne répondait plus |
| L'enfant ne démarre pas | `spawn` échoue | on retombe dans la fenêtre, et on l'écrit au journal |
| L'enfant démarre et ne se branche pas | l'attente surveille aussi sa mort | même chose : aucun cœur n'a encore vécu |
| La fenêtre meurt | — | l'objet de travail emporte l'enfant avec elle |

Les échéances ne sont pas les mêmes selon la demande, et **aucune n'est
infinie** : une commande sans échéance, c'est le figement qui revient par la
seule porte restée ouverte. Cinq secondes pour une trame, cinq minutes pour un
contenu de PlayStation 2 sur disque externe, vingt secondes pour un
déchargement — c'est là que le cœur écrit sa sauvegarde de pile, et la couper
serait perdre la partie ; vingt et non davantage, parce qu'on décharge aussi à
l'extinction, et qu'un cœur sain rend la main en quelques millisecondes.

Une fois qu'un échange a mal tourné, on ne redemande plus rien : le flux est
désynchronisé, et redemander poliment à un cœur figé de se décharger ferait
attendre une seconde fois.

L'erreur rendue à la fenêtre porte une marque reconnaissable — `coeur-tombe:` —
pour qu'elle la distingue d'un refus ordinaire. Le refus formulé par le cœur
lui-même, lui, est rendu mot pour mot : il explique ce qu'aucune erreur de
transport ne saurait dire.

### Ce que Windows fait qu'il ne faut pas laisser faire

Trois réglages, sans lesquels le dispositif marcherait de travers en silence.

**Le rapport d'erreurs.** Une violation d'accès non rattrapée réveille
`WerFault`, qui garde le cadavre ouvert dix à soixante secondes : la fenêtre ne
verrait pas une mort mais une absence de réponse, et dirait « il s'est figé »
pour un plantage. L'enfant coupe donc les boîtes d'erreur et pose son propre
filtre d'exception, qui écrit une ligne puis se termine sur-le-champ.

**Les processus orphelins.** Windows ne récolte pas les enfants avec leur
parent. Or le geste qu'on fait devant un jeu figé, c'est justement de tuer
l'application depuis le gestionnaire des tâches — ce qui laisserait un émulateur
sans fenêtre à cent pour cent d'un cœur. Un objet de travail règle cela au
niveau du noyau : quand la dernière poignée se ferme, tout ce qu'il contient est
tué.

**Le bridage.** Depuis Windows 10, un processus sans fenêtre visible est classé
travail d'arrière-plan : planifié de préférence sur les cœurs d'efficacité et
limité en fréquence. L'enfant a exactement ce profil. Sans deux lignes pour le
dire, la même partie tournerait à cinquante-deux images par seconde sur batterie
là où elle en faisait soixante la veille — et l'on chercherait la cause du côté
du tuyau, qui n'y serait pour rien.

### La sortie de l'enfant

Elle ne passe ni par `main`, ni par `process::exit`. La bibliothèque du cœur
reste projetée volontairement — la rendre au système fige le processus quand le
cœur a laissé des fils en vie, ce que Dolphin fait —, mais une sortie ordinaire
appellerait quand même le détachement de la bibliothèque, et l'on retomberait
dessus : un processus irrécupérable par partie, ce que la sonde avait déjà
constaté sur Citra et Flycast. L'enfant se termine donc de lui-même, sans
détachement.

Et la fenêtre ne fait jamais confiance : après la réponse au déchargement, elle
attend, puis tue. Le processus suivant écrira dans le même dossier de
sauvegardes ; deux cœurs qui s'y trouvent en même temps, c'est une carte mémoire
abîmée.

## Ce que le chantier ne rapporte pas

**Il ne rend pas le jeu plus fluide.** C'est important à écrire, parce que
l'inverse serait tentant à croire.

Un aller-retour de tuyau nommé coûte quelques dizaines de microsecondes, soit
moins d'un pour cent du budget d'une trame à soixante images par seconde. Il
n'enlève rien non plus : sur un cœur 3D, l'essentiel du temps hors émulation
part dans `glFinish` puis `glReadPixels` — un arrêt complet du pipeline
graphique suivi d'un transfert synchrone —, et le chantier n'y touche pas. La
mémoire partagée remplace une copie par une autre, entre processus cette fois,
ce qui n'est pas plus rapide.

Le chantier achète de la **robustesse**, pas de la vitesse. Ce qui reste à
gagner côté cadence est ailleurs, et c'est un autre chantier : relire le tampon
graphique de façon asynchrone plutôt que d'arrêter le pipeline à chaque trame.

## Ce que la fenêtre doit apprendre à faire

Quatre choses, toutes déjà à moitié écrites.

1. **Rentrer vraiment.** Aujourd'hui, quand une trame échoue, la boucle s'arrête
   et écrit une ligne — mais le cœur, le jeu et le nom restent posés, la
   bibliothèque ne revient pas, et « Reprendre » relancerait la boucle sur un
   cœur mort.
2. **Effacer le témoin.** Le témoin de partie sert à reconnaître une fenêtre qui
   a disparu. Si le cœur tombe désormais sans emporter la fenêtre, la note reste
   armée et le lancement suivant annonce un plantage qui n'a pas eu lieu.
3. **Compter le temps de jeu.** Une partie qui finit par un plantage doit
   compter comme les autres.
4. **Le dire.** La fenêtre d'incident existe déjà, et son texte explique que
   l'émulateur « tourne dans la même fenêtre qu'EvaChi ». Ce n'est plus vrai.

## Ce qu'on ne fait pas

- **On ne répare aucun cœur.** Dolphin figera toujours, PPSSPP tombera toujours.
  Simplement, sans emporter la fenêtre.
- **On ne rend pas la manette au natif.** Elle est lue par la page, et les seize
  booléens continuent de voyager dans la requête de trame. C'est ce qui garde les
  raccourcis vivants quand le cœur, lui, ne l'est plus.
- **On ne touche pas aux émulateurs autonomes.** Ils sont déjà dans leur propre
  processus, par construction.
- **On ne répare pas les chemins accentués.** Les chemins remis au cœur sont
  encodés en UTF-8 ; un cœur qui les relit avec le CRT ANSI ne trouvera toujours
  pas `Pokémon Rouge.cue`. C'est un défaut d'aujourd'hui, et il reste entier.
- **On ne sauve pas la SRAM à la place du cœur.** Elle reste son affaire, et
  elle est perdue quand il faut le tuer. La fenêtre le dit, faute de mieux.
- **Le repli est à sens unique.** Si le processus ne peut pas démarrer *avant
  qu'aucun cœur n'ait vécu*, on retombe dans la fenêtre. Jamais après : un cœur
  qui vient de tuer son processus serait sinon réessayé dans la fenêtre, qu'il
  tuerait à son tour, et le repli serait devenu le chemin le plus sûr vers le
  défaut qu'on supprime.

## Ce qu'on éprouve

Le faux cœur de `test-core` a appris à mal se conduire sur commande — quatre
boutons tenus ensemble déclenchent, au choix, une écriture hors mémoire, un
abandon, ou une boucle sans fin.

Ces épreuves-là étaient **inécrivables** jusqu'ici : un cœur qui plante tuait le
programme de test lui-même, et libtest n'a aucun équivalent de `#[should_panic]`
pour une violation d'accès. Qu'elles existent est en soi la démonstration du
chantier.

Elles vivent dans [`tests/isolement.rs`](../src-tauri/tests/isolement.rs) : une
partie survit à un cœur qui plante, une partie survit à un cœur qui se fige, on
enchaîne trois parties sans que l'une gêne l'autre, on relance un jeu après un
plantage, et ce qu'un cœur a écrit avant de refuser un contenu arrive quand même
à la fenêtre.
