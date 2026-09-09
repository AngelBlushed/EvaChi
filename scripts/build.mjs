/**
 * Assemble le frontend web dans `dist/`.
 *
 *   node scripts/build.mjs            construction unique
 *   node scripts/build.mjs --serve    reconstruction à chaud + serveur local
 */

import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const serve = process.argv.includes('--serve');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

/** Ressources statiques recopiées telles quelles à côté du bundle. */
const assets = [['src/web/index.html', 'index.html']];

function copyAssets() {
  for (const [from, to] of assets) {
    const source = join(root, from);
    if (!existsSync(source)) {
      console.warn(`  ! absent : ${from}`);
      continue;
    }
    copyFileSync(source, join(dist, to));
  }
}

/** Recopie les ressources à chaque reconstruction, pas seulement au démarrage. */
const copyOnRebuild = {
  name: 'copy-assets',
  setup(build) {
    build.onEnd((result) => {
      copyAssets();
      const failures = result.errors.length;
      console.log(failures ? `  ✗ ${failures} erreur(s)` : '  ✓ bundle à jour');
    });
  },
};

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [join(root, 'src/web/main.ts')],
  outfile: join(dist, 'main.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  minify: !serve,
  logLevel: 'warning',
  plugins: [copyOnRebuild],
};

if (serve) {
  const context = await esbuild.context(options);
  await context.watch();
  const server = await context.serve({ servedir: dist, port: 5173 });

  // esbuild a remplacé `host` par un tableau `hosts` ; on accepte les deux.
  // On affiche la boucle locale plutôt que l'adresse du réseau : c'est celle
  // qu'on veut cliquer, et elle ne change pas d'un jour à l'autre.
  const candidates = server.hosts ?? (server.host ? [server.host] : []);
  const loopback = candidates.find((name) => name === 'localhost' || name === '127.0.0.1');
  const host = loopback ?? 'localhost';

  console.log(`EvaChi en écoute sur http://${host}:${server.port}`);
} else {
  await esbuild.build(options);
}
