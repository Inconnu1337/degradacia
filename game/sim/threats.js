'use strict';
/* ============================================================
   ВОЗДУШНЫЕ ЦЕЛИ: полёт, барражирование, наведение антирадарных БпЛА, попадания.
   ============================================================ */

/* профиль крылатой ракеты: высокий — быстрее и точнее, но на виду у всей сети РЛС;
   предельно малая высота — скрытно, но шанс задеть рельеф (на км пути) */
const HI_ALT_SP = 1.2;
const LOW_CRASH = .00022;

/* ---------- полёт с разворотом ----------
   Радиус разворота по классу, км: борт не меняет курс мгновенно, а
   поворачивает с угловой скоростью v / R. К промежуточной точке маршрута
   не «прилипает»: за R до неё уже доворачивает на следующую — излом
   срезается дугой, как у настоящего аппарата. На подлёте к цели
   (последняя точка) поворот круче, а вплотную — пикирование прямо в неё,
   чтобы не кружить вокруг. Баллистика летит по прямой. */
const TURN_R = { drone: 1.2, decoy: 1.2, loiter: .8, jet: 2.5, recon: 1.5, ewuav: 1.8, arm: 1.5, cruise: 3, fpv: .15, mother: 1.2, kab: 4 };

function flyTurning(th, step, r) {
  while (th.path.length > 1 && dist(th, th.path[0]) < Math.max(r * .9, step)) th.path.shift();
  const p = th.path[0];
  if (!p) return;
  const d = dist(th, p), last = th.path.length === 1;
  if (last && d <= step) { th.x = p.x; th.y = p.y; th.path.shift(); return }
  const cur = Math.atan2(th.hy, th.hx), want = Math.atan2(p.y - th.y, p.x - th.x);
  const da = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  let w = step / r;
  if (last && d < r * 3) w *= 1 + 3 * (1 - d / (r * 3));
  if (last && d < r) w = Math.max(w, Math.abs(da));          /* терминальное пикирование */
  const a = cur + Math.max(-w, Math.min(w, da));
  th.hx = Math.cos(a); th.hy = Math.sin(a);
  th.x += th.hx * step; th.y += th.hy * step;
}

function spawnThreat(q) {
  const T = TT[q.k];
  let alt = T.prof;
  /* игрок налёта может поднять дроны на 2–3 км (флаг пакета) */
  if ((T.cls === 'drone' || T.cls === 'decoy') && q.high) alt = 'mid';
  else if ((T.cls === 'drone' || T.cls === 'decoy') && chance(E.adapt.highAlt)) alt = 'mid';
  /* крылатая ракета высоким профилем: игрок налёта выбирает сам, ИИ — иногда */
  const hiAlt = T.cls === 'cruise' && (q.high || (!MODE.humans.includes('atk') && chance(.2)));
  if (hiAlt) alt = 'high';
  /* КАБ: самолёт-носитель над передним краем рискует попасть под ЗРК */
  if (T.carrier && carrierLost(q)) return;
  const th = {
    id: G.idc++, k: q.k, cls: T.cls, x: q.x, y: q.y, sx: q.x, sy: q.y,
    path: q.path.map(p => ({ x: p.x, y: p.y })), tgt: q.tgt, gid: q.gid,
    hx: 1, hy: 0, seen: -1e9, first: null, eng: 0, dead: false, lost: false,
    alt, idDecoy: false, idLv: 0, obs: 0, t0: G.t, vis: false,
    armTgt: null, loiterT: 0, retgt: 0, degraded: false, hunt: null
  };
  if (q.mom != null) { th.mom = q.mom; th.flown = q.flown || 0 }
  if (hiAlt) th.hiAlt = 1;
  const p = th.path[0], d = Math.hypot(p.x - th.x, p.y - th.y) || 1;
  th.hx = (p.x - th.x) / d; th.hy = (p.y - th.y) / d;
  G.threats.push(th);
  S.launched[q.k]++;
  const g = E.groups.find(g => g.id === q.gid);
  if (g) g.launched++;
}

