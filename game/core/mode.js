'use strict';
/* ============================================================
   РЕЖИМЫ ИГРЫ (сервер)
   ------------------------------------------------------------
   Движок (sim/) про конкретный режим ничего не знает и зовёт
   MODE.<хук>. Режим регистрируется defineMode(); недостающее
   берётся из BaseMode.

   Стороны
     humans           какие стороны играют люди: ['def'] · ['atk'] · ['def', 'atk']
                      'def' — штаб ПВО (G), 'atk' — сторона налёта (E)
   Жизненный цикл
     planNight()          план ночи (startPrep)
     think()              периодическое «мышление» (step, E.nextThink)
     nightEnd()           выводы второй стороны по итогам ночи
     prepEvents()         события между ночами
     checkStart(role, confirm)  можно ли этой стороне заступать: { ok, error?, warned? }
     debrief()            рассвет: разбор ночи для каждой стороны (модальные окна)
     finalScreen()        итоги кампании для каждой стороны
     campaignOver()       true — это была последняя ночь
     onNightOpen()        ночь началась
     onThreatKilled(th,u) · onNavLost(th) · onLaunch(q) · onBrood(th)
   Радиообмен (фасад в core/dispatch.js)
     say / intelAt / mind / ask / answerReq
   Флаги
     playerAlarm      тревогу объявляет игрок-оборонец
     logOrders        писать приказы в эфир
     returnUnlaunched нерасстрелянные до рассвета пуски возвращаются в арсенал
   Данные
     text { prepDay, prepFirst, nightOpen, seen, dawn }   тексты журнала
   Команды
     commands { def: { имя(args) }, atk: { … } }  — что сторона вправе приказать
   ============================================================ */

const Modes = {};
let MODE = null;

const BaseMode = {
  id: 'base',
  humans: ['def'],
  playerAlarm: false,
  logOrders: false,
  returnUnlaunched: false,
  text: { prepDay: () => '', prepFirst: () => [], nightOpen: () => '', seen: () => '', dawn: () => '' },

  say() { }, intelAt() { }, mind() { }, ask() { }, answerReq() { },

  planNight() { }, think() { }, nightEnd() { }, prepEvents() { },
  checkStart() { return { ok: G.phase === 'prep' } },
  debrief() { G.phase = 'debrief'; G.speed = 0 },
  finalScreen() { G.phase = 'final' },
  campaignOver() { return G.night >= NIGHTS_TOTAL || energy() < 15 },
  onNightOpen() { }, onThreatKilled() { }, onNavLost() { }, onLaunch() { }, onBrood() { },

  commands: {}
};

function defineMode(def) {
  const m = Object.assign(Object.create(BaseMode), def);
  m.text = Object.assign({}, BaseMode.text, def.text);
  Modes[m.id] = m;
  return m;
}

function activateMode(id) {
  if (!Modes[id]) throw new Error('Неизвестный режим: ' + id);
  MODE = Modes[id];
  return MODE;
}
