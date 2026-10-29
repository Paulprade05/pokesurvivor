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

  // -- ataques únicos: Normal, Fuego, Agua, Planta, Eléctrico, Hielo (26-10-2026) --
  // Formas y paletas nuevas (E15) y los iconos de estado de los enemigos (E1: espiral, rombo, X).
  Object.assign(PAL, {
    wisp:     ['#1a0c3c', '#3b2a9a', '#6a5aff', '#a99cff', '#efeaff'],   // fuego fatuo azul-violeta
    crimson:  ['#3c0012', '#8a0f2a', '#e0284a', '#ff7a8e', '#ffe0e6'],   // Infierno
    whitehot: ['#1c3c60', '#5fa8e0', '#bfe8ff', '#eaf8ff', '#ffffff'],   // fuego blanco-azulado (Sofoco, Rayo Fusión)
    sacred:   ['#5a3a00', '#b07a10', '#ffcf3a', '#ffeea0', '#ffffff'],   // dorado (Fuego Sagrado, Rayo Solar)
    lava:     ['#120404', '#3a0e08', '#c8300a', '#ff7a1f', '#ffd23f'],   // roca de lava (Erupción, Balón Ígneo)
    steam:    ['#5a6a78', '#9aaab8', '#d4e0ea', '#f0f6fa', '#ffffff'],   // vapor (Escaldar)
    brine:    ['#0f3c3a', '#1f7a6e', '#4fc8a8', '#a8f0d8', '#ffffff'],   // salmuera
    aurora:   ['#1a3a4a', '#3aa0a0', '#7ff0c8', '#c8ffe8', '#ffffff'],   // aurora (dos tonos que se turnan)
    aurora2:  ['#3a1a4a', '#8a4ac8', '#c88aff', '#ecd2ff', '#ffffff'],
    rainbow:  ['#3a2a5a', '#ff5a5a', '#ffd23f', '#5fe08a', '#ffffff']    // estelar / arcoíris
  });
  Object.assign(SHAPES, {
    // Espada fantasma de Danza Espada (mira a la derecha). (La de Aegislash es 'sword', más abajo.)
    dsword: { w: 19, h: 7, dir: true, gen(P) {
      P.set(0, 3, 'l'); for (let x = 1; x <= 3; x++) P.set(x, 3, 'd');      // pomo y empuñadura
      for (let y = 0; y <= 6; y++) P.set(4, y, y === 0 || y === 6 ? 'd' : 'm');   // guarda en cruz
      for (let x = 5; x <= 16; x++) { P.set(x, 2, 'l'); P.set(x, 3, 'w'); P.set(x, 4, 'm'); }   // hoja con filo
      P.set(17, 3, 'l'); P.set(18, 3, 'w');                                 // punta
      P.outline();
    } },
    // Engranaje de Cambio de Marcha.
    gear: { w: 11, h: 11, spin: true, gen(P) {
      P.fill((x, y) => {
        const d = Math.hypot(x - 5, y - 5), a = Math.atan2(y - 5, x - 5), tooth = Math.cos(a * 8) > 0.4;
        if (d < 1.5) return null;
        return d < 3.4 ? (d < 2.4 ? 'l' : 'm') : d < 4.9 && tooth ? 'm' : null;
      });
      P.outline();
    } },
    // Muñeco de trapo de Sustituto (f1: agrietado).
    doll: { w: 11, h: 13, frames: 2, gen(P, f) {
      P.fill((x, y) => (Math.hypot(x - 5, y - 4) <= 3.6 ? (y < 3 ? 'l' : 'm') : null));    // cabeza
      for (let y = 7; y <= 11; y++) for (let x = 3; x <= 7; x++) P.set(x, y, x === 3 ? 'l' : 'm');   // cuerpo
      for (const x of [1, 2, 8, 9]) P.set(x, 8, 'm');                                       // brazos
      P.set(4, 12, 'm'); P.set(6, 12, 'm');                                                 // piernas
      P.set(4, 4, 'o'); P.set(6, 4, 'o');                                                   // ojos
      for (let y = 8; y <= 10; y += 2) P.set(5, y, 'd');                                    // costura
      P.outline();
      if (f) { P.set(6, 2, 'o'); P.set(7, 3, 'o'); P.set(6, 5, 'o'); P.set(4, 9, 'o'); P.set(5, 10, 'o'); }
    } },
    // Cresta de ola (Surf), mira a la derecha.
    wave: { w: 13, h: 11, frames: 2, dir: true, gen(P, f) {
      P.fill((x, y) => {
        const top = 3 + Math.round(Math.cos((x - 9) / 3.2) * 2.6) + (f && x < 6 ? 1 : 0);
        return y >= top && x >= 1 && x <= 11 ? (y < top + 2 ? 'l' : y > 8 ? 'd' : 'm') : null;
      });
      for (let x = 8; x <= 11; x++) P.set(x, 2 + (x === 11 ? 1 : 0), 'w');                 // espuma
      P.set(12, 4, 'w'); P.set(7, 3, 'w');
      P.outline();
    } },
    // Nube de vapor o de granizo (Granizo, Escaldar, Erupción). (La de pelea de Carantoña es 'cloud'.)
    vapor: { w: 15, h: 8, gen(P) {
      P.fill((x, y) => {
        const a = Math.hypot(x - 4.5, y - 4.6) <= 3.2, b = Math.hypot(x - 8, y - 3.5) <= 3.4, c = Math.hypot(x - 11, y - 4.8) <= 2.8;
        if (!(a || b || c)) return null;
        return y >= 6 ? 'd' : y <= 2 ? 'w' : 'l';
      });
      P.outline();
    } },
    // Iconos de estado: espiral (confuso), rombo (señalado, el plan de Maquinación) y X (marca X).
    'st-spiral': { w: 9, h: 9, spin: true, gen(P) {
      for (let i = 0; i < 26; i++) { const a = i * 0.45, r = 0.6 + i * 0.14; P.set(4 + Math.cos(a) * r, 4 + Math.sin(a) * r, i % 4 ? 'l' : 'w'); }
      P.outline();
    } },
    'st-diamond': { w: 7, h: 9, gen(P) {
      P.fill((x, y) => (Math.abs(x - 3) / 3.2 + Math.abs(y - 4) / 4.2 <= 1 ? (x < 3 && y < 4 ? 'w' : x <= 3 ? 'l' : 'm') : null));
      P.outline();
    } },
    'st-x': { w: 7, h: 7, gen(P) {
      for (let i = 0; i <= 6; i++) { P.set(i, i, 'l'); P.set(6 - i, i, 'l'); }
      P.set(3, 3, 'w');
      P.outline();
    } }
  });

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
  // -- ataques únicos: Normal, Fuego, Agua, Planta, Eléctrico, Hielo (26-10-2026) --
  // Cómo se ve cada uno con su mecánica nueva, y (MOVE_EVO) el aspecto propio de su evolución.
  Object.assign(MOVE, {
    'swords-dance':  { buff: 'dsword', pal: 'steel' },
    'nasty-plot':    { buff: 'st-diamond', pal: 'psychic' },
    'agility':       { buff: 'streak', pal: 'flying' },
    'harden':        { buff: 'shield', pal: 'steel' },
    'substitute':    { proj: 'doll' },
    'will-o-wisp':   { proj: 'wisp', pal: 'wisp' },
    'pyro-ball':     { proj: 'rock', pal: 'lava', trail: 'ember' },
    'leaf-storm':    { proj: 'petal', pal: 'fairy' },
    'giga-drain':    { aura: 'leaf', inward: true },
    'seed-bomb':     { proj: 'seed' },
    'energy-ball':   { proj: 'ball', pal: 'grass', trail: 'spark' },
    'electro-ball':  { proj: 'ball', pal: 'electric', trail: 'spark' },
    'aurora-beam':   { beam: 'shard', proj: 'shard', pal: 'aurora' }
  });
  const MOVE_EVO = {
    'water-gun':     { proj: 'drop', pal: 'steam', trail: 'drip' },
    'swift':         { proj: 'star', pal: 'rainbow', trail: 'spark' },
    'will-o-wisp':   { proj: 'wisp', pal: 'crimson', trail: 'ember' },
    'charge-beam':   { beam: 'lightning', proj: 'bolt', pal: 'whitehot' },
    'whirlpool':     { proj: 'shard', pal: 'brine' },
    'ember':         { proj: 'fire', pal: 'whitehot', trail: 'ember' },
    'pyro-ball':     { proj: 'rock', pal: 'crimson', trail: 'ember' },
    'electro-ball':  { proj: 'ball', pal: 'whitehot', trail: 'spark' },
    'hyper-beam':    { beam: 'star', proj: 'star', pal: 'rainbow' },
    'harden':        { buff: 'shield', pal: 'steel' }
  };

  const TYPE_SHAPE = {
    fire: 'fire', water: 'drop', grass: 'leaf', electric: 'bolt', psychic: 'ring', ice: 'shard',
    fighting: 'ball', poison: 'blob', ground: 'blob', flying: 'wind', bug: 'needle', rock: 'rock',
    ghost: 'shadow', dragon: 'fire', dark: 'crescent', steel: 'shard', fairy: 'star', normal: 'star'
  };

  function forMove(m) {
    // (Los movimientos Z traen la suya en m.vfx: data/moves.js.)
    // (Ataques únicos: la evolución puede tener su propio aspecto, MOVE_EVO.)
    const v = (m.evolved && MOVE_EVO[m.id]) || MOVE[m.id] || m.vfx || {};
    return Object.assign({ pal: m.type, proj: TYPE_SHAPE[m.type] || 'ball' }, v, { pal: v.pal || m.type });
  }
  function forType(type) { return { proj: TYPE_SHAPE[type] || 'ball', pal: PAL[type] ? type : 'normal' }; }

  return { PAL, SHAPES, draw, sprite, forMove, forType, isDir, spins, frames };
})();

/* ============ firmas de los jefes y grietas: lo que se ve (26-10-2026) ============
 * Dibujo de lo nuevo de los jefes (G.BossSig, en entities/enemy.js) y de la grieta
 * (viaje por la grieta y llegada del legendario, systems/rift.js). Formas sencillas
 * de canvas y pocas partículas (móviles flojos): sin degradados por fotograma salvo
 * la oscuridad y el fondo del túnel (que se guarda).
 */
