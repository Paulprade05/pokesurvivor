// PokéSurvivor para Windows: host nativo en Rust (wry/tao sobre WebView2).
//
// Hace lo mismo que la app Electron (desktop/main.cjs), con el WebView2 que ya
// trae Windows (el Chromium de Edge) en lugar de un Chromium propio:
//   - Abre la MISMA versión compilada que GitHub Pages (carpeta www junto al .exe).
//     Las páginas se sirven desde dentro de la app, sin abrir ningún puerto:
//     WebView2 pide http://127.0.0.1:39017/... y la app contesta con el archivo.
//     Se usa esa dirección porque el juego y la clave de Firebase ya aceptan
//     127.0.0.1 (js/core/db.js), y el navegador la trata como segura.
//   - Pide la gráfica potente (--force_high_performance_gpu a WebView2 y
//     NvOptimusEnablement/AmdPowerXpressRequestHighPerformance en el .exe).
//   - FPS sin tope opcional (--sin-tope o "sinTope" en escritorio.json).
//   - Pantalla completa con F11 o Alt+Intro, y la del botón del juego.
//   - Copia de la partida en disco (%APPDATA%\PokeSurvivor\guardado\, la misma
//     carpeta que la app Electron), que se recupera sola si se vacía el navegador.
//   - Al abrir, mira si hay una versión nueva en GitHub Releases y avisa.
//   - window.pokeEscritorio para el juego (src/puente.js; lista en desktop/LEEME.md).
#![windows_subsystem = "windows"]

use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde_json::{Value, json};
use tao::{
    dpi::{LogicalSize, PhysicalSize},
    event::{Event, StartCause, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy},
    platform::windows::IconExtWindows,
    window::{Fullscreen, Icon, Window, WindowBuilder},
};
use webview2_com::{
    ContainsFullScreenElementChangedEventHandler, Microsoft::Web::WebView2::Win32::*,
    WebResourceRequestedEventHandler, take_pwstr,
};
use windows::{
    Win32::{
        Foundation::{ERROR_ALREADY_EXISTS, GetLastError},
        Globalization::GetUserDefaultUILanguage,
        Graphics::Dxgi::*,
        System::Threading::CreateMutexW,
        UI::{
            Shell::{SHCreateMemStream, ShellExecuteW},
            WindowsAndMessaging::*,
        },
    },
    core::{BOOL, HSTRING, PWSTR, w},
};
use wry::{WebContext, WebViewBuilder, WebViewBuilderExtWindows, WebViewExtWindows};

// Piden a los portátiles con dos gráficas (NVIDIA Optimus, AMD PowerXpress) la
// potente para este proceso. build.rs los exporta. El dibujo del juego lo hace
// el proceso de WebView2 (msedgewebview2.exe): para ese va --force_high_performance_gpu.
#[unsafe(no_mangle)]
pub static NvOptimusEnablement: u32 = 1;
#[unsafe(no_mangle)]
pub static AmdPowerXpressRequestHighPerformance: i32 = 1;

const ORIGEN: &str = "http://127.0.0.1:39017";
const RELEASES_ULTIMA: &str = "https://github.com/Paulprade05/pokesurvivor/releases/latest";
/// Archivos de la release que sirven a esta app, por orden de preferencia.
const ARCHIVOS: [&str; 2] = ["PokeSurvivor-Windows-Rust.zip", "PokeSurvivor-Windows.zip"];
const TITULO: &str = "PokéSurvivor";
const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug)]
enum Evento {
    /// F11, Alt+Intro o pokeEscritorio.pantallaCompleta(): cambia la de la ventana.
    AlternarPantalla,
    /// El botón de pantalla completa del juego (la API de HTML) entra o sale.
    PantallaHtml(bool),
    Guardar(String),
    Version(Value),
    /// Al cerrar: la última copia de la partida que da la página.
    FotoCierre(String),
    Salir,
}

