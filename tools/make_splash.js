/* Pantallas de arranque del iPhone y del iPad: lo que se ve al abrir el juego desde el
 * icono de la pantalla de inicio mientras carga (sin ellas, iOS enseña un
 * fondo blanco). Fondo azul marino (#0a1430, el del icono y el manifest) y el
 * icono en el centro, con los píxeles nítidos.
 *
 *   node tools/make_splash.js        -> assets/splash/*.png
 *
 * - Lee assets/icons/icon-512.png (si cambia el icono: antes python tools/make_icons.py).
 * - Por cada tamaño de iPhone o iPad (DEVICES) escribe una imagen en vertical y otra en
 *   horizontal. El icono va escalado a un factor entero (×1 o ½, el vecino más
 *   cercano: nada borroso) y ocupa alrededor de un tercio del lado corto.
 * - iPhone: el juego es sólo horizontal (24-10-2026). iOS no hace caso de la
 *   orientación del manifest y, si la app se abre con el móvil de pie, enseña la
 *   imagen «portrait»: ésa es la misma pantalla horizontal girada 90° (el icono de
 *   lado), para que se vea bien al girarlo, que es lo que pide el juego al cargar
 *   («Gira el móvil»). Los iPad siguen con las dos orientaciones normales.
 * - Rehace en dev.html el bloque entre <!-- splash:begin --> y <!-- splash:end -->
 *   con las etiquetas <link rel="apple-touch-startup-image"> (tamaño en px CSS =
 *   píxeles del aparato / su densidad). Para un aparato nuevo: añadirlo a DEVICES.
 * Sin dependencias: zlib de Node y un lector y un escritor de PNG mínimos.
 */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'assets', 'icons', 'icon-512.png');
const OUT = path.join(ROOT, 'assets', 'splash');
const BG = [10, 20, 48];                                  // #0a1430

// [ancho, alto] en vertical (píxeles del aparato), densidad y modelos.
const DEVICES = [
  [1320, 2868, 3, 'iPhone 16 Pro Max, 17 Pro Max'],
  [1260, 2736, 3, 'iPhone Air'],
  [1206, 2622, 3, 'iPhone 16 Pro, 17, 17 Pro'],
  [1290, 2796, 3, 'iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus'],
  [1179, 2556, 3, 'iPhone 14 Pro, 15, 15 Pro, 16'],
  [1284, 2778, 3, 'iPhone 12 Pro Max, 13 Pro Max, 14 Plus'],
  [1170, 2532, 3, 'iPhone 12, 12 Pro, 13, 13 Pro, 14, 16e'],
  [1125, 2436, 3, 'iPhone X, XS, 11 Pro, 12 mini, 13 mini'],
  [1242, 2688, 3, 'iPhone XS Max, 11 Pro Max'],
  [828, 1792, 2, 'iPhone XR, 11'],
  [1242, 2208, 3, 'iPhone 6 Plus, 7 Plus, 8 Plus'],
  [750, 1334, 2, 'iPhone 6, 7, 8, SE (2.ª y 3.ª gen.)'],
  [640, 1136, 2, 'iPhone 5, SE (1.ª gen.)'],
  // iPad (sin ellas, al abrir la app instalada también salía en blanco)
  [2064, 2752, 2, 'iPad Pro 13 (M4)'],
  [2048, 2732, 2, 'iPad Pro 12,9, iPad Air 13'],
  [1668, 2420, 2, 'iPad Pro 11 (M4)'],
  [1668, 2388, 2, 'iPad Pro 11 (1.ª a 4.ª gen.)'],
  [1640, 2360, 2, 'iPad 10.ª gen., iPad Air 4 y 5, iPad Air 11'],
  [1668, 2224, 2, 'iPad Pro 10,5, iPad Air 3'],
  [1620, 2160, 2, 'iPad 7.ª a 9.ª gen. (10,2)'],
  [1536, 2048, 2, 'iPad 9,7, iPad mini 2 a 5, iPad Air 1 y 2'],
  [1488, 2266, 2, 'iPad mini 6 y 7']
];

