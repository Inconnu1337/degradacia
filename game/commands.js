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

  /** ремонт объекта: днём сразу, ночью — аварийная бригада под огнём */
  repair({ id }) {
    const o = objById(String(id));
    if (!o) return fail('нет объекта');
    if (G.phase === 'night') return nightRepair(o);
    return repairObj(o.id) ? ok() : fail('ремонт недоступен');
  },
  extinguish({ id }) { const o = objById(String(id)); return o ? sendFirefighters(o) : fail('нет объекта') },
  fixu({ id }) { const u = unitById(+id); return u ? repairUnit(u) : fail('нет расчёта') },

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
      case 'move': {
        const p = netPoint(o.p);
        if (!p) return fail('неверная точка');
        order(u, { t: 'move', p });
        return ok();
      }
      case 'patrol': {
        /* сектор: точка, объект (obj) или наш расчёт (uid) — центр следует за ним */
        if (!T.air) return fail('патрулируют только вертолёты');
        const obj = o.obj != null ? objById(String(o.obj)) : null;
        const v = o.uid != null ? unitById(+o.uid) : null;
        /* или маршрут из 2–4 зон: вертолёт облетает их по кругу и бьёт всё, что в зонах */
        const pts = Array.isArray(o.pts) ? o.pts.slice(0, PATROL_MAX).map(netPoint).filter(Boolean) : [];
        if (pts.length >= 2) {
          order(u, { t: 'patrol', p: pts[0], pts });
          return ok();
        }
        const p = obj ? { x: obj.x, y: obj.y } : v ? { x: v.x, y: v.y } : pts[0] || netPoint(o.p);
        if (!p) return fail('неверная точка');
        order(u, { t: 'patrol', p, obj: obj ? obj.id : null, uid: v && v !== u ? v.id : null });
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

  /** выбрать одно из дневных предложений партнёров */
  offer({ i }) { return DefensePrep.takeOffer(+i) },

  alarm() {
    if (!MODE.playerAlarm) return fail('тревогу объявляет не игрок');
    toggleAlarm();
    return ok();
  }
};

/* ---------- сторона налёта ---------- */
const ATTACK_COMMANDS = {
  launch({ plan }) { return launchStrike(plan) },
  cancelg({ id }) { return cancelGroup(+id) },
  retarget({ id, tgt }) { return retargetGroup(+id, tgt) },
  feint({ kind, zid, delay }) { return launchFeint({ kind, zid, delay }) }
};
