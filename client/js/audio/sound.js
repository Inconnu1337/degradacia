'use strict';
/* ============================================================
   ЗВУК (клиент) — всё синтезируется Web Audio, без файлов
   ------------------------------------------------------------
   Слои:
     бой      разрывы, перехваты, очереди, пуски ракет — с учётом
              расстояния: рядом — плотный удар, далеко — глухой раскат
     двигатели постоянные «голоса» того, что летит рядом с центром
              экрана: тарахтение «мопедов», свист реактивных и крылатых,
              рёв ракетного двигателя, вой падающей баллистики, винты
              вертолёта. Громкость и тембр — от расстояния и масштаба,
              высота тона чуть плывёт, когда цель проходит мимо
     эфир     щелчки тангенты, сигналы сводок
     фон      ночь: ветер, дождь, сверчки в тихую погоду, гул города,
              дальние раскаты, редкие собаки, сова, далёкий поезд,
              генераторы, когда энергосистема просела;
              штаб (день и пауза): часы, телефон, машинка, голоса
              за стеной, шипение дежурного приёмника
     музыка   медленный эмбиент на аккордах, ночью темнее,
              при целях на радарах — тихий пульс
   Всё идёт через компрессор, срез верхов и общий ревер — громкие
   звуки не режут уши. Настройки хранятся в localStorage.
   ============================================================ */

