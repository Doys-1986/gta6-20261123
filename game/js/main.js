// main.js — Vice Harbor: Neon Streets. Game state, the main loop,
// player movement, arcade driving, combat, police pressure, missions,
// saving and the screenshot demo hooks (?shot=title|city|chase|mission).

import { buildCity, collideBuildings, makeRng, onRoad, WORLD_W, WORLD_H } from './city.js';
import { SoundBank } from './sound.js';
import { spawnTraffic, spawnPeds, updateTrafficCar, updatePed, scarePeds, makeCar } from './traffic.js';
import { WantedSystem, desiredPolice, spawnPoliceUnit, updatePoliceCar, makeOfficer, updateOfficer } from './police.js';
import { STORY, MissionRunner } from './missions.js';
import { drawWorld, drawCar, drawPerson, drawEffects, drawHUD, drawTitleScreen, drawEndScreen, drawPause } from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
let W = 1280, H = 800;
function resize() {
  W = Math.min(window.innerWidth, 1600);
  H = Math.min(window.innerHeight, 1000);
  canvas.width = W;
  canvas.height = H;
}
window.addEventListener('resize', resize);
resize();

const SAVE_KEY = 'vice-harbor-neon-streets-save-v1';
const rng = makeRng(987654);

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
  storyIndex: 0,
};
window.__game = g;

function newPlayer() {
  return {
    x: 330, y: 2880, angle: -Math.PI / 2, walkPhase: 0,
    health: 100, armor: 50, cash: 120, weapon: 'pistol',
    color: '#e0483c', inVehicle: null, dead: false,
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: g.player.cash, missionsDone: g.missionsDone, storyIndex: g.storyIndex,
      x: g.player.x, y: g.player.y,
    }));
  } catch { /* storage unavailable */ }
}

function toast(text) {
  g.toasts.push({ text, life: 2.6 });
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
  g.state = 'play';
  updateCamera(1);
  if (g.storyIndex < STORY.length) {
    offerStoryMission();
  } else {
    toast('Free roam — T for a taxi fare, J for a package run');
  }
}

function offerStoryMission() {
  const m = STORY[g.storyIndex];
  if (!m) return;
  const intro = g.missions.start(m);
  g.dialogue = intro;
  g.dialogueTimer = 9;
  g.sound.missionStart();
  // Mission 3 needs its target on the street.
  if (m.id === 'last-light') {
    const step = m.steps[0];
    g.targetPed = {
      x: step.x, y: step.y, angle: 2.4, walkPhase: 0, color: '#20242c',
      health: 100, dead: false, flee: 0, panicX: 0, panicY: 0,
      baseSpeed: 40, deadTimer: 0, isTarget: true,
    };
    g.peds.push(g.targetPed);
  }
}

function addEffect(kind, x, y, text) {
  g.effects.push({ kind, x, y, text, life: 1 });
}

function nearestCar(x, y, maxDist, needFree) {
  let best = null, bd = maxDist;
  for (const c of g.cars) {
    if (c.dead) continue;
    if (needFree && c.police) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function enterVehicle() {
  const p = g.player;
  const car = nearestCar(p.x, p.y, 58, false);
  if (!car) return;
  const wasParked = car.parked;
  const witnessed = g.peds.some((pd) => !pd.dead && Math.hypot(pd.x - p.x, pd.y - p.y) < 210)
    || g.cars.some((c) => c.police && Math.hypot(c.x - p.x, c.y - p.y) < 320);
  if (car.driver && !car.police) {
    // Yank the driver out.
    g.peds.push({
      x: car.x + 20, y: car.y + 14, angle: 0, walkPhase: 0, color: '#8fd14f',
      health: 100, dead: false, flee: 2, panicX: 20, panicY: 10, baseSpeed: 45, deadTimer: 0,
    });
    car.driver = false;
  }
  car.parked = false;
  car.traffic = false;
  p.inVehicle = car;
  g.sound.door();
  if ((wasParked === false || car.trafficWas) && witnessed) { /* traffic car theft handled below */ }
  if (witnessed && (car.wasTraffic || wasParked === false)) {
    g.wanted.addCrime('theft');
    toast('Witnessed: vehicle theft!');
  }
  if (car.police && witnessed) {
    g.wanted.addCrime('hitPolice');
    toast('You stole a police cruiser!');
  }
}

function exitVehicle() {
  const p = g.player;
  const car = p.inVehicle;
  if (!car) return;
  p.x = car.x - Math.sin(car.angle) * 30;
  p.y = car.y + Math.cos(car.angle) * 30;
  collideBuildings(g.city.buildings, p, 10);
  p.inVehicle = null;
  car.speed = 0;
  g.sound.door();
  g.sound.engine(false);
}

function reportCrime(kind, x, y) {
  const witnessed = g.peds.some((pd) => !pd.dead && Math.hypot(pd.x - x, pd.y - y) < 260)
    || g.cars.some((c) => c.police && Math.hypot(c.x - x, c.y - y) < 420)
    || g.officers.some((o) => !o.dead && Math.hypot(o.x - x, o.y - y) < 300);
  g.wanted.addCrime(kind, witnessed);
  if (witnessed) g.wanted.hiddenTimer = 0;
}

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

function endRun(kind) {
  g.state = kind;
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
  toast(fine > 0 ? `Respawned at Old Solana clinic — fee $${fine}` : 'Respawned at Old Solana');
  saveGame();
}

// --- Input -----------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  g.keys[k] = true;
  g.sound.ensure();
  if (g.state === 'title') {
    if (k === 'enter') startWorld(false);
    if (k === 'n') { try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ } startWorld(true); }
    return;
  }
  if ((g.state === 'busted' || g.state === 'wasted') && k === 'enter') { respawn(); return; }
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
  const r = canvas.getBoundingClientRect();
  g.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
  g.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
});
canvas.addEventListener('mousedown', () => { g.mouse.down = true; g.sound.ensure(); });
window.addEventListener('mouseup', () => { g.mouse.down = false; });

