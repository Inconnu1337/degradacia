'use strict';
/* ============================================================
   ВТОРАЯ СТОРОНА: состояние и суточное восполнение
   E — «голова» стороны, ведущей налёт. В обороне ею управляет DefenseAI,
   в налёте — игрок (E.stock — его арсенал).
   ============================================================ */

function eInit() {
  E = {
    stock: { fpv: 30, jalo: 70, moth: 30, shershen: 14, strizh: 6, sova: 4, vual: 2, grach: 6, krechet: 10, albatros: 16, molot: 6, garpia: 2 },
    know: {}, heat: {}, groups: [], queue: [], gid: 1, zuse: {}, wi: {},
    adapt: { ewRes: 0, highAlt: 0, decoy: .3, jet: 0, arm: 0, loiter: 0 },
    learn: { ew: 0, emptySEAD: 0 },
    obs: { alarmHours: 0, alarmEarly: 0, nights: 0 },
    reserve: null, lastMassive: -9, lastSEAD: -1e9, nextThink: 0, bda: {},
    posture: '', focus: 'energy', dayNews: [], jamWin: null, jamBase: .05, T0: 0,
    lastSamShots: 0
  };
}

/* ---------- день: восполнение и выводы ---------- */
function eDay(first) {
  const n = G.night;
  E.dayNews = [];
  if (!first) {
    const st = E.stock;
    st.fpv = (st.fpv || 0) + 14 + 2 * n;
    st.jalo += 45 + 8 * n; st.moth += 22 + 5 * n; st.shershen += 6 + n;
    st.strizh += 3 + n; st.sova += 3; st.vual += 1; st.grach += 3 + (n > 2 ? 2 : 0);
    st.krechet += 4; st.albatros += 6; st.molot += 3 + (n > 2 ? 1 : 0); st.garpia += 1;
    for (const id in E.know) { const k = E.know[id]; k.conf *= .8; k.shots = [] }
    for (const key in E.heat) E.heat[key] *= .6;
  }
  E.groups = []; E.queue = []; E.zuse = {}; E.wi = {}; E.bda = {}; E.reserve = null;
  /* пусковая логистика игрока: израсходованный ночной лимит и занятость площадок */
  E.used = {}; E.zbook = {}; E.feints = []; E.feintUsed = {};
}
