// (1.0, bloque F) Santuario maldito: una estela de piedra oscura y agrietada con una llama fantasma morada encima y dos
// etiquetas de papel (Hechizo) colgando de su cuerda. Mismas reglas que encuentros.px.js (docs/ESTILO-ARTE.md): contorno
// oscuro de 1 px, luz arriba a la izquierda, tres tonos planos y un brillo. Se dibuja a 1 px de arte = 2 unidades de mundo
// (systems/encounters.js drawOne). Lo construye tools/pxl/build.cjs → assets/pxl/curse.png.
// (Templos 3D, 27-11-2026) Más grande y con volumen (arriba de cada piedra a la luz y el lado derecho en sombra), sobre una
// base de dos pisos con dos piedras rotas al lado. En PC con calidad Alta va en 3D de verdad (world/props3d.js).
pal({ k: "#160f1e",
      a: "#2c2636", s: "#4a4258", S: "#6c6280", W: "#948aa8",   // piedra, más oscura que la del reto
      v: "#5a1e8c", V: "#9a4ae0", L: "#d8a8ff", w: "#ffffff",  // la llama fantasma
      p: "#c8bfa0", P: "#f0e8cc",                              // el papel de las etiquetas
      r: "#8e2418", R: "#d84a34" })                            // la cuerda y el sello
ramps("asSW", "vVLw", "pP", "rR")

const rect = (c, x, y, w, h, col) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.px(x + i, y + j, col) }
const block = (c, x, y, w, d, h) => {
  rect(c, x, y, w, d, "S"); rect(c, x, y, Math.max(2, w >> 2), d, "W"); rect(c, x + w - 2, y, 2, d, "s")
  rect(c, x, y + d, w, h, "s"); rect(c, x, y + d, 1, h, "S"); rect(c, x + w - 2, y + d, 2, h, "a")
  rect(c, x, y + d + h - 1, w, 1, "a")
}

sprite("curse", { w: 36, h: 62, outline: "k" }, (c) => {
  // Llama fantasma: dos lenguas que se separan arriba.
  c.px(15, 0, "V"); c.px(20, 1, "V")
  rect(c, 15, 1, 2, 1, "V"); rect(c, 19, 2, 2, 1, "V")
  for (const y of [2, 3, 4]) { rect(c, 14, y, 7, 1, "v"); rect(c, 15, y, 5, 1, "V"); rect(c, 16, y, 2, 1, "L") }
  for (const y of [5, 6, 7, 8]) { rect(c, 12, y, 11, 1, "v"); rect(c, 13, y, 9, 1, "V"); rect(c, 15, y, 5, 1, "L") }
  c.px(16, 6, "w"); c.px(17, 6, "w")
  rect(c, 13, 9, 9, 1, "v"); rect(c, 15, 9, 5, 1, "V")
  // Remate de la estela: losa con su cara de arriba.
  block(c, 9, 10, 18, 2, 2)
  // Estela: piedra con la cara iluminada a la izquierda y el lado derecho en sombra.
  rect(c, 11, 14, 2, 30, "W"); rect(c, 13, 14, 9, 30, "S"); rect(c, 22, 14, 2, 30, "s"); rect(c, 24, 14, 1, 30, "a")
  // Grieta.
  for (const [x, y] of [[18, 15], [17, 16], [17, 17], [18, 18], [18, 19], [19, 20], [18, 21], [18, 22], [17, 23]]) c.px(x, y, "a")
  // Ojo grabado que brilla morado.
  rect(c, 14, 30, 8, 5, "a"); rect(c, 15, 31, 6, 3, "v"); rect(c, 16, 31, 4, 3, "V"); rect(c, 17, 32, 2, 1, "L"); c.px(17, 32, "w")
  for (const [x, y] of [[14, 30], [21, 30], [14, 34], [21, 34]]) c.px(x, y, "s")
  // Cuerda y dos etiquetas de papel con su sello.
  rect(c, 9, 17, 18, 1, "R"); rect(c, 9, 18, 18, 1, "r")
  for (const x of [8, 26]) { rect(c, x, 19, 3, 8, "P"); rect(c, x + 2, 19, 1, 8, "p"); c.px(x + 1, 22, "R"); c.px(x + 1, 23, "r"); c.px(x + 1, 25, "R") }
  // Base de dos pisos.
  block(c, 8, 44, 20, 2, 4)
  block(c, 3, 50, 30, 3, 5)
  for (const x of [11, 20, 27]) c.px(x, 52, "s")
  // Piedras rotas al lado.
  block(c, 0, 56, 5, 2, 3); block(c, 31, 57, 5, 1, 3)
})
