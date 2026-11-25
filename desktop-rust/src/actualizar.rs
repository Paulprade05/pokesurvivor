// Actualizar con un clic (1.0, bloque I, 24-11-2026).
//
// - Mira la última release de GitHub (api.github.com) como mucho una vez cada 20 h.
// - Si su etiqueta win-vX.Y.Z es más nueva y trae el instalador, el juego lo avisa (con mando).
// - Con un clic baja el instalador SÓLO de la release oficial de Paulprade05/pokesurvivor (la
//   dirección la arma la app con la etiqueta, no se fía de ninguna que le den), comprueba su
//   SHA-256 con el que da GitHub para ese archivo (campo `digest` del API) y lo abre en modo
//   silencioso: se pone encima, en la misma carpeta, y vuelve a abrir el juego.
// - La partida no se toca: vive en %APPDATA%\PokeSurvivor\, fuera de la carpeta del programa, y la
//   app la copia al disco antes de cerrarse (como al cerrar la ventana).
// Sin crates nuevos: WinHTTP y la SHA-256 de Windows (BCrypt) vienen en el crate `windows`.
use std::{
    io::Write,
    path::{Path, PathBuf},
};

use serde_json::Value;
use windows::{
    Win32::{
        Networking::WinHttp::*,
        Security::Cryptography::{BCRYPT_HASH_HANDLE, BCRYPT_SHA256_ALG_HANDLE, BCryptCreateHash, BCryptDestroyHash, BCryptFinishHash, BCryptHashData},
    },
    core::{HSTRING, PCWSTR, w},
};

pub const REPO: &str = "Paulprade05/pokesurvivor";
pub const INSTALADOR: &str = "PokeSurvivor-Windows-Setup.exe";

/// De dónde se mira y se baja: GitHub, o (sólo para probar, con --actualizaciones=) un servidor en 127.0.0.1.
#[derive(Clone, Debug)]
pub struct Fuente {
    api: String,
    descargas: String,
}

impl Fuente {
    pub fn oficial() -> Self {
        Fuente { api: "https://api.github.com".into(), descargas: "https://github.com".into() }
    }
    /// Sólo un servidor de este PC (http://127.0.0.1:<puerto>): para probar sin publicar nada.
    pub fn prueba(base: &str) -> Option<Self> {
        let b = base.trim_end_matches('/');
        let puerto = b.strip_prefix("http://127.0.0.1:")?;
        if puerto.is_empty() || !puerto.bytes().all(|c| c.is_ascii_digit()) {
            return None;
        }
        Some(Fuente { api: b.into(), descargas: b.into() })
    }
    pub fn url_api(&self) -> String {
        format!("{}/repos/{REPO}/releases/latest", self.api)
    }
    pub fn url_instalador(&self, etiqueta: &str) -> String {
        format!("{}/{REPO}/releases/download/{etiqueta}/{INSTALADOR}", self.descargas)
    }
}

/// ¿La versión a es mayor que b? ('win-v0.10.0' > '0.9.1')
pub fn mas_nueva(a: &str, b: &str) -> bool {
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

/// La etiqueta de una release de la app: exactamente win-vX.Y.Z (va dentro de la dirección de descarga).
fn etiqueta_valida(t: &str) -> bool {
    t.strip_prefix("win-v").is_some_and(|v| {
        let p: Vec<&str> = v.split('.').collect();
        p.len() == 3 && p.iter().all(|n| !n.is_empty() && n.len() <= 6 && n.bytes().all(|c| c.is_ascii_digit()))
    })
}

#[derive(Clone, Debug, PartialEq)]
pub struct Nueva {
    pub etiqueta: String,
    pub version: String,
    /// SHA-256 del instalador que da GitHub (en minúsculas). Sin él no se instala con un clic.
    pub sha256: Option<String>,
    pub bytes: u64,
}

/// De la respuesta del API: la release nueva, si es más nueva que `actual` y trae el instalador.
pub fn leer_release(v: &Value, actual: &str) -> Option<Nueva> {
    if v["draft"] == Value::Bool(true) || v["prerelease"] == Value::Bool(true) {
        return None;
    }
    let etiqueta = v["tag_name"].as_str()?;
    if !etiqueta_valida(etiqueta) || !mas_nueva(etiqueta, actual) {
        return None;
    }
    let a = v["assets"].as_array()?.iter().find(|a| a["name"].as_str() == Some(INSTALADOR))?;
    let sha256 = a["digest"]
        .as_str()
        .and_then(|d| d.strip_prefix("sha256:"))
        .filter(|h| h.len() == 64 && h.bytes().all(|c| c.is_ascii_hexdigit()))
        .map(str::to_ascii_lowercase);
    Some(Nueva {
        etiqueta: etiqueta.to_owned(),
        version: etiqueta["win-v".len()..].to_owned(),
        sha256,
        bytes: a["size"].as_u64().unwrap_or(0),
    })
}

// ---- HTTP (WinHTTP) -----------------------------------------------------------
struct Asa(*mut core::ffi::c_void);
impl Drop for Asa {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                let _ = WinHttpCloseHandle(self.0);
            }
        }
    }
}

