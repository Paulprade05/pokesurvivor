// Crea el instalador de Windows (dist/PokeSurvivor-Windows-Setup.exe) con
// Inno Setup 6 a partir de la app ya empaquetada (node empaquetar.cjs →
// dist/PokeSurvivor/). Script del asistente: instalador.iss.
// Inno Setup es gratis (https://jrsoftware.org/isinfo.php). Se busca ISCC.exe en
// %ISCC%, en el PATH y en las carpetas donde se instala (para el usuario o para todos).
//
//   node instalador.cjs   → dist/PokeSurvivor-Windows-Setup.exe
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const CARPETA = path.join(DIST, 'PokeSurvivor');
const SALIDA = path.join(DIST, 'PokeSurvivor-Windows-Setup.exe');
const version = fs.readFileSync(path.join(__dirname, 'Cargo.toml'), 'utf8').match(/^version\s*=\s*"([^"]+)"/m)[1];

for (const f of ['PokeSurvivor.exe', path.join('www', 'index.html')]) {
  if (!fs.existsSync(path.join(CARPETA, f))) {
    console.error(`Falta ${path.join(CARPETA, f)}: primero node empaquetar.cjs`);
    process.exit(1);
  }
}

function buscarIscc() {
  const env = process.env;
  const candidatos = [
    env.ISCC,
    ...(env.PATH || '').split(path.delimiter).map(d => d && path.join(d, 'ISCC.exe')),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Inno Setup 6', 'ISCC.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Inno Setup 6', 'ISCC.exe'),
  ];
  return candidatos.find(c => c && fs.existsSync(c));
}

const iscc = buscarIscc();
if (!iscc) {
  console.error('No encuentro ISCC.exe (Inno Setup 6). Instálalo de https://jrsoftware.org/isdl.php o pon su ruta en %ISCC%.');
  process.exit(1);
}

fs.rmSync(SALIDA, { force: true });
execFileSync(iscc, ['/Q', `/DVersion=${version}`, `/DOrigen=${CARPETA}`, `/O${DIST}`, path.join(__dirname, 'instalador.iss')],
  { cwd: __dirname, stdio: 'inherit' });

const mb = f => (fs.statSync(f).size / 1048576).toFixed(1) + ' MB';
console.log('Versión:', version);
console.log('Instalador:', SALIDA, mb(SALIDA));
