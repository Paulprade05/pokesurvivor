#!/usr/bin/env node
/* ============ fetch_items.js — iconos de objetos de Pokémon ============
 * Descarga los sprites de la Mochila de PokeAPI/sprites que usa el juego y los
 * deja en assets/items/<nombre>.png, todos de 30×30:
 *   - Los de 30×30 se guardan tal cual.
 *   - Los pequeños (24×24, los de la 3.ª generación) se centran en 30×30.
 *   - Los ampliados ×2 (64×64, Caramelos Exp.) se reducen a su tamaño real.
 *   - Los grandes (dibujos de 160×160, las Mentas) se reducen a 24 px de lado.
 *
 * La lista sale de la tabla de js/ui/icons.js (entre «objetos:begin» y
 * «objetos:end»): para añadir un icono basta con una línea allí y volver a
 * ejecutar esto. Sin dependencias; no vuelve a bajar lo que ya está.
 *
 *   node tools/fetch_items.js            descarga lo que falte
 *   node tools/fetch_items.js --force    vuelve a bajarlo todo
 *   node tools/fetch_items.js --check    sólo dice qué falta (no descarga)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'items');
const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/';
const SIZE = 30;          // lado de todos los iconos
const BIG = 24;           // lado máximo del dibujo al reducir los grandes

const force = process.argv.includes('--force');
const check = process.argv.includes('--check');

/** Los nombres de sprite de la tabla de icons.js. */
function wanted() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'ui', 'icons.js'), 'utf8');
  const m = /\/\* objetos:begin[\s\S]*?\*\/([\s\S]*?)\/\* objetos:end \*\//.exec(src);
  if (!m) throw new Error('No encuentro la tabla «objetos:begin … objetos:end» en js/ui/icons.js');
  const set = new Set();
  for (const v of m[1].matchAll(/:\s*'([a-z0-9-]+)'/g)) set.add(v[1]);
  return [...set].sort();
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'pokesurvivor-fetch-items' } }, res => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const ch = [];
      res.on('data', c => ch.push(c));
      res.on('end', () => resolve(Buffer.concat(ch)));
    }).on('error', reject);
  });
}

// ---------------- PNG: leer y escribir (sin entrelazado) ----------------

function decode(buf) {
  let p = 8, W = 0, H = 0, depth = 8, ctype = 6, inter = 0, pal = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); depth = d[8]; ctype = d[9]; inter = d[12]; }
    else if (type === 'PLTE') pal = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (inter) throw new Error('PNG entrelazado');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const bpp = Math.max(1, (ch * depth) >> 3), stride = (W * ch * depth + 7) >> 3;
  const px = Buffer.alloc(W * H * 4);
  let prev = Buffer.alloc(stride), q = 0;
  for (let y = 0; y < H; y++) {
    const f = raw[q++], line = Buffer.from(raw.subarray(q, q + stride));
    q += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const e = a + b - c, pa = Math.abs(e - a), pb = Math.abs(e - b), pc = Math.abs(e - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 255;
    }
    prev = line;
    const sample = (x, k) => {
      if (depth === 8) return line[x * ch + k];
      if (depth === 16) return line[(x * ch + k) * 2];
      const per = 8 / depth, sh = 8 - depth * (x % per + 1);
      return (line[Math.floor(x / per)] >> sh) & ((1 << depth) - 1);
    };
    for (let x = 0; x < W; x++) {
      let r, g, b, al = 255;
      if (ctype === 3) { const i = sample(x, 0); r = pal[i * 3]; g = pal[i * 3 + 1]; b = pal[i * 3 + 2]; al = trns && i < trns.length ? trns[i] : 255; }
      else if (ctype === 6) { r = sample(x, 0); g = sample(x, 1); b = sample(x, 2); al = sample(x, 3); }
      else if (ctype === 2) { r = sample(x, 0); g = sample(x, 1); b = sample(x, 2); }
      else if (ctype === 4) { r = g = b = sample(x, 0); al = sample(x, 1); }
      else { r = g = b = depth < 8 ? Math.round(sample(x, 0) * 255 / ((1 << depth) - 1)) : sample(x, 0); }
      const o = (y * W + x) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = al;
    }
  }
  return { W, H, px };
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4), crc = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encode({ W, H, px }) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(W); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------- normalizar a 30×30 ----------------

function bbox({ W, H, px }) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? { x: 0, y: 0, w: W, h: H } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** ¿Es pixel art ampliado ×k (bloques k×k iguales)? */
function blockScale({ W, H, px }) {
  for (const k of [4, 3, 2]) {
    if (W % k || H % k) continue;
    let ok = true;
    for (let y = 0; y < H && ok; y++) for (let x = 0; x < W && ok; x++) {
      if (px.readUInt32BE((y * W + x) * 4) !== px.readUInt32BE(((y - y % k) * W + x - x % k) * 4)) ok = false;
    }
    if (ok) return k;
  }
  return 1;
}

