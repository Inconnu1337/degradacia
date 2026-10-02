'use strict';
/* ============================================================
   РЕЖИМ «ОБОРОНА» (сервер)
   Игрок — штаб ПВО. Противник — самостоятельный командующий
   (DefenseAI): планирует ночь, ведёт свою картину нашей обороны,
   меняет тактику между ночами.
   ============================================================ */

/** тексты журнала стороны ПВО (общие с дуэлью) */
const DEFENSE_TEXT = {
  prepDay: () => `<b>День ${G.night}.</b> Подготовка к ночному дежурству. Погода на ночь: ${G.weather.n.toLowerCase()} — ${G.weather.d.toLowerCase()} Расставьте силы, пополните боекомплект и заступайте.`,
  prepFirst: () => [
    'Днём перемещения мгновенные и бесплатные. Ночью приказ идёт по связи с задержкой, а расчёт может переспросить или возразить.',
    'Противник, скорее всего, знает старые позиции ЗРК: они стоят на месте с прошлой недели. Смена позиции днём сбивает ему прицел.'
  ],
  nightOpen: () => `<b>Ночь ${G.night}.</b> Дежурство принято. Время 19:00, рассвет в ${DAWN_LABEL}.`,
  seen: n => `Цели в воздухе: ${n}.${G.alarm ? '' : ' Воздушная тревога в крае не объявлена.'}`,
  dawn: () => `${DAWN_LABEL}. Рассвет. Отбой воздушной тревоги, дежурство окончено.`
};

defineMode({
  id: 'defense',
  humans: ['def'],
  playerAlarm: true,
  logOrders: true,
  text: DEFENSE_TEXT,

  say: DefenseRadio.say,
  intelAt: DefenseRadio.intelAt,
  mind: DefenseRadio.mind,
  ask: DefenseRadio.ask,
  answerReq: DefenseRadio.answerReq,

  planNight: DefenseAI.planNight,
  think: DefenseAI.think,
  nightEnd: DefenseAI.nightEnd,
  prepEvents: DefensePrep.prepEvents,

  checkStart: (role, confirm) => DefenseFlow.checkStart(confirm),
  debrief: DefenseFlow.endNight,
  finalScreen: DefenseFlow.finalScreen,

  commands: { def: DEFENSE_COMMANDS }
});