// ---- Opciones ---------------------------------------------------------------
struct Opciones {
    base: PathBuf,
    www: PathBuf,
    gpu_dedicada: bool,
    sin_tope: bool,
    pantalla_completa: bool,
    sin_avisos: bool,
    depuracion: Option<u16>,
}

fn opciones() -> Opciones {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let valor = |k: &str| args.iter().find_map(|a| a.strip_prefix(k).map(str::to_owned));
    let tiene = |k: &str| args.iter().any(|a| a == k);
    // Sólo para pruebas: --perfil=<carpeta> usa un perfil limpio (como un jugador nuevo).
    let base = valor("--perfil=").map(PathBuf::from).unwrap_or_else(|| {
        PathBuf::from(std::env::var_os("APPDATA").unwrap_or_else(|| ".".into())).join("PokeSurvivor")
    });
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)).unwrap_or_default();
    let www = valor("--www=").map(PathBuf::from).unwrap_or_else(|| exe_dir.join("www"));
    // %APPDATA%\PokeSurvivor\escritorio.json, el mismo que la app Electron, p. ej. {"sinTope": true}
    let mut gpu_dedicada = true;
    let mut sin_tope = false;
    let mut pantalla_completa = false;
    if let Ok(t) = std::fs::read_to_string(base.join("escritorio.json")) {
        if let Ok(v) = serde_json::from_str::<Value>(&t) {
            gpu_dedicada = v["gpuDedicada"].as_bool().unwrap_or(gpu_dedicada);
            sin_tope = v["sinTope"].as_bool().unwrap_or(sin_tope);
            pantalla_completa = v["pantallaCompleta"].as_bool().unwrap_or(pantalla_completa);
        }
    }
    if tiene("--sin-tope") { sin_tope = true; }
    if tiene("--gpu-integrada") { gpu_dedicada = false; }
    if tiene("--pantalla-completa") { pantalla_completa = true; }
    Opciones {
        base,
        www,
        gpu_dedicada,
        sin_tope,
        pantalla_completa,
        sin_avisos: tiene("--sin-avisos") || cfg!(debug_assertions),
        // Sólo para medir y probar: abre la depuración remota de WebView2 en ese puerto (127.0.0.1).
        depuracion: valor("--depuracion=").and_then(|p| p.parse().ok()),
    }
}

// ---- Gráficas (para window.pokeEscritorio.gpu) -----------------------------
fn fabricante(v: u32) -> &'static str {
    match v {
        0x10de => "NVIDIA",
        0x1002 => "AMD",
        0x8086 => "Intel",
        0x5143 => "Qualcomm",
        _ => "otro",
    }
}

/// Las gráficas de verdad (sin el adaptador básico de Microsoft), primero la que
/// Windows da para la preferencia pedida (potente o de bajo consumo).
fn graficas(dedicada: bool) -> Value {
    let mut dis: Vec<Value> = Vec::new();
    unsafe {
        if let Ok(f) = CreateDXGIFactory1::<IDXGIFactory6>() {
            let pref = if dedicada { DXGI_GPU_PREFERENCE_HIGH_PERFORMANCE } else { DXGI_GPU_PREFERENCE_MINIMUM_POWER };
            let mut vistos = Vec::new();
            for i in 0.. {
                let Ok(a) = f.EnumAdapterByGpuPreference::<IDXGIAdapter1>(i, pref) else { break };
                let Ok(d) = a.GetDesc1() else { continue };
                let luid = ((d.AdapterLuid.HighPart as i64) << 32) | d.AdapterLuid.LowPart as i64;
                if d.VendorId == 0x1414 || (d.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32) != 0 || vistos.contains(&luid) {
                    continue;
                }
                vistos.push(luid);
                dis.push(json!({ "fabricante": fabricante(d.VendorId), "vendorId": d.VendorId, "deviceId": d.DeviceId, "activa": dis.is_empty() }));
            }
        }
    }
    let activa = dis.first().cloned().unwrap_or(Value::Null);
    // Sólo una pista, como en la app Electron: NVIDIA siempre es dedicada; Intel
    // casi nunca; AMD sola puede ser integrada (Ryzen con Radeon) o dedicada.
    let fab = activa["fabricante"].as_str().unwrap_or("");
    let probable = if fab == "NVIDIA" { json!(true) } else if fab == "Intel" { json!(false) } else if dis.len() > 1 { json!(true) } else { Value::Null };
    json!({ "dispositivos": dis, "activa": activa, "varias": dis.len() > 1, "probableDedicada": probable })
}

