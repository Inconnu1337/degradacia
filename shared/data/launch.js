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
             неизрасходованное остаётся в арсенале, а половина
             неиспользованного лимита переходит на следующую ночь (E.capBonus).

   Правила действуют на пакеты игрока (команда launch). ИИ-налётчик
   режима «Оборона» сам дозирует удары и под них не подпадает.
   ============================================================ */

const LAUNCH = {
  lanes: { tarsk: 2, belsk: 2, sarma: 1, sea: 4, bomb: 6, mig: 2, frn: 3, frc: 3, frs: 3 },
  balLanes: { tarsk: 1, belsk: 1, sarma: 1 },
  cycle: { fpv: 150, mother: 420, kab: 360, drone: 300, decoy: 240, loiter: 360, jet: 600, arm: 600, recon: 900, ewuav: 900, cruise: 900, ballistic: 2400, aeroball: 2400 },
  lead: {
    night: { fpv: 600, mother: 900, kab: 1500, drone: 900, decoy: 900, loiter: 900, jet: 1200, arm: 1200, recon: 900, ewuav: 1200, cruise: 10800, ballistic: 1800, aeroball: 3600 },
    day: { fpv: 240, mother: 240, kab: 300, drone: 240, decoy: 240, loiter: 240, jet: 300, arm: 300, recon: 240, ewuav: 300, cruise: 2700, ballistic: 600, aeroball: 1800 }
  },
  nightCap: { fpv: 30, ulei: 5, plita: 8, jalo: 70, moth: 35, shershen: 12, strizh: 6, grach: 5, sova: 4, vual: 2, krechet: 8, albatros: 12, molot: 4, garpia: 1 }
};

/** крылатая ракета высоким профилем летит быстрее во столько раз */
const HI_ALT_SP = 1.2;

/** лёгкие тихоходные цели, которых сносит ветер (как WIND_CLS на сервере) */
const WIND_LIGHT = { drone: 1, decoy: 1, loiter: 1, fpv: 1, mother: 1, recon: 1, ewuav: 1 };

/** время подлёта пакета по маршруту, с: start — точка пуска, path — маршрут; учитывает текущий ветер */
function flightTime(k, start, path, high) {
  const T = TT[k], sp = T.sp * (high && T.cls === 'cruise' ? HI_ALT_SP : 1);
  let t = 0, c = start;
  for (const p of path) {
    const d = dist(c, p);
    let m = 1;
    if (d > 0 && WIND_LIGHT[T.cls] && G.wind) {
      const along = ((p.x - c.x) * Math.cos(G.wind.a) + (p.y - c.y) * Math.sin(G.wind.a)) / d;
      m = clamp(1 + along * G.wind.v / (T.sp * 1000) * .9, .45, 1.6);
    }
    t += d / (sp * m); c = p;
  }
  return t;
}

/** середина залпа пакета над целью, с */
const salvoMid = g => g.arrive + (g.n - 1) * (g.spc || 0) / 2;

/* синхронизация «время на цели»: пакет приходит вместе с другим, со сдвигом (мин) */
const SYNC_OFFS = [-10, -5, 0, 5, 10];

/** подписи групп лимита */
const CAP_N = { fpv: 'FPV «Оса»', ulei: '«Улей»', plita: 'КАБ «Плита»', jalo: '«Жало-М»', moth: '«Мотылёк»', shershen: '«Шершень»', strizh: '«Стриж»', grach: '«Грач-Э»', sova: '«Сова»', vual: '«Вуаль»', krechet: '«Кречет-М»', albatros: '«Альбатрос»', molot: '«Молот»', garpia: '«Гарпия»' };

/** к какой группе ночного лимита относится средство (у каждого — свой) */
const capGroup = k => k;

/** сколько ещё можно подготовить за эту ночь */
const capLeft = k => LAUNCH.nightCap[capGroup(k)] + ((E.capBonus || {})[capGroup(k)] || 0) - ((E.used || {})[capGroup(k)] || 0);

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

/** ложная активность налёта: подписи и лимиты на ночь (логика — game/sim/enemy/carriers.js) */
const FEINTS = {
  bomb: { n: '«Кондоры» в воздух', cap: 1, d: 'Стратегические бомбардировщики взлетают и идут к рубежу пусков, но не пускают' },
  sea: { n: 'Носители в море', cap: 1, d: 'МРК «Шквал» выходят в море и маневрируют в районе пусков' },
  molot: { n: 'Выдвинуть ОТРК', cap: 2, d: 'Пусковые «Молота» выходят на позиции и работают в эфире' },
  garpia: { n: '«Соколы» в воздух', cap: 1, d: 'Носители «Гарпии» поднимаются и ходят у рубежа' },
  drones: { n: 'Шум пусковых БпЛА', cap: 2, d: 'Расчёты дронов разворачиваются и выходят на связь' }
};
