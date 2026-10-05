'use strict';
/* ============================================================
   ОБЩИЕ ЭЛЕМЕНТЫ ИНТЕРФЕЙСА
   Состояние перерисовки, всплывашки, модалки, управление временем,
   мелкие хелперы разметки.
   ============================================================ */

let dirty = true, tabsDirty = true, uiTimer = 0, lastRC = '', lastTB = '', lastSB = '';

function uiDirty() { dirty = true }

/* ---------- всплывашки ---------- */
function toast(t, c) {
  const el = document.createElement('div');
  if (c) el.className = c;
  el.textContent = t;
  $('#toast').prepend(el);
  while ($('#toast').childElementCount > 3) $('#toast').lastChild.remove();
  setTimeout(() => el.remove(), c ? 3600 : 5600);
}

function hint(t) {
  const h = $('#hintbar');
  h.textContent = t || '';
  h.style.display = t ? 'block' : 'none';
}

function showModal(html) { $('#mbox').innerHTML = html; $('#modal').classList.add('on') }

function hideModal() { $('#modal').classList.remove('on') }

const modalOpen = () => $('#modal').classList.contains('on');

/* ---------- панели: не перерисовывать под нажатой кнопкой ----------
   Панели собираются заново, когда меняется содержимое (на ×60 и ×180 —
   почти каждый кадр). Если пересобрать панель между нажатием и
   отпусканием кнопки, браузер клик не засчитает. Поэтому пока кнопка
   мыши (палец) зажата внутри панели, панель стоит; после отпускания —
   обновится на следующем кадре. */
let PRESS = null;
document.addEventListener('pointerdown', e => {
  PRESS = e.target.closest && e.target.closest('#rc, #lc_obj, #lc_intel, #threatbar, #speedBox, #tabsL, #tabsR');
}, true);
const releasePress = () => setTimeout(() => { PRESS = null }, 0);   /* после click */
document.addEventListener('pointerup', releasePress, true);
document.addEventListener('pointercancel', releasePress, true);

/** записать разметку в панель, если её сейчас не нажимают; false — отложено */
function paint(el, h) {
  if (!el) return false;
  if (el.__h === h) return true;
  if (PRESS && (PRESS === el || el.contains(PRESS))) return false;
  el.innerHTML = h; el.__h = h;
  return true;
}

/* ---------- время ---------- */
/** просьба сменить скорость; сервер может отказать (лимиты сетевой игры) */
function setSpeed(s) {
  if (!G || G.phase !== 'night' || !SPEEDS.includes(s)) return;
  cmd('speed', { v: s });
}

const SIDE_SHORT = { def: 'ПВО', atk: 'налёт' };

/** готова ли моя сторона к общему шагу (в дуэли ждём второго) */
const myReady = () => G && G.ready && G.ready[Game.role];

/**
 * кнопки верхней строки: скорость ночью, «начать» днём, ожидание соперника.
 * startLabel — текст кнопки начала ночи в этом режиме
 */
function speedBoxHTML(startLabel) {
  if (G.phase === 'night') {
    const T = G.time;
    const cd = T ? T.cooldown : 0;
    const paused = G.chosen === 0;
    let h = '<div class="seg">' + SPEEDS.map(s => {
      let dis = cd > 0;
      if (T && s === 0 && !paused && T.pauses <= 0) dis = true;
      if (T && s > 0 && paused && T.holdLeft > 0) dis = true;
      const title = s ? 'Ускорение ×' + s : 'Пауза (пробел)' + (T ? ` · осталось пауз: ${T.pauses} из ${T.pausesMax}` : '');
      return `<button data-a="spd" data-v="${s}" class="${G.chosen === s ? 'on' : ''}" ${dis ? 'disabled' : ''} title="${title}">${s ? '×' + s : '❚❚'}</button>`;
    }).join('') + '</div>';
    if (T) {
      /* бессрочная пауза: предложить, согласиться, отозвать */
      const lt = T.long ? 'Бессрочная пауза. Чтобы продолжить, выберите скорость.'
        : T.longMine ? 'Вы предложили бессрочную паузу. Ждём соперника; нажмите, чтобы отозвать.'
          : T.longTheirs ? 'Соперник предлагает бессрочную паузу — нажмите, чтобы согласиться.'
            : 'Предложить бессрочную паузу: начнётся, когда согласится соперник. Пауз из лимита не тратит.';
      h += `<button class="btn sm ${T.long || T.longMine ? 'on' : ''} ${T.longTheirs && !T.long ? 'pri' : ''}" data-a="longp" data-v="${T.longMine ? 0 : 1}" ${T.long ? 'disabled' : ''} title="${lt}">∞${T.longTheirs && !T.long ? ' согласиться' : T.longMine ? ' ждём' : ''}</button>`;
      const bits = [];
      if (T.long) bits.push('бессрочная пауза');
      else if (T.pauseBy) bits.push(`пауза ${SIDE_SHORT[T.pauseBy]} · ${Math.ceil(T.pauseLeft / 1000)} с`);
      bits.push(`паузы ${T.pauses}/${T.pausesMax}`);
      if (cd > 0) bits.push(`ждать ${Math.ceil(cd / 1000)} с`);
      h += `<span class="tctl">${bits.join(' · ')}</span>`;
    }
    if (G.speed === 0 && G.chosen > 0) h += '<span class="tctl bad">соперник не в сети — время стоит</span>';
    return h;
  }
  if (G.phase === 'prep') {
    return myReady() === 'start'
      ? '<button class="btn" data-a="unready" title="Отменить готовность">Ждём соперника… ✕</button>'
      : `<button class="btn pri" data-a="startNight">${startLabel}</button>`;
  }
  if (myReady() === 'next') return '<button class="btn" data-a="unready">Ждём соперника: следующий день ✕</button>';
  if (myReady() === 'restart') return '<button class="btn" data-a="unready">Ждём соперника: новая кампания ✕</button>';
  if (G.phase === 'debrief' && !modalOpen()) return '<button class="btn pri" data-a="reopen">Разбор ночи</button>';
  if (G.phase === 'final' && !modalOpen()) return '<button class="btn pri" data-a="reopen">Итоги</button>';
  return '';
}

function renderSpeedBox(startLabel) {
  const h = speedBoxHTML(startLabel);
  if (h !== lastSB && paint($('#speedBox'), h)) lastSB = h;
}

/* ---------- мелкие хелперы разметки ---------- */
const bar = (v, col) => `<div class="bar"><div style="width:${clamp(v, 0, 1) * 100}%;background:${col}"></div></div>`;

const seg = (a, cur, opts, extra) => `<div class="seg">${opts.map(([v, l, t]) =>
  `<button data-a="${a}" data-v="${v}" ${extra || ''} class="${cur === v ? 'on' : ''}"${t ? ` title="${t}"` : ''}>${l}</button>`).join('')}</div>`;

const ST_N = { ready: 'в боевой готовности', deploy: 'развёртывание', move: 'на марше', reload: 'пополнение БК', air: 'в воздухе', refuel: 'заправка' };

function unitStatus(u) {
  let s = ST_N[u.st] || u.st;
  if (u.st === 'deploy' || u.st === 'reload' || u.st === 'refuel') s += ' · ' + fmtDur(u.stT - G.t);
  if (u.st === 'move' && u.dest) s += ' · ~' + fmtDur(dist(u, u.dest) / UT[u.k].sp);
  if (u.st === 'air') s += ' · топливо ' + fmtDur(u.fuel);
  return s;
}
