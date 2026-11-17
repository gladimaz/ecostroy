/* =====================================================================
   Конструктор планировки ЭкоСтройИнвест.
   План: дом-прямоугольник w×d (метры, сетка 0,5 м), перегородки, окна,
   двери, комнаты, терраса. Цены здесь НЕ хранятся — расчёт делает
   калькулятор в index.html по CONFIG, сюда он передаёт только состояние.
   ===================================================================== */
window.Planner = (function () {
  'use strict';
  const G = 0.5, MINS = 4, MAXS = 20;          // шаг сетки и пределы стороны дома, м
  const snap = v => Math.round(v / G) * G;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fm = v => String(Math.round(v * 10) / 10).replace('.', ',');
  const nid = () => 'w' + Math.random().toString(36).slice(2, 9);
  const SIDES = ['N', 'S', 'W', 'E'];
  const SIDE_NAME = { N: 'Сверху', S: 'Снизу', W: 'Слева', E: 'Справа' };
  const isOuter = h => SIDES.indexOf(h) >= 0;

  const ROOMS = [
    { id: 'living', name: 'Кухня-гостиная', c: '#fde9c8' },
    { id: 'kitchen', name: 'Кухня', c: '#ffdfb3' },
    { id: 'bed', name: 'Спальня', c: '#d9e8f7' },
    { id: 'kids', name: 'Детская', c: '#e6dff7' },
    { id: 'bath', name: 'Санузел', c: '#cdecec' },
    { id: 'hall', name: 'Прихожая', c: '#e9e5d8' },
    { id: 'boiler', name: 'Котельная', c: '#f7dbd4' },
    { id: 'store', name: 'Кладовая', c: '#e4e9cf' },
    { id: 'office', name: 'Кабинет', c: '#dcefd9' },
    { id: '', name: 'Без названия', c: '#f6f4ee' }
  ];
  const roomType = id => ROOMS.find(r => r.id === id) || ROOMS[ROOMS.length - 1];

  const TOOLS = [
    { id: 'hand', name: 'Двигать', icon: '<path d="M6 3l13 8-6 1.6L10.4 19z" fill="currentColor"/>',
      hint: 'Тяните стены, окна и двери. Пустое место — двигать план, два пальца — масштаб.' },
    { id: 'wall', name: 'Стена', icon: '<path d="M3 12h18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="3.5" cy="12" r="2.6" fill="#fff" stroke="currentColor" stroke-width="1.6"/><circle cx="20.5" cy="12" r="2.6" fill="#fff" stroke="currentColor" stroke-width="1.6"/>',
      hint: 'Проведите по плану — появится перегородка.' },
    { id: 'win', name: 'Окно', icon: '<rect x="4" y="4" width="16" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="1.6"/>',
      hint: 'Нажмите на наружную стену — появится окно. Его можно тянуть вдоль стены.' },
    { id: 'door', name: 'Дверь', icon: '<path d="M5 20V5h2v15" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 5a14 14 0 0 1 13 15H7" fill="none" stroke="currentColor" stroke-width="1.6"/>',
      hint: 'Нажмите на стену: наружная — входная дверь, перегородка — межкомнатная.' },
    { id: 'room', name: 'Комната', icon: '<rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 10h9M7.5 14h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      hint: 'Нажмите на комнату и выберите её назначение.' },
    { id: 'erase', name: 'Удалить', icon: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
      hint: 'Нажмите на окно, дверь, перегородку или террасу, чтобы убрать.' }
  ];
  const ACTS = [
    { id: 'undo', name: 'Отменить', icon: '<path d="M8 5 3 10l5 5M3 10h11a5.5 5.5 0 0 1 0 11h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
    { id: 'redo', name: 'Повторить', icon: '<path d="M16 5l5 5-5 5M21 10H10a5.5 5.5 0 0 0 0 11h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
    { id: 'zout', name: 'Мельче', icon: '<path d="M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' },
    { id: 'zin', name: 'Крупнее', icon: '<path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' },
    { id: 'fit', name: 'Весь план', icon: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
    { id: 'v3d', name: '3D', icon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' }
  ];

  let host = null;                       // { state, CONFIG, onChange }
  const P = () => host.state.plan;
  let root, stage, svg, iso, panelEl, statsEl, hintEl, toastEl, noticeEl;
  let tool = 'hand', sel = null, view3d = false; let stale = 0;
  let box3, roofBtn, inst3 = null, no3d = false, roofOff = false;   // 3D-модель (house3d.js); если её нет — старая SVG-схема
  const view = { s: 40, ox: 20, oy: 20 };
  let autoFit = true, W = 0, H = 0;
  let hist = [], hi = -1;
  const ptrs = new Map();
  let drag = null, pinch = null, raf = 0, toastT = 0, noticeFn = null;

  /* ============================ Геометрия ============================ */
  function seg(h, p) {
    p = p || P();
    let s;
    if (h === 'N') s = { x1: 0, y1: 0, x2: p.w, y2: 0, outer: true };
    else if (h === 'S') s = { x1: 0, y1: p.d, x2: p.w, y2: p.d, outer: true };
    else if (h === 'W') s = { x1: 0, y1: 0, x2: 0, y2: p.d, outer: true };
    else if (h === 'E') s = { x1: p.w, y1: 0, x2: p.w, y2: p.d, outer: true };
    else {
      const wl = p.walls.find(w => w.id === h); if (!wl) return null;
      s = { x1: wl.x1, y1: wl.y1, x2: wl.x2, y2: wl.y2, outer: false };
    }
    s.hor = s.y1 === s.y2; s.len = s.hor ? s.x2 - s.x1 : s.y2 - s.y1;
    return s;
  }
  const opPoint = (o, s) => s.hor ? { x: s.x1 + o.t, y: s.y1 } : { x: s.x1, y: s.y1 + o.t };
  function dseg(m, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((m.x - x1) * dx + (m.y - y1) * dy) / l2, 0, 1) : 0;
    return Math.hypot(m.x - x1 - t * dx, m.y - y1 - t * dy);
  }
  function terRect(p) {
    const t = p.terrace; if (!t) return null;
    if (t.side === 'S') return { x: t.off, y: p.d, w: t.len, h: t.dep };
    if (t.side === 'N') return { x: t.off, y: -t.dep, w: t.len, h: t.dep };
    if (t.side === 'W') return { x: -t.dep, y: t.off, w: t.dep, h: t.len };
    return { x: p.w, y: t.off, w: t.dep, h: t.len };
  }
  function terHandle(p) {
    const r = terRect(p), t = p.terrace; if (!r) return null;
    if (t.side === 'S') return { x: r.x + r.w / 2, y: r.y + r.h };
    if (t.side === 'N') return { x: r.x + r.w / 2, y: r.y };
    if (t.side === 'W') return { x: r.x, y: r.y + r.h / 2 };
    return { x: r.x + r.w, y: r.y + r.h / 2 };
  }
  function terraceFor(p, area) {             // терраса по площади из калькулятора
    const dep = area >= 24 ? 3 : 2, len = clamp(snap(area / dep), 2, p.w);
    return { side: 'S', off: p.w - len, len, dep };
  }
  function geom(p) {                         // геометрия плана для 3D-модели
    return { w: p.w, d: p.d, walls: p.walls.map(w => ({ id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })),
      ops: p.ops.map(o => ({ type: o.type, host: o.host, t: o.t, w: o.w })), ter: terRect(p), terSide: p.terrace ? p.terrace.side : null,
      rooms: regions(p).map(R => ({ name: R.type ? roomType(R.type).name : 'Комната', area: R.area, x: R.lx, y: R.ly })) };
  }
  const sideLen = (p, side) => (side === 'N' || side === 'S') ? p.w : p.d;

  /* можно ли поставить проём o в точку t стены o.host; возвращает t или null */
  function fitT(p, o, t) {
    const s = seg(o.host, p); if (!s || s.len < o.w + 0.2) return null;
    t = clamp(Math.round(t * 10) / 10, o.w / 2 + 0.1, s.len - o.w / 2 - 0.1);
    for (const q of p.ops) if (q !== o && q.id !== o.id && q.host === o.host && Math.abs(q.t - t) < (q.w + o.w) / 2 + 0.1) return null;
    return t;
  }
  function nearestHost(m, type, tol) {
    const p = P(), list = type === 'door' ? SIDES.concat(p.walls.map(w => w.id)) : SIDES;
    let best = null;
    list.forEach(h => {
      const s = seg(h, p), dist = dseg(m, s.x1, s.y1, s.x2, s.y2);
      if (dist <= tol && (!best || dist < best.dist)) best = { host: h, dist, t: s.hor ? m.x - s.x1 : m.y - s.y1 };
    });
    return best;
  }

  /* Приводит план в порядок после любого изменения */
  function sanitize(p) {
    p.w = clamp(snap(p.w), MINS, MAXS); p.d = clamp(snap(p.d), MINS, MAXS);
    p.walls = p.walls.filter(wl => {
      const hor = wl.y1 === wl.y2, s0 = hor ? wl.x1 : wl.y1;
      wl.x1 = clamp(wl.x1, 0, p.w); wl.x2 = clamp(wl.x2, 0, p.w); wl.y1 = clamp(wl.y1, 0, p.d); wl.y2 = clamp(wl.y2, 0, p.d);
      const s1 = hor ? wl.x1 : wl.y1;
      if (s1 !== s0) p.ops.forEach(o => { if (o.host === wl.id) o.t += s0 - s1; });
      return hor ? (wl.x2 - wl.x1 >= G && wl.y1 > 0 && wl.y1 < p.d) : (wl.y2 - wl.y1 >= G && wl.x1 > 0 && wl.x1 < p.w);
    });
    const keep = [];
    p.ops.forEach(o => {
      const s = seg(o.host, p); if (!s) return;
      if (o.type === 'win' && !s.outer) return;
      if (s.len < o.w + 0.2) return;
      o.t = clamp(o.t, o.w / 2 + 0.1, s.len - o.w / 2 - 0.1);
      if (keep.some(q => q.host === o.host && Math.abs(q.t - o.t) < (q.w + o.w) / 2 + 0.05)) return;
      keep.push(o);
    });
    p.ops = keep;
    p.labels = p.labels.filter(l => l.x > 0 && l.x < p.w && l.y > 0 && l.y < p.d);
    if (p.terrace) {
      const t = p.terrace, L = sideLen(p, t.side);
      t.dep = clamp(snap(t.dep), 1, 6); t.len = clamp(snap(t.len), 1.5, L); t.off = clamp(snap(t.off), 0, L - t.len);
    }
    return p;
  }
  /* Склеивает перегородки, лежащие на одной линии и перекрывающиеся */
  function mergeWalls(p) {
    let again = true;
    while (again) {
      again = false;
      outer: for (let i = 0; i < p.walls.length; i++) for (let j = i + 1; j < p.walls.length; j++) {
        const a = p.walls[i], b = p.walls[j], ah = a.y1 === a.y2, bh = b.y1 === b.y2;
        if (ah !== bh) continue;
        const k1 = ah ? 'x1' : 'y1', k2 = ah ? 'x2' : 'y2', f = ah ? 'y1' : 'x1';
        if (a[f] !== b[f] || a[k1] > b[k2] || b[k1] > a[k2]) continue;
        const n1 = Math.min(a[k1], b[k1]), n2 = Math.max(a[k2], b[k2]);
        p.ops.forEach(o => { if (o.host === a.id) o.t += a[k1] - n1; else if (o.host === b.id) { o.t += b[k1] - n1; o.host = a.id; } });
        a[k1] = n1; a[k2] = n2; p.walls.splice(j, 1); again = true; break outer;
      }
    }
  }
  function resizePlan(p, side, size) {
    const hor = side === 'E' || side === 'W', K = hor ? 'w' : 'd';
    const a1 = hor ? 'x1' : 'y1', a2 = hor ? 'x2' : 'y2', b1 = hor ? 'y1' : 'x1', b2 = hor ? 'y2' : 'x2';
    const old = p[K]; size = clamp(snap(size), MINS, MAXS);
    const dl = size - old; if (!dl) return 0;
    const near = side === 'W' || side === 'N', sh = near ? dl : 0;
    p[K] = size;
    p.walls.forEach(wl => {
      if (wl[b1] === wl[b2]) {                       // стена идёт вдоль меняемой стороны
        const s0 = wl[a1];
        let n1 = wl[a1] + sh, n2 = wl[a2] + sh;
        if (near && wl[a1] === 0) n1 = 0;            // держится за сдвигаемую наружную стену
        if (!near && wl[a2] === old) n2 = size;
        n1 = clamp(n1, 0, size); n2 = clamp(n2, 0, size);
        p.ops.forEach(o => { if (o.host === wl.id) o.t += s0 + sh - n1; });
        wl[a1] = n1; wl[a2] = n2;
      } else { wl[a1] += sh; wl[a2] += sh; }
    });
    p.ops.forEach(o => { if (hor ? (o.host === 'N' || o.host === 'S') : (o.host === 'W' || o.host === 'E')) o.t += sh; });
    p.labels.forEach(l => { l[hor ? 'x' : 'y'] += sh; });
    if (p.terrace) { const ts = p.terrace.side; if (hor ? (ts === 'N' || ts === 'S') : (ts === 'W' || ts === 'E')) p.terrace.off += sh; }
    sanitize(p);
    return near ? p[K] - old : 0;
  }

  /* Комнаты: заливка по клеткам 0,5 м, перегородки — границы */
  function regions(p) {
    const nx = Math.round(p.w / G), ny = Math.round(p.d / G);
    const bv = new Uint8Array((nx + 1) * ny), bh = new Uint8Array(nx * (ny + 1));
    p.walls.forEach(wl => {
      if (wl.x1 === wl.x2) { const i = Math.round(wl.x1 / G); for (let j = Math.round(wl.y1 / G); j < Math.round(wl.y2 / G); j++) bv[j * (nx + 1) + i] = 1; }
      else { const j = Math.round(wl.y1 / G); for (let i = Math.round(wl.x1 / G); i < Math.round(wl.x2 / G); i++) bh[j * nx + i] = 1; }
    });
    const id = new Int16Array(nx * ny).fill(-1), out = [];
    for (let c0 = 0; c0 < nx * ny; c0++) {
      if (id[c0] >= 0) continue;
      const n = out.length, cells = [c0]; id[c0] = n;
      for (let q = 0; q < cells.length; q++) {
        const c = cells[q], i = c % nx, j = (c - i) / nx;
        const go = k => { if (id[k] < 0) { id[k] = n; cells.push(k); } };
        if (i + 1 < nx && !bv[j * (nx + 1) + i + 1]) go(c + 1);
        if (i > 0 && !bv[j * (nx + 1) + i]) go(c - 1);
        if (j + 1 < ny && !bh[(j + 1) * nx + i]) go(c + nx);
        if (j > 0 && !bh[j * nx + i]) go(c - nx);
      }
      let sx = 0, sy = 0, x0 = 1e9, x1 = -1e9;
      cells.forEach(c => { const i = c % nx, j = (c - i) / nx; sx += i; sy += j; if (i < x0) x0 = i; if (i > x1) x1 = i; });
      sx /= cells.length; sy /= cells.length;
      let bc = cells[0], bd = 1e9;
      cells.forEach(c => { const i = c % nx, j = (c - i) / nx, dd = (i - sx) * (i - sx) + (j - sy) * (j - sy); if (dd < bd) { bd = dd; bc = c; } });
      cells.sort((a, b) => a - b);
      let path = '';
      for (let k = 0; k < cells.length;) {
        let e = k; const j = Math.floor(cells[k] / nx);
        while (e + 1 < cells.length && cells[e + 1] === cells[e] + 1 && Math.floor(cells[e + 1] / nx) === j) e++;
        path += 'M' + (cells[k] % nx) * G + ' ' + j * G + 'h' + (e - k + 1) * G + 'v' + G + 'h' + -(e - k + 1) * G + 'z';
        k = e + 1;
      }
      out.push({ n, area: cells.length * G * G, lx: (bc % nx + 0.5) * G, ly: (Math.floor(bc / nx) + 0.5) * G, wid: (x1 - x0 + 1) * G, path, type: '' });
    }
    const cellOf = (x, y) => clamp(Math.floor(y / G), 0, ny - 1) * nx + clamp(Math.floor(x / G), 0, nx - 1);
    p.labels.forEach(l => { const R = out[id[cellOf(l.x, l.y)]]; if (R && !R.type) R.type = l.type; });
    out.at = (x, y) => (x < 0 || y < 0 || x > p.w || y > p.d) ? null : out[id[cellOf(x, y)]];
    return out;
  }

  /* ============================ Шаблоны ============================ */
  function template(w, d, opt) {
    opt = opt || {};
    w = clamp(snap(w), MINS, MAXS); d = clamp(snap(d), MINS, MAXS);
    const p = { w, d, walls: [], ops: [], labels: [], terrace: null, auto: !opt.empty };
    if (opt.empty) return p;
    const wall = (x1, y1, x2, y2) => { const o = { id: nid(), x1, y1, x2, y2 }; p.walls.push(o); return o; };
    const op = (type, hostId, t, wd) => p.ops.push({ id: nid(), type, host: hostId, t, w: wd || (type === 'win' ? 1.2 : 0.9) });
    const lab = (x, y, type) => p.labels.push({ x, y, type });
    const wins = [];
    if (w * d < 30 || d < 5.5) {                       // маленький дом: одна комната и санузел в углу
      const bw = 2, bh = Math.min(2, d - 2);
      const v = wall(w - bw, 0, w - bw, bh); wall(w - bw, bh, w, bh);
      lab(w / 2 - 1, d / 2 + 0.5, 'living'); lab(w - bw / 2, bh / 2, 'bath');
      op('door', v.id, bh / 2, 0.8); op('door', 'S', w - 1.5);
      wins.push(['S', (w - 3) / 2], ['W', d / 2], ['N', (w - bw) / 2], ['E', (bh + d) / 2]);
    } else {
      const h1 = clamp(snap(d * 0.45), 2.5, d - 3);     // глубина ряда спален
      const n = w >= 9.5 ? 3 : w >= 6.5 ? 2 : 1;
      const xs = [0]; for (let i = 1; i < n; i++) xs.push(snap(w * i / n)); xs.push(w);
      const cw = Math.max(1.5, Math.min(clamp(snap(w * 0.3), 2, 3), w - xs[n - 1] - 1));   // блок «прихожая + санузел»
      const xc = w - cw, bathH = clamp(snap((d - h1) * 0.45), 1.5, 2.5);
      const Hw = wall(0, h1, w, h1);
      for (let i = 1; i < n; i++) wall(xs[i], 0, xs[i], h1);
      const V = wall(xc, h1, xc, d), B = wall(xc, h1 + bathH, w, h1 + bathH);
      for (let i = 0; i < n; i++) {
        const mid = (xs[i] + xs[i + 1]) / 2;
        lab(mid, h1 / 2, 'bed');
        op('door', Hw.id, Math.max(xs[i] + 0.6, Math.min(mid, xc - 0.6)), 0.8);
        wins.push(['N', mid]);
      }
      lab(xc / 2, (h1 + d) / 2, 'living'); lab(xc + cw / 2, h1 + bathH / 2, 'bath'); lab(xc + cw / 2, (h1 + bathH + d) / 2, 'hall');
      op('door', B.id, cw / 2, 0.8); op('door', V.id, bathH + (d - h1 - bathH) / 2, 0.8); op('door', 'S', xc + cw / 2);
      if (xc >= 5) wins.push(['S', xc * 0.28], ['W', (h1 + d) / 2], ['S', xc * 0.72]); else wins.push(['S', xc / 2], ['W', (h1 + d) / 2]);
      wins.push(['E', h1 + bathH / 2, 0.6], ['W', h1 / 2], ['E', h1 / 2]);
      if (xc >= 7) wins.push(['S', xc * 0.5]);
    }
    const target = Math.max(3, Math.round(w * d / 9.5));
    wins.slice(0, target).forEach(a => op('win', a[0], a[1], a[2]));
    if (opt.terrace) {
      p.terrace = terraceFor(p, opt.terrace);
    }
    return sanitize(p);
  }
  function fromArea(foot, opt) {
    const d = clamp(snap(Math.sqrt(foot / 1.2)), MINS, MAXS), w = clamp(snap(foot / d), MINS, MAXS);
    return template(Math.max(w, d), Math.min(w, d), opt);
  }

  /* ============================ Показатели ============================ */
  function metrics(p) {
    const regs = regions(p);
    let win = 0, ent = 0, inner = 0, part = 0;
    p.ops.forEach(o => { if (o.type === 'win') win++; else if (isOuter(o.host)) ent++; else inner++; });
    p.walls.forEach(wl => { part += (wl.x2 - wl.x1) + (wl.y2 - wl.y1); });
    return { w: p.w, d: p.d, foot: p.w * p.d, per: 2 * (p.w + p.d), part, win, ent, inner,
             terrace: p.terrace ? p.terrace.len * p.terrace.dep : 0, rooms: regs };
  }
  function roomsText(regs) {
    const g = {};
    regs.forEach(R => { const k = R.type ? roomType(R.type).name.toLowerCase() : 'комната'; (g[k] = g[k] || []).push(R.area); });
    return Object.keys(g).map(k => k + ' ' + g[k].map(a => fm(a)).join(' и ') + ' м²').join(', ');
  }
  function describe(p, floorsName) {
    const m = metrics(p), out = [];
    out.push('Планировка' + (floorsName && floorsName !== '1 этаж' ? ' первого этажа' : '') + ': ' + fm(p.w) + '×' + fm(p.d) + ' м, ' + fm(m.foot) + ' м² по наружным стенам');
    out.push('Комнаты (' + m.rooms.length + '): ' + roomsText(m.rooms));
    out.push('Окон: ' + m.win + '; дверей: входных ' + m.ent + ', межкомнатных ' + m.inner + '; перегородки: ' + fm(m.part) + ' м');
    if (p.terrace) out.push('Терраса: ' + fm(p.terrace.len) + '×' + fm(p.terrace.dep) + ' м (' + fm(m.terrace) + ' м²), ' + SIDE_NAME[p.terrace.side].toLowerCase());
    return out;
  }

  /* ============================ История ============================ */
  function resetHistory() { hist = [JSON.stringify(P())]; hi = 0; }
  function commit(userEdit) {
    const p = P(); if (userEdit !== false) p.auto = false;
    const s = JSON.stringify(p);
    if (s === hist[hi]) { refresh(); return; }
    hist.length = hi + 1; hist.push(s); if (hist.length > 80) hist.shift();
    hi = hist.length - 1;
    host.onChange();
  }
  function travel(dir) {
    const k = hi + dir; if (k < 0 || k >= hist.length) return;
    hi = k; host.state.plan = JSON.parse(hist[hi]); sel = null; host.onChange();
  }
  function setPlan(p, fresh) {                 // новая планировка: шаблон, пустой лист, проект
    host.state.plan = p; sel = null; autoFit = true;
    if (fresh || !hist.length) resetHistory(); else { hist.length = hi + 1; hist.push(JSON.stringify(p)); hi = hist.length - 1; }
  }

  /* ============================ Отрисовка плана ============================ */
  const toM = pt => ({ x: (pt.x - view.ox) / view.s, y: (pt.y - view.oy) / view.s });
  function fit() {
    const p = P(); let x0 = 0, y0 = 0, x1 = p.w, y1 = p.d;
    const r = terRect(p); if (r) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    const pad = 34;
    view.s = clamp(Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (y1 - y0)), 8, 160);
    view.ox = (W - (x1 - x0) * view.s) / 2 - x0 * view.s; view.oy = (H - (y1 - y0) * view.s) / 2 - y0 * view.s;
  }
  function zoomAt(px, py, k) {
    const s = clamp(view.s * k, 10, 170);
    view.ox = px - (px - view.ox) / view.s * s; view.oy = py - (py - view.oy) / view.s * s; view.s = s; autoFit = false;
  }
  function opSvg(o, s, selected) {
    const c = opPoint(o, s), T = s.outer ? 0.3 : 0.18, h = o.w / 2, hl = selected ? '#e39a2d' : '#26332d';
    let r;
    if (s.hor) r = 'x="' + (c.x - h) + '" y="' + (c.y - T / 2) + '" width="' + o.w + '" height="' + T + '"';
    else r = 'x="' + (c.x - T / 2) + '" y="' + (c.y - h) + '" width="' + T + '" height="' + o.w + '"';
    if (o.type === 'win') {
      return '<rect ' + r + ' fill="#fff" stroke="' + hl + '" stroke-width="' + (selected ? 0.07 : 0.03) + '"/>' +
        (s.hor ? '<line x1="' + (c.x - h) + '" y1="' + c.y + '" x2="' + (c.x + h) + '" y2="' + c.y + '"' : '<line x1="' + c.x + '" y1="' + (c.y - h) + '" x2="' + c.x + '" y2="' + (c.y + h) + '"') + ' stroke="#3b8fc4" stroke-width=".07"/>';
    }
    const dir = (o.host === 'S' || o.host === 'E') ? -1 : 1, col = selected ? '#e39a2d' : s.outer ? '#b97614' : '#4a544f';
    let d;
    if (s.hor) d = 'M' + (c.x - h) + ' ' + c.y + 'v' + dir * o.w + 'A' + o.w + ' ' + o.w + ' 0 0 ' + (dir > 0 ? 0 : 1) + ' ' + (c.x + h) + ' ' + c.y;
    else d = 'M' + c.x + ' ' + (c.y - h) + 'h' + dir * o.w + 'A' + o.w + ' ' + o.w + ' 0 0 ' + (dir > 0 ? 1 : 0) + ' ' + c.x + ' ' + (c.y + h);
    return '<rect ' + r + ' fill="#fbfaf6"/><path d="' + d + '" fill="' + col + '" fill-opacity=".1" stroke="' + col + '" stroke-width="' + (selected ? 0.09 : 0.06) + '" stroke-linejoin="round"/>';
  }
  function drawPlan() {
    const p = P(); if (!p || !stage) return;
    const bb = stage.getBoundingClientRect(); W = bb.width; H = bb.height; if (!W || !H) return;
    if (autoFit) fit();
    const s = view.s, X = x => (view.ox + x * s).toFixed(1), Y = y => (view.oy + y * s).toFixed(1);
    const regs = regions(p), selR = sel && sel.kind === 'room' ? regs.at(sel.x, sel.y) : null;
    let a = '<rect x="-60" y="-60" width="160" height="160" fill="url(#plGrid)"/>';
    const tr = terRect(p);
    if (tr) a += '<rect x="' + tr.x + '" y="' + tr.y + '" width="' + tr.w + '" height="' + tr.h + '" fill="#ecd9b6" stroke="' + (sel && sel.kind === 'ter' ? '#e39a2d' : '#a8843f') + '" stroke-width=".08" stroke-dasharray=".25 .15"/>';
    regs.forEach(R => { a += '<path d="' + R.path + '" fill="' + roomType(R.type).c + '" fill-opacity=".86"/>'; });
    if (selR) a += '<path d="' + selR.path + '" fill="#e39a2d" fill-opacity=".3"/>';
    p.walls.forEach(wl => { a += '<line x1="' + wl.x1 + '" y1="' + wl.y1 + '" x2="' + wl.x2 + '" y2="' + wl.y2 + '" stroke="' + (sel && sel.kind === 'wall' && sel.id === wl.id ? '#e39a2d' : '#4a544f') + '" stroke-width=".16" stroke-linecap="square"/>'; });
    a += '<rect x="0" y="0" width="' + p.w + '" height="' + p.d + '" fill="none" stroke="#26332d" stroke-width=".28"/>';
    if (sel && sel.kind === 'side') { const ss = seg(sel.side, p); a += '<line x1="' + ss.x1 + '" y1="' + ss.y1 + '" x2="' + ss.x2 + '" y2="' + ss.y2 + '" stroke="#e39a2d" stroke-width=".3" stroke-linecap="square"/>'; }
    p.ops.forEach(o => { const ss = seg(o.host, p); if (ss) a += opSvg(o, ss, sel && sel.kind === 'op' && sel.id === o.id); });
    if (drag && drag.kind === 'draw' && drag.moved) a += '<line x1="' + drag.a.x + '" y1="' + drag.a.y + '" x2="' + drag.b.x + '" y2="' + drag.b.y + '" stroke="#e39a2d" stroke-width=".16" stroke-linecap="square"/>';

    let b = '';
    regs.forEach(R => {
      const wide = R.wid * s, t = roomType(R.type);
      if (wide < 34) return;
      if (R.type && wide >= 62) b += '<text class="pl-t" x="' + X(R.lx) + '" y="' + (+Y(R.ly) - 3) + '">' + (wide < 110 && t.id === 'living' ? 'Гостиная' : t.name) + '</text><text class="pl-s" x="' + X(R.lx) + '" y="' + (+Y(R.ly) + 11) + '">' + fm(R.area) + ' м²</text>';
      else b += '<text class="pl-s" x="' + X(R.lx) + '" y="' + (+Y(R.ly) + 4) + '">' + fm(R.area) + ' м²</text>';
    });
    const topOff = p.terrace && p.terrace.side === 'N' ? p.terrace.dep * s + 12 : 14, leftOff = p.terrace && p.terrace.side === 'W' ? p.terrace.dep * s + 12 : 14;
    b += '<text class="pl-dim" x="' + X(p.w / 2) + '" y="' + (+Y(0) - topOff) + '">' + fm(p.w) + ' м</text>';
    b += '<text class="pl-dim" transform="translate(' + (+X(0) - leftOff) + ' ' + Y(p.d / 2) + ') rotate(-90)">' + fm(p.d) + ' м</text>';
    if (tr) b += '<text class="pl-s" x="' + X(tr.x + tr.w / 2) + '" y="' + (+Y(tr.y + tr.h / 2) + 4) + '">Терраса ' + fm(tr.w * tr.h) + ' м²</text>';
    if (tool === 'hand') {                           // ручки наружных стен
      [['N', p.w / 2, 0, 1], ['S', p.w / 2, p.d, 1], ['W', 0, p.d / 2, 0], ['E', p.w, p.d / 2, 0]].forEach(q => {
        const on = sel && sel.kind === 'side' && sel.side === q[0];
        b += '<rect x="' + (+X(q[1]) - (q[3] ? 15 : 5)) + '" y="' + (+Y(q[2]) - (q[3] ? 5 : 15)) + '" width="' + (q[3] ? 30 : 10) + '" height="' + (q[3] ? 10 : 30) + '" rx="5" fill="' + (on ? '#e39a2d' : '#fff') + '" stroke="#1d5a47" stroke-width="2"/>';
      });
    }
    if (sel && sel.kind === 'wall') {
      const wl = p.walls.find(q => q.id === sel.id);
      if (wl) {
        b += '<circle cx="' + X(wl.x1) + '" cy="' + Y(wl.y1) + '" r="9" fill="#fff" stroke="#e39a2d" stroke-width="3"/><circle cx="' + X(wl.x2) + '" cy="' + Y(wl.y2) + '" r="9" fill="#fff" stroke="#e39a2d" stroke-width="3"/>';
        b += '<text class="pl-dim" x="' + X((wl.x1 + wl.x2) / 2) + '" y="' + (+Y((wl.y1 + wl.y2) / 2) - 12) + '">' + fm(wl.x2 - wl.x1 + wl.y2 - wl.y1) + ' м</text>';
      }
    }
    if (sel && sel.kind === 'ter' && tr) { const hd = terHandle(p); b += '<circle cx="' + X(hd.x) + '" cy="' + Y(hd.y) + '" r="9" fill="#fff" stroke="#e39a2d" stroke-width="3"/>'; }
    if (drag && drag.kind === 'draw' && drag.moved) b += '<text class="pl-dim" x="' + X((drag.a.x + drag.b.x) / 2) + '" y="' + (+Y((drag.a.y + drag.b.y) / 2) - 12) + '">' + fm(Math.abs(drag.b.x - drag.a.x) + Math.abs(drag.b.y - drag.a.y)) + ' м</text>';

    svg.innerHTML = '<defs><pattern id="plGrid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M.5 0V1M0 .5H1" stroke="#e9e5da" stroke-width=".02" fill="none"/><path d="M0 0H1M0 0V1" stroke="#d6d1c3" stroke-width=".04" fill="none"/></pattern></defs>' +
      '<g transform="translate(' + view.ox.toFixed(2) + ' ' + view.oy.toFixed(2) + ') scale(' + s.toFixed(3) + ')">' + a + '</g><g>' + b + '</g>';
  }

  /* ============================ 3D-вид (изометрия) ============================ */
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), f = v => clamp(Math.round(v * k), 0, 255);
    return 'rgb(' + f(n >> 16) + ',' + f(n >> 8 & 255) + ',' + f(n & 255) + ')';
  }
  function isoSvg(p) {
    const st = host.state, cfg = host.CONFIG, w = p.w, d = p.d;
    const rm = cfg.roofMat.find(x => x.id === st.roofMat) || cfg.roofMat[0];
    const timber = st.tech === 'timber', wc = timber ? '#d7a566' : '#efe6d2';
    const F = 2.8, Hh = st.floors === '2' ? F * 2 : st.floors === '1.5' ? F + 1.2 : F;
    const faces = [], add = (pts, fill, stroke, sw) => faces.push({ pts, fill, stroke: stroke || '#26332d', sw: sw == null ? 1 : sw });
    const tr = terRect(p);
    let gx0 = -1.2, gy0 = -1.2, gx1 = w + 1.2, gy1 = d + 1.2;
    if (tr) { gx0 = Math.min(gx0, tr.x - 0.8); gy0 = Math.min(gy0, tr.y - 0.8); gx1 = Math.max(gx1, tr.x + tr.w + 0.8); gy1 = Math.max(gy1, tr.y + tr.h + 0.8); }
    add([[gx0, gy0, 0], [gx1, gy0, 0], [gx1, gy1, 0], [gx0, gy1, 0]], '#e6ebdd', '#cfd6c3');
    const deck = () => {
      if (!tr) return;
      const x0 = tr.x, y0 = tr.y, x1 = tr.x + tr.w, y1 = tr.y + tr.h, z = 0.3, r = 1.2;
      add([[x0, y1, 0], [x1, y1, 0], [x1, y1, z], [x0, y1, z]], '#c9a66b');
      add([[x1, y0, 0], [x1, y1, 0], [x1, y1, z], [x1, y0, z]], '#b8935a');
      add([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], '#e2c48d');
      const s = p.terrace.side, rail = [];
      if (s !== 'S') rail.push([x0, y0, x1, y0]); if (s !== 'N') rail.push([x0, y1, x1, y1]);
      if (s !== 'E') rail.push([x0, y0, x0, y1]); if (s !== 'W') rail.push([x1, y0, x1, y1]);
      rail.forEach(q => { add([[q[0], q[1], r], [q[2], q[3], r]], 'none', '#7a5a2c', 1.6); add([[q[0], q[1], z], [q[0], q[1], r]], 'none', '#7a5a2c', 1.6); add([[q[2], q[3], z], [q[2], q[3], r]], 'none', '#7a5a2c', 1.6); });
    };
    const behind = tr && (p.terrace.side === 'N' || p.terrace.side === 'W');
    if (behind) deck();
    const shape = st.roofShape, o = 0.45, alongX = w >= d, U = alongX ? w : d, V = alongX ? d : w;
    const M = (u, v, z) => alongX ? [u, v, z] : [v, u, z];
    const rh = shape === 'shed' ? d * 0.22 : V / 2 * (shape === 'hip' ? 0.5 : st.floors === '1.5' ? 0.75 : 0.58);
    // стены: южная и восточная видны
    const sWall = [[0, d, 0], [w, d, 0], [w, d, Hh], [0, d, Hh]], eWall = [[w, 0, 0], [w, d, 0], [w, d, Hh], [w, 0, Hh]];
    if (shape === 'shed') eWall[3] = [w, 0, Hh + rh];
    if (shape === 'gable') { if (alongX) eWall.splice(3, 0, [w, d / 2, Hh + rh]); else sWall.splice(3, 0, [w / 2, d, Hh + rh]); }
    add(sWall, wc); add(eWall, shade(timber ? '#d7a566' : '#efe6d2', 0.88));
    if (timber) for (let z = 0.35; z < Hh; z += 0.35) { add([[0, d, z], [w, d, z]], 'none', '#b07f45', 0.6); add([[w, 0, z], [w, d, z]], 'none', '#9a6d3a', 0.6); }
    const levels = st.floors === '2' ? [0, F] : [0];
    p.ops.forEach(q => {
      if (q.host !== 'S' && q.host !== 'E') return;
      const h = q.w / 2, win = q.type === 'win';
      (win ? levels : [0]).forEach(z0 => {
        const a = z0 + (win ? 0.9 : 0.05), b = z0 + (win ? 2.2 : 2.1);
        const pts = q.host === 'S' ? [[q.t - h, d, a], [q.t + h, d, a], [q.t + h, d, b], [q.t - h, d, b]] : [[w, q.t - h, a], [w, q.t + h, a], [w, q.t + h, b], [w, q.t - h, b]];
        add(pts, win ? '#bfe0f2' : '#7a5335', win ? '#fff' : '#3d2a19', win ? 1.6 : 1);
      });
    });
    const c1 = shade(rm.color, 1.12), c2 = shade(rm.color, 0.86), c3 = shade(rm.color, 0.7);
    if (shape === 'shed') {
      const e = o * rh / d;
      add([[-o, -o, Hh + rh + e], [w + o, -o, Hh + rh + e], [w + o, d + o, Hh - e], [-o, d + o, Hh - e]], c1);
    } else if (shape === 'hip') {
      const r1 = [V / 2, V / 2, Hh + rh], r2 = [U - V / 2, V / 2, Hh + rh], R1 = M.apply(null, r1), R2 = M.apply(null, r2);
      add([M(-o, -o, Hh), M(U + o, -o, Hh), R2, R1], c3);
      add([M(-o, -o, Hh), M(-o, V + o, Hh), R1], c3);
      add([M(U + o, -o, Hh), M(U + o, V + o, Hh), R2], alongX ? c2 : c1);
      add([M(-o, V + o, Hh), M(U + o, V + o, Hh), R2, R1], alongX ? c1 : c2);
    } else {
      const e = o * rh / (V / 2);
      add([M(-o, -o, Hh - e), M(U + o, -o, Hh - e), M(U + o, V / 2, Hh + rh), M(-o, V / 2, Hh + rh)], c3);
      add([M(-o, V + o, Hh - e), M(U + o, V + o, Hh - e), M(U + o, V / 2, Hh + rh), M(-o, V / 2, Hh + rh)], alongX ? c1 : c2);
    }
    if (tr && !behind) deck();
    const pr = q => [(q[0] - q[1]) * 0.866, (q[0] + q[1]) * 0.5 - q[2]];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    faces.forEach(f => f.pts.forEach(q => { const a = pr(q); x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]); }));
    const sc = Math.min(404 / (x1 - x0), 218 / (y1 - y0)), ox = (420 - (x1 - x0) * sc) / 2 - x0 * sc, oy = (230 - (y1 - y0) * sc) / 2 - y0 * sc;
    return faces.map(f => '<polygon points="' + f.pts.map(q => { const a = pr(q); return (a[0] * sc + ox).toFixed(1) + ',' + (a[1] * sc + oy).toFixed(1); }).join(' ') +
      '" fill="' + f.fill + '" stroke="' + f.stroke + '" stroke-width="' + f.sw + '" stroke-linejoin="round" stroke-linecap="round"/>').join('');
  }
  function drawIso(el) { const p = P(); if (p && el) el.innerHTML = isoSvg(p); }

  /* ============================ Панель под планом ============================ */
  const stepper = (key, val, unit) => '<span class="pl-step"><button type="button" data-st="' + key + '" data-d="-1" aria-label="Меньше">−</button><b>' + fm(val) + ' ' + unit + '</b><button type="button" data-st="' + key + '" data-d="1" aria-label="Больше">+</button></span>';
  const delBtn = '<button type="button" class="pl-del" data-act="del">Удалить</button>';
  function panel() {
    const p = P(); let h = '';
    const o = sel && sel.kind === 'op' ? p.ops.find(q => q.id === sel.id) : null;
    const wl = sel && sel.kind === 'wall' ? p.walls.find(q => q.id === sel.id) : null;
    if (o) {
      h = '<div class="pl-row"><b class="pl-h">' + (o.type === 'win' ? 'Окно' : isOuter(o.host) ? 'Входная дверь' : 'Межкомнатная дверь') + '</b>' + delBtn + '</div>' +
        '<div class="pl-row"><span>Ширина</span>' + stepper('opw', o.w, 'м') + '</div>';
    } else if (wl) {
      h = '<div class="pl-row"><b class="pl-h">Перегородка ' + fm(wl.x2 - wl.x1 + wl.y2 - wl.y1) + ' м</b>' + delBtn + '</div><p class="pl-note">Тяните за середину, чтобы передвинуть, за кружки — чтобы изменить длину.</p>';
    } else if (sel && sel.kind === 'room') {
      const R = regions(p).at(sel.x, sel.y);
      if (R) h = '<div class="pl-row"><b class="pl-h">Комната · ' + fm(R.area) + ' м²</b></div><div class="chips pl-chips">' +
        ROOMS.map(r => '<button type="button" class="chip" data-room="' + r.id + '" aria-pressed="' + (r.id === R.type) + '">' + r.name + '</button>').join('') + '</div>';
    } else if (sel && sel.kind === 'ter' && p.terrace) {
      h = '<div class="pl-row"><b class="pl-h">Терраса ' + fm(p.terrace.len * p.terrace.dep) + ' м²</b>' + delBtn + '</div>' +
        '<div class="pl-row"><span>Длина</span>' + stepper('tlen', p.terrace.len, 'м') + '</div><div class="pl-row"><span>Вынос</span>' + stepper('tdep', p.terrace.dep, 'м') + '</div>' +
        '<div class="chips pl-chips">' + SIDES.map(s => '<button type="button" class="chip" data-tside="' + s + '" aria-pressed="' + (p.terrace.side === s) + '">' + SIDE_NAME[s] + '</button>').join('') + '</div>';
    }
    if (!h) {
      h = '<div class="pl-row"><span>Ширина дома</span>' + stepper('w', p.w, 'м') + '</div><div class="pl-row"><span>Глубина дома</span>' + stepper('d', p.d, 'м') + '</div>' +
        '<div class="chips pl-chips">' + (p.terrace ? '<button type="button" class="chip" data-act="terSel">Терраса: изменить</button>' : '<button type="button" class="chip" data-act="terAdd">+ Терраса</button>') +
        '<button type="button" class="chip" data-act="reset">Сбросить к типовой</button><button type="button" class="chip" data-act="blank">Пустой лист</button></div>';
    }
    panelEl.innerHTML = h;
    const m = metrics(p);
    statsEl.textContent = fm(p.w) + ' × ' + fm(p.d) + ' м · ' + fm(m.foot) + ' м² · комнат ' + m.rooms.length + ' · окон ' + m.win + ' · дверей ' + (m.ent + m.inner) + ' · перегородки ' + fm(m.part) + ' м';
    hintEl.textContent = view3d ? (use3d() ? 'Крутите дом пальцем или мышью, приближайте щипком или кнопками. «Снять крышу» покажет комнаты сверху.' : '3D-вид с улицы: видны две стены, крыша и терраса. Нажмите «3D» ещё раз, чтобы вернуться к плану.') : TOOLS.find(t => t.id === tool).hint;
    root.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(!view3d && b.dataset.tool === tool)));
    const q = id => root.querySelector('[data-act="' + id + '"]');
    q('undo').disabled = hi <= 0; q('redo').disabled = hi >= hist.length - 1; q('v3d').setAttribute('aria-pressed', String(view3d));
    ['zin', 'zout', 'fit'].forEach(id => { q(id).disabled = view3d && !use3d(); });
  }
  function use3d() { return view3d && !no3d && !!window.House3D && !!host.spec3d; }
  function refresh() {
    if (!root || !P()) return;
    if (view3d && !window.House3D && host.need3d) host.need3d();          // модуль ещё не загружен — попросим, пока покажем схему
    let on = use3d();
    if (on && !inst3) { box3.style.display = ''; try { inst3 = window.House3D.mount(box3, {}); } catch (e) { no3d = true; on = false; } }
    svg.style.display = view3d ? 'none' : ''; box3.style.display = on ? '' : 'none'; iso.style.display = view3d && !on ? '' : 'none';
    roofBtn.hidden = !on; roofBtn.setAttribute('aria-pressed', String(roofOff)); roofBtn.lastChild.textContent = roofOff ? 'Вернуть крышу' : 'Снять крышу';
    if (on) { inst3.update(host.spec3d(P())); inst3.setRoofOff(roofOff); }
    else if (view3d) drawIso(iso); else drawPlan();
    panel();
  }
  function toast(t) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2200); }
  function notice(text, label, fn) {
    noticeFn = fn || null; noticeEl.hidden = !text;
    noticeEl.innerHTML = text ? '<span></span>' + (label ? '<button type="button" class="chip" data-act="notice">' + label + '</button>' : '') + '<button type="button" class="pl-x" data-act="noticeX" aria-label="Скрыть">×</button>' : '';
    if (text) noticeEl.firstChild.textContent = text;
  }

  /* ============================ Действия ============================ */
  function removeSel() {
    const p = P(); if (!sel) return;
    if (sel.kind === 'op') p.ops = p.ops.filter(q => q.id !== sel.id);
    else if (sel.kind === 'wall') { p.walls = p.walls.filter(q => q.id !== sel.id); p.ops = p.ops.filter(q => q.host !== sel.id); }
    else if (sel.kind === 'ter') p.terrace = null;
    else return;
    sel = null; commit();
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const p = P(), ds = b.dataset;
    if (ds.tool) { tool = ds.tool; view3d = false; if (tool !== 'hand' && tool !== 'room') sel = null; refresh(); return; }
    if (ds.st) {
      const dir = +ds.d;
      if (ds.st === 'w') { resizePlan(p, 'E', p.w + dir * G); autoFit = true; }
      else if (ds.st === 'd') { resizePlan(p, 'S', p.d + dir * G); autoFit = true; }
      else if (ds.st === 'opw') {
        const o = p.ops.find(q => q.id === sel.id), old = o.w, st = o.type === 'win' ? 0.3 : 0.1;
        o.w = clamp(Math.round((o.w + dir * st) * 10) / 10, o.type === 'win' ? 0.6 : 0.7, o.type === 'win' ? 2.7 : 1.6);
        const t = fitT(p, o, o.t); if (t == null) { o.w = old; toast('Шире не помещается'); } else o.t = t;
      } else if (ds.st === 'tlen') { p.terrace.len += dir * G; sanitize(p); autoFit = true; }
      else if (ds.st === 'tdep') { p.terrace.dep += dir * G; sanitize(p); autoFit = true; }
      commit(); return;
    }
    if (ds.room !== undefined) {
      const regs = regions(p), R = regs.at(sel.x, sel.y); if (!R) return;
      p.labels = p.labels.filter(l => regs.at(l.x, l.y) !== R);
      if (ds.room) p.labels.push({ x: R.lx, y: R.ly, type: ds.room });
      commit(); return;
    }
    if (ds.tside) { p.terrace.side = ds.tside; p.terrace.off = 0; sanitize(p); autoFit = true; commit(); return; }
    switch (ds.act) {
      case 'undo': travel(-1); break;
      case 'redo': travel(1); break;
      case 'zin': if (use3d() && inst3) inst3.zoom(1.25); else { zoomAt(W / 2, H / 2, 1.25); refresh(); } break;
      case 'zout': if (use3d() && inst3) inst3.zoom(0.8); else { zoomAt(W / 2, H / 2, 0.8); refresh(); } break;
      case 'fit': if (use3d() && inst3) inst3.fit(); else { autoFit = true; refresh(); } break;
      case 'roof': roofOff = !roofOff; refresh(); break;
      case 'v3d': view3d = !view3d; refresh(); break;
      case 'del': removeSel(); break;
      case 'terAdd': p.terrace = { side: 'S', off: Math.max(0, p.w - 4), len: Math.min(4, p.w), dep: 2 }; sanitize(p); sel = { kind: 'ter' }; tool = 'hand'; autoFit = true; commit(); break;
      case 'terSel': sel = { kind: 'ter' }; tool = 'hand'; view3d = false; refresh(); break;
      case 'reset': { const n = template(p.w, p.d, { terrace: p.terrace ? p.terrace.len * p.terrace.dep : 0 }); n.auto = false; setPlan(n); host.onChange(); toast('Типовая планировка. Можно отменить.'); break; }
      case 'blank': { const n = template(p.w, p.d, { empty: true }); setPlan(n); host.onChange(); toast('Пустой лист. Можно отменить.'); break; }
      case 'notice': { const f = noticeFn; notice(''); if (f) f(); break; }
      case 'noticeX': notice(''); break;
    }
  }

  /* ============================ Указатель: мышь и пальцы ============================ */
  const local = e => { const r = svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function hit(m, tol) {
    const p = P();
    if (sel && sel.kind === 'wall') {
      const wl = p.walls.find(q => q.id === sel.id);
      if (wl) { if (Math.hypot(m.x - wl.x1, m.y - wl.y1) < tol * 1.2) return { kind: 'end', id: wl.id, k: 1 }; if (Math.hypot(m.x - wl.x2, m.y - wl.y2) < tol * 1.2) return { kind: 'end', id: wl.id, k: 2 }; }
    }
    if (sel && sel.kind === 'ter' && p.terrace) { const hd = terHandle(p), r0 = terRect(p), dh = Math.hypot(m.x - hd.x, m.y - hd.y); if (dh < tol && dh < Math.hypot(m.x - r0.x - r0.w / 2, m.y - r0.y - r0.h / 2)) return { kind: 'terDep' }; }
    let best = null, bd = tol;
    p.ops.forEach(o => { const s = seg(o.host, p), c = opPoint(o, s), h = o.w / 2; const dd = s.hor ? dseg(m, c.x - h, c.y, c.x + h, c.y) : dseg(m, c.x, c.y - h, c.x, c.y + h); if (dd < bd) { bd = dd; best = { kind: 'op', id: o.id }; } });
    const bo = best, od = bd;
    best = null; bd = tol;                           // наружная стена важнее перегородки, которая в неё упирается
    SIDES.forEach(sd => { const s = seg(sd, p), dd = dseg(m, s.x1, s.y1, s.x2, s.y2); if (dd < bd) { bd = dd; best = { kind: 'side', side: sd }; } });
    p.walls.forEach(wl => { const dd = dseg(m, wl.x1, wl.y1, wl.x2, wl.y2); if (dd < bd - 1e-9) { bd = dd; best = { kind: 'wall', id: wl.id }; } });
    const r = terRect(p), inTer = r && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
    if (inTer && Math.min(od, bd) > tol * 0.45) return { kind: 'ter' };   // палец явно на террасе, а не на стене рядом
    // проём берём, если палец на нём или рядом; если палец стоит на другой стене — берём стену
    if (bo && (!best || od < tol * 0.45 || od <= bd + tol * 0.25)) return bo;
    if (best) return best;
    if (inTer) return { kind: 'ter' };
    if (m.x > 0 && m.x < p.w && m.y > 0 && m.y < p.d) return { kind: 'room' };
    return { kind: 'none' };
  }
  function live() { drawPlan(); if (!raf) raf = requestAnimationFrame(() => { raf = 0; host.onChange(true); }); }
  function abortDrag() {
    if (!drag) return;
    if (drag.kind !== 'pan') { host.state.plan = JSON.parse(drag.snap); sel = drag.sel0; }
    drag = null; host.onChange(true);
  }
  function onDown(e) {
    if (view3d || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.isPrimary && (ptrs.size || pinch)) {         // прошлое касание «потерялось» (браузер не прислал отпускание) — начинаем с чистого листа
      abortDrag(); ptrs.clear(); pinch = null; stale++;
    }
    try { svg.setPointerCapture(e.pointerId); } catch (err) {}
    const pt = local(e); ptrs.set(e.pointerId, pt);
    e.preventDefault();
    if (ptrs.size === 2) {
      abortDrag();
      const a = Array.from(ptrs.values());
      pinch = { d0: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2, v0: { s: view.s, ox: view.ox, oy: view.oy } };
      return;
    }
    if (ptrs.size > 2) return;
    const p = P(), m = toM(pt), touch = e.pointerType !== 'mouse', tol = (touch ? 20 : 10) / view.s;
    drag = { kind: 'pan', id: e.pointerId, p0: pt, m0: m, v0: { s: view.s, ox: view.ox, oy: view.oy }, snap: JSON.stringify(p), sel0: sel, moved: false, tol, slop: touch ? 8 : 4 };
    const h = hit(m, tol);
    if (tool === 'hand') {
      if (h.kind === 'end') { drag.kind = 'end'; drag.wid = h.id; drag.k = h.k; }
      else if (h.kind === 'terDep') drag.kind = 'terDep';
      else if (h.kind === 'op') { sel = { kind: 'op', id: h.id }; drag.kind = 'op'; drag.oid = h.id; }
      else if (h.kind === 'wall') { sel = { kind: 'wall', id: h.id }; drag.kind = 'wall'; drag.wid = h.id; }
      else if (h.kind === 'side') { sel = { kind: 'side', side: h.side }; drag.kind = 'side'; drag.side = h.side; }
      else if (h.kind === 'ter') { sel = { kind: 'ter' }; drag.kind = 'ter'; }
      else if (h.kind === 'room') sel = { kind: 'room', x: m.x, y: m.y };
      else sel = null;
    } else if (tool === 'wall') {
      if (m.x > -tol && m.x < p.w + tol && m.y > -tol && m.y < p.d + tol) { drag.kind = 'draw'; drag.a = { x: clamp(snap(m.x), 0, p.w), y: clamp(snap(m.y), 0, p.d) }; drag.b = drag.a; sel = null; }
    } else if (tool === 'win' || tool === 'door') {
      if (h.kind === 'op') { sel = { kind: 'op', id: h.id }; drag.kind = 'op'; drag.oid = h.id; }
      else {
        const nh = nearestHost(m, tool, Math.max(tol, 0.7));
        if (nh) {
          const o = { id: nid(), type: tool, host: nh.host, t: 0, w: tool === 'win' ? 1.2 : isOuter(nh.host) ? 0.9 : 0.8 };
          const t = fitT(p, o, nh.t);
          if (t == null) toast('Здесь проём не помещается'); else { o.t = t; p.ops.push(o); sel = { kind: 'op', id: o.id }; drag.kind = 'op'; drag.oid = o.id; }
        }
      }
    } else if (tool === 'room') {
      if (m.x > 0 && m.x < p.w && m.y > 0 && m.y < p.d) sel = { kind: 'room', x: m.x, y: m.y };
    }
    refresh();
  }
  function onMove(e) {
    if (!ptrs.has(e.pointerId)) return;
    const pt = local(e); ptrs.set(e.pointerId, pt);
    if (pinch) {
      if (ptrs.size < 2) return;
      const a = Array.from(ptrs.values()), dd = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2;
      const s = clamp(pinch.v0.s * dd / pinch.d0, 10, 170);
      view.s = s; view.ox = mx - (pinch.mx - pinch.v0.ox) / pinch.v0.s * s; view.oy = my - (pinch.my - pinch.v0.oy) / pinch.v0.s * s; autoFit = false;
      drawPlan(); return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    e.preventDefault();
    const dx = pt.x - drag.p0.x, dy = pt.y - drag.p0.y;
    if (!drag.moved && Math.hypot(dx, dy) < drag.slop) return;
    drag.moved = true;
    const m = toM(pt);
    if (drag.kind === 'pan') { view.ox = drag.v0.ox + dx; view.oy = drag.v0.oy + dy; autoFit = false; drawPlan(); return; }
    if (drag.kind === 'draw') {
      const p = P(), a = drag.a;
      drag.b = Math.abs(m.x - a.x) >= Math.abs(m.y - a.y) ? { x: clamp(snap(m.x), 0, p.w), y: a.y } : { x: a.x, y: clamp(snap(m.y), 0, p.d) };
      drawPlan(); return;
    }
    if (drag.kind === 'op') {
      const p = P(), o = p.ops.find(q => q.id === drag.oid); if (!o) return;
      const nh = nearestHost(m, o.type, 1.2);
      const tryHost = (hs, t) => { const keep = o.host; o.host = hs; const r = fitT(p, o, t); if (r == null) { o.host = keep; return false; } o.t = r; return true; };
      const cur = seg(o.host, p);
      if (!(nh && nh.host !== o.host && tryHost(nh.host, nh.t))) tryHost(o.host, cur.hor ? m.x - cur.x1 : m.y - cur.y1);
      live(); return;
    }
    // остальные перетаскивания пересчитываются от снимка на момент нажатия
    const p = host.state.plan = JSON.parse(drag.snap), mm = { x: (pt.x - drag.v0.ox) / drag.v0.s, y: (pt.y - drag.v0.oy) / drag.v0.s };
    if (drag.kind === 'wall') {
      const wl = p.walls.find(q => q.id === drag.wid), hor = wl.y1 === wl.y2;
      let ddx = snap(mm.x - drag.m0.x), ddy = snap(mm.y - drag.m0.y);
      if (hor) { ddx = clamp(ddx, -wl.x1, p.w - wl.x2); ddy = clamp(ddy, G - wl.y1, p.d - G - wl.y1); }
      else { ddy = clamp(ddy, -wl.y1, p.d - wl.y2); ddx = clamp(ddx, G - wl.x1, p.w - G - wl.x1); }
      wl.x1 += ddx; wl.x2 += ddx; wl.y1 += ddy; wl.y2 += ddy;
    } else if (drag.kind === 'end') {
      const wl = p.walls.find(q => q.id === drag.wid), hor = wl.y1 === wl.y2, k1 = hor ? 'x1' : 'y1', k2 = hor ? 'x2' : 'y2';
      const v = clamp(snap(hor ? mm.x : mm.y), 0, hor ? p.w : p.d);
      if (drag.k === 1) { const n1 = Math.min(v, wl[k2] - G); p.ops.forEach(o => { if (o.host === wl.id) o.t += wl[k1] - n1; }); wl[k1] = n1; }
      else wl[k2] = Math.max(v, wl[k1] + G);
      sanitize(p);
    } else if (drag.kind === 'side') {
      const sd = drag.side, old = (sd === 'E' || sd === 'W') ? p.w : p.d;
      const size = sd === 'E' ? mm.x : sd === 'S' ? mm.y : sd === 'W' ? old - mm.x : old - mm.y;
      const sh = resizePlan(p, sd, size);
      view.ox = drag.v0.ox - (sd === 'W' ? sh * view.s : 0); view.oy = drag.v0.oy - (sd === 'N' ? sh * view.s : 0); autoFit = false;
    } else if (drag.kind === 'ter' && p.terrace) {
      const t = p.terrace, outside = mm.x < 0 || mm.x > p.w || mm.y < 0 || mm.y > p.d;
      if (outside) {
        let bs = t.side, bd = 1e9;
        SIDES.forEach(sd => { const s = seg(sd, p), dd = dseg(mm, s.x1, s.y1, s.x2, s.y2); if (dd < bd) { bd = dd; bs = sd; } });
        if (bs !== t.side) { t.side = bs; t.len = Math.min(t.len, sideLen(p, bs)); }
      }
      const along = (t.side === 'N' || t.side === 'S') ? mm.x : mm.y;
      t.off = snap(along - t.len / 2); sanitize(p);
    } else if (drag.kind === 'terDep' && p.terrace) {
      const t = p.terrace;
      t.dep = t.side === 'S' ? mm.y - p.d : t.side === 'N' ? -mm.y : t.side === 'W' ? -mm.x : mm.x - p.w; sanitize(p);
    }
    live();
  }
  function onUp(e) {
    if (!ptrs.has(e.pointerId)) return;
    const pt = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size === 0) pinch = null; return; }
    if (!drag || drag.id !== e.pointerId) return;
    const dg = drag; drag = null;
    if (e.type !== 'pointerup') { if (dg.kind !== 'pan') { host.state.plan = JSON.parse(dg.snap); sel = dg.sel0; } host.onChange(true); return; }
    const p = P();
    if (dg.kind === 'draw' && dg.moved) {
      const a = dg.a, b = dg.b, wl = { id: nid(), x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) };
      const hor = wl.y1 === wl.y2, len = hor ? wl.x2 - wl.x1 : wl.y2 - wl.y1;
      if (len >= G) {
        if (hor ? (wl.y1 <= 0 || wl.y1 >= p.d) : (wl.x1 <= 0 || wl.x1 >= p.w)) toast('Наружная стена здесь уже есть');
        else { p.walls.push(wl); sel = { kind: 'wall', id: wl.id }; }
      }
    }
    if (tool === 'erase' && !dg.moved) {
      const h = hit(toM(pt), dg.tol);
      if (h.kind === 'op') p.ops = p.ops.filter(q => q.id !== h.id);
      else if (h.kind === 'wall') { p.walls = p.walls.filter(q => q.id !== h.id); p.ops = p.ops.filter(q => q.host !== h.id); }
      else if (h.kind === 'ter') p.terrace = null;
      else if (h.kind === 'side') toast('Наружную стену удалить нельзя — её можно передвинуть');
    }
    mergeWalls(p); sanitize(p);
    if (sel && sel.kind === 'wall' && !p.walls.some(q => q.id === sel.id)) sel = null;
    if (sel && sel.kind === 'op' && !p.ops.some(q => q.id === sel.id)) sel = null;
    commit();
  }
  function onWheel(e) {
    if (view3d || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault(); const pt = local(e);
    zoomAt(pt.x, pt.y, Math.exp(-clamp(e.deltaY, -60, 60) * 0.006)); drawPlan();
  }
  function onKey(e) {
    if (host.state.mode !== 'plan' || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    const z = (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я');
    if (z) { e.preventDefault(); travel(e.shiftKey ? 1 : -1); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'н')) { e.preventDefault(); travel(1); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && sel.kind !== 'room' && sel.kind !== 'side') { e.preventDefault(); removeSel(); }
    else if (e.key === 'Escape') { sel = null; refresh(); }
  }

  /* ============================ Запуск ============================ */
  function init(h, el) {
    host = h; root = el;
    const btn = (attr, t) => '<button type="button" ' + attr + '="' + t.id + '" title="' + t.name + '" aria-label="' + t.name + '"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' + t.icon + '</svg><span>' + t.name + '</span></button>';
    root.innerHTML = '<div class="pl-tools" role="toolbar" aria-label="Инструменты">' + TOOLS.map(t => btn('data-tool', t)).join('') + '</div>' +
      '<p class="pl-hint" id="plHint"></p>' +
      '<div class="pl-stage" id="plStage"><svg id="plSvg" role="img" aria-label="План дома"></svg><svg id="plIso" viewBox="0 0 420 230" role="img" aria-label="3D-вид дома" style="display:none"></svg><div class="pl-3d" id="pl3d" style="display:none"></div>' +
      '<button type="button" class="pl-roof" data-act="roof" aria-pressed="false" hidden><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 11 12 4l9 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 14v6h12v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-dasharray="3 2.5"/></svg><span>Снять крышу</span></button><div class="pl-toast" id="plToast" role="status"></div></div>' +
      '<div class="pl-acts">' + ACTS.map(t => btn('data-act', t)).join('') + '</div>' +
      '<div class="pl-notice" id="plNotice" hidden></div><div class="pl-panel" id="plPanel"></div><p class="pl-stats" id="plStats"></p>';
    const q = s => root.querySelector(s);
    stage = q('#plStage'); svg = q('#plSvg'); iso = q('#plIso'); box3 = q('#pl3d'); roofBtn = q('.pl-roof'); panelEl = q('#plPanel'); statsEl = q('#plStats'); hintEl = q('#plHint'); toastEl = q('#plToast'); noticeEl = q('#plNotice');
    root.addEventListener('click', onClick);
    svg.addEventListener('pointerdown', onDown); svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp); svg.addEventListener('pointercancel', onUp); svg.addEventListener('lostpointercapture', onUp);
    svg.addEventListener('wheel', onWheel, { passive: false });
    ['gesturestart', 'gesturechange', 'contextmenu', 'dragstart', 'selectstart'].forEach(n => stage.addEventListener(n, e => e.preventDefault()));
    stage.addEventListener('touchmove', e => e.preventDefault(), { passive: false });   // страховка: план не прокручивает страницу
    document.addEventListener('keydown', onKey);
    if (window.ResizeObserver) new ResizeObserver(() => { if (host.state.mode === 'plan' && !drag && !pinch) refresh(); }).observe(stage);
    else window.addEventListener('resize', refresh);
    if (P()) resetHistory();
  }
  function valid(p) {
    return !!p && typeof p.w === 'number' && typeof p.d === 'number' && Array.isArray(p.walls) && Array.isArray(p.ops) && Array.isArray(p.labels) &&
      p.walls.every(w => [w.x1, w.y1, w.x2, w.y2].every(Number.isFinite) && (w.x1 === w.x2 || w.y1 === w.y2) && typeof w.id === 'string') &&
      p.ops.every(o => Number.isFinite(o.t) && Number.isFinite(o.w) && typeof o.host === 'string' && (o.type === 'win' || o.type === 'door'));
  }

  return { init, refresh, template, fromArea, metrics, describe, drawIso, setPlan, geom, terraceFor, notice, sanitize, valid,
           open() { autoFit = true; view3d = false; sel = null; tool = 'hand'; if (!hist.length) resetHistory(); },
           _dbg: { view, get sel() { return sel; }, get v3() { return { view3d, on: use3d(), roofOff, inst: inst3 }; }, get hist() { return [hist.length, hi]; }, get ptrs() { return [ptrs.size, !!pinch, stale]; } } };
})();
