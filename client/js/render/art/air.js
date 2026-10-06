'use strict';
/* ============================================================
   СИЛУЭТЫ: воздушные цели и наши ракеты
   Локальная система как в helpers.js: длина изделия = 1, нос в +X.
   Каждая функция: (g, col, t, th) — контекст, цвет класса, время
   анимации, сама цель (может не быть). th.id сдвигает фазу винтов и
   огней, чтобы стая не мигала в такт; th.br — «Улей» уже сбросил рой.
   ============================================================ */

/* цвета воздушных целей по классу */
const AIR_COL = {
  drone: '#ff9d3d', decoy: '#ffbe6b', loiter: '#ff8f5a', jet: '#ff6f2f',
  recon: '#ffe08a', ewuav: '#c58cff', arm: '#ff5f9e',
  cruise: '#ff4d4d', ballistic: '#e04dff', aeroball: '#f06bff',
  fpv: '#ffd23d', mother: '#ffb347', kab: '#ff7a7a',
  unknown: '#a9bac6'
};

/* относительный размер значка: FPV — мелочь, носитель и разведчики — крупные */
const AIR_SIZE = { fpv: .7, mother: 1.3, recon: 1.1, ewuav: 1.15, kab: .9 };

/* ---------- цвет: светлее / темнее ---------- */
function tint(hex, k) {
  const n = parseInt(String(hex).slice(1, 7), 16);
  if (!Number.isFinite(n)) return hex;
  let r = n >> 16 & 255, gg = n >> 8 & 255, b = n & 255;
  const f = c => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  return `rgb(${f(r)},${f(gg)},${f(b)})`;
}

/* заливка «объёмом»: светлый хребет по оси, тёмные края */
function bodyGrad(g, col, w) {
  const gr = g.createLinearGradient(0, -w, 0, w);
  gr.addColorStop(0, tint(col, -.45));
  gr.addColorStop(.42, tint(col, .25));
  gr.addColorStop(.55, col);
  gr.addColorStop(1, tint(col, -.55));
  return gr;
}

const phase = th => th && th.id ? th.id * 1.37 : 0;

/* винт-толкатель: размытый диск и две лопасти */
function pusher(g, x, r, t, th, sp) {
  g.fillStyle = 'rgba(255,255,255,.10)';
  g.beginPath(); g.ellipse(x, 0, r * .16, r, 0, 0, 7); g.fill();
  const a = (t * (sp || 26) + phase(th)) % 6.283, s = Math.sin(a) * r;
  g.strokeStyle = 'rgba(235,240,245,.55)'; g.lineWidth = .022;
  g.beginPath(); g.moveTo(x, s); g.lineTo(x, -s); g.stroke();
  dot(g, x, 0, .026, 'rgba(40,40,40,.9)');
}

/* несущий винт сверху: диск, лопасть, ступица */
function rotor(g, x, y, r, t, th, dir) {
  g.fillStyle = 'rgba(220,230,240,.13)';
  g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.strokeStyle = 'rgba(220,230,240,.3)'; g.lineWidth = .012; g.stroke();
  const a = (t * 40 * (dir || 1) + phase(th) + x * 3) % 6.283;
  g.strokeStyle = 'rgba(245,248,250,.6)'; g.lineWidth = .028;
  g.beginPath(); g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.lineTo(x - Math.cos(a) * r, y - Math.sin(a) * r); g.stroke();
  dot(g, x, y, r * .22, '#1c2126');
}

