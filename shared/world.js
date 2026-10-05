'use strict';
/* ============================================================
   ВЫМЫШЛЕННАЯ ГЕОГРАФИЯ
   Процедурная, но стабильная от запуска к запуску: один и тот же край, чтобы игрок его выучил.
   Единица координат = 1 км. Мир 480×360 км.
   ============================================================ */

const WW = 480, WH = 360, PX = 3;

/* южный берег: море внизу */
const coastY = x => 294 + 20 * (fbm(x * .013, 3.3, 11, 4) - .5) * 2.2 - (x < 70 ? 14 * (1 - x / 70) : 0);

/* восточная граница с Аскенией */
const borderX = y => 401 + 24 * (fbm(2.1, y * .012, 23, 4) - .5) * 2.2;

/* полуостров Сарма — аскенийский, вдаётся в наше море */
const PEN = { x: 390, y: 324, rx: 50, ry: 28 };

function penIn(x, y) {
  const dx = (x - PEN.x) / PEN.rx, dy = (y - PEN.y) / PEN.ry;
  return dx * dx + dy * dy + (fbm(x * .06, y * .06, 5, 3) - .5) * .5 < 1;
}

const isLand = (x, y) => y < coastY(x) || penIn(x, y);

/** 0 — вода, 1 — наша территория, 2 — территория противника */
function side(x, y) {
  if (x < 0 || y < 0 || x > WW || y > WH) return x > WW ? 2 : 0;
  if (!isLand(x, y)) return 0;
  if (x > borderX(y)) return 2;
  if (y > coastY(x) - 2 && penIn(x, y)) return 2;
  return 1;
}

const WD = { cities: [], rivers: [], roads: [], villages: [], bridges: [], lines: [], forests: [] };

/* название, родительный падеж, x, y, «вес» (размер), enemy? */
const CITY_DEF = [
  ['Вельград', 'Вельграда', 205, 158, 3],
  ['Ставна', 'Ставны', 342, 84, 2],
  ['Солемар', 'Солемара', 150, -1, 2],
  ['Дарень', 'Дареня', 92, 108, 1],
  ['Лисова', 'Лисовой', 118, 214, 1],
  ['Тарновец', 'Тарновца', 292, 188, 1],
  ['Белояр', 'Белояра', 300, -1, 1],
  ['Кремнев', 'Кремнева', 256, 98, 1],
  ['Зорянск', 'Зорянска', 48, 244, 1],
  ['Бродно', 'Бродно', 360, 168, 1],
  ['Ясногорь', 'Ясногоря', 160, 58, 1],
  ['Горинь', 'Гориня', 62, 40, 1],
  ['Тарск', 'Тарска', 452, 58, 2, 1],
  ['Бельск', 'Бельска', 458, 196, 2, 1],
  ['Сарма', 'Сармы', 398, 334, 1, 1]
];

/** сдвинуть точку внутрь нашей территории */
function nudgeOwn(p) {
  const q = { x: p.x, y: p.y };
  for (let i = 0; i < 90 && side(q.x, q.y) !== 1; i++) { q.x += (210 - q.x) * .05; q.y += (150 - q.y) * .05 }
  return q;
}

function riverPath(x0, y0, tx, ty, s, join) {
  const pts = [{ x: x0, y: y0 }];
  let x = x0, y = y0;
  for (let i = 0; i < 600; i++) {
    const a = Math.atan2(ty - y, tx - x) + (fbm(x * .025, y * .025, s, 3) - .5) * 2.3;
    x += Math.cos(a) * 1.5; y += Math.sin(a) * 1.5;
    pts.push({ x, y });
    if (y > 2 && !isLand(x, y)) break;
    if (Math.hypot(tx - x, ty - y) < 2) break;
    if (join && join.some(p => Math.hypot(p.x - x, p.y - y) < 1.4)) break;
  }
  return pts;
}

