/* ============ props3d.js — los modelos 3D de los objetos de la partida (para ultra3d.js) ============
 * Pedido del dueño (13-11-2026): «haz que las rocas, las setas, los cofres, grietas y más elementos de la partida también
 * sean en 3D nítido». Aquí están las piezas (geometrías y materiales) de lo que sobresale del mapa: árboles (y, según el
 * bioma, cristales, árboles secos o agujas de basalto), torres de poder, manantiales, setas explosivas, la
 * flora suelta (setas que brillan y cristales) y el portal de la grieta. ultra3d.js los dibuja con instancing
 * (una malla por modelo y su contorno: 2 llamadas de dibujo por modelo a la vista, con cualquier número de objetos).
 * Es sólo dibujo: ni choques ni reparto cambian (world.js manda).
 *
 * Estilo (como la aldea, village3d.js): formas lisas, texturas suaves pintadas una vez (corteza, hojas, piedra del bioma;
 * G.Village3D.paint), luz de cielo y suelo, sombras y un contorno del tono oscuro del mapa («casco invertido»).
 *
 * Ejes del juego: x al este, y al sur, z arriba. Las piezas se hacen con las de three.js (Y arriba) y se pasan (como las
 * rocas de ultra3d.js). Con la cámara del juego (lo alto sube en la pantalla igual que lo del sur baja), lo redondo se ve
 * alargado: los modelos van aplastados de fondo (DEPTH), como las rocas.
 *
 * Atributos de cada vértice: color (tono de la pieza), flex (cuánto se mece con el viento: 0 en el pie, 1 en lo alto) y
 * glow (cuánto brilla solo, del color de la pieza). Un solo material por bioma (atlas de texturas) para todos.
 */