/* ---------- КАБ: носитель над передним краем ----------
   Один раз на пакет: если к месту сброса (с запасом 30 км на высоту
   носителя) достаёт работающий «Щит» или «Бастион», самолёт могут сбить до сброса — весь пакет пропадает. */
function carrierLost(q) {
  const g = E.groups.find(x => x.id === q.gid);
  if (g && g.carrier) return g.carrier === 'lost';
  let u = null;
  for (const v of G.units) {
    if ((v.k !== 'shield' && v.k !== 'bastion') || v.st !== 'ready' || !v.rOn || !v.am) continue;
    /* самолёт идёт на высоте: ЗРК достаёт его дальше, чем низкую цель */
    if (dist(v, q) < UT[v.k].w.r + 30) { u = v; break }
  }
  const lost = !!u && chance(u.k === 'bastion' ? .5 : .3);
  if (g) g.carrier = lost ? 'lost' : 'ok';
  if (!lost) return false;
  u.am--; u.kills++; S.jets = (S.jets || 0) + 1;
  fx({ k: 'launch', x: u.x, y: u.y, d: 520, a: Math.atan2(q.y - u.y, q.x - u.x) });
  fx({ k: 'air', x: q.x, y: q.y, d: 900 });
  if (MODE.humans.includes('def')) asSide('def', () => {
    say(u, pick(['Есть! Сбили бомбардировщик над передним краем, бомбы не сброшены!', 'Цель — фронтовой бомбардировщик, поражена! Падает за линией фронта.', 'Самолёт-носитель КАБ сбит!']), 'g');
    moraleAdd(3);
  });
  if (g) {
    const left = E.queue.filter(x => x.gid === g.id).length;
    E.queue = E.queue.filter(x => x.gid !== g.id);
    g.n = g.launched; g.lost += left + 1;
    if (MODE.humans.includes('atk')) asSide('atk', () => hq(`✖ Носитель КАБ сбит над передним краем (${UT[u.k].n} у линии фронта). Бомбы пакета потеряны: ${left + 1}.`, 'crit'));
  }
  return true;
}

/** антирадарный БпЛА ищет работающий излучатель */
function armSeek(th) {
  let best = null, bs = -1e9;
  for (const u of G.units) {
    if (!u.rOn || u.hp <= 0) continue;
    const d = dist(u, th);
    if (d > 70) continue;
    const s = (UT[u.k].pw || .5) * 2 - d / 40;
    if (s > bs) { bs = s; best = u }
  }
  if (best) {
    th.armTgt = best.id;
    th.armSeen = G.t;
    /* точность наведения выше, когда цель мощнее и ближе */
    const err = clamp(2.2 - (UT[best.k].pw || .5), .2, 2.2);
    th.path = [{ x: best.x + gauss() * err, y: best.y + gauss() * err }];
  } else if (th.armTgt && G.t - (th.armSeen || 0) > 240) {
    /* цель замолчала — идём по последним данным с ошибкой */
    th.armTgt = null;
    const p = th.path[th.path.length - 1];
    th.path = [{ x: p.x + gauss() * 3.5, y: p.y + gauss() * 3.5 }];
  }
}

/** барражирующий боеприпас выбирает, во что воткнуться */
function loiterPick(th) {
  /* сначала — вскрытая техника ПВО рядом */
  let best = null, bs = -1e9;
  for (const id in E.know) {
    const k = E.know[id];
    if (k.conf < .35) continue;
    const d = Math.hypot(k.x - th.x, k.y - th.y);
    if (d > 26) continue;
    const s = (UT[k.type] ? UT[k.type].cost : 1) * k.conf / (1 + d / 12);
    if (s > bs) { bs = s; best = { x: k.x, y: k.y, uid: k.uid } }
  }
  if (best && chance(.7)) {
    th.tgt = { aim: best };
    th.path = [{ x: best.x, y: best.y }];
    th.retgt = 1;
    return;
  }
  /* иначе — ближайший неповреждённый объект */
  let o = null, bd = 1e9;
  for (const ob of G.objs) { if (ob.hp <= 20) continue; const d = dist(ob, th); if (d < bd) { bd = d; o = ob } }
  if (o) { th.tgt = { obj: o }; th.path = [{ x: o.x, y: o.y }] }
}

