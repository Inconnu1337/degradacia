'use strict';
/* ============================================================
   ОБОРОНА: снабжение
   Закупка, размещение, расформирование, ремонт объектов.
   ============================================================ */

/* ---------- снабжение ---------- */
/** поставить расчёт в точку p; возвращает расчёт или null */
function placeUnit(k, p, gift) {
  if (G.phase !== 'prep' && G.phase !== 'night') return null;
  if (side(p.x, p.y) !== 1) { toast('Ставить можно только на своей территории', 'i'); return null }
  if (G.units.some(u => dist(u, p) < 2.2)) { toast('Слишком близко к другому расчёту', 'i'); return null }
  if (UT[k].max && G.units.filter(u => u.k === k).length >= UT[k].max) { toast(`Больше ${UT[k].max} не положено: ${UT[k].n}`, 'i'); return null }
  /* тяжёлая техника встаёт у дороги — по тем же правилам, что и ночной марш */
  if (HEAVY_UNITS.includes(k)) { const rd = roadDist(p); if (rd.d > ROAD_REACH && rd.p) p = rd.p }
  if (gift) {
    const i = G.gifts.indexOf(k);
    if (i < 0) return null;
    G.gifts.splice(i, 1);
  } else {
    if (!canBuy(k)) { toast('Не хватает бюджета', 'i'); return null }
    G.budget -= UT[k].cost;
  }
  const u = addUnit(k, p.x, p.y, G.phase === 'prep');
  if (G.phase === 'night') {
    u.st = 'deploy'; u.stT = G.t + UT[k].dep + dist(G.hq, p) / UT[k].sp * .35;
    hq(`«${esc(u.crew.cs)}» (${UT[k].n}) выдвигается на позицию, готовность ~${fmtDur(u.stT - G.t)}.`, 'hq');
  } else hq(`Развёрнут расчёт «${esc(u.crew.cs)}» — ${UT[k].n}.`, 'g');
  return u;
}

function sellUnit(u) {
  if (G.phase !== 'prep') { toast('Расформировать расчёт можно только днём', 'i'); return false }
  G.budget += Math.round(UT[u.k].cost * .6);
  hq(`Расчёт «${esc(u.crew.cs)}» расформирован, в бюджет возвращено ${Math.round(UT[u.k].cost * .6)} млн.`, 'm');
  G.units.splice(G.units.indexOf(u), 1);
  return true;
}

function repairObj(id) {
  const o = objById(id);
  if (!o || o.rep || G.phase !== 'prep' || G.budget < repCost(o) || o.hp >= 100) return false;
  if ((G.dayRep || 0) <= 0) { toast('Все ремонтные бригады сегодня заняты', 'i'); return false }
  G.budget -= repCost(o); G.dayRep--;
  o.hp = Math.min(100, o.hp + repGain(o));
  o.rep = true;
  hq(`Ремонтная бригада: «${esc(o.n)}» восстановлен до ${Math.round(o.hp)}%.${o.hp < 50 ? ' Разрушения тяжёлые: на полное восстановление уйдут дни.' : ''}`, 'g');
  return true;
}
