'use strict';
/* ============================================================
   НАЛЁТ: ввод
   Клик по карте задаёт цель или точку маршрута; подсказки показывают контакты разведки.
   ============================================================ */

const AttackInput = (() => {
  /** что под курсором; noThreats — не брать свои борта (клик по карте выбирает цель, а не дрон над ней) */
  function pickAt(sp, noThreats) {
    let best = null, bd = 1e9;
    const consider = (d, hit) => { if (d < bd) { bd = d; best = hit; } };
    if (!noThreats) for (const th of G.threats) {
      if (th.dead) continue;
      const q = w2s(th);
      consider(Math.hypot(q.x - sp.x, q.y - sp.y) < 18 ? Math.hypot(q.x - sp.x, q.y - sp.y) : 1e9, { type: 't', id: th.id });
    }
    if (E) for (const id in E.know) {
      const k = E.know[id];
      if (k.conf < 0.28) continue;
      const q = w2s(k), d = Math.hypot(q.x - sp.x, q.y - sp.y);
      if (d < clamp(G.view.s * 5.2, 32, 92) * .45) consider(d, { type: 'k', id: k.uid });
    }
    for (const o of G.objs) {
      const q = w2s(o), d = Math.hypot(q.x - sp.x, q.y - sp.y);
      const r = clamp(12 + G.view.s * 2.2, 14, 26);
      if (d < r) consider(d, { type: 'o', id: o.id });
    }
    return best;
  }

  function mapClick(sp) {
    if (!G || G.phase === 'debrief' || G.phase === 'final') return;
    const p = ensurePlan();
    const w = s2w(sp);
    /* объект или контакт под своим же бортом важнее борта (иначе клик по цели «проваливается»);
       свой борт выбирается, только если кликнули точно по нему */
    const th = nearThreat(sp);
    const hit = (th && th.d < 9 && !(G.mode && G.mode.t === 'retarget')) ? { type: 't', id: th.id } : pickAt(sp, true) || pickAt(sp);
    if (G.mode && G.mode.t === 'retarget') {
      const m = G.mode, g = E.groups.find(x => x.id === m.gid);
      if (!g) { G.mode = null; hint(''); return }
      /* разведчик — только точки маршрута; ударный — изломы, а объект или контакт — цель */
      if (!routeOnly(g.kind) && hit && (hit.type === 'o' || hit.type === 'k')) {
        let tgt;
        if (hit.type === 'o') tgt = { obj: hit.id };
        else { const k = knowById(hit.id); tgt = k ? { aim: { x: k.x, y: k.y, uid: k.uid } } : { aim: w } }
        sendRetarget(tgt);
        return;
      }
      if (m.wps.length >= 8) { toast('Не больше 8 точек', 'i'); return }
      m.wps.push({ x: w.x, y: w.y });
      hint(routeOnly(g.kind)
        ? `Точка ${m.wps.length}. Ещё клик — следующая; ПКМ или Enter — отправить маршрут. Esc — отмена.`
        : `Излом ${m.wps.length}. Клик по объекту или контакту — цель; ПКМ или Enter — цель в последней точке. Esc — отмена.`);
      uiDirty();
      return;
    }
    if (routeOnly(p.k)) {
      addRoutePoint(w);
      return;
    }
    /* «Свой маршрут»: пустое место — излом, объект или контакт — цель (и маршрут готов) */
    if (G.mode && G.mode.t === 'route') {
      if (hit && (hit.type === 'o' || hit.type === 'k')) {
        G.mode = null; hint('');
        if (hit.type === 'o') setAimObj(objById(hit.id));
        else { const k = knowById(hit.id); if (k) setAimContact(k); }
        toast(p.wps.length ? `Цель выбрана, изломов: ${p.wps.length}` : 'Цель выбрана', 'i');
      } else addRoutePoint(w);
      return;
    }
    if (hit && hit.type === 'o') setAimObj(objById(hit.id));
    else if (hit && hit.type === 'k') { const k = knowById(hit.id); if (k) setAimContact(k); }
    else if (hit && hit.type === 't') { G.sel = hit; uiDirty(); }
    else setAimPoint(w);
  }

  /** ближайший свой борт к точке экрана: { id, d } */
  function nearThreat(sp) {
    let best = null;
    for (const th of G.threats) {
      if (th.dead) continue;
      const q = w2s(th), d = Math.hypot(q.x - sp.x, q.y - sp.y);
      if (!best || d < best.d) best = { id: th.id, d };
    }
    return best;
  }

  /** начать перенацеливание пакета */
  function startRetarget(gid) {
    const g = E.groups.find(x => x.id === gid);
    if (!g) return;
    G.mode = { t: 'retarget', gid, wps: [] };
    hint(routeOnly(g.kind)
      ? `Новый маршрут «${TT[g.kind].n}»: кликайте точки, ПКМ или Enter — отправить. Esc — отмена.`
      : `Перенацелить «${TT[g.kind].n}»: клик по объекту или контакту — новая цель; клики по карте — изломы, ПКМ или Enter — цель в последней точке. Esc — отмена.`);
    lastRC = ''; uiDirty();
  }

  /** отправить новый маршрут / цель; true — режим был активен */
  function sendRetarget(tgt) {
    const m = G.mode;
    if (!m || m.t !== 'retarget') return false;
    const g = E.groups.find(x => x.id === m.gid);
    const wps = m.wps.slice();
    if (!tgt && g && !routeOnly(g.kind)) {
      if (!wps.length) { toast('Укажите цель: объект, контакт или точку', 'i'); return true }
      const last = wps.pop();
      tgt = { aim: { x: last.x, y: last.y } };
    }
    if (g && routeOnly(g.kind) && !wps.length) { toast('Кликните хотя бы одну точку маршрута', 'i'); return true }
    G.mode = null; hint('');
    cmd('retarget', { id: m.gid, tgt: tgt || null, wps }).then(() => { lastRC = ''; uiDirty() });
    uiDirty();
    return true;
  }

  function tooltip(hit) {
    let t = '';
      if (hit.type === 't') { const th = thrById(hit.id); if (th) t = `<b>${esc(TT[th.k].n)}</b><br>${CLS_N[th.cls]}, ${Math.round(th.sp * 3600)} км/ч` }
      else if (hit.type === 'o') { const o = objById(hit.id); if (o) t = `<b>${esc(o.n)}</b><br>${OT[o.type].n} · ${Math.round(o.hp)}%` }
      else if (hit.type === 'k') { const k = knowById(hit.id); if (k) t = `<b>${esc(UT[k.type] ? UT[k.type].n : k.type)}</b><br>контакт ${pc(k.conf)} · ${esc(k.src)}` }
    return t;
  }

  /** ПКМ: отправить новый маршрут пакета или снять последнюю точку маршрута */
  function onContextMenu(e) {
    if (G.mode && G.mode.t === 'retarget' && G.mode.wps.length) return sendRetarget();
    if (G.plan && routeOnly(G.plan.k) && G.plan.wps.length) {
      G.plan.wps.pop();
      computePreview();
      lastRC = '';
      toast('Последняя точка снята', 'i');
      uiDirty();
      return true;
    }
    return false;
  }

  return {
    pickAt,
    mapClick,
    tooltip,
    onContextMenu,
    startRetarget,
    finish: () => sendRetarget()
  };
})();