// --- Combat ----------------------------------------------------------------
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
    const tx = p.x + Math.cos(aim) * 24, ty = p.y + Math.sin(aim) * 24;
    for (const pd of [...g.peds, ...g.officers]) {
      if (pd.dead) continue;
      if (Math.hypot(pd.x - tx, pd.y - ty) < 20) {
        hurtPerson(pd, 34, aim);
      }
    }
  }
}

function hurtPerson(pd, dmg, angle) {
  pd.health -= dmg;
  pd.flee = 2;
  pd.panicX = Math.cos(angle) * 40;
  pd.panicY = Math.sin(angle) * 40;
  addEffect('spark', pd.x, pd.y);
  if (pd.health <= 0 && !pd.dead) {
    pd.dead = true;
    pd.deadTimer = 0;
    reportCrime(pd.cop ? 'hitPolice' : 'killPed', pd.x, pd.y);
    if (pd.isTarget) toast('Target down!');
  } else {
    reportCrime(pd.cop ? 'hitPolice' : 'hitPed', pd.x, pd.y);
  }
}

function updateBullets(dt) {
  for (const b of g.bullets) {
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    // Hit cars.
    for (const c of g.cars) {
      if (c.dead) continue;
      if (Math.hypot(c.x - b.x, c.y - b.y) < 26) {
        c.health -= 18;
        addEffect('spark', b.x, b.y);
        if (c.health <= 0) { c.dead = true; g.sound.crash(1); }
        if (c.police) reportCrime('hitPolice', b.x, b.y);
        b.life = 0;
        break;
      }
    }
    if (b.life <= 0) continue;
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

// --- Driving ---------------------------------------------------------------
function updateDriving(dt) {
  const p = g.player;
  const car = p.inVehicle;
  const up = g.keys['w'] || g.keys['arrowup'];
  const down = g.keys['s'] || g.keys['arrowdown'];
  const left = g.keys['a'] || g.keys['arrowleft'];
  const right = g.keys['d'] || g.keys['arrowright'];
  const hand = g.keys[' '];
  const maxF = 330, maxR = -130;
  if (up) car.speed += (car.speed < 0 ? 420 : 250) * dt;
  if (down) car.speed -= (car.speed > 0 ? 430 : 200) * dt;
  if (!up && !down) car.speed -= car.speed * (hand ? 2.4 : 0.7) * dt;
  car.speed = Math.max(maxR, Math.min(maxF, car.speed));
  const steerInput = (left ? -1 : 0) + (right ? 1 : 0);
  car.steer += ((steerInput * 0.55) - car.steer) * Math.min(1, dt * 9);
  const speedRatio = Math.abs(car.speed) / maxF;
  if (Math.abs(car.speed) > 4) {
    const grip = hand ? 0.55 : 1;
    car.angle += car.steer * (car.speed > 0 ? 1 : -1) * (1.15 + speedRatio * 0.7) * grip * dt * 2.2;
  }
  const ox = car.x, oy = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const hitWall = collideBuildings(g.city.buildings, car, 24);
  if (hitWall && Math.abs(car.speed) > 90) {
    car.health -= Math.abs(car.speed) * 0.05;
    p.health -= 2;
    g.sound.crash(Math.min(1, Math.abs(car.speed) / 300));
    g.shake = Math.min(10, g.shake + 4);
    addEffect('spark', car.x, car.y);
  }
  if (hitWall) car.speed *= 0.45;
  void ox; void oy;
  g.sound.engine(true, speedRatio);
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    exitVehicle();
    toast('Vehicle wrecked!');
  }
  // Collisions with other cars and people.
  for (const o of g.cars) {
    if (o === car || o.dead) continue;
    const d = Math.hypot(o.x - car.x, o.y - car.y);
    if (d < 44 && d > 0) {
      const push = (44 - d) / 2;
      const nx = (o.x - car.x) / d, ny = (o.y - car.y) / d;
      o.x += nx * push; o.y += ny * push;
      car.x -= nx * push; car.y -= ny * push;
      if (Math.abs(car.speed) > 60) {
        o.health -= 12; car.health -= 6;
        g.sound.crash(0.7);
        addEffect('spark', (o.x + car.x) / 2, (o.y + car.y) / 2);
        reportCrime(o.police ? 'ramPolice' : 'hitCar', car.x, car.y);
        if (o.driver && !o.police) {
          o.traffic = false; o.parked = true; o.speed = 0;
          g.peds.push({
            x: o.x + 22, y: o.y, angle: 0, walkPhase: 0, color: '#5a8fd6',
            health: 100, dead: false, flee: 2.4, panicX: nx * 30, panicY: ny * 30, baseSpeed: 45, deadTimer: 0,
          });
          o.driver = false;
        }
      }
      car.speed *= 0.72;
    }
  }
  for (const pd of [...g.peds, ...g.officers]) {
    if (pd.dead) continue;
    const d = Math.hypot(pd.x - car.x, pd.y - car.y);
    if (d < 26) {
      if (Math.abs(car.speed) > 45) {
        hurtPerson(pd, Math.abs(car.speed) > 160 ? 100 : 55, car.angle);
        scarePeds(g.peds, car.x, car.y, 240);
        car.speed *= 0.8;
        g.shake = Math.min(10, g.shake + 3);
      } else {
        pd.flee = 1; pd.panicX = pd.x - car.x; pd.panicY = pd.y - car.y;
      }
    }
  }
}

function updateOnFoot(dt) {
  const p = g.player;
  let mx = 0, my = 0;
  if (g.keys['w'] || g.keys['arrowup']) my -= 1;
  if (g.keys['s'] || g.keys['arrowdown']) my += 1;
  if (g.keys['a'] || g.keys['arrowleft']) mx -= 1;
  if (g.keys['d'] || g.keys['arrowright']) mx += 1;
  const sprint = g.keys['shift'] ? 1.45 : 1;
  if (mx || my) {
    const d = Math.hypot(mx, my);
    const sp = 148 * sprint;
    p.x += (mx / d) * sp * dt;
    p.y += (my / d) * sp * dt;
    p.walkPhase += dt * (sprint > 1 ? 13 : 10);
    if (!g.mouse.down) p.angle = Math.atan2(my, mx);
    collideBuildings(g.city.buildings, p, 10);
  }
  // Police bullets at 4+ stars when an officer is close.
  for (const o of g.officers) {
    if (o.dead || g.wanted.stars < 4) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < 230 && Math.random() < dt * 0.8) {
      const a = Math.atan2(p.y - o.y, p.x - o.x) + (Math.random() - 0.5) * 0.16;
      g.bullets.push({ x: o.x, y: o.y, angle: a, speed: 640, life: 0.5, fromPlayer: false });
      g.sound.gunshot();
    }
  }
}

