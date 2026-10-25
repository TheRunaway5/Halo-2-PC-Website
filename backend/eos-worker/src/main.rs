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
        storage: bool,
        encryption: String,
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
        fn storage_login(self: Pin<&mut Sdk>, token: &str, user: &str) -> Result<()>;
        fn storage_query(self: Pin<&mut Sdk>) -> Result<()>;
        fn storage_clear_cache(self: Pin<&mut Sdk>) -> Result<()>;
        fn storage_missing(self: &Sdk) -> bool;
        fn storage_read(self: Pin<&mut Sdk>) -> Result<()>;
        fn storage_value(self: &Sdk) -> Result<String>;
        fn storage_write(self: Pin<&mut Sdk>, record: &str) -> Result<()>;
    }
}
type Error = Box<dyn std::error::Error>;
const FRIEND_CONFIG_KEYS: [&str; 7] = [
    "H2_EOS_PRODUCT_ID",
    "H2_EOS_SANDBOX_ID",
    "H2_EOS_DEPLOYMENT_ID",
    "H2_EOS_FRIEND_CLIENT_ID",
    "H2_EOS_FRIEND_CLIENT_SECRET",
    "H2_EOS_FRIEND_CACHE_DIR",
    "H2_EOS_FRIEND_ENCRYPTION_KEY",
];
fn read_config_file(
    path: &std::path::Path,
    private: bool,
) -> Result<BTreeMap<String, String>, Error> {
    if private && (!path.is_absolute() || !std::fs::symlink_metadata(path)?.is_file()) {
        return Err("Storage config must be an absolute private regular file".into());
    }
    let input = std::fs::File::open(path)?;
    let metadata = input.metadata()?;
    if !metadata.is_file() || metadata.len() > 16384 {
        return Err("Invalid config file size or type".into());
    }
    #[cfg(unix)]
    if private {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err("Storage config must be owner-only".into());
        }
    }
    let mut contents = String::new();
    input.take(16385).read_to_string(&mut contents)?;
    if contents.len() > 16384 {
        return Err("Configuration too large".into());
    }
    let mut file = BTreeMap::new();
    for line in contents
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty() && !s.starts_with('#'))
    {
        let (k, v) = line.split_once('=').ok_or("Invalid config")?;
        if !k.starts_with("H2_EOS_")
            || (private && !FRIEND_CONFIG_KEYS.contains(&k))
            || file.insert(k.to_owned(), v.to_owned()).is_some()
        {
            return Err("Invalid config key".into());
        }
    }
    if private && FRIEND_CONFIG_KEYS.iter().any(|k| !file.contains_key(*k)) {
        return Err("Incomplete storage config".into());
    }
    Ok(file)
}
fn config() -> Result<(ffi::Config, String), Error> {
    let storage = std::env::var("H2_EOS_WORKER_MODE").is_ok_and(|s| s == "friends");
    let mut file = BTreeMap::new();
    if let Ok(path) = std::env::var(if storage {
        "H2_EOS_FRIEND_STORAGE_CONFIG"
    } else {
        "H2_EOS_SERVER_CONFIG"
    }) {
        file = read_config_file(std::path::Path::new(&path), storage)?;
    } else if storage {
        return Err("Storage requires a dedicated private config file".into());
    }
    let get = |name: &str| -> Result<String, Error> {
        // Storage secrets/identity come only from the dedicated file. Its cache
        // may be overridden to an operation-owned temporary directory.
        let value = (if !storage || name == "H2_EOS_FRIEND_CACHE_DIR" {
            std::env::var(name).ok()
        } else {
            None
        })
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
        client: get(if storage {
            "H2_EOS_FRIEND_CLIENT_ID"
        } else {
            "H2_EOS_SERVER_CLIENT_ID"
        })?,
        secret: get(if storage {
            "H2_EOS_FRIEND_CLIENT_SECRET"
        } else {
            "H2_EOS_SERVER_CLIENT_SECRET"
        })?,
        cache: get(if storage {
            "H2_EOS_FRIEND_CACHE_DIR"
        } else {
            "H2_EOS_SERVER_CACHE_DIR"
        })?,
        storage,
        encryption: if storage {
            get("H2_EOS_FRIEND_ENCRYPTION_KEY")?
        } else {
            String::new()
        },
    };
    if !std::path::Path::new(&c.cache).is_absolute()
        || ![&c.product, &c.sandbox, &c.deployment]
            .into_iter()
            .all(|s| puid(s))
    {
        return Err("Invalid server identifiers or cache".into());
    }
    if storage && (c.encryption.len() != 64 || !c.encryption.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return Err("Invalid friend storage encryption key".into());
    }
    std::fs::create_dir_all(&c.cache)?;
    Ok((
        c,
        if storage {
            String::new()
        } else {
            get("H2_EOS_CLIENT_ID")?
        },
    ))
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
fn friend_record(record: &str) -> Result<Value, Error> {
    if record.len() > 32768 {
        return Err("Friend record exceeds bound".into());
    }
    let v: Value = serde_json::from_str(record)?;
    let uuid = |s: &str| {
        s.len() == 36
            && s.bytes().enumerate().all(|(i, b)| {
                if [8, 13, 18, 23].contains(&i) {
                    b == b'-'
                } else {
                    b.is_ascii_digit() || (b'a'..=b'f').contains(&b)
                }
            })
    };
    let owner = v["player"]
        .as_str()
        .filter(|s| uuid(s))
        .ok_or("Invalid friend record owner")?;
    let tag = v["friend_tag"]
        .as_str()
        .filter(|s| s.len() <= 73 && !s.chars().any(char::is_control))
        .ok_or("Invalid friend tag")?;
    let (name, suffix) = tag.rsplit_once('#').ok_or("Invalid friend tag")?;
    if v.as_object().is_none_or(|o| o.len() != 5)
        || v["format"] != "halo2-friends-v1"
        || name.is_empty()
        || suffix.len() != 8
        || !suffix.bytes().all(|b| b.is_ascii_digit())
        || v["revision"].as_u64().is_none_or(|n| n == 0)
    {
        return Err("Invalid friend record schema".into());
    }
    let rows = v["relationships"]
        .as_array()
        .filter(|r| r.len() <= 250)
        .ok_or("Invalid friend roster")?;
    let mut seen = std::collections::BTreeSet::new();
    for row in rows {
        let id = row["player"]
            .as_str()
            .filter(|s| uuid(s))
            .ok_or("Invalid friend target")?;
        if row.as_object().is_none_or(|r| r.len() != 2)
            || id == owner
            || !seen.insert(id)
            || !matches!(
                row["state"].as_str(),
                Some("friend" | "incoming" | "outgoing" | "blocked")
            )
        {
            return Err("Invalid friend relationship".into());
        }
    }
    Ok(v)
}
fn check_friend_revision(previous: &str, record: &str) -> Result<(), Error> {
    let old = friend_record(previous)?;
    let next = friend_record(record)?;
    if old["player"] != next["player"]
        || old["revision"].as_u64() > next["revision"].as_u64()
        || (old["revision"] == next["revision"] && previous != record)
    {
        return Err("Friend cloud revision conflict".into());
    }
    Ok(())
}
fn read_friend(sdk: &mut cxx::UniquePtr<ffi::Sdk>) -> Result<Option<String>, Error> {
    // Read-back must download the private cloud file, not our upload cache.
    sdk.pin_mut().storage_clear_cache()?;
    wait(sdk)?;
    sdk.pin_mut().storage_query()?;
    wait(sdk)?;
    if sdk.storage_missing() {
        return Ok(None);
    }
    sdk.pin_mut().storage_read()?;
    wait(sdk)?;
    let record = sdk.storage_value()?;
    friend_record(&record)?;
    Ok(Some(record))
}
fn friend_request(request: &Value) -> Result<(&str, &str, &str), Error> {
    if request.as_object().is_none_or(|v| v.len() != 4) || request["op"] != "friend_store" {
        return Err("Invalid storage operation schema".into());
    }
    let user = request["user"]
        .as_str()
        .filter(|s| puid(s))
        .ok_or("Invalid product user")?;
    let token = request["token"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 8192 && s.bytes().all(|b| b > 32 && b < 127))
        .ok_or("Invalid storage delegation")?;
    let record = request["record"].as_str().ok_or("Missing friend record")?;
    friend_record(record)?;
    Ok((user, token, record))
}
fn store_friend(sdk: &mut cxx::UniquePtr<ffi::Sdk>, request: &Value) -> Result<Value, Error> {
    let (user, token, record) = friend_request(request)?;
    sdk.pin_mut().storage_login(token, user)?;
    wait(sdk)?;
    if let Some(previous) = read_friend(sdk)? {
        check_friend_revision(&previous, record)?;
        if previous == record {
            return Ok(json!({"record":previous}));
        }
    }
    sdk.pin_mut().storage_write(record)?;
    wait(sdk)?;
    let stored = read_friend(sdk)?.ok_or("Friend cloud read-back missing")?;
    if stored != record {
        return Err("Friend cloud read-back differs".into());
    }
    Ok(json!({"record":stored}))
}
fn execute(
    sdk: &mut cxx::UniquePtr<ffi::Sdk>,
    request: Value,
    c: &ffi::Config,
    game: &str,
) -> Result<Value, Error> {
    let op = request["op"].as_str().ok_or("Missing operation")?;
    if c.storage {
        if op != "friend_store" {
            return Err("Storage client cannot execute this operation".into());
        }
        return store_friend(sdk, &request);
    }
    if op == "friend_store" {
        return Err("Friend storage requires its dedicated client".into());
    }
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
    fn friend_rpc_rejects_extra_fields_and_c_string_truncation() {
        let good = json!({"op":"friend_store","user":"a".repeat(32),"token":"private-token","record":friend().to_string()});
        assert!(friend_request(&good).is_ok());
        for token in ["", "valid\0ignored", "valid\nignored", "é"] {
            let mut bad = good.clone();
            bad["token"] = json!(token);
            assert!(friend_request(&bad).is_err());
        }
        let mut bad = good.clone();
        bad["publisher"] = json!(true);
        assert!(friend_request(&bad).is_err());
        bad = good;
        bad["user"] = json!("a".repeat(33));
        assert!(friend_request(&bad).is_err());
    }
    #[test]
    fn private_config_is_bounded_and_never_accepts_publisher_keys() {
        struct Owned(std::path::PathBuf);
        impl Drop for Owned {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let root = Owned(std::env::temp_dir().join(
            format!("eos-config-{}-{}",std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()),
        ));
        std::fs::create_dir(&root.0).unwrap();
        let path = root.0.join("private.env");
        let good = FRIEND_CONFIG_KEYS
            .iter()
            .map(|k| format!("{k}=placeholder\n"))
            .collect::<String>();
        std::fs::write(&path, &good).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
            assert!(read_config_file(&path, true).is_err());
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
            let link = root.0.join("linked.env");
            std::os::unix::fs::symlink(&path, &link).unwrap();
            assert!(read_config_file(&link, true).is_err());
        }
        assert!(read_config_file(&path, true).is_ok());
        for bad in [
            good.repeat(2),
            format!("{good}H2_EOS_SERVER_CLIENT_SECRET=unrelated\n"),
            "x".repeat(16385),
        ] {
            std::fs::write(&path, bad).unwrap();
            assert!(read_config_file(&path, true).is_err());
        }
    }
    #[test]
    fn storage_and_publisher_operations_cannot_cross_clients() {
        let mut config = ffi::Config {
            product: String::new(),
            sandbox: String::new(),
            deployment: String::new(),
            client: String::new(),
            secret: String::new(),
            cache: String::new(),
            storage: true,
            encryption: String::new(),
        };
        let mut no_sdk = cxx::UniquePtr::<ffi::Sdk>::null();
        // A policy rejection must happen before even touching a platform.
        for op in ["publish", "query", "verify", "board"] {
            assert!(execute(&mut no_sdk, json!({"op":op}), &config, "").is_err());
        }
        config.storage = false;
        assert!(execute(&mut no_sdk, json!({"op":"friend_store"}), &config, "").is_err());
    }
    fn friend() -> Value {
        json!({"format":"halo2-friends-v1","player":"01234567-abcd-ef01-2345-6789abcdef01",
            "friend_tag":"Player#00000001","revision":1,"relationships":[{
                "player":"01234567-abcd-ef01-2345-6789abcdef02","state":"incoming"}]})
    }
    #[test]
    fn friend_schema_bounds_privacy_and_states() {
        let good = friend();
        assert!(friend_record(&good.to_string()).is_ok());
        for i in 0..10 {
            let mut bad = good.clone();
            match i {
                0 => bad["private_subject"] = json!("private"),
                1 => bad["player"] = json!("private"),
                2 => bad["friend_tag"] = json!("Player#1234"),
                3 => bad["friend_tag"] = json!("Player#１２３４５６７８"),
                4 => bad["revision"] = json!(0),
                5 => bad["relationships"][0]["state"] = json!("accepted-without-consent"),
                6 => bad["relationships"][0]["player"] = bad["player"].clone(),
                7 => bad["relationships"][0]["token"] = json!("private"),
                8 => bad["relationships"] = json!(vec![bad["relationships"][0].clone(); 251]),
                _ => bad["friend_tag"] = json!("Player\n#12345678"),
            }
            assert!(
                friend_record(&bad.to_string()).is_err(),
                "invalid schema case {i}"
            );
        }
        assert!(friend_record(&" ".repeat(32769)).is_err());
    }
    #[test]
    fn retries_cannot_overwrite_another_owner_or_newer_revision() {
        let old = friend().to_string();
        assert!(check_friend_revision(&old, &old).is_ok());
        let mut next = friend();
        next["revision"] = json!(2);
        next["relationships"][0]["state"] = json!("friend");
        assert!(check_friend_revision(&old, &next.to_string()).is_ok());
        assert!(check_friend_revision(&next.to_string(), &old).is_err());
        next["revision"] = json!(1);
        assert!(check_friend_revision(&old, &next.to_string()).is_err());
        next["revision"] = json!(2);
        next["player"] = json!("01234567-abcd-ef01-2345-6789abcdef03");
        assert!(check_friend_revision(&old, &next.to_string()).is_err());
    }
    #[test]
    fn provider_and_every_identity_scope_must_match() {
        let config = ffi::Config {
            product: "product".into(),
            sandbox: "sandbox".into(),
            deployment: "deployment".into(),
            client: "server".into(),
            secret: "".into(),
            cache: "".into(),
            storage: false,
            encryption: String::new(),
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
        if timed_out || config.storage {
            if config.storage {
                break;
            }
            return Err("EOS operation timed out".into());
        }
    }
    Ok(())
}
