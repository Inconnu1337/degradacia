'use strict';
/* ============================================================
   НАБЛЮДАТЕЛЬ (клиент)
   Видит всю обстановку без тумана войны: расчёты ПВО, цели с
   настоящими типами, пакеты налёта и его разведку. Ничего не
   приказывает — сервер отклоняет команды наблюдателя (кроме
   сохранения). Карта и полоса целей — как у ПВО, справа — сводка
   по обеим сторонам и карточка выбранного.
   ============================================================ */

const SpecUI = (() => {
  /* ---------- скорость: только смотреть ---------- */
  function speedBox() {
    let h = '';
    if (G.phase === 'night') {
      h = `<span class="tctl">${G.speed ? 'время ×' + G.speed : G.chosen ? 'время стоит (кто-то не в сети)' : 'пауза'}${G.skip && G.skip.on ? ' · ⏭ перемотка до утра' : ''}</span>`;
    } else if (G.phase === 'prep') {
      const r = G.ready || {};
      h = `<span class="tctl">день ${G.night}: подготовка · готовы: ${['def', 'atk'].filter(x => Game.humans.includes(x)).map(x => (r[x] ? '✔ ' : '… ') + (x === 'def' ? 'ПВО' : 'налёт')).join(', ')}</span>`;
    } else h = '<span class="tctl">разбор ночи</span>';
    if (h !== lastSB && paint($('#speedBox'), h)) lastSB = h;
  }

  /* ---------- вкладки ---------- */
  function tabs() {
    const L = [['radio', 'Эфир ПВО'], ['intel', 'Разведка'], ['mind', Game.humans.length > 1 ? 'Налёт' : 'Мысли ИИ'], ['obj', 'Объекты']];
    $('#tabsL').innerHTML = L.map(([k, n]) =>
      `<button data-a="tabL" data-v="${k}" class="${G.tabL === k ? 'on' : ''}">${n}${G.unread[k] ? `<i>${G.unread[k]}</i>` : ''}</button>`).join('');
    for (const k of ['radio', 'intel', 'obj', 'mind']) { const e = $('#lc_' + k); if (e) e.style.display = G.tabL === k ? '' : 'none' }
    $('#tabsR').innerHTML = '<button class="on">Наблюдение</button>';
    tabsDirty = false;
  }

  /* ---------- справа: выбранное и сводка по сторонам ---------- */
  function selCard() {
    const s = G.sel;
    if (!s) return '';
    if (s.type === 'u') {
      const u = unitById(s.id);
      if (!u) return '';
      const T = UT[u.k];
      return `<div class="card"><h3>«${esc(u.crew.cs)}» <span class="mu">· ${esc(T.sh)}</span></h3><div class="sub">${esc(T.n)}</div>
        <div class="row"><span>Состояние</span><b style="color:${stColor(u)}">${unitStatus(u)}</b></div>
        <div class="row"><span>Живучесть</span><b>${Math.round(u.hp / T.hp * 100)}%</b></div>
        ${T.w ? `<div class="row"><span>Боекомплект</span><b>${u.am} / ${T.w.am}</b></div><div class="row"><span>Сбито</span><b>${u.kills || 0}</b></div>` : ''}
        ${T.radar ? `<div class="row"><span>РЛС</span><b>${u.rOn ? 'излучает' : 'молчит'}</b></div>` : ''}</div>`;
    }
    if (s.type === 't') {
      const th = thrById(s.id);
      if (!th) return '';
      const T = TT[th.k], g = E && E.groups.find(x => x.id === th.gid);
      const where = !g || !g.tgt ? '' : g.tgt.patrol ? 'маршрут' : g.tgt.obj ? '«' + g.tgt.obj.n + '»' : 'кв. ' + sq(g.tgt.aim);
      return `<div class="card"><h3>${esc(T.n)}</h3><div class="sub">${esc(CLS_N[th.cls])}</div>
        ${where ? `<div class="row"><span>Цель пакета</span><b>${esc(where)}</b></div>` : ''}
        <div class="row"><span>ПВО видит</span><b>${th.dvis ? 'да' : 'нет'}</b></div>
        ${th.lost ? '<div class="row"><span class="bad">потерял навигацию</span></div>' : ''}</div>`;
    }
    if (s.type === 'o') {
      const o = objById(s.id);
      return o ? `<div class="card"><h3>${esc(o.n)}</h3><div class="sub">${OT[o.type].n}</div><div class="row"><span>Состояние</span><b style="color:${hpCol(o.hp)}">${Math.round(o.hp)}%</b></div></div>` : '';
    }
    return '';
  }

  function right() {
    let h = selCard();
    h += '<div class="hint">Вы наблюдатель: видна вся обстановка без тумана войны. Клик по расчёту, цели или объекту — подробности.</div>';
    h += `<div class="gh">ПВО</div>
      <div class="row"><span>Бюджет</span><b>${Math.round(G.budget)} млн</b></div>
      <div class="row"><span>Энергосистема</span><b style="color:${hpCol(energy())}">${Math.round(energy())}%</b></div>
      <div class="row"><span>Расчётов</span><b>${G.units.length}</b></div>
      <div class="row"><span>Склад перехватчиков</span><b>${G.icptPool}</b></div>
      <div class="row"><span>Тревога</span><b>${G.alarm ? 'объявлена' : 'нет'}</b></div>`;
    if (E) {
      const air = G.threats.filter(t => !t.dead).length, seen = G.threats.filter(t => !t.dead && t.dvis).length;
      h += `<div class="gh">Налёт</div><div class="row"><span>В воздухе</span><b>${air} · ПВО видит ${seen}</b></div>`;
      const st = Object.entries(E.stock).filter(([, n]) => n > 0).map(([k, n]) => `${esc(TT[k].n)} ${n}`).join(' · ');
      h += `<p class="mu">Арсенал: ${st || 'пусто'}</p>`;
      for (const g of E.groups.filter(g => g.launched < g.n || g.alive).slice(0, 14)) {
        const w = g.tgt && g.tgt.obj ? g.tgt.obj.n : g.tgt && g.tgt.patrol ? 'маршрут' : 'точка';
        h += `<div class="row mu"><span>${g.n}× ${esc(TT[g.kind].n)} → ${esc(w)}</span><span>${g.launched < g.n ? 'пуск ' + clock(g.launch) : 'в воздухе ' + g.alive}</span></div>`;
      }
    }
    if (h !== lastRC && paint($('#rc'), h)) lastRC = h;
  }

  function help() {
    showModal(`<h1>Наблюдение</h1><p class="big">Вы смотрите партию как зритель: видны все расчёты ПВО, настоящие типы целей и пакеты налёта. Управлять ничем нельзя.</p>
      <ul><li>Слева: «Эфир ПВО», «Разведка», «Налёт» — журналы сторон.</li><li>Клик по расчёту, цели или объекту — подробности справа.</li><li>Z — зоны поражения, V — прогноз удара, R — маршруты.</li></ul>
      <div class="acts"><button class="btn pri" data-a="close">Смотреть</button></div>`);
  }

  return { speedBox, tabs, right, help };
})();

