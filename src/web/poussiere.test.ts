/**
 * Le fond du carrousel.
 *
 * Un fond qui saute, qui se vide ou qui bat se voit tout de suite mais ne se
 * lit nulle part. Ces épreuves fixent ce qu'on attend de la poussière : qu'elle
 * reste à l'écran, qu'elle avance doucement, et que ses plans se distinguent.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { COUCHES, GRAINS, dessiner, semer, situer } from './poussiere.ts';

/** L'écart entre deux positions sur un axe qui boucle, de 0 à 0,5. */
function ecart(avant: number, apres: number): number {
  const brut = Math.abs(apres - avant);
  return Math.min(brut, 1 - brut);
}

describe('les plans de la poussière', () => {
  it('donnent la profondeur par la parallaxe', () => {
    // Du deuxième au dernier : plus c'est proche, plus c'est gros, rapide et
    // franc. Sans cet écart, les plans se lisent comme un seul motif plat.
    for (let rang = 2; rang < COUCHES.length; rang += 1) {
      const ici = COUCHES[rang];
      const avant = COUCHES[rang - 1];
      assert.ok(ici.rayon[1] > avant.rayon[1], `plan ${rang} pas plus gros`);
      assert.ok(ici.vitesse[0] > avant.vitesse[0], `plan ${rang} pas plus rapide`);
      assert.ok(ici.opacite > avant.opacite, `plan ${rang} pas plus franc`);
    }
  });

  it('gardent la brume à part : la plus large, la plus lente, la seule fondue', () => {
    // C'est elle qui remplit le vide entre les grains. Devenue étroite ou
    // rapide, elle cesserait d'être un fond et deviendrait un motif.
    //
    // Son opacité n'est pas comparable aux autres : c'est un sommet au centre
    // d'un dégradé, quand celle d'un point est une teinte plate. On demande
    // seulement qu'elle ne soit jamais plus marquée que la poussière du
    // premier plan — sans quoi ce serait elle qu'on regarderait.
    const [brume, ...poussiere] = COUCHES;
    assert.ok(brume.flou, 'la brume a repris un contour');
    const premierPlan = poussiere[poussiere.length - 1];
    assert.ok(brume.opacite <= premierPlan.opacite, 'la brume passe devant');
    for (const couche of poussiere) {
      assert.ok(brume.rayon[0] > couche.rayon[1], 'la brume n’est plus la plus large');
      assert.ok(brume.vitesse[1] < couche.vitesse[0], 'la brume n’est plus la plus lente');
      // Une tache large peinte d'une seule teinte se lit comme un rond posé
      // sur le fond ; un point de deux pixels n'a pas de bord à fondre, et le
      // dégradé y coûterait cher pour rien.
      assert.ok(!couche.flou, 'un dégradé par point coûte cher pour rien');
    }
  });

  it('en sèment assez pour faire un fond, pas assez pour le charger', () => {
    assert.equal(
      GRAINS.length,
      COUCHES.reduce((somme, couche) => somme + couche.combien, 0),
    );
    assert.ok(GRAINS.length >= 40, `seulement ${GRAINS.length} grains`);
    assert.ok(GRAINS.length <= 120, `${GRAINS.length} grains à redessiner par trame`);
  });

  it('les sèment toujours de la même façon', () => {
    // Un décor qui change de composition à chaque ouverture se remarque, et
    // une épreuve ne saurait rien dire d'un fond tiré au sort à chaque essai.
    assert.deepEqual(semer(7), semer(7));
    assert.notDeepEqual(semer(7), semer(8));
  });

  it('restent discrets', () => {
    // La poussière accompagne, elle ne se regarde pas : un grain franc
    // attirerait l'œil hors des jaquettes, qui sont le sujet.
    for (const grain of GRAINS) {
      assert.ok(grain.opacite > 0 && grain.opacite < 0.25, `grain à ${grain.opacite}`);
      assert.ok(grain.rayon > 0, 'grain sans taille');
    }
  });

  it('n’avancent jamais deux à la même allure', () => {
    // Deux grains de même vitesse gardent leur écart pour toujours : l'œil
    // finit par les lire comme une paire, et le fond se met à battre.
    const vitesses = GRAINS.map((grain) => grain.vitesse);
    assert.equal(new Set(vitesses).size, vitesses.length);
  });
});

