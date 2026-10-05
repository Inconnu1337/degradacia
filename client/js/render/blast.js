'use strict';
/* ============================================================
   ВЗРЫВЫ, ДЫМ, ВОРОНКИ И СЛЕДЫ (клиент)
   ------------------------------------------------------------
   Разрыв на земле (fx 'boom'):
     вспышка   — доли секунды, освещает землю вокруг;
     огненный шар — несколько клубов, от белого ядра к оранжевому,
                 потом темнеют и превращаются в дым;
     ударная волна — тонкое светлое кольцо, быстро расходится;
     обломки  — искры разлетаются и гаснут.
   После разрыва остаются:
     дым      — шлейф по ветру: сперва густой и чёрный (горит топливо),
                потом серый и редкий, через время рассеивается;
     воронка  — тёмное пятно, гаснет вдвое дольше дыма.
   Подрыв в воздухе (fx 'air') — вспышка, клуб серого дыма, осколки.
   Следы: у крылатых ракет и реактивных БпЛА — дымный след двигателя,
   на высотном профиле — белый инверсионный. Баллистика летит без
   двигателя, следа у неё нет.

   Возраст дыма — по игровым часам и по реальным: что истечёт раньше.
   На ×5 дым висит минуты, на ×180 — секунды, как в ускоренной съёмке.
   ============================================================ */

const SMOKE = [];          /* { x, y, g0, r0, pw, seed, air } */
const SCORCH = [];         /* { x, y, g0, r0, pw, seed } */
const TRAILS = new Map();  /* id цели → { pts: [{x,y}], cls, high, seen } */
let blastNight = null;

const SMOKE_G = 2400, SMOKE_R = 240;      /* срок дыма: игровых секунд / реальных секунд */
const AIR_SMOKE_G = 420, AIR_SMOKE_R = 30;
const TRAIL_CLS = { cruise: 26, jet: 14 };  /* длина следа, км */

/** псевдослучайное по зерну: одинаковое каждый кадр */
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x) };

/** мощность разрыва 0.35…1.4 по боевой части (ед. урона) */
const blastPow = o => clamp(o.w ? Math.sqrt(o.w / 30) : o.small ? .5 : 1, .35, 1.4);

/** новый разрыв: оставить дым и воронку */
function blastAdd(o) {
  if (!G) return;
  blastReset();
  const pw = blastPow(o), seed = Math.random() * 1000;
  if (o.k === 'boom') {
    o.d = Math.max(o.d || 0, 2600);
    SMOKE.push({ x: o.x, y: o.y, g0: G.t, r0: GANIM, pw, seed, air: 0 });
    SCORCH.push({ x: o.x, y: o.y, g0: G.t, r0: GANIM, pw, seed });
  } else if (o.k === 'air') {
    o.d = Math.max(o.d || 0, o.small ? 1400 : 2000);
    SMOKE.push({ x: o.x, y: o.y, g0: G.t, r0: GANIM, pw: o.small ? .35 : .55, seed, air: 1 });
  }
  if (SMOKE.length > 60) SMOKE.shift();
  if (SCORCH.length > 80) SCORCH.shift();
}

/** возраст 0…1 (1 — исчез) */
function blastAge(b, g, r) { return Math.max((G.t - b.g0) / g, (GANIM - b.r0) / r) }

/** новая ночь или день — дым прошлой ночи не тащим */
function blastReset() {
  const key = G.night + ':' + G.phase;
  if (key === blastNight) return;
  blastNight = key;
  SMOKE.length = 0; SCORCH.length = 0; TRAILS.clear();
}

const windVec = () => { const w = G.wind || { a: 0, v: 3 }; const k = .4 + (w.v || 0) / 8; return { x: Math.cos(w.a) * k, y: Math.sin(w.a) * k } };

/* ---------- воронки: под объектами и техникой ---------- */
function drawScorch(s) {
  blastReset();
  for (let i = SCORCH.length - 1; i >= 0; i--) {
    const b = SCORCH[i], age = blastAge(b, SMOKE_G * 2, SMOKE_R * 2);
    if (age >= 1) { SCORCH.splice(i, 1); continue }
    const q = w2s(b);
    if (!onScreen(q, 60)) continue;
    const R = clamp(s * .8 * b.pw, 4, 26), a = (1 - age) * .75;
    cx.save(); cx.translate(q.x, q.y);
    /* неровное пятно гари: два рваных клуба тёмного цвета и плотное ядро воронки */
    SmokeTex.draw(cx, b.seed | 0, 0, 0, R * 1.5, a * .7, [22, 17, 13], hash(b.seed, 1) * 6.28, 1.25);
    SmokeTex.draw(cx, (b.seed | 0) + 3, R * .15, -R * .1, R * 1.1, a * .6, [14, 11, 9], hash(b.seed, 2) * 6.28, 1.1);
    SmokeTex.draw(cx, (b.seed | 0) + 1, 0, 0, R * .55, a * .8, [8, 6, 5], hash(b.seed, 3) * 6.28, 1);
    /* тлеющие угли в первые минуты */
    if (age < .12) {
      cx.globalCompositeOperation = 'lighter';
      const fl = .6 + .4 * Math.sin(GANIM * 9 + b.seed);
      const g = cx.createRadialGradient(0, 0, 0, 0, 0, R * .9);
      g.addColorStop(0, `rgba(255,120,40,${(1 - age / .12) * .55 * fl})`); g.addColorStop(1, 'rgba(255,60,20,0)');
      cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, R * .9, 0, 7); cx.fill();
    }
    cx.restore();
  }
}

