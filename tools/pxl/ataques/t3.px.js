// Tierra, Volador, Lucha, Bicho, Roca.
function bone(c, x0, y0, x1, y1, r = 2, m = 'w', d = 'l', e = 'm') {
  c.line(x0, y0, x1, y1, m, r + 1)
  const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2, u = R(Math.cos(a) * r), v = R(Math.sin(a) * r)
  for (const [x, y] of [[x0, y0], [x1, y1]]) { c.circ(x + u, y + v, r, m); c.circ(x - u, y - v, r, d); }
  c.px(x1 + u, y1 + v, e)
}
// ---- Tierra ----
icon('mud-shot', 'ground', c => {           // salpica lodo alrededor
  c.ellipse(14, 15, 7, 6, 'b'); c.ellipse(13, 14, 5, 4, 'd'); c.rect(11, 12, 3, 1, 'm')
  for (const [a, r, s] of [[-90, 11, 3], [-30, 12, 2], [30, 11, 3], [100, 11, 2], [160, 12, 3], [215, 11, 2]]) {
    const [x, y] = pol(14, 15, r, a), [u, v] = pol(14, 15, 6, a); c.line(u, v, x, y, 'b', 2); c.circ(x, y, s, 'd'); c.px(x - 1, y - 1, 'm')
  }
})
icon('bulldoze', 'ground', c => {           // sacude y levanta el suelo
  c.rect(0, 22, 28, 5, 'b'); c.rect(0, 22, 28, 1, 'm')
  c.poly([4, 22, 9, 10, 13, 16, 17, 7, 24, 22], 'd'); c.poly([4, 22, 9, 10, 11, 22], 'm'); c.poly([13, 22, 13, 16, 17, 7, 18, 22], 'm'); c.poly([9, 12, 8, 17, 10, 16], 'l'); c.poly([17, 9, 15, 15, 17, 14], 'l')
  c.line(14, 23, 11, 27, 'k', 1); c.line(14, 23, 19, 27, 'k', 1)
  rock(c, 3, 13, 2); rock(c, 25, 11, 3); rock(c, 22, 3, 2)
})
icon('bonemerang', 'ground', c => {         // hueso doblado que vuelve
  c.line(4, 23, 14, 7, 'w', 5); c.line(14, 7, 24, 23, 'w', 5); c.line(5, 22, 13, 9, 'l', 2); c.line(16, 11, 24, 23, 'm', 1)
  c.circ(2, 22, 2, 'w'); c.circ(7, 26, 2, 'l'); c.circ(21, 26, 2, 'w'); c.circ(26, 22, 2, 'l')
  arc(c, 14, 15, 13, 190, 250, 'a', 2); c.poly([0, 10, 4, 15, 6, 10], 'a')
})
icon('spikes', 'ground', c => {             // púas sembradas
  shadow(c, 14, 25, 13, 2, 'a')
  for (const [x, w, h] of [[1, 4, 12], [18, 5, 11], [8, 6, 1]]) { c.poly([x, 26, x + w * 2, 26, x + w, h], 's'); c.poly([x, 26, x + w, 26, x + w, h], 'g'); c.line(x + w, h + 2, x + w - 1, h + 8, 'c', 1) }
})
icon('magnitude', 'ground', c => {          // el suelo revienta en línea
  c.rect(0, 15, 28, 13, 'a'); c.rect(0, 15, 28, 2, 'm'); c.rect(0, 17, 28, 2, 'd')
  c.line(0, 27, 7, 22, 'k', 2); c.line(7, 22, 12, 24, 'k', 2); c.line(12, 24, 17, 18, 'k', 2); c.line(17, 18, 22, 21, 'k', 2); c.line(22, 21, 28, 14, 'k', 2)
  c.poly([14, 16, 18, 2, 21, 7, 25, 3, 25, 18], 'd'); c.poly([15, 15, 18, 5, 20, 12], 'm')
  rock(c, 7, 7, 4); rock(c, 12, 2, 2); rock(c, 3, 12, 2)
})
icon('sand-tomb', 'ground', c => {          // remolino de arena que traga
  c.poly([1, 2, 27, 2, 16, 20, 18, 26, 10, 26, 12, 20], 'm')
  c.ellipse(14, 3, 13, 3, 'l'); c.ellipse(14, 3, 8, 1, 'a')
  c.line(4, 8, 22, 9, 'd', 1); c.line(8, 13, 20, 12, 'd', 1); c.line(11, 17, 17, 16, 'd', 1); c.line(6, 6, 11, 6, 'w', 1)
  c.ellipse(14, 25, 8, 2, 'l'); c.rect(2, 23, 2, 2, 'l'); c.rect(24, 22, 2, 2, 'l')
})
icon('bone-club', 'ground', c => {          // hueso lanzado en parábola
  bone(c, 7, 22, 21, 7, 3)
  arc(c, 15, 26, 13, 190, 250, 'a', 2); c.rect(2, 19, 2, 2, 'a'); c.rect(1, 26, 3, 1, 'l')
})
icon('mud-bomb', 'ground', c => {           // bomba de barro que deja charco
  c.ellipse(14, 23, 14, 4, 'b'); c.ellipse(14, 22, 11, 3, 'a'); c.rect(6, 21, 4, 1, 'd')
  orb(c, 13, 11, 9, 'd', 'a', 'm', 'l')
  c.line(18, 3, 22, 0, 'b', 1); c.rect(21, 0, 3, 2, 'y')
  c.rect(1, 13, 3, 3, 'a'); c.rect(25, 13, 2, 2, 'a'); c.rect(24, 17, 3, 2, 'a')
})
// ---- Volador ----
icon('gust', 'flying', c => {               // remolinos de viento
  c.line(1, 8, 16, 8, 'l', 2); arc(c, 16, 4, 4, -90, 90, 'l', 2); arc(c, 16, 4, 4, 270, 180, 'l', 2)
  c.line(4, 15, 22, 15, 'w', 2); arc(c, 22, 10, 5, -90, 90, 'w', 2); arc(c, 22, 10, 5, 270, 190, 'w', 2)
  c.line(1, 21, 15, 21, 'l', 2); arc(c, 15, 24, 3, 90, -90, 'l', 2)
})
icon('aerial-ace', 'flying', c => {         // en picado, cortando
  c.line(2, 0, 18, 14, 'm', 2); c.line(9, 0, 22, 11, 'l', 1); c.line(0, 8, 13, 19, 'l', 1)
  c.poly([27, 27, 7, 21, 13, 17, 14, 13, 18, 16, 21, 8], 'b'); c.poly([27, 27, 10, 21, 15, 18, 19, 15, 21, 11], 'm'); c.poly([27, 27, 15, 18, 19, 15], 'w'); c.poly([27, 27, 21, 20, 23, 22], 'y')
})
icon('air-slash', 'flying', c => {          // dos cuchillas de aire
  c.poly([2, 2, 14, 7, 19, 15, 16, 25, 8, 27, 13, 19, 12, 12], 'd'); c.poly([2, 2, 13, 8, 17, 15, 15, 23, 10, 25, 14, 19, 11, 10], 'l'); c.poly([4, 3, 12, 9, 14, 15, 12, 10], 'w')
  c.poly([12, 1, 23, 6, 27, 14, 25, 23, 19, 26, 23, 19, 21, 11], 'm'); c.poly([13, 2, 22, 7, 25, 14, 23, 9], 'w')
})
icon('whirlwind', 'flying', c => {          // tornado
  for (const [y, rx, col] of [[3, 13, 'w'], [8, 11, 'l'], [13, 8, 'm'], [18, 6, 'l'], [22, 4, 'm'], [26, 2, 'd']]) { c.ellipse(14 + (y >> 3), y, rx, 2, 'd'); c.ellipse(14 + (y >> 3), y - 1, rx, 1, col) }
  c.rect(2, 12, 2, 2, 'g'); c.rect(23, 16, 3, 2, 'g')
})
icon('dual-wingbeat', 'flying', c => {      // dos aves en círculo
  const bird = (x, y) => {
    c.poly([x - 12, y - 6, x - 6, y - 7, x, y - 1, x + 6, y - 7, x + 12, y - 6, x + 3, y + 6, x, y + 7, x - 3, y + 6], 'd')
    c.poly([x - 11, y - 6, x - 6, y - 6, x - 1, y, x - 3, y + 3], 'w'); c.poly([x + 11, y - 6, x + 6, y - 6, x + 1, y, x + 3, y + 3], 'l'); c.rect(x - 2, y, 4, 5, 'l'); c.rect(x - 1, y - 2, 2, 2, 'y')
  }
  bird(10, 8); bird(17, 21)
})
icon('feather-dance', 'flying', c => {      // plumas cayendo
  feather(c, 5, 16, 21, 1, 4); feather(c, 15, 25, 27, 12, 3); feather(c, 3, 27, 9, 19, 2)
  arc(c, 22, 18, 6, 30, 120, 'm', 1)
})
// ---- Lucha ----
icon('aura-sphere', 'fighting', c => {      // esfera de energía
  c.circ(14, 14, 13, 'd'); c.circ(14, 14, 11, 'm'); c.circ(14, 14, 8, 'l'); orb(c, 13, 13, 6, 'w', 'l', 'w', 'c')
  for (const a of [20, 110, 200, 290]) arc(c, 14, 14, 11, a, a + 45, 'y', 2)
})
icon('rolling-kick', 'fighting', c => {     // patada en giro
  arc(c, 15, 15, 13, 40, 200, 'l', 2); c.poly([1, 14, 7, 19, 0, 21], 'l')
  c.poly([0, 3, 6, 0, 18, 10, 12, 16], 'a'); c.poly([0, 3, 6, 0, 16, 9, 12, 11], 'w')
  c.poly([12, 16, 18, 10, 26, 11, 28, 16, 24, 20, 16, 20], 'm'); c.poly([18, 10, 26, 11, 27, 13, 18, 12], 'l'); c.poly([16, 20, 24, 20, 28, 16, 27, 20, 24, 22, 16, 22], 'd')
  star(c, 24, 5, 4, 1, 4, 'y')
})
icon('vacuum-wave', 'fighting', c => {      // puñetazo al aire: onda
  arc(c, 8, 14, 14, -50, 50, 'c', 2); arc(c, 8, 14, 18, -35, 35, 'l', 2); arc(c, 8, 14, 11, -55, 55, 'l', 1)
  c.poly([0, 8, 6, 8, 6, 20, 0, 20], 'm'); fist(c, 10, 14, 10)
})
icon('dynamic-punch', 'fighting', c => {    // puñetazo tremendo que aturde
  star(c, 14, 15, 14, 8, 10, 'o'); star(c, 14, 15, 11, 6, 10, 'y')
  fist(c, 14, 16, 14)
  star(c, 5, 4, 4, 1, 5, 'y'); star(c, 23, 4, 4, 1, 5, 'y'); star(c, 14, 2, 3, 1, 5, 'y')
})
icon('cross-chop', 'fighting', c => {       // dos brazos en aspa
  for (const f of [1, 0]) {
    const X = v => f ? 27 - v : v
    c.line(X(2), 26, X(19), 8, 'a', 6); c.line(X(1), 25, X(18), 7, f ? 'w' : 'a', 2)
    c.line(X(2), 26, X(7), 21, 'm', 6)
    c.line(X(18), 9, X(22), 3, 'a', 5); c.line(X(21), 3, X(23), 1, 'a', 3)
  }
  c.rect(11, 12, 6, 6, 'y'); c.rect(13, 14, 2, 2, 'c')
})
icon('sky-uppercut', 'fighting', c => {     // gancho al cielo
  for (const [x, y, h] of [[3, 12, 13], [24, 11, 14], [7, 2, 8], [20, 1, 8]]) c.vline(x, y, h, 'c')
  c.rect(8, 16, 12, 12, 'm'); c.rect(8, 16, 3, 12, 'l'); c.rect(17, 16, 3, 12, 'd'); c.rect(8, 15, 12, 3, 'w')
  c.rect(7, 2, 14, 13, 'a'); c.rect(7, 2, 14, 2, 'c'); c.vline(10, 2, 5, 'd'); c.vline(14, 2, 5, 'd'); c.vline(17, 2, 5, 'd'); c.rect(7, 9, 10, 3, 'c'); c.rect(7, 13, 14, 2, 'd')
})
// ---- Bicho ----
icon('bug-bite', 'bug', c => {              // mandíbulas de insecto
  c.ellipse(14, 22, 9, 6, 'd'); c.ellipse(14, 21, 7, 4, 'm'); c.rect(9, 19, 4, 1, 'l')
  c.rect(7, 19, 4, 3, 'r'); c.rect(17, 19, 4, 3, 'r'); c.px(8, 19, 'c'); c.px(18, 19, 'c')
  for (const f of [1, 0]) {
    const X = v => f ? 28 - v : v
    c.poly([X(8), 17, X(2), 11, X(4), 3, X(13), 0, X(8), 5, X(8), 9, X(12), 14, X(13), 17], 'a'); c.poly([X(3), 11, X(4), 5, X(11), 1, X(6), 5, X(6), 10], f ? 'b' : 'l')
    c.poly([X(8), 8, X(11), 8, X(9), 11], 'c'); c.poly([X(11), 12, X(14), 12, X(12), 15], 'c')
  }
})
icon('string-shot', 'bug', c => {           // telaraña
  for (let a = 0; a < 360; a += 45) { const [x, y] = pol(14, 14, 15, a); c.line(14, 14, x, y, 'g', 1) }
  for (const r of [5, 9, 13]) for (let a = 0; a < 360; a += 45) {
    const [x, y] = pol(14, 14, r, a), [u, v] = pol(14, 14, r, a + 45); c.line(x, y, u, v, 'c', 1)
  }
  c.circ(14, 14, 2, 'l')
})
icon('signal-beam', 'bug', c => {           // destello que rebota
  const z = [[0, 6], [9, 21], [18, 5], [27, 19]]
  for (let i = 0; i < 3; i++) {
    c.line(z[i][0], z[i][1], z[i + 1][0], z[i + 1][1], 'd', 7); c.line(z[i][0], z[i][1] - 2, z[i + 1][0], z[i + 1][1] - 2, 'r', 2)
    c.line(z[i][0], z[i][1], z[i + 1][0], z[i + 1][1], 'y', 2); c.line(z[i][0], z[i][1] + 2, z[i + 1][0], z[i + 1][1] + 2, 'l', 2)
  }
  star(c, 24, 18, 6, 2, 4, 'c'); star(c, 3, 6, 4, 1, 4, 'c')
})
icon('u-turn', 'bug', c => {                // cruzas y das la vuelta
  arc(c, 14, 12, 9, 0, 180, 'd', 5); arc(c, 14, 12, 9, 0, 180, 'm', 3); arc(c, 14, 12, 8, 80, 170, 'l', 1)
  c.rect(3, 3, 5, 9, 'm'); c.rect(21, 7, 4, 6, 'm'); c.rect(3, 3, 2, 9, 'l')
  c.poly([16, 8, 23, 0, 28, 8], 'l'); c.poly([18, 8, 23, 2, 23, 8], 'w')
  c.rect(0, 26, 4, 1, 'g'); c.rect(9, 2, 3, 3, 'r')
})
icon('pin-missile', 'bug', c => {           // agujas en ráfaga
  for (const [x, y] of [[10, 4], [18, 13], [9, 22]]) {
    c.line(x - 10, y, x - 4, y, 'o', 1); c.rect(x - 4, y - 1, 12, 3, 'l'); c.rect(x - 4, y, 12, 1, 'm'); c.poly([x + 8, y - 1, x + 10, y - 1, x + 15, y + 1, x + 8, y + 2], 'w')
    c.poly([x - 6, y - 3, x - 2, y - 1, x - 2, y + 2, x - 6, y + 4], 'd')
  }
})
function bee(c, x, y, s = 1) {
  c.ellipse(x - s, y - 3 * s, 3 * s, 2 * s, 'c'); c.ellipse(x + 3 * s, y - 3 * s, 2 * s, 2 * s, 'g')
  c.ellipse(x, y, 5 * s, 3 * s, 'y'); c.rect(x - 2 * s, y - 3 * s, 2 * s, 6 * s, 'k'); c.rect(x + 2 * s, y - 3 * s, s, 6 * s, 'k'); c.px(x - 4 * s, y - s, 'k'); c.poly([x + 5 * s, y - 1, x + 8 * s, y, x + 5 * s, y + 1], 'k')
}
icon('attack-order', 'bug', c => { bee(c, 8, 7, 1); bee(c, 19, 14, 1); bee(c, 7, 22, 1); c.line(13, 3, 19, 6, 'g', 1); c.line(13, 22, 16, 19, 'g', 1) })
// ---- Roca ----
icon('rock-throw', 'rock', c => {           // pedrusco que empuja
  c.rect(0, 11, 5, 2, 'l'); c.rect(1, 17, 5, 2, 'w'); c.rect(0, 23, 8, 2, 'l')
  rock(c, 16, 14, 12); c.line(16, 14, 22, 21, 'b', 1); c.line(16, 14, 11, 18, 'b', 1); c.line(16, 14, 19, 7, 'd', 1)
})
icon('rock-slide', 'rock', c => {           // caen y ruedan
  c.poly([0, 28, 0, 22, 28, 28], 'd')
  rock(c, 8, 5, 5); rock(c, 19, 11, 6); rock(c, 8, 18, 5)
  c.line(8, 0, 8, 0, 'l', 1); arc(c, 19, 11, 9, 160, 230, 'l', 1); arc(c, 8, 18, 8, 170, 240, 'l', 1); arc(c, 8, 5, 8, 300, 340, 'l', 1)
})
icon('rock-tomb', 'rock', c => {            // anillo de rocas encierra a uno
  shadow(c, 14, 24, 13, 3, 'b')
  foe(c, 14, 15, 4)
  rock(c, 5, 8, 5); rock(c, 23, 8, 5); rock(c, 3, 19, 4); rock(c, 25, 19, 4); rock(c, 14, 5, 4); rock(c, 9, 24, 4); rock(c, 19, 24, 4)
})
icon('ancient-power', 'rock', c => {        // rocas antiguas con runas, en órbita
  arc(c, 14, 15, 11, 0, 360, 'a', 1)
  rock(c, 14, 15, 7, 'm', 'd', 'l'); c.line(11, 13, 17, 13, 'y', 1); c.line(14, 11, 14, 19, 'y', 1); c.line(11, 19, 17, 17, 'y', 1)
  rock(c, 5, 6, 4, 'y', 'o', 'c'); rock(c, 24, 8, 4, 'y', 'o', 'c'); rock(c, 14, 25, 3, 'y', 'o', 'c')
})
icon('power-gem', 'rock', c => {            // gema que se parte en dos
  const gem = (x, y, w) => {
    c.poly([x - w, y - 3, x - w / 2, y - 7, x + w / 2, y - 7, x + w, y - 3, x, y + 8].map(R), 'r')
    c.poly([x - w, y - 3, x + w, y - 3, x, y + 8].map(R), 'o'); c.poly([x - w / 2, y - 3, x + w / 2, y - 3, x, y + 8].map(R), 'y')
    c.poly([x - w / 2, y - 7, x, y - 7, x - 1, y - 3, x - w / 2, y - 3].map(R), 'c')
  }
  gem(11, 9, 10); gem(23, 18, 5)
  c.line(7, 24, 16, 16, 'y', 1); spark(c, 23, 3, 2, 'y'); spark(c, 5, 22, 2, 'y')
})
icon('rock-blast', 'rock', c => {           // cinco rocas en parábola
  arc(c, 14, 27, 13, 190, 350, 'a', 1)
  rock(c, 4, 22, 4); rock(c, 8, 10, 4); rock(c, 15, 6, 5); rock(c, 23, 11, 4); rock(c, 24, 23, 4)
})
icon('rollout', 'rock', c => {              // roca rodando
  c.rect(0, 25, 28, 2, 'b')
  for (const [x, y, n] of [[0, 8, 5], [1, 14, 4], [0, 20, 5]]) c.hline(x, y, n, 'l')
  rock(c, 16, 14, 11)
  arc(c, 16, 14, 7, 120, 330, 'd', 2); c.poly([21, 10, 24, 15, 19, 15], 'd')
})
