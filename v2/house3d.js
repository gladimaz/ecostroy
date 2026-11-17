/* 3D-модель дома для калькулятора и конструктора (общий модуль).
   Three.js r160 лежит рядом, в vendor/ — с CDN ничего не грузится.
   mount(el, opt) → { update(spec), setRoofOff(bool), zoom(k), fit(), info(), dispose() } */
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const WALL_H = 2.7, T_OUT = 0.3, T_IN = 0.12, SLAB = 0.25;
const F0_BY = { strip: 0.5, slab: 0.35, rcpad: 0.6, screw: 0.6 };

/* ---------------- процедурные текстуры (canvas) ---------------- */
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function tex(px, py, mw, mh, draw) {
  const c = document.createElement('canvas'); c.width = px; c.height = py;
  draw(c.getContext('2d'), px, py);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / mw, 1 / mh);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function boards(g, W, H, n, horiz, c1, c2, gap, seed) {
  const r = rnd(seed), size = (horiz ? H : W) / n;
  for (let i = 0; i < n; i++) {
    const gr = horiz ? g.createLinearGradient(0, i * size, 0, (i + 1) * size) : g.createLinearGradient(i * size, 0, (i + 1) * size, 0);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr;
    if (horiz) g.fillRect(0, i * size, W, size); else g.fillRect(i * size, 0, size, H);
    g.fillStyle = 'rgba(0,0,0,' + (0.03 + r() * 0.07).toFixed(3) + ')';
    if (horiz) g.fillRect(0, i * size, W, size); else g.fillRect(i * size, 0, size, H);
    for (let k = 0; k < 14; k++) {                    // волокна
      g.fillStyle = 'rgba(70,40,10,' + (0.03 + r() * 0.07).toFixed(3) + ')';
      const a = r() * (horiz ? W : H), len = 40 + r() * 160, b = i * size + r() * size;
      if (horiz) g.fillRect(a, b, len, 1); else g.fillRect(b, a, 1, len);
    }
    g.fillStyle = gap;
    if (horiz) g.fillRect(0, (i + 1) * size - 3, W, 3); else g.fillRect((i + 1) * size - 2, 0, 2, H);
    g.fillStyle = 'rgba(255,255,255,.18)';
    if (horiz) g.fillRect(0, i * size, W, 2); else g.fillRect(i * size, 0, 1, H);
  }
}
function roofPixels(kind) {
  return (g, W, H) => {
    const im = g.createImageData(W, H), d = im.data, r = rnd(7);
    const tabs = []; for (let i = 0; i < 64; i++) tabs.push(0.72 + r() * 0.26);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v;
      if (kind === 'metal') {                         // металлочерепица: волны поперёк и «ступеньки» по скату
        const row = (y * 2 / H) % 1;
        v = 0.80 + 0.13 * Math.cos(x / W * 12 * Math.PI);
        v *= 0.86 + 0.14 * row; if (row > 0.9) v *= 0.55 + (1 - row) * 3;
      } else if (kind === 'prof') {                   // профнастил: трапециевидные рёбра вдоль ската
        const u = (x * 5 / W) % 1;
        v = u < 0.3 ? 0.98 : u < 0.4 ? 0.98 - (u - 0.3) * 2.2 : u < 0.9 ? 0.76 : 0.76 + (u - 0.9) * 2.2;
      } else {                                        // мягкая черепица: ряды лепестков со сдвигом
        const ri = Math.floor(y * 4 / H), row = (y * 4 / H) % 1, ux = x / W * 4 + (ri % 2) * 0.5, ti = Math.floor(ux) % 4, u = ux % 1;
        v = tabs[ri * 4 + ti] * (0.9 + 0.1 * row); if (row > 0.9 || u < 0.04) v *= 0.6;
        v *= 0.94 + r() * 0.1;
      }
      const k = (y * W + x) * 4, c = Math.max(0, Math.min(255, v * 255));
      d[k] = d[k + 1] = d[k + 2] = c; d[k + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  };
}
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const std = o => new THREE.MeshStandardMaterial(o);
  const timber = tex(512, 512, 1.6, 0.9, (g, W, H) => boards(g, W, H, 5, true, '#e3b477', '#c8934f', 'rgba(60,30,5,.55)', 11));
  const siding = tex(256, 256, 1.2, 0.8, (g, W, H) => boards(g, W, H, 4, true, '#f1ebdc', '#e4dcc8', 'rgba(60,50,30,.28)', 5));
  const deck = tex(256, 256, 1, 1, (g, W, H) => boards(g, W, H, 7, false, '#c79a5f', '#b98a50', 'rgba(40,20,0,.6)', 23));
  const floor = tex(256, 256, 1.2, 1.2, (g, W, H) => boards(g, W, H, 6, false, '#e6cfa6', '#dcc294', 'rgba(90,60,20,.35)', 31));
  const grass = tex(512, 512, 9, 9, (g, W, H) => {
    g.fillStyle = '#86b25f'; g.fillRect(0, 0, W, H); const r = rnd(3);
    for (let i = 0; i < 9000; i++) { g.fillStyle = (r() < 0.5 ? 'rgba(60,110,40,' : 'rgba(170,205,110,') + (0.08 + r() * 0.2).toFixed(2) + ')'; g.fillRect(r() * W, r() * H, 2 + r() * 5, 2 + r() * 5); }
  });
  const panel = tex(128, 128, 1, 1, (g, W, H) => { g.fillStyle = '#e8eaec'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(W - 2, 0, 2, H); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(0, 0, 2, H); });
  const gate = tex(64, 128, 1, 0.5, (g, W, H) => { g.fillStyle = '#6d7880'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, H - 4, W, 4); g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(0, 0, W, 3); });
  const roofTex = { metal: tex(256, 256, 1.1, 0.7, roofPixels('metal')), prof: tex(256, 64, 1, 1, roofPixels('prof')), soft: tex(256, 256, 1.3, 0.6, roofPixels('soft')) };
  MATS = {
    timber: std({ map: timber, roughness: 0.82 }), siding: std({ map: siding, roughness: 0.88 }),
    plaster: std({ color: '#f5f1e8', roughness: 0.95 }), part: std({ color: '#efe9dc', roughness: 0.95 }),
    floor: std({ map: floor, roughness: 0.7 }), deck: std({ map: deck, roughness: 0.85 }),
    concrete: std({ color: '#b9b8b2', roughness: 0.95 }), steel: std({ color: '#4c5357', roughness: 0.5, metalness: 0.6 }),
    beam: std({ color: '#6b4a2a', roughness: 0.9 }), trimW: std({ color: '#fbfaf6', roughness: 0.6 }), trimD: std({ color: '#4a3524', roughness: 0.7 }),
    door: std({ color: '#3f5d52', roughness: 0.55 }), handle: std({ color: '#d9d2bf', roughness: 0.3, metalness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: '#9cc6de', roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.55 }),
    glassDark: std({ color: '#5f8198', roughness: 0.1, metalness: 0.4 }),
    rail: std({ color: '#8a6238', roughness: 0.85 }), panel: std({ map: panel, roughness: 0.6 }), gate: std({ map: gate, roughness: 0.6, metalness: 0.2 }),
    garRoof: std({ color: '#565e63', roughness: 0.7 }),
    grass: std({ map: grass, roughness: 1 }), trunk: std({ color: '#6a4a2f', roughness: 1 }), fir: std({ color: '#2f6b45', roughness: 1, flatShading: true }),
    roofTex, roof: {}
  };
  ['wallGable', 'roofAny'].forEach(() => 0);
  return MATS;
}
function roofMat(kind, color) {
  const M = mats(), k = kind + color;
  if (!M.roof[k]) M.roof[k] = new THREE.MeshStandardMaterial({ map: M.roofTex[kind] || M.roofTex.metal, color, side: THREE.DoubleSide,
    roughness: kind === 'soft' ? 0.95 : 0.5, metalness: kind === 'soft' ? 0 : 0.35 });
  return M.roof[k];
}
const DOUBLE = {};
function dbl(name) { if (!DOUBLE[name]) { DOUBLE[name] = mats()[name].clone(); DOUBLE[name].side = THREE.DoubleSide; } return DOUBLE[name]; }

