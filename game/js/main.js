// main.js — Vice Harbor: Neon Streets, the game itself. This module
// owns the live state (player, cars, pedestrians, police, bullets,
// effects), the fixed-step-friendly main loop, walking and arcade
// driving, mouse-aimed combat, the crime → wanted → pursuit pressure
// loop, mission bookkeeping, the localStorage save, and the ?shot=
// hooks the screenshot pipeline uses to stage real game states.
// Rendering lives in render.js; this file never draws directly.

import { buildCity, collideBuildings, makeRng, WORLD_W, WORLD_H } from './city.js';
import { SoundBank } from './sound.js';
import { spawnTraffic, spawnPeds, updateTrafficCar, updatePed, scarePeds, makeCar } from './traffic.js';
import { WantedSystem, desiredPolice, spawnPoliceUnit, updatePoliceCar, makeOfficer, updateOfficer } from './police.js';
import { STORY, MissionRunner } from './missions.js';
import { drawWorld, drawCar, drawPerson, drawEffects, drawHUD, drawTitleScreen, drawEndScreen, drawPause } from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

let W = 1280;
let H = 800;
function resize() {
  W = Math.min(window.innerWidth, 1600);
  H = Math.min(window.innerHeight, 1000);
  canvas.width = W;
  canvas.height = H;
}
window.addEventListener('resize', resize);
resize();

const SAVE_KEY = 'vice-harbor-neon-streets-save-v1';
const rng = makeRng(424242);

// The whole game state in one object. It is exposed as window.__game so
// the headless play-test (and curious players in devtools) can inspect
// exactly what the game thinks is happening.
const g = {
  state: 'title', // title | play | paused | busted | wasted
  time: 0,
  city: null,
  cars: [],
  peds: [],
  officers: [],
  bullets: [],
  effects: [],
  toasts: [],
  cam: { x: 0, y: 0 },
  player: null,
  wanted: new WantedSystem(),
  missions: new MissionRunner(),
  missionsDone: 0,
  storyIndex: 0,
  sound: new SoundBank(),
  muted: false,
  dialogue: '',
  dialogueTimer: 0,
  shake: 0,
  targetPed: null,
  hasSave: false,
  keys: {},
  mouse: { x: 0, y: 0, down: false },
  fireCooldown: 0,
  punchCooldown: 0,
};
window.__game = g;

function newPlayer() {
  return {
    x: 330, y: 2880, angle: -Math.PI / 2, walkPhase: 0,
    health: 100, armor: 50, cash: 120, weapon: 'pistol',
    color: '#e0483c', inVehicle: null, dead: false,
  };
}

// --- Saving ------------------------------------------------------------------

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGame() {
  if (!g.player) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: g.player.cash,
      missionsDone: g.missionsDone,
      storyIndex: g.storyIndex,
      x: Math.round(g.player.x),
      y: Math.round(g.player.y),
    }));
  } catch {
    // Storage can be unavailable (private mode, quotas) — the game
    // simply continues without persistence.
  }
}

// --- World setup ---------------------------------------------------------------

function toast(text) {
  g.toasts.push({ text, life: 2.6 });
}

function addEffect(kind, x, y, text) {
  g.effects.push({ kind, x, y, text, life: 1 });
}

function startWorld(fresh) {
  g.city = buildCity();
  const saved = fresh ? null : loadSave();
  g.player = newPlayer();
  if (saved) {
    g.player.cash = saved.cash ?? 120;
    g.missionsDone = saved.missionsDone ?? 0;
    g.storyIndex = saved.storyIndex ?? 0;
    g.player.x = saved.x ?? g.player.x;
    g.player.y = saved.y ?? g.player.y;
  } else {
    g.missionsDone = 0;
    g.storyIndex = 0;
  }
  g.cars = spawnTraffic(g.city, 16, rng);
  g.peds = spawnPeds(46, rng);
  g.officers = [];
  g.bullets = [];
  g.effects = [];
  g.toasts = [];
  g.wanted.clear();
  g.missions = new MissionRunner();
  g.targetPed = null;
  g.dialogue = '';
  g.dialogueTimer = 0;
  g.state = 'play';
  updateCamera(1);
  if (g.storyIndex < STORY.length) {
    offerStoryMission();
  } else {
    toast('Free roam — T for a taxi fare, J for a package run');
  }
}

