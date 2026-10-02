'use strict';
/* ============================================================
   РЕЖИМЫ ИНТЕРФЕЙСА (клиент)
   ------------------------------------------------------------
   Клиент знает два интерфейса — по сторонам:
     defense — штаб ПВО (сторона 'def')
     attack  — планировщик налёта (сторона 'atk')
   Режим сервера (оборона / налёт / дуэль) лишь выбирает, какой из
   них показать и что подписать. Правил игры здесь нет: всё, что
   меняет обстановку, уходит на сервер командой (net.js → cmd).

   Описание режима интерфейса
     hud    подписи верхней строки
     render { zones, engagement, hq, tracks, units, threats, plan }
     ui     { top, tabs, right, left(tab), threatBar, speedButtons, help, onAction(a, el, ev) }
     input  { pickAt(sp), mapClick(sp), tooltip(hit), onContextMenu(e) }
     onEnter()  локальные настройки при входе в партию
   ============================================================ */

const Modes = {};
let MODE = null;

const BaseMode = {
  id: 'base',
  hud: {
    title: '', desc: '', brand: '',
    labels: { bud: '', en: '', civ: '', thr: '' },
    paceTitle: '', zonesText: 'Зоны', zonesTitle: '',
    alarmBtn: false, spoilBtn: false
  },
  onEnter() { },
  render: { zones() { }, engagement() { }, hq() { }, tracks() { }, units() { }, threats() { }, plan: null },
  ui: { top() { }, tabs() { }, right() { }, left() { }, threatBar() { }, speedButtons() { }, help() { }, onAction: null },
  input: { pickAt: () => null, mapClick() { }, tooltip: () => '', onContextMenu: () => false }
};

function defineMode(def) {
  const m = Object.assign(Object.create(BaseMode), def);
  for (const k of ['hud', 'render', 'ui', 'input']) m[k] = Object.assign({}, BaseMode[k], def[k]);
  Modes[m.id] = m;
  return m;
}

/** интерфейс стороны */
const MODE_OF_ROLE = { def: 'defense', atk: 'attack' };

function activateMode(id) {
  if (!Modes[id]) throw new Error('Неизвестный режим: ' + id);
  MODE = Modes[id];
  return MODE;
}

/** режимы сервера для меню */
const SERVER_MODES = {
  defense: { kicker: 'Одиночная игра', title: 'Оборона', brand: 'НОЧНОЙ РУБЕЖ', role: 'def',
    lead: 'Вы — офицер штаба воздушной обороны. Видеть картину, распределять внимание и вовремя принимать решения важнее, чем «стрелять»: техникой управляют командиры расчётов, и приказы идут по связи с задержкой.',
    points: ['Днём — закупка и перестановка ЗРК, ремонт, боекомплект', 'Ночью — эфир, разведка, запросы расчётов, тревога для населения', 'Противник-ИИ вскрывает позиции, учится и меняет тактику'] },
  attack: { kicker: 'Одиночная игра', title: 'Налёт', brand: 'НОЧНОЙ НАЛЁТ', role: 'atk',
    lead: 'Вы планируете воздушные удары по краю. Штаб ПВО играет сам: радары, ракеты, тревога, смена позиций. Позиции не видны, пока вы их не вскроете.',
    points: ['Дроны, имитаторы, крылатые и баллистика — пакеты с маршрутами и временем пуска', 'Пусковые площадки и расчёты не бесконечны: залп надо планировать', 'Цель кампании — погасить энергосистему за пять ночей'] },
  duel: { kicker: 'Сетевая игра на двоих', title: 'Дуэль', brand: 'ДУЭЛЬ',
    lead: 'Один игрок — штаб ПВО, второй — планировщик налёта. Никаких ботов: каждый видит только свою картину, время общее. Пригласите соперника кодом партии.',
    points: ['Ночь начинается, когда готовы оба', 'Паузу и ускорение может включить каждый, но с ограничениями', 'Отключился соперник — время стоит, пока он не вернётся'] }
};
