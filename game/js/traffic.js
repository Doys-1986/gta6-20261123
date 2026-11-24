// traffic.js — the civilians of Port Solana. Traffic cars drive the
// road grid in right-hand lanes, choose a new direction at some
// intersections, and brake when something is in front of them — another
// car, a pedestrian, or the player. Pedestrians wander the sidewalks
// and scatter when danger comes close. The car factory here is shared:
// player-stealable parked cars and police cruisers are built by the
// same makeCar() with different flags.

import { CELL, ROAD_W, WORLD_W, WORLD_H, roadCenters, collideBuildings } from './city.js';

export const CAR_COLORS = [
  '#c94f4f', '#4f7dc9', '#e0b83c', '#57b06a', '#e8e8ec', '#3a3f4a',
  '#c974b8', '#4fb8b0', '#e07f3c', '#7d6bd6', '#9aa5b1', '#b03a3a',
];
export const CAR_KINDS = ['sedan', 'taxi', 'hatch', 'van', 'sport'];

let nextCarId = 1;

// A car is a plain object: position, heading, speed, a body size that
// depends on kind, health (100 = pristine, 0 = wrecked) and flags for
// who is driving it — a civilian (traffic), nobody (parked), the police
// (police) or the player (set from main.js via player.inVehicle).
export function makeCar(x, y, angle, opts = {}) {
  const kind = opts.kind || CAR_KINDS[Math.floor(Math.random() * 3)];
  const isVan = kind === 'van';
  return {
    id: nextCarId++,
    x, y, angle,
    speed: 0, steer: 0,
    w: isVan ? 52 : 46,
    l: isVan ? 26 : 22,
    color: opts.color || (kind === 'taxi' ? '#e0b83c' : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]),
    kind,
    health: 100,
    driver: opts.driver !== false,
    police: !!opts.police,
    traffic: !!opts.traffic,
    parked: false,
    stolen: false,
    dead: false,
    turnCooldown: 0,
    brake: false, // brake lights, read by render.js
  };
}

