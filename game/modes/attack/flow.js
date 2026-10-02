'use strict';
/* ============================================================
   НАЛЁТ: ход кампании (сервер)
   Разбор ночи и итоги для стороны налёта. В одиночном налёте
   итоги пишутся в G.camp, в дуэли — в G.campA (G.camp ведёт ПВО).
   ============================================================ */

const AttackFlow = (() => {
  const camp = () => MODE.humans.includes('def') ? G.campA : G.camp;

  function endNight() {
    G.phase = 'debrief'; G.speed = 0;
    const launched = sum(Object.values(S.launched));
    const killed = sum(Object.values(S.killed));
    const ew = sum(Object.values(S.ew));
    const hits = sum(Object.values(S.hits));
    const broke = launched ? Math.max(0, launched - killed) / launched : 0;
    const score = Math.max(0, Math.round(S.objDmg * 8 + S.lost.length * 40 + hits * 4 - S.civ * 14));
    const en = Math.round(energy());
    const grade = en < 22 ? 'Энергосистема погашена'
      : S.objDmg > 70 ? 'Тяжёлый ущерб'
        : S.objDmg > 28 ? 'Удар дошёл'
          : hits > 0 ? 'Слабый результат' : 'ПВО устояло';
    camp().nights.push({ n: G.night, score, rate: broke, civ: S.civ, en });
    let rows = '';
    for (const k in TT) if (S.launched[k]) rows += `<tr><td>${TT[k].n}</td><td>${S.launched[k]}</td><td>${S.killed[k]}</td><td>${S.ew[k]}</td><td>${S.hits[k]}</td></tr>`;
    const objs = G.objs.filter(o => o.hp < 100).map(o => `${esc(o.n)}: <b style="color:${hpCol(o.hp)}">${Math.round(o.hp)}%</b>`).join(' · ') || 'объекты целы';
    const last = MODE.campaignOver();
    showModal(`<h1>Ночь ${G.night}: ${grade}</h1>
    <p class="big">Очки удара: <b class="ac">${score}</b> · дошло до целей и района: <b>${pc(broke)}</b> · сопутствующие: <b>${S.civ}</b> · их энергия: <b>${en}%</b></p>
    <table><tr><th>Средство</th><th>Пуск</th><th>Сбито</th><th>РЭБ</th><th>Попаданий</th></tr>
    ${rows || '<tr><td colspan="5">Пусков не было</td></tr>'}</table>
    <p><b>Объекты:</b> ${objs}</p>
    <p><b>Уничтожено их техники:</b> ${S.lost.length ? S.lost.map(k => UT[k].n).join(', ') : 'нет'} · попаданий по площадям: ${hits} · сбито ${killed}, уведено РЭБ ${ew}</p>
    <div class="acts">${last
        ? '<button class="btn pri" data-a="final">Итоги кампании</button>'
        : '<button class="btn pri" data-a="nextDay">К следующей ночи</button>'}</div>`);
  }

  function finalScreen() {
    G.phase = 'final';
    const tot = sum(camp().nights.map(n => n.score));
    const en = energy();
    const g = en < 18
      ? 'Энергосистема края погашена. Ударная кампания достигла главного.'
      : en < 45
        ? 'Край серьёзно повреждён, но сеть ещё жива. До полного результата не хватило.'
        : 'ПВО удержала край. Большая часть объектов работает.';
    showModal(`<h1>Итоги налётов</h1><p class="big">${g}</p>
    <table><tr><th>Ночь</th><th>Очки</th><th>Прорыв</th><th>Сопутств.</th><th>Их энергия</th></tr>
    ${camp().nights.map(n => `<tr><td>${n.n}</td><td>${n.score}</td><td>${pc(n.rate)}</td><td>${n.civ}</td><td>${n.en}%</td></tr>`).join('')}</table>
    <p>Сумма: <b class="ac">${tot}</b> · сопутствующих за кампанию: <b>${G.civTotal}</b> · их энергия: <b>${Math.round(en)}%</b> · целость объектов: <b>${Math.round(integrity())}%</b></p>
    <div class="acts"><button class="btn pri" data-a="restart">Новая кампания</button></div>`);
  }

  return {
    endNight,
    finalScreen
  };
})();
