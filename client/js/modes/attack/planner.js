'use strict';
/* ============================================================
   НАЛЁТ: черновик удара (клиент)
   Выбор средства, района пуска, цели, маршрута — всё местное (G.plan).
   Предпросмотр маршрута считается тем же кодом, что и на сервере
   (shared/routing.js), по тому, что игрок знает о ПВО (E.know).
   «Пуск» отправляет черновик командой launch: сервер проверит арсенал,
   пусковую логистику (shared/data/launch.js) и поставит пакет в очередь.
   ============================================================ */

function ensurePlan() {
  if (!G.plan) G.plan = { k: 'jalo', n: 8, delay: 0, wps: [], tgt: null, zid: 'tarsk', high: false, preview: null };
  if (!routeOnly(G.plan.k) && !G.plan.tgt && G.objs && G.objs.length) {
    const o = G.objs.slice().sort((a, b) => (b.hp > 0) - (a.hp > 0) || b.v - a.v)[0];
    if (o && o.hp > 0) G.plan.tgt = { obj: o };
  }
  return G.plan;
}

function syncZone() {
  const p = ensurePlan();
  const list = zonesFor(p.k);
  if (!list.some(z => z.id === p.zid)) p.zid = list[0] ? list[0].id : null;
}

function chosenZone() {
  syncZone();
  return ZONES.find(z => z.id === G.plan.zid) || null;
}

function computePreview() {
  const p = ensurePlan();
  const zone = chosenZone();
  if (!zone) { p.preview = null; return; }
  const start = { x: zone.x, y: zone.y };
  if (routeOnly(p.k)) {
    p.preview = p.wps.length ? [start, ...p.wps.map(q => ({ x: q.x, y: q.y }))] : null;
    return;
  }
  const aim = aimOf(p.tgt);
  if (!aim) { p.preview = null; return; }
  const T = TT[p.k];
  const ball = T.cls === 'ballistic' || T.cls === 'aeroball';
  if (ball) p.preview = [start, { x: aim.x, y: aim.y }];
  else if (p.wps.length) p.preview = [start, ...p.wps.map(q => ({ x: q.x, y: q.y })), { x: aim.x, y: aim.y }];
  else p.preview = [start, ...eRoute(start, aim, T.cls)];
}

function setAimObj(o) {
  ensurePlan();
  G.plan.tgt = { obj: o };
  G.sel = { type: 'o', id: o.id };
  G.tabR = 'strike';
  computePreview();
  uiDirty();
}

function setAimContact(k) {
  ensurePlan();
  G.plan.tgt = { aim: { x: k.x, y: k.y, uid: k.uid } };
  G.sel = { type: 'k', id: k.uid };
  G.tabR = 'strike';
  computePreview();
  uiDirty();
}

function setAimPoint(w) {
  ensurePlan();
  G.plan.tgt = { aim: { x: w.x, y: w.y } };
  G.sel = null;
  G.tabR = 'strike';
  computePreview();
  uiDirty();
}

function addRoutePoint(w) {
  const p = ensurePlan();
  if (p.wps.length >= 8) { toast('На маршруте уже 8 точек', 'i'); return; }
  p.wps.push({ x: w.x, y: w.y });
  computePreview();
  toast('Точка маршрута ' + p.wps.length, 'i');
  uiDirty();
}

/** отправить черновик серверу; ответ приходит уже после свежего снимка */
function launchStrike() {
  if (G.phase !== 'prep' && G.phase !== 'night') { toast('Пуски только днём в план или ночью', 'i'); return; }
  const p = ensurePlan();
  const patrol = routeOnly(p.k);
  if (patrol && !p.wps.length) { toast('Кликните маршрут на карте: разведчик идёт только по вашим точкам', 'i'); return; }
  if (!patrol && !p.tgt) { toast('Кликните точку на карте', 'i'); return; }
  syncZone();
  if (!p.preview) computePreview();
  const tgt = patrol || !p.tgt ? null : p.tgt.obj ? { obj: p.tgt.obj.id } : { aim: p.tgt.aim };
  const route = !patrol && !p.wps.length && p.preview && !isBallistic(p.k) ? p.preview.slice(1) : [];
  cmd('launch', { plan: { k: p.k, n: p.n, zid: p.zid, delay: p.delay, high: p.high, wps: p.wps, route, tgt } }).then(res => {
    if (!res.ok) return;
    p.wps = [];
    computePreview();
    lastRC = ''; uiDirty();
  });
}

function cancelGroup(id) { cmd('cancelg', { id }).then(() => { lastRC = ''; uiDirty() }) }

/** когда пакет реально уйдёт: подготовка + очередь площадок района (как посчитает сервер) */
function plannedLaunch(p) {
  const zone = chosenZone();
  if (!zone || !TT[p.k]) return null;
  return { t: earliestLaunch(p.k, zone.id, p.delay), gap: launchSpacing(p.k, zone.id) };
}
