// Instalador DE PRUEBA para probar-actualizar.cjs: el mismo instalador.iss con otro AppId (y otro nombre en
// «Aplicaciones instaladas»), para no pisar el PokéSurvivor que tenga instalado el jugador de este PC.
// Empaqueta lo que haya en dist/PokeSurvivor/ (node empaquetar.cjs antes) con la versión que se le dé.
//
//   node prueba-instalador.cjs <versión> <salida.exe>
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [version, salida] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !salida) { console.error('Uso: node prueba-instalador.cjs <versión> <salida.exe>'); process.exit(2); }
const CARPETA = path.join(__dirname, 'dist', 'PokeSurvivor');
if (!fs.existsSync(path.join(CARPETA, 'PokeSurvivor.exe'))) { console.error('Falta dist/PokeSurvivor: node empaquetar.cjs'); process.exit(1); }

const env = process.env;
const iscc = [env.ISCC, env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Inno Setup 6', 'ISCC.exe')].find(c => c && fs.existsSync(c));
if (!iscc) { console.error('No encuentro ISCC.exe (Inno Setup 6)'); process.exit(1); }

let iss = fs.readFileSync(path.join(__dirname, 'instalador.iss'), 'utf8');
const id = 'AppId={{E7B347D2-92C7-4D57-A1D2-7A8260D4F733}';
if (!iss.includes(id)) throw new Error('No encuentro el AppId en instalador.iss');
iss = iss.replace(id, 'AppId={{0B1A7E57-9F6B-4C1D-9A3E-50E57AC71A00}')
  .replace(/^UninstallDisplayName=.*$/m, 'UninstallDisplayName=PokéSurvivor (PRUEBA)')
  .replace(/^SetupIconFile=icono\.ico$/m, 'SetupIconFile=' + path.join(__dirname, 'icono.ico'))
  .replace(/^OutputBaseFilename=.*$/m, 'OutputBaseFilename=' + path.basename(salida, '.exe'));
const tmp = path.join(__dirname, 'target', 'prueba-instalador.iss');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, '﻿' + iss.replace(/^﻿/, ''));
fs.mkdirSync(path.dirname(path.resolve(salida)), { recursive: true });
execFileSync(iscc, ['/Q', `/DVersion=${version}`, `/DOrigen=${CARPETA}`, `/O${path.dirname(path.resolve(salida))}`, tmp], { stdio: 'inherit' });
console.log('Instalador de prueba', version, '→', path.resolve(salida));
