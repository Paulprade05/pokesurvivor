// Muros de PokéSurvivor, dibujados con pxl (https://github.com/crsolver/claude-pxl, MIT; aquí sólo la fuente del arte).
// Se construye con tools/pxl/build.cjs. Está en tonos neutros: tileset.js le pone a cada tono el color de cada bioma, así
// que un solo dibujo sirve para los 22 mapas y todos comparten estilo.
//   top: 4 tonos, la cima (a oscuro .. d claro)   ·   cara: 5 tonos, la pared de roca (k contorno .. 4 claro)
// Normas de la casa: 24 px por casilla, luz arriba a la izquierda, 4-5 tonos por material, contorno oscuro,
// y ninguna marca sin causa: matas, grietas y piedras, nada de puntos sueltos.
pal({ a: "#404040", b: "#707070", c: "#a0a0a0", d: "#d0d0d0",
      k: "#101010", 1: "#383838", 2: "#606060", 3: "#909090", 4: "#c8c8c8" })
ramps("abcd", "k1234")

// ---- la cima: bultos con luz arriba y sombra abajo, que dan relieve; cada casilla, los suyos ----
sprite("_bulto", `
  .ccc.
  cdddc
  ccdcc
  bcccb
  .bbb.`)
sprite("_bulto2", `
  ..cc..
  .cddc.
  cccdcc
  bcccbb
  .bbbb.`)
sprite("_mata", `
  .d..c.
  dc.cd.
  ccdcb.
  .bcb..`)
sprite("_grieta", `
  a....
  .a...
  .aa..
  ...a.
  ...aa`)
sprite("_hueco", `
  .aaa.
  aabaa
  .aaa.`)
group("_relieve", ["_bulto", "_bulto", "_bulto2", "_mata", "_mata"])

for (let i = 0; i < 4; i++) sprite("_top" + i, { w: 24, h: 24 },
  rect(0, 0, 24, 24, "b"),
  (c) => {
    // Zonas algo más claras, de borde tramado: la cima no es plana. Nada toca el borde de la casilla (así casan entre sí).
    const r = c.rng(40 + i)
    for (let n = 0; n < 2; n++) {
      const cx = 6 + (r() * 12 | 0), cy = 6 + (r() * 12 | 0), rx = 4 + (r() * 2 | 0), ry = 3
      c.ellipse(cx, cy, rx, ry, "c")
      for (let k = 0; k < 10; k++) { const a = k * 0.63, x = cx + Math.round(Math.cos(a) * (rx + 1)), y = cy + Math.round(Math.sin(a) * (ry + 1)); if (k & 1) c.px(x, y, "c") }
    }
  },
  scatter("_mata", 4, 4, 16, 16, 3, { seed: 7 + i * 13, rflip: "x" }),
  scatter("_bulto", 4, 4, 16, 16, 1, { seed: 3 + i * 5 }),
  i === 1 ? stamp("_grieta", 12, 13) : i === 3 ? stamp("_grieta", 5, 5, { flip: "x" }) : stamp("_hueco", 4 + i * 6, 18 - i * 5))
sprite("_walltop", { w: 96, h: 24 }, stamp("_top0", 0, 0), stamp("_top1", 24, 0), stamp("_top2", 48, 0), stamp("_top3", 72, 0))