function offerStoryMission() {
  const mission = STORY[g.storyIndex];
  if (!mission) return;
  g.dialogue = g.missions.start(mission);
  g.dialogueTimer = 9;
  g.sound.missionStart();
  // The final mission's target has to exist on the street before the
  // player can confront him, so spawn Dario Venn at his marker.
  if (mission.id === 'last-light') {
    const spot = mission.steps[0];
    g.targetPed = {
      x: spot.x, y: spot.y, angle: 2.4, walkPhase: 0, color: '#20242c',
      health: 100, dead: false, flee: 0, panicX: 0, panicY: 0,
      baseSpeed: 40, deadTimer: 0, isTarget: true,
    };
    g.peds.push(g.targetPed);
  }
}

// --- Cars: stealing, entering, leaving -----------------------------------------

function nearestCar(x, y, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const car of g.cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  return best;
}

// A crime counts as witnessed when a living pedestrian is close, a
// cruiser is closer, or an officer is closer still.
function witnessedAt(x, y, pedRange = 240) {
  return g.peds.some((pd) => !pd.dead && Math.hypot(pd.x - x, pd.y - y) < pedRange)
    || g.cars.some((c) => c.police && !c.dead && Math.hypot(c.x - x, c.y - y) < 400)
    || g.officers.some((o) => !o.dead && Math.hypot(o.x - x, o.y - y) < 300);
}

function reportCrime(kind, x, y) {
  const witnessed = witnessedAt(x, y, 260);
  g.wanted.addCrime(kind, witnessed);
  if (witnessed) g.wanted.hiddenTimer = 0;
}

function enterVehicle() {
  const p = g.player;
  const car = nearestCar(p.x, p.y, 58);
  if (!car) return;
  const witnessed = witnessedAt(p.x, p.y, 210);
  if (car.driver && !car.police) {
    // Yank the civilian driver out onto the pavement; they run off.
    g.peds.push({
      x: car.x + 20, y: car.y + 14, angle: 0, walkPhase: 0, color: '#8fd14f',
      health: 100, dead: false, flee: 2, panicX: 20, panicY: 10,
      baseSpeed: 45, deadTimer: 0,
    });
    car.driver = false;
  }
  const firstTheft = !car.stolen;
  car.parked = false;
  car.traffic = false;
  car.stolen = true;
  p.inVehicle = car;
  g.sound.door();
  if (!firstTheft || !witnessed) return;
  if (car.police) {
    g.wanted.addCrime('hitPolice', true);
    toast('You stole a police cruiser!');
  } else {
    g.wanted.addCrime('theft', true);
    toast('Witnessed: vehicle theft!');
  }
}

function exitVehicle() {
  const p = g.player;
  const car = p.inVehicle;
  if (!car) return;
  // Step out on the car's left side and push out of any building face.
  p.x = car.x - Math.sin(car.angle) * 30;
  p.y = car.y + Math.cos(car.angle) * 30;
  collideBuildings(g.city.buildings, p, 10);
  p.inVehicle = null;
  car.speed = 0;
  car.brake = false;
  g.sound.door();
  g.sound.engine(false);
}

// --- Damage, death, respawn ------------------------------------------------------

function damagePlayer(amount) {
  const p = g.player;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, amount * 0.6);
    p.armor -= absorbed;
    amount -= absorbed;
  }
  p.health -= amount;
  g.sound.hurt();
  g.shake = Math.min(10, g.shake + 3);
  if (p.health <= 0 && g.state === 'play') {
    p.health = 0;
    endRun('wasted');
  }
}

function hurtPerson(person, dmg, angle) {
  person.health -= dmg;
  person.flee = 2;
  person.panicX = Math.cos(angle) * 40;
  person.panicY = Math.sin(angle) * 40;
  addEffect('spark', person.x, person.y);
  if (person.health <= 0 && !person.dead) {
    person.dead = true;
    person.deadTimer = 0;
    reportCrime(person.cop ? 'hitPolice' : 'killPed', person.x, person.y);
    if (person.isTarget) toast('Target down!');
  } else if (person.health > 0) {
    reportCrime(person.cop ? 'hitPolice' : 'hitPed', person.x, person.y);
  }
}

function endRun(kind) {
  g.state = kind; // 'busted' | 'wasted'
  if (kind === 'busted') g.sound.busted(); else g.sound.wasted();
  g.sound.engine(false);
  g.sound.siren(false);
}

