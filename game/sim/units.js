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
        const rng = Math.min(T.radar * TTh.dm * alt * jm, cap);
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
}

/* ---------- боевая работа ---------- */
function react(u) {
  const c = u.crew;
  return 3 + 8 * (1 - c.exp) + 10 * c.fat + (c.trait === 'решительный' ? -2 : c.trait === 'осторожный' ? 2 : 0) - cpBoost(u) * 8;
}

function pkEff(u, th) {
  const W = UT[u.k].w, c = u.crew;
  let p = (W.pk[th.cls] || 0) * (.8 + .3 * c.exp) * (1 - .15 * c.fat);
  if (W.kind === 'gun') { p *= G.weather.gun; if (th.alt === 'high') p *= .4; if (th.alt === 'mid') p *= .7 }
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
  return u.det.has(th.id);
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

    const mc = W.mc || 0;
    if (mc >= .4 && DANGER[pcl] <= 2.8 && u.assign !== th.id) {
      if (u.roe === 'eco') {
        if (!(o && (o.v >= 90 || u.cover === o.id)) && th.cls !== 'recon' && th.cls !== 'ewuav') continue;
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
    else if (chance(.25)) sayT(u, 'gmiss', 22, 'Очередь мимо, цель прошла.', 'm');
  } else {
    th.eng++;
    G.miss.push({ x: u.x, y: u.y, sp: W.msp, th, u, pk, t0: G.t, kind: W.kind, trail: [], maxT: W.r / W.msp * 1.7 + 15 });
    fx({ k: 'launch', x: u.x, y: u.y, d: 520, a: u.ta });
    eSawLaunch(u);
    if (W.mc >= .4) sayT(u, 'fire', 8, pick([
      `Пуск! Цель ${thLabel(th)}, азимут ${az(u, th)}, ${num(dist(u, th), 0)} км.`,
      `Пуск по цели азимут ${az(u, th)}.`,
      `Работаем. Пуск по ${thLabel(th)}.`]));
  }
  if (u.am === 0) say(u, W.kind === 'gun' ? 'Боекомплект израсходован, ствол молчит.' : 'Ракет нет! Пусковые пустые.', 'w');
}

function missStep(dt) {
  for (const m of G.miss) {
    if (m.done) continue;
    const th = m.th;
    if (th.dead) { m.done = true; fx({ k: 'air', x: m.x, y: m.y, d: 380, small: 1 }); continue }
    const ts = TT[th.k].sp, d0 = Math.hypot(th.x - m.x, th.y - m.y);
    const lead = d0 / (m.sp + .001);
    const tx = th.x + th.hx * ts * lead * .7, ty = th.y + th.hy * ts * lead * .7;
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1, stp = m.sp * dt;
    m.a = Math.atan2(dy, dx);
    if (d0 <= stp + ts * dt + .2) {
      m.done = true; th.eng--;
      if (chance(m.pk)) killThreat(th, m.u);
      else {
        fx({ k: 'air', x: m.x, y: m.y, d: 380, small: 1 });
        sayT(m.u, 'miss', 10, pick(['Промах. Цель продолжает полёт.', 'Промах! Цель идёт дальше.', 'Подрыв мимо, цель жива.']), 'w');
      }
    } else {
      m.x += dx / d * stp; m.y += dy / d * stp;
      m.trail.push(m.x, m.y);
      if (m.trail.length > 30) m.trail.splice(0, 2);
    }
    if (G.t - m.t0 > m.maxT && !m.done) {
      m.done = true; th.eng--;
      sayT(m.u, 'miss2', 15, 'Ракета не догнала цель, ушла на самоликвидацию.', 'm');
    }
  }
  G.miss = G.miss.filter(m => !m.done);
}

function killThreat(th, u) {
  if (th.dead) return;
  th.dead = true;
  S.killed[th.k]++;
  u.kills++;
  u.crew.exp = Math.min(.95, u.crew.exp + .008);
  fx({ k: 'air', x: th.x, y: th.y, d: 700 });
  const W = UT[u.k].w;
  if (W.kind === 'gun') S.gunK++;
  else if (W.kind === 'drone') S.icptK++;
  else if (W.mc >= .4) { S.samK++; if (th.cls === 'decoy') S.decoySam++ }
  eLoss(th, W.kind);
  MODE.onThreatKilled(th, u);
  debris(th, u);
  const lb = thLabel(th);
  sayT(u, 'kill', W.kind === 'gun' ? 20 : 6,
    W.kind === 'gun'
      ? pick([`Есть! Минус ${lb}.`, `Сбили ${lb}, упал в поле.`, `Минус один, ${lb}.`])
      : pick([`Цель поражена (${lb}).`, `Есть поражение, ${lb}.`, `Минус ${lb}. Цель уничтожена.`]), 'g');
}

function debris(th, u) {
  const c = inCity(th);
  if (!c) return;
  const p = { drone: .25, decoy: .1, loiter: .2, jet: .3, recon: .1, ewuav: .1, arm: .25, cruise: .35, ballistic: .45, aeroball: .45 }[th.cls];
  if (!chance(p)) return;
  const n = Math.max(0, Math.round(RI(0, 4) * alarmMul()));
  S.civ += n; G.civTotal += n;
  hq(`Обломки сбитой цели упали в жилом районе (${c.n}).${n ? ' Пострадавшие: ' + n + '.' : ' Без пострадавших.'}`, 'w');
}

/* ---------- тревога: сколько людей успевает в укрытия ---------- */
function alarmMul() {
  if (!G.alarm) return 1;
  return lerp(.85, .22, clamp(G.alarmTrust, 0, 1));
}

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
  if (c.fat > .8 && !u.reqT.fat) {
    u.reqT.fat = t;
    say(u, 'Штаб, личный состав на пределе. Реакция падает, возможны ошибки.', 'w');
  }
  /* топливо вертолёта */
  if (T.air && u.st === 'air' && u.fuel < 600 && !u.rtb && t - (u.reqT.fuel || -1e9) > 600) {
    u.reqT.fuel = t;
    say(u, `Топлива на ${fmtDur(u.fuel)}, возвращаемся на площадку.`, 'w');
    receive(u, { t: 'rtb' });
  }
}

