// El interior de tu choza (17-11-2026, world/home-in.js): suelos, paredes y muebles, dibujados con pxl. Lo construye
// tools/pxl/build.cjs → assets/pxl/chozain.png (un atlas: home-in.js ATLAS dice dónde está cada pieza).
// Normas de la casa (docs/ESTILO-ARTE.md): 24 px por casilla, luz arriba a la izquierda, 3-4 tonos por material, contorno
// oscuro en lo que está de pie (el del tono más oscuro, no negro puro), lo plano sin contorno negro y ninguna marca sin causa.
// Colores del bosque bioluminiscente de la aldea: madera cálida, musgo, piedra y las luces cian, rosa y ámbar.
pal({ k: "#1a1420", K: "#2e2436",
      d: "#3a2418", t: "#5a3a22", T: "#8a5c34", u: "#c08a54", U: "#e0b07a",          // madera
      s: "#8a6a32", S: "#b8904a", z: "#e0c070",                                       // paja
      g: "#235a34", G: "#3f8a48", H: "#7cc860",                                       // hojas
      m: "#1a3428", M: "#2d5238", n: "#43734a",                                       // musgo
      1: "#2e3338", 2: "#4a5258", 3: "#69747c", 4: "#9aa6ae",                         // piedra
      x: "#1f5a70", X: "#4fc8e0", Z: "#c8f7ff",                                       // luz cian
      p: "#8a2a5a", P: "#e060b0", Q: "#ffc4ec",                                       // luz rosa
      o: "#b8701a", O: "#ffc04a", Y: "#fff0a0",                                       // ámbar
      r: "#9a2e28", R: "#d85040", c: "#efe2c8", C: "#b8a890", w: "#ffffff",
      b: "#1c2650", B: "#3a5aa8", v: "#4a2e7a", V: "#9a6ae0",
      e: "#3a4450", E: "#76828e", a: "#16485a", A: "#2a90a8" })
ramps("kdtTuU", "sSz", "gGH", "mMn", "1234", "xXZ", "pPQ", "oOY", "rR", "Cc", "bB", "vV", "eE", "aA")

// ---------------- suelos: 24×24, se repiten sin costuras ----------------
sprite("_f_wood", { w: 24, h: 24 }, (c) => {
  c.rect(0, 0, 24, 24, "T")
  for (let r = 0; r < 4; r++) {
    const y = r * 6, off = (r % 2) * 12
    c.hline(0, y + 5, 24, "t")
    c.hline(0, y, 24, "u")
    c.vline((off + 7) % 24, y + 1, 4, "t")
    c.noise(0, y + 1, 24, 4, "u", 0.06, r + 3)
    c.noise(0, y + 1, 24, 4, "t", 0.05, r + 9)
  }
})
sprite("_f_moss", { w: 24, h: 24 }, (c) => {
  c.rect(0, 0, 24, 24, "M")
  c.noise(0, 0, 24, 24, "m", 0.18, 4)
  c.noise(0, 0, 24, 24, "n", 0.12, 7)
  for (const [x, y] of [[5, 6], [17, 15], [10, 20]]) c.px(x, y, "X")
})
sprite("_f_weave", { w: 24, h: 24 }, (c) => {
  c.rect(0, 0, 24, 24, "G")
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x = i * 6, y = j * 6
    if ((i + j) % 2) { for (let k = 0; k < 6; k += 2) c.hline(x, y + k, 6, "g"); c.hline(x, y + 1, 6, "H") }
    else { for (let k = 0; k < 6; k += 2) c.vline(x + k, y, 6, "g"); c.vline(x + 1, y, 6, "H") }
  }
})
sprite("_f_stone", { w: 24, h: 24 }, (c) => {
  c.rect(0, 0, 24, 24, "1")
  for (const [x, y, w, h] of [[1, 1, 10, 10], [13, 1, 10, 6], [13, 9, 10, 14], [1, 13, 10, 10]]) {
    c.rect(x, y, w, h, "3"); c.hline(x, y, w, "4"); c.vline(x, y, h, "4"); c.noise(x + 1, y + 1, w - 1, h - 1, "2", 0.15, x + y)
  }
  c.px(4, 16, "n"); c.px(5, 16, "n"); c.px(18, 3, "n")
})
sprite("_f_crystal", { w: 24, h: 24 }, (c) => {
  c.rect(0, 0, 24, 24, "b")
  for (const [x, y] of [[0, 0], [12, 0], [0, 12], [12, 12]]) {
    c.rect(x + 1, y + 1, 10, 10, "x"); c.line(x + 2, y + 9, x + 9, y + 2, "X"); c.px(x + 3, y + 3, "Z")
  }
})

