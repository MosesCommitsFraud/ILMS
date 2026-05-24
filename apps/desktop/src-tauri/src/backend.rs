use std::env;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;

pub struct BackendProcess(pub Mutex<BackendState>);

pub struct BackendState {
    pub child: Option<Child>,
    pub base_url: String,
    pub last_error: Option<String>,
}

impl Default for BackendState {
    fn default() -> Self {
        Self {
            child: None,
            base_url: default_base_url(),
            last_error: None,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendRuntimeStatus {
    pub running: bool,
    pub healthy: bool,
    pub base_url: String,
    pub pid: Option<u32>,
    pub last_error: Option<String>,
}

fn default_base_url() -> String {
    env::var("ILMS_BACKEND_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:4242".to_string())
}

fn ws_url(base_url: &str) -> String {
    base_url
        .replacen("http://", "ws://", 1)
        .replacen("https://", "wss://", 1)
}

fn health_url(base_url: &str) -> String {
    format!("{}/health", base_url.trim_end_matches('/'))
}

pub fn is_healthy(base_url: &str) -> bool {
    match ureq::get(&health_url(base_url))
        .timeout(Duration::from_millis(1200))
        .call()
    {
        Ok(response) => response.status() == 200,
        Err(_) => false,
    }
}

fn is_running(child: &mut Child) -> bool {
    matches!(child.try_wait(), Ok(None))
}

fn resolve_bun_binary() -> String {
    env::var("BUN_BIN")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| {
            if cfg!(target_os = "windows") {
                "bun.exe".to_string()
            } else {
                "bun".to_string()
            }
        })
}

fn find_workspace_root() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut current: Option<&Path> = Some(manifest_dir.as_path());
    while let Some(path) = current {
        if path.join("apps").join("server").join("package.json").exists() {
            return Some(path.to_path_buf());
        }
        current = path.parent();
    }
    None
}

fn spawn_dev_server(base_url: &str) -> Result<Child, String> {
    let root = find_workspace_root().ok_or_else(|| "Could not find ILMS workspace root".to_string())?;
    let port = base_url
        .rsplit(':')
        .next()
        .and_then(|s| s.split('/').next())
        .unwrap_or("4242")
        .to_string();

    let bun = resolve_bun_binary();
    let entry = root.join("apps").join("server").join("src").join("bin.ts");

    Command::new(&bun)
        .arg("run")
        .arg(entry)
        .env("PORT", port)
        .current_dir(root.join("apps").join("server"))
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| format!("Failed to launch bun: {}", error))
}

pub fn start_locked(state: &mut BackendState, _app: &AppHandle) -> Result<(), String> {
    if let Some(child) = state.child.as_mut() {
        if is_running(child) {
            return Ok(());
        }
    }
    state.child = None;
    state.last_error = None;

    if is_healthy(&state.base_url) {
        // Something else is already serving — adopt it.
        return Ok(());
    }

    match spawn_dev_server(&state.base_url) {
        Ok(child) => {
            state.child = Some(child);
            wait_for_health(&state.base_url, Duration::from_secs(10));
            Ok(())
        }
        Err(error) => {
            state.last_error = Some(error.clone());
            Err(error)
        }
    }
}

pub fn stop_locked(state: &mut BackendState) {
    if let Some(mut child) = state.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

pub fn status_locked(state: &mut BackendState) -> BackendRuntimeStatus {
    let mut running = false;
    let mut pid = None;
    if let Some(child) = state.child.as_mut() {
        if is_running(child) {
            running = true;
            pid = Some(child.id());
        } else {
            state.child = None;
        }
    }
    BackendRuntimeStatus {
        running,
        healthy: is_healthy(&state.base_url),
        base_url: state.base_url.clone(),
        pid,
        last_error: state.last_error.clone(),
    }
}

fn wait_for_health(base_url: &str, timeout: Duration) {
    let deadline = std::time::Instant::now() + timeout;
    while std::time::Instant::now() < deadline {
        if is_healthy(base_url) {
            return;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

pub fn advertised_endpoint_script(base_url: &str) -> String {
    let payload = serde_json::json!({
        "httpUrl": base_url,
        "wsUrl": format!("{}/rpc", ws_url(base_url).trim_end_matches('/')),
    });
    format!(
        "window.desktopBridge = Object.assign({{}}, window.desktopBridge, {{ advertisedEndpoint: {} }});",
        serde_json::to_string(&payload).unwrap_or_else(|_| "null".to_string()),
    )
}
