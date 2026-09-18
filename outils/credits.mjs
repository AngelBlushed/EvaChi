// Écrit `src-tauri/src/credits.rs` : qui a écrit chaque cœur, et sous quelle
// licence.
//
// Le projet libretro publie ces métadonnées lui-même, un fichier `.info` par
// cœur. Les recopier de mémoire serait exactement ce qu'il ne faut pas faire
// quand on veut créditer : c'est leur déclaration qui fait foi, pas la nôtre.
//
//     node outils/credits.mjs
import fs from 'node:fs';

const RACINE = 'C:/Users/Eve/projets/EvaChi';
const SOURCE = 'https://raw.githubusercontent.com/libretro/libretro-super/master/dist/info';

/** Les cœurs qu'EvaChi propose d'installer, lus dans le catalogue lui-même. */
function catalogue() {
  const source = fs.readFileSync(`${RACINE}/src-tauri/src/install.rs`, 'utf8').replace(/\r\n/g, '\n');
  const debut = source.indexOf('const CATALOGUE');
  const bloc = source.slice(debut, source.indexOf('\n];', debut));
  return [...bloc.matchAll(/\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\)/g)].map((m) => ({
    id: m[1],
    etiquette: m[2],
    systeme: m[3],
  }));
}

/** Et ceux qui sont réellement posés sur cette machine. */
function installes() {
  const dossier = 'C:/Users/Eve/AppData/Roaming/app.evachi/cores';
  if (!fs.existsSync(dossier)) return [];
  return fs
    .readdirSync(dossier)
    .filter((n) => n.endsWith('_libretro.dll'))
    .map((n) => n.replace(/\.dll$/, ''));
}

/** Découpe un fichier `.info` en ses paires clé = "valeur". */
function lire(texte) {
  const champs = {};
  for (const ligne of texte.split('\n')) {
    const trouve = ligne.match(/^\s*(\w+)\s*=\s*"?([^"]*)"?\s*$/);
    if (trouve) champs[trouve[1]] = trouve[2].trim();
  }
  return champs;
}

const connus = new Map(catalogue().map((c) => [c.id, c]));
for (const id of installes()) if (!connus.has(id)) connus.set(id, { id, etiquette: '', systeme: '' });

const rendu = [];
const manquants = [];

for (const [id, fiche] of connus) {
  let champs = null;
  try {
    const reponse = await fetch(`${SOURCE}/${id}.info`);
    if (reponse.ok) champs = lire(await reponse.text());
  } catch {
    /* réseau : on le dira plus bas */
  }

  if (!champs || !champs.license) {
    manquants.push(id);
    continue;
  }

  rendu.push({
    id,
    nom: champs.corename || fiche.etiquette || id,
    auteurs: champs.authors || '',
    licence: champs.license,
    systeme: fiche.systeme || champs.systemname || '',
    auCatalogue: Boolean(fiche.etiquette),
  });
}

rendu.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
const coeurs = rendu;

const CIBLE = 'C:/Users/Eve/projets/EvaChi/src-tauri/src/credits.rs';

const guillemets = (texte) => JSON.stringify(texte ?? '');

const lignes = coeurs
  .map(
    (c) => `    Credit {
        id: ${guillemets(c.id)},
        nom: ${guillemets(c.nom)},
        auteurs: ${guillemets(c.auteurs)},
        licence: ${guillemets(c.licence)},
        systeme: ${guillemets(c.systeme)},
        propose: ${c.auCatalogue},
    },`,
  )
  .join('\n');

