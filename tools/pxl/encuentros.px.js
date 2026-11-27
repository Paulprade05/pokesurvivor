// (1.0, bloque E) Encuentros del mapa que no son Pokémon: el templo de vitaminas y el santuario de reto.
// (Templos 3D, 27-11-2026, el dueño: «los templos y santuarios quiero que sean en 3d y abarquen una zona más grande») Más
// grandes y con volumen, vistos desde arriba y delante como el resto del mundo: se ve la cara de delante, lo de arriba de
// cada piso (más claro) y el lado de la derecha en sombra. Son lo que se ve en móvil (y en PC sin el 3D): en PC con calidad
// Alta van en 3D de verdad (world/props3d.js). Y las piedras con runa que marcan el borde de su zona (zst_*).
// Lo que está de pie: contorno oscuro de 1 px, luz arriba a la izquierda, tres tonos planos y un brillo (docs/ESTILO-ARTE.md).
// Se dibujan a 1 px de arte = 2 unidades de mundo (systems/encounters.js drawOne). Lo construye tools/pxl/build.cjs
// → assets/pxl/temple.png, shrine.png y zst_t.png, zst_c.png, zst_k.png, zst_u.png.
pal({ k: "#1a1420",
      a: "#3e3a48", s: "#68627a", S: "#948ea6", W: "#c4bfd2",   // piedra
      g: "#1f5a4a", G: "#2f8a6a", H: "#5cc89a",                // tejado (el verde de seta de la interfaz)
      p: "#c8406e", P: "#ff8ab4", Q: "#ffd0e2", w: "#ffffff",  // la vitamina
      o: "#d8400c", O: "#ffa020", Y: "#fff0a0",                // la llama (y la runa dorada del templo)
      r: "#8e2418", R: "#d84a34",                              // la cuerda (y la runa roja del reto)
      v: "#5a1e8c", V: "#9a4ae0", L: "#d8a8ff",                // la runa morada del santuario maldito
      d: "#2a2632" })                                          // lo más hondo (dentro del templo)
ramps("dasSW", "gGH", "pPQw", "oOY", "rR", "vVL")

const rect = (c, x, y, w, h, col) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.px(x + i, y + j, col) }
/** Un bloque de piedra visto desde arriba y delante: arriba (claro, d filas), delante (h filas) y el lado derecho en sombra. */
const block = (c, x, y, w, d, h) => {
  rect(c, x, y, w, d, "S"); rect(c, x, y, Math.max(2, w >> 2), d, "W"); rect(c, x + w - 2, y, 2, d, "s")
  rect(c, x, y + d, w, h, "s"); rect(c, x, y + d, 1, h, "S"); rect(c, x + w - 2, y + d, 2, h, "a")
  rect(c, x, y + d + h - 1, w, 1, "a")
}
/** Un piso de tejado: de w0 (arriba) a w1 (alero), el alero con las puntas levantadas. */
const roof = (c, cx, y, w0, w1, rows) => {
  for (let j = 0; j < rows; j++) {
    const w = Math.round(w0 + (w1 - w0) * j / (rows - 1)), x = cx - (w >> 1)
    rect(c, x, y + j, w, 1, "G")
    rect(c, x, y + j, Math.max(1, w >> 2), 1, "H")               // la luz, a la izquierda
    rect(c, x + w - Math.max(1, w >> 3), y + j, Math.max(1, w >> 3), 1, "g")
  }
  const w = w1 + 2, x = cx - (w >> 1)
  rect(c, x, y + rows, w, 1, "g"); rect(c, x + 1, y + rows + 1, w - 2, 1, "d")
  c.px(x, y + rows - 1, "H"); c.px(x - 1, y + rows - 2, "H"); c.px(x + w - 1, y + rows - 1, "g"); c.px(x + w, y + rows - 2, "G")
}

// Templo de vitaminas: pagoda de dos pisos sobre cuatro columnas, en una plataforma con escalones; dentro, el frasco de
// vitamina que flota sobre el altar y brilla.
sprite("temple", { w: 54, h: 68, outline: "k" }, (c) => {
  // Remate: la bola rosa y su vástago.
  rect(c, 26, 0, 2, 2, "P"); c.px(26, 0, "Q"); rect(c, 26, 2, 2, 3, "S"); c.px(26, 2, "W")
  roof(c, 27, 5, 10, 28, 7)                                       // piso de arriba
  // Muro del piso de arriba, con su ventana que brilla.
  rect(c, 18, 14, 18, 3, "S"); rect(c, 18, 14, 4, 3, "W"); rect(c, 33, 14, 3, 3, "s"); rect(c, 25, 14, 4, 2, "P"); c.px(25, 14, "Q")
  roof(c, 27, 17, 30, 50, 8)                                      // piso de abajo
  // Viga.
  rect(c, 5, 27, 44, 2, "S"); rect(c, 5, 27, 10, 1, "W"); rect(c, 5, 29, 44, 1, "s"); rect(c, 46, 27, 3, 3, "a")
  // Dentro, en penumbra; al fondo, las dos columnas de detrás.
  rect(c, 10, 30, 34, 21, "d"); rect(c, 10, 30, 34, 3, "a")
  for (const x of [14, 38]) { rect(c, x, 30, 2, 21, "a"); c.px(x, 30, "s") }
  // Columnas de delante (tres tonos y el pie).
  for (const [x, l, m, n] of [[5, "W", "S", "s"], [44, "S", "s", "a"]]) {
    rect(c, x, 30, 2, 21, l); rect(c, x + 2, 30, 2, 21, m); rect(c, x + 4, 30, 1, 21, n)
    rect(c, x - 1, 49, 7, 2, "S"); rect(c, x - 1, 49, 2, 1, "W")
  }
  // Altar: arriba, delante y su sombra.
  rect(c, 20, 41, 14, 2, "W"); rect(c, 20, 41, 3, 2, "w"); rect(c, 20, 43, 14, 7, "S"); rect(c, 31, 43, 3, 7, "s"); rect(c, 20, 50, 14, 1, "a")
  // El frasco de vitamina, flotando, con su brillo y un halo.
  rect(c, 25, 31, 4, 2, "W"); c.px(25, 31, "w")
  rect(c, 24, 33, 6, 6, "P"); rect(c, 24, 33, 1, 6, "Q"); rect(c, 28, 33, 2, 6, "p"); c.px(25, 34, "w"); rect(c, 25, 39, 4, 1, "p")
  for (const [x, y] of [[22, 35], [31, 35], [27, 30], [21, 38], [32, 32]]) c.px(x, y, "p")
  // Plataforma: arriba (se ve la losa) y delante.
  block(c, 1, 51, 52, 4, 5)
  for (const x of [9, 19, 29, 39]) c.px(x, 53, "s")               // juntas de las losas
  // Escalones, cada uno más bajo y más ancho.
  for (const [x, y, w] of [[18, 58, 18], [16, 61, 22], [14, 64, 26]]) block(c, x, y, w, 1, 2)
})

