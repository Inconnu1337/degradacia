'use strict';
/* ============================================================
   ЗВУК (клиент) — всё синтезируется Web Audio, без файлов
   ------------------------------------------------------------
   Шины: эффекты · эфир · фон (ветер, дождь, дальний гул) · музыка.
   Все шины идут через мягкий компрессор и общий ревер: громкие
   разрывы не режут уши, а звучат далёкими и объёмными.
   Громкость эффекта зависит от того, где он на карте относительно
   экрана, и раскладывается по стерео.
   Настройки (громкости, вкл/выкл) хранятся в localStorage.
   ============================================================ */

const Sound = (() => {
  const DEF = { on: true, master: .6, sfx: .7, radio: .45, amb: .55, music: .4 };
  let cfg = Object.assign({}, DEF);
  try { Object.assign(cfg, JSON.parse(localStorage.getItem('nr.sound') || '{}')) } catch (e) { /* без настроек */ }

  let ac = null, out, comp, verb, bus = {}, noiseBuf = null, amb = null, mus = null;
  let lastBoom = 0, boomsNow = 0, lastRadio = 0, lastShot = 0;

  const save = () => { try { localStorage.setItem('nr.sound', JSON.stringify(cfg)) } catch (e) { /* приватный режим */ } };

  /* ---------- запуск: браузер разрешает звук только после жеста игрока ---------- */
  function unlock() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = .01; comp.release.value = .3;
    out = ac.createGain();
    out.gain.value = cfg.on ? cfg.master : 0;
    /* мягкий срез верха: никаких «звенящих» частот */
    const shelf = ac.createBiquadFilter();
    shelf.type = 'highshelf'; shelf.frequency.value = 6000; shelf.gain.value = -6;
    comp.connect(shelf); shelf.connect(out); out.connect(ac.destination);
    verb = ac.createConvolver(); verb.buffer = impulse(3.2, 2.4);
    const vg = ac.createGain(); vg.gain.value = .55;
    verb.connect(vg); vg.connect(comp);
    for (const k of ['sfx', 'radio', 'amb', 'music']) {
      const g = ac.createGain(); g.gain.value = cfg[k]; g.connect(comp); bus[k] = g;
    }
    noiseBuf = makeNoise(3);
    startAmbient();
    startMusic();
  }

  function makeNoise(sec) {
    const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate), d = b.getChannelData(0);
    /* розовый шум: мягче белого */
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = .99765 * b0 + w * .099; b1 = .963 * b1 + w * .2965; b2 = .57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * .1848) * .2;
    }
    return b;
  }

  function impulse(sec, decay) {
    const len = ac.sampleRate * sec, b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  const ready = () => ac && cfg.on && ac.state === 'running';

  /* ---------- примитивы ---------- */
  function noise(dest, t, dur, opt) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    s.playbackRate.value = opt.rate || 1;
    const f = ac.createBiquadFilter(); f.type = opt.type || 'lowpass'; f.Q.value = opt.q || .7;
    f.frequency.setValueAtTime(opt.f0, t);
    if (opt.f1) f.frequency.exponentialRampToValueAtTime(opt.f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opt.vol, t + (opt.att || .005));
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 2); s.stop(t + dur + .05);
    return g;
  }

  function tone(dest, t, dur, opt) {
    const o = ac.createOscillator(); o.type = opt.wave || 'sine';
    o.frequency.setValueAtTime(opt.f0, t);
    if (opt.f1) o.frequency.exponentialRampToValueAtTime(opt.f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opt.vol, t + (opt.att || .01));
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + .05);
  }

  /** узел «место на карте»: громкость по удалённости от центра экрана, стерео по горизонтали */
  function place(o, busName, wet) {
    const q = w2s(o);
    const dx = (q.x - CW / 2) / (CW / 2), dy = (q.y - CH / 2) / (CH / 2);
    const far = Math.hypot(dx, dy);
    if (far > 3) return null;
    const zoom = clamp(G.view.s / 4, .35, 1.2);
    const g = ac.createGain();
    g.gain.value = clamp(1 - far * .32, .12, 1) * zoom;
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (p) { p.pan.value = clamp(dx * .7, -.85, .85); g.connect(p); p.connect(bus[busName]) } else g.connect(bus[busName]);
    if (wet) { const w = ac.createGain(); w.gain.value = wet * g.gain.value; g.connect(w); w.connect(verb) }
    return g;
  }

  /* ---------- эффекты карты ---------- */
  function boom(o, small) {
    const now = ac.currentTime;
    if (now - lastBoom < .12) { if (++boomsNow > 3) return } else boomsNow = 0;
    lastBoom = now;
    const d = place(o, 'sfx', .9);
    if (!d) return;
    const t = now + Math.random() * .05, k = small ? .45 : 1;
    /* глухой удар + затухающий низкий гул + немного «осыпи» */
    tone(d, t, 1.1 * k + .3, { f0: 70 + Math.random() * 15, f1: 34, vol: .55 * k, att: .004 });
    noise(d, t, 1.6 * k + .4, { f0: 900, f1: 70, vol: .5 * k, att: .006 });
    noise(d, t + .05, 2.4 * k, { type: 'bandpass', f0: 260, f1: 90, q: .5, vol: .12 * k, att: .2 });
  }

  function airBurst(o, small) {
    const d = place(o, 'sfx', 1.1);
    if (!d) return;
    const t = ac.currentTime, k = small ? .5 : 1;
    tone(d, t, .6, { f0: 140, f1: 60, vol: .25 * k, att: .003 });
    noise(d, t, .9, { f0: 2200, f1: 180, vol: .22 * k, att: .003 });
  }

  function gun(o) {
    const now = ac.currentTime;
    if (now - lastShot < .25) return;
    lastShot = now;
    const d = place(o, 'sfx', .5);
    if (!d) return;
    const n = 4 + (Math.random() * 4 | 0);
    for (let i = 0; i < n; i++) {
      const t = now + i * (.07 + Math.random() * .02);
      noise(d, t, .07, { type: 'bandpass', f0: 1100 + Math.random() * 400, q: .9, vol: .16, att: .001 });
      tone(d, t, .06, { f0: 180, f1: 90, vol: .08, att: .001 });
    }
  }

  function launch(o) {
    const d = place(o, 'sfx', .7);
    if (!d) return;
    const t = ac.currentTime;
    /* старт: хлопок и нарастающий шипящий свист, уходящий вверх и вдаль */
    tone(d, t, .35, { f0: 95, f1: 50, vol: .22, att: .003 });
    noise(d, t + .02, 2.2, { type: 'bandpass', f0: 380, f1: 2400, q: 1.2, vol: .18, att: .12 });
  }

  /* ---------- эфир ---------- */
  function radio(cls) {
    if (!ready()) return;
    const now = ac.currentTime;
    if (now - lastRadio < .35) return;
    lastRadio = now;
    const d = bus.radio, t = now;
    /* щелчок тангенты, короткий шорох и тихий «roger beep» */
    noise(d, t, .09, { type: 'bandpass', f0: 1800, q: 1.4, vol: .09, att: .002 });
    tone(d, t + .1, .05, { f0: cls === 'w' || cls === 'crit' ? 760 : 1180, vol: .035 });
    if (cls === 'crit') tone(d, t + .17, .07, { f0: 620, vol: .035 });
  }

  function chime() {
    if (!ready()) return;
    const t = ac.currentTime;
    tone(bus.radio, t, .5, { f0: 880, vol: .03, wave: 'triangle' });
    tone(bus.radio, t + .12, .7, { f0: 1320, vol: .025, wave: 'triangle' });
  }

  /** сирена воздушной тревоги: далёкая, через ревер, два плавных подъёма */
  function siren() {
    if (!ready()) return;
    const t = ac.currentTime, dur = 9;
    const o = ac.createOscillator(); o.type = 'sawtooth';
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = ac.createGain();
    o.frequency.setValueAtTime(260, t);
    for (let i = 0; i < 2; i++) {
      o.frequency.linearRampToValueAtTime(520, t + i * 4.5 + 2.2);
      o.frequency.linearRampToValueAtTime(260, t + i * 4.5 + 4.5);
    }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + 1.2);
    g.gain.setValueAtTime(.05, t + dur - 1.5); g.gain.linearRampToValueAtTime(0, t + dur);
    const w = ac.createGain(); w.gain.value = .9;
    o.connect(f); f.connect(g); g.connect(bus.sfx); g.connect(w); w.connect(verb);
    o.start(t); o.stop(t + dur + .1);
  }

  /* ---------- фон: ветер, дождь, дальний гул ---------- */
  function startAmbient() {
    const mk = (type, f, q) => {
      const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ac.createGain(); g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(bus.amb); s.start();
      return { fl, g };
    };
    amb = { wind: mk('lowpass', 380, .8), rain: mk('bandpass', 2600, .4), hum: mk('lowpass', 90, .9), t: 0 };
  }

  /* ---------- музыка: медленный эмбиент на аккордах ---------- */
  const PROG_DAY = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]];   /* Am7 · F · C · G */
  const PROG_NIGHT = [[50, 57, 60, 65], [46, 53, 58, 62], [41, 48, 57, 60], [48, 55, 58, 63]]; /* Dm · B♭ · F · Cm — темнее */
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  function startMusic() {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = .3;
    const g = ac.createGain(); g.gain.value = .5;
    const w = ac.createGain(); w.gain.value = .8;
    lp.connect(g); g.connect(bus.music); g.connect(w); w.connect(verb);
    /* «сердцебиение» тревоги: тихий низкий пульс, когда на радарах цели */
    const pulse = ac.createGain(); pulse.gain.value = 0; pulse.connect(bus.music);
    mus = { lp, g, pulse, i: 0, next: ac.currentTime + 1, beat: ac.currentTime + 1, night: false, tension: 0 };
  }

  function chord(notes, t, dur) {
    for (const n of notes) {
      for (const det of [-6, 5]) {
        const o = ac.createOscillator(); o.type = n < 52 ? 'triangle' : 'sine';
        o.frequency.value = midi(n - 12 * (n > 64 ? 1 : 0));
        o.detune.value = det + Math.random() * 3;
        const g = ac.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(.035, t + dur * .35);
        g.gain.linearRampToValueAtTime(.025, t + dur * .7);
        g.gain.linearRampToValueAtTime(0, t + dur + 2.5);
        o.connect(g); g.connect(mus.lp);
        o.start(t); o.stop(t + dur + 2.6);
      }
    }
    /* редкие ноты сверху — «звёзды» */
    if (Math.random() < .55) {
      const top = notes[(Math.random() * notes.length) | 0] + 12;
      tone(mus.lp, t + dur * (.3 + Math.random() * .4), 3.5, { f0: midi(top), vol: .018, att: .8, wave: 'sine' });
    }
  }

  /* ---------- каждый кадр: фон и музыка под обстановку ---------- */
  function update() {
    if (!ac || !G) return;
    const t = ac.currentTime;
    const night = G.phase === 'night';
    const w = G.weather || {}, wind = (G.wind && G.wind.v) || 0;
    const vis = w.vis;
    /* ветер: громче и выше при сильном ветре, медленные «порывы» */
    const gust = .6 + .4 * Math.sin(t * .23) * Math.sin(t * .071 + 1);
    amb.wind.g.gain.setTargetAtTime((.05 + Math.min(wind, 20) * .012) * gust, t, 1.2);
    amb.wind.fl.frequency.setTargetAtTime(220 + wind * 22 * gust, t, 1.5);
    amb.rain.g.gain.setTargetAtTime(vis === 'rain' ? .07 : vis === 'snow' ? .015 : 0, t, 2);
    /* дальний гул ночью — когда в воздухе цели, он плотнее */
    const busy = (G.det || G.threats.length) ? 1 : 0;
    amb.hum.g.gain.setTargetAtTime(night ? .05 + busy * .06 : .02, t, 3);
    /* музыка */
    mus.tension += ((night && busy ? 1 : 0) - mus.tension) * .01;
    mus.lp.frequency.setTargetAtTime(night ? 900 + mus.tension * 500 : 1500, t, 2);
    if (t >= mus.next) {
      const prog = night ? PROG_NIGHT : PROG_DAY;
      const dur = night ? 10 : 12;
      chord(prog[mus.i++ % prog.length], mus.next, dur);
      mus.next += dur;
    }
    /* пульс: очень тихий низкий удар, только при целях на радарах */
    if (mus.tension > .15 && t >= mus.beat) {
      const k = mus.tension;
      tone(bus.music, mus.beat, .5, { f0: 62, f1: 40, vol: .09 * k, att: .01 });
      tone(bus.music, mus.beat + .28, .4, { f0: 55, f1: 38, vol: .05 * k, att: .01 });
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
    for (const k of ['sfx', 'radio', 'amb', 'music']) bus[k].gain.setTargetAtTime(cfg[k], ac.currentTime, .1);
  }

  function set(k, v) { cfg[k] = v; save(); apply(); }

  function panelHTML() {
    const sl = (k, n) => `<div class="row"><span>${n}</span><input type="range" min="0" max="100" value="${Math.round(cfg[k] * 100)}" data-snd="${k}"></div>`;
    return `<h1>Звук</h1>
    <div class="row"><span>Звук</span><button class="btn sm ${cfg.on ? 'on' : ''}" data-a="sndToggle">${cfg.on ? 'включён' : 'выключен'}</button></div>
    ${sl('master', 'Общая громкость')}${sl('sfx', 'Бой: разрывы, пуски, очереди')}${sl('radio', 'Эфир и сводки')}${sl('amb', 'Фон: ветер, дождь, гул')}${sl('music', 'Музыка')}
    <p class="mu">Весь звук синтезируется на лету. Разрывы тише и глуше, если они далеко от центра экрана.</p>
    <div class="acts"><button class="btn pri" data-a="close">Готово</button></div>`;
  }

  function init() {
    const go = () => unlock();
    window.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
    document.addEventListener('input', e => {
      const k = e.target.dataset && e.target.dataset.snd;
      if (k) set(k, e.target.value / 100);
    });
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
