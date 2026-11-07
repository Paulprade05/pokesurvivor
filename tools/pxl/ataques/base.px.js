// Iconos de ataques: colores por tipo y piezas comunes. Se dibuja a 28×28 y el contorno lo lleva a 30×30.
const PALS = {
  normal:   ['#8f8574', '#cfc6b4', '#f1ebdd', '#ffffff', '#ffe9a8', '#a8916a'],
  fire:     ['#c2401b', '#ff7b3d', '#ffb070', '#fff6d0', '#ffd23f', '#ff4a1c'],
  water:    ['#2a5cc4', '#4b9bff', '#9cd0ff', '#f0faff', '#d6f0ff', '#1d3b8a'],
  grass:    ['#2f8a3a', '#5fcb6a', '#a8eea0', '#f0ffe8', '#9a6a34', '#1d5a26'],
  electric: ['#c49a10', '#ffd33d', '#fff3a0', '#ffffff', '#fffbe0', '#ff9a1c'],
  ice:      ['#3a9cb8', '#7fe0e0', '#d2fbff', '#ffffff', '#ffffff', '#4b9bff'],
  fighting: ['#9a2a1d', '#e0533d', '#ff9a80', '#fff0e8', '#ffd2a0', '#7a3a1a'],
  poison:   ['#6e2a86', '#b45ec4', '#e0a6ec', '#fff0ff', '#e8b0ff', '#4a1a5a'],
  ground:   ['#8f6a2a', '#d6b25c', '#f0dca0', '#fff8e0', '#8a5a2a', '#5a3a1a'],
  flying:   ['#5a74c4', '#9bb8ff', '#dce8ff', '#ffffff', '#ffffff', '#3a4f9a'],
  psychic:  ['#b82a66', '#ff5f9e', '#ffb0d0', '#ffffff', '#c47bff', '#6a1a4a'],
  bug:      ['#64801a', '#a3c43d', '#d8ef8a', '#fbffe0', '#5a3a1a', '#3a5a10'],
  rock:     ['#7a6a3a', '#bfa96b', '#e4d6a6', '#fff8e0', '#8a7a5a', '#4a3e22'],
  ghost:    ['#463a86', '#7a6bc4', '#b8acf0', '#f4f0ff', '#ff8ad8', '#2a2050'],
  dragon:   ['#3a2ab8', '#6b58ff', '#b0a6ff', '#f0eeff', '#ffb03d', '#24186e'],
  dark:     ['#3e342e', '#7d6c60', '#b4a294', '#f0e6dc', '#ff5f6d', '#241e1a'],
  steel:    ['#66788a', '#a8b8c4', '#e4eef4', '#ffffff', '#ffffff', '#3e4a58'],
  fairy:    ['#c45a9a', '#ff9ed8', '#ffd8f0', '#ffffff', '#ffe14d', '#8a2a6a']
}
// d sombra, m base, l luz, w brillo, a acento, b acento oscuro. Comunes: k contorno, g gris claro, s gris oscuro, y amarillo, r rojo.
const icon = (id, type, ...items) => {
  const [d, m, l, w, a, b] = PALS[type]
  pal({ k: '#1b1528', d, m, l, w, a, b, g: '#e4ecf6', s: '#7d8899', y: '#ffe14d', r: '#ff5f6d', o: '#ff9a1c', p: '#ff8ad8', c: '#ffffff' })
  sprite(id, { w: 28, h: 28, outline: 'k' }, ...items)
}
const R = Math.round, TAU = Math.PI * 2, DEG = Math.PI / 180
const pol = (x, y, r, a) => [R(x + Math.cos(a * DEG) * r), R(y + Math.sin(a * DEG) * r)]

