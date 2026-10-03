'use strict';
/* ============================================================
   ЖУРНАЛЫ ЭФИРА
   Строки приходят с сервера событием log (уже готовая разметка):
   эфир и доклады, разведка, «мысли» противника.
   ============================================================ */

const LOG_BOX = { radio: '#lc_radio', intel: '#lc_intel', mind: '#lc_mind' };

function clearLogs() { for (const id of ['lc_radio', 'lc_intel', 'lc_mind']) { const e = $('#' + id); if (e) e.innerHTML = '' } }

/* квадрат карты в тексте: «12-08» (две цифры, дефис, две цифры) */
const SQ_RE = /\b(\d{2})-(\d{2})\b/g;

/** делает квадраты в строке журнала ссылками: клик — карта на этот квадрат */
function linkSquares(el) {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walk.nextNode()) if (SQ_RE.test(walk.currentNode.nodeValue)) nodes.push(walk.currentNode);
  for (const n of nodes) {
    SQ_RE.lastIndex = 0;
    const frag = document.createDocumentFragment(), t = n.nodeValue;
    let last = 0, m;
    while ((m = SQ_RE.exec(t))) {
      if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
      const a = document.createElement('span');
      a.className = 'sqlink'; a.dataset.a = 'gosq'; a.dataset.v = m[0]; a.title = 'Показать квадрат ' + m[0] + ' на карте';
      a.textContent = m[0];
      frag.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
    n.parentNode.replaceChild(frag, n);
  }
  SQ_RE.lastIndex = 0;
}

/** центр квадрата «XX-YY» в координатах карты */
function sqCenter(v) {
  const m = /^(\d{2})-(\d{2})$/.exec(v || '');
  return m ? { x: (+m[1] - .5) * GRID, y: (+m[2] - .5) * GRID } : null;
}

function addLine(box, html, cls) {
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'ln ' + (cls || '');
  el.innerHTML = html;
  linkSquares(el);
  box.prepend(el);
  while (box.childElementCount > 280) box.lastChild.remove();
}

/** строка журнала от сервера; quiet — при восстановлении истории не считаем непрочитанным */
function logEvent(ev, quiet) {
  addLine($(LOG_BOX[ev.box]), ev.html, ev.cls);
  if (quiet || !G || ev.box === 'mind') return;
  if (G.tabL !== ev.box) { G.unread[ev.box] = (G.unread[ev.box] || 0) + 1; tabsDirty = true }
}
