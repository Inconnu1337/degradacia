'use strict';
/* ============================================================
   ПРОГОН ПРАВИЛ БЕЗ СЕТИ И БРАУЗЕРА
   Каждый режим играется целиком (5 ночей) ботом-игроком через
   те же команды, что шлёт клиент. Ловит исключения в правилах,
   проверяет, что снимки сторон не протекают чужими данными.
   Запуск: node test/headless.js
   ============================================================ */
const assert = require('assert');
const { createEngine, HUMANS } = require('../server/engine');

function play(mode, seedNights = 5) {
  const e = createEngine(mode);
  const humans = HUMANS[mode];
  const present = { def: true, atk: true };
  const cmd = (r, n, a) => e.command(r, n, a);
  let nights = 0, launches = 0, answered = 0, orders = 0;
  const views = {};
  const look = () => { for (const r of humans) views[r] = JSON.parse(e.view(r)) };

  for (let guard = 0; guard < 100000; guard++) {
    look();
    const G = views[humans[0]].G;
    if (G.phase === 'prep') {
      if (humans.includes('def')) {
        const V = views.def;
        /* немного подготовки: купить «Мангуст», передвинуть расчёт */
        if (V.G.budget > 40) { const r = cmd('def', 'place', { k: 'mog', x: 200 + Math.random() * 40, y: 180 + Math.random() * 40 }); if (r.ok) orders++ }
        const u = V.G.units.find(u => u.k === 'krom');
        if (u) assert(cmd('def', 'order', { id: u.id, o: { t: 'move', p: { x: u.x + 2, y: u.y + 1 } } }).ok);
        const dmg = V.G.objs.find(o => o.hp < 100 && !o.rep);
        if (dmg) cmd('def', 'repair', { id: dmg.id });
      }
      if (humans.includes('atk')) {
        const V = views.atk;
        const tgt = V.G.objs.filter(o => o.hp > 0).sort((a, b) => b.v - a.v)[0];
        for (const k of ['jalo', 'moth', 'krechet', 'molot', 'grach']) {
          const zid = null;
          const tg = k === 'molot' || k === 'grach'
            ? (Object.values(V.E.know)[0] ? { aim: { x: Object.values(V.E.know)[0].x, y: Object.values(V.E.know)[0].y, uid: Object.values(V.E.know)[0].uid } } : { obj: tgt.id })
            : { obj: tgt.id };
          const r = cmd('atk', 'launch', { plan: { k, n: 4, zid, delay: launches % 3, high: k === 'jalo', wps: [], tgt: tg } });
          if (r.ok) launches++;
        }
        const r2 = cmd('atk', 'launch', { plan: { k: 'sova', n: 1, delay: 1, wps: [{ x: 300, y: 150 }, { x: 250, y: 200 }] } });
        if (r2.ok) launches++;
        /* мусор от клиента не должен ронять сервер */
        for (const bad of [null, {}, { k: 'jalo', n: 'x', tgt: { aim: { x: 'NaN' } } }, { k: 'zzz' }, { k: 'jalo', tgt: { obj: '../' } }])
          assert.strictEqual(cmd('atk', 'launch', { plan: bad }).ok, false);
      }
      for (const r of humans) {
        let res = cmd(r, 'startNight', {});
        if (!res.ok && res.warned) res = cmd(r, 'startNight', { confirm: true });
        assert(res.ok, mode + ' startNight ' + JSON.stringify(res));
      }
      e.eval('SPEED = 180');
      continue;
    }
    if (G.phase === 'night') {
      if (humans.includes('def')) {
        const V = views.def;
        for (const q of V.G.reqs) { if (cmd('def', 'ans', { id: q.id, i: q.def || 0 }).ok) answered++ }
        const th = V.G.threats.find(t => t.vis);
        const u = V.G.units.find(u => u.k === 'shield' && u.am > 0);
        if (th && u && Math.random() < .05) { assert(cmd('def', 'order', { id: u.id, o: { t: 'assign', th: th.id } }).ok); orders++ }
        if (Math.random() < .01) cmd('def', 'alarm', {});
        /* туман войны: тип скрыт до опознавания, маршрутов нет */
        for (const t of V.G.threats) {
          if (t.idLv < 2) assert.strictEqual(t.k, null);
          if (t.cls !== 'ballistic' && t.cls !== 'aeroball') assert.strictEqual(t.path.length, 0);
          if (t.idLv < 1) assert.strictEqual(t.cls, 'unknown');
        }
      }
      if (humans.includes('atk')) {
        const V = views.atk;
        assert.strictEqual(V.G.units.length, 0);
        for (const k of Object.values(V.E.know)) assert(!('ox' in k) && !('shots' in k));
        assert(!('budget' in V.G));
      }
      e.eval('SPEED = 180');
      e.tick(250, present);
      const ev = e.drain();
      for (const x of ev) assert(['log', 'toast', 'fx', 'modal', 'clear'].includes(x.e), x.e);
      continue;
    }
    if (G.phase === 'debrief') {
      nights++;
      if (G.over) { assert(cmd(humans[0], 'final', {}).ok); continue }
      for (const r of humans) assert(cmd(r, 'nextDay', {}).ok);
      continue;
    }
    if (G.phase === 'final') break;
  }
  const S = e.eval('JSON.stringify({ night: G.night, en: Math.round(energy()), camp: G.camp.nights.length, campA: G.campA.nights.length, budget: Math.round(G.budget) })');
  console.log(`  ✔ ${mode}: ночей ${nights}, пусков ${launches}, ответов ${answered}, приказов ${orders} → ${S}`);
}

for (const m of ['defense', 'attack', 'duel']) play(m);
