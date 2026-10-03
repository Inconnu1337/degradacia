'use strict';
/* ============================================================
   ОБОРОНА: ввод (клиент)
   Выбор на карте, приказы по клику, подсказки, покупки и приказы из правой панели.
   Приказы и покупки уходят серверу командами (game/commands.js).
   ============================================================ */

const DefenseInput = (() => {
  function pickAt(sp) {
    const p = s2w(sp);
    /* расчёты — самый мелкий, но самый важный объект выбора */
    let best = null, bd = 1e9;
    for (const u of G.units) {
      const q = w2s(u), d = Math.hypot(q.x - sp.x, q.y - sp.y);
      if (d < Math.max(16, clamp(G.view.s * 2.9, 18, 74) * .6) && d < bd) { bd = d; best = { type: 'u', id: u.id } }
    }
    if (best) return best;
    for (const th of G.threats) {
      if (th.dead || G.t - th.seen > 200) continue;
      const q = w2s(th), d = Math.hypot(q.x - sp.x, q.y - sp.y);
      if (d < 20 && d < bd) { bd = d; best = { type: 't', id: th.id } }
    }
    if (best) return best;
    for (const o of G.objs) {
      const q = w2s(o), d = Math.hypot(q.x - sp.x, q.y - sp.y);
      const r = clamp(G.view.s * 5.5, 26, 130) * .62;
      if (d < r && d < bd) { bd = d; best = { type: 'o', id: o.id } }
    }
    return best;
  }

  function mapClick(sp) {
    if (G.phase === 'debrief' || G.phase === 'final') return;
    const p = s2w(sp);
    const m = G.mode;
    if (m) {
      if (m.t === 'place') {
        cmd('place', { k: m.k, x: p.x, y: p.y, gift: m.gift ? 1 : 0 }).then(res => {
          if (!res.ok) return;
          G.sel = { type: 'u', id: res.uid };
          const more = m.gift ? G.gifts.includes(m.k) : (G.phase === 'prep' && canBuy(m.k));
          if (!more && G.mode === m) { G.mode = null; hint('') }
          lastRC = ''; uiDirty();
        });
        return;
      }
      if (m.t === 'patrol') {
        /* сектор можно привязать к объекту или своему расчёту — клик по нему */
        const hit = pickAt(sp);
        const o = { t: 'patrol', p };
        if (hit && hit.type === 'o') o.obj = hit.id;
        else if (hit && hit.type === 'u' && hit.id !== m.id) o.uid = hit.id;
        G.mode = null; hint('');
        cmd('order', { id: m.id, o });
        uiDirty(); return;
      }
      if (m.t === 'move') {
        G.mode = null; hint('');
        cmd('order', { id: m.id, o: { t: 'move', p } });
        uiDirty(); return;
      }
      if (m.t === 'cover') {
        const hit = pickAt(sp);
        if (hit && hit.type === 'o') { G.mode = null; hint(''); cmd('order', { id: m.id, o: { t: 'cover', obj: hit.id } }) }
        else toast('Укажите защищаемый объект', 'i');
        uiDirty(); return;
      }
    }
    const hit = pickAt(sp);
    G.sel = hit || null;
    if (hit) { G.tabR = 'ord'; tabsDirty = true }
    uiDirty();
  }

  /** выбрать средство для покупки: дальше клик по карте (бюджет проверит сервер) */
  function startBuy(k, gift) {
    if (G.phase !== 'prep' && G.phase !== 'night') return;
    if (!gift && !canBuy(k)) { toast('Не хватает бюджета', 'i'); return }
    G.mode = { t: 'place', k, gift: !!gift };
    hint(`Выберите точку на карте для «${UT[k].n}». ПКМ или Esc — отмена.`);
    uiDirty();
  }

  function onAction(a, el) {
    const v = el.dataset.v, id = el.dataset.id;
    const selU = () => G.sel && G.sel.type === 'u' ? unitById(G.sel.id) : null;
    const sent = () => { lastRC = ''; uiDirty() };
    switch (a) {
      case 'ans': cmd('ans', { id: +id, i: +el.dataset.i }).then(sent); break;
      case 'buy': startBuy(el.dataset.k, el.dataset.gift); break;
      case 'repair': cmd('repair', { id }).then(sent); break;
      case 'extinguish': cmd('extinguish', { id }).then(sent); break;
      case 'fixu': cmd('fixu', { id: +id }).then(sent); break;
      case 'sell': { const u = selU(); if (u) cmd('sell', { id: u.id }).then(r => { if (r.ok) G.sel = null; sent() }); break }
      case 'mMove': { const u = selU(); if (u) { G.mode = { t: 'move', id: u.id }; hint('Укажите точку выдвижения. ПКМ — отмена.') } uiDirty(); break }
      case 'mPatrol': { const u = selU(); if (u) { G.mode = { t: 'patrol', id: u.id }; hint('Сектор патруля: клик по объекту или своему расчёту — прикрывать его; по карте — точка. Вертолёт сам ищет цели и ходит на заправку.') } uiDirty(); break }
      case 'mCover': { const u = selU(); if (u) { G.mode = { t: 'cover', id: u.id }; hint('Укажите защищаемый объект на карте.') } uiDirty(); break }
      case 'ord': { const u = selU(); if (u) cmd('order', { id: u.id, o: { t: el.dataset.o } }).then(sent); break }
      case 'roe': { const u = selU(); if (u) cmd('order', { id: u.id, o: { t: 'roe', v } }).then(sent); break }
      case 'radar': { const u = selU(); if (u) cmd('order', { id: u.id, o: { t: 'radar', v } }).then(sent); break }
      case 'assign': cmd('order', { id: +id, o: { t: 'assign', th: +el.dataset.th } }).then(sent); break;
      case 'alarm': cmd('alarm'); break;
      case 'spoil': G.spoil = !G.spoil; if (!G.spoil && G.tabL === 'mind') G.tabL = 'radio'; tabsDirty = true; uiDirty(); break;
    }
  }

  function tooltip(hit) {
    let t = '';
      if (hit.type === 'u') { const u = unitById(hit.id); if (u) t = `<b>«${esc(u.crew.cs)}»</b> · ${esc(UT[u.k].n)}<br>${unitStatus(u)}${UT[u.k].w ? ' · БК ' + u.am + '/' + UT[u.k].w.am : ''}` }
      else if (hit.type === 't') { const th = thrById(hit.id); if (th) t = `<b>${esc(thTitle(th))}</b><br>${DIRS[dirIdx(th.hx, th.hy)]}, ${Math.round(th.sp * 3600)} км/ч` }
      else if (hit.type === 'o') { const o = objById(hit.id); if (o) t = `<b>${esc(o.n)}</b><br>${OT[o.type].n} · ${Math.round(o.hp)}%` }
    return t;
  }

  return {
    pickAt,
    mapClick,
    tooltip,
    onAction
  };
})();