const th_name = th => th.cls === 'ewuav' ? 'постановщик помех' : th.idLv >= 2 ? `«${TT[th.k].n}»` : 'разведчик';

/* ---------- перемещения, развёртывание, обеспечение ---------- */
function unitsStep(dt) {
  for (const u of G.units) {
    const T = UT[u.k];
    if (u.st === 'move' && u.dest) {
      const d = dist(u, u.dest), st = T.sp * dt;
      u.h = Math.atan2(u.dest.y - u.y, u.dest.x - u.x);
      if (d <= st) {
        u.x = u.dest.x; u.y = u.dest.y; u.dest = null; markSpot(u);
        u.st = 'deploy'; u.stT = G.t + T.dep;
        say(u, `На позиции, кв. ${sq(u)}. Развёртываемся, ~${fmtDur(T.dep)}.`);
      } else { u.x += (u.dest.x - u.x) / d * st; u.y += (u.dest.y - u.y) / d * st }
    }
    else if (u.st === 'air') {
      u.fuel -= dt;
      const tgt = u.dest || u.patrol || u.base;
      if (tgt) {
        const d = dist(u, tgt), st = T.sp * dt;
        if (d > .5) {
          u.h = Math.atan2(tgt.y - u.y, tgt.x - u.x);
          u.x += (tgt.y === u.y && tgt.x === u.x) ? 0 : (tgt.x - u.x) / d * st;
          u.y += (tgt.y - u.y) / d * st;
        } else if (u.rtb) {
          u.rtb = 0; u.dest = null; u.st = 'refuel'; u.stT = G.t + 900;
          say(u, 'На площадке. Дозаправка и пополнение боекомплекта, ~15 мин.');
        } else if (u.patrol) {
          /* барражирование по кругу вокруг точки патрулирования */
          u.dest = null;
          u.orb = (u.orb || 0) + dt * .0016;
          u.x = u.patrol.x + Math.cos(u.orb) * 6;
          u.y = u.patrol.y + Math.sin(u.orb) * 6;
          u.h = u.orb + Math.PI / 2;
        } else { u.dest = null }
      }
      if (u.fuel <= 0) {
        u.fuel = 0;
        if (!u.rtb) { u.rtb = 1; u.dest = { ...u.base }; say(u, 'Топливо на нуле, идём на площадку!', 'w') }
      }
    }
    else if (u.st === 'deploy' && G.t >= u.stT) { u.st = 'ready'; say(u, 'Развернулись. К бою готовы.', 'g') }
    else if (u.st === 'reload' && G.t >= u.stT) { u.st = 'ready'; u.am = T.w.am; say(u, 'Боекомплект пополнен. Готовы.', 'g') }
    else if (u.st === 'refuel' && G.t >= u.stT) {
      u.st = 'ready'; u.fuel = T.fuel; u.am = T.w.am;
      say(u, 'Заправлены, боекомплект пополнен. Готовы к вылету.', 'g');
    }
    /* ремонт от «Кузнеца» */
    if (u.hp < T.hp && u.st === 'ready') {
      const rem = nearSupport(u, 'repair');
      if (rem) {
        u.hp = Math.min(T.hp, u.hp + dt * T.hp / 5400);
        if (u.hp >= T.hp) sayT(u, 'fixed', 1e9, 'Повреждения устранены, техника в строю.', 'g');
      }
    }
    u.crew.fat = Math.min(1, u.crew.fat + dt / (14 * 3600));
  }
}

/* РЭБ уводит навигационные цели */
function ewStep(dt) {
  for (const u of G.units) {
    if (u.k !== 'ew' || u.st !== 'ready') continue;
    const T = UT[u.k];
    for (const th of G.threats) {
      if (th.dead || th.lost || !TT[th.k].gps) continue;
      if (dist(u, th) > T.ewr) continue;
      if (chance(.0016 * TT[th.k].gps * (1 - E.adapt.ewRes) * dt)) {
        th.lost = true;
        const a = R(0, 6.28), r = R(8, 32);
        th.path = [{ x: th.x + Math.cos(a) * r, y: th.y + Math.sin(a) * r }];
        S.ew[th.k]++; E.learn.ew++;
        MODE.onNavLost(th);
        sayT(u, 'ew', 20, `${thLabel(th)} потерял навигацию, уходит ${DIRS_ON[dirIdx(Math.cos(a), Math.sin(a))]}.`, 'g');
      }
    }
  }
}
