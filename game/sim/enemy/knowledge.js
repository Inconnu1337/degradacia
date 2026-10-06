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
  k.quiet = 0;
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
    if (k.src !== 'разведчик' && k.src !== 'FPV' && k.src !== 'анализ РТР') k.src = 'РТР';
    setKnowPos(k, u, 3.5 * (1 - k.conf) + .25);
    quietCheck(u, k);
  }
  /* разведчики и постановщики помех смотрят вниз */
  for (const th of G.threats) {
    if (th.dead || (th.cls !== 'recon' && th.cls !== 'ewuav')) continue;
    const rr = th.cls === 'recon' ? 6.5 : 4;
    for (const u of G.units) {
      if (dist(u, th) > rr * G.weather.eo) continue;
      const k = eKnow(u);
      if (k.conf < .9 || G.t - k.t > 300) {
        /* разведчик сверху видит надувную технику: макет распознаёт в 4 случаях из 5 */
        k.type = u.k === 'decoy' ? (chance(.2) ? 'shield' : 'decoy') : u.k;
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

/* ---------- «излучает, но не стреляет» ----------
   Если «ЗРК» долго светит РЛС, пока рядом идут наши борта, и ни разу не
   пускает ракеты — это, скорее всего, макет. Копится время такой тишины
   (k.quiet, сбрасывает eSawLaunch); набралось QUIET_T — аналитики помечают
   позицию как макет. Настоящий ЗРК с запретом огня тоже может попасть под
   подозрение: это честный обман. */
const QUIET_T = 2400;

function quietCheck(u, k) {
  if (k.type === 'decoy' || !['shield', 'bastion', 'krom'].includes(k.type)) return;
  const R0 = (UT[k.type].w ? UT[k.type].w.r : 30) * .8;
  if (!G.threats.some(th => !th.dead && !th.lost && th.cls !== 'ballistic' && th.cls !== 'aeroball' && dist(th, u) < R0)) return;
  k.quiet = (k.quiet || 0) + 1;   /* eObserve — раз в игровую секунду */
  if (k.quiet < QUIET_T) return;
  k.type = 'decoy'; k.src = 'анализ РТР'; k.quiet = 0;
  const nc = nearCity(u);
  mind(`Анализ РТР: «ЗРК» в кв. ${sq(u)}${nc ? ' у ' + nc.gen : ''} давно излучает, наши борта шли рядом — и ни одного пуска. Скорее всего, макет.`);
}

function eLoss(th) {
  const key = Math.floor(th.x / 10) + ',' + Math.floor(th.y / 10);
  E.heat[key] = (E.heat[key] || 0) + 1;
  const g = E.groups.find(g => g.id === th.gid);
  if (g) g.lost++;
}
