'use strict';
/* ============================================================
   АТМОСФЕРА КАРТЫ (клиент)
   ночь и рассвет · огни городов, гаснущие с энергосистемой ·
   развёртка радара · зерно и виньетка «экрана штаба» ·
   дрожь от близких разрывов · плашка подлёта баллистики
   ============================================================ */

/* районы городов: постоянные точки огней вокруг центра (свой «сид» на город) */
const CITY_LIGHTS = new Map();
function cityLights(c) {
  let L = CITY_LIGHTS.get(c.n);
  if (L) return L;
  let seed = 0;
  for (const ch of c.n) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  L = [];
  const n = 6 + c.pop * 9;
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * (c.pop * 2 + 1.5);
    L.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, k: rnd(), sz: .5 + rnd() * .9 });
  }
  CITY_LIGHTS.set(c.n, L);
  return L;
}

/** сколько света у города: общая энергосистема, а рядом с разбитой подстанцией — меньше */
function cityPower(c) {
  if (c.enemy) return .9;
  let p = clamp(energy() / 100, 0, 1);
  for (const o of G.objs) if (OT[o.type].en && dist(o, c) < 45) p = Math.min(p, .25 + o.hp / 100 * .85);
  return p;
}

const isDark = () => G.phase === 'night' || G.phase === 'debrief';

/** доля рассвета: 0 — глухая ночь, 1 — светло */
function dawnK() {
  if (G.phase === 'debrief' || G.phase === 'final') return 1;
  if (G.phase !== 'night') return 1;
  return clamp((G.t - (NIGHT_LEN - 4200)) / 4200, 0, 1);
}

function drawNightShade() {
  if (G.phase === 'prep') return;
  const k = dawnK();
  cx.save();
  clipMap();
  cx.fillStyle = `rgba(4,10,24,${.34 * (1 - k)})`;
  cx.fillRect(0, 0, CW, CH);
  if (k > 0 && k < 1) {
    /* рассвет приходит с востока */
    const g = cx.createLinearGradient(CW, 0, 0, 0);
    g.addColorStop(0, `rgba(255,150,90,${.13 * Math.sin(k * Math.PI)})`);
    g.addColorStop(.6, 'rgba(255,150,90,0)');
    cx.fillStyle = g;
    cx.fillRect(0, 0, CW, CH);
  }
  cx.restore();
}

function drawCityLights(s) {
  if (!isDark()) return;
  const fade = 1 - dawnK() * .8;
  cx.save();
  cx.globalCompositeOperation = 'lighter';
  for (const c of WD.cities) {
    const q = w2s(c);
    if (!onScreen(q, 120)) continue;
    const pw = cityPower(c);
    let lit = 0;
    for (const p of cityLights(c)) {
      if (p.k > pw) continue;
      lit++;
      /* при слабой сети свет мерцает */
      const fl = pw < .5 ? .6 + .4 * Math.sin(GANIM * (3 + p.k * 7) + p.x) : 1;
      const r = Math.max(1.6, p.sz * 1.4 * clamp(s / 2.2, .8, 2.6));
      const qq = w2s(p);
      cx.fillStyle = c.enemy ? `rgba(255,200,140,${.4 * fade})` : `rgba(255,218,150,${.75 * fl * fade})`;
      cx.fillRect(qq.x - r / 2, qq.y - r / 2, r, r);
    }
    /* общее зарево города */
    if (lit) {
      const R = (c.pop * 3.4 + 5) * s;
      const g = cx.createRadialGradient(q.x, q.y, 0, q.x, q.y, R);
      g.addColorStop(0, `rgba(255,190,110,${.2 * fade * lit / cityLights(c).length})`);
      g.addColorStop(1, 'rgba(255,190,110,0)');
      cx.fillStyle = g;
      cx.fillRect(q.x - R, q.y - R, R * 2, R * 2);
    }
  }
  cx.restore();
}

