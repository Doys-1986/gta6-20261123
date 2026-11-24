// city.js — Port Solana, the fictional coastal city where Vice Harbor:
// Neon Streets takes place. This module owns the map itself: the road
// grid, the six named districts, every building (with the collision
// geometry the rest of the game relies on), street props and the spots
// where parked cars appear. It holds data and pure geometry only —
// drawing lives in render.js and movement lives in main.js.

export const WORLD_W = 3640;
export const WORLD_H = 3640;
export const ROAD_W = 120;
export const CELL = 520; // 400 px of block face + 120 px of road

// Districts are laid out on a 2-by-3 grid over the world. The tint is
// used for subtle ground variation and the name is shown in the HUD.
export const DISTRICTS = [
  { name: 'Neon Marina', x: 0, y: 2600, w: 1820, h: 1040, tint: '#17455c' },
  { name: 'Old Solana', x: 1820, y: 2600, w: 1820, h: 1040, tint: '#46365c' },
  { name: 'Palm Heights', x: 0, y: 1300, w: 1820, h: 1300, tint: '#2c5c30' },
  { name: 'Downtown Core', x: 1820, y: 1300, w: 1820, h: 1300, tint: '#5c4620' },
  { name: 'Cinder Flats', x: 0, y: 0, w: 1820, h: 1300, tint: '#5c2a2a' },
  { name: 'Harbor Point', x: 1820, y: 0, w: 1820, h: 1300, tint: '#22405f' },
];

const ROOF_COLORS = [
  '#96754f', '#87658f', '#64909e', '#a3865f', '#77945f', '#9c6666',
  '#6b7fae', '#b09157', '#579483', '#8775ae', '#ae8757', '#66a08c',
];

const BLOCK_NAMES = [
  'Solana Suites', 'Marina Court', 'The Pelican', 'Cinder Works',
  'Palm Court', 'Harbor Exchange', 'Neon Lodge', 'Old Town Flats',
  'Vista Rooms', 'Dockside Storage', 'Coral House', 'The Lantern',
];

// A tiny deterministic generator (LCG) so every player gets the same
// city layout on every load — no Math.random in map generation.
export function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// World coordinates of the centre line of every road, west to east /
// north to south. There are seven roads each way around six blocks.
export function roadCenters() {
  const centers = [];
  for (let i = 0; i <= 6; i++) centers.push(i * CELL + ROAD_W / 2);
  return centers;
}

// True when a point sits on tarmac in either direction.
export function onRoad(x, y) {
  const mx = ((x % CELL) + CELL) % CELL;
  const my = ((y % CELL) + CELL) % CELL;
  return mx < ROAD_W || my < ROAD_W;
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return DISTRICTS[3]; // Downtown Core is the safe fallback
}

// Build the whole city from a seed. Returns buildings (solid rectangles
// with a colour, a floor count and an occasional sign name), props
// (streetlights, palms, hydrants — decorative, non-solid) and the
// parked-car spots traffic.js turns into stealable cars.
export function buildCity(seed = 20261124) {
  const rng = makeRng(seed);
  const buildings = [];
  const props = [];
  const parkedSpots = [];

  for (let bx = 0; bx < 6; bx++) {
    for (let by = 0; by < 6; by++) {
      const blockX = bx * CELL + ROAD_W;
      const blockY = by * CELL + ROAD_W;
      const face = CELL - ROAD_W; // 400

      // Most blocks are split into four buildings around an alley
      // cross. Roughly one block in seven is a plaza instead: a single
      // low building and open ground, which gives the city breathing
      // room and gives chases a shortcut on foot.
      const plaza = rng() < 0.14;
      if (plaza) {
        buildings.push({
          x: blockX + 90, y: blockY + 90, w: face - 180, h: face - 180,
          floors: 1,
          color: ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)],
          roof: 'plaza',
          name: 'Plaza Kiosk',
        });
      } else {
        for (let sx = 0; sx < 2; sx++) {
          for (let sy = 0; sy < 2; sy++) {
            const pad = 14;
            const w = face / 2 - pad * 1.5;
            const h = face / 2 - pad * 1.5;
            buildings.push({
              x: blockX + pad + sx * (face / 2),
              y: blockY + pad + sy * (face / 2),
              w, h,
              floors: 2 + Math.floor(rng() * 6),
              color: ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)],
              roof: rng() > 0.5 ? 'flat' : 'trim',
              name: rng() < 0.3 ? BLOCK_NAMES[Math.floor(rng() * BLOCK_NAMES.length)] : '',
            });
          }
        }
      }

      // Streetlights stand at all four corners of every block.
      const corners = [
        [blockX - 8, blockY - 8], [blockX + face + 8, blockY - 8],
        [blockX - 8, blockY + face + 8], [blockX + face + 8, blockY + face + 8],
      ];
      for (const [lx, ly] of corners) props.push({ x: lx, y: ly, kind: 'light' });
      // Palms shade the southern sidewalk; a hydrant guards the north.
      for (let p = 0; p < 3; p++) {
        props.push({ x: blockX + 40 + p * 150 + rng() * 40, y: blockY + face + 10, kind: 'palm' });
      }
      props.push({ x: blockX + 30 + rng() * 60, y: blockY - 10, kind: 'hydrant' });

      // Parked cars: one along the south road of most blocks, one along
      // the east road of many. They sit in the outer lane, angle set so
      // the car body lines up with the road it rests on.
      if (rng() > 0.25) {
        parkedSpots.push({
          x: blockX + 60 + rng() * 260, y: blockY + face + ROAD_W / 2 + 26,
          angle: 0, horizontal: true,
        });
      }
      if (rng() > 0.4) {
        parkedSpots.push({
          x: blockX + face + ROAD_W / 2 + 26, y: blockY + 60 + rng() * 260,
          angle: Math.PI / 2, horizontal: false,
        });
      }
    }
  }
  return { buildings, props, parkedSpots };
}

// Push a circle (entity e with radius r) out of every building it
// overlaps, then clamp it inside the world. Returns true if any
// building was touched — drivers use that to detect wall impacts.
export function collideBuildings(buildings, e, r) {
  let hit = false;
  for (const b of buildings) {
    const nearX = Math.max(b.x, Math.min(e.x, b.x + b.w));
    const nearY = Math.max(b.y, Math.min(e.y, b.y + b.h));
    const dx = e.x - nearX;
    const dy = e.y - nearY;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      e.x = nearX + (dx / d) * r;
      e.y = nearY + (dy / d) * r;
    } else {
      // The centre is inside the rectangle: leave by the nearest face.
      const exits = [
        { dist: e.x - b.x, apply: () => { e.x = b.x - r; } },
        { dist: b.x + b.w - e.x, apply: () => { e.x = b.x + b.w + r; } },
        { dist: e.y - b.y, apply: () => { e.y = b.y - r; } },
        { dist: b.y + b.h - e.y, apply: () => { e.y = b.y + b.h + r; } },
      ];
      exits.sort((a, b2) => a.dist - b2.dist);
      exits[0].apply();
    }
  }
  e.x = Math.max(r, Math.min(WORLD_W - r, e.x));
  e.y = Math.max(r, Math.min(WORLD_H - r, e.y));
  return hit;
}

export function pointInBuilding(buildings, x, y) {
  for (const b of buildings) {
    if (x > b.x - 4 && x < b.x + b.w + 4 && y > b.y - 4 && y < b.y + b.h + 4) return true;
  }
  return false;
}
