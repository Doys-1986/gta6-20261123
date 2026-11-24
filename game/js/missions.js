// missions.js — the work Rafi "Rook" Vale does to pay off his debt.
// The story is a three-mission chain handed out by the fixer Marisol
// "Sol" Quintero over the phone: a courier run, a timed pickup with a
// nervous passenger, and a final confrontation followed by an escape.
// Between and after story beats, free roam offers two repeatable side
// jobs — taxi fares (key T) and package runs (key J) — for pocket cash.
// Every name, place and line here is original to Vice Harbor.

export const STORY = [
  {
    id: 'first-fare',
    title: 'Mission 1 — First Fare',
    giver: 'Sol (phone)',
    intro: 'Sol: Rook, listen. A courier pouch is sitting at the Neon Marina depot. Pick it up, then drop it at the Harbor Point garage. The night is young — keep it clean.',
    steps: [
      { kind: 'goto', label: 'Pick up the courier pouch at Neon Marina', x: 330, y: 2990, r: 55 },
      { kind: 'goto', label: 'Deliver the pouch to the Harbor Point garage', x: 2990, y: 330, r: 55 },
    ],
    reward: 250,
  },
  {
    id: 'hot-pickup',
    title: 'Mission 2 — Hot Pickup',
    giver: 'Sol (phone)',
    intro: 'Sol: Change of plans. My driver bailed in Cinder Flats and left a very nervous passenger on the kerb. Collect them and reach the Palm Heights safehouse — fast, the clock is running.',
    steps: [
      { kind: 'goto', label: 'Collect the passenger in Cinder Flats', x: 860, y: 860, r: 55 },
      { kind: 'goto', label: 'Reach the Palm Heights safehouse before time runs out', x: 860, y: 1560, r: 60, timer: 75 },
    ],
    reward: 450,
  },
  {
    id: 'last-light',
    title: 'Mission 3 — Last Light',
    giver: 'Sol (phone)',
    intro: 'Sol: One name left on the ledger: the enforcer Dario Venn, holding court downtown. End his shift, then lose any heat and reach the Old Solana pier. Do this and we are square.',
    steps: [
      { kind: 'target', label: 'Confront Dario Venn downtown (marked)', x: 2430, y: 1900, r: 70 },
      { kind: 'escape', label: 'Lose the heat, then reach the Old Solana pier', x: 2990, y: 2990, r: 60 },
    ],
    reward: 900,
  },
];

// The runner holds whichever job is live, walks its steps as events
// arrive from main.js, and reports outcomes as short strings:
// 'step' | 'complete' | 'failed' | 'side-complete' | 'side-failed'.
export class MissionRunner {
  constructor() {
    this.active = null;        // story mission in progress, or null
    this.stepIndex = 0;
    this.state = 'idle';       // idle | active | done | failed
    this.timer = 0;            // seconds left on a timed step
    this.banner = '';          // big centre-screen message
    this.bannerTimer = 0;
    this.sideJob = null;       // { kind, x, y, label, reward, timer }
    this.lastReward = 0;
    this.completedMission = null;
  }

  get step() {
    return this.active ? this.active.steps[this.stepIndex] : null;
  }

  start(mission) {
    this.active = mission;
    this.stepIndex = 0;
    this.state = 'active';
    const first = this.step;
    this.timer = first && first.timer ? first.timer : 0;
    return mission.intro;
  }

  // A side job is a single marker 700–1400 px away, snapped onto a road
  // junction so it is always reachable by car and on foot alike.
  startSideJob(kind, player) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 700 + Math.random() * 700;
    const CELL = 520;
    const ROAD_W = 120;
    const snap = (v) => Math.round((v - ROAD_W / 2) / CELL) * CELL + ROAD_W / 2;
    const x = snap(Math.max(120, Math.min(3520, player.x + Math.cos(ang) * dist)));
    const y = snap(Math.max(120, Math.min(3520, player.y + Math.sin(ang) * dist)));
    this.sideJob = kind === 'taxi'
      ? { kind, x, y, label: 'Taxi fare: drop the passenger at the marker', reward: 90 + Math.floor(Math.random() * 80), timer: 90 }
      : { kind, x, y, label: 'Package run: deliver to the marker', reward: 70 + Math.floor(Math.random() * 60), timer: 90 };
    return this.sideJob;
  }

  // events: { atMarker, atSideMarker, targetDown, wantedStars }
  update(dt, events) {
    if (this.bannerTimer > 0) this.bannerTimer -= dt;

    if (this.sideJob) {
      this.sideJob.timer -= dt;
      if (this.sideJob.timer <= 0) {
        this.sideJob = null;
        return 'side-failed';
      }
      if (events.atSideMarker) {
        this.lastReward = this.sideJob.reward;
        this.sideJob = null;
        return 'side-complete';
      }
      return null;
    }

    if (!this.active || this.state !== 'active') return null;
    const s = this.step;
    if (!s) return null;

    if (s.timer) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'failed';
        this.banner = 'MISSION FAILED — out of time';
        this.bannerTimer = 3;
        return 'failed';
      }
    }

    let advance = false;
    if (s.kind === 'goto' && events.atMarker) advance = true;
    if (s.kind === 'target' && events.targetDown) advance = true;
    // The escape step needs both: at the pier AND with a clean record.
    if (s.kind === 'escape' && events.atMarker && events.wantedStars === 0) advance = true;
    if (!advance) return null;

    this.stepIndex += 1;
    if (this.stepIndex >= this.active.steps.length) {
      this.state = 'done';
      this.banner = `MISSION COMPLETE  +$${this.active.reward}`;
      this.bannerTimer = 3.5;
      this.lastReward = this.active.reward;
      this.completedMission = this.active;
      this.active = null;
      return 'complete';
    }
    const next = this.step;
    this.timer = next && next.timer ? next.timer : 0;
    return 'step';
  }

  // The one line the HUD shows in its objective panel.
  objectiveText() {
    if (this.sideJob) {
      return `${this.sideJob.label}  (${Math.max(0, Math.ceil(this.sideJob.timer))}s)`;
    }
    const s = this.step;
    if (!this.active || !s) return '';
    const clock = s.timer ? `  (${Math.max(0, Math.ceil(this.timer))}s)` : '';
    const heat = s.kind === 'escape' ? ' — clear your stars first' : '';
    return `${s.label}${heat}${clock}`;
  }

  // Where the world beacon and the minimap dot go.
  marker() {
    if (this.sideJob) return { x: this.sideJob.x, y: this.sideJob.y, color: '#57e6c9' };
    const s = this.step;
    if (!s || !this.active) return null;
    return { x: s.x, y: s.y, color: s.kind === 'target' ? '#ff5a5a' : '#ffd94f' };
  }
}
