// render.js — everything the player sees, drawn on a 2D canvas with
// plain shapes: no sprites, no images, no fonts to load. The world pass
// paints ground, roads, props and rooftops; entity passes draw cars and
// people sorted by depth; the HUD pass draws bars, stars, the minimap,
// objective and dialogue panels, and the menu screens (title, pause,
// busted / wasted) are full-screen passes of their own.

import { CELL, ROAD_W, WORLD_W, WORLD_H, districtAt, DISTRICTS } from './city.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- World -----------------------------------------------------------------

export function drawWorld(ctx, g, cam, W, H) {
  const viewRight = Math.min(WORLD_W, cam.x + W + 40);
  const viewBottom = Math.min(WORLD_H, cam.y + H + 40);
  void viewRight; void viewBottom;

  // Base ground: warm grass with a faint per-district tint wash.
  ctx.fillStyle = '#7ba361';
  ctx.fillRect(0, 0, W, H);
  for (const d of DISTRICTS) {
    const sx = d.x - cam.x;
    const sy = d.y - cam.y;
    if (sx + d.w < 0 || sy + d.h < 0 || sx > W || sy > H) continue;
    ctx.fillStyle = d.tint;
    ctx.globalAlpha = 0.16;
    ctx.fillRect(sx, sy, d.w, d.h);
    ctx.globalAlpha = 1;
  }
  drawDistrictNames(ctx, cam, W, H);

  // The bay: a band of water along the south-west shore, drawn over the
  // ground but under the roads so bridges read as causeways.
  ctx.fillStyle = '#2b6ea8';
  ctx.fillRect(-cam.x, WORLD_H - 130 - cam.y, 1180, 130);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 9; i++) {
    const wx = ((i * 173 + Math.floor(g.time * 22)) % 1180) - cam.x;
    const wy = WORLD_H - 108 + (i % 3) * 34 - cam.y;
    if (wy > -6 && wy < H + 6) ctx.fillRect(wx, wy, 42, 3);
  }

  // Sidewalk slabs under each block, slightly proud of the roads.
  ctx.fillStyle = '#bdb6a6';
  for (let bx = 0; bx < 6; bx++) {
    for (let by = 0; by < 6; by++) {
      const sx = bx * CELL + ROAD_W - cam.x - 8;
      const sy = by * CELL + ROAD_W - cam.y - 8;
      if (sx + CELL < 0 || sy + CELL < 0 || sx > W || sy > H) continue;
      ctx.fillRect(sx, sy, CELL - ROAD_W + 16, CELL - ROAD_W + 16);
    }
  }

  // Roads: full-length strips in both directions.
  ctx.fillStyle = '#3d4149';
  for (let i = 0; i <= 6; i++) {
    const p = i * CELL;
    if (p - cam.x + ROAD_W > 0 && p - cam.x < W) ctx.fillRect(p - cam.x, 0, ROAD_W, H);
    if (p - cam.y + ROAD_W > 0 && p - cam.y < H) ctx.fillRect(0, p - cam.y, W, ROAD_W);
  }

  // Centre-line dashes.
  ctx.fillStyle = '#ecd653';
  for (let i = 0; i <= 6; i++) {
    const c = i * CELL + ROAD_W / 2;
    for (let d = 20; d < WORLD_W; d += 64) {
      if (d > cam.x - 60 && d < cam.x + W + 60) ctx.fillRect(d - cam.x, c - cam.y - 2, 34, 4);
      if (d > cam.y - 60 && d < cam.y + H + 60) ctx.fillRect(c - cam.x - 2, d - cam.y, 4, 34);
    }
  }

  // Crosswalk stripes on the near edges of every intersection.
  ctx.fillStyle = 'rgba(240,240,240,0.5)';
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      const ix = i * CELL - cam.x;
      const iy = j * CELL - cam.y;
      if (ix < -ROAD_W || iy < -ROAD_W || ix > W || iy > H) continue;
      for (let s = 0; s < 4; s++) {
        ctx.fillRect(ix + 8 + s * 28, iy + 2, 16, 7);
        ctx.fillRect(ix + 8 + s * 28, iy + ROAD_W - 9, 16, 7);
      }
    }
  }

  drawProps(ctx, g, cam, W, H);
  drawBuildings(ctx, g, cam, W, H);
  drawMarker(ctx, g, cam);
}

