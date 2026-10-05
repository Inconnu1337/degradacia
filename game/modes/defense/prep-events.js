'use strict';
/* ============================================================
   ОБОРОНА: события между ночами (то, что меняет следующую ночь)
   ============================================================ */

const DefensePrep = (() => {
  /* межночные события — то, что меняет следующую ночь */
  function prepEvents() {
    const evs = [];
    const dmg = G.objs.filter(o => o.hp < 100);
    const sams = G.units.filter(u => ['shield', 'krom', 'bastion'].includes(u.k));

    evs.push({ w: 3, f: () => {
      const add = RI(15, 30);
      G.budget += add;
      hq(`Администрация края выделила дополнительно <b>${add} млн</b> на воздушную оборону.`, 'g');
    }});
    evs.push({ w: 2.2, f: () => {
      const u = pick(G.units.filter(x => UT[x.k].w) || G.units);
      if (!u) return;
      u.crew = mkCrew(); u.crew.exp = R(.25, .4);
      say(u, 'Штаб, у нас смена личного состава: расчёт новый, слаженности пока нет.', 'w');
    }});
    evs.push({ w: 2, f: () => {
      const u = pick(sams);
      if (!u) return;
      const k = eKnow(u); k.conf = Math.min(1, k.conf + .4); k.src = 'агентура'; setKnowPos(k, u, 1.2);
      hq(`Контрразведка: в районе позиции «${esc(u.crew.cs)}» задержаны люди с аппаратурой. Исходите из того, что позиция вскрыта.`, 'w');
    }});
    evs.push({ w: 1.8, f: () => {
      if (!dmg.length) { G.budget += 12; hq('Объекты в порядке, аварийный резерв не израсходован: <b>+12 млн</b>.', 'g'); return }
      const o = pick(dmg);
      o.hp = Math.min(100, o.hp + RI(8, 18));
      hq(`Аварийные бригады восстановили часть оборудования: «${esc(o.n)}» — ${Math.round(o.hp)}%.`, 'g');
    }});
    evs.push({ w: 1.6, f: () => {
      const u = pick(G.units.filter(x => UT[x.k].w && UT[x.k].w.mc >= .18));
      if (!u) return;
      u.am = UT[u.k].w.am;
      hq(`Поставка боеприпасов: боекомплект «${esc(u.crew.cs)}» (${UT[u.k].n}) восстановлен бесплатно.`, 'g');
    }});
    evs.push({ w: 1.4, f: () => {
      hq('Сводка связистов: повреждена линия к восточным постам. Ночью связь в восточном секторе будет хуже обычного.', 'w');
      G.linkPenalty = .06;
    }});
    evs.push({ w: 1.2, f: () => {
      const c = pick(WD.cities.filter(x => !x.enemy && x.pop >= 2));
      hq(`Общественный совет ${c.gen} требует объяснений: за прошлую ночь пострадали люди. Штабу напоминают про своевременную тревогу.`, 'w');
    }});
    evs.push({ w: 1, f: () => {
      const u = pick(G.units.filter(x => x.k === 'mog' || x.k === 'post'));
      if (!u) return;
      hq(`Расчёт «${esc(u.crew.cs)}» снят и передан соседнему краю по приказу командования.`, 'w');
      G.units.splice(G.units.indexOf(u), 1);
      G.budget += Math.round(UT[u.k].cost * .5);
    }});

    makeOffers();

    const n = RI(1, 2);
    const pool = shuffled(evs);
    let done = 0;
    for (const e of pool) {
      if (done >= n) break;
      if (chance(clamp(e.w / 3, .2, 1))) { e.f(); done++ }
    }
    if (E.dayNews.length) {
      for (const t of E.dayNews) logLine('intel', `<span class="tm">день</span><span class="gr">B-2</span>${esc(t)}`, 'w');
    }
  }

  /* ---------- предложение партнёров: одно из трёх на выбор ----------
     Каждый день три варианта поставки; штаб берёт один (команда offer).
     Невыбранное сгорает с началом ночи. */
  const OFFER_UNITS = ['spaag', 'krom', 'icpt', 'ew', 'heli', 'horizon'];

  function makeOffers() {
    const sams = G.units.filter(u => UT[u.k].w && UT[u.k].w.kind === 'missile' && UT[u.k].w.mc >= .18);
    const dmg = G.objs.filter(o => o.hp < 100);
    const cash = RI(35, 55), unit = pick(OFFER_UNITS);
    const all = [
      { t: 'cash', v: cash, n: `Транш администрации: +${cash} млн`, d: 'Деньги на закупку, боеприпасы и ремонт.' },
      { t: 'unit', k: unit, n: `Расчёт: ${UT[unit].n}`, d: `Передаётся без оплаты (обычно ${UT[unit].cost} млн), разместите на карте.` }
    ];
    if (sams.length) all.push({ t: 'ammo', n: 'Эшелон зенитных ракет', d: `Полный боекомплект всем ЗРК и ПЗРК (${sams.length} расч.) бесплатно, плюс запас: на ближайшую ночь пополнение вдвое дешевле.` });
    if (dmg.length) all.push({ t: 'repair', n: 'Энергетики соседних краёв', d: `Все повреждённые объекты (${dmg.length}) +20% к состоянию.` });
    all.push({ t: 'crew', n: 'Бригады ДСНС и ремонтники', d: 'На ближайшую ночь +2 пожарные и +2 ремонтные бригады.' });
    G.offers = shuffled(all).slice(0, 3);
    G.offerTaken = false;
  }

  function takeOffer(i) {
    if (G.phase !== 'prep') return { ok: false, error: 'Поставки принимают днём' };
    if (G.offerTaken || !G.offers || !G.offers[i]) return { ok: false, error: 'Предложение уже выбрано' };
    const o = G.offers[i];
    G.offerTaken = true;
    if (o.t === 'cash') G.budget += o.v;
    else if (o.t === 'unit') G.gifts.push(o.k);
    else if (o.t === 'ammo') { for (const u of G.units) if (UT[u.k].w && UT[u.k].w.kind === 'missile') u.am = UT[u.k].w.am; G.ammoDeal = 1 }
    else if (o.t === 'repair') for (const ob of G.objs) if (ob.hp < 100) ob.hp = Math.min(100, ob.hp + 20);
    else if (o.t === 'crew') G.crewBonus = 1;
    hq(`Принято предложение партнёров: ${esc(o.n)}.`, 'g');
    G.offers = [o];
    return { ok: true };
  }

  return {
    prepEvents,
    makeOffers,
    takeOffer
  };
})();
