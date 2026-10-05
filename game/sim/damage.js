'use strict';
/* ============================================================
   ПОЖАРЫ, ПОЖАРНЫЕ И РЕМОНТ ПОД ОГНЁМ
   ------------------------------------------------------------
   Пожар (o.fire / u.fire, 0–1) появляется после прилёта, разгорается
   на ветру и сам по себе съедает состояние объекта или живучесть
   техники. Дождь тушит быстро, снег — медленнее. Горящая техника
   видна издалека: противник уточняет её позицию по зареву.

   Бригады на ночь (G.crews): пожарные ДСНС и ремонтные. Их можно
   послать к объекту прямо во время налёта — но прилёт по месту
   работ бьёт и по людям: потери среди спасателей, падение духа края,
   бригада может не вернуться.
   ============================================================ */

const CREWS_PER_NIGHT = { fire: 3, rep: 2 };
const FIGHT_COST = 1;            /* выезд пожарных, млн */
const NIGHT_REP_HP = 20;         /* ремонт ночью: меньше, чем днём */
const NIGHT_REP_T = 2700;        /* работа ремонтников, с */
const UNIT_REP_T = 1800;         /* полевой ремонт техники, с */

/* насколько охотно поджигает класс средства */
const IGNITE = { drone: .45, loiter: .35, jet: .5, arm: .3, cruise: .7, ballistic: .6, aeroball: .6, fpv: .5, mother: .3 };

function resetCrews() { G.crews = { fire: CREWS_PER_NIGHT.fire, rep: CREWS_PER_NIGHT.rep } }

function ignite(target, cls, dmg, cap) {
  if (!chance(IGNITE[cls] || .3)) return false;
  const was = target.fire || 0;
  if (!was) target.fireAge = 0;
  target.fire = clamp(Math.max(was, .2 + dmg / (cap || 40)), 0, 1);
  return !was;
}

/** насколько погода гасит огонь */
const wetK = () => ({ rain: 3.2, snow: 1.8, fog: 1.3 }[G.weather.vis] || 1);

function fireStep(dt) {
  const wind = (G.wind && G.wind.v) || 0, wet = wetK();
  for (const o of G.objs) {
    if (o.fire > 0) {
      /* огонь разгорается на ветру, но выгорает: чем дольше горит, тем меньше пищи */
      o.fireAge = (o.fireAge || 0) + dt;
      let d = dt * (.00008 * (1 + wind / 12) - .00007 * (wet - 1) - .00003 - .00004 * o.fireAge / 3600);
      if (o.ff && o.ff.st === 'work') d -= dt * .0012;
      o.fire = clamp(o.fire + d, 0, 1);
      const loss = Math.min(o.hp, o.fire * dt * .003 / OT[o.type].hard);
      if (loss > 0) { o.hp -= loss; S.objDmg += loss * o.v / 100; S.fireDmg = (S.fireDmg || 0) + loss * o.v / 100 }
      if (o.fire > .75 && !o.fireLoud) { o.fireLoud = 1; hq(`«${esc(o.n)}»: пожар разгорается, ${G.wind.v >= 8 ? 'ветер раздувает огонь' : 'огонь распространяется по территории'}.`, 'w') }
      if (o.fire <= 0) {
        o.fire = 0; o.fireLoud = 0; o.fireAge = 0;
        hq(`«${esc(o.n)}»: ${o.ff ? 'пожарные локализовали и потушили огонь' : wet > 1.5 ? 'пожар потушен — помог дождь' : 'пожар догорел и потух'}.`, 'g');
      }
    }
    crewStep(o, 'ff', dt);
    crewStep(o, 'rw', dt);
  }
  for (const u of G.units.slice()) {
    if (u.fire > 0) {
      /* расчёт тушит сам; рядом «Кузнец» или ремонтники — быстрее; дождь помогает */
      const help = (nearSupport(u, 'repair') ? 2 : 1) * (u.fix && u.fix.st === 'work' ? 2 : 1) * (u.crew.trait === 'методичный' ? 1.3 : 1);
      u.fire = clamp(u.fire + dt * (.00012 * (1 + wind / 15) - .0006 * help * wet), 0, 1);
      u.hp -= u.fire * UT[u.k].hp * dt / 2400;
      if (u.fire > .3 && G.t - (u.glowT || -1e9) > 60) {
        u.glowT = G.t;
        /* зарево видно издалека: сторона налёта уточняет позицию */
        const k = eKnow(u);
        k.conf = Math.max(k.conf, .65); k.src = 'зарево пожара';
        setKnowPos(k, u, .6);
      }
      if (u.hp <= 0) { unitDestroyed(u, null, 'сгорел'); continue }
      if (u.fire <= 0) { u.fire = 0; sayT(u, 'fireout', 120, pick(['Пожар потушили. Повреждения оцениваем.', 'Огонь сбили, техника цела частично.', 'Потушились. Работать можем.']), 'g') }
    }
    unitFixStep(u, dt);
  }
}

/** бригада у объекта: дорога → работа → готово */
function crewStep(o, key, dt) {
  const c = o[key];
  if (!c) return;
  if (c.st === 'go' && G.t >= c.at) {
    c.st = 'work'; c.t0 = G.t;
    hq(`«${esc(o.n)}»: ${key === 'ff' ? 'пожарные расчёты на месте, начали тушение' : 'ремонтная бригада на месте, работы начаты'}.`, 'm');
  }
  if (c.st !== 'work') return;
  if (key === 'ff' && o.fire <= 0) { o.ff = null; G.crews.fire++; return }
  if (key === 'rw' && G.t - c.t0 >= NIGHT_REP_T) {
    o.hp = Math.min(100, o.hp + NIGHT_REP_HP);
    o.rw = null; G.crews.rep++;
    hq(`«${esc(o.n)}»: аварийный ремонт под огнём закончен, +${NIGHT_REP_HP}%. Бригада возвращается.`, 'g');
  }
}

