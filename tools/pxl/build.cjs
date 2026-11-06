// Construye el arte de tools/pxl/*.px.js con pxl y copia los PNG a assets/pxl/.
// Uso: PXL=<carpeta de claude-pxl> node tools/pxl/build.cjs [--ver]
//   pxl (https://github.com/crsolver/claude-pxl, licencia MIT) no entra en el juego ni en el repositorio: es la herramienta con
//   la que se dibuja. Aquí sólo están las fuentes del arte y sus PNG. --ver: deja también las vistas ampliadas en tools/pxl/out.
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const PXL = process.env.PXL;
if (!PXL) { console.error('Falta PXL=<carpeta de claude-pxl>'); process.exit(2); }
const here = __dirname, out = path.join(process.env.PXL_OUT || path.join(here, 'out')), dest = path.join(here, '../../assets/pxl');
const ver = process.argv.includes('--ver');
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(here).filter(f => f.endsWith('.px.js'))) {
  execFileSync(process.execPath, [path.join(PXL, 'bin/pxl.js'), 'build', path.join(here, f), '--out', out].concat(ver ? [] : ['--no-preview']), { stdio: 'inherit' });
}
let n = 0;
for (const dir of ['sprites', 'anims']) {
  const d = path.join(out, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).filter(f => f.endsWith('.png'))) { fs.copyFileSync(path.join(d, f), path.join(dest, f)); n++; }
}
console.log('ok:', n, 'PNG en assets/pxl');