G.Props3D = (() => {
  const DEPTH = 0.62;                // fondo (y del juego) respecto al ancho
  const ORB = ['#ff5f6d', '#5fd4ff', '#ff8ad8', '#ffd23f'];
  let T = null, mob = false, kit = null, stexF = null, uni = null;
  const kits = new Map();            // bi -> { mat, hullMat, fadeMat, fadeHull, geos: Map(key -> { g, hg, w, h, cast }) }

  function H(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const arr = c => Array.isArray(c) ? c : [c];
  const hexRgb = h => { const n = parseInt(String(h).slice(1, 7), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const lin = c => c.map(v => Math.pow(v, 2.2));            // (los colores de vértice van en lineal, como la luz)
  const shadeH = (h, k) => kit ? kit.shade(h, k) : h;

  /** Prepara el módulo (ultra3d.js, al arrancar three.js). stex: textura suave; u: uniformes compartidos (uTime). */
  function init(three, isMob, stex, u) { T = three; mob = isMob; stexF = stex; uni = u; kit = G.Village3D && G.Village3D.paint; }

  // ---------------- texturas (atlas por bioma) ----------------
  /*
   * 256×256 (móvil 128): corteza | hojas / piedra | sombrero de seta (arriba) y blanco (abajo, para lo que va de un color).
   */
  const REG = { bark: [0, 0, 0.5], leaf: [0.5, 0, 0.5], stone: [0, 0.5, 0.5], cap: [0.5, 0.5, 0.25], white: [0.5, 0.75, 0.25] };
  function atlas(B, pal) {
    const S = mob ? 128 : 256, h = S / 2, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    if (!g) return null;
    const trunk = arr(B.trunk), leaf = arr(B.leaf), rock = pal && pal.rock ? pal.rock : arr(B.rock || '#8a8a8a');
    const r4 = a => a.length >= 4 ? a.slice(0, 4) : kit ? kit.ramp(a[a.length > 1 ? 1 : 0]) : [a[0], a[0], a[0], a[0]];
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
    if (kit) {
      const b = kit.bark(h, r4(trunk.length > 1 ? [shadeH(trunk[0], -0.2), trunk[0], trunk[1], shadeH(trunk[1], 0.2)] : trunk), 9);
      const f = kit.foliage(h, r4(leaf.length > 1 ? leaf : kit.ramp(leaf[0])), 23);
      const st = kit.soft(h, h, (x, y) => {
        const n = kit.pn(x, y, h / 4, 41, h), d = kit.pn(x, y, h / 12, 43, h);
        return kit.tone(r4(rock), 0.2 + n * 0.7 + (d - 0.5) * 0.45);
      });
      const cap = kit.soft(h, h / 2, (x, y) => {
        // Sombrero rojo de seta con lunares blancos suaves (las setas explosivas).
        const t = y / (h / 2);
        let c = kit.tone(['#5a1410', '#a8281c', '#e04a2e', '#ff8a5e'], 0.9 - t * 0.7 + (kit.pn(x, y, 10, 71, h) - 0.5) * 0.2);
        const cw = h / 6, cx = Math.floor(x / cw), cy = Math.floor(y / (h / 8)), hh = H(cx, cy, 72);
        if (hh > 0.4) {
          const px = cx * cw + cw * (0.3 + H(cx, cy, 73) * 0.4), py = cy * h / 8 + h / 16, rr = cw * 0.22;
          c = kit.mixc(c, [255, 248, 236], (1 - kit.sstep(rr - 0.8, rr + 0.8, Math.hypot(x - px, y - py))) * 0.95);
        }
        return c;
      });
      g.drawImage(b, 0, 0); g.drawImage(f, h, 0); g.drawImage(st, 0, h); g.drawImage(cap, h, h);
      for (const c of [b, f, st, cap]) G.U.freeCanvas(c);
    } else {
      g.fillStyle = trunk[0]; g.fillRect(0, 0, h, h);
      g.fillStyle = leaf[Math.min(1, leaf.length - 1)]; g.fillRect(h, 0, h, h);
      g.fillStyle = rock[1] || rock[0]; g.fillRect(0, h, h, h);
      g.fillStyle = '#c8321e'; g.fillRect(h, h, h, h / 2);
    }
    g.fillStyle = '#ffffff'; g.fillRect(h, h * 1.5, h, h / 2);
    return stexF(cv);
  }

  /*
   * El material de todo (Lambert con el atlas y el tono de cada vértice) con dos añadidos en el shader:
   *  - viento: lo alto se mece (fase según el sitio de cada objeto: instanceMatrix), tanto como diga flex;
   *  - brillo propio: glow × el color de la pieza (cristales, setas que brillan, orbes, agua del manantial).
   * El contorno (MeshBasic, caras de dentro) se mece igual.
   */
  function shaderOf(m, glow) {
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = uni.time;
      sh.vertexShader = 'uniform float uTime;\nattribute float flex;\nattribute float glow;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vGlow = glow;',
        '#ifdef USE_INSTANCING',
        '  float ph = instanceMatrix[3].x * 0.013 + instanceMatrix[3].y * 0.021;',
        '  transformed.x += (sin(uTime * 1.1 + ph) * 0.9 + sin(uTime * 2.7 + ph * 3.0) * 0.25) * flex * 2.6;',
        '  transformed.y += cos(uTime * 0.8 + ph * 1.7) * flex * 0.9;',
        '#endif'].join('\n'));
      if (glow) sh.fragmentShader = 'varying float vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vGlow * 1.6;');
      else sh.fragmentShader = 'varying float vGlow;\n' + sh.fragmentShader;
    };
    m.customProgramCacheKey = () => 'p3d' + (glow ? 1 : 0);
    return m;
  }

  function kitOf(bi) {
    let k = kits.get(bi);
    if (k) return k;
    const B = G.Tiles.BIOMES[bi], pal = G.Tileset.pal(bi);
    if (!B) return null;
    const map = atlas(B, pal);
    const mat = shaderOf(new T.MeshLambertMaterial({ map, vertexColors: true, side: T.FrontSide, shadowSide: T.DoubleSide }), true);
    const edge = pal && pal.edge ? pal.edge : '#141010';
    const hullMat = shaderOf(new T.MeshBasicMaterial({ color: edge, side: T.BackSide }), false);
    // (Si tu Pokémon queda detrás de un árbol, ese árbol se transparenta un poco: como el Ultra 2D.)
    const fadeMat = shaderOf(mat.clone(), true); fadeMat.transparent = true; fadeMat.opacity = 0.5; fadeMat.depthWrite = false;
    const fadeHull = shaderOf(hullMat.clone(), false); fadeHull.transparent = true; fadeHull.opacity = 0.35; fadeHull.depthWrite = false;
    k = { bi, B, pal, mat, hullMat, fadeMat, fadeHull, geos: new Map(), edge };
    kits.set(bi, k);
    return k;
  }

  // ---------------- piezas ----------------
  const Mx = () => new T.Matrix4();
  /** Coloca una pieza (three.js, Y arriba): at = { x, y, z, sx, sy, sz, rx, ry, rz }. reg: trozo del atlas; col: tono. */
  function part(g, at, reg, col, o = {}) {
    const q = g.index ? g.toNonIndexed() : g;
    if (q !== g) g.dispose();
    const e = new T.Euler(at.rx || 0, at.ry || 0, at.rz || 0);
    const m = Mx().compose(new T.Vector3(at.x || 0, at.y || 0, at.z || 0), new T.Quaternion().setFromEuler(e),
      new T.Vector3(at.sx || at.s || 1, at.sy || at.s || 1, at.sz || at.s || 1));
    q.applyMatrix4(m);
    const n = q.attributes.position.count, uv = q.attributes.uv, [u0, v0, vh] = REG[reg || 'white'], mg = 4 / 256;
    // (uk / vk: la textura repetida menos o más en la pieza; sin ellos, de 0 a 1 justo, sin dar la vuelta en el borde.)
    const fu = (x, k) => k ? Math.min(0.999, x * k) : x;
    if (uv) for (let i = 0; i < n; i++) uv.setXY(i, u0 + mg + fu(uv.getX(i), o.uk) * (0.5 - 2 * mg), 1 - (v0 + mg + (1 - fu(uv.getY(i), o.vk)) * (vh - 2 * mg)));
    else { const a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = 0.75; a[i * 2 + 1] = 0.1; } q.setAttribute('uv', new T.BufferAttribute(a, 2)); }
    const c = lin(hexRgb(col || '#ffffff')), cols = new Float32Array(n * 3), fl = new Float32Array(n), gl = new Float32Array(n);
    const p = q.attributes.position, nr = q.attributes.normal;
    // (up: las normales, inclinadas hacia arriba. La hierba y las hojas finas se ven con la luz del cielo y no negras.)
    if (o.up) for (let i = 0; i < n; i++) {
      const x = nr.getX(i) * (1 - o.up), y = nr.getY(i) * (1 - o.up) + o.up, z = nr.getZ(i) * (1 - o.up), l = Math.hypot(x, y, z) || 1;
      nr.setXYZ(i, x / l, y / l, z / l);
    }
    for (let i = 0; i < n; i++) {
      // Tono: algo más oscuro al pie de cada pieza (oclusión suave), salvo lo que brilla.
      const y = p.getY(i), k = o.ao === false ? 1 : 0.72 + 0.28 * Math.min(1, Math.max(0, y / (o.aoH || 40)));
      cols[i * 3] = c[0] * k; cols[i * 3 + 1] = c[1] * k; cols[i * 3 + 2] = c[2] * k;
      fl[i] = o.flex ? o.flex * Math.max(0, (y - (o.fy || 6)) / (o.fh || 50)) : 0;
      gl[i] = o.glow || 0;
    }
    q.setAttribute('color', new T.BufferAttribute(cols, 3));
    q.setAttribute('flex', new T.BufferAttribute(fl, 1));
    q.setAttribute('glow', new T.BufferAttribute(gl, 1));
    return q;
  }
  /** Junta piezas (no indexadas, con los mismos atributos) en una sola geometría, en los ejes del juego y aplastada de fondo. */
  function merge(list, depth = DEPTH) {
    const keys = ['position', 'normal', 'uv', 'color', 'flex', 'glow'], out = {};
    for (const k of keys) out[k] = [];
    for (const g of list) {
      for (const k of keys) out[k].push(g.attributes[k].array);
      g.dispose();
    }
    const geo = new T.BufferGeometry(), size = { position: 3, normal: 3, uv: 2, color: 3, flex: 1, glow: 1 };
    for (const k of keys) {
      const n = out[k].reduce((a, b) => a + b.length, 0), a = new Float32Array(n);
      let o = 0;
      for (const b of out[k]) { a.set(b, o); o += b.length; }
      geo.setAttribute(k, new T.BufferAttribute(a, size[k]));
    }
    // (X, Y, Z) de three.js → (X, Z·fondo, Y) del juego; las normales, con la inversa del aplastado.
    const p = geo.attributes.position, nr = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, p.getX(i), z * depth, y);
      const nx = nr.getX(i), ny = nr.getY(i), nz = nr.getZ(i) / depth, l = Math.hypot(nx, ny, nz) || 1;
      nr.setXYZ(i, nx / l, nz / l, ny / l);
    }
    geo.computeBoundingBox();
    return geo;
  }
  /** El contorno: la misma forma hinchada un poco por sus normales. */
  function hullOf(g, d) {
    const h = g.clone(), p = h.attributes.position, n = h.attributes.normal;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d * DEPTH, p.getZ(i) + n.getZ(i) * d);
    return h;
  }

  const seg = (pc, mobile) => mob ? mobile : pc;
  const CY = (rt, rb, h, n) => new T.CylinderGeometry(rt, rb, h, n, 1, false);
  const CO = (r, h, n) => new T.ConeGeometry(r, h, n, 1, false);
  const BL = (r, q) => new T.IcosahedronGeometry(r, q);
  const SP = (r, w, hh) => new T.SphereGeometry(r, w, hh);
  const HEMI = (r, w, hh) => new T.SphereGeometry(r, w, hh, 0, Math.PI * 2, 0, Math.PI / 2);

  /*
   * Cada modelo: piezas → { g (geometría), hg (contorno o null), w (medio ancho), h (alto), cast (da sombra) }.
   * (Medidas de mundo: una casilla mide 48. Los pies del objeto en su casilla, en el origen.)
   */
  const MODELS = {
    // Árbol de hojas (2 formas): tronco corto y copa de matas redondas que se mecen.
    tree0: k => {
      const q = seg(1, 0);
      // (Las texturas del atlas ya van del tono del bioma: el color de la pieza, blanco o casi.)
      return [part(CY(3.6, 5.4, 22, seg(8, 5)), { y: 11 }, 'bark', '#ffffff', { vk: 0.5 }),
        part(BL(19, q), { y: 40 }, 'leaf', '#ffffff', { flex: 1, aoH: 60 }),
        part(BL(14, q), { x: -13, y: 33, z: 5 }, 'leaf', '#e8e8e8', { flex: 0.9, aoH: 60 }),
        part(BL(14, q), { x: 13, y: 35, z: -3 }, 'leaf', '#f2f2f2', { flex: 0.9, aoH: 60 }),
        part(BL(12, q), { x: 2, y: 53, z: -2 }, 'leaf', '#ffffff', { flex: 1.1, aoH: 60 })];
    },
    tree1: k => {
      const n = seg(12, 7);
      return [part(CY(3.2, 5, 20, seg(8, 5)), { y: 10 }, 'bark', '#ffffff', { vk: 0.5 }),
        part(CO(22, 26, n), { y: 26 }, 'leaf', '#e4e4e4', { flex: 0.8, aoH: 70 }),
        part(CO(17, 24, n), { y: 40, ry: 0.6 }, 'leaf', '#f2f2f2', { flex: 1, aoH: 70 }),
        part(CO(11, 20, n), { y: 54, ry: 1.2 }, 'leaf', '#ffffff', { flex: 1.2, aoH: 70 })];
    },
    // Árbol seco: tronco torcido y ramas desnudas (arenas de fuego, veneno, tierra, roca, fantasma, siniestro).
    dead: k => {
      const t = '#ffffff', t2 = '#d8d8d8', n = seg(7, 5);
      return [part(CY(3, 5.6, 34, n), { y: 17, rz: 0.06 }, 'bark', t, { vk: 0.6, flex: 0.15 }),
        part(CY(1.4, 2.6, 18, n), { x: -8, y: 34, rz: 0.75 }, 'bark', t2, { flex: 0.5 }),
        part(CY(1.2, 2.4, 16, n), { x: 8, y: 38, rz: -0.8, ry: 0.4 }, 'bark', t2, { flex: 0.5 }),
        part(CY(1, 2, 14, n), { x: 1, y: 42, z: -4, rx: -0.5 }, 'bark', t, { flex: 0.6 }),
        part(CY(0.8, 1.4, 9, n), { x: -14, y: 42, rz: 0.2 }, 'bark', t2, { flex: 0.7 })];
    },
    // Cristales (cuevas y arenas de agua, eléctrico, hielo, psíquico, dragón, acero): prismas con punta que brillan algo.
    crystal: k => {
      const L = arr(k.B.leaf), c0 = L[0], c1 = L[Math.min(1, L.length - 1)], c2 = L[Math.min(2, L.length - 1)], r = arr(k.B.rock || '#7a7a8a');
      const out = [part(new T.DodecahedronGeometry(13, 0), { y: 2, sy: 0.45 }, 'stone', '#ffffff', { aoH: 10 })];
      const S = [[0, 0, 0, 7, 34, 0, 0], [-10, 2, 3, 5, 22, 0.35, 0.2], [10, 1, -2, 5.4, 26, -0.3, -0.15], [4, 0, 7, 4, 16, -0.15, 0.45], [-5, 0, -7, 3.6, 15, 0.2, -0.4]];
      S.forEach(([x, y, z, rr, h, rz, rx], i) => {
        const col = [c0, c1, c2, c1, c0][i];
        out.push(part(CY(rr, rr * 1.05, h, 6), { x, y: y + h / 2, z, rz, rx }, 'white', col, { glow: 0.28, aoH: h }));
        const tip = h * 0.32, dx = -Math.sin(rz) * (h / 2 + tip / 2), dy = Math.cos(rz) * (h / 2 + tip / 2);
        out.push(part(CO(rr * 1.05, tip, 6), { x: x + dx, y: y + h / 2 + dy, z: z + Math.sin(rx) * (h / 2 + tip / 2), rz, rx }, 'white', shadeH(col, 0.25), { glow: 0.4, ao: false }));
      });
      return out;
    },
    // Agujas de basalto (volcán): prismas oscuros con una grieta de lava que brilla al pie.
    basalt: k => {
      const t = arr(k.B.trunk), r = (k.pal && k.pal.rock) || ['#5a514c', '#776c66', '#968a83'];
      const out = [];
      [[0, 0, 7.5, 44], [-10, 3, 5.5, 30], [10, -2, 6, 34], [3, 7, 4.5, 20]].forEach(([x, z, rr, h], i) => {
        out.push(part(CY(rr * 0.85, rr, h, 6), { x, y: h / 2, z, ry: i * 0.5 }, 'stone', i % 2 ? '#f0f0f0' : '#d0d0d0', { aoH: h, vk: 0.5 }));
        out.push(part(CY(rr * 0.6, rr * 0.85, 3, 6), { x, y: h + 1.5, z, ry: i * 0.5 }, 'stone', '#e0e0e0', { ao: false }));
      });
      out.push(part(new T.TorusGeometry(12, 1.6, 4, seg(16, 10)), { y: 0.8, rx: Math.PI / 2, sy: 1 }, 'white', '#ff7a2a', { glow: 1, ao: false }));
      return out;
    },
    // Torre de poder: escalones, columna de piedra con runas del color de su poder, capitel y el orbe que brilla.
    altar0: k => altar(k, 0, false), altar1: k => altar(k, 1, false), altar2: k => altar(k, 2, false), altar3: k => altar(k, 3, false),
    altarU: k => altar(k, 0, true),
    // Manantial: aro de piedras y el agua que brilla un poco (seco: sin agua).
    spring: k => spring(k, false), springD: k => spring(k, true),
    // Setas explosivas (trampa): tres setas rojas con lunares.
    boom: () => {
      const out = [];
      [[0, 0, 1], [-11, 4, 0.7], [10, 5, 0.62]].forEach(([x, z, s], i) => {
        out.push(part(CY(2.6 * s, 3.4 * s, 12 * s, seg(8, 5)), { x, y: 6 * s, z }, 'white', '#f0e6d2', { aoH: 12 }));
        out.push(part(HEMI(9 * s, seg(14, 8), seg(6, 3)), { x, y: 11 * s, z, sy: 0.75 }, 'cap', '#ffffff', { ao: false }));
      });
      return out;
    },
    // Flora suelta: seta que brilla y cristal pequeño.
    fshroom: k => {
      const fl = arr(k.B.flowers || '#8fe3ff'), out = [];
      [[0, 0, 1, 0], [-7, 3, 0.65, 1], [6, 4, 0.55, 2]].forEach(([x, z, s, i]) => {
        const c = fl[i % fl.length];
        out.push(part(CY(1.6 * s, 2.2 * s, 11 * s, seg(7, 5)), { x, y: 5.5 * s, z }, 'white', '#e8e4f0', { aoH: 11, glow: 0.1 }));
        out.push(part(HEMI(6.5 * s, seg(12, 7), seg(5, 3)), { x, y: 10 * s, z, sy: 0.6 }, 'white', c, { glow: 0.9, ao: false }));
      });
      return out;
    },
    fcrystal: k => {
      const L = arr(k.B.leaf), out = [];
      [[0, 0, 4, 18, 0], [-5, 2, 2.8, 11, 0.4], [5, 1, 3, 13, -0.35]].forEach(([x, z, rr, h, rz], i) => {
        const col = L[i % L.length];
        out.push(part(CY(rr, rr, h, 6), { x, y: h / 2, z, rz }, 'white', col, { glow: 0.35, aoH: h }));
        out.push(part(CO(rr, h * 0.35, 6), { x: x - Math.sin(rz) * h * 0.66, y: h + h * 0.17 - (1 - Math.cos(rz)) * h, z, rz }, 'white', shadeH(col, 0.3), { glow: 0.5, ao: false }));
      });
      return out;
    }
  };
  function altar(k, eff, used) {
    const col = used ? '#6b7380' : ORB[eff], out = [];
    out.push(part(new T.BoxGeometry(34, 4, 30), { y: 2 }, 'stone', '#c8c8c8', { aoH: 8 }));
    out.push(part(new T.BoxGeometry(26, 4, 24), { y: 6 }, 'stone', '#e2e2e2', { aoH: 8 }));
    out.push(part(CY(7, 8.5, 32, seg(8, 6)), { y: 24 }, 'stone', '#ffffff', { aoH: 40, vk: 0.5 }));
    // Runas: un aro fino que brilla del color de su poder.
    for (const y of [16, 26]) out.push(part(CY(8.4, 8.4, 1.6, seg(8, 6)), { y }, 'white', col, { glow: used ? 0 : 0.8, ao: false }));
    out.push(part(CY(12, 9, 4, seg(10, 6)), { y: 42 }, 'stone', '#f0f0f0', { ao: false }));
    for (const sx of [-1, 1]) out.push(part(CO(2.2, 9, 5), { x: sx * 8.5, y: 48, rz: -sx * 0.35 }, 'stone', '#dcdcdc', { ao: false }));
    out.push(part(SP(6.4, seg(16, 8), seg(12, 6)), { y: 51 }, 'white', col, { glow: used ? 0 : 1.1, ao: false }));
    return out;
  }
  function spring(k, dry) {
    const out = [], n = seg(14, 9);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, s = 0.85 + H(i, 3, 61) * 0.3;
      out.push(part(new T.DodecahedronGeometry(5.2 * s, 0), { x: Math.cos(a) * 20, y: 2.4, z: Math.sin(a) * 20, sy: 0.6, ry: a }, 'stone', i % 2 ? '#e8e8e8' : '#c4c4c4', { ao: false }));
    }
    out.push(part(CY(19, 19, 1.2, seg(24, 12)), { y: 1.2 }, 'white', dry ? '#2f5f68' : '#3ec8d8', { glow: dry ? 0 : 0.55, ao: false }));
    return out;
  }

  /** Alto, medio ancho, si da sombra y grosor del contorno de cada modelo. */
  const META = {
    tree0: [64, 30, true, 1.6], tree1: [66, 24, true, 1.6], dead: [52, 22, true, 1.2], crystal: [46, 20, true, 1.3], basalt: [50, 20, true, 1.3],
    altar0: [58, 18, true, 1.3], altar1: [58, 18, true, 1.3], altar2: [58, 18, true, 1.3], altar3: [58, 18, true, 1.3], altarU: [58, 18, true, 1.3],
    spring: [6, 26, false, 1], springD: [6, 26, false, 1], boom: [18, 18, true, 0.9],
    fshroom: [14, 12, false, 0.8], fcrystal: [22, 10, false, 0.8]
  };

  /** La geometría (y su contorno) de un modelo en el bioma bi, o null. */
  function geo(bi, key) {
    const k = kitOf(bi);
    if (!k || !MODELS[key]) return null;
    let o = k.geos.get(key);
    if (o) return o;
    const g = merge(MODELS[key](k)), [h, w, cast, hd] = META[key];
    o = { g, hg: hd > 0 ? hullOf(g, hd) : null, w, h, cast, mat: k.mat, hullMat: k.hullMat, fadeMat: k.fadeMat, fadeHull: k.fadeHull };
    k.geos.set(key, o);
    return o;
  }

  /** El modelo de un objeto de world.js en el bioma bi (o null: ese va en 2D). */
  function keyOf(p, bi) {
    switch (p.type) {
      case 'tree': {
        const B = G.Tiles.BIOMES[bi];
        if (!B) return null;
        if (B.ground === 'ash') return 'basalt';
        if (B.prop === 'crystal') return 'crystal';
        if (B.prop === 'dead') return 'dead';
        return p.look % 3 === 1 ? 'tree1' : 'tree0';
      }
      // (La hierba alta, en su pixel art de siempre: es del suelo. El dueño, 13-11-2026: «no me gusta la hierba como se ve».)
      case 'grass': return null;
      case 'altar': return p.used ? 'altarU' : 'altar' + (p.kind & 3);
      case 'spring': return p.charge < 0.15 ? 'springD' : 'spring';
      case 'trap': return p.kind === 2 ? 'boom' : null;
      default: return null;
    }
  }
  /** La flora de ambient.js (fila de flora.png) que va en 3D: 4 seta que brilla, 5 cristal (el helecho, como la hierba, en 2D). */
  const FLORA = { 4: 'fshroom', 5: 'fcrystal' };

  /** Suelta todo menos el bioma keep (al perder el contexto: gone, sin dispose: ya no existe en la GPU). */
  function free(gone = false, keep = -1) {
    for (const [bi, k] of [...kits]) {
      if (bi === keep) continue;
      if (!gone) {
        for (const o of k.geos.values()) { o.g.dispose(); if (o.hg) o.hg.dispose(); }
        if (k.mat.map) k.mat.map.dispose();
        for (const m of [k.mat, k.hullMat, k.fadeMat, k.fadeHull]) m.dispose();
      }
      kits.delete(bi);
    }
  }

  /*
   * El portal de la grieta: un desgarro de pie (de cara a la cámara) con un remolino violeta que gira y brilla (shader
   * propio: sin luz, se suma algo de blanco en el centro) y un aro de esquirlas de cristal oscuro que brillan algo.
   * Un objeto suelto (sólo hay uno): { obj, h, r, set(t, k) } (t: segundos; k: 0..1 lo abierto que está).
   */
  function portal(bi) {
    const k = kitOf(bi);
    if (!k) return null;
    const out = [], n = seg(11, 8);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, rr = 1 + (H(i, 1, 91) - 0.5) * 0.25, len = 12 + H(i, 2, 91) * 12;
      // Esquirla: cono de 4 lados que apunta hacia fuera del borde del remolino (en el plano de pie x–y de three.js).
      out.push(part(CO(3.4, len, 4), { x: Math.cos(a) * 33 * rr, y: 58 + Math.sin(a) * 52 * rr, z: (H(i, 3, 91) - 0.5) * 6, rz: a - Math.PI / 2 }, 'white', i % 2 ? '#5a32a0' : '#8048d8', { glow: 0.55, ao: false }));
    }
    const g = merge(out, 0.8), obj = new T.Group(), sh = new T.Mesh(g, k.mat);
    // El remolino: un óvalo de pie (x, z del juego), mirando al sur (a la cámara).
    const S = seg(40, 24), pos = [0, 0, 58], uv = [0.5, 0.5], idx = [];
    for (let i = 0; i <= S; i++) { const a = i / S * Math.PI * 2; pos.push(Math.cos(a) * 32, 0, 58 + Math.sin(a) * 51); uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5); }
    for (let i = 1; i <= S; i++) idx.push(0, i + 1, i);
    const dg = new T.BufferGeometry();
    dg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    dg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    dg.setIndex(idx);
    const u = { uTime: uni.time, uK: { value: 1 } };
    const dm = new T.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, side: T.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: ['uniform float uTime; uniform float uK; varying vec2 vUv;',
        'void main() {',
        '  vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;',
        '  float a = atan(p.y, p.x);',
        '  float sw = sin(a * 3.0 - r * 11.0 + uTime * 3.2) * 0.5 + 0.5, sw2 = sin(a * 5.0 + r * 7.0 - uTime * 2.1) * 0.5 + 0.5;',
        '  vec3 c = mix(vec3(0.42, 0.16, 0.82), vec3(0.86, 0.66, 1.0), sw * (1.0 - r * 0.5));',
        '  c = mix(c, vec3(1.0, 0.94, 1.0), sw2 * pow(1.0 - r, 1.5) * 0.7) + vec3(1.0, 0.95, 1.0) * pow(1.0 - r, 5.0);',
        '  c += vec3(0.7, 0.45, 1.0) * smoothstep(0.75, 0.97, r);',          // (el borde, encendido)
        '  gl_FragColor = vec4(c, smoothstep(1.0, 0.9, r) * uK);',
        '}'].join('\n')
    });
    const disk = new T.Mesh(dg, dm);
    disk.renderOrder = 1;
    obj.add(sh, disk);
    return {
      obj, h: 118, r: 46,
      set(t, kk) { u.uK.value = kk; const s = 0.3 + 0.7 * kk; obj.scale.set(s, 1, s); obj.updateMatrixWorld(true); },
      dispose() { g.dispose(); dg.dispose(); dm.dispose(); }
    };
  }

  return { init, geo, keyOf, portal, FLORA, free, ORB, get DEPTH() { return DEPTH; } };
})();
