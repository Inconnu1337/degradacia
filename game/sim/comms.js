'use strict';
/* ============================================================
   СВЯЗЬ И ПРИКАЗЫ
   Штаб не управляет техникой напрямую: приказ идёт по связи, командир расчёта его толкует и может возразить.
   Говорят с игроком через фасад say/ask (core/dispatch.js).
   ============================================================ */

function sayT(u, key, cd, txt, cls) {
  if (G.t - (u.sayT[key] || -1e9) < cd) return;
  u.sayT[key] = G.t; say(u, txt, cls);
}

/* ---------- качество связи ---------- */
/** ближайший пункт управления, который «подтягивает» расчёт */
function cpBoost(u) {
  let b = 0;
  for (const v of G.units) {
    if (!UT[v.k].sup || !UT[v.k].sup.comm || v.st !== 'ready' || v.hp <= 0) continue;
    const d = dist(u, v);
    if (d < UT[v.k].sup.comm) b = Math.max(b, .30 * (1 - d / UT[v.k].sup.comm * .55));
  }
  return b;
}

/** 1 — идеальная связь, <0 — приказ почти наверняка исказится */
function commQ(u) {
  return 1 - dist(G.hq, u) / 560 - G.jam * (.45 + u.x / WW * .8) - u.crew.fat * .25 + cpBoost(u);
}

function orderDelay(u) {
  const q = G.comms.filter(c => c.t > G.t).length;
  return Math.max(8, 14 + dist(G.hq, u) / 9 + q * 8 + G.jam * 34 - cpBoost(u) * 60);
}

function descOrder(o) {
  switch (o.t) {
    case 'move': return 'выдвинуться в кв. ' + sq(o.p);
    case 'radar': return 'РЛС: ' + { on: 'включить', cue: 'по целеуказанию', off: 'выключить' }[o.v];
    case 'roe': return 'огонь: ' + { free: 'свободный', eco: 'экономный', hold: 'запрет' }[o.v];
    case 'cover': return 'прикрыть «' + o.obj.n + '»';
    case 'assign': return 'уничтожить цель (' + thLabel(o.th) + ')';
    case 'reload': return 'пополнить боекомплект';
    case 'patrol': return 'патруль, сектор ' + patrolName(o);
    case 'rtb': return 'возврат на площадку';
    case 'cancel': return 'отставить';
    case 'cb': return o.d || 'ответ';
    default: return o.t;
  }
}

function order(u, o) {
  if (G.phase === 'prep') { prepExec(u, o); return }
  if (G.phase !== 'night') return;
  const delay = orderDelay(u);
  G.comms.push({ u, o, t: G.t + delay });
  u.pend++;
  if (MODE.logOrders && o.t !== 'cb') hq(`→ «${esc(u.crew.cs)}»: ${descOrder(o)} <span class="gr">≈${fmtDur(delay)}</span>`, 'hq');
  uiDirty();
}

function reply(u, f, d) { G.comms.push({ u, o: { t: 'cb', f, d }, t: G.t + R(5, 12) }); u.pend++ }

function commsStep() {
  for (let i = G.comms.length; i--;) {
    const c = G.comms[i];
    if (c.t > G.t) continue;
    G.comms.splice(i, 1); c.u.pend--;
    if (c.u.hp > 0 && G.units.includes(c.u)) receive(c.u, c.o);
  }
}

function engagedNow(u) {
  const T = UT[u.k];
  const r = T.w ? T.w.r * 1.25 : (T.radar ? Math.min(40, T.radar * .3) : 6);
  return G.threats.some(th => !th.dead && th.seen > G.t - 12 && dist(u, th) < r);
}

function coverName(u) {
  if (u.cover) { const o = objById(u.cover); if (o) return '«' + o.n + '»' }
  const T = UT[u.k];
  let b = null, bd = 1e9;
  for (const o of G.objs) { const d = dist(o, u); if (d < bd) { bd = d; b = o } }
  return b && T.w && bd < T.w.r ? '«' + b.n + '»' : 'сектор';
}

