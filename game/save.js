'use strict';
/* ============================================================
   СОХРАНЕНИЕ ПАРТИИ (сервер)
   ------------------------------------------------------------
   Полное состояние G/E/S кодируется в JSON. Ссылки внутри состояния
   (пакет → цель-объект, район пуска, город, погода) заменяются
   метками { $o: id } · { $u: id } · { $z: id } · { $c: имя } · { $w: id },
   Set и Map — { $set: […] } · { $map: […] }, функции отбрасываются.
   При загрузке сначала восстанавливаются объекты и расчёты, потом всё
   остальное со ссылками на них.
   Сохранять можно днём и ночью. Ночью в файл идут и цели в воздухе,
   и очередь пусков, и приказы в пути; не сохраняются только наши
   ракеты в полёте (ссылаются на цель напрямую), запросы расчётов
   (у них колбэки) и ответы-колбэки в эфире — после загрузки
   расчёты при нужде спросят снова. Ночная партия открывается на паузе.
   ============================================================ */

const SAVE_VERSION = 1;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function encodeState() {
  const objs = new Set(G.objs), units = new Set(G.units), zones = new Set(ZONES), cities = new Set(WD.cities), wx = new Set(WEATHER);
  const seen = new Set();
  function enc(v, canon) {
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function' || typeof v === 'undefined') return undefined;
      if (typeof v === 'number' && !Number.isFinite(v)) return v > 0 ? 1e15 : -1e15;
      return v;
    }
    if (!canon) {
      if (objs.has(v)) return { $o: v.id };
      if (units.has(v)) return { $u: v.id };
      if (zones.has(v)) return { $z: v.id };
      if (cities.has(v)) return { $c: v.n };
      if (wx.has(v)) return { $w: v.id };
    }
    if (v instanceof Set) return { $set: [...v].map(x => enc(x)) };
    if (v instanceof Map) return { $map: [...v].map(([k, x]) => [enc(k), enc(x)]) };
    if (seen.has(v)) return null;          /* цикл — не должно быть, но не зависаем */
    seen.add(v);
    let r;
    if (Array.isArray(v)) r = v.map(x => { const e = enc(x); return e === undefined ? null : e });
    else {
      r = {};
      for (const k of Object.keys(v)) { const e = enc(v[k]); if (e !== undefined) r[k] = e }
    }
    seen.delete(v);
    return r;
  }
  const g = {};
  const SKIP = new Set(['objs', 'units', 'miss', 'reqs', 'comms']);
  for (const k of Object.keys(G)) if (!SKIP.has(k)) { const e = enc(G[k]); if (e !== undefined) g[k] = e }
  /* приказы в пути: без колбэков и без «уничтожить цель» (там ссылка на саму цель) */
  g.comms = enc(G.comms.filter(c => c.o && c.o.t !== 'cb' && c.o.t !== 'assign'));
  g.objs = G.objs.map(o => enc(o, true));
  g.units = G.units.map(u => enc(u, true));
  return {
    v: SAVE_VERSION, mode: MODE.id, night: G.night,
    G: g, E: enc(E), S: enc(S), csUsed: enc(csUsed),
    time: { AUTO: enc(AUTO) }
  };
}

function decodeState(d) {
  if (!d || d.v !== SAVE_VERSION) throw new Error('Неподдерживаемая версия сохранения');
  if (d.mode !== MODE.id) throw new Error('Сохранение от другого режима');
  let depth = 0;
  const objById2 = new Map(), unitById2 = new Map();
  function dec(v) {
    if (v === null || typeof v !== 'object') return v;
    if (++depth > 60) throw new Error('Слишком глубокая структура');
    try {
      if (Array.isArray(v)) return v.map(dec);
      if ('$o' in v) return objById2.get(String(v.$o)) || null;
      if ('$u' in v) return unitById2.get(+v.$u) || null;
      if ('$z' in v) return ZONES.find(z => z.id === v.$z) || ZONES[0];
      if ('$c' in v) return WD.cities.find(c => c.n === v.$c) || null;
      if ('$w' in v) return wxById(v.$w);
      if ('$set' in v) return new Set((v.$set || []).map(dec));
      if ('$map' in v) return new Map((v.$map || []).map(([k, x]) => [dec(k), dec(x)]));
      const r = {};
      for (const k of Object.keys(v)) if (!BAD_KEYS.has(k)) r[k] = dec(v[k]);
      return r;
    } finally { depth-- }
  }
  const g = d.G || {};
  if (!Array.isArray(g.objs) || !Array.isArray(g.units)) throw new Error('В сохранении нет объектов или расчётов');
  const objs = g.objs.map(o => { const x = dec(o); objById2.set(String(x.id), x); return x });
  /* расчёты: сначала заготовки с id, чтобы взаимные ссылки разрешились */
  const units = g.units.map(u => { const x = { id: +u.id }; unitById2.set(x.id, x); return x });
  g.units.forEach((u, i) => Object.assign(units[i], dec(u)));
  const ng = {};
  for (const k of Object.keys(g)) if (!BAD_KEYS.has(k) && k !== 'objs' && k !== 'units') ng[k] = dec(g[k]);
  ng.objs = objs; ng.units = units;
  /* обязательные поля расчётов, которых могло не быть в старом сохранении */
  for (const u of units) {
    if (!(u.det instanceof Set)) u.det = new Set();
    if (!(u.seenT instanceof Map)) u.seenT = new Map();
    u.repQ = []; u.after = u.after || []; u.reqT = u.reqT || {}; u.spots = u.spots || [{ x: u.x, y: u.y }];
  }
  G = ng; E = dec(d.E); S = dec(d.S);
  csUsed = dec(d.csUsed) || {};
  if (d.time && d.time.AUTO) for (const r in AUTO) AUTO[r] = d.time.AUTO[r] !== false;
  const night = G.phase === 'night';
  G.speed = 0; G.ready = {}; G.reqs = []; G.miss = [];
  SPEED = 0;
  if (night) {
    /* ночь продолжается с паузы: ракеты в полёте и запросы не восстанавливаются */
    G.comms = (G.comms || []).filter(c => c && c.u && c.o);
    for (const u of units) {
      u.pend = G.comms.filter(c => c.u === u).length;
      u.after = (u.after || []).filter(o => o && o.t !== 'assign' && o.t !== 'cb');
    }
    for (const th of G.threats || []) th.eng = 0;
    G.threats = G.threats || [];
  } else {
    G.phase = 'prep';
    G.comms = []; G.threats = [];
  }
}
