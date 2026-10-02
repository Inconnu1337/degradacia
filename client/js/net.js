'use strict';
/* ============================================================
   СВЯЗЬ С СЕРВЕРОМ (WebSocket /ws)
   Net.cmd(имя, аргументы) → Promise ответа { ok, error?, … }.
   При обрыве переподключается и возвращается в ту же партию
   (код партии и сторона — в адресной строке: #room=ABCD&side=def).
   Входящие сообщения разбирает store.js (Store.onMessage).
   ============================================================ */

const Net = (() => {
  let ws = null, seq = 0, wantOpen = false, retry = 0;
  const pending = new Map();
  let onOpen = null;

  function url() {
    const p = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return p + '//' + location.host + '/ws';
  }

  function connect(cb) {
    onOpen = cb || onOpen;
    wantOpen = true;
    ws = new WebSocket(url());
    ws.onopen = () => { retry = 0; Store.setLink(true); if (onOpen) onOpen() };
    ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data) } catch (err) { return }
      if (m.t === 'res') {
        const p = pending.get(m.id);
        if (p) { pending.delete(m.id); p(m.res) }
        return;
      }
      Store.onMessage(m);
    };
    ws.onclose = () => {
      for (const p of pending.values()) p({ ok: false, error: 'нет связи' });
      pending.clear();
      Store.setLink(false);
      if (wantOpen) setTimeout(() => connect(), Math.min(5000, 400 * Math.pow(1.7, retry++)));
    };
  }

  const open = () => ws && ws.readyState === 1;

  function send(o) { if (open()) ws.send(JSON.stringify(o)) }

  /** команда стороны; ответ приходит после свежего снимка */
  function cmd(name, args) {
    if (!open()) return Promise.resolve({ ok: false, error: 'нет связи' });
    const id = ++seq;
    return new Promise(res => {
      pending.set(id, res);
      ws.send(JSON.stringify({ t: 'cmd', id, name, args: args || {} }));
    });
  }

  return { connect, send, cmd, open };
})();

/** короткая запись: команда стороны с выводом ошибки в консоль */
function cmd(name, args) {
  return Net.cmd(name, args).then(res => {
    if (!res.ok) console.warn('команда', name, '→', res.error);
    return res;
  });
}