/** исказить координаты — половина слов пропала в эфире */
function garble(p) {
  for (let i = 0; i < 8; i++) {
    const ax = chance(.5), dlt = chance(.5) ? GRID : -GRID;
    const q = { x: p.x + (ax ? dlt : 0), y: p.y + (ax ? 0 : dlt) };
    if (side(q.x, q.y) === 1) return q;
  }
  return p;
}

/* ---------- живые формулировки, зависят от характера ---------- */
function lineFor(u, kind, a) {
  if (kind === 'move' && chance(.5)) return pick([`Принял, ${a.sq}. Марш ~${a.eta}.`, `Есть ${a.sq}, выдвигаемся. Будем через ~${a.eta}.`,
    `Понял, квадрат ${a.sq}. Сворачиваемся и выходим.`, `Принял. Колонна на ${a.sq}, ~${a.eta}.`]);
  if (kind === 'ok' && chance(.5)) return pick(['Принято.', 'Понял, работаем.', 'Есть, выполняем.', 'Так точно.']);
  const tr = u.crew.trait;
  const L = {
    move: {
      'решительный': [`Есть ${a.sq}. Снимаемся.`, `Понял, ${a.sq}. Выходим.`],
      'осторожный': [`Принял, квадрат ${a.sq}. Марш ~${a.eta}, на это время огня не будет.`],
      'методичный': [`Принял: квадрат ${a.sq}. Марш ~${a.eta}, доложу по прибытии.`],
      'нервный': [`Понял… ${a.sq}. Выдвигаемся.`, `Принял, ${a.sq}, уходим.`],
      'упрямый': [`Принял ${a.sq}. Скажу сразу: позиция так себе, но выполняем.`]
    },
    ok: {
      'решительный': ['Есть.', 'Принял.'],
      'осторожный': ['Принял, выполняю.'],
      'методичный': ['Принял, выполняю. Доложу.'],
      'нервный': ['Понял, понял. Выполняем.'],
      'упрямый': ['Принял.', 'Ну хорошо. Принял.']
    }
  };
  return pick(L[kind][tr] || L[kind]['методичный']);
}

function reqStep() {
  for (let i = G.reqs.length; i--;) {
    const r = G.reqs[i];
    if (G.t - r.t < REQ_TTL) continue;
    G.reqs.splice(i, 1);
    const op = r.opts[r.def];
    say(r.u, `Штаб не отвечает. Действую по обстановке: ${op.l.toLowerCase()}.`, 'm');
    op.f(); uiDirty();
  }
}