function threatsStep(dt) {
  for (const th of G.threats) {
    if (th.dead) continue;
    const T = TT[th.k];
    if (T.brood && motherStep(th, dt)) continue;

    if (T.arm && !th.lost && (G.t - (th.armT || 0)) > 20) { th.armT = G.t; armSeek(th) }
    if (T.hunt && fpvStep(th, dt)) continue;
    /* обледенение: лёгкие дроны в снег и низкую облачность падают */
    if (WIND_CLS[th.cls] && !th.lost && G.weather.ice && chance(G.weather.ice / 3600 * dt)) {
      th.lost = true; th.iced = true;
      th.path = [{ x: th.x + Math.cos(G.wind.a) * R(1, 4), y: th.y + Math.sin(G.wind.a) * R(1, 4) }];
      S.ice = (S.ice || 0) + 1;
    }

    /* барражирование: покрутиться и выбрать цель */
    if (T.loiter && !th.lost && !th.retgt && th.path.length === 1 && dist(th, th.path[0]) < 14) {
      th.loiterT += dt;
      th.orb = (th.orb || R(0, 6.28)) + dt * .004;
      const c = th.path[0];
      const nx = c.x + Math.cos(th.orb) * 7, ny = c.y + Math.sin(th.orb) * 7;
      th.hx = nx - th.x; th.hy = ny - th.y;
      const L = Math.hypot(th.hx, th.hy) || 1; th.hx /= L; th.hy /= L;
      th.x = nx; th.y = ny;
      if (th.loiterT > R(300, 900)) loiterPick(th);
      continue;
    }

    /* крылатая на предельно малой высоте: на долгом маршруте может задеть рельеф (в плохую видимость — чаще) */
    if (th.cls === 'cruise' && !th.hiAlt && !th.lost && chance(T.sp * dt * LOW_CRASH * (G.weather.eo < .8 ? 1.8 : 1))) {
      th.lost = true; th.crashed = true;
      th.path = [{ x: th.x + th.hx * R(.3, 1.5), y: th.y + th.hy * R(.3, 1.5) }];
      S.crash = (S.crash || 0) + 1;
      if (MODE.onCrash) MODE.onCrash(th);
    }

    const stepLen = T.sp * windMul(th) * (th.hiAlt ? HI_ALT_SP : 1) * dt;
    if (TURN_R[th.cls]) flyTurning(th, stepLen, TURN_R[th.cls]);
    else {
      let rem = stepLen;
      while (rem > 0 && th.path.length) {
        const p = th.path[0], dx = p.x - th.x, dy = p.y - th.y, d = Math.hypot(dx, dy);
        if (d <= rem) { th.x = p.x; th.y = p.y; rem -= d; th.path.shift() }
        else { th.hx = dx / d; th.hy = dy / d; th.x += th.hx * rem; th.y += th.hy * rem; rem = 0 }
      }
    }
    if (!th.path.length) impact(th);
  }
  G.threats = G.threats.filter(th => !th.dead);
}

