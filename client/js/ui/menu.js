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
        <span>Сохранение:</span>
        <label class="btn">Загрузить файл…<input type="file" id="loadFile" accept=".json,application/json" hidden></label>
      </div>
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

/* ---------- сохранение и загрузка ---------- */
/** файл от сервера → скачивание на компьютер */
function downloadSave(name, data) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Партия сохранена: ' + name, 'i');
}

function saveGame() {
  if (!G || G.phase !== 'prep') { toast('Сохранять можно днём, в фазе подготовки', 'i'); return }
  cmd('save').then(r => { if (!r.ok) toast(r.error || 'Не удалось сохранить', 'i') });
}

function loadSaveFile(file) {
  if (!file) return;
  if (file.size > 7e6) { toast('Файл слишком большой', 'i'); return }
  const rd = new FileReader();
  rd.onload = () => {
    let f;
    try { f = JSON.parse(rd.result) } catch (e) { toast('Файл повреждён', 'i'); return }
    if (!f || f.game !== 'night-raid') { toast('Это не сохранение «Ночного рубежа»', 'i'); return }
    Net.send({ t: 'load', file: f, role: f.role });
    toast('Загружаем партию…', 'i');
  };
  rd.readAsText(file);
}

document.addEventListener('change', e => { if (e.target && e.target.id === 'loadFile') loadSaveFile(e.target.files[0]) });
document.addEventListener('click', e => { const el = e.target.closest('[data-a="saveGame"]'); if (el) saveGame() });
