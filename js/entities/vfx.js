/* ============ vfx.js — sprites pixel art de los ataques ============
 * Formas (llama, gota, burbuja, hoja, rayo...) generadas por código a
 * resolución de arte, igual que los tiles, y coloreadas con la paleta del tipo.
 * Así una misma burbuja sale azul de agua o morada de veneno, y todo comparte
 * píxel y contorno oscuro con los sprites de Mundo Misterioso.
 *
 *   G.VFX.draw(ctx, shape, pal, x, y, { angle, scale, frame, alpha })
 *   G.VFX.forMove(m)  -> cómo se ve ese movimiento (proyectil, rayo, golpe...)
 *   G.VFX.forType(t)  -> forma por defecto de un tipo (disparos enemigos)
 */
G.VFX = (() => {
  const PX = G.Sprites.PX;

  // Paletas por tipo: contorno, oscuro, medio, claro, brillo.
  const PAL = {
    fire:     ['#6b1200', '#b8300a', '#ff6a1f', '#ffb22e', '#fff2a0'],
    water:    ['#0f2f78', '#1f56c4', '#3d8bff', '#8ccaff', '#eaf7ff'],
    grass:    ['#14400f', '#24721e', '#45b23c', '#97e36c', '#eaffd0'],
    electric: ['#6b4300', '#c48a00', '#ffd21a', '#fff36a', '#ffffff'],
    psychic:  ['#5e0a3a', '#b0246e', '#ff4f9a', '#ff9fcf', '#ffe8f3'],
    ice:      ['#134a60', '#2f8aa8', '#62d2ea', '#bff3ff', '#ffffff'],
    fighting: ['#561208', '#9a2a16', '#e04a2e', '#ff9c6c', '#ffe2cc'],
    poison:   ['#2e0a3c', '#5e1f7e', '#a043d0', '#d995f2', '#f7e2ff'],
    ground:   ['#3a250c', '#6e4c1e', '#aa7c3c', '#dcb66c', '#f6e6b8'],
    flying:   ['#283c66', '#5672b0', '#93b2ff', '#d2e2ff', '#ffffff'],
    bug:      ['#2e3a06', '#5b7414', '#90b82a', '#cbe86c', '#f4ffd2'],
    rock:     ['#2e2418', '#5a4a34', '#8e7a5a', '#c6b08a', '#f0e4c6'],
    ghost:    ['#160e2c', '#33256a', '#5c48aa', '#9e8aea', '#e8deff'],
    dragon:   ['#160a50', '#2e1ea0', '#5a3cff', '#a490ff', '#e8e2ff'],
    dark:     ['#0e0a0c', '#2a2026', '#463840', '#7c6a74', '#d4c4cc'],
    steel:    ['#232d38', '#56667a', '#8c9caf', '#cad6e2', '#ffffff'],
    fairy:    ['#6a2050', '#b04a8a', '#ff8acb', '#ffc4e6', '#ffffff'],
    normal:   ['#3e3834', '#7a7068', '#c4bcb0', '#ece6dc', '#ffffff'],
    aura:     ['#0c2460', '#1c4cb0', '#3a7cff', '#90d2ff', '#ffffff']
  };
  const IDX = { o: 0, d: 1, m: 2, l: 3, w: 4 };
  const H = (a, b, c) => G.U.hash(a, b, c);

  // ---------------- lienzo de píxeles ----------------
  // Las formas escriben letras (o d m l w, o L = claro semitransparente);
  // luego se colorean con la paleta.

  function grid(w, h) {
    const g = Array.from({ length: h }, () => Array(w).fill(null));
    return {
      w, h, g,
      set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; },
      get(x, y) { return x >= 0 && y >= 0 && x < w && y < h ? g[y][x] : null; },
      fill(fn) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y); if (c) g[y][x] = c; } },
      // Contorno de 1 px alrededor de lo opaco, como en los sprites de PMD.
      outline() {
        const marks = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (g[y][x]) continue;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const c = this.get(x + a, y + b); return c && c !== 'o'; })) marks.push([x, y]);
        }
        for (const [x, y] of marks) g[y][x] = 'o';
      },
      line(x0, y0, x1, y1, c, thick = 0, side = null) {
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
        for (let i = 0; i <= n; i++) {
          const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
          if (thick) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!this.get(Math.round(x + a), Math.round(y + b))) this.set(x + a, y + b, side || c);
          this.set(x, y, c);
        }
      },
      arc(cx, cy, r, a0, a1, c) {
        const n = Math.ceil(r * Math.abs(a1 - a0) * 2) + 2;
        for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; this.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, c); }
      }
    };
  }

  // ---------------- formas ----------------
  // Todas miran hacia la DERECHA (se rotan al dibujar si son direccionales).

  const SHAPES = {
    fire: { w: 15, h: 11, frames: 3, dir: true, gen(P, f) {
      const cx = 10.5, cy = 5;
      for (let x = 1; x <= 9; x++) {                               // cola que parpadea
        const t = (x - 1) / 8;
        const th = 0.5 + t * 2.6 + (H(x, f, 3) - 0.5) * 1.3;
        const yc = cy + Math.sin(x * 1.4 + f * 2.1) * 0.8 * (1 - t);
        for (let y = 0; y < P.h; y++) {
          const d = Math.abs(y - yc);
          if (d > th || (t < 0.3 && H(x, y + f * 7, 5) < 0.4)) continue;
          P.set(x, y, d < th * 0.4 && t > 0.3 ? 'l' : 'm');
        }
      }
      P.fill((x, y) => {                                           // cabeza
        const d = Math.hypot(x - cx, (y - cy) * 1.1);
        return d < 1.3 ? 'w' : d < 2.4 ? 'l' : d < 3.5 ? 'm' : null;
      });
      P.outline();
    } },
    drop: { w: 13, h: 9, dir: true, gen(P) {
      for (let x = 2; x <= 7; x++) {
        const th = (x - 2) / 5 * 2.6;
        for (let y = 0; y < P.h; y++) { const d = Math.abs(y - 4); if (d <= th) P.set(x, y, d < th * 0.5 ? 'l' : 'm'); }
      }
      P.fill((x, y) => { const d = Math.hypot(x - 8.5, y - 4); return d < 1.6 ? 'l' : d < 3.3 ? 'm' : null; });
      P.set(9, 2, 'w'); P.set(10, 3, 'w');
      P.outline();
    } },
    bubble: { w: 11, h: 11, frames: 2, gen(P, f) {
      const rx = 4.3 + f * 0.3, ry = 4.3 - f * 0.3;
      P.fill((x, y) => { const e = Math.hypot((x - 5) / rx, (y - 5) / ry); return e <= 1 ? (e > 0.76 ? 'm' : 'L') : null; });
      P.set(3, 3, 'w'); P.set(4, 3, 'w'); P.set(3, 4, 'w'); P.set(7, 7, 'l');
      P.outline();
    } },
    leaf: { w: 12, h: 7, spin: true, gen(P) {
      P.fill((x, y) => { const dx = Math.abs(x - 5.5) / 5.6, dy = (y - 3) / 2.7; return dx + dy * dy <= 1 ? (y < 3 ? 'l' : 'm') : null; });
      for (let x = 2; x <= 9; x++) P.set(x, 3, 'd');
      P.set(4, 2, 'w');
      P.outline();
    } },
    bolt: { w: 15, h: 10, frames: 2, dir: true, gen(P, f) {
      const pts = f ? [[0, 3], [4, 7], [7, 2], [10, 7], [14, 4]] : [[0, 6], [4, 2], [7, 7], [10, 2], [14, 5]];
      for (let i = 0; i < pts.length - 1; i++) P.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 'w', 1, 'l');
      P.outline();
    } },
    shard: { w: 13, h: 7, dir: true, gen(P) {
      P.fill((x, y) => Math.abs(x - 6) / 6.2 + Math.abs(y - 3) / 3.4 <= 1 ? (y < 3 ? 'l' : 'm') : null);
      for (let x = 6; x <= 11; x++) P.set(x, 3, 'w');
      P.set(4, 2, 'w');
      P.outline();
    } },
    rock: { w: 12, h: 11, frames: 3, spin: true, gen(P, f) {
      const r = [0, 1, 2, 3, 4, 5, 6].map(i => 3.6 + H(i, f, 9) * 1.4);
      P.fill((x, y) => {
        const dx = x - 5.5, dy = y - 5, a = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * 6;
        const i = Math.floor(a), t = a - i;
        const R = r[i] * (1 - t) + r[(i + 1) % 6] * t;
        const d = Math.hypot(dx, dy);
        if (d > R) return null;
        const lit = (-dx * 0.6 - dy * 0.8) / R;
        return lit > 0.35 ? 'l' : lit > -0.3 ? 'm' : 'd';
      });
      P.set(6, 5, 'd'); P.set(7, 6, 'd'); P.set(4, 3, 'w');
      P.outline();
    } },
    blob: { w: 12, h: 11, frames: 2, gen(P, f) {
      P.fill((x, y) => {
        const dx = x - 5.5, dy = y - 4.8, a = Math.atan2(dy, dx);
        const R = 3.9 + Math.sin(a * 3 + f * 2) * 0.5;
        const d = Math.hypot(dx, dy);
        if (d > R) return null;
        const lit = (-dx * 0.6 - dy * 0.8) / R;
        return lit > 0.4 ? 'l' : lit > -0.35 ? 'm' : 'd';
      });
      P.set(4, 3, 'w'); P.set(3, 3, 'w');
      P.set(6, 9, 'm'); if (f) P.set(6, 10, 'm');                   // gota que cuelga
      P.outline();
    } },
    needle: { w: 13, h: 5, dir: true, gen(P) {
      for (let x = 1; x <= 9; x++) P.set(x, 2, 'm');
      for (let x = 3; x <= 8; x++) P.set(x, 1, 'l');
      P.set(10, 2, 'w'); P.set(11, 2, 'w');
      P.set(1, 1, 'd'); P.set(1, 3, 'd');
      P.outline();
    } },
    star: { w: 11, h: 11, frames: 2, spin: true, gen(P, f) {
      const L = f ? 3 : 4;
      for (let i = -L; i <= L; i++) { P.set(5 + i, 5, Math.abs(i) === L ? 'm' : 'l'); P.set(5, 5 + i, Math.abs(i) === L ? 'm' : 'l'); }
      const D = f ? 2 : 1;
      for (let i = 1; i <= D; i++) for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) P.set(5 + a * i, 5 + b * i, 'l');
      P.set(5, 5, 'w'); P.set(4, 5, 'w'); P.set(6, 5, 'w'); P.set(5, 4, 'w'); P.set(5, 6, 'w');
    } },
    streak: { w: 15, h: 5, dir: true, gen(P) {
      for (let x = 0; x < 15; x++) P.set(x, 2, x < 4 ? 'd' : x < 8 ? 'm' : x < 12 ? 'l' : 'w');
      for (let x = 7; x <= 12; x++) { P.set(x, 1, 'l'); P.set(x, 3, 'm'); }
      P.set(13, 1, 'w'); P.set(13, 3, 'w');
    } },
    wind: { w: 13, h: 11, frames: 2, spin: true, gen(P, f) {
      P.arc(6, 5, 4.6, -0.6 + f * 0.7, 2.9 + f * 0.7, 'l');
      P.arc(6, 5, 3.6, -0.3 + f * 0.7, 2.2 + f * 0.7, 'w');
      P.arc(6, 5, 2.2, 1.8 + f, 4.6 + f, 'l');
    } },
    web: { w: 11, h: 11, spin: true, gen(P) {
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; P.line(5, 5, 5 + Math.cos(a) * 5, 5 + Math.sin(a) * 5, 'l'); }
      for (const r of [2.4, 4.4]) for (let k = 0; k < 8; k++) {
        const a0 = k * Math.PI / 4, a1 = (k + 1) * Math.PI / 4;
        P.line(5 + Math.cos(a0) * r, 5 + Math.sin(a0) * r, 5 + Math.cos(a1) * r, 5 + Math.sin(a1) * r, 'w');
      }
    } },
    ring: { w: 13, h: 13, frames: 2, gen(P, f) {
      P.fill((x, y) => {
        const d = Math.hypot(x - 6, y - 6);
        if (Math.abs(d - (5 + f * 0.6)) < 0.75) return 'm';
        if (Math.abs(d - (3 + f * 0.5)) < 0.7) return 'l';
        return null;
      });
      P.set(6, 6, 'w');
    } },
    crescent: { w: 12, h: 11, dir: true, gen(P) {
      P.fill((x, y) => {
        const a = Math.hypot(x - 6.5, y - 5), b = Math.hypot(x - 3.8, y - 5);
        if (a > 4.8 || b < 4.2) return null;
        return b < 5.1 ? 'l' : 'm';
      });
      P.outline();
    } },
    note: { w: 11, h: 11, dir: true, gen(P) {
      P.arc(1, 5, 2.2, -0.7, 0.7, 'w');
      P.arc(1, 5, 4.6, -0.6, 0.6, 'l');
      P.arc(1, 5, 7.2, -0.5, 0.5, 'm');
    } },
    impact: { w: 15, h: 15, frames: 2, gen(P, f) {
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + (f ? Math.PI / 8 : 0), L = (k % 2 ? 3.5 : 6) * (f ? 1 : 0.75);
        P.line(7, 7, 7 + Math.cos(a) * L, 7 + Math.sin(a) * L, 'l');
        P.set(7 + Math.cos(a) * L, 7 + Math.sin(a) * L, 'm');
      }
      P.fill((x, y) => Math.hypot(x - 7, y - 7) < 1.8 ? 'w' : null);
    } },
    claw: { w: 13, h: 13, gen(P) {
      for (let i = 0; i < 3; i++) P.line(1 + i * 3.5, 11, 6 + i * 3.5, 1, 'w', 1, 'l');
      P.outline();
    } },
    jaws: { w: 13, h: 11, frames: 2, gen(P, f) {
      const gap = f ? 0 : 2;
      for (let x = 1; x <= 11; x++) { P.set(x, 1, 'm'); P.set(x, 9, 'm'); }
      for (let t = 0; t < 4; t++) {
        const x = 2 + t * 3;
        P.set(x, 2, 'w'); P.set(x + 1, 2, 'w'); P.set(x, 3, 'w'); P.set(x + 1, 3, 'l');
        if (!gap) { P.set(x, 4, 'w'); }
        P.set(x + 1, 8, 'w'); P.set(x + 2, 8, 'w'); P.set(x + 1, 7, 'w'); P.set(x + 2, 7, 'l');
        if (!gap) P.set(x + 1, 6, 'w');
      }
      P.outline();
    } },
    arrow: { w: 7, h: 9, gen(P) {
      for (let y = 0; y < 4; y++) for (let x = 3 - y; x <= 3 + y; x++) P.set(x, y, x === 3 - y ? 'w' : 'l');
      for (let y = 4; y < 9; y++) for (let x = 2; x <= 4; x++) P.set(x, y, x === 2 ? 'w' : 'm');
      P.outline();
    } },
    ball: { w: 11, h: 11, frames: 2, gen(P, f) {
      P.fill((x, y) => { const d = Math.hypot(x - 5, y - 5); return d < 1.5 ? 'w' : d < 2.9 ? 'l' : d < 4.2 + f * 0.3 ? 'm' : null; });
      P.set(3, 3, 'w');
      P.outline();
    } },
    shadow: { w: 13, h: 13, frames: 3, gen(P, f) {
      P.fill((x, y) => { const d = Math.hypot(x - 6, y - 6); return d < 1.6 ? 'l' : d < 3 ? 'm' : d < 4.4 ? 'd' : null; });
      for (let k = 0; k < 6; k++) {                                 // jirones de sombra
        const a = k * 1.05 + f * 0.7, r = 4.8 + H(k, f, 4) * 1.4;
        P.set(6 + Math.cos(a) * r, 6 + Math.sin(a) * r, 'm');
      }
      P.set(5, 5, 'w');
      P.outline();
    } },
    heart: { w: 9, h: 8, gen(P) {
      ['.ll...ll.', 'lwll.llll', 'lllllllll', 'lllllllll', '.lllllll.', '..lllll..', '...lll...', '....l....']
        .forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') P.set(x, y, c === 'w' ? 'w' : 'l'); }));
      P.outline();
    } },
    // ---- formas del 22-10-2026 (familias de Vampire Survivors) ----
    bone: { w: 13, h: 7, spin: true, gen(P) {
      for (let x = 3; x <= 9; x++) { P.set(x, 3, 'm'); P.set(x, 2, 'l'); }          // caña
      for (const cx of [2, 10]) for (const cy of [2, 4]) {                         // dos nudos en cada punta
        P.fill((x, y) => Math.hypot(x - cx, y - cy) <= 1.5 ? (P.get(x, y) || 'l') : null);
      }
      P.set(1, 1, 'w'); P.set(9, 1, 'w');
      P.outline();
    } },
    shuriken: { w: 11, h: 11, spin: true, gen(P) {
      P.fill((x, y) => {
        const ax = Math.abs(x - 5), ay = Math.abs(y - 5), lo = Math.min(ax, ay), hi = Math.max(ax, ay);
        if (hi > 5 || lo > (5 - hi) * 0.45 + 0.3) return null;                     // estrella de 4 puntas
        return hi >= 3 ? 'l' : 'm';
      });
      P.set(5, 5, 'd');
      P.outline();
    } },
    wheel: { w: 13, h: 13, frames: 2, spin: true, gen(P, f) {
      P.fill((x, y) => Math.abs(Math.hypot(x - 6, y - 6) - 5) < 0.7 ? 'm' : null); // aro
      for (let k = 0; k < 4; k++) {                                                // radios
        const a = f * Math.PI / 4 + k * Math.PI / 2;
        P.line(6, 6, 6 + Math.cos(a) * 4.2, 6 + Math.sin(a) * 4.2, 'l');
      }
      P.fill((x, y) => Math.hypot(x - 6, y - 6) < 1.3 ? 'w' : null);              // buje
      P.outline();
    } },
    seed: { w: 7, h: 5, dir: true, gen(P) {
      P.fill((x, y) => ((x - 2.8) / 2.6) ** 2 + ((y - 2) / 1.7) ** 2 <= 1 ? (y < 2 ? 'l' : 'm') : null);
      P.set(5, 2, 'd'); P.set(6, 2, 'd');                                          // punta delante
      P.set(2, 1, 'w');
      P.outline();
    } },
    petal: { w: 7, h: 6, spin: true, gen(P) {
      P.fill((x, y) => {
        const e = Math.hypot((x - 2.3) / 2.3, (y - 2.5) / 2.1);
        const tail = x >= 4 && Math.abs(y - 2.5) <= (7 - x) * 0.5;                   // lágrima con la punta a la derecha
        if (e > 1 && !tail) return null;
        return e > 0.7 && !tail ? 'm' : 'l';
      });
      P.set(2, 1, 'w');
      P.outline();
    } },
    flask: { w: 9, h: 11, spin: true, gen(P) {
      for (let y = 1; y <= 3; y++) for (let x = 3; x <= 5; x++) P.set(x, y, x === 3 ? 'w' : 'l');   // cuello
      P.fill((x, y) => (Math.hypot(x - 4, y - 6.6) <= 3.3 ? (y < 6 ? 'L' : 'm') : null));      // cuerpo: cristal y líquido
      P.set(2, 6, 'w'); P.set(3, 5, 'w');                                                       // brillo del cristal
      P.outline();
    } },
    feather: { w: 12, h: 5, dir: true, gen(P) {
      for (let x = 2; x <= 9; x++) { P.set(x, 1, 'l'); if (x <= 8) P.set(x, 3, 'm'); }         // barbas
      for (let x = 1; x <= 10; x++) P.set(x, 2, x > 8 ? 'w' : 'd');                            // cañón
      P.outline();
    } },
    coin: { w: 9, h: 9, frames: 2, gen(P, f) {
      const rx = f ? 1.6 : 3.4;                                                                  // f1: de canto
      P.fill((x, y) => { const e = Math.hypot((x - 4) / rx, (y - 4) / 3.4); return e <= 1 ? (e > 0.7 || f ? 'm' : 'l') : null; });
      if (f) P.set(4, 2, 'l');
      else { P.set(4, 3, 'w'); P.set(4, 4, 'w'); P.set(4, 5, 'w'); P.set(3, 3, 'w'); }
      P.outline();
    } },
    bee: { w: 9, h: 8, frames: 2, gen(P, f) {
      const wing = f ? [[2, 3], [3, 3], [5, 3], [6, 3], [3, 2], [5, 2]] : [[3, 1], [4, 1], [5, 1], [3, 2], [4, 2], [5, 2]];
      for (const [x, y] of wing) P.set(x, y, 'L');                                              // alas que baten
      P.fill((x, y) => (((x - 4) / 3.4) ** 2 + ((y - 5) / 1.9) ** 2 <= 1 ? 'm' : null));         // cuerpo
      P.set(7, 4, 'l'); P.set(7, 5, 'l');                                                       // cabeza
      P.set(1, 5, 'd');                                                                         // aguijón
      P.outline();
      for (let y = 4; y <= 6; y++) for (const x of [3, 5]) if (P.get(x, y) === 'm') P.set(x, y, 'o');   // rayas (tras el contorno)
    } },
    wisp: { w: 9, h: 11, frames: 3, gen(P, f) {
      P.fill((x, y) => {
        // Lágrima hacia arriba: redonda abajo y en punta arriba, la punta tiembla.
        const r = y >= 7 ? Math.sqrt(Math.max(0, 7.8 - (y - 7) ** 2)) : 2.8 * (y - 1) / 6;
        const dx = x - 4 - (y < 6 ? Math.sin(f * 2.1 + y) * 0.8 : 0);
        if (r <= 0 || Math.abs(dx) > r) return null;
        return Math.abs(dx) < r * 0.45 && y > 3 ? 'l' : 'm';
      });
      P.set(3, 7, 'w'); P.set(5, 7, 'w');                                                       // ojos
      P.outline();
    } },
    bird: { w: 15, h: 9, dir: true, frames: 2, gen(P, f) {
      const wing = f ? [[4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [5, 7], [6, 7], [7, 7]]          // alas abajo
                     : [[4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [5, 1], [6, 1], [7, 1]];         // o arriba
      for (const [x, y] of wing) P.set(x, y, 'l');
      P.fill((x, y) => (((x - 6.5) / 4) ** 2 + ((y - 4) / 1.6) ** 2 <= 1 ? 'm' : null));        // cuerpo
      P.fill((x, y) => (Math.hypot(x - 10.5, y - 3.5) <= 1.6 ? 'l' : null));                    // cabeza
      P.set(12, 4, 'w'); P.set(13, 4, 'w');                                                     // pico
      P.set(10, 3, 'o');                                                                        // ojo
      P.set(1, 4, 'd'); P.set(2, 4, 'd'); P.set(2, 3, 'd');                                     // cola
      P.outline();
    } },
    shield: { w: 9, h: 10, gen(P) {
      P.fill((x, y) => {
        if (y < 1 || y > 8) return null;
        // Recto arriba y en punta abajo.
        const half = y === 1 ? 2.5 : y <= 4 ? 3.5 : 3.5 - (y - 4) * 0.85, dx = Math.abs(x - 4);
        if (dx > half) return null;
        return dx > half - 1.2 || y === 1 ? 'm' : 'l';
      });
      P.set(3, 3, 'w'); P.set(3, 4, 'w'); P.set(2, 3, 'w');
      P.outline();
    } }
  };

  // ---------------- caché y dibujo ----------------

  const cache = new Map();

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }

  function sprite(shape, pal, frame = 0) {
    const S = SHAPES[shape] || SHAPES.ball;
    const f = (frame | 0) % (S.frames || 1);
    const k = shape + '|' + pal + '|' + f;
    let cv = cache.get(k);
    if (cv) return cv;
    const P = grid(S.w, S.h);
    S.gen(P, f);
    cv = document.createElement('canvas');
    cv.width = S.w; cv.height = S.h;
    const c = cv.getContext('2d');
    const colors = PAL[pal] || PAL.normal;
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
      const ch = P.g[y][x];
      if (!ch) continue;
      c.fillStyle = ch === 'L' ? rgba(colors[3], 0.5) : colors[IDX[ch]];
      c.fillRect(x, y, 1, 1);
    }
    cache.set(k, cv);
    return cv;
  }

  /** Dibuja centrado en (x, y). opts: angle, scale (1 = píxel de juego), frame, alpha, flip (mirando a la izquierda). */
  function draw(ctx, shape, pal, x, y, o = {}) {
    const S = SHAPES[shape] || SHAPES.ball;
    const cv = sprite(shape, pal, o.frame || 0);
    const k = PX * (o.scale || 1);
    ctx.save();
    if (o.alpha != null && o.alpha < 1) ctx.globalAlpha *= o.alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y));
    let a = o.angle || 0;
    if (a) {
      a = Math.round(a / (Math.PI / 8)) * (Math.PI / 8);          // 16 direcciones: menos parpadeo
      ctx.rotate(a);
    }
    if (o.flip) ctx.scale(-1, 1);
    ctx.drawImage(cv, -S.w * k / 2, -S.h * k / 2, S.w * k, S.h * k);
    ctx.restore();
  }

  function isDir(shape) { return !!(SHAPES[shape] && SHAPES[shape].dir); }
  function spins(shape) { return !!(SHAPES[shape] && SHAPES[shape].spin); }
  function frames(shape) { return (SHAPES[shape] && SHAPES[shape].frames) || 1; }

  // ---------------- cómo se ve cada movimiento ----------------
  //   proj: forma del proyectil (también novas y orbes)
  //   beam: forma que viaja por el rayo ('lightning' = zigzag)
  //   melee: extra del golpe (impact, jaws, claw, vine, feather)
  //   aura / buff: partícula que acompaña
  //   pal: paleta si no es la del tipo · trail: partículas de estela

  const MOVE = {
    'quick-attack':  { proj: 'streak' },
    'ember':         { proj: 'fire', trail: 'ember' },
    'heat-wave':     { proj: 'fire', trail: 'ember' },
    'fire-spin':     { proj: 'fire', trail: 'ember' },
    'flamethrower':  { proj: 'fire', trail: 'ember', beam: 'fire' },
    'water-gun':     { proj: 'drop', trail: 'drip' },
    'bubble':        { proj: 'bubble' },
    'hydro-pump':    { beam: 'drop' },
    'aqua-ring':     { buff: 'bubble' },
    'vine-whip':     { melee: 'vine' },
    'razor-leaf':    { proj: 'leaf' },
    'leaf-storm':    { proj: 'leaf' },
    'giga-drain':    { aura: 'heart', inward: true },
    'thunder-shock': { proj: 'bolt', trail: 'spark' },
    'discharge':     { aura: 'bolt' },
    'thunderbolt':   { beam: 'lightning' },
    'confusion':     { proj: 'ring' },
    'psybeam':       { beam: 'ring' },
    'psychic':       { proj: 'ring' },
    'sludge':        { proj: 'blob', trail: 'bubbles' },
    'poison-sting':  { proj: 'needle' },
    'toxic':         { aura: 'bubble', rise: true },
    'mud-shot':      { proj: 'blob', trail: 'dirt' },
    'bulldoze':      { aura: 'rock', rise: true },
    'gust':          { proj: 'wind' },
    'wing-attack':   { melee: 'feather' },
    'tackle':        { melee: 'impact' },
    'body-slam':     { melee: 'impact' },
    'hyper-voice':   { proj: 'note' },
    'bug-bite':      { melee: 'jaws' },
    'string-shot':   { proj: 'web' },
    'bug-buzz':      { aura: 'note' },
    'rock-throw':    { proj: 'rock', trail: 'dirt' },
    'rock-slide':    { proj: 'rock', trail: 'dirt' },
    'ice-beam':      { beam: 'shard' },
    'powder-snow':   { aura: 'star' },
    'karate-chop':   { melee: 'impact' },
    'aura-sphere':   { proj: 'ball', pal: 'aura', trail: 'spark' },
    'lick':          { melee: 'impact' },
    'shadow-ball':   { proj: 'shadow', trail: 'wisp' },
    'dragon-rage':   { beam: 'fire' },
    'dragon-dance':  { buff: 'arrow' },
    'fairy-wind':    { proj: 'star' },
    'dazzling-gleam': { aura: 'star' },
    'metal-claw':    { melee: 'claw' },
    'flash-cannon':  { beam: 'shard' },
    'bite':          { melee: 'jaws' },
    'dark-pulse':    { proj: 'crescent' },
    'night-shade':   { aura: 'shadow', rise: true },
    'swords-dance':  { buff: 'arrow', pal: 'fighting' },
    'agility':       { buff: 'arrow', pal: 'flying' },
    'harden':        { buff: 'arrow', pal: 'steel' },
    'bonemerang':    { proj: 'crescent' },
    'psycho-cut':    { proj: 'crescent' },
    'spikes':        { proj: 'star' },
    'toxic-spikes':  { proj: 'star' },
    'hail':          { proj: 'shard' },
    'meteor-mash':   { proj: 'rock', trail: 'spark' },
    'will-o-wisp':   { proj: 'ball', trail: 'ember' },
    'substitute':    { proj: 'star' },
    'aerial-ace':    { proj: 'wind' },
    'flame-wheel':   { proj: 'fire', aura: 'fire' },
    'bubble-beam':   { proj: 'bubble' },
    'hex':           { beam: 'shadow', proj: 'shadow' },
    // nuevos del 19-10-2026 (mismas formas, cada uno con las suyas)
    'hyper-beam':    { beam: 'star', proj: 'star' },
    'rapid-spin':    { melee: 'impact' },
    'flame-charge':  { proj: 'fire', trail: 'ember' },
    'whirlpool':     { proj: 'drop', trail: 'drip' },
    'seed-bomb':     { proj: 'leaf' },
    'energy-ball':   { proj: 'ball', trail: 'spark' },
    'solar-beam':    { beam: 'star', proj: 'leaf' },
    'thunder-wave':  { proj: 'bolt', trail: 'spark' },
    'electro-ball':  { proj: 'bolt', trail: 'spark' },
    'extrasensory':  { proj: 'ring' },
    'mist-ball':     { proj: 'ring', trail: 'wisp' },
    'acid-spray':    { proj: 'blob', trail: 'bubbles' },
    'sand-tomb':     { proj: 'rock', trail: 'dirt' },
    'magnitude':     { proj: 'rock', trail: 'dirt' },
    'whirlwind':     { proj: 'wind' },
    'air-slash':     { proj: 'crescent' },
    'signal-beam':   { proj: 'star', trail: 'spark' },
    'u-turn':        { proj: 'needle' },
    'rock-tomb':     { proj: 'rock', trail: 'dirt' },
    'ancient-power': { proj: 'rock' },
    'power-gem':     { proj: 'shard', trail: 'spark' },
    'ice-shard':     { proj: 'shard' },
    'freeze-dry':    { proj: 'shard' },
    'rolling-kick':  { melee: 'impact' },
    'vacuum-wave':   { proj: 'ring', pal: 'aura' },
    'dynamic-punch': { proj: 'impact' },
    'shadow-sneak':  { proj: 'shadow', trail: 'wisp' },
    'ominous-wind':  { proj: 'shadow', trail: 'wisp' },
    'dragon-breath': { proj: 'fire', trail: 'ember' },
    'dragon-claw':   { melee: 'claw' },
    'outrage':       { melee: 'claw' },
    'draining-kiss': { proj: 'heart' },
    'play-rough':    { melee: 'impact' },
    'disarming-voice': { proj: 'note' },
    'mirror-shot':   { proj: 'shard', trail: 'spark' },
    'gyro-ball':     { melee: 'impact' },
    'sucker-punch':  { proj: 'crescent' },
    'night-slash':   { melee: 'claw' },
    // nuevos del 22-10-2026 (familias de Vampire Survivors)
    'bone-club':     { proj: 'bone' },
    'rock-blast':    { proj: 'rock', trail: 'dirt' },
    'water-shuriken': { proj: 'shuriken', trail: 'drip' },
    'bullet-seed':   { proj: 'seed' },
    'pin-missile':   { proj: 'needle' },
    'scale-shot':    { proj: 'shard' },
    'swift':         { proj: 'star', trail: 'spark' },
    'cross-poison':  { proj: 'crescent' },
    'cross-chop':    { proj: 'crescent' },
    'twister':       { proj: 'wind' },
    // columnas: lo de dentro cae (agua, carámbanos) o sube (rise: luz, el gancho)
    'waterfall':     { proj: 'drop', trail: 'drip' },
    'photon-geyser': { proj: 'star', trail: 'spark', rise: true },
    'icicle-crash':  { proj: 'shard' },
    'sky-uppercut':  { proj: 'impact', rise: true },
    // agujas: beam = cómo se ve el rayo; proj = lo que suelta la punta
    'charge-beam':   { beam: 'lightning', proj: 'bolt' },
    'aurora-beam':   { beam: 'shard', proj: 'shard' },
    'fleur-cannon':  { beam: 'star', proj: 'petal' },
    'pyro-ball':     { proj: 'ball', pal: 'fire', trail: 'ember' },
    'aura-wheel':    { proj: 'wheel', trail: 'spark' },
    'rollout':       { proj: 'rock', trail: 'dirt' },
    // barridos de pantalla: proj = lo que sale sobre cada enemigo alcanzado
    'perish-song':   { proj: 'note', pal: 'ghost' },
    'dark-void':     { proj: 'shadow' },
    // escudos: proj = el escudo; aura = lo que suelta al parar un golpe
    'spiky-shield':  { proj: 'shield', aura: 'leaf' },
    'baneful-bunker': { proj: 'shield', aura: 'bubble' },
    'kings-shield':  { proj: 'shield', aura: 'star' },
    // aliados (Paliza: tu Pokémon en pequeño)
    'attack-order':  { proj: 'bee', pal: 'electric' },
    'last-respects': { proj: 'wisp' },
    'beat-up':       { proj: 'impact' },
    // aves: las bombas son bolas de su color
    'dual-wingbeat': { proj: 'bird' },
    'steel-wing':    { proj: 'bird', trail: 'spark' },
    // charcos: proj = lo que se lanza; aura = lo que sale del charco
    'fire-pledge':   { proj: 'flask', aura: 'fire' },
    'psychic-terrain': { proj: 'ring', aura: 'ring' },
    'mud-bomb':      { proj: 'blob', aura: 'rock' },
    // lluvias
    'feather-dance': { proj: 'feather' },
    'astral-barrage': { proj: 'shadow', trail: 'wisp' },
    'springtide-storm': { proj: 'petal' },
    'make-it-rain':  { proj: 'coin', pal: 'electric' }
  };

  // -- ataques únicos: Lucha, Veneno, Tierra, Volador, Psíquico, Bicho (26-10-2026) --
  // Paletas, formas y aspecto propio de cada ataque de estos tipos (su mecánica, en combat.js).
  Object.assign(PAL, {
    acid:      ['#243206', '#4f6e0a', '#9ccc24', '#dcff62', '#fbffd2'],    // Bomba Ácida: verde-amarillo
    ghostfire: ['#05241a', '#0c5634', '#27c873', '#98ffba', '#eafff0'],    // Hueso Sombrío (Marowak de Alola)
    yveltal:   ['#120308', '#3c0a18', '#a3162e', '#ff4b5c', '#ffd4d8'],    // Ala Mortífera
    // (gold —Espada Santa, Ataque Aéreo—: la del bloque de Roca, Fantasma..., de abajo; es la misma)
    mist:      ['#56607a', '#9aa6c4', '#d2dcf2', '#f0f5ff', '#ffffff'],    // Bola Neblina
    mud:       ['#241606', '#4a2e10', '#7a5222', '#a87c46', '#dcbc8e'],    // Disparo Lodo, Bomba Fango
    hotsand:   ['#5a1c04', '#a8460c', '#f08a24', '#ffc75a', '#fff0c0'],    // Arenas Ardientes, Tierra Viva
    psyb:      ['#3c0a5a', '#7a24b0', '#c45cff', '#ffe36a', '#fff8d8'],    // Psicorrayo: violeta y amarillo
    focus:     ['#1a1c58', '#2c5cd0', '#ff8a2e', '#ffd28a', '#ffffff'],    // Onda Certera: azul y naranja
    silk:      ['#5a5a66', '#a4a4b4', '#e2e2ea', '#f8f8ff', '#ffffff']     // Disparo Demora
  });
  Object.assign(SHAPES, {
    // Espiral de confusión (sobre la cabeza).
    spiral: { w: 11, h: 11, frames: 2, gen(P, f) {
      for (let i = 0; i < 26; i++) { const a = i * 0.48 + f * 1.6, r = 0.6 + i * 0.17; P.set(5 + Math.cos(a) * r, 5 + Math.sin(a) * r, i > 18 ? 'l' : 'm'); }
      P.set(5, 5, 'w');
    } },
    // Ojo de Premonición.
    eye: { w: 13, h: 9, frames: 2, gen(P, f) {
      P.fill((x, y) => { const e = ((x - 6) / 6) ** 2 + ((y - 4) / (f ? 2.6 : 3.4)) ** 2; return e <= 1 ? (e > 0.55 ? 'l' : 'w') : null; });
      P.fill((x, y) => Math.hypot(x - 6, y - 4) < 1.9 ? 'm' : null);
      P.set(6, 4, 'o'); P.set(5, 3, 'w');
      P.outline();
    } },
    // Marca en X (Tijera X, Veneno X).
    xmark: { w: 9, h: 9, gen(P) {
      for (let i = 0; i < 9; i++) { P.set(i, i, i === 4 ? 'w' : 'l'); P.set(8 - i, i, i === 4 ? 'w' : 'l'); }
      P.outline();
    } },
    // Rombo de señalado (Rayo Señal).
    diamond: { w: 7, h: 9, gen(P) {
      P.fill((x, y) => Math.abs(x - 3) / 3.2 + Math.abs(y - 4) / 4.2 <= 1 ? (y < 4 ? 'l' : 'm') : null);
      P.set(3, 2, 'w'); P.outline();
    } },
    // Escudo roto (vulnerable).
    crackshield: { w: 9, h: 10, gen(P) {
      SHAPES.shield.gen(P);
      for (const [x, y] of [[4, 1], [5, 2], [4, 3], [3, 4], [4, 5], [5, 6], [4, 7]]) P.set(x, y, 'o');
    } },
    // Abrojo de 4 puntas (Púas).
    caltrop: { w: 9, h: 7, gen(P) {
      P.line(1, 5, 4, 3, 'm'); P.line(7, 5, 4, 3, 'm'); P.line(4, 3, 4, 0, 'l'); P.line(4, 3, 4, 6, 'd');
      P.set(4, 3, 'w'); P.set(4, 0, 'w');
      P.outline();
    } },
    // Espada clavada (Espada Santa): mira hacia abajo.
    swordv: { w: 7, h: 17, gen(P) {
      for (let y = 6; y <= 15; y++) { P.set(3, y, 'w'); P.set(2, y, 'l'); P.set(4, y, 'm'); }
      P.set(3, 16, 'l');
      for (let x = 0; x <= 6; x++) P.set(x, 5, 'd');                   // cruz
      for (let y = 1; y <= 4; y++) P.set(3, y, 'm');                   // empuñadura
      P.set(3, 0, 'l');
      P.outline();
    } },
    // Embudo de tornado (Huracán, Vendaval).
    tornado: { w: 17, h: 21, frames: 3, gen(P, f) {
      for (let y = 1; y < 20; y++) {
        const w = 1 + (20 - y) * 0.36, cx = 8 + Math.sin(y * 0.45 + f * 2.1) * 1.6;
        for (let k = -1; k <= 1; k += 2) P.set(cx + k * w, y, (y + f) % 3 ? 'l' : 'w');
        if (y % 3 === f) P.line(cx - w, y, cx + w, y, 'm');
      }
    } },
    // Bocanada de nube o gas.
    puff: { w: 15, h: 9, frames: 2, gen(P, f) {
      const B = [[4, 5, 3.4], [8, 4, 4], [11.5, 5.2, 3], [7, 6, 3.2]];
      P.fill((x, y) => { for (const [cx, cy, r] of B) { const d = Math.hypot(x - cx, (y - cy) * 1.2); if (d < r + (f ? 0.3 : 0)) return d < r * 0.5 ? 'w' : y < 5 ? 'l' : 'm'; } return null; });
      P.outline();
    } },
    // Colmena (Escaramuza).
    hive: { w: 13, h: 15, gen(P) {
      P.fill((x, y) => { const e = ((x - 6) / 5.6) ** 2 + ((y - 8) / 6.4) ** 2; return e <= 1 ? (y % 3 === 0 ? 'd' : x < 5 ? 'l' : 'm') : null; });
      P.fill((x, y) => Math.hypot(x - 6, y - 11) < 1.6 ? 'o' : null);   // boca
      P.set(6, 1, 'd'); P.set(6, 0, 'd');
      P.outline();
    } },
    // Puño (mira a la derecha).
    fistd: { w: 11, h: 11, dir: true, gen(P) {
      P.fill((x, y) => (x >= 4 && x <= 9 && y >= 2 && y <= 8 && !(x === 9 && (y === 2 || y === 8))) ? (y < 4 ? 'l' : 'm') : null);
      for (let y = 3; y <= 7; y++) P.set(1, y, 'd'), P.set(2, y, 'm'), P.set(3, y, 'm');   // muñeca
      for (const y of [4, 6]) P.set(8, y, 'd');                                             // dedos
      P.set(5, 2, 'w'); P.set(6, 2, 'w');
      P.outline();
    } },
    // Taladro (Taladradora): cono en espiral que mira a la derecha.
    drill: { w: 15, h: 11, frames: 2, dir: true, gen(P, f) {
      P.fill((x, y) => { const hw = (14 - x) * 0.36; return x >= 1 && Math.abs(y - 5) <= hw ? ((x + y * 2 + f * 2) % 4 < 2 ? 'l' : 'm') : null; });
      P.set(14, 5, 'w');
      P.outline();
    } },
    // Cuerno de luz (Megacuerno).
    horn: { w: 15, h: 9, dir: true, gen(P) {
      P.fill((x, y) => { const hw = (14 - x) * 0.3 + 0.5; const yc = 5 - (x / 14) * 1.5; return x >= 1 && Math.abs(y - yc) <= hw ? (y < yc ? 'w' : 'l') : null; });
      P.outline();
    } }
  });
  Object.assign(MOVE, {
    // Psíquico
    'confusion':      { proj: 'ring', trail: 'wisp' },
    'psybeam':        { beam: 'ring', pal: 'psyb' },
    'psychic':        { proj: 'ring' },
    'psycho-cut':     { proj: 'crescent', trail: 'wisp' },
    'extrasensory':   { proj: 'eye' },
    'mist-ball':      { proj: 'ball', pal: 'mist', trail: 'wisp' },
    'photon-geyser':  { proj: 'star', pal: 'electric', trail: 'spark', rise: true },
    'psychic-terrain': { proj: 'ring', aura: 'spiral' },
    // Veneno
    'sludge':         { proj: 'blob', trail: 'bubbles' },
    'poison-sting':   { proj: 'needle', trail: 'bubbles' },
    'toxic':          { aura: 'bubble', rise: true },
    'toxic-spikes':   { proj: 'caltrop' },
    'acid-spray':     { proj: 'drop', pal: 'acid', trail: 'bubbles' },
    'cross-poison':   { proj: 'crescent', trail: 'wisp' },
    'baneful-bunker': { proj: 'shield', aura: 'puff' },
    // Tierra
    'mud-shot':       { proj: 'blob', pal: 'mud', trail: 'dirt' },
    'bulldoze':       { proj: 'rock', aura: 'rock', rise: true },
    'bonemerang':     { proj: 'bone' },
    'spikes':         { proj: 'caltrop', pal: 'steel' },
    'sand-tomb':      { proj: 'rock', trail: 'dirt' },
    'magnitude':      { proj: 'rock', trail: 'dirt' },
    'bone-club':      { proj: 'bone' },
    'mud-bomb':       { proj: 'blob', pal: 'mud', aura: 'bubble' },
    // Volador
    'gust':           { proj: 'wind' },
    'wing-attack':    { melee: 'feather', proj: 'feather' },
    'aerial-ace':     { proj: 'feather' },
    'whirlwind':      { proj: 'wind' },
    'air-slash':      { proj: 'crescent', trail: 'spark' },
    'dual-wingbeat':  { proj: 'bird' },
    'feather-dance':  { proj: 'feather', beam: 'wind' },
    // Bicho
    'bug-bite':       { melee: 'jaws' },
    'string-shot':    { proj: 'web', pal: 'silk' },
    'bug-buzz':       { aura: 'note' },
    'signal-beam':    { proj: 'diamond', trail: 'spark' },
    'u-turn':         { proj: 'streak', trail: 'spark' },
    'pin-missile':    { proj: 'needle' },
    'attack-order':   { proj: 'bee', pal: 'electric' },
    // Lucha
    'karate-chop':    { melee: 'impact', proj: 'fistd' },
    'aura-sphere':    { proj: 'ball', pal: 'aura', trail: 'spark' },
    'rolling-kick':   { melee: 'impact', proj: 'streak' },
    'vacuum-wave':    { proj: 'ring', pal: 'aura' },
    'dynamic-punch':  { proj: 'fistd' },
    'cross-chop':     { proj: 'crescent', trail: 'spark' },
    'sky-uppercut':   { proj: 'fistd', rise: true }
  });
  // -- fin: ataques únicos --

  /* ---- ataques únicos: Roca, Fantasma, Dragón, Siniestro, Acero, Hada (26-10-2026) ----
   * Formas, paletas y aspecto propio de cada ataque de estos seis tipos (el resto, en sus bloques).
   * Formas: gem, spike, axe, fist, gobj (objetos fantasma), crack, dragonhead, dreepy, scale,
   * moon, cloud, flower, mirror, magnet, sword. Todas con caché, como las demás. */
  Object.assign(PAL, {
    gem:       ['#4a0a1e', '#a0183e', '#e8406a', '#ff9ab8', '#ffffff'],
    diamond:   ['#5a3a5e', '#b07ab8', '#f2c6f0', '#ffeefc', '#ffffff'],
    ancient:   ['#2a2016', '#5e4a2e', '#9a8058', '#d8c48e', '#9af0ff'],
    rockhot:   ['#3a1206', '#8a2e10', '#d85a24', '#ffa860', '#fff0c0'],
    tongue:    ['#4a0e36', '#a03070', '#e66aa8', '#ffb0d6', '#ffffff'],
    umbra:     ['#08040e', '#1e1030', '#3c2468', '#7a52c0', '#d8c0ff'],
    wisp:      ['#101a48', '#2a3a9a', '#5a6aff', '#a8b4ff', '#f0f2ff'],
    dragonhot: ['#2a0a50', '#6a1eb0', '#a45cff', '#e0c8ff', '#ffffff'],
    dreepy:    ['#0e2a40', '#2a5e8a', '#4aa0d8', '#9ad8ff', '#ffffff'],
    lunar:     ['#3a3048', '#8a7a9e', '#d8cce6', '#fff0fa', '#ffffff'],
    regal:     ['#3e2a06', '#8a6010', '#d8a820', '#ffe070', '#fffbe0'],
    gold:      ['#4a3000', '#a06c00', '#f0b800', '#ffe46a', '#ffffff'],
    rose:      ['#5a0a2a', '#b02a5a', '#ff6a9a', '#ffc0d8', '#ffffff'],
    therian:   ['#5a0a1a', '#b0203a', '#ff4a6a', '#ff9aaa', '#fff0f0'],
    verdant:   ['#0e3a1a', '#2a7a3a', '#5ac86a', '#ffb0d0', '#ffffff'],
    magnet:    ['#2a1010', '#8a1a1a', '#e03a3a', '#c8d0d8', '#ffffff'],
    laser:     ['#4a0a0a', '#c02020', '#ff5a5a', '#ffd0d0', '#ffffff'],
    nightmare: ['#1a0612', '#4a0e2a', '#8a1e4a', '#d05a8a', '#ffd0e0']
  });
  Object.assign(SHAPES, {
    // Gema facetada: corona arriba y punta abajo; destella (Joya de Luz, Tormenta de Diamantes).
    gem: { w: 11, h: 11, frames: 2, spin: true, gen(P, f) {
      P.fill((x, y) => {
        const dx = Math.abs(x - 5);
        if (y < 1 || y > 10) return null;
        if (y <= 3) { const half = 2 + (y - 1) * 1.4; return dx <= half ? (y === 1 ? 'l' : dx < 1 ? 'w' : 'l') : null; }
        const half = 4.8 - (y - 3) * 0.72;
        return dx <= half ? (x < 5 ? 'm' : 'd') : null;
      });
      for (let x = 2; x <= 8; x++) P.set(x, 4, 'l');
      P.set(4, 6, 'l'); P.set(5, 7, 'm');
      if (f) { P.set(3, 2, 'w'); P.set(7, 5, 'w'); }
      P.outline();
    } },
    // Pico de piedra (Roca Afilada, Trampa Rocas): triángulo con grieta.
    spike: { w: 9, h: 12, gen(P) {
      P.fill((x, y) => {
        if (y < 1 || y > 10) return null;
        const half = (y - 1) * 0.42 + 0.4, dx = x - 4;
        if (Math.abs(dx) > half) return null;
        return dx < -half * 0.3 ? 'l' : dx > half * 0.45 ? 'd' : 'm';
      });
      P.set(4, 1, 'w'); P.set(3, 4, 'w'); P.line(5, 5, 4, 8, 'd');
      P.outline();
    } },
    // Hacha de piedra que gira (Hachazo Pétreo).
    axe: { w: 13, h: 13, spin: true, gen(P) {
      P.line(3, 11, 9, 3, 'd', 1, 'm');                                            // mango
      P.fill((x, y) => {                                                           // hoja de piedra
        const dx = x - 9, dy = y - 3, d = Math.hypot(dx, dy);
        return d < 3.6 && dx + dy > -1.5 ? (dx - dy > 1 ? 'l' : 'm') : null;
      });
      P.set(11, 1, 'w'); P.set(12, 3, 'w');
      P.outline();
    } },
    // Puño que sale del suelo (Puño Sombra) o que cae (Puño Meteoro).
    fist: { w: 11, h: 11, gen(P) {
      P.fill((x, y) => {
        if (y >= 3 && y <= 7 && x >= 1 && x <= 9) return y === 3 ? 'l' : x === 1 ? 'd' : 'm';      // nudillos
        if (y >= 8 && y <= 10 && x >= 3 && x <= 7) return 'd';                                       // muñeca
        return null;
      });
      for (const x of [3, 5, 7]) P.set(x, 4, 'd');                                                   // dedos
      P.set(2, 3, 'w'); P.set(8, 5, 'l'); P.set(9, 6, 'l');
      P.outline();
    } },
    // Objetos fantasma (Poltergeist): cuchara, piedra y taza según el fotograma.
    gobj: { w: 11, h: 11, frames: 3, spin: true, gen(P, f) {
      if (f === 0) {
        P.line(2, 9, 7, 4, 'l', 1, 'm');
        P.fill((x, y) => (((x - 8) / 2.2) ** 2 + ((y - 3) / 1.8) ** 2 <= 1 ? 'l' : null));
        P.set(8, 2, 'w');
      } else if (f === 1) {
        P.fill((x, y) => { const d = Math.hypot(x - 5, (y - 5) * 1.2); return d < 4 ? (x + y < 9 ? 'l' : 'm') : null; });
        P.set(4, 3, 'w');
      } else {
        P.fill((x, y) => (y >= 3 && y <= 8 && x >= 2 && x <= 7 ? (x === 2 ? 'l' : 'm') : null));
        P.arc(8, 5.5, 1.8, -1.5, 1.5, 'l');
        P.set(3, 3, 'w');
      }
      P.outline();
    } },
    // Grieta en el suelo (Rayo Umbrío).
    crack: { w: 15, h: 7, gen(P) {
      const pts = [[0, 3], [3, 2], [5, 4], [8, 2], [10, 4], [14, 3]];
      for (let i = 0; i < pts.length - 1; i++) P.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 'w', 1, 'm');
      P.set(6, 5, 'm'); P.set(9, 1, 'm');
    } },
    // Cabeza de dragón con las fauces abiertas (Pulso Dragón).
    dragonhead: { w: 17, h: 13, frames: 2, dir: true, gen(P, f) {
      const open = f ? 1 : 2;
      P.fill((x, y) => {                                                           // cráneo
        const d = Math.hypot((x - 7) / 6, (y - 5) / 3.6);
        return d <= 1 ? (y < 4 ? 'l' : 'm') : null;
      });
      for (let x = 9; x <= 15; x++) { P.set(x, 4 - open + Math.floor((x - 9) / 4), 'm'); P.set(x, 7 + open - Math.floor((x - 9) / 4), 'm'); }   // mandíbulas
      for (let x = 10; x <= 14; x += 2) { P.set(x, 5 - open + Math.floor((x - 9) / 4), 'w'); P.set(x, 6 + open - Math.floor((x - 9) / 4), 'w'); }
      P.line(2, 2, 0, 0, 'l'); P.line(4, 1, 3, 0, 'l');                            // cuernos
      P.set(8, 3, 'o'); P.set(7, 3, 'w');                                          // ojo
      P.outline();
    } },
    // Dreepy (Dracoflecha): flecha translúcida con cabeza de triángulo.
    dreepy: { w: 13, h: 9, frames: 2, dir: true, gen(P, f) {
      P.fill((x, y) => {
        if (x >= 7) { const half = (12 - x) * 0.8; return Math.abs(y - 4) <= half ? (y < 4 ? 'l' : 'm') : null; }  // cabeza
        const half = 1 + (x - 1) * 0.15 + (f && x < 3 ? 0.5 : 0);
        return x >= 1 && Math.abs(y - 4 - Math.sin(x * 1.2 + f * 2) * 0.6) <= half ? 'L' : null;                  // cola
      });
      P.set(9, 3, 'o'); P.set(10, 4, 'w');
      P.outline();
    } },
    // Escama (Ráfaga Escamas): rombo con brillo.
    scale: { w: 9, h: 9, dir: true, gen(P) {
      P.fill((x, y) => (Math.abs(x - 4) / 4.2 + Math.abs(y - 4) / 3 <= 1 ? (y < 4 ? 'l' : x > 5 ? 'd' : 'm') : null));
      P.set(3, 3, 'w'); P.set(4, 2, 'w');
      P.outline();
    } },
    // Luna creciente con halo (Fuerza Lunar).
    moon: { w: 13, h: 13, frames: 2, gen(P, f) {
      P.fill((x, y) => {
        const a = Math.hypot(x - 6, y - 6), b = Math.hypot(x - 8.6, y - 4.6);
        if (a > 5.4 || b < 4.2) return f && a <= 6.2 && a > 5.4 && (x + y) % 3 === 0 ? 'L' : null;
        return b < 5 ? 'w' : a > 4.4 ? 'm' : 'l';
      });
      P.outline();
    } },
    // Nube de pelea (Carantoña): bolas de polvo con una mano o una pata que asoma.
    cloud: { w: 17, h: 13, frames: 3, gen(P, f) {
      const B = [[5, 7, 3.6], [9, 5, 4], [12, 8, 3.4], [8, 9, 3.4]];
      P.fill((x, y) => {
        for (const [cx, cy, r] of B) { const d = Math.hypot(x - cx - (f === 1 ? 0.5 : 0), y - cy); if (d <= r) return d < r * 0.55 ? 'w' : 'l'; }
        return null;
      });
      const limbs = [[[1, 6], [2, 6], [1, 7]], [[15, 4], [15, 5], [16, 5]], [[7, 12], [8, 12], [8, 11]]];
      for (const [x, y] of limbs[f]) P.set(x, y, 'm');
      P.set(f * 4 + 4, 3, 'm');                                                    // estrellita
      P.outline();
    } },
    // Flor (Cañón Floral): cinco pétalos y el centro; abierta en el fotograma 1.
    flower: { w: 11, h: 11, frames: 2, gen(P, f) {
      const R = f ? 3.4 : 2.4;
      for (let k = 0; k < 5; k++) {
        const a = k * 1.2566 - 1.57, cx = 5 + Math.cos(a) * R, cy = 5 + Math.sin(a) * R;
        P.fill((x, y) => (Math.hypot(x - cx, y - cy) <= 1.7 ? (P.get(x, y) || 'm') : null));
      }
      P.fill((x, y) => (Math.hypot(x - 5, y - 5) <= 1.4 ? 'w' : null));
      P.set(4, 4, 'l');
      P.outline();
    } },
    // Espejo que gira (Disparo Espejo): óvalo con marco, más estrecho al girar.
    mirror: { w: 11, h: 13, frames: 3, gen(P, f) {
      const rx = [4.4, 2.8, 1.2][f];
      P.fill((x, y) => {
        const e = Math.hypot((x - 5) / rx, (y - 5.5) / 5);
        if (e > 1) return null;
        return e > 0.78 ? 'm' : (x - 5 + (y - 5.5) * 0.5 < -0.5 ? 'w' : 'l');
      });
      P.set(5, 12, 'd'); P.set(5, 11, 'm');
      P.outline();
    } },
    // Imán en U (Bomba Imán).
    magnet: { w: 11, h: 11, gen(P) {
      P.fill((x, y) => {
        const d = Math.hypot(x - 5, y - 4);
        if (y <= 4 && d <= 4.6 && d >= 2) return 'm';
        if (y > 4 && y <= 9 && ((x >= 1 && x <= 3) || (x >= 7 && x <= 9))) return y >= 8 ? 'l' : 'm';
        return null;
      });
      P.set(1, 9, 'w'); P.set(9, 9, 'w'); P.set(3, 1, 'w');
      P.outline();
    } },
    // Espada fantasma (Embate Supremo, Aegislash).
    sword: { w: 17, h: 7, dir: true, gen(P) {
      for (let x = 5; x <= 15; x++) { P.set(x, 3, 'w'); P.set(x, 2, x < 14 ? 'l' : null); P.set(x, 4, x < 14 ? 'm' : null); }
      P.set(16, 3, 'l');
      for (let y = 0; y <= 6; y++) P.set(4, y, 'd');                               // guarda
      for (let x = 0; x <= 3; x++) P.set(x, 3, 'm');                               // empuñadura
      P.set(0, 3, 'l');
      P.outline();
    } }
  });
  Object.assign(MOVE, {
    // Roca
    'rock-throw':    { proj: 'rock', trail: 'dirt' },
    'rock-slide':    { proj: 'rock', trail: 'dirt', aura: 'spike' },
    'rock-tomb':     { proj: 'rock', trail: 'dirt' },
    'ancient-power': { proj: 'rock', pal: 'ancient', trail: 'spark' },
    'power-gem':     { proj: 'gem', pal: 'gem', trail: 'spark' },
    'rock-blast':    { proj: 'rock', trail: 'dirt' },
    'rollout':       { proj: 'rock', trail: 'dirt' },
    // Fantasma
    'lick':          { pal: 'tongue' },
    'shadow-ball':   { proj: 'shadow', pal: 'umbra', trail: 'wisp' },
    'hex':           { beam: 'shadow', proj: 'gobj', pal: 'umbra' },
    'shadow-sneak':  { proj: 'shadow', pal: 'umbra', melee: 'claw' },
    'ominous-wind':  { proj: 'leaf', pal: 'umbra', trail: 'wisp' },
    'last-respects': { proj: 'wisp', pal: 'wisp' },
    'astral-barrage': { proj: 'shadow', pal: 'wisp', trail: 'wisp' },
    // Dragón
    'dragon-rage':   { beam: 'fire', pal: 'dragon' },
    'dragon-dance':  { buff: 'fire', pal: 'dragon' },
    'dragon-breath': { proj: 'fire', trail: 'ember', pal: 'dragon' },
    'dragon-claw':   { melee: 'claw', proj: 'crescent' },
    'outrage':       { melee: 'claw', proj: 'dreepy' },
    'scale-shot':    { proj: 'scale', trail: 'spark' },
    'twister':       { proj: 'wind', trail: 'wisp' },
    // Hada
    'fairy-wind':    { proj: 'star', trail: 'spark' },
    'dazzling-gleam': { aura: 'star' },
    'draining-kiss': { proj: 'heart' },
    'play-rough':    { proj: 'cloud', melee: 'impact' },
    'disarming-voice': { proj: 'note', aura: 'heart' },
    'fleur-cannon':  { beam: 'star', proj: 'petal', aura: 'flower', pal: 'rose' },
    'springtide-storm': { proj: 'petal' },
    // Acero
    'metal-claw':    { melee: 'claw' },
    'flash-cannon':  { beam: 'shard' },
    'meteor-mash':   { proj: 'fist', trail: 'spark' },
    'mirror-shot':   { proj: 'shard', trail: 'spark', aura: 'mirror' },
    'gyro-ball':     { melee: 'impact', proj: 'wheel' },
    'kings-shield':  { proj: 'shield', aura: 'star', pal: 'regal' },
    'steel-wing':    { proj: 'bird', trail: 'spark' },
    'make-it-rain':  { proj: 'coin', pal: 'gold' },
    // Siniestro
    'bite':          { melee: 'jaws' },
    'dark-pulse':    { proj: 'crescent', pal: 'umbra' },
    'night-shade':   { aura: 'shadow', rise: true },
    'sucker-punch':  { proj: 'fist', trail: 'wisp' },
    'night-slash':   { melee: 'claw' },
    'dark-void':     { proj: 'shadow' },
    'beat-up':       { proj: 'impact' }
  });
  /* ---- fin del bloque de Roca, Fantasma, Dragón, Siniestro, Acero, Hada ---- */

  const TYPE_SHAPE = {
    fire: 'fire', water: 'drop', grass: 'leaf', electric: 'bolt', psychic: 'ring', ice: 'shard',
    fighting: 'ball', poison: 'blob', ground: 'blob', flying: 'wind', bug: 'needle', rock: 'rock',
    ghost: 'shadow', dragon: 'fire', dark: 'crescent', steel: 'shard', fairy: 'star', normal: 'star'
  };

  function forMove(m) {
    // (Los movimientos Z traen la suya en m.vfx: data/moves.js.)
    const v = MOVE[m.id] || m.vfx || {};
    return Object.assign({ pal: m.type, proj: TYPE_SHAPE[m.type] || 'ball' }, v, { pal: v.pal || m.type });
  }
  function forType(type) { return { proj: TYPE_SHAPE[type] || 'ball', pal: PAL[type] ? type : 'normal' }; }

  return { PAL, SHAPES, draw, sprite, forMove, forType, isDir, spins, frames };
})();
