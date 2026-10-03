'use strict';
/* ============================================================
   НАЛЁТ: отрисовка
   Позиции ПВО показаны как контакты разведки (с уверенностью), а не как факт.
   План удара: маршрут, точки, цель.
   ============================================================ */

const AttackRender = (() => {
  function drawZonesEnemy(s) {
    cx.save();
    for (const z of ZONES) {
      const q = w2s(z);
      if (!onScreen(q, 160)) continue;
      const on = G.plan && G.plan.zid === z.id;
      cx.setLineDash([6, 5]);
      cx.strokeStyle = on ? 'rgba(242,179,61,.85)' : 'rgba(242,179,61,.35)';
      cx.lineWidth = on ? 2 : 1;
      cx.beginPath(); cx.arc(q.x, q.y, Math.max(8, z.r * s), 0, 7); cx.stroke();
      cx.setLineDash([]);
      if (s > 1.3) {
        cx.fillStyle = on ? '#ffd479' : 'rgba(255,210,120,.65)';
        cx.font = '600 10px system-ui, sans-serif';
        cx.textAlign = 'center';
        cx.fillText(z.n.toUpperCase(), q.x, q.y - Math.max(8, z.r * s) - 4);
      }
    }
    cx.restore();
  }

  function drawHQ() {}

  function drawEngagement(s) {
    if (!E) return;
    const sel = G.sel && G.sel.type === 'k' ? G.sel.id : null;
    for (const id in E.know) {
      const k = E.know[id];
      if (k.conf < 0.28) continue;
      const T = UT[k.type];
      if (!T || k.dead) continue;
      const on = sel === k.uid || G.showZones;
      if (!on) continue;
      const q = w2s(k);
      const err = (3.6 * (1 - k.conf) + 0.4) * s;
      cx.beginPath(); cx.arc(q.x, q.y, Math.max(5, err), 0, 7);
      cx.strokeStyle = 'rgba(255,180,80,.45)'; cx.setLineDash([3, 3]); cx.lineWidth = 1; cx.stroke(); cx.setLineDash([]);
      if (T.w) {
        cx.beginPath(); cx.arc(q.x, q.y, T.w.r * s, 0, 7);
        cx.strokeStyle = 'rgba(255,120,90,.28)'; cx.lineWidth = 1; cx.stroke();
      }
      if (T.ewr) {
        cx.beginPath(); cx.arc(q.x, q.y, T.ewr * s, 0, 7);
        cx.strokeStyle = 'rgba(150,255,190,.35)'; cx.setLineDash([4, 4]); cx.stroke(); cx.setLineDash([]);
      }
    }
  }

  function drawUnits(s) {
    if (!E) return;
    for (const id in E.know) {
      const k = E.know[id];
      if (k.conf < 0.28) continue;
      const T = UT[k.type];
      if (!T) continue;
      const dead = k.dead;
      const q = w2s(k);
      if (!onScreen(q, 30)) continue;
      /* контакт разведки: плашка с профилем; чем увереннее разведка, тем ярче */
      const W = clamp(s * 5.2, 32, 92), H = W * .62;
      drawPlate(cx, q.x, q.y, W, H, dead ? '#ff5b47' : k.conf > .75 ? '#ffb45a' : '#c98b6a', false);
      drawIcon(cx, T.ic, q.x, q.y, W * .86, dead ? 'dead' : 'enemy', false, dead ? .7 : .45 + .55 * k.conf);
      if (dead) {
        cx.strokeStyle = '#ff5b47'; cx.lineWidth = 2;
        cx.beginPath(); cx.moveTo(q.x - H * .4, q.y - H * .4); cx.lineTo(q.x + H * .4, q.y + H * .4);
        cx.moveTo(q.x + H * .4, q.y - H * .4); cx.lineTo(q.x - H * .4, q.y + H * .4); cx.stroke();
      }
      if (s > 2.8) {
        cx.font = '600 10px system-ui, sans-serif'; cx.textAlign = 'center';
        cx.fillStyle = dead ? '#ff8f80' : '#ffd0a8';
        cx.fillText((dead ? 'поражён ' : '') + T.sh + ' ' + Math.round(k.conf * 100) + '%', q.x, q.y + H / 2 + 12);
      }
    }
  }

  function drawTracksTail() {
    if (!G.showRoutes) return;
    for (const th of G.threats) {
      if (th.dead) continue;
      const q = w2s(th);
      let prev = q;
      cx.strokeStyle = 'rgba(242,179,61,.55)'; cx.lineWidth = 1.2; cx.setLineDash([4, 4]);
      cx.beginPath(); cx.moveTo(q.x, q.y);
      for (const p of th.path) { const b = w2s(p); cx.lineTo(b.x, b.y); prev = b; }
      cx.stroke(); cx.setLineDash([]);
      const len = clamp(th.sp * 500 * G.view.s, 12, 90);
      cx.strokeStyle = (AIR_COL[th.cls] || '#fff') + 'aa';
      cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(q.x + th.hx * len, q.y + th.hy * len); cx.stroke();
    }
  }

  function drawThreats(s) {
    const selT = G.sel && G.sel.type === 't' ? G.sel.id : null;
    for (const th of G.threats) {
      if (th.dead) continue;
      const q = w2s(th);
      if (!onScreen(q, 50)) continue;
      const col = AIR_COL[th.cls] || '#fff';
      const big = ['cruise', 'ballistic', 'aeroball'].includes(th.cls);
      const L = clamp(s * (big ? 3 : 2.2), big ? 16 : 13, big ? 54 : 40);
      cx.save(); cx.translate(q.x, q.y); cx.rotate(Math.atan2(th.hy, th.hx)); cx.scale(L, L);
      (ART_AIR[th.cls] || ART_AIR.drone)(cx, col, GANIM);
      cx.restore();
      if (selT === th.id) {
        cx.strokeStyle = '#f2b33d'; cx.lineWidth = 1.5;
        cx.strokeRect(q.x - L * 0.6, q.y - L * 0.6, L * 1.2, L * 1.2);
      }
      if (s > 3.4) {
        cx.font = '9px ui-monospace, monospace'; cx.textAlign = 'left';
        cx.fillStyle = col;
        cx.fillText(TT[th.k].n, q.x + L * 0.5, q.y - 4);
      }
    }
  }

  function drawPlan() {
    const p = G.plan;
    if (!p) return;
    const strokePath = (pts, col, dash) => {
      if (!pts || pts.length < 2) return;
      cx.strokeStyle = col; cx.lineWidth = 1.4; cx.setLineDash(dash || []);
      cx.beginPath();
      pts.forEach((pt, i) => { const q = w2s(pt); i ? cx.lineTo(q.x, q.y) : cx.moveTo(q.x, q.y); });
      cx.stroke(); cx.setLineDash([]);
    };
    if (G.showRoutes) {
      for (const g of E.groups) {
        if (!g.path || g.launched >= g.n) continue;
        strokePath([g.start, ...g.path], 'rgba(120,190,255,.35)', [3, 5]);
      }
    }
    strokePath(p.preview, 'rgba(242,179,61,.9)', [7, 5]);
    p.wps.forEach((w, i) => {
      const q = w2s(w);
      cx.fillStyle = '#f2b33d';
      cx.beginPath(); cx.arc(q.x, q.y, 4, 0, 7); cx.fill();
      cx.font = '600 10px system-ui, sans-serif'; cx.textAlign = 'left'; cx.fillStyle = '#ffd479';
      cx.fillText(String(i + 1), q.x + 6, q.y - 6);
    });
    if (!routeOnly(p.k) && p.tgt && p.tgt.aim) {
      const q = w2s(p.tgt.aim);
      cx.strokeStyle = '#ff5b47'; cx.lineWidth = 1.6;
      cx.beginPath(); cx.moveTo(q.x - 7, q.y); cx.lineTo(q.x + 7, q.y); cx.moveTo(q.x, q.y - 7); cx.lineTo(q.x, q.y + 7); cx.stroke();
    }
    if (routeOnly(p.k) || (G.mode && G.mode.t === 'route')) {
      cx.font = '600 12px system-ui, sans-serif'; cx.textAlign = 'center';
      const txt = routeOnly(p.k) ? 'Маршрут разведчика: каждый клик — точка, ПКМ — убрать' : 'Клик — цель в точке. Свой маршрут — изломы до неё';
      const w = cx.measureText(txt).width + 22;
      cx.fillStyle = 'rgba(28,24,16,.92)';
      rr(cx, CW / 2 - w / 2, 12, w, 26, 6); cx.fill();
      cx.strokeStyle = '#f2b33d'; cx.lineWidth = 1; cx.stroke();
      cx.fillStyle = '#ffd479';
      cx.fillText(txt, CW / 2, 29);
    }
  }

  return {
    zones: drawZonesEnemy,
    engagement: drawEngagement,
    hq: drawHQ,
    tracks: drawTracksTail,
    units: drawUnits,
    threats: drawThreats,
    plan: drawPlan
  };
})();