function respawn() {
  const fine = Math.min(g.player.cash, g.state === 'busted' ? 150 : 100);
  g.player.cash -= fine;
  g.player.health = 100;
  g.player.armor = 25;
  g.player.inVehicle = null;
  g.player.x = 2990;
  g.player.y = 2990;
  g.wanted.clear();
  g.cars = g.cars.filter((c) => !c.police);
  g.officers = [];
  g.state = 'play';
  toast(fine > 0 ? `Respawned at the Old Solana clinic — fee $${fine}` : 'Respawned at Old Solana');
  saveGame();
}

// --- Input -------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  g.keys[k] = true;
  g.sound.ensure();
  if (g.state === 'title') {
    if (k === 'enter') startWorld(false);
    if (k === 'n') {
      try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
      startWorld(true);
    }
    return;
  }
  if ((g.state === 'busted' || g.state === 'wasted') && k === 'enter') {
    respawn();
    return;
  }
  if (k === 'p' || k === 'escape' || k === 'h') {
    if (g.state === 'play') g.state = 'paused';
    else if (g.state === 'paused') g.state = 'play';
    return;
  }
  if (g.state !== 'play') return;
  if (k === 'e' || k === 'f') {
    if (g.player.inVehicle) exitVehicle(); else enterVehicle();
  }
  if (k === '1') g.player.weapon = 'fists';
  if (k === '2') g.player.weapon = 'pistol';
  if (k === 'm') {
    g.muted = !g.muted;
    g.sound.setMuted(g.muted);
  }
  if (k === 't' && !g.missions.sideJob && !g.player.inVehicle) {
    const job = g.missions.startSideJob('taxi', g.player);
    toast(`Taxi fare — $${job.reward} on delivery`);
    g.sound.missionStart();
  }
  if (k === 'j' && !g.missions.sideJob) {
    const job = g.missions.startSideJob('package', g.player);
    toast(`Package run — $${job.reward} on delivery`);
    g.sound.missionStart();
  }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { g.keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  g.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
  g.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});
canvas.addEventListener('mousedown', () => { g.mouse.down = true; g.sound.ensure(); });
window.addEventListener('mouseup', () => { g.mouse.down = false; });

// --- Combat --------------------------------------------------------------------------

function playerAttack(dt) {
  const p = g.player;
  g.fireCooldown -= dt;
  g.punchCooldown -= dt;
  if (p.inVehicle || !g.mouse.down) return;
  const aim = Math.atan2(g.cam.y + g.mouse.y - p.y, g.cam.x + g.mouse.x - p.x);
  p.angle = aim;
  if (p.weapon === 'pistol' && g.fireCooldown <= 0) {
    g.fireCooldown = 0.22;
    g.bullets.push({
      x: p.x + Math.cos(aim) * 16, y: p.y + Math.sin(aim) * 16,
      angle: aim, speed: 780, life: 0.55, fromPlayer: true,
    });
    addEffect('muzzle', p.x + Math.cos(aim) * 22, p.y + Math.sin(aim) * 22);
    g.sound.gunshot();
    g.shake = Math.min(8, g.shake + 1.2);
    scarePeds(g.peds, p.x, p.y, 300);
    reportCrime('shoot', p.x, p.y);
  }
  if (p.weapon === 'fists' && g.punchCooldown <= 0) {
    g.punchCooldown = 0.32;
    g.sound.melee();
    const reachX = p.x + Math.cos(aim) * 24;
    const reachY = p.y + Math.sin(aim) * 24;
    for (const person of [...g.peds, ...g.officers]) {
      if (person.dead) continue;
      if (Math.hypot(person.x - reachX, person.y - reachY) < 20) hurtPerson(person, 34, aim);
    }
  }
}

function updateBullets(dt) {
  for (const b of g.bullets) {
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    // Cars first: a round that hits a body panel goes no further.
    let stopped = false;
    for (const car of g.cars) {
      if (car.dead) continue;
      if (Math.hypot(car.x - b.x, car.y - b.y) < 26) {
        car.health -= 18;
        addEffect('spark', b.x, b.y);
        if (car.health <= 0) { car.dead = true; g.sound.crash(1); }
        if (car.police) reportCrime('hitPolice', b.x, b.y);
        b.life = 0;
        stopped = true;
        break;
      }
    }
    if (stopped) continue;
    const targets = b.fromPlayer ? [...g.peds, ...g.officers] : [g.player];
    for (const t of targets) {
      if (t.dead) continue;
      if (Math.hypot(t.x - b.x, t.y - b.y) < 12) {
        if (t === g.player) damagePlayer(7);
        else hurtPerson(t, 34, b.angle);
        b.life = 0;
        break;
      }
    }
  }
  g.bullets = g.bullets.filter((b) => b.life > 0);
}

