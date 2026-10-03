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
              дальние раскаты, редкие собаки; день — тишина штаба
     музыка   медленный эмбиент на аккордах, ночью темнее,
              при целях на радарах — тихий пульс
   Всё идёт через компрессор, срез верхов и общий ревер — громкие
   звуки не режут уши. Настройки хранятся в localStorage.
   ============================================================ */

const Sound = (() => {
  const DEF = { on: true, master: .6, sfx: .7, eng: .6, radio: .45, amb: .6, music: .35 };
  let cfg = Object.assign({}, DEF);
  try { Object.assign(cfg, JSON.parse(localStorage.getItem('nr.sound') || '{}')) } catch (e) { /* без настроек */ }

  let ac = null, out, comp, verb, bus = {}, noiseBuf = null, amb = null, mus = null;
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

  function impulse(sec, decay) {
    const len = ac.sampleRate * sec, b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) }
    return b;
  }

  /* ---------- примитивы ---------- */
  function noiseSrc() { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s }

  function filt(type, f, q) { const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q || .7; return x }

  /** одноразовый шум с огибающей и движением фильтра */
  function noise(dest, t, dur, o) {
    const s = noiseSrc(); s.playbackRate.value = o.rate || 1;
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
  function boom(o, small) {
    const now = ac.currentTime;
    if (now - lastBoom < .12) { if (++boomsNow > 3) return } else boomsNow = 0;
    lastBoom = now;
    const { g, s } = placed(o, 'sfx', .8);
    const t = now + (1 - s.near) * .35 + Math.random() * .04;     /* далёкий разрыв доходит позже */
    const k = small ? .45 : 1;
    if (s.near > .25) {
      /* близко: плотный удар, давление, осыпь обломков */
      tone(g, t, .9 * k + .3, { f0: 68 + Math.random() * 14, f1: 30, vol: .6 * k, att: .003 });
      noise(g, t, 1.4 * k + .3, { f0: 2400, f1: 90, vol: .45 * k, att: .004 });
      noise(g, t + .25, 1.8 * k, { type: 'bandpass', f0: 1800, f1: 500, q: .6, vol: .05 * k, att: .3 });
    }
    /* хвост: раскат, который слышно и далеко */
    noise(g, t, 3.2 * k + .6, { f0: 260, f1: 45, vol: .35 * k, att: .05 });
    tone(g, t, 2.2 * k, { f0: 46, f1: 28, vol: .22 * k, att: .06 });
  }

  function airBurst(o, small) {
    const { g } = placed(o, 'sfx', 1);
    const t = ac.currentTime, k = small ? .5 : 1;
    tone(g, t, .5, { f0: 150, f1: 60, vol: .26 * k, att: .002 });
    noise(g, t, 1.6, { f0: 3000, f1: 140, vol: .22 * k, att: .002 });
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
    if (c === 'ballistic' || c === 'aeroball') return 'fall';
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
      /* шум, промодулированный по амплитуде частотой лопастей (~5 Гц) */
      const n = nz(), lp = filt('lowpass', 380, .8), am = ac.createGain(); am.gain.value = .5;
      const lfo = osc('sine', 5.2), lg = ac.createGain(); lg.gain.value = .45;
      lfo.connect(lg); lg.connect(am.gain);
      n.connect(lp); lp.connect(am); am.connect(v.out);
      const g2 = ac.createGain(); g2.gain.value = .6; am.connect(g2); g2.connect(v.out);
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
    const want = [];
    const def = Game.role === 'def';
    for (const th of G.threats) {
      if (th.dead || (def && !th.vis)) continue;
      const s = spot(th);
      if (s.far < 1.6) want.push({ id: 't' + th.id, p: th, kind: kindOf(th), s, th });
    }
    for (const m of G.miss) { const s = spot(m); if (s.far < 1.4) want.push({ id: 'm' + m.id, p: m, kind: 'rocket', s }) }
    for (const u of G.units) if (u.st === 'air') { const s = spot(u); if (s.far < 1.5) want.push({ id: 'u' + u.id, p: u, kind: 'rotor', s }) }
    want.sort((a, b) => b.s.near - a.s.near);
    const keep = new Set(want.slice(0, MAX_VOICES).map(w => w.id));
    for (const [id, v] of voices) if (!keep.has(id)) killVoice(id, v);
    const t = ac.currentTime;
    for (const w of want.slice(0, MAX_VOICES)) {
      let v = voices.get(w.id);
      if (!v) { v = makeVoice(w.kind); voices.set(w.id, v) }
      const lvl = { piston: .55, jet: .7, rocket: .6, fall: .9, rotor: .5, fpv: .45 }[w.kind] || .5;
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

  function chime() {
    if (!ready()) return;
    const t = ac.currentTime;
    tone(bus.radio, t, .6, { f0: 880, vol: .026, wave: 'triangle' });
    tone(bus.radio, t + .13, .8, { f0: 1320, vol: .02, wave: 'triangle' });
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
      next: { cricket: 0, dog: 0, rumble: 0, siren: 0 }
    };
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
  const PROG_DAY = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]];
  const PROG_NIGHT = [[50, 57, 60, 65], [46, 53, 58, 62], [41, 48, 57, 60], [48, 55, 58, 63]];
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  function startMusic() {
    const lp = filt('lowpass', 1400, .3), g = ac.createGain(), w = ac.createGain();
    g.gain.value = .5; w.gain.value = .8;
    lp.connect(g); g.connect(bus.music); g.connect(w); w.connect(verb);
    mus = { lp, i: 0, next: ac.currentTime + 1, beat: ac.currentTime + 1, tension: 0 };
  }

  function chord(notes, t, dur) {
    for (const n of notes) for (const det of [-6, 5]) {
      const o = ac.createOscillator(); o.type = n < 52 ? 'triangle' : 'sine';
      o.frequency.value = midi(n - 12 * (n > 64 ? 1 : 0)); o.detune.value = det + Math.random() * 3;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.032, t + dur * .35);
      g.gain.linearRampToValueAtTime(.022, t + dur * .7); g.gain.linearRampToValueAtTime(0, t + dur + 2.5);
      o.connect(g); g.connect(mus.lp); o.start(t); o.stop(t + dur + 2.6);
    }
    if (Math.random() < .55) {
      const top = notes[(Math.random() * notes.length) | 0] + 12;
      tone(mus.lp, t + dur * (.3 + Math.random() * .4), 3.5, { f0: midi(top), vol: .016, att: .8 });
    }
  }

  /* ---------- каждый кадр ---------- */
  function update() {
    if (!ac || !G || !amb) return;
    const t = ac.currentTime;
    const night = G.phase === 'night';
    const w = G.weather || {}, wind = (G.wind && G.wind.v) || 0, vis = w.vis;
    const busy = (G.det || G.threats.some(th => !th.dead)) ? 1 : 0;
    /* ветер: два слоя, порывы, свист при сильном ветре */
    const gust = .6 + .4 * Math.sin(t * .23) * Math.sin(t * .071 + 1);
    amb.wind.g.gain.setTargetAtTime((.05 + Math.min(wind, 20) * .012) * gust, t, 1.2);
    amb.wind.fl.frequency.setTargetAtTime(220 + wind * 22 * gust, t, 1.5);
    amb.wind2.g.gain.setTargetAtTime(wind >= 10 ? .012 * gust : 0, t, 2);
    amb.wind2.fl.frequency.setTargetAtTime(700 + wind * 30 * gust, t, 1);
    amb.rain.g.gain.setTargetAtTime(vis === 'rain' ? .07 : vis === 'snow' ? .012 : 0, t, 2);
    amb.drops.g.gain.setTargetAtTime(vis === 'rain' ? .02 : 0, t, 2);
    amb.hum.g.gain.setTargetAtTime(night ? .045 + busy * .05 : .015, t, 3);
    /* днём — тихий «воздух» штаба */
    amb.room.g.gain.setTargetAtTime(night ? .006 : .02, t, 3);
    /* редкие события фона */
    const N = amb.next, calm = vis === 'clear' || vis === 'cloud';
    if (night && calm && wind < 9 && !busy && t > N.cricket) { cricket(); N.cricket = t + 1.5 + Math.random() * 4 }
    if (night && t > N.dog) { if (N.dog) dog(); N.dog = t + 40 + Math.random() * 80 }
    if (night && busy && t > N.rumble) { if (N.rumble) rumble(); N.rumble = t + 18 + Math.random() * 30 }
    /* двигатели — 10 раз в секунду */
    if (t - engT > .1) { engT = t; if (ready()) engines() }
    else if (!ready()) for (const [id, v] of voices) killVoice(id, v);
    /* музыка */
    mus.tension += ((night && busy ? 1 : 0) - mus.tension) * .01;
    mus.lp.frequency.setTargetAtTime(night ? 900 + mus.tension * 500 : 1500, t, 2);
    if (t >= mus.next) {
      const dur = night ? 10 : 12;
      chord((night ? PROG_NIGHT : PROG_DAY)[mus.i++ % 4], mus.next, dur);
      mus.next += dur;
    }
    if (mus.tension > .15 && t >= mus.beat) {
      const k = mus.tension;
      tone(bus.music, mus.beat, .5, { f0: 62, f1: 40, vol: .08 * k, att: .01 });
      tone(bus.music, mus.beat + .28, .4, { f0: 55, f1: 38, vol: .045 * k, att: .01 });
      mus.beat += 60 / 66;
    } else if (t >= mus.beat) mus.beat = t + .5;
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
    else if (ev.box === 'intel') chime();
  }

  /* ---------- настройки ---------- */
  function apply() {
    if (!ac) return;
    out.gain.setTargetAtTime(cfg.on ? cfg.master : 0, ac.currentTime, .1);
    for (const k of ['sfx', 'eng', 'radio', 'amb', 'music']) bus[k].gain.setTargetAtTime(cfg[k], ac.currentTime, .1);
  }

  function set(k, v) { cfg[k] = v; save(); apply() }

  function panelHTML() {
    const sl = (k, n) => `<div class="row"><span>${n}</span><input type="range" min="0" max="100" value="${Math.round(cfg[k] * 100)}" data-snd="${k}"></div>`;
    return `<h1>Звук</h1>
    <div class="row"><span>Звук</span><button class="btn sm ${cfg.on ? 'on' : ''}" data-a="sndToggle">${cfg.on ? 'включён' : 'выключен'}</button></div>
    ${sl('master', 'Общая громкость')}${sl('sfx', 'Бой: разрывы, пуски, очереди')}${sl('eng', 'Двигатели: дроны, ракеты, вертолёты')}${sl('radio', 'Эфир и сводки')}${sl('amb', 'Фон: ветер, дождь, ночь')}${sl('music', 'Музыка')}
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
    });
    syncBtn();
  }

  function syncBtn() { const b = document.getElementById('btnSound'); if (b) b.textContent = cfg.on ? '🔊' : '🔇' }

  return { init, update, onFx, onLog, siren, alert: () => radio('crit') };
})();
