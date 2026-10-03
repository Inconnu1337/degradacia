'use strict';
/* ============================================================
   КОМНАТА: одна партия
   Держит движок, подключённых игроков по сторонам, журналы для
   переподключения и рассылает снимки/события.
   Сторона может быть у нескольких клиентов сразу (совместная игра).
   ============================================================ */
const { createEngine, HUMANS } = require('./engine');

const TICK_MS = 50;          /* шаг серверного цикла */
const SNAP_MS = 100;         /* снимки клиентам: 10 в секунду */
const LOG_KEEP = 280;        /* строк журнала на вкладку для переподключившихся */
const IDLE_MS = 10 * 60e3;   /* пустая комната живёт 10 минут */

const SIDE_NAME = { def: 'штаб ПВО', atk: 'сторона налёта' };

class Room {
  /** saved — содержимое файла сохранения (если партия загружается) */
  constructor(id, mode, saved) {
    this.id = id;
    this.mode = mode;
    this.humans = HUMANS[mode];
    this.engine = createEngine(mode);
    this.clients = new Set();
    this.logs = {};
    this.modal = {};
    for (const r of this.humans) { this.logs[r] = { radio: [], intel: [], mind: [] }; this.modal[r] = null }
    this.emptySince = Date.now();
    this.lastTick = Date.now();
    this.lastSnap = 0;
    this.dispatch(this.engine.drain());
    if (saved) {
      this.engine.load(saved.state);
      this.engine.drain();
      for (const r of this.humans) {
        const L = saved.logs && saved.logs[r];
        if (L) for (const box of ['radio', 'intel', 'mind']) this.logs[r][box] = (Array.isArray(L[box]) ? L[box] : [])
          .slice(-LOG_KEEP).filter(ev => ev && typeof ev.html === 'string').map(ev => ({ e: 'log', box, html: ev.html, cls: String(ev.cls || '') }));
      }
    }
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** сколько клиентов на каждой стороне */
  seats() {
    const s = {};
    for (const r of this.humans) s[r] = 0;
    for (const c of this.clients) s[c.role]++;
    return s;
  }

  /** свободная сторона (для входа по ссылке) */
  freeSide() { const s = this.seats(); return this.humans.find(r => !s[r]) || null }

  join(client, role) {
    if (!this.humans.includes(role)) role = this.freeSide() || this.humans[0];
    client.room = this; client.role = role;
    this.clients.add(client);
    client.send({ t: 'joined', room: this.id, mode: this.mode, role, humans: this.humans, seats: this.seats(), logs: this.logs[role], modal: this.modal[role] });
    client.sendRaw(this.snapMsg(role, this.engine.view(role)));
    this.broadcastSeats(client, `${SIDE_NAME[role]}: игрок подключился`);
  }

  leave(client) {
    if (!this.clients.delete(client)) return;
    if (!this.clients.size) this.emptySince = Date.now();
    this.broadcastSeats(null, `${SIDE_NAME[client.role]}: игрок отключился`);
  }

  broadcastSeats(except, note) {
    const seats = this.seats();
    for (const c of this.clients) c.send({ t: 'seats', seats, note: c === except || this.humans.length < 2 ? null : note });
  }

  command(client, id, name, args) {
    /* сохранение: полное состояние + журналы — файлом этому клиенту */
    if (name === 'save') {
      let res;
      try {
        const state = this.engine.save();
        const file = { game: 'night-raid', saved: new Date().toISOString(), room: this.id, role: client.role, state, logs: this.logs };
        client.send({ t: 'save', name: `night-raid-${this.mode}-day${state.night}-${this.id}.json`, data: file });
        res = { ok: true };
      } catch (e) { res = { ok: false, error: e.message } }
      return client.send({ t: 'res', id, res });
    }
    /* снова открыть закрытое окно разбора/итогов — это забота комнаты, не правил */
    if (name === 'reopen') {
      const html = this.modal[client.role];
      if (html) client.send({ t: 'ev', list: [{ e: 'modal', html }] });
      return client.send({ t: 'res', id, res: { ok: !!html } });
    }
    let res;
    try { res = this.engine.command(client.role, name, args) } catch (e) {
      console.error(`[${this.id}] команда ${name}:`, e);
      res = { ok: false, error: 'ошибка сервера' };
    }
    /* сначала события и свежий снимок, потом ответ: клиент обрабатывает ответ уже на новом состоянии */
    this.dispatch(this.engine.drain());
    this.sendSnaps();
    client.send({ t: 'res', id, res });
  }

  tick() {
    const now = Date.now(), dt = now - this.lastTick;
    this.lastTick = now;
    const seats = this.seats();
    try { this.engine.tick(dt, seats) } catch (e) {
      console.error(`[${this.id}] тик:`, e);
    }
    this.dispatch(this.engine.drain());
    if (now - this.lastSnap >= SNAP_MS) this.sendSnaps();
  }

  snapMsg(role, viewJson) { return `{"t":"snap","at":${Date.now()},"v":${viewJson}}` }

  sendSnaps() {
    this.lastSnap = Date.now();
    const cache = {};
    for (const c of this.clients) {
      const msg = cache[c.role] || (cache[c.role] = this.snapMsg(c.role, this.engine.view(c.role)));
      c.sendRaw(msg);
    }
  }

  /** события движка → журналы комнаты и клиенты сторон */
  dispatch(events) {
    if (!events.length) return;
    const per = {};
    for (const r of this.humans) per[r] = [];
    for (const ev of events) {
      const to = ev.to === '*' ? this.humans : this.humans.includes(ev.to) ? [ev.to] : [];
      delete ev.to;
      for (const r of to) {
        if (ev.e === 'log') {
          const box = this.logs[r][ev.box];
          if (box) { box.push(ev); if (box.length > LOG_KEEP) box.shift() }
        } else if (ev.e === 'clear') {
          this.logs[r] = { radio: [], intel: [], mind: [] };
        } else if (ev.e === 'modal') this.modal[r] = ev.html;
        per[r].push(ev);
      }
    }
    for (const c of this.clients) if (per[c.role].length) c.send({ t: 'ev', list: per[c.role] });
  }

  idle() { return !this.clients.size && Date.now() - this.emptySince > IDLE_MS }

  close() { clearInterval(this.timer) }
}

module.exports = { Room, TICK_MS, SNAP_MS };
