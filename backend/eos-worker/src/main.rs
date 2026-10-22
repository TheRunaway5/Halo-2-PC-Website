use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io::{self, BufRead, Read, Write},
    time::{Duration, Instant},
};
#[allow(unsafe_code)]
#[cxx::bridge(namespace = "halo2::eos")]
mod ffi {
    struct Config {
        product: String,
        sandbox: String,
        deployment: String,
        client: String,
        secret: String,
        cache: String,
    }
    struct Stat {
        name: String,
        value: i32,
    }
    struct Record {
        user: String,
        rank: u32,
        score: i32,
    }
    struct Proof {
        user: String,
        account: String,
        provider: i32,
        account_info: bool,
        client: String,
        product: String,
        sandbox: String,
        deployment: String,
    }
    unsafe extern "C++" {
        include!("src/sdk.hpp");
        type Sdk;
        fn create(config: &Config) -> Result<UniquePtr<Sdk>>;
        fn publish(self: Pin<&mut Sdk>, user: &str, values: &[Stat]) -> Result<()>;
        fn query(self: Pin<&mut Sdk>, user: &str, names: &[String]) -> Result<()>;
        fn values(self: &Sdk, user: &str, names: &[String]) -> Result<Vec<Stat>>;
        fn leaderboard(self: Pin<&mut Sdk>, id: &str) -> Result<()>;
        fn records(self: &Sdk) -> Result<Vec<Record>>;
        fn verify(self: Pin<&mut Sdk>, user: &str, token: &str) -> Result<()>;
        fn proof(self: &Sdk) -> Proof;
        fn poll(self: Pin<&mut Sdk>) -> i32;
    }
}
type Error = Box<dyn std::error::Error>;
fn config() -> Result<(ffi::Config, String), Error> {
    let mut file = BTreeMap::new();
    if let Ok(path) = std::env::var("H2_EOS_SERVER_CONFIG") {
        let contents = std::fs::read_to_string(path)?;
        if contents.len() > 16384 {
            return Err("Configuration too large".into());
        }
        for line in contents
            .lines()
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.starts_with('#'))
        {
            let (k, v) = line.split_once('=').ok_or("Invalid config")?;
            if !k.starts_with("H2_EOS_") || file.insert(k.to_owned(), v.to_owned()).is_some() {
                return Err("Invalid config key".into());
            }
        }
    }
    let get = |name: &str| -> Result<String, Error> {
        let value = std::env::var(name)
            .ok()
            .or_else(|| file.get(name).cloned())
            .ok_or("Missing server configuration")?;
        if value.is_empty() || value.len() > 4096 || value.bytes().any(|v| v < 32 || v == 127) {
            return Err("Invalid server configuration".into());
        }
        Ok(value)
    };
    let c = ffi::Config {
        product: get("H2_EOS_PRODUCT_ID")?,
        sandbox: get("H2_EOS_SANDBOX_ID")?,
        deployment: get("H2_EOS_DEPLOYMENT_ID")?,
        client: get("H2_EOS_SERVER_CLIENT_ID")?,
        secret: get("H2_EOS_SERVER_CLIENT_SECRET")?,
        cache: get("H2_EOS_SERVER_CACHE_DIR")?,
    };
    if !std::path::Path::new(&c.cache).is_absolute()
        || ![&c.product, &c.sandbox, &c.deployment]
            .into_iter()
            .all(|s| puid(s))
    {
        return Err("Invalid server identifiers or cache".into());
    }
    std::fs::create_dir_all(&c.cache)?;
    Ok((c, get("H2_EOS_CLIENT_ID")?))
}
fn puid(s: &str) -> bool {
    s.len() == 32
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn name(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
}
fn board_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 256
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-.:".contains(&b))
}
fn verified_account(
    v: ffi::Proof,
    user: &str,
    c: &ffi::Config,
    game: &str,
) -> Result<String, Error> {
    if !v.account_info
        || v.provider != 8
        || v.account.is_empty()
        || v.user != user
        || v.client != game
        || v.product != c.product
        || v.sandbox != c.sandbox
        || v.deployment != c.deployment
    {
        return Err("EOS identity audience or provider mismatch".into());
    }
    Ok(v.account)
}
fn wait(sdk: &mut cxx::UniquePtr<ffi::Sdk>) -> Result<(), Error> {
    let until = Instant::now() + Duration::from_secs(15);
    loop {
        let code = sdk.pin_mut().poll();
        if code == 0 {
            return Ok(());
        }
        if code > 0 {
            return Err(format!("EOS result {code}").into());
        }
        if Instant::now() >= until {
            return Err("EOS operation timed out".into());
        }
        std::thread::sleep(Duration::from_millis(2));
    }
}
fn execute(
    sdk: &mut cxx::UniquePtr<ffi::Sdk>,
    request: Value,
    c: &ffi::Config,
    game: &str,
) -> Result<Value, Error> {
    let op = request["op"].as_str().ok_or("Missing operation")?;
    if op == "board" {
        let id = request["board"]
            .as_str()
            .filter(|s| board_id(s))
            .ok_or("Invalid board")?;
        sdk.pin_mut().leaderboard(id)?;
        wait(sdk)?;
        return Ok(
            json!({"records":sdk.records()?.into_iter().map(|r|json!({"user":r.user,"rank":r.rank,"score":r.score})).collect::<Vec<_>>()}),
        );
    }
    let user = request["user"]
        .as_str()
        .filter(|s| puid(s))
        .ok_or("Invalid product user")?;
    if op == "verify" {
        let token = request["token"]
            .as_str()
            .filter(|s| s.len() <= 8192 && !s.is_empty())
            .ok_or("Invalid proof")?;
        sdk.pin_mut().verify(user, token)?;
        wait(sdk)?;
        return Ok(json!({"account":verified_account(sdk.proof(),user,c,game)?}));
    }
    let values = request["stats"]
        .as_object()
        .filter(|v| !v.is_empty() && v.len() <= 128)
        .ok_or("Invalid statistics")?;
    let mut stats = Vec::new();
    for (key, value) in values {
        if !name(key) {
            return Err("Invalid statistic name".into());
        }
        stats.push(ffi::Stat {
            name: key.clone(),
            value: i32::try_from(value.as_i64().ok_or("Invalid statistic value")?)?,
        });
    }
    let names = stats.iter().map(|s| s.name.clone()).collect::<Vec<_>>();
    if op == "publish" {
        sdk.pin_mut().publish(user, &stats)?;
        wait(sdk)?;
    } else if op != "query" {
        return Err("Unknown operation".into());
    }
    // Ingest acceptance is not proof of processing: return queried values.
    sdk.pin_mut().query(user, &names)?;
    wait(sdk)?;
    let result = sdk
        .values(user, &names)?
        .into_iter()
        .map(|s| (s.name, json!(s.value)))
        .collect::<serde_json::Map<_, _>>();
    Ok(json!({"stats":result}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provider_and_every_identity_scope_must_match() {
        let config = ffi::Config {
            product: "product".into(),
            sandbox: "sandbox".into(),
            deployment: "deployment".into(),
            client: "server".into(),
            secret: "".into(),
            cache: "".into(),
        };
        let proof = || ffi::Proof {
            user: "user".into(),
            account: "stable-master-account".into(),
            provider: 8,
            account_info: true,
            client: "game".into(),
            product: "product".into(),
            sandbox: "sandbox".into(),
            deployment: "deployment".into(),
        };
        assert_eq!(
            verified_account(proof(), "user", &config, "game").unwrap(),
            "stable-master-account"
        );
        for field in 0..8 {
            let mut v = proof();
            match field {
                0 => v.user = "other".into(),
                1 => v.account_info = false,
                2 => v.provider = 0,
                3 => v.account.clear(),
                4 => v.client = "other".into(),
                5 => v.product = "other".into(),
                6 => v.sandbox = "other".into(),
                _ => v.deployment = "other".into(),
            }
            assert!(verified_account(v, "user", &config, "game").is_err());
        }
    }
    #[test]
    fn vendor_ids_and_stat_names_have_separate_bounds() {
        assert!(board_id("01234567-abcd-ef01-2345-6789abcdef01"));
        assert!(name("H2_KILLS"));
        assert!(!name("h2_kills"));
        for bad in ["", "https://example.com", "a\n"] {
            assert!(!board_id(bad));
        }
        assert!(!board_id(&"a".repeat(257)));
        assert!(!puid(&"0".repeat(31)));
        assert!(!puid(&"G".repeat(32)));
        assert!(puid(&"a".repeat(32)));
    }
}
fn main() {
    if let Err(_) = run() {
        eprintln!("EOS worker initialization failed; verify private server configuration");
        std::process::exit(1);
    }
}
fn run() -> Result<(), Error> {
    let (config, game) = config()?;
    let mut sdk = ffi::create(&config)?;
    let mut input = io::stdin().lock();
    let mut output = io::stdout().lock();
    loop {
        let mut line = Vec::new();
        let bytes = input.by_ref().take(65537).read_until(b'\n', &mut line)?;
        if bytes == 0 {
            break;
        }
        if bytes > 65536 || line.last() != Some(&b'\n') {
            return Err("RPC input exceeded bound".into());
        }
        let response = serde_json::from_slice(&line)
            .map_err(|_| -> Error { "Invalid RPC JSON".into() })
            .and_then(|v| execute(&mut sdk, v, &config, &game));
        // A timed-out callback may still arrive. Retire this platform before
        // another RPC can accidentally consume the previous operation's result.
        let timed_out = response
            .as_ref()
            .err()
            .is_some_and(|e| e.to_string() == "EOS operation timed out");
        let value = match response {
            Ok(v) => json!({"ok":true,"value":v}),
            Err(e) => json!({"ok":false,"error":e.to_string()}),
        };
        writeln!(output, "H2EOS {}", value)?;
        output.flush()?;
        if timed_out {
            return Err("EOS operation timed out".into());
        }
    }
    Ok(())
}
