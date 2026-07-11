# Capacitor Build System — `build_app.py`

**Phase 10 (Feb 2026)** — Fully automated, per-tenant Capacitor build pipeline.
Produces isolated Android APK/AAB + iOS Xcode project for any tenant with a
single command.

---

## TL;DR

```bash
# Android debug APK (sideloadable):
python3 build_app.py --tenant demo --platform android \
    --version 1.0.0 --version-code 1 --output apk

# Android release AAB (Play Store):
python3 build_app.py --tenant acme --platform android \
    --version 2.4.1 --version-code 41 --output aab

# iOS Xcode project (open on Mac, archive from Xcode):
python3 build_app.py --tenant acme --platform ios \
    --version 2.4.1 --version-code 41
```

Output is written to `/app/dist/tenants/<slug>/` — one fully self-contained
project per tenant. Re-running the command refreshes assets in place
(idempotent).

---

## Architecture

```
build_app.py                  # CLI entry point (argparse)
build_system/
├── manifest.py               # OTP-authenticates super admin → fetches manifest
├── assets.py                 # Pillow-based icon + splash generation
├── capacitor.py              # capacitor.config.ts + package.json + cap add
├── android.py                # Android mutations + gradle compile
├── ios.py                    # iOS project mutations (prep-only, macOS finish)
└── utils.py                  # subprocess, color parsing, logging
```

Backend endpoint:
```
GET /api/super/build/manifest/{slug}    # super_admin JWT required
```
Returns tenant metadata, theme, logo (base64), and per-platform Firebase config
files in a single JSON response. See `test_phase10_build_manifest.py`.

---

## Per-tenant isolation guarantees

Each generated app has its own:

| Field | Source |
|---|---|
| App name | `tenant.name` (e.g. "Akshara Agro") |
| Package/Bundle ID | `${IOS_BUNDLE_PREFIX}.<slug-alnum-lowercased>` (e.g. `in.localappstore.fieldcrm.demo`) |
| Logo (all densities) | Tenant `logo_path` → S3, auto-resized via Pillow |
| Splash | Same logo centered on `tenant.theme.primary` background |
| Firebase project | Per-tenant `google-services.json` / `GoogleService-Info.plist` from `tenant_firebase_config` |
| Push notification project | Delivered via that tenant's Firebase project only (no cross-talk) |
| API server | Baked into web bundle at build time via `REACT_APP_BACKEND_URL` |
| Privacy Policy / T&C | Tenant-scoped URLs already handled in the web bundle |
| Theme | `tenant.theme.primary` → StatusBar + SplashScreen + AndroidManifest |

Installing two tenant apps on the same device is completely safe:
- Different `applicationId` → separate app entries, separate data sandboxes.
- Different Firebase project → notifications routed independently.
- Different launcher icon + app name → visually distinct.

---

## CLI Reference

```
--tenant <slug>            (required)  Tenant slug from Super Admin
--platform <android|ios>   (required)
--version <x.y.z>          (required)  Marketing version
--version-code <int>       (required)  Integer build number
--output apk|aab|prep      (default apk, android only)
--backend-url URL          Override $BACKEND_URL / $REACT_APP_BACKEND_URL
--super-token TOKEN        Skip OTP flow with a pre-obtained JWT
--super-phone PHONE        Override super admin phone
--super-otp OTP            Override super admin OTP (mock mode)
--out-dir DIR              Override /app/dist/tenants/<slug>
--force-rebuild            Force `yarn build` even if /app/frontend/build exists
--prep-only                Skip gradle compile (Android). iOS is always prep.
--verbose | -v             Debug logging
```

## Environment variables

Add these to `/app/backend/.env` (or export in your CI):

```env
# --- Build orchestration ---
BACKEND_URL="https://api.your-domain.com"    # or use REACT_APP_BACKEND_URL
SUPER_ADMIN_PHONE="9858558555"
SUPER_ADMIN_OTP="557725"                     # mock mode

# --- Android compile ---
ANDROID_HOME="/opt/android-sdk"              # required for `--output apk|aab`
ANDROID_KEYSTORE_PATH="/keys/fieldcrm.jks"   # required for `--output aab`
ANDROID_KEYSTORE_PASSWORD="s3cret"
ANDROID_KEY_ALIAS="release"
ANDROID_KEY_PASSWORD="s3cret"

# --- iOS ---
IOS_TEAM_ID="A1B2C3D4E5"                     # Apple Developer team, 10-char
IOS_BUNDLE_PREFIX="in.localappstore.fieldcrm"

# --- Optional overrides ---
BUILD_OUT_ROOT="/app/dist/tenants"
FRONTEND_DIR="/app/frontend"
```

## Workflow

### Android APK for internal testing

The container **must** have `ANDROID_HOME` set and Android SDK installed:

```bash
python3 build_app.py --tenant demo --platform android \
    --version 1.0.0 --version-code 1 --output apk
# → /app/dist/tenants/demo/android/app/build/outputs/apk/debug/app-debug.apk
```

Copy the APK to your phone (USB or drive) and install directly. Debug-signed
so it does NOT require Play Store publishing.

### Android AAB for Play Store

```bash
export ANDROID_KEYSTORE_PATH=/path/to/release.jks
export ANDROID_KEYSTORE_PASSWORD='…'
export ANDROID_KEY_ALIAS=release
export ANDROID_KEY_PASSWORD='…'

python3 build_app.py --tenant acme --platform android \
    --version 2.4.1 --version-code 41 --output aab
# → /app/dist/tenants/acme/android/app/build/outputs/bundle/release/app-release.aab
```

Upload the `.aab` to Play Console → Internal Testing → Release.

### iOS Xcode project

On Linux, we **prepare** everything except the native Xcode scaffold (that
requires macOS + CocoaPods). Copy the tenant folder to your Mac and finish:

```bash
python3 build_app.py --tenant acme --platform ios --version 2.4.1 --version-code 41
# → /app/dist/tenants/acme/  (Capacitor project ready)

# On Mac:
rsync -r fieldcrm-server:/app/dist/tenants/acme/ ./acme/
cd acme && yarn install && npx cap add ios && npx cap sync ios
open ios/App/App.xcworkspace
# In Xcode: select the "App" target → Signing & Capabilities → confirm team →
# Product → Archive → Distribute App
```

The build script has ALREADY written:
- `capacitor.config.ts` (correct `appId`, `appName`, background color, plugin config)
- `ios/App/App/GoogleService-Info.plist` (tenant Firebase config)
- `ios/App/App/App.entitlements` (aps-environment=production)
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/` (18 sizes iPhone + iPad + marketing)
- Info.plist + project.pbxproj mutations (once you run `cap add ios` on Mac)

### Rebuilding after tenant updates

If a tenant admin changes the logo, name, theme, or Firebase config, just re-run:

```bash
python3 build_app.py --tenant <slug> --platform <p> --version … --version-code …
```

Re-fetches manifest, regenerates icons, patches Gradle/Xcode config. All
changes idempotent.

---

## Testing

Backend endpoint: `pytest backend/tests/test_phase10_build_manifest.py -v`
(4 tests: auth guard, shape, unknown slug, ROOT_DOMAIN host).

Smoke test the CLI end-to-end (Android prep):
```bash
python3 build_app.py --tenant demo --platform android \
    --version 1.0.0 --version-code 1 --output prep --verbose
```
