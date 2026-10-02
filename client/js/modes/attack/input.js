'use strict';
/* ============================================================
   НАЛЁТ: ввод
   Клик по карте задаёт цель или точку маршрута; подсказки показывают контакты разведки.
   ============================================================ */

const AttackInput = (() => {
  function pickAt(sp) {
    let best = null, bd = 1e9;
    const consider = (d, hit) => { if (d < bd) { bd = d; best = hit; } };
    for (const th of G.threats) {
      if (th.dead) continue;
      const q = w2s(th);
      consider(Math.hypot(q.x - sp.x, q.y - sp.y) < 18 ? Math.hypot(q.x - sp.x, q.y - sp.y) : 1e9, { type: 't', id: th.id });
    }
    if (E) for (const id in E.know) {
      const k = E.know[id];
      if (k.conf < 0.28) continue;
      const q = w2s(k), d = Math.hypot(q.x - sp.x, q.y - sp.y);
      if (d < 16) consider(d, { type: 'k', id: k.uid });
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
    const hit = pickAt(sp);
    if (routeOnly(p.k) || (G.mode && G.mode.t === 'route')) {
      addRoutePoint(w);
      return;
    }
    if (hit && hit.type === 'o') setAimObj(objById(hit.id));
    else if (hit && hit.type === 'k') { const k = knowById(hit.id); if (k) setAimContact(k); }
    else if (hit && hit.type === 't') { G.sel = hit; uiDirty(); }
    else setAimPoint(w);
  }

  function tooltip(hit) {
    let t = '';
      if (hit.type === 't') { const th = thrById(hit.id); if (th) t = `<b>${esc(TT[th.k].n)}</b><br>${CLS_N[th.cls]}, ${Math.round(TT[th.k].sp * 3600)} км/ч` }
      else if (hit.type === 'o') { const o = objById(hit.id); if (o) t = `<b>${esc(o.n)}</b><br>${OT[o.type].n} · ${Math.round(o.hp)}%` }
      else if (hit.type === 'k') { const k = knowById(hit.id); if (k) t = `<b>${esc(UT[k.type] ? UT[k.type].n : k.type)}</b><br>контакт ${pc(k.conf)} · ${esc(k.src)}` }
    return t;
  }

  /** ПКМ снимает последнюю точку маршрута */
  function onContextMenu(e) {
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
    onContextMenu
  };
})();
