/* ============ pathing.js — los enemigos rodean rocas y lagos ============
 * Un "campo de distancias" por jugador: cada pocas décimas se recorren las
 * casillas de alrededor del jugador apuntando lo que cuesta llegar desde cada
 * una hasta él. Un enemigo sólo tiene que ir hacia la casilla vecina más
 * barata, y así encuentra el camino alrededor de paredes, rocas, árboles y
 * charcos peligrosos.
 *
 * (2.0, bloque 4) Campos por clase y por tamaño, con Dijkstra (cola por cubos:
 * costes enteros pequeños, 5 en recto y 7 en diagonal, × el terreno):
 *
 *   clase  quién                                suelo  agua/pantano  lava, veneno, descarga
 *   walk   todos por defecto                    ×1     bloquea (13-11) bloquea
 *   wade   Volador, Fantasma y jefes que andan  ×1     ×2            bloquea  (Enemy.dry === false)
 *   swim   los que nadan (e.mv 'swim')          ×1     ×0,6          bloquea
 *   lava   inmunes al líquido del bioma, y      ×1     ×1            como el suelo
 *          los legendarios (e.mv 'lava')
 *
 *   Variante «big» (radio > 0,47·TS, o e.aiBig): sin las casillas que son un
 *   estrechamiento (bloqueadas a los dos lados: un pasillo de una casilla, o entre
 *   esquinas a menos de una casilla); «huge» (radio > 0,7·TS) tampoco entre dos
 *   esquinas en diagonal. Si así no hay camino, el campo normal.
 *   (Con «ella y sus 4 vecinas libres», como pedía §9.2, los grandes no cabían por
 *   los pasillos de 2 casillas, por donde sí pasan: medido en tests/ai.test.cjs.)
 *   8 vecinos, sin cortar esquinas (no se cuela entre dos rocas en diagonal).
 *   Los que flotan (G.Sprites.hovers) no lo necesitan: van en línea recta.
 *
 * Sólo se construyen las clases que alguien ha pedido hace poco (el campo walk
 * normal, siempre), y como mucho uno o dos por fotograma, por turnos: antes se
 * hacían todos en el mismo y daban un tirón de 35-60 ms en móvil con 4 jugadores.
 *
 * Coste: R=19 casillas de radio → 39×39 = 1.521 casillas por campo, cada 0,35 s.
 * Los enemigos fuera del campo (muy lejos) van en línea recta.
 */