describe('le mouvement d’un grain', () => {
  it('reste à l’écran, quel que soit le temps écoulé', () => {
    // Une fraction hors de [0, 1[ sortirait le grain du canevas : il
    // disparaîtrait pour de bon, et le fond se viderait à la longue.
    for (const grain of GRAINS) {
      for (let t = 0; t < 4000; t += 37.3) {
        const { x, y } = situer(grain, t);
        assert.ok(x >= 0 && x < 1, `x = ${x}`);
        assert.ok(y >= 0 && y < 1, `y = ${y}`);
      }
    }
  });

  it('bouge vraiment d’une seconde à l’autre', () => {
    for (const grain of GRAINS) {
      const avant = situer(grain, 0);
      const apres = situer(grain, 1);
      assert.notDeepEqual(avant, apres);
    }
  });

  it('monte, sans jamais redescendre', () => {
    // La poussière s'élève : un grain qui repart vers le bas se lit comme une
    // chute, et ce n'est pas le mouvement qu'on a voulu.
    for (const grain of GRAINS) {
      for (let t = 0; t < 120; t += 1) {
        const avant = situer(grain, t).y;
        const apres = situer(grain, t + 1).y;
        const monte = apres < avant || avant - apres < -0.5;
        assert.ok(monte, `grain redescendu de ${avant} à ${apres}`);
      }
    }
  });

  it('avance doucement, sans saut visible', () => {
    // Plus d'un centième d'écran par trame se voit sauter. À soixante trames
    // par seconde, une trame dure un soixantième de seconde.
    for (const grain of GRAINS) {
      for (let t = 0; t < 90; t += 1 / 60) {
        const avant = situer(grain, t);
        const apres = situer(grain, t + 1 / 60);
        assert.ok(ecart(avant.x, apres.x) < 0.01, 'saut de côté');
        assert.ok(ecart(avant.y, apres.y) < 0.01, 'saut vers le haut');
      }
    }
  });
});

describe('la peinture du fond', () => {
  /** Un canevas de comptoir : on note ce qu'on lui demande, sans rien peindre. */
  function canevas() {
    const appels: string[] = [];
    const ctx = {
      clearRect: () => appels.push('efface'),
      beginPath: () => appels.push('debut'),
      arc: () => appels.push('rond'),
      fill: () => appels.push('remplit'),
      createRadialGradient: () => {
        appels.push('fondu');
        return { addColorStop: () => {} };
      },
      fillStyle: '' as unknown,
    };
    return { ctx, appels };
  }

  it('efface avant de peindre, et pose au moins un grain par grain', () => {
    // Sans l'effacement, les trames s'empilent et le fond devient opaque en
    // quelques secondes.
    const { ctx, appels } = canevas();
    dessiner(ctx as unknown as CanvasRenderingContext2D, 900, 600, 12, '255, 255, 255');

    assert.equal(appels[0], 'efface');
    assert.ok(appels.filter((appel) => appel === 'rond').length >= GRAINS.length);
    // Et les taches de brume passent bien par un dégradé.
    assert.ok(appels.filter((appel) => appel === 'fondu').length >= COUCHES[0].combien);
  });

  it('repeint de l’autre côté le grain à cheval sur un bord', () => {
    // Sans ce doublon, une tache de brume large de soixante pixels s'efface
    // d'un coup au bord de l'écran.
    const total = (secondes: number) => {
      const { ctx, appels } = canevas();
      dessiner(ctx as unknown as CanvasRenderingContext2D, 900, 600, secondes, '0, 0, 0');
      return appels.filter((appel) => appel === 'rond').length;
    };
    // Sur deux minutes, tous les grains traversent un bord au moins une fois.
    let double = 0;
    for (let t = 0; t < 120; t += 1) if (total(t) > GRAINS.length) double += 1;
    assert.ok(double > 0, 'aucun grain n’a jamais été peint des deux côtés');
  });

  it('survit à une fenêtre réduite à rien', () => {
    // Une fenêtre repliée donne une hauteur nulle ; ce n'est pas une raison
    // pour lever une exception dans la boucle d'affichage.
    const { ctx } = canevas();
    assert.doesNotThrow(() =>
      dessiner(ctx as unknown as CanvasRenderingContext2D, 0, 0, 3, '0, 0, 0'),
    );
  });
});