G.BossFX = (() => {
  const TAU = Math.PI * 2;
  const H = (a, b, c) => G.U.hash(a, b, c);
  const rgba = (hex, a) => { const n = parseInt(String(hex).slice(1, 7), 16) || 0; return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const ease = k => k * k * (3 - 2 * k);
  const cl = k => (k < 0 ? 0 : k > 1 ? 1 : k);
  const font = (w, s) => (G.HUD && G.HUD.F ? G.HUD.F(w, s) : w + ' ' + s + 'px sans-serif');

  /** Rayas quebradas desde (x, y): grietas, rayos, rasgaduras. Deterministas con `seed`. */
  function jag(ctx, x0, y0, x1, y1, seg, amp, seed, t = 0) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    ctx.moveTo(x0, y0);
    for (let i = 1; i < seg; i++) {
      const k = i / seg, o = (H(seed, i, (t * 12) | 0) - 0.5) * 2 * amp;
      ctx.lineTo(x0 + dx * k + nx * o, y0 + dy * k + ny * o);
    }
    ctx.lineTo(x1, y1);
  }

  // ---------------- campos en el suelo ----------------

  /** Charco redondo (quema, frena, duerme...) con el detalle de su estilo. a: opacidad 0..1. */
  function pool(ctx, x, y, r, st, col, col2, a, now, seed) {
    ctx.save();
    ctx.globalAlpha = a * (st === 'mist' || st === 'dream' ? 0.3 : 0.24);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = a * 0.75; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.setLineDash(st === 'elec' ? [3, 5] : []);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 1.5; ctx.strokeStyle = col2; ctx.globalAlpha = a * 0.8;
    if (st === 'ice') {
      // Placa de hielo (resbala): brillo blanco que cruza y grietas finas.
      ctx.globalAlpha = a * 0.35; ctx.fillStyle = '#e8fbff';
      ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, TAU); ctx.fill();
      const sh = ((now * 0.45 + H(seed, 1, 1)) % 1.4) - 0.2;
      ctx.globalAlpha = a * 0.75; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - r * 0.7 + sh * r, y - r * 0.5); ctx.lineTo(x - r * 0.9 + sh * r, y + r * 0.5); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = col2; ctx.beginPath();
      for (let i = 0; i < 4; i++) { const an = H(seed, i, 3) * TAU; jag(ctx, x, y, x + Math.cos(an) * r * 0.8, y + Math.sin(an) * r * 0.8, 3, 3, seed + i); }
      ctx.stroke();
    } else if (st === 'whirl') {
      // Remolino: espirales que giran hacia el centro.
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = a * 0.7; ctx.beginPath();
        for (let j = 0; j <= 14; j++) { const k = j / 14, an = i / 4 * TAU + k * 4 - now * 3, rr = r * (1 - k * 0.9); const px = x + Math.cos(an) * rr, py = y + Math.sin(an) * rr * 0.8; if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.stroke();
      }
    } else if (st === 'spikes' || st === 'rubble') {
      // Lanzas de hielo clavadas / rocas sueltas que quedan en el suelo.
      for (let i = 0; i < 5; i++) {
        const px = x + (H(seed, i, 5) - 0.5) * r * 1.3, py = y + (H(seed, i, 6) - 0.5) * r * 1.0, s = 5 + H(seed, i, 7) * 6;
        ctx.globalAlpha = a; ctx.fillStyle = st === 'spikes' ? '#dff8ff' : '#8a7350'; ctx.strokeStyle = st === 'spikes' ? '#6fc8e8' : '#4a3a24'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (st === 'spikes') { ctx.moveTo(px - s * 0.4, py); ctx.lineTo(px, py - s * 2.2); ctx.lineTo(px + s * 0.4, py); }
        else { for (let j = 0; j < 6; j++) { const an = j / 6 * TAU + i; const q = s * (0.7 + H(seed, i * 6 + j, 2) * 0.4); if (j) ctx.lineTo(px + Math.cos(an) * q, py + Math.sin(an) * q * 0.7 - s * 0.4); else ctx.moveTo(px + Math.cos(an) * q, py + Math.sin(an) * q * 0.7 - s * 0.4); } }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else if (st === 'seed') {
      // Drenadoras: semillas con brotes que laten (te quitan vida).
      for (let i = 0; i < 4; i++) {
        const px = x + (H(seed, i, 5) - 0.5) * r * 1.1, py = y + (H(seed, i, 6) - 0.5) * r * 0.8, p = 1 + Math.sin(now * 5 + i) * 0.2;
        ctx.globalAlpha = a; ctx.fillStyle = '#a8742c'; ctx.beginPath(); ctx.ellipse(px, py, 4 * p, 3 * p, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#7ad850'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py - 2); ctx.quadraticCurveTo(px + 6, py - 8, px + 2, py - 12 * p); ctx.stroke();
      }
    } else if (st === 'lava' || st === 'sand' || st === 'fire') {
      // Suelo agrietado que brilla.
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const an = H(seed, i, 3) * TAU; jag(ctx, x, y, x + Math.cos(an) * r * 0.92, y + Math.sin(an) * r * 0.92, 4, r * 0.08, seed + i); }
      ctx.globalAlpha = a * (0.55 + Math.sin(now * 6 + seed) * 0.25);
      ctx.stroke();
    } else if (st === 'water' || st === 'mist') {
      for (let i = 0; i < 3; i++) {
        const k = (now * 0.5 + i / 3 + H(seed, i, 1)) % 1;
        ctx.globalAlpha = a * (1 - k) * 0.7;
        ctx.beginPath(); ctx.arc(x + (H(seed, i, 7) - 0.5) * r, y + (H(seed, i, 8) - 0.5) * r, 4 + k * r * 0.35, 0, TAU); ctx.stroke();
      }
    } else if (st === 'toxic') {
      ctx.fillStyle = col2;
      for (let i = 0; i < 5; i++) {
        const k = (now * 0.8 + H(seed, i, 2)) % 1, bx = x + (H(seed, i, 5) - 0.5) * r * 1.3, by = y + (H(seed, i, 6) - 0.5) * r * 1.3;
        ctx.globalAlpha = a * (1 - k);
        ctx.beginPath(); ctx.arc(bx, by - k * 10, 2 + k * 3, 0, TAU); ctx.fill();
      }
    } else if (st === 'dream') {
      ctx.fillStyle = col2; ctx.font = font(700, 9); ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        const k = (now * 0.5 + i / 3) % 1;
        ctx.globalAlpha = a * (1 - k);
        G.I18n && G.I18n.rawCanvas ? G.I18n.rawCanvas(ctx, 'fillText', 'z', x + (i - 1) * r * 0.4, y - k * 22) : ctx.fillText('z', x + (i - 1) * r * 0.4, y - k * 22);
      }
    } else if (st === 'grass' || st === 'leaf') {
      for (let i = 0; i < 7; i++) {
        const fx = x + (H(seed, i, 5) - 0.5) * r * 1.4, fy = y + (H(seed, i, 6) - 0.5) * r * 1.4;
        if ((fx - x) ** 2 + (fy - y) ** 2 > r * r * 0.8) continue;
        ctx.fillStyle = i % 2 ? '#fff4a0' : '#ff9fd8'; ctx.globalAlpha = a * 0.9;
        ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 3, 3);
      }
    } else if (st === 'elec' || st === 'psy') {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const an = H(seed, i, (now * 8) | 0) * TAU, rr = r * (0.3 + H(seed, i, 9) * 0.6);
        jag(ctx, x + Math.cos(an) * rr * 0.3, y + Math.sin(an) * rr * 0.3, x + Math.cos(an) * rr, y + Math.sin(an) * rr, 3, 4, seed + i, now);
      }
      ctx.globalAlpha = a; ctx.stroke();
    } else if (st === 'dark' || st === 'shadow') {
      ctx.fillStyle = '#05020a'; ctx.globalAlpha = a * 0.35;
      ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /** Franja en el suelo (grieta que arde, rastro de una embestida) de (x, y) a (x2, y2). */
  function band(ctx, x, y, x2, y2, w, st, col, col2, a, now, seed) {
    const an = Math.atan2(y2 - y, x2 - x), len = Math.hypot(x2 - x, y2 - y);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(an);
    ctx.globalAlpha = a * 0.26; ctx.fillStyle = col;
    ctx.beginPath(); ctx.rect(0, -w / 2, len, w); ctx.fill();
    ctx.globalAlpha = a * 0.8; ctx.strokeStyle = col2; ctx.lineWidth = st === 'lava' || st === 'fire' ? 2 : 1.5;
    ctx.beginPath(); jag(ctx, 0, 0, len, 0, Math.max(3, Math.round(len / 24)), w * 0.25, seed, st === 'elec' ? now : 0);
    if (st === 'lava' || st === 'fire') ctx.globalAlpha = a * (0.6 + Math.sin(now * 7 + seed) * 0.3);
    ctx.stroke();
    ctx.restore();
  }

  /** Aviso de un anillo que va a estallar (de r1 a r2), lleno según k (0..1). */
  function annulus(ctx, x, y, r1, r2, k, col, a, blink) {
    ctx.save();
    const path = s => { ctx.beginPath(); ctx.arc(x, y, r2 * s + r1 * (1 - s), 0, TAU); if (r1 > 1) ctx.arc(x, y, r1, TAU, 0, true); };
    path(1); ctx.globalAlpha = a * 0.15; ctx.fillStyle = col; ctx.fill('evenodd');
    path(cl(k)); ctx.globalAlpha = a * 0.3; ctx.fill('evenodd');
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.globalAlpha = a * 0.6;
    ctx.beginPath(); ctx.arc(x, y, r2, 0, TAU); ctx.stroke();
    if (r1 > 1) { ctx.beginPath(); ctx.arc(x, y, r1, 0, TAU); ctx.stroke(); }
    ctx.lineWidth = 2; ctx.strokeStyle = blink ? '#ffffff' : col; ctx.globalAlpha = a * 0.9; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(x, y, r2, 0, TAU); ctx.stroke();
    if (r1 > 1) { ctx.beginPath(); ctx.arc(x, y, r1, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }

  /** Onda que crece con huecos (ángulos de `gaps`, cada uno de ±gw). */
  function wave(ctx, x, y, R, th, gaps, gw, col, col2, a, st) {
    if (R <= 0) return;
    ctx.save();
    const gs = gaps.slice().sort((p, q) => p - q);
    const arcs = [];
    for (let i = 0; i < gs.length; i++) {
      const s = gs[i] + gw, e = (i + 1 < gs.length ? gs[i + 1] : gs[0] + TAU) - gw;
      if (e > s) arcs.push([s, e]);
    }
    if (!gs.length) arcs.push([0, TAU]);
    ctx.lineCap = 'round';
    ctx.globalAlpha = a * 0.55; ctx.strokeStyle = col; ctx.lineWidth = th;
    for (const [s, e] of arcs) { ctx.beginPath(); ctx.arc(x, y, R, s, e); ctx.stroke(); }
    ctx.globalAlpha = a; ctx.strokeStyle = col2; ctx.lineWidth = 2;
    for (const [s, e] of arcs) { ctx.beginPath(); ctx.arc(x, y, R + th * 0.35, s, e); ctx.stroke(); }
    // Notas musicales / copos encima (estilos con forma).
    if (st === 'notes' || st === 'ice' || st === 'leaf') {
      const n = Math.min(14, Math.round(R / 14));
      for (let i = 0; i < n; i++) {
        const an = i / n * TAU + R * 0.004;
        if (gs.some(g => Math.abs(((an - g + Math.PI * 3) % TAU) - Math.PI) < gw)) continue;
        const sx = x + Math.cos(an) * R, sy = y + Math.sin(an) * R;
        if (st === 'notes') { ctx.fillStyle = col2; ctx.fillRect(Math.round(sx) - 2, Math.round(sy) - 1, 4, 3); ctx.fillRect(Math.round(sx) + 1, Math.round(sy) - 7, 1, 7); }
        else G.VFX.draw(ctx, st === 'ice' ? 'shard' : 'leaf', st === 'ice' ? 'ice' : 'grass', sx, sy, { angle: an, scale: 0.6 });
      }
    }
    ctx.restore();
  }

  /** Jaula de rayos (o de magma) que se cierra: anillo quebrado de radio R. */
  function cage(ctx, x, y, R, col, col2, a, now, seed) {
    ctx.save();
    const n = Math.max(12, Math.round(R / 7));
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const an = i / n * TAU, rr = R + (H(seed, i, (now * 14) | 0) - 0.5) * 9;
      const px = x + Math.cos(an) * rr, py = y + Math.sin(an) * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.globalAlpha = a * 0.35; ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.stroke();
    ctx.globalAlpha = a; ctx.strokeStyle = col2; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = a * 0.12; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    // Postes de la jaula.
    ctx.fillStyle = col2; ctx.globalAlpha = a;
    for (let i = 0; i < 8; i++) { const an = i / 8 * TAU + now * 0.6; ctx.fillRect(Math.round(x + Math.cos(an) * R) - 2, Math.round(y + Math.sin(an) * R) - 6, 4, 8); }
    ctx.restore();
  }

  // ---------------- en el aire ----------------

  /**
   * Lo que cae del cielo en un punto (rayo, meteoro, estrella, pilar de luz...).
   * k: 0..1 hasta el golpe; de 1 a 1,4, lo que queda después.
   */
  function sky(ctx, st, x, y, k, col, col2, now, seed) {
    ctx.save();
    const pre = k < 1, aft = k >= 1 ? cl((k - 1) / 0.4) : 0;
    if (st === 'bolt') {
      // Nube oscura encima y, al llegar, el rayo.
      if (pre) {
        ctx.globalAlpha = 0.18 + k * 0.25; ctx.fillStyle = '#1a1d2e';
        ctx.beginPath(); ctx.ellipse(x, y, 18 + k * 16, 7 + k * 6, 0, 0, TAU); ctx.fill();
      } else if (aft < 1) {
        ctx.globalAlpha = 1 - aft; ctx.strokeStyle = col; ctx.lineWidth = 5;
        ctx.beginPath(); jag(ctx, x + (H(seed, 1, 2) - 0.5) * 60, y - 420, x, y, 9, 16, seed); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
      }
    } else if (st === 'pillar' || st === 'geyser' || st === 'steam' || st === 'fire' || st === 'rainbow' || st === 'bluefire' || st === 'vfire' || st === 'sun') {
      // Brillo en el suelo y, al llegar, una columna que sube.
      if (pre) {
        ctx.globalAlpha = 0.25 + k * 0.5; ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(x, y, 8 + k * 14, 4 + k * 6, 0, 0, TAU); ctx.fill();
      } else if (aft < 1) {
        const hgt = 70 + 220 * ease(cl(aft * 2.2)), w = st === 'steam' ? 26 : 18;
        const c = st === 'rainbow' ? ['#ff6b4d', '#ffd25e', '#5fe08a', '#4fa8ff', '#b37bff'][(seed % 5 + 5) % 5] : col;
        ctx.globalAlpha = (1 - aft) * 0.8; ctx.fillStyle = c;
        ctx.fillRect(Math.round(x - w / 2), Math.round(y - hgt), w, hgt);
        ctx.globalAlpha = (1 - aft); ctx.fillStyle = col2;
        ctx.fillRect(Math.round(x - w / 6), Math.round(y - hgt), Math.round(w / 3), hgt);
      }
    } else if (st === 'time') {
      // Esfera de reloj verde que da la vuelta y estalla.
      const R = 26;
      ctx.globalAlpha = pre ? 0.4 + k * 0.5 : 1 - aft; ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y - 6, R, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + Math.cos(k * TAU - Math.PI / 2) * R * 0.8, y - 6 + Math.sin(k * TAU - Math.PI / 2) * R * 0.8); ctx.stroke();
      if (!pre) { ctx.fillStyle = col2; ctx.beginPath(); ctx.arc(x, y - 6, R * (1 + aft), 0, TAU); ctx.globalAlpha = (1 - aft) * 0.4; ctx.fill(); }
    } else {
      // Algo que cae en diagonal (roca, meteoro, estrella, flecha, lanza, luna, puño...).
      const dir = H(seed, 3, 4) < 0.5 ? -1 : 1, kk = pre ? ease(k) : 1;
      const sx = x + dir * 140 * (1 - kk), sy = y - 420 * (1 - kk);
      if (pre) {
        ctx.globalAlpha = 0.2 + k * 0.35; ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.ellipse(x, y, 6 + k * 14, 3 + k * 6, 0, 0, TAU); ctx.fill();
        if (k > 0.35) {
          ctx.globalAlpha = 0.6; ctx.strokeStyle = col; ctx.lineWidth = st === 'meteor' ? 6 : 3;
          ctx.beginPath(); ctx.moveTo(sx + dir * 40, sy - 120); ctx.lineTo(sx, sy); ctx.stroke();
          const shape = { meteor: 'rock', rock: 'rock', star: 'star', diamond: 'shard', arrow: 'needle', spear: 'shard', moon: 'crescent', fist: 'ball', heart: 'star', leaf: 'leaf' }[st] || 'rock';
          const pal = { meteor: 'dragon', rock: 'rock', star: 'electric', diamond: 'fairy', arrow: 'grass', spear: 'ice', moon: 'fairy', fist: 'fighting', heart: 'fairy', leaf: 'grass' }[st] || 'rock';
          ctx.globalAlpha = 1;
          G.VFX.draw(ctx, shape, pal, sx, sy, { angle: Math.atan2(120, -dir * 40) + Math.PI, scale: st === 'meteor' || st === 'fist' ? 2 : 1.4 });
        }
      } else if (aft < 1) {
        ctx.globalAlpha = 1 - aft; ctx.fillStyle = col2;
        ctx.beginPath(); ctx.arc(x, y - 4, 10 + aft * 26, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Oscuridad: sólo se ve cerca de (px, py). a: 0..1. */
  function dark(ctx, cam, px, py, a) {
    if (a <= 0) return;
    ctx.save();
    const g = ctx.createRadialGradient(px, py - 14, 60, px, py - 14, 175);
    g.addColorStop(0, 'rgba(6,3,14,0)'); g.addColorStop(1, `rgba(6,3,14,${(0.92 * a).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(cam.left() - 30, cam.top() - 30, cam.w + 60, cam.h + 60);
    ctx.restore();
  }

  /** Viento: rayas que cruzan la vista en la dirección (ax, ay). */
  function wind(ctx, cam, ax, ay, a, now, col) {
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    const L = cam.left(), T = cam.top(), W = cam.w + 160, Hh = cam.h + 160;
    for (let i = 0; i < 18; i++) {
      const u = (H(i, 1, 9) * W + now * 420 * ax + 8000 * W) % W, v = (H(i, 2, 9) * Hh + now * 420 * ay + 8000 * Hh) % Hh;
      const x = L - 80 + u, y = T - 80 + v;
      ctx.globalAlpha = a * (0.25 + H(i, 3, 9) * 0.45);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ax * 34, y - ay * 34); ctx.stroke();
    }
    ctx.restore();
  }

  /** Orbe que te persigue. */
  function orb(ctx, x, y, r, st, col, col2, now) {
    ctx.save();
    ctx.globalAlpha = 0.3; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r * 1.8 + Math.sin(now * 9) * 1.5, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    if (st === 'bubble' || st === 'dream') {
      // Burbuja (Danza Lluvia, Bostezo): transparente con su brillo.
      ctx.globalAlpha = 0.35; ctx.fillStyle = col2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.95; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x - r * 0.45), Math.round(y - r * 0.5), 3, 3);
      ctx.restore();
      return;
    }
    if (st === 'heart') { heartShape(ctx, x, y, r * 1.1, col, col2); ctx.restore(); return; }
    const shape = { moon: 'crescent', diamond: 'shard', ghost: 'shadow', shuriken: 'star', dart: 'needle', bug: 'needle', steel: 'shard', psy: 'ring' }[st];
    const pal = { moon: 'fairy', diamond: 'fairy', ghost: 'ghost', shuriken: 'water', dart: 'dragon', bug: 'bug', steel: 'steel', psy: 'psychic' }[st];
    if (shape) G.VFX.draw(ctx, shape, pal, x, y, { angle: now * 6, scale: 1.3 });
    else { ctx.fillStyle = col2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore();
  }

  // ---------------- sobre el jefe ----------------

  /** Nombre de la firma encima del jefe (sube un poco y se va). */
  function label(ctx, x, y, txt, col, a, pop) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(Math.round(x), Math.round(y));
    if (pop !== 1) ctx.scale(pop, pop);
    ctx.font = font(700, 15);
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    // Borde de su color, otro oscuro y la letra clara: se lee sobre cualquier suelo.
    ctx.lineWidth = 7; ctx.strokeStyle = col; ctx.globalAlpha = a * 0.75;
    ctx.strokeText(txt, 0, 0);
    ctx.globalAlpha = a; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(10,8,24,.95)';
    ctx.strokeText(txt, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillText(txt, 0, 0);
    ctx.restore();
  }

  /** Barrera: burbuja de hexágonos que late. */
  function bubble(ctx, x, y, rx, ry, col, a, now) {
    ctx.save();
    ctx.globalAlpha = a * (0.16 + Math.sin(now * 5) * 0.04); ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = a * 0.85; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1; ctx.globalAlpha = a * 0.45;
    const s = Math.min(rx, ry) * 0.42;
    for (let i = 0; i < 7; i++) {
      const cx = i ? x + Math.cos(i / 6 * TAU + now * 0.4) * s * 1.6 : x, cy = i ? y + Math.sin(i / 6 * TAU + now * 0.4) * s * 1.6 * ry / rx : y;
      ctx.beginPath();
      for (let j = 0; j <= 6; j++) { const an = j / 6 * TAU + Math.PI / 6; const px = cx + Math.cos(an) * s * 0.6, py = cy + Math.sin(an) * s * 0.6 * ry / rx; if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Carga: luz que se junta en el jefe (k: 0..1). */
  function charge(ctx, x, y, r, col, k, now) {
    ctx.save();
    ctx.fillStyle = col;
    for (let i = 0; i < 10; i++) {
      const an = i / 10 * TAU + now * 2, d = r * (2.6 - 2 * ((k * 2 + i / 10) % 1));
      ctx.globalAlpha = 0.8; ctx.fillRect(Math.round(x + Math.cos(an) * d) - 1, Math.round(y + Math.sin(an) * d * 0.8) - 1, 3, 3);
    }
    ctx.globalAlpha = 0.25 + k * 0.45;
    ctx.beginPath(); ctx.arc(x, y, r * (0.3 + k * 0.7), 0, TAU); ctx.fill();
    ctx.restore();
  }

  /** Reloj de Dialga: esfera con agujas que giran (k: 0..1). */
  function clock(ctx, x, y, R, k, a, now) {
    ctx.save();
    ctx.globalAlpha = a * 0.55; ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, R * 0.86, 0, TAU); ctx.stroke();
    for (let i = 0; i < 12; i++) { const an = i / 12 * TAU; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * R * 0.86, y + Math.sin(an) * R * 0.86); ctx.lineTo(x + Math.cos(an) * R * 0.74, y + Math.sin(an) * R * 0.74); ctx.stroke(); }
    ctx.globalAlpha = a * 0.9; ctx.strokeStyle = '#d8f0ff'; ctx.lineWidth = 3;
    const m = now * 3.2, hh = now * 0.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(m) * R * 0.8, y + Math.sin(m) * R * 0.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(hh) * R * 0.5, y + Math.sin(hh) * R * 0.5); ctx.stroke();
    ctx.restore();
  }

  /** Los puntos de Braille de los Regi, que se encienden uno a uno (k: 0..1). */
  function braille(ctx, x, y, col, k) {
    ctx.save();
    const dots = [[0, 0], [0, 1], [1, 1], [0, 2], [1, 0], [1, 2], [0, 1]];
    for (let c = 0; c < 3; c++) for (let i = 0; i < 6; i++) {
      const lit = (c * 6 + i) / 18 < k, [dx, dy] = dots[(c * 5 + i) % dots.length];
      if (H(c, i, 77) < 0.45) continue;
      const px = x + (c - 1) * 22 + dx * 7, py = y + dy * 7;
      ctx.globalAlpha = lit ? 1 : 0.25; ctx.fillStyle = lit ? col : '#2a2a2a';
      ctx.beginPath(); ctx.arc(px, py, 2.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /** Portal de Hoopa: aro dorado con el centro morado que gira. */
  function portal(ctx, x, y, r, k, now) {
    ctx.save();
    const s = ease(cl(k));
    ctx.globalAlpha = 0.6 * s; ctx.fillStyle = '#4a1e7a';
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.8, r * s, r * 0.9 * s, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = s; ctx.strokeStyle = '#ffd25e'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.8, r * s, r * 0.9 * s, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#c47bff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y - r * 0.8, r * 0.5 * s, now * 4, now * 4 + 4); ctx.stroke();
    ctx.restore();
  }

  /** Corte en el espacio (Palkia): rasgadura rosa con estrellas dentro. */
  function tear(ctx, x, y, an, len, a, seed) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(an);
    ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#2a0b3a';
    ctx.beginPath(); ctx.ellipse(0, 0, len / 2, 7, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = a; ctx.strokeStyle = '#ff8ad8'; ctx.lineWidth = 3;
    ctx.beginPath(); jag(ctx, -len / 2, 0, len / 2, 0, 10, 5, seed); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) ctx.fillRect(Math.round((H(seed, i, 1) - 0.5) * len * 0.9), Math.round((H(seed, i, 2) - 0.5) * 8), 2, 2);
    ctx.restore();
  }

  /** «Zzz» (Ausente, Bostezo). */
  function zzz(ctx, x, y, now) {
    ctx.save();
    ctx.font = font(700, 11); ctx.textAlign = 'center'; ctx.fillStyle = '#d8e0ff';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,8,24,.8)'; ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const k = (now * 0.6 + i / 3) % 1;
      ctx.globalAlpha = 1 - k;
      const px = x + 8 + k * 14 + i * 3, py = y - k * 26;
      const raw = (m, s) => (G.I18n && G.I18n.rawCanvas ? G.I18n.rawCanvas(ctx, m, s, px, py) : ctx[m](s, px, py));
      raw('strokeText', 'Z'); raw('fillText', 'Z');
    }
    ctx.restore();
  }

  /** Hélice de ADN (Deoxys cambiando de forma) y aura de color. */
  function helix(ctx, x, y, h, col, now) {
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const k = i / 14, yy = y - k * h, s = Math.sin(k * 9 + now * 6);
      ctx.globalAlpha = 0.7; ctx.fillStyle = col;
      ctx.fillRect(Math.round(x + s * 16) - 1, Math.round(yy) - 1, 3, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(x - s * 16) - 1, Math.round(yy) - 1, 3, 3);
    }
    ctx.restore();
  }

  /** Aro a los pies (potenciado: arcoíris de Geocontrol, forma de Deoxys...). */
  function aura(ctx, x, y, rx, col, a, now, rainbow) {
    ctx.save();
    ctx.lineWidth = 3;
    const cols = rainbow ? ['#ff6b4d', '#ffd25e', '#5fe08a', '#4fa8ff', '#b37bff'] : [col];
    cols.forEach((c, i) => {
      ctx.globalAlpha = a * (0.55 + Math.sin(now * 5 + i) * 0.2); ctx.strokeStyle = c;
      ctx.beginPath(); ctx.ellipse(x, y, rx + i * 3, (rx + i * 3) * 0.4, 0, now + i, now + i + 4.6); ctx.stroke();
    });
    ctx.restore();
  }

  /** Sombra que te persigue por el suelo (Golpe Umbrío, Excavar...). */
  function lurk(ctx, x, y, st, col, now) {
    ctx.save();
    const r = 26 + Math.sin(now * 7) * 2;
    ctx.globalAlpha = 0.55; ctx.fillStyle = st === 'dig' ? '#5a3a14' : '#120820';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.8; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, TAU); ctx.stroke();
    if (st === 'dig') {
      ctx.fillStyle = '#c8a060';
      for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(x + (H(i, (now * 10) | 0, 4) - 0.5) * r * 1.6), Math.round(y - H(i, (now * 10) | 0, 5) * 10), 3, 3);
    } else {
      ctx.fillStyle = '#ff3a3a';
      ctx.fillRect(Math.round(x - 7), Math.round(y - 3), 4, 2); ctx.fillRect(Math.round(x + 3), Math.round(y - 3), 4, 2);
    }
    ctx.restore();
  }

  // ---------------- firmas únicas (28-10-2026) ----------------

  /** Electrojaula (Regieleki): cuadrado de electricidad de lado 2S que se cierra. */
  function box(ctx, x, y, S, col, col2, a, now) {
    ctx.save();
    ctx.globalAlpha = a * 0.1; ctx.fillStyle = col; ctx.fillRect(Math.round(x - S), Math.round(y - S), Math.round(S * 2), Math.round(S * 2));
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]];
    ctx.beginPath();
    for (let i = 0; i < 4; i++) jag(ctx, x + C[i][0] * S, y + C[i][1] * S, x + C[i + 1][0] * S, y + C[i + 1][1] * S, Math.max(4, Math.round(S / 12)), 4, i * 7, now);
    ctx.globalAlpha = a * 0.4; ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.stroke();
    ctx.globalAlpha = a; ctx.strokeStyle = col2; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = col2;
    for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(x + C[i][0] * S) - 3, Math.round(y + C[i][1] * S) - 9, 6, 11);
    ctx.restore();
  }

  /** Surf (Suicune): la ola que cruza la arena; (ax, ay) hacia dónde va, hueco en `gap` (±gw). */
  function sweep(ctx, cx, cy, ax, ay, L, th, gap, gw, col, col2, a, now) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(Math.atan2(ay, ax));
    for (const [s, e] of [[-L, gap - gw], [gap + gw, L]]) {
      if (e <= s) continue;
      ctx.globalAlpha = a * 0.5; ctx.fillStyle = col; ctx.fillRect(-th / 2, s, th, e - s);
      ctx.globalAlpha = a * 0.25; ctx.fillRect(-th / 2 - 18, s, 18, e - s);
      ctx.globalAlpha = a * 0.95; ctx.fillStyle = col2; ctx.fillRect(th / 2 - 6, s, 6, e - s);
      ctx.fillStyle = '#ffffff';
      for (let yy = s + 4; yy < e - 2; yy += 13) ctx.fillRect(Math.round(th / 2 - 2 + Math.sin(now * 9 + yy * 0.21) * 3), Math.round(yy), 3, 3);
    }
    ctx.restore();
  }
  /** Antes de la ola: dónde sale, hacia dónde va y el hueco. */
  function sweepWarn(ctx, x, y, ax, ay, L, gap, gw, col, k) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(Math.atan2(ay, ax));
    ctx.globalAlpha = 0.3 + 0.5 * k; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(0, gap - gw); ctx.moveTo(0, gap + gw); ctx.lineTo(0, L); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = col;
    for (let yy = -L + 40; yy < L; yy += 110) {
      if (Math.abs(yy - gap) < gw + 12) continue;
      ctx.beginPath(); ctx.moveTo(18 + k * 14, yy); ctx.lineTo(4 + k * 14, yy - 8); ctx.lineTo(4 + k * 14, yy + 8); ctx.fill();
    }
    ctx.restore();
  }

  /** Nube de tormenta (Zapdos), en lo alto, con su sombra en el suelo. */
  function cloud(ctx, x, y, a, now, seed) {
    ctx.save();
    ctx.globalAlpha = a * 0.9; ctx.fillStyle = '#2a2d44';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x + (i - 2) * 15, y + Math.sin(i * 1.7 + now * 1.5) * 3 - (i % 2) * 8, 17 - Math.abs(i - 2) * 2, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#5a5f86';
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.arc(x + (i - 2) * 15, y - 9 - (i % 2) * 6, 7, 0, TAU); ctx.fill(); }
    const f = (now * 7) | 0;
    if (H(seed, f, 3) < 0.3) { ctx.globalAlpha = a; ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2; ctx.beginPath(); jag(ctx, x - 8, y + 10, x + 4, y + 34, 3, 5, seed + f); ctx.stroke(); }
    ctx.restore();
  }
  function cloudShadow(ctx, x, y, a) {
    ctx.save(); ctx.globalAlpha = 0.3 * a; ctx.fillStyle = '#0a0c18';
    ctx.beginPath(); ctx.ellipse(x, y, 46, 16, 0, 0, TAU); ctx.fill(); ctx.restore();
  }

  /** Corazón (Cambiaalmas): forma, marca en el suelo y lazo entre los dos sitios. */
  function heartShape(ctx, x, y, s, col, col2) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 10, s / 10);
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.bezierCurveTo(-14, -1, -8, -13, 0, -5); ctx.bezierCurveTo(8, -13, 14, -1, 0, 8);
    ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = col2; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
  function heart(ctx, x, y, col, a, now) {
    ctx.save(); ctx.globalAlpha = a * 0.85;
    heartShape(ctx, x, y - 24, 14 * (1 + Math.sin(now * 8) * 0.1), rgba(col, 0.35), col);
    ctx.globalAlpha = a * 0.4; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, 26, 10, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  function tether(ctx, x1, y1, x2, y2, col, a, now) {
    ctx.save(); ctx.globalAlpha = a * 0.7; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([5, 6]); ctx.lineDashOffset = -now * 30;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  }

  /** Estela de Rayquaza cruzando la arena. */
  function streak(ctx, x1, y1, x2, y2, col, a) {
    ctx.save(); ctx.lineCap = 'round';
    ctx.globalAlpha = 0.3 * a; ctx.strokeStyle = col; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.globalAlpha = 0.85 * a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
  }

  /** Brillo de Latias invisible (Bola Neblina): sólo se ve un destello. */
  function glint(ctx, x, y, col, now) {
    ctx.save();
    const s = 6 + Math.sin(now * 14) * 3;
    ctx.globalAlpha = 0.8; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - s * 2, y); ctx.lineTo(x + s * 2, y); ctx.moveTo(x, y - s * 2); ctx.lineTo(x, y + s * 2); ctx.stroke();
    ctx.globalAlpha = 0.25; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, s * 2.4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /** Jefe expuesto (después de Asalto Espadón, Hiperrayo, Sofoco...): estrellitas que le dan vueltas. */
  function tired(ctx, x, y, a, now) {
    ctx.save(); ctx.globalAlpha = a;
    for (let i = 0; i < 3; i++) { const an = now * 4 + i / 3 * TAU; G.VFX.draw(ctx, 'star', 'electric', x + Math.cos(an) * 18, y - 6 + Math.sin(an) * 6, { angle: an, scale: 0.55 }); }
    ctx.restore();
  }

  /** Lo que le pasa a tu Pokémon: dormido (zz), congelado (ice), confuso, quemado, con sueño. */
  function status(ctx, x, y, sk, conf, burn, yawn, now) {
    ctx.save();
    if (sk === 'zz') zzz(ctx, x, y, now);
    else if (sk === 'ice') {
      ctx.globalAlpha = 0.45; ctx.fillStyle = '#bff3ff'; ctx.fillRect(Math.round(x - 16), Math.round(y - 2), 32, 40);
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.strokeRect(Math.round(x - 16), Math.round(y - 2), 32, 40);
      ctx.beginPath(); ctx.moveTo(x - 10, y + 4); ctx.lineTo(x - 2, y + 14); ctx.stroke();
    }
    if (conf) {
      for (let i = 0; i < 3; i++) { const an = now * 5 + i / 3 * TAU; ctx.globalAlpha = 0.95; G.VFX.draw(ctx, 'star', 'electric', x + Math.cos(an) * 14, y - 8 + Math.sin(an) * 5, { angle: an, scale: 0.5 }); }
    }
    if (burn) {
      for (let i = 0; i < 3; i++) { const k = (now * 1.6 + i / 3) % 1; ctx.globalAlpha = 1 - k; ctx.fillStyle = i % 2 ? '#ff7a2e' : '#ffd25e'; ctx.fillRect(Math.round(x - 10 + i * 9), Math.round(y + 26 - k * 22), 4, 5); }
    }
    if (yawn) {
      const k = (now * 0.9) % 1; ctx.globalAlpha = 0.8 * (1 - k); ctx.strokeStyle = '#c48aff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x + 12, y - 4 - k * 12, 3 + k * 6, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------- grieta: viaje (en pantalla) ----------------

  let bgC = null, bgW = 0, bgH = 0;
  /**
   * Túnel del Mundo Distorsión: anillos que se acercan, rocas flotantes y rayas de luz.
   * t: segundos desde que empezó; T: duración; (cx, cy): dónde estaba tu Pokémon en la pantalla.
   * Devuelve dónde dibujar al Pokémon (centro) y su opacidad.
   */
  function tunnel(ctx, w, h, t, T, cx, cy) {
    const M = Math.max(w, h);
    const open = cl(t / 0.45), exit = cl((t - (T - 0.4)) / 0.4);
    if (!bgC || bgW !== w || bgH !== h) {
      bgC = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, M * 0.7);
      bgC.addColorStop(0, '#3a1466'); bgC.addColorStop(0.45, '#170732'); bgC.addColorStop(1, '#040109');
      bgW = w; bgH = h;
    }
    ctx.save();
    // Se abre un remolino donde estaba tu Pokémon y llena la pantalla.
    const R = open * open * M * 1.25;
    ctx.beginPath(); ctx.arc(cx + (w / 2 - cx) * open, cy + (h / 2 - cy) * open, Math.max(1, R), 0, TAU); ctx.clip();
    ctx.fillStyle = bgC; ctx.fillRect(0, 0, w, h);
    const ox = w / 2, oy = h / 2;
    // Anillos octogonales que se acercan (perspectiva) y giran.
    for (let i = 0; i < 11; i++) {
      const z = (i / 11 + t * 0.85) % 1, r = 6 + Math.pow(z, 2.3) * M * 0.85;
      ctx.globalAlpha = z * 0.8;
      ctx.strokeStyle = i % 3 === 0 ? '#7dffb0' : i % 3 === 1 ? '#b48aff' : '#5a3a9a';
      ctx.lineWidth = 1 + z * 4;
      ctx.beginPath();
      for (let j = 0; j <= 8; j++) { const an = j / 8 * TAU + t * (i % 2 ? 0.6 : -0.4) + i; const px = ox + Math.cos(an) * r, py = oy + Math.sin(an) * r * 0.72; if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.stroke();
    }
    // Rayas de luz que salen del centro.
    ctx.strokeStyle = '#e8dcff'; ctx.lineWidth = 2;
    for (let i = 0; i < 34; i++) {
      const an = H(i, 5, 31) * TAU, d = (H(i, 6, 31) + t * 1.5) % 1, r0 = Math.pow(d, 2) * M * 0.75, r1 = r0 + 10 + d * 60;
      ctx.globalAlpha = d * 0.9;
      ctx.beginPath(); ctx.moveTo(ox + Math.cos(an) * r0, oy + Math.sin(an) * r0 * 0.75); ctx.lineTo(ox + Math.cos(an) * r1, oy + Math.sin(an) * r1 * 0.75); ctx.stroke();
    }
    // Rocas del Mundo Distorsión que pasan flotando.
    for (let i = 0; i < 6; i++) {
      const an = H(i, 7, 31) * TAU, d = (H(i, 8, 31) + t * 0.55) % 1, r = Math.pow(d, 2) * M * 0.8, s = 3 + d * 26;
      const px = ox + Math.cos(an) * r, py = oy + Math.sin(an) * r * 0.75;
      ctx.globalAlpha = Math.min(1, d * 1.6);
      ctx.fillStyle = '#2c2638'; ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let j = 0; j < 6; j++) { const a2 = j / 6 * TAU + i + t; const rr = s * (0.7 + H(i, j, 9) * 0.5); if (j) ctx.lineTo(px + Math.cos(a2) * rr, py + Math.sin(a2) * rr * 0.8); else ctx.moveTo(px + Math.cos(a2) * rr, py + Math.sin(a2) * rr * 0.8); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    // Llegada: destello lila que se va.
    if (exit > 0) {
      ctx.save();
      ctx.globalAlpha = Math.sin(exit * Math.PI) * 0.9;
      ctx.fillStyle = '#efe4ff'; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    return { x: cx + (ox - cx) * ease(open), y: cy + (oy - cy) * ease(open), alpha: 1 - exit, open };
  }

  // ---------------- grieta: llegada del legendario (en el mundo) ----------------

  /**
   * Lo que rodea la aparición de un legendario, según su estilo. k: 0..1 (unos 2 s).
   * back: lo de debajo (antes del sprite); si no, lo de encima.
   */
  function appear(ctx, st, x, y, k, col, col2, now, seed, back) {
    ctx.save();
    switch (st) {
      case 'erupt': {
        if (back) {
          const c = cl(k / 0.55);
          ctx.strokeStyle = col2; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
          ctx.beginPath();
          for (let i = 0; i < 7; i++) { const an = H(seed, i, 3) * TAU; jag(ctx, x, y, x + Math.cos(an) * 70 * c, y + Math.sin(an) * 40 * c, 4, 5, seed + i); }
          ctx.stroke();
          ctx.globalAlpha = 0.35 * c; ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(x, y, 60 * c, 24 * c, 0, 0, TAU); ctx.fill();
        } else if (k > 0.5 && k < 0.95) {
          const e = (k - 0.5) / 0.45, hgt = 260 * Math.sin(e * Math.PI);
          ctx.globalAlpha = 0.75; ctx.fillStyle = col; ctx.fillRect(Math.round(x - 22), Math.round(y - hgt), 44, hgt);
          ctx.fillStyle = col2; ctx.fillRect(Math.round(x - 8), Math.round(y - hgt), 16, hgt);
        }
        break;
      }
      case 'whirl': {
        if (back) {
          const c = cl(k / 0.6);
          ctx.strokeStyle = col; ctx.lineWidth = 3;
          for (let i = 0; i < 4; i++) {
            ctx.globalAlpha = 0.7 * c;
            const r = (16 + i * 16) * c;
            ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, 0, now * (3 + i) + i, now * (3 + i) + i + 4); ctx.stroke();
          }
        } else if (k > 0.5 && k < 0.95) {
          const e = (k - 0.5) / 0.45, hgt = 200 * Math.sin(e * Math.PI);
          ctx.globalAlpha = 0.6; ctx.fillStyle = col; ctx.fillRect(Math.round(x - 26), Math.round(y - hgt), 52, hgt);
          ctx.fillStyle = '#ffffff';
          for (let i = 0; i < 8; i++) ctx.fillRect(Math.round(x - 26 + H(seed, i, (now * 12) | 0) * 52), Math.round(y - hgt + H(seed, i, 4) * hgt), 3, 3);
        }
        break;
      }
      case 'bolt': {
        if (back) {
          ctx.globalAlpha = 0.35; ctx.fillStyle = '#10121e';
          ctx.beginPath(); ctx.ellipse(x, y, 54, 20, 0, 0, TAU); ctx.fill();
        } else {
          for (const s of [0.18, 0.42, 0.66]) {
            const e = (k - s) / 0.12;
            if (e < 0 || e > 1) continue;
            ctx.globalAlpha = 1 - e; ctx.strokeStyle = col; ctx.lineWidth = 6;
            const bx = x + (H(seed, s * 100, 1) - 0.5) * 50;
            ctx.beginPath(); jag(ctx, bx, y - 460, x, y - 10, 10, 18, seed + s * 100); ctx.stroke();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
          }
        }
        break;
      }
      case 'dive': case 'genesis': case 'eternal': case 'meteor': case 'wish': {
        if (back) {
          const c = cl(k / 0.8);
          ctx.globalAlpha = 0.15 + c * 0.35; ctx.fillStyle = '#000000';
          ctx.beginPath(); ctx.ellipse(x, y, 14 + c * 36, 6 + c * 14, 0, 0, TAU); ctx.fill();
          if (st === 'genesis' || st === 'eternal' || st === 'wish') {
            // Columna de luz por la que baja (dorada, roja o de estrellas).
            const w = 34 + Math.sin(now * 8) * 4;
            ctx.globalAlpha = 0.35 * Math.sin(cl(k / 0.95) * Math.PI);
            ctx.fillStyle = st === 'eternal' ? '#ff3a5a' : st === 'wish' ? '#fff4a0' : '#ffe9a0';
            ctx.fillRect(Math.round(x - w / 2), Math.round(y - 520), Math.round(w), 520);
          }
        } else if (st === 'meteor' && k > 0.25 && k < 0.6) {
          const e = (k - 0.25) / 0.35;
          ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 8;
          ctx.beginPath(); ctx.moveTo(x + 200 * (1 - e) + 60, y - 500 * (1 - e) - 140); ctx.lineTo(x + 200 * (1 - e), y - 500 * (1 - e)); ctx.stroke();
        }
        break;
      }
      case 'warp': case 'prism': {
        if (back) {
          for (let i = 0; i < 3; i++) {
            const c = cl(k / 0.7 - i * 0.12), r = 110 * (1 - c);
            if (c <= 0 || c >= 1) continue;
            ctx.globalAlpha = 0.8 * c; ctx.strokeStyle = st === 'prism' ? ['#ff6b4d', '#5fe08a', '#4fa8ff'][i] : col; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(x, y - 24, r, r * 0.55, 0, 0, TAU); ctx.stroke();
          }
          if (st === 'prism' && k < 0.8) {
            ctx.lineWidth = 3;
            for (let i = 0; i < 6; i++) {
              const an = i / 6 * TAU + now; ctx.globalAlpha = 0.6; ctx.strokeStyle = ['#ff6b4d', '#ffd25e', '#5fe08a', '#4fa8ff', '#b37bff', '#ff8ad8'][i];
              ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * 220, y - 24 + Math.sin(an) * 140); ctx.lineTo(x, y - 24); ctx.stroke();
            }
          }
        }
        break;
      }
      case 'shadow': {
        if (back) {
          const c = cl(k / 0.6);
          ctx.globalAlpha = 0.75; ctx.fillStyle = '#0c0616';
          ctx.beginPath(); ctx.ellipse(x, y, 60 * c, 24 * c, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
        } else {
          ctx.fillStyle = col;
          for (let i = 0; i < 6; i++) {
            const e = (now * 0.7 + i / 6) % 1;
            ctx.globalAlpha = (1 - e) * 0.8 * cl(k * 3);
            ctx.fillRect(Math.round(x + (H(seed, i, 2) - 0.5) * 90), Math.round(y - e * 80), 3, 6);
          }
        }
        break;
      }
      case 'crystal': {
        const grow = cl(k / 0.6), brk = cl((k - 0.65) / 0.3);
        for (let i = 0; i < 7; i++) {
          const an = (i / 7) * TAU + 0.3, dx = Math.cos(an) * 26, dy = Math.sin(an) * 10;
          const hh = (40 + H(seed, i, 2) * 50) * grow, ww = 12;
          if ((dy < 0) !== back) continue;
          const fly = brk * 90;
          ctx.globalAlpha = 1 - brk;
          ctx.fillStyle = col; ctx.strokeStyle = col2; ctx.lineWidth = 1.5;
          ctx.beginPath();
          const bx = x + dx + Math.cos(an) * fly, by = y + dy + Math.sin(an) * fly * 0.5 - brk * 30;
          ctx.moveTo(bx - ww / 2, by); ctx.lineTo(bx, by - hh); ctx.lineTo(bx + ww / 2, by); ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
        break;
      }
      case 'bloom': case 'cells': {
        if (!back) {
          const n = st === 'cells' ? 22 : 14;
          for (let i = 0; i < n; i++) {
            const c = cl(k / 0.75), an = i / n * TAU + (1 - c) * 4 + (st === 'bloom' ? now : 0), d = (1 - c) * (90 + H(seed, i, 1) * 80) + 6;
            ctx.globalAlpha = c < 1 ? 0.9 : 0;
            if (st === 'cells') { ctx.fillStyle = i % 4 ? '#5fe08a' : '#e8fff0'; ctx.fillRect(Math.round(x + Math.cos(an) * d) - 2, Math.round(y - 22 + Math.sin(an) * d * 0.6) - 2, 4, 4); }
            else G.VFX.draw(ctx, i % 2 ? 'petal' : 'leaf', i % 2 ? 'fairy' : 'grass', x + Math.cos(an) * d, y - 22 + Math.sin(an) * d * 0.6, { angle: an, scale: 0.8 });
          }
        } else if (st === 'bloom' && k > 0.55) {
          const c = cl((k - 0.55) / 0.3);
          ctx.globalAlpha = 0.8 * (1 - cl((k - 0.9) / 0.1));
          ctx.fillStyle = '#ff9fd8';
          for (let i = 0; i < 6; i++) { const an = i / 6 * TAU; ctx.beginPath(); ctx.ellipse(x + Math.cos(an) * 20 * c, y + Math.sin(an) * 8 * c, 14 * c, 6 * c, an, 0, TAU); ctx.fill(); }
          ctx.fillStyle = '#fff4a0'; ctx.beginPath(); ctx.ellipse(x, y, 9 * c, 4 * c, 0, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'braille': {
        if (back) {
          ctx.globalAlpha = 0.25 * cl(k * 2); ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(x, y, 54, 20, 0, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1; braille(ctx, x, y + 26, col2, cl(k / 0.65));
        }
        break;
      }
      case 'clock': {
        if (back) clock(ctx, x, y - 30, 70, k, cl(k * 3) * (1 - cl((k - 0.85) / 0.15)), now * (1 + k * 4));
        break;
      }
      case 'space': {
        if (!back && k < 0.95) {
          const o = cl(k / 0.55), len = 150 * o;
          ctx.globalAlpha = 1 - cl((k - 0.75) / 0.2);
          ctx.fillStyle = '#1a0828';
          ctx.beginPath(); ctx.ellipse(x, y - 50, 18 * o + 2, len / 2, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#ff8ad8'; ctx.lineWidth = 3;
          ctx.beginPath(); jag(ctx, x, y - 50 - len / 2, x, y - 50 + len / 2, 9, 9 * o, seed); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
        }
        break;
      }
      case 'bubble': {
        if (!back && k < 0.78) {
          const c = cl(k / 0.5), r = 30 * ease(c);
          ctx.globalAlpha = 0.3; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - 28, r, 0, TAU); ctx.fill();
          ctx.globalAlpha = 0.9; ctx.strokeStyle = col2; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x - r * 0.45), Math.round(y - 28 - r * 0.5), 4, 4);
        }
        break;
      }
      // ---- (28-10-2026) más llegadas ----
      case 'lake': {
        // El trío del lago: el suelo se vuelve agua en calma y sale de ella.
        if (back) {
          const c = cl(k / 0.4);
          ctx.globalAlpha = 0.45 * c; ctx.fillStyle = '#3a8fd8'; ctx.beginPath(); ctx.ellipse(x, y, 66 * c, 24 * c, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#d4ecff'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) { const u = (now * 0.6 + i / 3) % 1; ctx.globalAlpha = c * (1 - u) * 0.8; ctx.beginPath(); ctx.ellipse(x, y, 12 + u * 60, (12 + u * 60) * 0.36, 0, 0, TAU); ctx.stroke(); }
        } else if (k > 0.45 && k < 0.95) {
          const e = (k - 0.45) / 0.5;
          ctx.globalAlpha = Math.sin(e * Math.PI) * 0.6; ctx.fillStyle = col2;
          for (let i = 0; i < 10; i++) ctx.fillRect(Math.round(x + (H(seed, i, 3) - 0.5) * 50), Math.round(y - H(seed, i, (now * 8) | 0) * 120 * e), 2, 5);
        }
        break;
      }
      case 'coil': {
        // Baja del cielo dando vueltas en espiral (Rayquaza).
        if (back) { const c = cl(k / 0.85); ctx.globalAlpha = 0.15 + c * 0.35; ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.ellipse(x, y, 14 + c * 36, 6 + c * 14, 0, 0, TAU); ctx.fill(); }
        else if (k > 0.25 && k < 0.85) {
          ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round';
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          for (let j = 0; j <= 20; j++) { const kk = Math.max(0.25, k - j * 0.02), s = appearSprite('coil', kk); const px = x + s.ox, py = y - s.lift - 20; if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
          ctx.stroke();
        }
        break;
      }
      case 'storm': {
        // Las fuerzas de la naturaleza: una nube negra que gira y de la que baja.
        if (back) {
          const c = cl(k / 0.5);
          ctx.globalAlpha = 0.3 * c; ctx.fillStyle = '#0a0c18'; ctx.beginPath(); ctx.ellipse(x, y, 70 * c, 24 * c, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.5 * c; ctx.beginPath(); ctx.ellipse(x, y - 4, 30 + i * 16, (30 + i * 16) * 0.35, 0, -now * (4 - i), -now * (4 - i) + 3.6); ctx.stroke(); }
        } else if (k < 0.92) {
          const a = cl(k * 4) * (1 - cl((k - 0.8) / 0.12));
          cloud(ctx, x - 22, y - 230, a, now, seed); cloud(ctx, x + 24, y - 238, a, now, seed + 5);
          if (k > 0.35 && k < 0.85) { ctx.globalAlpha = 0.35 * a; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - 30, y - 220); ctx.lineTo(x + 30, y - 220); ctx.lineTo(x + 8, y - 10); ctx.lineTo(x - 8, y - 10); ctx.fill(); }
        }
        break;
      }
      case 'quake': {
        // Sale del suelo partiéndolo (sin lava): grietas, polvo y piedras que saltan.
        if (back) {
          const c = cl(k / 0.5);
          ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 3; ctx.globalAlpha = 0.85; ctx.beginPath();
          for (let i = 0; i < 8; i++) { const an = H(seed, i, 3) * TAU; jag(ctx, x, y, x + Math.cos(an) * 80 * c, y + Math.sin(an) * 36 * c, 4, 5, seed + i); }
          ctx.stroke();
          ctx.globalAlpha = 0.35 * c; ctx.fillStyle = '#5a4630'; ctx.beginPath(); ctx.ellipse(x, y, 48 * c, 18 * c, 0, 0, TAU); ctx.fill();
        } else if (k > 0.5 && k < 1) {
          const e = (k - 0.5) / 0.5;
          for (let i = 0; i < 8; i++) {
            const an = -Math.PI / 2 + (H(seed, i, 6) - 0.5) * 2.2, v = 120 + H(seed, i, 7) * 120;
            const px = x + Math.cos(an) * v * e, py = y - 10 + Math.sin(an) * v * e + 260 * e * e;
            ctx.globalAlpha = 1 - e; G.VFX.draw(ctx, 'rock', 'rock', px, py, { angle: e * 6 + i, scale: 0.8 });
          }
          ctx.globalAlpha = 0.4 * (1 - e); ctx.fillStyle = '#c8b090'; ctx.beginPath(); ctx.ellipse(x, y - 10, 40 + e * 60, 16 + e * 20, 0, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'shell': {
        // Los Tapu: su caparazón cerrado que se abre.
        if (!back && k < 0.95) {
          const o = cl((k - 0.55) / 0.3), a = 1 - cl((k - 0.8) / 0.15), r = 30 * ease(cl(k / 0.3));
          for (const s of [-1, 1]) {
            ctx.save(); ctx.translate(x + s * o * 40, y - 34 - o * 10); ctx.rotate(s * o * 0.6);
            ctx.globalAlpha = a * 0.95; ctx.fillStyle = col; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, r, s < 0 ? Math.PI / 2 : -Math.PI / 2, s < 0 ? Math.PI * 1.5 : Math.PI / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = col2; ctx.globalAlpha = a; ctx.fillRect(Math.round(s * r * 0.5) - 2, -8, 4, 16);
            ctx.restore();
          }
        }
        break;
      }
      case 'portal': {
        // Hoopa: un aro que se abre y sale de él.
        if (back) portal(ctx, x, y - 10, 46, Math.min(cl(k / 0.35), 1 - cl((k - 0.85) / 0.15)), now);
        break;
      }
    }
    ctx.restore();
  }

  /*
   * El toque propio de cada legendario al aparecer (encima de su estilo): copos, plumas,
   * notas, espadas, engranajes, tablas de colores... Pocas partículas, deterministas.
   * [forma, paleta o color, movimiento, cuántas]
   */
  const ACC = {
    snow: ['px', '#ffffff', 'fall', 14], rain: ['line', '#9ec4ff', 'fall', 16], feathers: ['feather', 'flying', 'fall', 7], leaves: ['leaf', 'grass', 'fall', 8],
    petals: ['petal', 'fairy', 'fall', 9], embers: ['px', '#ffb040', 'rise', 14], bluefire: ['px', '#8fd8ff', 'rise', 14], magma: ['blob', 'fire', 'rise', 7],
    bubbles: ['bubble', 'water', 'rise', 8], toxic: ['bubble', 'poison', 'rise', 8], wisps: ['wisp', 'ghost', 'rise', 6], hearts: ['heart', 'fairy', 'rise', 6],
    notes: ['note', 'normal', 'rise', 6], aura: ['px', '#7ab8ff', 'rise', 16], smoke: ['puff', '#5a5460', 'rise', 7], fog: ['puff', '#eef4ff', 'drift', 6],
    stars: ['star', 'electric', 'orbit', 6], moons: ['crescent', 'fairy', 'orbit', 5], gears: ['wheel', 'steel', 'orbit', 5], swords: ['needle', 'steel', 'orbit', 6],
    sand: ['px', '#e0bf73', 'orbit', 18], hex: ['hex', '', 'orbit', 6], plates: ['plate', '', 'orbit', 17], runes: ['dot', '', 'circle', 12],
    shards: ['shard', 'rock', 'burst', 9], ice: ['shard', 'ice', 'burst', 9], sparks: ['zap', '#ffe14d', 'burst', 7], bolts: ['zap', '#ffffff', 'burst', 9],
    wind: ['swirl', '#e8f0ff', 'swirl', 4], sun: ['ray', '#ffd25e', 'rays', 10], aurora: ['ribbon', '', 'aurora', 3], rainbow: ['arc', '', 'rainbow', 5],
    dna: ['helix', '', 'dna', 2], eyes: ['eye', '#ff3a3a', 'eyes', 2], chains: ['link', '#c8c8d8', 'chains', 14], vee: ['vee', '#ff7a2e', 'vee', 2]
  };
  const TYPE_ORDER = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
  function hexPath(ctx, x, y, r) { ctx.beginPath(); for (let j = 0; j <= 6; j++) { const an = j / 6 * TAU; if (j) ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); else ctx.moveTo(x + Math.cos(an) * r, y + Math.sin(an) * r); } }
  function accent(ctx, kind, x, y, k, col, col2, now, seed) {
    const A = ACC[kind];
    if (!A) return;
    const [shape, pal, mv, n] = A, vis = cl(k * 4) * (1 - cl((k - 0.94) / 0.06));
    if (vis <= 0) return;
    ctx.save();
    const put = (px, py, a, an, i) => {
      ctx.globalAlpha = a * vis;
      switch (shape) {
        case 'px': ctx.fillStyle = pal; ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3); break;
        case 'line': ctx.strokeStyle = pal; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 4, py + 12); ctx.stroke(); break;
        case 'puff': ctx.fillStyle = pal; ctx.globalAlpha = a * vis * 0.35; ctx.beginPath(); ctx.arc(px, py, 10 + (i % 3) * 5, 0, TAU); ctx.fill(); break;
        case 'dot': ctx.fillStyle = col2; ctx.beginPath(); ctx.arc(px, py, 3, 0, TAU); ctx.fill(); break;
        case 'hex': ctx.strokeStyle = col; ctx.lineWidth = 2; hexPath(ctx, px, py, 7); ctx.stroke(); break;
        case 'plate': ctx.fillStyle = (G.U.TYPE_COLOR && G.U.TYPE_COLOR[TYPE_ORDER[(i + 1) % 18]]) || col; ctx.fillRect(Math.round(px) - 4, Math.round(py) - 5, 8, 10); ctx.strokeStyle = '#fff3c8'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(px) - 4, Math.round(py) - 5, 8, 10); break;
        case 'zap': ctx.strokeStyle = pal; ctx.lineWidth = 2; ctx.beginPath(); jag(ctx, px, py, px + Math.cos(an) * 14, py + Math.sin(an) * 14, 3, 3, seed + i, now); ctx.stroke(); break;
        default: G.VFX.draw(ctx, shape, pal, px, py, { angle: an, scale: shape === 'needle' ? 1.1 : 0.85 });
      }
    };
    switch (mv) {
      case 'fall': for (let i = 0; i < n; i++) { const u = (now * 0.55 + H(seed, i, 1)) % 1; put(x + (H(seed, i, 2) - 0.5) * 170 + Math.sin(now * 2 + i) * 8, y - 210 + u * 200, Math.sin(u * Math.PI), now + i, i); } break;
      case 'rise': for (let i = 0; i < n; i++) { const u = (now * 0.7 + H(seed, i, 1)) % 1; put(x + (H(seed, i, 2) - 0.5) * 110 + Math.sin(now * 3 + i) * 5, y - 4 - u * 130, 1 - u, 0, i); } break;
      case 'drift': for (let i = 0; i < n; i++) { const u = (now * 0.12 + H(seed, i, 1)) % 1; put(x - 110 + u * 220, y - 10 - H(seed, i, 2) * 60, Math.sin(u * Math.PI), 0, i); } break;
      case 'orbit': for (let i = 0; i < n; i++) { const an = now * 1.6 + i / n * TAU, rr = 76 - 34 * k; put(x + Math.cos(an) * rr, y - 34 + Math.sin(an) * rr * 0.45, 1, an + Math.PI / 2, i); } break;
      case 'circle': for (let i = 0; i < n; i++) { const an = i / n * TAU; put(x + Math.cos(an) * 64, y + Math.sin(an) * 24, i / n < k * 1.4 ? 1 : 0.2, 0, i); } break;
      case 'burst': {
        for (let i = 0; i < n; i++) {
          const an = i / n * TAU + H(seed, i, 4);
          if (k < 0.72) { const pre = k / 0.72, rr = 130 * (1 - pre) + 16; put(x + Math.cos(an) * rr, y - 30 + Math.sin(an) * rr * 0.5, pre, an, i); }
          else { const e = (k - 0.72) / 0.28; put(x + Math.cos(an) * (16 + e * 130), y - 30 + Math.sin(an) * (16 + e * 130) * 0.5, 1 - e, an, i); }
        }
        break;
      }
      case 'swirl': {
        ctx.strokeStyle = pal; ctx.lineWidth = 2;
        for (let i = 0; i < n; i++) { const r0 = 30 + i * 18; ctx.globalAlpha = vis * 0.6; ctx.beginPath(); ctx.ellipse(x, y - 20 - i * 26, r0, r0 * 0.32, 0, now * (3 + i) + i, now * (3 + i) + i + 3.4); ctx.stroke(); }
        break;
      }
      case 'rays': {
        ctx.strokeStyle = pal; ctx.lineWidth = 4; ctx.lineCap = 'round';
        for (let i = 0; i < n; i++) { const an = i / n * TAU + now * 0.5, l = 26 + Math.sin(now * 6 + i) * 8; ctx.globalAlpha = vis * 0.7;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * 40, y - 70 + Math.sin(an) * 40); ctx.lineTo(x + Math.cos(an) * (40 + l), y - 70 + Math.sin(an) * (40 + l)); ctx.stroke(); }
        ctx.globalAlpha = vis * 0.25; ctx.fillStyle = pal; ctx.beginPath(); ctx.arc(x, y - 70, 34, 0, TAU); ctx.fill();
        break;
      }
      case 'aurora': {
        const cs = ['#5fe08a', '#4fd8ff', '#c48aff'];
        ctx.lineWidth = 6;
        for (let i = 0; i < n; i++) { ctx.globalAlpha = vis * 0.3; ctx.strokeStyle = cs[i]; ctx.beginPath();
          for (let j = 0; j <= 16; j++) { const px = x - 130 + j * 16.25, py = y - 160 - i * 12 + Math.sin(j * 0.7 + now * 2 + i) * 10; if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
          ctx.stroke(); }
        break;
      }
      case 'rainbow': {
        const cs = ['#ff6b4d', '#ffd25e', '#5fe08a', '#4fa8ff', '#b37bff'], r = 40 + 70 * ease(cl(k / 0.8));
        ctx.lineWidth = 4;
        cs.forEach((c, i) => { ctx.globalAlpha = vis * 0.55; ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(x, y - 10, r - i * 4, Math.PI, TAU); ctx.stroke(); });
        break;
      }
      case 'dna': helix(ctx, x - 46, y, 110, col, now); helix(ctx, x + 46, y, 110, col2, now + 1); break;
      case 'eyes': {
        if (k < 0.78) { const b = H(seed, (now * 3) | 0, 9) < 0.15 ? 0.2 : 1; ctx.globalAlpha = vis * b; ctx.fillStyle = pal;
          for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * 9, y - 46, 4, 2, s * 0.3, 0, TAU); ctx.fill(); } }
        break;
      }
      case 'chains': {
        const br = cl((k - 0.7) / 0.25);
        ctx.strokeStyle = pal; ctx.lineWidth = 2;
        for (let i = 0; i < n; i++) { const an = i / n * TAU + now * 0.4, rr = 54 + br * 90; ctx.globalAlpha = vis * (1 - br);
          ctx.beginPath(); ctx.ellipse(x + Math.cos(an) * rr, y - 30 + Math.sin(an) * rr * 0.5, 5, 3, an, 0, TAU); ctx.stroke(); }
        break;
      }
      case 'vee': {
        const g = ease(cl(k / 0.7)), w = 50 * g, h = 70 * g;
        ctx.lineCap = 'round';
        for (const [c, lw] of [[pal, 9], ['#ffe9a0', 3]]) { ctx.globalAlpha = vis * 0.85; ctx.strokeStyle = c; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(x - w, y - 40 - h); ctx.lineTo(x, y - 40); ctx.lineTo(x + w, y - 40 - h); ctx.stroke(); }
        break;
      }
    }
    ctx.restore();
  }

  /**
   * Cómo se ve el legendario mientras aparece (para su sprite): alpha, cuánto
   * le falta por salir del suelo (rise, 0..1), altura en el aire (lift), destello.
   */
  function appearSprite(st, k) {
    switch (st) {
      case 'erupt': case 'whirl': case 'shadow': return { a: k > 0.55 ? 1 : 0, rise: 1 - ease(cl((k - 0.55) / 0.35)), lift: 0, flash: k > 0.85 && k < 0.95, dark: st === 'shadow' ? 1 - cl((k - 0.75) / 0.2) : 0 };
      case 'bolt': return { a: k > 0.66 ? 1 : 0, rise: 0, lift: 0, flash: k > 0.66 && k < 0.8 };
      case 'dive': case 'genesis': case 'eternal': case 'meteor': case 'wish': {
        const s = st === 'meteor' ? 0.55 : 0.4, e = cl((k - s) / (0.82 - s));
        return { a: k > s ? 1 : 0, rise: 0, lift: (1 - ease(e)) * 480, flash: k > 0.8 && k < 0.9 };
      }
      case 'warp': case 'prism': return { a: cl((k - 0.5) / 0.35), rise: 0, lift: 0, flash: k > 0.6 && k < 0.88, scan: k < 0.9 };
      case 'crystal': return { a: k > 0.65 ? 1 : cl(k * 1.5) * 0.4, rise: 0, lift: 0, flash: k > 0.62 && k < 0.75, dark: k < 0.65 ? 0.7 : 0 };
      case 'bloom': case 'cells': return { a: cl((k - 0.6) / 0.25), rise: 0, lift: 0, flash: k > 0.7 && k < 0.85 };
      case 'braille': return { a: cl((k - 0.55) / 0.3), rise: 0, lift: 0, flash: k > 0.8 && k < 0.92, dark: 1 - cl((k - 0.6) / 0.3) };
      case 'clock': case 'space': case 'bubble': return { a: cl((k - 0.6) / 0.2), rise: 0, lift: 0, flash: k > 0.68 && k < 0.8 };
      case 'lake': return { a: k > 0.5 ? 1 : 0, rise: 1 - ease(cl((k - 0.5) / 0.35)), lift: 0, flash: k > 0.84 && k < 0.92 };
      case 'quake': return { a: k > 0.5 ? 1 : 0, rise: 1 - ease(cl((k - 0.5) / 0.2)), lift: 0, flash: k > 0.7 && k < 0.8 };
      case 'coil': { const e = cl((k - 0.25) / 0.6); return { a: k > 0.25 ? 1 : 0, rise: 0, lift: (1 - ease(e)) * 420, ox: Math.cos(e * TAU * 1.5) * 90 * (1 - e), flash: k > 0.84 && k < 0.92 }; }
      case 'storm': { const e = cl((k - 0.4) / 0.42); return { a: k > 0.4 ? 1 : 0, rise: 0, lift: (1 - ease(e)) * 220, flash: k > 0.82 && k < 0.9 }; }
      case 'shell': return { a: k > 0.55 ? 1 : 0, rise: 0, lift: 0, flash: k > 0.6 && k < 0.72 };
      case 'portal': return { a: cl((k - 0.4) / 0.25), rise: 0, lift: 10 * (1 - cl((k - 0.4) / 0.4)), flash: k > 0.65 && k < 0.75 };
    }
    return { a: cl((k - 0.5) / 0.4), rise: 0, lift: 0, flash: false };
  }

  return { pool, band, annulus, wave, cage, sky, dark, wind, orb, label, bubble, charge, clock, braille, portal, tear, zzz, helix, aura, lurk,
           box, sweep, sweepWarn, cloud, cloudShadow, heart, heartShape, tether, streak, glint, tired, status,
           tunnel, appear, appearSprite, accent, ACC, rgba };
})();
