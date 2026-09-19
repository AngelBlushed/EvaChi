/**
 * Ce qu'une console croit sentir.
 *
 * Quelques cartouches ne se jouent pas seulement aux boutons : elles lisent un
 * accéléromètre ou un gyroscope, et attendent qu'on penche la machine ou qu'on
 * la secoue. Le cœur les réclame par l'interface « capteurs » de libretro, et
 * s'il n'obtient rien, le jeu ne bouge pas — sans qu'aucun message ne dise
 * pourquoi.
 *
 * Une manette de salon n'a pas de capteur que le navigateur sache lire. On lui
 * en fabrique donc un : le manche droit tient lieu d'inclinaison, et une
 * combinaison de boutons produit une secousse. Ce n'est pas la vraie chose,
 * mais c'est ce que le jeu attend — et c'est jouable, ce que l'absence de
 * capteur n'était pas.
 *
 * Tout est ici, à part du reste, parce que ce sont des formules : elles se
 * vérifient sans manette et sans console.
 */

/** Deux fois pi, écrit une fois. */
const TOUR = Math.PI * 2;

/** Ce que les six capteurs valent à un instant donné. */
export interface Ressenti {
  /** Accélération en g, sur les trois axes de la machine. */
  readonly accel: readonly [number, number, number];
  /** Rotation en radians par seconde, sur les trois axes. */
  readonly gyro: readonly [number, number, number];
}

/**
 * Combien de temps dure une secousse, en secondes.
 *
 * Assez pour que le jeu la voie — la plupart guettent un pic sur deux ou trois
 * trames — et assez court pour qu'on puisse en enchaîner.
 */
export const DUREE_SECOUSSE = 0.55;

/** Combien de fois la main va et vient en une seconde, pendant la secousse. */
const CADENCE = 9;

/** L'amplitude du premier coup, en g. */
const FORCE = 2.4;

/** En combien de temps la secousse retombe des deux tiers, en secondes. */
const AMORTI = 0.18;

/**
 * Jusqu'où le manche penche la machine, en g.
 *
 * Deux tiers de g : c'est à peu près quarante degrés, l'inclinaison que
 * demandent les jeux qui se jouent en penchant la console. Un g entier
 * coucherait la machine à plat, ce qu'aucun jeu n'attend.
 */
const PENCHE = 0.66;

/**
 * La machine au repos, posée à plat.
 *
 * La pesanteur tire vers le bas : un accéléromètre immobile ne lit pas zéro,
 * il lit un g vers le sol. Un cœur qui lirait zéro partout croirait la console
 * en chute libre, et quelques-uns s'en servent pour détecter la panne.
 */
export function repos(): Ressenti {
  return { accel: [0, -1, 0], gyro: [0, 0, 0] };
}

/** Ramène une valeur dans `[-1, 1]`. */
const borner = (valeur: number): number =>
  Number.isFinite(valeur) ? Math.max(-1, Math.min(1, valeur)) : 0;

/**
 * L'inclinaison que donne un manche poussé.
 *
 * Les deux axes du manche penchent la machine de gauche à droite et d'avant en
 * arrière ; ce qui reste de pesanteur passe sur l'axe vertical. La somme des
 * trois reste donc à peu près un g, comme sur une vraie machine — un cœur qui
 * mesure la norme du vecteur n'y voit que du feu.
 */
export function pencher(x: number, y: number): Ressenti {
  const ax = borner(x) * PENCHE;
  const az = borner(y) * PENCHE;
  const reste = Math.max(0, 1 - ax * ax - az * az);
  return { accel: [ax, -Math.sqrt(reste), az], gyro: [0, 0, 0] };
}

/**
 * La secousse, à un instant donné depuis son départ.
 *
 * Une oscillation qui s'amortit, et non un pic unique : on ne secoue pas une
 * console d'un seul coup, on l'agite, et les jeux qui guettent cela comptent
 * les allers-retours plutôt que la valeur de pointe. Le gyroscope suit, en
 * quadrature : une main qui secoue tourne le poignet en même temps.
 *
 * @param secondes temps écoulé depuis le début de la secousse.
 */
export function secouer(secondes: number): Ressenti {
  if (!Number.isFinite(secondes) || secondes < 0 || secondes >= DUREE_SECOUSSE) {
    return repos();
  }

  const reste = Math.exp(-secondes / AMORTI);
  const angle = TOUR * CADENCE * secondes;
  const coup = FORCE * reste * Math.sin(angle);
  // Le second axe suit d'un quart de tour : une secousse parfaitement alignée
  // sur un seul axe est une chose que la main ne sait pas faire, et quelques
  // jeux la rejettent comme un défaut de capteur.
  const travers = FORCE * 0.45 * reste * Math.cos(angle);

  return {
    accel: [coup, -1 + travers * 0.3, travers],
    gyro: [travers * 3, coup * 3.4, -coup * 1.6],
  };
}

/**
 * Ce que les capteurs valent maintenant : l'inclinaison, plus la secousse.
 *
 * Les deux s'ajoutent plutôt que de s'exclure : on peut secouer une console
 * qu'on tient penchée, et c'est même ce que demandent les jeux qui mêlent les
 * deux.
 *
 * @param depuis temps écoulé depuis le début de la secousse, ou `null`.
 */
export function ressenti(x: number, y: number, depuis: number | null): Ressenti {
  const penche = pencher(x, y);
  if (depuis === null) return penche;

  const coup = secouer(depuis);
  const calme = repos();
  // La secousse est un écart au repos : on l'ajoute à l'inclinaison plutôt que
  // de la remplacer, sans quoi secouer remettrait la machine à plat.
  return {
    accel: [
      penche.accel[0] + (coup.accel[0] - calme.accel[0]),
      penche.accel[1] + (coup.accel[1] - calme.accel[1]),
      penche.accel[2] + (coup.accel[2] - calme.accel[2]),
    ],
    gyro: coup.gyro,
  };
}

/**
 * Les six valeurs dans l'ordre où libretro les numérote.
 *
 * Accéléromètre X, Y, Z puis gyroscope X, Y, Z : c'est cet ordre-là qui
 * traverse jusqu'au cœur, et le changer ici ferait pencher les jeux dans la
 * mauvaise direction sans que rien ne tombe en panne.
 */
export function enSix(valeurs: Ressenti): number[] {
  return [...valeurs.accel, ...valeurs.gyro];
}
