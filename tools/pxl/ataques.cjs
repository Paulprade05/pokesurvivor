// Construye los iconos de ataques de tools/pxl/ataques/ y los guarda en js/data/move-art.js.
// Uso: PXL=<carpeta de claude-pxl> node tools/pxl/ataques.cjs
//   Van como datos dentro del juego y no como PNG sueltos: se ven al instante, sin descargas ni caché propia, y artUrl los
//   pasa a SVG, que en iPhone aguanta mejor que un lienzo. pxl no entra en el repositorio: es sólo la herramienta de dibujo.
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const PXL = process.env.PXL;
if (!PXL) { console.error('Falta PXL=<carpeta de claude-pxl>'); process.exit(2); }
const ABC = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';
(async () => {
  const { loadProject } = await import(pathToFileURL(path.join(PXL, 'src/index.ts')).href);
  const p = loadProject(path.join(__dirname, 'ataques/ataques.px.js'));
  const pal = [null], index = new Map(), art = {};
  for (const id of p.exported().sort()) {
    const img = p.image(id);
    if (img.w !== 30 || img.h !== 30) throw new Error(`${id}: mide ${img.w}×${img.h}, no 30×30`);
    const cells = Array.from(img.data, v => {
      const n = v >>> 0;
      if ((n & 255) < 128) return 0;
      const hex = '#' + (n >>> 8).toString(16).padStart(6, '0');
      if (!index.has(hex)) { index.set(hex, pal.length); pal.push(hex); }
      return index.get(hex);
    });
    // Sus colores (dos letras cada uno, sitio en la paleta común), «:» y los tramos (color suyo y largo).
    const own = [...new Set(cells)].filter(Boolean);
    let s = own.map(v => ABC[v >> 6] + ABC[v & 63]).join('') + ':';
    for (let i = 0; i < 900;) {
      let n = 1;
      while (i + n < 900 && cells[i + n] === cells[i] && n < 64) n++;
      s += ABC[own.indexOf(cells[i]) + 1] + ABC[n - 1];
      i += n;
    }
    art[id] = s;
  }
  const rows = Object.keys(art).map(id => `  ${JSON.stringify(id)}: ${JSON.stringify(art[id])}`);
  const out = `/* GENERADO por tools/pxl/ataques.cjs: no editar a mano.
 * Iconos de ataques de 30×30 dibujados con pxl (fuentes en tools/pxl/ataques/). Cada uno: sus colores, «:» y parejas de letras (color y largo del tramo).
 * Los ataques que no están aquí se dibujan en ui/icons.js. */
G.MOVE_ART_PAL = ${JSON.stringify(pal)};
G.MOVE_ART = {
${rows.join(',\n')}
};
`;
  fs.writeFileSync(path.join(__dirname, '../../js/data/move-art.js'), out);
  console.log('ok:', rows.length, 'iconos,', pal.length - 1, 'colores,', (out.length / 1024).toFixed(0), 'KB');
})().catch(e => { console.error(e); process.exit(1); });
