// Crea la app de Windows en Rust en desktop-rust/dist/PokeSurvivor/
// (PokeSurvivor.exe + www/ con la web compilada) y el .zip que se sube a GitHub
// Releases. Sin instalador ni firma: se descomprime y se abre PokeSurvivor.exe.
// Necesita Rust (rustup) y, en Windows, las herramientas de C++ de Visual Studio.
//
//   node empaquetar.cjs            → dist/PokeSurvivor-Windows-Rust.zip
//   node empaquetar.cjs <nombre>   → dist/<nombre> (el workflow lo usa para
//                                    publicarla con el nombre fijo de Ajustes)
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const DIST = path.join(__dirname, 'dist');
const CARPETA = path.join(DIST, 'PokeSurvivor');
const ZIP = path.join(DIST, process.argv[2] || 'PokeSurvivor-Windows-Rust.zip');

const version = fs.readFileSync(path.join(__dirname, 'Cargo.toml'), 'utf8').match(/^version\s*=\s*"([^"]+)"/m)[1];
const electron = JSON.parse(fs.readFileSync(path.join(RAIZ, 'desktop', 'package.json'), 'utf8')).version;
if (version !== electron) {
  console.error(`desktop-rust/Cargo.toml dice ${version} y desktop/package.json ${electron}: tienen que ser iguales.`);
  process.exit(1);
}

execFileSync('cargo', ['build', '--release', '--locked'], { cwd: __dirname, stdio: 'inherit' });

fs.rmSync(CARPETA, { recursive: true, force: true });
fs.mkdirSync(CARPETA, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'target', 'release', 'PokeSurvivor.exe'), path.join(CARPETA, 'PokeSurvivor.exe'));
execFileSync(process.execPath, [path.join(RAIZ, 'desktop', 'copiar-web.cjs'), path.join(CARPETA, 'www')], { stdio: 'inherit' });

fs.rmSync(ZIP, { force: true });
// tar.exe de Windows 10/11 sabe hacer .zip.
execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'),
  ['-a', '-c', '-f', ZIP, '-C', DIST, 'PokeSurvivor'], { stdio: 'inherit' });
const mb = f => (fs.statSync(f).size / 1048576).toFixed(1) + ' MB';
console.log('Versión:', version, '(etiqueta de la release: win-v' + version + ')');
console.log('App:', path.join(CARPETA, 'PokeSurvivor.exe'), mb(path.join(CARPETA, 'PokeSurvivor.exe')));
console.log('Zip:', ZIP, mb(ZIP));
