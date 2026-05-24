// Minimal shim injected into the Tauri webview before the web app boots.
// `window.desktopBridge` is created by the Rust side (see src-tauri/src/lib.rs)
// with `advertisedEndpoint: null`; this file marks the document and is a
// hook for future preload-equivalent code.
//
// Consumed as plain JS by `include_str!` in the Rust lib.

(() => {
  document.documentElement.classList.add("tauri");
})();

export {};
