'use strict';
/* ============================================================
   УТРЕННЯЯ ГАЗЕТА (сервер)
   ------------------------------------------------------------
   На рассвете движок фиксирует факты ночи (nightFacts), а утром,
   с началом нового дня, каждая сторона получает свою газету:
     ПВО   — «Привельский вестник», краевая газета: что пережил край,
             герои ночи, память, письмо читателя, прогноз на ночь;
     налёт — «Вестник Федерации», официоз другой стороны.
   Вёрстка — классы .np-* (client/css/paper.css).
   ============================================================ */

const NP_WEEK = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

function npDate(night) {
  const d = 12 + night;
  return { day: NP_WEEK[(night + 2) % 7], date: `${d} ноября` };
}

/** факты ночи — снимаются на рассвете, пока статистика ночи ещё цела */
function nightFacts() {
  const sumv = o => Object.values(o).reduce((a, b) => a + b, 0);
  const launched = sumv(S.launched), killed = sumv(S.killed), ew = sumv(S.ew);
  const hits = Object.entries(S.objHit || {}).map(([id, d]) => { const o = objById(id); return o && { n: o.n, type: o.type, city: o.city ? o.city.gen : '', dmg: Math.round(d), hp: Math.round(o.hp) } })
    .filter(Boolean).sort((a, b) => b.dmg - a.dmg);
  let best = null;
  for (const u of G.units) if (!UT[u.k].fake && (u.nk || 0) > (best ? best.nk : 0)) best = { cs: u.crew.cs, n: UT[u.k].n, nk: u.nk, trait: u.crew.trait };
  return {
    night: G.night, en: Math.round(energy()), morale: Math.round(G.morale), civ: S.civ, civTotal: G.civTotal,
    launched, killed, ew, rate: launched ? (killed + ew) / launched : 1, hits: hits.slice(0, 4),
    fires: G.objs.filter(o => o.fire > 0).length, best,
    fallen: (G.fallen || []).filter(f => f.night === G.night),
    honors: (G.honors || []).filter(h => h.night === G.night),
    alarmH: Math.round(S.alarmCost / ALARM_COST_H * 10) / 10, falseAlarm: Math.round(S.falseAlarm / 60),
    rescue: S.rescue || 0, ice: S.ice || 0, weather: G.weather.n,
    feints: (E.feints || []).length, lostAtk: launched - (sumv(S.hits) || 0)
  };
}

const npP = s => `<p>${s}</p>`;

/** 1 цель · 2 цели · 5 целей */
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
const goals = n => n + ' ' + plural(n, 'цель', 'цели', 'целей');

/* ---------- иллюстрации в газетной манере ----------
   Те же профили техники и объектов, что на карте (shared/data/icons.js),
   но как гравюра: корпус — косая штриховка, тени — перекрёстная,
   тёмные детали — тушь, светлые — бумага. */
const NP_INK = '#1d1b17', NP_PAPER = '#efe7d3';
const NP_PAL = { b: 'url(#npH)', s: 'url(#npX)', l: NP_PAPER, d: NP_INK, g: 'url(#npD)', a: NP_INK, stroke: NP_INK, sw: .9 };

const NP_DEFS = `<defs>
  <pattern id="npH" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="3" height="3" fill="${NP_PAPER}"/><rect width="3" height=".75" fill="${NP_INK}" opacity=".85"/></pattern>
  <pattern id="npX" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="2.6" height="2.6" fill="${NP_PAPER}"/><rect width="2.6" height=".9" fill="${NP_INK}"/><rect width=".9" height="2.6" fill="${NP_INK}"/></pattern>
  <pattern id="npD" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="${NP_PAPER}"/><circle cx="1.5" cy="1.5" r=".6" fill="${NP_INK}"/></pattern>
  <pattern id="npSky" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="${NP_PAPER}"/><rect y="1.6" width="4" height=".55" fill="${NP_INK}" opacity=".55"/></pattern>
  <linearGradient id="npFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <mask id="npSkyM"><rect width="400" height="200" fill="url(#npFade)"/></mask>
</defs>`;

