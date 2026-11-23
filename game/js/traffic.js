// traffic.js — civilian traffic AI and pedestrians for Port Solana.
// Traffic cars follow the road grid in right-hand lanes, pick a new
// direction at intersections and brake for obstacles ahead. Pedestrians
// stroll the sidewalks and flee from gunfire, crashes and fast cars.

import { CELL, ROAD_W, WORLD_W, WORLD_H, roadCenters, collideBuildings, makeRng } from './city.js';

export const CAR_COLORS = [
  '#c94f4f', '#4f7dc9', '#e0b83c', '#57b06a', '#e8e8ec', '#3a3f4a',
  '#c974b8', '#4fb8b0', '#e07f3c', '#7d6bd6', '#9aa5b1', '#b03a3a',
];
export const CAR_KINDS = ['sedan', 'taxi', 'hatch', 'van', 'sport'];

let carSeq = 1;
export function makeCar(x, y, angle, opts = {}) {
  const kind = opts.kind || CAR_KINDS[Math.floor(Math.random() * 3)];
  return {
    id: carSeq++,
    x, y, angle,
    speed: 0, steer: 0,
    w: kind === 'van' ? 52 : 46, l: kind === 'van' ? 26 : 22,
    color: opts.color || (kind === 'taxi' ? '#e0b83c' : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]),
    kind,
    health: 100,
    driver: opts.driver !== false,
    police: !!opts.police,
    traffic: !!opts.traffic,
    dead: false,
    smoke: 0,
  };
}

// Lane offset for right-hand traffic given a travel direction (radians).
export function laneTarget(car) {
  const LANE = ROAD_W / 4;
  const centers = roadCenters();
  const horizontal = Math.abs(Math.cos(car.angle)) > Math.abs(Math.sin(car.angle));
  if (horizontal) {
    const dir = Math.cos(car.angle) > 0 ? 1 : -1;
    let best = centers[0], bd = Infinity;
    for (const c of centers) { const d = Math.abs(car.y - (c + dir * LANE)); if (d < bd) { bd = d; best = c + dir * LANE; } }
    return { axis: 'y', value: best, horizontal: true };
  }
  const dir = Math.sin(car.angle) > 0 ? 1 : -1;
  let best = centers[0], bd = Infinity;
  for (const c of centers) { const d = Math.abs(car.x - (c - dir * LANE)); if (d < bd) { bd = d; best = c - dir * LANE; } }
  return { axis: 'x', value: best, horizontal: false };
}

function nearIntersection(x, y) {
  const mx = ((x % CELL) + CELL) % CELL;
  const my = ((y % CELL) + CELL) % CELL;
  return mx < ROAD_W + 6 && my < ROAD_W + 6;
}

export function spawnTraffic(city, count, rng) {
  const cars = [];
  const centers = roadCenters();
  let guard = 0;
  while (cars.length < count && guard++ < 400) {
    const horiz = rng() > 0.5;
    const c = centers[1 + Math.floor(rng() * 5)];
    const along = 200 + rng() * (WORLD_W - 400);
    const dir = rng() > 0.5 ? 1 : -1;
    const LANE = ROAD_W / 4;
    const x = horiz ? along : c - dir * LANE;
    const y = horiz ? c + dir * LANE : along;
    const angle = horiz ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (cars.some((o) => Math.hypot(o.x - x, o.y - y) < 130)) continue;
    const car = makeCar(x, y, angle, { traffic: true });
    car.speed = 120;
    cars.push(car);
  }
  // Parked cars from the city's spots.
  for (const s of city.parkedSpots) {
    const car = makeCar(s.x, s.y, s.angle, { driver: false });
    car.parked = true;
    cars.push(car);
  }
  return cars;
}

