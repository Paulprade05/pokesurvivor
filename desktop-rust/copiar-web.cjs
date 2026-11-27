// Copia la versión web COMPILADA del juego (la de GitHub Pages) a desktop-rust/www,
// que es lo que la app de Windows lleva dentro. No compila nada: antes hay que
// haber hecho `node tools/build.js` en la raíz (index.html y js/app.min.js).
// (Antes en desktop/, la app Electron; desde la 0.9.0 sólo la usa esta app.)
// Sólo copia archivos que estén en git, para no meter basura local.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
// Destino: desktop-rust/www o el que se pase (empaquetar.cjs: dist/PokeSurvivor/www).
const DESTINO = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'www');

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
console.log(`Copiados ${lista.length} archivos (${(bytes / 1048576).toFixed(1)} MB) a ${path.relative(RAIZ, DESTINO)}`);

// (1.0, jugar sin conexión) El SDK de Firebase que carga js/core/db.js, dentro de la app: la app lo sirve
// ella en su dirección de siempre (src/main.rs, SDK_FIREBASE), así que el juego abre la nube y la última
// sesión aunque no haya internet. Se baja de su sitio oficial (www.gstatic.com) y se comprueba su SHA-256;
// queda guardado en target/firebasejs/ para no bajarlo cada vez.
const SDK_VERSION = '13.0.0';
const SDK = {
  'firebase-app-compat.js': 'ea496cf11c04c22f4472b953b2571d9837bef6c2172742e0d12d6cf113bc29fe',
  'firebase-auth-compat.js': '8fd505bd78e9df31526019424eea695141a083c686e01783317b3b3759db9eac',
  'firebase-firestore-compat.js': '4631281ec75348173cb1f20dfdbff84bff3044c04de67580ffb0361c22275327',
  'firebase-database-compat.js': '235d12f716e9a766244f577e5f8ba83f3a28a1a7429e5cb438ede8d0ea810cb6',
};
const usada = fs.readFileSync(path.join(RAIZ, 'js', 'core', 'db.js'), 'utf8').match(/firebasejs\/([\d.]+)\//)[1];
if (usada !== SDK_VERSION) {
  console.error(`js/core/db.js usa el SDK de Firebase ${usada} y aquí está el ${SDK_VERSION}: pon la versión y las SHA-256 nuevas en SDK.`);
  process.exit(1);
}
const sha = b => require('crypto').createHash('sha256').update(b).digest('hex');
(async () => {
  const cache = path.join(__dirname, 'target', 'firebasejs', SDK_VERSION);
  const dest = path.join(DESTINO, 'firebasejs', SDK_VERSION);
  fs.mkdirSync(cache, { recursive: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const [f, h] of Object.entries(SDK)) {
    const c = path.join(cache, f);
    let d = fs.existsSync(c) ? fs.readFileSync(c) : null;
    if (!d || sha(d) !== h) {
      const r = await fetch(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/${f}`);
      if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
      d = Buffer.from(await r.arrayBuffer());
      if (sha(d) !== h) throw new Error(`${f}: la SHA-256 no coincide (${sha(d)})`);
      fs.writeFileSync(c, d);
    }
    fs.writeFileSync(path.join(dest, f), d);
  }
  console.log(`SDK de Firebase ${SDK_VERSION} (${Object.keys(SDK).length} archivos) en ${path.relative(RAIZ, dest)}`);
})().catch(e => { console.error('No se pudo copiar el SDK de Firebase:', e.message); process.exit(1); });
