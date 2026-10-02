'use strict';
/* ============================================================
   РЕЖИМ «ДУЭЛЬ» (сервер) — сетевая игра двух людей
   Сторона 'def' — штаб ПВО (как в «Обороне»), сторона 'atk' —
   планировщик ударов (как в «Налёте»). Ни одного ИИ-командующего:
   движок общий, каждая сторона видит только своё (game/views.js).

   Чей голос. По умолчанию журнал и всплывашки движка — стороне ПВО
   (доклады расчётов, разведка, тревога). Всё, что относится к налёту
   (сводки о пакетах, потерях, контактах разведки), обёрнуто в
   asSide('atk', …).
   ============================================================ */

const atk = fn => (...a) => asSide('atk', () => fn(...a));

defineMode({
  id: 'duel',
  humans: ['def', 'atk'],
  playerAlarm: true,
  logOrders: true,
  returnUnlaunched: true,
  text: DEFENSE_TEXT,

  say: DefenseRadio.say,
  intelAt: DefenseRadio.intelAt,
  ask: DefenseRadio.ask,
  answerReq: DefenseRadio.answerReq,
  /* «мысли» стороны налёта — это доклады её разведчиков: в её журнал */
  mind: atk(AttackRadio.mind),

  planNight: atk(() => {
    AttackAI.playerStrikeSide();
    for (const line of [ATTACK_TEXT.prepDay(), ...(G.night === 1 ? ATTACK_TEXT.prepFirst() : [])]) hq(line, 'hq');
  }),
  think: atk(() => { AttackAI.flushContacts(); E.nextThink = G.t + 12 }),
  nightEnd() { E.obs.nights++ },
  prepEvents() {
    DefensePrep.prepEvents();
    asSide('atk', AttackAI.strikeSupply);
  },
  onNightOpen: atk(() => hq(ATTACK_TEXT.nightOpen(), 'hq')),
  onThreatKilled: atk(atkLoss),
  onNavLost: atk(atkEw),
  onLaunch: atk(atkLaunchNote),

  checkStart(role, confirm) {
    return role === 'def' ? DefenseFlow.checkStart(confirm) : { ok: G.phase === 'prep' };
  },
  debrief() {
    asSide('atk', () => hq(ATTACK_TEXT.dawn(), 'hq'));
    DefenseFlow.endNight();
    asSide('atk', AttackFlow.endNight);
  },
  finalScreen() {
    DefenseFlow.finalScreen();
    asSide('atk', AttackFlow.finalScreen);
  },

  commands: { def: DEFENSE_COMMANDS, atk: ATTACK_COMMANDS }
});
