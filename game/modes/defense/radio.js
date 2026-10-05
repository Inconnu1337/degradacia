'use strict';
/* ============================================================
   ОБОРОНА: радиоэфир
   Живой эфир: доклады расчётов, запросы к штабу, разведсводки.
   ============================================================ */

const DefenseRadio = (() => {
  function say(u, txt, cls) {
    logLine('radio',
      `<span class="tm">${clock(G.t)}</span><span class="who" data-a="selu" data-id="${u.id}">«${esc(u.crew.cs)}»</span> ${txt}`, cls);
  }

  function mind(txt) {
    if (S) S.mind.push({ t: G.t, txt });
    logLine('mind', `<span class="tm">${clock(G.t)}</span>${esc(txt)}`, '');
  }

  function intelAt(t, txt, gr, cls, ch) {
    if (ch !== undefined && Math.random() > ch) return;
    if (cls === 'crit') (G.missileWarn = G.missileWarn || []).push(t);
    G.intelQ.push({ t, txt, gr, cls });
    G.intelQ.sort((a, b) => a.t - b.t);
  }

  /* ---------- запросы расчётов в штаб ---------- */
  function ask(u, text, opts, def, key) {
    if (G.reqs.some(r => r.u === u && r.key === key)) return;
    const r = { id: G.idc++, u, text, opts, def, key, t: G.t };
    G.reqs.push(r);
    say(u, text, 'q');
    if (G.phase === 'night' && autoPace() && G.speed > 5) setSpeed(5, 'req');
  }

  function answerReq(id, i) {
    const k = G.reqs.findIndex(r => r.id === id);
    if (k < 0) return false;
    const r = G.reqs[k], op = r.opts[i];
    if (!op) return false;
    G.reqs.splice(k, 1);
    hq(`→ «${esc(r.u.crew.cs)}»: ${esc(op.l)}`, 'hq');
    reply(r.u, op.f, op.l);
    return true;
  }

  return {
    say,
    mind,
    intelAt,
    ask,
    answerReq
  };
})();
