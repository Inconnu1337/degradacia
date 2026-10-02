'use strict';
/* ============================================================
   ВОЗДУШНЫЕ ЦЕЛИ: полёт, барражирование, наведение антирадарных БпЛА, попадания.
   ============================================================ */

function spawnThreat(q) {
  const T = TT[q.k];
  let alt = T.prof;
  /* игрок налёта может поднять дроны на 2–3 км (флаг пакета) */
  if ((T.cls === 'drone' || T.cls === 'decoy') && q.high) alt = 'mid';
  else if ((T.cls === 'drone' || T.cls === 'decoy') && chance(E.adapt.highAlt)) alt = 'mid';
  const th = {
    id: G.idc++, k: q.k, cls: T.cls, x: q.x, y: q.y, sx: q.x, sy: q.y,
    path: q.path.map(p => ({ x: p.x, y: p.y })), tgt: q.tgt, gid: q.gid,
    hx: 1, hy: 0, seen: -1e9, first: null, eng: 0, dead: false, lost: false,
    alt, idDecoy: false, idLv: 0, obs: 0, t0: G.t, vis: false,
    armTgt: null, loiterT: 0, retgt: 0
  };
  const p = th.path[0], d = Math.hypot(p.x - th.x, p.y - th.y) || 1;
  th.hx = (p.x - th.x) / d; th.hy = (p.y - th.y) / d;
  G.threats.push(th);
  S.launched[q.k]++;
  const g = E.groups.find(g => g.id === q.gid);
  if (g) g.launched++;
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

    if (T.arm && !th.lost && (G.t - (th.armT || 0)) > 20) { th.armT = G.t; armSeek(th) }

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

    let rem = T.sp * dt;
    while (rem > 0 && th.path.length) {
      const p = th.path[0], dx = p.x - th.x, dy = p.y - th.y, d = Math.hypot(dx, dy);
      if (d <= rem) { th.x = p.x; th.y = p.y; rem -= d; th.path.shift() }
      else { th.hx = dx / d; th.hy = dy / d; th.x += th.hx * rem; th.y += th.hy * rem; rem = 0 }
    }
    if (!th.path.length) impact(th);
  }
  G.threats = G.threats.filter(th => !th.dead);
}

function impact(th) {
  th.dead = true;
  const T = TT[th.k], g = E.groups.find(g => g.id === th.gid);

  /* разведчик и постановщик помех уходят домой — без взрыва */
  if (th.cls === 'recon' || th.cls === 'ewuav') return;

  if (th.lost) {
    const c = inCity(th);
    if (c && T.wh && chance(.6)) {
      const n = Math.round(RI(0, 3) * alarmMul());
      S.civ += n; G.civTotal += n;
      hq(`Потерявший навигацию ${thLabel(th)} упал в черте города ${c.gen}.${n ? ' Пострадавшие: ' + n + '.' : ' Без пострадавших.'}`, 'w');
      fx({ k: 'boom', x: th.x, y: th.y, d: 900 });
    } else if (T.wh) fx({ k: 'boom', x: th.x, y: th.y, d: 700, small: 1 });
    return;
  }
  if (!T.wh) return;

  const cep = { drone: .12, loiter: .09, jet: .1, cruise: .06, arm: .1, ballistic: .08, aeroball: .1 }[th.cls] || .1;
  const p = { x: th.x + R(-1, 1) * cep * 3, y: th.y + R(-1, 1) * cep * 3 };
  fx({ k: 'boom', x: p.x, y: p.y, d: 1200 });
  S.hits[th.k]++;
  if (g) g.hit++;

  /* попадание по технике ПВО */
  for (const u of G.units.slice()) {
    const d = dist(u, p);
    if (d < .9) {
      const dmg = T.wh * 2.6 * R(.7, 1.3) * (1 - d / 1);
      u.hp -= dmg; u.dmgT = G.t;
      if (u.hp <= 0) unitDestroyed(u, th);
      else say(u, `По нам прилёт! Есть повреждения (живучесть ${Math.round(u.hp / UT[u.k].hp * 100)}%).`, 'w');
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
    const dmg = T.wh * R(.7, 1.3) / OT[o.type].hard;
    const before = o.hp;
    o.hp = Math.max(0, o.hp - dmg);
    o.hitT = G.t;
    S.objDmg += (before - o.hp) * o.v / 100;
    hq(`⚠ Попадание: ${T.n} (${CLS_N[T.cls]}) — «${esc(o.n)}». Состояние ${Math.round(o.hp)}%.`, 'w');
    fx({ k: 'fire', x: o.x, y: o.y, d: 12000 });
    if (o.hp <= 0) hq(`«${esc(o.n)}» выведен из строя полностью.`, 'crit');
    const c = inCity(o);
    if (c && chance(.3)) {
      const n = Math.round(RI(1, 5) * alarmMul());
      S.civ += n; G.civTotal += n;
      if (n) hq(`${c.n}: пострадавшие в прилегающих кварталах — ${n}.`, 'w');
    }
  } else {
    const c = inCity(p);
    if (c) {
      const n = Math.round(RI(1, 6) * alarmMul());
      S.civ += n; G.civTotal += n;
      hq(`${T.n}: попадание в жилой квартал (${c.n}). Пострадавшие: ${n}.`, 'w');
    }
  }
}

function unitDestroyed(u, th) {
  u.hp = 0;
  S.lost.push(u.k);
  G.units.splice(G.units.indexOf(u), 1);
  if (UT[u.k].fake) hq(`«${esc(u.crew.cs)}»: макет ЗРК уничтожен. Противник потратил «${TT[th.k].n}» на муляж.`, 'g');
  else hq(`✖ Потерян расчёт «${esc(u.crew.cs)}» (${UT[u.k].n}).`, 'crit');
  const k = E.know[u.id];
  if (k) {
    const nc = nearCity(k);
    mind(`Объективный контроль: ${UT[k.type] ? UT[k.type].n : 'цель'} ${nc ? 'у ' + nc.gen : ''} поражён. ${UT[u.k].fake ? '(Позже выяснится, что это был макет.)' : 'Сектор ослаб.'}`);
    delete E.know[u.id];
  }
  G.reqs = G.reqs.filter(r => r.u !== u);
  uiDirty();
}