const source = `//! À qui l'on doit chaque émulateur.
//!
//! EvaChi n'écrit aucun émulateur. Elle en héberge : des cœurs libretro, qu'elle
//! va chercher sur la forge du projet à la demande, et des programmes autonomes
//! qu'elle télécharge chez leurs auteurs. Pas une ligne de leur code n'est
//! recopiée ici, et pas un octet n'est redistribué — mais leur travail est
//! partout dans ce que l'application donne à voir, et il doit se voir aussi.
//!
//! Ce tableau n'est pas écrit de mémoire. Chaque ligne est relevée dans le
//! fichier \`.info\` que le projet libretro publie pour ce cœur : le nom qu'il se
//! donne, les personnes qu'il crédite, la licence qu'il annonce. Leur
//! déclaration fait foi, pas notre souvenir.
//!
//! Les émulateurs autonomes, eux, portent déjà leur licence dans
//! [\`crate::emulators\`] : on ne la recopie pas ici, on l'y lit.
//!
//! Écrit par \`outils/credits.mjs\`. Ne pas modifier à la main.

use serde::Serialize;

/// Ce qu'on doit à un émulateur, et sous quelles conditions.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Credit {
    /// Identifiant du fichier sur le disque, sans extension.
    pub id: &'static str,
    /// Le nom que le projet se donne.
    pub nom: &'static str,
    /// Les auteurs qu'il crédite, séparés par des barres verticales comme dans
    /// le fichier d'origine.
    pub auteurs: &'static str,
    /// La licence qu'il annonce, écrite comme il l'écrit.
    pub licence: &'static str,
    pub systeme: &'static str,
    /// Vrai si EvaChi propose de l'installer ; faux s'il a été trouvé sur la
    /// machine sans figurer au catalogue.
    pub propose: bool,
}

/// Les cœurs libretro, relevés dans les fichiers \`.info\` du projet.
pub const COEURS: &[Credit] = &[
${lignes}
];

impl Credit {
    /// Vrai si la licence n'est pas une licence libre ordinaire.
    ///
    /// Sans conséquence pour EvaChi, qui ne redistribue rien : elle va chercher
    /// chaque cœur chez ses auteurs, à la demande. Mais qui reprendrait ce
    /// dossier pour en faire un produit doit le savoir, et l'application est le
    /// seul endroit où il le lira.
    pub fn restreint(&self) -> bool {
        let bas = self.licence.to_lowercase();
        bas.contains("non-commercial")
            || bas.contains("non commercial")
            || bas.contains("noncommercial")
            || bas == "mame"
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chaque_coeur_dit_son_nom_sa_licence_et_ses_auteurs() {
        // Un crédit incomplet ne crédite personne. Si un champ venait à manquer,
        // mieux vaut que l'épreuve le dise que l'écran l'avoue.
        for credit in COEURS {
            assert!(!credit.id.is_empty(), "un cœur sans identifiant");
            assert!(!credit.nom.is_empty(), "{} : sans nom", credit.id);
            assert!(!credit.licence.is_empty(), "{} : sans licence", credit.id);
            assert!(!credit.auteurs.is_empty(), "{} : sans auteurs", credit.id);
        }
    }

    #[test]
    fn tout_ce_que_le_catalogue_propose_est_credite() {
        // C'est la garantie qui compte : proposer d'installer un émulateur sans
        // savoir dire à qui on le doit, ce serait exactement ce qu'on veut
        // éviter.
        for offre in crate::install::catalogue() {
            assert!(
                COEURS.iter().any(|credit| credit.id == offre.name),
                "{} est proposé à l'installation mais n'est crédité nulle part",
                offre.name
            );
        }
    }

    #[test]
    fn les_licences_restrictives_se_reconnaissent() {
        // Tous les cœurs ne sont pas libres. Six d'entre eux portent une clause
        // non commerciale, et il faut pouvoir le dire à qui les installe.
        let restreints: Vec<&str> = COEURS
            .iter()
            .filter(|credit| credit.restreint())
            .map(|credit| credit.nom)
            .collect();
        assert!(
            restreints.len() >= 5,
            "les licences non commerciales ne sont plus reconnues : {restreints:?}"
        );
    }
}
`;

fs.writeFileSync(CIBLE, source, 'utf8');
console.log(`${coeurs.length} cœurs écrits dans ${CIBLE}`);

if (manquants.length) {
  console.log(`sans fiche chez libretro : ${manquants.join(', ')}`);
}