// --- Driving ---------------------------------------------------------------------------

function updateDriving(dt) {
  const p = g.player;
  const car = p.inVehicle;
  const up = g.keys['w'] || g.keys['arrowup'];
  const down = g.keys['s'] || g.keys['arrowdown'];
  const left = g.keys['a'] || g.keys['arrowleft'];
  const right = g.keys['d'] || g.keys['arrowright'];
  const handbrake = g.keys[' '];
  const maxForward = 330;
  const maxReverse = -130;

  if (up) car.speed += (car.speed < 0 ? 420 : 250) * dt;   // brake, then go
  if (down) car.speed -= (car.speed > 0 ? 430 : 200) * dt; // brake, then reverse
  if (!up && !down) car.speed -= car.speed * (handbrake ? 2.4 : 0.7) * dt;
  car.speed = Math.max(maxReverse, Math.min(maxForward, car.speed));
  car.brake = !!(down || handbrake);

  const steerInput = (left ? -1 : 0) + (right ? 1 : 0);
  car.steer += (steerInput * 0.55 - car.steer) * Math.min(1, dt * 9);
  const speedRatio = Math.abs(car.speed) / maxForward;
  if (Math.abs(car.speed) > 4) {
    const grip = handbrake ? 0.55 : 1; // handbrake breaks the rear loose
    car.angle += car.steer * (car.speed > 0 ? 1 : -1) * (1.15 + speedRatio * 0.7) * grip * dt * 2.2;
  }

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const hitWall = collideBuildings(g.city.buildings, car, 24);
  if (hitWall) {
    if (Math.abs(car.speed) > 90) {
      car.health -= Math.abs(car.speed) * 0.05;
      p.health -= 2;
      g.sound.crash(Math.min(1, Math.abs(car.speed) / 300));
      g.shake = Math.min(10, g.shake + 4);
      addEffect('spark', car.x, car.y);
    }
    car.speed *= 0.45;
  }
  g.sound.engine(true, speedRatio);
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    exitVehicle();
    toast('Vehicle wrecked!');
    return;
  }
  collideWithCars(car);
  collideWithPeople(car);
}

function collideWithCars(car) {
  for (const other of g.cars) {
    if (other === car || other.dead) continue;
    const d = Math.hypot(other.x - car.x, other.y - car.y);
    if (d >= 44 || d === 0) continue;
    const push = (44 - d) / 2;
    const nx = (other.x - car.x) / d;
    const ny = (other.y - car.y) / d;
    other.x += nx * push; other.y += ny * push;
    car.x -= nx * push; car.y -= ny * push;
    if (Math.abs(car.speed) > 60) {
      other.health -= 12;
      car.health -= 6;
      g.sound.crash(0.7);
      addEffect('spark', (other.x + car.x) / 2, (other.y + car.y) / 2);
      reportCrime(other.police ? 'ramPolice' : 'hitCar', car.x, car.y);
      if (other.driver && !other.police) {
        // The other driver bails out and runs; their car stays put.
        other.traffic = false;
        other.parked = true;
        other.speed = 0;
        other.driver = false;
        g.peds.push({
          x: other.x + 22, y: other.y, angle: 0, walkPhase: 0, color: '#5a8fd6',
          health: 100, dead: false, flee: 2.4, panicX: nx * 30, panicY: ny * 30,
          baseSpeed: 45, deadTimer: 0,
        });
      }
    }
    car.speed *= 0.72;
  }
}

function collideWithPeople(car) {
  for (const person of [...g.peds, ...g.officers]) {
    if (person.dead) continue;
    const d = Math.hypot(person.x - car.x, person.y - car.y);
    if (d >= 26) continue;
    if (Math.abs(car.speed) > 45) {
      hurtPerson(person, Math.abs(car.speed) > 160 ? 100 : 55, car.angle);
      scarePeds(g.peds, car.x, car.y, 240);
      car.speed *= 0.8;
      g.shake = Math.min(10, g.shake + 3);
    } else {
      person.flee = 1;
      person.panicX = person.x - car.x;
      person.panicY = person.y - car.y;
    }
  }
}

// --- On foot ------------------------------------------------------------------------------

