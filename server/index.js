'use strict';
/* ============================================================
   СЕРВЕР «НОЧНОЙ РУБЕЖ»
   HTTP: раздаёт client/ (корень сайта) и shared/ (/shared/…).
   WebSocket (/ws): лобби и партии. Вся игровая логика — в комнатах
   (server/room.js), у клиента только отрисовка и ввод.

   Протокол (JSON)
     клиент → сервер
       { t:'create', mode, role }       новая партия (mode: defense | attack | duel)
       { t:'join', room, role? }        войти по коду (role не задан — свободная сторона)
       { t:'leave' }                    выйти в меню
       { t:'load', file, role? }        новая партия из файла сохранения
       { t:'cmd', id, name, args }      команда стороны (см. game/commands.js, game/api.js)
     сервер → клиент
       { t:'joined', room, mode, role, humans, seats, logs, modal }
       { t:'snap', at, v:{ G, E, S } }  снимок обстановки глазами стороны
       { t:'ev', list:[…] }             события: log · toast · fx · modal · clear
       { t:'res', id, res }             ответ на команду
       { t:'seats', seats, note }       кто подключён
       { t:'save', name, data }         файл сохранения (ответ на команду save)
       { t:'error', msg }
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Room } = require('./room');
const { MODES } = require('./engine');

const ROOT = path.join(__dirname, '..');
const STATIC = [['/shared/', path.join(ROOT, 'shared')], ['/', path.join(ROOT, 'client')]];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const rooms = new Map();
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_ABC[Math.random() * CODE_ABC.length | 0];
    if (!rooms.has(c)) return c;
  }
}

function serveStatic(req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname) } catch (e) { res.writeHead(400); return res.end() }
  if (url === '/') url = '/index.html';
  for (const [prefix, dir] of STATIC) {
    if (!url.startsWith(prefix)) continue;
    const file = path.join(dir, url.slice(prefix.length));
    if (!file.startsWith(dir + path.sep)) break;
    return fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Не найдено') }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }
  res.writeHead(404); res.end('Не найдено');
}

function createServer() {
  const server = http.createServer(serveStatic);
  /* большой предел — ради загрузки сохранения; обычные сообщения маленькие */
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 * 1024 });

  wss.on('connection', ws => {
    const client = {
      room: null, role: null, cmdT: 0, cmdN: 0,
      send(o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)) },
      sendRaw(s) { if (ws.readyState === 1) ws.send(s) }
    };
    const leave = () => { if (client.room) client.room.leave(client); client.room = null; client.role = null };

    ws.on('message', raw => {
      let m;
      try { m = JSON.parse(raw) } catch (e) { return }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'create') {
        if (!MODES.includes(m.mode)) return client.send({ t: 'error', msg: 'Неизвестный режим' });
        leave();
        const room = new Room(newCode(), m.mode);
        rooms.set(room.id, room);
        room.join(client, m.role);
      } else if (m.t === 'join') {
        const room = rooms.get(String(m.room || '').toUpperCase());
        if (!room) return client.send({ t: 'error', msg: 'Партия не найдена: код неверный или она закрылась' });
        leave();
        room.join(client, m.role);
      } else if (m.t === 'load') {
        /* загрузка сохранения: новая партия с новым кодом, состояние из файла */
        const f = m.file;
        if (!f || f.game !== 'night-raid' || !f.state || !MODES.includes(f.state.mode))
          return client.send({ t: 'error', msg: 'Это не файл сохранения «Ночного рубежа»' });
        let room;
        try { room = new Room(newCode(), f.state.mode, f) } catch (e) {
          return client.send({ t: 'error', msg: 'Сохранение не загрузилось: ' + e.message });
        }
        leave();
        rooms.set(room.id, room);
        room.join(client, m.role || f.role);
      } else if (m.t === 'leave') leave();
      else if (m.t === 'cmd') {
        if (!client.room) return client.send({ t: 'res', id: m.id, res: { ok: false, error: 'нет партии' } });
        /* не больше 30 команд в секунду с соединения */
        const now = Date.now();
        if (now - client.cmdT > 1000) { client.cmdT = now; client.cmdN = 0 }
        if (++client.cmdN > 30) return client.send({ t: 'res', id: m.id, res: { ok: false, error: 'слишком часто' } });
        client.room.command(client, m.id, m.name, m.args);
      }
    });
    ws.on('close', leave);
  });

  const sweep = setInterval(() => {
    for (const [id, r] of rooms) if (r.idle()) { r.close(); rooms.delete(id) }
  }, 30e3);
  server.on('close', () => { clearInterval(sweep); for (const r of rooms.values()) r.close(); rooms.clear(); wss.close() });
  return server;
}

module.exports = { createServer, rooms };

if (require.main === module) {
  const port = +process.env.PORT || 8080;
  createServer().listen(port, () => console.log(`Ночной рубеж: http://localhost:${port}`));
}