function drawDistrictNames(ctx, cam, W, H) {
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  for (const d of DISTRICTS) {
    const cx = d.x + d.w / 2 - cam.x;
    const cy = d.y + d.h / 2 - cam.y;
    if (cx < -300 || cy < -60 || cx > W + 300 || cy > H + 60) continue;
    ctx.fillText(d.name.toUpperCase(), cx, cy);
  }
}

function drawProps(ctx, g, cam, W, H) {
  for (const p of g.city.props) {
    const sx = p.x - cam.x;
    const sy = p.y - cam.y;
    if (sx < -30 || sy < -30 || sx > W + 30 || sy > H + 30) continue;
    if (p.kind === 'palm') {
      ctx.fillStyle = '#6d4c2f';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
      ctx.strokeStyle = '#41a351';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let f = 0; f < 5; f++) {
        const a = (f / 5) * Math.PI * 2 + 0.4;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a) * 13, sy + Math.sin(a) * 13);
      }
      ctx.stroke();
    } else if (p.kind === 'hydrant') {
      ctx.fillStyle = '#c9403c';
      ctx.fillRect(sx - 3, sy - 4, 6, 8);
      ctx.fillStyle = '#e8e8ec';
      ctx.fillRect(sx - 3, sy - 5, 6, 2);
    } else { // streetlight
      ctx.fillStyle = '#2c2f36';
      ctx.fillRect(sx - 2, sy - 8, 4, 16);
      ctx.fillStyle = '#ffe9a3';
      ctx.beginPath();
      ctx.arc(sx, sy - 9, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBuildings(ctx, g, cam, W, H) {
  for (const b of g.city.buildings) {
    const sx = b.x - cam.x;
    const sy = b.y - cam.y;
    if (sx + b.w < 0 || sy + b.h < 0 || sx > W || sy > H) continue;
    // Drop shadow first, then the roof slab and an inner highlight.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(sx + 7, sy + 9, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(sx, sy, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(sx + 8, sy + 8, b.w - 16, b.h - 16);
    if (b.roof === 'trim') {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 5;
      ctx.strokeRect(sx + 12, sy + 12, b.w - 24, b.h - 24);
    }
    // Window grid; a deterministic pattern per building so roofs do not
    // all look identical, plus a rooftop plant box in the middle.
    ctx.fillStyle = 'rgba(20,24,40,0.55)';
    const cols = Math.floor(b.w / 34);
    const rows = Math.floor(b.h / 34);
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if ((cx * 7 + cy * 13 + b.floors) % 3 === 0) continue;
        ctx.fillRect(sx + 16 + cx * 34, sy + 16 + cy * 34, 14, 10);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(sx + b.w * 0.38, sy + b.h * 0.38, b.w * 0.24, b.h * 0.24);
    if (b.name) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name.toUpperCase(), sx + b.w / 2, sy + 22);
    }
  }
}

