'use strict';
/* ============================================================
   СИЛУЭТЫ: наземная техника
   u — расчёт (угол башни, состояние), t — время (вращение антенн).
   ============================================================ */

/* ============================================================
   НАЗЕМНАЯ ТЕХНИКА. u — расчёт (для угла башни, состояния),
   t — время (вращение антенн)
   ============================================================ */
const ART_GND = {
  /* пост воздушного наблюдения: тренога, два наблюдателя, микрофон */
  post(g, u, t) {
    g.strokeStyle = PAL.metal; g.lineWidth = .05;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(-.22, -.22); g.moveTo(0, 0); g.lineTo(-.22, .22); g.moveTo(0, 0); g.lineTo(.30, 0);
    g.stroke();
    dot(g, .30, 0, .13, '#39434b');
    g.strokeStyle = '#b9c6cd'; g.lineWidth = .04;
    g.beginPath(); g.arc(.30, 0, .22, -1.1, 1.1); g.stroke();
    dot(g, -.30, -.26, .10, '#5b6650'); dot(g, -.30, .26, .10, '#5b6650');
  },
  /* пикап с крупнокалиберным пулемётом */
  pickup(g, u, t) {
    axles(g, [.26, -.26], .30, .12);
    box(g, -.46, -.26, .92, .52, PAL.hull, PAL.hullLo);
    box(g, .06, -.24, .28, .48, PAL.hullHi, PAL.hullLo);          /* кабина */
    g.fillStyle = 'rgba(120,180,200,.4)'; rr(g, .26, -.19, .07, .38, .02); g.fill();
    box(g, -.44, -.23, .46, .46, PAL.hullLo);                     /* кузов */
    /* турель с пулемётом */
    g.save(); g.translate(-.20, 0); g.rotate((u && u.ta) || 0);
    dot(g, 0, 0, .13, '#333c2e');
    g.strokeStyle = '#1d2418'; g.lineWidth = .075;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(.42, 0); g.stroke();
    g.strokeStyle = PAL.metal; g.lineWidth = .035;
    g.beginPath(); g.moveTo(.08, 0); g.lineTo(.44, 0); g.stroke();
    g.restore();
  },
  /* расчёт ПЗРК: двое и труба */
  manpad(g, u, t) {
    dot(g, -.18, -.20, .14, '#4d5540'); dot(g, -.22, .22, .12, '#454e3d');
    g.save(); g.translate(-.10, -.12); g.rotate(((u && u.ta) || 0) - .25);
    g.strokeStyle = '#2f3729'; g.lineWidth = .16;
    g.beginPath(); g.moveTo(-.2, 0); g.lineTo(.5, 0); g.stroke();
    g.strokeStyle = PAL.metalHi; g.lineWidth = .05;
    g.beginPath(); g.moveTo(.1, 0); g.lineTo(.5, 0); g.stroke();
    dot(g, -.2, 0, .09, '#1b2116');
    g.restore();
  },
  /* макет пусковой: контур «Щита» пунктиром */
  decoy(g, u, t) {
    g.save();
    g.setLineDash([.09, .07]); g.strokeStyle = '#7d8a72'; g.lineWidth = .035;
    rr(g, -.5, -.24, 1, .48, .06); g.stroke();
    g.fillStyle = 'rgba(90,100,80,.35)'; g.fill();
    g.setLineDash([]);
    for (let i = 0; i < 4; i++) {
      const y = (i - 1.5) * .12;
      g.strokeStyle = '#8c9a80'; g.lineWidth = .026;
      g.beginPath(); g.moveTo(-.28, y); g.lineTo(.30, y); g.stroke();
    }
    g.restore();
    arrayPanel(g, .42, 0, .10, .34, 0, '#2b3540');
    const pl = .5 + .5 * Math.sin(t * 5);
    g.strokeStyle = `rgba(255,190,90,${.2 + pl * .35})`; g.lineWidth = .03;
    g.beginPath(); g.arc(.42, 0, .5 + pl * .12, 0, 7); g.stroke();
  },
  /* расчёт дронов-перехватчиков: фургон и дроны на рейлинге */
  icpt(g, u, t) {
    axles(g, [.28, -.02, -.30], .27, .11);
    box(g, -.48, -.24, .96, .48, PAL.hull, PAL.hullLo);
    box(g, .18, -.22, .30, .44, PAL.hullHi, PAL.hullLo);
    g.fillStyle = 'rgba(120,180,200,.4)'; rr(g, .40, -.17, .07, .34, .02); g.fill();
    const a = (t * 30) % 6.283;
    for (let i = 0; i < 4; i++) {
      const x = -.40 + (i % 2) * .22, y = (i < 2 ? -.12 : .12);
      g.strokeStyle = 'rgba(190,240,255,.8)'; g.lineWidth = .02;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(x + Math.cos(a) * .07 * s, y + Math.sin(a) * .07 * s);
        g.lineTo(x - Math.cos(a) * .07 * s, y - Math.sin(a) * .07 * s);
        g.stroke();
      }
      dot(g, x, y, .03, '#cdeeff');
    }
    whip(g, .06, .22, .26, 1.5);
  },
  /* транспортно-заряжающая: кран и ракеты на платформе */
  ttz(g, u, t) {
    axles(g, [.34, .04, -.30], .27, .115);
    box(g, -.5, -.25, 1, .5, PAL.hull, PAL.hullLo);
    box(g, .24, -.23, .26, .46, PAL.hullHi, PAL.hullLo);
    box(g, -.48, -.22, .68, .44, PAL.hullLo);
    canisters(g, -.44, 2, .58, .15, .05, false, '#565f45');
    g.strokeStyle = PAL.metal; g.lineWidth = .05;
    g.beginPath(); g.moveTo(.14, .0); g.lineTo(-.10, -.34); g.stroke();
    dot(g, .14, 0, .07, '#39412f');
  },
  /* ремонтно-эвакуационная: кузов-фургон и стрела */
  rem(g, u, t) {
    axles(g, [.32, -.30], .28, .12);
    box(g, -.5, -.26, 1, .52, PAL.hull, PAL.hullLo);
    box(g, .2, -.24, .3, .48, PAL.hullHi, PAL.hullLo);
    box(g, -.46, -.24, .58, .48, PAL.tarp, PAL.hullLo);
    g.strokeStyle = PAL.warn; g.lineWidth = .028;
    g.beginPath(); g.moveTo(-.44, -.10); g.lineTo(.06, -.10); g.stroke();
    g.strokeStyle = PAL.metal; g.lineWidth = .055;
    g.beginPath(); g.moveTo(-.10, 0); g.lineTo(.22, .34); g.stroke();
    dot(g, -.10, 0, .07, '#39412f');
    dot(g, .40, -.20, .045, '#ffd479');
  },
  /* подвижный пункт управления: кузов-КШМ, мачты, антенны */
  cp(g, u, t) {
    axles(g, [.32, -.04, -.32], .28, .115);
    box(g, -.5, -.27, 1, .54, PAL.hull, PAL.hullLo);
    box(g, .22, -.25, .28, .5, PAL.hullHi, PAL.hullLo);
    box(g, -.48, -.26, .66, .52, '#3f4836', PAL.hullLo);
    g.fillStyle = 'rgba(120,180,200,.25)'; rr(g, -.30, -.20, .12, .18, .02); g.fill();
    dish(g, -.16, 0, .19, (t * .6) % 6.283);
    whip(g, -.44, -.22, .40, -1.35); whip(g, -.44, .22, .40, 1.35); whip(g, .06, .24, .30, 1.2);
    const pl = .5 + .5 * Math.sin(t * 2.2);
    g.strokeStyle = `rgba(110,200,255,${.12 + pl * .22})`; g.lineWidth = .026;
    g.beginPath(); g.arc(-.16, 0, .46 + pl * .1, 0, 7); g.stroke();
  },
  /* ЗСУ: гусеничное шасси, башня со спаркой, своя РЛС */
  spaag(g, u, t) {
    tracks(g, -.48, .46, .22, .11);
    box(g, -.46, -.23, .92, .46, PAL.hull, PAL.hullLo);
    g.save(); g.translate(-.04, 0); g.rotate((u && u.ta) || 0);
    /* башня */
    fs(g, [[.30, -.20], [.34, 0], [.30, .20], [-.26, .24], [-.30, 0], [-.26, -.24]], '#4b553f', PAL.hullLo, .02);
    /* спаренные стволы */
    g.strokeStyle = '#1e2419'; g.lineWidth = .055;
    g.beginPath(); g.moveTo(.20, -.09); g.lineTo(.74, -.09); g.moveTo(.20, .09); g.lineTo(.74, .09); g.stroke();
    g.strokeStyle = PAL.metalHi; g.lineWidth = .022;
    g.beginPath(); g.moveTo(.42, -.09); g.lineTo(.76, -.09); g.moveTo(.42, .09); g.lineTo(.76, .09); g.stroke();
    /* антенна сопровождения */
    dish(g, -.24, 0, .16, u && u.rOn ? (t * 3.2) % 6.283 : 0);
    g.restore();
  },
  /* вертолёт-перехватчик */
  heli(g, u, t) {
    /* хвостовая балка */
    fs(g, [[-.10, -.05], [-.62, -.035], [-.66, .035], [-.10, .05]], PAL.hull, PAL.hullLo, .016);
    fs(g, [[-.56, -.03], [-.70, -.20], [-.64, -.22], [-.52, -.03]], PAL.hullHi);
    /* фюзеляж */
    fs(g, [[.50, 0], [.40, -.13], [.14, -.17], [-.12, -.13], [-.14, .13], [.14, .17], [.40, .13]], PAL.hull, PAL.hullLo, .02);
    g.fillStyle = 'rgba(130,190,215,.55)';
    P(g, [[.48, 0], [.38, -.11], [.18, -.13], [.20, .13], [.38, .11]]); g.fill();
    /* пулемёт */
    g.strokeStyle = '#1e2419'; g.lineWidth = .04;
    g.beginPath(); g.moveTo(.20, -.16); g.lineTo(.52, -.20); g.stroke();
    /* несущий винт */
    const a = (t * 26) % 6.283;
    g.strokeStyle = 'rgba(210,225,235,.32)'; g.lineWidth = .045;
    for (let i = 0; i < 4; i++) {
      const b = a + i * Math.PI / 2;
      g.beginPath(); g.moveTo(.06, 0); g.lineTo(.06 + Math.cos(b) * .78, Math.sin(b) * .78); g.stroke();
    }
    g.strokeStyle = 'rgba(210,225,235,.13)'; g.lineWidth = .02;
    g.beginPath(); g.arc(.06, 0, .78, 0, 7); g.stroke();
    dot(g, .06, 0, .05, '#2c3428');
    /* рулевой винт */
    const c = (t * 40) % 6.283;
    g.strokeStyle = 'rgba(210,225,235,.35)'; g.lineWidth = .022;
    g.beginPath(); g.moveTo(-.66, Math.sin(c) * .17); g.lineTo(-.66, -Math.sin(c) * .17); g.stroke();
  },
  /* ЗРК малой дальности: колёсное шасси, поворотная пусковая на 4 ракеты, РЛС */
  krom(g, u, t) {
    axles(g, [.36, .06, -.30], .27, .12);
    box(g, -.5, -.25, 1, .5, PAL.hull, PAL.hullLo);
    box(g, .26, -.23, .24, .46, PAL.hullHi, PAL.hullLo);
    g.fillStyle = 'rgba(120,180,200,.4)'; rr(g, .42, -.17, .07, .34, .02); g.fill();
    g.save(); g.translate(-.12, 0); g.rotate((u && u.ta) || 0);
    dot(g, 0, 0, .15, '#39412f');
    canisters(g, -.04, 4, .46, .095, .028, true, '#59614a');
    g.restore();
    arrayPanel(g, .08, 0, .07, .30, u && u.rOn ? (t * 2.2) % 6.283 : .4, '#2b3540');
  },
  /* РЛС дальнего обнаружения: тягач и большое вращающееся полотно */
  horizon(g, u, t) {
    axles(g, [.38, .10, -.26, -.42], .26, .11);
    box(g, -.5, -.24, 1, .48, PAL.hull, PAL.hullLo);
    box(g, .28, -.22, .22, .44, PAL.hullHi, PAL.hullLo);
    /* опоры-аутригеры */
    g.strokeStyle = PAL.metal; g.lineWidth = .028;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-.18, s * .22); g.lineTo(-.18, s * .40); g.stroke(); dot(g, -.18, s * .40, .045, '#39412f') }
    /* полотно */
    const a = u && u.rOn ? (t * 1.15) % 6.283 : .55;
    arrayPanel(g, -.10, 0, .13, .84, a, '#26313b');
    dot(g, -.10, 0, .07, '#39434b');
    if (u && u.rOn) {
      g.save(); g.translate(-.10, 0); g.rotate(a);
      const gr = g.createLinearGradient(0, 0, .95, 0);
      gr.addColorStop(0, 'rgba(120,220,255,.28)'); gr.addColorStop(1, 'rgba(120,220,255,0)');
      fs(g, [[0, -.10], [.95, -.30], [.95, .30], [0, .10]], gr);
      g.restore();
    }
  },
  /* станция РЭБ: кузов, две тарелки, штыри */
  ew(g, u, t) {
    axles(g, [.34, .04, -.32], .27, .115);
    box(g, -.5, -.26, 1, .52, PAL.hull, PAL.hullLo);
    box(g, .24, -.24, .26, .48, PAL.hullHi, PAL.hullLo);
    box(g, -.48, -.25, .66, .5, '#3d4634', PAL.hullLo);
    dish(g, -.34, -.10, .20, -.5 + Math.sin(t * .8) * .35);
    dish(g, -.06, .12, .18, .7 + Math.sin(t * .6) * .3);
    whip(g, -.46, .24, .34, 1.4); whip(g, .10, -.24, .30, -1.3);
    const pl = .5 + .5 * Math.sin(t * 3.4);
    g.strokeStyle = `rgba(150,255,190,${.14 + pl * .26})`; g.lineWidth = .03;
    g.beginPath(); g.arc(-.2, 0, .55 + pl * .14, 0, 7); g.stroke();
  },
  /* ЗРК средней дальности: восьмиосное шасси, 4 поднятых ТПК, полотно РЛС */
  shield(g, u, t) {
    axles(g, [.42, .26, -.18, -.36], .28, .115);
    box(g, -.5, -.27, 1, .54, PAL.hull, PAL.hullLo);
    box(g, .30, -.25, .20, .5, PAL.hullHi, PAL.hullLo);
    g.fillStyle = 'rgba(120,180,200,.4)'; rr(g, .43, -.19, .06, .38, .02); g.fill();
    /* поворотная платформа с контейнерами */
    g.save(); g.translate(-.10, 0); g.rotate((u && u.ta) || 0);
    dot(g, 0, 0, .17, '#333c2e');
    canisters(g, -.02, 4, .52, .105, .03, true, '#5c6549');
    g.restore();
    arrayPanel(g, .14, 0, .085, .40, u && u.rOn ? (t * 1.9) % 6.283 : .35, '#26313b');
    if (u && u.rOn) {
      const a = (t * 1.9) % 6.283;
      g.save(); g.translate(.14, 0); g.rotate(a);
      const gr = g.createLinearGradient(0, 0, .7, 0);
      gr.addColorStop(0, 'rgba(120,220,255,.24)'); gr.addColorStop(1, 'rgba(120,220,255,0)');
      fs(g, [[0, -.08], [.7, -.22], [.7, .22], [0, .08]], gr);
      g.restore();
    }
  },
  /* ЗРК большой дальности: длинное многоосное шасси, 4 крупных ТПК, АФАР */
  bastion(g, u, t) {
    axles(g, [.46, .34, .22, -.14, -.28, -.42], .30, .115);
    box(g, -.52, -.29, 1.04, .58, PAL.hull, PAL.hullLo);
    box(g, .34, -.27, .18, .54, PAL.hullHi, PAL.hullLo);
    g.fillStyle = 'rgba(120,180,200,.4)'; rr(g, .45, -.20, .06, .40, .02); g.fill();
    g.save(); g.translate(-.12, 0); g.rotate((u && u.ta) || 0);
    dot(g, 0, 0, .19, '#2f382b');
    canisters(g, -.04, 4, .58, .125, .032, true, '#616a4d');
    g.restore();
    arrayPanel(g, .20, 0, .10, .48, u && u.rOn ? (t * 1.5) % 6.283 : .3, '#223744');
    if (u && u.rOn) {
      const a = (t * 1.5) % 6.283;
      g.save(); g.translate(.20, 0); g.rotate(a);
      const gr = g.createLinearGradient(0, 0, .95, 0);
      gr.addColorStop(0, 'rgba(120,220,255,.3)'); gr.addColorStop(1, 'rgba(120,220,255,0)');
      fs(g, [[0, -.10], [.95, -.28], [.95, .28], [0, .10]], gr);
      g.restore();
    }
    g.strokeStyle = PAL.metal; g.lineWidth = .03;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-.30, s * .26); g.lineTo(-.30, s * .44); g.stroke(); dot(g, -.30, s * .44, .05, '#39412f') }
  }
};
