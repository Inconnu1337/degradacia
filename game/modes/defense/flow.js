'use strict';
/* ============================================================
   ОБОРОНА: ход кампании (сервер)
   Проверка перед заступлением, разбор ночи (очки, поставки, бюджет)
   и итоги кампании. Тексты окон уходят стороне ПВО событием modal.
   ============================================================ */

const DefenseFlow = (() => {
  /* ---------- ночь ---------- */
  /** можно ли заступать: предупреждаем один раз за кампанию о неприкрытых объектах */
  function checkStart(confirm) {
    if (G.phase !== 'prep') return { ok: false, error: 'не время для этого' };
    if (confirm) return { ok: true };
    const un = G.objs.filter(o => o.hp > 40 && !G.units.some(u => UT[u.k].w && dist(u, o) < UT[u.k].w.r));
    if (un.length && !G.warnedUncovered) {
      G.warnedUncovered = 1;
      showModal(`<h1>Заступать на дежурство?</h1>
      <p>Без огневого прикрытия остаются объекты: <b>${un.map(o => esc(o.n)).join(', ')}</b>.</p>
      <p class="hint">Это не ошибка — прикрыть всё невозможно. Но стоит решить осознанно.</p>
      <div class="acts"><button class="btn pri" data-a="startNight2">Заступаем</button>
      <button class="btn" data-a="close">Вернуться к расстановке</button></div>`);
      return { ok: false, warned: true };
    }
    return { ok: true };
  }

  /* ---------- разбор ночи ---------- */
  function endNight() {
    G.phase = 'debrief'; G.speed = 0;
    MODE.nightEnd();
    const launched = sum(Object.values(S.launched)), killed = sum(Object.values(S.killed)), ew = sum(Object.values(S.ew));
    const lostCost = S.lost.reduce((a, k) => a + UT[k].cost, 0);
    const rate = launched ? (killed + ew) / launched : 1;
    const faH = S.falseAlarm / 3600, unH = S.uncovered / 3600;
    const score = Math.max(0, Math.round(
      1000 - S.objDmg * 5 - S.civ * 15 - lostCost * .6 + (launched ? rate * 200 : 0) - faH * 18 - unH * 26));
    const grade = score >= 950 ? 'Отличная работа' : score >= 800 ? 'Хорошая ночь'
      : score >= 600 ? 'Тяжёлая ночь' : score >= 350 ? 'Серьёзные потери' : 'Провал обороны';
    G.camp.nights.push({ n: G.night, score, rate, civ: S.civ, en: Math.round(energy()) });

    const enemyCost = Object.keys(S.launched).reduce((a, k) => a + S.launched[k] * TT[k].cost, 0);
    let rows = '';
    for (const k in TT) if (S.launched[k]) rows += `<tr><td>${TT[k].n} <span class="mu">(${CLS_N[TT[k].cls]})</span></td>` +
      `<td>${S.launched[k]}</td><td>${S.killed[k]}</td><td>${S.ew[k]}</td><td>${S.hits[k]}</td></tr>`;
    const objs = G.objs.filter(o => o.hp < 100)
      .map(o => `${esc(o.n)}: <b style="color:${hpCol(o.hp)}">${Math.round(o.hp)}%</b>`).join(' · ') || 'повреждений нет';
    /* мысли ИИ-противника; в дуэли противник — человек, его мысли не показываем */
    const aiFoe = !MODE.humans.includes('atk');
    const minds = S.mind.slice(-8).map(m => `<div class="mind">${clock(m.t)} — ${esc(m.txt)}</div>`).join('');
    const last = MODE.campaignOver();

    /* поставки партнёров на следующую ночь */
    let gift = '';
    if (!last) {
      const plan = { 2: ['shield'], 3: ['krom', 'ttz'], 4: ['spaag', 'icpt'], 5: ['shield', 'ew'] }[G.night + 1];
      if (plan) {
        G.gifts.push(...plan);
        gift = `<p class="good">Поставка от партнёров без оплаты: <b>${plan.map(k => UT[k].n).join(', ')}</b>. Разместите во время подготовки (вкладка «Снабжение»).</p>`;
      }
      if (G.night === 3) {
        const b = G.units.find(u => u.k === 'bastion');
        if (b) { b.am = UT.bastion.w.am; gift += '<p class="good">Переданы ракеты для «Бастиона»: боекомплект восстановлен.</p>' }
      }
    }
    /* настроение края за ночь: спокойная ночь поднимает, отключения света роняют */
    const mBefore = G.morale;
    if (S.civ === 0) moraleAdd(6);
    if (S.uncovered < 300) moraleAdd(3);
    moraleAdd(-(100 - energy()) / 25);
    const mDelta = Math.round(G.morale - mBefore);
    const gain = Math.round((120 + (rate > .85 ? 30 : 0) + (S.civ === 0 ? 15 : 0)) * moraleMul());
    const adapt = E.dayNews.length
      ? '<h2>Разведка: изменения у противника</h2><ul>' + E.dayNews.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '';

    showModal(`<h1>Ночь ${G.night}: ${grade}</h1>
  <p class="big">Очки за ночь: <b class="ac">${score}</b> · перехвачено и подавлено РЭБ: <b>${pc(rate)}</b> · пострадавшие: <b>${S.civ}</b> · энергосистема: <b>${Math.round(energy())}%</b></p>
  <table><tr><th>Средство противника</th><th>Выпущено</th><th>Сбито</th><th>РЭБ</th><th>Попаданий</th></tr>
  ${rows || '<tr><td colspan="5">Пусков не было</td></tr>'}</table>
  <p><b>Объекты:</b> ${objs}</p>
  <p><b>Потери ПВО:</b> ${S.lost.length ? S.lost.map(k => UT[k].n).join(', ') : 'нет'} · <b>израсходовано боеприпасов на</b> ${num(S.spent)} млн · противник потратил ≈ ${num(enemyCost, 0)} млн</p>
  <p><b>Тревога:</b> ${fmtDur(G.alarmT)} (${num(S.alarmCost)} млн)${faH > .4 ? ` · <span class="bad">впустую ${fmtDur(S.falseAlarm)}</span>, доверие населения ${pc(G.alarmTrust)}` : ''}${unH > .2 ? ` · <span class="bad">без предупреждения ${fmtDur(S.uncovered)}</span>` : ''}</p>
  ${adapt}
  ${aiFoe ? `<h2>Что думал противник этой ночью</h2>${minds || '<p>—</p>'}` : ''}
  ${gift}
  <p><b>Настроение края:</b> ${Math.round(G.morale)}% (${mDelta >= 0 ? '+' : ''}${mDelta}) — ${G.morale >= 70 ? 'люди доверяют штабу' : G.morale >= 45 ? 'люди устали и раздражены' : 'край на грани: администрация урезает финансирование'}. Без тревоги каждый пострадавший бьёт по доверию сильнее; пустая тревога — тоже.</p>
  ${last ? '' : `<p>Бюджет на следующие сутки: <b class="ac">+${gain} млн</b> (с учётом настроения края ×${moraleMul().toFixed(2)})${rate > .85 ? ' (с премией за результат)' : ''}${S.civ === 0 ? ', плюс благодарность администрации' : ''}.</p>`}
  <div class="acts">${last
        ? '<button class="btn pri" data-a="final">Итоги кампании</button>'
        : '<button class="btn pri" data-a="nextDay">К подготовке следующей ночи</button>'}</div>`);
    if (!last) G.budget += gain;
  }

  function finalScreen() {
    G.phase = 'final';
    const tot = sum(G.camp.nights.map(n => n.score));
    const avg = tot / Math.max(1, G.camp.nights.length);
    const g = energy() < 15
      ? 'Энергосистема края разрушена. Командование снимает вас с должности: край перешёл на веерные отключения, промышленность стоит.'
      : avg >= 900 ? 'Край прошёл кампанию почти без потерь. Ваша схема обороны разошлась по другим краям как образцовая.'
        : avg >= 750 ? 'Край выстоял. Потери есть, но система работала и противник не добился своего.'
          : avg >= 550 ? 'Край выстоял с тяжёлыми потерями. Энергетику восстанавливают, но люди помнят эти ночи.'
            : 'Оборона не справилась. Разбор будет долгим и неприятным.';
    showModal(`<h1>Итоги кампании</h1><p class="big">${g}</p>
  <table><tr><th>Ночь</th><th>Очки</th><th>Перехват</th><th>Пострадавшие</th><th>Энергосистема</th></tr>
  ${G.camp.nights.map(n => `<tr><td>${n.n}</td><td>${n.score}</td><td>${pc(n.rate)}</td><td>${n.civ}</td><td>${n.en}%</td></tr>`).join('')}</table>
  <p>Сумма очков: <b class="ac">${tot}</b> · пострадавших за кампанию: <b>${G.civTotal}</b> · энергосистема: <b>${Math.round(energy())}%</b> · целость объектов: <b>${Math.round(integrity())}%</b></p>
  ${honorsHTML()}
  <div class="acts"><button class="btn pri" data-a="restart">Новая кампания</button></div>`);
  }

  /** герои и память кампании */
  function honorsHTML() {
    const best = {};
    for (const h of G.honors || []) best[h.cs] = h;
    const hs = Object.values(best);
    const fallen = G.fallen || [];
    return (hs.length ? `<h2>Герои кампании</h2><ul>${hs.map(h => `<li><b>«${esc(h.cs)}»</b>, ${esc(h.n)} — ${esc(h.title)}, ${h.kills} целей</li>`).join('')}</ul>` : '')
      + (fallen.length ? `<h2>Помним</h2><ul>${fallen.map(f => `<li>«${esc(f.cs)}», ${esc(f.n)} — ночь ${f.night}${f.kills ? ', на счету ' + f.kills + ' целей' : ''}</li>`).join('')}</ul>`
        : '<p class="good">За кампанию ни один расчёт не погиб.</p>');
  }

  return {
    checkStart,
    endNight,
    finalScreen
  };
})();
