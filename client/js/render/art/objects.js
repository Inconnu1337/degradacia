'use strict';
/* ============================================================
   СИЛУЭТЫ: защищаемые объекты
   ============================================================ */

/* ============================================================
   ЗАЩИЩАЕМЫЕ ОБЪЕКТЫ — тоже не квадратики
   ============================================================ */
const ART_OBJ = {
  power(g, c) {   /* ТЭС: корпус, две трубы, дым */
    box(g, -.5, -.22, .72, .44, '#3d4550', '#11161c');
    g.fillStyle = '#6b7684';
    for (const x of [.10, .30]) { g.beginPath(); g.ellipse(x, -.02, .10, .10, 0, 0, 7); g.fill(); g.strokeStyle = '#1a2028'; g.lineWidth = .02; g.stroke() }
    g.fillStyle = 'rgba(180,190,200,.16)';
    g.beginPath(); g.ellipse(.22, -.34, .30, .16, 0, 0, 7); g.fill();
    g.strokeStyle = '#59636f'; g.lineWidth = .025;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-.46 + i * .22, -.22); g.lineTo(-.46 + i * .22, .22); g.stroke() }
  },
  sub(g, c) {     /* подстанция: портал и трансформаторы */
    g.strokeStyle = '#7b8794'; g.lineWidth = .035;
    g.beginPath(); g.moveTo(-.46, -.30); g.lineTo(-.46, .30); g.moveTo(.46, -.30); g.lineTo(.46, .30); g.stroke();
    g.lineWidth = .022;
    for (const y of [-.22, 0, .22]) { g.beginPath(); g.moveTo(-.46, y); g.lineTo(.46, y); g.stroke() }
    for (const x of [-.18, .12]) box(g, x, -.13, .18, .26, '#4a545f', '#161c22');
  },
  dam(g, c) {     /* ГЭС: плотина и водосброс */
    fs(g, [[-.5, -.14], [.5, -.26], [.5, .10], [-.5, .22]], '#59636d', '#181e24', .022);
    g.fillStyle = 'rgba(120,200,235,.4)';
    for (let i = 0; i < 4; i++) { rr(g, -.34 + i * .20, .04, .12, .26, .02); g.fill() }
    box(g, .16, -.36, .28, .18, '#424b55', '#161c22');
  },
  port(g, c) {    /* порт: причал и два крана */
    fs(g, [[-.5, .10], [.5, .02], [.5, .26], [-.5, .34]], '#4d5660', '#171d23', .02);
    for (const x of [-.24, .16]) {
      g.strokeStyle = '#8a95a0'; g.lineWidth = .035;
      g.beginPath(); g.moveTo(x, .14); g.lineTo(x, -.24); g.lineTo(x + .30, -.32); g.stroke();
    }
    g.fillStyle = '#5b4f3c'; rr(g, -.46, -.18, .16, .22, .02); g.fill();
  },
  oil(g, c) {     /* нефтебаза: резервуары */
    for (const [x, y, r] of [[-.24, -.06, .19], [.10, -.14, .16], [.24, .16, .14], [-.14, .22, .12]]) {
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = '#4b5158'; g.fill();
      g.strokeStyle = '#151a1f'; g.lineWidth = .022; g.stroke();
      g.strokeStyle = 'rgba(190,200,210,.35)'; g.lineWidth = .014;
      g.beginPath(); g.arc(x, y, r * .55, 0, 7); g.stroke();
    }
  },
  air(g, c) {     /* авиабаза: ВПП и рулёжка */
    g.save(); g.rotate(-.3);
    fs(g, [[-.5, -.07], [.5, -.07], [.5, .07], [-.5, .07]], '#3a3f45', '#14181d', .02);
    g.strokeStyle = 'rgba(230,235,240,.55)'; g.lineWidth = .016; g.setLineDash([.08, .07]);
    g.beginPath(); g.moveTo(-.44, 0); g.lineTo(.44, 0); g.stroke(); g.setLineDash([]);
    g.restore();
    fs(g, [[.06, .12], [.40, .26], [.40, .34], [.02, .22]], '#3a3f45');
    for (const x of [.14, .30]) { g.fillStyle = '#4c545c'; g.beginPath(); g.arc(x, .30, .06, Math.PI, 0); g.fill() }
  },
  rail(g, c) {    /* ж/д узел: пути и стрелки */
    g.strokeStyle = '#7d8894'; g.lineWidth = .022;
    for (const y of [-.18, -.06, .06, .18]) { g.beginPath(); g.moveTo(-.5, y); g.lineTo(.5, y); g.stroke() }
    g.lineWidth = .018;
    g.beginPath(); g.moveTo(-.2, -.18); g.lineTo(.1, .18); g.moveTo(.0, -.18); g.lineTo(.3, .18); g.stroke();
    box(g, -.44, -.34, .30, .12, '#4b5560', '#161c22');
  },
  plant(g, c) {   /* завод: цеха с пилообразной крышей */
    box(g, -.5, -.20, .68, .44, '#434c56', '#141a20');
    g.strokeStyle = '#6a7580'; g.lineWidth = .02;
    for (let i = 0; i < 5; i++) { const x = -.46 + i * .14; g.beginPath(); g.moveTo(x, .24); g.lineTo(x + .07, -.20); g.stroke() }
    box(g, .22, -.12, .26, .30, '#4b555f', '#141a20');
    g.fillStyle = '#6b7684'; g.beginPath(); g.ellipse(.40, -.24, .06, .06, 0, 0, 7); g.fill();
  },
  water(g, c) {   /* водозабор: насосная и отстойники */
    box(g, -.44, -.14, .34, .30, '#454e58', '#141a20');
    for (const [x, y] of [[.12, -.14], [.12, .12], [.36, -.02]]) {
      g.beginPath(); g.arc(x, y, .13, 0, 7); g.fillStyle = 'rgba(90,150,180,.6)'; g.fill();
      g.strokeStyle = '#1a2128'; g.lineWidth = .02; g.stroke();
    }
  }
};