G.Path = (() => {
  const R = 19, N = R * 2 + 1, NN = N * N, EVERY = 0.35;          // (2.0, casillas de 48: 19 ≈ las 28 de 32 de antes)
  const UNSEEN = 0xffff, KEEP = 2;                                // KEEP: s que se sigue construyendo una clase sin pedirla
  const CLS = ['walk', 'swim', 'lava', 'wade'], NK = CLS.length * 3;      // clave = clase·3 + tamaño (0 normal, 1 big, 2 huge)
  // Coste de ENTRAR en una casilla según lo que es (World.cellAt: 0 suelo, 1 bloquea, 2 agua, 3 lava...), en recto.
  // (13-11-2026) walk ya no entra en el agua ni en el pantano (el dueño: «los Pokémon siguen atravesando el agua»); el campo de
  //  antes (agua ×2) es ahora wade, para los que sí pueden: Volador, Fantasma y jefes que andan (Enemy.dry).
  const COST = [[5, 0, 0, 0], [5, 0, 3, 0], [5, 0, 5, 5], [5, 0, 10, 0]];
  const DIAG = c => (c * 1.4 + 0.5) | 0;
  const CENTER = 6;                    // (11-11-2026) a menos de esto del centro de su casilla, «en el centro» (dirFor)
  const CHEAP = 5, SHOT = -1;          // (modos de clearLine: si no, el coste máximo de las casillas que cruza)
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const players = new Map();         // jugador -> { f: [campo por clave], need: [último segundo en que se pidió] }
  const BQ = NN * 4, bq = Array.from({ length: 16 }, () => new Int32Array(BQ)), bn = new Int32Array(16);   // cubos de Dijkstra
  const DX = new Int8Array(D8.map(d => d[0])), DY = new Int8Array(D8.map(d => d[1])), OFF = new Int32Array(D8.map(d => d[1] * N + d[0]));
  const DW = new Uint8Array(32).map((_, c) => DIAG(c));
  let clock = 0;
  const stats = { builds: 0, ms: 0, maxMs: 0 };

  const sizeOf = e => { const r = e.wr || e.r; return r > 0.7 * G.World.TS ? 2 : e.aiBig || r > 0.47 * G.World.TS ? 1 : 0; };   // (con su radio contra el terreno)
  /** Clase de campo de un enemigo (0 walk, 1 swim, 2 lava, 3 wade). */
  function clsOf(e) {
    if (e.mv === 'swim') return 1;
    if (e.mv === 'lava') return 2;
    const b = G.World.biome;
    if (e._pcB !== b) {
      e._pcB = b;
      // Inmune al líquido que hace daño en este bioma (Fuego en la lava...): por él como por el suelo.
      e._pc = G.World.liquidEffect([]).dmg && !G.World.liquidEffect(e.types).dmg ? 2 : 0;
    }
    return e._pc || (e.dry === false ? 3 : 0);
  }

  function stateOf(pl) {
    let s = players.get(pl);
    if (!s) { s = { f: new Array(NK).fill(null), need: new Array(NK).fill(-99) }; s.need[0] = Infinity; players.set(pl, s); }
    return s;
  }

  /** ¿Se puede ir en diagonal a n rozando a y b? (libres y no más caras que n o que el suelo) */
  function diagOk(C, ok, code, a, b, n) {
    if (!ok[a] || !ok[b]) return false;
    const m = Math.max(C[code[n]], 5);
    return C[code[a]] <= m && C[code[b]] <= m;
  }

  function build(pl, key) {
    const t0 = performance.now();
    const TS = G.World.TS, cls = (key / 3) | 0, size = key % 3, C = COST[cls];
    const px = Math.floor(pl.x / TS), py = Math.floor(pl.y / TS);
    const ox = px - R, oy = py - R;
    const s = stateOf(pl);
    let f = s.f[key];
    if (!f) f = s.f[key] = { key, dist: new Uint16Array(NN), code: new Uint8Array(NN), ok: new Uint8Array(NN) };
    f.ox = ox; f.oy = oy; f.t = clock;
    const { dist, code, ok } = f;
    G.World.fillCells(ox, oy, N, code);
    for (let n = 0; n < NN; n++) ok[n] = C[code[n]] ? 1 : 0;
    if (size) {
      // Holgura: fuera los estrechamientos (lo de fuera del campo cuenta como libre).
      const o = s.tmp || (s.tmp = new Uint8Array(NN));
      o.set(ok);
      const b = (i, j) => (i < 0 || j < 0 || i >= N || j >= N ? 0 : o[j * N + i] ? 0 : 1);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const n = j * N + i;
        if (!o[n]) continue;
        const L = b(i - 1, j), Rr = b(i + 1, j), U = b(i, j - 1), D = b(i, j + 1);
        const UL = b(i - 1, j - 1), UR = b(i + 1, j - 1), DL = b(i - 1, j + 1), DR = b(i + 1, j + 1);
        if ((L && (Rr | UR | DR)) || (Rr && (UL | DL)) || (U && (D | DL | DR)) || (D && (UL | UR)) ||
            (size > 1 && ((UL && DR) || (UR && DL)))) ok[n] = 0;
      }
    }
    dist.fill(UNSEEN);
    const start = R * N + R;
    ok[start] = 1;                   // donde está el jugador siempre cuenta
    dist[start] = 0;
    // Coste de entrar en cada casilla (en recto) y si se puede rozar en diagonal yendo a una de coste m (diagOk).
    const cw = s.cw || (s.cw = new Uint8Array(NN));
    for (let n = 0; n < NN; n++) cw[n] = ok[n] ? C[code[n]] : 0;
    // Dijkstra con cubos (Dial): el coste de un paso es como mucho 14, así que bastan 16 cubos en círculo.
    for (let b = 0; b < 16; b++) bn[b] = 0;
    bq[0][bn[0]++] = start;
    let pending = 1, cur = 0;
    while (pending > 0) {
      const bi = cur & 15;
      if (!bn[bi]) { cur++; continue; }
      const c = bq[bi][--bn[bi]]; pending--;
      if (dist[c] !== cur) continue;          // (entrada vieja: ya se llegó más barato)
      const cx = c % N, cy = (c - cx) / N;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const n = c + OFF[k], wn = cw[n];
        if (!wn) continue;
        let w = wn;
        if (k >= 4) {
          // Diagonal: las dos de al lado libres y no más caras (no corta la esquina de un lago).
          const a = cw[cy * N + nx], b = cw[ny * N + cx], m = wn > 5 ? wn : 5;
          if (!a || !b || a > m || b > m) continue;
          w = DW[wn];
        }
        const d = cur + w;
        if (d >= dist[n]) continue;
        dist[n] = d;
        const bj = d & 15;
        if (bn[bj] < BQ) { bq[bj][bn[bj]++] = n; pending++; }
      }
    }
    const ms = performance.now() - t0;
    stats.builds++; stats.ms += ms; stats.maxMs = Math.max(stats.maxMs, ms);
  }

  /**
   * Recalcula los campos de los jugadores vivos (lo llama el anfitrión / solitario), repartidos entre fotogramas:
   * el más atrasado primero, y otro más sólo si el primero ha sido barato (como mucho 3 y ~1 ms por fotograma).
   */
  function update(dt, list) {
    clock += dt;
    for (const p of [...players.keys()]) if (!list.includes(p)) players.delete(p);
    const t0 = performance.now();
    for (let n = 0; n < 3; n++) {
      let bp = null, bk = -1, bage = -1;
      for (const p of list) {
        if (p.dead) continue;
        const s = stateOf(p);
        for (let k = 0; k < NK; k++) {
          if (clock - s.need[k] > KEEP) { if (k) s.f[k] = null; continue; }
          const f = s.f[k], age = f ? clock - f.t : 1e9;
          if (age >= EVERY && age > bage) { bage = age; bp = p; bk = k; }
        }
      }
      if (!bp) break;
      build(bp, bk);
      if (performance.now() - t0 > 0.8) break;
    }
  }

  /** Campo de `e` hacia `pl`, y su índice de casilla: { f, i } o null (sin campo o fuera de él). */
  function locate(e, pl, key) {
    const s = players.get(pl);
    if (!s) return null;
    s.need[key] = Math.max(s.need[key], clock);
    let f = s.f[key];
    if (!f && key > 2) f = s.f[key % 3];       // (su clase aún no está: la de andar de su tamaño)
    if (!f) f = s.f[key - key % 3] || s.f[0];
    if (!f) f = s.f[0];
    if (!f) return null;
    const TS = G.World.TS;
    const tx = Math.floor(e.x / TS) - f.ox, ty = Math.floor(e.y / TS) - f.oy;
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return null;
    return { f, i: ty * N + tx, tx, ty };
  }
  function fieldOf(e, pl) {
    const size = sizeOf(e), key = clsOf(e) * 3 + size;
    let L = locate(e, pl, key);
    // Grande sin camino con holgura (o metido donde no cabe): con el campo de un tamaño menos de su clase.
    for (let k = key - 1; L && k >= key - size && L.f.dist[L.i] === UNSEEN; k--) L = locate(e, pl, k) || L;
    return L;
  }

  /**
   * Dirección (normalizada) para que `e` llegue hasta `pl` rodeando obstáculos, o null si no hace falta
   * (cerca o con vista despejada) o no se puede (fuera del campo o sin camino: e.pathNo = true).
   * Deja en e.pathV lo que le falta (para el desatasco de enemy-ai.js). Con e.aiStrict, sin atajo y por el
   * centro de las casillas.
   */
  function dirFor(e, pl) {
    e.pathNo = false; e.pathV = null;
    const L = fieldOf(e, pl);
    if (!L) return null;
    const { f, tx, ty } = L, here = f.dist[L.i];
    if (here === UNSEEN) { e.pathNo = true; return null; }
    e.pathV = here;
    if (here <= 7) return null;                  // pegado a ti: directo
    const TS = G.World.TS;
    if (!e.aiStrict) {
      // Con vista despejada hasta el jugador, en línea recta (más natural). Cada 0,2 s por enemigo (es lo más caro).
      if (e.losAt == null || clock - e.losAt > 0.2 || clock < e.losAt) { e.losAt = clock; e.los = clearLine(f, e.x, e.y, pl.x, pl.y, (e.wr || e.r) * 0.9, CHEAP); }
      if (e.los) return null;
    }
    // Siguiente casilla del camino (la vecina más barata, sin cortar esquinas).
    let bx = tx, by = ty, best = here;
    for (let k = 0; k < 8; k++) {
      const x = tx + D8[k][0], y = ty + D8[k][1];
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const v = f.dist[y * N + x];
      if (v >= best) continue;
      if (k >= 4 && !diagOk(COST[(f.key / 3) | 0], f.ok, f.code, ty * N + x, y * N + tx, y * N + x)) continue;
      best = v; bx = x; by = y;
    }
    if (bx === tx && by === ty) { e.pathGo = null; return null; }
    const atx = f.ox + tx, aty = f.oy + ty;
    // (11-11-2026, atascos) Ya decidido ir del centro de su casilla a la vecina: sigue hasta entrar en ella (como mucho
    //  1 s). Antes, un enemigo grande (la prueba de la línea va con el ancho de su cuerpo y desde el centro también
    //  fallaba) cambiaba cada fotograma entre «a la vecina» y «al centro de la mía» y se quedaba temblando en el sitio.
    const go = e.pathGo;
    if (go && go.k === f.key && clock - go.t < 1 && clock >= go.t && Math.abs(go.tx - atx) <= 1 && Math.abs(go.ty - aty) <= 1 && (go.tx !== atx || go.ty !== aty)) {
      const gi = (go.ty - f.oy) * N + (go.tx - f.ox);
      if (go.tx - f.ox >= 0 && go.ty - f.oy >= 0 && go.tx - f.ox < N && go.ty - f.oy < N && f.dist[gi] < here) return G.U.norm((go.tx + 0.5) * TS - e.x, (go.ty + 0.5) * TS - e.y);
    }
    e.pathGo = null;
    let gx = (f.ox + bx + 0.5) * TS, gy = (f.oy + by + 0.5) * TS;
    // Si va descentrado y el atajo hasta esa casilla roza un obstáculo, primero al centro de la suya
    // (así no se engancha en las esquinas). Desatascándose, siempre por los centros.
    const cx = (atx + 0.5) * TS, cy = (aty + 0.5) * TS;
    // (Por casillas que no cuesten más que la suya o la siguiente: no se mete en un lago por la esquina.)
    const C = COST[(f.key / 3) | 0], lim = Math.max(5, C[f.code[L.i]], C[f.code[by * N + bx]]);
    const off = Math.max(Math.abs(e.x - cx), Math.abs(e.y - cy)), dc = Math.hypot(e.x - cx, e.y - cy);
    // «En el centro»: a menos de CENTER; desatascándose, a menos de 0,3 casillas; o si yendo al centro no se acerca
    // (un cuerpo grande pegado a una pared no llega nunca al centro de su casilla: antes iba y venía sin parar).
    const pc = e.pathC, same = pc && pc.tx === atx && pc.ty === aty && clock - pc.t < 0.2 && clock >= pc.t;
    const stall = same && dc > pc.d - 0.3 ? pc.n + 1 : 0;
    const centred = off <= CENTER || (e.aiStrict > 0 && off <= TS * 0.3) || stall >= 4;
    if (!centred && !clearLine(f, e.x, e.y, gx, gy, (e.wr || e.r) * 0.9, lim)) {
      gx = cx; gy = cy;
      e.pathC = { tx: atx, ty: aty, d: same ? Math.min(dc, pc.d) : dc, n: stall, t: clock };
    } else {
      e.pathC = null;
      // Desde el centro, de casilla a casilla vecina del campo siempre se cabe: se compromete hasta llegar.
      if (centred) e.pathGo = { k: f.key, tx: f.ox + bx, ty: f.oy + by, t: clock };
    }
    return G.U.norm(gx - e.x, gy - e.y);
  }

  /** Para alejarse sin chocar (los de distancia): hacia la vecina más cara (lejos de ti por el camino), o null. */
  function away(e, pl) {
    const L = fieldOf(e, pl);
    if (!L) return null;
    const { f, tx, ty } = L, here = f.dist[L.i];
    if (here === UNSEEN) return null;
    let bx = tx, by = ty, best = here;
    for (let k = 0; k < 8; k++) {
      const x = tx + D8[k][0], y = ty + D8[k][1];
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const v = f.dist[y * N + x];
      if (v === UNSEEN || v <= best) continue;
      if (k >= 4 && (!f.ok[ty * N + x] || !f.ok[y * N + tx])) continue;
      best = v; bx = x; by = y;
    }
    if (bx === tx && by === ty) return null;
    const TS = G.World.TS;
    return G.U.norm((f.ox + bx + 0.5) * TS - e.x, (f.oy + by + 0.5) * TS - e.y);
  }

  /** Casilla libre `steps` pasos más adelante por el camino de `e` (para un saltito): [x, y] o null. */
  function ahead(e, pl, steps) {
    const L = fieldOf(e, pl);
    if (!L || L.f.dist[L.i] === UNSEEN) return null;
    const f = L.f;
    let x = L.tx, y = L.ty;
    for (let s = 0; s < steps; s++) {
      let bx = x, by = y, best = f.dist[y * N + x];
      for (let k = 0; k < 8; k++) {
        const nx = x + D8[k][0], ny = y + D8[k][1];
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const v = f.dist[ny * N + nx];
        if (v < best) { best = v; bx = nx; by = ny; }
      }
      if (bx === x && by === y) break;
      x = bx; y = by;
    }
    if (x === L.tx && y === L.ty) return null;
    const TS = G.World.TS;
    return [(f.ox + x + 0.5) * TS, (f.oy + y + 0.5) * TS];
  }

  /** Lo que le falta a `e` por el camino, en unidades de mundo (∞ sin camino), o null fuera del campo. */
  function pathLen(e, pl) {
    const L = fieldOf(e, pl);
    if (!L) return null;
    const v = L.f.dist[L.i];
    return v === UNSEEN ? Infinity : v / 5 * G.World.TS;
  }

  /** ¿Hay camino andando desde (x, y) hasta pl? true / false, o null si no se sabe (fuera del campo, sin campo). */
  function reachable(x, y, pl) {
    const s = players.get(pl), f = s && s.f[0];
    if (!f) return null;
    const TS = G.World.TS;
    const tx = Math.floor(x / TS) - f.ox, ty = Math.floor(y / TS) - f.oy;
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return null;
    return f.dist[ty * N + tx] !== UNSEEN;
  }

  /**
   * ¿Llega un disparo de (ax, ay) a (bx, by) sin chocar con paredes ni objetos sólidos? (los de distancia no
   * disparan sin línea de vista). null si no hay campo o se sale de él (entonces se dispara como antes).
   */
  function shotLine(ax, ay, bx, by, pl) {
    const s = players.get(pl), f = s && s.f[0];
    if (!f) return null;
    return clearLine(f, ax, ay, bx, by, 4, SHOT, true);
  }

  /** ¿Cabe `e` en línea recta hasta (x, y) por su campo? (embestidas, flanqueos) null fuera del campo. */
  function clearTo(e, x, y, pl) {
    const L = fieldOf(e, pl);
    if (!L) return null;
    return clearLine(L.f, e.x, e.y, x, y, (e.wr || e.r) * 0.9, CHEAP, true);
  }

  /**
   * ¿Cabe un cuerpo de ancho w en línea recta de (ax,ay) a (bx,by)?
   * mode: el coste máximo de las casillas que cruza (por las de su campo); CHEAP, nada que cueste más que el suelo
   * (un lago se rodea); SHOT, sólo paredes y objetos sólidos (los disparos pasan por encima del agua y de la lava).
   * out: lo que vale salirse del campo (false: no se sabe → no hay atajo; true para clearTo/shotLine).
   */
  function clearLine(f, ax, ay, bx, by, w, mode, out = false) {
    const TS = G.World.TS;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1) return true;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const C = COST[(f.key / 3) | 0];
    const step = Math.min(TS * 0.4, Math.max(8, w));
    for (let d = 0; d <= len + 0.01; d += step) {
      const cx = ax + ux * Math.min(d, len), cy = ay + uy * Math.min(d, len);
      for (let si = -1; si <= 1; si++) {
        const sw = si * w;
        const x = Math.floor((cx - uy * sw) / TS) - f.ox, y = Math.floor((cy + ux * sw) / TS) - f.oy;
        if (x < 0 || y < 0 || x >= N || y >= N) return out;
        const n = y * N + x, c = f.code[n];
        if (mode === SHOT ? c === 1 : (!f.ok[n] && n !== R * N + R) || C[c] > mode) return false;
      }
    }
    return true;
  }

  function clear() { players.clear(); clock = 0; }

  return { update, dirFor, away, ahead, pathLen, reachable, shotLine, clearTo, clear, stats, UNSEEN, R,
           get clock() { return clock; } };
})();