/** Bola sombreada: luz arriba a la izquierda. */
function orb(c, x, y, r, m = 'm', d = 'd', l = 'l', w = 'w') {
  c.circ(x, y, r, m)
  for (let j = -r - 1; j <= r + 1; j++) for (let i = -r - 1; i <= r + 1; i++) {
    if (i * i + j * j > r * r + r) continue
    const t = (i + j) / r
    if (t > 0.72) c.px(x + i, y + j, d)
    else if (t < -0.55) c.px(x + i, y + j, l)
  }
  if (r >= 3) { const q = Math.max(1, R(r / 3)); c.rect(x - R(r * .55), y - R(r * .55), q, q, w) }
}
/** Arco de grosor w (grados, 0 = derecha, sentido del reloj). */
function arc(c, x, y, r, a0, a1, col, w = 2) {
  const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r / 30))
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pol(x, y, r, a0 + (a1 - a0) * i / n), [x1, y1] = pol(x, y, r, a0 + (a1 - a0) * (i + 1) / n)
    c.line(x0, y0, x1, y1, col, w)
  }
}
/** Espiral de fuera a dentro. */
function spiral(c, x, y, r, turns, col, w = 2, a0 = 0) {
  const n = R(turns * 24); let p = pol(x, y, r, a0)
  for (let i = 1; i <= n; i++) {
    const t = i / n, q = pol(x, y, r * (1 - t) + .5, a0 + t * turns * 360)
    c.line(p[0], p[1], q[0], q[1], col, w); p = q
  }
}
/** Llama: x, y base central; h alto. */
function flame(c, x, y, h, m = 'm', a = 'a', w = 'w') {
  const s = h / 12, q = (...p) => p.flatMap(([u, v]) => [R(x + u * s), R(y - v * s)])
  c.poly(q([-5, 0], [-6, 3], [-5, 6], [-3, 5], [-3, 9], [0, 12], [1, 8], [3, 10], [4, 6], [6, 4], [5, 0], [2, -1], [-2, -1]), m)
  c.poly(q([-3, 0], [-3, 3], [-1, 5], [0, 8], [2, 5], [3, 3], [3, 0], [1, -1], [-1, -1]), a)
  if (h >= 9) c.poly(q([-1, 0], [-1, 2], [0, 4], [1, 2], [1, 0]), w)
}
/** Gota: x, y centro de la panza. */
function drop(c, x, y, r, m = 'm', d = 'd', l = 'l') {
  c.poly([x - r + 1, y - 1, x, y - r * 2, x + 1, y - r * 2, x + r, y - 1], m)
  orb(c, x, y, r, m, d, l, 'w')
}
/** Hoja de x0,y0 (tallo) a x1,y1. */
function leaf(c, x0, y0, x1, y1, w = 3, m = 'm', d = 'd', l = 'l') {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = -dy / L * w, uy = dx / L * w
  const mx = x0 + dx * .45, my = y0 + dy * .45
  c.poly([x0, y0, mx + ux, my + uy, x1, y1, mx - ux, my - uy].map(R), m)
  c.poly([x0, y0, mx + ux, my + uy, x1, y1].map(R), d)
  c.poly([x0, y0, mx - ux * .6, my - uy * .6, x0 + dx * .8, y0 + dy * .8].map(R), l)
  c.line(R(x0), R(y0), R(x0 + dx * .8), R(y0 + dy * .8), d, 1)
}
/** Rayo con punta abajo. s: escala (10 = 20 de alto). */
function bolt(c, x, y, s, m = 'm', w = 'w') {
  const q = pts => pts.flatMap(([u, v]) => [R(x + u * s / 10), R(y + v * s / 10)])
  c.poly(q([[3, -10], [-6, 2], [-1, 2], [-3, 10], [6, -2], [1, -2]]), m)
  if (s >= 7) c.poly(q([[2, -8], [-4, 1], [-1, 1], [0, -2]]), w)
}
/** Estrella de n puntas. */
function star(c, x, y, ro, ri, n, col, a0 = -90) {
  const p = []
  for (let i = 0; i < n * 2; i++) p.push(...pol(x, y, i % 2 ? ri : ro, a0 + i * 180 / n))
  c.poly(p, col)
}
/** Destello de cuatro puntas. */
const spark = (c, x, y, r, col = 'w') => { c.hline(x - r, y, r * 2 + 1, col); c.vline(x, y - r, r * 2 + 1, col); if (r >= 3) c.rect(x - 1, y - 1, 3, 3, col) }
/** Roca facetada. */
function rock(c, x, y, r, m = 'm', d = 'd', l = 'l') {
  const P = (u, v) => [R(x + u * r), R(y + v * r)]
  c.poly([[-1, .2], [-.6, -.8], [.3, -1], [1, -.3], [.8, .8], [-.2, 1]].flatMap(([u, v]) => P(u, v)), m)
  c.poly([[.1, .2], [1, -.3], [.8, .8], [-.2, 1]].flatMap(([u, v]) => P(u, v)), d)
  c.poly([[-.8, .1], [-.5, -.7], [.2, -.8], [.1, .2]].flatMap(([u, v]) => P(u, v)), l)
}
/** Puño de frente: cuatro nudillos y pulgar. */
function fist(c, x, y, s = 12, m = 'a', d = 'd', l = 'w') {
  const h = R(s * .55), n = R(s / 4), x0 = R(x - s / 2)
  c.rect(x0, y - h, s, h * 2, m)
  c.rect(x0, y + h - 2, s, 2, d)
  for (let i = 1; i < 4; i++) c.vline(x0 + n * i, y - h, h, d)
  c.rect(x0, y + 1, R(s * .7), 2, l)
}
/** Corazón. */
function heart(c, x, y, r, m = 'm', l = 'l') {
  c.circ(x - r + 1, y - 1, r - 1, m); c.circ(x + r - 1, y - 1, r - 1, m)
  c.poly([x - 2 * r + 1, y, x + 2 * r - 1, y, x + 1, y + 2 * r - 1, x, y + 2 * r - 1], m)
  c.px(x - r, y - 2, l); c.px(x - r - 1, y - 1, l)
}
/** Pluma de x0,y0 (cañón) a x1,y1. */
function feather(c, x0, y0, x1, y1, w = 3, m = 'l', d = 'm', e = 'b') {
  leaf(c, x0, y0, x1, y1, w, m, d, 'w')
  c.line(R(x0), R(y0), R(x0 - (x1 - x0) * .2), R(y0 - (y1 - y0) * .2), e, 1)
}
/** Tajo curvo en forma de media luna. a: hacia dónde mira el vientre; ap: media abertura. */
function slash(c, x, y, r, a, ap, m = 'l', w = 'w', g = 3) {
  arc(c, x, y, r, a - ap, a + ap, m, g); arc(c, x, y, r, a - ap * .55, a + ap * .55, w, Math.max(1, g - 1))
}
/** Sombra de suelo. */
const shadow = (c, x, y, rx, ry = 2, col = 's') => c.ellipse(x, y, rx, ry, col)
/** Silueta de enemigo: la víctima, en gris. */
function foe(c, x, y, s = 6, m = 's', w = 'k') {
  c.circ(x, y - s, s - 1, m); c.ellipse(x, y + 2, s, s, m)
  c.px(x - 2, y - s, w); c.px(x + 2, y - s, w)
}
