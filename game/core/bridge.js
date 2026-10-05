'use strict';
/* ============================================================
   МОСТ «ДВИЖОК → ИГРОКИ» (сервер)
   ------------------------------------------------------------
   Правила игры пишут в журнал, показывают всплывашки и эффекты
   теми же вызовами, что и раньше (hq, toast, fx, showModal …),
   но здесь это не DOM, а события в очередь OUT. Комната
   (server/room.js) забирает их после каждого тика и рассылает.

   Кому адресовано событие
     В одиночных режимах — единственной живой стороне.
     В дуэли — стороне, «от лица» которой сейчас работает код:
     по умолчанию это ПВО ('def'); код стороны налёта оборачивается
     в asSide('atk', …). Эффекты на карте видят все.
   ============================================================ */

/** события для рассылки: { to: 'def' | 'atk' | '*', e: тип, … } */
let OUT = [];
let VOICE = 'def';

function emit(to, ev) { ev.to = to; OUT.push(ev) }

/** кому сейчас говорить: единственный человек или текущая сторона */
const voice = () => MODE.humans.length === 1 ? MODE.humans[0] : VOICE;

/** выполнить fn от лица стороны (её журнал и всплывашки) */
function asSide(side, fn) {
  const prev = VOICE;
  VOICE = side;
  try { return fn() } finally { VOICE = prev }
}

/* ---------- журналы ---------- */
/** строка в журнал: box — 'radio' | 'intel' | 'mind' */
function logLine(box, html, cls) { emit(voice(), { e: 'log', box, html, cls: cls || '' }) }

function hq(txt, cls) {
  logLine('radio',
    `<span class="tm">${clock(G.t)}</span>${cls === 'hq' ? '<span class="who hqw">Штаб</span> ' : ''}${txt}`,
    cls === 'hq' ? 'hq' : cls);
}

/** одна и та же строка всем живым сторонам (погода, рассвет) */
function hqAll(txt, cls) { for (const r of MODE.humans) asSide(r, () => hq(txt, cls)) }

function showIntel(it) {
  logLine('intel',
    `<span class="tm">${clock(G.t)}</span><span class="gr" title="${GRADE_D[it.gr[0]] || ''}">${it.gr}</span>${esc(it.txt)}`, it.cls);
  if (it.cls === 'crit') toast(it.txt);
  else if (it.gr && it.gr[0] === 'A' && it.cls === 'w') toast(it.txt, 'i');
}

function clearLogs() { emit('*', { e: 'clear' }) }

/* ---------- всплывашки и окна ---------- */
function toast(t, c) { emit(voice(), { e: 'toast', t, c: c || '' }) }

function showModal(html) { emit(voice(), { e: 'modal', html }) }

function hideModal() { emit('*', { e: 'modal', html: null }) }

/** эффект на карте (вспышки, трассы) — видят все */
function fx(o) { emit('*', { e: 'fx', o }) }

/* интерфейс клиента перерисовывается по снимку — здесь это пустышки */
let tabsDirty = false;
function uiDirty() { }
function hint() { }

/* ---------- время ----------
   Скорость одна на партию (SPEED). Менять её — ставить паузу или
   ускорять — может любая сторона. Чтобы этим нельзя было «спамить»,
   в сетевой игре (людей больше одного) действуют ограничения
   TIME_RULES: перерыв между переключениями у каждой стороны,
   конечное число пауз за ночь и предельная длина одной паузы.
   Если сторона отключилась — время стоит, пока она не вернётся.
   Учёт ведётся в реальных миллисекундах (REAL_MS), а не игровых. */

const TIME_RULES = {
  /** перерыв между переключениями скорости одной стороной, мс */
  cooldownMs: 3000,
  /** пауз на сторону за ночь */
  pausesPerNight: 3,
  /** пауза снимается сама через, мс */
  pauseMaxMs: 45000,
  /** чужую паузу можно снять не раньше, чем через, мс */
  pauseHoldMs: 8000
};

