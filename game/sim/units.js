'use strict';
/* ============================================================
   РАСЧЁТЫ: обнаружение, опознавание, выбор цели, огонь, собственные решения командиров.
   ============================================================ */

/** запомнить позицию: сюда расчёт сможет вернуться (до 8 последних) */
function markSpot(u) {
  if (u.spots.some(s => dist(s, u) < SPOT_R)) return;
  u.spots.push({ x: u.x, y: u.y });
  if (u.spots.length > 8) u.spots.shift();
}

/* ---------- помехи с воздуха ---------- */
function airJamMul(u) {
  let m = 1;
  for (const th of G.threats) {
    if (th.dead || !TT[th.k].cls || TT[th.k].cls !== 'ewuav') continue;
    const d = dist(u, th);
    if (d < 95) m *= lerp(.48, 1, clamp(d / 95, 0, 1));
  }
  return m;
}

/* ---------- ракетная опасность ----------
   Разведка доложила о пусках ракет (сводка «crit») в последний час или сеть
   видит в воздухе ракету / реактивную цель. Пока опасность действует,
   ЗРК в режиме «по целеуказанию» держат РЛС включённой (низколетящую
   крылатую иначе никто не подсветит), а дорогие ракеты берегут для ракет. */
const MISSILE_CLS = { cruise: 1, jet: 1, arm: 1, ballistic: 1, aeroball: 1, kab: 1 };

function missileAlert() {
  if (G.alertT === G.t) return G.alertV;
  G.alertT = G.t;
  G.alertV = (G.missileWarn || []).some(t => t <= G.t && G.t - t < 3600)
    || G.threats.some(th => !th.dead && MISSILE_CLS[th.cls] && th.seen > G.t - 90);
  return G.alertV;
}

/* ---------- обнаружение и опознавание ---------- */
function sense(dt) {
  const t = G.t, wx = G.weather;
  for (const th of G.threats) th.vis = false;

  for (const u of G.units) {
    const T = UT[u.k];
    u.det.clear();
    const oper = u.st === 'ready' || u.st === 'air';
    u.rOn = false;
    if (T.radar && oper) {
      if (u.radar === 'on') u.rOn = true;
      else if (u.radar === 'cue') {
        const cr = Math.max(T.w ? T.w.r * 1.6 : 0, 45);
        if (G.threats.some(th => !th.dead && th.seen > t - 15 && dist(u, th) < cr)) u.rOn = true;
        else if (T.w && T.w.kind === 'missile' && missileAlert()) u.rOn = true;
      }
    }
    if (T.fake && oper && u.radar !== 'off') u.rOn = true;
    u.emit = u.rOn ? u.emit + 1 : Math.max(0, u.emit - 3);

    const jm = u.rOn ? airJamMul(u) : 1;
    const eo = T.eo && u.st !== 'reload' ? T.eo * wx.eo : 0;

    for (const th of G.threats) {
      if (th.dead) continue;
      const TTh = TT[th.k], d = dist(u, th);
      let det = false, byRadar = false;

      if (u.rOn && T.radar) {
        const alt = th.alt === 'high' ? 1.35 : th.alt === 'mid' ? 1.12 : 1;
        const cap = HORIZON[th.alt] || HORIZON.low;
        const rng = Math.min(T.radar * TTh.dm * alt * jm * (wx.radar || 1), cap);
        if (d < rng) { det = true; byRadar = true }
      }
      if (eo && d < eo * (EOK[th.cls] || 0) * (th.alt === 'high' ? .5 : 1)) {
        det = true;
        /* вблизи видно, что это фанера */
        if (d < 2.6 && th.cls === 'decoy' && !th.idDecoy) {
          th.idDecoy = true; th.idLv = 2;
          sayT(u, 'dec', 60, `Цель азимут ${az(u, th)} — имитатор, «Мотылёк». Боевой части нет, ракеты не тратьте.`, 'g');
        }
        if (d < 3.5) th.idLv = Math.max(th.idLv, 2);
        else th.idLv = Math.max(th.idLv, 1);
      }
      if (!det) continue;

      u.det.add(th.id);
      th.vis = true;
      if (byRadar) {
        th.obs = (th.obs || 0) + dt * (1 + (T.pw || .4));
        if (th.obs > 14) th.idLv = Math.max(th.idLv, 1);
        if (th.obs > 70 && (T.pw || 0) >= 1) th.idLv = Math.max(th.idLv, 2);
        th.byR = true;
      }
      /* баллистику узнают сразу — по скорости и траектории */
      if (th.cls === 'ballistic' || th.cls === 'aeroball') th.idLv = 2;
      if (th.seen < t - 30 && th.first != null) th.first = t;
      th.seen = t;
      if (th.first == null) th.first = t;
      th.lx = th.x; th.ly = th.y;
      if (!u.seenT.has(th.id)) { u.seenT.set(th.id, t); u.repQ.push(th) }
    }
  }
  /* высотная крылатая ракета над краем: её ведёт вся сеть РЛС страны, без наших радаров */
  for (const th of G.threats) {
    if (th.dead || !th.hiAlt || th.x > WW + 20) continue;
    th.vis = true; th.idLv = Math.max(th.idLv, 1);
    if (th.first == null) th.first = t;
    th.seen = t; th.lx = th.x; th.ly = th.y;
    if (!th.netRep && MODE.humans.includes('def')) {
      th.netRep = 1;
      if (t - (G.hiRepT || -1e9) > 60) {
        G.hiRepT = t;
        asSide('def', () => hq(`Сеть РЛС: высотная крылатая ракета, кв. ${sq(th)}, курс ${DIRS_ON[dirIdx(th.hx, th.hy)]}. Ведём от границы.`, 'w'));
      }
    }
  }
}

