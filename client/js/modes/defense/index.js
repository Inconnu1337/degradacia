'use strict';
/* ============================================================
   ИНТЕРФЕЙС «ОБОРОНА» — сторона штаба ПВО (клиент)
   В одиночной игре противник — ИИ сервера, в дуэли — человек.
   ============================================================ */

defineMode({
  id: 'defense',
  hud: {
    title: 'Ночной рубеж',
    desc: 'Ночной рубеж — штабная игра о координации воздушной обороны вымышленного края.',
    brand: 'НОЧНОЙ РУБЕЖ',
    labels: { bud: 'Бюджет', en: 'Энергосистема', civ: 'Пострадавшие', thr: 'На радарах' },
    paceTitle: 'Автоматически замедлять время при появлении целей, запросах расчётов и пусках баллистики',
    zonesText: 'Зоны',
    zonesTitle: 'Показать зоны поражения и обнаружения всех расчётов (Z)',
    alarmBtn: true, spoilBtn: true
  },
  onEnter() { G.tabR = G.tabR || 'ord' },

  render: DefenseRender,
  ui: Object.assign({}, DefenseUI, { onAction: DefenseInput.onAction }),
  input: {
    pickAt: DefenseInput.pickAt,
    mapClick: DefenseInput.mapClick,
    tooltip: DefenseInput.tooltip
  }
});