// --- World update ----------------------------------------------------------
function update(dt) {
  g.time += dt;
  const p = g.player;
  if (g.dialogueTimer > 0) g.dialogueTimer -= dt;
  g.fireCooldown = Math.max(0, g.fireCooldown);
  if (p.inVehicle) updateDriving(dt); else { updateOnFoot(dt); playerAttack(dt); }
  updateBullets(dt);

  const world = { cars: g.cars, peds: g.peds, player: p, playerVehicle: p.inVehicle, city: g.city, wanted: g.wanted };
  for (const c of g.cars) {
    if (c === p.inVehicle || c.dead) continue;
    if (c.police) updatePoliceCar(c, dt, world);
    else if (c.traffic) { c.wasTraffic = true; updateTrafficCar(c, dt, world); }
  }
  for (const pd of g.peds) updatePed(pd, dt, world);
  g.peds = g.peds.filter((pd) => !pd.dead || pd.deadTimer < 14);
  if (g.targetPed && g.targetPed.dead) { /* handled via mission events */ }

  // Police spawning / despawning.
  const policeCars = g.cars.filter((c) => c.police && !c.dead);
  const want = desiredPolice(g.wanted.stars);
  if (policeCars.length < want) {
    const unit = spawnPoliceUnit(p.inVehicle || p, g.cars);
    if (unit) g.cars.push(unit);
  }
  g.cars = g.cars.filter((c) => !(c.police && (c.stale || c.dead) && Math.hypot(c.x - p.x, c.y - p.y) > 700));
  // Foot officers at 3+ stars.
  if (g.wanted.stars >= 3 && g.officers.filter((o) => !o.dead).length < g.wanted.stars - 1 && Math.random() < dt * 0.7) {
    const a = Math.random() * Math.PI * 2;
    g.officers.push(makeOfficer(p.x + Math.cos(a) * 420, p.y + Math.sin(a) * 420));
  }
  let seen = false;
  let bustPressure = false;
  for (const c of g.cars) {
    if (!c.police || c.dead) continue;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < 430) seen = true;
    if (!p.inVehicle && d < 65) bustPressure = true;
  }
  for (const o of g.officers) {
    const d = updateOfficer(o, dt, world);
    if (d < 430) seen = true;
    if (d < 30 && !p.inVehicle) bustPressure = true;
  }
  g.officers = g.officers.filter((o) => !(o.stale && Math.hypot(o.x - p.x, o.y - p.y) > 900) && (!o.dead || o.deadTimer < 10));
  g.wanted.update(dt, seen);
  if (g.wanted.stars === 0) g.wanted.bustMeter = 0;
  if (bustPressure && g.wanted.stars > 0) {
    g.wanted.bustMeter += dt / 1.6;
    if (g.wanted.bustMeter >= 1) { endRun('busted'); return; }
  } else {
    g.wanted.bustMeter = Math.max(0, g.wanted.bustMeter - dt * 0.8);
  }
  g.sound.siren(g.wanted.stars > 0 && policeCars.length > 0);

  // Traffic replenishment.
  const trafficCount = g.cars.filter((c) => c.traffic && !c.dead).length;
  if (trafficCount < 13 && Math.random() < dt * 0.4) {
    const fresh = spawnTraffic(g.city, 1, rng);
    const c = fresh.find((fc) => fc.traffic);
    if (c && Math.hypot(c.x - p.x, c.y - p.y) > 500) g.cars.push(c);
  }
  const pedCount = g.peds.filter((pd) => !pd.dead).length;
  if (pedCount < 34 && Math.random() < dt * 0.5) {
    const fresh = spawnPeds(1, rng);
    if (Math.hypot(fresh[0].x - p.x, fresh[0].y - p.y) > 480) g.peds.push(fresh[0]);
  }

  // Mission logic.
  const mk = g.missions.marker();
  const focus = p.inVehicle || p;
  const atMarker = mk ? Math.hypot(focus.x - mk.x, focus.y - mk.y) < ((g.missions.step && g.missions.step.r) || 58) : false;
  const atSide = g.missions.sideJob ? Math.hypot(focus.x - g.missions.sideJob.x, focus.y - g.missions.sideJob.y) < 58 : false;
  const ev = g.missions.update(dt, {
    atMarker, atSideMarker: atSide,
    targetDown: !!(g.targetPed && g.targetPed.dead),
    wantedStars: g.wanted.stars,
  });
  if (ev === 'complete') {
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
  } else if (ev === 'failed') {
    g.sound.busted();
    setTimeout(() => {
      if (g.state === 'play' && !g.missions.active) offerStoryMission();
    }, 3200);
  } else if (ev === 'side-complete') {
    p.cash += g.missions.lastReward;
    g.sound.cash();
    addEffect('cash', p.x, p.y - 24, `+$${g.missions.lastReward}`);
    toast('Job done — nice driving');
    saveGame();
  } else if (ev === 'side-failed') {
    toast('Job expired');
  } else if (ev === 'step') {
    g.sound.pickup();
    toast('Objective updated');
  }

  // Slow regen, effects and toasts.
  if (p.health > 0 && p.health < 100) p.health = Math.min(100, p.health + dt * 1.1);
  for (const fx of g.effects) fx.life -= dt * (fx.kind === 'cash' ? 0.7 : 1.8);
  g.effects = g.effects.filter((fx) => fx.life > 0);
  for (const t of g.toasts) t.life -= dt;
  g.toasts = g.toasts.filter((t) => t.life > 0);
  g.shake = Math.max(0, g.shake - dt * 22);
  updateCamera(dt);
  if (Math.random() < dt * 0.2) saveGame();
  if (onRoad(p.x, p.y)) { /* on tarmac */ }
}

