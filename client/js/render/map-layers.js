'use strict';
/* ============================================================
   ОТРИСОВКА КАРТЫ
   Общие слои (сетка, подписи, объекты, ракеты, эффекты, линейка). Слои, которые различаются
   по режимам (зоны, техника, цели, план), рисует MODE.render.
   ============================================================ */

/* ---------- основной проход ---------- */
function draw(dtms) {
  if (!G) return;
  ANIM += dtms / 1000;
  const s = G.view.s;
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx.fillStyle = '#04070a';
  cx.fillRect(0, 0, CW, CH);

  /* подложка */
  if (TER) {
    cx.save();
    cx.translate(CW / 2, CH / 2); cx.scale(s, s); cx.translate(-G.view.x, -G.view.y);
    cx.imageSmoothingEnabled = s < 6;
    cx.drawImage(TER, 0, 0, WW, WH);
    cx.restore();
  }
  drawGrid(s);
  MODE.render.zones(s);
  drawNames(s);
  if (G.showZones || G.sel) MODE.render.engagement(s);
  drawObjects(s);
  MODE.render.hq(s);
  MODE.render.tracks(s);
  MODE.render.units(s);
  drawMissiles(s);
  MODE.render.threats(s);
  drawFx(s);
  drawOverlay(s);
  if (MODE.render.plan) MODE.render.plan(s);
}

/* сетка квадратов — по ней идёт радиообмен */
function drawGrid(s) {
  if (s < 3.2) return;
  const a = clamp((s - 3.2) / 4, 0, .5);
  cx.strokeStyle = `rgba(150,190,210,${a * .3})`;
  cx.lineWidth = 1;
  cx.beginPath();
  for (let x = 0; x <= WW; x += GRID) { const q = w2s({ x, y: 0 }), q2 = w2s({ x, y: WH }); cx.moveTo(q.x, q.y); cx.lineTo(q2.x, q2.y) }
  for (let y = 0; y <= WH; y += GRID) { const q = w2s({ x: 0, y }), q2 = w2s({ x: WW, y }); cx.moveTo(q.x, q.y); cx.lineTo(q2.x, q2.y) }
  cx.stroke();
  if (s > 6) {
    cx.fillStyle = `rgba(150,190,210,${a * .55})`;
    cx.font = '10px ui-monospace, monospace';
    cx.textAlign = 'left';
    for (let x = 0; x <= WW - GRID; x += GRID) for (let y = 0; y <= WH - GRID; y += GRID) {
      const q = w2s({ x: x + 1, y: y + 5 });
      if (onScreen(q, 0)) cx.fillText(sq({ x: x + 1, y: y + 1 }), q.x, q.y);
    }
  }
}

/* названия городов и подписи */
function drawNames(s) {
  cx.textAlign = 'left';
  for (const c of WD.cities) {
    const q = w2s(c);
    if (!onScreen(q, 20)) continue;
    if (c.pop < 2 && s < 3.4) continue;
    const big = c.pop >= 2;
    cx.fillStyle = c.enemy ? 'rgba(255,150,130,.8)' : big ? 'rgba(226,235,240,.92)' : 'rgba(180,196,206,.7)';
    cx.font = `${big ? '600 ' : ''}${big ? 12 : 10.5}px system-ui, sans-serif`;
    cx.fillText(c.n, q.x + 6, q.y + 4);
    cx.fillStyle = c.enemy ? 'rgba(255,120,100,.85)' : 'rgba(200,215,225,.8)';
    cx.beginPath(); cx.arc(q.x, q.y, big ? 3 : 2, 0, 7); cx.fill();
  }
  if (s > 7) {
    cx.fillStyle = 'rgba(140,200,225,.6)';
    cx.font = 'italic 10px system-ui, sans-serif';
    for (const r of WD.rivers) {
      const p = r.pts[Math.floor(r.pts.length * .45)], q = w2s(p);
      if (onScreen(q, 0)) cx.fillText(r.n, q.x + 4, q.y - 3);
    }
  }
}