function updateOnFoot(dt) {
  const p = g.player;
  let mx = 0;
  let my = 0;
  if (g.keys['w'] || g.keys['arrowup']) my -= 1;
  if (g.keys['s'] || g.keys['arrowdown']) my += 1;
  if (g.keys['a'] || g.keys['arrowleft']) mx -= 1;
  if (g.keys['d'] || g.keys['arrowright']) mx += 1;
  const sprint = g.keys['shift'] ? 1.45 : 1;
  if (mx || my) {
    const len = Math.hypot(mx, my);
    const speed = 148 * sprint;
    p.x += (mx / len) * speed * dt;
    p.y += (my / len) * speed * dt;
    p.walkPhase += dt * (sprint > 1 ? 13 : 10);
    if (!g.mouse.down) p.angle = Math.atan2(my, mx);
    collideBuildings(g.city.buildings, p, 10);
  }
  // At four stars and up, nearby officers open fire on a player who is
  // on foot. Their aim is imperfect on purpose.
  for (const officer of g.officers) {
    if (officer.dead || g.wanted.stars < 4) continue;
    const d = Math.hypot(officer.x - p.x, officer.y - p.y);
    if (d < 230 && Math.random() < dt * 0.8) {
      const a = Math.atan2(p.y - officer.y, p.x - officer.x) + (Math.random() - 0.5) * 0.16;
      g.bullets.push({ x: officer.x, y: officer.y, angle: a, speed: 640, life: 0.5, fromPlayer: false });
      g.sound.gunshot();
    }
  }
}

// --- World update ---------------------------------------------------------------------------

function update(dt) {
  g.time += dt;
  const p = g.player;
  if (g.dialogueTimer > 0) g.dialogueTimer -= dt;

  if (p.inVehicle) updateDriving(dt);
  else { updateOnFoot(dt); playerAttack(dt); }
  updateBullets(dt);

  const world = {
    cars: g.cars, peds: g.peds, player: p,
    playerVehicle: p.inVehicle, city: g.city, wanted: g.wanted,
  };
  for (const car of g.cars) {
    if (car === p.inVehicle || car.dead) continue;
    if (car.police) updatePoliceCar(car, dt, world);
    else if (car.traffic) updateTrafficCar(car, dt, world);
  }
  for (const ped of g.peds) updatePed(ped, dt, world);
  g.peds = g.peds.filter((ped) => !ped.dead || ped.deadTimer < 14);

  updatePolicePressure(dt, world);
  replenishWorld(dt);
  updateMissions(dt);

  // Slow health regen keeps long free-roam sessions forgiving.
  if (p.health > 0 && p.health < 100) p.health = Math.min(100, p.health + dt * 1.1);
  for (const fx of g.effects) fx.life -= dt * (fx.kind === 'cash' ? 0.7 : 1.8);
  g.effects = g.effects.filter((fx) => fx.life > 0);
  for (const t of g.toasts) t.life -= dt;
  g.toasts = g.toasts.filter((t) => t.life > 0);
  g.shake = Math.max(0, g.shake - dt * 22);
  updateCamera(dt);
  if (Math.random() < dt * 0.2) saveGame();
}

// Spawn and retire police, track line of sight, and run the BUSTED
// meter: an on-foot player cornered by units for ~1.6 seconds is done.
function updatePolicePressure(dt, world) {
  const p = g.player;
  const liveCruisers = g.cars.filter((c) => c.police && !c.dead);
  if (liveCruisers.length < desiredPolice(g.wanted.stars)) {
    const unit = spawnPoliceUnit(p.inVehicle || p, g.cars);
    if (unit) g.cars.push(unit);
  }
  g.cars = g.cars.filter(
    (c) => !(c.police && (c.stale || c.dead) && Math.hypot(c.x - p.x, c.y - p.y) > 700),
  );

  if (g.wanted.stars >= 3) {
    const liveOfficers = g.officers.filter((o) => !o.dead).length;
    if (liveOfficers < g.wanted.stars - 1 && Math.random() < dt * 0.7) {
      const a = Math.random() * Math.PI * 2;
      g.officers.push(makeOfficer(p.x + Math.cos(a) * 420, p.y + Math.sin(a) * 420));
    }
  }

  let seen = false;
  let bustPressure = false;
  for (const car of g.cars) {
    if (!car.police || car.dead) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < 430) seen = true;
    if (!p.inVehicle && d < 65) bustPressure = true;
  }
  for (const officer of g.officers) {
    const d = updateOfficer(officer, dt, world);
    if (d < 430) seen = true;
    if (d < 30 && !p.inVehicle) bustPressure = true;
  }
  g.officers = g.officers.filter(
    (o) => !(o.stale && Math.hypot(o.x - p.x, o.y - p.y) > 900) && (!o.dead || o.deadTimer < 10),
  );

  g.wanted.update(dt, seen);
  if (g.wanted.stars === 0) g.wanted.bustMeter = 0;
  if (bustPressure && g.wanted.stars > 0) {
    g.wanted.bustMeter += dt / 1.6;
    if (g.wanted.bustMeter >= 1) { endRun('busted'); return; }
  } else {
    g.wanted.bustMeter = Math.max(0, g.wanted.bustMeter - dt * 0.8);
  }
  const anyCruiser = g.cars.some((c) => c.police && !c.dead);
  g.sound.siren(g.wanted.stars > 0 && anyCruiser);
}

