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

  if (TT[k].rc && !G.weather.fpv) return fail(`Погода нелётная для FPV: ${G.weather.n.toLowerCase()}`);
  /* FPV летит недалеко: цель должна быть в пределах дальности от района пуска */
  if (TT[k].range && !patrol && dist(zone, aimOf(tgt)) > TT[k].range - 4)
    return fail(`Далеко: «${TT[k].n}» летит не дальше ${TT[k].range} км от района пуска`);
  /* маршрут: точки игрока, иначе то, что он видел в предпросмотре, иначе автомаршрут */
  const ball = !patrol && isBallistic(k);
  if (!ball) {
    const aim = patrol ? null : aimOf(tgt);
    const route = wps.length ? (patrol ? wps : [...wps, aim]) : TT[k].range ? [aim] : netPath(p.route, 40);
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
  hq(pick([`В воздухе: ${g.n}× ${TT[q.k].n} из района «${g.zone.n}».`, `Пусковые «${g.zone.n}»: пакет ушёл, ${g.n}× ${TT[q.k].n}.`,
    `Старт подтверждаю: ${TT[q.k].n}, ${g.n} шт., район «${g.zone.n}».`, `Расчёты «${g.zone.n}» докладывают: пуск ${g.n}× ${TT[q.k].n}.`]), 'hq');
}

function atkLoss(th) {
  if (!G.lossN) G.lossN = {};
  G.lossN[th.k] = (G.lossN[th.k] || 0) + 1;
  if (G.t - (G.lossT || -999) < 20) return;
  G.lossT = G.t;
  const parts = Object.entries(G.lossN).map(([k, n]) => n + '× ' + TT[k].n);
  hq(pick(['Их ПВО сбивает: ', 'Телеметрия пропала: ', 'Потери на маршруте: ', 'Связь с бортами потеряна: ']) + parts.join(', ') + '.', 'w');
  G.lossN = {};
}

function atkEw(th) {
  if (G.t - (G.ewT || -999) < 45) return;
  G.ewT = G.t;
  hq(pick([`«${TT[th.k].n}» сошёл с маршрута: работает их РЭБ.`, `РЭБ противника: «${TT[th.k].n}» потерял спутники.`,
    `«${TT[th.k].n}» уходит с курса — глушат.`, `Сбой навигации у «${TT[th.k].n}», похоже на их «Туман».`]), 'w');
}

/* ---------- перенацеливание в полёте ----------
   Средства с каналом связи (TT[k].retarget: «Шершень», «Стриж», «Кречет», FPV)
   можно развернуть на новую цель уже после пуска. Сеанс связи с пакетом —
   не чаще раза в RETARGET_GAP секунд; борта, потерявшие навигацию от РЭБ,
   команду не принимают. Невыпущенная часть пакета тоже уйдёт на новую цель. */
const RETARGET_GAP = 600;

function retargetGroup(id, t) {
  const fail = error => { toast(error, 'i'); return { ok: false, error } };
  if (G.phase !== 'night') return fail('Перенацеливать можно только ночью');
  const g = E.groups.find(x => x.id === id);
  if (!g) return fail('Нет такого пакета');
  const T = TT[g.kind];
  if (!T.retarget) return fail(`«${T.n}» не имеет канала управления: летит по заложенной программе`);
  if (G.t - (g.retT || -1e9) < RETARGET_GAP) return fail(`Следующий сеанс связи с пакетом через ${fmtDur(RETARGET_GAP - (G.t - g.retT))}`);
  let tgt = null;
  if (t && t.obj != null) { const o = objById(String(t.obj)); if (o && o.hp > 0) tgt = { obj: o } }
  else if (t && t.aim) { const a = netPoint(t.aim); if (a) tgt = { aim: { x: a.x, y: a.y, uid: t.aim.uid != null ? +t.aim.uid : undefined } } }
  if (!tgt) return fail('Укажите новую цель на карте');
  const aim = aimOf(tgt);
  let n = 0, deaf = 0;
  for (const th of G.threats) {
    if (th.dead || th.gid !== id) continue;
    if (th.lost) { deaf++; continue }
    if (T.range && (th.flown || 0) + dist(th, aim) > T.range) { deaf++; continue }
    th.tgt = tgt; th.path = [{ x: aim.x, y: aim.y }]; th.retgt = 1; th.hunt = null;
    n++;
  }
  for (const q of E.queue) if (q.gid === id) { q.tgt = tgt; q.path = [{ x: aim.x, y: aim.y }]; n++ }
  if (!n) return fail(deaf ? 'Борта пакета не отвечают: РЭБ или не хватит дальности' : 'В пакете нет бортов на связи');
  g.tgt = tgt; g.retT = G.t;
  hq(`Перенацелено: ${n}× ${T.n} → ${tgt.obj ? '«' + tgt.obj.n + '»' : 'кв. ' + sq(aim)}.${deaf ? ' Не ответили: ' + deaf + '.' : ''}`, 'hq');
  return { ok: true, n };
}