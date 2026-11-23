// police.js — the Port Solana PD: wanted stars, police pursuit cars,
// foot officers at high heat, BUSTED pressure and wanted decay.
// Crimes are reported through addCrime(); the wanted level follows.

import { makeCar } from './traffic.js';
import { collideBuildings, WORLD_W, WORLD_H } from './city.js';

export const CRIME_POINTS = {
  theft: 34, hitCar: 16, hitPed: 55, shoot: 22, killPed: 90,
  hitPolice: 70, ramPolice: 45, resist: 10,
};

export class WantedSystem {
  constructor() {
    this.points = 0;      // 0..500; stars = ceil(points/100)
    this.stars = 0;
    this.hiddenTimer = 0; // seconds unseen by any officer
    this.bustMeter = 0;   // 0..1 while an officer is on top of the player
  }

  addCrime(kind, witnessed = true) {
    const pts = CRIME_POINTS[kind] || 10;
    this.points = Math.min(500, this.points + (witnessed ? pts : pts * 0.4));
    this.hiddenTimer = 0;
    this.stars = Math.ceil(this.points / 100);
  }

  // seen: any police unit currently has line-of-sight range on the player.
  update(dt, seen) {
    if (this.stars > 0) {
      if (seen) {
        this.hiddenTimer = 0;
      } else {
        this.hiddenTimer += dt;
        if (this.hiddenTimer > 4) {
          this.points = Math.max(0, this.points - dt * 9);
          this.stars = Math.ceil(this.points / 100);
          if (this.points === 0) this.bustMeter = 0;
        }
      }
    }
  }

  clear() {
    this.points = 0;
    this.stars = 0;
    this.bustMeter = 0;
    this.hiddenTimer = 0;
  }
}

export function desiredPolice(stars) {
  return [0, 2, 3, 5, 7, 9][Math.min(5, stars)] || 0;
}

export function spawnPoliceUnit(player, existing) {
  // Spawn off-screen on a road near the player, never on top of them.
  const ang = Math.random() * Math.PI * 2;
  const dist = 560 + Math.random() * 160;
  let x = Math.max(60, Math.min(WORLD_W - 60, player.x + Math.cos(ang) * dist));
  let y = Math.max(60, Math.min(WORLD_H - 60, player.y + Math.sin(ang) * dist));
  // Snap to the nearest road centre so the unit starts on tarmac.
  const CELL = 520, ROAD_W = 120;
  const snap = (v) => Math.round((v - ROAD_W / 2) / CELL) * CELL + ROAD_W / 2;
  if (Math.random() > 0.5) x = snap(x); else y = snap(y);
  if (existing.some((c) => Math.hypot(c.x - x, c.y - y) < 90)) return null;
  const car = makeCar(x, y, Math.atan2(player.y - y, player.x - x), {
    police: true, color: '#eef1f6', kind: 'sedan',
  });
  car.cop = true;
  return car;
}

export function updatePoliceCar(car, dt, world) {
  const target = world.playerVehicle || world.player;
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy) || 1;
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const stars = world.wanted.stars;
  const maxSpeed = 235 + stars * 22;
  // Ram/pit behaviour: aim slightly ahead of the target, full throttle
  // until close, then match speed and nudge.
  const closing = dist > 90;
  car.speed = Math.min(maxSpeed, car.speed + 260 * dt);
  if (!closing) car.speed = Math.min(car.speed, maxSpeed * 0.82);
  car.angle += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff * 3.2 * dt * 2));

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const hitWall = collideBuildings(world.city.buildings, car, 24);
  if (hitWall) car.speed *= 0.55;
  car.x = Math.max(30, Math.min(WORLD_W - 30, car.x));
  car.y = Math.max(30, Math.min(WORLD_H - 30, car.y));

  // Despawn far-away units so fresh ones can spawn closer.
  car.stale = dist > 1500;
  return dist;
}

// Foot officers: appear at 3+ stars, chase on foot, build the bust meter.
export function makeOfficer(x, y) {
  return {
    x, y, angle: 0, health: 100, dead: false, cop: true,
    color: '#2b3f66', walkPhase: Math.random() * 6, deadTimer: 0,
  };
}

export function updateOfficer(off, dt, world) {
  if (off.dead) { off.deadTimer += dt; return 9999; }
  const target = world.playerVehicle ? null : world.player;
  off.walkPhase += dt * 9;
  if (!target) return Math.hypot(off.x - world.player.x, off.y - world.player.y);
  const dx = target.x - off.x;
  const dy = target.y - off.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist > 14) {
    off.angle = Math.atan2(dy, dx);
    off.x += Math.cos(off.angle) * 118 * dt;
    off.y += Math.sin(off.angle) * 118 * dt;
    collideBuildings(world.city.buildings, off, 9);
  }
  off.stale = dist > 1300;
  return dist;
}
