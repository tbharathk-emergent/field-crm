/* Platform + breakpoint detection for responsive shell switching.
 *
 * Rules:
 *  - Native Capacitor builds (Android/iOS) ALWAYS use the mobile navigation
 *    shells, whatever the screen size or orientation — a tablet app must not
 *    morph into the desktop web UI.
 *  - On the web, the desktop shell applies from Tailwind's `lg` breakpoint
 *    (1024px) and tracks live window resizes / orientation changes.
 *
 * Page content inside either shell adapts with ordinary Tailwind breakpoints,
 * so a large tablet still uses its width under the mobile navigation.
 */
import { useEffect, useState } from "react";
import { isNativeRuntime } from "./pushNotifications";

export { isNativeRuntime };

export const DESKTOP_MIN_WIDTH = 1024; // keep in sync with Tailwind `lg`

const QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;

function matches() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY).matches
    : false;
}

function subscribe(mql, fn) {
  // Safari < 14 only supports addListener/removeListener.
  if (mql.addEventListener) mql.addEventListener("change", fn);
  else mql.addListener(fn);
  return () => {
    if (mql.removeEventListener) mql.removeEventListener("change", fn);
    else mql.removeListener(fn);
  };
}

/** True on desktop-width web browsers; always false inside the native shell. */
export function useIsDesktop() {
  // The runtime cannot change while the app is open; read it once per mount.
  const [native] = useState(isNativeRuntime);
  const [wide, setWide] = useState(matches);

  useEffect(() => {
    if (native || typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(QUERY);
    setWide(mql.matches);
    return subscribe(mql, (e) => setWide(e.matches));
  }, [native]);

  return !native && wide;
}

/**
 * Mirror the same decision onto <html> as `is-native` / `is-desktop` classes,
 * before React's first paint, so plain CSS can key off the active shell.
 */
export function initPlatformClasses() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const native = isNativeRuntime();
  root.classList.toggle("is-native", native);
  const apply = (wide) => root.classList.toggle("is-desktop", !native && wide);
  if (native || typeof window.matchMedia !== "function") { apply(false); return; }
  const mql = window.matchMedia(QUERY);
  apply(mql.matches);
  subscribe(mql, (e) => apply(e.matches));
}
