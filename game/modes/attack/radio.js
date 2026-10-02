'use strict';
/* ============================================================
   НАЛЁТ: радиообмен
   Игрок не слушает эфир обороны: расчёты бота отвечают сами, «мысли» пишутся в журнал.
   ============================================================ */

const AttackRadio = (() => {
  function say() {}

  function intelAt() {}

  function mind(txt) {
    if (S) S.mind.push({ t: G.t, txt });
    hq(txt, 'g');
  }

  function ask(u, text, opts, def, key) {
    if (G.reqs.some(r => r.u === u && r.key === key)) return;
    G.reqs.push({ id: G.idc++, u, text, opts, def, key, t: G.t });
  }

  function answerReq(id, i) {
    const k = G.reqs.findIndex(r => r.id === id);
    if (k < 0) return;
    const r = G.reqs.splice(k, 1)[0];
    const op = r.opts[Math.max(0, Math.min(i, r.opts.length - 1))];
    if (op) reply(r.u, op.f, op.l);
  }

  return {
    say,
    intelAt,
    mind,
    ask,
    answerReq
  };
})();