// ---------------- PNG ----------------
const CRC = new Int32Array(256).map((_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length), td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  out.writeUInt32BE(data.length, 0); td.copy(out, 4); out.writeUInt32BE(crc32(td), 8 + data.length);
  return out;
}
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Lee un PNG de 8 bits RGB o RGBA sin entrelazar (como los de make_icons.py) -> { w, h, rgba }. */
function readPng(file) {
  const b = fs.readFileSync(file);
  if (!b.subarray(0, 8).equals(SIG)) throw new Error(file + ': no es un PNG');
  let w = 0, h = 0, depth = 0, ctype = 0, inter = 0, o = 8;
  const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ctype = d[9]; inter = d[12]; }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (depth !== 8 || (ctype !== 6 && ctype !== 2) || inter) throw new Error(`${file}: sólo PNG de 8 bits RGB/RGBA sin entrelazar (es ${depth} bits, tipo ${ctype}, entrelazado ${inter})`);
  const bpp = ctype === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  // Filtros por fila: 0 nada, 1 Sub, 2 Up, 3 Average, 4 Paeth.
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, up = row - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[row + i - bpp] : 0, u = y ? px[up + i] : 0, c = y && i >= bpp ? px[up + i - bpp] : 0;
      let v = raw[src + i];
      if (f === 1) v += a;
      else if (f === 2) v += u;
      else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) { const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      else if (f !== 0) throw new Error(`${file}: filtro ${f} desconocido en la fila ${y}`);
      px[row + i] = v & 255;
    }
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = px[i * bpp]; rgba[i * 4 + 1] = px[i * bpp + 1]; rgba[i * 4 + 2] = px[i * bpp + 2];
    rgba[i * 4 + 3] = bpp === 4 ? px[i * bpp + 3] : 255;
  }
  return { w, h, rgba };
}

/** PNG con paleta (4 u 8 bits por píxel) de una imagen de índices; se queda con la compresión más pequeña. */
function writePng(file, w, h, idx, pal) {
  const bits = pal.length <= 16 ? 4 : 8, stride = bits === 4 ? (w + 1) >> 1 : w;
  const raw = Buffer.alloc((stride + 1) * h);              // filtro 0 en cada fila (lo mejor con paleta)
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1) + 1, s = y * w;
    if (bits === 8) for (let x = 0; x < w; x++) raw[o + x] = idx[s + x];
    else for (let x = 0; x < w; x += 2) raw[o + (x >> 1)] = (idx[s + x] << 4) | (x + 1 < w ? idx[s + x + 1] : 0);
  }
  const z = [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_RLE, zlib.constants.Z_FILTERED]
    .map(strategy => zlib.deflateSync(raw, { level: 9, memLevel: 9, strategy }))
    .reduce((a, b) => (b.length < a.length ? b : a));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = bits; ihdr[9] = 3; // paleta
  const plte = Buffer.from(pal.flat());
  const png = Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', z), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(file, png);
  return png.length;
}

// ---------------- composición ----------------
const icon = readPng(ICON);
if (icon.w !== icon.h) throw new Error('El icono debería ser cuadrado');
// Colores del icono (sobre el fondo, por si tuviera transparencia) -> paleta.
const pal = [BG.slice()], key = new Map([[BG.join(), 0]]);
const iconIdx = new Uint8Array(icon.w * icon.h);
for (let i = 0; i < icon.w * icon.h; i++) {
  const al = icon.rgba[i * 4 + 3] / 255;
  const c = [0, 1, 2].map(k => Math.round(icon.rgba[i * 4 + k] * al + BG[k] * (1 - al)));
  const k = c.join();
  if (!key.has(k)) { if (pal.length >= 256) throw new Error('El icono tiene más de 256 colores'); key.set(k, pal.length); pal.push(c); }
  iconIdx[i] = key.get(k);
}
// El mismo icono girado 90° a la derecha (pantallas de pie del iPhone: la horizontal, girada).
const S = icon.w, iconRot = new Uint8Array(S * S);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) iconRot[y * S + x] = iconIdx[(S - 1 - x) * S + y];
// Lo que se ve del icono: el borde de 1/32 por lado es del color del fondo.
const VISIBLE = 30 / 32, SCALES = [2, 1, 1 / 2, 1 / 4];

/** Escala del icono (entera o 1/entero) que lo deja más cerca del 36 % del lado corto. */
function scaleFor(short) {
  return SCALES.reduce((a, b) => (Math.abs(icon.w * b * VISIBLE - short * 0.36) < Math.abs(icon.w * a * VISIBLE - short * 0.36) ? b : a));
}

/** Índice de un color en la paleta (lo añade si no está). */
function palIdx(rgb) {
  const k = rgb.join();
  if (!key.has(k)) { if (pal.length >= 256) throw new Error('Paleta llena'); key.set(k, pal.length); pal.push(rgb); }
  return key.get(k);
}
// (Las demás imágenes se escriben con la paleta del icono sola: así no cambian.)
const PAL_ICON = pal.length;
const MUTED = palIdx([143, 163, 209]), YELLOW = palIdx([255, 203, 5]);   // --faint y --c-yellow de style.css

