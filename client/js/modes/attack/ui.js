'use strict';
/* ============================================================
   НАЛЁТ: панели (клиент)
   Вкладки «Удар» и «Пакеты», контакты разведки, справка.
   Разбор ночи и итоги считает сервер (game/modes/attack/flow.js).
   ============================================================ */

const AttackUI = (() => {
  function setSpeedBtns() { renderSpeedBox(Game.humans.length > 1 ? 'Готов к налёту ▶' : 'Начать налёт ▶') }

  function renderTop() {
    $('#hdNight').textContent = G.phase === 'prep' ? ` · день ${G.night}, сбор пакета`
      : G.phase === 'night' ? ` · ночь ${G.night} из ${NIGHTS_TOTAL}` : ` · ночь ${G.night}`;
    $('#hdClock').textContent = G.phase === 'prep' ? 'День' : clock(G.t);
    $('#hdBud').textContent = Math.round(arsenalValue()) + ' млн';
    const en = energy();
    const eEl = $('#hdEn');
    eEl.textContent = Math.round(en) + '%';
    eEl.style.color = hpCol(en);
    $('#hdCiv').textContent = (S ? S.civ : 0) + (G.civTotal ? ' / ' + G.civTotal : '');
    const air = G.threats.filter(th => !th.dead).length;
    const thEl = $('#hdThr');
    thEl.textContent = air;
    thEl.style.color = air ? '#f2b33d' : '#7f909c';
    $('#hdWx').textContent = G.weather.n + (G.alarm ? ' · тревога' : '');
  }

  function renderTabs() {
    const L = [['radio', 'Журнал'], ['intel', 'Контакты'], ['obj', 'Объекты']];
    $('#tabsL').innerHTML = L.map(([k, n]) =>
      `<button data-a="tabL" data-v="${k}" class="${G.tabL === k ? 'on' : ''}">${n}${G.unread[k] ? `<i>${G.unread[k]}</i>` : ''}</button>`).join('');
    for (const k of ['radio', 'intel', 'obj', 'mind']) {
      const e = $('#lc_' + k);
      if (e) e.style.display = G.tabL === k ? '' : 'none';
    }
    if (G.tabR !== 'plan' && G.tabR !== 'strike') G.tabR = 'strike';
    const R2 = [['strike', 'Удар'], ['plan', 'Пакеты']];
    $('#tabsR').innerHTML = R2.map(([k, n]) =>
      `<button data-a="tabR" data-v="${k}" class="${G.tabR === k ? 'on' : ''}">${n}</button>`).join('');
    tabsDirty = false;
  }

  function renderObjTab() {
    let h = `<div class="hint">Их энергосистема: <b style="color:${hpCol(energy())}">${Math.round(energy())}%</b>. Пять ночей. Сопутствующие потери в городах снижают итог.</div>`;
    const arr = G.objs.slice().sort((a, b) => b.v * (a.hp > 0) - a.v * (b.hp > 0) || b.v - a.v);
    for (const o of arr) {
      h += `<div class="fl" data-a="selo" data-id="${o.id}" data-c="1">
      <span class="dot" style="background:${hpCol(o.hp)}"></span>
      <span class="nm">${esc(o.n)}<br><span class="mu">${OT[o.type].n} · важность ${o.v}</span></span>
      <span class="mu" style="color:${hpCol(o.hp)}">${Math.round(o.hp)}%</span></div>`;
    }
    paint($('#lc_obj'), h);
  }

  function renderContacts() {
    const arr = Object.values(E.know).filter(k => k.conf >= 0.28).sort((a, b) => b.conf - a.conf);
    let h = '<div class="hint">Позиции ПВО — только разведка, радиоперехват и их пуски. Кольцо на карте — оценка, не факт.</div>';
    if (!arr.length) h += '<div class="hint">Контактов нет.</div>';
    for (const k of arr) {
      const dead = k.dead;
      h += `<div class="fl" data-a="selk" data-id="${k.uid}">
      <span class="dot" style="background:${dead ? '#ff5b47' : '#f2b33d'}"></span>
      <span class="nm">${esc(UT[k.type] ? UT[k.type].n : k.type)}<br><span class="mu">кв. ${sq(k)} · ${esc(k.src)}${dead ? ' · поражён' : ''}</span></span>
      <span class="mu">${pc(k.conf)}</span></div>`;
    }
    paint($('#lc_intel'), h);
  }

  function renderThreatBar() {
    if (G.phase !== 'night') { $('#threatbar').innerHTML = ''; lastTB = ''; return; }
    const live = G.threats.filter(th => !th.dead);
    if (!live.length) {
      const h = '<div class="tbe">В воздухе пусто</div>';
      if (h !== lastTB && paint($('#threatbar'), h)) lastTB = h;
      return;
    }
    const grp = {};
    for (const th of live) {
      const g = grp[th.k] || (grp[th.k] = { n: 0, th });
      g.n++;
    }
    let h = '';
    for (const k of Object.keys(grp)) {
      const g = grp[k];
      h += `<div class="tch" data-a="selt" data-id="${g.th.id}" style="--c:${AIR_COL[g.th.cls] || '#f2b33d'}"><b>${g.n}</b> ${esc(TT[k].n)}</div>`;
    }
    if (h !== lastTB && paint($('#threatbar'), h)) lastTB = h;
  }

  /** кнопка перенацеливания: только средства с каналом связи, ночью, раз в RETARGET_GAP */
  function retargetBtn(g) {
    if (!TT[g.kind].retarget || G.phase !== 'night' || (!g.alive && g.launched >= g.n)) return '';
    const wait = g.retT != null ? 600 - (G.t - g.retT) : 0;
    const on = G.mode && G.mode.t === 'retarget' && G.mode.gid === g.id;
    const lab = routeOnly(g.kind) ? 'Новый маршрут' : 'Перенацелить';
    return `<button class="btn sm ${on ? 'on' : ''}" data-a="retarget" data-id="${g.id}" ${wait > 0 ? 'disabled' : ''}>${wait > 0 ? 'Связь через ' + fmtDur(wait) : on ? 'Отмена' : lab}</button>`;
  }

  /** карточка выбранного своего борта: что, куда, и — если есть связь — перенацелить */
  function threatCard() {
    if (!G.sel || G.sel.type !== 't') return '';
    const th = thrById(G.sel.id);
    if (!th) return '';
    const T = TT[th.k], g = E.groups.find(x => x.id === th.gid);
    const end = th.path && th.path[th.path.length - 1];
    const eta = end ? polyLen(th, th.path) / (T.sp || 1) : 0;
    const where = !g || !g.tgt ? '' : g.tgt.patrol ? 'маршрут, ' + (th.path || []).length + ' тч.' : g.tgt.obj ? '«' + g.tgt.obj.n + '»' : 'кв. ' + sq(g.tgt.aim);
    let h = `<div class="shop gift"><div class="row"><b>${esc(T.n)}</b><span class="mu">${esc(CLS_N[th.cls])}</span></div>`;
    h += `<div class="row mu"><span>${th.lost ? '<span class="bad">потерял навигацию</span>' : where ? 'Курс: ' + esc(where) : ''}</span><span>${end && !th.lost ? 'ещё ' + fmtDur(eta) : ''}</span></div>`;
    if (g) h += `<div class="row mu"><span>Пакет: ${g.n}× · в воздухе ${g.alive}</span><span>${th.alt === 'high' ? 'высоко' : th.alt === 'mid' ? 'средняя высота' : 'малая высота'}</span></div>`;
    if (!T.retarget) h += '<p class="mu">Канала управления нет: летит по заложенной программе.</p>';
    else if (g) h += `<div class="acts">${retargetBtn(g)}</div><p class="mu">${routeOnly(g.kind) ? 'Новый маршрут получит весь пакет.' : 'Новую цель получит весь пакет, включая ещё не выпущенные борта.'} Сеанс связи — не чаще раза в 10 минут.</p>`;
    return h + '</div>';
  }

  /** ложная активность: носители поднимаются, разведка ПВО это видит, но пусков нет */
  function feintHTML(p) {
    if (G.phase !== 'prep' && G.phase !== 'night') return '';
    const used = E.feintUsed || {};
    let h = `<div class="lbl">Ложная активность · время как у залпа: ${p.delay ? '+' + p.delay + ' ч' : 'сразу'}</div>
    <div class="hint">Их разведка увидит подготовку тяжёлого удара — шифрованный обмен, взлёт, выход в море, — а пусков не будет. Цель: заставить ПВО включить радары, объявить тревогу впустую и потратить силы. Ракеты не тратятся.</div><div class="acts">`;
    for (const [id, F] of Object.entries(FEINTS)) {
      const left = F.cap - (used[id] || 0);
      h += `<button class="btn sm" data-a="feint" data-k="${id}" ${left <= 0 ? 'disabled' : ''} title="${esc(F.d)}">${esc(F.n)} · ${left}</button>`;
    }
    h += '</div>';
    for (const f of E.feints || []) h += `<div class="row mu"><span>${esc(FEINTS[f.kind].n)}</span><span>«пуск» ≈ ${clock(f.t)}</span></div>`;
    return h;
  }

  function renderRight() {
    const p = ensurePlan();
    syncZone();
    let h = threatCard();
    if (G.tabR === 'plan') {
      const gs = E.groups.filter(g => g.n > g.launched || G.t - (g.launch || 0) < 7200);
      h += '<div class="hint">Собранные пакеты. Снять можно то, что ещё не вышло в воздух.</div>';
      if (!E.groups.length) h += '<div class="hint">План пуст. Соберите удар на вкладке «Удар».</div>';
      for (const g of E.groups) {
        const where = g.tgt && g.tgt.obj ? g.tgt.obj.n : 'точка';
        h += `<div class="shop"><div class="row"><b>${g.n}× ${esc(TT[g.kind].n)}</b><span class="mu">${g.launched ? 'в воздухе ' + g.launched : clock(g.launch)}</span></div>
        <p>${esc(g.zone.n)} → ${esc(where)}. Над целью ≈ ${g.n > 1 ? clock(g.arrive) + '–' + clock(g.arrive + (g.n - 1) * (g.spc || 0)) : clock(g.arrive)}. Потерь ${g.lost || 0}, попаданий ${g.hit || 0}.</p>
        ${g.launched < g.n ? `<button class="btn sm warn" data-a="cancelg" data-id="${g.id}">Снять невыпущенное</button>` : ''}
        ${retargetBtn(g)}</div>`;
      }
    } else {
      const T = TT[p.k];
      const aim = aimOf(p.tgt);
      const patrol = routeOnly(p.k);
      const where = patrol
        ? (p.wps.length ? ('ваш маршрут, ' + p.wps.length + ' тч.') : 'кликните точки на карте')
        : p.tgt && p.tgt.obj ? p.tgt.obj.n : p.tgt && p.tgt.aim ? 'точка кв. ' + sq(p.tgt.aim) : 'кликните карту';
      let eta = '';
      if (p.preview && p.preview.length > 1) {
        const len = polyLen(p.preview[0], p.preview.slice(1));
        eta = `${Math.round(len)} км · подлёт ${fmtDur(len / T.sp)}`;
      }
      h += `<div class="hint">${patrol
        ? '«Сова» и «Вуаль» идут <b>только по точкам</b>, которые вы ставите кликом. На объект они сами не сворачивают. ПКМ снимает последнюю точку.'
        : 'Клик по пустому месту — цель в этой точке. Клик по объекту — удар по нему. «Свой маршрут» добавляет изломы до цели.'}</div>`;
      h += `<div class="row"><span>Цель</span><b>${esc(where)}</b></div>`;
      if (eta) h += `<div class="row mu"><span>${eta}</span><span>${p.wps.length ? p.wps.length + ' излома' : 'автомаршрут'}</span></div>`;
      const left = capLeft(p.k), pl = plannedLaunch(p);
      /* «время на цели»: когда пускать, чтобы середина залпа пришла вместе с выбранным пакетом */
      const sg = p.sync != null && !patrol ? E.groups.find(x => x.id === p.sync) : null;
      if (p.sync != null && !sg) p.sync = null;
      let syncT = null;
      if (sg && pl && aim) {
        const zn = chosenZone(), want = salvoMid(sg) + (p.syncOff || 0) * 60;
        const path = p.preview && p.preview.length > 1 ? p.preview.slice(1) : [aim];
        const ft = flightTime(p.k, zn, path, p.high), nn = Math.min(p.n, E.stock[p.k] || 0);
        syncT = { want, t0: want - ft - (nn - 1) * pl.gap / 2, early: pl.t + ft + (nn - 1) * pl.gap / 2 };
        syncT.ok = syncT.t0 >= pl.t;
      }
      const late = pl && (syncT ? syncT.t0 : pl.t) + (p.n - 1) * pl.gap > NIGHT_LEN - 900;
      const zoneNow = chosenZone();
      const far = T.range && aim && zoneNow && dist(zoneNow, aim) > T.range - 4;
      const grounded = (T.rc || T.brood) && !G.weather.fpv;
      if (far) h += `<div class="row"><span class="bad">Цель дальше ${T.range} км от района пуска — FPV не долетит</span></div>`;
      if (grounded) h += `<div class="row"><span class="bad">Погода нелётная для FPV</span></div>`;
      h += `<div class="acts"><button class="btn pri" data-a="launch" ${(E.stock[p.k] || 0) < 1 || left < p.n || late || far || grounded || (patrol && !p.wps.length) || (syncT && !syncT.ok) ? 'disabled' : ''}>Пуск · ${Math.min(p.n, E.stock[p.k] || 0)}× ${esc(T.n)}</button></div>`;
      if (syncT) h += `<div class="row"><span>${syncT.ok ? `Пуск ≈ ${clock(syncT.t0)}, над целью ≈ ${clock(syncT.want)}` : `<span class="bad">К ${clock(syncT.want)} не успеть: самое раннее ≈ ${clock(syncT.early)}</span>`}</span><span>${late ? '<b class="bad">не успеть до рассвета</b>' : ''}</span></div>`;
      else if (pl) h += `<div class="row mu"><span>Первый пуск ≈ ${clock(pl.t)}${p.n > 1 ? ', последний ≈ ' + clock(pl.t + (p.n - 1) * pl.gap) : ''}${p.preview && p.preview.length > 1 && !patrol ? ' · над целью ≈ ' + clock(pl.t + flightTime(p.k, chosenZone(), p.preview.slice(1), p.high)) : ''}</span><span>${late ? '<b class="bad">не успеть до рассвета</b>' : ''}</span></div>`;
      const cb = (E.capBonus || {})[capGroup(p.k)] || 0;
      h += `<div class="row mu"><span>Подготовят за ночь: ${CAP_N[capGroup(p.k)]}${cb ? ` <span class="ac" title="Половина неиспользованного вчера лимита">(+${cb} впрок)</span>` : ''}</span><span class="${left < p.n ? 'bad' : ''}">ещё ${left}</span></div>`;
      h += '<div class="lbl">Средство</div>';
      for (const k of ATK_KINDS) {
        const n = Math.min(E.stock[k] || 0, Math.max(0, capLeft(k)));
        h += `<div class="fl" data-a="weapon" data-k="${k}" style="${p.k === k ? 'background:#1c2b38' : ''}${n ? '' : ';opacity:.45'}">
        <span class="nm">${esc(TT[k].n)}<br><span class="mu">${esc(CLS_N[TT[k].cls])} · ${num(TT[k].cost)} млн</span></span>
        <span class="mu">${n}</span></div>`;
      }
      h += `<div class="lbl">Залп · в наличии ${E.stock[p.k] || 0}</div><div class="acts">`;
      for (const n of [1, 2, 4, 6, 8, 12, 16, 24]) {
        h += `<button class="btn sm ${p.n === n ? 'on' : ''}" data-a="cnt" data-v="${n}" ${Math.min(E.stock[p.k] || 0, capLeft(p.k)) < n ? 'disabled' : ''}>${n}</button>`;
      }
      h += '</div>';
      h += '<div class="lbl">Район пуска</div><div class="acts">';
      for (const z of zonesFor(p.k)) {
        const busy = (E.zbook || {})[laneKey(p.k, z.id)] || 0;
        h += `<button class="btn sm ${p.zid === z.id ? 'on' : ''}" data-a="zid" data-v="${z.id}" title="${busy > (G.phase === 'night' ? G.t : 0) ? 'Площадки заняты до ' + clock(busy) : 'Площадки свободны'}">${esc(z.n)}${busy > (G.phase === 'night' ? G.t : 0) ? ' · до ' + clock(busy) : ''}</button>`;
      }
      h += `</div><div class="lbl">Когда${sg ? ' · <span class="mu">задано временем на цели</span>' : ''}</div><div class="acts">`;
      for (const [v, lab] of [[0, 'сразу'], [1, '+1 ч'], [2, '+2 ч'], [4, '+4 ч'], [6, '+6 ч']]) {
        h += `<button class="btn sm ${p.delay === v && !sg ? 'on' : ''}" data-a="delay" data-v="${v}" ${sg ? 'disabled' : ''}>${lab}</button>`;
      }
      h += '</div>';
      /* комбинированный удар: прийти вместе с другим пакетом */
      const sync = patrol ? [] : E.groups.filter(g => g.arrive > (G.phase === 'night' ? G.t : 0) + 300 && !routeOnly(g.kind));
      if (sync.length) {
        h += '<div class="lbl">Время на цели — прибыть вместе с пакетом</div><div class="hint">Разная скорость не мешает: пуск рассчитается так, чтобы середина залпа пришла к цели в ту же минуту. «Мопеды» уйдут раньше, ракеты позже — над целью они окажутся вместе.</div><div class="acts">';
        for (const g of sync) {
          const w = g.tgt && g.tgt.obj ? '«' + g.tgt.obj.n + '»' : 'точка';
          h += `<button class="btn sm ${p.sync === g.id ? 'on' : ''}" data-a="sync" data-v="${g.id}" title="${esc(w)}">${g.n}× ${esc(TT[g.kind].n)} · ${clock(salvoMid(g))}</button>`;
        }
        h += '</div>';
        if (sg) {
          h += '<div class="acts">';
          for (const o of SYNC_OFFS) h += `<button class="btn sm ${(p.syncOff || 0) === o ? 'on' : ''}" data-a="syncoff" data-v="${o}">${o ? (o > 0 ? '+' : '') + o + ' мин' : 'вместе'}</button>`;
          h += '</div>';
        }
      }
      if (T.cls === 'drone' || T.cls === 'decoy') {
        h += `<div class="acts"><button class="btn sm ${p.high ? 'on' : ''}" data-a="high">${p.high ? 'Высота 2–3 км' : 'Бреющий'}</button></div>`;
      }
      if (T.cls === 'cruise') {
        h += `<div class="lbl">Профиль полёта</div><div class="acts">
        <button class="btn sm ${!p.high ? 'on' : ''}" data-a="alt" data-v="0">Предельно низко</button>
        <button class="btn sm ${p.high ? 'on' : ''}" data-a="alt" data-v="1">Высоко</button></div>
        <div class="hint">${p.high
          ? 'Высоко: на 20% быстрее и точнее, рельеф не страшен — но ракету с границы ведёт вся сеть РЛС края, сюрприза не будет.'
          : 'Предельно низко: радары видят ракету поздно, только вблизи. Но на долгом маршруте она может задеть рельеф — в туман и снег чаще.'}</div>`;
      }
      h += `<div class="hint">${esc(T.d)}</div>`;
      h += `<div class="acts">
      <button class="btn sm ${G.mode && G.mode.t === 'route' ? 'on' : ''}" data-a="route">Свой маршрут</button>
      <button class="btn sm" data-a="reroute">Другой обход</button>
      <button class="btn sm" data-a="clrwps" ${p.wps.length ? '' : 'disabled'}>Сбросить точки</button>
    </div>`;
      h += feintHTML(p);
    }
    if (h !== lastRC && paint($('#rc'), h)) { linkSquares($('#rc')); lastRC = h; }
  }

  function helpModal() {
    showModal(`<h1>Ночной налёт</h1>
  <p class="big">Вы планируете воздушные удары по Привельскому краю. Их штаб ПВО играет сам: радары, ракеты, тревога, смена позиций. Вы не видите расчёты, пока их не вскроете.</p>
  <h2>Как бить</h2>
  <ul>
  <li>Справа уже выбрана цель. Жёлтая кнопка «Пуск» ставит залп в план, затем сверху «Начать налёт».</li>
  <li>Тяжёлый удар их разведка видит заранее: взлёт «Кондоров», выход «Шквалов» в море, выдвижение ОТРК. «Ложная активность» внизу вкладки «Удар» показывает им ту же подготовку без пусков — пусть включают радары и объявляют тревогу впустую.</li>
  <li>Пусковые не бесконечны. У каждого района несколько площадок — пакеты встают в очередь. Приказ ночью доходит до расчётов не сразу (дроны — ~15 мин, крылатые — часы: носители выходят заранее). За ночь расчёты готовят ограниченное число средств, остальное ждёт следующей ночи.</li>
  <li>«Начать налёт» — 19:00. Ускорение сверху, пауза — пробел.</li>
  <li>Автомаршрут обходит только известные зоны. «Свой маршрут» — изломы кликами.</li>
  <li>«Мотыльки» жгут их ракеты. «Сова» и излучающие РЛС вскрывают позиции. «Молот» и «Грач» бьют по контактам.</li>
  <li>КАБ «Плита» сбрасывают над передним краем, она планирует до 95 км — по технике у фронта и ближним объектам. Если их «Щит» или «Бастион» стоит недалеко от фронта и излучает, самолёт могут сбить.</li>
  <li>Крылатые ракеты: «предельно низко» — скрытно, но иногда задевают рельеф; «высоко» — быстрее и точнее, но их видит вся сеть РЛС.</li>
  <li>Клик по своему борту в небе — карточка: куда летит и когда. Средства с каналом связи («Шершень», «Стриж», «Кречет», FPV, «Улей») можно перенацелить, «Сове» и «Вуали» — дать новый маршрут: клики по карте, ПКМ или Enter — отправить.</li>
  <li>Когда бить больше нечем (ни ракет, ни баллистики, ни КАБ, дронов — на пару пакетов), вверху появляется «⏭ до утра». В дуэли перемотку подтверждает ПВО.</li>
  <li>Комбинированный удар: внизу вкладки «Удар» — «Время на цели». Выберите уже запланированный пакет, и новый пакет придёт к цели в ту же минуту (или со сдвигом ±5–10 мин): пуск рассчитается по скорости, маршруту и ветру.</li>
  <li>У каждого средства свой ночной лимит: «Жала», «Мотыльки» и «Шершни» больше не делят один на всех.</li>
  <li>Неиспользованный ночной лимит наполовину переходит на следующую ночь: можно копить на большой удар.</li>
  <li>FPV «Оса» с переднего края выбивает посты наблюдения и мобильные группы, а камера вскрывает технику. Вглубь края FPV довозит «Улей»: сбрасывает рой за 20 км до цели и держит связь — собьют носитель, рой ослепнет.</li>
  <li>Попадание в жилой квартал даёт сопутствующие потери и режет очки. Цель кампании — энергосистема за ${NIGHTS_TOTAL} ночей.</li>
  </ul>
  <h2>Чего не видно</h2>
  <p>Кольцо на карте — оценка разведки, комплекс мог уехать днём, если ночью стрелял или долго светил. Молчащий ЗРК на карте пуст, пока не выстрелит или пока над ним не пройдёт разведчик.</p>
  <div class="acts"><button class="btn pri" data-a="close">К плану</button></div>`);
  }

  function onAction(a, el) {
    const p = ensurePlan();
      if (a === 'feint') { cmd('feint', { kind: el.dataset.k, delay: p.delay }).then(() => { lastRC = ''; uiDirty() }); return }
      if (a === 'retarget') {
        const id = +el.dataset.id;
        if (G.mode && G.mode.t === 'retarget' && G.mode.gid === id) { G.mode = null; hint(''); lastRC = ''; uiDirty() }
        else AttackInput.startRetarget(id);
        return;
      }
      if (a === 'weapon') {
        const wasPatrol = routeOnly(p.k);
        p.k = el.dataset.k;
        p.n = Math.min(ATK_N[p.k] || 1, Math.max(1, E.stock[p.k] || 1));
        /* маршрут разведчика и изломы удара — разные вещи: при смене типа средства точки не переносим */
        if (wasPatrol !== routeOnly(p.k)) p.wps = [];
        if (routeOnly(p.k)) {
          if (p.tgt && p.tgt.obj) p.tgt = null;
          G.mode = { t: 'route' };
          hint('Кликайте маршрут. Этот борт летит только по точкам.');
        } else if (wasPatrol && G.mode && G.mode.t === 'route') {
          /* иначе режим изломов «залипает»: клик по объекту ставил бы точку, а удар ушёл бы в старую цель */
          G.mode = null; hint('');
        }
        syncZone(); computePreview(); lastRC = ''; uiDirty();
      } else if (a === 'cnt') { p.n = +el.dataset.v; lastRC = ''; uiDirty(); }
      else if (a === 'delay') { p.delay = +el.dataset.v; lastRC = ''; uiDirty(); }
      else if (a === 'sync') { const id = +el.dataset.v; p.sync = p.sync === id ? null : id; p.syncOff = 0; lastRC = ''; uiDirty(); }
      else if (a === 'syncoff') { p.syncOff = +el.dataset.v; lastRC = ''; uiDirty(); }
      else if (a === 'zid') { p.zid = el.dataset.v; computePreview(); lastRC = ''; uiDirty(); }
      else if (a === 'high') { p.high = !p.high; lastRC = ''; uiDirty(); }
      else if (a === 'alt') { p.high = el.dataset.v === '1'; lastRC = ''; uiDirty(); }
      else if (a === 'route') {
        if (G.mode && G.mode.t === 'route') { G.mode = null; hint('') }
        else { G.mode = { t: 'route' }; hint('Кликайте изломы. Объект или контакт — цель. ПКМ — выйти.') }
        lastRC = ''; uiDirty();
      } else if (a === 'reroute') { p.wps = []; computePreview(); lastRC = ''; uiDirty(); }
      else if (a === 'clrwps') { p.wps = []; computePreview(); lastRC = ''; uiDirty(); }
      else if (a === 'launch') launchStrike();
      else if (a === 'cancelg') cancelGroup(+el.dataset.id);
      else if (a === 'selo') { const o = objById(el.dataset.id); if (o) setAimObj(o); }
      else if (a === 'selk') {
        const k = knowById(el.dataset.id);
        if (k) { setAimContact(k); centerOn(k, Math.max(G.view.s, 4)); }
      }
  }

  return {
    top: renderTop,
    tabs: renderTabs,
    right: renderRight,
    left(tab) { if (tab === 'obj') renderObjTab(); if (tab === 'intel') renderContacts() },
    threatBar: renderThreatBar,
    speedButtons: setSpeedBtns,
    help: helpModal,
    onAction
  };
})();
