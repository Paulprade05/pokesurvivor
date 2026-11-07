// Las 8 muestras aprobadas el 07-11-2026: llevan su paleta propia.
pal({
  k:"#1b1528", w:"#ffffff",
  // normal
  n:"#f1ebdd", N:"#cfc6b4", m:"#8f8574",
  // impacto
  y:"#ffe14d", Y:"#ff9a1c", r:"#ff5f6d",
  // siniestro
  d:"#7d6c60", D:"#3e342e", e:"#b4a294", E:"#241e1a", R:"#a82838",
  // fantasma / lengua
  v:"#b8acf0", V:"#7a6bc4", U:"#463a86", u:"#2a2050", p:"#ff8ad8", P:"#d04aa0", q:"#ffc8ee",
  // lucha
  s:"#ffd2a0", S:"#d8905c", T:"#7a3a1a", t:"#e0533d", z:"#9a2a1d",
  // volador
  b:"#9bb8ff", B:"#5a74c4", c:"#dce8ff", C:"#3a4f9a",
  // bicho
  g:"#d8ef8a", G:"#a3c43d", h:"#64801a", H:"#3a5a10",
  // eléctrico
  l:"#fff3a0", L:"#ffd33d", o:"#ff9a1c", O:"#c49a10",
  // madera
  a:"#c89858", A:"#8a6236", i:"#ecc488",
})

// Placaje: un cuerpo que embiste y revienta contra el golpe
sprite("tackle", { w: 28, h: 28, outline: "k" },
  rect(0, 6, 7, 2, "N"), rect(0, 6, 4, 2, "n"),
  rect(0, 13, 4, 2, "N"), rect(0, 13, 2, 2, "n"),
  rect(0, 20, 7, 2, "N"), rect(0, 20, 4, 2, "n"),
  poly([28,14, 22,11, 26,3, 18,8, 15,1, 13,9, 8,14, 13,19, 15,27, 18,20, 26,25, 22,17], "o"),
  poly([25,14, 20,12, 23,6, 17,10, 15,5, 14,11, 11,14, 14,17, 15,23, 17,18, 23,22, 20,16], "y"),
  poly([21,14, 18,13, 17,10, 15,13, 16,18, 18,15], "w"),
  circ(10, 14, 7, "n"),
  clip((x,y)=> (x-10)+(y-14) > 5, circ(10, 14, 7, "N")),
  clip((x,y)=> (x-10)+(y-14) > 9, circ(10, 14, 7, "m")),
  rect(6, 9, 4, 2, "w"), rect(5, 10, 2, 3, "w"),
)

// Mordisco: fauces con colmillos cruzados
sprite("bite", { w: 28, h: 28, outline: "k", mx: true },
  // boca
  ellipse(14, 14, 13, 13, "d"),
  poly([0,0, 14,0, 14,1, 6,2, 2,6, 0,10], "_"),
  poly([0,28, 14,28, 14,27, 6,26, 2,22, 0,18], "_"),
  ellipse(14, 2, 8, 1, "e"),
  ellipse(14, 14, 12, 9, "E"),
  // encías
  poly([2,10, 7,6, 14,5, 14,8, 8,9, 4,12], "R"),
  poly([2,18, 7,22, 14,23, 14,20, 8,19, 4,16], "R"),
  // colmillos arriba
  poly([3,10, 8,8, 7,18], "w"), poly([3,10, 5,9, 7,16], "N"),
  poly([10,7, 13,7, 12,12], "w"),
  // colmillos abajo
  poly([8,20, 12,21, 10,12], "w"), poly([8,20, 10,20, 10,14], "N"),
  poly([13,21, 14,21, 14,16], "n"),
)

// Lengüetazo: cara de fantasma con la lengua fuera
sprite("lick", { w: 28, h: 28, outline: "k" },
  circ(12, 11, 11, "V"),
  clip((x,y)=> (x-12)*-1+(y-11)*-1 > 6, circ(12, 11, 11, "v")),
  clip((x,y)=> (x-12)+(y-11) > 9, circ(12, 11, 11, "U")),
  // ojos
  poly([5,5, 10,8, 10,10, 6,10], "k"), poly([19,5, 14,8, 14,10, 18,10], "k"),
  px(7, 8, "r"), px(16, 8, "r"),
  // boca
  poly([4,12, 20,12, 18,17, 6,17], "u"),
  // lengua
  line(12, 15, 15, 21, "P", 10),
  line(15, 21, 23, 24, "P", 8),
  line(12, 15, 15, 20, "p", 8),
  line(15, 20, 22, 23, "p", 6),
  line(13, 16, 16, 21, "P", 1),
  line(16, 21, 21, 23, "P", 1),
  rect(9, 15, 2, 4, "q"), rect(19, 21, 3, 1, "q"),
  // baba
  rect(4, 19, 2, 3, "q"), rect(4, 24, 2, 2, "q"),
)

