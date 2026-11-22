// Instalador de Windows (desktop-rust/instalador.iss, Inno Setup 6): lo que pidió
// el dueño el 21-11-2026. Asistente en español e inglés, carpeta a elegir (de
// usuario sin administrador, o para todos), accesos directos con casillas, abrir
// al acabar, desinstalador con icono y versión, y la partida nunca se borra.
// (La prueba de verdad, instalar/actualizar/desinstalar, está en desktop-rust/LEEME.md.)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');
const iss = source('desktop-rust/instalador.iss');
const linea = re => assert.match(iss, re);

test('AppId fijo (actualizar encima) y versión de Cargo.toml', () => {
  linea(/^AppId=\{\{E7B347D2-92C7-4D57-A1D2-7A8260D4F733\}$/m);
  linea(/^AppVersion=\{#Version\}$/m);
  const cjs = source('desktop-rust/instalador.cjs');
  assert.match(cjs, /Cargo\.toml/);
  assert.match(cjs, /\/DVersion=\$\{version\}/);
});

test('por usuario sin administrador, con opción de todos los usuarios', () => {
  linea(/^PrivilegesRequired=lowest$/m);
  linea(/^PrivilegesRequiredOverridesAllowed=dialog$/m);
  linea(/^DefaultDirName=\{autopf\}\\PokeSurvivor$/m);
  assert.doesNotMatch(iss, /^DisableDirPage=yes$/m, 'deja elegir la carpeta');
  linea(/^DisableWelcomePage=no$/m);
});

test('español e inglés, accesos directos con casillas y abrir al acabar', () => {
  linea(/^Name: "en"; MessagesFile: "compiler:Default\.isl"$/m);
  linea(/^Name: "es"; MessagesFile: "compiler:Languages\\Spanish\.isl"$/m);
  for (const k of ['Accesos', 'MenuInicio', 'WelcomeLabel2']) {
    linea(new RegExp(`^en\\.${k}=`, 'm'));
    linea(new RegExp(`^es\\.${k}=`, 'm'));
  }
  // La bienvenida avisa de que la partida se queda. En [Messages] no se expanden {cm:...}.
  linea(/^es\.WelcomeLabel2=.*partida.*no la borra/m);
  linea(/^en\.WelcomeLabel2=.*save stays/m);
  const mensajes = iss.slice(iss.indexOf('\n[Messages]'), iss.indexOf('\n[Tasks]'));
  assert.doesNotMatch(mensajes, /^[^;].*\{cm:/m);
  linea(/^Name: "\{autoprograms\}\\PokéSurvivor".*Tasks: menuinicio$/m);
  linea(/^Name: "\{autodesktop\}\\PokéSurvivor".*Tasks: escritorio$/m);
  linea(/^Filename: "\{app\}\\PokeSurvivor\.exe".*Flags: nowait postinstall skipifsilent$/m);
});

test('desinstalador con icono, compresión fuerte y juego cerrado antes de tocar archivos', () => {
  linea(/^UninstallDisplayIcon=\{app\}\\PokeSurvivor\.exe$/m);
  linea(/^SetupIconFile=icono\.ico$/m);
  linea(/^Compression=lzma2\/ultra64$/m);
  linea(/^SolidCompression=yes$/m);
  linea(/^CloseApplications=yes$/m);
  // El mismo mutex que crea la app al abrir (una sola copia).
  assert.match(source('desktop-rust/src/main.rs'), /None => "Local\\\\PokeSurvivor\.unica"\.to_owned\(\)/);
  linea(/^AppMutex=Local\\PokeSurvivor\.unica$/m);
});

test('la partida nunca se borra: sólo se toca la carpeta del programa', () => {
  assert.doesNotMatch(iss, /^\[UninstallDelete\]/m);
  assert.doesNotMatch(iss, /\{(userappdata|commonappdata|localappdata|app\}\\\.\.)/i);
  // Al actualizar sólo se vacía el juego viejo de dentro de la carpeta del programa.
  const borrar = iss.slice(iss.indexOf('[InstallDelete]'), iss.indexOf('[Files]'));
  assert.deepEqual(borrar.match(/^Type:.*$/gm), ['Type: filesandordirs; Name: "{app}\\www"']);
  // La app guarda fuera (%APPDATA%\PokeSurvivor\), también el perfil de WebView2.
  const rs = source('desktop-rust/src/main.rs');
  assert.match(rs, /var_os\("APPDATA"\)/);
  assert.match(rs, /WebContext::new\(Some\(o\.base\.join\("WebView2"\)\)\)/);
});

test('la app avisa con el instalador primero y el .zip de Rust de reserva', () => {
  const rs = source('desktop-rust/src/main.rs');
  assert.match(rs, /const INSTALADOR: &str = "PokeSurvivor-Windows-Setup\.exe";/);
  assert.match(rs, /const ARCHIVOS: \[&str; 2\] = \[INSTALADOR, "PokeSurvivor-Windows-Rust\.zip"\];/);
});
