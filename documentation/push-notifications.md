# Push Notifications — End-to-End Guide

**Phase 10 (Feb 2026)** — Complete FCM push notification pipeline for FieldCRM
Capacitor apps on Android and iOS. Zero manual file copying, per-tenant Firebase
project isolation, and clean handling of foreground / background / terminated
notification states.

---

## Architecture

```
    ┌─────────────┐            ┌────────────────┐           ┌─────────────┐
    │  Firebase   │  APNs/FCM  │  Tenant App    │           │  FieldCRM   │
    │  Console    ├───────────▶│  (Capacitor)   ├─token────▶│  Backend    │
    └─────────────┘            └────────────────┘           └─────────────┘
                                      ▲                            │
                                      │                            │
                                      └────────push message────────┘
                                       (fcm_service.send_to_tokens)
```

- Every tenant has an **isolated Firebase project** (see Super Admin → Cloud → Tenants → Firebase config).
- Tokens are scoped to `tenant_id + user_id` in the `push_tokens` collection.
- Backend uses `firebase_admin` initialised on-demand per tenant (see `fcm_service.py`).

---

## Frontend (React + Capacitor)

**Files**:
- `/app/frontend/src/lib/pushNotifications.js` — orchestrator (register / listeners / deep-link / unregister)
- `/app/frontend/src/context/AppContext.jsx` — calls `registerPushNotifications()` on login + boot, `unregisterPushNotifications()` on logout

Behaviour on native (Android/iOS):
1. **First launch** — `Capacitor.isNativePlatform()` returns true → the plugin requests permission via `PushNotifications.requestPermissions()`. iOS shows the system prompt "Allow XYZ to send you notifications?". Android 13+ shows the OS notification permission prompt.
2. **Token registered** — the `registration` event fires with the FCM token. We POST it to `/api/push/register` with `{ token, platform, device_label }`.
3. **Foreground** — `pushNotificationReceived` fires. We show a sonner toast via `toast(title, { description: body })`.
4. **Background / terminated** — the OS displays the notification banner. When the user taps, `pushNotificationActionPerformed` fires and we navigate to `notification.data.url` if provided.
5. **Logout** — the token is removed from `push_tokens` via `/api/push/unregister`, listeners are unregistered.

On web (PWA):
- All calls are no-ops (`isNativeRuntime()` returns false). No console errors, no permission prompts.

## Backend

**Files**:
- `/app/backend/fcm_service.py` — sharded per-tenant `firebase_admin.App` cache + `send_to_tokens(token_list, notification, data)`
- `/app/backend/server.py` — endpoints:
  - `POST /api/push/register` — upsert token in `push_tokens` (tenant-scoped)
  - `POST /api/push/unregister` — soft-delete by `token`
  - `POST /api/push/send` — admin/manager test endpoint

Tokens are stored with:
- `tenant_id`, `user_id`, `token`, `platform`, `device_label`, `last_seen_at`, `deleted_at` (null when active)

---

## iOS setup — auto-configured by build_app.py

`/app/build_system/ios.py` now applies all the following automatically on `--platform ios`:

1. **`GoogleService-Info.plist`** — fetched from the tenant's Firebase config and dropped into `ios/App/App/`.
2. **`App.entitlements`** — writes `aps-environment = production` (override with `IOS_APS_ENVIRONMENT=development` for sandbox APNs test).
3. **Podfile** — adds `pod 'Firebase/Messaging'` inside the `target 'App' do` block (idempotent).
4. **`AppDelegate.swift`** — patches:
   - `import Firebase`
   - `FirebaseApp.configure()` at top of `didFinishLaunchingWithOptions`
   - `Messaging.messaging().apnsToken = deviceToken` inside `didRegisterForRemoteNotificationsWithDeviceToken` — this is THE critical bridge from APNs → FCM
5. **`pod install`** — runs automatically on macOS after these mutations.

**Manual step (Xcode, once per project on your Mac):**
- Open `ios/App/App.xcworkspace` → select the **App** target → **Signing & Capabilities** → click **+ Capability** → add **Push Notifications**. This is required for the provisioning profile to include push. `build_app.py` cannot toggle this via CLI — Xcode owns the capability graph.
- Also verify **Background Modes → Remote notifications** is checked (build script sets `UIBackgroundModes = ["remote-notification"]` in Info.plist but Xcode UI must reflect it).