/** выбранная сторонами скорость; G.speed — фактическая (0, если кого-то нет) */
let SPEED = 0;
let REAL_MS = 0;
const TIME = {
  last: { def: -1e9, atk: -1e9 },
  pauses: { def: TIME_RULES.pausesPerNight, atk: TIME_RULES.pausesPerNight },
  /** текущая пауза: { by, at, resume, long } */
  pause: null,
  /** кто предложил бессрочную паузу (нужно согласие обеих сторон) */
  longAsk: { def: false, atk: false }
};

/** авто-темп: замедлять при появлении целей, запросах, баллистике */
const AUTO = { def: true, atk: true };

const multiplayer = () => MODE.humans.length > 1;
const autoPace = () => MODE.humans.some(r => AUTO[r]);
const SIDE_LABEL = { def: 'ПВО', atk: 'Налёт' };

/**
 * движок притормаживает время (авто-темп).
 * В сетевой игре запросы расчётов время не тормозят: иначе одна
 * сторона замедляла бы другую своими делами.
 */
function setSpeed(s, why) {
  if (G.phase !== 'night') return;
  if (why === 'req' && multiplayer()) return;
  SPEED = Math.min(SPEED, s);
  G.speed = Math.min(G.speed, s);
}

/** новая ночь: ×15, лимиты пауз заново */
function resetSpeed(s) {
  SPEED = s; G.speed = s; G.skip = false; G.skipAsk = {};
  TIME.pause = null;
  TIME.longAsk = { def: false, atk: false };
  for (const r in TIME.pauses) { TIME.pauses[r] = TIME_RULES.pausesPerNight; TIME.last[r] = -1e9 }
}

/**
 * бессрочная пауза: сторона предлагает (v = true) или отзывает предложение.
 * Когда согласны обе — время стоит, пока любая не пустит его снова.
 * Пауз из лимита не тратит. В одиночной игре — просто пауза.
 */
function requestLongPause(role, v) {
  if (G.phase !== 'night') return 'время идёт только ночью';
  if (!multiplayer()) { SPEED = 0; return null }
  if (TIME.pause && TIME.pause.long) return null;
  TIME.longAsk[role] = !!v;
  const other = MODE.humans.find(r => r !== role);
  if (!v) { emit(other, { e: 'toast', t: `${SIDE_LABEL[role]} отзывает предложение бессрочной паузы`, c: 'i' }); return null }
  if (TIME.longAsk[other]) {
    TIME.pause = { by: 'both', at: REAL_MS, resume: SPEED || 15, long: true };
    SPEED = 0;
    TIME.longAsk = { def: false, atk: false };
    emit('*', { e: 'toast', t: 'Бессрочная пауза: обе стороны согласны. Время пустит любая сторона.', c: 'i' });
  } else emit(other, { e: 'toast', t: `${SIDE_LABEL[role]} предлагает бессрочную паузу — кнопка «∞» вверху`, c: 'i' });
  return null;
}

/** просьба стороны сменить скорость; возвращает текст отказа или null */
function requestSpeed(role, v) {
  if (G.phase !== 'night') return 'время идёт только ночью';
  /* любая команда скорости прерывает перемотку до утра */
  if (G.skip) { G.skip = false; SPEED = v; return null }
  if (v === SPEED) return null;
  if (multiplayer()) {
    const wait = TIME.last[role] + TIME_RULES.cooldownMs - REAL_MS;
    if (wait > 0) return `слишком часто: ещё ${Math.ceil(wait / 1000)} с`;
    const p = TIME.pause;
    if (v === 0 && p && p.long) return null;
    if (v === 0 && TIME.pauses[role] <= 0) return 'паузы на эту ночь кончились';
    if (v > 0 && p && !p.long && p.by !== role && REAL_MS - p.at < TIME_RULES.pauseHoldMs)
      return `пауза ${SIDE_LABEL[p.by]}: снять можно через ${Math.ceil((p.at + TIME_RULES.pauseHoldMs - REAL_MS) / 1000)} с`;
    TIME.last[role] = REAL_MS;
    const other = MODE.humans.find(r => r !== role);
    if (v === 0) {
      TIME.pauses[role]--;
      TIME.pause = { by: role, at: REAL_MS, resume: SPEED || 15 };
      emit(other, { e: 'toast', t: `${SIDE_LABEL[role]} ставит паузу (до ${TIME_RULES.pauseMaxMs / 1000} с)`, c: 'i' });
    } else {
      TIME.longAsk = { def: false, atk: false };
      if (TIME.pause) emit(other, { e: 'toast', t: `${SIDE_LABEL[role]} снимает паузу`, c: 'i' });
      else if (v > SPEED) emit(other, { e: 'toast', t: `${SIDE_LABEL[role]} ускоряет время: ×${v}`, c: 'i' });
      TIME.pause = null;
    }
  }
  SPEED = v;
  return null;
}

