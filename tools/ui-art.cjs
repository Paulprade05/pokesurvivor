// Arte de la interfaz «Raíces vivas» (13-11-2026): marcos, botones, medallones y textura.
// Uso: node tools/ui-art.cjs   ->  assets/ui/*.svg y assets/ui/musgo.png
// La interfaz no es pixel art (eso es el mundo y los Pokémon, docs/ESTILO-ARTE.md): es vector, como un juego
// ilustrado. Todo sale de aquí para que el estilo sea uno solo; no se editan los SVG a mano.
//   - Marcos (9 trozos, CSS border-image): corteza oscura con borde claro, raíces que abrazan las esquinas,
//     hojas y setas que brillan. Las esquinas llevan el adorno; los lados son lisos y se estiran. Por dentro son
//     transparentes: el musgo lo pone el fondo del panel (--panel-bg), así no se ve una franja de otro tono.
//   - Colores: corteza #2a1a0d..#8a6038, musgo #07110a..#172a1c, hoja #4a8e4e..#b6e28a, setas rosa #ff6ad5 y turquesa #5ff2d6.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const OUT = path.join(__dirname, '..', 'assets', 'ui');
fs.mkdirSync(OUT, { recursive: true });
const write = (name, w, h, body) => {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body.replace(/\s*\n\s*/g, ' ')}</svg>\n`;
  fs.writeFileSync(path.join(OUT, name), s);
  return s.length;
};

const BARK = `<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a6038"/><stop offset=".5" stop-color="#4e331d"/><stop offset="1" stop-color="#2a1a0d"/></linearGradient>
  <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <radialGradient id="cap1" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#ffe0f6"/><stop offset=".4" stop-color="#ff6ad5"/><stop offset="1" stop-color="#8a1f6e"/></radialGradient>
  <radialGradient id="cap2" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#e6fffa"/><stop offset=".4" stop-color="#5ff2d6"/><stop offset="1" stop-color="#0f6b5e"/></radialGradient>`;
const leaf = (x, y, r, s = 1, c = '#5aa05a') => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 0 C6 -8 18 -9 26 -2 C18 4 7 6 0 0 Z" fill="${c}" stroke="#14240f" stroke-width="1.2"/><path d="M2 0 C10 -2 17 -3 24 -2" stroke="#b6e28a" stroke-width=".9" fill="none" opacity=".8"/></g>`;
const shroom = (x, y, s, cap) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#glow)"><path d="M-2 0 C-2 -6 2 -6 2 0 Z" fill="#e9dcc4"/><path d="M-8 -5 C-8 -13 8 -13 8 -5 C4 -6 -4 -6 -8 -5 Z" fill="url(#${cap})"/><circle cx="-3" cy="-9" r="1.1" fill="#fff" opacity=".9"/></g>`;
// Raíz que abraza una esquina (la de arriba a la izquierda; las demás, girándola).
const ROOT = 'M4 46 C16 40 10 22 22 16 C30 10 40 18 46 6 M18 70 C10 60 16 52 8 46';
const root = (tf = '') => `<g transform="${tf}"><path d="${ROOT}" fill="none" stroke="#1a0f07" stroke-width="7" stroke-linecap="round"/><path d="${ROOT}" fill="none" stroke="url(#b)" stroke-width="4" stroke-linecap="round"/></g>`;
const BG = (id, a, b) => `<radialGradient id="${id}" cx=".5" cy=".42" r=".78"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`;