// Keep the city feeling lived-in: traffic and pedestrians that were
// wrecked, arrested or scared off are quietly replaced far away.
function replenishWorld(dt) {
  const p = g.player;
  const trafficCount = g.cars.filter((c) => c.traffic && !c.dead).length;
  if (trafficCount < 13 && Math.random() < dt * 0.4) {
    const fresh = spawnTraffic(g.city, 1, rng).find((c) => c.traffic);
    if (fresh && Math.hypot(fresh.x - p.x, fresh.y - p.y) > 500) g.cars.push(fresh);
  }
  const pedCount = g.peds.filter((pd) => !pd.dead).length;
  if (pedCount < 34 && Math.random() < dt * 0.5) {
    const fresh = spawnPeds(1, rng)[0];
    if (fresh && Math.hypot(fresh.x - p.x, fresh.y - p.y) > 480) g.peds.push(fresh);
  }
}

function updateMissions(dt) {
  const p = g.player;
  const focus = p.inVehicle || p;
  const marker = g.missions.marker();
  const stepRadius = (g.missions.step && g.missions.step.r) || 58;
  const atMarker = marker ? Math.hypot(focus.x - marker.x, focus.y - marker.y) < stepRadius : false;
  const side = g.missions.sideJob;
  const atSideMarker = side ? Math.hypot(focus.x - side.x, focus.y - side.y) < 58 : false;
  const event = g.missions.update(dt, {
    atMarker,
    atSideMarker,
    targetDown: !!(g.targetPed && g.targetPed.dead),
    wantedStars: g.wanted.stars,
  });
  if (event === 'complete') {
    p.cash += g.missions.lastReward;
    g.missionsDone += 1;
    g.storyIndex += 1;
    g.sound.missionComplete();
    g.sound.cash();
    addEffect('cash', p.x, p.y - 24, `+$${g.missions.lastReward}`);
    saveGame();
    if (g.storyIndex < STORY.length) {
      setTimeout(() => { if (g.state === 'play') offerStoryMission(); }, 2600);
    } else {
      toast('Story complete! Free roam — T taxi fare · J package run');
    }
  } else if (event === 'failed') {
    g.sound.busted();
    setTimeout(() => {
      if (g.state === 'play' && !g.missions.active) offerStoryMission();
    }, 3200);
  } else if (event === 'side-complete') {
    p.cash += g.missions.lastReward;
    g.sound.cash();
    addEffect('cash', p.x, p.y - 24, `+$${g.missions.lastReward}`);
    toast('Job done — nice driving');
    saveGame();
  } else if (event === 'side-failed') {
    toast('Job expired');
  } else if (event === 'step') {
    g.sound.pickup();
    toast('Objective updated');
  }
}

function updateCamera(dt) {
  const focus = g.player.inVehicle || g.player;
  const targetX = Math.max(0, Math.min(WORLD_W - W, focus.x - W / 2));
  const targetY = Math.max(0, Math.min(WORLD_H - H, focus.y - H / 2));
  const k = dt >= 1 ? 1 : Math.min(1, dt * 6);
  g.cam.x += (targetX - g.cam.x) * k;
  g.cam.y += (targetY - g.cam.y) * k;
}

// --- Render & loop ----------------------------------------------------------------------------

