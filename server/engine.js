'use strict';
/* ============================================================
   ДВИЖОК КОМНАТЫ
   Каждая комната — своя песочница vm: свои G/E/S/MODE, общих
   глобальных переменных между партиями нет. В песочницу грузятся
   shared/ (данные, география, чистые функции) и game/ (правила).
   Наружу отдаётся только API из game/api.js, всё — строками JSON.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/** порядок важен: объявления верхнего уровня, нужные при загрузке, идут раньше */
const FILES = [
  'shared/util.js', 'shared/config.js',
  'shared/data/lore.js', 'shared/data/threats.js', 'shared/data/units.js', 'shared/data/objects.js',
  'shared/data/zones.js', 'shared/data/crews.js', 'shared/data/weather.js', 'shared/data/launch.js',
  'shared/world.js', 'shared/derived.js', 'shared/routing.js',
  'game/data/phrases.js', 'game/core/mode.js', 'game/core/bridge.js', 'game/core/dispatch.js',
  'game/sim/state.js', 'game/sim/weather.js', 'game/sim/comms.js', 'game/sim/intel.js', 'game/sim/units.js', 'game/sim/threats.js', 'game/sim/damage.js',
  'game/sim/enemy/state.js', 'game/sim/enemy/knowledge.js', 'game/sim/enemy/groups.js', 'game/sim/enemy/carriers.js',
  'game/sim/phases.js',
  'game/modes/defense/radio.js', 'game/modes/defense/attacker-ai.js', 'game/modes/defense/prep-events.js',
  'game/modes/defense/supply.js', 'game/modes/defense/flow.js',
  'game/modes/attack/radio.js', 'game/modes/attack/strike.js', 'game/modes/attack/defender-ai.js',
  'game/modes/attack/flow.js',
  'game/commands.js',
  'game/modes/defense/index.js', 'game/modes/attack/index.js', 'game/modes/duel/index.js',
  'game/views.js', 'game/save.js', 'game/api.js'
];

/* исходники компилируем один раз на процесс, запускаем в каждой комнате */
let SCRIPTS = null;
function scripts() {
  if (!SCRIPTS) SCRIPTS = FILES.map(f => new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }));
  return SCRIPTS;
}

const MODES = ['defense', 'attack', 'duel'];
/** какие стороны играют люди в каждом режиме (дублирует game/modes/*: нужно до создания песочницы) */
const HUMANS = { defense: ['def'], attack: ['atk'], duel: ['def', 'atk'] };

function createEngine(mode) {
  if (!MODES.includes(mode)) throw new Error('Неизвестный режим: ' + mode);
  const ctx = vm.createContext({ console });
  for (const s of scripts()) s.runInContext(ctx);
  const api = vm.runInContext('API', ctx);
  api.init(mode);
  return {
    mode,
    tick: (dtms, present) => api.tick(dtms, { def: !!present.def, atk: !!present.atk }),
    command: (role, name, args) => JSON.parse(api.command(role, String(name), JSON.stringify(args || {}))),
    /** снимок — уже строка JSON, чтобы не разбирать и не собирать заново */
    view: role => api.view(role),
    drain: () => JSON.parse(api.drain()),
    save: () => JSON.parse(api.save()),
    load: obj => api.load(JSON.stringify(obj)),
    eval: code => vm.runInContext(code, ctx)
  };
}

module.exports = { createEngine, MODES, HUMANS, FILES };
