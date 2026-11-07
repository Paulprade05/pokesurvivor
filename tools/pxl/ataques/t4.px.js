// Fantasma, Dragón, Acero, Siniestro, Hada.
function ghosty(c, x, y, s = 7, m = 'm', l = 'l', e = 'k') {
  c.circ(x, y, s, m); c.rect(x - s, y, s * 2 + 1, s, m)
  for (let i = -s + 1; i <= s; i += 3) { c.px(x + i, y + s, '_'); c.px(x + i + 1, y + s, '_') }
  c.rect(x - s + 1, y - s + 2, 2, 2, l); c.rect(x - 3, y - 1, 2, 3, e); c.rect(x + 2, y - 1, 2, 3, e)
}
function claws(c, m, l, w, d) {            // zarpa con tres garras curvas
  c.ellipse(14, 4, 13, 4, d); c.ellipse(14, 3, 11, 2, m); c.rect(6, 1, 6, 1, l)
  for (const x of [1, 10, 19]) {
    c.poly([x, 5, x + 8, 5, x + 9, 13, x + 6, 21, x + 1, 27, x + 2, 19, x + 2, 12], d)
    c.poly([x + 1, 5, x + 6, 5, x + 6, 13, x + 4, 19, x + 1, 27, x + 1, 19, x + 1, 12], m)
    c.poly([x + 1, 5, x + 3, 5, x + 3, 15, x + 1, 25, x + 1, 12], l); c.line(x + 2, 8, x + 2, 15, w, 1)
  }
}
function scale(c, x, y, r) { c.poly([x - r, y - r, x + r, y - r, x + r, y + 1, x, y + r + 2, x - r, y + 1], 'd'); c.poly([x - r + 1, y - r + 1, x + r - 1, y - r + 1, x + r - 1, y, x, y + r, x - r + 1, y], 'm'); c.poly([x - r + 1, y - r + 1, x, y - r + 1, x, y + r, x - r + 1, y], 'l') }
function tornado(c, a, b, g) {
  for (const [y, rx, col] of [[3, 13, g], [8, 11, b], [13, 8, a], [18, 6, b], [22, 4, a], [26, 2, 'd']]) { c.ellipse(14 + (y >> 3), y, rx, 2, 'b'); c.ellipse(14 + (y >> 3), y - 1, rx, 1, col) }
}
// ---- Fantasma ----
icon('shadow-ball', 'ghost', c => {         // esfera oscura que crece
  c.circ(14, 14, 13, 'm'); c.circ(14, 14, 11, 'b'); orb(c, 14, 14, 9, 'd', 'b', 'm', 'l')
  arc(c, 14, 14, 13, 250, 290, 'l', 2); arc(c, 14, 14, 13, 100, 160, 'l', 2); c.rect(0, 7, 2, 2, 'p'); c.rect(25, 22, 2, 2, 'p')
})
icon('hex', 'ghost', c => {                 // sello de maldición que salta
  c.circ(14, 14, 13, 'd'); c.ring(14, 14, 11, 'p'); star(c, 14, 14, 11, 4, 5, 'm'); c.circ(14, 14, 4, 'k'); c.ellipse(14, 14, 3, 2, 'p'); c.rect(14, 12, 1, 5, 'k')
})
icon('shadow-sneak', 'ghost', c => {        // tu sombra se estira hasta el enemigo
  c.poly([0, 27, 0, 22, 12, 20, 20, 24, 28, 23, 28, 27], 'l'); c.poly([0, 27, 0, 24, 12, 22, 20, 25, 28, 25, 28, 27], 'm')
  c.poly([10, 22, 9, 9, 13, 8, 13, 3, 16, 3, 16, 7, 19, 4, 21, 6, 19, 11, 23, 10, 24, 12, 19, 22], 'm')
  c.poly([10, 22, 9, 9, 13, 8, 13, 3, 14, 3, 14, 12, 12, 22], 'l')
  c.poly([9, 13, 5, 7, 7, 5, 11, 10], 'm')
  c.rect(12, 14, 2, 3, 'p'); c.rect(16, 14, 2, 3, 'p')
})
icon('ominous-wind', 'ghost', c => {        // viento maldito con cara
  spiral(c, 14, 14, 13, 1.25, 'd', 4, 150); spiral(c, 14, 14, 13, 1.25, 'l', 2, 150)
  ghosty(c, 14, 13, 5, 'm', 'l', 'k')
})
icon('astral-barrage', 'ghost', c => {      // orbes en corona
  for (const a of [-90, -18, 54, 126, 198]) { const [x, y] = pol(14, 14, 10, a), [u, v] = pol(14, 14, 13, a - 34); arc(c, 14, 14, 13, a - 46, a - 10, 'b', 1); orb(c, x, y, 4, 'm', 'd', 'l', 'w') }
  c.circ(14, 14, 2, 'p')
})
icon('last-respects', 'ghost', c => {       // lápida y espíritu
  c.ellipse(14, 25, 13, 2, 'b')
  c.rect(4, 8, 12, 17, 's'); c.circ(10, 8, 6, 's'); c.rect(4, 8, 3, 17, 'g'); c.circ(8, 6, 3, 'g'); c.rect(10, 7, 1, 8, 'k'); c.rect(7, 10, 7, 1, 'k')
  ghosty(c, 21, 10, 5)
  c.poly([17, 15, 26, 15, 22, 20], 'm'); c.px(22, 20, 'l')
})
// ---- Dragón ----
icon('dragon-rage', 'dragon', c => {        // llamarada en línea
  c.poly([5, 7, 28, 1, 22, 9, 28, 14, 21, 18, 26, 25, 5, 20], 'd')
  c.poly([9, 10, 24, 5, 19, 10, 23, 14, 18, 17, 22, 21, 9, 18], 'm'); c.poly([9, 12, 18, 11, 14, 14, 17, 17, 9, 16], 'l')
  orb(c, 7, 14, 6, 'a', 'o', 'w', 'w'); c.rect(6, 11, 2, 7, 'k')
})
icon('dragon-dance', 'dragon', c => {       // dragón que sube bailando
  const P = i => { const t = i / 26; return [R(13 + Math.sin(t * 7.5) * 8), R(26 - t * 19)] }
  for (let i = 0; i <= 26; i++) { const [x, y] = P(i); c.circ(x, y, 3, 'd') }
  for (let i = 0; i <= 26; i++) { const [x, y] = P(i); c.circ(x, y, 2, 'm') }
  for (let i = 3; i <= 23; i += 5) { const [x, y] = P(i); c.rect(x - 1, y - 1, 2, 2, 'l') }
  const [x, y] = P(26); c.circ(x, y - 2, 4, 'm'); c.rect(x + 1, y - 3, 2, 2, 'a'); c.poly([x - 3, y - 5, x - 7, y - 9, x - 1, y - 7], 'l'); c.poly([x + 2, y - 5, x + 6, y - 9, x + 4, y - 4], 'l')
  c.poly([22, 12, 26, 18, 18, 18], 'a'); c.rect(21, 17, 2, 7, 'a')
})
icon('dragon-breath', 'dragon', c => {      // fauces con aliento en abanico
  c.poly([11, 13, 28, 1, 26, 8, 28, 14, 26, 20, 28, 26], 'd'); c.poly([11, 13, 25, 7, 23, 13, 25, 19], 'm'); c.poly([11, 13, 19, 11, 19, 15], 'l')
  c.poly([0, 3, 9, 5, 13, 11, 12, 13, 3, 12, 0, 12], 'm'); c.poly([0, 3, 9, 5, 11, 9, 3, 8], 'l'); c.poly([0, 15, 11, 15, 12, 17, 8, 22, 0, 22], 'd')
  c.rect(4, 6, 3, 3, 'a'); c.rect(5, 6, 1, 3, 'k'); c.poly([0, 3, 2, 0, 5, 4], 'a')
  c.poly([7, 12, 9, 12, 8, 15], 'w'); c.poly([3, 12, 5, 12, 4, 15], 'w'); c.poly([7, 16, 9, 16, 8, 13], 'w')
})
icon('dragon-claw', 'dragon', c => { claws(c, 'm', 'l', 'w', 'd') })
icon('outrage', 'dragon', c => {            // ojo furioso en frenesí
  for (let a = 0; a < 360; a += 40) { const [x, y] = pol(14, 14, 12, a), [u, v] = pol(14, 14, 15, a + 18); c.line(x, y, u, v, 'r', 2) }
  arc(c, 14, 14, 11, 0, 360, 'd', 2)
  c.ellipse(14, 15, 11, 7, 'a'); c.circ(14, 15, 5, 'r'); c.rect(13, 10, 2, 11, 'k')
  c.poly([1, 7, 14, 10, 27, 7, 27, 4, 14, 7, 1, 4], 'b')
})
icon('scale-shot', 'dragon', c => {         // escamas en ráfaga
  for (const [x, y, r] of [[20, 7, 5], [8, 12, 4], [20, 21, 4]]) { c.line(x - r - 7, y, x - r, y, 'l', 1); scale(c, x, y, r) }
})
icon('twister', 'dragon', c => { tornado(c, 'm', 'l', 'w'); c.rect(3, 13, 2, 2, 'a'); c.rect(23, 18, 2, 2, 'a') })
// ---- Acero ----
icon('metal-claw', 'steel', c => { claws(c, 'm', 'l', 'w', 'b') })
icon('flash-cannon', 'steel', c => {        // cañón que dispara luz
  c.poly([11, 11, 28, 0, 28, 27, 11, 17], 'y'); c.poly([11, 12, 28, 7, 28, 20, 11, 16], 'w')
  c.rect(0, 8, 13, 12, 'b'); c.rect(1, 9, 11, 10, 'm'); c.rect(1, 9, 11, 3, 'l'); c.rect(1, 16, 11, 3, 'd')
  c.rect(11, 6, 4, 16, 'b'); c.rect(12, 7, 2, 14, 'l')
  c.rect(4, 12, 2, 2, 'y')
})
icon('meteor-mash', 'steel', c => {         // puño meteoro
  c.line(27, 0, 16, 11, 'o', 7); c.line(27, 0, 16, 11, 'y', 3); c.line(19, 0, 11, 8, 'o', 2); c.line(27, 8, 20, 15, 'o', 2)
  orb(c, 11, 17, 10, 'm', 'd', 'l', 'w')
  c.rect(5, 15, 13, 7, 'b'); c.rect(5, 15, 13, 2, 'l'); c.vline(9, 15, 4, 'k'); c.vline(13, 15, 4, 'k')
})
icon('gyro-ball', 'steel', c => {           // bola de acero con engranaje
  for (let a = 0; a < 360; a += 45) { const [x, y] = pol(14, 14, 12, a); c.rect(x - 2, y - 2, 4, 4, 'd') }
  orb(c, 14, 14, 10, 'm', 'd', 'l', 'w'); c.circ(14, 14, 4, 'b'); c.circ(14, 14, 2, 'y')
  arc(c, 14, 14, 7, 200, 280, 'w', 1); arc(c, 14, 14, 7, 20, 100, 'd', 1)
})
icon('mirror-shot', 'steel', c => {         // espejo que refleja
  c.ellipse(11, 12, 10, 12, 'b'); c.ellipse(11, 12, 8, 10, 'l'); c.poly([6, 18, 15, 3, 18, 8, 9, 22], 'w')
  c.rect(10, 23, 3, 5, 'b');
  c.line(0, 8, 11, 12, 'y', 1); c.line(11, 12, 27, 3, 'y', 2); c.line(11, 12, 27, 15, 'y', 2)
  star(c, 25, 4, 3, 1, 4, 'c'); star(c, 25, 15, 3, 1, 4, 'c')
})
icon('kings-shield', 'steel', c => {        // escudo con corona
  c.poly([3, 6, 25, 6, 25, 16, 14, 27, 3, 16], 'b'); c.poly([5, 8, 23, 8, 23, 15, 14, 24, 5, 15], 'm'); c.poly([5, 8, 14, 8, 14, 24, 5, 15], 'l')
  c.poly([6, 0, 10, 4, 14, 0, 18, 4, 22, 0, 22, 8, 6, 8], 'y'); c.rect(6, 7, 16, 2, 'o'); c.rect(13, 11, 2, 2, 'y'); c.rect(10, 11, 8, 1, 'd')
  c.line(14, 10, 14, 21, 'd', 1)
})
icon('steel-wing', 'steel', c => {          // ala de cuchillas
  const tips = [[1, 8], [2, 15], [6, 21], [12, 26], [18, 27]]
  tips.forEach((t, i) => {
    const x = 21 + i, y = 6 + i
    c.line(x, y, t[0], t[1], 'b', 5); c.line(x, y, t[0], t[1], i % 2 ? 'm' : 'l', 3); c.line(x, y - 1, t[0], t[1], 'w', 1)
  })
  c.line(23, 3, 7, 5, 'l', 5); c.line(23, 5, 9, 11, 'm', 5); c.line(24, 3, 8, 4, 'w', 2); c.line(23, 6, 12, 10, 'd', 1)
  c.circ(23, 5, 4, 'l'); c.rect(21, 2, 3, 2, 'w'); c.rect(22, 6, 2, 2, 'y')
})
icon('make-it-rain', 'steel', c => {        // lluvia de monedas
  const coin = (x, y, r) => { c.circ(x, y, r, 'o'); c.circ(x, y, r - 1, 'y'); c.rect(x - 1, y - r + 2, 2, r * 2 - 3, 'o'); c.px(x - r + 1, y - 1, 'c') }
  coin(9, 9, 6); coin(21, 6, 4); coin(22, 19, 5); coin(8, 23, 3); c.line(17, 21, 15, 26, 'y', 1); c.line(3, 3, 1, 7, 'y', 1); c.line(14, 2, 13, 4, 'y', 1)
})
// ---- Siniestro ----
icon('dark-pulse', 'dark', c => {           // onda oscura que se contagia
  c.circ(14, 14, 14, 'b'); c.ring(14, 14, 13, 'a'); c.ring(14, 14, 9, 'm'); c.ring(14, 14, 8, 'm')
  c.circ(14, 14, 5, 'd'); c.circ(14, 14, 2, 'a')
  for (let a = 45; a < 360; a += 90) { const [x, y] = pol(14, 14, 12, a); c.rect(x - 2, y - 2, 4, 4, 'a') ; c.rect(x - 1, y - 1, 2, 2, 'k') }
})
icon('night-shade', 'dark', c => {          // sombra con ojos que engaña
  c.poly([0, 27, 3, 10, 8, 3, 14, 1, 20, 3, 25, 10, 28, 27, 23, 22, 19, 27, 14, 22, 9, 27, 5, 22], 'b')
  c.poly([3, 25, 5, 11, 9, 5, 14, 3, 18, 5, 12, 10, 9, 18], 'd')
  c.poly([6, 11, 12, 13, 11, 16, 7, 15], 'a'); c.poly([22, 11, 16, 13, 17, 16, 21, 15], 'a'); c.px(9, 14, 'k'); c.px(18, 14, 'k')
})
icon('sucker-punch', 'dark', c => {         // golpe a traición, por la espalda
  foe(c, 19, 12, 7, 's', 'k'); c.rect(11, 15, 3, 3, 'y')
  c.poly([0, 16, 6, 14, 6, 25, 0, 25], 'd'); fist(c, 9, 20, 10, 'l', 'b', 'w')
  star(c, 15, 16, 5, 2, 6, 'a')
  c.rect(23, 1, 2, 4, 'r'); c.rect(23, 6, 2, 2, 'r')
})
icon('night-slash', 'dark', c => {          // tajo de luna en la oscuridad
  c.circ(14, 14, 13, 'b'); c.circ(14, 14, 11, 'd')
  c.poly([3, 4, 25, 25, 12, 18], 'w'); c.poly([3, 4, 25, 25, 18, 13], 'a')
  c.circ(21, 6, 3, 'l'); c.circ(23, 5, 3, 'd')
})
icon('beat-up', 'dark', c => {              // copias pegando
  c.ellipse(6, 15, 5, 6, 'm'); c.circ(6, 7, 4, 'm'); c.rect(4, 6, 1, 2, 'k'); c.rect(7, 6, 1, 2, 'k')
  c.ellipse(22, 15, 5, 6, 'm'); c.circ(22, 7, 4, 'm'); c.rect(20, 6, 1, 2, 'k'); c.rect(23, 6, 1, 2, 'k')
  star(c, 14, 19, 8, 4, 7, 'a'); fist(c, 14, 19, 8, 'l', 'd', 'w')
  c.rect(0, 25, 12, 2, 'd'); c.rect(16, 25, 12, 2, 'd')
})
icon('dark-void', 'dark', c => {            // oscuridad que lo traga todo
  c.circ(14, 14, 14, 'a'); spiral(c, 14, 14, 14, 1.6, 'b', 4, 60); c.circ(14, 14, 11, 'k'); spiral(c, 14, 14, 12, 1.5, 'd', 2, 200); spiral(c, 14, 14, 12, 1.5, 'm', 1, 200); c.circ(14, 14, 3, 'k')
})
// ---- Hada ----
icon('fairy-wind', 'fairy', c => {          // brisa mágica
  c.line(0, 9, 17, 9, 'm', 2); arc(c, 17, 5, 4, -270, 0, 'm', 2)
  c.line(2, 16, 23, 16, 'l', 2); arc(c, 23, 12, 4, -270, 0, 'l', 2)
  c.line(0, 22, 13, 22, 'm', 2); arc(c, 13, 25, 3, 270, 0, 'm', 2)
  spark(c, 8, 4, 2, 'y'); spark(c, 23, 24, 3, 'y')
})
icon('dazzling-gleam', 'fairy', c => {      // destello que deslumbra
  star(c, 14, 14, 15, 3, 4, 'm'); star(c, 14, 14, 11, 3, 4, 'w', 0); star(c, 14, 14, 9, 2, 4, 'y', -45)
  c.circ(14, 14, 3, 'w'); spark(c, 4, 4, 2, 'y'); spark(c, 24, 23, 2, 'y')
})
icon('draining-kiss', 'fairy', c => {       // labios y corazón
  c.poly([0, 15, 6, 10, 10, 10, 14, 13, 18, 10, 22, 10, 28, 15, 20, 22, 8, 22], 'r')
  c.poly([0, 15, 6, 10, 10, 10, 14, 13, 18, 10, 22, 10, 28, 15, 14, 16], 'o'); c.poly([0, 15, 14, 16, 28, 15, 14, 18], 'k'); c.rect(9, 19, 8, 1, 'w')
  heart(c, 20, 3, 3, 'm', 'w'); heart(c, 6, 4, 2, 'l', 'w')
})
icon('play-rough', 'fairy', c => {          // nube de polvo cómica
  for (const [x, y, r] of [[8, 16, 7], [20, 16, 7], [14, 10, 8], [14, 19, 7], [5, 11, 4], [23, 10, 4]]) c.circ(x, y, r, 'l')
  for (const [x, y, r] of [[7, 13, 3], [15, 7, 4], [22, 9, 2]]) c.circ(x, y, r, 'w')
  c.ellipse(14, 20, 11, 4, 'm')
  star(c, 8, 17, 4, 1, 5, 'y'); heart(c, 19, 12, 2, 'r', 'w'); fist(c, 14, 19, 6, 'a', 'b', 'w')
  c.rect(4, 25, 3, 3, 'r'); c.rect(22, 25, 3, 2, 'r'); c.rect(23, 23, 1, 2, 'k')
})
icon('disarming-voice', 'fairy', c => {     // grito encantador: ondas y corazones
  arc(c, 0, 14, 7, -60, 60, 'w', 2); arc(c, 0, 14, 13, -55, 55, 'l', 2); arc(c, 0, 14, 19, -45, 45, 'm', 2)
  heart(c, 21, 7, 3, 'r', 'w'); heart(c, 23, 19, 2, 'r', 'w')
})
icon('springtide-storm', 'fairy', c => {    // pétalos cayendo en remolino
  const flor = (x, y, r) => { for (const a of [-90, -18, 54, 126, 198]) { const [u, v] = pol(x, y, r, a); c.circ(u, v, Math.max(1, r - 1), 'm') } c.circ(x, y, Math.max(1, r - 2), 'y') }
  arc(c, 14, 12, 12, 30, 250, 'd', 1)
  flor(10, 8, 4); flor(21, 18, 3)
  leaf(c, 4, 18, 11, 25, 3, 'l', 'm', 'w'); leaf(c, 18, 2, 26, 7, 2, 'l', 'm', 'w'); leaf(c, 16, 25, 21, 27, 1, 'l', 'm', 'w')
})
icon('fleur-cannon', 'fairy', c => {        // flor gigante que dispara
  c.poly([14, 13, 28, 8, 28, 19], 'y'); c.poly([14, 13, 28, 11, 28, 16], 'w')
  for (const a of [0, 60, 120, 180, 240, 300]) { const [u, v] = pol(10, 14, 6, a); c.circ(u, v, 4, 'm'); }
  for (const a of [30, 150, 270]) { const [u, v] = pol(10, 14, 5, a); c.circ(u, v, 2, 'l') }
  c.circ(10, 14, 3, 'y'); c.circ(10, 14, 1, 'o')
})