const sizes = {};
// ---- marco.svg: paneles grandes (ventanas, hojas). 220 px, 9 trozos de 86. ----
{
  const N = 220;
  sizes['marco.svg'] = write('marco.svg', N, N, `<defs>${BARK}${BG('bg', '#172a1c', '#07110a')}</defs>
    <rect x="9" y="9" width="${N - 18}" height="${N - 18}" rx="20" fill="none" stroke="#1a0f07" stroke-width="12"/>
    <rect x="9" y="9" width="${N - 18}" height="${N - 18}" rx="20" fill="none" stroke="url(#b)" stroke-width="8"/>
    <rect x="7" y="7" width="${N - 14}" height="${N - 14}" rx="21" fill="none" stroke="#a87a48" stroke-width="1.5" opacity=".7"/>
    ${root()}${root(`rotate(180 ${N / 2} ${N / 2})`)}
    ${leaf(40, 10, -20, 1.1)}${leaf(12, 36, 110, .9, '#4a8e4e')}${leaf(54, 6, 10, .7, '#6cb860')}
    ${leaf(N - 40, 10, 200, 1.1, '#4a8e4e')}${leaf(N - 14, 40, 70, .8)}
    ${leaf(N - 44, N - 10, 160, 1, '#4a8e4e')}${leaf(16, N - 40, -70, .9)}
    ${shroom(26, 22, 1.2, 'cap2')}${shroom(36, 18, .8, 'cap1')}${shroom(N - 24, N - 14, 1.2, 'cap1')}${shroom(N - 36, N - 12, .8, 'cap2')}${shroom(N - 18, 30, .9, 'cap2')}${shroom(20, N - 18, .9, 'cap1')}`);
}
// ---- marco-s.svg: paneles pequeños (tarjetas, avisos, menús, HUD). 120 px, 9 trozos de 40. ----
{
  const N = 120;
  sizes['marco-s.svg'] = write('marco-s.svg', N, N, `<defs>${BARK}${BG('bg', '#16281b', '#08120b')}</defs>
    <rect x="6" y="6" width="${N - 12}" height="${N - 12}" rx="13" fill="none" stroke="#1a0f07" stroke-width="7"/>
    <rect x="6" y="6" width="${N - 12}" height="${N - 12}" rx="13" fill="none" stroke="url(#b)" stroke-width="4.5"/>
    <rect x="4.5" y="4.5" width="${N - 9}" height="${N - 9}" rx="14" fill="none" stroke="#a87a48" stroke-width="1" opacity=".7"/>
    ${leaf(16, 6, -15, .65)}${leaf(6, 18, 105, .5, '#4a8e4e')}${shroom(13, 13, .75, 'cap2')}
    ${leaf(N - 16, N - 6, 165, .65, '#4a8e4e')}${shroom(N - 13, N - 9, .75, 'cap1')}`);
}
// ---- marco-liso.svg: lo mismo sin adornos (filas, listas, casillas que se repiten). ----
{
  const N = 60;
  sizes['marco-liso.svg'] = write('marco-liso.svg', N, N, `<defs>${BARK}${BG('bg', '#1a2e1f', '#0b170e')}</defs>
    <rect x="4" y="4" width="${N - 8}" height="${N - 8}" rx="10" fill="none" stroke="#1a0f07" stroke-width="5"/>
    <rect x="4" y="4" width="${N - 8}" height="${N - 8}" rx="10" fill="none" stroke="url(#b)" stroke-width="3"/>`);
}
// ---- Botones: 120 × 60, 9 trozos de 28 (arriba y abajo) y 30 (lados). ----
const button = (name, top, mid, bot, gloss, sprout) => {
  const N = 120, H = 60;
  sizes[name] = write(name, N, H, `<defs>${BARK}<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs>
    <rect x="5" y="5" width="${N - 10}" height="${H - 10}" rx="22" fill="url(#f)" stroke="#1a0f07" stroke-width="6"/>
    <rect x="5" y="5" width="${N - 10}" height="${H - 10}" rx="22" fill="none" stroke="url(#b)" stroke-width="3.5"/>
    <path d="M22 11 H${N - 22}" stroke="rgba(255,255,255,${gloss})" stroke-width="2" stroke-linecap="round"/>
    ${sprout ? `<path d="M2 40 C8 30 4 22 12 14" fill="none" stroke="url(#b)" stroke-width="3" stroke-linecap="round"/>${leaf(8, 16, -60, .5)}` : ''}`);
};
button('boton.svg', '#2a4530', '#1a2e1f', '#0a160c', .14, true);           // normal (secundario)
button('boton-pri.svg', '#d8ff9a', '#7fd85a', '#2f7a2a', .6, true);        // principal: hoja que brilla
button('boton-peligro.svg', '#ff9a8a', '#d8433a', '#7a1a14', .45, false);  // abandonar, borrar
button('boton-ambar.svg', '#ffe6a0', '#f2c35a', '#9a6418', .55, true);     // comprar, monedas
// ---- medalla.svg: hueco redondo (ataques, retrato, pausa, iconos). 100 px. ----
{
  sizes['medalla.svg'] = write('medalla.svg', 100, 100, `<defs>${BARK}${BG('mb', '#1c3322', '#06100a')}</defs>
    <circle cx="50" cy="50" r="44" fill="url(#mb)" stroke="#1a0f07" stroke-width="10"/><circle cx="50" cy="50" r="44" fill="none" stroke="url(#b)" stroke-width="6"/>
    <path d="M14 22 C6 30 4 40 6 50" fill="none" stroke="#a87a48" stroke-width="1.5" opacity=".7"/>${leaf(66, 10, 20, .8)}`);
  sizes['medalla-vacia.svg'] = write('medalla-vacia.svg', 100, 100, `<defs>${BARK}</defs>
    <circle cx="50" cy="50" r="44" fill="rgba(6,16,10,.55)" stroke="#1a0f07" stroke-width="8"/><circle cx="50" cy="50" r="44" fill="none" stroke="url(#b)" stroke-width="4" stroke-dasharray="10 7"/>`);
}
// ---- separador.svg: raíz con dos hojas y una baya (debajo de los títulos). 300 × 40, se estira. ----
sizes['separador.svg'] = write('separador.svg', 300, 40, `<defs>${BARK}</defs>
  <path d="M10 22 C60 26 100 12 150 16 C200 20 240 10 290 18" fill="none" stroke="#1a0f07" stroke-width="6" stroke-linecap="round"/>
  <path d="M10 22 C60 26 100 12 150 16 C200 20 240 10 290 18" fill="none" stroke="url(#b)" stroke-width="3.5" stroke-linecap="round"/>
  ${leaf(150, 16, -150, .9)}${leaf(150, 16, -30, .9)}<circle cx="150" cy="16" r="5" fill="#ff6ad5" stroke="#1a0f07" stroke-width="1.5"/><circle cx="148.5" cy="14.5" r="1.5" fill="#fff" opacity=".8"/>`);

