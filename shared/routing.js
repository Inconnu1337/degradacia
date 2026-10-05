'use strict';
/* ============================================================
   МАРШРУТЫ: оценка опасности, выбор обхода, районы пуска
   ROUTE_OVERRIDE — маршрут, заданный игроком вручную (режим «Налёт»).
   ============================================================ */

var ROUTE_OVERRIDE = null;

/* ---------- оценка опасности маршрута ---------- */
function eCover(x, y, cls) {
  let c = 0;
  for (const id in E.know) {
    const k = E.know[id];
    if (k.conf < .15) continue;
    const T = UT[k.type];
    if (!T || !T.w) continue;
    const d = Math.hypot(x - k.x, y - k.y);
    if (d < T.w.r + 2) c += k.conf * (T.w.pk[cls] || 0) * (T.w.kind === 'gun' ? .6 : 1);
  }
  c += Math.min(3, (E.heat[Math.floor(x / 10) + ',' + Math.floor(y / 10)] || 0) * .35);
  for (const o of G.objs) if (o.v >= 85 && Math.hypot(o.x - x, o.y - y) < 10) c += .15;
  return c;
}

function eCost(a, path, cls) {
  let c = 0, cur = a;
  for (const p of path) {
    const d = Math.hypot(p.x - cur.x, p.y - cur.y), n = Math.max(1, Math.ceil(d / 6));
    for (let i = 1; i <= n; i++) c += eCover(cur.x + (p.x - cur.x) * i / n, cur.y + (p.y - cur.y) * i / n, cls) * (d / n) / 6;
    cur = p;
  }
  return c;
}

function eRoute(a, tg, cls, style) {
  if (typeof ROUTE_OVERRIDE !== 'undefined' && ROUTE_OVERRIDE && ROUTE_OVERRIDE.length) {
    return ROUTE_OVERRIDE.map(p => ({ x: p.x, y: p.y }));
  }
  const cands = [[{ x: tg.x, y: tg.y }]];
  const ang0 = Math.atan2(a.y - tg.y, a.x - tg.x);
  const lim = { drone: 780, decoy: 640, loiter: 700, mother: 720, jet: 620, recon: 520, ewuav: 520, arm: 700, cruise: 1000 }[cls] || 700;
  for (let i = 0; i < 14; i++) {
    const off = (chance(.5) ? -1 : 1) * R(.5, 2.6), rr = R(18, cls === 'cruise' ? 90 : 60);
    const w2 = { x: tg.x + Math.cos(ang0 + off) * rr, y: tg.y + Math.sin(ang0 + off) * rr };
    const pts = [];
    if (Math.abs(off) > 1.3 || chance(.35)) pts.push({ x: (a.x + w2.x) / 2 + R(-45, 45), y: (a.y + w2.y) / 2 + R(-45, 45) });
    pts.push(w2, { x: tg.x, y: tg.y });
    if (polyLen(a, pts) > lim || pts.some(p => p.x < -10 || p.y < -10 || p.y > WH + 15)) continue;
    cands.push(pts);
  }
  const sc = cands.map(p => ({ p, s: eCost(a, p, cls) + polyLen(a, p) * .0035 }));
  if (style === 'direct') return sc[0].p;
  sc.sort((x, y) => x.s - y.s);
  const top = sc.slice(0, 3), w = top.map(x => Math.exp(-(x.s - top[0].s) / .35));
  let r = Math.random() * sum(w);
  for (let i = 0; i < top.length; i++) { r -= w[i]; if (r <= 0) return top[i].p }
  return top[0].p;
}

function eZone(kind, tg) {
  const zs = ZONES.filter(z => z.k.includes(kind));
  if (!zs.length) return null;
  const sc = zs.map(z => ({ z, s: Math.hypot(z.x - tg.x, z.y - tg.y) * (1 + (E.zuse[z.id] || 0) * .12) * R(.8, 1.25) }));
  sc.sort((a, b) => a.s - b.s);
  E.zuse[sc[0].z.id] = (E.zuse[sc[0].z.id] || 0) + 1;
  return sc[0].z;
}

function zPoint(z) {
  if (z.sea) {
    for (let i = 0; i < 20; i++) { const p = { x: z.x + R(-z.r, z.r), y: z.y + R(-3, 5) }; if (!isLand(p.x, p.y)) return p }
    return { x: z.x, y: z.y + 6 };
  }
  return { x: z.x + R(-z.r, z.r), y: z.y + R(-z.r, z.r) };
}

const jitter = path => path.map((p, i) => i === path.length - 1 ? { x: p.x, y: p.y } : { x: p.x + R(-3, 3), y: p.y + R(-3, 3) });