const Sound = (() => {
  const DEF = { on: true, master: .6, sfx: .7, eng: .6, radio: .45, amb: .6, music: .35 };
  let cfg = Object.assign({}, DEF);
  try { Object.assign(cfg, JSON.parse(localStorage.getItem('nr.sound') || '{}')) } catch (e) { /* без настроек */ }

  let ac = null, out, comp, verb, bus = {}, noiseBuf = null, brownBuf = null, crushCurve = null, amb = null, mus = null;
  let lastBoom = 0, boomsNow = 0, lastRadio = 0, lastShot = 0, engT = 0;
  const voices = new Map();      /* id цели/ракеты/вертолёта → голос двигателя */
  const MAX_VOICES = 7;

  const save = () => { try { localStorage.setItem('nr.sound', JSON.stringify(cfg)) } catch (e) { /* приватный режим */ } };
  const ready = () => ac && cfg.on && ac.state === 'running';

  /* ---------- запуск: браузер разрешает звук только после жеста игрока ---------- */
  function unlock() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 20; comp.ratio.value = 4; comp.attack.value = .008; comp.release.value = .35;
    const shelf = ac.createBiquadFilter();
    shelf.type = 'highshelf'; shelf.frequency.value = 5500; shelf.gain.value = -7;
    out = ac.createGain(); out.gain.value = cfg.on ? cfg.master : 0;
    comp.connect(shelf); shelf.connect(out); out.connect(ac.destination);
    verb = ac.createConvolver(); verb.buffer = impulse(3.4, 2.6);
    const vg = ac.createGain(); vg.gain.value = .5;
    verb.connect(vg); vg.connect(comp);
    for (const k of ['sfx', 'eng', 'radio', 'amb', 'music']) { const g = ac.createGain(); g.gain.value = cfg[k]; g.connect(comp); bus[k] = g }
    noiseBuf = makeNoise(4);
    brownBuf = makeBrown(4);
    crushCurve = softClip(2.6);
    startAmbient();
    startMusic();
  }

  function makeNoise(sec) {
    const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;               /* розовый шум: мягче белого */
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = .99765 * b0 + w * .099; b1 = .963 * b1 + w * .2965; b2 = .57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * .1848) * .2;
    }
    return b;
  }

  /** бурый шум: почти весь в низах — основа раската и давления взрыва */
  function makeBrown(sec) {
    const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5 }
    return b;
  }

  /** мягкое ограничение: перегруженный, «рваный» низ, как у настоящего близкого разрыва */
  function softClip(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k) }
    return c;
  }

  function impulse(sec, decay) {
    const len = ac.sampleRate * sec, b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) }
    return b;
  }

  /* ---------- примитивы ---------- */
  function noiseSrc(buf) { const s = ac.createBufferSource(); s.buffer = buf || noiseBuf; s.loop = true; return s }

  function filt(type, f, q) { const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q || .7; return x }

  /** одноразовый шум с огибающей и движением фильтра (o.brown — бурый шум) */
  function noise(dest, t, dur, o) {
    const s = noiseSrc(o.brown ? brownBuf : null); s.playbackRate.value = o.rate || 1;
    const f = filt(o.type || 'lowpass', o.f0, o.q);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol, t + (o.att || .005));
    if (o.hold) g.gain.setValueAtTime(o.vol, t + o.att + o.hold);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 3); s.stop(t + dur + .05);
  }

  function tone(dest, t, dur, o) {
    const x = ac.createOscillator(); x.type = o.wave || 'sine';
    x.frequency.setValueAtTime(o.f0, t);
    if (o.f1) x.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol, t + (o.att || .01));
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    x.connect(g); g.connect(dest);
    x.start(t); x.stop(t + dur + .05);
  }

  /**
   * где на карте звучит: удалённость от центра экрана (в долях экрана)
   * и масштаб. Возвращает { near 0..1, pan, far } — near=1 у центра крупным планом
   */
  function spot(p) {
    const q = w2s(p);
    const dx = (q.x - CW / 2) / (CW / 2), dy = (q.y - CH / 2) / (CH / 2);
    const far = Math.hypot(dx, dy);
    const zoom = clamp((G.view.s - 1.4) / 7, 0, 1);       /* крупный план — ближе */
    const near = clamp(1 - far * .45, 0, 1) * (.35 + .65 * zoom);
    return { near, far, pan: clamp(dx * .75, -.85, .85) };
  }

  /** цепочка «точка на карте»: громкость, срез верхов по удалённости, стерео, немного ревера */
  function placed(p, busName, wet) {
    const s = spot(p);
    const g = ac.createGain(), lp = filt('lowpass', 300 + 7000 * s.near * s.near, .5);
    g.connect(lp);
    let tail = lp;
    if (ac.createStereoPanner) { const pn = ac.createStereoPanner(); pn.pan.value = s.pan; lp.connect(pn); tail = pn }
    tail.connect(bus[busName]);
    const w = ac.createGain(); w.gain.value = (wet || .5) * (1.2 - s.near);  /* далёкое — больше «зала» */
    tail.connect(w); w.connect(verb);
    g.gain.value = .25 + .75 * s.near;
    return { g, s };
  }

  /* ---------- бой: разовые события ---------- */
  /**
   * разрыв на земле. Слои, как у настоящего взрыва:
   *   щелчок — ударная волна, резкий широкополосный фронт (только вблизи);
   *   удар    — плотный бурый шум с перегрузом, давит грудь, без «пиу»-тона;
   *   раскат  — несколько отражений от рельефа и застройки с задержками,
   *             каждое глуше предыдущего: «рокочет» и катится;
   *   осыпь   — щелчки обломков и стёкол через полсекунды-секунду.
   * Вдали остаются только приглушённый удар и раскат, с задержкой звука.
   * o.w — мощность боевой части: FPV хлопает, КАБ и баллистика грохочут.
   */
  function boom(o, small) {
    const now = ac.currentTime;
    if (now - lastBoom < .12) { if (++boomsNow > 3) return } else boomsNow = 0;
    lastBoom = now;
    const { g, s } = placed(o, 'sfx', .9);
    const pw = clamp(o.w ? Math.sqrt(o.w / 30) : small ? .5 : 1, .35, 1.4);
    const k = small ? pw * .55 : pw;
    const t = now + (1 - s.near) * .45 + Math.random() * .04;     /* далёкий разрыв доходит позже */
    /* перегруз — общий для удара */
    const sh = ac.createWaveShaper(); sh.curve = crushCurve; sh.oversample = '2x';
    const shG = ac.createGain(); shG.gain.value = .7;
    sh.connect(shG); shG.connect(g);
    if (s.near > .3) {
      /* щелчок фронта */
      noise(g, t, .05, { type: 'highpass', f0: 900, vol: .5 * k, att: .0008 });
      noise(g, t + .004, .16, { type: 'bandpass', f0: 2600, f1: 700, q: .7, vol: .22 * k, att: .001 });
    }
    /* удар: бурый шум через низкочастотный фильтр, быстрый подъём, перегруз */
    noise(sh, t, .7 * k + .35, { brown: 1, f0: 180 + s.near * 260, f1: 55, vol: 1.1 * k, att: .002, hold: .03 });
    noise(sh, t + .01, .35 * k + .2, { f0: 900 * s.near + 200, f1: 120, vol: .35 * k * s.near, att: .002 });
    /* раскат: 3–5 отражений, разнесённых во времени */
    const n = 3 + (Math.random() * 3 | 0);
    let d = .12 + Math.random() * .1;
    for (let i = 0; i < n; i++) {
      const v = (.42 - i * .07) * k * (.6 + Math.random() * .5);
      noise(g, t + d, 1.4 + i * .5 + k, { brown: 1, f0: 140 - i * 15, f1: 35, vol: Math.max(.04, v), att: .06 + i * .03 });
      d += .18 + Math.random() * .45;
    }
    /* длинный хвост — слышен и издалека */
    noise(g, t + .1, 3.5 * k + 1.5, { brown: 1, f0: 90, f1: 30, vol: .3 * k, att: .25 });
    /* осыпь обломков вблизи */
    if (s.near > .45) {
      const m = 4 + (Math.random() * 8 | 0);
      for (let i = 0; i < m; i++) {
        noise(g, t + .45 + Math.random() * 1.6, .03 + Math.random() * .05, { type: 'bandpass', f0: 1200 + Math.random() * 3000, q: 2, vol: .02 + Math.random() * .03 * k, att: .001 });
      }
    }
  }

  /**
   * подрыв зенитной ракеты в воздухе: резкий хлопок осколочной части
   * (выше и суше наземного), короткий удар и эхо по небу без раската земли
   */
  function airBurst(o, small) {
    const { g, s } = placed(o, 'sfx', 1.1);
    const t = ac.currentTime + (1 - s.near) * .3, k = small ? .5 : 1;
    if (s.near > .3) noise(g, t, .04, { type: 'highpass', f0: 1500, vol: .35 * k, att: .0008 });
    noise(g, t, .5 * k + .2, { brown: 1, f0: 420, f1: 90, vol: .5 * k, att: .002 });
    noise(g, t + .005, .25, { type: 'bandpass', f0: 1800, f1: 500, q: .8, vol: .16 * k, att: .001 });
    noise(g, t + .25 + Math.random() * .2, 1.8 * k + .6, { brown: 1, f0: 160, f1: 45, vol: .16 * k, att: .15 });
  }

  function gun(o) {
    const now = ac.currentTime;
    if (now - lastShot < .3) return;
    lastShot = now;
    const { g } = placed(o, 'sfx', .4);
    const n = 5 + (Math.random() * 5 | 0), gap = .065 + Math.random() * .02;
    for (let i = 0; i < n; i++) {
      const t = now + i * gap + Math.random() * .008;
      noise(g, t, .09, { type: 'bandpass', f0: 900 + Math.random() * 500, q: .8, vol: .14, att: .001 });
      tone(g, t, .07, { f0: 160, f1: 70, vol: .1, att: .001 });
    }
  }

  /** старт зенитной ракеты: хлопок вышибного заряда и рёв маршевого двигателя */
  function launch(o) {
    const { g } = placed(o, 'sfx', .7);
    const t = ac.currentTime;
    tone(g, t, .3, { f0: 110, f1: 45, vol: .3, att: .002 });
    noise(g, t, .25, { f0: 3000, f1: 400, vol: .25, att: .002 });
    /* рёв: плотный шум с «треском» — амплитудная модуляция случайным шумом */
    const s = noiseSrc(), lp = filt('lowpass', 1400, .6), crack = ac.createGain(), env = ac.createGain();
    const mod = noiseSrc(), modF = filt('lowpass', 40), modG = ac.createGain();
    modG.gain.value = .5; mod.connect(modF); modF.connect(modG); modG.connect(crack.gain);
    crack.gain.value = .6;
    lp.frequency.setValueAtTime(1600, t + .05); lp.frequency.exponentialRampToValueAtTime(500, t + 3.2);
    env.gain.setValueAtTime(0, t + .05); env.gain.linearRampToValueAtTime(.35, t + .2);
    env.gain.exponentialRampToValueAtTime(.0001, t + 3.4);
    s.connect(lp); lp.connect(crack); crack.connect(env); env.connect(g);
    s.start(t + .05, Math.random() * 3); mod.start(t + .05, Math.random() * 3);
    s.stop(t + 3.5); mod.stop(t + 3.5);
  }

  /* ---------- двигатели: постоянные голоса ---------- */
  /*
     kind:
       piston  — «мопед»: поршневой двухтактник, жужжание с биением
       jet     — реактивный БпЛА и крылатая ракета: турбина, свистящий шум
       rocket  — наша ракета в полёте: рёв, удаляющийся
       fall    — баллистика на снижении: нарастающий вой
       rotor   — вертолёт: хлопки лопастей
       fpv     — FPV: тонкий высокий писк винтов
  */
  function kindOf(th) {
    const c = th.cls;
    if (c === 'ballistic' || c === 'aeroball' || c === 'kab') return 'fall';
    if (c === 'jet' || c === 'cruise' || c === 'arm') return 'jet';
    if (c === 'fpv') return 'fpv';
    return 'piston';
  }

  function makeVoice(kind) {
    const v = { kind, out: ac.createGain(), lp: filt('lowpass', 2000, .6), pan: ac.createStereoPanner ? ac.createStereoPanner() : null, nodes: [], f: 1 };
    v.out.gain.value = 0;
    v.out.connect(v.lp);
    if (v.pan) { v.lp.connect(v.pan); v.pan.connect(bus.eng) } else v.lp.connect(bus.eng);
    const wet = ac.createGain(); wet.gain.value = .25; v.lp.connect(wet); wet.connect(verb);
    const osc = (type, f) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.start(); v.nodes.push(o); return o };
    const nz = () => { const s = noiseSrc(); s.start(0, Math.random() * 3); v.nodes.push(s); return s };
    if (kind === 'piston') {
      /* два слегка расстроенных пилообразных тона ~110 Гц через полосовой фильтр — «мопед» */
      const a = osc('sawtooth', 104 + Math.random() * 14), b = osc('sawtooth', a.frequency.value * 1.012);
      const bp = filt('bandpass', 420, 1.1), g = ac.createGain(); g.gain.value = .13;
      a.connect(bp); b.connect(bp); bp.connect(g); g.connect(v.out);
      const n = nz(), nb = filt('bandpass', 900, 1.5), ng = ac.createGain(); ng.gain.value = .05;
      n.connect(nb); nb.connect(ng); ng.connect(v.out);
      v.pitch = [a, b]; v.base = a.frequency.value;
    } else if (kind === 'jet' || kind === 'rocket') {
      const n = nz(), bp = filt(kind === 'rocket' ? 'lowpass' : 'bandpass', kind === 'rocket' ? 1100 : 2600, kind === 'rocket' ? .7 : .9), g = ac.createGain();
      g.gain.value = kind === 'rocket' ? .32 : .2;
      n.connect(bp); bp.connect(g); g.connect(v.out);
      if (kind === 'jet') {
        const w = osc('sine', 1700 + Math.random() * 400), wg = ac.createGain(); wg.gain.value = .025;
        w.connect(wg); wg.connect(v.out); v.pitch = [w]; v.base = w.frequency.value;
      }
    } else if (kind === 'fall') {
      const n = nz(), bp = filt('bandpass', 700, 2), g = ac.createGain(); g.gain.value = .3;
      n.connect(bp); bp.connect(g); g.connect(v.out); v.band = bp;
    } else if (kind === 'rotor') {
      /* мягкое «вух-вух» лопастей: низкий шум с неглубокой модуляцией, без резких щелчков */
      const n = nz(), lp = filt('lowpass', 170, .5), am = ac.createGain(); am.gain.value = .55;
      const lfo = osc('sine', 4.3), lg = ac.createGain(); lg.gain.value = .25;
      lfo.connect(lg); lg.connect(am.gain);
      n.connect(lp); lp.connect(am); am.connect(v.out);
    } else if (kind === 'fpv') {
      const a = osc('sawtooth', 380 + Math.random() * 60), bp = filt('bandpass', 1800, 1.4), g = ac.createGain(); g.gain.value = .05;
      a.connect(bp); bp.connect(g); g.connect(v.out); v.pitch = [a]; v.base = a.frequency.value;
    }
    return v;
  }

  function killVoice(id, v) {
    const t = ac.currentTime;
    v.out.gain.setTargetAtTime(0, t, .25);
    setTimeout(() => { for (const n of v.nodes) { try { n.stop() } catch (e) { /* уже остановлен */ } } v.out.disconnect() }, 1500);
    voices.delete(id);
  }

  /** что сейчас звучит: ближайшие к центру экрана цели, ракеты, вертолёты */
  function engines() {
    /* время стоит — всё в воздухе «замерло», двигатели молчат */
    if (G.phase !== 'night' || !G.speed) { for (const [id, v] of voices) killVoice(id, v); return }
    const want = [];
    const def = Game.role === 'def';
    for (const th of G.threats) {
      if (th.dead || (def && !th.vis)) continue;
      const s = spot(th);
      if (s.far < 1.6) want.push({ id: 't' + th.id, p: th, kind: kindOf(th), s, th });
    }
    for (const m of G.miss) { const s = spot(m); if (s.far < 1.4) want.push({ id: 'm' + m.id, p: m, kind: 'rocket', s }) }
    /* вертолёт слышно только крупным планом или когда он идёт на перехват — иначе он не навязчив */
    for (const u of G.units) if (u.st === 'air') {
      const s = spot(u);
      if (s.far < 1.2 && (u.chase || s.near > .55)) want.push({ id: 'u' + u.id, p: u, kind: 'rotor', s });
    }
    want.sort((a, b) => b.s.near - a.s.near);
    const keep = new Set(want.slice(0, MAX_VOICES).map(w => w.id));
    for (const [id, v] of voices) if (!keep.has(id)) killVoice(id, v);
    const t = ac.currentTime;
    for (const w of want.slice(0, MAX_VOICES)) {
      let v = voices.get(w.id);
      if (!v) { v = makeVoice(w.kind); voices.set(w.id, v) }
      const lvl = { piston: .55, jet: .7, rocket: .6, fall: .9, rotor: .18, fpv: .45 }[w.kind] || .5;
      v.out.gain.setTargetAtTime(lvl * Math.pow(w.s.near, 1.4), t, .3);
      v.lp.frequency.setTargetAtTime(400 + 6500 * w.s.near * w.s.near, t, .3);
      if (v.pan) v.pan.pan.setTargetAtTime(w.s.pan, t, .3);
      /* лёгкий «доплер»: приближается к центру экрана — выше, удаляется — ниже */
      if (v.pitch) {
        const prev = v.lastNear == null ? w.s.near : v.lastNear;
        v.f += ((1 + clamp((w.s.near - prev) * 6, -.05, .05)) - v.f) * .3;
        const wob = w.kind === 'piston' ? 1 + Math.sin(t * 2.3 + v.base) * .012 : 1;
        for (const o of v.pitch) o.frequency.setTargetAtTime(v.base * v.f * wob * (o === v.pitch[1] ? 1.012 : 1), t, .2);
      }
      v.lastNear = w.s.near;
      /* баллистика: чем ниже, тем выше вой (по доле пройденного пути не знаем — по скорости роста громкости) */
      if (v.band) v.band.frequency.setTargetAtTime(500 + 1600 * w.s.near, t, .4);
    }
  }

  /* ---------- эфир ---------- */
  function radio(cls) {
    if (!ready()) return;
    const now = ac.currentTime;
    if (now - lastRadio < .35) return;
    lastRadio = now;
    const d = bus.radio;
    noise(d, now, .1, { type: 'bandpass', f0: 1700, q: 1.3, vol: .08, att: .002 });
    noise(d, now + .1, .35, { type: 'bandpass', f0: 2200, q: 2, vol: .015, att: .02 });
    tone(d, now + .12, .05, { f0: cls === 'w' || cls === 'crit' ? 760 : 1180, vol: .03 });
    if (cls === 'crit') tone(d, now + .19, .07, { f0: 620, vol: .03 });
  }

  /** сводка разведки: стук телетайпа, затем тихий сигнал */
  let lastTty = 0;
  function teletype(cls) {
    if (!ready()) return;
    const now = ac.currentTime;
    if (now - lastTty < .8) return;
    lastTty = now;
    let t = now;
    const n = 10 + (Math.random() * 8 | 0);
    for (let i = 0; i < n; i++) {
      t += .035 + Math.random() * .045 + (i % 6 === 5 ? .12 : 0);
      noise(bus.radio, t, .03, { type: 'bandpass', f0: 2600 + Math.random() * 900, q: 3, vol: .05, att: .001 });
      tone(bus.radio, t, .02, { f0: 190, vol: .02, att: .001 });
    }
    tone(bus.radio, t + .15, .6, { f0: cls === 'crit' ? 660 : 880, vol: .022, wave: 'triangle' });
  }

  /** сирена воздушной тревоги: далёкая, через ревер, два плавных подъёма */
  function siren() {
    if (!ready()) return;
    const t = ac.currentTime, dur = 10;
    const o = ac.createOscillator(); o.type = 'sawtooth';
    const o2 = ac.createOscillator(); o2.type = 'sawtooth';
    const f = filt('lowpass', 850, .6), g = ac.createGain();
    for (const x of [o, o2]) {
      x.frequency.setValueAtTime(250, t);
      for (let i = 0; i < 2; i++) { x.frequency.linearRampToValueAtTime(500, t + i * 5 + 2.5); x.frequency.linearRampToValueAtTime(250, t + i * 5 + 5) }
    }
    o2.detune.value = 9;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.04, t + 1.5);
    g.gain.setValueAtTime(.04, t + dur - 1.5); g.gain.linearRampToValueAtTime(0, t + dur);
    const w = ac.createGain(); w.gain.value = 1.2;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(bus.amb); g.connect(w); w.connect(verb);
    o.start(t); o2.start(t); o.stop(t + dur + .1); o2.stop(t + dur + .1);
  }

  /* ---------- фон ---------- */
  function startAmbient() {
    const bed = (type, f, q) => {
      const s = noiseSrc(), fl = filt(type, f, q), g = ac.createGain(); g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(bus.amb); s.start(0, Math.random() * 3);
      return { fl, g };
    };
    amb = {
      wind: bed('lowpass', 380, .8), wind2: bed('bandpass', 900, 3),
      rain: bed('bandpass', 2600, .4), drops: bed('highpass', 5000, .3),
      hum: bed('lowpass', 90, .9), room: bed('lowpass', 220, .5),
      stat: bed('bandpass', 1900, 1.4),
      gen: genBed(),
      next: { cricket: 0, dog: 0, rumble: 0, siren: 0, tick: 0, phone: 0, type: 0, talk: 0, owl: 0, train: 0, squelch: 0 },
      tock: 0
    };
  }

  /** дизель-генераторы: низкий гул с гармоникой, громче, чем хуже энергосистема */
  function genBed() {
    const g = ac.createGain(), lp = filt('lowpass', 260, .7);
    g.gain.value = 0;
    for (const [f, v] of [[49, 1], [98, .5], [147, .2]]) {
      const o = ac.createOscillator(), k = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = f * (1 + Math.random() * .01); k.gain.value = v;
      o.connect(k); k.connect(lp); o.start();
    }
    lp.connect(g); g.connect(bus.amb);
    return { g };
  }

  /* ---------- штаб: то, что слышно в комнате ---------- */
  /** часы на стене: «тик» и «так» через раз */
  function clockTick(t) {
    amb.tock ^= 1;
    noise(bus.amb, t, .03, { type: 'bandpass', f0: amb.tock ? 2300 : 3100, q: 6, vol: .05, att: .001 });
  }

  /** старый телефон: два звонка с переливом молоточка */
  function phone(t) {
    const lp = filt('lowpass', 2600, .6), g = ac.createGain(), w = ac.createGain();
    g.gain.value = .5; w.gain.value = .9;
    lp.connect(g); g.connect(bus.amb); g.connect(w); w.connect(verb);
    const rings = 1 + (Math.random() * 2 | 0);
    for (let r = 0; r < rings; r++) {
      const s0 = t + r * 3;
      for (let i = 0; i < 24; i++) tone(lp, s0 + i * .045, .04, { f0: i % 2 ? 1180 : 1260, vol: .012, att: .002, wave: 'triangle' });
    }
  }

  /** печатная машинка за соседним столом: неровная очередь щелчков и звонок каретки */
  function typing(t) {
    let s0 = t;
    const n = 6 + (Math.random() * 14 | 0);
    for (let i = 0; i < n; i++) {
      s0 += .07 + Math.random() * .16;
      noise(bus.amb, s0, .025, { type: 'bandpass', f0: 1600 + Math.random() * 900, q: 3, vol: .035, att: .001 });
    }
    if (Math.random() < .35) tone(bus.amb, s0 + .25, .5, { f0: 2650, vol: .006, att: .002 });
  }

  /** голоса за стеной: шум через две «форманты», слоги 3–5 в секунду */
  function talk(t) {
    const dur = 1.6 + Math.random() * 2.4;
    const lp = filt('lowpass', 1100, .6), g = ac.createGain();
    g.gain.value = 1; lp.connect(g); g.connect(bus.amb);
    for (const [f, q] of [[480 + Math.random() * 120, 4], [1250 + Math.random() * 300, 5]]) {
      let s0 = t;
      while (s0 < t + dur) {
        const syl = .12 + Math.random() * .16;
        noise(lp, s0, syl, { type: 'bandpass', f0: f * (.9 + Math.random() * .25), q, vol: .02 + Math.random() * .02, att: .03 });
        s0 += syl + Math.random() * .08;
      }
    }
  }

  /** щелчок шумоподавителя дежурного приёмника */
  function squelch(t) {
    noise(bus.amb, t, .18 + Math.random() * .25, { type: 'bandpass', f0: 2200, q: 1.2, vol: .02, att: .003 });
  }

  /* ---------- ночь: редкие звуки края ---------- */
  /** сова: два глухих уханья через ревер */
  function owl(t) {
    const g = ac.createGain(), w = ac.createGain(); g.gain.value = .6; w.gain.value = 1.4;
    g.connect(bus.amb); g.connect(w); w.connect(verb);
    tone(g, t, .3, { f0: 390, f1: 360, vol: .02, att: .05 });
    tone(g, t + .55, .55, { f0: 380, f1: 330, vol: .022, att: .06 });
  }

  /** далёкий тепловоз: аккорд гудка, долгий хвост ревера */
  function train(t) {
    const lp = filt('lowpass', 650, .5), g = ac.createGain(), w = ac.createGain();
    g.gain.value = .5; w.gain.value = 2;
    lp.connect(g); g.connect(bus.amb); g.connect(w); w.connect(verb);
    const d = 1.6 + Math.random();
    for (const f of [311, 370, 466]) tone(lp, t, d, { f0: f, vol: .012, att: .25, wave: 'sawtooth' });
  }

  /** сверчок: несколько быстрых высоких щелчков */
  function cricket() {
    const t = ac.currentTime, pan = ac.createStereoPanner ? ac.createStereoPanner() : null, g = ac.createGain();
    g.gain.value = .5;
    if (pan) { pan.pan.value = Math.random() * 1.6 - .8; g.connect(pan); pan.connect(bus.amb) } else g.connect(bus.amb);
    const f = 4200 + Math.random() * 900, n = 3 + (Math.random() * 3 | 0);
    for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) tone(g, t + r * .5 + i * .045, .03, { f0: f, vol: .012, att: .004 });
  }

  /** далёкий лай: два коротких тона через ревер и сильный срез */
  function dog() {
    const t = ac.currentTime, lp = filt('lowpass', 900, .5), g = ac.createGain(), w = ac.createGain();
    g.gain.value = .5; w.gain.value = 1.5;
    lp.connect(g); g.connect(bus.amb); g.connect(w); w.connect(verb);
    for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++) {
      const s = t + i * (.35 + Math.random() * .1);
      tone(lp, s, .18, { f0: 520 + Math.random() * 80, f1: 300, vol: .025, wave: 'sawtooth', att: .01 });
    }
  }

  /** дальний раскат: где-то за пределами экрана идёт работа */
  function rumble() {
    const t = ac.currentTime;
    noise(bus.amb, t, 4 + Math.random() * 3, { f0: 160, f1: 40, vol: .09 + Math.random() * .06, att: .4 });
    tone(bus.amb, t, 3, { f0: 42, f1: 30, vol: .05, att: .3 });
  }

  /* ---------- музыка ---------- */
  /* ---------- музыка: набор треков ----------
     Каждый трек — лад, тональность, темп, гармония и набор «инструментов».
     Трек играет 16–32 тактов и плавно уступает место следующему из той же
     группы настроения (день · тихая ночь · волна · рассвет). Смена
     настроения ночи — быстрый кроссфейд на трек нужной группы. */
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], aeolian: [0, 2, 3, 5, 7, 8, 10]
  };
  /* prog — ступени лада (0 — тоника), по одному аккорду на такт; inst — какие голоса звучат */
  const TRACKS = [
    { n: 'Штаб днём', mood: 'day', root: 48, sc: 'lydian', bpm: 72, prog: [0, 4, 5, 3], inst: ['pad', 'piano', 'bass'] },
    { n: 'Карта края', mood: 'day', root: 45, sc: 'dorian', bpm: 84, prog: [0, 3, 6, 4], inst: ['arpSlow', 'bell', 'pad'] },
    { n: 'Сводки', mood: 'day', root: 50, sc: 'major', bpm: 66, prog: [0, 5, 3, 4], inst: ['piano', 'strings'] },
    { n: 'Тихое небо', mood: 'calm', root: 50, sc: 'minor', bpm: 58, prog: [0, 5, 3, 6], inst: ['pad', 'bellSparse', 'drone'] },
    { n: 'Дежурство', mood: 'calm', root: 52, sc: 'aeolian', bpm: 70, prog: [0, 6, 5, 4], inst: ['arpSlow', 'strings', 'bass'] },
    { n: 'Огни края', mood: 'calm', root: 42, sc: 'dorian', bpm: 54, prog: [0, 3, 0, 4], inst: ['piano', 'drone', 'pad'] },
    { n: 'Эфир', mood: 'calm', root: 47, sc: 'phrygian', bpm: 62, prog: [0, 1, 0, 6], inst: ['bellSparse', 'strings', 'drone'] },
    { n: 'Волна', mood: 'raid', root: 48, sc: 'minor', bpm: 96, prog: [0, 0, 5, 6], inst: ['ostinato', 'strings', 'bass8', 'pulse'] },
    { n: 'Перехват', mood: 'raid', root: 50, sc: 'phrygian', bpm: 104, prog: [0, 1, 0, 6], inst: ['arpFast', 'bass8', 'pulse', 'drone'] },
    { n: 'Пуск', mood: 'raid', root: 45, sc: 'minor', bpm: 90, prog: [0, 6, 5, 4], inst: ['ostinato', 'pad', 'pulse'] },
    { n: 'Рассвет', mood: 'dawn', root: 55, sc: 'major', bpm: 66, prog: [0, 3, 4, 0], inst: ['strings', 'bell', 'piano'] },
    { n: 'Отбой', mood: 'dawn', root: 52, sc: 'lydian', bpm: 60, prog: [0, 1, 4, 0], inst: ['pad', 'arpSlow'] }
  ];
  const MOOD_OF = { day: 'day', calm: 'calm', contact: 'calm', after: 'calm', raid: 'raid', dawn: 'dawn' };

  function startMusic() {
    const lp = filt('lowpass', 2600, .3), g = ac.createGain(), w = ac.createGain();
    g.gain.value = .6; w.gain.value = .7;
    lp.connect(g); g.connect(bus.music); g.connect(w); w.connect(verb);
    mus = { lp, cur: null, last: null, tension: 0 };
  }

  /** ноты аккорда: ступень лада → четыре звука (терции вверх) */
  function chordNotes(tr, deg) {
    const S = SCALES[tr.sc], out = [];
    for (let k = 0; k < 4; k++) {
      const i = deg + k * 2;
      out.push(tr.root + S[i % 7] + 12 * Math.floor(i / 7));
    }
    return out;
  }

  /* инструменты: каждый рисует такт начиная с t, длительностью bar, на выход o */
  function vPad(o, t, d, n, vol) {
    for (const det of [-7, 6]) {
      const x = ac.createOscillator(), g = ac.createGain(), f = filt('lowpass', 1100, .4);
      x.type = 'sawtooth'; x.frequency.value = midi(n); x.detune.value = det;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + d * .4); g.gain.linearRampToValueAtTime(0, t + d + 1.2);
      x.connect(f); f.connect(g); g.connect(o); x.start(t); x.stop(t + d + 1.3);
    }
  }
  function vPluck(o, t, n, vol, dec) {
    const x = ac.createOscillator(), x2 = ac.createOscillator(), g = ac.createGain();
    x.type = 'triangle'; x2.type = 'sine'; x.frequency.value = midi(n); x2.frequency.value = midi(n) * 2.01;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + dec);
    const g2 = ac.createGain(); g2.gain.value = .25;
    x.connect(g); x2.connect(g2); g2.connect(g); g.connect(o);
    x.start(t); x2.start(t); x.stop(t + dec + .05); x2.stop(t + dec + .05);
  }
  function vBell(o, t, n, vol) {
    tone(o, t, 3.5, { f0: midi(n), vol, att: .004 });
    tone(o, t, 2.2, { f0: midi(n) * 2.76, vol: vol * .35, att: .004 });
  }
  function vString(o, t, d, n, vol) {
    const x = ac.createOscillator(), g = ac.createGain(), f = filt('lowpass', 1500, .5), lfo = ac.createOscillator(), lg = ac.createGain();
    x.type = 'sawtooth'; x.frequency.value = midi(n);
    lfo.frequency.value = 5; lg.gain.value = 3; lfo.connect(lg); lg.connect(x.detune);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + d * .3); g.gain.setValueAtTime(vol, t + d * .8); g.gain.linearRampToValueAtTime(0, t + d + .6);
    x.connect(f); f.connect(g); g.connect(o); x.start(t); lfo.start(t); x.stop(t + d + .7); lfo.stop(t + d + .7);
  }
  function vKick(o, t, vol) { tone(o, t, .45, { f0: 70, f1: 38, vol, att: .004 }) }

  function playBar(tr, bar, t) {
    const o = tr.out, beat = 60 / tr.bpm, B = beat * 4;
    const ch = chordNotes(tr, tr.prog[bar % tr.prog.length]);
    const R = (a, b) => a + Math.random() * (b - a);
    for (const inst of tr.inst) {
      if (inst === 'pad') for (const n of ch.slice(0, 3)) vPad(o, t, B, n, .018);
      else if (inst === 'strings') { vString(o, t, B, ch[0] - 12, .02); vString(o, t, B, ch[2], .012) }
      else if (inst === 'drone' && bar % 2 === 0) vString(o, t, B * 2, tr.root - 12, .022);
      else if (inst === 'bass') vPluck(o, t, ch[0] - 12, .07, B * .9);
      else if (inst === 'bass8') for (let i = 0; i < 8; i++) vPluck(o, t + i * beat / 2, ch[0] - 12, i % 2 ? .035 : .06, beat * .45);
      else if (inst === 'piano') {
        /* мелодия по аккорду: 2–4 ноты в такте, случайный ритм */
        const k = 2 + (Math.random() * 3 | 0);
        for (let i = 0; i < k; i++) vPluck(o, t + Math.floor(R(0, 8)) * beat / 2, ch[(Math.random() * 4) | 0] + 12, .045, 2.2);
        vPluck(o, t, ch[0], .04, 2.5);
      }
      else if (inst === 'arpSlow') for (let i = 0; i < 4; i++) vPluck(o, t + i * beat, ch[[0, 1, 2, 1][i]] + 12, .035, beat * 1.6);
      else if (inst === 'arpFast') for (let i = 0; i < 16; i++) vPluck(o, t + i * beat / 4, ch[[0, 1, 2, 3, 2, 1, 2, 3][i % 8]] + 12, .022, beat * .5);
      else if (inst === 'ostinato') for (let i = 0; i < 8; i++) vPluck(o, t + i * beat / 2, ch[i % 2 ? 2 : 0], .03, beat * .4);
      else if (inst === 'bell' && Math.random() < .7) vBell(o, t + Math.floor(R(0, 4)) * beat, ch[(Math.random() * 3) | 0] + 24, .014);
      else if (inst === 'bellSparse' && Math.random() < .35) vBell(o, t + Math.floor(R(0, 4)) * beat, ch[(Math.random() * 3) | 0] + 24, .012);
      else if (inst === 'pulse') for (let i = 0; i < 4; i++) { vKick(o, t + i * beat, i % 2 ? .05 : .08); if (i === 3) vKick(o, t + i * beat + beat / 2, .04) }
    }
  }

  function startTrack(mood, t, fade) {
    const pool = TRACKS.filter(x => x.mood === mood && x !== mus.last);
    const tr = Object.assign({}, pool[(Math.random() * pool.length) | 0] || TRACKS[0]);
    tr.out = ac.createGain();
    tr.out.gain.setValueAtTime(0, t); tr.out.gain.linearRampToValueAtTime(1, t + fade);
    tr.out.connect(mus.lp);
    tr.bar = 0; tr.next = t + .05; tr.len = 16 + ((Math.random() * 3) | 0) * 8; tr.mood = mood;
    if (mus.cur) {
      const old = mus.cur;
      old.out.gain.setTargetAtTime(0, t, fade / 3);
      setTimeout(() => old.out.disconnect(), (fade + 6) * 1000);
    }
    mus.last = TRACKS.find(x => x.n === tr.n);
    mus.cur = tr;
  }

  /* ---------- драматургия ночи ----------
     Состояние: day · calm (тишина) · contact (первые цели) · raid (волна) ·
     after (волна схлынула) · dawn (рассвет). Баллистика — отдельный сигнал.
     На смену состояния — короткая музыкальная «вставка». */
  const D = { state: 'day', since: 0, lastBusy: -1e9, beepT: 0, sirenT: 0, birdT: 0 };

  function nightState(t) {
    if (G.phase !== 'night') return G.phase === 'prep' ? 'day' : 'dawn';
    if (G.t > NIGHT_LEN - 2400) return 'dawn';
    const def = Game.role === 'def';
    let n = 0;
    for (const th of G.threats) if (!th.dead && (!def || th.vis)) n++;
    if (n) D.lastBusy = t;
    if (n >= 10) return 'raid';
    if (n >= 1) return 'contact';
    if ((D.state === 'raid' || D.state === 'contact' || D.state === 'after') && t - D.lastBusy < 120) return 'after';
    return 'calm';
  }

  /** вставки на смену состояния */
  function sting(from, to, t) {
    if (to === 'contact' && (from === 'calm' || from === 'after')) {
      /* тревожный низкий аккорд, медленно раскрывается */
      for (const [n, d] of [[38, -8], [45, 6], [50, 0]]) tone(mus.lp, t, 6, { f0: midi(n), vol: .05, att: 2.4, wave: 'triangle' });
      tone(verb, t + 1.2, 4, { f0: midi(86), vol: .012, att: .01 });
    } else if (to === 'raid') {
      /* три глухих удара, как большой барабан вдалеке */
      for (let i = 0; i < 3; i++) {
        tone(bus.music, t + i * .62, .9, { f0: 58, f1: 36, vol: .16, att: .004 });
        noise(bus.music, t + i * .62, .5, { f0: 500, f1: 80, vol: .07, att: .003 });
      }
    } else if (to === 'dawn' && from !== 'day' && from !== 'dawn') {
      /* светлый аккорд: ночь кончилась */
      for (const n of [60, 64, 67, 71, 74]) tone(mus.lp, t, 9, { f0: midi(n), vol: .02, att: 3, wave: 'sine' });
    }
  }

  /** сирены скорых вдалеке: двухтональный сигнал, тихо, через ревер */
  function ambulance(t) {
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null, g = ac.createGain(), lp = filt('lowpass', 1300, .5), w = ac.createGain();
    g.gain.value = .5; w.gain.value = 1.6;
    lp.connect(g); if (pan) { pan.pan.value = Math.random() * 1.4 - .7; g.connect(pan); pan.connect(bus.amb) } else g.connect(bus.amb);
    g.connect(w); w.connect(verb);
    for (let i = 0; i < 10; i++) tone(lp, t + i * .55, .5, { f0: i % 2 ? 560 : 680, vol: .014, att: .03, wave: 'triangle' });
  }

  /** птицы на рассвете: быстрые свисты с переливом */
  function bird(t) {
    const n = 2 + (Math.random() * 4 | 0), base = 2600 + Math.random() * 1800;
    for (let i = 0; i < n; i++) {
      const s0 = t + i * (.09 + Math.random() * .08);
      tone(bus.amb, s0, .08, { f0: base * (1 + Math.random() * .3), f1: base * (.8 + Math.random() * .5), vol: .012, att: .005 });
    }
  }

  function dramaturgy(t) {
    const st = nightState(t);
    if (st !== D.state) { sting(D.state, st, t); D.state = st; D.since = t }
    /* баллистика в воздухе: мягкий двойной сигнал раз в 2 с */
    if (G.phase === 'night' && G.speed && t > D.beepT && typeof ballisticETA === 'function' && ballisticETA()) {
      D.beepT = t + 2;
      tone(bus.sfx, t, .12, { f0: 880, vol: .03 });
      tone(bus.sfx, t + .16, .12, { f0: 660, vol: .03 });
    }
    if (!G.speed && G.phase === 'night') return;
    if (st === 'after' && t > D.sirenT) { D.sirenT = t + 25 + Math.random() * 30; if (Game.role === 'def' || chance(.3)) ambulance(t + Math.random() * 4) }
    if (st === 'dawn' && t > D.birdT) { D.birdT = t + 1.5 + Math.random() * 5; bird(t) }
  }

  /* ---------- каждый кадр ---------- */
  function update() {
    if (!ac || !G || !amb) return;
    const t = ac.currentTime;
    const night = G.phase === 'night';
    const w = G.weather || {}, wind = (G.wind && G.wind.v) || 0, vis = w.vis;
    const busy = (G.det || G.threats.some(th => !th.dead)) ? 1 : 0;
    /* мир на паузе (и днём) — погода и фон ночи молчат, остаются только музыка и эфир */
    const live = night && G.speed > 0 ? 1 : 0;
    /* ветер: два слоя, порывы, свист при сильном ветре */
    const gust = .6 + .4 * Math.sin(t * .23) * Math.sin(t * .071 + 1);
    amb.wind.g.gain.setTargetAtTime((.05 + Math.min(wind, 20) * .012) * gust * live, t, .4);
    amb.wind.fl.frequency.setTargetAtTime(220 + wind * 22 * gust, t, 1.5);
    amb.wind2.g.gain.setTargetAtTime(wind >= 10 ? .012 * gust * live : 0, t, .4);
    amb.wind2.fl.frequency.setTargetAtTime(700 + wind * 30 * gust, t, 1);
    const WL = typeof wxLook === 'function' ? wxLook() : null;
    const rainK = WL ? WL.rain : vis === 'rain' ? 1 : 0, snowK = WL ? WL.snow : vis === 'snow' ? 1 : 0;
    amb.rain.g.gain.setTargetAtTime((.07 * rainK + .012 * snowK) * live, t, .4);
    amb.drops.g.gain.setTargetAtTime(.02 * rainK * live, t, .4);
    amb.hum.g.gain.setTargetAtTime(live ? .045 + busy * .05 : 0, t, .6);
    /* днём и на паузе — тихий «воздух» штаба и шипение дежурного приёмника */
    const room = !live;
    amb.room.g.gain.setTargetAtTime(room ? .02 : .006, t, 3);
    amb.stat.g.gain.setTargetAtTime(room ? .005 : night ? .002 : 0, t, 2);
    /* генераторы: энергосистема ниже 60% — край на дизелях */
    const en = G.objs && G.objs.length ? energy() : 100;
    amb.gen.g.gain.setTargetAtTime(live && en < 60 ? .008 + .02 * (1 - en / 60) : 0, t, 3);
    /* редкие события фона */
    const N = amb.next, calm = vis === 'clear' || vis === 'cloud';
    if (live && calm && wind < 9 && !busy && t > N.cricket) { cricket(); N.cricket = t + 1.5 + Math.random() * 4 }
    if (live && t > N.dog) { if (N.dog) dog(); N.dog = t + 40 + Math.random() * 80 }
    if (live && busy && t > N.rumble) { if (N.rumble) rumble(); N.rumble = t + 18 + Math.random() * 30 }
    if (live && calm && !busy && t > N.owl) { if (N.owl) owl(t); N.owl = t + 50 + Math.random() * 110 }
    if (live && t > N.train) { if (N.train) train(t); N.train = t + 140 + Math.random() * 200 }
    /* штаб */
    if (room && t > N.tick) { clockTick(t); N.tick = t + 1 }
    if (room && t > N.phone) { if (N.phone) phone(t); N.phone = t + 45 + Math.random() * 100 }
    if (room && t > N.type) { if (N.type) typing(t); N.type = t + 9 + Math.random() * 25 }
    if (room && t > N.talk) { if (N.talk) talk(t); N.talk = t + 14 + Math.random() * 30 }
    if (t > N.squelch) { if (N.squelch && (room || night)) squelch(t); N.squelch = t + 20 + Math.random() * 40 }
    dramaturgy(t);
    /* двигатели — 10 раз в секунду */
    if (t - engT > .1) { engT = t; if (ready()) engines() }
    else if (!ready()) for (const [id, v] of voices) killVoice(id, v);
    /* музыка: трек по настроению; конец трека или смена настроения — следующий */
    const mood = MOOD_OF[D.state] || 'calm';
    if (!mus.cur) startTrack(mood, t + .2, 3);
    else if (mus.cur.mood !== mood) startTrack(mood, t + .1, mood === 'raid' ? 2.5 : 5);
    else if (mus.cur.bar >= mus.cur.len) startTrack(mood, mus.cur.next, 6);
    const tr = mus.cur;
    while (tr.next < t + .25) {
      playBar(tr, tr.bar++, tr.next);
      tr.next += 60 / tr.bpm * 4;
    }
  }

  /* ---------- события игры ---------- */
  function onFx(o) {
    if (!ready() || !G) return;
    if (o.k === 'boom') boom(o, o.small);
    else if (o.k === 'air') airBurst(o, o.small);
    else if (o.k === 'tracer') gun(o);
    else if (o.k === 'launch') launch(o);
  }

  function onLog(ev) {
    if (ev.box === 'radio') radio(ev.cls);
    else if (ev.box === 'intel') teletype(ev.cls);
  }

  /* ---------- настройки ---------- */
  function apply() {
    if (!ac) return;
    out.gain.setTargetAtTime(cfg.on ? cfg.master : 0, ac.currentTime, .1);
    for (const k of ['sfx', 'eng', 'radio', 'amb', 'music']) bus[k].gain.setTargetAtTime(cfg[k], ac.currentTime, .1);
  }

  function set(k, v) { cfg[k] = v; save(); apply() }

  function panelHTML() {
    const scr = (k, n) => `<div class="row"><span>${n}</span><button class="btn sm ${SCREEN[k] ? 'on' : ''}" data-a="scrToggle" data-k="${k}">${SCREEN[k] ? 'вкл' : 'выкл'}</button></div>`;
    const sl = (k, n) => `<div class="row"><span>${n}</span><input type="range" min="0" max="100" value="${Math.round(cfg[k] * 100)}" data-snd="${k}"></div>`;
    return `<h1>Звук и экран</h1>
    <div class="row"><span>Звук</span><button class="btn sm ${cfg.on ? 'on' : ''}" data-a="sndToggle">${cfg.on ? 'включён' : 'выключен'}</button></div>
    ${sl('master', 'Общая громкость')}${sl('sfx', 'Бой: разрывы, пуски, очереди')}${sl('eng', 'Двигатели: дроны, ракеты, вертолёты')}${sl('radio', 'Эфир и сводки')}${sl('amb', 'Фон: ветер, дождь, ночь')}${sl('music', 'Музыка')}
    <h2>Экран</h2>
    ${scr('grain', 'Зерно (рябь, «шум» экрана)')}${scr('vignette', 'Затемнение по краям')}${scr('shake', 'Дрожь карты от близких разрывов')}${scr('sweep', 'Развёртка радара')}
    <p class="mu">Весь звук синтезируется на лету. Чтобы услышать двигатели, приблизьте карту к цели — далёкое звучит глухо или не слышно.</p>
    <div class="acts"><button class="btn pri" data-a="close">Готово</button></div>`;
  }

  function init() {
    const go = () => unlock();
    window.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
    document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.snd; if (k) set(k, e.target.value / 100) });
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-a]');
      if (!el) return;
      if (el.dataset.a === 'sound') { unlock(); showModal(panelHTML()) }
      else if (el.dataset.a === 'sndToggle') { set('on', !cfg.on); showModal(panelHTML()); syncBtn() }
      else if (el.dataset.a === 'scrToggle') { setScreen(el.dataset.k, !SCREEN[el.dataset.k]); showModal(panelHTML()) }
    });
    syncBtn();
  }

  function syncBtn() { const b = document.getElementById('btnSound'); if (b) b.textContent = cfg.on ? '🔊' : '🔇' }

  return { init, update, onFx, onLog, siren, alert: () => radio('crit') };
})();