/* ---------- боевая работа ---------- */
function react(u) {
  const c = u.crew;
  return 3 + 8 * (1 - c.exp) + 10 * c.fat + (c.trait === 'решительный' ? -2 : c.trait === 'осторожный' ? 2 : 0) - cpBoost(u) * 8;
}

function pkEff(u, th) {
  const W = UT[u.k].w, c = u.crew;
  let p = (W.pk[th.cls] || 0) * (.8 + .3 * c.exp) * (1 - .15 * c.fat);
  /* повреждённый комплекс работает хуже */
  const T = UT[u.k];
  if (u.hp < T.hp) p *= .55 + .45 * u.hp / T.hp;
  if (W.kind === 'gun') {
    p *= G.weather.gun; if (th.alt === 'high') p *= .4; if (th.alt === 'mid') p *= .7;
    /* ствол достаёт далеко, но точно бьёт только вблизи: до 40% дальности — полная вероятность, к пределу — треть */
    const fr = dist(u, th) / W.r;
    if (fr > .4) p *= 1 - .65 * Math.min(1, (fr - .4) / .6);
  }
  return clamp(p, 0, .97);
}

/** рядом есть кто-то, кто снимет цель дешевле */
function cheaperNear(o, th, u) {
  if (!o) return false;
  return G.units.some(v => v !== u && (v.st === 'ready' || v.st === 'air') && v.am > 0 && UT[v.k].w &&
    (UT[v.k].w.mc || 0) < .2 && (UT[v.k].w.pk[th.cls] || 0) > .1 &&
    dist(v, o) < UT[v.k].w.r + 1.5 && v.roe !== 'hold');
}

function canEngage(u, th) {
  const W = UT[u.k].w, d = dist(u, th);
  if (d > W.r) return false;
  if ((th.cls === 'ballistic' || th.cls === 'aeroball') && d > (W.rb || 0)) return false;
  if (W.kind === 'drone') return th.seen > G.t - 6;
  if (UT[u.k].radar && W.kind === 'missile') return u.rOn && u.det.has(th.id);
  /* ПЗРК и пулемёты без своего радара берут и целеуказание сети: штаб даёт азимут, расчёт ищет цель */
  return u.det.has(th.id) || (th.vis && th.seen > G.t - 8 && d < W.r * .85);
}

function chooseTarget(u) {
  const T = UT[u.k], W = T.w;
  let best = null, bs = -1e9;
  for (const th of G.threats) {
    if (th.dead || !canEngage(u, th)) continue;
    const pcl = percCls(th);
    const pk = pkEff(u, th);
    if (pk < .05) continue;
    const st = W.kind === 'drone' ? th.first : u.seenT.get(th.id);
    if (st == null || G.t - st < react(u)) continue;
    if (W.kind !== 'gun') {
      const need = (th.cls === 'ballistic' || th.cls === 'aeroball') ? 2 : 1;
      if (th.eng >= need) continue;
    }
    /* опознанный имитатор дорогой ракетой не бьём */
    if (th.cls === 'decoy' && th.idDecoy && (W.mc || 0) >= .1 && u.assign !== th.id) continue;

    const o = predictObj(th);
    let val = o ? o.v / 100 : .2;
    if (o && u.cover === o.id) val += .8;
    if (th.cls === 'recon' || th.cls === 'ewuav') val = Math.max(val, .95);
    if (th.cls === 'arm' && th.armTgt === u.id) val = Math.max(val, 1.6);
    if (u.assign === th.id) val += 4;
    if (th.cls === 'ballistic' && dist(th.path[th.path.length - 1], u) < 3) val += 2;
    /* ракетный комплекс в первую очередь — по ракетам */
    if (W.kind === 'missile' && DANGER[pcl] >= 3.5) val += 2;

    const mc = W.mc || 0;
    if (mc >= .4 && DANGER[pcl] <= 2.8 && u.assign !== th.id) {
      const self = dist(u, th) < 6;          /* цель идёт прямо на позицию — самооборона */
      /* по мелочи дорогой ракетой — один раз: промахнулись, пусть добивают другие */
      if ((th.samTry || 0) >= 1 && !self) continue;
      if (u.roe === 'eco') {
        /* ракеты в воздухе или на подлёте — дорогие ракеты только для них */
        if (missileAlert() && !self) continue;
        /* «Бастион» по дронам — только самозащита */
        if (mc >= 2 && !self) continue;
        if (!(o && (o.v >= 90 || u.cover === o.id)) && th.cls !== 'recon' && th.cls !== 'ewuav') continue;
        if (o && dist(th, o) > 15 && th.cls !== 'recon' && th.cls !== 'ewuav') continue;
        if (cheaperNear(o, th, u) && dist(th, o) > 3) continue;
      }
      if (u.am <= (W.reserve || 0)) continue;
    }
    if (u.am <= (W.reserve || 0) && DANGER[pcl] < 4 && u.assign !== th.id) continue;

    const sc = DANGER[pcl] * 1.5 + val * 3 + pk * 2 - dist(u, th) / W.r;
    if (sc > bs) { bs = sc; best = th }
  }
  return best;
}

