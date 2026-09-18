//! À qui l'on doit chaque émulateur.
//!
//! EvaChi n'écrit aucun émulateur. Elle en héberge : des cœurs libretro, qu'elle
//! va chercher sur la forge du projet à la demande, et des programmes autonomes
//! qu'elle télécharge chez leurs auteurs. Pas une ligne de leur code n'est
//! recopiée ici, et pas un octet n'est redistribué — mais leur travail est
//! partout dans ce que l'application donne à voir, et il doit se voir aussi.
//!
//! Ce tableau n'est pas écrit de mémoire. Chaque ligne est relevée dans le
//! fichier `.info` que le projet libretro publie pour ce cœur : le nom qu'il se
//! donne, les personnes qu'il crédite, la licence qu'il annonce. Leur
//! déclaration fait foi, pas notre souvenir.
//!
//! Les émulateurs autonomes, eux, portent déjà leur licence dans
//! [`crate::emulators`] : on ne la recopie pas ici, on l'y lit.
//!
//! Écrit par `outils/credits.mjs`. Ne pas modifier à la main.

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

/// Les cœurs libretro, relevés dans les fichiers `.info` du projet.
pub const COEURS: &[Credit] = &[
    Credit {
        id: "atari800_libretro",
        nom: "Atari800",
        auteurs: "Petr Stehlik",
        licence: "GPLv2",
        systeme: "Atari 800 · 5200",
        propose: true,
    },
    Credit {
        id: "azahar_libretro",
        nom: "Azahar",
        auteurs: "Azahar Emulator",
        licence: "GPLv2+",
        systeme: "Nintendo 3DS",
        propose: true,
    },
    Credit {
        id: "mednafen_lynx_libretro",
        nom: "Beetle Lynx",
        auteurs: "K. Wilkins|Mednafen Team",
        licence: "Zlib|GPLv2",
        systeme: "Atari Lynx",
        propose: true,
    },
    Credit {
        id: "mednafen_ngp_libretro",
        nom: "Beetle NeoPop",
        auteurs: "neopop_uk|Mednafen Team",
        licence: "GPLv2",
        systeme: "Neo Geo Pocket",
        propose: true,
    },
    Credit {
        id: "mednafen_pce_fast_libretro",
        nom: "Beetle PCE Fast",
        auteurs: "Mednafen Team",
        licence: "GPLv2",
        systeme: "PC Engine · TurboGrafx",
        propose: true,
    },
    Credit {
        id: "mednafen_saturn_libretro",
        nom: "Beetle Saturn",
        auteurs: "Mednafen Team",
        licence: "GPLv2",
        systeme: "Saturn",
        propose: true,
    },
    Credit {
        id: "mednafen_vb_libretro",
        nom: "Beetle VB",
        auteurs: "Mednafen Team",
        licence: "GPLv2",
        systeme: "Virtual Boy",
        propose: true,
    },
    Credit {
        id: "mednafen_wswan_libretro",
        nom: "Beetle WonderSwan",
        auteurs: "Dox|Mednafen Team",
        licence: "GPLv2",
        systeme: "WonderSwan",
        propose: true,
    },
    Credit {
        id: "bluemsx_libretro",
        nom: "blueMSX",
        auteurs: "Daniel Vik",
        licence: "GPLv2",
        systeme: "MSX · ColecoVision",
        propose: true,
    },
    Credit {
        id: "cap32_libretro",
        nom: "Caprice32",
        auteurs: "Ulrich Doewich|dantoine",
        licence: "GPLv2",
        systeme: "Amstrad CPC",
        propose: true,
    },
    Credit {
        id: "citra_libretro",
        nom: "Citra",
        auteurs: "Citra Emulation Project",
        licence: "GPLv2+",
        systeme: "3DS",
        propose: false,
    },
    Credit {
        id: "citra2018_libretro",
        nom: "Citra 2018",
        auteurs: "Citra Emulation Project",
        licence: "GPLv2+",
        systeme: "3DS",
        propose: false,
    },
    Credit {
        id: "dolphin_libretro",
        nom: "Dolphin",
        auteurs: "Team Dolphin",
        licence: "GPLv2+",
        systeme: "GameCube · Wii",
        propose: true,
    },
    Credit {
        id: "dosbox_pure_libretro",
        nom: "DOSBox-pure",
        auteurs: "DOSBox Team|Psyraven",
        licence: "GPLv2",
        systeme: "MS-DOS",
        propose: true,
    },
    Credit {
        id: "fbneo_libretro",
        nom: "FinalBurn Neo",
        auteurs: "Team FBNeo",
        licence: "Non-commercial",
        systeme: "Arcade",
        propose: true,
    },
    Credit {
        id: "flycast_libretro",
        nom: "Flycast",
        auteurs: "flyinghead",
        licence: "GPLv2",
        systeme: "Dreamcast",
        propose: true,
    },
    Credit {
        id: "freeintv_libretro",
        nom: "FreeIntv",
        auteurs: "David Richardson",
        licence: "GPLv2+",
        systeme: "Intellivision",
        propose: true,
    },
    Credit {
        id: "fuse_libretro",
        nom: "Fuse",
        auteurs: "Team Fuse",
        licence: "GPLv3",
        systeme: "ZX Spectrum",
        propose: true,
    },
    Credit {
        id: "gambatte_libretro",
        nom: "Gambatte",
        auteurs: "Sinamas",
        licence: "GPLv2",
        systeme: "Game Boy/Game Boy Color",
        propose: false,
    },
    Credit {
        id: "genesis_plus_gx_libretro",
        nom: "Genesis Plus GX",
        auteurs: "Charles McDonald|Eke-Eke",
        licence: "Non-commercial",
        systeme: "Mega Drive · Master System · Game Gear · Mega-CD",
        propose: true,
    },
    Credit {
        id: "gw_libretro",
        nom: "GW",
        auteurs: "Andre Leiradella",
        licence: "zlib",
        systeme: "Game & Watch",
        propose: true,
    },
    Credit {
        id: "pcsx2_libretro",
        nom: "LRPS2",
        auteurs: "PCSX2 Team",
        licence: "GPL",
        systeme: "Sony PlayStation 2",
        propose: false,
    },
    Credit {
        id: "melonds_libretro",
        nom: "melonDS",
        auteurs: "Arisotura",
        licence: "GPLv3",
        systeme: "Nintendo DS",
        propose: true,
    },
    Credit {
        id: "mesen_libretro",
        nom: "Mesen",
        auteurs: "M. Bibaud (aka Sour)",
        licence: "GPLv3",
        systeme: "Nintendo NES",
        propose: true,
    },
    Credit {
        id: "mgba_libretro",
        nom: "mGBA",
        auteurs: "endrift",
        licence: "MPLv2.0",
        systeme: "Game Boy Advance",
        propose: true,
    },
    Credit {
        id: "mupen64plus_next_libretro",
        nom: "Mupen64Plus-Next",
        auteurs: "m4xw|Hacktarux|gonetz|GLideN64 Contributors|Mupen64Plus Team",
        licence: "GPLv2",
        systeme: "Nintendo 64",
        propose: true,
    },
    Credit {
        id: "np2kai_libretro",
        nom: "Neko Project II Kai",
        auteurs: "Neko Project II Team, Tomohiro Yoshidomi",
        licence: "MIT",
        systeme: "PC-98",
        propose: true,
    },
    Credit {
        id: "opera_libretro",
        nom: "Opera",
        auteurs: "trapexit|JohnnyDude|FreeDO team",
        licence: "LGPL/Non-commercial",
        systeme: "3DO",
        propose: true,
    },
    Credit {
        id: "picodrive_libretro",
        nom: "PicoDrive",
        auteurs: "notaz|fdave|irixxxx",
        licence: "MAME",
        systeme: "Sega 32X",
        propose: true,
    },
    Credit {
        id: "ppsspp_libretro",
        nom: "PPSSPP",
        auteurs: "Henrik Hrydgard",
        licence: "GPLv2",
        systeme: "PSP",
        propose: true,
    },
    Credit {
        id: "prosystem_libretro",
        nom: "ProSystem",
        auteurs: "Greg Stanton|Brian Berlin|Leonis|Greg DeMent",
        licence: "GPLv2",
        systeme: "Atari 7800",
        propose: true,
    },
    Credit {
        id: "puae_libretro",
        nom: "PUAE",
        auteurs: "UAE Team",
        licence: "GPLv2",
        systeme: "Amiga",
        propose: true,
    },
    Credit {
        id: "px68k_libretro",
        nom: "PX68k",
        auteurs: "hissorii",
        licence: "Custom Non-Commercial",
        systeme: "Sharp X68000",
        propose: true,
    },
    Credit {
        id: "same_cdi_libretro",
        nom: "SAME CDi (Git)",
        auteurs: "MAMEdev",
        licence: "GPLv2+",
        systeme: "CD-i",
        propose: false,
    },
    Credit {
        id: "sameboy_libretro",
        nom: "SameBoy",
        auteurs: "LIJI32",
        licence: "MIT",
        systeme: "Game Boy · Game Boy Color",
        propose: true,
    },
    Credit {
        id: "scummvm_libretro",
        nom: "ScummVM",
        auteurs: "SCUMMVMdev",
        licence: "GPLv3",
        systeme: "Point & click",
        propose: true,
    },
    Credit {
        id: "snes9x_libretro",
        nom: "Snes9x",
        auteurs: "Snes9x Team",
        licence: "Non-commercial",
        systeme: "Super Nintendo",
        propose: true,
    },
    Credit {
        id: "stella_libretro",
        nom: "Stella",
        auteurs: "Stephen Anthony|Bradford Mott|Eckhard Stolberg|Brian Watson",
        licence: "GPLv2",
        systeme: "Atari 2600",
        propose: true,
    },
    Credit {
        id: "stella2014_libretro",
        nom: "Stella 2014",
        auteurs: "Stephen Anthony|Bradford Mott|Eckhard Stolberg|Brian Watson",
        licence: "GPLv2",
        systeme: "Atari 2600",
        propose: true,
    },
    Credit {
        id: "swanstation_libretro",
        nom: "SwanStation",
        auteurs: "stenzek",
        licence: "GPLv3",
        systeme: "PlayStation",
        propose: true,
    },
    Credit {
        id: "theodore_libretro",
        nom: "theodore",
        auteurs: "T. Lorblanches",
        licence: "GPLv3",
        systeme: "Thomson MO5 · TO7",
        propose: true,
    },
    Credit {
        id: "vecx_libretro",
        nom: "vecx",
        auteurs: "Valavan Manohararajah|John Hawthorn|Nikita Zimin|Demeth",
        licence: "GPLv3",
        systeme: "Vectrex",
        propose: true,
    },
    Credit {
        id: "vice_x64_libretro",
        nom: "VICE x64",
        auteurs: "VICE Team",
        licence: "GPLv2",
        systeme: "Commodore 64",
        propose: true,
    },
    Credit {
        id: "virtualjaguar_libretro",
        nom: "Virtual Jaguar",
        auteurs: "Joseph Mattiello|David Raingeard|Shamus",
        licence: "GPLv3",
        systeme: "Atari Jaguar",
        propose: true,
    },
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
