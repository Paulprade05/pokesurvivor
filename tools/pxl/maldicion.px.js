// (1.0, bloque F) Santuario maldito: una estela de piedra oscura y agrietada con una llama fantasma morada encima y dos
// etiquetas de papel (Hechizo) colgando de su cuerda. Mismas reglas que encuentros.px.js (docs/ESTILO-ARTE.md): contorno
// oscuro de 1 px, luz arriba a la izquierda, tres tonos planos y un brillo. Se dibuja a 1 px de arte = 2 unidades de mundo
// (systems/encounters.js drawOne). Lo construye tools/pxl/build.cjs → assets/pxl/curse.png.
pal({ k: "#160f1e",
      a: "#2c2636", s: "#4a4258", S: "#6c6280", W: "#948aa8",   // piedra, más oscura que la del reto
      v: "#5a1e8c", V: "#9a4ae0", L: "#d8a8ff", w: "#ffffff",  // la llama fantasma
      p: "#c8bfa0", P: "#f0e8cc",                              // el papel de las etiquetas
      r: "#8e2418", R: "#d84a34" })                            // la cuerda y el sello
ramps("asSW", "vVLw", "pP", "rR")

const rect = (c, x, y, w, h, col) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.px(x + i, y + j, col) }

sprite("curse", { w: 24, h: 35, outline: "k" }, (c) => {
  // Llama fantasma: dos lenguas que se separan arriba.
  c.px(10, 1, "V"); c.px(14, 2, "V")
  rect(c, 10, 2, 2, 1, "V"); rect(c, 13, 3, 2, 1, "V")
  for (const y of [3, 4]) { rect(c, 9, y, 5, 1, "v"); rect(c, 10, y, 3, 1, "V"); c.px(11, y, "L") }
  for (const y of [5, 6, 7]) { rect(c, 8, y, 8, 1, "v"); rect(c, 9, y, 6, 1, "V"); rect(c, 10, y, 4, 1, "L") }
  c.px(11, 6, "w")
  rect(c, 9, 8, 6, 1, "v"); rect(c, 10, 8, 4, 1, "V")
  // Remate de la estela.
  rect(c, 7, 9, 10, 1, "S"); rect(c, 7, 9, 3, 1, "W"); rect(c, 6, 10, 12, 1, "s"); c.px(6, 10, "S")
  // Estela: piedra con la cara iluminada a la izquierda.
  rect(c, 7, 11, 1, 18, "W"); rect(c, 8, 11, 6, 18, "S"); rect(c, 14, 11, 2, 18, "s"); rect(c, 16, 11, 1, 18, "a")
  // Grieta.
  for (const [x, y] of [[12, 12], [11, 13], [11, 14], [12, 15], [12, 16], [13, 17], [12, 18]]) c.px(x, y, "a")
  // Ojo grabado que brilla morado.
  rect(c, 9, 21, 6, 3, "a"); rect(c, 10, 22, 4, 1, "V"); c.px(11, 22, "L"); c.px(9, 21, "s"); c.px(14, 21, "s"); c.px(9, 23, "s"); c.px(14, 23, "s")
  // Cuerda y dos etiquetas de papel con su sello.
  rect(c, 6, 12, 12, 1, "R"); rect(c, 6, 13, 12, 1, "r")
  for (const x of [5, 17]) { rect(c, x, 14, 2, 5, "P"); c.px(x + 1, 14, "p"); c.px(x + 1, 18, "p"); c.px(x, 16, "R"); c.px(x + 1, 16, "r") }
  // Base.
  rect(c, 5, 29, 14, 1, "S"); rect(c, 5, 29, 3, 1, "W"); rect(c, 5, 30, 14, 1, "s")
  rect(c, 3, 31, 18, 1, "S"); rect(c, 3, 31, 4, 1, "W"); rect(c, 3, 32, 18, 1, "s"); rect(c, 3, 33, 18, 1, "a")
})
