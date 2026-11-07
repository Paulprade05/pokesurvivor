// Normal, Fuego, Agua.
// ---- Normal ----
icon('quick-attack', 'normal', c => {       // cruzas como un rayo
  c.line(0, 25, 14, 13, 'd', 3); c.line(5, 26, 16, 16, 'l', 2); c.line(0, 18, 9, 10, 'l', 2)
  c.poly([27, 1, 22, 13, 19, 11, 19, 20, 12, 12, 15, 11, 16, 5], 'a')
  c.poly([25, 3, 20, 11, 17, 10, 17, 17, 14, 12, 17, 11, 17, 6], 'w')
})
icon('swords-dance', 'normal', c => {       // dos espadas cruzadas
  for (const f of [1, 0]) {
    const X = v => f ? 27 - v : v
    c.line(X(3), 3, X(21), 21, 'm', 3); c.line(X(3), 3, X(20), 20, 'w', 1); c.line(X(16), 24, X(24), 16, 'b', 3)
    c.line(X(22), 22, X(26), 26, 'a', 3)
  }
  c.rect(12, 8, 4, 4, 'y')
})
icon('nasty-plot', 'normal', c => {         // la sonrisa de quien trama algo
  orb(c, 13, 15, 12, 'm', 'd', 'l', 'l')
  c.poly([4, 8, 11, 12, 11, 14, 5, 12], 'k'); c.poly([22, 8, 15, 12, 15, 14, 21, 12], 'k')
  c.px(8, 12, 'r'); c.px(18, 12, 'r')
  c.poly([4, 16, 22, 16, 18, 23, 8, 23], 'k')
  for (const x of [7, 11, 15, 19]) c.poly([x - 1, 16, x + 2, 16, x, 20], 'w')
  bolt(c, 23, 6, 6, 'y', 'y')
})
icon('agility', 'normal', c => {            // bota con ala
  c.poly([6, 3, 15, 3, 15, 13, 24, 17, 26, 23, 6, 23], 'm')
  c.poly([6, 3, 9, 3, 9, 20, 6, 20], 'l'); c.rect(6, 20, 21, 4, 'r'); c.rect(6, 23, 21, 2, 'b')
  c.rect(6, 7, 9, 2, 'b')
  c.poly([6, 12, 0, 6, 1, 10, 0, 12, 2, 13, 1, 16, 6, 17], 'w'); c.line(1, 9, 5, 13, 'd', 1)
})
icon('harden', 'normal', c => {             // caparazón que se endurece
  const hex = [14, 0, 26, 7, 26, 20, 14, 27, 1, 20, 1, 7]
  c.poly(hex, 'd'); c.poly([14, 3, 23, 8, 23, 19, 14, 24, 4, 19, 4, 8], 'm')
  c.poly([14, 3, 4, 8, 4, 19, 14, 13], 'l'); c.poly([14, 3, 23, 8, 14, 13], 'w')
  c.line(14, 13, 14, 24, 'd', 1); c.line(14, 13, 4, 8, 'd', 1); c.line(14, 13, 23, 8, 'd', 1)
})
icon('hyper-beam', 'normal', c => {         // rayo enorme
  c.poly([10, 8, 28, 2, 28, 25, 10, 19], 'o'); c.poly([10, 10, 28, 7, 28, 20, 10, 17], 'y'); c.poly([10, 12, 28, 11, 28, 16, 10, 15], 'w')
  orb(c, 8, 13, 8, 'o', 'r', 'y', 'w'); c.circ(8, 13, 3, 'w')
})
icon('rapid-spin', 'normal', c => {         // peonza
  arc(c, 14, 12, 14, 195, 255, 'l', 2); arc(c, 14, 12, 14, 285, 345, 'l', 2)
  c.rect(12, 1, 4, 6, 'b')
  c.ellipse(14, 12, 12, 6, 'm'); c.poly([3, 14, 25, 14, 15, 27, 13, 27], 'm')
  c.poly([3, 14, 14, 14, 14, 27, 13, 27], 'l'); c.poly([18, 14, 25, 14, 15, 27, 14, 27], 'd')
  c.ellipse(13, 10, 8, 3, 'w'); c.rect(2, 12, 24, 3, 'r')
})
icon('swift', 'normal', c => {              // estrellas que no fallan
  c.line(0, 26, 12, 15, 'y', 2); c.line(9, 6, 16, 3, 'y', 1); c.line(0, 12, 6, 8, 'y', 1); c.line(13, 27, 20, 22, 'y', 1)
  star(c, 16, 11, 11, 5, 5, 'y'); star(c, 16, 12, 6, 3, 5, 'w')
  star(c, 7, 8, 5, 2, 5, 'o'); star(c, 22, 22, 5, 2, 5, 'o')
})
icon('perish-song', 'normal', c => {        // nota con calavera
  c.rect(19, 2, 3, 16, 's'); c.poly([19, 2, 28, 6, 28, 12, 22, 9], 's')
  c.circ(10, 17, 9, 'g'); c.rect(6, 22, 9, 5, 'g')
  c.poly([4, 15, 9, 14, 9, 19, 5, 19], 'k'); c.poly([11, 14, 16, 15, 15, 19, 11, 19], 'k'); c.px(10, 20, 'k')
  c.vline(8, 24, 3, 'k'); c.vline(11, 24, 3, 'k')
})

