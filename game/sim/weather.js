'use strict';
/* ============================================================
   ПОГОДА В БОЮ
   Погода на ночь выбирается днём (с прогнозом), ночью может смениться.
   Влияет на: скорость дронов (ветер), обледенение, дальность радаров,
   оптику и пулемёты, вертолёты, марши техники, FPV.
   G.wind = { a, v } — куда дует (радианы) и скорость, м/с.
   ============================================================ */

function pickWeather(not) {
  const pool = WEATHER.filter(w => w.id !== not);
  const wr = Math.random() * sum(pool.map(w => w.w));
  let acc = 0;
  for (const w of pool) { acc += w.w; if (wr <= acc) return w }
  return pool[0];
}

/** ветер под погоду; направление держится с прошлого раза (±40°) */
function rollWind(w, prev) {
  const a = prev ? prev.a + R(-.7, .7) : R(0, 6.28);
  return { a, v: Math.round(R(w.wind[0], w.wind[1])) };
}

/** день: погода на ночь и, возможно, её смена посреди ночи (с прогнозом) */
function planWeather() {
  G.weather = pickWeather();
  G.wind = rollWind(G.weather, G.wind);
  G.wxNext = null;
  if (chance(.45)) {
    const next = pickWeather(G.weather.id);
    G.wxNext = { t: Math.round(R(2, 8)) * 3600, id: next.id };
  }
}

/** текст прогноза для дневной сводки (прогноз ошибается в каждом пятом случае) */
function forecastText() {
  let s = `Ветер ${windName(G.wind.a)}, ${G.wind.v} м/с.`;
  if (G.wxNext) s += ` Прогноз: около ${clock(G.wxNext.t)} — ${wxById(G.wxNext.id).n.toLowerCase()}.`;
  else if (chance(.2)) s += ` Прогноз: возможна смена погоды к утру.`;
  return s;
}

/** длительность смены погоды: фронт подходит час и столько же уходит прежняя погода */
const WX_FRONT = 3600;

/**
 * ночь: смена погоды по плану — не скачком. За час до срока метеослужба
 * предупреждает о фронте, ветер начинает плавно меняться, картинка на карте
 * перетекает (G.wxTrans), а правила погоды переключаются в середине перехода.
 */
function weatherStep() {
  const T = G.wxTrans;
  if (T) {
    const k = clamp((G.t - T.t0) / (T.t1 - T.t0), 0, 1);
    const sm = k * k * (3 - 2 * k);
    const ax = Math.cos(T.w0.a) * T.w0.v * (1 - sm) + Math.cos(T.w1.a) * T.w1.v * sm;
    const ay = Math.sin(T.w0.a) * T.w0.v * (1 - sm) + Math.sin(T.w1.a) * T.w1.v * sm;
    G.wind = { a: Math.atan2(ay, ax), v: Math.max(0, Math.round(Math.hypot(ax, ay))) };
    if (G.t >= T.t1) G.wxTrans = null;
  }
  if (!G.wxNext) return;
  const w = wxById(G.wxNext.id);
  if (!G.wxTrans && G.t >= G.wxNext.t - WX_FRONT) {
    G.wxTrans = { from: G.weather.id, to: w.id, t0: G.t, t1: G.wxNext.t + WX_FRONT, w0: { ...G.wind }, w1: rollWind(w, G.wind) };
    hqAll(`Метео: с ${pick(['запада', 'юго-запада', 'севера', 'северо-запада'])} подходит фронт — через час ${w.n.toLowerCase()}.`, 'm');
  }
  if (G.t < G.wxNext.t) return;
  G.wxNext = null;
  G.weather = w;
  hqAll(`Метео: ${w.n.toLowerCase()}. ${w.d}`, 'w');
  if (!w.heli) for (const u of G.units) if (UT[u.k].air && u.st === 'air' && !u.rtb) {
    u.rtb = 1; u.dest = { ...u.base };
    say(u, 'Погода нелётная, возвращаемся на площадку.', 'w');
  }
}

/** лёгкие тихоходные цели, которых сносит ветер и которые обледеневают */
const WIND_CLS = { drone: 1, decoy: 1, loiter: 1, fpv: 1, mother: 1, recon: 1, ewuav: 1 };

/** множитель скорости цели от ветра (попутный — быстрее, встречный — медленнее) */
function windMul(th) {
  if (!WIND_CLS[th.cls] || !G.wind) return 1;
  const along = th.hx * Math.cos(G.wind.a) + th.hy * Math.sin(G.wind.a);
  const air = TT[th.k].sp * 1000;          /* м/с */
  return clamp(1 + along * G.wind.v / air * .9, .45, 1.6);
}
