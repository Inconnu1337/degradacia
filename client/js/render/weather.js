'use strict';
/* ============================================================
   ПОГОДА НА КАРТЕ И СПРАВКА О НЕЙ (клиент)
   Облака плывут по ветру, дождь и снег косит ветром, туман —
   дымка поверх карты. В углу — роза ветра. Клик по погоде в
   верхней строке открывает окно с её влиянием на бой.
   ============================================================ */

const WX_LOOK = {
  clear: { cloud: 0, haze: 0 },
  cloud: { cloud: .10, haze: 0 },
  low: { cloud: .17, haze: .04 },
  fog: { cloud: .12, haze: .22 },
  rain: { cloud: .15, haze: .06, rain: 1 },
  snow: { cloud: .12, haze: .07, snow: 1 }
};

/* облака: постоянный набор «клочков» в мировых координатах */
const WX_PUFFS = (() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const a = [];
  for (let i = 0; i < 46; i++) a.push({ x: rnd() * 640 - 40, y: rnd() * 440 - 40, r: 18 + rnd() * 34, k: .6 + rnd() * .4 });
  return a;
})();

/* осадки: частицы в экранных координатах */
let WX_DROPS = [];

function drawWeather(s) {
  const w = G.weather;
  if (!w) return;
  const L = WX_LOOK[w.vis] || WX_LOOK.clear;
  const wind = G.wind || { a: 0, v: 0 };
  const wx = Math.cos(wind.a), wy = Math.sin(wind.a);

  /* облака дрейфуют по ветру: смещение растёт с игровым временем и анимацией */
  if (L.cloud) {
    const drift = (G.t * .0012 + ANIM * .25) * (wind.v + 2);
    const span = 680;
    for (const p of WX_PUFFS) {
      let x = ((p.x + wx * drift) % span + span) % span - 40;
      let y = ((p.y + wy * drift) % 480 + 480) % 480 - 40;
      const q = w2s({ x, y }), r = p.r * s;
      if (q.x < -r || q.y < -r || q.x > CW + r || q.y > CH + r) continue;
      const g = cx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
      g.addColorStop(0, `rgba(190,205,215,${L.cloud * p.k})`);
      g.addColorStop(1, 'rgba(190,205,215,0)');
      cx.fillStyle = g;
      cx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
    }
  }
  if (L.haze) {
    cx.fillStyle = `rgba(170,182,190,${L.haze})`;
    cx.fillRect(0, 0, CW, CH);
  }
}

/** осадки поверх всего, в экранных координатах */
function drawPrecip(dtms) {
  const w = G.weather;
  const L = w && (WX_LOOK[w.vis] || WX_LOOK.clear);
  if (!L || (!L.rain && !L.snow)) { WX_DROPS = []; return }
  const wind = G.wind || { a: 0, v: 0 };
  const n = L.rain ? 160 : 110;
  while (WX_DROPS.length < n) WX_DROPS.push({ x: Math.random() * CW, y: Math.random() * CH, z: .5 + Math.random() * .5 });
  const k = dtms / 1000;
  const vx = Math.cos(wind.a) * wind.v * (L.rain ? 9 : 6);
  cx.save();
  if (L.rain) {
    cx.strokeStyle = 'rgba(170,200,225,.22)'; cx.lineWidth = 1;
    cx.beginPath();
    for (const d of WX_DROPS) {
      d.x += vx * k * d.z; d.y += 520 * k * d.z;
      if (d.y > CH) { d.y = -10; d.x = Math.random() * CW }
      if (d.x > CW) d.x -= CW; else if (d.x < 0) d.x += CW;
      cx.moveTo(d.x, d.y); cx.lineTo(d.x - vx * .02, d.y - 12 * d.z);
    }
    cx.stroke();
  } else {
    cx.fillStyle = 'rgba(235,242,248,.55)';
    for (const d of WX_DROPS) {
      d.x += (vx + Math.sin(ANIM * 1.3 + d.z * 9) * 12) * k * d.z; d.y += 55 * k * d.z;
      if (d.y > CH) { d.y = -4; d.x = Math.random() * CW }
      if (d.x > CW) d.x -= CW; else if (d.x < 0) d.x += CW;
      cx.fillRect(d.x, d.y, 1.6 * d.z + .6, 1.6 * d.z + .6);
    }
  }
  cx.restore();
}

