'use strict';
/* ============================================================
   ТОЧКА ВХОДА И ЦИКЛ ОТРИСОВКИ (клиент)
   Симуляции здесь нет: обстановку присылает сервер (store.js),
   клиент только рисует её и отправляет команды.
   ============================================================ */

let lastTs = 0;

function loop(ts) {
  const dtms = Math.min(ts - lastTs, 120);
  lastTs = ts;
  if (G && MODE) {
    Store.interpolate(performance.now());
    draw(dtms);
    Sound.update();
    uiTimer += dtms;
    if ((dirty && uiTimer > 90) || uiTimer > 320) { uiTimer = 0; renderAll() }
  }
  requestAnimationFrame(loop);
}

/** связь есть: вернуться в свою партию или открыть то, что в адресе */
function onConnected() {
  if (Game.room) return joinGame(Game.room, Game.role);
  const h = readHash();
  if (h.room) joinGame(h.room, h.side);
  else if (h.legacy) createGame(h.legacy);
  else showMenu();
}

function boot() {
  initCanvas();
  buildWorld();
  if (!window.__TEST__) renderTerrain();  /* в тестах (jsdom) рельеф не рисуем: долго и не нужно */
  initInput();
  initMenu();
  Sound.init();
  requestAnimationFrame(ts => { lastTs = ts; loop(ts) });
  Net.connect(onConnected);
}

window.addEventListener('error', e => {
  const b = document.createElement('div');
  b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;background:#4a0f18;color:#fff;padding:8px 12px;border:1px solid #ff5b47;border-radius:6px;font:12px monospace;max-width:70vw';
  b.textContent = 'Ошибка: ' + e.message + ' (' + (e.filename || '').split('/').pop() + ':' + e.lineno + ')';
  document.body.appendChild(b);
});
document.addEventListener('DOMContentLoaded', boot);