// The pulsing objective beacon: a ring, a translucent disc and a
// bobbing chevron over the current mission or side-job marker.
function drawMarker(ctx, g, cam) {
  const mk = g.missions.marker();
  if (!mk || g.state !== 'play') return;
  const sx = mk.x - cam.x;
  const sy = mk.y - cam.y;
  const pulse = 26 + Math.sin(g.time * 5) * 6;
  ctx.strokeStyle = mk.color;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(sx, sy, pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = mk.color;
  ctx.globalAlpha = 0.25;
  ctx.beginPath(); ctx.arc(sx, sy, pulse, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = mk.color;
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('▼', sx, sy - pulse - 8 + Math.sin(g.time * 5) * 4);
}

// --- Entities ----------------------------------------------------------------

export function drawCar(ctx, car, cam) {
  const sx = car.x - cam.x;
  const sy = car.y - cam.y;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(car.angle);
  const L = car.w;
  const Wd = car.l;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-L / 2 + 3, -Wd / 2 + 4, L, Wd);
  ctx.fillStyle = car.dead ? '#3a3a3a' : car.color;
  roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 7);
  ctx.fill();
  // Cabin and windshield.
  ctx.fillStyle = car.police ? '#20242c' : 'rgba(18,24,38,0.85)';
  roundRect(ctx, -L * 0.16, -Wd / 2 + 3, L * 0.36, Wd - 6, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,210,240,0.7)';
  ctx.fillRect(L * 0.14, -Wd / 2 + 4, 4, Wd - 8);
  // Wheels.
  ctx.fillStyle = '#14161a';
  ctx.fillRect(-L / 2 + 4, -Wd / 2 - 2, 10, 5);
  ctx.fillRect(-L / 2 + 4, Wd / 2 - 3, 10, 5);
  ctx.fillRect(L / 2 - 14, -Wd / 2 - 2, 10, 5);
  ctx.fillRect(L / 2 - 14, Wd / 2 - 3, 10, 5);
  // Brake lights while a traffic car is holding for an obstacle.
  if (car.brake && !car.dead) {
    ctx.fillStyle = '#ff2d2d';
    ctx.fillRect(-L / 2 - 2, -Wd / 2 + 3, 3, 5);
    ctx.fillRect(-L / 2 - 2, Wd / 2 - 8, 3, 5);
  }
  if (car.kind === 'taxi') {
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-6, -5, 12, 10);
    ctx.fillStyle = '#ffd94f';
    ctx.font = 'bold 8px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
  }
  if (car.police) {
    ctx.fillStyle = '#274b8f';
    ctx.fillRect(-L / 2, -3, L, 6);
    // The light bar alternates red/blue twice a second.
    const flash = Math.floor(performance.now() / 220) % 2 === 0;
    ctx.fillStyle = flash ? '#ff4040' : '#4066ff';
    ctx.fillRect(-4, -Wd / 2 + 2, 8, 5);
    ctx.fillStyle = flash ? '#4066ff' : '#ff4040';
    ctx.fillRect(-4, Wd / 2 - 7, 8, 5);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('PSPD', 0, -6);
  }
  // A damaged engine smokes before it dies.
  if (!car.dead && car.health < 45) {
    ctx.fillStyle = `rgba(60,60,60,${0.35 + Math.random() * 0.2})`;
    ctx.beginPath();
    ctx.arc(L / 2 - 2, 0, 5 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawPerson(ctx, p, cam, isPlayer, aimAngle) {
  const sx = p.x - cam.x;
  const sy = p.y - cam.y;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 3, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (p.dead) {
    // Fallen: body rotated flat, head to one side.
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = p.color;
    roundRect(ctx, -10, -5, 20, 10, 5); ctx.fill();
    ctx.fillStyle = '#e8b98d';
    ctx.beginPath(); ctx.arc(13, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  if (isPlayer) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
  }
  if (p.isTarget) {
    ctx.strokeStyle = 'rgba(255,60,60,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
  }
  // Legs swing with the walk cycle.
  const swing = Math.sin(p.walkPhase || 0) * 4;
  ctx.strokeStyle = '#2e3440';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 2); ctx.lineTo(swing, 10);
  ctx.moveTo(0, 2); ctx.lineTo(-swing, 10);
  ctx.stroke();
  ctx.rotate(p.angle || 0);
  ctx.fillStyle = p.color;
  roundRect(ctx, -7, -7, 14, 14, 6); ctx.fill();
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath(); ctx.arc(2, 0, 5.5, 0, Math.PI * 2); ctx.fill();
  if (p.cop) {
    ctx.fillStyle = '#ffd94f';
    ctx.fillRect(4, -4, 3, 8); // badge stripe
  }
  if (isPlayer) {
    // The aim arm rotates independently of the body so the player can
    // strafe and shoot in different directions.
    ctx.rotate((aimAngle || 0) - (p.angle || 0));
    ctx.strokeStyle = '#e8b98d';
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(4, 3); ctx.lineTo(13, 3); ctx.stroke();
    if (p.weapon === 'pistol') {
      ctx.fillStyle = '#191c20';
      ctx.fillRect(12, 1.5, 8, 3);
    }
  }
  ctx.restore();
}

export function drawEffects(ctx, g, cam) {
  for (const fx of g.effects) {
    const sx = fx.x - cam.x;
    const sy = fx.y - cam.y;
    if (fx.kind === 'muzzle') {
      ctx.fillStyle = `rgba(255,210,80,${Math.max(0, fx.life * 6)})`;
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.1, 9 * fx.life * 4), 0, Math.PI * 2); ctx.fill();
    } else if (fx.kind === 'spark') {
      ctx.fillStyle = `rgba(255,160,60,${Math.min(1, fx.life * 3)})`;
      ctx.fillRect(sx - 3, sy - 3, 6, 6);
    } else if (fx.kind === 'cash') {
      ctx.fillStyle = `rgba(87,230,140,${Math.min(1, fx.life)})`;
      ctx.font = 'bold 15px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(fx.text, sx, sy - (1 - fx.life) * 26);
    } else if (fx.kind === 'ring') {
      ctx.strokeStyle = `rgba(255,255,255,${fx.life})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, (1 - fx.life) * 30 + 6, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // Bullet tracers: a short bright segment trailing each live round.
  ctx.strokeStyle = 'rgba(255,230,150,0.85)';
  ctx.lineWidth = 2;
  for (const b of g.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - cam.x, b.y - cam.y);
    ctx.lineTo(b.x - cam.x - Math.cos(b.angle) * 12, b.y - cam.y - Math.sin(b.angle) * 12);
    ctx.stroke();
  }
}

// --- HUD ---------------------------------------------------------------------

function bar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(8,10,16,0.75)';
  roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 4); ctx.fill();
  const filled = w * Math.max(0, Math.min(1, frac));
  if (filled > 0) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, filled, h, 3); ctx.fill();
  }
  if (label) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 9px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 4, y + h - 3);
  }
}

function wrapText(ctx, text, cx, y, maxW, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    if (line && ctx.measureText(`${line} ${word}`).width > maxW) {
      ctx.fillText(line, cx, yy);
      yy += lineHeight;
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
}

export function drawHUD(ctx, g, W, H) {
  const p = g.player;

  // Top-left cluster: health, armor, cash and the current weapon.
  bar(ctx, 16, 14, 190, 15, p.health / 100, '#e5484d', 'HEALTH');
  bar(ctx, 16, 34, 190, 11, p.armor / 100, '#5a8fd6', 'ARMOR');
  ctx.textAlign = 'left';
  ctx.font = 'bold 19px system-ui';
  ctx.fillStyle = '#57e68c';
  ctx.fillText(`$${p.cash.toLocaleString()}`, 16, 72);
  ctx.font = '13px system-ui';
  ctx.fillStyle = '#e8e8ec';
  ctx.fillText(
    p.inVehicle ? 'IN VEHICLE — E to exit' : `WEAPON: ${p.weapon === 'pistol' ? 'PISTOL' : 'FISTS'}  (1/2, click to attack)`,
    16, 92,
  );

  // Wanted stars, top centre, with the BUSTED meter underneath while
  // officers are close enough to make an arrest on foot.
  ctx.font = '30px system-ui';
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < g.wanted.stars ? '#ffd94f' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', W / 2 - 64 + i * 32, 40);
  }
  if (g.wanted.bustMeter > 0.02 && !p.inVehicle) {
    bar(ctx, W / 2 - 90, 52, 180, 10, g.wanted.bustMeter, '#ff5a5a', 'BUSTED');
  }

  // District name and minimap, top right.
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px system-ui';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(districtAt(p.x, p.y).name.toUpperCase(), W - 16, 24);
  drawMinimap(ctx, g, W - 176, 32, 160);

  // Objective panel, bottom left.
  const objective = g.missions.objectiveText();
  if (objective && g.state === 'play') {
    ctx.fillStyle = 'rgba(10,14,22,0.72)';
    roundRect(ctx, 14, H - 64, Math.min(560, 24 + objective.length * 7.4), 46, 8);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd94f';
    ctx.font = 'bold 12px system-ui';
    ctx.fillText('OBJECTIVE', 26, H - 42);
    ctx.fillStyle = '#fff';
    ctx.font = '14px system-ui';
    ctx.fillText(objective, 26, H - 24);
  }

  // Dialogue line from Sol (or a mission giver), bottom centre.
  if (g.dialogue && g.dialogueTimer > 0) {
    const w = Math.min(W - 80, 90 + g.dialogue.length * 6.4);
    ctx.fillStyle = 'rgba(10,14,22,0.8)';
    roundRect(ctx, (W - w) / 2, H - 128, w, 52, 8);
    ctx.fill();
    ctx.fillStyle = '#9fd8ff';
    ctx.font = '13.5px system-ui';
    ctx.textAlign = 'center';
    wrapText(ctx, g.dialogue, W / 2, H - 104, w - 30, 17);
  }

  // Mission banner (complete / failed) under the stars.
  if (g.missions.bannerTimer > 0 && g.missions.banner) {
    ctx.fillStyle = 'rgba(10,14,22,0.75)';
    roundRect(ctx, W / 2 - 260, 84, 520, 54, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd94f';
    ctx.font = 'bold 21px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(g.missions.banner, W / 2, 119);
  }

  // Short-lived toast messages stack under the banner.
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px system-ui';
  g.toasts.forEach((t, i) => {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, t.life)})`;
    ctx.fillText(t.text, W / 2, 168 + i * 22);
  });

  // Speedometer and vehicle damage while driving, bottom right.
  if (p.inVehicle) {
    const kmh = Math.round(Math.abs(p.inVehicle.speed) * 0.55);
    ctx.fillStyle = 'rgba(10,14,22,0.7)';
    roundRect(ctx, W - 128, H - 74, 112, 56, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(String(kmh), W - 72, H - 42);
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#9aa5b1';
    ctx.fillText('KM/H', W - 72, H - 26);
    const dmg = p.inVehicle.health;
    bar(ctx, W - 120, H - 92, 96, 7, dmg / 100, dmg > 40 ? '#57e68c' : '#e5484d', '');
  }

  if (g.muted) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText('MUTED (M)', W - 16, H - 10);
  }
}

