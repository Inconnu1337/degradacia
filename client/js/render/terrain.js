'use strict';
/* ============================================================
   ПОДЛОЖКА КАРТЫ
   Отрисовка рельефа в offscreen-канвас «ночной топографической картой».
   ============================================================ */

/* ---------- отрисовка подложки в offscreen-канвас ---------- */
let TER = null;

function renderTerrain() {
  const w = WW * PX, h = WH * PX;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h), D = img.data;
  const cy = new Float32Array(w), bx = new Float32Array(h);
  for (let i = 0; i < w; i++) cy[i] = coastY((i + .5) / PX);
  for (let j = 0; j < h; j++) bx[j] = borderX((j + .5) / PX);
  const S = new Uint8Array(w * h), H = new Float32Array(w * h), F = new Float32Array(w * h);
  const px0 = (PEN.x - PEN.rx * 1.25) * PX, px1 = (PEN.x + PEN.rx * 1.25) * PX, py0 = (PEN.y - PEN.ry * 1.25) * PX;
  for (let j = 0; j < h; j++) {
    const y = (j + .5) / PX;
    for (let i = 0; i < w; i++) {
      const x = (i + .5) / PX, k = j * w + i;
      let pen = false;
      if (i > px0 && i < px1 && j > py0) pen = penIn(x, y);
      const land = y < cy[i] || pen;
      let s = 0;
      if (land) {
        s = x > bx[j] ? 2 : (pen && y > cy[i] - 2) ? 2 : 1;
        H[k] = fbm(x * .018, y * .018, 7, 5);
        F[k] = fbm(x * .055, y * .055, 31, 3) + (1 - y / WH) * .07 + H[k] * .12;
      }
      S[k] = s;
    }
  }
  /* палитра «ночная топографическая карта» */
  const FLD = [[38, 45, 34], [44, 49, 34], [34, 42, 32], [48, 48, 36], [40, 45, 30], [35, 41, 29]];
  for (let j = 0; j < h; j++) {
    const y = (j + .5) / PX;
    for (let i = 0; i < w; i++) {
      const x = (i + .5) / PX, k = j * w + i, s = S[k];
      let r, gg, b;
      if (!s) {
        const dp = clamp((y - cy[i]) / 40, 0, 1), nz = vnoise(x * .2, y * .2, 9) * .08;
        r = 14 - 6 * dp; gg = 30 - 14 * dp + nz * 38; b = 44 - 18 * dp + nz * 40;
      } else {
        if (F[k] > .62) { r = 20; gg = 36; b = 25 }              /* лес */
        else {
          const rx = x * .95 + y * .31, ry = -x * .31 + y * .95;
          const f = FLD[(h2(Math.floor(rx / 2.3), Math.floor(ry / 1.7), 5) * FLD.length) | 0];
          r = f[0]; gg = f[1]; b = f[2];
        }
        const hl = H[k - 1] || H[k], hr = H[k + 1] || H[k], hu = H[k - w] || H[k], hd = H[k + w] || H[k];
        const sh = clamp(1 + (hl - hr + hu - hd) * 26, .7, 1.32), el = .88 + H[k] * .28;
        r *= sh * el; gg *= sh * el; b *= sh * el;
        if (s === 2) { r = r * .72 + 62 * .28; gg = gg * .72 + 28 * .28; b = b * .72 + 30 * .28 }
        const nb = [S[k - 1], S[k + 1], S[k - w], S[k + w]];
        if (nb.includes(0)) { r = 62; gg = 62; b = 50 }                 /* линия берега */
        if (s === 1 && nb.includes(2)) { r = 214; gg = 68; b = 54 }     /* граница */
      }
      const o = k * 4; D[o] = r; D[o + 1] = gg; D[o + 2] = b; D[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.scale(PX, PX); g.lineJoin = 'round'; g.lineCap = 'round';

  /* городская застройка */
  for (const c of WD.cities) {
    const n = 10 + c.pop * 8;
    for (let i = 0; i < n; i++) {
      const a = i * 2.399, rr = (c.pop * 2.1 + 1) * Math.sqrt(i / n);
      g.fillStyle = c.enemy ? 'rgba(86,62,58,.5)' : 'rgba(78,74,64,.55)';
      g.beginPath(); g.arc(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, c.pop * .85 + .6, 0, 7); g.fill();
    }
  }
  for (const v of WD.villages) { g.fillStyle = 'rgba(80,74,58,.66)'; g.fillRect(v.x - v.s / 2, v.y - v.s / 2, v.s, v.s) }

  /* ЛЭП */
  g.strokeStyle = 'rgba(96,104,112,.3)'; g.lineWidth = .18;
  for (const l of WD.lines) { g.beginPath(); l.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke() }

  /* дороги */
  for (const r of WD.roads) {
    g.strokeStyle = r.main ? 'rgba(122,106,74,.85)' : 'rgba(92,84,62,.7)';
    g.lineWidth = r.main ? .6 : .42;
    g.beginPath(); r.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke();
  }
  /* реки */
  for (const r of WD.rivers) {
    g.strokeStyle = '#10313f'; g.lineWidth = r.w + .55;
    g.beginPath(); r.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke();
    g.strokeStyle = '#1d4c68'; g.lineWidth = r.w * .6; g.stroke();
  }
  /* мосты */
  g.strokeStyle = 'rgba(190,178,150,.8)';
  for (const b of WD.bridges) { g.lineWidth = b.main ? .8 : .6; g.beginPath(); g.moveTo(b.x - 1.1, b.y); g.lineTo(b.x + 1.1, b.y); g.stroke() }

  TER = c;
}
