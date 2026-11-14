// Mide el juego con tools/perf.cjs (mismas escenas, semilla fija) en cada
// contenedor de Windows, todos con ventana de 1280×800 y la GPU de verdad:
//   rust      la app de Rust (dist/PokeSurvivor/PokeSurvivor.exe, WebView2)
//   electron  la app Electron (../desktop/dist/PokeSurvivor/PokeSurvivor.exe)
//   edge      Microsoft Edge (el mismo motor que WebView2)
//   chrome    Google Chrome
//
//   node medir-perf.cjs [rust electron edge chrome] [--calidad max] [--seg 5] [--escenas aldea,horda] [--sin-tope]
//
// Cada contenedor se abre con depuración remota en 127.0.0.1, perf.cjs se
// conecta (--cdp) y mide en su pestaña; luego se cierra. Resultado en
// dist/perf/<contenedor>-<calidad>.json y una tabla al final.
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const CALIDAD = opt('calidad', 'max');
const SEG = opt('seg', '5');
const ESCENAS = opt('escenas', 'aldea,tranquila,jefe,horda,grieta,arena');
const SIN_TOPE = args.includes('--sin-tope') ? (args.splice(args.indexOf('--sin-tope'), 1), true) : false;
const OBJETIVOS = args.length ? args : ['rust', 'electron', 'edge', 'chrome'];
const SALIDA = path.join(__dirname, 'dist', SIN_TOPE ? 'perf-sin-tope' : 'perf');
const espera = ms => new Promise(r => setTimeout(r, ms));
const navegador = n => [
  `C:/Program Files (x86)/Microsoft/Edge/Application/${n}.exe`, `C:/Program Files/Microsoft/Edge/Application/${n}.exe`,
  `C:/Program Files/Google/Chrome/Application/${n}.exe`, `C:/Program Files (x86)/Google/Chrome/Application/${n}.exe`,
].find(f => fs.existsSync(f));

function lanzar(nombre, puerto, perfil) {
  const tope = SIN_TOPE ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [];
  if (nombre === 'rust') {
    return spawn(path.join(__dirname, 'dist', 'PokeSurvivor', 'PokeSurvivor.exe'),
      ['--perfil=' + perfil, '--sin-avisos', '--depuracion=' + puerto, ...(SIN_TOPE ? ['--sin-tope'] : [])], { stdio: 'ignore' });
  }
  if (nombre === 'electron') {
    return spawn(path.join(RAIZ, 'desktop', 'dist', 'PokeSurvivor', 'PokeSurvivor.exe'),
      ['--perfil=' + perfil, '--sin-avisos', '--remote-debugging-port=' + puerto, ...(SIN_TOPE ? ['--sin-tope'] : [])], { stdio: 'ignore' });
  }
  const exe = navegador(nombre === 'edge' ? 'msedge' : 'chrome');
  if (!exe) throw new Error('No encuentro ' + nombre);
  return spawn(exe, ['--remote-debugging-port=' + puerto, '--user-data-dir=' + perfil, '--no-first-run', '--no-default-browser-check',
    '--window-size=1280,800', '--mute-audio', ...tope, 'about:blank'], { stdio: 'ignore' });
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  for (const n of OBJETIVOS) {
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-perf-'));
    const puerto = 39300 + Math.floor(Math.random() * 500);
    const proc = lanzar(n, puerto, perfil);
    let listo = false;
    for (let i = 0; i < 80 && !listo; i++) {
      await espera(250);
      listo = await fetch(`http://127.0.0.1:${puerto}/json/version`).then(r => r.ok).catch(() => false);
    }
    await espera(n === 'rust' || n === 'electron' ? 4000 : 500);    // que la app termine de abrir su página
    console.log(`== ${n} (puerto ${puerto}) ==`);
    try {
      if (!listo) throw new Error('sin depuración remota');
      execFileSync(process.execPath, [path.join(RAIZ, 'tools', 'perf.cjs'), '--cdp', `http://127.0.0.1:${puerto}`, '--nav', n,
        '--calidad', CALIDAD, '--seg', SEG, '--escenas', ESCENAS, '--out', SALIDA, '--pw', path.join(RAIZ, 'desktop', 'node_modules'),
        ...(SIN_TOPE ? ['--sin-tope'] : [])], { stdio: 'inherit', cwd: RAIZ });
    } catch (e) { console.log(`${n}: FALLO ${e.message}`); }
    try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* ya cerrada */ }
    await espera(1500);
    try { fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch (e) { /* temporales */ }
  }
  // Tabla: FPS / ms de CPU por fotograma / p99 / tirones por escena.
  const filas = [];
  for (const n of OBJETIVOS) {
    const f = path.join(SALIDA, `${n}-${CALIDAD}.json`);
    if (!fs.existsSync(f)) continue;
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [e, x] of Object.entries(r.escenas)) filas.push(`| ${n} | ${e} | ${x.error ? 'error' : x.fps} | ${x.ms ?? ''} | ${x.p99 ?? ''} | ${x.tirones ?? ''} | ${x.maxGap ?? ''} |`);
  }
  const tabla = ['| contenedor | escena | FPS | ms CPU | p99 ms | tirones >50 ms | peor hueco ms |', '|---|---|---|---|---|---|---|', ...filas].join('\n');
  fs.writeFileSync(path.join(SALIDA, `tabla-${CALIDAD}.md`), tabla + '\n');
  console.log(tabla);
})();
