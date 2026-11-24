// Vice Harbor: Neon Streets — the hand-in program for make.fun.
//
// Running this with Node 22 (standard library only, no build step)
// assembles the submission into the output directory: the static game
// from game/, the maker's screenshots from screenshots/, and a
// dossier.json produced by the kit's vendored buildDossier — the exact
// bytes the scorer will rebuild and compare against.
//
// Locally, MAKEFUN_OUTPUT_DIR stands in for the scorer's /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The game itself, copied as-is: it is plain HTML/CSS/JS and runs from
// any static host exactly as it sits in the repository.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });

// Screenshots are optional in the dossier format, but this entry ships
// four of them; copy whatever the repo holds.
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoRoot, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The caps below mirror the gate's own limits for this bounty — four
// screenshots of at most 256 KiB each, 993 game files, 48 MiB of game
// data — so a local run fails in exactly the place the sealed scorer
// would refuse the entry, never later and never silently.
const dossierBytes = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossierBytes);