/* ---------- приём и толкование приказа ---------- */
function receive(u, o) {
  const T = UT[u.k], c = u.crew;
  if (o.t === 'cb') { o.f && o.f(); return }

  /* искажение координат при плохой связи */
  if (o.p && !o.ok) {
    const q = commQ(u);
    const pg = Math.max(0, .82 - q) * (1.25 - c.exp) *
      (c.trait === 'нервный' ? 1.6 : c.trait === 'методичный' ? .5 : 1) * 1.35;
    if (chance(pg)) {
      const wrong = garble(o.p);
      if (wrong !== o.p) {
        if (c.exp > .55 || c.trait === 'методичный' || c.trait === 'упрямый') {
          ask(u, `Связь с помехами, половина слов пропала. Как понял: квадрат ${sq(wrong)}. Подтвердите.`,
            [{ l: `Да, ${sq(wrong)}`, f: () => receive(u, { ...o, p: wrong, ok: 1 }) },
            { l: `Нет, ${sq(o.p)}`, f: () => receive(u, { ...o, ok: 1 }) }], 1, 'garble');
          return;
        }
        o = { ...o, p: wrong, ok: 1 };
        say(u, `Принял, квадрат ${sq(wrong)}.`, '');
      }
    }
  }
  const sk = o.sk || {};

  switch (o.t) {
    case 'move': {
      const p = o.p, sd = side(p.x, p.y);
      if (sd === 0) { say(u, `Штаб, в квадрате ${sq(p)} вода. Не понял задачу, уточните точку.`, 'w'); return }
      if (sd === 2) { say(u, `Квадрат ${sq(p)} за линией границы. Не выполняю, уточните.`, 'w'); return }
      if (!sk.eng && T.w && engagedNow(u)) {
        ask(u, `Работаем по целям. Если снимемся сейчас, ${coverName(u)} останется без прикрытия. Выполнять сейчас или после отбоя?`,
          [{ l: 'Сейчас', f: () => receive(u, { ...o, ok: 1, sk: { ...sk, eng: 1 } }) },
          { l: 'После отбоя', f: () => { u.after.push({ ...o, ok: 1, sk: { ...sk, eng: 1 } }); say(u, 'Принял, снимаемся после отбоя.') } }],
          1, 'moveEng');
        return;
      }
      /* тяжёлой технике нужна дорога — кроме позиций, где она уже стояла */
      const rd = roadDist(p);
      if (!sk.road && !reachable(u, p) && rd.p) {
        ask(u, `В квадрате ${sq(p)} подъезда для нашей техники нет: до дороги ${num(rd.d)} км по полю. Предлагаю площадку у трассы.`,
          [{ l: 'Да, у трассы', f: () => receive(u, { ...o, p: rd.p, ok: 1, sk: { ...sk, road: 1 } }) },
          { l: 'Отмена', f: () => say(u, 'Принял, остаёмся на месте.') }], 0, 'road');
        return;
      }
      const city = inCity(p);
      if (city && T.w && T.w.kind === 'missile' && !sk.city) {
        ask(u, `Точка в жилой застройке (${city.n}). Обломки перехваченных целей будут падать на дома. Подтверждаете позицию?`,
          [{ l: 'Подтверждаю', f: () => receive(u, { ...o, ok: 1, sk: { ...sk, city: 1 } }) },
          { l: 'Отмена', f: () => say(u, 'Принял, остаёмся.') }], 1, 'city');
        return;
      }
      const eta = dist(u, p) / T.sp;
      if (eta > 4800 && !sk.long) {
        ask(u, `Марш займёт ${fmtDur(eta)} и ещё ${fmtDur(T.dep)} на развёртывание. Всё это время мы вне боя. Подтверждаете?`,
          [{ l: 'Подтверждаю', f: () => receive(u, { ...o, ok: 1, sk: { ...sk, long: 1 } }) },
          { l: 'Отмена', f: () => say(u, 'Принял, остаёмся.') }], 1, 'long');
        return;
      }
      /* упрямый командир может предложить свой вариант рядом */
      if (c.trait === 'упрямый' && !sk.stub && T.w && T.w.kind === 'missile' && chance(.3)) {
        const alt = nudgeOwn({ x: p.x + R(-7, 7), y: p.y + R(-7, 7) });
        if (side(alt.x, alt.y) === 1 && dist(alt, p) > 3) {
          ask(u, `Штаб, в ${sq(p)} нас видно со всех сторон. В ${sq(alt)} есть лесополоса и подъезд. Разрешите туда?`,
            [{ l: 'Разрешаю', f: () => receive(u, { ...o, p: alt, ok: 1, sk: { ...sk, stub: 1, road: 1 } }) },
            { l: 'Выполнять как приказано', f: () => receive(u, { ...o, ok: 1, sk: { ...sk, stub: 1 } }) }], 0, 'stub');
          return;
        }
      }
      startMove(u, p);
      say(u, lineFor(u, 'move', { sq: sq(p), eta: fmtDur(eta) }));
      break;
    }
    case 'radar': {
      if (!T.radar && !T.fake) return;
      if (o.v === 'off' && !sk.x && engagedNow(u) && T.w) {
        ask(u, 'Цели в зоне. Если выключим РЛС, наводить ракеты будет нечем. Точно выключить?',
          [{ l: 'Выключить', f: () => receive(u, { ...o, sk: { x: 1 } }) },
          { l: 'Оставить', f: () => say(u, 'Принял, РЛС работает.') }], 1, 'rdoff');
        return;
      }
      u.radar = o.v;
      say(u, o.v === 'off' ? 'РЛС выключена, уходим в радиомолчание.'
        : o.v === 'cue' ? 'Принял, РЛС по целеуказанию: включаемся, только когда сеть видит цели рядом.'
          : 'РЛС включена, излучаем.');
      break;
    }
    case 'roe': {
      if (!T.w) return;
      if (o.v === 'hold' && !sk.x) {
        const inb = G.threats.filter(th => !th.dead && th.seen > G.t - 15 && dist(u, th) < T.w.r * 1.5).length;
        if (inb) {
          ask(u, `Рядом ${inb} ${inb > 1 ? 'целей' : 'цель'}. Точно запрещаете огонь?`,
            [{ l: 'Запрещаю', f: () => receive(u, { ...o, sk: { x: 1 } }) },
            { l: 'Отмена', f: () => say(u, 'Принял, работаем по-прежнему.') }], 1, 'hold');
          return;
        }
      }
      u.roe = o.v;
      say(u, o.v === 'hold' ? 'Принял, огонь не открываем.'
        : o.v === 'eco' ? 'Принял, экономный режим: дорогие ракеты только по опасным целям и по угрозам прикрываемому объекту.'
          : 'Принял, работаем по всем целям.');
      break;
    }
    case 'cover': {
      const ob = o.obj;
      if (!T.w) { say(u, 'У нас нет огневых средств, можем только наблюдать.', 'w'); return }
      const d = dist(u, ob), need = T.w.kind === 'gun' ? T.w.r * .8 : T.w.r * .6;
      if (d <= need) { u.cover = ob.id; say(u, `«${ob.n}» в нашей зоне, ${num(d)} км. Беру под приоритетное прикрытие.`); break }
      const k = (T.w.kind === 'gun' ? Math.min(1, T.w.r * .5) : T.w.r * .35) / d;
      const p = nudgeOwn({ x: ob.x + (u.x - ob.x) * k, y: ob.y + (u.y - ob.y) * k });
      ask(u, `«${ob.n}» вне нашей зоны (${num(d, 0)} км). Предлагаю позицию в кв. ${sq(p)}: марш ~${fmtDur(dist(u, p) / T.sp)}.`,
        [{ l: 'Выдвигайтесь', f: () => { u.cover = ob.id; receive(u, { t: 'move', p, ok: 1, sk: { eng: 1 } }) } },
        { l: 'Отмена', f: () => say(u, 'Принял, остаёмся.') }], 0, 'cover');
      break;
    }
    case 'assign': {
      const th = o.th;
      if (!T.w) return;
      if (th.dead) { say(u, 'Цель уже не наблюдаем.', 'm'); return }
      if (!(T.w.pk[th.cls] > 0)) { say(u, `По ${CLS_N[th.cls]} нам работать нечем, не наш класс.`, 'w'); return }
      u.assign = th.id;
      const d = dist(u, th);
      say(u, d > T.w.r ? `Цель вне зоны поражения (${num(d, 0)} км). Возьмём, как только войдёт.` : 'Цель принял. Работаем.');
      break;
    }
    case 'reload': {
      if (!T.w) return;
      if (u.am >= T.w.am) { say(u, 'Боекомплект полный.', 'm'); return }
      const cost = reloadCost(u);
      if (G.budget < cost) { say(u, `На пополнение нужно ${num(cost)} млн, а средств нет.`, 'w'); return }
      if (!sk.x && engagedNow(u)) {
        ask(u, `Работаем по целям. Перезарядка займёт ${fmtDur(reloadTime(u))}. Сейчас или после отбоя?`,
          [{ l: 'Сейчас', f: () => receive(u, { ...o, sk: { x: 1 } }) },
          { l: 'После отбоя', f: () => { u.after.push({ ...o, sk: { x: 1 } }); say(u, 'Принял, пополнимся после отбоя.') } }],
          1, 'rlEng');
        return;
      }
      G.budget -= cost;
      u.st = 'reload'; u.stT = G.t + reloadTime(u);
      const tz = nearSupport(u, 'reload');
      say(u, tz ? `Принял. ТЗМ «${esc(tz.crew.cs)}» рядом, управимся за ${fmtDur(u.stT - G.t)}.`
        : `Принял. Транспортно-заряжающая выехала, ~${fmtDur(u.stT - G.t)}.`);
      break;
    }
    case 'patrol': {
      if (!T.air) return;
      if (!G.weather.heli) { say(u, `Погода нелётная (${G.weather.n.toLowerCase()}). Взлёт невозможен.`, 'w'); return }
      if (side(o.p.x, o.p.y) !== 1) { say(u, 'Район патрулирования не на нашей территории, уточните.', 'w'); return }
      if (u.fuel < 900 && !sk.x) {
        ask(u, `Топлива на ${fmtDur(u.fuel)}. До района ещё лететь. Идти или сначала дозаправка?`,
          [{ l: 'Идти', f: () => receive(u, { ...o, sk: { x: 1 } }) },
          { l: 'На дозаправку', f: () => receive(u, { t: 'rtb' }) }], 1, 'fuel');
        return;
      }
      u.patrol = { x: o.p.x, y: o.p.y, obj: o.obj || null, uid: o.uid || null, keep: true };
      u.st = 'air'; u.dest = null; u.rtb = 0; u.chase = null;
      say(u, `Взлетаем, сектор: ${patrolName(u.patrol)}. Работаем сами: ищем и бьём мелочь, на заправку и обратно. В воздухе ${fmtDur(u.fuel)}.`);
      break;
    }
    case 'rtb': {
      if (!T.air) return;
      u.patrol = null; u.chase = null; u.dest = { ...u.base }; u.rtb = 1;
      if (u.st !== 'air') { u.rtb = 0; u.dest = null; say(u, 'Мы на площадке, задача снята.'); break }
      say(u, 'Возвращаемся на площадку.');
      break;
    }
    case 'cancel': {
      u.after = []; u.assign = null;
      if (u.st === 'move') { u.dest = null; u.st = 'deploy'; u.stT = G.t + UT[u.k].dep * .6; markSpot(u) }
      say(u, 'Отставить принял.');
      break;
    }
  }
  uiDirty();
}

