'use strict';
/* ============================================================
   УТИЛИТЫ (общие для сервера и клиента)
   Ничего про DOM: помощник «$» живёт в client/js/dom.js.
   Математика, случайные числа, шум для местности, время, навигация, геометрия.
   ============================================================ */

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

const lerp = (a, b, t) => a + (b - a) * t;

const R = (a, b) => a + Math.random() * (b - a);

const RI = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

const pick = a => a[Math.random() * a.length | 0];

const chance = p => Math.random() < p;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

const sum = a => a.reduce((x, y) => x + y, 0);
const avg = a => a.length ? sum(a) / a.length : 0;

function shuffled(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[r[i], r[j]] = [r[j], r[i]] }
  return r;
}

/** нормальное-ish распределение, среднее 0, ~±1.5 */
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5);

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const pc = v => Math.round(v * 100) + '%';

const num = (v, d) => v.toFixed(d === undefined ? 1 : d).replace('.0', '');

/* --- детерминированный шум для генерации местности --- */
function h2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, s, o) {
  let t = 0, a = .5, f = 1, n = 0;
  for (let i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, s + i * 31); n += a; a *= .5; f *= 2.03 }
  return t / n;
}

/* --- время --- */
/** длина ночи в игровых секундах: 19:00 → 06:30 */
const NIGHT_LEN = 41400;

const DAWN_LABEL = '06:30';

const clock = t => {
  const m = Math.floor(19 * 60 + t / 60) % 1440;
  return String((m / 60) | 0).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};

function fmtDur(s) {
  s = Math.max(0, s);
  if (s < 60) return Math.round(s) + ' с';
  if (s < 5400) return Math.round(s / 60) + ' мин';
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h + ' ч' + (m ? ' ' + m + ' мин' : '');
}

/* --- география / навигация --- */
const DIRS = ['север', 'северо-восток', 'восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад'];

/** ветер: откуда дует — прилагательным */
const WIND_ADJ = ['северный', 'северо-восточный', 'восточный', 'юго-восточный', 'южный', 'юго-западный', 'западный', 'северо-западный'];
/** ветер по направлению «куда дует» (радианы) */
const windName = a => WIND_ADJ[dirIdx(-Math.cos(a), -Math.sin(a))];

const DIRS_ON = ['на север', 'на северо-восток', 'на восток', 'на юго-восток', 'на юг', 'на юго-запад', 'на запад', 'на северо-запад'];

const DIRS_FROM = ['с севера', 'с северо-востока', 'с востока', 'с юго-востока', 'с юга', 'с юго-запада', 'с запада', 'с северо-запада'];

const bearing = (dx, dy) => { let a = Math.atan2(dx, -dy) * 180 / Math.PI; return a < 0 ? a + 360 : a };

const dirIdx = (dx, dy) => Math.round(bearing(dx, dy) / 45) % 8;

/** азимут от расчёта на точку, три цифры */
const az = (u, p) => String(Math.round(bearing(p.x - u.x, p.y - u.y)) % 360).padStart(3, '0');

const courseW = th => 'курс ' + DIRS[dirIdx(th.hx, th.hy)];

const fromW = th => DIRS_FROM[dirIdx(-th.hx, -th.hy)];

/* --- сетка квадратов для радиообмена --- */
const GRID = 20;

const sq = p => String(clamp(Math.floor(p.x / GRID) + 1, 1, 99)).padStart(2, '0') + '-' +
  String(clamp(Math.floor(p.y / GRID) + 1, 1, 99)).padStart(2, '0');

/* --- геометрия --- */
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  const q = { x: a.x + dx * t, y: a.y + dy * t };
  return { d: dist(p, q), p: q, t };
}

function polyLen(a, path) { let l = 0, c = a; for (const p of path) { l += dist(c, p); c = p } return l }
