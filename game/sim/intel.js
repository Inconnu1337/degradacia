'use strict';
/* ============================================================
   ИНФОРМАЦИЯ ОТ НАСЕЛЕНИЯ
   ============================================================ */

/* ---------- сообщения от населения ---------- */
function civIntel() {
  const near = G.threats.find(th => !th.dead && ['drone', 'decoy', 'loiter'].includes(th.cls) &&
    WD.cities.some(c => !c.enemy && dist(c, th) < 15));
  if (near) {
    const c = nearCity(near);
    return { txt: `Жители ${c.gen} сообщают о звуке «мопеда» над окраинами.`, gr: 'E-4' };
  }
  if (chance(.3)) {
    const c = pick(WD.cities.filter(c => !c.enemy));
    return { txt: `Сообщение от населения: «низко летит что-то гудящее» над ${c.gen}. Не подтверждено.`, gr: 'E-5' };
  }
  return null;
}
