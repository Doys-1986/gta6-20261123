# gta6-20261123

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Doys-1986/gta6-20261123/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Doys-1986/gta6-20261123/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Vice Harbor: Neon Streets is an original top-down 2D open-world crime game in vanilla JavaScript and canvas — no libraries, no build step, no network. You are Rafi "Rook" Vale, a courier working off a debt to the fixer Sol in the sun-soaked coastal city of Port Solana: six districts (Neon Marina, Downtown Core, Harbor Point and more) on a full road grid with traffic that follows lanes and brakes for obstacles, pedestrians who stroll the sidewalks and flee from danger, and cars you can steal and drive with arcade physics and handbrake drifts. Crimes — theft, collisions, gunfire — raise a five-star wanted level; Port Solana PD cruisers spawn, pursue and ram you, foot officers join at high heat, and breaking line of sight lets the stars decay, while getting surrounded fills the BUSTED meter and an empty health bar leaves you WASTED. A three-mission story chain (a courier pickup, a timed hot pickup, and a final confrontation and escape) plus repeatable taxi fares and package runs pay cash, all tracked on a HUD with health, armor, cash, weapon, wanted stars, a live minimap and a speedometer. Combat is fists or a mouse-aimed pistol with muzzle flash, tracers and screen shake; sound is synthesized live with WebAudio (engine hum, sirens, gunshots, crashes, jingles); progress — cash, story progress, position — saves to localStorage with Continue on the title screen. Source is split one job per file under game/js/: city, traffic, police, missions, render, sound and main.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

To play, serve the game/ folder with any static file server (for example `npx serve game`) and open index.html in desktop Chrome. Controls: WASD/arrows move and drive, E enters or exits a car, mouse aims, click punches or shoots, 1/2 switch fists/pistol, Space is the handbrake, T takes a taxi fare, J a package run, H or P pauses, M mutes.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
