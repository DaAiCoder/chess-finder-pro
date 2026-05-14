import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// PWA: register the service worker in production only.
//
// In dev, Vite serves JS modules dynamically with cache-busting query
// strings. A service worker that caches those modules causes stale-
// chunk hangs (blank white screen, no console error) on subsequent
// reloads, because the SW serves a JS file that no longer matches the
// current dev graph. So in dev we *unregister* any leftover worker and
// purge its caches — that auto-heals anyone who already has a stuck SW
// from a previous session.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* offline shell is best-effort */
        });
    });
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {
        /* ignore */
      });
    if (typeof caches !== "undefined") {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {
          /* ignore */
        });
    }
  }
}
