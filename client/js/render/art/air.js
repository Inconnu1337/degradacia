'use strict';
/* ============================================================
   СИЛУЭТЫ: воздушные цели и наши ракеты
   ============================================================ */

/* цвета воздушных целей по классу */
const AIR_COL = {
  drone: '#ff9d3d', decoy: '#ffbe6b', loiter: '#ff8f5a', jet: '#ff6f2f',
  recon: '#ffe08a', ewuav: '#c58cff', arm: '#ff5f9e',
  cruise: '#ff4d4d', ballistic: '#e04dff', aeroball: '#f06bff',
  unknown: '#a9bac6'
};

/* ============================================================
   ВОЗДУШНЫЕ ЦЕЛИ
   ============================================================ */
const ART_AIR = {
  /* дешёвый ударный БпЛА: дельта-крыло, толкающий винт, V-образное оперение */
  drone(g, col, t) {
    const d = col + '';
    /* крыло */
    fs(g, [[.5, 0], [.02, -.44], [-.26, -.40], [-.30, -.10], [-.34, 0], [-.30, .10], [-.26, .40], [.02, .44]], d, 'rgba(0,0,0,.45)', .022);
    /* фюзеляж */
    fs(g, [[.5, 0], [.16, -.07], [-.30, -.06], [-.34, 0], [-.30, .06], [.16, .07]], '#0000002e');
    /* V-оперение */
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = .03;
    g.beginPath(); g.moveTo(-.24, -.05); g.lineTo(-.42, -.20); g.moveTo(-.24, .05); g.lineTo(-.42, .20); g.stroke();
    /* винт */
    const a = (t * 26) % 6.283;
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = .02;
    g.beginPath(); g.moveTo(-.34 + Math.cos(a) * .001, Math.sin(a) * .13); g.lineTo(-.34, -Math.sin(a) * .13); g.stroke();
    dot(g, -.34, 0, .03, 'rgba(255,255,255,.5)');
  },
  /* имитатор: то же, но пустой контур и меньше */
  decoy(g, col, t) {
    g.save(); g.scale(.86, .86);
    g.strokeStyle = col; g.lineWidth = .05; g.setLineDash([.12, .07]);
    P(g, [[.5, 0], [.02, -.42], [-.28, -.34], [-.32, 0], [-.28, .34], [.02, .42]]);
    g.stroke(); g.setLineDash([]);
    g.fillStyle = col + '44'; g.fill();
    g.restore();
  },
  /* барражирующий: крестообразные крылья, оптическая головка */
  loiter(g, col, t) {
    g.strokeStyle = col; g.lineWidth = .075;
    g.beginPath();
    g.moveTo(-.02, 0); g.lineTo(-.34, -.34); g.moveTo(-.02, 0); g.lineTo(-.34, .34);
    g.moveTo(.06, 0); g.lineTo(.30, -.30); g.moveTo(.06, 0); g.lineTo(.30, .30);
    g.stroke();
    fs(g, [[.46, 0], [.20, -.10], [-.34, -.08], [-.40, 0], [-.34, .08], [.20, .10]], col, 'rgba(0,0,0,.45)', .02);
    dot(g, .40, 0, .065, '#1d2630'); dot(g, .41, 0, .032, '#9fdcff');
  },
  /* реактивный: стрельчатое крыло, два киля, сопло */
  jet(g, col, t) {
    fs(g, [[.5, 0], [.34, -.05], [.02, -.40], [-.16, -.40], [-.06, -.10], [-.36, -.08], [-.42, 0], [-.36, .08], [-.06, .10], [-.16, .40], [.02, .40], [.34, .05]], col, 'rgba(0,0,0,.5)', .022);
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = .028;
    g.beginPath(); g.moveTo(-.28, -.07); g.lineTo(-.44, -.19); g.moveTo(-.28, .07); g.lineTo(-.44, .19); g.stroke();
    /* факел */
    const gr = g.createLinearGradient(-.42, 0, -.72, 0);
    gr.addColorStop(0, 'rgba(255,220,150,.85)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    fs(g, [[-.42, -.055], [-.74, 0], [-.42, .055]], gr);
  },
  /* разведчик: большое прямое крыло, V-хвост, толкающий винт */
  recon(g, col, t) {
    fs(g, [[.30, -.66], [.42, -.66], [.34, -.05], [.46, -.04], [.50, 0], [.46, .04], [.34, .05], [.42, .66], [.30, .66], [.24, .05], [-.30, .045], [-.36, 0], [-.30, -.045], [.24, -.05]], col, 'rgba(0,0,0,.45)', .02);
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = .028;
    g.beginPath(); g.moveTo(-.22, -.03); g.lineTo(-.40, -.22); g.moveTo(-.22, .03); g.lineTo(-.40, .22); g.stroke();
    dot(g, .42, 0, .04, '#1d2630'); dot(g, .43, 0, .018, '#9fdcff');
    const a = (t * 22) % 6.283;
    g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = .018;
    g.beginPath(); g.moveTo(-.36, Math.sin(a) * .14); g.lineTo(-.36, -Math.sin(a) * .14); g.stroke();
  },
  /* постановщик помех: широкое крыло, подвесные контейнеры, антенны */
  ewuav(g, col, t) {
    fs(g, [[.24, -.72], [.38, -.70], [.30, -.05], [.44, -.04], [.48, 0], [.44, .04], [.30, .05], [.38, .70], [.24, .72], [.20, .05], [-.32, .05], [-.38, 0], [-.32, -.05], [.20, -.05]], col, 'rgba(0,0,0,.45)', .02);
    for (const s of [-1, 1]) { box(g, .04, s * .40 - .05, .26, .10, '#2c3440', 'rgba(220,230,240,.55)') }
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = .026;
    g.beginPath(); g.moveTo(-.26, 0); g.lineTo(-.44, -.20); g.moveTo(-.26, 0); g.lineTo(-.44, .20); g.stroke();
    const pl = .5 + .5 * Math.sin(t * 6);
    g.strokeStyle = `rgba(200,150,255,${.25 + pl * .5})`; g.lineWidth = .022;
    g.beginPath(); g.arc(0, 0, .82 + pl * .1, 0, 7); g.stroke();
  },
  /* антирадарный: узкая стрела, антенны-усы */
  arm(g, col, t) {
    fs(g, [[.52, 0], [.10, -.30], [-.20, -.26], [-.30, -.06], [-.38, 0], [-.30, .06], [-.20, .26], [.10, .30]], col, 'rgba(0,0,0,.5)', .022);
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = .016;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(.44, s * .04); g.lineTo(.62, s * .16); g.stroke() }
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = .026;
    g.beginPath(); g.moveTo(-.26, 0); g.lineTo(-.44, -.18); g.moveTo(-.26, 0); g.lineTo(-.44, .18); g.stroke();
  },
  /* крылатая ракета: тонкий корпус, короткое крыло, крестовое оперение */
  cruise(g, col, t) {
    fs(g, [[.5, 0], [.36, -.055], [-.34, -.06], [-.42, -.03], [-.42, .03], [-.34, .06], [.36, .055]], col, 'rgba(0,0,0,.5)', .02);
    fs(g, [[.06, -.05], [-.10, -.34], [-.20, -.34], [-.14, -.05]], col, 'rgba(0,0,0,.4)', .016);
    fs(g, [[.06, .05], [-.10, .34], [-.20, .34], [-.14, .05]], col, 'rgba(0,0,0,.4)', .016);
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = .026;
    g.beginPath(); g.moveTo(-.30, -.05); g.lineTo(-.44, -.17); g.moveTo(-.30, .05); g.lineTo(-.44, .17); g.stroke();
    const gr = g.createLinearGradient(-.42, 0, -.70, 0);
    gr.addColorStop(0, 'rgba(255,230,180,.8)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    fs(g, [[-.42, -.045], [-.72, 0], [-.42, .045]], gr);
  },
  /* баллистическая: длинный конус, четыре стабилизатора, яркий факел */
  ballistic(g, col, t) {
    fs(g, [[.5, 0], [.30, -.05], [-.30, -.07], [-.36, 0], [-.30, .07], [.30, .05]], col, 'rgba(0,0,0,.5)', .022);
    g.fillStyle = 'rgba(255,255,255,.55)';
    for (const s of [-1, 1]) { P(g, [[-.24, s * .06], [-.38, s * .24], [-.42, s * .22], [-.34, s * .06]]); g.fill() }
    g.fillStyle = 'rgba(255,255,255,.3)';
    P(g, [[-.24, -.03], [-.44, -.06], [-.44, .06], [-.24, .03]]); g.fill();
    const gr = g.createLinearGradient(-.36, 0, -.95, 0);
    gr.addColorStop(0, 'rgba(255,255,235,.95)'); gr.addColorStop(.3, 'rgba(255,190,110,.7)'); gr.addColorStop(1, 'rgba(255,90,40,0)');
    fs(g, [[-.36, -.07], [-.98, 0], [-.36, .07]], gr);
  },
  aeroball(g, col, t) {
    ART_AIR.ballistic(g, col, t);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = .018;
    g.beginPath(); g.moveTo(.26, -.05); g.lineTo(.04, -.15); g.moveTo(.26, .05); g.lineTo(.04, .15); g.stroke();
  },
  /* неопознанный контакт */
  unknown(g, col, t) {
    g.strokeStyle = col; g.lineWidth = .055;
    g.beginPath(); g.arc(0, 0, .30, 0, 7); g.stroke();
    g.fillStyle = col + '33'; g.fill();
    g.lineWidth = .05;
    g.beginPath(); g.moveTo(.30, 0); g.lineTo(.52, 0); g.stroke();
  }
};

/* ============================================================
   НАШИ РАКЕТЫ И ПЕРЕХВАТЧИКИ (в полёте)
   ============================================================ */
function drawOwnMissile(g, kind, t) {
  if (kind === 'drone') {
    g.strokeStyle = '#8fe3ff'; g.lineWidth = .09;
    g.beginPath(); g.moveTo(-.2, -.2); g.lineTo(.2, .2); g.moveTo(-.2, .2); g.lineTo(.2, -.2); g.stroke();
    dot(g, 0, 0, .12, '#d6f4ff');
  } else {
    fs(g, [[.5, 0], [.2, -.09], [-.34, -.09], [-.4, 0], [-.34, .09], [.2, .09]], '#dfe9ef');
    g.fillStyle = 'rgba(255,255,255,.7)';
    for (const s of [-1, 1]) { P(g, [[-.24, s * .08], [-.42, s * .26], [-.44, s * .24], [-.34, s * .08]]); g.fill() }
    const gr = g.createLinearGradient(-.4, 0, -1.1, 0);
    gr.addColorStop(0, 'rgba(255,255,240,.95)'); gr.addColorStop(.35, 'rgba(160,220,255,.6)'); gr.addColorStop(1, 'rgba(120,200,255,0)');
    fs(g, [[-.4, -.1], [-1.15, 0], [-.4, .1]], gr);
  }
}
