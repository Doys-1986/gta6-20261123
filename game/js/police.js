// police.js — the Port Solana Police Department. Crimes reported from
// main.js accumulate points in the WantedSystem; every 100 points is a
// star, up to five. Stars bring cruisers (and, from three stars, foot
// officers), and staying out of sight lets the heat cool back down.
// Cruisers pursue with a simple ram-and-match steering model; officers
// chase on foot and fill the BUSTED meter when they get close.

import { makeCar } from './traffic.js';
import { collideBuildings, WORLD_W, WORLD_H, CELL, ROAD_W } from './city.js';

// How much each witnessed offence is worth, in wanted points.
export const CRIME_POINTS = {
  theft: 34,
  hitCar: 16,
  hitPed: 55,
  shoot: 22,
  killPed: 90,
  hitPolice: 70,
  ramPolice: 45,
  resist: 10,
};

export class WantedSystem {
  constructor() {
    this.points = 0;       // 0..500
    this.stars = 0;        // ceil(points / 100)
    this.hiddenTimer = 0;  // seconds since any unit last saw the player
    this.bustMeter = 0;    // 0..1; full while cornered on foot = busted
  }

  addCrime(kind, witnessed = true) {
    const base = CRIME_POINTS[kind] || 10;
    // Unwitnessed crime still smells — it just smells less.
    this.points = Math.min(500, this.points + (witnessed ? base : base * 0.4));
    this.hiddenTimer = 0;
    this.stars = Math.ceil(this.points / 100);
  }

  update(dt, seen) {
    if (this.stars <= 0) return;
    if (seen) {
      this.hiddenTimer = 0;
      return;
    }
    this.hiddenTimer += dt;
    // Four seconds fully hidden, then the points bleed away.
    if (this.hiddenTimer > 4) {
      this.points = Math.max(0, this.points - dt * 9);
      this.stars = Math.ceil(this.points / 100);
      if (this.points === 0) this.bustMeter = 0;
    }
  }

  clear() {
    this.points = 0;
    this.stars = 0;
    this.bustMeter = 0;
    this.hiddenTimer = 0;
  }
}

// How many cruisers the department fields at each star level.
export function desiredPolice(stars) {
  const table = [0, 2, 3, 5, 7, 9];
  return table[Math.max(0, Math.min(5, stars))] || 0;
}

// Create a cruiser on a road, off-screen and not on top of the player
// or another car. Returns null when the chosen spot is crowded, in
// which case the caller simply tries again next frame.
export function spawnPoliceUnit(player, existing) {
  const ang = Math.random() * Math.PI * 2;
  const dist = 560 + Math.random() * 160;
  let x = Math.max(60, Math.min(WORLD_W - 60, player.x + Math.cos(ang) * dist));
  let y = Math.max(60, Math.min(WORLD_H - 60, player.y + Math.sin(ang) * dist));
  const snapToRoad = (v) => Math.round((v - ROAD_W / 2) / CELL) * CELL + ROAD_W / 2;
  if (Math.random() > 0.5) x = snapToRoad(x); else y = snapToRoad(y);
  if (existing.some((c) => Math.hypot(c.x - x, c.y - y) < 90)) return null;
  const car = makeCar(x, y, Math.atan2(player.y - y, player.x - x), {
    police: true, color: '#eef1f6', kind: 'sedan',
  });
  car.cop = true;
  return car;
}

// Steer one cruiser at the player's current vehicle (or the player on
// foot). From a distance it charges at full speed, aiming a touch ahead
// of the target; up close it matches pace and nudges. Returns the
// distance to the target so the caller can judge line of sight.
export function updatePoliceCar(car, dt, world) {
  const target = world.playerVehicle || world.player;
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy) || 1;

  let diff = Math.atan2(dy, dx) - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const maxSpeed = 235 + world.wanted.stars * 22;
  car.speed = Math.min(maxSpeed, car.speed + 260 * dt);
  if (dist <= 90) car.speed = Math.min(car.speed, maxSpeed * 0.82);
  const turn = Math.max(-2.6 * dt, Math.min(2.6 * dt, diff * 3.2 * dt * 2));
  car.angle += turn;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (collideBuildings(world.city.buildings, car, 24)) car.speed *= 0.55;
  car.x = Math.max(30, Math.min(WORLD_W - 30, car.x));
  car.y = Math.max(30, Math.min(WORLD_H - 30, car.y));

  car.stale = dist > 1500; // too far behind: main.js retires it
  return dist;
}

// --- Foot officers ---------------------------------------------------------

export function makeOfficer(x, y) {
  return {
    x, y,
    angle: 0,
    health: 100,
    dead: false,
    cop: true,
    color: '#2b3f66',
    walkPhase: Math.random() * 6,
    deadTimer: 0,
    stale: false,
  };
}

// Officers only chase a player who is on foot — against a car they hold
// position and let the cruisers work. Returns distance to the player.
export function updateOfficer(off, dt, world) {
  if (off.dead) { off.deadTimer += dt; return 9999; }
  const distToPlayer = Math.hypot(off.x - world.player.x, off.y - world.player.y);
  off.stale = distToPlayer > 1300;
  if (world.playerVehicle) return distToPlayer;
  off.walkPhase += dt * 9;
  const dx = world.player.x - off.x;
  const dy = world.player.y - off.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist > 14) {
    off.angle = Math.atan2(dy, dx);
    off.x += Math.cos(off.angle) * 118 * dt;
    off.y += Math.sin(off.angle) * 118 * dt;
    collideBuildings(world.city.buildings, off, 9);
  }
  return dist;
}
