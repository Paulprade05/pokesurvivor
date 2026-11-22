// Sello «Build» (21-11-2026, sesión builds-plan): marca lo que es de la build que has planeado (cartas de nivel,
// vínculo, objetos del suelo y la pausa). Un marcapáginas turquesa (la «luz de seta» de la interfaz, --c-blue; el dorado ya
// es de las evoluciones) con una estrella, como los iconos de objetos
// (30×30, contorno oscuro de 1 px de los objetos de la Mochila, luz arriba a la izquierda, tres tonos y un brillo).
// Lo construye tools/pxl/build.cjs → assets/pxl/build.png (js/ui/icons.js PXL).
pal({ k: "#10201c", o: "#17695a", y: "#36c2a6", Y: "#7ff0dc", w: "#f2fffb" })
ramps("oyYw")

sprite("build", { w: 28, h: 28, outline: "k" }, (c) => {
  // La cinta: de arriba abajo, con la muesca en V al pie.
  c.poly([7, 1, 21, 1, 21, 26, 14, 20, 7, 26], "y")
  c.vline(19, 2, 22, "o"); c.vline(20, 1, 24, "o")
  c.vline(8, 2, 21, "Y"); c.vline(7, 1, 24, "Y")
  // El doblez de arriba, en sombra.
  c.hline(7, 1, 14, "o"); c.hline(7, 2, 14, "o"); c.hline(8, 3, 12, "y")
  // La estrella del centro.
  const star = [
    "...w...",
    "...w...",
    "..www..",
    "wwwwwww",
    ".wwwww.",
    "..www..",
    ".ww.ww.",
    ".w...w."
  ]
  // (Con su sombra un píxel abajo a la derecha, para que se lea sobre el dorado.)
  star.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "w") c.px(11 + i, 8 + j, "o") }))
  star.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "w") c.px(10 + i, 7 + j, "w") }))
  c.px(13, 10, "Y"); c.px(14, 11, "Y")
  // Brillo.
  c.px(9, 4, "w"); c.px(9, 5, "w")
})