**APNs key upload (once per Firebase project, Apple Developer):**
- Go to https://developer.apple.com/account/resources/authkeys → Keys → create a new APNs Auth Key.
- Download the `.p8` file, note the Key ID + Team ID.
- In Firebase Console → your tenant's project → **Project Settings → Cloud Messaging → Apple app configuration** → Upload the `.p8` + Key ID + Team ID.
- Without this, Firebase can't sign push requests to APNs and iOS notifications will silently fail.

---

## Android setup — auto-configured by build_app.py

`/app/build_system/android.py` handles:

1. **`google-services.json`** — fetched from Firebase config → dropped into `android/app/`.
2. **`build.gradle`** — applies `com.google.gms.google-services` plugin + `firebase-messaging` BOM 33.3.0 dep.
3. **`AndroidManifest.xml`** — declares `POST_NOTIFICATIONS` permission (required on Android 13+).
4. **`strings.xml`** — sets the display name for the notification.

No manual step required on Android. `--output apk` or `--output aab` produces a fully push-enabled build.

---

## Testing checklist

### 1. Development device (Android or iOS)

Install the tenant APK/IPA and open the app:
- Expected: system permission prompt appears on first launch. Tap **Allow**.
- Expected in adb / Xcode logs: `[push] token registered on server: {ok: true, ...}`.

Verify server-side that the token was stored:
```bash
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
TOKEN=<jwt-of-logged-in-user>
curl -s "$API/api/push/register" -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"token":"<same fcm token>","platform":"android","device_label":"self-test"}'
# Expected: {"ok":true,"id":"...","updated":true}
```

### 2. Send test push from Firebase Console

- Firebase Console → Cloud Messaging → **Send test message**
- Paste the FCM token from the device logs
- Fill title/body → Send
- Expected: notification appears within 5 seconds on the device

**If iOS doesn't receive it:**
- Check `aps-environment` in `App.entitlements`. `production` for TestFlight/App Store, `development` for locally-built dev IPA.
- Check the APNs key is uploaded to the Firebase project (Firebase Console → Project Settings → Cloud Messaging).
- Check Bundle ID matches EXACTLY between: your Xcode project, `GoogleService-Info.plist` (`BUNDLE_ID` key), and Firebase Console → Apple app configuration.
- Check the iOS device has an internet connection (APNs requires TLS to Apple's servers).

### 3. Send test push from your backend

```bash
curl -X POST "$API/api/push/send" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "user_id": "<recipient user id>",
      "notification": {"title": "New order", "body": "Order #4271 needs approval"},
      "data": {"url": "/orders/4271"}
    }'
```

The `data.url` opens that path in the app when the user taps the notification (background/terminated states).

### 4. All 4 app states

| State | Test | Expected |
|---|---|---|
| Foreground | App visible, send test | Sonner toast appears at bottom |
| Background | Press home, send test | System banner + sound; tap → app opens |
| Minimized | Same as background | Same as background |
| Terminated | Swipe up in app switcher, force-quit, send test | System banner appears; tap → app cold-boots and navigates to `data.url` |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No permission prompt on first launch | User previously denied on this app | Reinstall app OR go to Settings → App → Notifications → toggle on |
| `[push] registration failed: not implemented` in web console | Running on web, plugin absent | Expected — web is a no-op |
| iOS: token registered but no notifications | APNs key missing in Firebase | Upload `.p8` at Firebase Console → Cloud Messaging |
| iOS: build fails on `pod install` | CocoaPods not installed | `sudo gem install cocoapods` on your Mac |
| Android: token registered but no notifications | google-services.json corrupt or from wrong project | Re-provision tenant Firebase in Super Admin, rebuild |
| Terminated tap doesn't navigate | notification payload has no `data.url` | Include `data: { url: "/some/path" }` in your send call |
| Multiple users on same device get old user's notifications | Token wasn't unregistered before logout | Ensure `logout()` fires — check network tab for `POST /api/push/unregister` |

---

## Test credentials for QA

- Super admin (has no push): `9858558555` / OTP `557725`
- Tenant admin (demo): `9000000001` / OTP `123456` / tenant `demo`

The demo tenant currently has real Firebase config auto-provisioned; use it to smoke-test the end-to-end delivery.