/** дым: клубы, растущие и сносимые ветром вправо */
function npSmoke(x, y, h, w) {
  let out = '';
  for (let i = 0; i < 7; i++) {
    const k = i / 6, r = w * (.5 + k * 1.6);
    out += `<circle cx="${_n(x + k * k * w * 5)}" cy="${_n(y - k * h)}" r="${_n(r)}" fill="url(#npX)" stroke="${NP_INK}" stroke-width=".6" opacity="${_n(.9 - k * .45)}"/>`;
  }
  return out;
}

/** откуда на иконке объекта идёт дым (координаты сетки иконки) */
const NP_SMOKE = { power: [[91, 4], [104, 14]], oil: [[111, -2], [62, 26]], plant: [[79, 6]], port: [[99, 26]], rail: [[106, 20]], air: [[28, 24]], sub: [[54, 30]], dam: [[92, 36]], water: [[68, 30]] };

/** луч прожектора */
const npBeam = (x, y, x2, y2, w) => `<path d="M${x} ${y} L${x2 - w} ${y2} L${x2 + w} ${y2} Z" fill="url(#npH)" opacity=".35"/>`;

/** силуэт дрона в небе (как на карте: треугольное крыло) */
const npDrone = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k})"><path d="M0 0 L-14 -9 L-11 0 L-14 9 Z M-12 -2 h-6 v4 h6 Z" fill="${NP_INK}"/></g>`;

const npIcon = (key, x, y, scale, flip) => iconSVG(key, x, y, scale, NP_PAL, flip);

function npFigure(kind, cap, objType) {
  const G0 = 186;   /* линия земли сцены */
  const ground = `<rect x="0" y="${G0}" width="400" height="14" fill="url(#npX)"/><rect x="0" y="${G0}" width="400" height="1.4" fill="${NP_INK}"/>`;
  const sky = `<rect width="400" height="${G0}" fill="url(#npSky)" mask="url(#npSkyM)"/>`;
  const at = (key, cx, sc, flip) => npIcon(key, cx - ICON_W * sc / 2, G0 - ICON_GROUND * sc, sc, flip);
  let scene = '';
  if (kind === 'plant' || kind === 'object') {
    const key = objType || 'power', sc = 2.3, x0 = 200 - ICON_W * sc / 2, y0 = G0 - ICON_GROUND * sc;
    scene = at('block', 52, .7) + at('block', 352, .62) + at(key, 200, sc)
      + (NP_SMOKE[key] || [[60, 20]]).map(([ix, iy], i) => npSmoke(x0 + ix * sc, y0 + iy * sc, 95 - i * 25, 8 - i * 2)).join('');
  } else if (kind === 'city') {
    scene = npBeam(70, G0 - 30, 150, 0, 14) + npBeam(330, G0 - 30, 250, 0, 12)
      + at('block', 92, 1.05) + at('block', 300, .95) + at('block', 196, 1.35)
      + npSmoke(196 + 40, G0 - 54 * 1.35 + 8, 60, 5);
  } else if (kind === 'sky') {
    scene = npBeam(84, G0 - 40, 170, 0, 16) + npBeam(318, G0 - 40, 230, 0, 14)
      + npDrone(205, 46, 1.2) + npDrone(150, 70, .8)
      + at('light', 84, 1.05) + at('light', 318, 1.05, true) + at('block', 200, .8);
  } else {
    const sc = 1.9, x0 = 160 - ICON_W * sc / 2, y0 = G0 - ICON_GROUND * sc, tx = x0 + 76 * sc, ty = y0 + 2 * sc;
    scene = `<path d="M${_n(tx)} ${_n(ty)} C${_n(tx + 40)} ${_n(ty - 40)} 300 30 360 12" fill="none" stroke="${NP_INK}" stroke-width="1.6" stroke-dasharray="6 5"/>`
      + npSmoke(tx - 6, ty + 6, 26, 3)
      + `<path d="M352 18 l14 -12 l-4 17 z" fill="${NP_INK}"/>`
      + at('block', 340, .6) + at('shield', 160, 1.9);
  }
  return `<figure class="np-fig"><svg viewBox="0 0 400 200" role="img" aria-label="${esc(cap)}">${NP_DEFS}${sky}${scene}${ground}</svg><figcaption>${esc(cap)}</figcaption></figure>`;
}