// Golpe Kárate: canto de la mano partiendo una tabla
sprite("karate-chop", { w: 28, h: 28, outline: "k" },
  // estelas
  rect(3, 1, 2, 7, "c"), rect(0, 5, 2, 7, "b"), rect(24, 1, 2, 7, "c"), rect(27, 5, 1, 7, "b"),
  // muñequera
  rect(8, 0, 12, 4, "t"), rect(8, 0, 3, 4, "z"), rect(15, 0, 5, 1, "r"),
  // mano: cuatro dedos juntos
  rect(8, 4, 12, 7, "s"), rect(8, 4, 3, 7, "S"),
  rect(8, 11, 3, 8, "S"), rect(11, 11, 3, 10, "s"), rect(14, 11, 3, 10, "s"), rect(17, 11, 3, 8, "s"),
  vline(11, 11, 8, "T"), vline(14, 11, 10, "T"), vline(17, 11, 8, "T"),
  // pulgar
  poly([8,5, 4,8, 4,12, 7,12, 8,10], "s"), rect(4, 11, 3, 1, "S"),
  // tabla partida
  poly([0,21, 10,24, 11,28, 0,26], "a"), poly([0,21, 10,24, 10,25, 0,22], "i"), poly([0,25, 11,27, 11,28, 0,26], "A"),
  poly([28,21, 18,24, 17,28, 28,26], "a"), poly([28,21, 18,24, 18,25, 28,22], "i"), poly([28,25, 17,27, 17,28, 28,26], "A"),
  px(14, 25, "y"), px(13, 26, "w"), px(15, 26, "w"), px(14, 27, "y"),
)

// Ataque Ala: ala con plumas que barre
sprite("wing-attack", { w: 28, h: 28, outline: "k" }, (c) => {
  const base = [23, 5]
  const tips = [[1, 8], [2, 15], [6, 21], [12, 26], [18, 27]]
  tips.forEach((t, i) => {
    const b = [base[0] - 2 + i, base[1] + 1 + i]
    c.line(b[0], b[1], t[0], t[1], "C", 5)
    c.line(b[0], b[1], t[0], t[1], i % 2 ? "b" : "c", 3)
  })
  // plumas cortas de arriba
  c.line(23, 3, 7, 5, "c", 5)
  c.line(23, 5, 9, 11, "b", 5)
  c.line(24, 3, 8, 4, "w", 2)
  c.line(23, 6, 12, 10, "B", 1)
  // hombro
  c.circ(23, 5, 4, "c")
  c.rect(21, 2, 3, 2, "w")
})

// Zumbido: insecto vibrando con ondas
sprite("bug-buzz", { w: 28, h: 28, outline: "k", mx: true },
  clip((x,y)=> x<6, ring(14, 14, 14, "g"), ring(14, 14, 13, "g"), ring(14, 14, 10, "G"), ring(14, 14, 9, "G")),
  poly([14,9, 5,5, 7,18, 14,17], "c"),
  poly([7,8, 9,8, 10,14, 8,14], "b"),
  ellipse(14, 16, 5, 9, "h"),
  ellipse(14, 15, 3, 7, "G"),
  rect(9, 16, 10, 1, "H"), rect(9, 20, 10, 1, "H"),
  circ(14, 7, 4, "h"),
  rect(10, 6, 3, 3, "r"), px(11, 6, "w"),
  line(12, 3, 9, 0, "H", 1),
)

// Vozarrón: boca gritando con ondas a los lados
sprite("hyper-voice", { w: 28, h: 28, outline: "k", mx: true },
  clip((x,y)=> x<7 && y>6 && y<22, ring(14, 14, 11, "w"), ring(14, 14, 10, "w")),
  clip((x,y)=> x<3 && y>8 && y<20, ring(14, 14, 14, "N"), ring(14, 14, 13, "N")),
  poly([7,7, 21,7, 21,12, 18,20, 10,20, 7,12], "n"),
  poly([9,9, 19,9, 19,12, 17,18, 11,18, 9,12], "R"),
  poly([11,15, 17,15, 16,18, 12,18], "r"),
  rect(9, 9, 10, 3, "w"),
  vline(11, 9, 3, "N"), vline(13, 9, 3, "N"),
)

// Onda Trueno: anillo eléctrico que paraliza
sprite("thunder-wave", { w: 28, h: 28, outline: "k" }, (c) => {
  const pts = []
  const n = 16
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2
    const r = i % 2 ? 13.5 : 9.5
    pts.push([13.5 + Math.cos(a) * r, 13.5 + Math.sin(a) * r])
  }
  for (let i = 0; i < n; i++) c.line(Math.round(pts[i][0]), Math.round(pts[i][1]), Math.round(pts[i+1][0]), Math.round(pts[i+1][1]), "L", 2)
  for (let i = 0; i < n; i++) c.line(Math.round(pts[i][0]), Math.round(pts[i][1]), Math.round(pts[i+1][0]), Math.round(pts[i+1][1]), "l", 1)
  c.poly([16,6, 9,15, 13,15, 11,22, 19,12, 15,12], "o")
  c.poly([15,7, 10,14, 13,14, 12,20, 18,12, 14,12], "L")
  c.poly([14,9, 11,14, 13,14, 14,12], "w")
})