// ---------------- paredes: 24×48, se repiten a lo ancho; abajo el zócalo ----------------
const zocalo = (c, col = "d") => { c.rect(0, 42, 24, 6, col); c.hline(0, 42, 24, "k") }
sprite("_w_wood", { w: 24, h: 48 }, (c) => {
  c.rect(0, 0, 24, 48, "t")
  for (let i = 0; i < 4; i++) { c.vline(i * 6, 0, 42, "d"); c.vline(i * 6 + 1, 0, 42, "T"); c.noise(i * 6 + 2, 0, 4, 42, "T", 0.08, i) }
  c.rect(0, 0, 24, 3, "d"); zocalo(c)
})
sprite("_w_roots", { w: 24, h: 48 }, (c) => {
  c.rect(0, 0, 24, 48, "K")
  for (const x of [3, 11, 19]) { for (let y = 0; y < 42; y++) { const dx = Math.round(Math.sin(y / 5 + x) * 2); c.px(x + dx, y, "t"); c.px(x + dx + 1, y, "T"); c.px(x + dx + 2, y, "t") } }
  c.noise(0, 0, 24, 42, "n", 0.04, 5); zocalo(c)
})
sprite("_w_leaf", { w: 24, h: 48 }, (c) => {
  c.rect(0, 0, 24, 48, "g")
  for (let r = 0; r < 7; r++) for (let i = -1; i < 4; i++) {
    const x = i * 8 + (r % 2) * 4, y = r * 6
    c.ellipse(x + 4, y + 3, 4, 3, "G"); c.hline(x + 2, y + 1, 3, "H"); c.hline(x + 1, y + 5, 6, "g")
  }
  zocalo(c, "t")
})
sprite("_w_stone", { w: 24, h: 48 }, (c) => {
  c.rect(0, 0, 24, 48, "1")
  for (let r = 0; r < 5; r++) for (let i = -1; i < 3; i++) {
    const x = i * 12 + (r % 2) * 6, y = r * 8 + 1
    c.rect(x + 1, y, 10, 7, "2"); c.hline(x + 1, y, 10, "3"); c.noise(x + 1, y + 1, 10, 6, "3", 0.1, r * 4 + i + 9)
  }
  c.px(4, 9, "n"); c.px(5, 9, "n"); c.px(5, 10, "M"); c.px(16, 33, "n"); c.px(17, 33, "M"); zocalo(c, "1")
})
sprite("_w_metal", { w: 24, h: 48 }, (c) => {
  c.rect(0, 0, 24, 48, "e")
  c.rect(1, 1, 22, 18, "E"); c.rect(2, 2, 20, 16, "e"); c.rect(1, 21, 22, 20, "E"); c.rect(2, 22, 20, 18, "e")
  for (const [x, y] of [[3, 3], [20, 3], [3, 16], [20, 16], [3, 23], [20, 23], [3, 38], [20, 38]]) c.px(x, y, "4")
  c.hline(0, 19, 24, "X"); zocalo(c, "1")
})

