Aucune ROM commerciale ni BIOS dans ce dépôt.

## L'ossature

EvaChi crée elle-même, au premier lancement, un dossier par console sous
`%APPDATA%\app.evachi\roms` — quarante-huit dossiers vides, avec les formats
attendus écrits entre parenthèses. Il n'y a plus qu'à y déposer ses fichiers :
le nom du dossier suffit à désigner la console, et donc l'émulateur.

Si un dossier `roms` est posé à côté de l'exécutable, c'est lui qui sert de
bibliothèque : une copie distribuée est alors portable, et ses jeux se voient
sans avoir à ouvrir `%APPDATA%`. C'est ce dossier-ci quand on lance EvaChi
depuis le dépôt.

La liste vit dans `src-tauri/src/skeleton.rs`. Une console ajoutée à EvaChi doit
y gagner son dossier — un test le vérifie pour les émulateurs autonomes.

Ces dossiers ne sont posés qu'une fois : supprimer ceux dont on ne se sert pas
les fait disparaître pour de bon.

## Ce dossier-ci

`bounce.ch8` est généré par le projet : `node scripts/make-demo-rom.mjs`

Pour aller plus loin, la chip8-test-suite de Timendus (libre) couvre chacun des
écarts de comportement listés dans le README.