fn asa(p: *mut core::ffi::c_void, que: &str) -> Result<Asa, String> {
    if p.is_null() { Err(format!("{que}: {}", windows::core::Error::from_thread())) } else { Ok(Asa(p)) }
}

/// (https, servidor, puerto, ruta) de una dirección http(s)://servidor[:puerto]/ruta.
fn partes(url: &str) -> Option<(bool, String, u16, String)> {
    let (seguro, resto) = if let Some(r) = url.strip_prefix("https://") {
        (true, r)
    } else {
        (false, url.strip_prefix("http://")?)
    };
    let (servidor, ruta) = resto.split_once('/').map(|(s, r)| (s, format!("/{r}"))).unwrap_or((resto, "/".into()));
    let (host, puerto) = match servidor.rsplit_once(':') {
        Some((h, p)) => (h, p.parse().ok()?),
        None => (servidor, if seguro { 443 } else { 80 }),
    };
    if host.is_empty() {
        return None;
    }
    Some((seguro, host.to_owned(), puerto, ruta))
}

/// GET a `url` (sigue las redirecciones de GitHub a su almacén). Llama a `trozo` con cada parte y lo
/// que ocupa todo (0 si no se sabe). Error si no responde 200.
fn pedir(url: &str, aceptar: &str, mut trozo: impl FnMut(&[u8], u64) -> Result<(), String>) -> Result<(), String> {
    let (seguro, host, puerto, ruta) = partes(url).ok_or_else(|| format!("dirección no válida: {url}"))?;
    unsafe {
        let agente = HSTRING::from(format!("PokeSurvivor-Windows/{}", env!("CARGO_PKG_VERSION")));
        let mut s = WinHttpOpen(&agente, WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, PCWSTR::null(), PCWSTR::null(), 0);
        if s.is_null() {
            s = WinHttpOpen(&agente, WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, PCWSTR::null(), PCWSTR::null(), 0);
        }
        let sesion = asa(s, "WinHttpOpen")?;
        let _ = WinHttpSetTimeouts(sesion.0, 15_000, 15_000, 30_000, 30_000);
        let con = asa(WinHttpConnect(sesion.0, &HSTRING::from(host), puerto, 0), "WinHttpConnect")?;
        let banderas = if seguro { WINHTTP_FLAG_SECURE } else { WINHTTP_OPEN_REQUEST_FLAGS(0) };
        let req = asa(
            WinHttpOpenRequest(con.0, w!("GET"), &HSTRING::from(ruta), PCWSTR::null(), PCWSTR::null(), std::ptr::null(), banderas),
            "WinHttpOpenRequest",
        )?;
        let cab: Vec<u16> = format!("Accept: {aceptar}\r\n").encode_utf16().collect();
        WinHttpSendRequest(req.0, Some(&cab), None, 0, 0, 0).map_err(|e| format!("sin conexión ({e})"))?;
        WinHttpReceiveResponse(req.0, std::ptr::null_mut()).map_err(|e| format!("sin respuesta ({e})"))?;
        let mut estado = 0u32;
        let mut tam = 4u32;
        WinHttpQueryHeaders(
            req.0,
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
            PCWSTR::null(),
            Some(&mut estado as *mut u32 as *mut _),
            &mut tam,
            std::ptr::null_mut(),
        )
        .map_err(|e| e.to_string())?;
        if estado != 200 {
            return Err(format!("HTTP {estado}"));
        }
        let mut total = 0u64;
        let mut tam = 8u32;
        let _ = WinHttpQueryHeaders(
            req.0,
            WINHTTP_QUERY_CONTENT_LENGTH | WINHTTP_QUERY_FLAG_NUMBER64,
            PCWSTR::null(),
            Some(&mut total as *mut u64 as *mut _),
            &mut tam,
            std::ptr::null_mut(),
        );
        let mut buf = vec![0u8; 256 * 1024];
        loop {
            let mut n = 0u32;
            WinHttpReadData(req.0, buf.as_mut_ptr() as *mut _, buf.len() as u32, &mut n).map_err(|e| format!("se cortó la descarga ({e})"))?;
            if n == 0 {
                return Ok(());
            }
            trozo(&buf[..n as usize], total)?;
        }
    }
}

