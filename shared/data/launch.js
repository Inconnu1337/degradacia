'use strict';
/* ============================================================
   ПУСКОВАЯ ЛОГИСТИКА стороны налёта (игрок)
   ------------------------------------------------------------
   У ПВО приказы идут по связи с задержкой, техника марширует по
   дорогам, ракеты надо пополнять. Чтобы налёт не мог «вывалить»
   весь арсенал в первую минуту ночи, у него тоже есть трение:

   lanes     пусковые площадки района: сколько пусков идут параллельно.
             Пакеты одного района встают в очередь друг за другом.
   cycle     через сколько секунд площадка готова к следующему пуску
   balLanes  у баллистики свои пусковые (не занимают площадки дронов)
   lead      от приказа до первого пуска: связь, подготовка, выход
             носителей. Днём (план на ночь) — короче: готовятся заранее.
   nightCap  сколько средств расчёты успевают подготовить за ночь;
             неизрасходованное остаётся в арсенале.

   Правила действуют на пакеты игрока (команда launch). ИИ-налётчик
   режима «Оборона» сам дозирует удары и под них не подпадает.
   ============================================================ */

const LAUNCH = {
  lanes: { tarsk: 2, belsk: 2, sarma: 1, sea: 4, bomb: 6, mig: 2 },
  balLanes: { tarsk: 1, belsk: 1, sarma: 1 },
  cycle: { drone: 300, decoy: 240, loiter: 360, jet: 600, arm: 600, recon: 900, ewuav: 900, cruise: 900, ballistic: 2400, aeroball: 2400 },
  lead: {
    night: { drone: 900, decoy: 900, loiter: 900, jet: 1200, arm: 1200, recon: 900, ewuav: 1200, cruise: 10800, ballistic: 1800, aeroball: 3600 },
    day: { drone: 240, decoy: 240, loiter: 240, jet: 300, arm: 300, recon: 240, ewuav: 300, cruise: 2700, ballistic: 600, aeroball: 1800 }
  },
  nightCap: { drones: 50, strizh: 4, grach: 4, sova: 3, vual: 1, krechet: 6, albatros: 8, molot: 3, garpia: 1 }
};

/** подписи групп лимита */
const CAP_N = { drones: 'дроны и имитаторы', strizh: '«Стриж»', grach: '«Грач-Э»', sova: '«Сова»', vual: '«Вуаль»', krechet: '«Кречет-М»', albatros: '«Альбатрос»', molot: '«Молот»', garpia: '«Гарпия»' };

/** к какой группе ночного лимита относится средство */
const capGroup = k => (k === 'jalo' || k === 'moth' || k === 'shershen') ? 'drones' : k;

/** сколько ещё можно подготовить за эту ночь */
const capLeft = k => LAUNCH.nightCap[capGroup(k)] - ((E.used || {})[capGroup(k)] || 0);

/** очередь пусковых района: ключ (у баллистики свои пусковые) */
const laneKey = (k, zid) => zid + (TT[k].cls === 'ballistic' ? ':bal' : '');

/** самое раннее время первого пуска пакета */
function earliestLaunch(k, zid, delayH) {
  const cls = TT[k].cls, night = G.phase === 'night';
  const lead = LAUNCH.lead[night ? 'night' : 'day'][cls] || 900;
  const wish = Math.max((night ? G.t : 0) + delayH * 3600, (night ? G.t : 0) + lead);
  return Math.max(wish, ((E.zbook || {})[laneKey(k, zid)]) || 0);
}

/** интервал между пусками пакета в районе */
function launchSpacing(k, zid) {
  const lanes = TT[k].cls === 'ballistic' ? (LAUNCH.balLanes[zid] || 1) : (LAUNCH.lanes[zid] || 1);
  return (LAUNCH.cycle[TT[k].cls] || 600) / lanes;
}