function impact(th) {
  th.dead = true;
  const T = TT[th.k], g = E.groups.find(g => g.id === th.gid);

  /* разведчик, постановщик помех и опустевший носитель уходят домой — без взрыва */
  if (th.cls === 'recon' || th.cls === 'ewuav' || th.cls === 'mother') return;

  if (th.lost) {
    const c = inCity(th);
    if (c && T.wh && chance(.6)) {
      const n = Math.round(RI(0, 3) * alarmMul());
      civLoss(n);
      hq(`Потерявший навигацию ${thLabel(th)} упал в черте города ${c.gen}.${n ? ' Пострадавшие: ' + n + '.' : ' Без пострадавших.'}`, 'w');
      fx({ k: 'boom', x: th.x, y: th.y, d: 900, w: T.wh });
    } else if (T.wh) fx({ k: 'boom', x: th.x, y: th.y, d: 700, small: 1, w: T.wh });
    return;
  }
  if (!T.wh) return;

  const cep = ({ drone: .12, loiter: .09, jet: .1, cruise: .06, arm: .1, ballistic: .08, aeroball: .1, fpv: .02, kab: .08 }[th.cls] || .1)
    * (th.hiAlt ? .6 : 1)  /* высокий профиль: точнее выходит на цель */
    * (th.degraded ? 3.5 : 1);   /* РЭБ сбила спутниковую поправку: ракета идёт по инерциальной системе, промах больше */
  const p = { x: th.x + R(-1, 1) * cep * 3, y: th.y + R(-1, 1) * cep * 3 };
  fx({ k: 'boom', x: p.x, y: p.y, d: 1200, w: T.wh, city: !!inCity(p) });
  S.hits[th.k]++;
  if (g) g.hit++;

  /* попадание по технике ПВО */
  for (const u of G.units.slice()) {
    const d = dist(u, p);
    if (d < .9) {
      let dmg = T.hunt
        ? UT[u.k].hp * R(.45, .95) * (1 - d / 1.2)          /* FPV бьёт точно в машину */
        : T.wh * 2.6 * R(.7, 1.3) * (1 - d / 1);
      /* дивизионы ЗРК рассредоточены: одним попаданием всё не уничтожить */
      if (UT[u.k].spread) dmg = Math.min(dmg, UT[u.k].hp * UT[u.k].spread);
      if (u.fix && crewHit(u, u.fix, '«' + u.crew.cs + '»')) u.fix = null;
      u.hp -= dmg; u.dmgT = G.t;
      if (u.hp <= 0) unitDestroyed(u, th);
      else if (ignite(u, th.cls, dmg, UT[u.k].hp)) say(u, pick(['Горим! Тушим своими силами.', 'Техника горит, тушим!', 'Пожар на позиции! Работаем огнетушителями.']), 'w');
      else say(u, phr('hitUs', { hp: Math.round(u.hp / UT[u.k].hp * 100) }, u), 'w');
    }
  }
  /* удар по позиции ПВО (в том числе по пустой) */
  const aimed = (th.tgt && th.tgt.aim) || th.cls === 'arm';
  if (aimed) {
    const hitU = G.units.some(u => dist(u, p) < .9);
    if (!hitU) {
      hq(`Удар «${T.n}» по позиции в кв. ${sq(p)}: там уже никого нет.`, 'g');
      const uid = th.tgt && th.tgt.aim ? th.tgt.aim.uid : th.armTgt;
      const k = E.know[uid];
      if (k && chance(.7)) { k.conf *= .3; E.learn.emptySEAD++ }
    } else S.armHits++;
    return;
  }
  /* попадание по объекту */
  let o = null, bd = 1.3;
  for (const ob of G.objs) { const d = dist(ob, p); if (d < bd) { bd = d; o = ob } }
  if (o && o.hp > 0) {
    /* под тревогой объект переведён в аварийный режим: агрегаты остановлены, люди в укрытиях — ущерб меньше */
    /* FPV бьёт слабо, но точно: трансформатор подстанции выводит из строя всерьёз */
    const fpvK = T.hunt ? (o.type === 'sub' ? 1.1 : .5) : 1;
    const dmg = T.wh * R(.7, 1.3) / OT[o.type].hard / OBJ_TOUGH * fpvK * (G.alarm ? .8 : 1);
    const before = o.hp;
    o.hp = Math.max(0, o.hp - dmg);
    o.hitT = G.t;
    S.objDmg += (before - o.hp) * o.v / 100;
    hq(`⚠ Попадание: ${T.n} (${CLS_N[T.cls]}) — «${esc(o.n)}». Состояние ${Math.round(o.hp)}%.`, 'w');
    fx({ k: 'fire', x: o.x, y: o.y, d: 12000 });
    if (o.hp <= 0) hq(`«${esc(o.n)}» выведен из строя полностью.`, 'crit');
    S.objHit[o.id] = (S.objHit[o.id] || 0) + dmg;
    if (ignite(o, th.cls, dmg)) hq(`«${esc(o.n)}»: после прилёта начался пожар.`, 'w');
    if (o.ff && crewHit(o, o.ff, o.n)) o.ff = null;
    if (o.rw && crewHit(o, o.rw, o.n)) o.rw = null;
    const c = inCity(o);
    if (c && chance(.3)) {
      const n = Math.round(RI(1, 7) * alarmMul());
      civLoss(n);
      if (n) hq(`${c.n}: пострадавшие в прилегающих кварталах — ${n}.`, 'w');
    }
  } else {
    const c = inCity(p);
    if (c) {
      const n = Math.round(RI(2, 10) * alarmMul());
      civLoss(n);
      hq(`${T.n}: попадание в жилой квартал (${c.n}). Пострадавшие: ${n}.`, 'w');
    }
  }
}