// Santuario de reto: una linterna de piedra alta (base, columna con la cuerda roja de los retos, caja del fuego con su
// llama y el sombrero de piedra).
sprite("shrine", { w: 34, h: 62, outline: "k" }, (c) => {
  // Llama, encima del sombrero.
  c.px(17, 0, "O"); rect(c, 16, 1, 2, 1, "O"); rect(c, 15, 2, 4, 1, "O"); rect(c, 15, 3, 4, 1, "o"); rect(c, 16, 3, 2, 1, "Y")
  // Sombrero: arriba en pendiente, alero y punta.
  rect(c, 16, 4, 2, 1, "W")
  for (let j = 0; j < 6; j++) { const w = 8 + j * 4, x = 17 - (w >> 1); rect(c, x, 5 + j, w, 1, "S"); rect(c, x, 5 + j, Math.max(1, w >> 2), 1, "W"); rect(c, x + w - 2, 5 + j, 2, 1, "s") }
  rect(c, 2, 11, 30, 1, "s"); rect(c, 3, 12, 28, 1, "a"); c.px(1, 10, "W"); c.px(32, 10, "s")
  // Caja del fuego: ventanas con la llama dentro.
  rect(c, 8, 13, 18, 11, "S"); rect(c, 8, 13, 3, 11, "W"); rect(c, 23, 13, 3, 11, "s")
  rect(c, 12, 15, 10, 7, "o"); rect(c, 13, 16, 8, 5, "O"); rect(c, 15, 17, 4, 3, "Y"); rect(c, 16, 15, 2, 7, "S")
  rect(c, 8, 24, 18, 1, "a")
  // Piso del medio.
  block(c, 6, 25, 22, 2, 2)
  // Columna, con la cuerda y sus borlas, y el emblema de brasa.
  rect(c, 12, 30, 2, 18, "W"); rect(c, 14, 30, 6, 18, "S"); rect(c, 20, 30, 2, 18, "s"); rect(c, 21, 30, 1, 18, "a")
  rect(c, 10, 32, 14, 1, "R"); rect(c, 10, 33, 14, 1, "r")
  for (const x of [11, 22]) { rect(c, x, 34, 1, 4, "r"); c.px(x, 34, "R") }
  rect(c, 15, 38, 4, 4, "o"); rect(c, 16, 39, 2, 2, "O"); c.px(16, 39, "Y")
  // Base de dos pisos.
  block(c, 7, 48, 20, 2, 3)
  block(c, 3, 53, 28, 3, 4)
  for (const x of [11, 19, 26]) c.px(x, 55, "s")
})

/** Piedra del borde de la zona: un menhir con su runa (q claro, Q brillo) y la losa de arriba a la luz. */
const stone = (name, q, Q) => sprite(name, { w: 12, h: 20, outline: "k" }, (c) => {
  rect(c, 3, 0, 4, 1, "W"); rect(c, 2, 1, 7, 1, "S"); rect(c, 2, 1, 3, 1, "W"); rect(c, 2, 2, 8, 1, "S"); rect(c, 2, 2, 2, 1, "W")   // arriba, en punta
  rect(c, 2, 3, 8, 13, "S"); rect(c, 2, 3, 2, 13, "W"); rect(c, 8, 3, 2, 13, "s"); rect(c, 9, 3, 1, 13, "a")
  // La runa: un rombo con su brillo y una raya debajo.
  rect(c, 5, 5, 2, 1, q); rect(c, 4, 6, 4, 1, q); rect(c, 4, 7, 4, 1, q); rect(c, 5, 7, 2, 1, Q); rect(c, 4, 8, 4, 1, q); rect(c, 5, 9, 2, 1, q)
  rect(c, 4, 11, 4, 1, q)
  // Pie hundido en el suelo y la piedra suelta de al lado.
  rect(c, 1, 16, 10, 2, "s"); rect(c, 1, 16, 3, 1, "S"); rect(c, 1, 18, 10, 1, "a"); rect(c, 0, 17, 1, 2, "a")
  rect(c, 9, 18, 3, 2, "s"); c.px(9, 18, "S")
})
stone("zst_t", "O", "Y")      // templo: dorada
stone("zst_c", "R", "O")      // reto: roja
stone("zst_k", "V", "L")      // maldito: morada
stone("zst_u", "a", "s")      // apagada (ya usado)