function render() {
  ctx.clearRect(0, 0, W, H);
  if (g.state === 'title') {
    drawTitleScreen(ctx, g, W, H, g.hasSave);
    return;
  }
  const cam = {
    x: g.cam.x + (g.shake ? (Math.random() - 0.5) * g.shake : 0),
    y: g.cam.y + (g.shake ? (Math.random() - 0.5) * g.shake : 0),
  };
  ctx.save();
  drawWorld(ctx, g, cam, W, H);
  // Depth sort so southern entities overlap northern ones correctly.
  const drawList = [
    ...g.cars.map((car) => ({ y: car.y, draw: () => drawCar(ctx, car, cam) })),
    ...g.peds.map((ped) => ({ y: ped.y, draw: () => drawPerson(ctx, ped, cam, false, 0) })),
    ...g.officers.map((o) => ({ y: o.y, draw: () => drawPerson(ctx, o, cam, false, 0) })),
  ];
  if (!g.player.inVehicle) {
    const aim = Math.atan2(g.cam.y + g.mouse.y - g.player.y, g.cam.x + g.mouse.x - g.player.x);
    drawList.push({ y: g.player.y, draw: () => drawPerson(ctx, g.player, cam, true, aim) });
  }
  drawList.sort((a, b) => a.y - b.y);
  for (const item of drawList) item.draw();
  drawEffects(ctx, g, cam);
  ctx.restore();

  drawHUD(ctx, g, W, H);
  if (g.state === 'paused') drawPause(ctx, g, W, H);
  if (g.state === 'busted' || g.state === 'wasted') drawEndScreen(ctx, g, W, H, g.state);
  if (statusEl) {
    statusEl.textContent = `Vice Harbor: cash $${g.player.cash}, wanted ${g.wanted.stars} stars, ${g.missions.objectiveText() || 'free roam'}`;
  }
}

let lastTimestamp = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTimestamp) / 1000);
  lastTimestamp = now;
  if (g.state === 'play') update(dt);
  render();
  requestAnimationFrame(frame);
}

// --- Screenshot / demo hooks ---------------------------------------------------------------------
// ?shot=title|city|chase|mission stages a real game state and lets the
// world simulate briefly, so the screenshots in screenshots/ are honest
// renders of the game — nothing is composited or drawn by hand.

function setupShot(name) {
  if (name === 'title') {
    g.state = 'title';
    return;
  }
  startWorld(true);
  g.player.cash = 640;
  if (name === 'city') {
    g.player.x = 2430;
    g.player.y = 2010;
    g.player.angle = -0.6;
    g.dialogue = '';
    g.dialogueTimer = 0;
  } else if (name === 'chase') {
    g.player.x = 2430;
    g.player.y = 2010;
    const getaway = makeCar(2430, 2010, -0.5, { color: '#c94f4f', kind: 'sport' });
    getaway.speed = 215;
    getaway.stolen = true;
    g.cars.unshift(getaway);
    g.player.inVehicle = getaway;
    g.wanted.points = 268;
    g.wanted.stars = 3;
    const copA = makeCar(2280, 2110, -0.4, { police: true, color: '#eef1f6' });
    copA.cop = true; copA.speed = 200;
    const copB = makeCar(2560, 1900, -2.4, { police: true, color: '#eef1f6' });
    copB.cop = true; copB.speed = 180;
    g.cars.push(copA, copB);
    g.officers.push({
      x: 2360, y: 2150, angle: 0, health: 100, dead: false, cop: true,
      color: '#2b3f66', walkPhase: 2, deadTimer: 0, stale: false,
    });
    g.dialogue = 'Sol: They are right on you, Rook — break line of sight and reach the safehouse!';
    g.dialogueTimer = 30;
  } else if (name === 'mission') {
    g.player.x = 385;
    g.player.y = 2945;
    g.player.angle = 0.4;
    g.dialogue = 'Sol: The pouch is in the glowing ring. Grab it and drive it to Harbor Point.';
    g.dialogueTimer = 30;
  }
  updateCamera(1);
  for (let i = 0; i < 24; i++) update(1 / 30);
  if (name === 'chase' && g.player.inVehicle) {
    // The settle loop has no keys held, so restore the getaway pace.
    g.player.inVehicle.speed = 218;
    for (const car of g.cars) if (car.police) car.speed = 205;
  }
  updateCamera(1);
}

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
g.hasSave = !!loadSave();
if (shot) {
  setupShot(shot);
} else {
  g.city = buildCity();
  g.player = newPlayer();
  g.state = 'title';
}
requestAnimationFrame(frame);