/* ---------- обеспечение ---------- */
function nearSupport(u, kind) {
  let best = null, bd = 1e9;
  for (const v of G.units) {
    const s = UT[v.k].sup;
    if (!s || !s[kind] || v.st !== 'ready' || v.hp <= 0) continue;
    const d = dist(u, v);
    if (d < s[kind] && d < bd) { bd = d; best = v }
  }
  return best;
}

function reloadCost(u) {
  const T = UT[u.k];
  if (!T.w) return 0;
  let c = (T.w.mc ? (T.w.am - u.am) * T.w.mc : (T.rl.c || 0)) * RELOAD_MUL;
  if (nearSupport(u, 'reload')) c *= .75;
  return c;
}

function reloadTime(u) {
  const T = UT[u.k];
  let t = T.rl.t * (1 + u.crew.fat * .3);
  if (nearSupport(u, 'reload')) t *= .5;
  return t;
}

function startMove(u, p) {
  u.dest = { x: p.x, y: p.y };
  u.st = UT[u.k].air ? 'air' : 'move';
  u.h = Math.atan2(p.y - u.y, p.x - u.x);
  u.moved = true;
}

/** днём приказы выполняются сразу */
function prepExec(u, o) {
  const T = UT[u.k];
  if (o.t === 'move') {
    if (side(o.p.x, o.p.y) !== 1) { toast('Ставить можно только на своей территории', 'i'); return }
    u.x = o.p.x; u.y = o.p.y; u.moved = true; markSpot(u);
    if (T.air) u.base = { x: o.p.x, y: o.p.y };
  }
  else if (o.t === 'patrol' && T.air) {
    u.patrol = { x: o.p.x, y: o.p.y, obj: o.obj || null, uid: o.uid || null, keep: true };
    hq(`«${esc(u.crew.cs)}»: задача на ночь — патруль, сектор ${patrolName(u.patrol)}. Взлёт с началом дежурства.`, 'g');
  }
  else if (o.t === 'rtb' && T.air) { u.patrol = null; hq(`«${esc(u.crew.cs)}»: задача патруля снята.`, 'm') }
  else if (o.t === 'radar') u.radar = o.v;
  else if (o.t === 'roe') u.roe = o.v;
  else if (o.t === 'cover') u.cover = o.obj.id;
  else if (o.t === 'reload') {
    const c = reloadCost(u);
    if (G.budget < c) { toast('Не хватает бюджета', 'i'); return }
    G.budget -= c; u.am = T.w.am;
  }
  uiDirty();
}
