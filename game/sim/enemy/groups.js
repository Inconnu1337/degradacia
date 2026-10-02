'use strict';
/* ============================================================
   ПАКЕТЫ: формирование групп, разведсводки, пуск из очереди
   ============================================================ */

/* ---------- формирование групп ---------- */
function eGroup(kind, n, zone, tgt, o) {
  o = o || {};
  const T = TT[kind];
  n = Math.min(Math.round(n), E.stock[kind] || 0);
  if (n <= 0 || !zone) return null;
  E.stock[kind] -= n;
  const aim = tgt.obj ? { x: tgt.obj.x, y: tgt.obj.y } : { x: tgt.aim.x, y: tgt.aim.y };
  const start = zPoint(zone);
  const ball = T.cls === 'ballistic' || T.cls === 'aeroball';
  const path = ball ? [aim] : eRoute(start, aim, T.cls, o.style);
  const ft = polyLen(start, path) / T.sp;
  let launch = o.arrive != null ? o.arrive - ft : o.launch;
  launch = Math.max(G.t + (o.asap ? 25 : 240), launch);
  const g = {
    id: E.gid++, kind, n, zone, tgt, launch, arrive: launch + ft, path, start,
    launched: 0, lost: 0, hit: 0, op: o.op, wave: o.wave, high: !!o.high
  };
  E.groups.push(g);
  const spc = o.spacing != null ? o.spacing
    : (T.cls === 'drone' || T.cls === 'decoy' || T.cls === 'loiter') ? R(40, 110)
      : T.cls === 'cruise' ? R(15, 40) : (T.cls === 'recon' || T.cls === 'ewuav') ? 0 : R(8, 20);
  for (let i = 0; i < n; i++) {
    const ap = ball ? [{ x: aim.x + R(-.15, .15), y: aim.y + R(-.15, .15) }]
    : o.exact ? path.map(pt => ({ x: pt.x, y: pt.y })) : jitter(path);
    E.queue.push({ t: launch + i * spc + R(0, spc * .4), k: kind, gid: g.id, x: start.x + R(-3, 3), y: start.y + R(-3, 3), path: ap, tgt, high: !!o.high });
  }
  E.queue.sort((a, b) => a.t - b.t);
  intelFor(g);
  return g;
}

const approx = n => n <= 3 ? String(n) : Math.max(1, Math.round(n * .75)) + '–' + (Math.round(n * 1.3) + 1);

/* ---------- как это выглядит для нашей разведки ---------- */
function intelFor(g) {
  const z = g.zone, k = g.kind;
  const fl = Math.max(1, Math.round((g.arrive - g.launch) / 60));
  if (k === 'jalo' || k === 'moth' || k === 'strizh' || k === 'shershen') {
    const key = (g.wave || g.id) + '|' + z.id;
    const w = E.wi[key] || (E.wi[key] = { t: g.launch, n: 0, z, jet: 0, loi: 0 });
    w.t = Math.min(w.t, g.launch); w.n += g.n;
    if (k === 'strizh') w.jet += g.n;
    if (k === 'shershen') w.loi += g.n;
  }
  else if (k === 'grach') {
    intelAt(g.launch + R(120, 600), `Пуски БпЛА из района ${z.n}; по характеру сигналов возможны противорадиолокационные аппараты.`, 'C-2', 'w', .7);
  }
  else if (k === 'vual') {
    intelAt(g.launch + R(60, 400), `В воздух поднят крупный БпЛА, район ${z.n}. Похож на постановщик помех.`, 'B-2', 'w', .8);
  }
  else if (k === 'sova') {
    intelAt(g.launch + R(300, 900), `Отмечен выход разведывательного БпЛА, район ${z.n}.`, 'C-3', '', .5);
  }
  else if (k === 'krechet') {
    intelAt(g.launch - R(3, 6) * 3600, `В море вышли носители крылатых ракет (${z.n}). Суммарный залп — до ${g.n + RI(0, 4)} ед.`, 'B-2', '', .9);
    intelAt(g.launch + R(30, 120), `Пуски КР «Кречет-М» из акватории (${z.n}), ориентировочно ${approx(g.n)}.`, 'A-2', 'w', .92);
  }
  else if (k === 'albatros') {
    intelAt(g.launch - R(3, 4) * 3600, `Взлёт ${Math.ceil(g.n / 6) + RI(0, 2)} бортов стратегической авиации, ${AIRBASE_E}.`, 'A-1', '', .95);
    intelAt(g.launch - R(40, 70) * 60, 'Борта стратегической авиации выходят к рубежу пусков.', 'B-2', '', .8);
    intelAt(g.launch + R(60, 200), `Зафиксированы пуски КР «Альбатрос» с рубежа «Восход»: ~${approx(g.n)}.`, 'A-1', 'w', .95);
  }
  else if (k === 'molot') {
    intelAt(g.launch - R(15, 45) * 60, `Радиоперехват: активность расчётов ОТРК, район ${z.n}.`, 'C-3', '', .45);
    intelAt(g.launch + R(3, 10), `ПУСК БАЛЛИСТИКИ, район ${z.n}! Ракет: ${g.n}. Подлёт ≈ ${fl} мин.`, 'A-1', 'crit', .97);
  }
  else if (k === 'garpia') {
    intelAt(g.launch - R(15, 30) * 60, 'Взлёт носителей аэробаллистических ракет «Гарпия».', 'A-2', 'w', .85);
    intelAt(g.launch + R(3, 8), `ПУСК «ГАРПИИ»! Подлёт ≈ ${fl} мин.`, 'A-1', 'crit', .95);
  }
}

function flushWaveIntel() {
  for (const key in E.wi) {
    const w = E.wi[key];
    const extra = [w.jet ? 'в том числе реактивные' : '', w.loi ? 'возможны барражирующие' : ''].filter(Boolean).join(', ');
    intelAt(w.t + R(120, 600),
      `Мониторинг: пуски ударных БпЛА из района ${w.z.n}, ориентировочно ${approx(w.n)}${extra ? ', ' + extra : ''}.`,
      'B-2', 'w', .85);
  }
  E.wi = {};
}

function eLaunch() {
  while (E.queue.length && E.queue[0].t <= G.t) {
    const q = E.queue.shift();
    if (q.t > NIGHT_LEN - 600) {
      if (MODE.returnUnlaunched) E.stock[q.k] = (E.stock[q.k] || 0) + 1;
      continue;
    }
    spawnThreat(q);
    MODE.onLaunch(q);
  }
}