function fire(u, th) {
  const T = UT[u.k], W = T.w;
  u.am--; u.shots++;
  S.shots[u.k] = (S.shots[u.k] || 0) + 1;
  u.cd = W.rate * (1.15 - u.crew.exp * .3);
  u.ta = Math.atan2(th.y - u.y, th.x - u.x);
  S.spent += W.mc || 0;
  u.crew.fat = Math.min(1, u.crew.fat + .002);
  const pk = pkEff(u, th);

  if (W.kind === 'gun') {
    fx({ k: 'tracer', x: u.x, y: u.y, x2: th.x, y2: th.y, d: 340 });
    if (chance(pk)) killThreat(th, u);
    else if (chance(.25)) sayT(u, 'gmiss', 22, phr('gmiss', {}, u), 'm');
  } else {
    th.eng++;
    if (W.mc >= .4) th.samTry = (th.samTry || 0) + 1;
    G.miss.push({ x: u.x, y: u.y, sp: W.msp, th, u, pk, t0: G.t, kind: W.kind, trail: [], maxT: W.r / W.msp * 1.7 + 15 });
    fx({ k: 'launch', x: u.x, y: u.y, d: 520, a: u.ta });
    eSawLaunch(u);
    if (W.mc >= .4 || chance(.25)) sayT(u, 'fire', W.mc >= .4 ? 8 : 45, phr('fire', {
      lb: thLabel(th), az: az(u, th), d: num(dist(u, th), 0),
      alt: th.alt === 'high' ? 'большая' : th.alt === 'mid' ? 'средняя' : 'малая'
    }, u));
  }
  if (u.am === 0) say(u, W.kind === 'gun' ? 'Боекомплект израсходован, ствол молчит.' : 'Ракет нет! Пусковые пустые.', 'w');
}

/* ---------- полёт наших ракет ----------
   Наведение с упреждением и ограниченной скоростью разворота: ракета
   не может развернуться на месте. Подрыв — по неконтактному взрывателю,
   когда цель проходит рядом с отрезком полёта за шаг. Если цель ушла за
   спину и расстояние растёт — промах, ракета самоликвидируется. */
const MSL_TURN = { missile: .55, drone: .35 };   /* рад/с */
const MSL_FUSE = { missile: .3, drone: .18 };    /* км */