/* ---------- «Привельский вестник» — газета края (сторона ПВО) ---------- */
function paperDef(f) {
  const d = npDate(f.night + 1), top = f.hits[0];
  const quiet = f.launched < 8, good = f.rate > .85 && (!top || top.dmg < 20);
  let head, deck, fig, figCap, figObj = null;
  if (f.en < 40) {
    head = 'Край без света'; fig = 'plant';
    deck = `Энергосистема Привелья работает на ${f.en}%. Энергетики переходят на графики отключений`;
    figCap = 'Энергетики работают круглосуточно. Рисунок нашего корреспондента';
  } else if (f.civ >= 8) {
    head = `Тяжёлая ночь${top && top.city ? ' для ' + top.city : ''}`; fig = 'city';
    deck = `${f.civ} пострадавших. Власти края объявили день траура`;
    figCap = 'Спасатели работали до утра';
  } else if (top && top.dmg >= 25) {
    head = `Под ударом — ${top.n}`; fig = 'object'; figObj = top.type;
    deck = top.hp <= 5 ? 'Объект выведен из строя. Ремонтные бригады уже на месте' : `Объект повреждён, состояние ${top.hp}%. Ремонтные бригады уже на месте`;
    figCap = `${top.n} наутро после удара`;
  } else if (quiet) {
    head = 'Тихая ночь над Привельем'; fig = 'sky';
    deck = 'Противник ограничился единичными пусками. Дежурные расчёты не покидали позиций';
    figCap = 'Прожекторы над краевым центром';
  } else if (good) {
    head = 'Ночь, которую выстояли'; fig = 'launch';
    deck = `Силы ПВО перехватили ${f.killed} целей из ${f.launched}. ${f.civ ? 'Пострадавших — ' + f.civ : 'Обошлось без пострадавших'}`;
    figCap = 'Зенитный расчёт на позиции. Рисунок с натуры';
  } else {
    head = 'Привелье под ударом'; fig = 'sky';
    deck = `Сбито ${f.killed} из ${f.launched} воздушных целей, есть попадания по объектам`;
    figCap = 'Небо над краем этой ночью';
  }
  const lead = `Ночью ${f.night}-го дня обороны противник выпустил по Привельскому краю ${f.launched || 'единичные'} ${f.launched ? 'воздушных целей' : 'цели'}. `
    + (f.killed ? `Силы ПВО уничтожили ${f.killed}${f.ew ? ', ещё ' + f.ew + ' увела с курса радиоэлектронная борьба' : ''}. ` : '')
    + (f.hits.length ? `Есть попадания: ${f.hits.slice(0, 3).map(h => esc(h.n)).join(', ')}. ` : 'Попаданий по важным объектам нет. ')
    + (f.civ ? `По данным краевой администрации, пострадали ${f.civ} человек. ` : '')
    + (f.alarmH ? `Воздушная тревога длилась около ${num(f.alarmH, 1)}&nbsp;ч.` : 'Тревогу в крае не объявляли.');
  const body2 = (f.fires ? `Утром ещё горели ${f.fires} объект${f.fires > 1 ? 'а' : ''}, пожарные работают. ` : '')
    + (f.rescue ? `При повторном ударе пострадали ${f.rescue} спасателей и ремонтников. ` : '')
    + (f.falseAlarm > 30 ? 'Часть жителей жалуется на «тревоги впустую»: в убежищах ночь прошла без единого взрыва поблизости. ' : '')
    + (f.ice ? `По данным метеорологов, часть дронов противника упала из-за обледенения (${f.ice}). ` : '')
    + `Настроение в крае редакция оценивает как ${f.morale >= 70 ? 'спокойное и собранное' : f.morale >= 45 ? 'усталое: люди держатся, но ждут перемен' : 'тяжёлое: в очередях за водой говорят об эвакуации'}.`;

  const W = G.weather, wind = G.wind || { v: 0, a: 0 };
  const fc = G.wxNext ? `К ${clock(G.wxNext.t)} ожидается: ${esc(wxById(G.wxNext.id).n.toLowerCase())}.` : 'Существенных изменений не ожидается.';

  const heroes = f.honors.length
    ? f.honors.map(h => npP(`Расчёт «${esc(h.cs)}» (${esc(h.n)}) сбил ${h.kills}-ю цель и заслужил звание «${esc(h.title)}».`)).join('')
    : f.best ? npP(`Лучшим расчётом ночи штаб называет «${esc(f.best.cs)}» (${esc(f.best.n)}): ${goals(f.best.nk)}. Командир — ${esc(f.best.trait)}, «работали спокойно, как учили».`)
      : npP('Этой ночью штаб не выделяет отдельных расчётов: работали все.');
  const memory = f.fallen.length
    ? f.fallen.map(x => npP(`<b>«${esc(x.cs)}»</b>, ${esc(x.n)}. ${x.kills ? 'На счету расчёта ' + goals(x.kills) + '.' : ''}`)).join('') + npP('<i>Край помнит.</i>')
    : npP('Этой ночью потерь среди расчётов ПВО нет.');
  const letter = pick(f.morale >= 60 ? [
    'Спасибо ребятам с зенитками. Слышали, как работали над нашим районом, — спали спокойнее. <span>— Ольга Д., Вельград</span>',
    'Прошу редакцию передать привет расчёту, что стоит за нашей фермой. Носили им молоко — отказываются, говорят, на посту. <span>— семья Ковальчук</span>',
    'Тревогу объявили вовремя, успели спуститься в подвал. Всё правильно. <span>— пенсионер, Кремнев</span>'
  ] : [
    ...(f.en < 70 ? [`${f.night > 1 ? (['', '', 'Вторую', 'Третью', 'Четвёртую', 'Пятую'][f.night] || 'Которую') + ' ночь' : 'Всю ночь'} без света. Дети делают уроки при свечах. Когда это кончится? <span>— учительница, Ставно</span>`] : []),
    'Сирена воет, а взрывов нет. А когда взрывы — сирены нет. Кто там у вас решает? <span>— читатель из Лозовой</span>',
    'Воду носим с колонки, лифт стоит. Держимся, но силы на исходе. <span>— жильцы дома № 14</span>'
  ]);
  const ads = [
    f.en < 70 ? 'ГЕНЕРАТОРЫ в аренду. Доставка по краю. Тел. 2-14-60' : 'КУРСЫ первой помощи при краевой больнице. Бесплатно',
    'ТРЕБУЮТСЯ электромонтёры, сварщики. Работа срочная. Энергосбыт',
    'ДОНОРЫ! Станции переливания нужна кровь всех групп',
    'УБЕЖИЩЕ на ул. Речной открыто круглосуточно'
  ];
  return `<div class="paper">
  <div class="np-top"><span>№ ${200 + f.night} (8 9${10 + f.night})</span><span>Выходит с 1924 года</span><span>Цена 3 лиры</span></div>
  <div class="np-mast">Привельский вестник</div>
  <div class="np-sub"><span>${d.day}, ${d.date}</span><span>Общественно-политическая газета Привельского края</span><span>Утренний выпуск</span></div>
  <h1 class="np-head">${esc(head)}</h1>
  <div class="np-deck">${esc(deck)}</div>
  <div class="np-grid">
    <div class="np-main">
      ${npFigure(fig, figCap, figObj)}
      <p class="np-lead">${lead}</p>
      ${npP(body2)}
    </div>
    <aside class="np-side">
      <div class="np-box"><h3>Сводка штаба</h3>
        <table><tr><td>Воздушных целей</td><td>${f.launched}</td></tr><tr><td>Уничтожено</td><td>${f.killed}</td></tr>
        <tr><td>Подавлено РЭБ</td><td>${f.ew}</td></tr><tr><td>Энергосистема</td><td>${f.en}%</td></tr>
        <tr><td>Пострадавшие</td><td>${f.civ}</td></tr><tr><td>Тревога</td><td>${f.alarmH ? num(f.alarmH, 1) + ' ч' : 'нет'}</td></tr></table></div>
      <div class="np-box np-wx"><h3>Погода на ночь</h3>
        <div class="np-wxn">${esc(W.n)}</div>
        <p>Ветер ${windName(wind.a)}, ${wind.v}&nbsp;м/с. ${fc}</p>
        <p class="np-small">${esc(W.d)}</p></div>
    </aside>
  </div>
  <div class="np-cols">
    <section><h4>Герои ночи</h4>${heroes}</section>
    <section><h4>Память</h4>${memory}</section>
    <section><h4>Письмо в редакцию</h4><p class="np-letter">${letter}</p></section>
  </div>
  <div class="np-ads">${ads.map(a => `<div>${esc(a)}</div>`).join('')}</div>
  <div class="np-acts"><button class="np-btn" data-a="close">Отложить газету и к делу</button></div>
</div>`;
}

