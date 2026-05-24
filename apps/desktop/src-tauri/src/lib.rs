use std::sync::Mutex;

use tauri::{Manager, RunEvent};

mod backend;

use backend::{BackendProcess, BackendState};

const BRIDGE_INIT_SCRIPT: &str = include_str!("../../src/bridge.js");

#[tauri::command]
fn ensure_runtime_stack_running(
    app: tauri::AppHandle<tauri::Wry>,
    backend_process: tauri::State<'_, BackendProcess>,
) -> Result<bool, String> {
    let mut state = backend_process
        .0
        .lock()
        .map_err(|_| "Backend state lock poisoned".to_string())?;
    backend::start_locked(&mut state, &app)?;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(&backend::advertised_endpoint_script(&state.base_url));
    }
    Ok(true)
}

#[tauri::command]
fn desktop_runtime_status(
    app: tauri::AppHandle<tauri::Wry>,
    backend_process: tauri::State<'_, BackendProcess>,
) -> Result<backend::BackendRuntimeStatus, String> {
    let mut state = backend_process
        .0
        .lock()
        .map_err(|_| "Backend state lock poisoned".to_string())?;
    if !backend::is_healthy(&state.base_url) {
        let _ = backend::start_locked(&mut state, &app);
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(&backend::advertised_endpoint_script(&state.base_url));
    }
    Ok(backend::status_locked(&mut state))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bootstrap_script = format!(
        "window.desktopBridge = Object.assign({{}}, window.desktopBridge, {{ advertisedEndpoint: null }});\n{}",
        BRIDGE_INIT_SCRIPT,
    );
    let bridge = tauri::plugin::Builder::<tauri::Wry>::new("ilms-bridge")
        .js_init_script(bootstrap_script)
        .build();

    tauri::Builder::default()
        .plugin(bridge)
        .manage(BackendProcess(Mutex::new(BackendState::default())))
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let state = handle.state::<BackendProcess>();
                let mut guard = match state.0.lock() {
                    Ok(g) => g,
                    Err(_) => return,
                };
                let _ = backend::start_locked(&mut guard, &handle);
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.eval(&backend::advertised_endpoint_script(&guard.base_url));
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ensure_runtime_stack_running,
            desktop_runtime_status
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::ExitRequested { .. }) {
                let state = app_handle.state::<BackendProcess>();
                let lock_result = state.0.lock();
                if let Ok(mut guard) = lock_result {
                    backend::stop_locked(&mut guard);
                }
            }
        });
}
