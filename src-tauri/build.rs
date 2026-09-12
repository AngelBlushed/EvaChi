fn main() {
    // Le journal des cœurs réclame une fonction variadique C, que Rust stable
    // ne sait pas définir. Ces quelques lignes de C la fournissent ; sans
    // elles, les messages des cœurs arrivent sous forme de gabarits vides.
    println!("cargo:rerun-if-changed=src/libretro/journal.c");
    cc::Build::new()
        .file("src/libretro/journal.c")
        .compile("evachi_journal");

    tauri_build::build();
}
