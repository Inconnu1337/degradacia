'use strict';
/* ============================================================
   ВТОРАЯ СТОРОНА: состояние и суточное восполнение
   E — «голова» стороны, ведущей налёт. В обороне ею управляет DefenseAI,
   в налёте — игрок (E.stock — его арсенал).
   ============================================================ */

/* арсенал на старте: у игрока-налётчика (налёт, дуэль) — богаче, чем у ИИ «Обороны»,
   который сам дозирует удары и под ночные лимиты не подпадает */
const STOCK0 = {
  human: { fpv: 36, ulei: 5, plita: 16, jalo: 100, moth: 45, shershen: 16, strizh: 8, sova: 5, vual: 3, grach: 7, krechet: 14, albatros: 20, molot: 7, garpia: 2 },
  ai: { fpv: 30, ulei: 4, plita: 16, jalo: 70, moth: 30, shershen: 14, strizh: 6, sova: 4, vual: 2, grach: 6, krechet: 10, albatros: 16, molot: 6, garpia: 2 }
};
const humanAtk = () => MODE.humans.includes('atk');

function eInit() {
  E = {
    stock: { ...STOCK0[humanAtk() ? 'human' : 'ai'] },
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
    if (humanAtk()) {
      /* игроку: поставки примерно под ночные лимиты, чтобы было что пускать каждую ночь */
      st.fpv = (st.fpv || 0) + 22 + 2 * n;
      st.ulei = (st.ulei || 0) + 3;
      st.plita = (st.plita || 0) + 8;
      st.jalo += 60 + 6 * n; st.moth += 30 + 4 * n; st.shershen += 10 + n;
      st.strizh += 4 + n; st.sova += 4; st.vual += 2; st.grach += 4 + (n > 2 ? 1 : 0);
      st.krechet += 7; st.albatros += 9; st.molot += 4; st.garpia += n % 2;
    } else {
      st.fpv = (st.fpv || 0) + 14 + 2 * n;
      st.ulei = (st.ulei || 0) + 2 + (n > 2 ? 1 : 0);
      st.plita = (st.plita || 0) + 8;
      st.jalo += 45 + 8 * n; st.moth += 22 + 5 * n; st.shershen += 6 + n;
      st.strizh += 3 + n; st.sova += 3; st.vual += 1; st.grach += 3 + (n > 2 ? 2 : 0);
      st.krechet += 4; st.albatros += 6; st.molot += 3 + (n > 2 ? 1 : 0); st.garpia += 1;
    }
    for (const id in E.know) { const k = E.know[id]; k.conf *= .8; k.shots = [] }
    for (const key in E.heat) E.heat[key] *= .6;
  }
  E.groups = []; E.queue = []; E.zuse = {}; E.wi = {}; E.bda = {}; E.reserve = null;
  /* пусковая логистика игрока: неизрасходованный ночной лимит наполовину переходит
     на следующую ночь (расчёты готовят впрок, но не больше ещё одного лимита) */
  const used = E.used || {}, bonus = E.capBonus || {};
  E.capBonus = {};
  if (!first) for (const g in LAUNCH.nightCap) {
    const left = LAUNCH.nightCap[g] + (bonus[g] || 0) - (used[g] || 0);
    if (left > 1) E.capBonus[g] = Math.min(LAUNCH.nightCap[g], Math.floor(left * .5));
  }
  E.used = {}; E.zbook = {}; E.feints = []; E.feintUsed = {};
}
