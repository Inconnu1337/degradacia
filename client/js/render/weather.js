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
  for (let i = 0; i < 40; i++) a.push({ x: rnd() * 560, y: rnd() * 440, r: 16 + rnd() * 30, k: .6 + rnd() * .4 });
  return a;
})();


function drawWeather(s) {
  const w = G.weather;
  if (!w) return;
  const L = WX_LOOK[w.vis] || WX_LOOK.clear;
  const wind = G.wind || { a: 0, v: 0 };
  const wx = Math.cos(wind.a), wy = Math.sin(wind.a);
  /* погода — только над картой края */
  cx.save();
  clipMap();

  /* облака дрейфуют по ветру: смещение растёт с игровым временем и анимацией */
  if (L.cloud) {
    /* дрейф облаков — по игровому времени: на паузе они стоят, а при перемотке плывут быстрее */
    const drift = G.t * .004 * (wind.v + 2) / 10;
    const sx = WW + 80, sy = WH + 80;
    for (const p of WX_PUFFS) {
      const x = ((p.x + wx * drift) % sx + sx) % sx - 40;
      const y = ((p.y + wy * drift) % sy + sy) % sy - 40;
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
  cx.restore();
}

/** обрезать рисование прямоугольником карты (в экранных координатах) */
function clipMap() {
  const a = w2s({ x: 0, y: 0 }), b = w2s({ x: WW, y: WH });
  cx.beginPath();
  cx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
  cx.clip();
}

/* осадки: частицы живут в координатах карты (км) — двигаются вместе с ней при прокрутке и масштабе */
let WX_DROPS = [];

/** осадки поверх всего; на паузе замирают */
function drawPrecip(dtms) {
  const w = G.weather;
  const L = w && (WX_LOOK[w.vis] || WX_LOOK.clear);
  if (!L || (!L.rain && !L.snow)) { WX_DROPS = []; return }
  const s = G.view.s, wind = G.wind || { a: 0, v: 0 };
  /* видимая область карты в км */
  const a = s2w({ x: 0, y: 0 }), b = s2w({ x: CW, y: CH });
  const vw = b.x - a.x, vh = b.y - a.y;
  const n = L.rain ? 170 : 120;
  while (WX_DROPS.length < n) WX_DROPS.push({ x: a.x + Math.random() * vw, y: a.y + Math.random() * vh, z: .5 + Math.random() * .5, ph: Math.random() * 9 });
  const k = worldRuns() ? dtms / 1000 : 0;
  /* скорость падения задана в пикселях экрана — переводим в км текущего масштаба */
  const fall = (L.rain ? 520 : 55) / s, vx = Math.cos(wind.a) * wind.v * (L.rain ? 9 : 6) / s;
  cx.save();
  clipMap();
  if (L.rain) { cx.strokeStyle = 'rgba(170,200,225,.22)'; cx.lineWidth = 1; cx.beginPath() }
  else cx.fillStyle = 'rgba(235,242,248,.55)';
  for (const d of WX_DROPS) {
    d.x += (vx + (L.snow ? Math.sin(GANIM * 1.3 + d.ph) * 12 / s : 0)) * k * d.z;
    d.y += fall * k * d.z;
    /* после резкой смены масштаба — заново в видимой области */
    if (d.x < a.x - vw || d.x > b.x + vw || d.y < a.y - vh || d.y > b.y + vh) { d.x = a.x + Math.random() * vw; d.y = a.y + Math.random() * vh }
    /* вышла за видимую область — возвращается с другой стороны */
    if (d.y > b.y) { d.y -= vh; d.x = a.x + Math.random() * vw }
    else if (d.y < a.y) d.y += vh;
    if (d.x > b.x) d.x -= vw; else if (d.x < a.x) d.x += vw;
    const q = w2s(d);
    if (L.rain) { cx.moveTo(q.x, q.y); cx.lineTo(q.x - vx * s * .02, q.y - 12 * d.z) }
    else cx.fillRect(q.x, q.y, 1.6 * d.z + .6, 1.6 * d.z + .6);
  }
  if (L.rain) cx.stroke();
  cx.restore();
}

/** левый край карты, не закрытый панелью — там рисуются роза ветра и линейка */
let __mapLeftT = 0, __mapLeft = 0;
function mapLeft() {
  if (ANIM - __mapLeftT > .4) {
    __mapLeftT = ANIM;
    const p = document.getElementById('left');
    __mapLeft = 0;
    if (p && p.getBoundingClientRect && !p.classList.contains('col')) {
      const r = p.getBoundingClientRect(), c = cv.getBoundingClientRect ? cv.getBoundingClientRect() : { left: 0 };
      if (r.width && r.right > c.left) __mapLeft = r.right - c.left;
    }
  }
  return __mapLeft;
}

/** роза ветра в левом нижнем углу карты */
function drawWindRose() {
  const wind = G.wind;
  if (!wind) return;
  const x = mapLeft() + 46, y = CH - 60;
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
  <p><b>Ветер:</b> ${windName(wind.a)}, ${wind.v} м/с (стрелка в углу карты показывает, куда дует).</p>
  ${fc}
  <table class="wx"><tr><th>Что</th><th>Эффект</th><th></th></tr>
  ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="mu">${r[2]}</td></tr>`).join('')}</table>
  <p class="mu">${def ? 'Совет: в туман и снег держите радары включёнными — посты слепнут; против ветра «мопеды» идут дольше, по ветру — быстрее.' : 'Совет: пускайте лёгкие дроны по ветру; в обледенение часть не долетит; в туман их посты слепые.'}</p>
  <div class="acts"><button class="btn pri" data-a="close">Понятно</button></div>`);
}