function unitFixStep(u, dt) {
  const f = u.fix;
  if (!f) return;
  if (u.st === 'move' || u.st === 'air') {
    u.fix = null; G.crews.rep++;
    sayT(u, 'fixoff', 60, 'Мы снялись с позиции — ремонтники остались без работы, уходят.', 'm');
    return;
  }
  if (f.st === 'go' && G.t >= f.at) { f.st = 'work'; f.t0 = G.t; say(u, 'Ремонтники прибыли, работают по технике.') }
  if (f.st === 'work' && G.t - f.t0 >= UNIT_REP_T) {
    const T = UT[u.k];
    u.hp = Math.min(T.hp, u.hp + T.hp * .5);
    u.fix = null; G.crews.rep++;
    say(u, `Полевой ремонт закончен, живучесть ${Math.round(u.hp / T.hp * 100)}%.`, 'g');
  }
}

/** прилёт по месту работ: потери среди спасателей и ремонтников */
function crewHit(where, crew, name) {
  if (!crew || crew.st !== 'work' && !(crew.st === 'go' && G.t > crew.at - 120)) return false;
  const n = RI(1, 4);
  S.rescue = (S.rescue || 0) + n;
  moraleAdd(-n * 2.5);
  const lost = chance(.4);
  hq(`✖ Прилёт по месту работ (${esc(name)}): потери среди ${crew.kind === 'ff' ? 'пожарных' : 'ремонтников'} — ${n}. ${lost ? 'Бригада выбыла.' : 'Бригада отходит.'}`, 'crit');
  if (!lost) G.crews[crew.kind === 'ff' ? 'fire' : 'rep']++;
  return true;
}

/* ---------- команды ПВО ---------- */
function sendFirefighters(o) {
  if (G.phase !== 'night') return { ok: false, error: 'Днём пожары тушат сами службы' };
  if (!o.fire) return { ok: false, error: 'Пожара нет' };
  if (o.ff) return { ok: false, error: 'Пожарные уже там' };
  if (G.crews.fire <= 0) { toast('Все пожарные бригады заняты', 'i'); return { ok: false, error: 'нет свободных бригад' } }
  if (G.budget < FIGHT_COST) return { ok: false, error: 'нет бюджета' };
  G.budget -= FIGHT_COST; G.crews.fire--;
  o.ff = { kind: 'ff', st: 'go', at: G.t + R(600, 1200) };
  hq(`→ ДСНС: пожарные расчёты к «${esc(o.n)}», прибытие ≈ ${clock(o.ff.at)}. Работа под угрозой повторного удара.`, 'hq');
  return { ok: true };
}

function nightRepair(o) {
  if (o.hp >= 100) return { ok: false, error: 'ремонт не нужен' };
  if (o.rw) return { ok: false, error: 'бригада уже работает' };
  if ((o.fire || 0) > .2) { toast('Сначала потушите пожар', 'i'); return { ok: false, error: 'горит' } }
  if (G.crews.rep <= 0) { toast('Все ремонтные бригады заняты', 'i'); return { ok: false, error: 'нет свободных бригад' } }
  const c = Math.round(repCost(o) * 1.3);
  if (G.budget < c) return { ok: false, error: 'нет бюджета' };
  G.budget -= c; G.crews.rep--;
  o.rw = { kind: 'rw', st: 'go', at: G.t + R(600, 1200) };
  hq(`→ Аварийная бригада к «${esc(o.n)}» (${c} млн): прибытие ≈ ${clock(o.rw.at)}, работы ~${fmtDur(NIGHT_REP_T)}. Опасно: объект могут ударить снова.`, 'hq');
  return { ok: true };
}

/** стоимость ремонта техники днём (мгновенно) */
const unitRepCost = u => Math.max(1, Math.round(UT[u.k].cost * .25 * (1 - u.hp / UT[u.k].hp)));

function repairUnit(u) {
  const T = UT[u.k];
  if (u.hp >= T.hp) return { ok: false, error: 'ремонт не нужен' };
  if (G.phase === 'prep') {
    const c = unitRepCost(u);
    if (G.budget < c) { toast('Не хватает бюджета', 'i'); return { ok: false, error: 'нет бюджета' } }
    G.budget -= c; u.hp = T.hp; u.fire = 0;
    hq(`«${esc(u.crew.cs)}»: техника восстановлена (${c} млн).`, 'g');
    return { ok: true };
  }
  if (G.phase !== 'night') return { ok: false, error: 'не время' };
  if (u.fix) return { ok: false, error: 'ремонтники уже едут' };
  if (u.st === 'move' || u.st === 'air') return { ok: false, error: 'техника в движении' };
  if (G.crews.rep <= 0) { toast('Все ремонтные бригады заняты', 'i'); return { ok: false, error: 'нет свободных бригад' } }
  const rem = G.units.find(v => v.k === 'rem' && v.hp > 0 && v.st === 'ready');
  const eta = rem ? 300 + dist(rem, u) / .02 : R(1200, 2000);
  G.crews.rep--;
  u.fix = { kind: 'rw', st: 'go', at: G.t + eta };
  hq(`→ Ремонтники к «${esc(u.crew.cs)}»: прибытие ≈ ${clock(u.fix.at)}, работа ~${fmtDur(UNIT_REP_T)}. Если по позиции ударят снова — будут потери.`, 'hq');
  return { ok: true };
}
