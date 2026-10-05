'use strict';
/* ============================================================
   ЧТО ВИДИТ КАЖДАЯ СТОРОНА (сервер)
   Снимок для клиента строится здесь и только здесь. Клиент не
   получает ничего сверх своей картины обстановки:
     ПВО   — свои расчёты; цели — только наблюдаемые, с тем
             опознаванием, которое набрано (тип скрыт до idLv 2,
             имитатор выглядит ударным дроном, у потерянной цели —
             последняя известная точка, маршрутов нет);
     налёт — свои борта и пакеты; ПВО — только контакты разведки
             (без истинных смещений), расчётов противника нет.
   ============================================================ */

const pt = p => p ? { x: p.x, y: p.y } : null;

function objV(o) {
  return {
    id: o.id, n: o.n, type: o.type, x: o.x, y: o.y, v: o.v, hp: o.hp, hitT: o.hitT, rep: o.rep, city: o.city ? { n: o.city.n } : null,
    fire: o.fire || 0, ff: o.ff ? o.ff.st : null, rw: o.rw ? o.rw.st : null
  };
}

function unitV(u) {
  return {
    id: u.id, k: u.k, x: u.x, y: u.y, h: u.h, ta: u.ta, hp: u.hp, am: u.am, st: u.st, stT: u.stT,
    dest: pt(u.dest), radar: u.radar, roe: u.roe, cover: u.cover, assign: u.assign,
    crew: { cs: u.crew.cs, exp: u.crew.exp, fat: u.crew.fat, trait: u.crew.trait },
    kills: u.kills, rOn: u.rOn, pend: u.pend, fuel: u.fuel, rc: reloadCost(u),
    fire: u.fire || 0, fix: u.fix ? u.fix.st : null,
    patrol: u.patrol ? { x: u.patrol.x, y: u.patrol.y, name: patrolName(patrolCenter(u.patrol)), pts: u.patrol.pts ? u.patrol.pts.map(pt) : null, r: patrolR(u.patrol), leg: u.patrol.leg || 0 } : null, chase: u.chase || null
  };
}

/** цель глазами ПВО */
function threatDefV(th) {
  const age = G.t - th.seen, lost = age > 4;
  const known = th.idLv >= 1, typed = th.idLv >= 2;
  const ball = th.cls === 'ballistic' || th.cls === 'aeroball';
  return {
    id: th.id,
    k: typed ? th.k : null,
    cls: known ? percCls(th) : 'unknown',
    sp: TT[th.k].sp,
    x: lost ? th.lx : th.x, y: lost ? th.ly : th.y, lx: th.lx, ly: th.ly,
    hx: th.hx, hy: th.hy, seen: th.seen, vis: !!th.vis, idLv: th.idLv, idDecoy: !!th.idDecoy,
    alt: th.alt, eng: th.eng, lost: th.lost, armTgt: th.armTgt || null, dead: false, br: known && th.dropped ? 1 : 0,
    path: known && ball && th.path.length ? [pt(th.path[th.path.length - 1])] : []
  };
}

/** свой борт глазами стороны налёта */
function threatAtkV(th) {
  return {
    id: th.id, k: th.k, cls: th.cls, sp: TT[th.k].sp, x: th.x, y: th.y, hx: th.hx, hy: th.hy,
    alt: th.alt, lost: th.lost, dead: false, idLv: 2, seen: th.seen, vis: !!th.vis, br: th.dropped ? 1 : 0,
    path: th.path.map(pt)
  };
}

let __missId = 0;
function missV(m) {
  if (!m.id) m.id = ++__missId;
  return { id: m.id, x: m.x, y: m.y, a: m.a, kind: m.kind, trail: m.trail.slice(-40) };
}

function reqV(r) {
  return { id: r.id, uid: r.u.id, text: r.text, opts: r.opts.map(o => ({ l: o.l })), def: r.def, t: r.t };
}

function knowV(k) {
  const u = unitById(k.uid);
  return { uid: k.uid, type: k.type, x: k.x, y: k.y, conf: k.conf, src: k.src, t: k.t, dead: !!(u && u.hp <= 0) };
}

function groupV(g) {
  const tgt = !g.tgt ? null
    : g.tgt.obj ? { obj: { id: g.tgt.obj.id, n: g.tgt.obj.n } }
      : g.tgt.aim ? { aim: pt(g.tgt.aim), patrol: g.tgt.patrol || 0 } : null;
  return {
    id: g.id, kind: g.kind, n: g.n, zone: { id: g.zone.id, n: g.zone.n }, tgt,
    launch: g.launch, arrive: g.arrive, launched: g.launched, lost: g.lost, hit: g.hit,
    start: pt(g.start), path: (g.path || []).map(pt), high: g.high, retT: g.retT || null,
    alive: G.threats.filter(th => th.gid === g.id && !th.dead && !th.lost).length
  };
}

/** общая часть: время, фаза, погода, объекты, готовность сторон */
function commonV(role) {
  return {
    mode: MODE.id, humans: MODE.humans, role,
    night: G.night, t: G.t, phase: G.phase, speed: G.speed, chosen: SPEED, time: timeView(role), auto: AUTO[role],
    ready: G.ready, weather: G.weather, wind: G.wind, alarm: G.alarm,
    forecast: G.wxNext ? { t: G.wxNext.t, n: wxById(G.wxNext.id).n } : null,
    wxTrans: G.wxTrans ? { from: G.wxTrans.from, to: G.wxTrans.to, t0: G.wxTrans.t0, t1: G.wxTrans.t1 } : null, civTotal: G.civTotal,
    over: G.phase === 'debrief' && MODE.campaignOver(),
    objs: G.objs.map(objV), miss: G.miss.map(missV)
  };
}

function viewFor(role) {
  const G2 = commonV(role);
  if (role === 'def') {
    Object.assign(G2, {
      budget: G.budget, morale: G.morale, alarmT: G.alarmT, alarmTrust: G.alarmTrust, det: G.det || 0,
      hq: G.hq, gifts: G.gifts, offers: G.offers || [], offerTaken: !!G.offerTaken, warnedUncovered: G.warnedUncovered || 0, crews: G.crews || CREWS_PER_NIGHT,
      spoilable: !MODE.humans.includes('atk'),
      units: G.units.map(unitV),
      threats: G.threats.filter(th => !th.dead && G.t - th.seen <= 200).map(threatDefV),
      reqs: G.reqs.map(reqV)
    });
    return { G: G2, E: null, S: { civ: S ? S.civ : 0 } };
  }
  const know = {};
  for (const id in E.know) if (E.know[id].conf >= .15) know[id] = knowV(E.know[id]);
  Object.assign(G2, {
    units: [], reqs: [],
    threats: G.threats.filter(th => !th.dead).map(threatAtkV)
  });
  return {
    G: G2,
    E: { stock: E.stock, know, heat: E.heat, groups: E.groups.map(groupV), used: E.used, capBonus: E.capBonus || {}, zbook: E.zbook,
      feints: E.feints || [], feintUsed: E.feintUsed || {} },
    S: { civ: S ? S.civ : 0 }
  };
}