/* ---------------- сборщик геометрии ---------------- */
class GB {
  constructor() { this.p = []; this.n = []; this.u = []; this.i = []; }
  poly(pts, uvf) {
    const a = pts[0], b = pts[1], c = pts[2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const base = this.p.length / 3, ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    pts.forEach(v => {
      this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz);
      const uv = uvf ? uvf(v) : (ax >= ay && ax >= az) ? [v[2], v[1]] : (az >= ay) ? [v[0], v[1]] : [v[0], v[2]];
      this.u.push(uv[0], uv[1]);
    });
    for (let k = 1; k < pts.length - 1; k++) this.i.push(base, base + k, base + k + 1);
  }
  box(x0, y0, z0, x1, y1, z1) {
    if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0];
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    this.poly([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]);
    this.poly([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
    this.poly([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]);
    this.poly([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
    this.poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
    this.poly([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]);
  }
  mesh(mat, shadow) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i);
    const m = new THREE.Mesh(g, mat); m.castShadow = shadow !== false; m.receiveShadow = true;
    return m;
  }
}

/* ---------------- сборка дома по описанию ---------------- */
function buildHouse(s) {
  const M = mats(), w = s.w, d = s.d, T = T_OUT;
  const F0 = F0_BY[s.foundation] || 0.5, timber = s.tech === 'timber';
  const X = x => x - w / 2, Z = y => y - d / 2;
  const base = new THREE.Group(), top = new THREE.Group(), decor = new THREE.Group(), labels = new THREE.Group();
  const gbs = {};
  const G = key => gbs[key] || (gbs[key] = new GB());
  const pbox = (key, x0, x1, y0, y1, h0, h1) => G(key).box(X(x0), h0, Z(y0), X(x1), h1, Z(y1));   // координаты плана + высоты
  // коробка у наружной стены: a — вдоль стены, e — вглубь от наружной грани (минус — наружу)
  const sbox = (key, sd, a0, a1, e0, e1, h0, h1) => {
    if (sd === 'N') pbox(key, a0, a1, e0, e1, h0, h1); else if (sd === 'S') pbox(key, a0, a1, d - e1, d - e0, h0, h1);
    else if (sd === 'W') pbox(key, e0, e1, a0, a1, h0, h1); else pbox(key, w - e1, w - e0, a0, a1, h0, h1);
  };
  const sideLen = sd => (sd === 'N' || sd === 'S') ? w : d;
  // стена с проёмами: куски между проёмами, под окнами и над проёмами
  const run = (put, a0, a1, ops, h0, h1) => {
    let cur = a0;
    ops.slice().sort((p, q) => p.c - q.c).forEach(o => {
      const l = Math.max(a0, o.c - o.w / 2), r = Math.min(a1, o.c + o.w / 2); if (r - l < 0.05 || l < cur - 1e-6) return;
      put(cur, l, h0, h1); if (o.sill > h0) put(l, r, h0, o.sill); if (o.head < h1) put(l, r, o.head, h1); cur = r;
    });
    put(cur, a1, h0, h1);
  };
  const wallOut = timber ? 'timber' : 'siding', wallIn = timber ? 'timber' : 'plaster';
  const frameKey = timber ? 'trimD' : 'trimW';
  const outerOps = sd => s.ops.filter(o => o.host === sd);
  const winDim = o => o.w <= 0.7 ? [1.3, 2.0] : [0.9, 2.25];
  const ter = s.ter;
  const doorUnderTerrace = (sd, c) => ter && s.terSide === sd && c > ((sd === 'N' || sd === 'S') ? ter.x : ter.y) - 0.2 && c < ((sd === 'N' || sd === 'S') ? ter.x + ter.w : ter.y + ter.h) + 0.2;

  function windowAt(pre, sd, c, ww, y0, y1) {
    const fk = pre + frameKey, a0 = c - ww / 2, a1 = c + ww / 2, f = 0.06;
    sbox(fk, sd, a0, a1, 0.05, 0.15, y0, y0 + f); sbox(fk, sd, a0, a1, 0.05, 0.15, y1 - f, y1);
    sbox(fk, sd, a0, a0 + f, 0.05, 0.15, y0 + f, y1 - f); sbox(fk, sd, a1 - f, a1, 0.05, 0.15, y0 + f, y1 - f);
    if (ww >= 1) sbox(fk, sd, c - f / 2, c + f / 2, 0.05, 0.15, y0 + f, y1 - f);
    sbox(pre + 'glass', sd, a0 + f, a1 - f, 0.09, 0.11, y0 + f, y1 - f);
    const tk = pre + 'trimW', b = 0.1;                  // наличники и отлив
    sbox(tk, sd, a0 - b, a1 + b, -0.035, 0, y1, y1 + b); sbox(tk, sd, a0 - b, a0, -0.035, 0, y0, y1); sbox(tk, sd, a1, a1 + b, -0.035, 0, y0, y1);
    sbox(tk, sd, a0 - b - 0.03, a1 + b + 0.03, -0.09, 0.05, y0 - 0.05, y0);
  }
  function outerWalls(pre, h0, h1, opsFor) {
    ['N', 'S', 'W', 'E'].forEach(sd => {
      const L = sideLen(sd), ns = sd === 'N' || sd === 'S', ops = opsFor(sd);
      run((a0, a1, y0, y1) => sbox(pre + wallOut, sd, a0, a1, 0, T / 2, y0, y1), ns ? 0 : T / 2, ns ? L : L - T / 2, ops, h0, h1);
      run((a0, a1, y0, y1) => sbox(pre + wallIn, sd, a0, a1, T / 2, T, y0, y1), ns ? T / 2 : T, ns ? L - T / 2 : L - T, ops, h0, h1);
      ops.forEach(o => {
        if (o.door) {
          const a0 = o.c - o.w / 2, a1 = o.c + o.w / 2;
          sbox(pre + 'door', sd, a0 + 0.04, a1 - 0.04, 0.06, 0.12, o.sill, o.head - 0.04);
          sbox(pre + 'handle', sd, a1 - 0.2, a1 - 0.14, 0.01, 0.06, o.sill + 0.95, o.sill + 1.1);
          sbox(pre + 'glassDark', sd, o.c - 0.18, o.c + 0.18, 0.045, 0.06, o.sill + 1.25, o.head - 0.3);
          const b = 0.1; sbox(pre + 'trimW', sd, a0 - b, a1 + b, -0.035, 0, o.head, o.head + b); sbox(pre + 'trimW', sd, a0 - b, a0, -0.035, 0, o.sill, o.head); sbox(pre + 'trimW', sd, a1, a1 + b, -0.035, 0, o.sill, o.head);
        } else windowAt(pre, sd, o.c, o.w, o.sill, o.head);
      });
    });
  }
  // --- первый этаж
  const yB = F0 - 0.2, yT = F0 + WALL_H;
  outerWalls('', yB, yT, sd => outerOps(sd).map(o => {
    if (o.type === 'door') return { c: o.t, w: o.w, sill: F0, head: F0 + 2.1, door: true };
    const hh = winDim(o); return { c: o.t, w: o.w, sill: F0 + hh[0], head: F0 + hh[1] };
  }));
  pbox('floor', T, w - T, T, d - T, yB, F0);
  // --- перегородки с дверными проёмами
  s.walls.forEach(wl => {
    const ver = wl.x1 === wl.x2, st = ver ? wl.y1 : wl.x1, en = ver ? wl.y2 : wl.x2, lim = ver ? d : w;
    const ops = s.ops.filter(o => o.host === wl.id).map(o => ({ c: st + o.t, w: o.w, sill: F0, head: F0 + 2.05 }));
    run((a0, a1, y0, y1) => { if (ver) pbox('part', wl.x1 - T_IN / 2, wl.x1 + T_IN / 2, a0, a1, y0, y1); else pbox('part', a0, a1, wl.y1 - T_IN / 2, wl.y1 + T_IN / 2, y0, y1); },
      Math.max(T, st - T_IN / 2), Math.min(lim - T, en + T_IN / 2), ops, F0, yT - 0.02);
  });
  // --- верх: второй этаж или мансарда
  let H = yT;
  if (s.floors === '2' || s.floors === '1.5') {
    pbox('top:plaster', T, w - T, T, d - T, yT, yT + SLAB);
    if (s.floors === '2') {
      const f2 = yT + SLAB; H = f2 + 2.6;
      outerWalls('top:', yT, H, sd => outerOps(sd).map(o => ({ c: o.t, w: o.type === 'door' ? 1.2 : o.w, sill: f2 + (o.w <= 0.7 && o.type !== 'door' ? 1.3 : 0.9), head: f2 + (o.w <= 0.7 && o.type !== 'door' ? 2.0 : 2.2) })));
    } else { H = yT + SLAB + 0.85; outerWalls('top:', yT, H, () => []); }
  }
  // --- крыша
  const alongX = s.roofShape === 'shed' ? true : w >= d, L = alongX ? w : d, S = alongX ? d : w;
  const Mp = (a, b, y) => alongX ? [a, y, b] : [b, y, a];
  const rk = 'top:roof', ov = 0.5, La = L / 2 + 0.45, B = S / 2 + ov;
  const mbox = (key, a0, a1, b0, b1, y0, y1) => { const p = Mp(a0, b0, y0), q = Mp(a1, b1, y1); G(key).box(p[0], p[1], p[2], q[0], q[1], q[2]); };
  let topY = H;
  if (s.roofShape === 'hip') {
    const tg = Math.tan(27 * Math.PI / 180), cs = Math.cos(27 * Math.PI / 180), ye = H - tg * ov + 0.02, yr = ye + tg * B, r = Math.max(0, L / 2 - S / 2), Lh = L / 2 + ov;
    G(rk).poly([Mp(-Lh, B, ye), Mp(Lh, B, ye), Mp(r, 0, yr), Mp(-r, 0, yr)], v => { const q = alongX ? [v[0], v[2]] : [v[2], v[0]]; return [q[0], (B - q[1]) / cs]; });
    G(rk).poly([Mp(Lh, -B, ye), Mp(-Lh, -B, ye), Mp(-r, 0, yr), Mp(r, 0, yr)], v => { const q = alongX ? [v[0], v[2]] : [v[2], v[0]]; return [q[0], (B + q[1]) / cs]; });
    G(rk).poly([Mp(Lh, B, ye), Mp(Lh, -B, ye), Mp(r, 0, yr)], v => { const q = alongX ? [v[0], v[2]] : [v[2], v[0]]; return [q[1], (Lh - q[0]) / cs]; });
    G(rk).poly([Mp(-Lh, -B, ye), Mp(-Lh, B, ye), Mp(-r, 0, yr)], v => { const q = alongX ? [v[0], v[2]] : [v[2], v[0]]; return [q[1], (Lh + q[0]) / cs]; });
    mbox('top:trimW', -Lh, Lh, B - 0.03, B, ye - 0.17, ye - 0.01); mbox('top:trimW', -Lh, Lh, -B, -B + 0.03, ye - 0.17, ye - 0.01);
    mbox('top:trimW', Lh - 0.03, Lh, -B, B, ye - 0.17, ye - 0.01); mbox('top:trimW', -Lh, -Lh + 0.03, -B, B, ye - 0.17, ye - 0.01);
    if (r > 0.05) mbox(rk, -r, r, -0.1, 0.1, yr - 0.02, yr + 0.05);
    topY = yr;
  } else if (s.roofShape === 'shed') {
    const tg = Math.tan(14 * Math.PI / 180), cs = Math.cos(14 * Math.PI / 180), rise = tg * S, y0 = H - tg * ov + 0.02, y1 = H + rise + tg * ov + 0.02;
    G(rk).poly([Mp(-La, B, y1), Mp(La, B, y1), Mp(La, -B, y0), Mp(-La, -B, y0)], v => [v[0], (v[2] + B) / cs]);
    const wk = 'top:' + wallOut + '2';
    G(wk).poly([Mp(-L / 2, S / 2, H), Mp(L / 2, S / 2, H), Mp(L / 2, S / 2, H + rise), Mp(-L / 2, S / 2, H + rise)]);
    G(wk).poly([Mp(L / 2, S / 2, H), Mp(L / 2, -S / 2, H), Mp(L / 2, S / 2, H + rise)]);
    G(wk).poly([Mp(-L / 2, -S / 2, H), Mp(-L / 2, S / 2, H), Mp(-L / 2, S / 2, H + rise)]);
    mbox('top:trimW', -La, La, -B, -B + 0.03, y0 - 0.17, y0 - 0.01); mbox('top:trimW', -La, La, B - 0.03, B, y1 - 0.17, y1 - 0.01);
    topY = y1;
  } else {
    const deg = s.floors === '1.5' ? 42 : s.floors === '2' ? 28 : 31, tg = Math.tan(deg * Math.PI / 180), cs = Math.cos(deg * Math.PI / 180);
    const ye = H - tg * ov + 0.02, yr = H + tg * S / 2 + 0.02;
    const uvA = sg => v => { const a = alongX ? v[0] : v[2], b = alongX ? v[2] : v[0]; return [a, (B + sg * b) / cs]; };
    G(rk).poly([Mp(-La, B, ye), Mp(La, B, ye), Mp(La, 0, yr), Mp(-La, 0, yr)], uvA(-1));
    G(rk).poly([Mp(La, -B, ye), Mp(-La, -B, ye), Mp(-La, 0, yr), Mp(La, 0, yr)], uvA(1));
    mbox(rk, -La, La, -0.11, 0.11, yr - 0.03, yr + 0.05);                       // конёк
    mbox('top:trimW', -La, La, B - 0.03, B, ye - 0.17, ye - 0.01); mbox('top:trimW', -La, La, -B, -B + 0.03, ye - 0.17, ye - 0.01);
    [-1, 1].forEach(e => [-1, 1].forEach(sg => G('top:trimW2').poly([Mp(e * La, sg * B, ye - 0.16), Mp(e * La, 0, yr - 0.16), Mp(e * La, 0, yr), Mp(e * La, sg * B, ye)])));
    const wk = 'top:' + wallOut + '2';
    [-1, 1].forEach(e => {                                                       // фронтоны
      G(wk).poly([Mp(e * L / 2, -S / 2, H), Mp(e * L / 2, S / 2, H), Mp(e * L / 2, 0, yr - 0.02)]);
      if (s.floors === '1.5' && S >= 4.5) {                                      // окно мансарды во фронтоне
        const y0 = yT + SLAB + 0.75, y1 = y0 + 1.2, o0 = e > 0 ? L / 2 : -L / 2 - 0.05, o1 = o0 + 0.05;
        mbox('top:trimW', o0, o1, -0.7, 0.7, y0 - 0.08, y1 + 0.08); mbox('top:glassDark', o0 - 0.01, o1 + 0.01, -0.6, 0.6, y0, y1);
        mbox('top:trimW', o0 - 0.015, o1 + 0.015, -0.03, 0.03, y0, y1);
      }
    });
    topY = yr;
  }
  // --- фундамент
  const yF = F0 - 0.2;
  if (s.foundation === 'slab') pbox('concrete', -0.25, w + 0.25, -0.25, d + 0.25, 0, yF);
  else if (s.foundation === 'strip') pbox('concrete', 0.03, w - 0.03, 0.03, d - 0.03, 0, yF);
  else {
    const yb = yF - 0.2, nx = Math.max(2, Math.ceil(w / 3) + 1), ny = Math.max(2, Math.ceil(d / 3) + 1);
    pbox('beam', 0, w, 0, 0.2, yb, yF); pbox('beam', 0, w, d - 0.2, d, yb, yF); pbox('beam', 0, 0.2, 0.2, d - 0.2, yb, yF); pbox('beam', w - 0.2, w, 0.2, d - 0.2, yb, yF);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const px = 0.2 + (w - 0.4) * i / (nx - 1), py = 0.2 + (d - 0.4) * j / (ny - 1);
      if (s.foundation === 'rcpad') { pbox('concrete', px - 0.25, px + 0.25, py - 0.25, py + 0.25, 0, 0.14); pbox('concrete', px - 0.13, px + 0.13, py - 0.13, py + 0.13, 0.14, yb); }
      else { pbox('steel', px - 0.055, px + 0.055, py - 0.055, py + 0.055, 0, yb - 0.02); pbox('steel', px - 0.13, px + 0.13, py - 0.13, py + 0.13, yb - 0.02, yb); }
    }
  }
  // --- ступени: n — наружу от точки
  const out = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
  function steps(cx, cy, sd, width, topH, platform) {
    const o = out[sd], n = Math.max(1, Math.ceil(topH / 0.19)), tx = -o[1], ty = o[0];
    const piece = (e0, e1, h) => {
      const xs = [cx + o[0] * e0 + tx * width / 2, cx + o[0] * e1 - tx * width / 2], ys = [cy + o[1] * e0 + ty * width / 2, cy + o[1] * e1 - ty * width / 2];
      pbox('deck', Math.min(xs[0], xs[1]), Math.max(xs[0], xs[1]), Math.min(ys[0], ys[1]), Math.max(ys[0], ys[1]), 0, h);
    };
    if (platform) piece(0, platform, topH);
    for (let k = 1; k < n; k++) piece(platform + 0.28 * (k - 1), platform + 0.28 * k, topH * (n - k) / n);
  }
  ['N', 'S', 'W', 'E'].forEach(sd => outerOps(sd).forEach(o => {
    if (o.type !== 'door' || doorUnderTerrace(sd, o.t)) return;
    const ns = sd === 'N' || sd === 'S';
    steps(ns ? o.t : (sd === 'W' ? 0 : w), ns ? (sd === 'N' ? 0 : d) : o.t, sd, Math.max(1.3, o.w + 0.5), F0 - 0.04, 0.9);
  }));
  // --- терраса: настил, перила, ступени
  if (ter) {
    const dk = F0 - 0.04, x0 = ter.x, x1 = ter.x + ter.w, y0 = ter.y, y1 = ter.y + ter.h, sd = s.terSide;
    pbox('deck', x0, x1, y0, y1, dk - 0.12, dk);
    const nxp = Math.max(2, Math.ceil(ter.w / 2) + 1), nyp = Math.max(2, Math.ceil(ter.h / 2) + 1);
    for (let i = 0; i < nxp; i++) for (let j = 0; j < nyp; j++) { const px = x0 + 0.08 + (ter.w - 0.16) * i / (nxp - 1), py = y0 + 0.08 + (ter.h - 0.16) * j / (nyp - 1); pbox('beam', px - 0.07, px + 0.07, py - 0.07, py + 0.07, 0, dk - 0.12); }
    const rail = (ax, ay, bx, by) => {
      const len = Math.hypot(bx - ax, by - ay); if (len < 0.3) return;
      const n = Math.max(1, Math.ceil(len / 1.4)), hor = ay === by, t = 0.04;
      for (let i = 0; i <= n; i++) { const px = ax + (bx - ax) * i / n, py = ay + (by - ay) * i / n; pbox('rail', px - 0.045, px + 0.045, py - 0.045, py + 0.045, dk, dk + 1.0); }
      [[0.95, 1.02, 0.05], [0.5, 0.55, 0.03], [0.18, 0.23, 0.03]].forEach(q => {
        if (hor) pbox('rail', Math.min(ax, bx), Math.max(ax, bx), ay - q[2], ay + q[2], dk + q[0], dk + q[1]); else pbox('rail', ax - q[2], ax + q[2], Math.min(ay, by), Math.max(ay, by), dk + q[0], dk + q[1]);
      });
      void t;
    };
    const m = 0.06, far = sd === 'S' ? y1 - m : sd === 'N' ? y0 + m : sd === 'W' ? x0 + m : x1 - m, ns = sd === 'N' || sd === 'S';
    const lo = ns ? x0 + m : y0 + m, hi = ns ? x1 - m : y1 - m, mid = (lo + hi) / 2, gap = hi - lo >= 2.6 ? 0.65 : 0;
    const seg = (a, b) => ns ? rail(a, far, b, far) : rail(far, a, far, b);
    if (gap) { seg(lo, mid - gap); seg(mid + gap, hi); steps(ns ? mid : (sd === 'W' ? x0 : x1), ns ? (sd === 'N' ? y0 : y1) : mid, sd, 1.3, dk, 0); } else seg(lo, hi);
    const near = sd === 'S' ? y0 : sd === 'N' ? y1 : sd === 'W' ? x1 : x0;
    if (ns) { rail(lo, near, lo, far); rail(hi, near, hi, far); } else { rail(near, lo, far, lo); rail(near, hi, far, hi); }
  }
  // --- гараж из сэндвич-панелей
  if (s.garage) {
    const gw = s.garage.w, gd = s.garage.d, left = s.terSide !== 'W', gx0 = left ? -2 - gw : w + 2, gx1 = gx0 + gw, gy1 = d, gy0 = d - gd;
    pbox('panel', gx0, gx1, gy0, gy1, 0, 2.7); pbox('garRoof', gx0 - 0.2, gx1 + 0.2, gy0 - 0.2, gy1 + 0.25, 2.7, 2.86);
    const gg = Math.min(3, gw - 1.6), gc = (gx0 + gx1) / 2;
    pbox('gate', gc - gg / 2, gc + gg / 2, gy1, gy1 + 0.04, 0, 2.2); pbox('concrete', gx0 - 0.1, gx1 + 0.1, gy0 - 0.1, gy1 + 0.1, 0, 0.12);
  }
  // --- сборка мешей
  const MATMAP = { [wallOut + '2']: dbl(wallOut), trimW2: dbl('trimW'), roof: roofMat(s.roofMat, s.roofColor || '#8a3b2f') };
  Object.keys(gbs).forEach(key => {
    const isTop = key.indexOf('top:') === 0, name = isTop ? key.slice(4) : key;
    const mesh = gbs[key].mesh(MATMAP[name] || M[name], name !== 'glass');
    (isTop ? top : base).add(mesh);
  });
  // --- ёлки для масштаба
  const tree = (x, y, h) => {
    const g = new THREE.Group(), tr = new THREE.Mesh(TREE.trunk, M.trunk); tr.scale.set(1, h * 0.25, 1); tr.position.y = h * 0.125; tr.castShadow = true; g.add(tr);
    [[0.42, 0.55, 0.3], [0.32, 0.45, 0.58], [0.2, 0.36, 0.82]].forEach(q => { const c = new THREE.Mesh(TREE.cone, M.fir); c.scale.set(h * q[0], h * q[1], h * q[0]); c.position.y = h * q[2]; c.castShadow = true; g.add(c); });
    g.position.set(x, 0, y); decor.add(g);
  };
  // кольцо ёлок вокруг участка, дальше габаритов дома, террасы и гаража; ёлки со стороны камеры прячет cullTrees()
  let ext = Math.hypot(w, d) / 2;
  if (ter) ext = Math.max(ext, Math.hypot(Math.max(Math.abs(X(ter.x)), Math.abs(X(ter.x + ter.w))), Math.max(Math.abs(Z(ter.y)), Math.abs(Z(ter.y + ter.h)))));
  if (s.garage) ext = Math.max(ext, Math.hypot(w / 2 + 2 + s.garage.w, d / 2));
  const tr = rnd(17), NT = 9;
  for (let i = 0; i < NT; i++) { const a = (i + 0.25 + tr() * 0.5) / NT * Math.PI * 2, rr = ext + 5 + tr() * 4; tree(Math.sin(a) * rr, Math.cos(a) * rr, 4.2 + tr() * 3.2); }
  // --- подписи комнат (видны со снятой крышей)
  (s.rooms || []).forEach(r => {
    const c = document.createElement('canvas'), g = c.getContext('2d'); c.width = 256; c.height = 96;
    g.font = '600 30px system-ui,-apple-system,Segoe UI,Roboto,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineJoin = 'round'; g.fillStyle = '#1f2b26';
    const nm = r.name || 'Комната'; g.strokeText(nm, 128, 30); g.fillText(nm, 128, 30);
    g.font = '500 26px system-ui,-apple-system,Segoe UI,Roboto,sans-serif'; g.fillStyle = '#3d4a45';
    const ar = String(Math.round(r.area * 10) / 10).replace('.', ',') + ' м²'; g.strokeText(ar, 128, 68); g.fillText(ar, 128, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    const k = Math.min(1, Math.max(0.55, Math.sqrt(r.area) / 3.4));
    sp.scale.set(2.5 * k, 0.94 * k, 1); sp.position.set(X(r.x), F0 + 1.4, Z(r.y)); sp.renderOrder = 5; labels.add(sp);
  });
  return { base, top, decor, labels, topY, F0 };
}
const TREE = { trunk: new THREE.CylinderGeometry(0.14, 0.2, 1, 6), cone: new THREE.ConeGeometry(1, 1, 7) };

function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry && o.geometry !== TREE.trunk && o.geometry !== TREE.cone) o.geometry.dispose();
    if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); }
  });
}