/** тик реального времени: истечение пауз */
function clockTick(dtms) {
  REAL_MS += dtms;
  const p = TIME.pause;
  if (p && !p.long && SPEED === 0 && REAL_MS - p.at >= TIME_RULES.pauseMaxMs) {
    SPEED = p.resume;
    TIME.pause = null;
    emit('*', { e: 'toast', t: 'Пауза истекла, время пошло', c: 'i' });
  }
  if (TIME.pause && SPEED !== 0) TIME.pause = null;
}

/* ---------- перемотка до утра ----------
   Когда налёту нечем больше бить (нет ракет, баллистики и КАБ, а дронов
   осталось на пару пакетов) — можно перемотать ночь. Против ИИ сторона
   решает сама; в дуэли перемотку предлагает налёт, ПВО соглашается
   (кнопку у ПВО видно только после предложения — иначе она выдавала бы,
   что у налёта пусто). Перемотка — не прыжок: время идёт ×SKIP_SPEED,
   всё, что в воздухе, долетает. */
const SKIP_SPEED = 7000;
const SKIP_HEAVY = ['krechet', 'albatros', 'molot', 'garpia', 'plita', 'strizh', 'grach'];

/** у налёта нечем бить до рассвета */
function atkSpent() {
  const can = k => Math.max(0, Math.min(E.stock[k] || 0, capLeft(k)));
  if (SKIP_HEAVY.some(k => can(k) > 0)) return false;
  return ATK_KINDS.reduce((a, k) => a + can(k), 0) <= 6;
}

function canSkip(role) {
  if (G.phase !== 'night' || G.skip) return false;
  if (role === 'atk') return atkSpent();
  /* ПВО против ИИ: в воздухе пусто и ИИ больше ничего не готовит */
  if (!MODE.humans.includes('atk')) return !E.queue.length && !G.threats.some(th => !th.dead);
  return !!(G.skipAsk && G.skipAsk.atk);
}

function requestSkip(role, v) {
  if (!canSkip(role) && !(v === false)) return 'перемотка сейчас недоступна';
  G.skipAsk = G.skipAsk || {};
  G.skipAsk[role] = !!v;
  if (!v) return null;
  if (MODE.humans.every(r => G.skipAsk[r])) {
    G.skip = true; G.skipAsk = {};
    hqAll('Перемотка до утра: время идёт быстро, всё, что в воздухе, долетит.', 'hq');
  } else {
    const other = MODE.humans.find(r => r !== role);
    emit(other, { e: 'toast', t: `${SIDE_LABEL[role]} предлагает перемотать до утра — кнопка «⏭» вверху`, c: 'i' });
  }
  return null;
}

/** что сторона знает о правилах времени (для кнопок у клиента) */
function skipView(role) {
  const other = MODE.humans.find(r => r !== role);
  return { can: canSkip(role), on: !!G.skip, mine: !!(G.skipAsk && G.skipAsk[role]), theirs: !!(other && G.skipAsk && G.skipAsk[other]) };
}

function timeView(role) {
  if (!multiplayer()) return null;
  const p = TIME.pause;
  return {
    cooldown: Math.max(0, TIME.last[role] + TIME_RULES.cooldownMs - REAL_MS),
    pauses: TIME.pauses[role], pausesMax: TIME_RULES.pausesPerNight,
    pauseBy: p ? p.by : null,
    pauseLeft: p ? Math.max(0, p.at + TIME_RULES.pauseMaxMs - REAL_MS) : 0,
    holdLeft: p && !p.long && p.by !== role ? Math.max(0, p.at + TIME_RULES.pauseHoldMs - REAL_MS) : 0,
    long: !!(p && p.long),
    longMine: !!TIME.longAsk[role],
    longTheirs: !!TIME.longAsk[MODE.humans.find(r => r !== role)]
  };
}
