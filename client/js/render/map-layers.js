'use strict';
/* ============================================================
   ОТРИСОВКА КАРТЫ
   Общие слои (сетка, подписи, объекты, ракеты, эффекты, линейка). Слои, которые различаются
   по режимам (зоны, техника, цели, план), рисует MODE.render.
   ============================================================ */

/* ---------- основной проход ---------- */
function draw(dtms) {
  if (!G) return;
  ANIM += dtms / 1000;
  if (worldRuns()) GANIM += dtms / 1000;
  const s = G.view.s;
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx.fillStyle = '#04070a';
  cx.fillRect(0, 0, CW, CH);

  /* подложка */
  if (TER) {
    cx.save();
    cx.translate(CW / 2, CH / 2); cx.scale(s, s); cx.translate(-G.view.x, -G.view.y);
    cx.imageSmoothingEnabled = s < 6;
    cx.drawImage(TER, 0, 0, WW, WH);
    cx.restore();
  }
  drawNightShade();
  drawCityLights(s);
  drawGrid(s);
  drawRadarSweep(s);
  MODE.render.zones(s);
  drawWeather(s);
  drawNames(s);
  if (G.showZones || G.sel) MODE.render.engagement(s);
  drawObjects(s);
  MODE.render.hq(s);
  MODE.render.tracks(s);
  MODE.render.units(s);
  drawFires(s);
  drawMissiles(s);
  MODE.render.threats(s);
  drawFx(s);
  drawSqFlash();
  drawPrecip(dtms);
  drawScreenFX();
  applyShake(dtms);
  drawWindRose();
  drawOverlay(s);
  if (MODE.render.plan) MODE.render.plan(s);
}

/* сетка квадратов — по ней идёт радиообмен */
function drawGrid(s) {
  if (s < 3.2) return;
  const a = clamp((s - 3.2) / 4, 0, .5);
  cx.strokeStyle = `rgba(150,190,210,${a * .3})`;
  cx.lineWidth = 1;
  cx.beginPath();
  for (let x = 0; x <= WW; x += GRID) { const q = w2s({ x, y: 0 }), q2 = w2s({ x, y: WH }); cx.moveTo(q.x, q.y); cx.lineTo(q2.x, q2.y) }
  for (let y = 0; y <= WH; y += GRID) { const q = w2s({ x: 0, y }), q2 = w2s({ x: WW, y }); cx.moveTo(q.x, q.y); cx.lineTo(q2.x, q2.y) }
  cx.stroke();
  if (s > 6) {
    cx.fillStyle = `rgba(150,190,210,${a * .55})`;
    cx.font = '10px ui-monospace, monospace';
    cx.textAlign = 'left';
    for (let x = 0; x <= WW - GRID; x += GRID) for (let y = 0; y <= WH - GRID; y += GRID) {
      const q = w2s({ x: x + 1, y: y + 5 });
      if (onScreen(q, 0)) cx.fillText(sq({ x: x + 1, y: y + 1 }), q.x, q.y);
    }
  }
}

/* названия городов и подписи */
function drawNames(s) {
  cx.textAlign = 'left';
  for (const c of WD.cities) {
    const q = w2s(c);
    if (!onScreen(q, 20)) continue;
    if (c.pop < 2 && s < 3.4) continue;
    const big = c.pop >= 2;
    cx.fillStyle = c.enemy ? 'rgba(255,150,130,.8)' : big ? 'rgba(226,235,240,.92)' : 'rgba(180,196,206,.7)';
    cx.font = `${big ? '600 ' : ''}${big ? 12 : 10.5}px system-ui, sans-serif`;
    cx.fillText(c.n, q.x + 6, q.y + 4);
    cx.fillStyle = c.enemy ? 'rgba(255,120,100,.85)' : 'rgba(200,215,225,.8)';
    cx.beginPath(); cx.arc(q.x, q.y, big ? 3 : 2, 0, 7); cx.fill();
  }
  if (s > 7) {
    cx.fillStyle = 'rgba(140,200,225,.6)';
    cx.font = 'italic 10px system-ui, sans-serif';
    for (const r of WD.rivers) {
      const p = r.pts[Math.floor(r.pts.length * .45)], q = w2s(p);
      if (onScreen(q, 0)) cx.fillText(r.n, q.x + 4, q.y - 3);
    }
  }
}