/* ---------- «Вестник Федерации» — газета другой стороны (налёт) ---------- */
function paperAtk(f) {
  const d = npDate(f.night + 1), top = f.hits[0];
  const hit = f.en < 60 || (top && top.dmg >= 25);
  const head = hit ? 'Энергетика противника выведена из строя' : f.killed > f.launched * .6 ? 'ПВО противника несёт расходы' : 'Удары продолжаются';
  const deck = hit
    ? `По данным разведки, энергосистема края работает на ${f.en}%${top ? '. Поражён объект: ' + top.n : ''}`
    : `Привельская ПВО израсходовала ракеты на ${f.killed} целей, многие из которых были имитаторами`;
  const lead = `Минувшей ночью воздушные силы Федерации нанесли удары по объектам Привельского края. Выпущено средств: ${f.launched}. `
    + (f.hits.length ? `Подтверждены попадания: ${f.hits.slice(0, 3).map(h => esc(h.n)).join(', ')}. ` : 'Данные объективного контроля уточняются. ')
    + `Противник заявляет о ${f.killed} сбитых целях${f.ew ? ' и ' + f.ew + ' «потерявших курс»' : ''}; наш штаб эти цифры не комментирует.`;
  const body = (f.fires ? `Над краем утром видны дымы: пожары как минимум на ${f.fires} объектах. ` : '')
    + (f.feints ? `Отдельно отмечается работа «демонстрационных групп», заставивших ПВО противника выдать себя. ` : '')
    + (f.civ ? `Противная сторона сообщает о пострадавших (${f.civ}); военные обещают проверить данные. ` : '')
    + `Настроения в крае противника, по данным наблюдателей, ${f.morale >= 70 ? 'пока устойчивые' : f.morale >= 45 ? 'ухудшаются' : 'близки к панике'}.`;
  const W = G.weather, wind = G.wind || { v: 0, a: 0 };
  return `<div class="paper np-atk">
  <div class="np-top"><span>№ ${600 + f.night}</span><span>Официальный выпуск</span><span>Распространяется бесплатно</span></div>
  <div class="np-mast">Вестник Федерации</div>
  <div class="np-sub"><span>${d.day}, ${d.date}</span><span>Издание командования Аскенийской Федерации</span><span>Для служебного пользования</span></div>
  <h1 class="np-head">${esc(head)}</h1>
  <div class="np-deck">${esc(deck)}</div>
  <div class="np-grid">
    <div class="np-main">
      ${npFigure(hit ? 'object' : 'launch', hit ? 'Объект противника. Снимок с разведывательного борта' : 'Пусковые расчёты на позиции', top ? top.type : 'power')}
      <p class="np-lead">${lead}</p>
      ${npP(body)}
    </div>
    <aside class="np-side">
      <div class="np-box"><h3>Итоги ночи</h3>
        <table><tr><td>Выпущено</td><td>${f.launched}</td></tr><tr><td>Заявлено сбитыми</td><td>${f.killed}</td></tr>
        <tr><td>Увели с курса</td><td>${f.ew}</td></tr><tr><td>Энергия противника</td><td>${f.en}%</td></tr>
        <tr><td>Ложная активность</td><td>${f.feints}</td></tr></table></div>
      <div class="np-box np-wx"><h3>Метеосводка</h3>
        <div class="np-wxn">${esc(W.n)}</div>
        <p>Ветер ${wind.v} м/с. ${G.wxNext ? 'Ожидается смена погоды около ' + clock(G.wxNext.t) + '.' : 'Устойчиво.'}</p></div>
    </aside>
  </div>
  <div class="np-ads"><div>СЛУЖБА ПО КОНТРАКТУ — пусковые расчёты</div><div>Не обсуждайте службу по телефону</div><div>Бдительность — оружие</div></div>
  <div class="np-acts"><button class="np-btn" data-a="close">Отложить газету</button></div>
</div>`;
}

/** утром: каждой живой стороне — её газета */
function deliverPapers() {
  const f = G.facts;
  if (!f) return;
  for (const r of MODE.humans) asSide(r, () => showModal(r === 'def' ? paperDef(f) : paperAtk(f)));
}
