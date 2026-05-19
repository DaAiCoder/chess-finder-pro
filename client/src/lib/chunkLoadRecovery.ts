/**
 * After a deploy, browsers may still run a cached index-*.js that imports
 * deleted chunk files → 404 + blank app. Reload once to pick up fresh HTML.
 */
const RELOAD_KEY = "cfp-chunk-reload";

export function installChunkLoadRecovery(): void {
  const reloadOnce = () => {
    try {
      if (sessionStorage.getItem(RELOAD_KEY)) return;
      sessionStorage.setItem(RELOAD_KEY, "1");
    } catch {
      /* still try reload */
    }
    window.location.reload();
  };

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadOnce();
  });

  window.addEventListener("unhandledrejection", (event) => {
    const msg = String(
      (event.reason as Error | undefined)?.message ?? event.reason ?? "",
    ).toLowerCase();
    if (
      msg.includes("failed to fetch dynamically imported module") ||
      msg.includes("importing a module script failed") ||
      msg.includes("error loading dynamically imported module")
    ) {
      event.preventDefault();
      reloadOnce();
    }
  });
}

/** Call after the app mounts successfully so a future deploy can auto-reload again. */
export function clearChunkLoadRecoveryFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* private mode */
  }
}