/** извилистая дорога из a в b: n отрезков, отклонение до amp км (от зерна) */
function bendy(a, b, n, amp, seed) {
  const L = dist(a, b) || 1, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L, pts = [];
  for (let q = 0; q <= n; q++) {
    const t = q / n, o = (q && q < n) ? (fbm(seed * .13 + t * 2.7, seed * .07, 91, 2) - .5) * amp * 2 * Math.sin(Math.PI * t) : 0;
    pts.push({ x: a.x + (b.x - a.x) * t + nx * o, y: a.y + (b.y - a.y) * t + ny * o });
  }
  return pts;
}

/** площадки защищаемых объектов: { n, type, x, y, v } (данные — OBJ_SITES) */
function objectSites() {
  const dam = nearestOn(WD.rivers[0].pts, { x: 225, y: 240 });
  return OBJ_SITES.map(([n, type, at, dx, dy, v]) => {
    const c = at === 'dam' ? dam : WD.cities.find(x => x.n === at);
    const p = nudgeOwn({ x: c.x + dx, y: c.y + dy });
    return { n, type, x: p.x, y: p.y, v };
  });
}

function nearestOn(pts, p) {
  let b = pts[0], bd = 1e9;
  for (const q of pts) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; b = q } }
  return b;
}

function buildWorld() {
  /* реки */
  const main = riverPath(182, -8, 228, 345, 101);
  WD.rivers.push({ n: 'Вельна', w: 1.35, pts: main });
  const j = nearestOn(main, { x: 215, y: 215 });
  WD.rivers.push({ n: 'Ирва', w: .85, pts: riverPath(376, 66, j.x, j.y, 202, main) });
  WD.rivers.push({ n: 'Лоза', w: .7, pts: riverPath(28, 26, 112, 330, 303) });
  WD.rivers.push({ n: 'Тиша', w: .6, pts: riverPath(330, 240, 250, 300, 404, main) });

  /* города */
  for (const d of CITY_DEF) {
    let p = { x: d[2], y: d[3] };
    if (p.y < 0) p.y = coastY(p.x) - 5;
    if (!d[5]) p = nudgeOwn(p);
    WD.cities.push({ n: d[0], gen: d[1], x: p.x, y: p.y, pop: d[4], enemy: !!d[5] });
  }
  /* столицу края ставим на реке */
  const cap = WD.cities[0], rp = nearestOn(main, cap);
  cap.x = rp.x + 2.2; cap.y = rp.y + .5;

  /* дороги: соединяем каждый город с ближайшими */
  const cs = WD.cities, edges = new Set();
  cs.forEach((a, i) => {
    const nb = cs.map((b, k) => ({ k, d: dist(a, b) })).filter(o => o.k !== i).sort((x, y) => x.d - y.d).slice(0, 3);
    nb.forEach((o, k) => { if (k < 2 || o.d < 90) edges.add(Math.min(i, o.k) + '-' + Math.max(i, o.k)) });
  });
  for (const e of edges) {
    const [i, k] = e.split('-').map(Number), a = cs[i], b = cs[k];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (!isLand(mid.x, mid.y)) continue;
    if (a.enemy !== b.enemy) continue;
    const pts = [], n = 12, L = dist(a, b), nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    for (let q = 0; q <= n; q++) {
      const t = q / n, o = (q && q < n) ? (fbm(a.x * .1 + t * 3, b.y * .1, 77, 2) - .5) * 14 * Math.sin(Math.PI * t) : 0;
      pts.push({ x: a.x + (b.x - a.x) * t + nx * o, y: a.y + (b.y - a.y) * t + ny * o });
    }
    WD.roads.push({ pts, main: a.pop + b.pop >= 4, a: a.n, b: b.n });
  }

  /* мосты там, где дороги пересекают крупные реки */
  for (const r of WD.rivers) {
    if (r.w < .8) continue;
    for (const rd of WD.roads) {
      for (let i = 1; i < rd.pts.length; i++) {
        const q = nearestOn(r.pts, rd.pts[i]);
        if (dist(q, rd.pts[i]) < 1.6 && !WD.bridges.some(b => dist(b, q) < 12)) {
          WD.bridges.push({ x: q.x, y: q.y, n: 'мост через ' + (r.n === 'Вельна' ? 'Вельну' : r.n), main: rd.main });
        }
      }
    }
  }

  /* деревни и ЛЭП — фон, создают ощущение обжитой земли */
  let sd = 1234;
  const sr = () => { sd = (Math.imul(sd, 1103515245) + 12345) | 0; return ((sd >>> 8) & 0xffff) / 65536 };
  for (let i = 0; i < 260; i++) {
    const x = sr() * WW, y = sr() * WH;
    if (side(x, y) === 1) WD.villages.push({ x, y, s: .4 + sr() * .8 });
  }

  /* подъезды: от каждого объекта к ближайшей трассе — промышленная площадка без дороги не бывает */
  for (const o of objectSites()) {
    const rd = roadDist(o);
    if (rd.p && rd.d > .8) WD.roads.push({ pts: bendy(o, rd.p, 6, 3, o.x), main: false, spur: 1 });
  }
  /* грунтовки: деревни подальше от трасс соединены с ними просёлком.
     Тяжёлая техника по ним проходит, поэтому до обжитого места почти всегда есть подъезд. */
  /* сеть растёт от трасс: каждый раз подключаем деревню, ближайшую к уже построенным дорогам */
  const left = WD.villages.map(v => ({ v, ...roadDist(v) }));
  for (let guard = 0; guard < left.length; guard++) {
    let bi = -1;
    for (let i = 0; i < left.length; i++) if (left[i].d >= 3 && (bi < 0 || left[i].d < left[bi].d)) bi = i;
    if (bi < 0 || left[bi].d > 45) break;
    const { v, p } = left.splice(bi, 1)[0];
    const pts = bendy(v, p, Math.max(3, Math.round(dist(v, p) / 2.5)), 2.5, v.x + v.y);
    WD.roads.push({ pts, main: false, dirt: 1 });
    /* новая грунтовка — тоже дорога: пересчитываем расстояния только до неё */
    for (const o of left) for (let i = 1; i < pts.length; i++) {
      const s = segDist(o.v, pts[i - 1], pts[i]);
      if (s.d < o.d) { o.d = s.d; o.p = s.p }
    }
  }
  const lineHubs = [cs[0], cs[1], cs[3], cs[4], cs[7], cs[2], cs[9]];
  for (let i = 1; i < lineHubs.length; i++) {
    const a = lineHubs[0], b = lineHubs[i], pts = [];
    for (let q = 0; q <= 8; q++) {
      const t = q / 8;
      pts.push({ x: a.x + (b.x - a.x) * t + (q && q < 8 ? (sr() - .5) * 8 : 0), y: a.y + (b.y - a.y) * t + (q && q < 8 ? (sr() - .5) * 8 : 0) });
    }
    WD.lines.push({ pts });
  }
}

/** ближайшая дорога — тяжёлая техника не может встать в чистом поле далеко от трассы */
function roadDist(p) {
  let bd = 1e9, bp = null;
  for (const r of WD.roads) for (let i = 1; i < r.pts.length; i++) {
    const s = segDist(p, r.pts[i - 1], r.pts[i]);
    if (s.d < bd) { bd = s.d; bp = s.p }
  }
  return { d: bd, p: bp };
}

const inCity = p => WD.cities.find(c => !c.enemy && dist(c, p) < c.pop * 2.2 + 1.6);

const nearCity = p => {
  let b = null, bd = 1e9;
  for (const c of WD.cities) { if (c.enemy) continue; const d = dist(c, p); if (d < bd) { bd = d; b = c } }
  return b;
};

/** «в 12 км северо-западнее Дареня» — как говорят в эфире */
function placeName(p) {
  const c = nearCity(p);
  if (!c) return 'кв. ' + sq(p);
  const d = dist(c, p);
  if (d < c.pop * 2.4 + 2) return c.n;
  return Math.round(d) + ' км ' + DIRS[dirIdx(p.x - c.x, p.y - c.y)] + 'нее ' + c.gen;
}
