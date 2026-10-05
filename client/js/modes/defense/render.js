'use strict';
/* ============================================================
   ОБОРОНА: отрисовка
   Наши расчёты, зоны поражения, цели на радарах.
   ============================================================ */

const DefenseRender = (() => {
  /* районы пуска противника */
  function drawZonesEnemy(s) {
    cx.save();
    cx.setLineDash([6, 5]);
    for (const z of ZONES) {
      const q = w2s(z);
      if (!onScreen(q, 140)) continue;
      cx.strokeStyle = 'rgba(255,110,90,.42)';
      cx.lineWidth = 1.2;
      cx.beginPath(); cx.arc(q.x, q.y, Math.max(6, z.r * s), 0, 7); cx.stroke();
      cx.fillStyle = 'rgba(255,110,90,.07)'; cx.fill();
      cx.setLineDash([]);
      cx.fillStyle = 'rgba(255,150,130,.72)';
      cx.font = '600 10px system-ui, sans-serif';
      cx.textAlign = 'center';
      cx.fillText(z.n.toUpperCase(), q.x, q.y - Math.max(6, z.r * s) - 5);
      cx.setLineDash([6, 5]);
    }
    cx.restore();
  }

  /* зоны поражения */
  function drawEngagement(s) {
    const selU = G.sel && G.sel.type === 'u' ? unitById(G.sel.id) : null;
    for (const u of G.units) {
      const T = UT[u.k];
      const isSel = selU === u;
      if (!G.showZones && !isSel) continue;
      const q = w2s(u);
      if (T.w) {
        const r = T.w.r * s;
        if (r > 3) {
          cx.beginPath(); cx.arc(q.x, q.y, r, 0, 7);
          cx.fillStyle = isSel ? 'rgba(111,209,141,.09)' : 'rgba(111,209,141,.035)';
          cx.fill();
          cx.strokeStyle = isSel ? 'rgba(111,209,141,.75)' : 'rgba(111,209,141,.22)';
          cx.lineWidth = isSel ? 1.6 : 1; cx.stroke();
        }
        if (T.w.rb) {
          cx.beginPath(); cx.arc(q.x, q.y, T.w.rb * s, 0, 7);
          cx.strokeStyle = isSel ? 'rgba(226,123,255,.7)' : 'rgba(226,123,255,.25)';
          cx.setLineDash([5, 4]); cx.lineWidth = 1.3; cx.stroke(); cx.setLineDash([]);
        }
      }
      if (T.radar && (isSel || G.showZones)) {
        cx.beginPath(); cx.arc(q.x, q.y, T.radar * s, 0, 7);
        cx.strokeStyle = u.rOn ? 'rgba(108,195,255,.30)' : 'rgba(108,195,255,.10)';
        cx.setLineDash([3, 6]); cx.lineWidth = 1; cx.stroke(); cx.setLineDash([]);
      }
      if (T.ewr) {
        cx.beginPath(); cx.arc(q.x, q.y, T.ewr * s, 0, 7);
        cx.fillStyle = 'rgba(150,255,190,.06)'; cx.fill();
        cx.strokeStyle = 'rgba(150,255,190,.4)'; cx.setLineDash([4, 4]); cx.lineWidth = 1.2; cx.stroke(); cx.setLineDash([]);
      }
      if (T.sup && T.sup.comm && (isSel || G.showZones)) {
        cx.beginPath(); cx.arc(q.x, q.y, T.sup.comm * s, 0, 7);
        cx.strokeStyle = 'rgba(242,179,61,.22)'; cx.setLineDash([2, 7]); cx.lineWidth = 1; cx.stroke(); cx.setLineDash([]);
      }
    }
  }

  function drawHQ(s) {
    const q = w2s(G.hq);
    if (!onScreen(q, 30)) return;
    const r = clamp(s * 2, 9, 22);
    cx.save(); cx.translate(q.x, q.y);
    cx.fillStyle = 'rgba(242,179,61,.16)';
    cx.beginPath(); cx.arc(0, 0, r * 1.5, 0, 7); cx.fill();
    cx.strokeStyle = '#f2b33d'; cx.lineWidth = 1.6;
    cx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 4 / 5;
      i ? cx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : cx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    cx.closePath(); cx.stroke();
    cx.fillStyle = 'rgba(242,179,61,.35)'; cx.fill();
    cx.restore();
    if (s > 3) {
      cx.font = '600 10px system-ui, sans-serif'; cx.textAlign = 'center';
      cx.fillStyle = 'rgba(242,179,61,.85)';
      cx.fillText('ШТАБ', q.x, q.y + r + 12);
    }
  }

  /* шлейфы целей и линия на предполагаемый объект удара */
  function drawTracksTail(s) {
    for (const th of G.threats) {
      if (th.dead) continue;
      const seenRecently = G.t - th.seen < 90;
      if (!seenRecently) continue;
      const q = w2s(th);
      if (!onScreen(q, 80)) continue;
      const col = thColor(th);
      /* вектор курса */
      const len = clamp(th.sp * 600 * s, 14, 120);
      cx.strokeStyle = col + '77';
      cx.lineWidth = 1.4;
      cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(q.x + th.hx * len, q.y + th.hy * len); cx.stroke();
      const sel = G.sel && G.sel.type === 't' && G.sel.id === th.id;
      /* прогноз — кнопка «Прогноз» (V); у выбранной цели виден всегда */
      if (th.vis && G.t - th.seen < 8 && (sel || (G.showAim !== false && (AIM_CLS[th.cls] || G.showRoutes)))) drawAimGuess(th, q, s, sel);
    }
  }

  /* ---------- куда может прилететь ----------
     Ракеты (и любая цель, выбранная или при включённых маршрутах «R»):
     сектор вероятного курса — он шире у дронов, которые петляют, — и
     вероятный объект по текущему курсу со временем подлёта. Баллистика —
     точка падения, она известна по траектории. */
  const PATROL_RZ_C = 12;   /* радиус зоны маршрута патруля (как PATROL_RZ на сервере) */
  const AIM_CLS = { cruise: 14, jet: 16, arm: 18, ballistic: 1, aeroball: 1 };

  function drawAimGuess(th, q, s, sel) {
    const ball = th.cls === 'ballistic' || th.cls === 'aeroball';
    const pulse = .6 + .4 * Math.sin(GANIM * 5);
    if (ball) {
      const end = th.path && th.path[th.path.length - 1];
      if (!end) return;
      const p = w2s(end), r = Math.max(6, 1.6 * s);
      cx.strokeStyle = 'rgba(240,107,255,.55)'; cx.lineWidth = 1.2;
      cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(p.x, p.y); cx.stroke();
      cx.fillStyle = `rgba(240,107,255,${.12 * pulse})`; cx.strokeStyle = `rgba(240,107,255,${.8 * pulse})`; cx.lineWidth = 1.6;
      cx.beginPath(); cx.arc(p.x, p.y, r, 0, 7); cx.fill(); cx.stroke();
      cx.beginPath(); cx.moveTo(p.x - r * 1.5, p.y); cx.lineTo(p.x + r * 1.5, p.y); cx.moveTo(p.x, p.y - r * 1.5); cx.lineTo(p.x, p.y + r * 1.5); cx.stroke();
      aimLabel(p, r, `падение через ${fmtDur(dist(th, end) / (th.sp || 1))}`, '#f3a8ff');
      return;
    }
    const spread = (AIM_CLS[th.cls] || 24) * Math.PI / 180;
    const o = predictObj(th);
    const L = (o ? Math.min(dist(th, o) + 6, 90) : 45) * s;
    const a0 = Math.atan2(th.hy, th.hx);
    /* сектор */
    const g = cx.createRadialGradient(q.x, q.y, 0, q.x, q.y, L);
    g.addColorStop(0, 'rgba(255,90,70,.24)'); g.addColorStop(1, 'rgba(255,90,70,0)');
    cx.fillStyle = g;
    cx.beginPath(); cx.moveTo(q.x, q.y); cx.arc(q.x, q.y, L, a0 - spread, a0 + spread); cx.closePath(); cx.fill();
    if (!o) return;
    const p = w2s(o);
    cx.strokeStyle = sel ? 'rgba(255,110,90,.85)' : 'rgba(255,110,90,.5)';
    cx.setLineDash([5, 5]); cx.lineDashOffset = -GANIM * 18; cx.lineWidth = 1.2;
    cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(p.x, p.y); cx.stroke();
    cx.setLineDash([]); cx.lineDashOffset = 0;
    const r = clamp(10 + s * 2.2, 14, 34);
    cx.strokeStyle = `rgba(255,90,70,${.75 * pulse})`; cx.lineWidth = 1.8;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      cx.beginPath(); cx.arc(p.x, p.y, r, a - .35, a + .35); cx.stroke();
    }
    aimLabel(p, r, `${o.n} · ≈${fmtDur(dist(th, o) / (th.sp || 1))}`, '#ffb0a3');
  }

  function aimLabel(p, r, txt, col) {
    cx.font = '600 10px system-ui, sans-serif'; cx.textAlign = 'center';
    const w = cx.measureText(txt).width + 8;
    cx.fillStyle = 'rgba(10,8,8,.75)'; cx.fillRect(p.x - w / 2, p.y + r + 3, w, 13);
    cx.fillStyle = col; cx.fillText(txt, p.x, p.y + r + 13);
  }

  /* ---------- зоны патруля вертолётов и маршрут, который сейчас кликают ---------- */
  function drawPatrols(s) {
    const selU = G.sel && G.sel.type === 'u' ? G.sel.id : null;
    const ring = (c, r, col, fill) => {
      const q = w2s(c);
      cx.beginPath(); cx.arc(q.x, q.y, r * s, 0, 7);
      if (fill) { cx.fillStyle = fill; cx.fill() }
      cx.strokeStyle = col; cx.setLineDash([6, 5]); cx.lineWidth = 1.3; cx.stroke(); cx.setLineDash([]);
      return q;
    };
    for (const u of G.units) {
      if (!u.patrol || (!G.showZones && selU !== u.id)) continue;
      const on = selU === u.id;
      const col = on ? 'rgba(255,214,120,.8)' : 'rgba(255,214,120,.35)', fill = on ? 'rgba(255,214,120,.05)' : null;
      const pts = u.patrol.pts || [u.patrol];
      const qs = pts.map(p => ring(p, u.patrol.r || 24, col, fill));
      if (qs.length > 1) {
        cx.strokeStyle = col; cx.lineWidth = 1.2; cx.setLineDash([2, 5]);
        cx.beginPath(); qs.forEach((q, i) => i ? cx.lineTo(q.x, q.y) : cx.moveTo(q.x, q.y)); cx.closePath(); cx.stroke(); cx.setLineDash([]);
        qs.forEach((q, i) => {
          cx.fillStyle = i === u.patrol.leg ? '#ffd479' : 'rgba(255,214,120,.6)';
          cx.font = '600 11px system-ui, sans-serif'; cx.textAlign = 'center'; cx.fillText(String(i + 1), q.x, q.y + 4);
        });
      }
    }
    const m = G.mode;
    if (m && m.t === 'patrol' && m.pts && m.pts.length) {
      const qs = m.pts.map(p => ring(p, PATROL_RZ_C, 'rgba(255,214,120,.9)', 'rgba(255,214,120,.07)'));
      cx.strokeStyle = 'rgba(255,214,120,.9)'; cx.lineWidth = 1.4;
      cx.beginPath(); qs.forEach((q, i) => i ? cx.lineTo(q.x, q.y) : cx.moveTo(q.x, q.y)); cx.stroke();
      qs.forEach((q, i) => { cx.fillStyle = '#ffd479'; cx.font = '600 11px system-ui, sans-serif'; cx.textAlign = 'center'; cx.fillText(String(i + 1), q.x, q.y + 4) });
    }
  }

  /* наши расчёты */
  /** куда «смотрит» иконка расчёта (1 — влево) */
  const FACE = {};

  function drawUnits(s) {
    const selU = G.sel && G.sel.type === 'u' ? G.sel.id : null;
    /* плашка с боковым профилем техники; ширина растёт с масштабом */
    const W = clamp(s * 6, 34, 112), H = W * .62, L = W * .55;
    for (const u of G.units) {
      const T = UT[u.k], q0 = w2s(u);
      if (!onScreen(q0, W)) continue;
      const col = stColor(u);
      /* марш */
      if (u.dest) {
        const d = w2s(u.dest);
        cx.strokeStyle = 'rgba(108,195,255,.5)'; cx.setLineDash([4, 4]); cx.lineWidth = 1.2;
        cx.beginPath(); cx.moveTo(q0.x, q0.y); cx.lineTo(d.x, d.y); cx.stroke(); cx.setLineDash([]);
        cx.fillStyle = 'rgba(108,195,255,.6)';
        cx.beginPath(); cx.arc(d.x, d.y, 3, 0, 7); cx.fill();
      }
      /* вертолёт в воздухе слегка покачивается */
      const air = T.air && u.st === 'air';
      const q = air ? { x: q0.x, y: q0.y - 4 - Math.sin(GANIM * 2 + u.id) * 1.5 } : q0;
      if (air) {
        cx.fillStyle = 'rgba(0,0,0,.35)';
        cx.beginPath(); cx.ellipse(q0.x, q0.y + H * .45, W * .3, H * .12, 0, 0, 7); cx.fill();
      }
      const sel = selU === u.id;
      if (sel) {
        cx.fillStyle = 'rgba(242,179,61,.16)';
        rr(cx, q.x - W / 2 - 4, q.y - H / 2 - 4, W + 8, H + 8, 10); cx.fill();
      }
      drawPlate(cx, q.x, q.y, W, H, col, sel);
      /* нос — по направлению движения */
      /* разворот иконки с запасом: не мигает, когда курс почти вертикальный */
      const ch = Math.cos(u.h || 0);
      if (u.st === 'move' || air) { if (ch < -.3) FACE[u.id] = 1; else if (ch > .3) FACE[u.id] = 0 }
      const flip = (u.st === 'move' || air) && FACE[u.id] === 1;
      drawIcon(cx, T.ic, q.x, q.y, W * .86, UT[u.k].fake ? 'own' : 'own', flip, u.hp < T.hp * .5 ? .8 : null);
      /* излучает: голубая точка-маячок */
      if (u.rOn) {
        const k = .5 + .5 * Math.sin(ANIM * 6);
        cx.fillStyle = `rgba(108,195,255,${.5 + .5 * k})`;
        cx.beginPath(); cx.arc(q.x + W / 2 - 5, q.y - H / 2 + 5, 2.6, 0, 7); cx.fill();
        cx.strokeStyle = `rgba(108,195,255,${.5 * (1 - k)})`; cx.lineWidth = 1;
        cx.beginPath(); cx.arc(q.x + W / 2 - 5, q.y - H / 2 + 5, 3 + k * 5, 0, 7); cx.stroke();
      }
      /* живучесть, если техника повреждена */
      if (u.hp < T.hp) {
        cx.fillStyle = 'rgba(6,10,14,.85)'; cx.fillRect(q.x - W / 2 + 4, q.y + H / 2 - 5, W - 8, 3);
        cx.fillStyle = hpCol(u.hp / T.hp * 100); cx.fillRect(q.x - W / 2 + 4, q.y + H / 2 - 5, (W - 8) * u.hp / T.hp, 3);
      }
      /* подпись и боекомплект */
      if (s > 3.6) {
        const y = q.y + H / 2 + 11;
        cx.font = '600 10px system-ui, sans-serif'; cx.textAlign = 'center';
        cx.fillStyle = 'rgba(0,0,0,.8)';
        cx.fillText(T.sh + ' ' + u.crew.cs, q.x + 1, y + 1);
        cx.fillStyle = col;
        cx.fillText(T.sh + ' ' + u.crew.cs, q.x, y);
        if (T.w && s > 5) {
          const bw = L * .8;
          cx.fillStyle = 'rgba(6,10,14,.8)';
          cx.fillRect(q.x - bw / 2, y + 3, bw, 3);
          cx.fillStyle = u.am === 0 ? '#ff5b47' : '#9fd8ff';
          cx.fillRect(q.x - bw / 2, y + 3, bw * u.am / T.w.am, 3);
        }
      }
      /* значки состояния */
      let bx = q.x + W / 2 + 3, by = q.y - H / 2 + 8;
      const badge = (txt, c2) => {
        cx.font = '9px system-ui, sans-serif'; cx.textAlign = 'left';
        cx.fillStyle = 'rgba(6,10,14,.85)';
        cx.fillRect(bx, by - 8, cx.measureText(txt).width + 6, 11);
        cx.fillStyle = c2; cx.fillText(txt, bx + 3, by);
        by += 13;
      };
      if (u.pend) badge('приказ', '#f2b33d');
      if (G.reqs.some(r => r.u === u)) badge('запрос', '#ffd479');
      if (u.st === 'reload') badge('БК', '#f2b33d');
      if (u.st === 'refuel') badge('заправка', '#f2b33d');
      if (u.roe === 'hold') badge('огонь запрещён', '#ff8f80');
    }
  }

  /* воздушные цели */
  function drawThreats(s) {
    const selT = G.sel && G.sel.type === 't' ? G.sel.id : null;
    for (const th of G.threats) {
      if (th.dead) continue;
      const age = G.t - th.seen;
      if (age > 200) continue;                   /* контакт потерян окончательно */
      const lost = age > 4;
      const p = lost ? { x: th.lx, y: th.ly } : th;
      const q = w2s(p);
      if (!onScreen(q, 60)) continue;
      const col = thColor(th);
      const big = ['cruise', 'ballistic', 'aeroball'].includes(th.cls);
      let L = clamp(s * (big ? 3.2 : 2.4), big ? 18 : 14, big ? 60 : 44) * (th.idLv > 0 && AIR_SIZE[th.cls] || 1);
      cx.save();
      cx.translate(q.x, q.y);
      if (lost) { cx.globalAlpha = clamp(1 - age / 200, .18, .55) }
      cx.rotate(Math.atan2(th.hy, th.hx));
      cx.scale(L, L);
      const art = th.idLv <= 0 ? ART_AIR.unknown : (ART_AIR[th.cls] || ART_AIR.drone);
      art(cx, col, GANIM, th);
      cx.restore();
      /* рамка выделения и метка */
      if (selT === th.id) {
        cx.strokeStyle = '#f2b33d'; cx.lineWidth = 1.5;
        cx.strokeRect(q.x - L * .6, q.y - L * .6, L * 1.2, L * 1.2);
      }
      if (lost) {
        cx.strokeStyle = col + '66'; cx.lineWidth = 1;
        cx.setLineDash([3, 3]);
        cx.strokeRect(q.x - L * .5, q.y - L * .5, L, L);
        cx.setLineDash([]);
      }
      if (s > 4.2 && !lost) {
        cx.font = '9px ui-monospace, monospace'; cx.textAlign = 'left';
        const lb = th.idLv <= 0 ? '?' : th.idLv >= 2 && TT[th.k] ? TT[th.k].n : CLS_SHORT[percCls(th)];
        const alt = th.alt === 'high' ? ' ↑' : th.alt === 'mid' ? ' ·' : '';
        cx.fillStyle = 'rgba(0,0,0,.75)';
        cx.fillText(lb + alt, q.x + L * .55 + 1, q.y - L * .3 + 1);
        cx.fillStyle = col;
        cx.fillText(lb + alt, q.x + L * .55, q.y - L * .3);
      }
    }
  }

  return {
    zones: drawZonesEnemy,
    engagement: drawEngagement,
    hq: drawHQ,
    tracks: drawTracksTail,
    units: drawUnits,
    threats: drawThreats,
    plan: drawPatrols
  };
})();
