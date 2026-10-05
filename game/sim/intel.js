'use strict';
/* ============================================================
   ИНФОРМАЦИЯ ОТ НАСЕЛЕНИЯ И ФОНОВАЯ РАЗВЕДКА
   Варианты текстов — game/data/phrases.js (CIV_NEAR, CIV_FAKE, INTEL_NOISE).
   ============================================================ */

/* ---------- сообщения от населения ---------- */
function civIntel() {
  const near = G.threats.find(th => !th.dead && ['drone', 'decoy', 'loiter', 'fpv', 'mother'].includes(th.cls) &&
    WD.cities.some(c => !c.enemy && dist(c, th) < 15));
  if (near) {
    const c = nearCity(near);
    return { txt: pickFresh('civn', CIV_NEAR)({ gen: c.gen, dir: DIRS_ON[dirIdx(near.hx, near.hy)] }), gr: pick(['E-4', 'E-3', 'D-3']) };
  }
  if (chance(.3)) {
    const c = pick(WD.cities.filter(c => !c.enemy));
    return { txt: pickFresh('civf', CIV_FAKE)({ gen: c.gen }), gr: 'E-5' };
  }
  return null;
}

/* ---------- фоновая разведка: раз в 40–100 минут, часть сведений недостоверна ---------- */
function intelNoise() {
  if (G.t < (G.noiseT || 0)) return;
  G.noiseT = G.t + R(2400, 6000);
  const it = pickFresh('noise', INTEL_NOISE);
  const z = pick(ZONES.filter(z => !z.sea && !z.off));
  const c = pick(WD.cities.filter(c => !c.enemy));
  const next = G.wxNext ? wxById(G.wxNext.id).n.toLowerCase() : 'без изменений';
  const txt = it.t({ zone: z.n, gen: c.gen, wind: G.wind ? G.wind.v : 0, trend: next });
  MODE.intelAt(G.t + 1, txt, it.gr, '', 1);
}

/* ---------- эфир между событиями: доклады «всё спокойно», погода, усталость ---------- */
function idleChatter() {
  if (G.t < (G.chatT || 0)) return;
  G.chatT = G.t + R(1500, 3600);
  const pool = G.units.filter(u => u.hp > 0 && u.st === 'ready' && !engagedNow(u) && !UT[u.k].fake);
  if (!pool.length) return;
  const u = pick(pool);
  const quietNow = !G.threats.some(th => !th.dead && dist(th, u) < 40);
  if (UT[u.k].eo && !quietNow && chance(.5)) {
    const th = G.threats.find(th => !th.dead && dist(th, u) < UT[u.k].eo * 2.5 && (EOK[th.cls] || 0) > .5);
    if (th) { say(u, phr('hear', { az: az(u, th) }, u)); return }
  }
  if (!quietNow) return;
  if (G.wind && G.wind.v >= 10 && chance(.3)) { say(u, phr('wind', { wind: G.wind.v }, u), 'm'); return }
  say(u, phr('quiet', { w: G.weather.n, am: u.am }, u), 'm');
}