// ---- la cara: estratos de roca en bloques irregulares; seguida a lo largo (se repite cada 96 px) ----
const W = 96, H = 16
sprite("_cliff", { w: W, h: H }, (c) => {
  // Roca natural: facetas irregulares (a cada píxel, la semilla más cercana) en vez de hileras de ladrillos. Cada faceta tiene su
  // tono; junta oscura abajo y a la derecha, luz arriba y a la izquierda (la luz de todo el juego). Se repite cada W px.
  const r = c.rng(11), seeds = []
  for (let i = 0; i < 26; i++) seeds.push([(i + 0.15 + r() * 0.7) * W / 26, r() * H, r() < 0.5 ? "2" : r() < 0.6 ? "3" : "1"])
  const cell = (x, y) => {
    let best = 0, bd = 1e9
    for (let i = 0; i < seeds.length; i++) {
      const dx0 = Math.abs(x - seeds[i][0]), dx = Math.min(dx0, W - dx0), dy = (y - seeds[i][1]) * 1.5
      const d = dx * dx + dy * dy
      if (d < bd) { bd = d; best = i }
    }
    return best
  }
  const at = (x, y) => cell((x + W) % W, Math.max(0, Math.min(H - 1, y)))
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = at(x, y)
    let col = seeds[id][2]
    if (at(x + 1, y) !== id || at(x, y + 1) !== id) col = at(x + 1, y + 1) !== id && at(x, y + 1) !== id ? "k" : "1"
    else if (at(x - 1, y) !== id || at(x, y - 1) !== id) col = col === "1" ? "2" : "4"
    c.px(x, y, col)
  }
  // Una veta de estrato que cruza la pared, rota: da sentido de capas sin hacer filas.
  for (let x = 0; x < W; x++) { const y = 9 + Math.round(Math.sin(x / W * 6.2832 * 3) * 1.4); if ((x + 4) % 11 > 2) c.px(x, y, "1") }
  // El pie de la pared, en sombra.
  for (let x = 0; x < W; x++) { c.px(x, H - 1, "k"); if ((x & 1) === 0) c.px(x, H - 2, "1") }
})

// ---- el borde de la cima, que cuelga sobre la pared (se repite cada 96 px) ----
const fr = (x) => Math.round(2.4 + 1.3 * Math.sin(x / W * 6.2832 * 7) + 1 * Math.sin(x / W * 6.2832 * 17 + 1) + 0.6 * Math.sin(x / W * 6.2832 * 31))
sprite("_walllip", { w: W, h: 7 }, (c) => {
  for (let x = 0; x < W; x++) {
    const h = fr(x)
    for (let y = 0; y <= h; y++) c.px(x, y, y === 0 ? "d" : y === h ? "a" : y === h - 1 ? "b" : "c")
    c.px(x, h + 1, "k")                                      // la sombra que hace el borde sobre la roca
  }
})

// ---- lo que crece o sale de la pared, según el sitio ----
// Lianas (bosques): mismos tonos que la cima.
sprite("_hoja", `
  .cd
  dcc
  .ba`)
sprite("_wallvine", { w: W, h: H }, (c) => {
  for (const [x, L] of [[6, 11], [17, 7], [27, 13], [41, 8], [52, 12], [66, 6], [74, 14], [88, 9]]) {
    for (let y = 2; y < L; y++) {
      const xx = x + Math.round(Math.sin(y * 0.7 + x) * 0.8)
      c.px(xx, y, y & 1 ? "b" : "a")
      if (y % 2 === 1) c.stamp("_hoja", xx + (y % 4 === 1 ? 1 : -3), y - 1)
    }
  }
})
// Cristales (cuevas): salen de la roca, con su arista de luz.
sprite("_crist", { outline: "k" }, `
  ..d..
  .dcb.
  .dcb.
  dccba
  dccba`)
sprite("_crist2", { outline: "k" }, `
  .d.
  dcb
  dcb
  dba`)
sprite("_wallcrystal", { w: W, h: H },
  stamp("_crist", 8, 8), stamp("_crist2", 15, 10), stamp("_crist2", 37, 7), stamp("_crist", 58, 9), stamp("_crist2", 66, 11), stamp("_crist2", 83, 6))
