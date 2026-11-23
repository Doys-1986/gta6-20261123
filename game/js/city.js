// city.js — Port Solana: the original coastal city of Vice Harbor.
// Builds the road grid, districts, buildings (with collision), sidewalks,
// props and parked-car spots. Pure data + geometry helpers; no rendering.

export const WORLD_W = 3640;
export const WORLD_H = 3640;
export const ROAD_W = 120;
export const CELL = 520; // one block (400) + one road (120)

export const DISTRICTS = [
  { name: 'Neon Marina', x: 0, y: 2600, w: 1820, h: 1040, tint: '#123a4d' },
  { name: 'Old Solana', x: 1820, y: 2600, w: 1820, h: 1040, tint: '#3d2f4d' },
  { name: 'Palm Heights', x: 0, y: 1300, w: 1820, h: 1300, tint: '#274d2a' },
  { name: 'Downtown Core', x: 1820, y: 1300, w: 1820, h: 1300, tint: '#4d3a1a' },
  { name: 'Cinder Flats', x: 0, y: 0, w: 1820, h: 1300, tint: '#4d2323' },
  { name: 'Harbor Point', x: 1820, y: 0, w: 1820, h: 1300, tint: '#1d3350' },
];

const BUILDING_COLORS = [
  '#8a6f4d', '#7d5a80', '#5a7d8a', '#94785a', '#6b7d5a', '#8a5a5a',
  '#5f6f9e', '#a08454', '#4f7d74', '#7a6a9e', '#9e7a4f', '#5a8a7d',
];

// Deterministic PRNG so the city is the same on every load.
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function roadCenters() {
  const out = [];
  for (let i = 0; i <= 6; i++) out.push(i * CELL + ROAD_W / 2);
  return out;
}

// Is a point on a road (either direction)?
export function onRoad(x, y) {
  const mx = ((x % CELL) + CELL) % CELL;
  const my = ((y % CELL) + CELL) % CELL;
  return mx < ROAD_W || my < ROAD_W;
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return DISTRICTS[3];
}

export function buildCity(seed = 20261123) {
  const rng = makeRng(seed);
  const buildings = [];
  const props = []; // streetlights, palms, hydrants: {x,y,kind}
  const parkedSpots = [];

  for (let bx = 0; bx < 6; bx++) {
    for (let by = 0; by < 6; by++) {
      const ox = bx * CELL + ROAD_W;
      const oy = by * CELL + ROAD_W;
      const bw = CELL - ROAD_W; // 400
      // 2x2 sub-buildings per block with an alley cross.
      for (let sx = 0; sx < 2; sx++) {
        for (let sy = 0; sy < 2; sy++) {
          const pad = 14;
          const w = bw / 2 - pad * 1.5;
          const h = bw / 2 - pad * 1.5;
          const x = ox + pad + sx * (bw / 2);
          const y = oy + pad + sy * (bw / 2);
          const floors = 2 + Math.floor(rng() * 6);
          buildings.push({
            x, y, w, h, floors,
            color: BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)],
            roof: rng() > 0.5 ? 'flat' : 'trim',
            name: '',
          });
        }
      }
      // Streetlights at block corners, palms along the south sidewalk.
      props.push({ x: ox - 8, y: oy - 8, kind: 'light' });
      props.push({ x: ox + bw + 8, y: oy - 8, kind: 'light' });
      props.push({ x: ox - 8, y: oy + bw + 8, kind: 'light' });
      props.push({ x: ox + bw + 8, y: oy + bw + 8, kind: 'light' });
      for (let p = 0; p < 3; p++) {
        props.push({ x: ox + 40 + p * 150 + rng() * 40, y: oy + bw + 10, kind: 'palm' });
      }
      // Parked cars hug the east edge of each block's south road.
      if (rng() > 0.25) {
        parkedSpots.push({
          x: ox + 60 + rng() * 260, y: oy + bw + ROAD_W / 2 + 26,
          angle: 0, horizontal: true,
        });
      }
      if (rng() > 0.4) {
        parkedSpots.push({
          x: ox + bw + ROAD_W / 2 + 26, y: oy + 60 + rng() * 260,
          angle: Math.PI / 2, horizontal: false,
        });
      }
    }
  }
  return { buildings, props, parkedSpots };
}

// Circle vs building collision: push the circle out, return true if it hit.
export function collideBuildings(buildings, e, r) {
  let hit = false;
  for (const b of buildings) {
    const nx = Math.max(b.x, Math.min(e.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(e.y, b.y + b.h));
    const dx = e.x - nx;
    const dy = e.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        e.x = nx + (dx / d) * r;
        e.y = ny + (dy / d) * r;
      } else {
        // Centre inside the rect: push out along the smallest exit.
        const left = e.x - b.x, right = b.x + b.w - e.x;
        const top = e.y - b.y, bot = b.y + b.h - e.y;
        const m = Math.min(left, right, top, bot);
        if (m === left) e.x = b.x - r;
        else if (m === right) e.x = b.x + b.w + r;
        else if (m === top) e.y = b.y - r;
        else e.y = b.y + b.h + r;
      }
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