function unitDestroyed(u, th, how) {
  u.hp = 0;
  /* память о погибших расчётах (макеты — не люди) */
  if (!UT[u.k].fake) (G.fallen = G.fallen || []).push({ cs: u.crew.cs, n: UT[u.k].n, night: G.night, kills: u.kills, how: how || (th ? TT[th.k].n : '') });
  if (u.fix) G.crews.rep++;
  S.lost.push(u.k);
  G.units.splice(G.units.indexOf(u), 1);
  if (UT[u.k].fake) hq(`«${esc(u.crew.cs)}»: макет ЗРК ${th ? `уничтожен. Противник потратил «${TT[th.k].n}» на муляж.` : 'сгорел.'}`, 'g');
  else hq(`✖ Потерян расчёт «${esc(u.crew.cs)}» (${UT[u.k].n})${how ? ': ' + how : ''}.`, 'crit');
  const k = E.know[u.id];
  if (k) {
    const nc = nearCity(k);
    mind(`Объективный контроль: ${UT[k.type] ? UT[k.type].n : 'цель'} ${nc ? 'у ' + nc.gen : ''} поражён. ${UT[u.k].fake ? '(Позже выяснится, что это был макет.)' : 'Сектор ослаб.'}`);
    delete E.know[u.id];
  }
  G.reqs = G.reqs.filter(r => r.u !== u);
  uiDirty();
}

/* ---------- FPV: ищет технику ----------
   Летит к точке, по пути и на месте осматривается камерой (дальность
   зависит от погоды), выбирает самую ценную машину в поле зрения и идёт
   в неё. Всё, что увидела камера, оператор передаёт в разведку (E.know).
   Батарея кончается через range км от точки пуска (у сброшенных «Ульем» —
   свой остаток). FPV из «Улья» держат связь через носитель: сбили носитель —
   рой без управления. Возвращает true, если шаг уже сделан. */
const FPV_EYE = 5;

function fpvStep(th, dt) {
  const T = TT[th.k];
  if (th.lost) return false;
  /* связь через носитель */
  if (th.mom != null && !G.threats.some(m => m.id === th.mom && !m.dead && !m.lost)) {
    th.lost = true;
    th.path = [{ x: th.x + R(-.8, .8), y: th.y + R(-.8, .8) }];
    return false;
  }
  /* батарея и погода */
  const flown = (th.flown = (th.flown || 0) + T.sp * windMul(th) * dt);
  if (flown > T.range || !G.weather.fpv) {
    th.lost = true;
    th.path = [{ x: th.x + R(-.5, .5), y: th.y + R(-.5, .5) }];
    return false;
  }
  if (G.t - (th.lookT || -1e9) > 6) {
    th.lookT = G.t;
    const eye = FPV_EYE * G.weather.fpv * (G.weather.eo || 1);
    let best = null, bs = 0, bd = 0;
    for (const u of G.units) {
      if (u.hp <= 0 || UT[u.k].air || (u.st === 'air')) continue;
      const d = dist(u, th);
      if (d > eye) continue;
      fpvSpot(th, u);
      /* дорогая техника важнее ближней: «Щит» в 4 км лучше поста в 1 км */
      const sc = Math.sqrt(UT[u.k].cost + 1) / (1 + d / 2) * (u.id === th.hunt ? 1.3 : 1);
      if (sc > bs) { bs = sc; best = u; bd = d }
    }
    if (best) {
      if (th.hunt !== best.id) {
        th.hunt = best.id;
        if (!UT[best.k].fake) sayT(best, 'fpv', 60, phr('fpvOver', { d: num(bd, 1) }, best), 'w');
      }
      th.tgt = { aim: { x: best.x, y: best.y, uid: best.id } };
      th.path = [{ x: best.x, y: best.y }];
    }
  }
  /* дошёл до точки без цели — кружит и ищет (по объекту — бьёт в объект) */
  if (!th.hunt && !(th.tgt && th.tgt.obj) && th.path.length === 1 && dist(th, th.path[0]) < 1) {
    const a = R(0, 6.28);
    th.path = [{ x: th.x + Math.cos(a) * 3, y: th.y + Math.sin(a) * 3 }];
  }
  return false;
}

