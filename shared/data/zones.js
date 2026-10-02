'use strict';
/* ============================================================
   РАЙОНЫ ПУСКА противника
   ============================================================ */

/* ---------- районы пуска противника ---------- */
const ZONES = [
  { id: 'tarsk', n: 'Тарск', x: 462, y: 50, r: 8, k: ['jalo', 'moth', 'shershen', 'strizh', 'grach', 'vual', 'molot', 'sova'] },
  { id: 'belsk', n: 'Бельск', x: 470, y: 198, r: 8, k: ['jalo', 'moth', 'shershen', 'strizh', 'grach', 'vual', 'molot', 'sova'] },
  { id: 'sarma', n: 'полуостров Сарма', x: 402, y: 336, r: 6, k: ['jalo', 'moth', 'shershen', 'grach', 'molot', 'sova'] },
  { id: 'sea', n: 'Южное море', x: 250, y: 352, r: 40, k: ['krechet'], sea: 1 },
  { id: 'bomb', n: 'рубеж пусков «Восход»', x: 575, y: 70, r: 25, k: ['albatros'], off: 1 },
  { id: 'mig', n: 'зона носителей «Гарпии»', x: 545, y: 170, r: 15, k: ['garpia'], off: 1 }
];

const AIRBASE_E = 'аэродром «Северная Гряда»';