/* ---------- дым: шлейф по ветру ---------- */
function drawSmoke(s) {
  const w = windVec(), T = GANIM;
  const zoom = clamp(s / 2.5, .6, 4);
  for (let i = SMOKE.length - 1; i >= 0; i--) {
    const b = SMOKE[i];
    const age = b.air ? blastAge(b, AIR_SMOKE_G, AIR_SMOKE_R) : blastAge(b, SMOKE_G, SMOKE_R);
    if (age >= 1) { SMOKE.splice(i, 1); continue }
    const q = w2s(b);
    if (!onScreen(q, 220)) continue;
    /* густота: в начале чёрный дым, к концу — редкий серый */
    const dens = Math.pow(1 - age, 1.2) * (b.air ? .6 : .85);
    const dark = clamp(1 - age * 2.2, 0, 1);
    /* ночью дым видно, потому что его подсвечивают пожар снизу и город: не чёрный, а бурый */
    const cr = Math.round(lerp(150, 92, dark)), cg = Math.round(lerp(146, 80, dark)), cb = Math.round(lerp(140, 70, dark));
    const R = (b.air ? 5 : 8) * b.pw * zoom;
    /* в первые минуты основание шлейфа подсвечено огнём */
    if (!b.air && age < .2) {
      const fk = (1 - age / .2) * (.7 + .3 * Math.sin(T * 7 + b.seed));
      cx.save(); cx.globalCompositeOperation = 'lighter';
      const g = cx.createRadialGradient(q.x, q.y - R * .3, 0, q.x, q.y - R * .3, R * 2.2);
      g.addColorStop(0, `rgba(255,120,40,${.22 * fk})`); g.addColorStop(1, 'rgba(255,80,20,0)');
      cx.fillStyle = g; cx.beginPath(); cx.arc(q.x, q.y - R * .3, R * 2.2, 0, 7); cx.fill();
      cx.restore();
    }
    /* шлейф длиннее со временем, пока не вытянется по ветру */
    const L = R * (b.air ? 4 : 9) * clamp(.25 + age * 3, .25, 1);
    const N = b.air ? 7 : 14;
    const wa = Math.atan2(w.y, w.x);
    for (let k = 0; k < N; k++) {
      const ph = (T * (b.air ? .09 : .05) + k / N + hash(b.seed, k) * .1) % 1;
      const r = R * (.6 + ph * 2.4) * (.8 + .4 * hash(b.seed, k + 3));
      const wob = Math.sin(T * .4 + k * 1.7 + b.seed) * R * .35 * ph;
      const sx = q.x + w.x * ph * L - w.y * wob, sy = q.y + w.y * ph * L + w.x * wob - ph * R * .8;
      /* клуб рождается у земли (плавно проявляется) и тает по мере подъёма */
      const a = dens * (1 - ph) * Math.min(1, ph * 5 + .2) * (.75 + .45 * hash(k, b.seed));
      if (a < .01) continue;
      /* каждый клуб чуть вытянут по ветру и медленно поворачивается */
      SmokeTex.draw(cx, k + (b.seed | 0), sx, sy, r * 1.25, a, [cr, cg, cb], wa + hash(b.seed, k) * 6.28 + T * .04 * (k % 2 ? 1 : -1), 1 + ph * .6);
    }
  }
}