// ---- Fuego ----
icon('ember', 'fire', c => {                // una brasa que salta
  rock(c, 10, 17, 9, 'b', 'd', 'a')
  c.poly([5, 16, 10, 12, 8, 17, 13, 15, 12, 21, 7, 21], 'o')
  flame(c, 20, 13, 13); c.rect(4, 4, 2, 2, 'a'); c.rect(11, 3, 2, 2, 'm'); c.rect(25, 22, 2, 2, 'a')
})
icon('flamethrower', 'fire', c => {         // chorro de llamas que se abre
  c.poly([0, 14, 8, 8, 14, 10, 20, 3, 21, 8, 28, 5, 26, 12, 28, 16, 25, 18, 27, 24, 20, 21, 17, 26, 13, 19, 7, 20], 'm')
  c.poly([0, 14, 9, 11, 15, 13, 22, 9, 21, 14, 24, 19, 17, 17, 11, 18], 'a')
  c.poly([0, 14, 9, 13, 15, 14, 9, 16], 'w')
})
icon('flame-wheel', 'fire', c => {          // rueda de fuego
  for (let a = 0; a < 360; a += 45) { const [x, y] = pol(14, 14, 11, a), [u, v] = pol(14, 14, 14, a + 18); c.line(x, y, u, v, 'm', 3) }
  c.ring(14, 14, 10, 'b'); c.ring(14, 14, 9, 'a'); c.ring(14, 14, 8, 'a'); c.ring(14, 14, 7, 'd')
  for (let a = 0; a < 180; a += 45) { const [x, y] = pol(14, 14, 7, a), [u, v] = pol(14, 14, 7, a + 180); c.line(x, y, u, v, 'a', 1) }
  c.circ(14, 14, 2, 'w')
})
icon('flame-charge', 'fire', c => {         // te lanzas en llamas
  c.poly([0, 6, 8, 8, 4, 2, 14, 5, 12, 1, 26, 9, 28, 15, 26, 22, 12, 26, 15, 22, 3, 25, 8, 19, 0, 19, 7, 14], 'm')
  c.poly([7, 10, 15, 8, 25, 11, 26, 16, 23, 21, 13, 21, 9, 17, 13, 14], 'a')
  orb(c, 20, 15, 6, 'w', 'a', 'w', 'w'); c.rect(21, 13, 2, 3, 'k')
})
icon('pyro-ball', 'fire', c => {            // balón ardiendo
  flame(c, 14, 17, 17)
  orb(c, 14, 17, 10, 'g', 's', 'w', 'w')
  c.poly([14, 13, 18, 16, 16, 21, 12, 21, 10, 16], 'k')
  c.line(14, 13, 14, 8, 'k', 1); c.line(18, 16, 23, 14, 'k', 1); c.line(10, 16, 5, 14, 'k', 1); c.line(16, 21, 19, 25, 'k', 1); c.line(12, 21, 9, 25, 'k', 1)
})
icon('fire-pledge', 'fire', c => {          // mar de fuego
  c.ellipse(14, 23, 14, 4, 'b'); c.ellipse(14, 23, 11, 3, 'a'); c.ellipse(14, 23, 6, 1, 'w')
  flame(c, 6, 22, 12); flame(c, 21, 22, 13); flame(c, 14, 23, 19)
})
// ---- Agua ----
icon('water-gun', 'water', c => {           // chorro que empuja
  c.line(0, 26, 17, 9, 'd', 6); c.line(0, 26, 16, 10, 'm', 4); c.line(0, 25, 15, 10, 'l', 2)
  c.ellipse(19, 7, 7, 6, 'm'); c.ellipse(18, 6, 4, 3, 'l'); c.rect(16, 4, 2, 2, 'w')
  drop(c, 25, 19, 2); drop(c, 25, 4, 1); c.rect(12, 2, 3, 3, 'l'); c.rect(17, 18, 2, 2, 'l')
})
function bubbleAt(c, x, y, r) {
  c.circ(x, y, r, 'l'); c.circ(x, y, r - 1, 'd'); c.circ(x, y, r - 1, 'm')
  arc(c, x, y, r - 1, 110, 250, 'l', 1); if (r >= 3) c.rect(x - R(r / 2), y - R(r / 2), Math.max(1, R(r / 3)), Math.max(1, R(r / 3)), 'w')
}
icon('bubble', 'water', c => { bubbleAt(c, 11, 16, 10); bubbleAt(c, 23, 7, 4); bubbleAt(c, 24, 21, 3) })
icon('hydro-pump', 'water', c => {          // chorro brutal
  c.rect(0, 6, 28, 16, 'd'); c.rect(0, 8, 28, 12, 'm'); c.rect(0, 10, 28, 5, 'l'); c.rect(0, 12, 28, 1, 'w')
  c.poly([18, 4, 24, 0, 22, 6], 'l'); c.poly([18, 23, 25, 27, 22, 21], 'l')
  c.poly([22, 4, 28, 3, 28, 8, 24, 7], 'm'); c.poly([22, 23, 28, 25, 28, 20, 24, 21], 'm')
  c.rect(4, 3, 3, 2, 'l'); c.rect(9, 23, 3, 2, 'l')
})
icon('aqua-ring', 'water', c => {           // aros de agua
  c.ellipse(14, 19, 13, 6, 'd'); c.ellipse(14, 18, 12, 5, 'l'); c.ellipse(14, 18, 9, 3, 'k');
  c.rect(4, 15, 4, 1, 'w')
  drop(c, 14, 14, 5)
  c.ellipse(14, 7, 8, 3, 'd'); c.ellipse(14, 7, 7, 2, 'l'); c.ellipse(14, 7, 5, 1, 'k'); c.rect(11, 5, 3, 1, 'w')
})
icon('bubble-beam', 'water', c => {         // cortina ondulante de burbujas
  bubbleAt(c, 3, 22, 2); bubbleAt(c, 9, 15, 3); bubbleAt(c, 15, 20, 3); bubbleAt(c, 20, 10, 6); bubbleAt(c, 25, 21, 3); bubbleAt(c, 9, 5, 3)
})
icon('whirlpool', 'water', c => {           // remolino visto desde arriba
  c.ellipse(14, 14, 14, 13, 'b'); spiral(c, 14, 14, 13, 2.1, 'd', 3, 200); spiral(c, 14, 14, 13, 2.1, 'm', 2, 200); spiral(c, 14, 13, 12, 2.1, 'l', 1, 200)
  c.circ(14, 14, 2, 'k'); c.rect(23, 2, 2, 2, 'w'); c.rect(2, 22, 2, 2, 'w')
})
icon('waterfall', 'water', c => {           // cae y arrastra
  c.rect(5, 0, 18, 22, 'd'); c.rect(6, 0, 16, 22, 'm')
  for (const [x, y, h] of [[8, 0, 12], [12, 6, 12], [16, 0, 9], [19, 9, 10], [10, 15, 6]]) { c.vline(x, y, h, 'l'); c.vline(x + 1, y + 1, h - 4, 'w') }
  c.ellipse(14, 23, 14, 4, 'l'); c.ellipse(14, 23, 10, 2, 'w')
  c.rect(1, 16, 2, 2, 'l'); c.rect(25, 15, 2, 2, 'l')
})
icon('water-shuriken', 'water', c => {      // estrella de agua
  star(c, 14, 14, 15, 5, 4, 'd', -45); star(c, 14, 14, 13, 5, 4, 'm', -45);
  c.poly([14, 14, 3, 3, 12, 9], 'l'); c.poly([14, 14, 25, 3, 19, 12], 'l'); c.poly([14, 14, 25, 25, 16, 19], 'l'); c.poly([14, 14, 3, 25, 9, 16], 'l')
  c.circ(14, 14, 3, 'b'); c.circ(14, 14, 1, 'w')
})
