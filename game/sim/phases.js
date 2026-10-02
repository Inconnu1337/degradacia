'use strict';
/* ============================================================
   ФАЗЫ: день подготовки → ночное дежурство → разбор → итоги.
   Экраны и правила режима (план ночи, события, итоги) — через MODE.
   ============================================================ */

/* млн в час: укрытия, остановленные линии, транспорт */

/* ---------- тревога ---------- */
function threatNearCities(r) {
  return G.threats.some(th => !th.dead && th.seen > G.t - 90 &&
    WD.cities.some(c => !c.enemy && dist(c, th) < r));
}

function toggleAlarm() {
  if (!MODE.playerAlarm) return;
  if (G.phase !== 'night') { toast('Тревогу объявляют только во время дежурства', 'i'); return }
  G.alarm = !G.alarm;
  if (G.alarm) {
    G.alarmSince = G.t;
    if (!G.threats.some(th => th.vis)) E.obs.alarmEarly += .5;
    hq('<b>Объявлена воздушная тревога в крае.</b> Население — в укрытия, промышленность переведена на аварийный режим.', 'hq');
    toast('Воздушная тревога объявлена', 'i');
  } else {
    hq(`Отбой воздушной тревоги. Суммарно тревога действовала ${fmtDur(G.alarmT)}.`, 'hq');
    if (threatNearCities(45)) hq('Внимание: в воздухе ещё есть цели над обжитой территорией.', 'w');
  }
  uiDirty();
}

function alarmStep(dt) {
  if (G.phase !== 'night') return;
  if (G.alarm) {
    G.alarmT += dt;
    const c = dt / 3600 * ALARM_COST_H;
    G.budget -= c; S.alarmCost += c;
    if (!threatNearCities(90)) {
      G.falseRun = (G.falseRun || 0) + dt;
      if (G.falseRun > 1500) {
        S.falseAlarm += dt;
        G.alarmTrust = Math.max(.2, G.alarmTrust - dt / (3600 * 5));
      }
    } else G.falseRun = 0;
  } else {
    G.falseRun = 0;
    if (threatNearCities(22)) S.uncovered += dt;
  }
  if (G.budget < 0 && G.alarm) {
    G.budget = 0;
    if (G.t - (G.noMoneyT || -1e9) > 3600) {
      G.noMoneyT = G.t;
      hq('Средств на содержание режима тревоги не остаётся. Администрация края просит решения штаба.', 'w');
    }
  }
}

/* ---------- подготовка ---------- */
function startPrep(first) {
  G.phase = 'prep'; G.t = 0; G.speed = 0;
  G.threats = []; G.miss = []; G.comms = []; G.reqs = []; G.intelQ = []; G.ready = {};
  G.alarm = false; G.alarmT = 0; G.falseRun = 0;
  G.alarmTrust = Math.min(1, G.alarmTrust + .25);

  const wr = Math.random() * sum(WEATHER.map(w => w.w));
  let acc = 0;
  for (const w of WEATHER) { acc += w.w; if (wr <= acc) { G.weather = w; break } }

  for (const u of G.units) {
    u.moved = false; u.after = []; u.assign = null;
    u.crew.fat *= .25;
    if (u.st !== 'ready') { u.st = 'ready'; u.dest = null; u.rtb = 0 }
    if (UT[u.k].air) u.fuel = UT[u.k].fuel;
    u.burn = (u.shots || 0) + ((u.emit || 0) > 1500 ? 2 : 0);
    u.seenT.clear(); u.det.clear(); u.emit = 0; u.reqT = {}; u.sayT = {};
  }
  S = newStats();
  eDay(first);
  MODE.planNight();
  if (!first) MODE.prepEvents();

  hq(MODE.text.prepDay(), 'hq');
  if (first) for (const line of MODE.text.prepFirst()) hq(line, 'm');
}

function startNight2() {
  hideModal();
  if (G.phase !== 'prep') return;
  G.phase = 'night'; G.t = 0; G.ready = {};
  resetSpeed(15);
  S.startBudget = G.budget;
  hq(MODE.text.nightOpen(), 'hq');
  MODE.onNightOpen();
  for (const it of G.intelQ) if (it.t < 0) it.t = R(5, 200);
  G.intelQ.sort((a, b) => a.t - b.t);
}

function nextDay() {
  hideModal();
  G.night++;
  startPrep(false);
}

/* ---------- основной шаг симуляции ---------- */
function step(dt) {
  G.t += dt;
  while (G.intelQ.length && G.intelQ[0].t <= G.t) {
    const it = G.intelQ.shift();
    if (it.cls === 'civ') { const c = civIntel(); if (c) showIntel({ txt: c.txt, gr: c.gr, cls: '' }) }
    else showIntel(it);
  }
  eLaunch();
  if (G.t >= E.nextThink) MODE.think();
  G.jam = E.jamBase + (G.linkPenalty || 0) + (E.jamWin && G.t > E.jamWin[0] && G.t < E.jamWin[1] ? .3 : 0)
    + G.threats.reduce((a, th) => a + (!th.dead && th.cls === 'ewuav' ? .06 : 0), 0);

  commsStep(); reqStep(); threatsStep(dt); alarmStep(dt);

  G.acc1 += dt;
  if (G.acc1 >= 1) {
    const st = G.acc1; G.acc1 = 0;
    sense(st); unitsThink(st); ewStep(st); eObserve();
    const vis = G.threats.filter(th => th.vis && !th.dead);
    if (vis.length && !G.hadVis) {
      hq(MODE.text.seen(vis.length), 'w');
      if (autoPace() && G.speed > 15) setSpeed(15);
    }
    if (vis.some(th => th.cls === 'ballistic' || th.cls === 'aeroball') && !G.hadBal && autoPace() && G.speed > 5) setSpeed(5);
    G.hadVis = vis.length > 0;
    G.hadBal = vis.some(th => th.cls === 'ballistic' || th.cls === 'aeroball');
    G.det = vis.length;
  }
  unitsStep(dt); missStep(dt);

  if (G.t >= NIGHT_LEN && (!G.threats.some(th => !th.dead) || G.t > NIGHT_LEN + 2400)) {
    hq(MODE.text.dawn(), 'hq');
    G.alarm = false;
    MODE.debrief();
  }
}