// ---- Copia de la partida en disco -------------------------------------------
static ESCRIBIENDO: Mutex<()> = Mutex::new(());

fn escribir_guardado(base: &Path, texto: &str) {
    if texto.len() > 50_000_000 || serde_json::from_str::<Value>(texto).map(|v| !v.is_object()).unwrap_or(true) {
        return;
    }
    let _g = ESCRIBIENDO.lock().unwrap_or_else(|e| e.into_inner());
    let dir = base.join("guardado");
    let f = dir.join("partida.json");
    let tmp = dir.join("partida.json.tmp");
    let r = (|| -> std::io::Result<()> {
        std::fs::create_dir_all(&dir)?;
        std::fs::write(&tmp, texto)?;
        if f.exists() {
            let _ = std::fs::copy(&f, dir.join("partida.json.anterior")); // la copia de antes, por si acaso
        }
        std::fs::rename(&tmp, &f)
    })();
    if let Err(e) = r {
        eprintln!("[guardado] {e}");
    }
}

fn leer_guardado(base: &Path) -> String {
    std::fs::read_to_string(base.join("guardado").join("partida.json"))
        .ok()
        .filter(|t| serde_json::from_str::<Value>(t).map(|v| v.is_object()).unwrap_or(false))
        .unwrap_or_else(|| "null".into())
}

// ---- Servir el juego desde dentro de la app ---------------------------------
fn tipo(ext: &str) -> &'static str {
    match ext {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "webmanifest" => "application/manifest+json",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "txt" => "text/plain; charset=utf-8",
        "glb" => "model/gltf-binary",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}

fn decodificar(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let h = std::str::from_utf8(b.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(h, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// (estado, tipo, contenido) para una dirección de ORIGEN.
fn archivo(www: &Path, url: &str) -> (u16, &'static str, Vec<u8>) {
    let ruta = url[ORIGEN.len()..].split(['?', '#']).next().unwrap_or("/");
    // Sin service worker: la app ya lleva todo dentro y se actualiza entera.
    if ruta == "/sw.js" {
        return (404, "text/plain", Vec::new());
    }
    let Some(rel) = decodificar(ruta) else { return (400, "text/plain", Vec::new()) };
    let mut f = www.to_path_buf();
    for parte in rel.split('/') {
        match parte {
            "" | "." => {}
            ".." => return (403, "text/plain", Vec::new()),
            p if p.contains(['\\', ':']) => return (403, "text/plain", Vec::new()),
            p => f.push(p),
        }
    }
    if f.is_dir() {
        f.push("index.html");
    }
    match std::fs::read(&f) {
        Ok(d) => (200, tipo(&f.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()), d),
        Err(_) => (404, "text/plain", b"404".to_vec()),
    }
}

/// Que WebView2 pida http://127.0.0.1:39017/... a la app y no a la red.
fn servir_desde_la_app(wv: &wry::WebView, www: PathBuf) -> windows::core::Result<()> {
    unsafe {
        let webview = wv.webview();
        let env = wv.environment();
        let filtro = HSTRING::from(format!("{ORIGEN}/*"));
        match windows::core::Interface::cast::<ICoreWebView2_22>(&webview) {
            Ok(w22) => w22.AddWebResourceRequestedFilterWithRequestSourceKinds(
                &filtro,
                COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
                COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
            )?,
            Err(_) => webview.AddWebResourceRequestedFilter(&filtro, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL)?,
        }
        let mut token = 0i64;
        webview.add_WebResourceRequested(
            &WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut uri = PWSTR::null();
                args.Request()?.Uri(&mut uri)?;
                let uri = take_pwstr(uri);
                if !uri.starts_with(ORIGEN) {
                    return Ok(());
                }
                let (estado, tipo, datos) = archivo(&www, &uri);
                let razon = HSTRING::from(match estado { 200 => "OK", 400 => "Bad Request", 403 => "Forbidden", _ => "Not Found" });
                let cabeceras = HSTRING::from(format!("Content-Type: {tipo}\nCache-Control: no-cache"));
                let flujo = if datos.is_empty() { None } else { SHCreateMemStream(Some(&datos)) };
                let resp = env.CreateWebResourceResponse(flujo.as_ref(), estado as i32, &razon, &cabeceras)?;
                args.SetResponse(&resp)
            })),
            &mut token,
        )
    }
}