// ---------------- muebles (de pie, con contorno; el tamaño final lleva 1 px más por lado) ----------------
sprite("_bed", { w: 46, h: 50, outline: "k" }, (c) => {
  c.rect(0, 0, 46, 12, "t"); c.rect(1, 1, 44, 3, "u"); c.hline(1, 11, 44, "d")
  c.rect(0, 10, 46, 40, "d"); c.rect(2, 11, 42, 37, "S"); c.noise(2, 11, 42, 37, "z", 0.12, 3); c.noise(2, 11, 42, 37, "s", 0.1, 5)
  c.ellipse(23, 18, 12, 5, "c"); c.hline(14, 15, 14, "w"); c.hline(13, 22, 20, "C")
  c.rect(2, 27, 42, 21, "p"); c.rect(2, 27, 42, 3, "Q"); c.hline(2, 30, 42, "P")
  for (const [x, y] of [[8, 35], [20, 38], [32, 34], [14, 43], [38, 42], [26, 45]]) { c.px(x, y, "P"); c.px(x + 1, y, "P") }
  c.rect(0, 46, 4, 4, "d"); c.rect(42, 46, 4, 4, "d")
})
sprite("_table", { w: 46, h: 28, outline: "k" }, (c) => {
  c.rect(17, 12, 12, 16, "t"); c.vline(17, 12, 16, "d"); c.vline(26, 12, 16, "T")
  c.ellipse(23, 9, 22, 9, "T"); c.ellipse(23, 9, 22, 9, "t", true); c.ellipse(23, 8, 15, 6, "u", true); c.ellipse(23, 8, 8, 3, "u", true)
  c.hline(10, 3, 12, "U"); c.rect(3, 13, 40, 3, "t")
})
sprite("_shelf", { w: 46, h: 54, outline: "k" }, (c) => {
  c.rect(0, 0, 46, 54, "t"); c.rect(3, 3, 40, 49, "d")
  for (const y of [16, 32, 48]) { c.rect(2, y, 42, 3, "T"); c.hline(2, y, 42, "u") }
  const books = ["r", "B", "G", "o", "v", "R", "x"]
  for (let i = 0; i < 9; i++) { const h = 9 + (i * 7) % 4; c.rect(4 + i * 4, 16 - h, 3, h, books[i % books.length]); c.vline(4 + i * 4, 16 - h, h, "k") }
  for (const [x, col, hi] of [[6, "x", "X"], [16, "p", "P"], [28, "o", "O"], [37, "x", "X"]]) { c.rect(x, 24, 6, 8, col); c.rect(x + 1, 25, 4, 5, hi); c.rect(x + 2, 22, 2, 2, "C") }
  for (let i = 0; i < 5; i++) { c.rect(5 + i * 8, 40, 6, 8, books[(i + 3) % books.length]); c.hline(5 + i * 8, 40, 6, "k") }
  c.vline(1, 0, 54, "u")
})
sprite("_sofa", { w: 46, h: 32, outline: "k" }, (c) => {
  c.rect(0, 2, 46, 30, "t"); c.rect(2, 0, 42, 14, "M"); c.noise(2, 0, 42, 14, "n", 0.2, 2); c.hline(3, 1, 40, "n")
  c.rect(0, 10, 7, 18, "M"); c.rect(39, 10, 7, 18, "M"); c.rect(6, 14, 34, 12, "n"); c.noise(6, 14, 34, 12, "M", 0.15, 8)
  c.vline(23, 15, 10, "M"); c.rect(0, 27, 46, 5, "d"); c.px(10, 18, "X"); c.px(31, 20, "X")
})
sprite("_stove", { w: 46, h: 46, outline: "k" }, (c) => {
  c.rect(0, 6, 46, 40, "2"); for (let r = 0; r < 5; r++) for (let i = 0; i < 4; i++) c.rect(1 + i * 12 + (r % 2) * 6, 7 + r * 8, 10, 6, "3")
  c.rect(0, 4, 46, 5, "1"); c.hline(0, 4, 46, "4")
  c.ellipse(23, 33, 13, 10, "k"); c.rect(10, 33, 27, 11, "k"); c.ellipse(23, 36, 10, 7, "o"); c.ellipse(23, 38, 7, 5, "O"); c.ellipse(23, 40, 3, 3, "Y")
  c.rect(14, 0, 18, 6, "e"); c.hline(14, 0, 18, "E"); c.rect(20, -1, 6, 2, "E")
})
sprite("_tank", { w: 46, h: 38, outline: "k" }, (c) => {
  c.rect(0, 26, 46, 12, "t"); c.hline(0, 26, 46, "u"); c.rect(4, 30, 6, 8, "d"); c.rect(36, 30, 6, 8, "d")
  c.rect(1, 0, 44, 26, "a"); c.rect(2, 5, 42, 20, "A"); c.hline(2, 5, 42, "X")
  for (const x of [6, 9, 34, 38]) for (let y = 14; y < 25; y++) c.px(x + Math.round(Math.sin(y / 2 + x)), y, "G")
  c.rect(16, 13, 5, 3, "O"); c.px(15, 14, "O"); c.px(21, 14, "k"); c.rect(27, 18, 4, 2, "P"); c.px(26, 18, "P")
  c.px(5, 7, "Z"); c.px(6, 8, "Z"); c.px(40, 9, "Z"); c.rect(1, 0, 44, 2, "e")
})
sprite("_rug", { w: 72, h: 48 }, (c) => {
  c.ellipse(36, 24, 35, 23, "g"); c.ellipse(36, 24, 32, 20, "G"); c.ellipse(36, 24, 26, 15, "g", true)
  c.ellipse(36, 24, 20, 11, "H", true); c.ellipse(36, 24, 12, 6, "g", true); c.ellipse(36, 24, 5, 2, "H")
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; c.px(36 + Math.round(Math.cos(a) * 29), 24 + Math.round(Math.sin(a) * 18), "H") }
})
sprite("_lamp", { w: 22, h: 38, outline: "k" }, (c) => {
  c.rect(9, 12, 4, 24, "c"); c.vline(9, 12, 24, "w"); c.vline(12, 12, 24, "C"); c.rect(5, 34, 12, 4, "C")
  c.ellipse(11, 8, 11, 8, "x"); c.ellipse(11, 7, 9, 6, "X"); c.rect(0, 8, 22, 4, "x")
  for (const [x, y] of [[6, 5], [14, 3], [16, 8], [9, 9]]) { c.px(x, y, "Z"); c.px(x + 1, y, "Z") }
})
sprite("_plant", { w: 22, h: 32, outline: "k" }, (c) => {
  c.poly([3, 20, 19, 20, 17, 32, 5, 32], "R"); c.rect(2, 19, 18, 3, "r"); c.vline(5, 22, 9, "r")
  for (const [x1, y1] of [[1, 6], [5, 1], [11, 0], [17, 1], [21, 6], [3, 12], [19, 12]]) { c.line(11, 19, x1, y1, "G"); c.line(11, 18, x1 + (x1 < 11 ? 1 : -1), y1 + 1, "g") }
  for (const [x, y] of [[5, 1], [17, 1], [11, 0]]) c.px(x, y, "H")
  c.px(7, 6, "X"); c.px(15, 9, "X")
})
sprite("_crystal", { w: 22, h: 32, outline: "k" }, (c) => {
  c.ellipse(11, 28, 10, 4, "2"); c.hline(3, 26, 16, "3")
  c.poly([7, 28, 9, 4, 13, 2, 15, 28], "p"); c.poly([9, 26, 10, 6, 12, 5, 12, 26], "P"); c.vline(11, 6, 18, "Q")
  c.poly([1, 28, 2, 14, 6, 12, 8, 28], "v"); c.vline(4, 15, 12, "V")
  c.poly([14, 28, 17, 16, 21, 18, 20, 28], "v"); c.vline(18, 18, 9, "V")
})
sprite("_chest", { w: 22, h: 22, outline: "k" }, (c) => {
  c.rect(0, 8, 22, 14, "t"); c.rect(0, 2, 22, 8, "T"); c.ellipse(11, 3, 11, 3, "T"); c.hline(1, 1, 20, "u")
  c.vline(4, 1, 21, "o"); c.vline(17, 1, 21, "o"); c.hline(0, 9, 22, "d")
  c.rect(9, 8, 4, 5, "O"); c.px(10, 10, "k"); c.px(11, 10, "k"); c.px(9, 8, "Y")
})
sprite("_stool", { w: 22, h: 18, outline: "k" }, (c) => {
  c.rect(8, 8, 6, 10, "c"); c.vline(8, 8, 10, "w"); c.vline(13, 8, 10, "C")
  c.ellipse(11, 6, 11, 6, "r"); c.ellipse(11, 5, 9, 4, "R"); c.rect(0, 6, 22, 3, "r")
  for (const [x, y] of [[5, 4], [12, 2], [16, 5]]) { c.px(x, y, "c"); c.px(x + 1, y, "c") }
})
sprite("_cushion", { w: 22, h: 16 }, (c) => {
  c.ellipse(11, 8, 11, 8, "k"); c.ellipse(11, 8, 10, 7, "c")
  for (let y = 1; y < 8; y++) for (let x = 0; x < 22; x++) if (c.is(x, y, "c")) c.px(x, y, "R")
  c.ellipse(11, 4, 6, 2, "Q"); c.hline(1, 8, 20, "k"); c.circ(11, 8, 3, "k"); c.circ(11, 8, 2, "w"); c.hline(4, 11, 14, "C")
})
sprite("_window", { w: 22, h: 22, outline: "k" }, (c) => {
  c.rect(0, 0, 22, 22, "t"); c.rect(2, 2, 18, 18, "b"); c.rect(2, 12, 18, 8, "B")
  c.circ(14, 7, 3, "Y"); c.circ(15, 6, 2, "b"); c.px(5, 5, "w"); c.px(8, 9, "w"); c.px(17, 14, "w")
  c.vline(10, 2, 18, "t"); c.hline(2, 10, 18, "t"); c.rect(0, 20, 22, 2, "u")
})
sprite("_painting", { w: 22, h: 18, outline: "k" }, (c) => {
  c.rect(0, 0, 22, 18, "o"); c.box(0, 0, 22, 18, "O"); c.rect(2, 2, 18, 14, "v")
  c.ring(11, 9, 5, "P"); c.ring(11, 9, 3, "X"); c.px(11, 9, "Q"); c.rect(5, 14, 12, 2, "M"); c.px(4, 3, "Y")
})
sprite("_garland", { w: 46, h: 14 }, (c) => {
  for (let x = 0; x < 46; x++) c.px(x, Math.round(2 + Math.sin(x / 45 * Math.PI) * 5), "k")
  const cols = [["x", "X"], ["p", "P"], ["o", "O"], ["g", "H"]]
  for (let i = 0; i < 6; i++) { const x = 4 + i * 7, y = Math.round(2 + Math.sin(x / 45 * Math.PI) * 5); const [d, l] = cols[i % 4]; c.rect(x - 1, y + 1, 3, 4, d); c.px(x, y + 2, l); c.px(x, y, "k") }
})
sprite("_mat", { w: 46, h: 12 }, (c) => {
  c.rect(0, 0, 46, 12, "r"); c.box(0, 0, 46, 12, "t"); for (let x = 4; x < 44; x += 6) c.vline(x, 2, 8, "R")
})