/* ---------------- экземпляр сцены ---------------- */
const instances = [];
export function mount(el, opt) {
  opt = opt || {};
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });   // бросит ошибку, если WebGL нет
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
  const cv = renderer.domElement; cv.setAttribute('aria-label', '3D-модель дома'); cv.setAttribute('role', 'img');
  el.appendChild(cv);

  const scene = new THREE.Scene();
  const sky = document.createElement('canvas'); sky.width = 4; sky.height = 256;
  { const g = sky.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#6fb0e6'); gr.addColorStop(0.42, '#dcebf2'); gr.addColorStop(1, '#dcebf2'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); }
  const skyT = new THREE.CanvasTexture(sky); skyT.colorSpace = THREE.SRGBColorSpace; scene.background = skyT;
  scene.fog = new THREE.Fog('#dcebf2', 60, 190);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(200, 40), mats().grass); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  { const uv = ground.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - 0.5) * 400, (uv.getY(i) - 0.5) * 400); }
  scene.add(ground);
  scene.add(new THREE.HemisphereLight('#d7e9ff', '#8c9a70', 1.15));
  const sun = new THREE.DirectionalLight('#fff0d8', 2.6); sun.castShadow = true;
  const sm = mobile || el.clientWidth < 520 ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);      // маленькому превью хватает лёгкой карты теней sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.3, 500);
  const controls = new OrbitControls(camera, cv);
  controls.enableDamping = true; controls.dampingFactor = 0.09; controls.enablePan = false; controls.rotateSpeed = 0.8; controls.zoomSpeed = 0.9;
  controls.maxPolarAngle = 1.5; controls.minPolarAngle = 0.08;
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotate = !calm && opt.autoRotate !== false; controls.autoRotateSpeed = 0.9;
  if (opt.pageScroll) cv.style.touchAction = 'pan-y';        // маленькое превью: вертикальный свайп листает страницу, горизонтальный крутит дом
  // колесо без Ctrl листает страницу, с Ctrl — масштаб модели
  el.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation(); }, { capture: true, passive: true });

  let house = null, key = '', R = 8, roofOff = false, raf = 0, need = true, visible = true, dead = false, busy = false, az = 0.62, frames = 0;
  const target = new THREE.Vector3();
  const tick = () => {
    raf = 0; if (dead || !visible) return;
    busy = true; const moved = controls.update(); busy = false;      // update() сам шлёт change → invalidate, второй кадр не планируем
    if (need || moved) { cullTrees(); renderer.render(scene, camera); need = false; frames++; }
    if (controls.autoRotate || moved) raf = requestAnimationFrame(tick);
  };
  const invalidate = () => { need = true; if (!raf && !busy && !dead) raf = requestAnimationFrame(tick); };
  controls.addEventListener('change', invalidate);
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  function size() {
    const wpx = el.clientWidth, hpx = el.clientHeight; if (!wpx || !hpx) return;
    const asp = wpx / hpx, re = house && Math.abs(asp - camera.aspect) > 0.02;
    renderer.setSize(wpx, hpx, false); camera.aspect = asp; camera.updateProjectionMatrix(); if (re) place(); invalidate();
  }
  function dist() {
    const v = camera.fov * Math.PI / 360, h = Math.atan(Math.tan(v) * camera.aspect);
    return Math.max(R * 0.74 / Math.sin(v), R * 1.13 / Math.sin(h));
  }
  function place(polar) {
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const th = house ? sph.theta : az, ph = polar != null ? polar : (house ? sph.phi : 1.34);
    controls.target.copy(target);
    camera.position.setFromSpherical(new THREE.Spherical(dist(), ph, th)).add(target);
    controls.minDistance = R * 0.8; controls.maxDistance = R * 6;
    scene.fog.near = dist() * 1.3; scene.fog.far = dist() * 4.2;
    sun.position.set(target.x - R * 1.3, R * 2.4, target.z + R * 1.9); sun.target.position.copy(target);
    const c = sun.shadow.camera; c.left = c.bottom = -R * 1.7; c.right = c.top = R * 1.7; c.near = 0.5; c.far = R * 8; c.updateProjectionMatrix();
  }
  // ёлки не должны оказаться между камерой и домом: со стороны камеры они плавно уменьшаются до нуля
  function cullTrees() {
    if (!house) return;
    const cx = camera.position.x - controls.target.x, cz = camera.position.z - controls.target.z, cl = Math.hypot(cx, cz) || 1;
    house.decor.children.forEach(t => {
      const tx = t.position.x - controls.target.x, tz = t.position.z - controls.target.z, c = (tx * cx + tz * cz) / (cl * (Math.hypot(tx, tz) || 1));
      const k = Math.max(0, Math.min(1, (-0.05 - c) / 0.3));          // c > -0.05: дерево сбоку или спереди — скрыто
      t.visible = k > 0.02; t.scale.setScalar(k);
    });
  }
  function applyRoof() {
    if (!house) return;
    house.top.visible = !roofOff; house.labels.visible = roofOff;
  }
  function update(spec) {
    const k = JSON.stringify(spec); if (k === key) return false; key = k;
    const first = !house, old = house, nh = buildHouse(spec);
    if (old) { [old.base, old.top, old.decor, old.labels].forEach(g => { scene.remove(g); disposeGroup(g); }); }
    scene.add(nh.base, nh.top, nh.decor, nh.labels);
    const bb = new THREE.Box3().setFromObject(nh.base).union(new THREE.Box3().setFromObject(nh.top));
    const c = bb.getCenter(new THREE.Vector3()), r = bb.getSize(new THREE.Vector3()).length() / 2;
    const changed = first || Math.abs(r - R) > R * 0.02 || c.distanceTo(target) > 0.3;
    house = nh; applyRoof();
    if (changed) { R = r; target.set(c.x, Math.min(c.y, nh.topY * 0.42), c.z); house = first ? null : nh; place(); house = nh; }
    invalidate(); return true;
  }
  function setRoofOff(v) {
    v = !!v; if (v === roofOff) return; roofOff = v; applyRoof();
    if (house) { controls.maxPolarAngle = 1.5; place(v ? 0.5 : 1.34); }
    invalidate();
  }
  function zoom(f) {
    const off = camera.position.clone().sub(controls.target), l = Math.max(controls.minDistance, Math.min(controls.maxDistance, off.length() / f));
    camera.position.copy(controls.target).add(off.setLength(l)); controls.autoRotate = false; invalidate();
  }
  function fit() { if (house) { place(roofOff ? 0.5 : 1.34); invalidate(); } }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; if (ro) ro.observe(el); else window.addEventListener('resize', size);
  const io = window.IntersectionObserver ? new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; if (visible) invalidate(); }) : null; if (io) io.observe(el);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) invalidate(); });
  cv.addEventListener('webglcontextlost', e => e.preventDefault());
  cv.addEventListener('webglcontextrestored', invalidate);
  size();
  const inst = {
    el, update, setRoofOff, zoom, fit,
    info: () => ({ tris: renderer.info.render.triangles, calls: renderer.info.render.calls, frames, auto: controls.autoRotate, roofOff, R,
      az: new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)).theta, dist: camera.position.distanceTo(controls.target),
      pr: renderer.getPixelRatio(), trees: house ? house.decor.children.length : 0,
      treeFront: house ? (cullTrees(), house.decor.children.filter(t => t.visible && ((t.position.x - controls.target.x) * (camera.position.x - controls.target.x) + (t.position.z - controls.target.z) * (camera.position.z - controls.target.z)) > 0).length) : 0,
      treeShown: house ? house.decor.children.filter(t => t.visible).length : 0, topVisible: !!house && house.top.visible, key }),
    dispose() { dead = true; if (ro) ro.disconnect(); if (io) io.disconnect(); controls.dispose(); if (house) [house.base, house.top, house.decor, house.labels].forEach(disposeGroup); renderer.dispose(); cv.remove(); }
  };
  instances.push(inst);
  return inst;
}
export const version = THREE.REVISION;
if (typeof window !== 'undefined') window.House3D = { mount, instances, version };