function shrink(im, k) {
  const W = im.W / k, H = im.H / k, px = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) im.px.copy(px, (y * W + x) * 4, (y * k * im.W + x * k) * 4, (y * k * im.W + x * k) * 4 + 4);
  return { W, H, px };
}

/** Copia la caja b de im centrada en un lienzo de SIZE×SIZE. */
function center(im, b) {
  const px = Buffer.alloc(SIZE * SIZE * 4);
  const ox = Math.floor((SIZE - b.w) / 2), oy = Math.floor((SIZE - b.h) / 2);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    im.px.copy(px, ((oy + y) * SIZE + ox + x) * 4, ((b.y + y) * im.W + b.x + x) * 4, ((b.y + y) * im.W + b.x + x) * 4 + 4);
  }
  return { W: SIZE, H: SIZE, px };
}

/** Reduce un dibujo grande (media por área, con alfa premultiplicado) para que quepa en BIG px. */
function resample(im, b) {
  const s = Math.max(b.w, b.h) / BIG, w = Math.max(1, Math.round(b.w / s)), h = Math.max(1, Math.round(b.h / s));
  const out = { W: w, H: h, px: Buffer.alloc(w * h * 4) }, N = 8;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, bl = 0, a = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const sx = Math.min(b.x + b.w - 1, Math.floor(b.x + (x + (i + 0.5) / N) * s));
      const sy = Math.min(b.y + b.h - 1, Math.floor(b.y + (y + (j + 0.5) / N) * s));
      const o = (sy * im.W + sx) * 4, al = im.px[o + 3];
      r += im.px[o] * al; g += im.px[o + 1] * al; bl += im.px[o + 2] * al; a += al;
    }
    const o = (y * w + x) * 4;
    if (a) { out.px[o] = Math.round(r / a); out.px[o + 1] = Math.round(g / a); out.px[o + 2] = Math.round(bl / a); }
    out.px[o + 3] = Math.round(a / (N * N));
  }
  return center(out, { x: 0, y: 0, w, h });
}

/** El PNG ya en 30×30 (null si es de 30×30 y se guarda tal cual) y qué se ha hecho. */
function normalize(buf) {
  let im = decode(buf);
  if (im.W === SIZE && im.H === SIZE) return [null, ''];
  const note = [];
  const k = blockScale(im);
  if (k > 1) { im = shrink(im, k); note.push('÷' + k); }
  const b = bbox(im);
  if (b.w <= SIZE && b.h <= SIZE) { note.push(`${im.W}×${im.H} → centrado en ${SIZE}×${SIZE}`); return [encode(center(im, b)), note.join(' ')]; }
  note.push(`${im.W}×${im.H} → reducido a ${BIG} px`);
  return [encode(resample(im, b)), note.join(' ')];
}

// ---------------- principal ----------------

(async () => {
  const names = wanted();
  fs.mkdirSync(OUT, { recursive: true });
  const missing = [], done = [], failed = [];
  let skipped = 0;
  const todo = names.filter(n => force || !fs.existsSync(path.join(OUT, n + '.png')));
  skipped = names.length - todo.length;
  if (check) {
    for (const n of todo) console.log('Falta:', n);
    console.log(`${names.length} iconos en la tabla, ${todo.length} sin descargar.`);
    process.exit(todo.length ? 1 : 0);
  }
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(todo.slice(i, i + 8).map(async n => {
      try {
        const buf = await get(BASE + n + '.png');
        if (!buf) { missing.push(n); return; }
        const [png, note] = normalize(buf);
        fs.writeFileSync(path.join(OUT, n + '.png'), png || buf);
        done.push(n + (note ? ` (${note})` : ''));
      } catch (e) { failed.push(`${n}: ${e.message}`); }
    }));
  }
  for (const d of done.sort()) console.log('Descargado:', d);
  if (skipped) console.log(`Ya estaban: ${skipped}`);
  if (missing.length) console.log('NO EXISTEN en PokeAPI/sprites (cambia el nombre en la tabla):', missing.join(', '));
  if (failed.length) console.log('Fallaron:', failed.join('; '));
  // Sobran: archivos que ya no usa la tabla (no se borran solos).
  const extra = fs.readdirSync(OUT).filter(f => f.endsWith('.png') && !names.includes(f.slice(0, -4)));
  if (extra.length) console.log('Sin uso en la tabla:', extra.join(', '));
  console.log(`${names.length} iconos en la tabla · ${done.length} descargados · ${missing.length + failed.length} con problemas.`);
  process.exit(missing.length || failed.length ? 1 : 0);
})();
