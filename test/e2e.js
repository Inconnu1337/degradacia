'use strict';
/* ============================================================
   СКВОЗНОЙ ТЕСТ: настоящий сервер + два браузерных клиента (jsdom)
   Дуэль: ПВО создаёт партию, налёт входит по коду, оба готовы,
   ночь идёт, стороны отдают команды через интерфейс и Net.cmd.
   Проверяет, что в браузере не падает ни одной ошибки.
   Запуск: node test/e2e.js
   ============================================================ */
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createServer } = require('../server/index');

const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clockStr = t => { const m = Math.floor(t / 60) + 19 * 60; return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') };

/* заглушки браузерных API, которых нет в jsdom: canvas и Web Audio */
function fakeAudio(w) {
  const param = () => ({ value: 0, setValueAtTime() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { }, setTargetAtTime() { } });
  const node = () => new Proxy({ connect() { }, disconnect() { }, start() { }, stop() { } }, {
    get: (o, k) => k in o ? o[k] : (typeof k === 'string' && /^[a-z]+$/i.test(k) ? (o[k] = param()) : undefined)
  });
  w.AudioContext = class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = node() }
    resume() { }
    createBuffer(c, n) { const d = Array.from({ length: c }, () => new Float32Array(n)); return { getChannelData: i => d[i] } }
  };
  for (const m of ['createGain', 'createBiquadFilter', 'createOscillator', 'createBufferSource', 'createConvolver', 'createDynamicsCompressor', 'createStereoPanner'])
    w.AudioContext.prototype[m] = node;
}

async function client(port, hash, name) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(name + ': ' + (e.detail && e.detail.message || e.message)));
  vc.on('error', m => errors.push(name + ' console.error: ' + m));
  const dom = await JSDOM.fromURL(`http://127.0.0.1:${port}/${hash}`, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.__TEST__ = 1;
      fakeAudio(w);
      const ctx = { measureText: () => ({ width: 10 }), getLineDash: () => [], createImageData: () => ({ data: new Uint8ClampedArray(16) }) };
      w.HTMLCanvasElement.prototype.getContext = () => new Proxy(ctx, {
        get: (o, k) => k in o ? o[k] : (String(k).startsWith('create') ? () => ({ addColorStop() { } }) : () => { }),
        set: (o, k, v) => { o[k] = v; return true }
      });
      w.addEventListener('error', e => errors.push(name + ': ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
    }
  });
  const w = dom.window;
  const ev = (code) => w.eval(code);
  const click = sel => { const el = w.document.querySelector(sel); assert(el, name + ': нет ' + sel); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const cmd = (n, a) => ev(`Net.cmd(${JSON.stringify(n)}, ${JSON.stringify(a || {})})`);
  return { w, ev, click, cmd, dom };
}

async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (fn()) return } catch (e) { /* ещё не готово */ } await sleep(100) }
  throw new Error('не дождались: ' + what);
}

