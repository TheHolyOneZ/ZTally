use std::path::Path;

fn main() {


    let dir = Path::new("../src/locales");
    println!("cargo:rerun-if-changed=../src/locales");
    let mut files: Vec<_> = std::fs::read_dir(dir)
        .expect("src/locales missing")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    files.sort();
    let mut code = String::from("pub const LOCALES: &[(&str, &str)] = &[\n");
    for p in files {
        let code_name = p.file_stem().unwrap().to_string_lossy().to_string();
        let abs = p.canonicalize().unwrap();
        println!("cargo:rerun-if-changed={}", abs.display());
        code += &format!("    ({code_name:?}, include_str!({:?})),\n", abs.display().to_string());
    }
    code += "];\n";
    let out = Path::new(&std::env::var("OUT_DIR").unwrap()).join("locales.rs");
    std::fs::write(out, code).unwrap();

    tauri_build::build()
}