/* защищаемые объекты */
function drawObjects(s) {
  const selO = G.sel && G.sel.type === 'o' ? G.sel.id : null;
  const L = clamp(s * 5.5, 26, 130);
  for (const o of G.objs) {
    const q = w2s(o);
    if (!onScreen(q, L)) continue;
    const c = hpCol(o.hp);
    /* подложка-площадка */
    cx.save();
    cx.translate(q.x, q.y);
    cx.beginPath(); cx.arc(0, 0, L * .62, 0, 7);
    cx.fillStyle = 'rgba(8,14,20,.45)'; cx.fill();
    cx.strokeStyle = selO === o.id ? '#f2b33d' : 'rgba(150,170,185,.35)';
    cx.lineWidth = selO === o.id ? 2 : 1; cx.stroke();
    if (o.hp <= 0) { cx.globalAlpha = .45 }
    cx.scale(L, L);
    (ART_OBJ[o.type] || ART_OBJ.plant)(cx, c);
    cx.restore();
    /* важность и состояние */
    const bw = Math.max(26, L * .9);
    cx.fillStyle = 'rgba(6,10,14,.75)';
    cx.fillRect(q.x - bw / 2, q.y + L * .64, bw, 4);
    cx.fillStyle = c;
    cx.fillRect(q.x - bw / 2, q.y + L * .64, bw * o.hp / 100, 4);
    if (s > 2.6) {
      cx.font = '600 11px system-ui, sans-serif';
      cx.textAlign = 'center';
      cx.fillStyle = 'rgba(0,0,0,.75)';
      cx.fillText(o.n, q.x + 1, q.y - L * .66 + 1);
      cx.fillStyle = o.hp <= 0 ? '#ff8f80' : '#e6eef2';
      cx.fillText(o.n, q.x, q.y - L * .66);
    }
    if (o.hitT > G.t - 120 && G.phase === 'night') {
      const k = 1 - (G.t - o.hitT) / 120;
      cx.strokeStyle = `rgba(255,90,60,${k * .8})`;
      cx.lineWidth = 2;
      cx.beginPath(); cx.arc(q.x, q.y, L * .62 + (1 - k) * 26, 0, 7); cx.stroke();
    }
  }
}

/* наши ракеты и перехватчики */
function drawMissiles(s) {
  for (const m of G.miss) {
    const q = w2s(m);
    if (m.trail.length > 3) {
      cx.strokeStyle = 'rgba(150,220,255,.35)'; cx.lineWidth = 1.2;
      cx.beginPath();
      for (let i = 0; i < m.trail.length; i += 2) {
        const p = w2s({ x: m.trail[i], y: m.trail[i + 1] });
        i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y);
      }
      cx.stroke();
    }
    if (!onScreen(q, 40)) continue;
    const L = m.kind === 'drone' ? clamp(s * 1.1, 8, 20) : clamp(s * 1.6, 11, 30);
    cx.save(); cx.translate(q.x, q.y); cx.rotate(m.a || 0); cx.scale(L, L);
    drawOwnMissile(cx, m.kind, ANIM);
    cx.restore();
  }
}

