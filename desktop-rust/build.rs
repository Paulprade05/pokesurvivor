// Mete en el .exe el icono, los datos de versión y el manifiesto de Windows
// (pokesurvivor.rc, con la versión de Cargo.toml puesta), y exporta los
// símbolos que piden la gráfica potente en portátiles con dos gráficas
// (NVIDIA Optimus y AMD PowerXpress).
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-changed=pokesurvivor.rc");
    println!("cargo:rerun-if-changed=pokesurvivor.manifest");
    println!("cargo:rerun-if-changed=../desktop/icono.ico");
    let dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let version = std::env::var("CARGO_PKG_VERSION").unwrap();
    let mut n = version.split('.').map(|x| x.parse::<u16>().unwrap_or(0));
    let num = format!("{},{},{},0", n.next().unwrap_or(0), n.next().unwrap_or(0), n.next().unwrap_or(0));
    let ruta = |p: &str| dir.join(p).canonicalize().unwrap().display().to_string().replace('\\', "\\\\").replace("\\\\\\\\?\\\\", "");
    let rc = std::fs::read_to_string(dir.join("pokesurvivor.rc"))
        .unwrap()
        .replace("PS_VER_NUM", &num)
        .replace("PS_VER_STR", &format!("\"{version}\""))
        .replace("\"../desktop/icono.ico\"", &format!("\"{}\"", ruta("../desktop/icono.ico")))
        .replace("\"pokesurvivor.manifest\"", &format!("\"{}\"", ruta("pokesurvivor.manifest")));
    let f = out.join("pokesurvivor.rc");
    std::fs::write(&f, rc).unwrap();
    embed_resource::compile(&f, embed_resource::NONE).manifest_required().unwrap();
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        println!("cargo:rustc-link-arg-bins=/EXPORT:NvOptimusEnablement,DATA");
        println!("cargo:rustc-link-arg-bins=/EXPORT:AmdPowerXpressRequestHighPerformance,DATA");
    }
}
