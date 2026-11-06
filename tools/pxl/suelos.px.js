// Suelos de PokéSurvivor, dibujados con pxl. Lo construye tools/pxl/build.cjs.
//
// Reglas de todo el arte del mundo, sacadas de medir los sprites de los Pokémon (docs/ESTILO-ARTE.md):
//   1 píxel de arte = 2 unidades de mundo, como los Pokémon.
//   El suelo es lo único sin contorno: formas grandes, tonos cercanos y marcas con causa, para que lo que está de pie resalte.
//   Sin tramas ni ruido: el suelo de antes era ruido fino (manchas de 3-4 px) y se veía repetido y borroso.
//
// Cada hoja son 16 piezas × 3 variantes de 24 px. Las piezas van por esquinas: cada esquina es material A o B, y dos piezas vecinas
// comparten esquinas, así que encajan solas. El juego decide las esquinas con ruido de baja frecuencia (tileset.js): salen manchas
// de varias casillas, siempre distintas, en vez de un dibujo que se repite. Los colores los pone cada bioma.
//   a b c d  material A (oscuro .. claro)   ·   e f g h  material B (oscuro .. claro)
pal({ a: "#100000", b: "#200000", c: "#300000", d: "#400000", e: "#001000", f: "#002000", g: "#003000", h: "#004000" })
const T = 24

// Valor de cada esquina: bit 1 NO, 2 NE, 4 SO, 8 SE. Con vaivén que se apaga en los bordes (así las vecinas casan).
function esB(mask, row, x, y) {
  const q = (n) => Math.floor(n / 2) * 2 + 1                 // a escalones de 2 px: formas gruesas, como los Pokémon
  const X = q(x), Y = q(y), u = X / T, v = Y / T
  const c = (b) => (mask & b ? 1 : 0)
  const f = c(1) * (1 - u) * (1 - v) + c(2) * u * (1 - v) + c(4) * (1 - u) * v + c(8) * u * v
  const borde = Math.min(1, Math.min(X, Y, T - X, T - Y) / 6)
  const w = Math.sin(X * 0.61 + mask * 2.1 + row * 1.7) * Math.cos(Y * 0.53 + mask * 1.3 - row)
  return f + w * 0.2 * borde > 0.5
}