// ---- musgo.png: textura del fondo de los paneles (128 × 128, se repite sin costura). ----
// Ruido de valor suave (dos escalas) en blanco con poca opacidad: se pone encima del verde musgo.
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
{
  const W = 128, px = Buffer.alloc(W * W * 4);
  let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const grid = g => { const a = []; for (let i = 0; i < g * g; i++) a.push(rnd()); return a; };
  const sm = t => t * t * (3 - 2 * t);
  const val = (a, g, x, y) => { const fx = x * g / W, fy = y * g / W, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
    const v = (i, j) => a[((j % g) * g) + (i % g)]; return (v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx) * (1 - ty) + (v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx) * ty; };
  const A = grid(8), B = grid(32);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const n = val(A, 8, x, y) * .6 + val(B, 32, x, y) * .4, i = (y * W + x) * 4;
    px[i] = 200; px[i + 1] = 255; px[i + 2] = 190; px[i + 3] = Math.round(Math.max(0, n - .4) * 18);
  }
  const b = png(W, W, px); fs.writeFileSync(path.join(OUT, 'musgo.png'), b); sizes['musgo.png'] = b.length;
}
console.log(Object.entries(sizes).map(([k, v]) => `${k} ${(v / 1024).toFixed(1)} KB`).join('\n'));
