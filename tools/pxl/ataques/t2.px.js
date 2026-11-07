// Planta, Eléctrico, Hielo, Psíquico, Veneno.
// ---- Planta ----
icon('razor-leaf', 'grass', c => {          // hojas que vuelan en curva y cortan
  arc(c, 2, 26, 22, -80, -10, 'w', 1)
  leaf(c, 1, 25, 18, 4, 6); leaf(c, 16, 22, 27, 12, 4); leaf(c, 3, 11, 11, 2, 3)
})
icon('leaf-storm', 'grass', c => {          // ciclón de pétalos
  spiral(c, 14, 14, 11, 1.2, 'd', 1, 30)
  leaf(c, 14, 1, 24, 7, 3); leaf(c, 26, 13, 23, 24, 3); leaf(c, 15, 27, 4, 22, 3); leaf(c, 1, 15, 5, 4, 3); leaf(c, 10, 10, 19, 18, 3)
})
icon('giga-drain', 'grass', c => {          // la hierba anudada que hace tropezar
  shadow(c, 14, 25, 13, 2, 'b')
  for (const [x0, x1, t] of [[3, 12, 7], [7, 13, 3], [25, 16, 7], [21, 15, 3]]) { c.line(x0, 25, x1, 13, 'd', 3); c.line(x1, 13, 14, t, 'd', 2); c.line(x0, 24, x1, 13, 'm', 1); c.line(x1, 12, 14, t, 'l', 1) }
  c.ellipse(14, 13, 5, 3, 'a'); c.ellipse(13, 12, 3, 1, 'l')
  c.rect(1, 19, 2, 5, 'm'); c.rect(25, 19, 2, 5, 'm'); c.rect(12, 18, 4, 7, 'd'); c.rect(13, 19, 2, 6, 'm')
})
icon('energy-ball', 'grass', c => {         // se divide en tres
  c.circ(12, 13, 12, 'd'); orb(c, 12, 13, 10, 'm', 'd', 'l', 'w'); c.circ(12, 13, 5, 'l'); c.circ(12, 13, 3, 'w')
  orb(c, 24, 6, 3, 'l', 'm', 'w', 'w'); orb(c, 24, 23, 3, 'l', 'm', 'w', 'w')
})
icon('solar-beam', 'grass', c => {          // sol que carga y suelta el rayo
  c.poly([9, 13, 28, 19, 28, 28, 15, 28], 'y'); c.poly([11, 14, 28, 23, 28, 27, 18, 27], 'w')
  for (let a = 0; a < 360; a += 45) { const [x, y] = pol(10, 10, 9, a), [u, v] = pol(10, 10, 13, a); c.line(x, y, u, v, 'o', 2) }
  orb(c, 10, 10, 7, 'y', 'o', 'w', 'w')
  leaf(c, 3, 27, 13, 22, 3)
})
icon('bullet-seed', 'grass', c => {         // ametralladora de semillas
  for (const [x, y, r] of [[21, 7, 5], [10, 14, 4], [22, 21, 4]]) {
    c.line(x - r - 8, y, x - r, y, 'l', 1)
    c.ellipse(x, y, r + 1, r - 1, 'a'); c.ellipse(x - 1, y - 1, r - 1, r - 3, 'l'); c.px(x + r + 1, y, 'b'); c.line(x + 2, y + r - 1, x + r - 1, y + r - 2, 'b', 1)
  }
  c.rect(2, 4, 3, 1, 'l'); c.rect(1, 24, 4, 1, 'l')
})
icon('spiky-shield', 'grass', c => {        // escudo de pinchos
  for (let a = 0; a < 360; a += 45) { const [x, y] = pol(14, 13, 15, a), [u, v] = pol(14, 13, 7, a + 22), [p, q] = pol(14, 13, 7, a - 22); c.poly([x, y, u, v, p, q], 'a') }
  c.poly([5, 5, 23, 5, 23, 15, 14, 24, 5, 15], 'd'); c.poly([7, 7, 21, 7, 21, 14, 14, 21, 7, 14], 'm'); c.poly([7, 7, 14, 7, 14, 21, 7, 14], 'l')
  c.line(14, 8, 14, 20, 'b', 1)
})
// ---- Eléctrico ----
icon('thunder-shock', 'electric', c => {    // chispa en zigzag con arcos
  c.line(0, 24, 8, 16, 'd', 3); c.line(8, 16, 7, 10, 'd', 3); c.line(7, 10, 17, 11, 'd', 3); c.line(17, 11, 14, 5, 'd', 3); c.line(14, 5, 27, 1, 'd', 3)
  c.line(0, 24, 8, 16, 'm', 2); c.line(8, 16, 7, 10, 'm', 2); c.line(7, 10, 17, 11, 'm', 2); c.line(17, 11, 14, 5, 'm', 2); c.line(14, 5, 27, 1, 'w', 2)
  c.line(17, 11, 26, 16, 'l', 1); c.line(26, 16, 23, 23, 'l', 1); c.line(8, 16, 13, 22, 'l', 1); c.line(13, 22, 11, 27, 'l', 1)
})
icon('discharge', 'electric', c => {        // te cargas y lo sueltas de golpe
  for (let a = 22; a < 360; a += 45) {
    const [x, y] = pol(14, 14, 8, a), [u, v] = pol(14, 14, 12, a + 14), [p, q] = pol(14, 14, 15, a - 8)
    c.line(x, y, u, v, 'b', 2); c.line(u, v, p, q, 'm', 2)
  }
  orb(c, 14, 14, 7, 'm', 'd', 'l', 'w'); bolt(c, 14, 14, 6, 'k', 'k')
})
icon('thunderbolt', 'electric', c => {      // rayo enorme de la nube
  c.ellipse(9, 5, 7, 4, 's'); c.ellipse(18, 5, 8, 5, 's'); c.ellipse(14, 3, 6, 3, 'g'); c.rect(4, 3, 3, 1, 'g')
  c.poly([18, 6, 8, 15, 13, 15, 7, 27, 21, 12, 15, 12, 20, 6], 'b')
  c.poly([17, 7, 10, 14, 14, 14, 10, 23, 19, 13, 13, 13, 17, 8], 'm')
  c.poly([16, 8, 12, 13, 14, 13, 16, 9], 'w')
})
icon('electro-ball', 'electric', c => {     // bola eléctrica
  orb(c, 14, 14, 11, 'b', 'd', 'm', 'w'); c.circ(14, 14, 7, 'm'); c.circ(13, 13, 4, 'l'); c.rect(11, 11, 2, 2, 'w')
  c.line(1, 4, 5, 8, 'w', 1); c.line(5, 8, 3, 2, 'w', 1)
  c.line(27, 7, 23, 11, 'w', 1); c.line(23, 11, 27, 13, 'w', 1)
  c.line(3, 26, 8, 21, 'w', 1); c.line(21, 22, 25, 27, 'w', 1)
})
icon('charge-beam', 'electric', c => {      // rayo que gira como una aguja de reloj
  arc(c, 8, 20, 19, -60, 5, 'l', 2); c.poly([27, 25, 23, 18, 28, 18], 'l')
  c.line(8, 20, 24, 3, 'd', 7); c.line(8, 20, 24, 3, 'm', 5); c.line(8, 20, 24, 3, 'w', 2)
  orb(c, 8, 20, 7, 'm', 'd', 'l', 'w'); bolt(c, 8, 20, 5, 'b', 'b')
})
icon('aura-wheel', 'electric', c => {       // rueda con dientes y rayo
  for (let a = 0; a < 360; a += 45) { const [x, y] = pol(14, 14, 12, a); c.circ(x, y, 2, 'b') }
  c.circ(14, 14, 11, 'b'); c.circ(14, 14, 9, 'm'); c.circ(14, 14, 6, 'k'); arc(c, 14, 14, 9, 150, 280, 'l', 2)
  bolt(c, 14, 14, 6, 'l', 'w')
})
// ---- Hielo ----
icon('ice-beam', 'ice', c => {              // rayo que congela: acaba en cristales
  c.line(0, 27, 15, 12, 'a', 6); c.line(0, 27, 15, 12, 'm', 4); c.line(0, 27, 15, 12, 'w', 2)
  c.poly([14, 13, 18, 0, 22, 7], 'd'); c.poly([14, 13, 20, 8, 28, 2, 25, 11], 'm'); c.poly([14, 13, 28, 14, 22, 17], 'd')
  c.poly([14, 13, 18, 0, 19, 8], 'l'); c.poly([14, 13, 20, 8, 28, 2, 22, 10], 'l'); c.poly([14, 13, 22, 16, 18, 22], 'l')
  spark(c, 7, 8, 2); spark(c, 22, 23, 2)
})
icon('powder-snow', 'ice', c => {           // copo de nieve
  for (let a = 30; a < 360; a += 60) {
    const [x, y] = pol(14, 14, 13, a), [u, v] = pol(14, 14, 8, a)
    c.line(14, 14, x, y, 'l', 2)
    const [p, q] = pol(u, v, 5, a + 55), [r, s] = pol(u, v, 5, a - 55)
    c.line(u, v, p, q, 'm', 1); c.line(u, v, r, s, 'm', 1)
  }
  c.circ(14, 14, 3, 'w'); c.rect(2, 2, 2, 2, 'l'); c.rect(25, 24, 2, 2, 'l'); c.rect(25, 2, 2, 2, 'w')
})
icon('hail', 'ice', c => {                  // nube de granizo
  c.ellipse(8, 8, 7, 5, 's'); c.ellipse(20, 8, 7, 5, 's'); c.ellipse(14, 5, 8, 5, 'g'); c.ellipse(14, 9, 12, 3, 's'); c.rect(9, 2, 5, 1, 'c')
  for (const [x, y] of [[6, 18], [14, 21], [22, 17], [10, 25], [19, 25]]) {
    c.line(x + 3, y - 4, x, y, 'a', 1); c.circ(x, y, 2, 'l'); c.px(x - 1, y - 1, 'w')
  }
})
icon('ice-shard', 'ice', c => {             // esquirla instantánea
  c.line(0, 24, 8, 18, 'l', 1); c.line(0, 16, 6, 12, 'l', 1); c.line(10, 27, 15, 22, 'l', 1)
  c.poly([5, 22, 11, 8, 28, 0, 21, 17], 'd'); c.poly([5, 22, 11, 8, 28, 0, 14, 16], 'm'); c.poly([5, 22, 11, 8, 19, 5, 11, 15], 'l'); c.line(8, 17, 16, 8, 'w', 1)
})
icon('freeze-dry', 'ice', c => {            // enemigo dentro de un bloque de hielo
  c.poly([5, 2, 23, 2, 27, 7, 27, 25, 9, 25, 5, 20], 'a'); c.poly([5, 5, 22, 5, 22, 24, 5, 24], 'm')
  foe(c, 13, 14, 5, 's', 'k')
  c.poly([6, 6, 12, 6, 6, 12], 'l'); c.poly([21, 16, 21, 23, 15, 23], 'l'); c.line(6, 19, 12, 6, 'w', 1)
  c.poly([5, 2, 23, 2, 27, 7, 22, 5, 5, 5], 'w'); c.poly([22, 5, 27, 7, 27, 25, 22, 24], 'd')
})
icon('icicle-crash', 'ice', c => {          // carámbanos que caen
  c.rect(0, 0, 28, 4, 'a'); c.rect(0, 0, 28, 2, 'l')
  for (const [x, w, h] of [[1, 4, 13], [7, 5, 25], [14, 4, 16], [20, 5, 22]]) {
    c.poly([x, 3, x + w, 3, x + (w >> 1), h], 'm'); c.poly([x, 3, x + (w >> 1), 3, x + (w >> 1), h], 'l')
  }
  c.rect(25, 21, 2, 2, 'l'); c.rect(14, 22, 2, 2, 'l')
})
icon('aurora-beam', 'ice', c => {           // cortina de aurora
  for (let x = 0; x < 28; x++) {
    const y0 = R(7 + Math.sin(x * .45) * 5)
    c.vline(x, y0, 5, 'p'); c.vline(x, y0 + 5, 5, 'm'); c.vline(x, y0 + 10, 5, 'y'); c.px(x, y0 + 7, 'w')
    if (x % 4 == 1) c.vline(x, y0 + 15, 3 + (x % 8 ? 3 : 0), 'y')
  }
})
// ---- Psíquico ----
icon('confusion', 'psychic', c => {         // cabeza dando vueltas
  spiral(c, 14, 14, 13, 2.4, 'd', 3, 0); spiral(c, 14, 14, 13, 2.4, 'm', 2, 0); spiral(c, 14, 13, 13, 2.4, 'l', 1, 0)
  star(c, 24, 4, 4, 2, 5, 'y'); star(c, 4, 24, 3, 1, 5, 'y')
})
icon('psybeam', 'psychic', c => {           // rayo ancho y ondulado
  for (let x = 0; x < 28; x++) {
    const y = R(14 + Math.sin(x * .55) * 5)
    c.vline(x, y - 6, 12, 'a'); c.vline(x, y - 4, 8, 'm'); c.vline(x, y - 2, 4, 'l'); c.vline(x, y - 1, 1, 'w')
  }
  c.circ(3, 13, 4, 'w'); c.circ(3, 13, 2, 'l')
})
icon('psychic', 'psychic', c => {           // cerebro que estalla
  for (let a = 0; a < 360; a += 45) { const [x, y] = pol(14, 14, 11, a), [u, v] = pol(14, 14, 14, a); c.line(x, y, u, v, 'a', 2) }
  c.circ(10, 14, 7, 'm'); c.circ(18, 14, 7, 'm'); c.ellipse(14, 10, 9, 6, 'l'); c.rect(14, 5, 1, 16, 'b')
  arc(c, 9, 13, 4, 180, 350, 'b', 1); arc(c, 19, 13, 4, 190, 360, 'b', 1); arc(c, 9, 17, 3, 0, 160, 'b', 1); arc(c, 19, 17, 3, 20, 180, 'b', 1)
  c.rect(7, 7, 3, 1, 'w')
})
icon('psycho-cut', 'psychic', c => {        // cuchilla psíquica
  c.poly([2, 26, 8, 8, 25, 0, 16, 7, 12, 15], 'd')
  c.poly([2, 26, 7, 9, 25, 0, 14, 7, 10, 14], 'm')
  c.poly([3, 22, 7, 10, 20, 3, 12, 7, 8, 13], 'l')
  c.poly([16, 24, 18, 14, 27, 9, 22, 14, 20, 19], 'a'); c.poly([17, 22, 19, 14, 25, 10, 20, 14], 'l')
})
icon('extrasensory', 'psychic', c => {      // tercer ojo con ondas
  c.ellipse(14, 14, 14, 9, 'a'); c.ellipse(14, 14, 12, 7, 'w'); orb(c, 14, 14, 6, 'm', 'd', 'l', 'w'); c.circ(14, 14, 2, 'k'); c.px(12, 12, 'w')
  arc(c, 14, 14, 13, 225, 315, 'l', 2); arc(c, 14, 14, 13, 45, 135, 'l', 2)
})
icon('mist-ball', 'psychic', c => {         // bola de bruma
  orb(c, 11, 14, 10, 'm', 'd', 'l', 'w')
  c.ellipse(21, 9, 7, 3, 'g'); c.ellipse(23, 18, 5, 2, 'g'); c.ellipse(17, 24, 7, 3, 's'); c.ellipse(20, 8, 5, 1, 'c'); c.ellipse(23, 17, 3, 1, 'c')
  c.ellipse(5, 23, 5, 2, 'g')
})
icon('photon-geyser', 'psychic', c => {     // pilar de luz
  c.poly([7, 0, 21, 0, 18, 24, 10, 24], 'y'); c.poly([10, 0, 18, 0, 16, 24, 12, 24], 'w')
  c.ellipse(14, 23, 13, 4, 'm'); c.ellipse(14, 23, 9, 2, 'w')
  spark(c, 4, 7, 2, 'y'); spark(c, 24, 11, 2, 'y'); spark(c, 25, 2, 1, 'l')
})
icon('psychic-terrain', 'psychic', c => {   // campo psíquico en el suelo
  c.poly([14, 9, 28, 17, 14, 26, 0, 17], 'd'); c.poly([14, 11, 25, 17, 14, 24, 3, 17], 'm'); c.poly([14, 14, 20, 17, 14, 21, 8, 17], 'l'); c.poly([14, 16, 17, 17, 14, 19, 11, 17], 'w')
  arc(c, 14, 8, 6, 180, 360, 'a', 2); c.vline(8, 8, 8, 'a'); c.vline(19, 8, 8, 'a')
  spark(c, 14, 7, 2)
})
// ---- Veneno ----
icon('sludge', 'poison', c => {             // lodo goteando
  c.ellipse(14, 11, 13, 10, 'd'); c.ellipse(13, 10, 12, 9, 'm')
  for (const [x, h] of [[5, 22], [12, 26], [19, 21], [23, 18]]) { c.rect(x - 2, 14, 5, h - 14, 'd'); c.rect(x - 2, 14, 4, h - 14, 'm') }
  c.ellipse(9, 6, 4, 2, 'l'); c.rect(7, 5, 2, 1, 'w')
  c.circ(19, 8, 2, 'l'); c.circ(14, 13, 1, 'l')
})
icon('poison-sting', 'poison', c => {       // aguijón con su gota
  c.poly([27, 0, 1, 18, 6, 24], 'd'); c.poly([27, 0, 1, 18, 3, 20], 'l'); c.poly([27, 0, 4, 19, 7, 21], 'm')
  c.poly([1, 18, 6, 24, 2, 27, 0, 24], 'b')
  drop(c, 22, 19, 4)
})
icon('toxic', 'poison', c => {              // charcos de veneno con calavera
  c.ellipse(14, 23, 14, 4, 'd'); c.ellipse(14, 22, 12, 3, 'm'); c.rect(4, 21, 4, 1, 'l')
  orb(c, 14, 9, 8, 'g', 's', 'c', 'c'); c.rect(10, 14, 8, 5, 'g')
  c.poly([9, 7, 13, 8, 13, 11, 10, 11], 'k'); c.poly([19, 7, 15, 8, 15, 11, 18, 11], 'k'); c.px(14, 12, 'k'); c.vline(12, 16, 3, 'k'); c.vline(15, 16, 3, 'k')
  c.circ(4, 15, 2, 'l'); c.circ(25, 16, 1, 'l')
})
icon('toxic-spikes', 'poison', c => {       // púas moradas clavadas
  shadow(c, 14, 25, 13, 2, 'b')
  for (const [x, w, h] of [[2, 4, 15], [20, 4, 16], [7, 5, 3], [15, 5, 7]]) {
    c.poly([x, 26, x + w * 2, 26, x + w, h], 'd'); c.poly([x, 26, x + w, 26, x + w, h], 'm'); c.poly([x + 1, 25, x + w - 1, 24, x + w, h + 4], 'l')
  }
  drop(c, 13, 13, 1, 'a', 'm', 'w'); c.rect(11, 19, 1, 1, 'w')
})
icon('acid-spray', 'poison', c => {         // chorro ácido a saltos
  c.circ(6, 21, 6, 'd'); orb(c, 6, 21, 5, 'm', 'd', 'l', 'w')
  arc(c, 15, 21, 9, 180, 330, 'y', 2); arc(c, 15, 21, 9, 180, 330, 'm', 1)
  arc(c, 24, 25, 3, 200, 340, 'y', 1)
  drop(c, 22, 8, 3, 'y', 'm', 'c'); drop(c, 13, 5, 2, 'y', 'm', 'c'); drop(c, 26, 19, 1, 'y', 'm', 'c')
})
icon('cross-poison', 'poison', c => {       // aspa venenosa
  c.line(4, 2, 22, 21, 'd', 5); c.line(24, 2, 6, 21, 'd', 5)
  c.line(4, 2, 22, 21, 'm', 3); c.line(24, 2, 6, 21, 'm', 3); c.line(4, 2, 22, 21, 'l', 1); c.line(24, 2, 6, 21, 'w', 1)
  drop(c, 22, 25, 2, 'y', 'm', 'c'); drop(c, 6, 25, 2, 'y', 'm', 'c'); drop(c, 14, 24, 1, 'y', 'm', 'c')
})
icon('baneful-bunker', 'poison', c => {     // búnker con púas
  for (const a of [190, 225, 270, 315, 350]) { const [x, y] = pol(14, 19, 15, a), [u, v] = pol(14, 19, 9, a + 12), [p, q] = pol(14, 19, 9, a - 12); c.poly([x, y, u, v, p, q], 'l') }
  c.rect(0, 22, 28, 5, 'b'); c.rect(0, 22, 28, 1, 's')
  c.ellipse(14, 22, 12, 12, 'd'); c.ellipse(13, 22, 11, 11, 'm'); c.ellipse(11, 20, 6, 6, 'l'); c.rect(0, 23, 28, 5, '_'); c.rect(1, 23, 26, 4, 'b')
  c.rect(8, 16, 12, 3, 'k'); c.rect(8, 16, 12, 1, 'y')
})