// ---- Utilidades de Windows --------------------------------------------------
fn abrir_fuera(url: &str) {
    if url.starts_with("https://") || url.starts_with("http://") {
        unsafe {
            ShellExecuteW(None, w!("open"), &HSTRING::from(url), None, None, SW_SHOWNORMAL);
        }
    }
}

fn en_espanol() -> bool {
    unsafe { GetUserDefaultUILanguage() & 0x3ff == 0x0a }
}

fn aviso(texto: &str, pregunta: bool) -> bool {
    let estilo = if pregunta { MB_YESNO | MB_ICONINFORMATION } else { MB_OK | MB_ICONWARNING };
    unsafe {
        MessageBoxW(None, &HSTRING::from(texto), &HSTRING::from(TITULO), estilo | MB_SETFOREGROUND | MB_TOPMOST) == IDYES
    }
}

/// Una sola ventana del juego: si se abre otra vez, se trae la que ya hay.
fn soy_la_unica() -> bool {
    unsafe {
        let m = CreateMutexW(None, true, w!("Local\\PokeSurvivor.unica"));
        if m.is_ok() && GetLastError() == ERROR_ALREADY_EXISTS {
            if let Ok(h) = FindWindowW(None, &HSTRING::from(TITULO)) {
                let _ = ShowWindow(h, SW_RESTORE);
                let _ = SetForegroundWindow(h);
            }
            return false;
        }
        std::mem::forget(m); // que el mutex dure lo que la app
        true
    }
}

