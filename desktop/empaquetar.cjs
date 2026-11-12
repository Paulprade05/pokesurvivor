// Crea la app de Windows en desktop/dist/PokeSurvivor-win32-x64/ (PokeSurvivor.exe)
// y un .zip para llevarla a otro PC. Sin instalador ni firma: es un prototipo.
// Antes: node copiar-web.cjs (lo hace `npm run empaquetar`).
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

(async () => {
  const { packager } = require('@electron/packager');
  const pkg = require('./package.json');
  const out = path.join(__dirname, 'dist');
  const [carpeta] = await packager({
    dir: __dirname,
    out,
    overwrite: true,
    platform: 'win32',
    arch: 'x64',
    name: 'PokeSurvivor',
    executableName: 'PokeSurvivor',
    appVersion: pkg.version,
    icon: path.join(__dirname, 'icono.ico'),
    asar: true,
    prune: true,
    // Dentro sólo va lo que la app usa al jugar.
    ignore: [/^\/dist($|\/)/, /^\/node_modules($|\/)/, /^\/medir-fps\.cjs$/, /^\/empaquetar\.cjs$/, /^\/copiar-web\.cjs$/, /^\/LEEME\.md$/],
    appCopyright: 'Proyecto de fan sin ánimo de lucro. Pokémon © Nintendo/Creatures/GAME FREAK.',
    win32metadata: { CompanyName: 'PokéSurvivor (fan)', FileDescription: 'PokéSurvivor', ProductName: 'PokéSurvivor', InternalName: 'PokeSurvivor' },
  });
  const zip = path.join(out, `PokeSurvivor-${pkg.version}-win-x64.zip`);
  fs.rmSync(zip, { force: true });
  // tar.exe de Windows 10/11 sabe hacer .zip.
  execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'),
    ['-a', '-c', '-f', zip, '-C', out, path.basename(carpeta)], { stdio: 'inherit' });
  const mb = f => (fs.statSync(f).size / 1048576).toFixed(1) + ' MB';
  console.log('App:', path.join(carpeta, 'PokeSurvivor.exe'));
  console.log('Zip:', zip, mb(zip));
})().catch(e => { console.error(e); process.exit(1); });
