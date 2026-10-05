'use strict';
/* ============================================================
   ВХОД В ИГРУ (сервер)
   Единственное, что видит комната (server/room.js): запуск, тик,
   команда стороны, снимок для стороны, очередь событий.
   Всё возвращается строками JSON: объекты песочницы vm имеют
   чужие прототипы, наружу отдаём только данные.
   ============================================================ */

/** какие стороны сейчас подключены (комната сообщает перед тиком) */
const PRESENT = { def: false, atk: false };
let __acc = 0;

/** чья команда исполняется */
let ROLE = null;

/** общий шаг (заступить, новый день, новая кампания) — когда готовы все люди */
function gate(step, fn) {
  G.ready[ROLE] = step;
  if (MODE.humans.every(r => G.ready[r] === step)) {
    G.ready = {};
    fn();
    return ok({ done: true });
  }
  return ok({ waiting: true });
}

const COMMON_COMMANDS = {
  speed({ v }) {
    if (!SPEEDS.includes(v)) return fail('неверная скорость');
    const no = requestSpeed(ROLE, v);
    if (no) { toast('Время: ' + no, 'i'); return fail(no) }
    return ok();
  },
  /** бессрочная пауза по согласию обеих сторон */
  longPause({ v }) {
    const no = requestLongPause(ROLE, !!v);
    return no ? fail(no) : ok();
  },
  autoPace({ v }) { AUTO[ROLE] = !!v; return ok() },
  startNight({ confirm }) {
    const r = MODE.checkStart(ROLE, !!confirm);
    if (!r.ok) return r;
    return gate('start', startNight2);
  },
  /** отменить свою готовность, пока вторая сторона не готова */
  unready() { delete G.ready[ROLE]; return ok() },
  nextDay() {
    if (G.phase !== 'debrief' || MODE.campaignOver()) return fail('не время для этого');
    return gate('next', () => { nextDay(); deliverPapers() });
  },
  final() {
    if (G.phase !== 'debrief' || !MODE.campaignOver()) return fail('не время для этого');
    hideModal();
    MODE.finalScreen();
    return ok();
  },
  restart() {
    if (G.phase !== 'final') return fail('не время для этого');
    return gate('restart', () => { hideModal(); newCampaign() });
  }
};

globalThis.API = {
  init(modeId) {
    activateMode(modeId);
    buildWorld();
    newCampaign();
  },

  /** реальное время dtms; присутствие сторон — для паузы при отключении */
  tick(dtms, present) {
    for (const r in PRESENT) PRESENT[r] = !!present[r];
    if (G.phase !== 'night') { __acc = 0; G.speed = 0; return }
    const here = MODE.humans.every(r => PRESENT[r]);
    /* пока кого-то нет, время стоит, а реальные часы пауз — тоже */
    if (here) clockTick(dtms);
    G.speed = here ? SPEED : 0;
    if (!G.speed) { __acc = 0; return }
    __acc += Math.min(dtms, 250) / 1000 * G.speed;
    /* ограничиваем число шагов за тик, чтобы не подвешивать сервер */
    let steps = 0;
    while (__acc >= SIM_DT && G.phase === 'night' && G.speed && steps < 800) {
      step(SIM_DT); __acc -= SIM_DT; steps++;
    }
    if (steps >= 800 || G.phase !== 'night') __acc = 0;
  },

  /** команда стороны; args — строка JSON. Возвращает строку JSON ответа */
  command(role, name, argsJson) {
    if (!MODE.humans.includes(role)) return JSON.stringify(fail('эта сторона играет ботом'));
    const own = (MODE.commands[role] || {})[name];
    const fn = own || COMMON_COMMANDS[name];
    if (!fn || !Object.prototype.hasOwnProperty.call(own ? MODE.commands[role] : COMMON_COMMANDS, name))
      return JSON.stringify(fail('неизвестная команда'));
    let args;
    try { args = JSON.parse(argsJson || '{}') || {} } catch (e) { return JSON.stringify(fail('неверные аргументы')) }
    if (typeof args !== 'object') args = {};
    ROLE = role;
    try {
      const res = asSide(role, () => fn(args)) || ok();
      return JSON.stringify(res);
    } finally { ROLE = null }
  },

  view(role) { return JSON.stringify(viewFor(role)) },

  /** полное состояние для файла сохранения (только днём) */
  save() {
    if (G.phase !== 'prep') throw new Error('Сохранять можно днём, в фазе подготовки');
    return JSON.stringify(encodeState());
  },

  /** загрузить состояние из файла; json — строка */
  load(json) { decodeState(JSON.parse(json)) },

  /** накопленные события; очередь очищается */
  drain() {
    if (!OUT.length) return '[]';
    const s = JSON.stringify(OUT);
    OUT = [];
    return s;
  }
};
