'use strict';
/* ============================================================
   КОМАНДЫ СТОРОН (сервер)
   Всё, что клиент вправе изменить в игре. Каждая команда сама
   проверяет аргументы: клиенту не доверяем ни типы, ни числа.
   Ответ: { ok: true, … } или { ok: false, error }.
   Всплывашки, вызванные внутри, уходят той стороне, что приказала.
   ============================================================ */

const ok = extra => Object.assign({ ok: true }, extra);
const fail = error => ({ ok: false, error });

const ROE_V = ['free', 'eco', 'hold'];
const RADAR_V = ['on', 'cue', 'off'];

/* ---------- штаб ПВО ---------- */
const DEFENSE_COMMANDS = {
  /** ответ на запрос расчёта */
  ans({ id, i }) {
    return MODE.answerReq(+id, +i) ? ok() : fail('запрос уже снят');
  },

  /** закупка (или поставка партнёров) и размещение в точке */
  place({ k, x, y, gift }) {
    if (!UT[k]) return fail('неизвестное средство');
    if (!gift && !SHOP_ORDER.includes(k)) return fail('это средство не продаётся');
    const p = netPoint({ x, y });
    if (!p) return fail('неверная точка');
    const u = placeUnit(k, p, !!gift);
    return u ? ok({ uid: u.id }) : fail('не размещено');
  },

  repair({ id }) { return repairObj(String(id)) ? ok() : fail('ремонт недоступен') },

  sell({ id }) {
    const u = unitById(+id);
    if (!u) return fail('нет такого расчёта');
    return sellUnit(u) ? ok() : fail('расформировать нельзя');
  },

  /** приказ расчёту: o = { t, p?, obj?, th?, v? } */
  order({ id, o }) {
    const u = unitById(+id);
    if (!u || u.hp <= 0) return fail('нет такого расчёта');
    if (G.phase !== 'prep' && G.phase !== 'night') return fail('не время для приказов');
    if (!o || typeof o.t !== 'string') return fail('пустой приказ');
    const T = UT[u.k];
    switch (o.t) {
      case 'move': case 'patrol': {
        const p = netPoint(o.p);
        if (!p) return fail('неверная точка');
        if (o.t === 'patrol' && !T.air) return fail('патрулируют только вертолёты');
        order(u, { t: o.t, p });
        return ok();
      }
      case 'cover': {
        const obj = objById(String(o.obj));
        if (!obj || !T.w) return fail('прикрыть нельзя');
        order(u, { t: 'cover', obj });
        return ok();
      }
      case 'assign': {
        const th = thrById(+o.th);
        if (!th || th.dead || G.t - th.seen > 200 || !T.w) return fail('цели нет');
        order(u, { t: 'assign', th });
        return ok();
      }
      case 'rtb':
        if (!T.air) return fail('не авиация');
        order(u, { t: 'rtb' });
        return ok();
      case 'reload':
        if (!T.w) return fail('нечего пополнять');
        order(u, { t: 'reload' });
        return ok();
      case 'cancel':
        order(u, { t: 'cancel' });
        return ok();
      case 'roe':
        if (!T.w || !ROE_V.includes(o.v)) return fail('неверный режим огня');
        order(u, { t: 'roe', v: o.v });
        return ok();
      case 'radar':
        if (!(T.radar || T.fake) || !RADAR_V.includes(o.v)) return fail('неверный режим излучения');
        order(u, { t: 'radar', v: o.v });
        return ok();
    }
    return fail('неизвестный приказ');
  },

  alarm() {
    if (!MODE.playerAlarm) return fail('тревогу объявляет не игрок');
    toggleAlarm();
    return ok();
  }
};

/* ---------- сторона налёта ---------- */
const ATTACK_COMMANDS = {
  launch({ plan }) { return launchStrike(plan) },
  cancelg({ id }) { return cancelGroup(+id) }
};
