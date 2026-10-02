'use strict';
/* ============================================================
   КАРТИНА ОБОРОНЫ у стороны налёта (неточная)
   Радиотехническая разведка, разведчики, замеченные пуски.
   ============================================================ */

/* ---------- картина нашего ПВО в голове противника ---------- */
function eKnow(u) {
  let k = E.know[u.id];
  if (!k) k = E.know[u.id] = {
    uid: u.id, type: u.k === 'decoy' ? 'shield' : u.k,
    x: u.x, y: u.y, conf: 0, t: G.t, ox: gauss(), oy: gauss(), shots: [], src: 'РТР'
  };
  return k;
}

function setKnowPos(k, u, err) { k.x = u.x + k.ox * err; k.y = u.y + k.oy * err; k.t = G.t }

function eSawLaunch(u) {
  const k = eKnow(u);
  k.conf = Math.min(1, k.conf + .05);
  k.shots.push(G.t);
  if (k.shots.length > 30) k.shots.shift();
  setKnowPos(k, u, 3.5 * (1 - k.conf) + .2);
}

function eObserve() {
  /* радиотехническая разведка ловит всё, что излучает */
  for (const u of G.units) {
    const T = UT[u.k];
    const emits = u.rOn || (u.k === 'ew' && u.st === 'ready');
    if (!emits) continue;
    const k = eKnow(u);
    k.conf = Math.min(1, k.conf + (T.pw || .6) * .0008);
    k.src = 'РТР';
    setKnowPos(k, u, 3.5 * (1 - k.conf) + .25);
  }
  /* разведчики и постановщики помех смотрят вниз */
  for (const th of G.threats) {
    if (th.dead || (th.cls !== 'recon' && th.cls !== 'ewuav')) continue;
    const rr = th.cls === 'recon' ? 6.5 : 4;
    for (const u of G.units) {
      if (dist(u, th) > rr * G.weather.eo) continue;
      const k = eKnow(u);
      if (k.conf < .9 || G.t - k.t > 300) {
        k.type = u.k === 'decoy' ? (chance(.6) ? 'shield' : 'decoy') : u.k;
        k.conf = .92; k.src = 'разведчик';
        setKnowPos(k, u, .3);
        if (['bastion', 'shield', 'krom', 'spaag', 'horizon'].includes(k.type) && !k.rep) {
          k.rep = 1;
          const nc = nearCity(u);
          mind(`«Сова» над кв. ${sq(u)}: вижу ${UT[k.type].n}${nc ? ' у ' + nc.gen : ''}. Координаты точные.`);
        }
      }
    }
  }
}

function eLoss(th) {
  const key = Math.floor(th.x / 10) + ',' + Math.floor(th.y / 10);
  E.heat[key] = (E.heat[key] || 0) + 1;
  const g = E.groups.find(g => g.id === th.gid);
  if (g) g.lost++;
}