export function updateTrafficCar(car, dt, world) {
  if (car.parked || car.dead) return;
  const targetSpeed = 165;
  // Obstacle scan ahead: other cars, the player, pedestrians.
  const fx = car.x + Math.cos(car.angle) * 58;
  const fy = car.y + Math.sin(car.angle) * 58;
  let blocked = false;
  for (const o of world.cars) {
    if (o === car || o.dead) continue;
    if (Math.hypot(o.x - fx, o.y - fy) < 34) { blocked = true; break; }
  }
  if (!blocked && world.player) {
    const p = world.playerVehicle || world.player;
    if (Math.hypot(p.x - fx, p.y - fy) < 36) blocked = true;
  }
  if (!blocked) {
    for (const ped of world.peds) {
      if (!ped.dead && Math.hypot(ped.x - fx, ped.y - fy) < 26) { blocked = true; break; }
    }
  }
  car.speed = blocked
    ? Math.max(0, car.speed - 320 * dt)
    : Math.min(targetSpeed, car.speed + 140 * dt);

  // At an intersection, sometimes turn onto the crossing road.
  if (nearIntersection(car.x, car.y) && !car.turnCooldown) {
    if (Math.random() < 0.35) {
      car.angle += (Math.random() > 0.5 ? 1 : -1) * Math.PI / 2;
    }
    car.turnCooldown = 1.2;
  }
  car.turnCooldown = Math.max(0, (car.turnCooldown || 0) - dt);

  // Steer back to the lane centreline.
  const lane = laneTarget(car);
  const err = lane.horizontal ? lane.value - car.y : lane.value - car.x;
  const drift = lane.horizontal ? Math.sin(car.angle) : -Math.cos(car.angle);
  car.angle += (err * 0.004 - drift * 0.6) * dt * 3;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  collideBuildings(world.city.buildings, car, 24);
  car.x = Math.max(30, Math.min(WORLD_W - 30, car.x));
  car.y = Math.max(30, Math.min(WORLD_H - 30, car.y));
}

const PED_COLORS = ['#e8b04f', '#4fb8b0', '#e87fa0', '#8fd14f', '#b07fe8', '#f2f2f2', '#e07f3c', '#5a8fd6'];
export function spawnPeds(count, rng) {
  const peds = [];
  const centers = roadCenters();
  for (let i = 0; i < count; i++) {
    const horiz = rng() > 0.5;
    const c = centers[Math.floor(rng() * centers.length)];
    const along = 100 + rng() * (WORLD_W - 200);
    const side = rng() > 0.5 ? -1 : 1;
    const off = ROAD_W / 2 + 14;
    peds.push({
      x: horiz ? along : c + side * off,
      y: horiz ? c + side * off : along,
      angle: rng() * Math.PI * 2,
      speed: 0, baseSpeed: 42 + rng() * 30,
      color: PED_COLORS[i % PED_COLORS.length],
      health: 100, dead: false, flee: 0, panicX: 0, panicY: 0,
      walkPhase: rng() * 6, deadTimer: 0,
    });
  }
  return peds;
}

export function scarePeds(peds, x, y, radius) {
  for (const p of peds) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < radius) {
      p.flee = 2.2;
      p.panicX = p.x - x;
      p.panicY = p.y - y;
    }
  }
}

export function updatePed(ped, dt, world) {
  if (ped.dead) { ped.deadTimer += dt; return; }
  ped.walkPhase += dt * (ped.flee > 0 ? 14 : 7);
  let vx = 0, vy = 0;
  if (ped.flee > 0) {
    ped.flee -= dt;
    const d = Math.hypot(ped.panicX, ped.panicY) || 1;
    vx = (ped.panicX / d) * 165;
    vy = (ped.panicY / d) * 165;
    ped.angle = Math.atan2(vy, vx);
  } else {
    // Wander: mostly straight, gentle turns, stay near sidewalks.
    if (Math.random() < dt * 0.25) ped.angle += (Math.random() - 0.5) * 1.4;
    vx = Math.cos(ped.angle) * ped.baseSpeed;
    vy = Math.sin(ped.angle) * ped.baseSpeed;
  }
  const ox = ped.x, oy = ped.y;
  ped.x += vx * dt;
  ped.y += vy * dt;
  if (collideBuildings(world.city.buildings, ped, 9)) {
    ped.x = ox; ped.y = oy;
    ped.angle += Math.PI * 0.75;
  }
  ped.x = Math.max(10, Math.min(WORLD_W - 10, ped.x));
  ped.y = Math.max(10, Math.min(WORLD_H - 10, ped.y));
}
