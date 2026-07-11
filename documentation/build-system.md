# Capacitor Build System — `build_app.py`

**Phase 10 (Feb 2026)** — Fully automated, per-tenant Capacitor build pipeline.
Produces a completely isolated Android APK/AAB + iOS Xcode project for any
tenant with a single command. Firebase files are fetched from the backend
automatically — never manually copied.

---

## Quick start

```bash
# 1. One-time setup — copy the example env file and edit it.
cp /app/build.env.example /app/build.env
$EDITOR /app/build.env

# 2. Discover tenants
python3 build_app.py --list-tenants

# 3. Build Android debug APK (sideloadable, no signing needed)
python3 build_app.py --tenant local-line --version 1.0.0 --version-code 1 --platform android

# 4. Build Android release AAB (Play Store)
python3 build_app.py --tenant local-line --version 2.4.1 --version-code 41 \
    --platform android --output aab

# 5. Prepare iOS Xcode project (open on Mac)
python3 build_app.py --tenant local-line --version 1.0.0 --version-code 1 --platform ios
```

Output lands in `${OUTPUT_DIR}/<slug>/` — one fully self-contained project per
tenant. Every re-run **wipes** the previous folder first, guaranteeing zero
cross-tenant contamination (Firebase files, cached JS, stale gradle build).

---

## build.env schema

The build script has **its own env file**, decoupled from the FastAPI backend.
Copy `/app/build.env.example` → `/app/build.env` (or pass `--env-file <path>`).

```env
# 1. Runtime API endpoints — baked into the tenant web bundle
API_BASE_URL=https://groceryapi.localappstore.in
PLATFORM_HOST=grocery.localappstore.in
WEB_BASE_URL=https://grocery.localappstore.in

# 2. Super admin creds — used to fetch the tenant manifest + Firebase files
SUPER_ADMIN_PHONE=9858558555
SUPER_ADMIN_OTP=557725
# SUPER_ADMIN_TOKEN=<pre-issued-JWT>   # if set, skips the OTP flow

# 3. Android release signing (leave blank for --output apk debug builds)
ANDROID_KEYSTORE_PATH=/Users/…/coverage/follo.jks
ANDROID_KEYSTORE_PASSWORD=android
ANDROID_KEY_ALIAS=follo
ANDROID_KEY_PASSWORD=android

# 4. iOS
IOS_TEAM_ID=YY28T8HJ3C
IOS_BUNDLE_PREFIX=in.localappstore.fieldcrm

# 5. Build output + Android SDK
OUTPUT_DIR=./output
# ANDROID_HOME=/opt/android-sdk        # required only for --output apk|aab compile
```

**How the URLs are used**

| var | Used by |
|---|---|
| `API_BASE_URL` | Injected as `REACT_APP_BACKEND_URL` when `yarn build` runs → the compiled JS bundle calls this API at runtime |
| `PLATFORM_HOST` | Set as `capacitor.config.ts` server.hostname (subdomain resolver + universal-link seed) and as `REACT_APP_PLATFORM_HOST` for the frontend |
| `WEB_BASE_URL` | Set as `REACT_APP_WEB_BASE_URL` — used by the web bundle for "Open in browser" / share fallbacks |

---

## Commands

### `--list-tenants`

Prints a formatted table of every tenant visible to the super admin:

```
  SLUG            NAME          TYPE         STATUS      USERS (emp/dlr/cust)
  ---------------------------------------------------------------------------
  local-line      Local Line    Grocery      active      12/8/145
  demo            Akshara Agro  Agriculture  active      29/24/43
  ...
  Total: 10 tenant(s)
```

### Tenant build

```
python3 build_app.py \
    --tenant <slug> \
    --platform <android|ios> \
    --version <x.y.z> \
    --version-code <int> \
    [--output apk|aab|prep]     (android only, default apk)
    [--env-file PATH]           (default ./build.env or /app/build.env)
    [--out-dir DIR]             (override OUTPUT_DIR)
    [--backend-url URL]         (override API_BASE_URL)
    [--verbose | -v]
```

---

## Automatic Firebase file management

Zero manual copying. On every build the script:

1. Fetches the tenant's Firebase config for BOTH platforms from
   `GET /api/super/build/manifest/<slug>` (super_admin auth).
2. Deletes any stale `google-services.json` / `GoogleService-Info.plist` from
   the previous run (`wipe_stale_firebase_files`).
3. Writes the fresh raw JSON/plist into:
   - `android/app/google-services.json`
   - `ios/App/App/GoogleService-Info.plist`
4. Applies the `com.google.gms.google-services` Gradle plugin + Firebase
   Messaging BOM automatically in `android/app/build.gradle` and root gradle.

If a tenant later removes their Firebase config in Super Admin, the next build
will emit a `WARNING` and leave the files absent → push notifications simply
turn off, no build error.

---

## Per-tenant isolation guarantees

Each generated app gets its own:

| Field | Source |
|---|---|
| App name | `tenant.name` (e.g. "Local Line") |
| Package/Bundle ID | `${IOS_BUNDLE_PREFIX}.<slug-alnum-lowercased>` (e.g. `in.localappstore.fieldcrm.localline`) |
| Logo (all densities) | Tenant `logo_path` → S3, auto-resized via Pillow |
| Splash | Same logo centered on `tenant.theme.primary` background |
| Firebase project | Per-tenant `google-services.json` / `GoogleService-Info.plist` (server-owned) |
| Push notifications | Delivered ONLY via that tenant's Firebase project |
| API endpoint | `API_BASE_URL` baked into JS bundle at compile time |
| Theme | `tenant.theme.primary` → StatusBar + SplashScreen colors |

Installing two tenant apps on the same device is completely safe:
- Different `applicationId` → separate app entries, separate data sandboxes.
- Different Firebase project → notifications routed independently.
- Different launcher icon + app name → visually distinct.

Re-building the same tenant a second time **fully wipes** the previous output
folder before starting, so build_1 artifacts can never leak into build_2.

---

## Backend endpoint

```
GET /api/super/build/manifest/{slug}    # super_admin JWT
```

Returns tenant metadata, theme, logo (base64), and per-platform Firebase config
files in one call.

Tests: `pytest backend/tests/test_phase10_build_manifest.py -v` — 4/4 green.

---

## Where to obtain each value

| Var | Where |
|---|---|
| `API_BASE_URL` | Wherever your FastAPI backend is deployed |
| `PLATFORM_HOST` | Root domain used by your subdomain resolver |
| `IOS_TEAM_ID` | https://developer.apple.com/account → Membership → Team ID (10 chars) |
| `ANDROID_HOME` | Wherever you installed the Android SDK (Android Studio → SDK Manager shows the path) |
| Keystore | `keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias release` |

---

## Compile requirements

**Android (`--output apk|aab`)** — the machine running `build_app.py` must have:
- Java 17+
- Android SDK (`ANDROID_HOME` set)
- Gradle (bundled via `./gradlew`, downloaded on first run)

If `ANDROID_HOME` is not set, the script prints a warning and stops at "prep"
mode — you can finish the build later on any machine with the SDK installed.

**iOS** — the script prepares the project on Linux (icons, entitlements,
Info.plist mutations, Firebase file, capacitor config). The final Xcode
scaffold requires **macOS + CocoaPods**:

```bash
# On your Mac:
rsync -r fieldcrm-server:/path/to/output/<slug>/ ./<slug>/
cd <slug> && yarn install && npx cap add ios && npx cap sync ios
open ios/App/App.xcworkspace
# In Xcode: Signing & Capabilities → confirm team → Product → Archive
```