// Where this car wants to be laterally: the centre of its right-hand
// lane on the road it is travelling. Returns which axis to correct on.
export function laneTarget(car) {
  const LANE = ROAD_W / 4;
  const centers = roadCenters();
  const horizontal = Math.abs(Math.cos(car.angle)) > Math.abs(Math.sin(car.angle));
  const nearest = (value) => {
    let best = centers[0];
    let bestDist = Infinity;
    for (const c of centers) {
      const d = Math.abs(value - c);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  };
  if (horizontal) {
    const dir = Math.cos(car.angle) > 0 ? 1 : -1;
    return { axis: 'y', value: nearest(car.y) + dir * LANE, horizontal: true };
  }
  const dir = Math.sin(car.angle) > 0 ? 1 : -1;
  return { axis: 'x', value: nearest(car.x) - dir * LANE, horizontal: false };
}

function nearIntersection(x, y) {
  const mx = ((x % CELL) + CELL) % CELL;
  const my = ((y % CELL) + CELL) % CELL;
  return mx < ROAD_W + 6 && my < ROAD_W + 6;
}

// Seed the world: `count` moving traffic cars spread over the inner
// roads, plus one parked car per spot the city provided.
export function spawnTraffic(city, count, rng) {
  const cars = [];
  const centers = roadCenters();
  let guard = 0;
  while (cars.length < count && guard++ < 400) {
    const horiz = rng() > 0.5;
    const road = centers[1 + Math.floor(rng() * 5)];
    const along = 200 + rng() * (WORLD_W - 400);
    const dir = rng() > 0.5 ? 1 : -1;
    const LANE = ROAD_W / 4;
    const x = horiz ? along : road - dir * LANE;
    const y = horiz ? road + dir * LANE : along;
    const angle = horiz ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (cars.some((o) => Math.hypot(o.x - x, o.y - y) < 130)) continue;
    const car = makeCar(x, y, angle, { traffic: true });
    car.speed = 120;
    cars.push(car);
  }
  for (const spot of city.parkedSpots) {
    const car = makeCar(spot.x, spot.y, spot.angle, { driver: false });
    car.parked = true;
    cars.push(car);
  }
  return cars;
}

// Advance one civilian car. It accelerates toward a calm cruising
// speed, brakes hard for anything in its sensor arc, occasionally turns
// at intersections, and constantly steers back toward its lane centre.
export function updateTrafficCar(car, dt, world) {
  if (car.parked || car.dead) return;
  const cruise = 165;
  const senseX = car.x + Math.cos(car.angle) * 58;
  const senseY = car.y + Math.sin(car.angle) * 58;
  let blocked = false;
  for (const other of world.cars) {
    if (other === car || other.dead) continue;
    if (Math.hypot(other.x - senseX, other.y - senseY) < 34) { blocked = true; break; }
  }
  if (!blocked && world.player) {
    const p = world.playerVehicle || world.player;
    if (Math.hypot(p.x - senseX, p.y - senseY) < 36) blocked = true;
  }
  if (!blocked) {
    for (const ped of world.peds) {
      if (!ped.dead && Math.hypot(ped.x - senseX, ped.y - senseY) < 26) { blocked = true; break; }
    }
  }
  car.brake = blocked;
  car.speed = blocked
    ? Math.max(0, car.speed - 320 * dt)
    : Math.min(cruise, car.speed + 140 * dt);

  car.turnCooldown = Math.max(0, (car.turnCooldown || 0) - dt);
  if (nearIntersection(car.x, car.y) && !car.turnCooldown) {
    if (Math.random() < 0.35) {
      car.angle += (Math.random() > 0.5 ? 1 : -1) * Math.PI / 2;
    }
    car.turnCooldown = 1.2;
  }

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

// --- Pedestrians ---------------------------------------------------------

const PED_COLORS = ['#e8b04f', '#4fb8b0', '#e87fa0', '#8fd14f', '#b07fe8', '#f2f2f2', '#e07f3c', '#5a8fd6'];

export function spawnPeds(count, rng) {
  const peds = [];
  const centers = roadCenters();
  for (let i = 0; i < count; i++) {
    const horiz = rng() > 0.5;
    const road = centers[Math.floor(rng() * centers.length)];
    const along = 100 + rng() * (WORLD_W - 200);
    const side = rng() > 0.5 ? -1 : 1;
    const off = ROAD_W / 2 + 14; // on the sidewalk, just off the road
    peds.push({
      x: horiz ? along : road + side * off,
      y: horiz ? road + side * off : along,
      angle: rng() * Math.PI * 2,
      speed: 0,
      baseSpeed: 42 + rng() * 30,
      color: PED_COLORS[i % PED_COLORS.length],
      health: 100,
      dead: false,
      flee: 0,
      panicX: 0,
      panicY: 0,
      walkPhase: rng() * 6,
      deadTimer: 0,
    });
  }
  return peds;
}

// Everyone within `radius` of a scary event runs directly away from it
// for a couple of seconds. Gunfire, crashes and near-misses call this.
export function scarePeds(peds, x, y, radius) {
  for (const p of peds) {
    if (p.dead) continue;
    if (Math.hypot(p.x - x, p.y - y) < radius) {
      p.flee = 2.2;
      p.panicX = p.x - x;
      p.panicY = p.y - y;
    }
  }
}

export function updatePed(ped, dt, world) {
  if (ped.dead) { ped.deadTimer += dt; return; }
  ped.walkPhase += dt * (ped.flee > 0 ? 14 : 7);
  let vx;
  let vy;
  if (ped.flee > 0) {
    ped.flee -= dt;
    const d = Math.hypot(ped.panicX, ped.panicY) || 1;
    vx = (ped.panicX / d) * 165;
    vy = (ped.panicY / d) * 165;
    ped.angle = Math.atan2(vy, vx);
  } else {
    if (Math.random() < dt * 0.25) ped.angle += (Math.random() - 0.5) * 1.4;
    vx = Math.cos(ped.angle) * ped.baseSpeed;
    vy = Math.sin(ped.angle) * ped.baseSpeed;
  }
  const prevX = ped.x;
  const prevY = ped.y;
  ped.x += vx * dt;
  ped.y += vy * dt;
  if (collideBuildings(world.city.buildings, ped, 9)) {
    ped.x = prevX;
    ped.y = prevY;
    ped.angle += Math.PI * 0.75; // turn away from the wall and keep walking
  }
  ped.x = Math.max(10, Math.min(WORLD_W - 10, ped.x));
  ped.y = Math.max(10, Math.min(WORLD_H - 10, ped.y));
}
