'use strict';
/* ============================================================
   ЛОББИ: выбор режима, создание партии, вход по коду
   Партия всегда живёт на сервере; адрес #room=КОД&side=def|atk
   позволяет перезагрузить страницу или позвать соперника ссылкой.
   ============================================================ */

function menuHTML() {
  const card = (id, buttons) => {
    const m = SERVER_MODES[id];
    return `<div class="mcard">
      <div class="mkick">${esc(m.kicker)}</div>
      <h2>${esc(m.title)}</h2>
      <div class="mname">${esc(m.brand)}</div>
      <p>${esc(m.lead)}</p>
      <ul>${m.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      <div class="acts">${buttons}</div>
    </div>`;
  };
  const cards = card('defense', '<button class="btn pri" data-a="create" data-v="defense">Играть</button>')
    + card('attack', '<button class="btn pri" data-a="create" data-v="attack">Играть</button>')
    + card('duel', `<button class="btn pri" data-a="create" data-v="duel" data-r="def">За штаб ПВО</button>
      <button class="btn pri" data-a="create" data-v="duel" data-r="atk">За налёт</button>`);
  return `
    <div class="mbox">
      <h1>НОЧНОЙ РУБЕЖ</h1>
      <div class="msub">${esc(LORE.region)}, республика ${esc(LORE.country)} · пять ночей воздушной войны</div>
      <div class="mgrid">${cards}</div>
      <div class="mjoin">
        <span>Есть код партии?</span>
        <input id="joinCode" maxlength="4" placeholder="ABCD" autocomplete="off" spellcheck="false">
        <button class="btn" data-a="joinCode">Войти</button>
      </div>
      <div class="mfoot">
        ${Game.room ? `<button class="btn" data-a="resumeGame">← Вернуться в партию ${esc(Game.room)}</button>` : ''}
        <span class="mu">Новая партия начинает кампанию заново. Код партии виден в строке под верхней панелью.</span>
      </div>
    </div>`;
}

function showMenu() {
  hideModal();
  $('#menu').innerHTML = menuHTML();
  $('#menu').classList.add('on');
}
function hideMenu() { $('#menu').classList.remove('on') }

/* ---------- адрес партии ---------- */
function readHash() {
  const h = location.hash.replace('#', '');
  const q = new URLSearchParams(h.includes('=') ? h : '');
  return { room: q.get('room'), side: q.get('side'), legacy: SERVER_MODES[h] ? h : null };
}

function writeHash() {
  try { history.replaceState(null, '', `#room=${Game.room}&side=${Game.role}`) } catch (e) { /* file:// и т. п. */ }
}

function inviteLink() {
  const other = Game.humans.find(r => r !== Game.role);
  return `${location.origin}${location.pathname}#room=${Game.room}${other ? '&side=' + other : ''}`;
}

/* ---------- вход в партию ---------- */
function createGame(mode, role) { Net.send({ t: 'create', mode, role: role || SERVER_MODES[mode].role }) }

function joinGame(room, role) { Net.send({ t: 'join', room: String(room).toUpperCase(), role: role || undefined }) }

/** сервер подтвердил вход: интерфейс стороны, журналы, открытое окно */
function enterGame(m) {
  activateMode(MODE_OF_ROLE[m.role]);
  hideMenu(); hideModal(); hint('');
  lastRC = ''; lastTB = ''; lastSB = ''; tabsDirty = true;
  clearLogs();
  for (const box of ['radio', 'intel', 'mind']) for (const ev of m.logs[box] || []) logEvent(ev, true);
  applyHud();
  writeHash();
  pendingEnter = m;
}

/** первый снимок пришёл: стартовый вид и справка */
let pendingEnter = null;
function onFirstSnap() {
  const m = pendingEnter;
  pendingEnter = null;
  G.view = { x: 225, y: 168, s: Math.max(1.6, Math.min(CW / 470, CH / 340)) };
  MODE.onEnter();
  if (m.modal) showModal(m.modal);
  else if (G.night === 1 && G.phase === 'prep') MODE.ui.help();
  renderAll();
}

function initMenu() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const a = el.dataset.a;
    if (a === 'create') createGame(el.dataset.v, el.dataset.r);
    else if (a === 'joinCode') {
      const c = ($('#joinCode').value || '').trim();
      if (c.length === 4) joinGame(c); else toast('Код партии — четыре буквы', 'i');
    }
    else if (a === 'menu') showMenu();
    else if (a === 'resumeGame') hideMenu();
    else if (a === 'copyLink') {
      const link = inviteLink();
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
        .then(() => toast('Ссылка для соперника скопирована', 'i'), () => prompt('Ссылка для соперника:', link));
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'joinCode') $('[data-a="joinCode"]').click();
  });
}
