'use strict';
/* ============================================================
   СОСТОЯНИЕ ИГРЫ И НАЧАЛО КАМПАНИИ
     G — наша сторона (оборона) и общая обстановка
     E — «голова» второй стороны (в обороне — противник, в налёте — игрок)
     S — статистика текущей ночи
   ============================================================ */

let G = null, E = null, S = null;

let csUsed = {};

function newStats() {
  const z = {}; for (const k in TT) z[k] = 0;
  return {
    launched: { ...z }, killed: { ...z }, ew: { ...z }, hits: { ...z }, lostNav: { ...z },
    shots: {}, spent: 0, objDmg: 0, civ: 0, lost: [], gunK: 0, icptK: 0, samK: 0,
    decoySam: 0, mind: [], alarmCost: 0, falseAlarm: 0, uncovered: 0, armHits: 0,
    /* ущерб по объектам за ночь — для газеты и разбора */
    objHit: {}
  };
}

function mkCrew() {
  const b = pick(CSN);
  csUsed[b] = (csUsed[b] || 0) + 1;
  return { cs: b + '-' + csUsed[b], exp: R(.35, .8), fat: R(0, .08), trait: pick(TRAITS) };
}

function addUnit(k, x, y, inst) {
  const T = UT[k];
  const u = {
    id: G.idc++, k, x, y, h: 0, ta: 0, hp: T.hp, am: T.w ? T.w.am : 0, cd: 0,
    st: inst ? 'ready' : 'deploy', stT: inst ? 0 : G.t + T.dep, dest: null,
    radar: (T.radar || T.fake) ? ((k === 'horizon' || k === 'decoy' || k === 'spaag') ? 'on' : 'cue') : null,
    roe: T.w ? (T.w.mc >= .4 ? 'eco' : 'free') : null,
    cover: null, assign: null, crew: mkCrew(), kills: 0, shots: 0,
    rOn: false, det: new Set(), seenT: new Map(), lastRep: -1e9, repQ: [], after: [],
    pend: 0, reqT: {}, emit: 0, moved: false, sayT: {}, linkT: 0,
    fuel: T.fuel || 0, base: T.air ? { x, y } : null, patrol: null, dmgT: -1e9,
    /* позиции, где расчёт уже стоял (см. reachable) */
    spots: [{ x, y }]
  };
  G.units.push(u);
  return u;
}

const unitById = id => G.units.find(u => u.id === id);

const objById = id => G.objs.find(o => o.id === id);

const thrById = id => G.threats.find(t => t.id === id);

function newCampaign() {
  csUsed = {};
  G = {
    night: 1, t: 0, phase: 'prep', speed: 0, budget: 180,
    units: [], threats: [], miss: [], objs: [], reqs: [], comms: [], intelQ: [],
    alarm: false, alarmSince: -1e9, alarmT: 0, alarmTrust: 1,
    idc: 1, jam: 0, acc1: 0,
    camp: { nights: [], civ: 0 }, campA: { nights: [] }, weather: WEATHER[0], wind: { a: 3.14, v: 3 }, wxNext: null, gifts: [],
    civTotal: 0, morale: 70, fallen: [], honors: [], hadVis: false, hadBal: false, lastFalse: 0,
    /* готовность сторон к общему шагу (заступить, следующий день, новая кампания) */
    ready: {}
  };
  const cap = WD.cities[0];
  G.hq = { x: cap.x - 6, y: cap.y - 7, n: LORE.hqName };

  const C = n => WD.cities.find(c => c.n === n);
  /* защищаемые объекты (площадки и подъезды к ним — shared/data/objects.js, shared/world.js) */
  objectSites().forEach((d, i) => {
    G.objs.push({ id: 'o' + i, n: d.n, type: d.type, x: d.x, y: d.y, v: d.v, hp: 100, hitT: -1e9, rep: false, city: nearCity(d) });
  });

  /* стартовая группировка: она уже стоит на позициях */
  const O = i => G.objs[i];
  const at = (o, dx, dy) => nudgeOwn({ x: o.x + dx, y: o.y + dy });
  /* тяжёлая техника стартует у дороги, чтобы не стоять в поле без выезда */
  const put = (k, p) => {
    if (HEAVY_UNITS.includes(k)) { const rd = roadDist(p); if (rd.p && rd.d > ROAD_REACH) p = nudgeOwn({ x: rd.p.x + (p.x - rd.p.x) / rd.d * 1.2, y: rd.p.y + (p.y - rd.p.y) / rd.d * 1.2 }) }
    return addUnit(k, p.x, p.y, true);
  };

  put('bastion', at(O(0), 7, -8));
  put('shield', at(O(1), -7, 6));
  put('shield', at(O(3), -10, -6));
  put('krom', at(O(2), 4, -4));
  put('krom', at(O(4), -5, -4));
  put('spaag', at(O(0), -3, 5));
  put('spaag', at(O(6), 3, -3));
  [[3, 6, 3], [5, -4, -4], [2, -5, -7], [7, 5, -3], [6, -5, 3], [0, -13, 4], [4, -4, -3], [9, 4, 4], [10, -3, 3]]
    .forEach(a => put('mog', at(O(a[0]), a[1], a[2])));
  put('mog', nudgeOwn({ x: C('Бродно').x - 4, y: C('Бродно').y + 3 }));
  put('manpad', at(O(5), 4, -4));
  put('manpad', at(O(4), -4, -3));
  put('manpad', at(O(7), -4, 3));
  put('icpt', at(O(3), 7, 3));
  put('icpt', at(O(5), 6, -7));
  put('ew', at(O(0), -7, -4));
  put('cp', at(O(0), -14, -10));
  put('ttz', at(O(1), -3, 9));
  put('rem', at(O(0), 11, 6));
  put('horizon', nudgeOwn({ x: 252, y: 126 }));
  put('heli', at(O(6), 2, 2));
  [40, 90, 140, 190, 240].forEach(y => put('post', nudgeOwn({ x: borderX(y) - 15, y })));
  [[200, -5], [300, -4], [360, -11], [120, -4]].forEach(a => put('post', nudgeOwn({ x: a[0], y: coastY(a[0]) + a[1] })));

  eInit();
  /* противник ориентировочно знает старые позиции стационарных средств */
  for (const u of G.units) if (['bastion', 'shield', 'horizon'].includes(u.k)) {
    const k = eKnow(u); k.conf = .45; k.src = 'архив'; setKnowPos(k, u, 3);
  }
  clearLogs();
  startPrep(true);
}
