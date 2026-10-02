'use strict';
/* ============================================================
   ЖУРНАЛЫ ЭФИРА
   Строки приходят с сервера событием log (уже готовая разметка):
   эфир и доклады, разведка, «мысли» противника.
   ============================================================ */

const LOG_BOX = { radio: '#lc_radio', intel: '#lc_intel', mind: '#lc_mind' };

function clearLogs() { for (const id of ['lc_radio', 'lc_intel', 'lc_mind']) { const e = $('#' + id); if (e) e.innerHTML = '' } }

function addLine(box, html, cls) {
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'ln ' + (cls || '');
  el.innerHTML = html;
  box.prepend(el);
  while (box.childElementCount > 280) box.lastChild.remove();
}

/** строка журнала от сервера; quiet — при восстановлении истории не считаем непрочитанным */
function logEvent(ev, quiet) {
  addLine($(LOG_BOX[ev.box]), ev.html, ev.cls);
  if (quiet || !G || ev.box === 'mind') return;
  if (G.tabL !== ev.box) { G.unread[ev.box] = (G.unread[ev.box] || 0) + 1; tabsDirty = true }
}
