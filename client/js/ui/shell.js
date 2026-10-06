'use strict';
/* ============================================================
   ОБОЛОЧКА ИНТЕРФЕЙСА
   Скелет перерисовки, подписи верхней строки, строка связи.
   Содержимое панелей рисует активный режим (MODE.ui).
   ============================================================ */

function renderAll() {
  if (!G || !MODE) return;
  const ui = MODE.ui;
  ui.top();
  ui.speedButtons();
  if (tabsDirty) ui.tabs();
  ui.right();
  ui.left(G.tabL);
  ui.threatBar();
  renderBalBar();
  const zb = $('#btnZones');
  if (zb && zb.classList) zb.classList.toggle('on', G.showZones);
  const ab = $('#btnAim');
  if (ab && ab.classList) ab.classList.toggle('on', G.showAim !== false);
  const sb = $('#btnSpoil');
  if (sb && sb.classList) sb.classList.toggle('on', G.spoil);
  dirty = false;
}

/** подписи и кнопки верхней строки под активный режим */
function applyHud() {
  const h = MODE.hud, sm = SERVER_MODES[Game.mode];
  const duel = Game.humans.length > 1;
  document.title = h.title + (duel ? ' · дуэль' : '');
  const meta = document.querySelector('meta[name=description]');
  if (meta) meta.content = h.desc;
  $('#hdBrand').textContent = h.brand + (duel ? ' · ДУЭЛЬ' : '');
  $('#lblBud').textContent = h.labels.bud;
  $('#lblEn').textContent = h.labels.en;
  $('#lblCiv').textContent = h.labels.civ;
  $('#lblThr').textContent = h.labels.thr;
  $('#paceLabel').title = h.paceTitle;
  const z = $('#btnZones');
  z.textContent = h.zonesText; z.title = h.zonesTitle;
  $('#btnAlarm').hidden = !h.alarmBtn;
  $('#btnAim').hidden = !h.aimBtn;
  $('#btnSpoil').hidden = !h.spoilBtn || duel;
  $('#btnMode').textContent = 'Меню · ' + sm.title;
  netBar();
}

/** строка связи: код партии, моя сторона, соперник в сети или нет */
function netBar() {
  const el = $('#netbar');
  if (!el || !el.classList) return;
  if (!Game.room) { el.style.display = 'none'; return }
  const duel = Game.humans.length > 1;
  const other = Game.humans.find(r => r !== Game.role);
  const bits = [`Партия <b>${esc(Game.room)}</b> <span class="mu">v${GAME_VERSION}</span>`];
  if (Game.role === 'spec') bits.push('вы: <b>наблюдатель</b>');
  else if (duel) {
    bits.push(`вы: ${Game.role === 'def' ? 'штаб ПВО' : 'налёт'}`);
    bits.push(Game.seats[other] ? '<span class="good">соперник в сети</span>' : '<span class="bad">соперник не подключён</span>');
  }
  if (Game.role !== 'spec' && (Game.seats[Game.role] || 0) > 1) bits.push(`с вами за эту сторону ещё ${Game.seats[Game.role] - 1}`);
  if (Game.seats.spec) bits.push(`зрителей: ${Game.seats.spec}`);
  if (!Game.link) bits.push('<span class="bad">нет связи с сервером, переподключаемся…</span>');
  const inv = [];
  if (duel && Game.role !== 'spec') inv.push('<button class="btn sm" data-a="copyLink" data-v="other" title="Ссылка для соперника: он зайдёт за другую сторону">Соперник</button>');
  if (Game.role !== 'spec') inv.push('<button class="btn sm" data-a="copyLink" data-v="mate" title="Ссылка для напарника: он зайдёт за вашу сторону, и вы будете играть вдвоём">Напарник</button>');
  inv.push('<button class="btn sm" data-a="copyLink" data-v="spec" title="Ссылка для зрителей: видят всю партию, но ничего не могут">Зрители</button>');
  el.innerHTML = bits.join(' · ') + ' ' + inv.join(' ');
  el.style.display = 'block';
}