function updateCamera(dt) {
  const focus = g.player.inVehicle || g.player;
  const tx = Math.max(0, Math.min(WORLD_W - W, focus.x - W / 2));
  const ty = Math.max(0, Math.min(WORLD_H - H, focus.y - H / 2));
  const k = dt >= 1 ? 1 : Math.min(1, dt * 6);
  g.cam.x += (tx - g.cam.x) * k;
  g.cam.y += (ty - g.cam.y) * k;
}

// --- Render ----------------------------------------------------------------
function render() {
  ctx.clearRect(0, 0, W, H);
  if (g.state === 'title') {
    drawTitleScreen(ctx, g, W, H, g.hasSave);
    return;
  }
  const shX = g.shake ? (Math.random() - 0.5) * g.shake : 0;
  const shY = g.shake ? (Math.random() - 0.5) * g.shake : 0;
  const cam = { x: g.cam.x + shX, y: g.cam.y + shY };
  ctx.save();
  drawWorld(ctx, g, cam, W, H);
  const sorted = [...g.cars].sort((a, b) => a.y - b.y);
  for (const c of sorted) drawCar(ctx, c, cam);
  for (const pd of g.peds) drawPerson(ctx, pd, cam, false, 0);
  for (const o of g.officers) drawPerson(ctx, o, cam, false, 0);
  if (!g.player.inVehicle) {
    const aim = Math.atan2(g.cam.y + g.mouse.y - g.player.y, g.cam.x + g.mouse.x - g.player.x);
    drawPerson(ctx, g.player, cam, true, aim);
  }
  drawEffects(ctx, g, cam);
  ctx.restore();
  drawHUD(ctx, g, W, H);
  if (g.state === 'paused') drawPause(ctx, g, W, H);
  if (g.state === 'busted' || g.state === 'wasted') drawEndScreen(ctx, g, W, H, g.state);
  if (statusEl) {
    statusEl.textContent = `Vice Harbor: cash $${g.player.cash}, wanted ${g.wanted.stars} stars, ${g.missions.objectiveText() || 'free roam'}`;
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (g.state === 'play') update(dt);
  render();
  requestAnimationFrame(frame);
}

// --- Demo / screenshot hooks -------------------------------------------------
function setupShot(name) {
  if (name === 'title') {
    g.state = 'title';
    return;
  }
  startWorld(true);
  g.player.cash = 640;
  if (name === 'city') {
    g.player.x = 2430; g.player.y = 2010;
    g.player.angle = -0.6;
    g.missions.dialogue = '';
    g.dialogueTimer = 0;
    updateCamera(1);
  } else if (name === 'chase') {
    // Player mid-getaway downtown, PSPD on the tail, mission 2 flavour.
    g.player.x = 2430; g.player.y = 2010;
    const car = makeCar(2430, 2010, -0.5, { color: '#c94f4f', kind: 'sport' });
    car.speed = 215;
    g.cars.unshift(car);
    g.player.inVehicle = car;
    g.wanted.points = 268; g.wanted.stars = 3;
    const cop1 = makeCar(2280, 2110, -0.4, { police: true, color: '#eef1f6' });
    cop1.cop = true; cop1.speed = 200;
    const cop2 = makeCar(2560, 1900, -2.4, { police: true, color: '#eef1f6' });
    cop2.cop = true; cop2.speed = 180;
    g.cars.push(cop1, cop2);
    g.officers.push({ x: 2360, y: 2150, angle: 0, health: 100, dead: false, cop: true, color: '#2b3f66', walkPhase: 2, deadTimer: 0 });
    g.dialogue = 'Sol: They are right on you, Rook — break line of sight and reach the safehouse!';
    g.dialogueTimer = 30;
    updateCamera(1);
  } else if (name === 'mission') {
    // Mission 1 pickup moment: on foot at the Neon Marina marker.
    g.player.x = 385; g.player.y = 2945;
    g.player.angle = 0.4;
    g.dialogue = 'Sol: The pouch is in the glowing ring. Grab it and drive it to Harbor Point.';
    g.dialogueTimer = 30;
    updateCamera(1);
  }
  // Let the world settle a few frames so traffic/peds are mid-motion.
  for (let i = 0; i < 24; i++) update(1 / 30);
  if (name === 'chase' && g.player.inVehicle) {
    // Restore getaway speed after the settle (no keys are held).
    g.player.inVehicle.speed = 218;
    for (const c of g.cars) if (c.police) c.speed = 205;
  }
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