/* защищаемые объекты */
function drawObjects(s) {
  const selO = G.sel && G.sel.type === 'o' ? G.sel.id : null;
  const L = clamp(s * 5, 40, 120);
  for (const o of G.objs) {
    const q = w2s(o);
    if (!onScreen(q, L)) continue;
    const c = hpCol(o.hp);
    /* плашка с профилем объекта; разрушенный — серый */
    const W = L * 1.25, H = L * .8;
    drawPlate(cx, q.x, q.y, W, H, 'rgba(150,170,185,.45)', selO === o.id);
    drawIcon(cx, o.type, q.x, q.y, W * .88, o.hp <= 0 ? 'dead' : 'obj', false, o.hp <= 0 ? .75 : null);
    /* важность и состояние */
    const bw = Math.max(26, L * .9);
    cx.fillStyle = 'rgba(6,10,14,.75)';
    cx.fillRect(q.x - bw / 2, q.y + H / 2 + 3, bw, 4);
    cx.fillStyle = c;
    cx.fillRect(q.x - bw / 2, q.y + H / 2 + 3, bw * o.hp / 100, 4);
    if (s > 2.6) {
      cx.font = '600 11px system-ui, sans-serif';
      cx.textAlign = 'center';
      cx.fillStyle = 'rgba(0,0,0,.75)';
      cx.fillText(o.n, q.x + 1, q.y - H / 2 - 5 + 1);
      cx.fillStyle = o.hp <= 0 ? '#ff8f80' : '#e6eef2';
      cx.fillText(o.n, q.x, q.y - H / 2 - 5);
    }
    const hitAge = G.t - o.hitT;
    if (hitAge >= 0 && hitAge < 120 && G.phase === 'night') {
      const k = 1 - hitAge / 120;
      cx.strokeStyle = `rgba(255,90,60,${k * .8})`;
      cx.lineWidth = 2;
      cx.beginPath(); cx.arc(q.x, q.y, L * .62 + (1 - k) * 26, 0, 7); cx.stroke();
    }
  }
}

/* наши ракеты и перехватчики */
function drawMissiles(s) {
  for (const m of G.miss) {
    const q = w2s(m);
    /* дымный след: у хвоста тоньше и прозрачнее, у ракеты — плотнее */
    if (m.trail.length > 3) {
      const n = m.trail.length / 2, drone = m.kind === 'drone';
      let prev = w2s({ x: m.trail[0], y: m.trail[1] });
      for (let i = 1; i < n; i++) {
        const p = w2s({ x: m.trail[i * 2], y: m.trail[i * 2 + 1] }), k = i / n;
        cx.strokeStyle = drone ? `rgba(150,220,255,${.08 + k * .3})` : `rgba(215,225,232,${.06 + k * .4})`;
        cx.lineWidth = drone ? 1 : .8 + (1 - k) * 2.6;
        cx.beginPath(); cx.moveTo(prev.x, prev.y); cx.lineTo(p.x, p.y); cx.stroke();
        prev = p;
      }
    }
    if (!onScreen(q, 40)) continue;
    const L = m.kind === 'drone' ? clamp(s * 1.1, 8, 20) : clamp(s * 1.6, 11, 30);
    cx.save(); cx.translate(q.x, q.y); cx.rotate(m.a || 0); cx.scale(L, L);
    drawOwnMissile(cx, m.kind, GANIM);
    cx.restore();
  }
}