/// La última release (JSON del API de GitHub).
pub fn ultima_release(f: &Fuente) -> Result<Value, String> {
    let mut datos = Vec::new();
    pedir(&f.url_api(), "application/vnd.github+json", |t, _| {
        datos.extend_from_slice(t);
        if datos.len() > 4 << 20 { Err("respuesta demasiado grande".into()) } else { Ok(()) }
    })?;
    serde_json::from_slice(&datos).map_err(|e| e.to_string())
}

// ---- SHA-256 (BCrypt de Windows) -----------------------------------------------
pub struct Sha256(BCRYPT_HASH_HANDLE);

impl Sha256 {
    pub fn new() -> Result<Self, String> {
        let mut h = BCRYPT_HASH_HANDLE(std::ptr::null_mut());
        let st = unsafe { BCryptCreateHash(BCRYPT_SHA256_ALG_HANDLE, &mut h, None, None, 0) };
        if st.0 < 0 { Err(format!("SHA-256 no disponible ({:#x})", st.0)) } else { Ok(Sha256(h)) }
    }
    pub fn update(&mut self, d: &[u8]) {
        unsafe {
            let _ = BCryptHashData(self.0, d, 0);
        }
    }
    pub fn hex(self) -> String {
        let mut out = [0u8; 32];
        unsafe {
            let _ = BCryptFinishHash(self.0, &mut out, 0);
        }
        out.iter().map(|b| format!("{b:02x}")).collect()
    }
}

impl Drop for Sha256 {
    fn drop(&mut self) {
        unsafe {
            let _ = BCryptDestroyHash(self.0);
        }
    }
}

/// Carpeta temporal donde se baja el instalador.
pub fn carpeta() -> PathBuf {
    std::env::temp_dir().join("PokeSurvivor-actualizacion")
}

/// Baja el instalador de `n` a `dir` y comprueba su SHA-256. `progreso(bajado, total)`.
pub fn bajar_instalador(f: &Fuente, n: &Nueva, dir: &Path, mut progreso: impl FnMut(u64, u64)) -> Result<PathBuf, String> {
    let esperado = n.sha256.clone().ok_or("la release no trae la huella SHA-256 del instalador")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let parcial = dir.join(format!("PokeSurvivor-Windows-Setup-{}.exe.part", n.version));
    let final_ = dir.join(format!("PokeSurvivor-Windows-Setup-{}.exe", n.version));
    let mut archivo = std::fs::File::create(&parcial).map_err(|e| e.to_string())?;
    let mut sha = Sha256::new()?;
    let mut bajado = 0u64;
    let r = pedir(&f.url_instalador(&n.etiqueta), "application/octet-stream", |t, total| {
        archivo.write_all(t).map_err(|e| e.to_string())?;
        sha.update(t);
        bajado += t.len() as u64;
        progreso(bajado, if total > 0 { total } else { n.bytes });
        Ok(())
    });
    drop(archivo);
    let r = r.and_then(|_| {
        if n.bytes > 0 && bajado != n.bytes {
            return Err(format!("tamaño distinto ({bajado} de {} bytes)", n.bytes));
        }
        let hecho = sha.hex();
        if hecho != esperado {
            return Err(format!("la huella SHA-256 no coincide ({hecho})"));
        }
        let _ = std::fs::remove_file(&final_);
        std::fs::rename(&parcial, &final_).map_err(|e| e.to_string())
    });
    if r.is_err() {
        let _ = std::fs::remove_file(&parcial);
    }
    r.map(|_| final_)
}

