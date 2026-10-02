'use strict';
/* ============================================================
   ПРОГОН БАЛАНСА ДУЭЛИ (инструмент разработчика)
   Боты за обе стороны играют кампанию через обычные команды.
   Налёт: spam — всё и сразу в первую минуту ночи; spread — пакеты
   растянуты по ночи. ПВО: passive — только ответы по умолчанию;
   active — плюс тревога и назначение целей.
   Запуск: node tools/balance.js [прогонов=3] [стратегия налёта] [стратегия ПВО]
   ============================================================ */
const { createEngine } = require('../server/engine');

const RUNS = +process.argv[2] || 3;
const ATK = (process.argv[3] || 'spam,spread').split(',');
const DEF = (process.argv[4] || 'passive,active').split(',');

function targets(V) {
  return V.G.objs.filter(o => o.hp > 10).sort((a, b) => (b.type === 'power' || b.type === 'sub' || b.type === 'dam') - (a.type === 'power' || a.type === 'sub' || a.type === 'dam') || b.v - a.v);
}

function attackerDay(e, V, how) {
  const tg = targets(V);
  if (!tg.length) return;
  const know = Object.values(V.E.know).filter(k => !k.dead && k.conf > .3);
  let i = 0;
  const kinds = ['jalo', 'moth', 'shershen', 'strizh', 'krechet', 'albatros', 'garpia', 'molot', 'grach'];
  for (const k of kinds) {
    for (let guard = 0; guard < 60; guard++) {
      const V2 = JSON.parse(e.view('atk'));
      const have = V2.E.stock[k] || 0;
      if (have <= 0) break;
      const n = [12, 8, 6, 4, 2, 1].find(x => x <= have);
      const sead = (k === 'molot' || k === 'grach') && know.length;
      const kk = sead ? know[i % know.length] : null;
      const tgt = sead ? { aim: { x: kk.x, y: kk.y, uid: kk.uid } } : { obj: tg[i % Math.min(4, tg.length)].id };
      const delay = how === 'spam' ? 0 : [0, 1, 2, 4, 6][i % 5];
      const r = e.command('atk', 'launch', { plan: { k, n, delay, tgt, high: k === 'jalo' && i % 2 } });
      i++;
      if (!r.ok) break;
    }
  }
}

/** «разумный» штаб: днём стягивает мобильные средства к энергетике и докупает дешёвое ПВО */
function defenderDay(e, V, how) {
  if (how !== 'active') return;
  const en = V.G.objs.filter(o => ['power', 'sub', 'dam'].includes(o.type) && o.hp > 10).sort((a, b) => b.v - a.v);
  if (!en.length) return;
  const mob = V.G.units.filter(u => ['mog', 'manpad', 'icpt', 'spaag'].includes(u.k));
  mob.forEach((u, i) => {
    const o = en[i % en.length], a = i * 2.1;
    e.command('def', 'order', { id: u.id, o: { t: 'move', p: { x: o.x + 4 + Math.cos(a) * 2.5, y: o.y + Math.sin(a) * 3 } } });
  });
  for (const u of V.G.units) if (u.k === 'shield' || u.k === 'bastion') e.command('def', 'order', { id: u.id, o: { t: 'roe', v: 'eco' } });
  for (const u of V.G.units) if (u.am != null && u.rc > 0 && u.rc < 10) e.command('def', 'order', { id: u.id, o: { t: 'reload' } });
  let i = 0;
  for (let guard = 0; guard < 40; guard++) {
    const b = JSON.parse(e.view('def')).G.budget;
    const k = b > 70 ? 'krom' : b > 8 ? 'icpt' : b > 2 ? 'mog' : null;
    if (!k) break;
    const o = en[i++ % en.length], a = guard * 1.7;
    e.command('def', 'place', { k, x: o.x + 5 + Math.cos(a) * 3, y: o.y + Math.sin(a) * 3 });
  }
  for (const o of V.G.objs) if (o.hp < 75) e.command('def', 'repair', { id: o.id });
}

function defenderNight(e, V, how) {
  for (const q of V.G.reqs) e.command('def', 'ans', { id: q.id, i: q.def || 0 });
  if (how !== 'active') return;
  const vis = V.G.threats.filter(t => t.vis);
  if (vis.length > 4 && !V.G.alarm) e.command('def', 'alarm', {});
  if (!vis.length && V.G.alarm && Math.random() < .02) e.command('def', 'alarm', {});
}

function run(atk, def) {
  const e = createEngine('duel');
  if (process.env.NOLOG) e.eval(`for (const k in LAUNCH.nightCap) LAUNCH.nightCap[k] = 1e9;
    for (const w of ['night', 'day']) for (const c in LAUNCH.lead[w]) LAUNCH.lead[w][c] = w === 'night' ? 25 : 240;
    for (const k in LAUNCH.cycle) LAUNCH.cycle[k] = 1;`);
  const out = [];
  for (let g = 0; g < 200000; g++) {
    const V = { def: JSON.parse(e.view('def')), atk: JSON.parse(e.view('atk')) };
    const G = V.def.G;
    if (G.phase === 'prep') {
      attackerDay(e, V.atk, atk);
      defenderDay(e, V.def, def);
      for (const r of ['def', 'atk']) {
        let res = e.command(r, 'startNight', {});
        if (!res.ok && res.warned) res = e.command(r, 'startNight', { confirm: true });
      }
      e.command('def', 'speed', { v: 180 });
    } else if (G.phase === 'night') {
      defenderNight(e, V.def, def);
      e.eval('SPEED = 180');
      e.tick(250, { def: true, atk: true });
      e.drain();
    } else if (G.phase === 'debrief') {
      out.push(e.eval('JSON.stringify({ en: Math.round(energy()), dmg: Math.round(S.objDmg), civ: S.civ, launched: Object.values(S.launched).reduce((a,b)=>a+b,0), killed: Object.values(S.killed).reduce((a,b)=>a+b,0), hits: Object.values(S.hits).reduce((a,b)=>a+b,0) })'));
      if (G.over) break;
      for (const r of ['def', 'atk']) e.command(r, 'nextDay', {});
    } else break;
    e.drain();
  }
  return out.map(s => JSON.parse(s));
}

for (const a of ATK) for (const d of DEF) {
  const res = [];
  for (let i = 0; i < RUNS; i++) res.push(run(a, d));
  const fin = res.map(r => r[r.length - 1].en);
  const n1 = res.map(r => r[0]);
  const avg = f => Math.round(n1.reduce((s, x) => s + x[f], 0) / n1.length);
  console.log(`налёт ${a.padEnd(6)} · ПВО ${d.padEnd(7)} → энергия к концу: ${fin.join(', ')} (ночей ${res.map(r => r.length).join(',')}) · ночь 1: пуск ${avg('launched')}, сбито ${avg('killed')}, попаданий ${avg('hits')}, энергия ${avg('en')}%`);
}
