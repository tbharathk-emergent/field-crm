/**
 * Push Notifications — cross-platform orchestrator.
 *
 * Handles the full lifecycle for Capacitor native (Android/iOS) builds:
 *   1. Request permission (system prompt on first launch)
 *   2. Register with APNs/FCM
 *   3. Post the FCM token to /api/push/register with device metadata
 *   4. Listen for foreground / background / terminated-state notifications
 *   5. Deep-link on notification tap using the `data.click_action` / `data.url`
 *   6. Unregister the token on logout (called explicitly by AppContext)
 *
 * On the WEB (pure PWA) the whole module is a no-op — Capacitor plugins
 * throw "not implemented" outside a native runtime. We short-circuit early.
 *
 * Notification handling in all app states:
 *   - Foreground → pushNotificationReceived event fires → we show a toast
 *   - Background → OS displays the system notification banner (data + notification payloads both work)
 *   - Terminated → same as background; when user taps, pushNotificationActionPerformed fires
 *
 * Registration is idempotent — repeated calls with the same token just bump
 * `last_seen_at` on the backend.
 */
import { api } from "@/lib/api";
import { toast } from "sonner";

let unsubHandlers = [];
let currentToken = null;
let registering = false;

/** Return true when we're running inside a Capacitor native container (Android/iOS). */
export function isNativeRuntime() {
  return !!(
    typeof window !== "undefined" &&
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform()
  );
}

/** Best-effort platform label sent to the backend. */
function platformLabel() {
  if (!isNativeRuntime()) return "web";
  try {
    const p = window.Capacitor.getPlatform();
    return p === "ios" ? "ios" : p === "android" ? "android" : "web";
  } catch {
    return "web";
  }
}

/** Best-effort human-readable device label ("iPhone 15 Pro", "Pixel 8"). */
function deviceLabel() {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const model = ua.match(/\((.*?)\)/)?.[1] || ua.slice(0, 80);
  return model.slice(0, 120);
}

/**
 * Start the push flow. Idempotent — safe to call every time a user logs in.
 * On web this is a no-op.
 */
export async function registerPushNotifications() {
  if (registering) return;
  if (!isNativeRuntime()) return;                     // web PWA: skip
  registering = true;
  try {
    const mod = await import("@capacitor/push-notifications");
    const { PushNotifications } = mod;
    if (!PushNotifications) throw new Error("PushNotifications plugin missing");

    // 1. Check current permission — request if not granted.
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      // Permission denied — user can re-enable from OS Settings later. No throw.
      console.info("[push] permission not granted:", perm.receive);
      return;
    }

    // 2. Register listeners BEFORE calling register() so we don't miss the
    //    first token/error event.
    _wireListeners(PushNotifications);

    // 3. Register — triggers `registration` (with FCM token on Android, APNs
    //    token on iOS) or `registrationError`.
    await PushNotifications.register();
  } catch (err) {
    console.warn("[push] registration failed:", err?.message || err);
  } finally {
    registering = false;
  }
}

function _wireListeners(PushNotifications) {
  // Clear any previous listeners on re-login.
  _removeListeners();

  const onRegistration = PushNotifications.addListener("registration", async ({ value }) => {
    currentToken = value;
    try {
      const res = await api.post("/push/register", {
        token: value,
        platform: platformLabel(),
        device_label: deviceLabel(),
      });
      console.info("[push] token registered on server:", res.data);
    } catch (err) {
      console.warn("[push] server registration failed:", err?.response?.data || err?.message);
    }
  });

  const onError = PushNotifications.addListener("registrationError", (err) => {
    console.error("[push] registrationError:", err?.error || err);
  });

  const onReceived = PushNotifications.addListener(
    "pushNotificationReceived",
    (notif) => {
      // Foreground handler — OS won't show the banner itself, so we surface a toast.
      const title = notif?.title || notif?.data?.title || "New notification";
      const body = notif?.body || notif?.data?.body || "";
      toast(title, { description: body });
    },
  );

  const onTap = PushNotifications.addListener(
    "pushNotificationActionPerformed",
    ({ notification }) => {
      // User tapped the notification (from background/terminated). Route via `data.url`.
      const url = notification?.data?.url || notification?.data?.click_action;
      if (url && typeof window !== "undefined") {
        // In-app SPA navigation — /some/path
        if (url.startsWith("/")) {
          window.location.assign(url);
        } else if (/^https?:\/\//.test(url)) {
          window.location.href = url;
        }
      }
    },
  );

  unsubHandlers = [onRegistration, onError, onReceived, onTap];
}

async function _removeListeners() {
  for (const h of unsubHandlers) {
    try { (await h)?.remove?.(); } catch { /* noop */ }
  }
  unsubHandlers = [];
}

/**
 * Unregister the current device token on logout. Best-effort — no throw on
 * failure. Removes local listeners and clears cached token.
 */
export async function unregisterPushNotifications() {
  const token = currentToken;
  await _removeListeners();
  currentToken = null;
  if (!token) return;
  try {
    await api.post("/push/unregister", { token });
  } catch (err) {
    console.warn("[push] unregister failed:", err?.response?.data || err?.message);
  }
  try {
    if (isNativeRuntime()) {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await PushNotifications.removeAllListeners();
    }
  } catch { /* noop */ }
}