/**
 * Debajo del icono, en las de pie del iPhone: un móvil de pie, una flecha y el
 * mismo móvil tumbado (en amarillo), en píxeles de c×c. Se lee con el móvil de pie.
 */
function rotateHint(idx, w, cx, top, c) {
  const rect = (x, y, ww, hh, col) => {
    for (let j = 0; j < hh * c; j++) idx.fill(col, (top + y * c + j) * w + x0 + x * c, (top + y * c + j) * w + x0 + (x + ww) * c);
  };
  const frame = (x, y, ww, hh, col) => { rect(x, y, ww, 1, col); rect(x, y + hh - 1, ww, 1, col); rect(x, y, 1, hh, col); rect(x + ww - 1, y, 1, hh, col); };
  const W = 7 + 2 + 5 + 2 + 12, x0 = cx - (W * c >> 1);
  frame(0, 0, 7, 12, MUTED); rect(3, 10, 1, 1, MUTED);                 // de pie, con su botón
  rect(9, 6, 5, 1, MUTED); rect(11, 4, 1, 1, MUTED); rect(12, 5, 1, 1, MUTED); rect(12, 7, 1, 1, MUTED); rect(11, 8, 1, 1, MUTED);   // →
  frame(16, 3, 12, 7, YELLOW); rect(26, 6, 1, 1, YELLOW);              // tumbado
}

/** @param turned  el icono girado y el dibujo de girar el móvil (pantalla de pie del iPhone, ver arriba) */
function splash(w, h, turned) {
  const k = scaleFor(Math.min(w, h)), s = Math.round(icon.w * k), src = turned ? iconRot : iconIdx;
  const ox = (w - s) >> 1, oy = (h - s) >> 1;
  const idx = new Uint8Array(w * h);                       // 0 = fondo
  // Vecino más cercano, mirando el centro de cada píxel: con ½ toma justo los bloques pares.
  const map = new Int32Array(s).map((_, i) => Math.min(icon.w - 1, Math.floor((i + 0.5) / k)));
  for (let y = 0; y < s; y++) {
    const sy = map[y] * icon.w, row = (oy + y) * w + ox;
    for (let x = 0; x < s; x++) idx[row + x] = src[sy + map[x]];
  }
  if (turned) { const c = Math.max(4, Math.round(Math.min(w, h) / 100)); rotateHint(idx, w, w >> 1, oy + s + Math.round(s * 0.3), c); }
  return { idx, s, k };
}

fs.mkdirSync(OUT, { recursive: true });
const links = [];
let total = 0;
for (const [pw, ph, dpr, who] of DEVICES) {
  const iphone = /iPhone/.test(who);
  for (const land of [false, true]) {
    const w = land ? ph : pw, h = land ? pw : ph, name = `splash-${w}x${h}.png`;
    const turned = iphone && !land;
    const { idx, s, k } = splash(w, h, turned);
    const bytes = writePng(path.join(OUT, name), w, h, idx, turned ? pal : pal.slice(0, PAL_ICON));
    total += bytes;
    console.log(`${name.padEnd(24)} icono ${s}px (×${k}, ${Math.round(s * VISIBLE / Math.min(w, h) * 100)} %)${turned ? ' girado' : ''} · ${(bytes / 1024).toFixed(1)} KB · ${who}`);
    links.push(`<link rel="apple-touch-startup-image" media="(device-width: ${pw / dpr}px) and (device-height: ${ph / dpr}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${land ? 'landscape' : 'portrait'})" href="assets/splash/${name}">`);
  }
}
console.log(`ok: ${links.length} imágenes, ${(total / 1024).toFixed(0)} KB en total`);

// dev.html: las etiquetas entre las marcas (se rehacen enteras).
const DEV = path.join(ROOT, 'dev.html'), B = '<!-- splash:begin -->', E = '<!-- splash:end -->';
const dev = fs.readFileSync(DEV, 'utf8'), i = dev.indexOf(B), j = dev.indexOf(E);
if (i < 0 || j < i) {
  console.log('\ndev.html no tiene las marcas ' + B + ' / ' + E + '; estas son las etiquetas:\n' + links.join('\n'));
} else {
  const nl = dev.includes('\r\n') ? '\r\n' : '\n';        // el mismo fin de línea que el resto (Windows)
  const html = dev.slice(0, i + B.length) + nl + links.join(nl) + nl + dev.slice(j);
  if (html !== dev) { fs.writeFileSync(DEV, html); console.log('dev.html: etiquetas actualizadas'); }
  else console.log('dev.html: ya estaba al día');
}