/* факел двигателя с мерцанием */
function plume(g, x, w, len, t, th, hot) {
  const fl = 1 + Math.sin(t * 37 + phase(th)) * .12 + Math.sin(t * 23) * .07;
  const L = len * fl;
  const gr = g.createLinearGradient(x, 0, x - L, 0);
  if (hot) {
    gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(.25, 'rgba(255,220,140,.85)');
    gr.addColorStop(.6, 'rgba(255,130,50,.45)'); gr.addColorStop(1, 'rgba(255,80,30,0)');
  } else {
    gr.addColorStop(0, 'rgba(255,235,190,.9)'); gr.addColorStop(.4, 'rgba(255,150,70,.5)'); gr.addColorStop(1, 'rgba(255,100,40,0)');
  }
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(x, -w); g.quadraticCurveTo(x - L * .5, -w * 1.3, x - L, 0); g.quadraticCurveTo(x - L * .5, w * 1.3, x, w); g.closePath(); g.fill();
  /* ядро */
  g.fillStyle = 'rgba(255,255,255,.75)';
  g.beginPath(); g.ellipse(x - w * .6, 0, w * 1.1, w * .45, 0, 0, 7); g.fill();
}

/* раскалённый нос: торможение об воздух на большой скорости */
function heatNose(g, x, r, t, th, rgb) {
  const pl = .65 + .35 * Math.sin(t * 11 + phase(th));
  const gr = g.createRadialGradient(x, 0, 0, x, 0, r);
  gr.addColorStop(0, `rgba(${rgb},${.7 * pl})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.beginPath(); g.arc(x, 0, r, 0, 7); g.fill();
}

/* мигающий огонёк */
function blink(g, x, y, r, col, t, th, per) {
  const on = ((t + phase(th)) % (per || 1.2)) < .14;
  if (!on) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 3);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3, 0, 7); g.fill();
  dot(g, x, y, r, '#fff');
}

/* оптическая головка */
function eye(g, x, r) { dot(g, x, 0, r, '#141a20'); dot(g, x + r * .2, -r * .2, r * .45, '#9fdcff') }

/* дельтовидный «мопед» — общий силуэт ударного дрона и имитатора */
const DELTA = [[.5, 0], [.44, -.05], [.2, -.07], [-.22, -.46], [-.36, -.46], [-.31, -.08], [-.38, -.05], [-.38, .05], [-.31, .08], [-.36, .46], [-.22, .46], [.2, .07], [.44, .05]];

/* ============================================================
   ВОЗДУШНЫЕ ЦЕЛИ
   ============================================================ */
const ART_AIR = {
  /* дешёвый ударный БпЛА: дельта, законцовки-кили, толкающий винт */
  drone(g, col, t, th) {
    fs(g, DELTA, bodyGrad(g, col, .46), 'rgba(0,0,0,.6)', .022);
    /* фюзеляж-цилиндр */
    fs(g, [[.5, 0], [.42, -.06], [-.36, -.06], [-.4, 0], [-.36, .06], [.42, .06]], bodyGrad(g, tint(col, -.15), .06), 'rgba(0,0,0,.45)', .014);
    /* законцовки */
    g.strokeStyle = tint(col, -.6); g.lineWidth = .045;
    g.beginPath(); g.moveTo(-.22, -.46); g.lineTo(-.37, -.46); g.moveTo(-.22, .46); g.lineTo(-.37, .46); g.stroke();
    /* боевая часть и шов */
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = .012;
    g.beginPath(); g.moveTo(.3, -.06); g.lineTo(.3, .06); g.moveTo(.2, 0); g.lineTo(-.3, 0); g.stroke();
    /* горячий двигатель (как видит тепловизор) */
    dot(g, -.33, 0, .045, 'rgba(255,220,150,.55)');
    pusher(g, -.42, .15, t, th);
  },
  /* имитатор: тот же силуэт, пустой пунктир и уголковый отражатель */
  decoy(g, col, t, th) {
    g.save(); g.scale(.9, .9);
    g.setLineDash([.1, .06]);
    fs(g, DELTA, col + '30', col, .04);
    g.setLineDash([]);
    g.strokeStyle = col; g.lineWidth = .022;
    g.beginPath(); g.moveTo(0, -.1); g.lineTo(.12, 0); g.lineTo(0, .1); g.lineTo(-.12, 0); g.closePath(); g.moveTo(-.12, 0); g.lineTo(.12, 0); g.stroke();
    pusher(g, -.42, .13, t, th, 18);
    g.restore();
  },
  /* барражирующий: две пары крестообразных крыльев, оптика в носу */
  loiter(g, col, t, th) {
    const wing = (x, sp, ch) => {
      for (const s of [-1, 1]) fs(g, [[x, s * .04], [x - sp * .35, s * sp], [x - sp * .35 - ch, s * sp], [x - ch, s * .04]], bodyGrad(g, col, sp), 'rgba(0,0,0,.5)', .016);
    };
    wing(.16, .34, .12);
    wing(-.2, .3, .12);
    fs(g, [[.48, 0], [.38, -.07], [-.36, -.06], [-.42, 0], [-.36, .06], [.38, .07]], bodyGrad(g, tint(col, -.1), .07), 'rgba(0,0,0,.5)', .018);
    eye(g, .42, .05);
    pusher(g, -.44, .12, t, th, 30);
  },
  /* реактивный: та же дельта, турбина сверху и факел */
  jet(g, col, t, th) {
    fs(g, [[.5, 0], [.44, -.05], [.16, -.06], [-.18, -.4], [-.32, -.4], [-.28, -.07], [-.4, -.05], [-.4, .05], [-.28, .07], [-.32, .4], [-.18, .4], [.16, .06], [.44, .05]], bodyGrad(g, col, .4), 'rgba(0,0,0,.6)', .022);
    /* мотогондола на спине */
    box(g, -.42, -.065, .34, .13, tint(col, -.4), 'rgba(0,0,0,.6)');
    dot(g, -.08, 0, .05, tint(col, -.65));
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = .012;
    g.beginPath(); g.moveTo(.3, 0); g.lineTo(-.06, 0); g.stroke();
    plume(g, -.42, .05, .38, t, th, true);
  },
  /* разведчик: длинное прямое крыло, два хвостовых балки, шар оптики */
  recon(g, col, t, th) {
    /* балки и стабилизатор */
    g.strokeStyle = tint(col, -.35); g.lineWidth = .03;
    g.beginPath(); g.moveTo(.12, -.15); g.lineTo(-.4, -.15); g.moveTo(.12, .15); g.lineTo(-.4, .15); g.stroke();
    fs(g, [[-.33, -.2], [-.27, -.2], [-.27, .2], [-.33, .2]], tint(col, -.2), 'rgba(0,0,0,.5)', .014);
    fs(g, [[.24, -.68], [.32, -.68], [.36, -.05], [.36, .05], [.32, .68], [.24, .68], [.18, .05], [.18, -.05]], bodyGrad(g, col, .68), 'rgba(0,0,0,.5)', .018);
    fs(g, [[.5, 0], [.44, -.07], [-.08, -.07], [-.14, 0], [-.08, .07], [.44, .07]], bodyGrad(g, tint(col, -.1), .07), 'rgba(0,0,0,.5)', .016);
    eye(g, .44, .045);
    pusher(g, -.16, .14, t, th, 22);
    blink(g, .28, -.68, .018, 'rgba(255,60,60,.9)', t, th, 1.6);
    blink(g, .28, .68, .018, 'rgba(60,255,120,.9)', t, th, 1.6);
  },
  /* постановщик помех: широкое крыло, контейнеры, пульсирующее поле помех */
  ewuav(g, col, t, th) {
    const pl = .5 + .5 * Math.sin(t * 6 + phase(th));
    g.strokeStyle = `rgba(200,150,255,${.15 + pl * .4})`; g.lineWidth = .02;
    g.beginPath(); g.arc(0, 0, .78 + pl * .12, 0, 7); g.stroke();
    g.strokeStyle = `rgba(200,150,255,${.08 + (1 - pl) * .3})`;
    g.beginPath(); g.arc(0, 0, .95 + (1 - pl) * .12, 0, 7); g.stroke();
    fs(g, [[.22, -.72], [.36, -.7], [.32, -.05], [.32, .05], [.36, .7], [.22, .72], [.16, .05], [.16, -.05]], bodyGrad(g, col, .72), 'rgba(0,0,0,.5)', .02);
    fs(g, [[.48, 0], [.42, -.075], [-.32, -.06], [-.38, 0], [-.32, .06], [.42, .075]], bodyGrad(g, tint(col, -.15), .075), 'rgba(0,0,0,.5)', .018);
    for (const s of [-1, 1]) {
      box(g, .02, s * .42 - .05, .3, .1, '#2c3440', 'rgba(220,230,240,.55)');
      whip(g, .1, s * .62, .14, s * 1.9);
    }
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = .026;
    g.beginPath(); g.moveTo(-.26, 0); g.lineTo(-.44, -.2); g.moveTo(-.26, 0); g.lineTo(-.44, .2); g.stroke();
    pusher(g, -.4, .13, t, th);
  },
  /* антирадарный: узкая стрела, антенны-усы, светящаяся головка */
  arm(g, col, t, th) {
    fs(g, [[.52, 0], [.42, -.05], [.06, -.06], [-.2, -.3], [-.3, -.3], [-.28, -.06], [-.38, -.05], [-.38, .05], [-.28, .06], [-.3, .3], [-.2, .3], [.06, .06], [.42, .05]], bodyGrad(g, col, .3), 'rgba(0,0,0,.6)', .022);
    g.strokeStyle = 'rgba(255,255,255,.65)'; g.lineWidth = .014;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(.44, s * .035); g.lineTo(.64, s * .17); g.stroke() }
    const pl = .5 + .5 * Math.sin(t * 9 + phase(th));
    dot(g, .47, 0, .03 + pl * .015, `rgba(255,120,190,${.5 + pl * .5})`);
    pusher(g, -.41, .12, t, th);
  },
  /* крылатая ракета: тонкий корпус, раскрытое крыло, крестовое оперение, факел */
  cruise(g, col, t, th) {
    plume(g, -.44, .035, .3, t, th, false);
    for (const s of [-1, 1]) {
      fs(g, [[.08, s * .05], [-.06, s * .38], [-.13, s * .38], [-.08, s * .05]], bodyGrad(g, tint(col, -.1), .38), 'rgba(0,0,0,.5)', .014);
      fs(g, [[-.3, s * .05], [-.4, s * .17], [-.45, s * .17], [-.42, s * .05]], tint(col, -.3), 'rgba(0,0,0,.5)', .012);
    }
    fs(g, [[.5, 0], [.44, -.04], [.3, -.058], [-.42, -.058], [-.44, 0], [-.42, .058], [.3, .058], [.44, .04]], bodyGrad(g, col, .06), 'rgba(0,0,0,.6)', .018);
    /* воздухозаборник и обтекатель */
    fs(g, [[-.12, -.03], [-.3, -.035], [-.3, .035], [-.12, .03]], tint(col, -.55));
    dot(g, .46, 0, .02, tint(col, .5));
  },
  /* баллистическая: длинный корпус, стабилизаторы. Двигатель давно отработал —
     на нисходящей ветви она падает без факела, только нос раскаляется */
  ballistic(g, col, t, th) {
    heatNose(g, .5, .16, t, th, '255,200,150');
    for (const s of [-1, 1]) fs(g, [[-.24, s * .06], [-.38, s * .22], [-.42, s * .22], [-.38, s * .06]], tint(col, .35), 'rgba(0,0,0,.45)', .014);
    fs(g, [[.5, 0], [.4, -.04], [.26, -.065], [-.38, -.07], [-.4, 0], [-.38, .07], [.26, .065], [.4, .04]], bodyGrad(g, col, .07), 'rgba(0,0,0,.6)', .02);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = .014;
    g.beginPath(); g.moveTo(.26, -.065); g.lineTo(.26, .065); g.moveTo(-.05, -.068); g.lineTo(-.05, .068); g.stroke();
  },
  /* аэробаллистическая: оживальный корпус и плазма на носу, без факела */
  aeroball(g, col, t, th) {
    for (const s of [-1, 1]) fs(g, [[-.26, s * .06], [-.36, s * .19], [-.42, s * .19], [-.4, s * .06]], tint(col, .3), 'rgba(0,0,0,.45)', .014);
    fs(g, [[.5, 0], [.36, -.05], [.16, -.07], [-.4, -.07], [-.42, 0], [-.4, .07], [.16, .07], [.36, .05]], bodyGrad(g, col, .07), 'rgba(0,0,0,.6)', .02);
    const pl = .6 + .4 * Math.sin(t * 13 + phase(th));
    const gr = g.createRadialGradient(.5, 0, 0, .5, 0, .2);
    gr.addColorStop(0, `rgba(255,240,255,${.85 * pl})`); gr.addColorStop(1, 'rgba(240,107,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(.5, 0, .2, 0, 7); g.fill();
  },
  /* FPV: квадрокоптер на X-раме, камера вперёд, выстрел под брюхом */
  fpv(g, col, t, th) {
    const R2 = .17, arm = .3;
    g.strokeStyle = tint(col, -.55); g.lineWidth = .07; g.lineCap = 'round';
    g.beginPath(); g.moveTo(arm, -arm); g.lineTo(-arm, arm); g.moveTo(arm, arm); g.lineTo(-arm, -arm); g.stroke();
    g.lineCap = 'butt';
    /* боеприпас: кумулятивная граната, торчит вперёд */
    fs(g, [[.5, 0], [.44, -.06], [.06, -.06], [.02, 0], [.06, .06], [.44, .06]], bodyGrad(g, '#7c8a6a', .06), 'rgba(0,0,0,.6)', .016);
    /* корпус с аккумулятором */
    box(g, -.17, -.12, .34, .24, bodyGrad(g, col, .12), 'rgba(0,0,0,.6)');
    box(g, -.13, -.07, .18, .14, '#2a2f35', null);
    eye(g, .15, .04);
    let i = 0;
    for (const [x, y] of [[arm, -arm], [arm, arm], [-arm, -arm], [-arm, arm]]) rotor(g, x, y, R2, t, th, (i++ % 3) ? 1 : -1);
    blink(g, -.17, 0, .022, 'rgba(255,60,60,.9)', t, th, .5);
  },
  /* «Улей»: носитель FPV — крупное крыло, рой под крыльями, антенна ретранслятора */
  mother(g, col, t, th) {
    /* хвост на балках */
    g.strokeStyle = tint(col, -.4); g.lineWidth = .03;
    g.beginPath(); g.moveTo(.06, -.17); g.lineTo(-.42, -.17); g.moveTo(.06, .17); g.lineTo(-.42, .17); g.stroke();
    fs(g, [[-.36, -.22], [-.3, -.22], [-.3, .22], [-.36, .22]], tint(col, -.25), 'rgba(0,0,0,.5)', .014);
    fs(g, [[.2, -.62], [.3, -.62], [.34, -.06], [.34, .06], [.3, .62], [.2, .62], [.12, .06], [.12, -.06]], bodyGrad(g, col, .62), 'rgba(0,0,0,.55)', .02);
    fs(g, [[.5, 0], [.44, -.09], [-.12, -.09], [-.18, 0], [-.12, .09], [.44, .09]], bodyGrad(g, tint(col, -.12), .09), 'rgba(0,0,0,.55)', .018);
    /* рой под крыльями: пока не сброшен */
    if (!(th && th.br)) {
      for (const y of [-.44, -.28, .28, .44]) {
        g.strokeStyle = '#2a2f35'; g.lineWidth = .02;
        g.beginPath(); g.moveTo(.3, y - .06); g.lineTo(.18, y + .06); g.moveTo(.3, y + .06); g.lineTo(.18, y - .06); g.stroke();
        dot(g, .24, y, .028, AIR_COL.fpv);
      }
    } else {
      /* ретранслятор работает: волны связи */
      const k = ((t * .8 + phase(th)) % 1);
      g.strokeStyle = `rgba(255,210,120,${.55 * (1 - k)})`; g.lineWidth = .02;
      g.beginPath(); g.arc(.1, 0, .2 + k * .55, 0, 7); g.stroke();
    }
    whip(g, .1, 0, .2, -2.4);
    dot(g, .1, 0, .03, '#e8eef2');
    pusher(g, -.2, .14, t, th);
    blink(g, .25, -.62, .018, 'rgba(255,60,60,.9)', t, th, 1.4);
  },
  /* КАБ: толстый корпус бомбы, раскрытое планирующее крыло, крестовой хвост; без факела — только свист */
  kab(g, col, t, th) {
    /* спутный след от крыла */
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = .02;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-.02, s * .46); g.lineTo(-.6, s * .5); g.stroke() }
    /* крыло модуля — тонкая прямая плоскость поперёк корпуса */
    fs(g, [[.04, -.46], [-.04, -.46], [-.06, .46], [.02, .46]], tint(col, -.35), 'rgba(0,0,0,.55)', .014);
    for (const s of [-1, 1]) fs(g, [[-.28, s * .08], [-.4, s * .2], [-.46, s * .2], [-.42, s * .08]], tint(col, -.25), 'rgba(0,0,0,.5)', .012);
    fs(g, [[.5, 0], [.42, -.09], [.2, -.12], [-.3, -.11], [-.44, -.06], [-.44, .06], [-.3, .11], [.2, .12], [.42, .09]], bodyGrad(g, col, .12), 'rgba(0,0,0,.6)', .02);
    /* хомуты модуля и взрыватель */
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = .018;
    g.beginPath(); g.moveTo(.12, -.12); g.lineTo(.12, .12); g.moveTo(-.16, -.115); g.lineTo(-.16, .115); g.stroke();
    dot(g, .48, 0, .025, '#d8d8d8');
    blink(g, -.44, 0, .015, 'rgba(120,255,140,.8)', t, th, .9);
  },
  /* неопознанный контакт */
  unknown(g, col, t) {
    g.strokeStyle = col; g.lineWidth = .055;
    g.beginPath(); g.arc(0, 0, .30, 0, 7); g.stroke();
    g.fillStyle = col + '33'; g.fill();
    g.lineWidth = .05;
    g.beginPath(); g.moveTo(.30, 0); g.lineTo(.52, 0); g.stroke();
    const k = (t * .7) % 1;
    g.strokeStyle = col.length === 7 ? col + Math.round((1 - k) * 120).toString(16).padStart(2, '0') : col; g.lineWidth = .025;
    g.beginPath(); g.arc(0, 0, .3 + k * .3, 0, 7); g.stroke();
  }
};

/* ---------- кэш мелких силуэтов ----------
   Пока борт на экране меньше SPRITE_MAX пикселей, анимации винтов не видно,
   а векторная отрисовка с градиентами на сотню целей дорогая. Такой силуэт
   рисуется один раз в картинку (по классу, цвету и размеру) и дальше
   ставится drawImage. Вызывать в уже повёрнутой системе (нос в +X). */
const SPRITE_MAX = 26;
const SPRITES = new Map();

function drawAir(g, key, col, L, t, th) {
  const art = ART_AIR[key] || ART_AIR.drone;
  if (L > SPRITE_MAX) { g.scale(L, L); art(g, col, t, th); return }
  const Lq = Math.max(6, Math.round(L)), br = th && th.br ? 1 : 0;
  const id = key + col + Lq + br;
  let sp = SPRITES.get(id);
  if (!sp) {
    const S = Math.ceil(Lq * 2.4), k = typeof DPR === 'number' ? DPR : 1;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(S * k);
    const x = c.getContext('2d');
    x.scale(k, k); x.translate(S / 2, S / 2); x.scale(Lq, Lq);
    art(x, col, .37, { id: 3, br });
    sp = { c, S };
    if (SPRITES.size > 600) SPRITES.clear();
    SPRITES.set(id, sp);
  }
  g.drawImage(sp.c, -sp.S / 2, -sp.S / 2, sp.S, sp.S);
}

/* ============================================================
   НАШИ РАКЕТЫ И ПЕРЕХВАТЧИКИ (в полёте)
   ============================================================ */
function drawOwnMissile(g, kind, t) {
  if (kind === 'drone') {
    /* «Сапсан»: перехватчик-«крестовина» с толкающим винтом и сеткой в носу */
    const a = (t * 45) % 6.283;
    g.strokeStyle = '#5f7f92'; g.lineWidth = .08; g.lineCap = 'round';
    g.beginPath(); g.moveTo(.28, -.28); g.lineTo(-.28, .28); g.moveTo(.28, .28); g.lineTo(-.28, -.28); g.stroke();
    g.lineCap = 'butt';
    for (const [x, y] of [[.28, -.28], [.28, .28], [-.28, -.28], [-.28, .28]]) {
      g.fillStyle = 'rgba(200,240,255,.16)'; g.beginPath(); g.arc(x, y, .17, 0, 7); g.fill();
      g.strokeStyle = 'rgba(220,245,255,.6)'; g.lineWidth = .026;
      g.beginPath(); g.moveTo(x + Math.cos(a) * .17, y + Math.sin(a) * .17); g.lineTo(x - Math.cos(a) * .17, y - Math.sin(a) * .17); g.stroke();
    }
    fs(g, [[.42, 0], [.3, -.1], [-.2, -.1], [-.26, 0], [-.2, .1], [.3, .1]], bodyGrad(g, '#a8dff5', .1), 'rgba(0,0,0,.5)', .018);
    dot(g, .36, 0, .045, '#1a2730'); dot(g, .37, -.01, .02, '#8fe3ff');
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, .55);
    gr.addColorStop(0, 'rgba(143,227,255,.25)'); gr.addColorStop(1, 'rgba(143,227,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, .55, 0, 7); g.fill();
  } else {
    /* зенитная ракета: обтекатель, корпус с поясами, рули, факел */
    plume(g, -.4, .085, .78, t, null, true);
    g.fillStyle = 'rgba(160,220,255,.25)';
    g.beginPath(); g.ellipse(-.75, 0, .5, .14, 0, 0, 7); g.fill();
    for (const s of [-1, 1]) {
      fs(g, [[-.22, s * .075], [-.4, s * .26], [-.44, s * .26], [-.38, s * .075]], '#c9d5dc', 'rgba(0,0,0,.4)', .012);
      fs(g, [[.26, s * .075], [.2, s * .16], [.16, s * .16], [.16, s * .075]], '#c9d5dc', 'rgba(0,0,0,.4)', .01);
    }
    fs(g, [[.5, 0], [.4, -.055], [.28, -.08], [-.4, -.08], [-.42, 0], [-.4, .08], [.28, .08], [.4, .055]], bodyGrad(g, '#e4edf2', .08), 'rgba(0,0,0,.45)', .016);
    fs(g, [[.5, 0], [.4, -.055], [.3, -.075], [.3, .075], [.4, .055]], '#5d6a72');
    g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = .012;
    g.beginPath(); g.moveTo(.04, -.08); g.lineTo(.04, .08); g.moveTo(-.2, -.08); g.lineTo(-.2, .08); g.stroke();
  }
}