// ---- las marcas de cada suelo: siempre con causa, lejos del borde de la casilla ----
function mancha(c, x, y, w, h, col) { c.rect(x + 1, y, w - 2, h, col); c.rect(x, y + 1, w, h - 2, col) }
const MARCAS = {
  // Pradera: matas cortas, dos tonos, gruesas.
  grass(c, r, ok) {
    for (let i = 0; i < 3; i++) {
      const x = 3 + (r() * 16 | 0), y = 4 + (r() * 15 | 0)
      if (!ok(x, y)) continue
      c.rect(x, y + 2, 5, 1, "a"); c.rect(x, y, 1, 2, "d"); c.rect(x + 2, y - 1, 1, 3, "d"); c.rect(x + 4, y, 1, 2, "d")
    }
    if (r() < 0.7) { const x = 5 + (r() * 12 | 0), y = 5 + (r() * 12 | 0); if (ok(x, y)) mancha(c, x, y, 7, 4, "c") }
  },
  // Piedra: losas gastadas y alguna grieta.
  stone(c, r, ok) {
    const x = 3 + (r() * 9 | 0), y = 3 + (r() * 9 | 0)
    if (ok(x, y)) { mancha(c, x, y, 9, 6, "c"); c.rect(x + 1, y + 6, 8, 1, "a"); c.rect(x + 9, y + 1, 1, 5, "a") }
    if (r() < 0.6) { const a = 4 + (r() * 12 | 0), b = 15 + (r() * 4 | 0); if (ok(a, b)) { c.rect(a, b, 4, 1, "a"); c.rect(a + 3, b + 1, 3, 1, "a") } }
  },
  // Ceniza: grietas que se abren y placas algo más claras.
  ash(c, r, ok) {
    const x = 4 + (r() * 12 | 0), y = 4 + (r() * 12 | 0)
    if (ok(x, y)) { c.rect(x, y, 2, 2, "a"); c.rect(x + 2, y + 1, 3, 1, "a"); c.rect(x + 4, y + 2, 1, 3, "a"); c.rect(x - 2, y + 2, 2, 1, "a") }
    if (r() < 0.8) { const a = 4 + (r() * 12 | 0), b = 4 + (r() * 12 | 0); if (ok(a, b)) mancha(c, a, b, 6, 4, "c") }
  },
  // Arena: ondas del viento.
  sand(c, r, ok) {
    for (let i = 0; i < 2; i++) {
      const x = 3 + (r() * 8 | 0), y = 5 + i * 8 + (r() * 3 | 0)
      if (!ok(x, y)) continue
      c.rect(x + 2, y, 8, 1, "c"); c.rect(x, y + 1, 3, 1, "c"); c.rect(x + 9, y + 1, 3, 1, "c"); c.rect(x + 2, y + 1, 8, 1, "a")
    }
  },
  // Nieve: montoncitos con su sombra.
  snow(c, r, ok) {
    const x = 3 + (r() * 11 | 0), y = 4 + (r() * 12 | 0)
    if (ok(x, y)) { mancha(c, x, y, 9, 4, "d"); c.rect(x + 1, y + 4, 7, 1, "a") }
    if (r() < 0.6) { const a = 5 + (r() * 12 | 0), b = 5 + (r() * 12 | 0); if (ok(a, b)) mancha(c, a, b, 5, 3, "c") }
  },
  // Tablones: juntas seguidas a lo largo y vetas; la mancha B es madera más gastada.
  wood(c, r) {
    for (const y of [7, 15, 23]) c.rect(0, y, T, 1, "a")
    for (const [y, x] of [[0, 4 + (r() * 14 | 0)], [8, 3 + (r() * 16 | 0)], [16, 5 + (r() * 12 | 0)]]) { c.rect(x, y, 1, 7, "a"); c.rect(x + 1, y + 2, 5, 1, "c") }
  },
  // Planchas de metal: juntas en el borde y remaches.
  metal(c, r) {
    c.rect(0, 0, T, 1, "a"); c.rect(0, 0, 1, T, "a"); c.rect(0, 1, T, 1, "c"); c.rect(1, 0, 1, T, "c")
    for (const [x, y] of [[3, 3], [19, 3], [3, 19], [19, 19]]) { c.rect(x, y, 2, 2, "d"); c.px(x + 1, y + 1, "a") }
    if (r() < 0.6) { const x = 7 + (r() * 8 | 0), y = 7 + (r() * 8 | 0); c.rect(x, y, 6, 1, "c") }
  }
}

for (const suelo of Object.keys(MARCAS)) sprite("floor_" + suelo, { w: T * 16, h: T * 3 }, (c) => {
  for (let row = 0; row < 3; row++) for (let mask = 0; mask < 16; mask++) {
    const ox = mask * T, oy = row * T
    // Pinta en un lienzo aparte de marcas: se escribe directo con desplazamiento.
    const off = { rect: (x, y, w, h, col) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, col) },
                  px: (x, y, col) => put(x, y, col) }
    const put = (x, y, col) => {
      if (x < 0 || y < 0 || x >= T || y >= T || esB(mask, row, x, y)) return
      c.px(ox + x, oy + y, col)
    }
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const B = esB(mask, row, x, y)
      if (!B) { c.px(ox + x, oy + y, "b"); continue }
      // Borde de la mancha, más oscuro; dentro, plano.
      const cerca = [[0, -2], [-2, 0], [2, 0], [0, 2]].some(([a, b]) => { const X = x + a, Y = y + b; return X >= 0 && Y >= 0 && X < T && Y < T && !esB(mask, row, X, Y) })
      c.px(ox + x, oy + y, cerca ? "e" : "f")
    }
    // Marcas del material A (no entran en la mancha B).
    MARCAS[suelo](off, c.rng(row * 97 + mask * 13 + suelo.length), (x, y) => !esB(mask, row, x, y))
    // Algo de vida dentro de la mancha B: guijarros o tierra removida.
    if (mask) {
      const r = c.rng(row * 41 + mask * 7 + 3)
      for (let i = 0; i < 2; i++) {
        const x = 3 + (r() * 17 | 0), y = 3 + (r() * 17 | 0)
        if (esB(mask, row, x, y) && esB(mask, row, x + 3, y) && esB(mask, row, x, y + 2)) { c.rect(ox + x, oy + y, 3, 1, "h"); c.rect(ox + x, oy + y + 1, 3, 1, "e"); c.px(ox + x + 1, oy + y, "g") }
      }
    }
  }
})
