// missions.js — the original Vice Harbor story chain plus side work.
// Story: courier Rafi "Rook" Vale owes the fixer Marisol "Sol" Quintero
// one last night of runs across Port Solana. Three story missions, then
// repeatable taxi fares and package runs in free roam.

export const STORY = [
  {
    id: 'first-fare',
    title: 'Mission 1 — First Fare',
    giver: 'Sol (phone)',
    intro: 'Sol: Rook, a courier pouch is waiting at the Neon Marina depot. Pick it up, then drop it at the Harbor Point garage. The night is young — keep it clean.',
    steps: [
      { kind: 'goto', label: 'Pick up the courier pouch at Neon Marina', x: 330, y: 2990, r: 55 },
      { kind: 'goto', label: 'Deliver the pouch to Harbor Point garage', x: 2990, y: 330, r: 55, needsCar: false },
    ],
    reward: 250,
  },
  {
    id: 'hot-pickup',
    title: 'Mission 2 — Hot Pickup',
    giver: 'Sol (phone)',
    intro: 'Sol: Change of plans. My driver bailed in Cinder Flats with a very nervous passenger. Collect them and reach the Palm Heights safehouse — fast, the clock is running.',
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

export class MissionRunner {
  constructor() {
    this.active = null;      // current story mission object
    this.stepIndex = 0;
    this.state = 'idle';     // idle | active | done | failed
    this.timer = 0;
    this.banner = '';
    this.bannerTimer = 0;
    this.targetPed = null;
    this.sideJob = null;     // {x,y,label,reward,timer}
  }

  get step() {
    return this.active ? this.active.steps[this.stepIndex] : null;
  }

  start(mission) {
    this.active = mission;
    this.stepIndex = 0;
    this.state = 'active';
    this.timer = 0;
    const s = this.step;
    if (s && s.timer) this.timer = s.timer;
    return mission.intro;
  }

  startSideJob(kind, player) {
    // A fare/delivery somewhere 700–1400px away, snapped near a road.
    const ang = Math.random() * Math.PI * 2;
    const dist = 700 + Math.random() * 700;
    const CELL = 520, ROAD_W = 120;
    let x = Math.max(120, Math.min(3520, player.x + Math.cos(ang) * dist));
    let y = Math.max(120, Math.min(3520, player.y + Math.sin(ang) * dist));
    x = Math.round((x - ROAD_W / 2) / CELL) * CELL + ROAD_W / 2;
    y = Math.round((y - ROAD_W / 2) / CELL) * CELL + ROAD_W / 2;
    this.sideJob = kind === 'taxi'
      ? { kind, x, y, label: 'Taxi fare: drop the passenger at the marker', reward: 90 + Math.floor(Math.random() * 80), timer: 90 }
      : { kind, x, y, label: 'Package run: deliver to the marker', reward: 70 + Math.floor(Math.random() * 60), timer: 90 };
    return this.sideJob;
  }

  // Advance logic. events: {atMarker, targetDown, wantedStars}
  // Returns 'step' | 'complete' | 'failed' | 'side-complete' | null.
  update(dt, events) {
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    if (this.sideJob) {
      this.sideJob.timer -= dt;
      if (this.sideJob.timer <= 0) { this.sideJob = null; return 'side-failed'; }
      if (events.atSideMarker) {
        const r = this.sideJob.reward;
        this.sideJob = null;
        this.lastReward = r;
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
    if (s.kind === 'escape' && events.atMarker && events.wantedStars === 0) advance = true;
    if (!advance) return null;
    this.stepIndex += 1;
    if (this.stepIndex >= this.active.steps.length) {
      this.state = 'done';
      this.banner = `MISSION COMPLETE  +$${this.active.reward}`;
      this.bannerTimer = 3.5;
      this.lastReward = this.active.reward;
      const done = this.active;
      this.active = null;
      this.completedMission = done;
      return 'complete';
    }
    const ns = this.step;
    this.timer = ns && ns.timer ? ns.timer : 0;
    return 'step';
  }

  objectiveText() {
    if (this.sideJob) {
      return `${this.sideJob.label}  (${Math.max(0, Math.ceil(this.sideJob.timer))}s)`;
    }
    if (!this.active) return '';
    const s = this.step;
    if (!s) return '';
    const t = s.timer ? `  (${Math.max(0, Math.ceil(this.timer))}s)` : '';
    const heat = s.kind === 'escape' ? ' — clear your stars first' : '';
    return `${s.label}${heat}${t}`;
  }

  marker() {
    if (this.sideJob) return { x: this.sideJob.x, y: this.sideJob.y, color: '#57e6c9' };
    const s = this.step;
    if (!s || !this.active) return null;
    return { x: s.x, y: s.y, color: s.kind === 'target' ? '#ff5a5a' : '#ffd94f' };
  }
}