/** роза ветра в левом нижнем углу карты */
function drawWindRose() {
  const wind = G.wind;
  if (!wind) return;
  const x = 46, y = CH - 46;
  cx.save();
  cx.fillStyle = 'rgba(8,14,20,.7)'; cx.strokeStyle = 'rgba(120,150,170,.45)'; cx.lineWidth = 1;
  cx.beginPath(); cx.arc(x, y, 24, 0, 7); cx.fill(); cx.stroke();
  cx.translate(x, y); cx.rotate(wind.a);
  cx.strokeStyle = '#9fd3f5'; cx.fillStyle = '#9fd3f5'; cx.lineWidth = 2;
  cx.beginPath(); cx.moveTo(-14, 0); cx.lineTo(12, 0); cx.stroke();
  cx.beginPath(); cx.moveTo(15, 0); cx.lineTo(8, -5); cx.lineTo(8, 5); cx.closePath(); cx.fill();
  cx.restore();
  cx.font = '600 10px system-ui, sans-serif'; cx.textAlign = 'center'; cx.fillStyle = '#cfe3ef';
  cx.fillText(`${wind.v} м/с`, x, y + 37);
}

/* ---------- справка о погоде ---------- */
function weatherModal() {
  const w = G.weather, wind = G.wind || { a: 0, v: 0 };
  const from = DIRS[dirIdx(-Math.cos(wind.a), -Math.sin(wind.a))];
  const pct = k => (k >= 1 ? '' : '−') + Math.round(Math.abs(1 - k) * 100) + '%';
  const eff = (k, good) => k === 1 ? '<span class="mu">без изменений</span>' : `<span class="${k > 1 === good ? 'good' : 'bad'}">${pct(k)}</span>`;
  /* ветер для «Жала» (≈50 м/с): попутный и встречный */
  const air = TT.jalo.sp * 1000, dv = Math.min(.6, wind.v / air * .9);
  const def = Game.role === 'def';
  const rows = [
    ['Посты наблюдения, тепловизоры', eff(w.eo, true), 'дальность, на которой слышат и видят цели'],
    ['Пулемёты и зенитки', eff(w.gun, true), 'точность огня'],
    ['Радары', eff(w.radar || 1, true), 'дальность обнаружения'],
    ['Марши техники', eff(w.march || 1, true), 'скорость колонн'],
    ['Вертолёты', w.heli ? '<span class="good">летают</span>' : '<span class="bad">на земле</span>', 'в нелётную погоду возвращаются на площадку'],
    ['FPV-дроны', !w.fpv ? '<span class="bad">не летают</span>' : eff(w.fpv, !def), 'обзор камеры и устойчивость'],
    ['Обледенение дронов', w.ice ? `<span class="${def ? 'good' : 'bad'}">≈${Math.round(w.ice * 100)}% в час падают</span>` : '<span class="mu">нет</span>', 'лёгкие дроны, разведчики, FPV'],
    ['Ветер для «мопедов»', wind.v ? `попутный <b>+${Math.round(dv * 100)}%</b>, встречный <b>−${Math.round(dv * 100)}%</b>` : '<span class="mu">штиль</span>', 'скорость лёгких дронов; реактивным и ракетам всё равно']
  ];
  const fc = G.forecast ? `<p><b>Прогноз:</b> около ${clock(G.forecast.t)} — ${esc(G.forecast.n.toLowerCase())}. Прогноз может ошибаться.</p>` : '<p class="mu">Смены погоды до утра не ожидается.</p>';
  showModal(`<h1>Погода: ${esc(w.n)}</h1>
  <p>${esc(w.d)}</p>
  <p><b>Ветер:</b> ${from}ный, ${wind.v} м/с (стрелка в углу карты показывает, куда дует).</p>
  ${fc}
  <table class="wx"><tr><th>Что</th><th>Эффект</th><th></th></tr>
  ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="mu">${r[2]}</td></tr>`).join('')}</table>
  <p class="mu">${def ? 'Совет: в туман и снег держите радары включёнными — посты слепнут; против ветра «мопеды» идут дольше, по ветру — быстрее.' : 'Совет: пускайте лёгкие дроны по ветру; в обледенение часть не долетит; в туман их посты слепые.'}</p>
  <div class="acts"><button class="btn pri" data-a="close">Понятно</button></div>`);
}
