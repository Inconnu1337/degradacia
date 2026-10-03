'use strict';
/* ============================================================
   ОБОРОНА: противник — самостоятельный командующий
   Ведёт свою картину нашего ПВО (неточную), считает цену маршрутов, ставит задачи ночи,
   следит за результатом и меняет план по ходу. Между ночами адаптируется.
   ============================================================ */

const DefenseAI = (() => {
  /* ---------- выбор целей ---------- */
  function eTargets(ex) {
    const f = E.focus;
    return G.objs.filter(o => o.hp > 15 && o !== ex).map(o => {
      const def = eCover(o.x, o.y, 'cruise') + eCover(o.x, o.y, 'drone') * .5;
      const m = (f === 'energy' && OT[o.type].en) ? 1.6
        : (f === 'logistics' && ['rail', 'port', 'oil'].includes(o.type)) ? 1.5
          : (f === 'military' && ['air', 'plant'].includes(o.type)) ? 1.5 : 1;
      const val = o.v * Math.pow(o.hp / 100, .5) * m;
      return { o, def, val, score: val / (1 + def * .6) };
    }).sort((a, b) => b.score - a.score);
  }

  function addRecon(t, objs, kind) {
    kind = kind || 'sova';
    const z = eZone(kind, objs[0] || { x: 250, y: 150 });
    if (!z || (E.stock[kind] || 0) <= 0) return;
    E.stock[kind]--;
    const st = zPoint(z);
    const path = objs.map(o => ({ x: o.x + R(-8, 8), y: o.y + R(-8, 8) }));
    path.push({ x: st.x, y: st.y });
    const g = {
      id: E.gid++, kind, n: 1, zone: z, tgt: {}, launch: t,
      arrive: t + polyLen(st, path) / TT[kind].sp, path, start: st, launched: 0, lost: 0, hit: 0,
      op: kind === 'sova' ? 'разведка' : 'помехи'
    };
    E.groups.push(g);
    E.queue.push({ t, k: kind, gid: g.id, x: st.x, y: st.y, path, tgt: {} });
    E.queue.sort((a, b) => a.t - b.t);
    intelFor(g);
  }

  function spread(kind, n, targets, o) {
    o = o || {};
    targets = targets.filter(Boolean);
    n = Math.min(n, E.stock[kind] || 0);
    if (n <= 0 || !targets.length) return;
    const per = Math.ceil(n / targets.length);
    let left = n;
    for (const tg of targets) {
      let m = Math.min(per, left);
      while (m > 0) {
        const c = Math.min(m, 12);
        const z = eZone(kind, tg);
        eGroup(kind, c, z, { obj: tg }, {
          ...o,
          arrive: o.arrive != null ? o.arrive + R(-240, 240) : undefined,
          launch: o.launch != null ? o.launch + R(0, 600) : undefined
        });
        m -= c; left -= c;
      }
      if (left <= 0) break;
    }
  }

  function knownSAM(minConf) {
    return Object.values(E.know)
      .filter(k => ['bastion', 'shield', 'krom'].includes(k.type) && k.conf >= minConf)
      .sort((a, b) => UT[b.type].cost * b.conf - UT[a.type].cost * a.conf);
  }

  /* ---------- перенацеливание ---------- */
  function regroupTo(g, tg) {
    g.tgt = tg;
    const T = TT[g.kind];
    const aim = tg.obj ? { x: tg.obj.x, y: tg.obj.y } : { x: tg.aim.x, y: tg.aim.y };
    const ball = T.cls === 'ballistic' || T.cls === 'aeroball';
    g.path = ball ? [aim] : eRoute(g.start, aim, T.cls);
    for (const q of E.queue) if (q.gid === g.id) {
      q.tgt = tg;
      q.path = ball ? [{ x: aim.x, y: aim.y }] : jitter(g.path);
    }
  }

  /* ---------- план на ночь ---------- */
  function planNight() {
    const n = G.night, st = E.stock, t0 = G.t;
    E.jamWin = null;
    const heavy = st.albatros + st.krechet;
    const S0 = eTargets();
    if (!S0.length) return;
    /* иногда — ложная активность: поднять носители для вида, чтобы ПВО нервничала и светила радарами */
    if (n > 1 && chance(.3)) {
      const kind = pick(['albatros', 'krechet', 'molot']);
      const z = zonesFor(kind)[0], t = R(2, 8) * 3600;
      carrierIntel(kind, z, t, kind === 'molot' ? RI(2, 4) : RI(10, 20), t + 3600, true);
      mind(`Для вида подниму ${kind === 'albatros' ? '«Кондоры»' : kind === 'krechet' ? 'корабли' : 'пусковые ОТРК'} около ${clock(t)} — пусть их ПВО включит радары и пожжёт нервы.`);
    }
    const deplet = E.lastSamShots || 0;
    const kn = knownSAM(.3), knHot = knownSAM(.6);

    let posture;
    if (n === 1) posture = 'probe';
    else if (knHot.length >= 2 && st.molot >= 4 && n >= 3 && chance(.45)) posture = 'sead';
    else if ((heavy >= 20 && n - E.lastMassive >= 2) || (n === 5 && heavy >= 10) || (deplet >= 10 && heavy >= 14)) posture = 'massive';
    else posture = 'harass';

    E.focus = n === 1 ? 'energy'
      : energy() < 45 && chance(.5) ? 'logistics'
        : chance(.7) ? 'energy' : 'military';
    E.posture = posture;
    const wx = G.weather, eoBad = wx.eo < .8;
    const fN = { energy: 'энергетика', logistics: 'логистика и топливо', military: 'военная промышленность и аэродромы' }[E.focus];

    /* если штаб постоянно объявляет тревогу заранее — выгодно врать */
    const feintBias = clamp(E.obs.alarmEarly / Math.max(1, E.obs.nights), 0, 1);

    if (posture === 'probe') {
      mind(`Первая ночь в этом крае. Про ПВО знаю мало: только архивные позиции ${kn.length} комплексов, им неделя. Задача ночи — разведка боем: малые группы с разных направлений, смотрю, откуда стреляют. Ракеты берегу.`);
      addRecon(t0 + R(1800, 3000), S0.slice(0, 2).map(x => x.o));
      addRecon(t0 + R(3600, 6000), S0.slice(2, 4).map(x => x.o));
      const tg = S0.slice(0, 5).map(x => x.o), sty = ['direct', '', '', ''];
      [R(1.2, 2), R(2.6, 4), R(4.5, 6)].forEach((h, i) => {
        const o = tg[i % tg.length], z = eZone('jalo', o);
        eGroup('jalo', RI(6, 10), z, { obj: o }, { launch: t0 + h * 3600, wave: 'p' + i, style: sty[i] });
        eGroup('moth', RI(2, 4), z, { obj: tg[(i + 1) % tg.length] }, { launch: t0 + h * 3600 + R(0, 600), wave: 'p' + i });
      });
      const weak = S0.slice().sort((a, b) => eCover(a.o.x, a.o.y, 'ballistic') - eCover(b.o.x, b.o.y, 'ballistic'))[0].o;
      eGroup('molot', 2, eZone('molot', weak), { obj: weak }, { launch: t0 + R(6, 7.5) * 3600, op: 'проверка' });
      const port = G.objs.find(o => o.type === 'port');
      spread('krechet', 4, [port, S0[0].o], { arrive: t0 + R(8, 9) * 3600 });
      E.jamBase = .05;
    }

    else if (posture === 'sead') {
      const tgts = knHot.slice(0, 3);
      mind(`Знаю позиции ${tgts.length} комплексов ПВО с высокой уверенностью. Эта ночь — не про объекты, а про то, чтобы выбить саму оборону: баллистика и антирадарные БпЛА по пусковым и радарам, а дроны по объектам, чтобы заставить их включить РЛС и стрелять.`);
      addRecon(t0 + R(1200, 2400), tgts.map(k => ({ x: k.x, y: k.y })));
      addRecon(t0 + R(2400, 4200), S0.slice(0, 2).map(x => x.o), 'vual');
      /* приманка: дроны по объектам, чтобы радары заработали */
      const bait = S0.slice(0, 3).map(x => x.o);
      spread('jalo', Math.min(st.jalo, 34), bait, { launch: t0 + R(1.5, 3) * 3600, wave: 'bait' });
      spread('moth', Math.min(st.moth, 14), bait, { launch: t0 + R(1.5, 3) * 3600, wave: 'bait' });
      /* и по вскрытым позициям — баллистика и «Грачи» */
      let hh = R(3.2, 4.2);
      for (const k of tgts) {
        const nm = Math.min(st.molot, k.type === 'bastion' ? 3 : 2);
        if (nm > 0) eGroup('molot', nm, eZone('molot', k), { aim: { x: k.x, y: k.y, uid: k.uid } }, { launch: t0 + hh * 3600, op: 'SEAD' });
        const ng = Math.min(st.grach, 3);
        if (ng > 0) eGroup('grach', ng, eZone('grach', k), { aim: { x: k.x, y: k.y, uid: k.uid } }, { launch: t0 + (hh + R(.2, .8)) * 3600, op: 'SEAD' });
        hh += R(.8, 1.6);
      }
      spread('shershen', Math.min(st.shershen, 10), S0.slice(0, 3).map(x => x.o), { launch: t0 + R(4, 7) * 3600, wave: 'hunt' });
      if (st.garpia > 0) {
        const bs = knHot.find(k => k.type === 'bastion');
        if (bs) eGroup('garpia', Math.min(2, st.garpia), eZone('garpia', bs), { aim: { x: bs.x, y: bs.y, uid: bs.uid } }, { launch: t0 + R(5, 7) * 3600, op: 'SEAD' });
      }
      E.reserve = { kind: 'albatros', n: Math.min(st.albatros, 10), why: 'удар по объектам, если оборону удастся продавить' };
      mind(`Оставляю в резерве ${E.reserve.n} «Альбатросов»: если к середине ночи ПВО просядет — выпущу их по «${S0[0].o.n}».`);
      E.jamBase = .1;
    }

    else if (posture === 'massive') {
      E.lastMassive = n;
      const T0 = t0 + R(8.2, 9.4) * 3600;
      E.T0 = T0;
      const prim = S0.slice(0, 4).map(x => x.o);
      const strong = S0.slice().sort((a, b) => b.def - a.def).slice(0, 2).map(x => x.o);
      mind(`Накоплено ${heavy} крылатых ракет — готов массированный удар. Главное направление: ${fN}. Цели: ${prim.map(o => '«' + o.n + '»').join(', ')}. Сначала волна имитаторов на сильные зоны ПВО (${strong.map(o => '«' + o.n + '»').join(', ')}), чтобы сожгли ракеты. Затем дроны, и в ~${clock(T0)} — одновременный подход ракет с разных сторон.`);
      addRecon(t0 + R(1800, 4200), prim.slice(0, 2));
      addRecon(t0 + R(3600, 7200), strong);
      if (st.vual > 0) addRecon(T0 - R(60, 110) * 60, prim.slice(0, 2), 'vual');

      const dTot = Math.min(st.jalo, 55 + n * 12) * (eoBad ? 1.15 : 1);
      const mTot = Math.min(st.moth, Math.round(dTot * E.adapt.decoy * 1.4));
      spread('moth', Math.round(mTot * .7), strong, { arrive: T0 - R(100, 130) * 60, wave: 'w1' });
      spread('jalo', Math.round(dTot * .15), strong, { arrive: T0 - R(100, 130) * 60, wave: 'w1' });
      spread('jalo', Math.round(dTot * .5), prim, { arrive: T0 - R(30, 50) * 60, wave: 'w2' });
      spread('moth', Math.round(mTot * .3), prim, { arrive: T0 - R(30, 50) * 60, wave: 'w2' });
      spread('jalo', Math.round(dTot * .35), prim.slice(0, 2), { arrive: T0 + R(10, 30) * 60, wave: 'w3' });
      spread('shershen', Math.min(st.shershen, 8), prim.slice(0, 2), { arrive: T0 - R(10, 40) * 60, wave: 'w2' });
      spread('strizh', Math.max(0, st.strizh - 2), prim.slice(0, 2), { arrive: T0 - 300 });
      spread('krechet', st.krechet, prim, { arrive: T0 });
      spread('albatros', Math.round(st.albatros * .8), prim, { arrive: T0 + R(-300, 600) });

      const sam = knownSAM(.3)[0];
      if (sam && st.molot > 0) {
        const nm = Math.min(st.molot, sam.type === 'bastion' ? 3 : 2);
        const nc = nearCity(sam);
        mind(`Перед подходом ракет подавлю ${UT[sam.type].n}${nc ? ' у ' + nc.gen : ''} (данные: ${sam.src}, уверенность ${pc(sam.conf)}): ${nm} «Молота» за восемь минут до основного удара.`);
        eGroup('molot', nm, eZone('molot', sam), { aim: { x: sam.x, y: sam.y, uid: sam.uid } }, { arrive: T0 - 480, op: 'SEAD' });
        if (st.grach >= 2) eGroup('grach', Math.min(3, st.grach), eZone('grach', sam), { aim: { x: sam.x, y: sam.y, uid: sam.uid } }, { arrive: T0 - 900, op: 'SEAD' });
      }
      spread('molot', Math.max(0, st.molot - 1), [prim[0]], { arrive: T0 });
      const bs = knownSAM(.3).find(k => k.type === 'bastion');
      if (st.garpia > 0) {
        eGroup('garpia', Math.min(2, st.garpia), eZone('garpia', bs || prim[0]),
          bs ? { aim: { x: bs.x, y: bs.y, uid: bs.uid } } : { obj: prim[0] }, { arrive: T0 + 120, op: 'удар' });
      }
      E.jamWin = [T0 - 2.5 * 3600, T0 + 3600];
      E.jamBase = .08;
      intelAt(Math.max(t0 + 600, T0 - R(6, 7) * 3600), 'Шифрованный радиообмен в оперативных сетях противника значительно выше нормы.', 'C-2', '', .8);
    }

    else {   /* harass — изматывание */
      const nW = RI(2, 4), tg = S0.slice(0, 6).map(x => x.o);
      mind(`Крылатых ракет ${heavy}, для массированного удара рано: коплю. Эту ночь изматываю: ${nW} волны дронов в разное время по ${fN}, плюс ложные взлёты, чтобы ПВО всю ночь держала РЛС включёнными и выдавала себя.${eoBad ? ' Погода плохая, мобильные группы плохо видят — пускаю больше дронов.' : ''}`);
      addRecon(t0 + R(1800, 5400), tg.slice(0, 3));
      for (let i = 0; i < nW; i++) {
        const o = tg[RI(0, tg.length - 1)], o2 = tg[RI(0, tg.length - 1)], h = R(1, 7.5);
        eGroup('jalo', RI(8, 15) * (eoBad ? 1.3 : 1), eZone('jalo', o), { obj: o }, { launch: t0 + h * 3600, wave: 'h' + i });
        eGroup('moth', RI(3, 7), eZone('moth', o2), { obj: o2 }, { launch: t0 + h * 3600 + R(0, 900), wave: 'h' + i });
      }
      if (chance(.5 + E.adapt.loiter)) spread('shershen', RI(3, 7), [tg[0], tg[1]], { launch: t0 + R(2, 7) * 3600, wave: 'hunt' });
      if (chance(.5 + E.adapt.jet)) spread('strizh', RI(2, 4), [tg[0]], { launch: t0 + R(3, 8) * 3600 });
      if (chance(.45 + E.adapt.arm)) {
        const sam = knownSAM(.35)[0];
        const aim = sam ? { aim: { x: sam.x, y: sam.y, uid: sam.uid } } : { obj: tg[0] };
        eGroup('grach', RI(2, 3), eZone('grach', sam || tg[0]), aim, { launch: t0 + R(2, 7) * 3600, op: 'охота на РЛС' });
      }
      const sam = knownSAM(.5)[0];
      if (sam && st.molot > 0) {
        const nc = nearCity(sam);
        mind(`${UT[sam.type].n}${nc ? ' у ' + nc.gen : ''} известен (${pc(sam.conf)}). Если не сменит позицию — ночью ударю по нему баллистикой.`);
        eGroup('molot', 2, eZone('molot', sam), { aim: { x: sam.x, y: sam.y, uid: sam.uid } }, { launch: t0 + R(2, 8) * 3600, op: 'SEAD' });
      } else if (chance(.5)) {
        eGroup('molot', RI(1, 2), eZone('molot', tg[1]), { obj: tg[1] }, { launch: t0 + R(2, 9) * 3600 });
      }
      if (chance(.35)) spread('krechet', RI(3, 5), [tg[0], tg[2]], { arrive: t0 + R(4, 9) * 3600 });

      /* ложные взлёты — тем чаще, чем охотнее штаб объявляет тревогу */
      const feints = chance(.6 + feintBias * .35) ? (feintBias > .5 ? RI(1, 2) : 1) : 0;
      for (let i = 0; i < feints; i++) {
        const tt = t0 + R(1, 6) * 3600;
        mind('Провожу ложный взлёт стратегической авиации: пусть ПВО ждёт ракет, держит РЛС включёнными, а край сидит в укрытиях.');
        intelAt(tt, `Взлёт ${RI(4, 8)} бортов стратегической авиации, ${AIRBASE_E}.`, 'A-1', '', .95);
        intelAt(tt + R(1.5, 2.5) * 3600, 'Борта стратегической авиации барражируют у рубежа пусков.', 'B-2', '', .8);
        intelAt(tt + R(3.5, 4.5) * 3600, 'Борта стратегической авиации возвращаются на аэродромы. Пусков не зафиксировано.', 'A-2', '', .9);
      }
      if (chance(.4)) intelAt(t0 + R(600, 3600), 'Шифрованный радиообмен в оперативных сетях противника выше нормы.', 'C-3', '', .9);
      E.reserve = st.jalo > 30 ? { kind: 'jalo', n: Math.min(st.jalo, 20), why: 'добить объект, где обнаружится дыра в обороне' } : null;
      E.jamBase = .12;
    }

    flushWaveIntel();
    /* сообщения от населения в течение ночи */
    for (let h = 1; h < 11; h += R(.8, 1.8)) G.intelQ.push({ t: t0 + h * 3600, txt: '', gr: '', cls: 'civ' });
    G.intelQ.sort((a, b) => a.t - b.t);
    E.nextThink = t0 + R(1500, 2400);

    const fc = posture === 'massive'
      ? (chance(.8) ? 'высокая вероятность комбинированного удара ракетами и дронами во второй половине ночи' : 'умеренная активность, возможны пуски дронов')
      : posture === 'sead' ? 'вероятны удары по позициям средств ПВО; ожидается работа противорадиолокационных БпЛА'
        : posture === 'harass' ? (chance(.7) ? 'ожидаются атаки ударных БпЛА, вероятны отдельные пуски ракет' : 'возможна подготовка к массированному удару')
          : 'первая ночь: ожидаются пробные атаки БпЛА';
    intelAt(-1, `Прогноз разведки на ночь: ${fc}.`, 'B-3', '', 1);
  }

  /* ---------- переоценка обстановки по ходу ночи ---------- */
  function eReplan() {
    E.nextThink = G.t + R(1500, 2400);
    const t = G.t;
    if (t > NIGHT_LEN - 1200) return;

    /* объективный контроль: что уже разрушено — не добиваем */
    for (const o of G.objs) {
      if (o.hp < 20 && !E.bda[o.id] && t - o.hitT > 900) {
        E.bda[o.id] = 1;
        const nx = eTargets(o)[0];
        mind(`Объективный контроль: «${o.n}» выведен из строя (${Math.round(o.hp)}%). Средства по нему перенацеливаю${nx ? ' на «' + nx.o.n + '»' : ''}.`);
        if (nx) for (const g of E.groups) if (g.tgt.obj === o && g.launched === 0) regroupTo(g, { obj: nx.o });
      }
    }
    /* свежие данные о ЗРК — есть окно для удара по нему */
    const fresh = knownSAM(.6).filter(k => t - k.t < 1800);
    if (fresh.length && E.stock.molot > 0 && t - E.lastSEAD > 3000) {
      const k = fresh[0];
      E.lastSEAD = t;
      const nm = Math.min(E.stock.molot, k.type === 'bastion' ? 3 : 2);
      const nc = nearCity(k);
      mind(`${k.src === 'разведчик' ? 'Разведчик' : 'Радиотехническая разведка'} ${Math.max(1, Math.round((t - k.t) / 60))} мин назад засёк ${UT[k.type].n}${nc ? ' у ' + nc.gen : ''} (уверенность ${pc(k.conf)}). Пока не сменил позицию — ${nm} «Молота» по нему.`);
      eGroup('molot', nm, eZone('molot', k), { aim: { x: k.x, y: k.y, uid: k.uid } }, { launch: t + R(300, 720), op: 'SEAD' });
      const o = eTargets()[0];
      if (o && E.stock.jalo > 6) eGroup('jalo', 6, eZone('jalo', o.o), { obj: o.o }, { launch: t + R(600, 1200), wave: 's' + t });
    }
    /* комплекс почти расстрелял боекомплект — окно для быстрых целей */
    for (const k of knownSAM(.4)) {
      const rec = k.shots.filter(s => t - s < 2400).length;
      if (rec >= UT[k.type].w.am * .7 && !k.expl && E.stock.strizh > 0) {
        k.expl = t;
        let o = null, bd = 1e9;
        for (const ob of G.objs) { const d = Math.hypot(ob.x - k.x, ob.y - k.y); if (ob.hp > 15 && d < bd) { bd = d; o = ob } }
        if (o) {
          const nc = nearCity(k);
          mind(`${UT[k.type].n}${nc ? ' у ' + nc.gen : ''} за сорок минут выпустил около ${rec} ракет, почти пустой. Перезарядка займёт полчаса — это окно. «Стрижи» по «${o.n}».`);
          eGroup('strizh', Math.min(4, E.stock.strizh), eZone('strizh', o), { obj: o }, { launch: t + R(120, 400), op: 'окно' });
        }
        break;
      }
    }
    /* оценка результатов групп: где коридор рабочий, где стена */
    for (const g of E.groups) {
      if (g.evald || g.launched < g.n || t < g.arrive + 400 || !g.tgt.obj ||
        !['jalo', 'moth', 'strizh', 'shershen'].includes(g.kind)) continue;
      g.evald = 1;
      const lr = g.lost / g.n;
      if (g.kind !== 'moth' && g.hit > 0 && lr < .35) {
        const nxt = E.groups.find(h => h.launched === 0 && ['jalo', 'strizh', 'shershen'].includes(h.kind) && h.launch > t + 300);
        mind(`Группа по «${g.tgt.obj.n}» прошла, потери ${pc(lr)}, есть попадания. Коридор рабочий.${nxt ? ' Следующую группу пускаю тем же маршрутом.' : ''}`);
        if (nxt) {
          nxt.tgt = g.tgt;
          nxt.path = g.path.map(p => ({ ...p }));
          for (const q of E.queue) if (q.gid === nxt.id) { q.tgt = g.tgt; q.path = jitter(nxt.path) }
        }
        /* резерв — туда же */
        if (E.reserve && E.reserve.kind === 'jalo' && lr < .2) {
          const r = E.reserve; E.reserve = null;
          mind(`«${g.tgt.obj.n}» прикрыт слабо. Ввожу резерв: ${r.n} «Жал» тем же коридором.`);
          eGroup('jalo', r.n, g.zone, g.tgt, { launch: t + R(600, 1500), wave: 'res' });
        }
      }
      else if (lr > .75 && g.n >= 4) {
        mind(`По «${g.tgt.obj.n}» потеряно ${pc(lr)} группы — там плотная оборона. Остальные группы увожу в обход.`);
        for (const h of E.groups) if (h.launched === 0 && h.tgt.obj && TT[h.kind].cls !== 'ballistic') regroupTo(h, h.tgt);
      }
      else if (g.kind === 'moth' && g.lost > 0) {
        mind(`Имитаторы по «${g.tgt.obj.n}»: сбито ${g.lost} из ${g.n}. ${S.decoySam > 0 ? 'Часть ПВО тратит на них дорогие ракеты. Отлично.' : 'Их снимают в основном стрелковым оружием.'}`);
      }
    }
    /* резерв крылатых ракет: вводим, если оборона просела */
    if (E.reserve && E.reserve.kind === 'albatros') {
      const lostSam = S.lost.filter(k => ['shield', 'bastion', 'krom'].includes(k)).length;
      if (lostSam >= 1 || t > NIGHT_LEN * .72) {
        const r = E.reserve; E.reserve = null;
        const tgt = eTargets()[0];
        if (tgt) {
          mind(lostSam
            ? `Выбито ${lostSam} комплексов ПВО. Ввожу резерв: ${r.n} «Альбатросов» по «${tgt.o.n}».`
            : `Оборону продавить не вышло, но ночь кончается. Пускаю резерв (${r.n} «Альбатросов») по «${tgt.o.n}» — хотя бы часть пройдёт.`);
          spread('albatros', r.n, [tgt.o], { launch: t + R(600, 1800) });
        }
      }
    }
    flushWaveIntel();
  }

  /* ---------- выводы после ночи ---------- */
  function eNightEnd() {
    const s = S;
    E.lastSamShots = Object.entries(s.shots).reduce((a, [k, v]) => a + (['shield', 'bastion', 'krom'].includes(k) ? v : 0), 0);
    const gpsL = s.launched.jalo + s.launched.moth + s.launched.shershen;
    const ewR = gpsL ? (s.ew.jalo + s.ew.moth + s.ew.shershen) / gpsL : 0;
    const tot = s.gunK + s.icptK + s.samK;
    E.obs.nights++;

    if (ewR > .12 && E.adapt.ewRes < .7) {
      E.adapt.ewRes += .25;
      mind(`РЭБ противника увела ${pc(ewR)} наших аппаратов. Ставим помехозащищённые приёмники навигации.`);
      if (chance(.75)) E.dayNews.push('Противник ставит на «Жало-М» помехозащищённые приёмники навигации. Эффективность РЭБ снизится.');
    }
    if (tot > 6 && s.gunK / tot > .4 && E.adapt.highAlt < .7) {
      E.adapt.highAlt += .3;
      mind('Много «Жал» сбито пулемётами и пушками на малой высоте. Поднимаем высоту полёта до двух-трёх километров.');
      if (chance(.7)) E.dayNews.push('Разведка: часть «Жал» пойдёт на высоте 2–3 км. Пулемёты там почти бесполезны, зато радары видят их дальше.');
    }
    if (s.decoySam >= 3) {
      E.adapt.decoy = Math.min(.6, E.adapt.decoy + .1);
      mind(`ПВО потратила ${s.decoySam} дорогих ракет на имитаторы. Увеличиваю их долю.`);
      if (chance(.6)) E.dayNews.push('Противник наращивает выпуск имитаторов «Мотылёк». Берегите ракеты «Щита» и «Бастиона».');
    }
    if (tot > 6 && s.icptK / tot > .3) {
      E.adapt.jet = Math.min(.4, E.adapt.jet + .15);
      mind('Дроны-перехватчики эффективны против «Жал». Значит — больше реактивных «Стрижей».');
      if (chance(.6)) E.dayNews.push('Ожидается рост числа реактивных «Стрижей»: перехватчики их почти не догоняют.');
    }
    if (s.armHits > 0) {
      E.adapt.arm = Math.min(.5, E.adapt.arm + .15);
      mind(`Антирадарные БпЛА дали ${s.armHits} попадания по позициям. Наращиваю их применение.`);
      if (chance(.7)) E.dayNews.push('Противник расширяет применение противорадиолокационных БпЛА «Грач-Э». Дисциплина излучения критична.');
    }
    if (E.learn.emptySEAD) {
      E.adapt.loiter = Math.min(.4, E.adapt.loiter + .12);
      mind(`${E.learn.emptySEAD} удар(а) пришлись в пустые позиции: ПВО манёвренна. Нужны барражирующие аппараты, которые сами найдут цель.`);
      if (chance(.6)) E.dayNews.push('Ожидается больше барражирующих «Шершней»: они ищут технику ПВО сами.');
      E.learn.emptySEAD = 0;
    }
    E.learn.ew = 0;
  }

  return {
    planNight,
    think: eReplan,
    nightEnd: eNightEnd
  };
})();
