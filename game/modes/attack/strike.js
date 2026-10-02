'use strict';
/* ============================================================
   НАЛЁТ: пуск пакетов (сервер)
   Клиент собирает черновик удара у себя (client/js/modes/attack/planner.js)
   и присылает его командой launch. Здесь черновик проверяется и
   превращается в пакет в очереди пусков (eGroup) с учётом пусковой
   логистики: ночной лимит, время подготовки, очередь площадок района
   (shared/data/launch.js).
   Функции atk* — хуки режима: сводки стороне налёта.
   ============================================================ */

const STRIKE_DELAYS = [0, 1, 2, 4, 6];
const STRIKE_COUNTS = [1, 2, 4, 6, 8, 12];

/** точка из сети: только конечные числа в пределах карты */
function netPoint(p) {
  if (!p || typeof p !== 'object') return null;
  const x = +p.x, y = +p.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < -40 || x > WW + 40 || y < -40 || y > WH + 40) return null;
  return { x, y };
}

function netPath(a, max) {
  if (!Array.isArray(a)) return [];
  const r = [];
  for (const p of a.slice(0, max)) { const q = netPoint(p); if (q) r.push(q) }
  return r;
}

/**
 * пуск по черновику игрока
 * p = { k, n, zid, delay, high, wps:[{x,y}], route:[{x,y}], tgt: { obj: id } | { aim: { x, y, uid } } }
 * route — маршрут, который игрок видел в предпросмотре (необязательно)
 */
function launchStrike(p) {
  const fail = error => { toast(error, 'i'); return { ok: false, error } };
  if (G.phase !== 'prep' && G.phase !== 'night') return fail('Пуски только днём в план или ночью');
  if (!p || !ATK_KINDS.includes(p.k)) return fail('Неизвестное средство');
  const k = p.k;
  const n = STRIKE_COUNTS.includes(+p.n) ? +p.n : 1;
  const delay = STRIKE_DELAYS.includes(+p.delay) ? +p.delay : 0;
  const patrol = routeOnly(k);
  const wps = netPath(p.wps, 8);
  if (patrol && !wps.length) return fail('Кликните маршрут на карте: разведчик идёт только по вашим точкам');

  let tgt = null;
  if (!patrol) {
    if (p.tgt && p.tgt.obj != null) {
      const o = objById(p.tgt.obj);
      if (o) tgt = { obj: o };
    } else if (p.tgt && p.tgt.aim) {
      const a = netPoint(p.tgt.aim);
      if (a) tgt = { aim: { x: a.x, y: a.y, uid: p.tgt.aim.uid != null ? +p.tgt.aim.uid : undefined } };
    }
    if (!tgt) return fail('Кликните точку на карте');
    if (!aimOf(tgt)) return fail('Цель уже уничтожена');
  }
  const list = zonesFor(k);
  const zone = list.find(z => z.id === p.zid) || list[0];
  if (!zone) return fail('Нет района пуска для этого средства');
  const night = G.phase === 'night';
  if ((E.stock[k] || 0) <= 0) return fail('«' + TT[k].n + '» в арсенале нет');
  /* пусковая логистика (shared/data/launch.js): ночной лимит, подготовка, очередь площадок */
  const left = capLeft(k);
  if (left <= 0) return fail(`Расчёты за эту ночь больше не подготовят: ${CAP_N[capGroup(k)]}`);
  if (n > left) return fail(`За эту ночь подготовят ещё ${left}: ${CAP_N[capGroup(k)]}`);
  const when = earliestLaunch(k, zone.id, delay);
  const spacing = launchSpacing(k, zone.id);
  const busy = when > (night ? G.t : 0) + delay * 3600 + 60;
  if (when + (Math.min(n, E.stock[k]) - 1) * spacing > NIGHT_LEN - 900)
    return fail(busy ? `Пусковые района «${zone.n}» заняты до ${clock(when)}: до рассвета пакет не успеет` : 'До рассвета этот пуск не успевает');

  /* маршрут: точки игрока, иначе то, что он видел в предпросмотре, иначе автомаршрут */
  const ball = !patrol && isBallistic(k);
  if (!ball) {
    const aim = patrol ? null : aimOf(tgt);
    const route = wps.length ? (patrol ? wps : [...wps, aim]) : netPath(p.route, 40);
    ROUTE_OVERRIDE = route.length ? route : null;
  }
  if (patrol) {
    const end = wps[wps.length - 1];
    tgt = { aim: { x: end.x, y: end.y }, patrol: 1 };
  }
  const g = eGroup(k, n, zone, tgt, {
    launch: when, spacing, exact: patrol || wps.length > 0,
    op: patrol ? 'маршрут' : 'удар', wave: 'u' + (G.pid = (G.pid || 0) + 1), high: !!p.high
  });
  ROUTE_OVERRIDE = null;
  if (!g) return fail('Пуск не собрался');
  E.used[capGroup(k)] = (E.used[capGroup(k)] || 0) + g.n;
  const key = laneKey(k, zone.id);
  E.zbook[key] = Math.max(E.zbook[key] || 0, g.launch + g.n * spacing);
  /* мониторинг ПВО замечает волну дронов */
  flushWaveIntel();
  const where = patrol ? ('маршрут, ' + wps.length + ' тч.') : tgt.obj ? '«' + tgt.obj.n + '»' : 'кв. ' + sq(tgt.aim);
  hq(`Пакет: ${g.n}× ${TT[g.kind].n}, район «${zone.n}» → ${where}. Пуск ${clock(g.launch)}, подлёт около ${fmtDur(Math.max(0, g.arrive - g.launch))}.`, 'hq');
  return { ok: true, gid: g.id };
}

function cancelGroup(id) {
  const g = E.groups.find(x => x.id === id);
  if (!g) return { ok: false, error: 'нет такого пакета' };
  const pending = E.queue.filter(q => q.gid === id);
  E.stock[g.kind] = (E.stock[g.kind] || 0) + pending.length;
  E.used[capGroup(g.kind)] = Math.max(0, (E.used[capGroup(g.kind)] || 0) - pending.length);
  E.queue = E.queue.filter(q => q.gid !== id);
  if (!g.launched) E.groups = E.groups.filter(x => x.id !== id);
  else g.n = g.launched;
  hq('Пакет снят, невыпущенное вернулось в арсенал.', 'm');
  return { ok: true };
}

function atkLaunchNote(q) {
  const g = E.groups.find(x => x.id === q.gid);
  if (!g || g._noted) return;
  g._noted = 1;
  hq(`В воздухе: ${g.n}× ${TT[q.k].n} из района «${g.zone.n}».`, 'hq');
}

function atkLoss(th) {
  if (!G.lossN) G.lossN = {};
  G.lossN[th.k] = (G.lossN[th.k] || 0) + 1;
  if (G.t - (G.lossT || -999) < 20) return;
  G.lossT = G.t;
  const parts = Object.entries(G.lossN).map(([k, n]) => n + '× ' + TT[k].n);
  hq('Их ПВО сбивает: ' + parts.join(', ') + '.', 'w');
  G.lossN = {};
}

function atkEw(th) {
  if (G.t - (G.ewT || -999) < 45) return;
  G.ewT = G.t;
  hq(`«${TT[th.k].n}» сошёл с маршрута: работает их РЭБ.`, 'w');
}