defineMode({
  id: 'spec',
  hud: {
    title: 'Ночной рубеж · наблюдение',
    desc: 'Ночной рубеж — наблюдение за партией.',
    brand: 'НАБЛЮДЕНИЕ',
    labels: { bud: 'Бюджет ПВО', en: 'Энергосистема', civ: 'Пострадавшие', thr: 'На радарах ПВО' },
    paceTitle: '', zonesText: 'Зоны', zonesTitle: 'Зоны поражения всех расчётов (Z)',
    alarmBtn: false, spoilBtn: false, aimBtn: true
  },
  onEnter() { G.tabR = 'spec'; G.showRoutes = true },
  render: DefenseRender,
  ui: {
    top: DefenseUI.top,
    tabs: SpecUI.tabs,
    right: SpecUI.right,
    left(tab) { if (tab === 'obj') DefenseUI.left('obj') },
    threatBar: DefenseUI.threatBar,
    speedButtons: SpecUI.speedBox,
    help: SpecUI.help,
    onAction() { }
  },
  input: {
    pickAt: DefenseInput.pickAt,
    tooltip: DefenseInput.tooltip,
    /* только выбрать — никаких приказов */
    mapClick(sp) { G.mode = null; G.sel = DefenseInput.pickAt(sp) || null; lastRC = ''; uiDirty() }
  }
});
