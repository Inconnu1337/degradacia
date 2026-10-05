'use strict';
/* ============================================================
   ХОЛСТ: преобразование координат, эффекты, цвета
   ============================================================ */

/*
   ANIM  — часы интерфейса: идут всегда (мигание выделения, маячки, тревога)
   GANIM — часы мира: идут только когда ночью идёт время; на паузе
           замирают пропеллеры, огонь, облака, осадки, вспышки разрывов
*/
let cv, cx, CW = 0, CH = 0, DPR = 1, ANIM = 0, GANIM = 0;
const worldRuns = () => G && G.phase === 'night' && G.speed > 0;

function initCanvas() {
  cv = $('#map');
  cx = cv.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  CW = cv.clientWidth; CH = cv.clientHeight;
  cv.width = Math.round(CW * DPR);
  cv.height = Math.round(CH * DPR);
}

const w2s = p => ({ x: (p.x - G.view.x) * G.view.s + CW / 2, y: (p.y - G.view.y) * G.view.s + CH / 2 });

const s2w = p => ({ x: (p.x - CW / 2) / G.view.s + G.view.x, y: (p.y - CH / 2) / G.view.s + G.view.y });

const onScreen = (q, m) => q.x > -(m || 60) && q.x < CW + (m || 60) && q.y > -(m || 60) && q.y < CH + (m || 60);

/* ---------- эффекты ---------- */
/** вспышка на карте; её возраст считается по часам мира — на паузе она замирает */
function fx(o) {
  o.t0 = GANIM * 1000;
  if (o.k === 'boom' || o.k === 'air') blastAdd(o);
  G.fx.push(o); if (G.fx.length > 320) G.fx.shift();
}

/* ---------- цвета ---------- */
function stColor(u) {
  if (u.st === 'move' || u.st === 'air') return '#6cc3ff';
  if (u.st !== 'ready') return '#f2b33d';
  if (UT[u.k].w && u.am === 0) return '#ff5b47';
  if (u.hp < UT[u.k].hp * .6) return '#f2b33d';
  return '#6fd18d';
}

const thColor = th => th.idLv <= 0 ? AIR_COL.unknown : AIR_COL[percCls(th)] || AIR_COL.unknown;
