'use strict';
/* ============================================================
   ВВОД: мышь, касания, клавиатура, общие кнопки интерфейса
   Всё, что зависит от режима, делегируется: MODE.input (карта, подсказки, ПКМ) и MODE.ui.onAction.
   Вид карты, выбор, вкладки — местные. Всё, что меняет игру, — команда серверу.
   ============================================================ */

let drag = null, pinch = null;

function centerOn(p, zoom) {
  G.view.x = p.x; G.view.y = p.y;
  if (zoom) G.view.s = clamp(zoom, .8, 30);
}

const cpos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } };

function initInput() {
  cv.addEventListener('mousedown', e => {
    if (e.button === 2 || !G) return;
    drag = { p: cpos(e), v: { ...G.view }, moved: 0 };
  });
  window.addEventListener('mouseup', e => {
    if (!drag || !G) return;
    const d = drag; drag = null;
    if (!d.moved && e.target === cv) MODE.input.mapClick(cpos(e));
  });
  cv.addEventListener('mousemove', e => {
    if (!G) return;
    const sp = cpos(e);
    if (drag) {
      const dx = sp.x - drag.p.x, dy = sp.y - drag.p.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = 1;
      if (drag.moved) { G.view.x = drag.v.x - dx / G.view.s; G.view.y = drag.v.y - dy / G.view.s }
      return;
    }
    /* подсказка под курсором */
    const hit = MODE.input.pickAt(sp);
    if (!hit) { hideTip(); cv.style.cursor = G.mode ? 'crosshair' : 'default'; return }
    cv.style.cursor = 'pointer';
    const t = MODE.input.tooltip(hit);
    if (t) showTip(e.clientX, e.clientY, t); else hideTip();
  });
  cv.addEventListener('mouseleave', hideTip);
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (!G) return;
    const sp = cpos(e), before = s2w(sp);
    G.view.s = clamp(G.view.s * (e.deltaY < 0 ? 1.16 : .862), .8, 30);
    const after = s2w(sp);
    G.view.x += before.x - after.x;
    G.view.y += before.y - after.y;
  }, { passive: false });
  cv.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!G) return;
    if (MODE.input.onContextMenu(e)) return;
    if (G.mode) { G.mode = null; hint(''); uiDirty() }
    else { G.sel = null; uiDirty() }
  });

  /* касания */
  cv.addEventListener('touchstart', e => {
    if (!G) return;
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s: G.view.s };
      drag = null;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      drag = { p: cpos(t), v: { ...G.view }, moved: 0, touch: 1 };
    }
  }, { passive: true });
  cv.addEventListener('touchmove', e => {
    if (pinch && e.touches.length === 2) {
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      G.view.s = clamp(pinch.s * d / pinch.d, .8, 30);
      e.preventDefault(); return;
    }
    if (drag && e.touches.length === 1) {
      const sp = cpos(e.touches[0]);
      const dx = sp.x - drag.p.x, dy = sp.y - drag.p.y;
      if (Math.hypot(dx, dy) > 6) drag.moved = 1;
      if (drag.moved) { G.view.x = drag.v.x - dx / G.view.s; G.view.y = drag.v.y - dy / G.view.s; e.preventDefault() }
    }
  }, { passive: false });
  cv.addEventListener('touchend', e => {
    if (pinch && e.touches.length < 2) pinch = null;
    if (drag && drag.touch) { if (!drag.moved) MODE.input.mapClick(drag.p); drag = null }
  }, { passive: true });

  /* клавиатура */
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || !G || !MODE || $('#menu').classList.contains('on')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); if (G.phase === 'night') setSpeed(G.chosen ? 0 : 15) }
    else if (k === 'escape') {
      if ($('#modal').classList.contains('on') && G.phase !== 'debrief' && G.phase !== 'final') hideModal();
      else if (G.mode) { G.mode = null; hint('') }
      else G.sel = null;
      uiDirty();
    }
    else if (k === 'enter' && MODE.input.sendPatrol && MODE.input.sendPatrol()) { /* маршрут патруля отдан */ }
    else if (k === 'z') { G.showZones = !G.showZones; uiDirty() }
    else if (k === 'a') { if (MODE.hud.alarmBtn) cmd('alarm') }
    else if (k === 'h' || k === 'f1') { e.preventDefault(); MODE.ui.help() }
    else if (k === 'r') { G.showRoutes = !G.showRoutes }
    else if (['1', '2', '3', '4', '5'].includes(k)) setSpeed(SPEEDS[+k - 1] ?? 15);
    else if (k === 'arrowleft') G.view.x -= 30 / G.view.s * 2;
    else if (k === 'arrowright') G.view.x += 30 / G.view.s * 2;
    else if (k === 'arrowup') G.view.y -= 30 / G.view.s * 2;
    else if (k === 'arrowdown') G.view.y += 30 / G.view.s * 2;
  });

  /* делегирование кликов по интерфейсу */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el || !G || !MODE) return;
    const a = el.dataset.a, v = el.dataset.v, id = el.dataset.id;
    const selU = () => G.sel && G.sel.type === 'u' ? unitById(G.sel.id) : null;
    switch (a) {
      case 'spd': setSpeed(+v); break;
      case 'tabL': G.tabL = v; G.unread[v] = 0; tabsDirty = true; uiDirty(); break;
      case 'tabR': G.tabR = v; tabsDirty = true; lastRC = ''; uiDirty(); break;
      case 'gosq': {
        /* квадрат из журнала: карта на него, с подсветкой */
        const c = sqCenter(v);
        if (c) { centerOn(c, Math.max(G.view.s, 6)); G.sqFlash = { x: c.x, y: c.y, t: ANIM } }
        break;
      }
      case 'selu': {
        const u = unitById(+id);
        if (u) { G.sel = { type: 'u', id: u.id }; if (el.dataset.c) centerOn(u, Math.max(G.view.s, 7)); G.tabR = 'ord'; tabsDirty = true; lastRC = ''; uiDirty() }
        break;
      }
      case 'selo': {
        const o = objById(id);
        if (o) { G.sel = { type: 'o', id: o.id }; if (el.dataset.c) centerOn(o, Math.max(G.view.s, 6)); G.tabR = 'ord'; tabsDirty = true; lastRC = ''; uiDirty() }
        break;
      }
      case 'selt': {
        const th = thrById(+id);
        if (th) { G.sel = { type: 't', id: th.id }; centerOn(th, Math.max(G.view.s, 5)); G.tabR = 'ord'; tabsDirty = true; lastRC = ''; uiDirty() }
        break;
      }
      case 'zones': G.showZones = !G.showZones; uiDirty(); break;
      case 'help': MODE.ui.help(); break;
      case 'close': hideModal(); break;
      case 'startNight': cmd('startNight'); break;
      case 'startNight2': hideModal(); cmd('startNight', { confirm: true }); break;
      case 'unready': cmd('unready'); break;
      case 'nextDay': hideModal(); cmd('nextDay'); lastRC = ''; break;
      case 'final': cmd('final'); break;
      case 'restart': hideModal(); cmd('restart'); lastRC = ''; break;
      case 'reopen': cmd('reopen'); break;
      case 'wx': weatherModal(); break;
      case 'col': {
        const pn = $('#' + v);
        pn.classList.toggle('col');
        el.textContent = pn.classList.contains('col') ? (v === 'left' ? '›' : '‹') : (v === 'left' ? '‹' : '›');
        break;
      }
    }
  });

  $('#autoPace').addEventListener('change', e => cmd('autoPace', { v: e.target.checked }));

  /* действия, специфичные для режима. Слушатель стоит после общего: порядок обработки сохранён */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el || !G || !MODE || !MODE.ui.onAction) return;
    MODE.ui.onAction(el.dataset.a, el, e);
  });
}

function showTip(x, y, html) {
  const t = $('#tip');
  t.innerHTML = html;
  t.style.display = 'block';
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = Math.min(x + 14, window.innerWidth - w - 8) + 'px';
  t.style.top = Math.min(y + 14, window.innerHeight - h - 8) + 'px';
}

function hideTip() { $('#tip').style.display = 'none' }
