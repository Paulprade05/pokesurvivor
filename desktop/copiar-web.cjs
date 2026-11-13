// Copia la versión web COMPILADA del juego (la de GitHub Pages) a desktop/www,
// que es lo que la app de Windows lleva dentro. No compila nada: antes hay que
// haber hecho `node tools/build.js` en la raíz (index.html y js/app.min.js).
// Sólo copia archivos que estén en git, para no meter basura local.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const DESTINO = path.join(__dirname, 'www');

// Lo que el juego necesita para funcionar. Lo demás (herramientas, pruebas,
// documentos, páginas de buscadores) se queda fuera.
const CARPETAS = ['assets/', 'css/', 'js/', 'en/'];
// Licencias y créditos: la licencia del código (PolyForm Noncommercial) y la
// de los sprites (CC BY-NC) piden que viajen con cada copia que se reparte.
const SUELTOS = ['index.html', 'favicon.ico', 'manifest.webmanifest', 'version.json',
  'LICENSE', 'LICENSE-NONCOMMERCIAL.md', 'CREDITS.md'];
// Pantallas de arranque de iPhone: en Windows no se usan.
const FUERA = [/^assets\/splash\//];

const lista = execFileSync('git', ['ls-files', '-z', '--', ...CARPETAS, ...SUELTOS], { cwd: RAIZ, maxBuffer: 64 << 20 })
  .toString('utf8').split('\0').filter(Boolean).filter(f => !FUERA.some(r => r.test(f)));

if (!lista.includes('index.html') || !lista.includes('js/app.min.js')) {
  console.error('Falta index.html o js/app.min.js: compila antes con node tools/build.js');
  process.exit(1);
}

fs.rmSync(DESTINO, { recursive: true, force: true });
let bytes = 0;
for (const f of lista) {
  const de = path.join(RAIZ, f), a = path.join(DESTINO, f);
  if (!fs.existsSync(de)) continue;            // borrado en el árbol pero aún en el índice
  fs.mkdirSync(path.dirname(a), { recursive: true });
  fs.copyFileSync(de, a);
  bytes += fs.statSync(a).size;
}
console.log(`Copiados ${lista.length} archivos (${(bytes / 1048576).toFixed(1)} MB) a desktop/www`);