// Magma (volcanes): grietas que bajan por la roca, encendidas. Sus colores son fijos.
pal({ m: "#7a1c08", o: "#e84a10", y: "#ffb020", w: "#fff0a0" })
sprite("_wallmagma", { w: W, h: H }, (c) => {
  const seam = (x0, y0, pts) => {
    let x = x0, y = y0
    for (const [dx, dy] of pts) {
      for (let i = 0; i < dy; i++) { c.px(x + (i * dx / dy | 0), y + i, i % 3 === 0 ? "y" : "o"); c.px(x + (i * dx / dy | 0) + 1, y + i, "m") }
      x += dx; y += dy
    }
    c.px(x, y, "w")
  }
  seam(11, 1, [[2, 4], [-1, 3], [2, 5]])
  seam(38, 3, [[-2, 3], [2, 4]])
  seam(63, 0, [[1, 5], [2, 3], [-2, 5]])
  seam(86, 4, [[2, 3], [-1, 5]])
})

// ---- lo que hace de árbol donde no hay árboles: 3 aspectos de 28×26, con la base abajo ----
// Cristales (cuevas): agujas con cara clara a la izquierda, arista de luz y cara oscura a la derecha.
const AGUJAS = [[[14, 1, 5], [7, 9, 4], [21, 7, 4]], [[10, 3, 5], [19, 0, 5], [4, 13, 3], [25, 14, 2]], [[14, 4, 6], [6, 11, 4], [22, 12, 3]]]
for (let i = 0; i < 3; i++) sprite("_cris" + i, { w: 28, h: 26 }, (c) => {
  const list = AGUJAS[i].slice().sort((p, q) => p[1] - q[1])
  for (const [cx, top, hw] of list) {
    for (let y = top; y < 24; y++) {
      const w = Math.min(hw, Math.round((y - top) * 0.75))
      for (let x = cx - w - 1; x <= cx + w + 1; x++) {
        const out = x < cx - w || x > cx + w
        c.px(x, y, out ? "k" : x === cx ? "d" : x < cx ? (x === cx - w ? "c" : "b") : "a")
      }
    }
    c.px(cx, top - 1, "k")
    for (let k = 3; k < 16; k += 5) { const xx = cx - Math.min(hw - 1, 2); c.px(xx, top + k, "d"); c.px(xx + 1, top + k + 1, "c") }
  }
  for (let x = 3; x < 25; x++) { c.px(x, 24, "a"); c.px(x, 25, "k") }
  c.px(2, 24, "k"); c.px(25, 24, "k")
})
// Basalto (volcanes): agujas de roca negra con su grieta encendida. Colores fijos.
pal({ e: "#241c1e", f: "#3e3234", g: "#5e4c4a", h: "#8a7066" })
const PICOS = [[[14, 2, 6], [6, 12, 4], [22, 10, 4]], [[9, 5, 5], [19, 1, 6], [25, 15, 2]], [[14, 6, 7], [5, 13, 3], [23, 13, 3]]]
for (let i = 0; i < 3; i++) sprite("_basa" + i, { w: 28, h: 26 }, (c) => {
  for (const [cx, top, hw] of PICOS[i].slice().sort((p, q) => p[1] - q[1])) {
    for (let y = top; y < 24; y++) {
      const t = (y - top) / (24 - top), w = Math.max(1, Math.round(hw * Math.pow(t, 0.7) + Math.sin(y * 1.3 + cx) * 0.7))
      for (let x = cx - w - 1; x <= cx + w + 1; x++) {
        const out = x < cx - w || x > cx + w, l = (x - cx) / w
        c.px(x, y, out ? "k" : l < -0.45 ? "h" : l < 0 ? "g" : l < 0.5 ? "f" : "e")
      }
    }
    c.px(cx, top - 1, "k")
    // La grieta de magma baja por el centro.
    let x = cx
    for (let y = top + 5; y < 23; y++) { if (y % 4 === 0) x += y % 8 ? 1 : -1; c.px(x, y, y % 3 ? "o" : "y"); c.px(x + 1, y, "m") }
  }
  for (let x = 3; x < 25; x++) { c.px(x, 24, "e"); c.px(x, 25, "k") }
})
sprite("_pilares", { w: 96, h: 52 }, ...[0, 1, 2].flatMap(i => [stamp("_cris" + i, i * 28, 0), stamp("_basa" + i, i * 28, 26)]))