/* ---------- эффекты ---------- */
function drawFx(s) {
  const now = performance.now();
  G.fx = G.fx.filter(f => now - f.t0 < f.d);
  for (const f of G.fx) {
    const k = (now - f.t0) / f.d;
    if (f.k === 'tracer') {
      const a = w2s({ x: f.x, y: f.y }), b = w2s({ x: f.x2, y: f.y2 });
      cx.strokeStyle = `rgba(255,226,140,${(1 - k) * .9})`;
      cx.lineWidth = 1.6;
      cx.setLineDash([7, 9]); cx.lineDashOffset = -k * 60;
      cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
      cx.setLineDash([]); cx.lineDashOffset = 0;
    }
    else if (f.k === 'launch') {
      const a = w2s(f);
      const r = 4 + k * clamp(s * 1.6, 8, 26);
      const gr = cx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
      gr.addColorStop(0, `rgba(255,245,210,${(1 - k) * .95})`);
      gr.addColorStop(.5, `rgba(255,180,90,${(1 - k) * .5})`);
      gr.addColorStop(1, 'rgba(255,120,40,0)');
      cx.fillStyle = gr;
      cx.beginPath(); cx.arc(a.x, a.y, r, 0, 7); cx.fill();
    }
    else if (f.k === 'air') {
      const a = w2s(f);
      const R0 = clamp(s * (f.small ? .7 : 1.4), 7, 34);
      cx.strokeStyle = `rgba(190,235,255,${(1 - k) * .85})`;
      cx.lineWidth = 2 * (1 - k) + .5;
      cx.beginPath(); cx.arc(a.x, a.y, R0 * (.3 + k * 1.1), 0, 7); cx.stroke();
      if (!f.small) {
        cx.fillStyle = `rgba(255,240,200,${(1 - k) * .5})`;
        cx.beginPath(); cx.arc(a.x, a.y, R0 * .45 * (1 - k), 0, 7); cx.fill();
      }
    }
    else if (f.k === 'boom') {
      const a = w2s(f);
      const R0 = clamp(s * (f.small ? 1.1 : 2.4), 10, 60);
      const gr = cx.createRadialGradient(a.x, a.y, 0, a.x, a.y, R0 * (.4 + k));
      gr.addColorStop(0, `rgba(255,250,220,${(1 - k) * .9})`);
      gr.addColorStop(.35, `rgba(255,160,60,${(1 - k) * .7})`);
      gr.addColorStop(1, 'rgba(120,40,10,0)');
      cx.fillStyle = gr;
      cx.beginPath(); cx.arc(a.x, a.y, R0 * (.4 + k), 0, 7); cx.fill();
      cx.strokeStyle = `rgba(255,220,180,${(1 - k) * .5})`;
      cx.lineWidth = 1.5;
      cx.beginPath(); cx.arc(a.x, a.y, R0 * (.5 + k * 1.6), 0, 7); cx.stroke();
    }
    else if (f.k === 'fire') {
      const a = w2s(f);
      const R0 = clamp(s * 1.3, 8, 34);
      const pl = .6 + .4 * Math.sin(ANIM * 7 + f.x);
      cx.fillStyle = `rgba(255,140,50,${(1 - k) * .35 * pl})`;
      cx.beginPath(); cx.arc(a.x, a.y, R0 * pl, 0, 7); cx.fill();
      cx.fillStyle = `rgba(80,70,65,${(1 - k) * .25})`;
      cx.beginPath(); cx.ellipse(a.x - R0 * .6, a.y - R0 * 1.4, R0 * 1.3, R0 * .7, 0, 0, 7); cx.fill();
    }
  }
}

/* масштабная линейка, режимы, тревога */
function drawOverlay(s) {
  /* линейка */
  let km = 50;
  const target = 110;
  const steps = [5, 10, 20, 25, 50, 100, 200];
  for (const q of steps) if (q * s <= target * 1.5) km = q;
  const wpx = km * s;
  const x0 = 16, y0 = CH - 20;
  cx.strokeStyle = 'rgba(220,230,236,.75)'; cx.lineWidth = 2;
  cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x0 + wpx, y0);
  cx.moveTo(x0, y0 - 4); cx.lineTo(x0, y0 + 4);
  cx.moveTo(x0 + wpx, y0 - 4); cx.lineTo(x0 + wpx, y0 + 4);
  cx.stroke();
  cx.font = '600 11px system-ui, sans-serif'; cx.textAlign = 'left';
  cx.fillStyle = 'rgba(220,230,236,.85)';
  cx.fillText(km + ' км', x0 + wpx + 8, y0 + 4);

  /* индикация тревоги */
  if (G.alarm && G.phase === 'night') {
    const pl = .5 + .5 * Math.sin(ANIM * 3.2);
    cx.strokeStyle = `rgba(255,91,71,${.22 + pl * .3})`;
    cx.lineWidth = 6;
    cx.strokeRect(3, 3, CW - 6, CH - 6);
  }
  /* режим установки / приказа */
  if (G.mode) {
    cx.font = '600 12px system-ui, sans-serif'; cx.textAlign = 'center';
    const txt = G.mode.t === 'place' ? 'Разместить: ' + UT[G.mode.k].n
      : G.mode.t === 'move' ? 'Точка выдвижения'
        : G.mode.t === 'patrol' ? 'Район патрулирования' : '';
    const w = cx.measureText(txt).width + 22;
    cx.fillStyle = 'rgba(28,24,16,.92)';
    rr(cx, CW / 2 - w / 2, 12, w, 26, 6); cx.fill();
    cx.strokeStyle = '#f2b33d'; cx.lineWidth = 1; cx.stroke();
    cx.fillStyle = '#ffd479';
    cx.fillText(txt, CW / 2, 29);
  }
}
