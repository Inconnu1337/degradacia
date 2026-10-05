'use strict';
/* ============================================================
   РЕЖИМ «НАЛЁТ» (сервер)
   Игрок планирует воздушные удары, штаб ПВО играет бот (AttackAI):
   тревога, смена позиций, закупки.

   ВАЖНО про имена. Движок один, поэтому в налёте роли «перевёрнуты»:
     E — СТОРОНА ИГРОКА: E.stock — арсенал, E.know — что игрок знает о ПВО,
       E.groups/E.queue — его пакеты;
     G.units/G.objs/G.threats — оборона бота и цели игрока.
   ============================================================ */

/** тексты журнала стороны налёта */
const ATTACK_TEXT = {
  prepDay: () => `<b>День ${G.night}.</b> Сбор пакета на ночь. Погода над краем: ${G.weather.n.toLowerCase()} — ${G.weather.d} ${forecastText()} Разведка неполная: на карте только то, что уже вскрыто.`,
  prepFirst: () => [
    'Архив знает примерные места тяжёлых ЗРК недельной давности. Точный прицел — после «Совы», радиоперехвата или их пуска.',
    'Имитаторы заставляют ПВО жечь ракеты. Баллистика и «Грач» бьют по вскрытым радарам. Попадания в жилые кварталы портят итог налёта.'
  ],
  nightOpen: () => `<b>Ночь ${G.night}.</b> Окно удара открыто. Время 19:00, рассвет в ${DAWN_LABEL}. Пуски, которые не успеют до рассвета, снимутся сами.`,
  seen: n => `Их сеть видит ${n} наших бортов.${G.alarm ? ' В крае объявлена тревога.' : ''}`,
  dawn: () => `${DAWN_LABEL}. Рассвет. Окно удара закрыто, уцелевшие борта сходят с маршрутов.`
};

defineMode({
  id: 'attack',
  humans: ['atk'],
  returnUnlaunched: true,
  text: ATTACK_TEXT,

  say: AttackRadio.say,
  intelAt: AttackRadio.intelAt,
  mind: AttackRadio.mind,
  ask: AttackRadio.ask,
  answerReq: AttackRadio.answerReq,

  planNight: AttackAI.planNight,
  think: AttackAI.think,
  nightEnd: AttackAI.nightEnd,
  prepEvents: AttackAI.prepEvents,
  onNightOpen: AttackAI.nightOpen,
  onThreatKilled: atkLoss,
  onNavLost: atkEw,
  onLaunch: atkLaunchNote,
  onBrood: atkBrood,
  onCrash: atkCrash,

  debrief: AttackFlow.endNight,
  finalScreen: AttackFlow.finalScreen,
  campaignOver: () => G.night >= NIGHTS_TOTAL || energy() < 18,

  commands: { atk: ATTACK_COMMANDS }
});
