# gta6-20261123

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Doys-1986/gta6-20261123/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Doys-1986/gta6-20261123/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Vice Harbor: Neon Streets** is an original top-down 2D open-world crime game written in vanilla JavaScript and canvas — no libraries, no build step, no network requests, and nothing borrowed from anyone else's game. You play Rafi "Rook" Vale, a courier working off a debt to the fixer Marisol "Sol" Quintero in Port Solana, a sun-soaked coastal city of six named districts — Neon Marina, Downtown Core, Harbor Point, Palm Heights, Cinder Flats and Old Solana — laid out on a full road grid with well over a hundred buildings (all solid, all with collision), sidewalks, crosswalks, palms, hydrants and streetlights.

**The city is alive.** Traffic cars follow right-hand lanes, turn at intersections and brake — brake lights on — for cars, pedestrians and you. Around four dozen pedestrians stroll the sidewalks and scatter from gunfire, crashes and near misses. Any parked or stopped car can be stolen with E: yank a driver out and witnesses will report you. Driving is arcade-style with a handbrake for drifting on Space, and cars take damage, smoke, and eventually wreck.

**Crime has consequences.** Theft, hit-and-runs, ramming and gunfire feed a five-star wanted system. Port Solana PD cruisers spawn, pursue and ram; foot officers join from three stars and open fire at four; cornering you on foot fills the BUSTED meter, an empty health bar leaves you WASTED, and either way you respawn at the clinic minus a fine. Break line of sight and stay hidden, and the stars cool off.

**There is a story to finish.** Sol's three-mission chain — a courier pickup and delivery, a timed hot pickup with a nervous passenger, and a final confrontation downtown followed by an escape to the pier — pays cash and is tracked with dialogue, objective text, world markers and minimap markers. After (and between) story beats, repeatable taxi fares (T) and package runs (J) keep the money coming. Combat is fists or a mouse-aimed pistol (1/2) with muzzle flash, tracers, hit sparks and screen shake.

**Presentation** is a full HUD — health and armor bars, cash, weapon, wanted stars, district name, objective and dialogue panels, mission banners, and a speedometer with vehicle damage while driving — plus a live north-up minimap showing police and objectives, a title screen, a pause/help overlay (P/H), and progress (cash, story progress, position) saved to localStorage with Continue on the title screen. All sound is synthesized live with WebAudio — engine hum that follows your speed, two-tone sirens, gunshots, crashes, pickups and jingles — with M to mute. There are no audio files.

## Source layout

One job per file under `game/js/`:

| File | Job |
|---|---|
| `city.js` | The map: road grid, districts, buildings + collision, props, parked-car spots |
| `traffic.js` | Lane-following traffic AI and wandering / fleeing pedestrians; the shared car factory |
| `police.js` | Wanted points and stars, pursuit cruisers, foot officers, BUSTED pressure, heat decay |
| `missions.js` | Sol's 3-mission story chain plus repeatable taxi and package side jobs |
| `render.js` | All canvas drawing: world, vehicles, people, effects, HUD, minimap, menus |
| `sound.js` | The WebAudio synth bank: engine, siren, gunshots, crashes, jingles |
| `main.js` | Game state and loop, walking, driving, combat, saving, and the `?shot=` screenshot hooks |

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

To play, serve the `game/` folder with any static file server (for example `npx serve game`) and open `index.html` in desktop Chrome. Controls: WASD/arrows move and drive, E or F enters or exits a car, the mouse aims, click punches or shoots, 1/2 switch fists/pistol, Space is the handbrake, Shift sprints on foot, T takes a taxi fare, J a package run, H or P pauses, M mutes.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
