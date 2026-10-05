'use strict';
/* ============================================================
   ПРОИЗВОДНЫЕ ВЕЛИЧИНЫ (общие для сервера и клиента)
   Чистые функции от состояния: не меняют его, считают то, что нужно
   и правилам на сервере, и подписям на экране у клиента.
   Клиент получает уже отфильтрованное состояние (см. game/views.js),
   поэтому те же функции у него видят только то, что игроку положено.
   ============================================================ */

/* ---------- как цель называют в эфире ---------- */
const percCls = th => (th.cls === 'decoy' && !th.idDecoy) ? 'drone' : th.cls;

function thLabel(th) {
  if (th.idLv <= 0) return 'неопознанная цель';
  if (th.cls === 'decoy') return th.idDecoy ? 'имитатор' : '«мопед»';
  return CLS_SHORT[th.cls];
}

function thTitle(th) {
  if (th.idLv <= 0) return 'Неопознанный воздушный объект';
  const c = percCls(th);
  if (th.idLv >= 2 && TT[th.k]) return CLS_N[th.cls] + ' «' + TT[th.k].n + '»';
  if (c === 'drone') return 'Ударный БпЛА (тип не установлен)';
  return CLS_N[c] + ' (тип не установлен)';
}

/** высотный профиль → предел радиогоризонта, км */
const HORIZON = { low: 58, mid: 125, high: 1e9 };

/** какой объект, судя по курсу, под ударом */
function predictObj(th) {
  if (th.cls === 'ballistic' || th.cls === 'aeroball') {
    const p = th.path[th.path.length - 1];
    if (!p) return null;
    let b = null, bd = 4;
    for (const o of G.objs) { const d = dist(o, p); if (d < bd) { bd = d; b = o } }
    return b;
  }
  let best = null, bs = 1e9;
  for (const o of G.objs) {
    if (o.hp <= 0) continue;
    const dx = o.x - th.x, dy = o.y - th.y, al = dx * th.hx + dy * th.hy;
    if (al < -1 || al > 150) continue;
    const pr = Math.abs(dx * th.hy - dy * th.hx);
    if (pr < 5 + al * .07 && al + pr * 3 < bs) { bs = al + pr * 3; best = o }
  }
  return best;
}

/* ---------- цвета состояния (подписи и разборы) ---------- */
const hpCol = h => h > 65 ? '#6fd18d' : h > 30 ? '#f2b33d' : '#ff5b47';

/* ---------- объекты ---------- */
/** состояние энергосистемы края, % */
function energy() {
  let s = 0, n = 0;
  for (const o of G.objs) if (OT[o.type].en) { s += o.hp * o.v; n += 100 * o.v }
  return n ? s / n * 100 : 100;
}

/** суммарная целость всех объектов с учётом важности */
function integrity() {
  let s = 0, n = 0;
  for (const o of G.objs) { s += o.hp * o.v; n += 100 * o.v }
  return n ? s / n * 100 : 100;
}

/* ---------- оборона ---------- */
/** тяжёлая техника ходит только по дорогам */
const HEAVY_UNITS = ['shield', 'bastion', 'horizon', 'spaag', 'decoy', 'krom', 'cp'];
/** как далеко от дороги тяжёлая техника может встать, км */
const ROAD_REACH = 2.5;
/** точка, где расчёт уже стоял: туда он вернётся тем же путём, даже если она в поле */
const SPOT_R = 1.5;

/**
 * может ли расчёт встать в точке p: лёгкие — везде на своей земле,
 * тяжёлые — у дороги или на позиции, где уже стояли (у расчёта u.spots)
 */
function reachable(u, p) {
  if (!HEAVY_UNITS.includes(u.k)) return true;
  if ((u.spots || []).some(s => dist(s, p) < SPOT_R)) return true;
  return roadDist(p).d <= ROAD_REACH;
}

/** сколько секунд расчёт ждёт ответа штаба на запрос */
const REQ_TTL = 210;

/** ремонт объекта за день: +35% состояния */
const repCost = o => Math.round(3 + o.v * .03);
const REPAIR_HP = 45;
/** стоимость ремонта техники днём (мгновенно) */
const unitRepCost = u => Math.max(1, Math.round(UT[u.k].cost * .15 * (1 - u.hp / UT[u.k].hp)));

const canBuy = k => G.budget >= UT[k].cost;

/* ---------- налёт ---------- */
const ATK_KINDS = ['fpv', 'ulei', 'plita', 'jalo', 'moth', 'shershen', 'strizh', 'sova', 'vual', 'grach', 'krechet', 'albatros', 'molot', 'garpia'];

/** залп по умолчанию для каждого средства */
const ATK_N = { fpv: 4, ulei: 2, plita: 4, jalo: 8, moth: 4, shershen: 2, strizh: 2, sova: 1, vual: 1, grach: 2, krechet: 2, albatros: 4, molot: 1, garpia: 1 };

/** «Сова» и «Вуаль» идут только по точкам маршрута */
function routeOnly(k) {
  const c = TT[k] && TT[k].cls;
  return c === 'recon' || c === 'ewuav';
}

const isBallistic = k => TT[k] && (TT[k].cls === 'ballistic' || TT[k].cls === 'aeroball');

function arsenalValue() {
  let s = 0;
  for (const k in E.stock) s += (E.stock[k] || 0) * TT[k].cost;
  return s;
}

function knowById(id) {
  if (!E || !E.know) return null;
  id = +id;
  if (E.know[id]) return E.know[id];
  for (const key in E.know) if (E.know[key].uid === id) return E.know[key];
  return null;
}

function aimOf(tgt) {
  if (!tgt) return null;
  if (tgt.obj && tgt.obj.hp > 0) return { x: tgt.obj.x, y: tgt.obj.y };
  if (tgt.aim) return { x: tgt.aim.x, y: tgt.aim.y };
  return null;
}

function zonesFor(k) { return ZONES.filter(z => z.k.includes(k)) }
