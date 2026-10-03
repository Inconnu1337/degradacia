'use strict';
/* ============================================================
   СОСТОЯНИЕ КЛИЕНТА
   G/E/S — последний снимок обстановки от сервера (глазами своей
   стороны) плюс локальные поля интерфейса, которые сервер не знает:
     sel, mode, view, showZones, showRoutes, tabL, tabR, unread, fx,
     spoil, plan (черновик удара в налёте).
   Между снимками (10 в секунду) позиции целей, ракет и расчётов
   плавно интерполируются, чтобы карта не дёргалась на ×180.
   ============================================================ */

let G = null, E = null, S = null;

/** партия: код, режим сервера, моя сторона, кто подключён */
const Game = { room: null, mode: null, role: null, humans: [], seats: {}, link: false };

const LOCAL_KEYS = ['sqFlash', 'sel', 'mode', 'view', 'showZones', 'showRoutes', 'tabL', 'tabR', 'unread', 'fx', 'spoil', 'plan'];

const Store = (() => {
  let snapAt = 0, snapGap = 100;

  function freshLocal() {
    return {
      sel: null, mode: null, view: { x: 225, y: 168, s: 2.2 }, showZones: false, showRoutes: true,
      tabL: 'radio', tabR: null, unread: { radio: 0, intel: 0 }, fx: [], spoil: false, plan: null
    };
  }

  /* ---------- интерполяция ---------- */
  function keyed(arr) { const m = new Map(); for (const o of arr || []) m.set(o.id, o); return m }

  function prepareLerp(oldList, newList) {
    const old = keyed(oldList);
    for (const o of newList) {
      const p = old.get(o.id);
      o._tx = o.x; o._ty = o.y;
      if (p && Math.hypot(p.x - o.x, p.y - o.y) < 60) { o._fx = p.x; o._fy = p.y } else { o._fx = o.x; o._fy = o.y }
    }
  }

  /** позиции на текущий кадр */
  function interpolate(now) {
    if (!G) return;
    const k = clamp((now - snapAt) / snapGap, 0, 1);
    for (const list of [G.threats, G.miss, G.units]) for (const o of list) {
      if (o._tx === undefined) continue;
      o.x = o._fx + (o._tx - o._fx) * k;
      o.y = o._fy + (o._ty - o._fy) * k;
    }
  }

  function applySnap(v) {
    const now = performance.now();
    if (snapAt) snapGap = clamp(now - snapAt, 50, 250);
    snapAt = now;
    const local = {};
    if (G) for (const k of LOCAL_KEYS) local[k] = G[k];
    const prevPhase = G && G.phase, prevReqs = G ? G.reqs.length : 0, prevAlarm = G && G.alarm;
    const old = G;
    G = Object.assign(v.G, G ? local : freshLocal());
    E = v.E; S = v.S;
    if (old) { prepareLerp(old.threats, G.threats); prepareLerp(old.miss, G.miss); prepareLerp(old.units, G.units) }
    /* ссылки, которые сервер передаёт идентификаторами */
    for (const r of G.reqs) r.u = unitById(r.uid);
    G.reqs = G.reqs.filter(r => r.u);
    if (G.plan && G.plan.tgt && G.plan.tgt.obj) G.plan.tgt.obj = objById(G.plan.tgt.obj.id) || G.plan.tgt.obj;
    if (G.sel && G.sel.type === 'u' && !unitById(G.sel.id)) G.sel = null;
    if (G.mode && G.mode.id != null && !unitById(G.mode.id)) { G.mode = null; hint('') }
    /* новый запрос расчёта — открыть вкладку приказов */
    if (G.reqs.length > prevReqs && MODE && MODE.id === 'defense') { G.tabR = 'ord'; tabsDirty = true }
    if (prevPhase !== G.phase) { tabsDirty = true; lastRC = ''; if (G.phase !== 'prep' && G.phase !== 'night') { G.mode = null; hint('') } }
    $('#autoPace').checked = !!G.auto;
    if (old && G.alarm && !prevAlarm && Game.role === 'def') Sound.siren();
    if (pendingEnter) onFirstSnap();
    uiDirty();
  }

  /* ---------- события ---------- */
  function applyEvent(ev) {
    if (ev.e === 'log') { logEvent(ev); Sound.onLog(ev) }
    else if (ev.e === 'toast') toast(ev.t, ev.c);
    else if (ev.e === 'fx') { if (G) { fx(ev.o); Sound.onFx(ev.o); if (ev.o.k === 'boom') shakeFrom(ev.o) } }
    else if (ev.e === 'modal') { if (ev.html) showModal(ev.html); else hideModal() }
    else if (ev.e === 'clear') clearLogs();
  }

  function onMessage(m) {
    switch (m.t) {
      case 'joined':
        Game.room = m.room; Game.mode = m.mode; Game.role = m.role; Game.humans = m.humans; Game.seats = m.seats;
        G = null; E = null; S = null;
        enterGame(m);
        break;
      case 'snap':
        if (Game.room) applySnap(m.v);
        break;
      case 'ev':
        for (const ev of m.list) applyEvent(ev);
        break;
      case 'seats':
        Game.seats = m.seats;
        if (m.note) toast(m.note, 'i');
        netBar();
        break;
      case 'save': downloadSave(m.name, m.data); break;
      case 'error':
        toast(m.msg, 'i');
        if (!Game.room) showMenu();
        break;
    }
  }

  function setLink(on) { Game.link = on; netBar() }

  return { onMessage, applyEvent, interpolate, setLink, freshLocal };
})();

const unitById = id => G.units.find(u => u.id === id);

const objById = id => G.objs.find(o => o.id === id);

const thrById = id => G.threats.find(t => t.id === id);
