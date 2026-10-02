'use strict';
/* ============================================================
   ОБОРОНА: панели (клиент)
   Верхняя строка, вкладки, карточки расчёта/цели/объекта, справка.
   Разбор ночи и итоги считает сервер (game/modes/defense/flow.js).
   ============================================================ */

const DefenseUI = (() => {
  function setSpeedBtns() { renderSpeedBox('Заступить на дежурство ▶') }

  /** вероятность поражения по классу; класс неопознанной цели неизвестен — берём лучший случай */
  const pkFor = (W, th) => th.cls === 'unknown' ? Math.max(0, ...Object.values(W.pk)) : (W.pk[th.cls] || 0);

  /* ---------- верхняя строка ---------- */
  function renderTop() {
    $('#hdNight').textContent = G.phase === 'prep' ? ` · день ${G.night}, подготовка`
      : G.phase === 'night' ? ` · ночь ${G.night} из ${NIGHTS_TOTAL}` : ` · ночь ${G.night}`;
    $('#hdClock').textContent = G.phase === 'prep' ? 'День' : clock(G.t);
    $('#hdBud').textContent = Math.round(G.budget) + ' млн';
    const en = energy();
    const eEl = $('#hdEn');
    eEl.textContent = Math.round(en) + '%';
    eEl.style.color = hpCol(en);
    $('#hdCiv').textContent = (S ? S.civ : 0) + (G.civTotal ? ' / ' + G.civTotal : '');
    const thEl = $('#hdThr');
    thEl.textContent = G.det || 0;
    thEl.style.color = (G.det || 0) > 0 ? '#ff5b47' : '#7f909c';
    $('#hdWx').textContent = G.weather.n;
    const ab = $('#btnAlarm');
    ab.textContent = G.alarm ? 'ТРЕВОГА · ' + fmtDur(G.alarmT) : 'Тревога: выкл';
    ab.className = 'btn' + (G.alarm ? ' alarm' : '');
    ab.title = G.alarm
      ? `Тревога объявлена. Потери среди населения снижены. Расход ${ALARM_COST_H} млн/ч. Доверие населения: ${pc(G.alarmTrust)}`
      : 'Объявить воздушную тревогу в крае';
  }

  /* ---------- вкладки ---------- */
  function renderTabs() {
    const L = [['radio', 'Эфир'], ['intel', 'Разведка'], ['obj', 'Объекты']];
    if (G.spoil && G.spoilable) L.push(['mind', 'Противник']);
    $('#tabsL').innerHTML = L.map(([k, n]) =>
      `<button data-a="tabL" data-v="${k}" class="${G.tabL === k ? 'on' : ''}">${n}${G.unread[k] ? `<i>${G.unread[k]}</i>` : ''}</button>`).join('');
    for (const [k] of [['radio'], ['intel'], ['obj'], ['mind']]) {
      const e = $('#lc_' + k);
      if (e) e.style.display = G.tabL === k ? '' : 'none';
    }
    const R2 = [['ord', 'Приказы' + (G.reqs.length ? ' (' + G.reqs.length + ')' : '')], ['frc', 'Силы'], ['sup', 'Снабжение']];
    $('#tabsR').innerHTML = R2.map(([k, n]) =>
      `<button data-a="tabR" data-v="${k}" class="${G.tabR === k ? 'on' : ''}">${n}</button>`).join('');
    tabsDirty = false;
  }

  /* ---------- карточки ---------- */
  function unitCard(u) {
    const T = UT[u.k], c = u.crew, W = T.w;
    const hp = u.hp / T.hp;
    let h = `<div class="card"><h3>«${esc(c.cs)}» <span class="mu">· ${esc(T.sh)}</span></h3>
  <div class="sub">${esc(T.n)}</div>
  <div class="row"><span>Состояние</span><b style="color:${stColor(u)}">${unitStatus(u)}</b></div>
  <div class="row"><span>Живучесть</span><b style="color:${hpCol(hp * 100)}">${Math.round(hp * 100)}%</b></div>${bar(hp, hpCol(hp * 100))}`;
    if (W) {
      h += `<div class="row"><span>Боекомплект</span><b style="color:${u.am === 0 ? 'var(--rd)' : 'var(--tx)'}">${u.am} / ${W.am}</b></div>${bar(u.am / W.am, u.am === 0 ? 'var(--rd)' : '#6cc3ff')}`;
    }
    h += `<div class="row"><span>Командир</span><b>${c.trait}</b></div>
  <div class="row mu"><span>Слаженность ${pc(c.exp)}</span><span>Усталость ${pc(c.fat)}</span></div>
  <div class="row mu"><span>Сбито целей: ${u.kills}</span><span>Позиция: кв. ${sq(u)}</span></div>`;
    if (T.radar) h += `<div class="row"><span>РЛС</span><b style="color:${u.rOn ? '#6cc3ff' : 'var(--mu)'}">${u.rOn ? 'излучает' : 'молчит'}</b></div>`;
    if (u.cover) { const o = objById(u.cover); if (o) h += `<div class="row"><span>Прикрывает</span><b>${esc(o.n)}</b></div>` }
    if (T.air) h += `<div class="row"><span>Топливо</span><b>${fmtDur(u.fuel)}</b></div>${bar(u.fuel / T.fuel, '#6cc3ff')}`;
    h += `<div class="lbl">Возможности</div><div class="hint">${esc(T.d)}</div>`;
    if (W) {
      h += `<div class="row mu"><span>Дальность поражения</span><span>${W.r} км${W.rb ? ` (баллистика ${W.rb} км)` : ''}</span></div>`;
      if (W.mc) h += `<div class="row mu"><span>Цена выстрела</span><span>${num(W.mc)} млн</span></div>`;
    }
    if (T.radar) h += `<div class="row mu"><span>Дальность обнаружения</span><span>${T.radar} км (низколетящие — до ${HORIZON.low} км)</span></div>`;
    if (T.eo) h += `<div class="row mu"><span>Оптика и слух</span><span>${T.eo} км</span></div>`;

    h += '<div class="lbl">Приказы</div><div class="acts">';
    h += `<button class="btn sm ${G.mode && G.mode.t === 'move' ? 'on' : ''}" data-a="mMove">${T.air ? 'Перебазировать' : 'Выдвинуться'}</button>`;
    if (T.air) {
      h += `<button class="btn sm ${G.mode && G.mode.t === 'patrol' ? 'on' : ''}" data-a="mPatrol">Патрулирование</button>`;
      if (u.st === 'air') h += `<button class="btn sm" data-a="ord" data-o="rtb">На площадку</button>`;
    }
    if (W) h += `<button class="btn sm ${G.mode && G.mode.t === 'cover' ? 'on' : ''}" data-a="mCover">Прикрыть объект</button>`;
    if (W && u.am < W.am) h += `<button class="btn sm" data-a="ord" data-o="reload" ${G.budget < u.rc ? 'disabled' : ''}>Пополнить БК · ${num(u.rc)} млн</button>`;
    h += `<button class="btn sm" data-a="ord" data-o="cancel">Отставить</button>`;
    if (G.phase === 'prep') h += `<button class="btn sm warn" data-a="sell">Расформировать · +${Math.round(T.cost * .6)}</button>`;
    h += '</div>';
    if (W) h += `<div class="lbl">Режим огня</div>${seg('roe', u.roe, [['free', 'свободный', 'Работать по всем целям'], ['eco', 'экономный', 'Дорогие ракеты — только по опасным целям и по угрозам прикрываемому объекту'], ['hold', 'запрет', 'Не открывать огонь: сохранить скрытность и боекомплект']])}`;
    if (T.radar || T.fake) h += `<div class="lbl">Режим излучения</div>${seg('radar', u.radar, [['on', 'постоянно', 'Видим дальше всех, но нас пеленгуют'], ['cue', 'по целеуказанию', 'Включаемся, когда сеть видит цели рядом'], ['off', 'молчание', 'Полностью скрыты, но ракеты наводить нечем']])}`;
    return h + '</div>';
  }

  function trackCard(th) {
    const T = TT[th.k] || {}, o = predictObj(th);
    const spd = Math.round(th.sp * 3600);
    const cap = G.units.filter(u => UT[u.k].w && pkFor(UT[u.k].w, th) > .05)
      .sort((a, b) => dist(a, th) - dist(b, th)).slice(0, 4);
    const age = G.t - th.seen;
    let h = `<div class="card"><h3>${esc(thTitle(th))}</h3>
  <div class="sub">${age < 4 ? 'наблюдается' : 'контакт потерян ' + fmtDur(age) + ' назад'} · кв. ${sq(th)}</div>
  <div class="row"><span>Класс</span><b>${th.idLv <= 0 ? 'не установлен' : CLS_N[percCls(th)]}</b></div>
  <div class="row"><span>Высота</span><b>${th.alt === 'high' ? 'большая' : th.alt === 'mid' ? 'средняя' : 'малая'}</b></div>
  <div class="row"><span>Скорость</span><b>${th.idLv <= 0 ? '≈' + Math.round(spd / 50) * 50 : spd} км/ч</b></div>
  <div class="row"><span>Курс</span><b>${DIRS[dirIdx(th.hx, th.hy)]}</b></div>
  <div class="row"><span>От штаба</span><b>${num(dist(G.hq, th), 0)} км, азимут ${az(G.hq, th)}</b></div>`;
    if (th.lost) h += `<div class="row"><span>Навигация</span><b class="good">подавлена РЭБ</b></div>`;
    if (th.idDecoy) h += `<div class="row"><span>Опознано</span><b class="good">имитатор, боевой части нет</b></div>`;
    if (o) h += `<div class="row"><span>Под угрозой</span><b class="bad" data-a="selo" data-id="${o.id}" style="cursor:pointer">${esc(o.n)}</b></div>`;
    if (th.armTgt) { const u = unitById(th.armTgt); if (u) h += `<div class="row"><span>Наводится на</span><b class="bad">«${esc(u.crew.cs)}»</b></div>` }
    if (th.idLv >= 2) h += `<div class="lbl">Что известно о типе</div><div class="hint">${esc(T.d)}</div>`;
    else h += `<div class="lbl">Опознавание</div><div class="hint">Тип пока не установлен. Радар набирает данные, посты дают опознавание вблизи.</div>`;
    if (th.eng) h += `<div class="row"><span>По цели работают</span><b>${th.eng} ракет(ы) в воздухе</b></div>`;
    if (cap.length) {
      h += '<div class="lbl">Назначить задачу расчёту</div>';
      for (const u of cap) {
        const d = dist(u, th), inR = d <= UT[u.k].w.r;
        h += `<div class="fl" data-a="assign" data-id="${u.id}" data-th="${th.id}">
        <span class="dot" style="background:${stColor(u)}"></span>
        <span class="nm">«${esc(u.crew.cs)}» ${UT[u.k].sh}</span>
        <span class="mu">${num(d, 0)} км${inR ? '' : ' (вне зоны)'}</span></div>`;
      }
    }
    return h + '</div>';
  }

  function objCard(o) {
    const def = G.units.filter(u => UT[u.k].w && dist(u, o) < UT[u.k].w.r);
    const bal = G.units.filter(u => UT[u.k].w && UT[u.k].w.rb && dist(u, o) < UT[u.k].w.rb);
    let h = `<div class="card"><h3>${esc(o.n)}</h3>
  <div class="sub">${OT[o.type].n} · важность ${o.v}${o.city ? ' · ' + o.city.n : ''}</div>
  <div class="row"><span>Состояние</span><b style="color:${hpCol(o.hp)}">${Math.round(o.hp)}%</b></div>${bar(o.hp / 100, hpCol(o.hp))}
  ${OT[o.type].en ? '<div class="row mu"><span>Входит в энергосистему края</span></div>' : ''}
  <div class="lbl">Прикрытие (${def.length})</div>`;
    h += def.length
      ? def.map(u => `<div class="fl" data-a="selu" data-id="${u.id}">
        <span class="dot" style="background:${stColor(u)}"></span>
        <span class="nm">«${esc(u.crew.cs)}» ${UT[u.k].sh}</span>
        <span class="mu">${UT[u.k].w ? u.am + '/' + UT[u.k].w.am : ''}</span></div>`).join('')
      : '<div class="hint bad">Объект не прикрыт огневыми средствами.</div>';
    h += bal.length ? '<div class="hint good">Прикрыт от баллистики.</div>' : '<div class="hint mu">От баллистики не прикрыт.</div>';
    if (G.phase === 'prep' && o.hp < 100) {
      h += `<div class="acts"><button class="btn" data-a="repair" data-id="${o.id}" ${o.rep || G.budget < repCost(o) ? 'disabled' : ''}>Ремонт +30% · ${repCost(o)} млн</button></div>`;
      if (o.rep) h += '<div class="hint mu">Ремонтная бригада уже работала здесь в эти сутки.</div>';
    }
    return h + '</div>';
  }

  /* ---------- правая панель ---------- */
  function renderRight() {
    let h = '';
    if (G.tabR === 'ord') {
      if (G.reqs.length) {
        h += '<div class="gh">Запросы расчётов</div>';
        for (const r of G.reqs) h += `<div class="req">
        <span class="rt">${fmtDur(REQ_TTL - (G.t - r.t))}</span>
        <b class="who" data-a="selu" data-id="${r.u.id}">«${esc(r.u.crew.cs)}»</b>
        <span class="mu">${UT[r.u.k].sh}</span>
        <div class="rqt">${r.text}</div>
        <div class="rb">${r.opts.map((o, i) => `<button class="btn sm${i === r.def ? ' dflt' : ''}" data-a="ans" data-id="${r.id}" data-i="${i}">${esc(o.l)}</button>`).join('')}</div></div>`;
      }
      const s = G.sel;
      if (s && s.type === 'u' && unitById(s.id)) h += unitCard(unitById(s.id));
      else if (s && s.type === 't' && thrById(s.id) && !thrById(s.id).dead) h += trackCard(thrById(s.id));
      else if (s && s.type === 'o' && objById(s.id)) h += objCard(objById(s.id));
      else h += `<div class="hint">${G.phase === 'prep'
        ? '<b>Подготовка.</b> Днём перемещения мгновенные: выберите расчёт и нажмите «Выдвинуться», затем точку на карте. Докупите средства во вкладке «Снабжение», пополните боекомплект, при необходимости отремонтируйте объекты.<br><br>'
        : ''}<b>ЛКМ</b> — выбрать расчёт, цель или объект.<br><b>Перетаскивание</b> — сдвинуть карту, <b>колесо</b> — масштаб.<br><b>Пробел</b> — пауза, <b>Z</b> — зоны поражения, <b>A</b> — тревога.<br><br>Штаб не управляет техникой напрямую: ночью приказ идёт по связи с задержкой, а командир расчёта может переспросить или возразить.</div>`;
    }
    else if (G.tabR === 'frc') {
      const by = {};
      for (const u of G.units) (by[u.k] = by[u.k] || []).push(u);
      const order = Object.keys(UT).filter(k => by[k]);
      order.sort((a, b) => UT[b].cost - UT[a].cost);
      h += `<div class="hint mu">Всего расчётов: ${G.units.length}. Кликните по строке — карта перейдёт к расчёту.</div>`;
      for (const k of order) {
        h += `<div class="gh">${esc(UT[k].n)} · ${by[k].length}</div>`;
        for (const u of by[k]) h += `<div class="fl" data-a="selu" data-id="${u.id}" data-c="1">
        <span class="dot" style="background:${stColor(u)}"></span>
        <span class="nm">«${esc(u.crew.cs)}» <span class="mu">кв. ${sq(u)}</span></span>
        <span class="mu">${UT[k].w ? u.am + '/' + UT[k].w.am : ''} ${u.rOn ? '📡' : ''}${u.pend ? '✉' : ''}</span></div>`;
      }
    }
    else {
      if (G.gifts.length) {
        h += '<div class="gh">Поставки партнёров</div>';
        const cnt = {};
        G.gifts.forEach(k => cnt[k] = (cnt[k] || 0) + 1);
        for (const k in cnt) h += `<div class="shop gift">
        <div class="row"><b>${esc(UT[k].n)}</b><span class="good">×${cnt[k]}</span></div>
        <p>Передано без оплаты. Нажмите и укажите точку на карте.</p>
        <button class="btn pri" data-a="buy" data-k="${k}" data-gift="1">Разместить</button></div>`;
      }
      h += `<div class="gh">Закупка · бюджет ${Math.round(G.budget)} млн</div>`;
      if (G.phase !== 'prep') h += '<div class="hint mu">Ночью новая техника приедет на позицию не сразу: марш плюс развёртывание.</div>';
      for (const k of SHOP_ORDER) {
        const T = UT[k], aff = G.budget >= T.cost;
        h += `<div class="shop${aff ? '' : ' poor'}">
        <div class="row"><b>${esc(T.n)}</b><span class="ac">${T.cost} млн</span></div>
        <p>${esc(T.d)}</p>
        <div class="row mu"><span>${T.w ? 'поражение ' + T.w.r + ' км · БК ' + T.w.am : T.radar ? 'обнаружение ' + T.radar + ' км' : T.ewr ? 'подавление ' + T.ewr + ' км' : T.eo ? 'наблюдение ' + T.eo + ' км' : 'обеспечение'}</span><span>развёртывание ${fmtDur(T.dep)}</span></div>
        <button class="btn" data-a="buy" data-k="${k}" ${aff ? '' : 'disabled'}>Разместить</button></div>`;
      }
    }
    if (h !== lastRC) { $('#rc').innerHTML = h; lastRC = h }
  }

  /* ---------- вкладка «Объекты» слева ---------- */
  function renderObjTab() {
    const arr = G.objs.slice().sort((a, b) => b.v - a.v);
    let h = `<div class="hint mu">Энергосистема края: <b style="color:${hpCol(energy())}">${Math.round(energy())}%</b>. Если она рухнет, кампания заканчивается досрочно.</div>`;
    for (const o of arr) {
      const def = G.units.filter(u => UT[u.k].w && dist(u, o) < UT[u.k].w.r).length;
      h += `<div class="fl" data-a="selo" data-id="${o.id}" data-c="1">
      <span class="dot" style="background:${hpCol(o.hp)}"></span>
      <span class="nm">${esc(o.n)}<br><span class="mu">${OT[o.type].n} · важность ${o.v} · прикрытие ${def}</span></span>
      <span class="mu" style="color:${hpCol(o.hp)}">${Math.round(o.hp)}%</span></div>`;
    }
    $('#lc_obj').innerHTML = h;
  }

  /* ---------- строка воздушной обстановки ---------- */
  function renderThreatBar() {
    if (G.phase !== 'night') { $('#threatbar').innerHTML = ''; lastTB = ''; return }
    const live = G.threats.filter(th => !th.dead && G.t - th.seen < 120);
    if (!live.length) {
      const h = '<div class="tbe">Воздушная обстановка чистая</div>';
      if (h !== lastTB) { $('#threatbar').innerHTML = h; lastTB = h }
      return;
    }
    /* группируем по классу и направлению, чтобы не было сотни чипов */
    const grp = {};
    for (const th of live) {
      const key = (th.idLv <= 0 ? 'unk' : percCls(th)) + '|' + dirIdx(-th.hx, -th.hy);
      const g = grp[key] || (grp[key] = { n: 0, cls: th.idLv <= 0 ? 'unknown' : percCls(th), d: dirIdx(-th.hx, -th.hy), min: 1e9, th });
      g.n++;
      const dd = Math.min(...G.objs.map(o => dist(o, th)));
      if (dd < g.min) { g.min = dd; g.th = th }
    }
    const arr = Object.values(grp).sort((a, b) => (DANGER[b.cls] || 0) - (DANGER[a.cls] || 0) || a.min - b.min).slice(0, 7);
    let h = '';
    for (const g of arr) {
      h += `<div class="tch" data-a="selt" data-id="${g.th.id}" style="--c:${AIR_COL[g.cls] || AIR_COL.unknown}">
      <b>${g.n}</b> ${g.cls === 'unknown' ? 'неопозн.' : CLS_SHORT[g.cls]}
      <span class="mu">${DIRS_FROM[g.d]} · ${Math.round(g.min)} км</span></div>`;
    }
    const rest = live.length - sum(arr.map(g => g.n));
    if (rest > 0) h += `<div class="tbe">ещё ${rest}</div>`;
    if (h !== lastTB) { $('#threatbar').innerHTML = h; lastTB = h }
  }

  /* ---------- справка ---------- */
  function helpModal() {
    showModal(`<h1>Ночной рубеж</h1>
  <p class="big">Вы — офицер штаба воздушной обороны ${LORE.region}а. Ваша задача — не «стрелять», а <b>видеть картину, распределять внимание и вовремя принимать решения</b>. Техникой управляют командиры расчётов: они получают приказы по связи с задержкой, толкуют их и могут возразить.</p>

  <h2>Как устроены сутки</h2>
  <p><b>День.</b> Перемещения мгновенные и бесплатные, работает снабжение и ремонт. Именно днём решается, где вы будете сильны, а где — открыты.<br>
  <b>Ночь (19:00 → ${DAWN_LABEL}).</b> Приходит разведка, появляются цели, расчёты докладывают и запрашивают решения. Ускорение — в верхней строке, пауза — пробел.<br>
  <b>Разбор.</b> Что выпустил противник, что вы сбили, чем он занят дальше. Всего ${NIGHTS_TOTAL} ночей.</p>

  <h2>Чего не видно сразу</h2>
  <p>Цель сначала — <b>неопознанный объект</b>. Класс проясняется по мере сопровождения радаром, тип — вблизи или при длительном наблюдении мощной РЛС. Имитатор «Мотылёк» на радаре не отличается от ударного БпЛА: пока пост не рассмотрит его вблизи, вы будете тратить на него ракеты по 0,5 и 4 млн.</p>
  <p>Разведка врёт, опаздывает и не договаривает. Градация достоверности: <span class="gr">A-1</span> — надёжный источник, подтверждено; <span class="gr">E-5</span> — «люди слышали гул».</p>

  <h2>Излучение</h2>
  <p>Работающая РЛС видит далеко — и выдаёт позицию. Противник ведёт радиотехническую разведку, потом бьёт баллистикой и противорадиолокационными БпЛА «Грач-Э» по вашим пусковым. Режимы: <b>постоянно</b>, <b>по целеуказанию</b> (включаться, только когда сеть видит цели рядом), <b>молчание</b>. Радиогоризонт: низколетящие крылатые ракеты не видны дальше ${HORIZON.low} км ни одной РЛС.</p>

  <h2>Тревога</h2>
  <p>Кнопка «Тревога» резко снижает потери среди населения, но стоит ${ALARM_COST_H} млн в час и <b>изнашивает доверие</b>: если тревога висит часами впустую, люди перестают идти в укрытия, и в следующий раз она спасёт меньше. Противник это видит и специально устраивает ложные взлёты.</p>

  <h2>Экономика боя</h2>
  <p>Ракета «Бастиона» — 4 млн, «Щита» — 0,5, «Крома» — 0,18, пулемёт — бесплатно. Противник пускает «Жало» по 0,05 и имитаторы по 0,012. Если вы сбиваете дроны дорогими ракетами, вы проигрываете, даже сбив всё. Режим огня «экономный» и дешёвые средства на маршрутах пролёта — основа обороны.</p>

  <h2>Что стоит делать</h2>
  <ul>
  <li>Днём двигать ЗРК: позиция с прошлой ночи уже вскрыта.</li>
  <li>Ставить посты и мобильные группы на трассах пролёта, а не вплотную к объектам.</li>
  <li>Держать «Бастион» в молчании до баллистики.</li>
  <li>Макеты ЗРК — дешёвый способ поймать чужой «Молот» за 3 млн.</li>
  <li>Читать эфир: картина собирается из обрывков докладов, а не из одной сводки.</li>
  </ul>
  <div class="acts"><button class="btn pri" data-a="close">Понятно</button></div>`);
  }

  return {
    top: renderTop,
    tabs: renderTabs,
    right: renderRight,
    left(tab) { if (tab === 'obj') renderObjTab() },
    threatBar: renderThreatBar,
    speedButtons: setSpeedBtns,
    help: helpModal
  };
})();
