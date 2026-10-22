fn main() {
    let root = std::path::PathBuf::from(
        std::env::var_os("HALO2_EOS_SDK_ROOT").expect("Set HALO2_EOS_SDK_ROOT to the official SDK"),
    );
    cxx_build::bridge("src/main.rs")
        .std("c++20")
        .include(".")
        .include(root.join("Include"))
        .file("src/sdk.cpp")
        .compile("halo2-eos-sdk");
    println!(
        "cargo:rustc-link-search=native={}",
        root.join("Bin").display()
    );
    let library = match std::env::var("CARGO_CFG_TARGET_OS").unwrap().as_str() {
        "linux" if std::env::var("CARGO_CFG_TARGET_ARCH").unwrap() == "aarch64" => {
            "EOSSDK-LinuxArm64-Shipping"
        }
        "linux" => "EOSSDK-Linux-Shipping",
        "macos" => "EOSSDK-Mac-Shipping",
        "windows" => {
            println!(
                "cargo:rustc-link-search=native={}",
                root.join("Lib").display()
            );
            "EOSSDK-Win64-Shipping"
        }
        _ => panic!("Unsupported EOS worker platform"),
    };
    println!("cargo:rustc-link-lib=dylib={library}");
    println!("cargo:rerun-if-env-changed=HALO2_EOS_SDK_ROOT");
    for file in ["src/main.rs", "src/sdk.cpp", "src/sdk.hpp"] {
        println!("cargo:rerun-if-changed={file}");
    }
}
