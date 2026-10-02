'use strict';
/* ============================================================
   СИЛУЭТЫ: примитивы
   Всё рисуется в локальной системе: длина изделия = 1, нос смотрит в +X, центр в (0,0).
   Внешний код делает translate, rotate и scale(L, L).
   ============================================================ */

const PAL = {
  hull: '#454e3d', hullHi: '#5f6a54', hullLo: '#272e21', dark: '#161b12',
  metal: '#828d7d', metalHi: '#aab3a3', glass: '#6fa8bd', rubber: '#12150f',
  tarp: '#4d5540', warn: '#c9a13a'
};

function P(g, pts, close) {
  g.beginPath();
  pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
  if (close !== false) g.closePath();
}

function fs(g, pts, fill, stroke, lw) {
  P(g, pts);
  if (fill) { g.fillStyle = fill; g.fill() }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || .02; g.stroke() }
}

function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function box(g, x, y, w, h, fill, stroke) {
  rr(g, x, y, w, h, Math.min(w, h) * .18);
  if (fill) { g.fillStyle = fill; g.fill() }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = .018; g.stroke() }
}

function dot(g, x, y, r, fill) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = fill; g.fill() }

/* колёса: список [x, y], радиус r */
function wheels(g, list, r) {
  g.fillStyle = PAL.rubber;
  for (const [x, y] of list) { g.beginPath(); g.ellipse(x, y, r, r * .62, 0, 0, 7); g.fill() }
  g.fillStyle = '#2b3128';
  for (const [x, y] of list) { g.beginPath(); g.ellipse(x, y, r * .42, r * .26, 0, 0, 7); g.fill() }
}

function axles(g, xs, hw, r) {
  const l = [];
  for (const x of xs) { l.push([x, -hw], [x, hw]) }
  wheels(g, l, r);
}

function tracks(g, x0, x1, hw, tw) {
  g.fillStyle = PAL.rubber;
  rr(g, x0, -hw - tw, x1 - x0, tw, tw * .35); g.fill();
  rr(g, x0, hw, x1 - x0, tw, tw * .35); g.fill();
  g.strokeStyle = '#2f352a'; g.lineWidth = .014;
  for (let x = x0 + .02; x < x1; x += .055) {
    g.beginPath(); g.moveTo(x, -hw - tw); g.lineTo(x, -hw); g.stroke();
    g.beginPath(); g.moveTo(x, hw); g.lineTo(x, hw + tw); g.stroke();
  }
}

/* пакет транспортно-пусковых контейнеров, поднятый под углом (вид сверху — ромбовидные торцы) */
function canisters(g, x0, n, len, w, gap, raised, col) {
  for (let i = 0; i < n; i++) {
    const y = (i - (n - 1) / 2) * (w + gap);
    g.fillStyle = col || '#4f573f';
    rr(g, x0, y - w / 2, len, w, w * .22); g.fill();
    g.strokeStyle = PAL.hullLo; g.lineWidth = .014; g.stroke();
    /* крышка — торец контейнера, чуть светлее */
    g.fillStyle = raised ? '#6d7a58' : '#3c4432';
    rr(g, x0 + len - w * .5, y - w * .42, w * .5, w * .84, w * .2); g.fill();
    g.strokeStyle = '#1e2419'; g.lineWidth = .01; g.stroke();
  }
}

/* фазированная антенна / плоское полотно РЛС */
function arrayPanel(g, x, y, w, h, a, col) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = col || '#2f3a44';
  rr(g, -w / 2, -h / 2, w, h, h * .12); g.fill();
  g.strokeStyle = '#7f93a3'; g.lineWidth = .014; g.stroke();
  g.strokeStyle = 'rgba(140,170,190,.5)'; g.lineWidth = .008;
  for (let i = 1; i < 5; i++) { const yy = -h / 2 + h * i / 5; g.beginPath(); g.moveTo(-w / 2 + .01, yy); g.lineTo(w / 2 - .01, yy); g.stroke() }
  g.restore();
}

/* параболическая тарелка (вид сверху — эллипс с ребром) */
function dish(g, x, y, r, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = '#39434b'; g.beginPath(); g.ellipse(0, 0, r * .42, r, 0, 0, 7); g.fill();
  g.strokeStyle = '#96a6b2'; g.lineWidth = .014; g.stroke();
  g.strokeStyle = '#c3d0d8'; g.lineWidth = .012;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(r * .6, 0); g.stroke();
  g.restore();
}

function whip(g, x, y, len, a) {
  g.strokeStyle = 'rgba(190,200,190,.75)'; g.lineWidth = .012;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
}