function missStep(dt) {
  for (const m of G.miss) {
    if (m.done) continue;
    const th = m.th;
    if (th.dead) { m.done = true; fx({ k: 'air', x: m.x, y: m.y, d: 380, small: 1 }); continue }
    const ts = TT[th.k].sp * (typeof windMul === 'function' ? windMul(th) : 1);
    const d0 = Math.hypot(th.x - m.x, th.y - m.y);
    /* упреждение: где будет цель через время подлёта (не дальше 40 с) */
    const lead = Math.min(40, d0 / (m.sp + .001));
    const tx = th.x + th.hx * ts * lead, ty = th.y + th.hy * ts * lead;
    const want = Math.atan2(ty - m.y, tx - m.x);
    if (m.a == null) m.a = want;
    let da = ((want - m.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const turn = (MSL_TURN[m.kind] || .5) * dt;
    m.a += clamp(da, -turn, turn);
    const stp = m.sp * dt;
    const nx = m.x + Math.cos(m.a) * stp, ny = m.y + Math.sin(m.a) * stp;
    /* неконтактный взрыватель: ближайшая точка отрезка полёта к цели */
    const near = segDist(th, { x: m.x, y: m.y }, { x: nx, y: ny }).d;
    if (near <= (MSL_FUSE[m.kind] || .25) + ts * dt) {
      m.done = true; th.eng--;
      m.x = nx; m.y = ny;
      if (chance(m.pk)) killThreat(th, m.u);
      else {
        fx({ k: 'air', x: m.x, y: m.y, d: 380, small: 1 });
        sayT(m.u, 'miss', 10, phr('miss', {}, m.u), 'w');
      }
      continue;
    }
    m.x = nx; m.y = ny;
    m.trail.push(m.x, m.y);
    if (m.trail.length > 30) m.trail.splice(0, 2);
    /* цель за спиной и удаляется — ракета её уже не догонит */
    const d1 = Math.hypot(th.x - m.x, th.y - m.y);
    if ((Math.abs(da) > 1.8 && d1 > d0) || (G.t - m.t0 > m.maxT)) {
      m.done = true; th.eng--;
      fx({ k: 'air', x: m.x, y: m.y, d: 300, small: 1 });
      sayT(m.u, 'miss2', 15, phr('miss2', {}, m.u), 'm');
    }
  }
  G.miss = G.miss.filter(m => !m.done);
}

function killThreat(th, u) {
  if (th.dead) return;
  th.dead = true;
  S.killed[th.k]++;
  u.kills++; u.nk = (u.nk || 0) + 1;
  u.crew.exp = Math.min(.95, u.crew.exp + .008);
  crewHonor(u);
  fx({ k: 'air', x: th.x, y: th.y, d: 700 });
  const W = UT[u.k].w;
  if (W.kind === 'gun') S.gunK++;
  else if (W.kind === 'drone') S.icptK++;
  else if (W.mc >= .4) { S.samK++; if (th.cls === 'decoy') S.decoySam++ }
  eLoss(th, W.kind);
  MODE.onThreatKilled(th, u);
  debris(th, u);
  const lb = thLabel(th);
  sayT(u, 'kill', W.kind === 'gun' ? 20 : 6, phr(W.kind === 'gun' ? 'killGun' : 'killMsl', { lb, am: u.am }, u), 'g');
}

function debris(th, u) {
  const c = inCity(th);
  if (!c) return;
  const p = { drone: .25, decoy: .1, loiter: .2, mother: .2, fpv: .02, kab: .3, jet: .3, recon: .1, ewuav: .1, arm: .25, cruise: .35, ballistic: .45, aeroball: .45 }[th.cls];
  if (!chance(p)) return;
  const n = Math.max(0, Math.round(RI(0, 4) * alarmMul()));
  civLoss(n);
  hq(`Обломки сбитой цели упали в жилом районе (${c.n}).${n ? ' Пострадавшие: ' + n + '.' : ' Без пострадавших.'}`, 'w');
}

/* ---------- тревога: сколько людей успевает в укрытия ---------- */
function alarmMul() {
  if (!G.alarm) return 1;
  return lerp(.85, .18, clamp(G.alarmTrust, 0, 1));
}

/* ---------- население ----------
   G.morale (0–100) — настроение края. Падает от пострадавших (особенно
   без тревоги), от пустых тревог и отключений света; растёт после
   спокойных ночей. От него зависит бюджет на следующие сутки. */
function civLoss(n) {
  if (!n) return;
  S.civ += n; G.civTotal += n;
  moraleAdd(-n * (G.alarm ? .9 : 1.6));
}

function moraleAdd(d) { G.morale = clamp((G.morale == null ? 70 : G.morale) + d, 0, 100) }

/** множитель бюджета от настроения населения */
const moraleMul = () => .55 + .6 * (G.morale == null ? 70 : G.morale) / 100;

/* ---------- собственные решения расчётов ---------- */
function unitsThink(dt) {
  const t = G.t;
  for (const u of G.units) {
    if (u.hp <= 0) continue;
    const T = UT[u.k];
    if (u.seenT.size > 90) for (const id of u.seenT.keys()) if (!thrById(id)) u.seenT.delete(id);
    if (u.repQ.length && t - u.lastRep > 25) report(u);
    if (u.after.length && (u.st === 'ready') && !engagedNow(u)) {
      const o = u.after.shift();
      say(u, 'Отбой по целям. Выполняю ранее полученный приказ: ' + descOrder(o) + '.');
      receive(u, o);
    }
    if (u.st !== 'ready' && u.st !== 'air') continue;
    if (T.w && u.roe !== 'hold' && u.am > 0) {
      u.cd -= 1;
      if (u.cd <= 0) { const th = chooseTarget(u); if (th) fire(u, th) }
    }
    if (u.assign) { const a = thrById(u.assign); if (!a || a.dead) u.assign = null }
    concerns(u);
  }
}

function report(u) {
  const arr = u.repQ.filter(th => !th.dead && (!th.repT || G.t - th.repT > 120));
  u.repQ = [];
  if (!arr.length) return;
  u.lastRep = G.t;
  arr.forEach(th => th.repT = G.t);
  const grp = {};
  for (const th of arr) { const l = thLabel(th); (grp[l] = grp[l] || []).push(th) }
  const parts = Object.entries(grp).map(([l, a]) => {
    const th = a[0];
    return `${l} — ${a.length}, азимут ${az(u, th)}, ${num(dist(u, th), 0)} км, ${courseW(th)}`;
  });
  const bad = arr.some(th => th.cls === 'ballistic' || th.cls === 'aeroball');
  const first = arr.every(th => th.idLv <= 0);
  say(u, (bad ? 'Баллистическая цель! ' : first ? 'Есть контакт. ' : 'Наблюдаю: ') + parts.join('; ') + '.', bad ? 'w' : '');
}

function concerns(u) {
  const T = UT[u.k], c = u.crew, t = G.t;
  if (G.phase !== 'night') return;

  /* боекомплект */
  if (T.w && u.am <= Math.ceil(T.w.am * .25) && t - (u.reqT.am || -1e9) > 900 && !engagedNow(u)) {
    u.reqT.am = t;
    const cost = reloadCost(u);
    ask(u, `Боекомплект ${u.am}/${T.w.am}. Прошу пополнение: ${num(cost)} млн, ${fmtDur(reloadTime(u))} вне боя.`,
      [{ l: 'Разрешаю', f: () => receive(u, { t: 'reload', sk: { x: 1 } }) },
      { l: 'Отказать', f: () => say(u, 'Принял, работаем остатком.') }],
      c.trait === 'осторожный' ? 0 : 1, 'am');
  }
  /* над нами прошёл разведчик */
  const rec = G.threats.find(th => !th.dead && (th.cls === 'recon' || th.cls === 'ewuav') && u.det.has(th.id) && dist(u, th) < 8);
  if (rec && (T.radar || T.fake || T.ewr) && t - (u.reqT.rec || -1e9) > 1800) {
    u.reqT.rec = t;
    const a = R(0, 6.28);
    let p = nudgeOwn({ x: u.x + Math.cos(a) * R(4, 7), y: u.y + Math.sin(a) * R(4, 7) });
    const rd = roadDist(p); if (rd.p && rd.d > 1.5) p = rd.p;
    ask(u, `Над нами прошёл ${th_name(rec)}. Позиция, скорее всего, вскрыта. Прошу смену: кв. ${sq(p)}, ${num(dist(u, p), 0)} км.`,
      [{ l: 'Разрешаю', f: () => receive(u, { t: 'move', p, ok: 1, sk: { road: 1, eng: 1 } }) },
      { l: 'Стоять', f: () => say(u, 'Принял, стоим.') }],
      (c.trait === 'осторожный' || c.trait === 'методичный') ? 0 : 1, 'rec');
  }
  /* по нам идёт антирадарный БпЛА */
  const arm = G.threats.find(th => !th.dead && th.cls === 'arm' && th.armTgt === u.id && dist(u, th) < 40);
  if (arm && u.rOn && t - (u.reqT.arm || -1e9) > 600) {
    u.reqT.arm = t;
    ask(u, `На нас наводится антирадарная цель, ${num(dist(u, arm), 0)} км. Пока РЛС работает — она видит нас. Выключить излучение?`,
      [{ l: 'Выключить РЛС', f: () => receive(u, { t: 'radar', v: 'off', sk: { x: 1 } }) },
      { l: 'Работать дальше', f: () => say(u, 'Принял, продолжаем излучать. Надеюсь, собьём.') }], 0, 'armw');
  }
  /* долго излучаем */
  if (u.radar === 'on' && u.emit > 5000 && T.w && c.exp > .5 && t - (u.reqT.em || -1e9) > 5400) {
    u.reqT.em = t;
    ask(u, 'РЛС излучает больше часа без перерыва, нас наверняка пеленгуют. Предлагаю перейти на «по целеуказанию».',
      [{ l: 'Переходите', f: () => receive(u, { t: 'radar', v: 'cue' }) },
      { l: 'Оставить', f: () => say(u, 'Принял, излучаем.') }], 0, 'em');
  }
  /* повреждены */
  if (u.hp < T.hp * .5 && t - (u.reqT.dmg || -1e9) > 1800) {
    u.reqT.dmg = t;
    const rem = nearSupport(u, 'repair');
    if (rem) sayT(u, 'dmg', 900, `Живучесть ${Math.round(u.hp / T.hp * 100)}%. Ремонтники «${esc(rem.crew.cs)}» рядом, восстанавливаемся на месте.`, 'w');
    else sayT(u, 'dmg', 900, `Живучесть ${Math.round(u.hp / T.hp * 100)}%. Ремонтной машины рядом нет, работаем как можем.`, 'w');
  }
  /* усталость */
  /* о пределе сил расчёт сообщает раз за ночь, а доклады копятся и уходят сводкой (fatigueStep) */
  if (c.fat > .8 && u.fatNight !== G.night) {
    u.fatNight = G.night;
    if (!UT[u.k].fake) (G.fatQ = G.fatQ || []).push(u.id);
  }
  /* топливо вертолёта: возвращаемся с запасом на дорогу; сектор не бросаем — после заправки вернёмся */
  if (T.air && u.st === 'air' && !u.rtb && u.base && u.fuel < dist(u, u.base) / T.sp * 1.25 + 300) {
    u.rtb = 1; u.chase = null; u.dest = { ...u.base };
    say(u, u.patrol && u.patrol.keep
      ? `Топливо на исходе (${fmtDur(u.fuel)}). Идём на заправку, потом обратно в сектор.`
      : `Топлива на ${fmtDur(u.fuel)}, возвращаемся на площадку.`, 'w');
  }
}

const th_name = th => th.cls === 'ewuav' ? 'постановщик помех' : th.idLv >= 2 ? `«${TT[th.k].n}»` : 'разведчик';

/* ---------- перемещения, развёртывание, обеспечение ---------- */
function unitsStep(dt) {
  for (const u of G.units) {
    const T = UT[u.k];
    if (u.st === 'move' && u.dest) {
      const d = dist(u, u.dest), st = T.sp * (G.weather.march || 1) * dt;
      u.h = Math.atan2(u.dest.y - u.y, u.dest.x - u.x);
      if (d <= st) {
        u.x = u.dest.x; u.y = u.dest.y; u.dest = null; markSpot(u);
        u.st = 'deploy'; u.stT = G.t + T.dep;
        say(u, phr('arrive', { sq: sq(u), eta: fmtDur(T.dep) }, u));
      } else { u.x += (u.dest.x - u.x) / d * st; u.y += (u.dest.y - u.y) / d * st }
    }
    else if (u.st === 'air') heliStep(u, T, dt);
    else if (u.st === 'deploy' && G.t >= u.stT) { u.st = 'ready'; say(u, phr('deployed', {}, u), 'g') }
    else if (u.st === 'reload' && G.t >= u.stT) { u.st = 'ready'; u.am = T.w.am; say(u, phr('reloaded', { am: u.am }, u), 'g') }
    else if (u.st === 'refuel' && G.t >= u.stT) {
      u.st = 'ready'; u.fuel = T.fuel; u.am = T.w.am;
      /* вертолёт с постоянной задачей сам возвращается в сектор */
      if (u.patrol && u.patrol.keep && G.weather.heli) {
        u.st = 'air'; u.dest = null; u.chase = null;
        say(u, `Заправлены, боекомплект полный. Возвращаемся в сектор: ${patrolName(u.patrol)}.`, 'g');
      } else say(u, 'Заправлены, боекомплект пополнен. Готовы к вылету.', 'g');
    }
    /* ремонт от «Кузнеца» */
    if (u.hp < T.hp && u.st === 'ready') {
      const rem = nearSupport(u, 'repair');
      if (rem) {
        u.hp = Math.min(T.hp, u.hp + dt * T.hp / 5400);
        if (u.hp >= T.hp) sayT(u, 'fixed', 1e9, 'Повреждения устранены, техника в строю.', 'g');
      }
    }
    /* за спокойную ночь расчёт устаёт до ~0.65; до предела доводит работа (выстрелы, марши) */
    u.crew.fat = Math.min(1, u.crew.fat + dt / (18 * 3600) * (u.st === 'move' ? 1.6 : 1));
  }
}

/* РЭБ уводит навигационные цели */
function ewStep(dt) {
  for (const u of G.units) {
    if (u.k !== 'ew' || u.st !== 'ready') continue;
    const T = UT[u.k];
    for (const th of G.threats) {
      if (th.dead || th.lost) continue;
      const TTh = TT[th.k];
      /* FPV управляется по радиоканалу: РЭБ давит его сильно и с запасом по дальности */
      if (TTh.rc) {
        if (dist(u, th) < T.ewr * 1.3 && chance(.012 * (1 - E.adapt.ewRes * .5) * dt)) {
          th.lost = true;
          th.path = [{ x: th.x + R(-.6, .6), y: th.y + R(-.6, .6) }];
          S.ew[th.k] = (S.ew[th.k] || 0) + 1;
          MODE.onNavLost(th);
          sayT(u, 'ewfpv', 30, phr('ewFpv', {}, u), 'g');
        }
        continue;
      }
      if (!TTh.gps || th.degraded) continue;
      if (dist(u, th) > T.ewr) continue;
      if (chance(.0016 * TTh.gps * (1 - E.adapt.ewRes) * dt)) {
        /* крылатая ракета не теряется: уходит на инерциальную навигацию и мажет сильнее */
        if (th.cls === 'cruise' || th.cls === 'kab') {
          th.degraded = true;
          sayT(u, 'ewcr', 60, `${thLabel(th)}: сбили спутниковую поправку, промах будет больше. ${th.cls === 'kab' ? 'Бомба планирует дальше.' : 'Курс не потеряла.'}`, 'm');
          continue;
        }
        th.lost = true;
        const a = R(0, 6.28), r = R(8, 32);
        th.path = [{ x: th.x + Math.cos(a) * r, y: th.y + Math.sin(a) * r }];
        S.ew[th.k]++; E.learn.ew++;
        MODE.onNavLost(th);
        sayT(u, 'ew', 20, phr('ewNav', { lb: thLabel(th), dir: DIRS_ON[dirIdx(Math.cos(a), Math.sin(a))] }, u), 'g');
      }
    }
  }
}

/* ---------- вертолёт: патруль сектора ----------
   Сектор — точка, объект или наш расчёт (u.patrol.obj / .uid): центр
   следует за ним. Вертолёт сам ищет «мопеды» и прочую мелочь в радиусе
   PATROL_R от центра по данным всей сети, догоняет и бьёт пулемётом,
   потом возвращается на круг. Топливо — сам на заправку и обратно. */
const PATROL_R = 24;
/** маршрут патруля: до PATROL_MAX зон радиусом PATROL_RZ, облёт по кругу */
const PATROL_RZ = 12;

function newPatrol(o) {
  const pts = o.pts && o.pts.length >= 2 ? o.pts.map(q => ({ x: q.x, y: q.y })) : null;
  return { x: o.p.x, y: o.p.y, obj: pts ? null : o.obj || null, uid: pts ? null : o.uid || null, pts, leg: 0, keep: true };
}

/** насколько точка вне сектора: расстояние до ближайшей зоны и радиус зоны */
function patrolDist(p, pt) {
  if (!pt.pts) return dist(p, patrolCenter(pt));
  let d = 1e9;
  for (const q of pt.pts) d = Math.min(d, dist(p, q));
  return d;
}
const patrolR = pt => pt.pts ? PATROL_RZ : PATROL_R;
const HELI_PREY = { drone: 1, decoy: 1, loiter: 1, recon: 1, ewuav: 1, fpv: 1, mother: 1, arm: 1 };

function patrolCenter(pt) {
  if (pt.obj) { const o = objById(pt.obj); if (o) { pt.x = o.x; pt.y = o.y } }
  if (pt.uid) { const v = unitById(pt.uid); if (v && v.hp > 0) { pt.x = v.x; pt.y = v.y } else pt.uid = null }
  return pt;
}

/**
 * площадка подскока: заправка у сектора, а не на далёкой базе —
 * иначе вертолёт всё время летал бы туда-обратно. 8 км от центра
 * сектора в сторону штаба (на своей земле), иначе — родная площадка.
 */
function forwardBase(u, pt) {
  if (!u.home) u.home = { ...u.base };
  const c = pt.pts ? { x: avg(pt.pts.map(q => q.x)), y: avg(pt.pts.map(q => q.y)) } : patrolCenter({ ...pt }), h = G.hq || u.home;
  const d = dist(c, h) || 1;
  const p = { x: c.x + (h.x - c.x) / d * Math.min(8, d), y: c.y + (h.y - c.y) / d * Math.min(8, d) };
  return side(p.x, p.y) === 1 && dist(p, c) < dist(u.home, c) ? p : { ...u.home };
}

function patrolName(pt) {
  if (pt.pts) return `маршрут из ${pt.pts.length} зон, от кв. ${sq(pt.pts[0])}`;
  if (pt.obj) { const o = objById(pt.obj); if (o) return '«' + o.n + '»' }
  if (pt.uid) { const v = unitById(pt.uid); if (v) return 'прикрытие «' + v.crew.cs + '»' }
  return 'кв. ' + sq(pt);
}

function heliStep(u, T, dt) {
  u.fuel -= dt;
  const st = T.sp * dt;
  /* охота: ближайшая подходящая цель в секторе */
  if (u.patrol && !u.rtb && u.am > 0) {
    const pr = patrolR(u.patrol);
    let ch = u.chase ? thrById(u.chase) : null;
    if (ch && (ch.dead || patrolDist(ch, u.patrol) > pr * 1.6 || G.t - ch.seen > 30)) ch = null;
    if (!ch && G.t - (u.huntT || -1e9) > 5) {
      u.huntT = G.t;
      /* в секторе — ближайшую к центру; на маршруте — ближайшую к самому вертолёту */
      let bd = 1e9;
      for (const th of G.threats) {
        if (th.dead || !HELI_PREY[th.cls] || G.t - th.seen > 10 || th.alt === 'high') continue;
        const dz = patrolDist(th, u.patrol);
        if (dz > pr) continue;
        const d = u.patrol.pts ? dist(th, u) : dz;
        if (d < bd) { bd = d; ch = th }
      }
      if (ch && u.chase !== ch.id) sayT(u, 'hunt', 90, phr('hunt', { d: num(dist(u, ch), 0) }, u));
    }
    u.chase = ch ? ch.id : null;
    if (ch) {
      /* упреждение: идём туда, где цель будет */
      const ts = TT[ch.k].sp, lead = dist(u, ch) / (T.sp + .001) * .6;
      const aim = { x: ch.x + ch.hx * ts * lead, y: ch.y + ch.hy * ts * lead };
      const d = dist(u, aim) || 1;
      u.h = Math.atan2(aim.y - u.y, aim.x - u.x);
      const k = Math.min(1, st / d);
      u.x += (aim.x - u.x) * k; u.y += (aim.y - u.y) * k;
      return heliFuel(u);
    }
  }
  const route = u.patrol && u.patrol.pts && !u.dest && !u.rtb;
  const tgt = u.dest || (u.patrol ? (u.patrol.pts ? u.patrol.pts[u.patrol.leg % u.patrol.pts.length] : patrolCenter(u.patrol)) : null) || u.base;
  if (tgt) {
    const d = dist(u, tgt);
    if (route) {
      /* маршрут: от зоны к зоне по кругу */
      if (d < 1.5) u.patrol.leg = (u.patrol.leg + 1) % u.patrol.pts.length;
      else {
        u.h = Math.atan2(tgt.y - u.y, tgt.x - u.x);
        u.x += (tgt.x - u.x) / d * Math.min(st, d); u.y += (tgt.y - u.y) / d * Math.min(st, d);
      }
    } else if (u.patrol && !u.dest && !u.rtb && d < 7) {
      /* круг над сектором, плавно */
      /* круг радиусом 6 км со своей скоростью */
      u.orb = (u.orb == null ? Math.atan2(u.y - tgt.y, u.x - tgt.x) : u.orb) + dt * T.sp / 6 * .85;
      const nx = tgt.x + Math.cos(u.orb) * 6, ny = tgt.y + Math.sin(u.orb) * 6;
      const dd = Math.hypot(nx - u.x, ny - u.y) || 1, k = Math.min(1, st / dd);
      u.h = Math.atan2(ny - u.y, nx - u.x);
      u.x += (nx - u.x) * k; u.y += (ny - u.y) * k;
    } else if (d > .5) {
      u.h = Math.atan2(tgt.y - u.y, tgt.x - u.x);
      u.x += (tgt.x - u.x) / d * st; u.y += (tgt.y - u.y) / d * st;
    } else if (u.rtb) {
      u.rtb = 0; u.dest = null; u.st = 'refuel'; u.stT = G.t + 900;
      say(u, 'На площадке. Дозаправка и пополнение боекомплекта, ~15 мин.');
    } else u.dest = null;
  }
  heliFuel(u);
}

function heliFuel(u) {
  if (u.fuel > 0) return;
  u.fuel = 0;
  if (!u.rtb) { u.rtb = 1; u.chase = null; u.dest = { ...u.base }; say(u, 'Топливо на нуле, идём на площадку!', 'w') }
}

/* ---------- усталость: не чаще одного доклада в FAT_GAP ----------
   Один вымотанный расчёт докладывает сам; если таких несколько —
   дежурный штаба сводит их в одну строку. */
const FAT_GAP = 1500;

function fatigueStep() {
  if (!G.fatQ || !G.fatQ.length || G.t < (G.fatT || 0)) return;
  G.fatT = G.t + FAT_GAP;
  const us = G.fatQ.map(id => unitById(id)).filter(u => u && u.hp > 0);
  G.fatQ = [];
  if (!us.length) return;
  if (us.length === 1) {
    say(us[0], pick(['Штаб, личный состав на пределе. Реакция падает, возможны ошибки.',
      'Люди вымотаны, штаб. Реагируем медленнее, учтите.', 'Смена держится на кофе. Ошибки возможны.']), 'w');
    return;
  }
  const names = us.slice(0, 3).map(u => '«' + esc(u.crew.cs) + '»').join(', ');
  hq(`Дежурный: на пределе сил ${names}${us.length > 3 ? ' и ещё ' + (us.length - 3) : ''}. Реакция расчётов падает — днём дать отдых.`, 'w');
}

/* ---------- судьбы расчётов: звания за сбитые цели ---------- */
const HONORS = [[5, 'отличный расчёт'], [12, 'ас ПВО'], [25, 'легенда края']];

function crewHonor(u) {
  if (UT[u.k].fake) return;
  const h = HONORS.find(([n]) => n === u.kills);
  if (!h) return;
  u.crew.title = h[1];
  (G.honors = G.honors || []).push({ cs: u.crew.cs, n: UT[u.k].n, kills: u.kills, title: h[1], night: G.night });
  hq(`«${esc(u.crew.cs)}» — ${u.kills}-я сбитая цель. Расчёт заслужил звание «${h[1]}».`, 'g');
}