// North-up minimap: roads as a grid, the bay in the corner, blue dots
// for police, a coloured dot for the objective and a white arrow for
// the player that turns with their heading.
export function drawMinimap(ctx, g, x, y, size) {
  const scale = size / WORLD_W;
  ctx.save();
  ctx.fillStyle = 'rgba(12,18,28,0.88)';
  roundRect(ctx, x - 3, y - 3, size + 6, size + 6, 8); ctx.fill();
  ctx.beginPath();
  roundRect(ctx, x, y, size, size, 6); ctx.clip();
  ctx.fillStyle = '#5d7d4a';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#454a54';
  for (let i = 0; i <= 6; i++) {
    const p = i * CELL * scale;
    ctx.fillRect(x + p, y, ROAD_W * scale, size);
    ctx.fillRect(x, y + p, size, ROAD_W * scale);
  }
  ctx.fillStyle = '#2b6ea8';
  ctx.fillRect(x, y + size * 0.86, size * 0.3, size * 0.14);
  const dot = (wx, wy, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x + wx * scale, y + wy * scale, r, 0, Math.PI * 2); ctx.fill();
  };
  const mk = g.missions.marker();
  if (mk) dot(mk.x, mk.y, mk.color, 4.5);
  for (const c of g.cars) if (c.police && !c.dead) dot(c.x, c.y, '#4066ff', 2.6);
  for (const o of g.officers) if (!o.dead) dot(o.x, o.y, '#4066ff', 2.2);
  const p = g.player;
  ctx.save();
  ctx.translate(x + p.x * scale, y + p.y * scale);
  ctx.rotate(p.inVehicle ? p.inVehicle.angle : p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('N ↑', x + 4, y + 12);
}