/** развёртка радара от штаба (ПВО) или от центра края (налёт) — едва заметная */
function drawRadarSweep(s) {
  if (G.phase !== 'night') return;
  const c = Game.role === 'def' && G.hq ? G.hq : { x: WW * .45, y: WH * .45 };
  const q = w2s(c), R = 180 * s, a = GANIM * .9 % 6.283;
  cx.save();
  clipMap();
  cx.translate(q.x, q.y);
  cx.rotate(a);
  const g = cx.createLinearGradient(0, 0, R, 0);
  g.addColorStop(0, 'rgba(110,220,160,.10)');
  g.addColorStop(1, 'rgba(110,220,160,0)');
  cx.fillStyle = g;
  cx.beginPath(); cx.moveTo(0, 0); cx.arc(0, 0, R, -.18, 0); cx.closePath(); cx.fill();
  cx.strokeStyle = 'rgba(130,240,180,.13)'; cx.lineWidth = 1;
  cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(R, 0); cx.stroke();
  cx.restore();
}

/* зерно: маленькая шумовая плитка, раз создаётся */
let GRAIN = null;
function grainTile() {
  if (GRAIN) return GRAIN;
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d'), d = g.createImageData(96, 96);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255 | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 18 }
  g.putImageData(d, 0, 0);
  GRAIN = c;
  return c;
}

/** «экран штаба»: виньетка, лёгкое зерно, тонкие строки развёртки */
function drawScreenFX() {
  cx.save();
  const v = cx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * .35, CW / 2, CH / 2, Math.max(CW, CH) * .75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,.42)');
  cx.fillStyle = v;
  cx.fillRect(0, 0, CW, CH);
  const t = grainTile();
  if (t && cx.createPattern) {
    const p = cx.createPattern(t, 'repeat');
    if (p) {
      cx.globalAlpha = .55;
      cx.translate((Math.random() * 96) | 0, (Math.random() * 96) | 0);
      cx.fillStyle = p;
      cx.fillRect(-96, -96, CW + 192, CH + 192);
    }
  }
  cx.restore();
}

/* ---------- дрожь экрана от близкого разрыва ---------- */
let SHAKE = 0;
function shakeFrom(o) {
  if (!G) return;
  const q = w2s(o);
  const far = Math.hypot((q.x - CW / 2) / (CW / 2), (q.y - CH / 2) / (CH / 2));
  const zoom = clamp((G.view.s - 1.4) / 7, 0, 1);
  const k = clamp(1 - far, 0, 1) * (.3 + .7 * zoom) * (o.small ? .4 : 1);
  if (k > .15) SHAKE = Math.max(SHAKE, k * 7);
}
function applyShake(dtms) {
  const el = document.getElementById('map');
  if (!el) return;
  if (SHAKE < .2) { if (el.style.transform) el.style.transform = ''; SHAKE = 0; return }
  el.style.transform = `translate(${(Math.random() - .5) * SHAKE}px,${(Math.random() - .5) * SHAKE}px)`;
  SHAKE *= Math.pow(.02, dtms / 1000);
}

/* ---------- баллистика: плашка подлёта ---------- */
function ballisticETA() {
  let best = null;
  for (const th of G.threats) {
    if (th.dead || (th.cls !== 'ballistic' && th.cls !== 'aeroball')) continue;
    if (Game.role === 'def' && !th.vis) continue;
    const end = th.path && th.path[th.path.length - 1];
    if (!end) continue;
    const eta = dist(th, end) / (th.sp || 1);
    if (!best || eta < best.eta) best = { eta, th };
  }
  return best;
}

function renderBalBar() {
  const el = document.getElementById('balbar');
  if (!el) return;
  const b = G && G.phase === 'night' ? ballisticETA() : null;
  if (!b) { if (el.style.display !== 'none') el.style.display = 'none'; return }
  const m = Math.floor(b.eta / 60), s = Math.floor(b.eta % 60);
  el.textContent = `${Game.role === 'def' ? '⚠ БАЛЛИСТИКА' : 'Баллистика в полёте'} · подлёт ${m}:${String(s).padStart(2, '0')}`;
  el.style.display = 'block';
}
