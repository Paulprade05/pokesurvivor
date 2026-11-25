// (1.0, bloque E) Encuentros del mapa que no son Pokémon: el templo de vitaminas y el santuario de reto.
// Lo que está de pie: contorno oscuro de 1 px, luz arriba a la izquierda, tres tonos planos y un brillo (docs/ESTILO-ARTE.md).
// Se dibujan a 1 px de arte = 2 unidades de mundo (systems/encounters.js drawOne). Lo construye tools/pxl/build.cjs
// → assets/pxl/temple.png y assets/pxl/shrine.png.
pal({ k: "#1a1420",
      a: "#3e3a48", s: "#68627a", S: "#948ea6", W: "#c4bfd2",   // piedra
      g: "#1f5a4a", G: "#2f8a6a", H: "#5cc89a",                // tejado (el verde de seta de la interfaz)
      p: "#c8406e", P: "#ff8ab4", Q: "#ffd0e2", w: "#ffffff",  // la vitamina
      o: "#d8400c", O: "#ffa020", Y: "#fff0a0",                // la llama
      r: "#8e2418", R: "#d84a34" })                            // la cuerda
ramps("asSW", "gGH", "pPQw", "oOY", "rR")

const rect = (c, x, y, w, h, col) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.px(x + i, y + j, col) }

// Templo de vitaminas: un tejado de pagoda sobre dos columnas y, dentro, el frasco de vitamina que flota sobre el altar.
sprite("temple", { w: 28, h: 32, outline: "k" }, (c) => {
  // Tejado (de arriba abajo, cada fila más ancha; las puntas, hacia arriba).
  c.px(13, 1, "P"); c.px(14, 1, "p")
  rect(c, 12, 2, 4, 1, "G"); rect(c, 10, 3, 8, 1, "G"); rect(c, 7, 4, 14, 1, "G"); rect(c, 4, 5, 20, 1, "G"); rect(c, 2, 6, 24, 1, "G")
  rect(c, 1, 7, 26, 1, "g"); c.px(1, 6, "G"); c.px(26, 6, "g")
  // Luz del tejado: el borde de arriba a la izquierda.
  c.px(12, 2, "H"); c.px(10, 3, "H"); c.px(11, 3, "H"); c.px(7, 4, "H"); c.px(8, 4, "H"); c.px(4, 5, "H"); c.px(5, 5, "H"); c.px(2, 6, "H"); c.px(3, 6, "H")
  rect(c, 18, 4, 3, 1, "g"); rect(c, 20, 5, 4, 1, "g"); rect(c, 22, 6, 3, 1, "g")
  // Viga.
  rect(c, 3, 8, 22, 1, "S"); c.px(3, 8, "W"); c.px(4, 8, "W"); rect(c, 3, 9, 22, 1, "s")
  // Dentro, en penumbra.
  rect(c, 7, 10, 14, 16, "a")
  // Columnas.
  for (const [x, l, m, d] of [[4, "W", "S", "s"], [21, "S", "s", "a"]]) { rect(c, x, 10, 1, 16, l); rect(c, x + 1, 10, 1, 16, m); rect(c, x + 2, 10, 1, 16, d) }
  // Altar.
  rect(c, 10, 20, 8, 1, "W"); rect(c, 10, 21, 8, 5, "S"); rect(c, 16, 21, 2, 5, "s"); c.px(10, 21, "W")
  // El frasco de vitamina, con su brillo y un halo de dos píxeles.
  rect(c, 13, 12, 2, 2, "W"); c.px(13, 12, "w")
  rect(c, 12, 14, 4, 5, "P"); rect(c, 12, 14, 1, 5, "Q"); rect(c, 15, 14, 1, 5, "p"); c.px(12, 15, "w")
  c.px(10, 16, "p"); c.px(17, 16, "p"); c.px(13, 10, "p")
  // Escalones.
  rect(c, 2, 26, 24, 1, "S"); rect(c, 2, 26, 6, 1, "W"); rect(c, 2, 27, 24, 1, "s")
  rect(c, 1, 28, 26, 1, "S"); rect(c, 1, 28, 5, 1, "W"); rect(c, 1, 29, 26, 1, "s"); rect(c, 1, 30, 26, 1, "a")
})

// Santuario de reto: una linterna de piedra con su llama encendida y la cuerda roja de los retos.
sprite("shrine", { w: 24, h: 35, outline: "k" }, (c) => {
  // Llama.
  c.px(12, 1, "O"); rect(c, 11, 2, 2, 1, "O"); rect(c, 10, 3, 4, 1, "O")
  for (const y of [4, 5]) { rect(c, 9, y, 6, 1, "o"); rect(c, 10, y, 4, 1, "O"); rect(c, 11, y, 2, 1, "Y") }
  for (const y of [6, 7]) { rect(c, 8, y, 8, 1, "o"); rect(c, 9, y, 6, 1, "O"); rect(c, 10, y, 4, 1, "Y") }
  rect(c, 9, 8, 6, 1, "o"); rect(c, 10, 8, 4, 1, "O")
  // Cuenco.
  rect(c, 5, 9, 14, 1, "S"); rect(c, 5, 9, 4, 1, "W"); rect(c, 6, 10, 12, 1, "s"); rect(c, 8, 11, 8, 1, "a")
  // Pilar.
  rect(c, 8, 12, 1, 17, "W"); rect(c, 9, 12, 4, 17, "S"); rect(c, 13, 12, 2, 17, "s"); rect(c, 15, 12, 1, 17, "a")
  // Cuerda con sus borlas.
  rect(c, 7, 13, 10, 1, "R"); rect(c, 7, 14, 10, 1, "r")
  for (const x of [8, 15]) rect(c, x, 15, 1, 3, "r")
  c.px(8, 15, "R")
  // Emblema: un círculo de brasa.
  rect(c, 10, 19, 4, 4, "o"); rect(c, 11, 20, 2, 2, "O"); c.px(11, 20, "Y")
  for (const [x, y] of [[10, 19], [13, 19], [10, 22], [13, 22]]) c.px(x, y, "S")
  // Base.
  rect(c, 6, 29, 12, 1, "S"); rect(c, 6, 29, 3, 1, "W"); rect(c, 6, 30, 12, 1, "s")
  rect(c, 4, 31, 16, 1, "S"); rect(c, 4, 31, 4, 1, "W"); rect(c, 4, 32, 16, 1, "s"); rect(c, 4, 33, 16, 1, "a")
})