/* ---------- эффекты ---------- */
function drawFx(s) {
  const now = GANIM * 1000;
  G.fx = G.fx.filter(f => now - f.t0 < f.d);
  for (const f of G.fx) {
    const k = (now - f.t0) / f.d;
    if (f.k === 'tracer') {
      const a = w2s({ x: f.x, y: f.y }), b = w2s({ x: f.x2, y: f.y2 });
      cx.strokeStyle = `rgba(255,226,140,${(1 - k) * .9})`;
      cx.lineWidth = 1.6;
      cx.setLineDash([7, 9]); cx.lineDashOffset = -k * 60;
      cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
      cx.setLineDash([]); cx.lineDashOffset = 0;
    }
    else if (f.k === 'launch') {
      const a = w2s(f);
      const r = 4 + k * clamp(s * 1.6, 8, 26);
      const gr = cx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
      gr.addColorStop(0, `rgba(255,245,210,${(1 - k) * .95})`);
      gr.addColorStop(.5, `rgba(255,180,90,${(1 - k) * .5})`);
      gr.addColorStop(1, 'rgba(255,120,40,0)');
      cx.fillStyle = gr;
      cx.beginPath(); cx.arc(a.x, a.y, r, 0, 7); cx.fill();
    }
    else if (f.k === 'air') {
      const a = w2s(f);
      const R0 = clamp(s * (f.small ? .7 : 1.4), 7, 34);
      cx.strokeStyle = `rgba(190,235,255,${(1 - k) * .85})`;
      cx.lineWidth = 2 * (1 - k) + .5;
      cx.beginPath(); cx.arc(a.x, a.y, R0 * (.3 + k * 1.1), 0, 7); cx.stroke();
      if (!f.small) {
        cx.fillStyle = `rgba(255,240,200,${(1 - k) * .5})`;
        cx.beginPath(); cx.arc(a.x, a.y, R0 * .45 * (1 - k), 0, 7); cx.fill();
      }
    }
    else if (f.k === 'boom') {
      const a = w2s(f);
      const R0 = clamp(s * (f.small ? 1.1 : 2.4), 10, 60);
      const gr = cx.createRadialGradient(a.x, a.y, 0, a.x, a.y, R0 * (.4 + k));
      gr.addColorStop(0, `rgba(255,250,220,${(1 - k) * .9})`);
      gr.addColorStop(.35, `rgba(255,160,60,${(1 - k) * .7})`);
      gr.addColorStop(1, 'rgba(120,40,10,0)');
      cx.fillStyle = gr;
      cx.beginPath(); cx.arc(a.x, a.y, R0 * (.4 + k), 0, 7); cx.fill();
      cx.strokeStyle = `rgba(255,220,180,${(1 - k) * .5})`;
      cx.lineWidth = 1.5;
      cx.beginPath(); cx.arc(a.x, a.y, R0 * (.5 + k * 1.6), 0, 7); cx.stroke();
    }
    else if (f.k === 'fire') {
      const a = w2s(f);
      const R0 = clamp(s * 1.3, 8, 34);
      const pl = .6 + .4 * Math.sin(GANIM * 7 + f.x);
      cx.fillStyle = `rgba(255,140,50,${(1 - k) * .35 * pl})`;
      cx.beginPath(); cx.arc(a.x, a.y, R0 * pl, 0, 7); cx.fill();
      cx.fillStyle = `rgba(80,70,65,${(1 - k) * .25})`;
      cx.beginPath(); cx.ellipse(a.x - R0 * .6, a.y - R0 * 1.4, R0 * 1.3, R0 * .7, 0, 0, 7); cx.fill();
    }
  }
}

/* масштабная линейка, режимы, тревога */
function drawOverlay(s) {
  /* линейка */
  let km = 50;
  const target = 110;
  const steps = [5, 10, 20, 25, 50, 100, 200];
  for (const q of steps) if (q * s <= target * 1.5) km = q;
  const wpx = km * s;
  const x0 = mapLeft() + 16, y0 = CH - 20;
  cx.strokeStyle = 'rgba(220,230,236,.75)'; cx.lineWidth = 2;
  cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x0 + wpx, y0);
  cx.moveTo(x0, y0 - 4); cx.lineTo(x0, y0 + 4);
  cx.moveTo(x0 + wpx, y0 - 4); cx.lineTo(x0 + wpx, y0 + 4);
  cx.stroke();
  cx.font = '600 11px system-ui, sans-serif'; cx.textAlign = 'left';
  cx.fillStyle = 'rgba(220,230,236,.85)';
  cx.fillText(km + ' км', x0 + wpx + 8, y0 + 4);

  /* индикация тревоги */
  if (G.alarm && G.phase === 'night') {
    const pl = .5 + .5 * Math.sin(ANIM * 3.2);
    cx.strokeStyle = `rgba(255,91,71,${.22 + pl * .3})`;
    cx.lineWidth = 6;
    cx.strokeRect(3, 3, CW - 6, CH - 6);
  }
  /* режим установки / приказа */
  if (G.mode) {
    cx.font = '600 12px system-ui, sans-serif'; cx.textAlign = 'center';
    const txt = G.mode.t === 'place' ? 'Разместить: ' + UT[G.mode.k].n
      : G.mode.t === 'move' ? 'Точка выдвижения'
        : G.mode.t === 'patrol' ? 'Район патрулирования' : '';
    const w = cx.measureText(txt).width + 22;
    cx.fillStyle = 'rgba(28,24,16,.92)';
    rr(cx, CW / 2 - w / 2, 12, w, 26, 6); cx.fill();
    cx.strokeStyle = '#f2b33d'; cx.lineWidth = 1; cx.stroke();
    cx.fillStyle = '#ffd479';
    cx.fillText(txt, CW / 2, 29);
  }
}

/* ---------- пожары ----------
   Языки пламени (градиент от белёсого ядра к красному краю), мягкое
   зарево на земле, искры и столб дыма, который сносит ветром.
   Всё движется по часам мира — на паузе огонь замирает. */
function flameTongue(x, y, w, h, sway) {
  cx.beginPath();
  cx.moveTo(x - w / 2, y);
  cx.bezierCurveTo(x - w * .62, y - h * .45, x - w * .15 + sway * .5, y - h * .7, x + sway, y - h);
  cx.bezierCurveTo(x + w * .2 + sway * .5, y - h * .68, x + w * .62, y - h * .42, x + w / 2, y);
  cx.quadraticCurveTo(x, y + w * .32, x - w / 2, y);
  cx.closePath();
}