(async () => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  /* ПВО создаёт дуэль из меню */
  const A = await client(port, '', 'ПВО');
  await waitFor(() => A.w.document.querySelector('[data-a="create"][data-v="duel"][data-r="def"]'), 5000, 'меню');
  A.click('[data-a="create"][data-v="duel"][data-r="def"]');
  await waitFor(() => A.ev('G && G.units.length > 0'), 5000, 'снимок ПВО');
  const room = A.ev('Game.room');
  console.log('  ✔ партия создана:', room);

  /* налёт входит по ссылке */
  const B = await client(port, `#room=${room}`, 'Налёт');
  await waitFor(() => B.ev('G && Game.role === "atk" && E && E.stock'), 5000, 'снимок налёта');
  assert.strictEqual(B.ev('G.units.length'), 0, 'налёт не должен видеть расчёты');
  await waitFor(() => A.ev('Game.seats.atk === 1'), 3000, 'соперник в сети');
  console.log('  ✔ налёт вошёл по коду, туман войны на месте');

  /* справки: погода, звук */
  A.click('[data-a="wx"]');
  assert(A.ev('$("#modal").classList.contains("on") && $("#mbox").textContent.includes("Погода")'));
  A.click('#mbox [data-a="close"]');
  B.click('[data-a="sound"]');
  assert(B.ev('$("#mbox").textContent.includes("Звук")'));
  B.click('#mbox [data-a="close"]');
  console.log('  ✔ окна погоды и звука');

  /* сохранение днём → загрузка в новую партию → друг входит по новому коду */
  A.ev('window.__saved = null; downloadSave = (n, d) => { window.__saved = { n, d } }');
  assert((await A.cmd('save')).ok, 'сохранение');
  await waitFor(() => A.ev('window.__saved'), 3000, 'файл сохранения');
  const file = JSON.parse(A.ev('JSON.stringify(window.__saved.d)'));
  assert.strictEqual(file.game, 'night-raid');
  const C = await client(port, '', 'Загрузка');
  await waitFor(() => C.w.document.querySelector('[data-a="create"]'), 5000, 'меню');
  C.ev(`Net.send({ t: 'load', file: ${JSON.stringify(file)}, role: 'def' })`);
  await waitFor(() => C.ev('G && Game.room && Game.room !== ' + JSON.stringify(room)), 5000, 'загруженная партия');
  assert.strictEqual(C.ev('G.units.length'), A.ev('G.units.length'), 'расчёты не совпали после загрузки');
  assert.strictEqual(Math.round(C.ev('G.budget')), Math.round(A.ev('G.budget')), 'бюджет не совпал');
  const D = await client(port, '#room=' + C.ev('Game.room'), 'Друг');
  await waitFor(() => D.ev('G && Game.role === "atk"'), 5000, 'друг в загруженной партии');
  C.dom.window.close(); D.dom.window.close();
  console.log('  ✔ сохранение → загрузка → друг вошёл по коду');

  /* ложная активность налёта: разведка ПВО увидит подготовку, пусков не будет */
  const fe = await B.cmd('feint', { kind: 'bomb', delay: 0 });
  assert(fe.ok, 'ложная активность: ' + fe.error);
  assert(!(await B.cmd('feint', { kind: 'bomb', delay: 0 })).ok, 'лимит ложной активности');

  /* день: ПВО ставит вертолёт в патруль над ТЭЦ, налёт планирует FPV и «Шершни» */
  const heli = A.ev('(G.units.find(u => u.k === "heli") || {}).id');
  const obj = A.ev('G.objs.find(o => o.type === "power").id');
  if (heli) assert((await A.cmd('order', { id: heli, o: { t: 'patrol', obj } })).ok, 'патруль');
  const near = B.ev('JSON.stringify(Object.values(E.know).sort((a, b) => a.x - b.x).pop())');
  const k = near ? JSON.parse(near) : null;
  const fpv = await B.cmd('launch', { plan: { k: 'fpv', n: 4, zid: 'frc', delay: 0, wps: [], tgt: k ? { aim: { x: k.x, y: k.y, uid: k.uid } } : { aim: { x: 390, y: 165 } } } });
  console.log('  · FPV:', fpv.ok ? 'в плане' : fpv.error);
  const sh = await B.cmd('launch', { plan: { k: 'shershen', n: 2, zid: 'belsk', delay: 0, wps: [], tgt: { obj } } });
  assert(sh.ok, 'шершни: ' + sh.error);
  B.click('[data-a="startNight"]');
  await waitFor(() => B.ev('G.ready.atk === "start"'), 3000, 'готовность налёта');
  A.click('[data-a="startNight"]');
  await sleep(400);
  if (A.ev('$("#modal").classList.contains("on")')) A.click('#mbox [data-a="startNight2"]');
  await waitFor(() => A.ev('G.phase === "night"') && B.ev('G.phase === "night"'), 5000, 'ночь');
  console.log('  ✔ оба готовы — ночь началась');

  /* время: ускорение одной стороной, пауза с лимитом */
  assert((await A.cmd('speed', { v: 180 })).ok);
  const tooFast = await B.cmd('speed', { v: 60 });
  assert((await B.cmd('speed', { v: 0 })).ok === false || tooFast.ok, 'кулдаун должен действовать на сторону');
  await sleep(3200);
  const p = await B.cmd('speed', { v: 0 });
  assert(p.ok, 'пауза налёта: ' + p.error);
  const un = await A.cmd('speed', { v: 180 });
  assert(!un.ok, 'чужую паузу нельзя снять сразу');
  await sleep(8200);
  assert((await A.cmd('speed', { v: 180 })).ok, 'после удержания паузу можно снять');
  console.log('  ✔ скорость: кулдаун, лимит, удержание чужой паузы');

  /* ночь идёт: ПВО отвечает на запросы, налёт перенацеливает «Шершней» */
  let retargeted = false;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    for (const r of JSON.parse(A.ev('JSON.stringify(G.reqs.map(r => ({ id: r.id, i: r.def || 0 })))'))) await A.cmd('ans', r);
    if (!retargeted && B.ev('E.groups.some(g => g.kind === "shershen" && g.alive > 0)')) {
      const gid = B.ev('E.groups.find(g => g.kind === "shershen").id');
      const o2 = B.ev('G.objs.filter(o => o.hp > 0).pop().id');
      const r = await B.cmd('retarget', { id: gid, tgt: { obj: o2 } });
      assert(r.ok, 'перенацеливание: ' + r.error);
      const again = await B.cmd('retarget', { id: gid, tgt: { obj: o2 } });
      assert(!again.ok, 'второй сеанс связи сразу — нельзя');
      retargeted = true;
    }
    A.ev('renderAll()'); B.ev('renderAll()');
  }
  console.log('  ✔ ночь идёт, перенацеливание:', retargeted ? 'да' : 'пакет ещё не в воздухе');
  assert(/Кондор/.test(A.ev('$("#lc_intel").textContent')), 'разведка ПВО не увидела «Кондоры»');
  console.log('  ✔ разведка ПВО видит взлёт «Кондоров» (ложная активность)');
  /* пожары и бригады: поджечь объект и послать пожарных */
  const burnId = A.ev('G.objs[0].id');
  await A.cmd('speed', { v: 0 });
  /* поджигаем через сервер нельзя — проверяем на объекте, который уже горит, если такой есть */
  const burning = A.ev('(G.objs.find(o => o.fire > 0) || {}).id');
  if (burning) { const r = await A.cmd('extinguish', { id: burning }); console.log('  · пожарные:', r.ok ? 'выехали' : r.error) }
  const dmgU = A.ev('(G.units.find(u => u.hp < UT[u.k].hp) || {}).id');
  if (dmgU) { const r = await A.cmd('fixu', { id: dmgU }); console.log('  · ремонт под огнём:', r.ok ? 'выехали' : r.error) }
  void burnId;
  assert(A.ev('$("#lc_radio").childElementCount') > 3, 'эфир ПВО пуст');
  assert(B.ev('$("#lc_radio").childElementCount') > 1, 'журнал налёта пуст');
  for (const t of JSON.parse(A.ev('JSON.stringify(G.threats)'))) if (t.idLv < 2) assert.strictEqual(t.k, null, 'тип цели утёк');

  /* второй игрок за ПВО и наблюдатель */
  const A2 = await client(port, `#room=${room}&side=def`, 'ПВО-2');
  await waitFor(() => A2.ev('G && Game.role === "def" && G.units.length > 0'), 5000, 'второй игрок ПВО');
  const radar = A2.ev('(G.units.find(u => u.k === "krom") || {}).id');
  assert((await A2.cmd('order', { id: radar, o: { t: 'radar', v: 'on' } })).ok, 'приказ второго игрока ПВО');
  await waitFor(() => A.ev('Game.seats.def === 2'), 3000, 'двое за ПВО');
  const W = await client(port, `#room=${room}&side=spec`, 'Зритель');
  await waitFor(() => W.ev('G && Game.role === "spec" && G.units.length > 0 && E && E.groups'), 5000, 'наблюдатель');
  assert(!(await W.cmd('speed', { v: 60 })).ok, 'наблюдатель не должен управлять временем');
  assert(!(await W.cmd('order', { id: radar, o: { t: 'radar', v: 'off' } })).ok, 'наблюдатель не должен приказывать');
  assert(W.ev('G.threats.every(t => t.k && t.idLv === 2)'), 'наблюдатель видит цели без тумана');
  W.ev('renderAll()'); A2.ev('renderAll()');
  console.log('  ✔ двое за ПВО, наблюдатель видит всё и ничего не может');

  /* сохранение ночью → загрузка: та же ночь, цели в воздухе, пауза */
  A.ev('window.__saved = null; downloadSave = (n, d) => { window.__saved = { n, d } }');
  const tNight = A.ev('G.t'), thrNight = A.ev('G.threats.length');
  assert((await A.cmd('save')).ok, 'сохранение ночью');
  await waitFor(() => A.ev('window.__saved'), 3000, 'файл ночного сохранения');
  const nf = JSON.parse(A.ev('JSON.stringify(window.__saved.d)'));
  const N = await client(port, '', 'Загрузка ночи');
  await waitFor(() => N.w.document.querySelector('[data-a="create"]'), 5000, 'меню');
  N.ev(`Net.send({ t: 'load', file: ${JSON.stringify(nf)}, role: 'def' })`);
  await waitFor(() => N.ev('G && G.phase === "night" && Game.room !== ' + JSON.stringify(room)), 5000, 'загруженная ночь');
  assert(Math.abs(N.ev('G.t') - tNight) < 120, 'время ночи не совпало');
  assert.strictEqual(N.ev('G.chosen'), 0, 'ночная партия должна открываться на паузе');
  console.log(`  ✔ сохранение ночью → загрузка: ${clockStr(N.ev('G.t'))}, целей ${N.ev('G.threats.length')} (было ${thrNight}), пауза`);
  N.dom.window.close(); W.dom.window.close(); A2.dom.window.close();

  A.dom.window.close(); B.dom.window.close();
  server.close();
  if (errors.length) { console.error('Ошибки в браузере:\n' + [...new Set(errors)].join('\n')); process.exit(1) }
  console.log('  ✔ ошибок в браузере нет');
  process.exit(0);
})().catch(e => { console.error('✖', e.message); if (errors.length) console.error([...new Set(errors)].join('\n')); process.exit(1) });