// --- Screens -------------------------------------------------------------------

export function drawTitleScreen(ctx, g, W, H, hasSave) {
  void g;
  // Dusk gradient sky over a lit skyline, a road strip at the bottom.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1b2a4a');
  grad.addColorStop(0.55, '#7a2d5e');
  grad.addColorStop(1, '#e07f3c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  const base = H * 0.72;
  ctx.fillStyle = 'rgba(10,12,24,0.85)';
  let x = 0;
  let i = 0;
  while (x < W) {
    const bw = 46 + ((i * 67) % 60);
    const bh = 90 + ((i * 113) % 190);
    ctx.fillRect(x, base - bh, bw, bh);
    ctx.fillStyle = '#ffd94f';
    for (let wy = base - bh + 12; wy < base - 14; wy += 18) {
      for (let wx = x + 7; wx < x + bw - 10; wx += 15) {
        if ((wx * 3 + wy * 7 + i) % 4 !== 0) ctx.fillRect(wx, wy, 6, 8);
      }
    }
    ctx.fillStyle = 'rgba(10,12,24,0.85)';
    x += bw + 6;
    i++;
  }
  ctx.fillStyle = '#12101f';
  ctx.fillRect(0, base, W, H - base);
  ctx.fillStyle = '#e8d44f';
  for (let d = 30; d < W; d += 90) ctx.fillRect(d, base + (H - base) / 2, 44, 5);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94f';
  ctx.font = 'bold 26px system-ui';
  ctx.fillText('V I C E   H A R B O R', W / 2, H * 0.20);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 84px system-ui';
  ctx.shadowColor = '#ff5aa0';
  ctx.shadowBlur = 26;
  ctx.fillText('NEON STREETS', W / 2, H * 0.20 + 78);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#cfe8ff';
  ctx.font = '17px system-ui';
  ctx.fillText('An original open-world crime game in the coastal city of Port Solana', W / 2, H * 0.20 + 112);

  ctx.font = 'bold 21px system-ui';
  ctx.fillStyle = '#57e68c';
  ctx.fillText(
    hasSave ? '▶  PRESS ENTER — CONTINUE      ·      N — NEW GAME' : '▶  PRESS ENTER — START YOUR FIRST NIGHT',
    W / 2, H * 0.86,
  );
  ctx.fillStyle = '#e8e8ec';
  ctx.font = '14.5px system-ui';
  ctx.fillText('WASD / Arrows — move & drive · E — enter / exit car · Mouse — aim · Click — punch / shoot', W / 2, H * 0.905);
  ctx.fillText('1 / 2 — fists / pistol · Space — handbrake · T — taxi fare · J — package run · H — help · P — pause · M — mute', W / 2, H * 0.932);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '12px system-ui';
  ctx.fillText('Steal cars, run Sol\'s jobs, dodge the PSPD. Progress saves automatically in your browser.', W / 2, H * 0.965);
}

export function drawEndScreen(ctx, g, W, H, kind) {
  void g;
  ctx.fillStyle = kind === 'busted' ? 'rgba(20,40,110,0.82)' : 'rgba(110,16,16,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 92px system-ui';
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', W / 2, H / 2 - 20);
  ctx.font = '18px system-ui';
  ctx.fillStyle = '#dfe8ff';
  ctx.fillText(
    kind === 'busted'
      ? 'The Port Solana PD got their cuffs on you. You pay a fine and walk out at dawn.'
      : 'You flatline on the asphalt of Port Solana. The clinic patches you up — for a fee.',
    W / 2, H / 2 + 28,
  );
  ctx.font = 'bold 19px system-ui';
  ctx.fillStyle = '#ffd94f';
  ctx.fillText('PRESS ENTER TO RESPAWN', W / 2, H / 2 + 76);
}

export function drawPause(ctx, g, W, H) {
  ctx.fillStyle = 'rgba(8,10,18,0.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94f';
  ctx.font = 'bold 44px system-ui';
  ctx.fillText('PAUSED', W / 2, H * 0.30);
  ctx.fillStyle = '#ffffff';
  ctx.font = '17px system-ui';
  const lines = [
    'WASD / Arrow keys — walk and drive',
    'E — enter / exit the nearest car    F — same',
    'Mouse — aim · Left click — punch or shoot',
    '1 — fists · 2 — pistol',
    'Space — handbrake drift · Shift — sprint on foot',
    'T — take a taxi fare · J — take a package run',
    'H — this help · P / Esc — resume · M — mute',
    '',
    'Crimes raise your wanted stars. Break line of sight',
    'and stay hidden to cool off. Five stars brings the whole PSPD.',
  ];
  lines.forEach((line, idx) => ctx.fillText(line, W / 2, H * 0.30 + 52 + idx * 26));
  ctx.fillStyle = '#57e68c';
  ctx.font = 'bold 16px system-ui';
  ctx.fillText(
    `Cash $${g.player.cash.toLocaleString()} · Missions done: ${g.missionsDone}/3 · Progress is saved automatically`,
    W / 2, H * 0.30 + 52 + lines.length * 26 + 14,
  );
}