function drawFires(s) {
  const list = [];
  for (const o of G.objs) if (o.fire > 0) list.push([o, o.fire, 1]);
  for (const u of G.units) if (u.fire > 0) list.push([u, u.fire, .6]);
  if (!list.length) return;
  const T = GANIM;
  const wind = G.wind || { a: 0, v: 0 };
  const wx = Math.cos(wind.a) * (.3 + wind.v / 12), wy = Math.sin(wind.a) * (.3 + wind.v / 12);
  const zoom = clamp(s / 4, .6, 1.6);
  for (const [p, f, k] of list) {
    const q = w2s(p);
    if (!onScreen(q, 140)) continue;
    const R = (5 + f * 9) * k * zoom;
    const seed = p.x * 13.7 + p.y * 7.1;
    /* дым: клубы поднимаются, растут, бледнеют, их сносит ветром */
    cx.save();
    for (let i = 0; i < 7; i++) {
      const ph = (T * .18 + i / 7 + seed) % 1;
      const r = R * (.45 + ph * 1.3);
      const sx = q.x + wx * ph * R * 3.2 + Math.sin(seed + i) * R * .2;
      const sy = q.y - R * .8 - ph * R * 4.2 + wy * ph * R * 1.5;
      const g = cx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(84,80,76,${(1 - ph) * .5 * f + .06})`);
      g.addColorStop(1, 'rgba(84,80,76,0)');
      cx.fillStyle = g;
      cx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    cx.restore();
    cx.save();
    cx.globalCompositeOperation = 'lighter';
    /* зарево на земле */
    const gr = R * 2.6;
    const g0 = cx.createRadialGradient(q.x, q.y, 0, q.x, q.y, gr);
    g0.addColorStop(0, `rgba(255,120,40,${.14 + .14 * f})`);
    g0.addColorStop(1, 'rgba(255,90,30,0)');
    cx.fillStyle = g0;
    cx.beginPath(); cx.ellipse(q.x, q.y, gr, gr * .6, 0, 0, 7); cx.fill();
    cx.globalCompositeOperation = 'source-over';
    /* языки пламени: внешние красно-оранжевые, внутри — жёлтое ядро */
    const n = 1 + Math.round(f * 2);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * R * .38;
      const fl = .75 + .25 * Math.sin(T * (7 + i * 1.7) + seed + i * 2.3) * Math.sin(T * 4.3 + i);
      const h = R * (1.7 + (i % 2 ? .2 : .6)) * fl, w = R * .55;
      const sway = Math.sin(T * 5 + i + seed) * R * .18 + wx * R * .5;
      const go = cx.createLinearGradient(0, q.y, 0, q.y - h);
      go.addColorStop(0, 'rgba(255,160,55,.85)');
      go.addColorStop(.5, 'rgba(235,85,30,.6)');
      go.addColorStop(1, 'rgba(160,30,10,0)');
      cx.fillStyle = go;
      flameTongue(q.x + off, q.y, w, h, sway); cx.fill();
      const gi = cx.createLinearGradient(0, q.y, 0, q.y - h * .6);
      gi.addColorStop(0, 'rgba(255,246,205,.9)');
      gi.addColorStop(.6, 'rgba(255,200,90,.5)');
      gi.addColorStop(1, 'rgba(255,160,60,0)');
      cx.fillStyle = gi;
      flameTongue(q.x + off, q.y, w * .45, h * .62, sway * .6); cx.fill();
    }
    /* искры */
    for (let i = 0; i < 3 + Math.round(f * 5); i++) {
      const ph = (T * .7 + i * .37 + seed) % 1;
      const ex = q.x + Math.sin(seed * 3 + i * 1.9) * R * .6 + wx * ph * R * 2;
      const ey = q.y - R * .6 - ph * R * 3;
      cx.fillStyle = `rgba(255,${190 + (i * 13) % 60},90,${(1 - ph) * .9})`;
      cx.fillRect(ex, ey, 1.6, 1.6);
    }
    cx.restore();
  }
}

/** подсветка квадрата, выбранного в журнале: рамка гаснет за 3 с */
function drawSqFlash() {
  const f = G.sqFlash;
  if (!f) return;
  const k = 1 - (ANIM - f.t) / 3;
  if (k <= 0) { G.sqFlash = null; return }
  const a = w2s({ x: f.x - GRID / 2, y: f.y - GRID / 2 }), b = w2s({ x: f.x + GRID / 2, y: f.y + GRID / 2 });
  cx.save();
  cx.strokeStyle = `rgba(242,179,61,${k})`; cx.lineWidth = 2;
  cx.setLineDash([6, 4]);
  cx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  cx.fillStyle = `rgba(242,179,61,${k * .08})`;
  cx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  cx.restore();
}