/* ---------- сам разрыв ---------- */
function drawBoom(f, k, s) {
  const a = w2s(f), pw = blastPow(f);
  const R0 = clamp(s * 2.4 * pw, 14 * pw + 4, 90);
  cx.save();
  cx.globalCompositeOperation = 'lighter';
  /* вспышка: освещает землю */
  if (k < .08) {
    const fk = 1 - k / .08, rr = R0 * 4;
    const g = cx.createRadialGradient(a.x, a.y, 0, a.x, a.y, rr);
    g.addColorStop(0, `rgba(255,250,235,${.95 * fk})`); g.addColorStop(.25, `rgba(255,210,150,${.45 * fk})`); g.addColorStop(1, 'rgba(255,160,80,0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(a.x, a.y, rr, 0, 7); cx.fill();
  }
  /* зарево на земле, гаснет */
  {
    const gk = Math.pow(1 - k, 2), rr = R0 * 2.2;
    const g = cx.createRadialGradient(a.x, a.y, 0, a.x, a.y, rr);
    g.addColorStop(0, `rgba(255,140,50,${.45 * gk})`); g.addColorStop(1, 'rgba(255,90,30,0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(a.x, a.y, rr, 0, 7); cx.fill();
  }
  /* огненный шар: клубы растут быстро, потом медленно; цвет остывает */
  const grow = 1 - Math.exp(-k * 9);
  const heat = clamp(1 - k * 2.2, 0, 1);
  for (let i = 0; i < 6; i++) {
    const an = hash(f.x + i, f.y) * 6.28, d = R0 * .45 * hash(i, f.x) * grow;
    const bx = a.x + Math.cos(an) * d, by = a.y + Math.sin(an) * d - grow * R0 * .25 * hash(f.y, i);
    const r = R0 * (.3 + .55 * grow) * (.6 + .5 * hash(i + 7, f.y));
    if (heat <= 0) break;
    /* ядро — горячее и светлое, края клуба — оранжево-красные, форма рваная */
    SmokeTex.draw(cx, i + 2, bx, by, r * 1.3, .85 * heat, [255, Math.round(110 + 70 * heat), Math.round(30 + 40 * heat)], an + k * 2, 1.1);
    SmokeTex.draw(cx, i + 4, bx, by, r * .75, .8 * heat * heat, [255, Math.round(215 + 40 * heat), Math.round(150 + 90 * heat)], -an, 1);
  }
  /* обломки и искры: разлёт с торможением, остывают */
  if (k < .55) {
    const n = Math.round(7 + 6 * pw), sk = 1 - k / .55;
    cx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const an = hash(i, f.x * 3.1) * 6.28, sp = .5 + hash(f.y * 1.7, i) * .8;
      const d1 = R0 * 2.8 * sp * (1 - Math.exp(-k * 6)), d0 = d1 * (.55 + .35 * hash(i + 5, f.y));
      cx.strokeStyle = `rgba(255,${Math.round(150 + 90 * sk)},${Math.round(60 + 80 * sk)},${.85 * sk})`;
      cx.lineWidth = 1.2 + sk;
      cx.beginPath();
      cx.moveTo(a.x + Math.cos(an) * d0, a.y + Math.sin(an) * d0);
      cx.lineTo(a.x + Math.cos(an) * d1, a.y + Math.sin(an) * d1);
      cx.stroke();
    }
    cx.lineCap = 'butt';
  }
  cx.restore();
  /* чёрный дым из огненного шара (поверх, обычным смешиванием) */
  if (k > .15) {
    const sk = clamp((k - .15) / .85, 0, 1), sa = Math.sin(sk * Math.PI) * .55;
    for (let i = 0; i < 5; i++) {
      const an = hash(i + 3, f.x) * 6.28, d = R0 * .5 * hash(f.y, i + 3);
      const bx = a.x + Math.cos(an) * d, by = a.y + Math.sin(an) * d - sk * R0 * .6;
      const r = R0 * (.5 + .7 * sk) * (.7 + .4 * hash(i, f.y + 2));
      SmokeTex.draw(cx, i, bx, by, r * 1.3, sa, [44, 38, 34], an + sk, 1.15);
    }
  }
  /* ударная волна: тонкое кольцо, быстро уходит */
  if (k < .3) {
    const wk = k / .3;
    cx.strokeStyle = `rgba(255,240,220,${(1 - wk) * .45})`;
    cx.lineWidth = 1 + (1 - wk) * 1.5;
    cx.beginPath(); cx.arc(a.x, a.y, R0 * (.6 + wk * 4.2), 0, 7); cx.stroke();
  }
}

/** подрыв в воздухе: вспышка, клуб дыма с осколками */
function drawAirBurst(f, k, s) {
  const a = w2s(f);
  const R0 = clamp(s * (f.small ? .9 : 1.5), f.small ? 7 : 11, 34);
  cx.save();
  cx.globalCompositeOperation = 'lighter';
  if (k < .15) {
    const fk = 1 - k / .15, rr = R0 * 2.6;
    const g = cx.createRadialGradient(a.x, a.y, 0, a.x, a.y, rr);
    g.addColorStop(0, `rgba(255,252,240,${fk})`); g.addColorStop(.3, `rgba(255,200,120,${.6 * fk})`); g.addColorStop(1, 'rgba(255,140,60,0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(a.x, a.y, rr, 0, 7); cx.fill();
  }
  if (k < .5) {
    const sk = 1 - k / .5, n = f.small ? 7 : 12;
    for (let i = 0; i < n; i++) {
      const an = hash(i, f.x * 5.3) * 6.28, d = R0 * 2.2 * (1 - Math.exp(-k * 7)) * (.5 + hash(f.y, i));
      cx.fillStyle = `rgba(255,${Math.round(170 + 70 * sk)},90,${sk * .9})`;
      cx.fillRect(a.x + Math.cos(an) * d - 1, a.y + Math.sin(an) * d - 1 + k * R0 * .8, 2, 2);
    }
  }
  cx.restore();
  /* клуб серого дыма */
  const sk = clamp(k / .3, 0, 1), sa = (1 - k) * .7;
  const r = R0 * (.4 + .8 * sk);
  SmokeTex.draw(cx, (f.x * 7) | 0, a.x, a.y, r * 1.3, sa, [96, 94, 92], f.y + k, 1.1);
  SmokeTex.draw(cx, (f.y * 7) | 0, a.x + r * .3, a.y - r * .2, r * .9, sa * .7, [120, 118, 116], f.x - k, 1.2);
}

/* ---------- следы двигателей ---------- */
function updateTrails() {
  const def = Game.role === 'def';
  const alive = new Set();
  for (const th of G.threats) {
    if (th.dead || !TRAIL_CLS[th.cls] || th.lost) continue;
    if (def && G.t - th.seen > 6) continue;
    alive.add(th.id);
    let tr = TRAILS.get(th.id);
    if (!tr) { tr = { pts: [], cls: th.cls }; TRAILS.set(th.id, tr) }
    tr.high = th.alt === 'high';
    tr.gone = 0;
    /* последняя точка — «голова» у самой ракеты; новая закрепляется, когда голова ушла на 0,35 км */
    const n = tr.pts.length;
    if (n < 2) tr.pts.push({ x: th.x, y: th.y });
    else {
      const fix = tr.pts[n - 2], head = tr.pts[n - 1];
      head.x = th.x; head.y = th.y;
      if (Math.hypot(th.x - fix.x, th.y - fix.y) > .35) tr.pts.push({ x: th.x, y: th.y });
    }
    /* обрезаем по длине */
    const max = TRAIL_CLS[th.cls] * (tr.high ? 1.6 : 1);
    let len = 0;
    for (let i = tr.pts.length - 1; i > 0; i--) {
      len += Math.hypot(tr.pts[i].x - tr.pts[i - 1].x, tr.pts[i].y - tr.pts[i - 1].y);
      if (len > max) { tr.pts.splice(0, i); break }
    }
  }
  /* цель пропала — след ещё пару секунд тает */
  for (const [id, tr] of TRAILS) if (!alive.has(id)) { tr.gone = (tr.gone || 0) + 1; if (tr.gone > 90) TRAILS.delete(id) }
}

function drawTrails(s) {
  blastReset();
  updateTrails();
  const T = GANIM;
  for (const tr of TRAILS.values()) {
    const P = tr.pts;
    if (P.length < 2) continue;
    const fade = 1 - (tr.gone || 0) / 90;
    const n = P.length;
    const w = clamp(s * (tr.high ? .5 : .4), 1.2, 6);
    /* след — цепочка рваных клубов, вытянутых вдоль пути: у ракеты узкий и плотный,
       к хвосту расплывается, светлеет и тает. Высотный — белый инверсионный. */
    for (let i = 0; i < n - 1; i++) {
      const a = w2s(P[i]), b = w2s(P[i + 1]), t = i / (n - 1);
      const ang = Math.atan2(b.y - a.y, b.x - a.x), len = Math.hypot(b.x - a.x, b.y - a.y);
      const r = w * (1 + (1 - t) * 2.2) + len * .35;
      const al = (.06 + .5 * t) * fade * (tr.high ? .8 : .65);
      const c = tr.high ? [236, 240, 246] : [Math.round(150 + 40 * (1 - t)), Math.round(148 + 40 * (1 - t)), Math.round(145 + 40 * (1 - t))];
      /* медленное расплывание: клуб чуть дрейфует от оси */
      const dr = (1 - t) * w * .8 * Math.sin(T * .3 + i * 1.7);
      SmokeTex.draw(cx, i, (a.x + b.x) / 2 - Math.sin(ang) * dr, (a.y + b.y) / 2 + Math.cos(ang) * dr, r, al, c, ang, clamp(len / r, 1, 2.6));
    }
    /* горячий выхлоп у самой ракеты */
    if (!tr.gone) {
      const a = w2s(P[n - 1]), b = w2s(P[Math.max(0, n - 3)]);
      cx.save();
      cx.globalCompositeOperation = 'lighter';
      const g = cx.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, 'rgba(255,190,110,.55)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      cx.strokeStyle = g; cx.lineWidth = clamp(s * .5, 1.2, 3.5);
      cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
      cx.restore();
    }
  }
}
