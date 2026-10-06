'use strict';
/* ============================================================
   НАЛЁТ: бот-оборонец
   Доктрина излучения и огня, смена позиций, закупки, ответы на запросы расчётов,
   тревога для населения, перестановка заслона мобильных групп.
   ============================================================ */

const AttackAI = (() => {
  function flushContacts() {
    if (!G.seenK) G.seenK = {};
    for (const id in E.know) {
      const k = E.know[id];
      if (k.src === 'разведчик') continue;
      const band = k.conf < .34 ? 0 : k.conf < .6 ? 1 : k.conf < .85 ? 2 : 3;
      if (band <= (G.seenK[id] || 0)) continue;
      G.seenK[id] = band;
      const dead = unitById(k.uid) && unitById(k.uid).hp <= 0;
      hq(`Контакт (${k.src}): ${UT[k.type] ? UT[k.type].n : k.type}, кв. ${sq(k)}, уверенность ${pc(k.conf)}.${dead ? ' Позиция поражена.' : ''}`, 'w');
    }
  }

  function coverCount(o) {
    return G.units.filter(u => u.hp > 0 && UT[u.k].w && dist(u, o) < UT[u.k].w.r).length;
  }

  function shiftUnit(u) {
    for (let i = 0; i < 14; i++) {
      const a = R(0, 6.28), d = u.k === 'horizon' ? R(14, 30) : R(8, 18);
      let p = nudgeOwn({ x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d });
      if (side(p.x, p.y) !== 1) continue;
      const rd = roadDist(p);
      if (rd.p && rd.d < 5 && side(rd.p.x, rd.p.y) === 1) p = rd.p;
      if (G.units.some(o => o !== u && dist(o, p) < 2.8)) continue;
      u.x = p.x; u.y = p.y; markSpot(u);
      return;
    }
  }

  function defPlace(k) {
    const objs = G.objs.filter(o => o.hp > 15).sort((a, b) => coverCount(a) - coverCount(b) || b.v - a.v);
    for (const o of objs) {
      for (let i = 0; i < 8; i++) {
        const a = R(0, 6.28), d = R(3, k === 'post' ? 18 : 10);
        const p = nudgeOwn({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d });
        if (side(p.x, p.y) !== 1) continue;
        if (G.units.some(u => dist(u, p) < 2.5)) continue;
        addUnit(k, p.x, p.y, true);
        return true;
      }
    }
    return false;
  }

  function defDoctrine() {
    for (const u of G.units) {
      if (u.hp <= 0) continue;
      const T = UT[u.k];
      if (u.k === 'horizon') u.radar = 'on';
      else if (u.k === 'bastion') u.radar = 'off';
      else if (u.k === 'decoy') u.radar = 'on';
      else if (T.radar || T.fake) u.radar = 'cue';
      if (T.w) u.roe = (T.w.mc || 0) >= 0.4 ? 'eco' : 'free';
      if (T.w) {
        let best = null, bd = T.w.r * 1.15;
        for (const o of G.objs) {
          const d = dist(u, o);
          if (o.hp > 0 && d < bd) { bd = d; best = o; }
        }
        if (best) u.cover = best.id;
      }
    }
  }

  function defAdapt() {
    G.budget += 22 + Math.round(energy() / 8);
    for (const u of G.units) {
      if (u.hp <= 0) continue;
      if ((u.burn || 0) >= 2 && ['shield', 'krom', 'bastion', 'horizon', 'spaag', 'ew'].includes(u.k)) shiftUnit(u);
      u.shots = 0; u.burn = 0;
    }
    for (const u of G.units) {
      const T = UT[u.k];
      if (!T.w || u.am >= T.w.am || !reloadNeed(u)) continue;
      const c = reloadCost(u);
      if (G.budget - c < 20) continue;
      G.budget -= c; u.am = reloadTake(u);
    }
    for (const o of G.objs) {
      if (o.hp <= 0 || o.hp >= 90 || G.budget < 26) continue;
      const gain = Math.min(16, 100 - o.hp);
      o.hp += gain; G.budget -= gain * 0.15;
    }
    let bought = 0;
    for (const [k, lim] of [['decoy', 2], ['mog', 3], ['manpad', 2], ['post', 3], ['ew', 1], ['icpt', 1]]) {
      let n = 0;
      while (n < lim && bought < 7 && G.budget > UT[k].cost + 20) {
        if (!defPlace(k)) break;
        G.budget -= UT[k].cost; n++; bought++;
      }
    }
    defDoctrine();
  }

  function defNightOpen() {
    const cap = G.objs[0];
    if (!cap) return;
    for (const u of G.units) if (u.k === 'heli' && u.st === 'ready') {
      order(u, { t: 'patrol', p: { x: cap.x + R(-18, 18), y: cap.y + R(-12, 12) } });
    }
  }

  function defAnswer(r) {
    let i = r.def == null ? 0 : r.def;
    if (r.key === 'am') i = (G.budget >= reloadCost(r.u) && !engagedNow(r.u)) ? 0 : 1;
    else if (r.key === 'armw') {
      const bal = G.threats.some(th => !th.dead && (th.cls === 'ballistic' || th.cls === 'aeroball') && G.t - th.seen < 50);
      i = (r.u.k === 'bastion' && bal) ? 1 : 0;
    } else if (r.key === 'rec' || r.key === 'em') i = 0;
    answerReq(r.id, i);
  }

  function defShiftScreen() {
    if (G.t - (G.shiftT || 0) < 500) return;
    const th = G.threats.find(th => !th.dead && G.t - th.seen < 30 && ['drone', 'decoy', 'loiter', 'jet', 'cruise'].includes(th.cls));
    if (!th) return;
    const o = predictObj(th);
    if (!o) return;
    if (G.units.some(u => ['mog', 'manpad', 'icpt'].includes(u.k) && u.hp > 0 && dist(u, o) < 7)) return;
    const mob = G.units.filter(u => ['mog', 'manpad', 'icpt'].includes(u.k) && u.st === 'ready' && !u.moved && u.hp > 0 && u.pend === 0);
    if (!mob.length) return;
    mob.sort((a, b) => dist(a, o) - dist(b, o));
    const u = mob[0];
    const dx = th.x - o.x, dy = th.y - o.y, L = Math.hypot(dx, dy) || 1;
    const p = nudgeOwn({ x: o.x + dx / L * 5, y: o.y + dy / L * 5 });
    if (side(p.x, p.y) !== 1) return;
    G.shiftT = G.t;
    u.moved = true;
    order(u, { t: 'move', p, ok: 1 });
  }

  function defThink() {
    for (const r of G.reqs.slice()) defAnswer(r);
    const seen = G.threats.filter(th => !th.dead && G.t - th.seen < 30);
    const near = seen.some(th => WD.cities.some(c => !c.enemy && dist(c, th) < 55));
    if (near && !G.alarm) {
      G.alarm = true; G.alarmSince = G.t;
      hq('В крае объявлена воздушная тревога.', 'w');
    }
    if (!near && G.alarm && G.t - (G.alarmSince || 0) > 1400 && !seen.length) {
      G.alarm = false;
      hq('У них отбой тревоги.', 'm');
    }
    const bal = seen.some(th => th.cls === 'ballistic' || th.cls === 'aeroball');
    /* разведка сообщила о носителях или пусках: ИИ-штаб включает радары и объявляет тревогу заранее.
       Ложная активность налёта бьёт именно сюда: радары светятся, тревога — впустую */
    const alert = (G.botIntel || []).some(t => t <= G.t && G.t - t < 2400);
    if (alert) {
      for (const u of G.units) if ((u.k === 'shield' || u.k === 'krom') && u.radar === 'cue') { u.radar = 'on'; u.alertOn = 1 }
      if (!G.alarm && chance(.5)) { G.alarm = true; G.alarmSince = G.t; hq('Их разведка что-то заметила: в крае объявлена тревога, радары включаются.', 'w') }
    } else for (const u of G.units) if (u.alertOn && !seen.length) { u.radar = 'cue'; u.alertOn = 0 }
    for (const u of G.units) {
      if (u.hp <= 0) continue;
      if (u.k === 'bastion') {
        if (bal && u.radar === 'off') u.radar = 'on';
        if (!bal && u.radar === 'on' && u.emit > 700) u.radar = 'off';
      }
      if (u.k === 'horizon' && u.hp < UT.horizon.hp * 0.4 && u.radar === 'on') u.radar = 'cue';
    }
    defShiftScreen();
    flushContacts();
    E.nextThink = G.t + 12;
  }

  function planNight() {
    defDoctrine();
    if (G.night > 1) defAdapt();
    playerStrikeSide();
  }

  /** сторона налёта — человек: ИИ налёта не нужен, контакты разведки — в журнал */
  function playerStrikeSide() {
    E.jamBase = 0.05; E.jamWin = null; E.posture = 'player'; E.nextThink = 25;
    if (!G.seenK) G.seenK = {};
    flushContacts();
  }

  /** отдельно от ИИ ПВО: прибытие арсенала и агентура (нужно и дуэли) */
  function strikeSupply() {
    if (chance(0.55)) {
      const k = pick(['jalo', 'moth', 'shershen', 'strizh', 'grach']);
      const n = RI(3, 8);
      E.stock[k] += n;
      hq(`Снабжение подвезло ${n}× «${TT[k].n}».`, 'g');
    }
    if (chance(0.5)) {
      const pool = G.units.filter(u => u.hp > 0 && ['shield', 'krom', 'bastion', 'horizon', 'spaag', 'ew'].includes(u.k));
      const u = pool.length ? pick(pool) : null;
      if (u) {
        const k = eKnow(u);
        k.type = u.k; k.conf = Math.max(k.conf, 0.78); k.src = 'агентура';
        setKnowPos(k, u, 1);
        hq(`Агентура: ${UT[u.k].n} в кв. ${sq(k)}, ошибка около километра.`, 'w');
        G.seenK[u.id] = 3;
      }
    }
  }

  function eReplan() { defThink(); }

  function eNightEnd() {}

  /** между ночами: всё, что получает сторона налёта */
  function prepEvents() {
    strikeSupply();
  }

  return {
    planNight,
    think: eReplan,
    nightEnd: eNightEnd,
    prepEvents,
    nightOpen: defNightOpen,
    playerStrikeSide,
    strikeSupply,
    flushContacts
  };
})();
