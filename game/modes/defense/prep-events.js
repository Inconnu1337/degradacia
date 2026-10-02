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

  return {
    prepEvents
  };
})();