// ---- rocas: 4 celdas de 22×17 (peñasco, peñasco roto, peñasco y piedra, los dos rotos); mismas facetas que la pared ----
const ROCAS = [[[10.5, 9, 9.5, 7]], [[8.5, 9.5, 7.5, 6.5], [16.5, 12, 4.5, 3.5]]]
const celda = (c, i, cuerpo) => {
  const look = i >> 1, broken = i & 1, ox = i * 22, blobs = ROCAS[look], r = c.rng(70 + look), seeds = []
  for (let n = 0; n < 9; n++) seeds.push([2 + r() * 18, 2 + r() * 14, r() < 0.5 ? "3" : "2"])
  const dentro = (x, y) => blobs.some(([bx, by, rx, ry]) => ((x - bx) / rx) ** 2 + ((y - by) / ry) ** 2 <= 1)
  const cell = (x, y) => { let b = 0, bd = 1e9; seeds.forEach(([sx, sy], n) => { const d = (x - sx) ** 2 + (y - sy) ** 2 * 1.4; if (d < bd) { bd = d; b = n } }); return b }
  for (let y = 0; y < 17; y++) for (let x = 0; x < 22; x++) {
    if (!dentro(x, y)) { if (dentro(x + 1, y) || dentro(x - 1, y) || dentro(x, y + 1) || dentro(x, y - 1)) cuerpo(ox + x, y, "k", x, y); continue }
    const id = cell(x, y), ny = blobs.reduce((m, [bx, by, rx, ry]) => Math.min(m, Math.abs((y - by) / ry) * (y > by ? 1 : -1)), 9)
    let col = seeds[id][2]
    if (cell(x + 1, y) !== id || cell(x, y + 1) !== id) col = "1"                  // junta en sombra
    else if (cell(x, y - 1) !== id) col = "4"                                      // arista con luz, sólo la de arriba
    if (y >= 14 || ny > 0.7) col = "1"                                             // el pie, en sombra
    cuerpo(ox + x, y, col, x, y)
  }
  if (broken) for (const [x, y] of [[9, 3], [10, 4], [10, 5], [11, 6], [10, 7], [12, 7], [13, 8], [8, 8], [7, 9], [11, 8], [6, 10]]) cuerpo(ox + x, y, "k", x, y)
}
sprite("_rocas", { w: 88, h: 17 }, (c) => { for (let i = 0; i < 4; i++) celda(c, i, (x, y, col) => c.px(x, y, col)) })
// Musgo encima de la roca (bosques): lo de arriba de cada peñasco, a matas.
sprite("_musgos", { w: 88, h: 17 }, (c) => {
  for (let i = 0; i < 4; i++) {
    const ox = i * 22, blobs = ROCAS[i >> 1], dentro = (x, y) => blobs.some(([bx, by, rx, ry]) => ((x - bx) / rx) ** 2 + ((y - by) / ry) ** 2 <= 0.86)
    for (let x = 1; x < 21; x++) {
      let y = 0
      while (y < 17 && !dentro(x, y)) y++
      if (y >= 12) continue
      // Más grueso a matas; por debajo, la sombra del musgo sobre la piedra.
      const h = [1, 2, 3, 2, 1, 2, 2, 1][(x + (i >> 1) * 3) % 8]
      for (let k = 0; k < h; k++) c.px(ox + x, y + k, k === 0 ? (x % 3 ? "c" : "d") : "b")
      c.px(ox + x, y + h, "a")
    }
  }
})

// ---- todo junto en una hoja (una sola descarga); las filas, en tileset.js (WS) ----
sprite("wallset", { w: W, h: 181 }, stamp("_walltop", 0, 0), stamp("_cliff", 0, 24), stamp("_walllip", 0, 40),
  stamp("_wallvine", 0, 47), stamp("_wallcrystal", 0, 63), stamp("_wallmagma", 0, 79), stamp("_pilares", 0, 95),
  stamp("_rocas", 0, 147), stamp("_musgos", 0, 164))