/** камера FPV: оператор видит технику вблизи и передаёт координаты */
function fpvSpot(th, u) {
  const k = eKnow(u);
  if (k.conf >= .85 && G.t - k.t < 120) return;
  /* макет вблизи на видео выдаёт себя — но не всегда */
  if (u.k === 'decoy') k.type = chance(.55) ? 'decoy' : 'shield';
  else k.type = u.k;
  k.conf = Math.max(k.conf, .85); k.src = 'FPV';
  setKnowPos(k, u, .25);
  if (['bastion', 'shield', 'krom', 'spaag', 'horizon', 'ew'].includes(k.type) && !k.fpvRep) {
    k.fpvRep = 1;
    const nc = nearCity(u);
    mind(`Камера FPV, кв. ${sq(u)}: ${UT[k.type].n}${nc ? ' у ' + nc.gen : ''}. Координаты уточнены.`);
  }
}

/* ---------- «Улей»: носитель FPV ----------
   Летит к цели как обычный дрон. За T.drop км до неё сбрасывает T.brood
   FPV и кружит рядом ретранслятором, пока рой жив (не дольше получаса),
   потом уходит домой. Возвращает true, если шаг уже сделан. */
function motherStep(th, dt) {
  const T = TT[th.k];
  if (th.lost) return false;
  if (!th.dropped) {
    const aim = th.tgt ? aimOf(th.tgt) : null;
    if (!aim || dist(th, aim) > T.drop || !G.weather.fpv) return false;
    th.dropped = G.t;
    th.orbC = { x: th.x, y: th.y };
    const F = TT.fpv;
    for (let i = 0; i < T.brood; i++) {
      const a = R(0, 6.28);
      const p = { x: aim.x + Math.cos(a) * R(0, 2), y: aim.y + Math.sin(a) * R(0, 2) };
      const c = {
        id: G.idc++, k: 'fpv', cls: 'fpv', x: th.x + R(-.3, .3), y: th.y + R(-.3, .3), sx: th.x, sy: th.y,
        path: [p], tgt: th.tgt, gid: th.gid, hx: th.hx, hy: th.hy, seen: -1e9, first: null, eng: 0, dead: false, lost: false,
        alt: 'low', idDecoy: false, idLv: 0, obs: 0, t0: G.t, vis: false,
        armTgt: null, loiterT: 0, retgt: 0, degraded: false, hunt: null,
        mom: th.id, flown: F.range - T.broodRange
      };
      G.threats.push(c);
      S.launched.fpv++;
    }
    if (MODE.onBrood) MODE.onBrood(th);
    return false;
  }
  /* ретранслятор: кружит у точки сброса, пока рой в воздухе */
  const alive = G.threats.some(c => c.mom === th.id && !c.dead && !c.lost);
  if (alive && G.t - th.dropped < 1800) {
    th.orb = (th.orb == null ? R(0, 6.28) : th.orb) + dt * T.sp * windMul(th) / 3;
    const nx = th.orbC.x + Math.cos(th.orb) * 3, ny = th.orbC.y + Math.sin(th.orb) * 3;
    th.hx = nx - th.x; th.hy = ny - th.y;
    const L = Math.hypot(th.hx, th.hy) || 1; th.hx /= L; th.hy /= L;
    th.x = nx; th.y = ny;
    return true;
  }
  if (!th.home) { th.home = 1; th.path = [{ x: th.sx, y: th.sy }] }
  return false;
}