/// Parámetros del instalador (Inno Setup) para ponerse encima de esta copia sin preguntar nada y
/// volver a abrir el juego al acabar (/RELANZAR=1, ver instalador.iss).
pub fn parametros(exe_dir: &Path) -> String {
    let mut p = String::from("/SILENT /SP- /SUPPRESSMSGBOXES /NORESTART /NOCANCEL /RELANZAR=1");
    // Instalada con el instalador (tiene su desinstalador al lado): en la misma carpeta y para quien estaba.
    if exe_dir.join("unins000.exe").is_file() {
        let d = exe_dir.to_string_lossy().to_lowercase();
        let todos = ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"]
            .iter()
            .filter_map(|k| std::env::var(k).ok())
            .any(|pf| !pf.is_empty() && d.starts_with(&pf.to_lowercase()));
        p.push_str(if todos { " /ALLUSERS" } else { " /CURRENTUSER" });
        p.push_str(&format!(" /DIR=\"{}\"", exe_dir.display()));
    } else {
        // La del .zip (sin instalar): se instala como cualquier jugador nuevo.
        p.push_str(" /CURRENTUSER");
    }
    p
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use serde_json::json;

    #[test]
    fn versiones_como_numeros() {
        assert!(mas_nueva("win-v0.10.0", "0.9.1"));
        assert!(!mas_nueva("win-v0.4.0", "0.4.0"));
        assert!(!mas_nueva("v0.3.9", "0.4.0"));
        assert!(mas_nueva("1.0", "0.9.9"));
        assert!(!mas_nueva("", "0.4.0"));
    }

    #[test]
    fn etiquetas() {
        assert!(etiqueta_valida("win-v0.11.0"));
        assert!(!etiqueta_valida("v0.11.0"));
        assert!(!etiqueta_valida("win-v0.11"));
        assert!(!etiqueta_valida("win-v0.11.0/../../x"));
        assert!(!etiqueta_valida("win-v1.2.3?a=b"));
    }

    fn rel(tag: &str, digest: Option<&str>) -> Value {
        let mut a = json!({ "name": INSTALADOR, "size": 1234, "browser_download_url": "https://evil.example/x.exe" });
        if let Some(d) = digest {
            a["digest"] = json!(d);
        }
        json!({ "tag_name": tag, "draft": false, "prerelease": false, "assets": [a, { "name": "PokeSurvivor-Windows-Rust.zip", "size": 9 }] })
    }

    #[test]
    fn release_nueva() {
        let h = "AB".repeat(32);
        let n = leer_release(&rel("win-v0.11.0", Some(&format!("sha256:{h}"))), "0.10.0").unwrap();
        assert_eq!(n.version, "0.11.0");
        assert_eq!(n.sha256.as_deref(), Some("ab".repeat(32).as_str()));
        assert_eq!(n.bytes, 1234);
        // Igual o más vieja, borrador, prerelease o sin instalador: nada.
        assert!(leer_release(&rel("win-v0.10.0", None), "0.10.0").is_none());
        assert!(leer_release(&rel("win-v0.9.9", None), "0.10.0").is_none());
        let mut b = rel("win-v0.11.0", None);
        b["draft"] = json!(true);
        assert!(leer_release(&b, "0.10.0").is_none());
        let mut p = rel("win-v0.11.0", None);
        p["prerelease"] = json!(true);
        assert!(leer_release(&p, "0.10.0").is_none());
        let mut z = rel("win-v0.11.0", None);
        z["assets"] = json!([{ "name": "PokeSurvivor-Windows-Rust.zip" }]);
        assert!(leer_release(&z, "0.10.0").is_none());
        // Sin huella (o rara): se avisa, pero no se instala con un clic.
        assert_eq!(leer_release(&rel("win-v0.11.0", None), "0.10.0").unwrap().sha256, None);
        assert_eq!(leer_release(&rel("win-v0.11.0", Some("md5:abc")), "0.10.0").unwrap().sha256, None);
        assert!(leer_release(&rel("win-v0.11.0/../x", None), "0.10.0").is_none());
    }

    #[test]
    fn descarga_sólo_de_la_release_oficial() {
        let f = Fuente::oficial();
        assert_eq!(f.url_api(), "https://api.github.com/repos/Paulprade05/pokesurvivor/releases/latest");
        assert_eq!(
            f.url_instalador("win-v0.11.0"),
            "https://github.com/Paulprade05/pokesurvivor/releases/download/win-v0.11.0/PokeSurvivor-Windows-Setup.exe"
        );
        assert!(Fuente::prueba("http://127.0.0.1:8765").is_some());
        assert!(Fuente::prueba("http://127.0.0.1:8765/").is_some());
        assert!(Fuente::prueba("https://evil.example").is_none());
        assert!(Fuente::prueba("http://127.0.0.1.evil.example:80").is_none());
        assert!(Fuente::prueba("http://localhost:8765").is_none());
    }

    #[test]
    fn direcciones() {
        assert_eq!(partes("https://github.com/a/b"), Some((true, "github.com".into(), 443, "/a/b".into())));
        assert_eq!(partes("http://127.0.0.1:8765/x?y"), Some((false, "127.0.0.1".into(), 8765, "/x?y".into())));
        assert_eq!(partes("ftp://x/y"), None);
    }

    #[test]
    fn sha256_de_windows() {
        let mut s = Sha256::new().unwrap();
        s.update(b"ab");
        s.update(b"c");
        assert_eq!(s.hex(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn parametros_del_instalador() {
        let tmp = std::env::temp_dir().join("ps-act-prueba");
        std::fs::create_dir_all(&tmp).unwrap();
        let _ = std::fs::remove_file(tmp.join("unins000.exe"));
        let p = parametros(&tmp);
        assert!(p.contains("/SILENT") && p.contains("/RELANZAR=1") && p.contains("/CURRENTUSER") && !p.contains("/DIR="));
        std::fs::write(tmp.join("unins000.exe"), b"").unwrap();
        let p = parametros(&tmp);
        assert!(p.contains("/CURRENTUSER") && p.contains(&format!("/DIR=\"{}\"", tmp.display())));
        let _ = std::fs::remove_file(tmp.join("unins000.exe"));
    }
}