// ---------------- el atlas ----------------
// Fila 0: suelos (wood, moss, weave, stone, crystal) · fila 24: paredes (wood, roots, leaf, stone, metal) ·
// y 72: muebles grandes · y 128: los pequeños, los de la pared y lo plano · y 176: el felpudo.
sprite("chozain", { w: 312, h: 192 },
  stamp("_f_wood", 0, 0), stamp("_f_moss", 24, 0), stamp("_f_weave", 48, 0), stamp("_f_stone", 72, 0), stamp("_f_crystal", 96, 0),
  stamp("_w_wood", 0, 24), stamp("_w_roots", 24, 24), stamp("_w_leaf", 48, 24), stamp("_w_stone", 72, 24), stamp("_w_metal", 96, 24),
  stamp("_bed", 0, 72), stamp("_table", 48, 72), stamp("_shelf", 96, 72), stamp("_sofa", 144, 72), stamp("_stove", 192, 72), stamp("_tank", 240, 72),
  stamp("_rug", 0, 128), stamp("_lamp", 72, 128), stamp("_plant", 96, 128), stamp("_crystal", 120, 128), stamp("_chest", 144, 128),
  stamp("_stool", 168, 128), stamp("_cushion", 192, 128), stamp("_window", 216, 128), stamp("_painting", 240, 128), stamp("_garland", 264, 128),
  stamp("_mat", 0, 176))