// ---- ¿Hay versión nueva? ------------------------------------------------------
fn mas_nueva(a: &str, b: &str) -> bool {
    // ¿la versión a es mayor que b? ('win-v0.10.0' > '0.9.1')
    let num = |s: &str| -> Vec<u64> {
        s.trim_start_matches(|c: char| !c.is_ascii_digit()).split('.').map(|n| n.parse().unwrap_or(0)).collect()
    };
    let (pa, pb) = (num(a), num(b));
    for i in 0..3 {
        let (x, y) = (pa.get(i).copied().unwrap_or(0), pb.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

fn ahora() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn toca_comprobar(o: &Opciones) -> bool {
    if o.sin_avisos {
        return false;
    }
    let marca = std::fs::read_to_string(o.base.join("ultima-comprobacion.txt")).ok().and_then(|t| t.trim().parse::<u64>().ok());
    marca.is_none_or(|m| ahora().saturating_sub(m) >= 20 * 3600 * 1000)
}

fn revisar_version(base: &Path, v: &Value) {
    let _ = std::fs::create_dir_all(base);
    let _ = std::fs::write(base.join("ultima-comprobacion.txt"), ahora().to_string());
    if v["ok"] != json!(true) || v["draft"] == json!(true) || v["prerelease"] == json!(true) {
        return;
    }
    let tag = v["tag"].as_str().unwrap_or("");
    let assets = v["assets"].as_array().cloned().unwrap_or_default();
    let zip = ARCHIVOS.iter().find_map(|n| assets.iter().find(|a| a["name"] == json!(n)).and_then(|a| a["url"].as_str().map(str::to_owned)));
    let Some(zip) = zip else { return };
    if !mas_nueva(tag, VERSION) {
        return;
    }
    let nueva = tag.trim_start_matches(|c: char| !c.is_ascii_digit()).to_owned();
    // En otro hilo, para que el juego siga mientras se lee el aviso.
    std::thread::spawn(move || {
        let texto = if en_espanol() {
            format!("Hay una versión nueva para PC ({nueva}).\n\nTienes la {VERSION}. Descarga el .zip, cierra el juego y descomprime la nueva encima: tu partida se queda.\n\n¿Descargarla ahora?")
        } else {
            format!("A new PC version is available ({nueva}).\n\nYou have {VERSION}. Download the .zip, close the game and unzip the new one over it: your save stays.\n\nDownload it now?")
        };
        if aviso(&texto, true) {
            abrir_fuera(if zip.starts_with("https://github.com/") { &zip } else { RELEASES_ULTIMA });
        }
    });
}

// ---- Ventana -------------------------------------------------------------------
/// Ventanas emergentes que se dejan abrir dentro de la app: el inicio de sesión
/// con Google de Firebase. Cualquier otro enlace se abre en el navegador normal.
fn es_emergente_permitida(url: &str) -> bool {
    url.starts_with("https://accounts.google.com/")
        || url
            .strip_prefix("https://")
            .and_then(|r| r.split_once('/'))
            .is_some_and(|(host, resto)| host.ends_with(".firebaseapp.com") && resto.starts_with("__/auth/"))
}

fn poner_pantalla(w: &Window, si: bool) {
    w.set_fullscreen(if si { Some(Fullscreen::Borderless(None)) } else { None });
}

fn main() {
    let o = opciones();
    if !soy_la_unica() {
        return;
    }
    if !o.www.join("index.html").is_file() {
        aviso(&format!("No encuentro el juego en {}.\nDescomprime otra vez PokeSurvivor-Windows.zip entero.", o.www.display()), false);
        return;
    }
    let _ = std::fs::create_dir_all(&o.base);

    let event_loop = EventLoopBuilder::<Evento>::with_user_event().build();
    let proxy: EventLoopProxy<Evento> = event_loop.create_proxy();
    let window = WindowBuilder::new()
        .with_title(TITULO)
        .with_inner_size(LogicalSize::new(1280.0, 800.0))
        .with_min_inner_size(LogicalSize::new(800.0, 480.0))
        .with_window_icon(Icon::from_resource(1, Some(PhysicalSize::new(256, 256))).ok())
        .with_fullscreen(if o.pantalla_completa { Some(Fullscreen::Borderless(None)) } else { None })
        .build(&event_loop)
        .expect("ventana");

    // Lo que el juego puede saber de la app (window.pokeEscritorio).
    let juego = std::fs::read_to_string(o.www.join("version.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v["v"].as_str().map(str::to_owned))
        .unwrap_or_default();
    let webview2 = wry::webview_version().unwrap_or_default();
    let info = json!({
        "version": VERSION,
        "juego": juego,
        "webview2": webview2,
        "gpu": graficas(o.gpu_dedicada),
        "ajustes": { "gpuDedicada": o.gpu_dedicada, "sinTope": o.sin_tope, "pantallaCompleta": o.pantalla_completa },
        "comprobar": toca_comprobar(&o),
    });
    let puente = include_str!("puente.js").replace("__INFO__", &info.to_string()).replace("__DISCO__", &leer_guardado(&o.base));

    // Interruptores de Chromium para WebView2 (los de wry por defecto, y los nuestros).
    let mut flags = vec![
        "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection".to_owned(),
        "--autoplay-policy=no-user-gesture-required".to_owned(),
        // Que el juego siga (cooperativo) aunque la ventana quede detrás de otra.
        "--disable-background-timer-throttling".to_owned(),
        "--disable-renderer-backgrounding".to_owned(),
        "--disable-backgrounding-occluded-windows".to_owned(),
    ];
    if o.gpu_dedicada {
        flags.push("--force_high_performance_gpu".into());
    }
    if o.sin_tope {
        flags.push("--disable-frame-rate-limit".into());
        flags.push("--disable-gpu-vsync".into());
    }
    if let Some(p) = o.depuracion {
        flags.push(format!("--remote-debugging-port={p}"));
    }
    let depuracion = o.depuracion.is_some();

    let mut contexto = WebContext::new(Some(o.base.join("WebView2")));
    let p_ipc = proxy.clone();
    let webview = WebViewBuilder::new_with_web_context(&mut contexto)
        .with_url("about:blank")
        .with_background_color((0, 0, 0, 255))
        .with_initialization_script(puente)
        .with_additional_browser_args(flags.join(" "))
        .with_browser_accelerator_keys(false)
        .with_default_context_menus(depuracion)
        .with_devtools(depuracion)
        .with_autoplay(true)
        .with_background_throttling(wry::BackgroundThrottlingPolicy::Disabled)
        .with_ipc_handler(move |req| {
            if !req.uri().to_string().starts_with(ORIGEN) {
                return;
            }
            let Ok(m) = serde_json::from_str::<Value>(req.body()) else { return };
            let ev = match m["t"].as_str() {
                Some("guardar") => m["texto"].as_str().map(|t| Evento::Guardar(t.to_owned())),
                Some("pantalla-completa") => Some(Evento::AlternarPantalla),
                Some("version") => Some(Evento::Version(m)),
                _ => None,
            };
            if let Some(ev) = ev {
                let _ = p_ipc.send_event(ev);
            }
        })
        .with_navigation_handler(move |url| {
            if url.starts_with(&format!("{ORIGEN}/")) || url == "about:blank" {
                return true;
            }
            // Para medir con tools/perf.cjs: su servidor también va en 127.0.0.1.
            if depuracion && url.starts_with("http://127.0.0.1:") {
                return true;
            }
            abrir_fuera(&url);
            false
        })
        .with_new_window_req_handler(|url, _| {
            if es_emergente_permitida(&url) {
                return wry::NewWindowResponse::Allow;
            }
            abrir_fuera(&url);
            wry::NewWindowResponse::Deny
        })
        .build(&window);
    let webview = match webview {
        Ok(w) => w,
        Err(e) => {
            let es = en_espanol();
            let texto = if es {
                format!("No se pudo abrir el juego: falta o falla WebView2 de Microsoft.\n\n{e}\n\n¿Abrir la página de descarga de WebView2?")
            } else {
                format!("The game could not start: Microsoft WebView2 is missing or failed.\n\n{e}\n\nOpen the WebView2 download page?")
            };
            if aviso(&texto, true) {
                abrir_fuera("https://developer.microsoft.com/microsoft-edge/webview2/");
            }
            return;
        }
    };
    if let Err(e) = servir_desde_la_app(&webview, o.www.clone()) {
        aviso(&format!("No se pudo preparar el juego: {e}"), false);
        return;
    }
    // El botón de pantalla completa del juego (API de HTML): la ventana entera.
    unsafe {
        let p = proxy.clone();
        let mut token = 0i64;
        let _ = webview.webview().add_ContainsFullScreenElementChanged(
            &ContainsFullScreenElementChangedEventHandler::create(Box::new(move |wv, _| {
                if let Some(wv) = wv {
                    let mut si = BOOL::default();
                    wv.ContainsFullScreenElement(&mut si)?;
                    let _ = p.send_event(Evento::PantallaHtml(si.as_bool()));
                }
                Ok(())
            })),
            &mut token,
        );
    }
    let _ = webview.load_url(&format!("{ORIGEN}/index.html"));

    let base = o.base.clone();
    let mut f11 = o.pantalla_completa;
    let mut html = false;
    let mut cerrando = false;
    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        let _ = &contexto; // el contexto de WebView2 vive lo que la app
        match event {
            Event::NewEvents(StartCause::Init) => {}
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
                if cerrando {
                    return;
                }
                cerrando = true;
                // Pide la última copia de la partida y sale cuando llega (o a los 3 s).
                let p = proxy.clone();
                let r = webview.evaluate_script_with_callback("(window.__psFoto ? window.__psFoto() : null)", move |r| {
                    let _ = p.send_event(Evento::FotoCierre(r));
                });
                let p = proxy.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(3));
                    let _ = p.send_event(Evento::Salir);
                });
                if r.is_err() {
                    *control_flow = ControlFlow::Exit;
                }
            }
            Event::UserEvent(ev) => match ev {
                Evento::AlternarPantalla => {
                    f11 = !(f11 || html);
                    html = false;
                    poner_pantalla(&window, f11);
                }
                Evento::PantallaHtml(si) => {
                    html = si;
                    poner_pantalla(&window, f11 || html);
                }
                Evento::Guardar(t) => {
                    let b = base.clone();
                    std::thread::spawn(move || escribir_guardado(&b, &t));
                }
                Evento::Version(v) => revisar_version(&base, &v),
                Evento::FotoCierre(r) => {
                    // r es el resultado en JSON: una cadena con la copia, o null.
                    if let Ok(Some(t)) = serde_json::from_str::<Option<String>>(&r) {
                        escribir_guardado(&base, &t);
                    }
                    *control_flow = ControlFlow::Exit;
                }
                Evento::Salir => *control_flow = ControlFlow::Exit,
            },
            _ => {}
        }
    });
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn versiones_como_numeros() {
        assert!(mas_nueva("win-v0.10.0", "0.9.1"));
        assert!(!mas_nueva("win-v0.4.0", "0.4.0"));
        assert!(!mas_nueva("v0.3.9", "0.4.0"));
        assert!(mas_nueva("1.0", "0.9.9"));
        assert!(!mas_nueva("", "0.4.0"));
    }

    #[test]
    fn rutas_dentro_de_www() {
        let www = std::env::temp_dir().join("ps-www-prueba");
        std::fs::create_dir_all(www.join("js")).unwrap();
        std::fs::write(www.join("index.html"), "<p>hola</p>").unwrap();
        std::fs::write(www.join("js").join("a b.js"), "1").unwrap();
        let p = |u: &str| archivo(&www, &format!("{ORIGEN}{u}"));
        assert_eq!(p("/").0, 200);
        assert_eq!(p("/index.html?x=1#y").1, "text/html; charset=utf-8");
        assert_eq!(p("/js/a%20b.js").0, 200);
        assert_eq!(p("/js/a%20b.js").1, "text/javascript; charset=utf-8");
        assert_eq!(p("/sw.js").0, 404);
        assert_eq!(p("/../secreto.txt").0, 403);
        assert_eq!(p("/%2e%2e/secreto.txt").0, 403);
        assert_eq!(p("/js%5c..%5c..%5csecreto.txt").0, 403);
        assert_eq!(p("/C:/Windows/win.ini").0, 403);
        assert_eq!(p("/no-existe.png").0, 404);
    }

    #[test]
    fn emergentes() {
        assert!(es_emergente_permitida("https://accounts.google.com/o/oauth2"));
        assert!(es_emergente_permitida("https://pokesurvivor-paul.firebaseapp.com/__/auth/handler?x"));
        assert!(!es_emergente_permitida("https://evil.com/__/auth/x"));
        assert!(!es_emergente_permitida("https://firebaseapp.com.evil.com/__/auth/"));
        assert!(!es_emergente_permitida("https://github.com/"));
    }
}
