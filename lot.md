# lot.md — FieldCRM implementation status ledger

> Living record of what is implemented, pending, and blocked on external
> credentials or devices. Last full audit + implementation pass: **2026-10-09**
> (local macOS checkout, demo database only — production untouched).

---

## 1. Privacy Policy & Terms — ✅ DONE

**Backend** — `GET /api/public/legal/{kind}` for `privacy | terms | refund |
shipping | about | contact`; serves the tenant's latest published doc, else a
platform default from `backend/legal_defaults.py` (`is_platform_default:
true`). Tenant admins edit/publish versions at `/t/:slug/admin/legal`
(CRUD under `/api/admin/legal*`).

**Frontend routes** — `/legal/:kind` (platform) and `/t/:slug/legal/:kind`
(tenant-branded), both public (`frontend/src/App.js`).

**Links in the UI** (2026-10-09 pass added the missing ones):
- Landing page footer → privacy, terms, refund, contact (existing).
- Customer/Dealer shop → Account tab "Legal & Support" card (existing).
- **Login screen** → consent line under *Send OTP* with Terms + Privacy links (`Login.jsx`). **(new)**
- **Employee app** → Profile page "Legal & Support" card (`Employee/Profile.jsx`). **(new)**
- **Tenant admin / Manager / Super admin shells** → Privacy + Terms links in the
  "More" sheet (`MobileAdminShell.jsx`). **(new)**
- Legal page "Back" now returns to the previous screen instead of always the
  marketing landing (`Legal.jsx`). **(fixed)**

Store listing URLs: Super Admin → Tenants has copy-URL buttons for each
tenant's privacy/terms pages.

## 2. Web / Android / iOS builds — ✅ VERIFIED (no Expo anywhere)

The pipeline is Capacitor 7 driven by `build_app.py` (+ `build_system/`).
Expo is not used.

- **Web**: `cd frontend && yarn build` → verified OK (2026-10-09).
- **Android debug APK**: full build verified end-to-end on this Mac
  (manifest fetch → React bundle → `cap add android` → Pillow assets → gradle
  `assembleDebug`). See §8 for exact commands.
- **Android release APK/AAB**: command path verified; needs the keystore
  configured in `build.env` (present: `coverage/follo.jks`).
- **iOS**: project prep verified; final archive/IPA requires Xcode signing +
  the Push Notifications capability check in the workspace (device testing
  pending). `--output ipa` works on macOS via the generated `build-ios.sh`.

## 3. User account deletion (App Store / Play Store) — ✅ DONE

- `POST /api/auth/me/delete` soft-deletes (`is_active=false`, `deleted_at`,
  `token_revoked_after`) and instantly revokes all JWTs via the session
  validator. Guards: reviewer phone and super_admin blocked (403), outstanding
  balance / active orders blocked (409) with structured messages.
- Delete buttons with confirmation: Customer/Dealer Account page (existing)
  **and now the Employee Profile page** (serves employee, manager and
  tenant_admin via `/t/:slug/app/profile`). **(new)** Managers and tenant
  admins reach it from "Profile" in the desktop sidebar and "My Profile" in
  the mobile More sheet (added in the responsive pass, §9).
- Admin-side `DELETE /tenant/users/{id}` now also revokes live sessions. **(fixed)**
- Fixed a revocation precision bug: tokens carry a sub-second `iatf` claim so
  a re-login in the same second as a revocation works while `logout-all`
  still revokes instantly. **(fixed)**
- Not done (acceptable for stores, note for later): PII is retained on the
  soft-deleted record (name/phone/email are not anonymised).

## 4 & 7. Phone + OTP login via Pingbix — ✅ IMPLEMENTED (needs live creds to go real)

- New `backend/sms_service.py`: Pingbix client (env-configurable endpoint,
  DLT sender/entity/template ids, message template), provider resolution,
  secure OTP generation + HMAC hashing. Never raises.
- `request-otp`/`verify-otp` now support a real-SMS path: random 6-digit OTP,
  HMAC-stored in `otp_codes` (unique per phone), 5-min expiry, 30-s resend
  cooldown (429), 5 attempts max, single-use. `mock_otp` is never returned in
  Pingbix mode.
- Mock mode (default) is unchanged — demo OTP shown on screen; local dev and
  the pod testing agent keep working without credentials.
- Super admin + reviewer phones always use their fixed OTPs (store review safe).
- Config: `SMS_PROVIDER` + `PINGBIX_*` in `backend/.env` (see
  `.env.example`); provider/API key/sender id can also be set at runtime in
  Super Admin → Settings (stored in Mongo, masked on read, hot-applied).
- Login UI handles both modes (`Login.jsx`): mock shows the OTP, real mode
  shows "OTP sent to +91 …".
- Verified end-to-end against a local fake gateway (OTP delivered to gateway,
  cooldown, wrong/expired/reused OTP rejected, DEMO_OTP rejected in real mode).
- **PENDING (external)**: real Pingbix credentials + the account's exact API
  endpoint/payload field names (set via `PINGBIX_BASE_URL` etc. — payload
  follows the common Indian DLT JSON convention; adjust template env var to
  the registered DLT template). Needs one live SMS test when credentials arrive.

## 5. KWS integration — ⚠️ BLOCKED: NEEDS CLARIFICATION

"KWS" appears nowhere in the codebase, PRD, documentation, or git history, and
no matching third-party service could be identified with confidence. Nothing
was implemented to avoid building the wrong thing. **Please specify what KWS
refers to** (service name/URL or integration sheet) and it can be added.

## 6. AWS S3 via Super Admin — ✅ DONE

- Super Admin → Cloud: access key, secret (write-only, masked after save),
  region, bucket, public media host, **and now presign TTL**. "Leave blank to
  keep saved secret" now actually works (backend keeps the stored secret).
- Stored in Mongo (`platform_settings.aws_credentials`), hot-applied via
  `s3_presign.apply_runtime_credentials` (bucket verified with `head_bucket`),
  reloaded on startup. Secrets never reach the frontend or the JS bundle.
- Legacy Super Admin → Settings page: **fixed a leak** — `GET/PATCH
  /super/settings` now masks `aws_s3_secret_key` and `sms_api_key`, and PATCH
  ignores masked round-trips so saving the form can't corrupt secrets.
- `s3_presign.py`: clearing a credential now also clears the `os.environ`
  mirror (previously stale values survived until restart). **(fixed)**
- Uploads: `POST /files/upload` (Emergent storage) is what the UI uses today;
  `POST /uploads/presign` (direct-to-S3 PUT) is live and returns 503 until S3
  is configured. Fixed AdvisorAdmin calling a non-existent `/upload` route
  (now `/files/upload`). **(fixed)**
- **PENDING (optional)**: switch frontend uploads to the presign flow once S3
  is the primary store; consider encrypting the secret at rest and an IAM
  policy limited to `PutObject` on the bucket.

## 8. Local deployment — ✅ VERIFIED ON macOS (this machine)

- Created the missing `backend/.env.example` and `frontend/.env.example`;
  local `backend/.env` + `frontend/.env` exist (gitignored).
- Backend venv at `backend/.venv` (Python 3.11, Homebrew). Full instructions
  + commands in §8 below and in the final report.
- Note: port 8001 has been used by another project (farmzy) on this machine
  at times. Check what is listening before starting; if 8001 is taken, pick
  another port and keep `REACT_APP_BACKEND_URL` in sync.
- Tests made portable outside the Emergent pod (`backend/tests/conftest.py`);
  full suite: **254 passed, 4 skipped** locally (skips are env-gated: live AWS
  keys, ingress-served HTML).
- **Production VPS runbook added** (2026-10-09): systemd + nginx + MongoDB,
  mirroring the Dentor deployment style — see
  `documentation/deployment-vps.md`. Includes the FieldCRM-specific pitfalls
  (yarn-only, build-time `REACT_APP_BACKEND_URL`, Host-header forwarding for
  white-label tenant resolution, `client_max_body_size`, single worker).
  Fixed `frontend/src/lib/api.js` to tolerate an unset or trailing-slash
  backend URL (was producing `undefined/api` / `host//api`).

---

## 9. Responsive UI — ✅ REBUILT (2026-10-09, third pass)

The first two passes only swapped the navigation shell and widened a few
grids. On a real desktop monitor the pages were still phone layouts: stacked
card lists in a centred column. Measured at 1792×1035 before this pass, the
Shop and Employee pages used 43–62% of the window and several admin pages
20–43%. This pass rebuilt the desktop shell and the page layouts themselves.

**How layout is decided now**
- `frontend/src/lib/platform.js` — `useIsDesktop()` is true on web windows
  ≥ 1024px and always false inside the native Capacitor runtime. It only
  chooses the **navigation shell**.
- Page content uses ordinary Tailwind breakpoints (`md` / `lg` / `xl`), so it
  grows with the available width under either shell. A tablet therefore gets
  mobile navigation with a full-width layout, not a narrow phone column.
- `desktop:` Tailwind variant (`html.is-desktop`) exists for the few things
  tied to the shell itself, e.g. the cart summary's sticky offset.

**Shells** (`frontend/src/components/Layout/`)
- `DesktopShell.jsx` (new) — one sidebar shell for **all five roles**:
  grouped navigation, breadcrumb top bar, fluid content area (capped at
  1680px). The sidebar follows the signed-in person, so a manager who opens a
  field-entry screen keeps the manager navigation.
- `nav.js` (new) — the sidebar items per role, with the same permission and
  feature gating as the mobile shells.
- `AdminShell.jsx` / `MobileShell.jsx` — pick `DesktopShell` on desktop web,
  otherwise the existing bottom-nav shells (`MobileAdminShell`, `MobileShell`).
- `Page.jsx` (new) — shared `PageHeader`, `Split` (main column + side panel),
  `Panel`, `DataTable`, `StatusBadge`, so desktop/tablet/phone compositions
  come from one place.

**Pages reworked for desktop** (phone layouts kept as they were)
- Shop: Home (KPI row, orders table, side panels), Catalogue (category
  filter, auto-fill product grid, live cart panel), Cart (table + order
  summary), Orders (table), My Account (form + side column).
- Employee: Home, Dealers and Customers (tables, wider edit dialogs), Visit,
  Collection, Sales, DCR and Enquiry (two-column form + recent-entries
  panel), Leaves (table), Notifications, Catalogue, Profile.
- Tenant admin / Manager: both dashboards, Orders, Enquiries and Leaves
  (tables with inline actions), Products, Branding, Announcements, Areas.
- Super admin: Platform Settings (two cards side by side). Tenants, Plans,
  Cloud, Employees, Dealers, Customers, Targets, Roles, Reports, Custom
  Fields, Advisor and Legal already had desktop layouts and now sit in the
  shared shell.

**Defects found and fixed along the way**
- Brand colour opacity classes (`bg-brand-primary/10` and ~40 similar uses)
  generated **no CSS at all**, because the colours were plain `var()` strings.
  Tinted icon backgrounds, badges and hover rows were silently missing on
  every platform. Colours now use `rgb(var(--brand-*-rgb) / <alpha>)`, and
  `applyTenantTheme()` keeps the channel variables in sync with the tenant
  theme.
- Horizontal overflow at 360px-wide phones on the landing page and the
  employee enquiry form; GPS map controls overflowing on phones.
- Page content could end hidden behind the bottom tab bar on phones with a
  home indicator (`.pb-bottom-nav` now adds the safe-area inset).
- Empty "Custom Fields" headings when a module has no custom fields; stray
  "· ," separators where optional fields were blank; "Enquirys" label.
- Managers and tenant admins had no link to their profile page (where
  account deletion and the legal links live). Added to the desktop sidebar
  and the mobile "More" sheet.
- Super admin "Cloud" was unreachable from the mobile shell.
- Desktop toasts moved to the bottom-right; at the top-right they covered the
  header's language switcher and account controls.

**Verification (all on the production build, local demo data)**
- Every route in `App.js` (56, across all six sign-in types plus the public
  pages) rendered in headless Chromium at ten configurations — 560 renders:
  web at 1792×1035, 1440×900, 1280×800, 1024×768, 834×1112, 390×844,
  360×740, and a simulated native runtime at 1366×1024, 1024×1366 and
  390×844. Each render was checked for the correct shell, horizontal
  overflow and blank pages: **0 failures**. At 1792px every role page now
  fills the content area (the window minus sidebar and padding).
- Screenshots of every reworked page were reviewed by eye at 1792px, plus
  samples at 1440, 1280, 1024, 834, 390 and 360.
- 32 interaction checks, run three times: real login through the login
  screen for each role, clicking every sidebar link (58 links), customer
  add-to-cart → cart → place order → Orders, employee enquiry form →
  appears in the admin Enquiries table → status changed from the row, admin
  order status change, approve dialog, live window resize in both
  directions, logout, and phone bottom tabs / "More" sheet. **32/32.**
- **Real native builds** of the same bundle (Capacitor 7): iPad Pro 13-inch
  and iPhone 16 Pro simulators, and a Pixel 7 Pro Android emulator. All show
  the bottom-nav mobile UI with safe areas respected; the iPad (1032pt wide,
  above the desktop breakpoint) confirms native detection on a real bridge.
  These used a scratch Capacitor project rather than `build_app.py` (see
  limitation 3 below).
- `yarn test`: 28 tests pass (6 platform detection + 22 shell selection,
  navigation-to-route consistency and profile entry points). `yarn build`
  compiles; the only warnings are the existing `exhaustive-deps` ones.
- No backend code changed in this pass, so the backend suite was not re-run.

**Limitations**
1. Verified in Chromium, iOS Simulator and Android Emulator — not on
   physical devices, and not in desktop Safari or Firefox.
2. Dialog forms other than the employee Dealers/Customers ones are still
   single-column on desktop. Lists show their empty state briefly while
   loading (no loading indicator).
3. `build_system/ios.py` injects `FirebaseApp.configure()` into every iOS
   build, including tenants with no iOS Firebase app configured (it only
   logs a warning). Firebase aborts at launch without a
   `GoogleService-Info.plist`, so such a build would very likely crash on
   start. Read from the code, not reproduced; the local demo tenant has no
   Firebase config, which is why the simulator check used a scratch project.
4. `CLAUDE.md` §5 still describes the old shells (AdminShell for super admin
   only, MobileAdminShell for tenant admin and manager). It needs
   regenerating.
5. The browser checks were run from throwaway scripts; there is still no
   end-to-end suite in the repo.

## Known gaps / follow-ups

1. **KWS** — blocked on definition (see §5).
2. **Pingbix live test** — needs real credentials; one SMS round-trip + DLT
   template approval check.
3. **iOS on-device** — push permission dialog + APNs delivery must be tested
   on a physical device after archive (requires Apple signing).
4. **SECURITY — rotate AWS key**: `backend/tests/test_iter8_regression.py`
   contains a hardcoded AWS access key + secret committed to the repo
   (`AKIAWJ47YHNL…`). It currently returns 403 on `head_bucket` but may still
   be active. Rotate the key in IAM and scrub it from the test/git history.
5. PII anonymisation on account deletion (nice-to-have for GDPR-style
   requests; stores only require the deletion flow that exists).
6. Secrets stored in Mongo are plaintext (platform-settings docs); consider
   envelope encryption if the DB is shared.
7. Frontend unit tests cover platform detection and shell selection only
   (`yarn test`, 28 tests); there is no in-repo end-to-end suite.
8. iOS builds for a tenant without an iOS Firebase app likely crash at launch
   (see §9, limitation 3) — confirm and guard `FirebaseApp.configure()`.
9. `CLAUDE.md` §5 (shells and page map) is out of date after the responsive
   rebuild and should be regenerated.
10. **Project name — pending client confirmation.** A rename of the platform
    brand was applied and then fully reverted on 2026-10-10; everything says
    FieldCRM. Do not rename until the client confirms the name and how it
    applies to one application serving multiple businesses.

## Command crib sheet (local)

```bash
# Backend (port 8001 canonical — see note about farmzy above)
cd backend && .venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend dev
cd frontend && yarn start          # REACT_APP_BACKEND_URL from frontend/.env

# Web production bundle
cd frontend && yarn build

# Backend tests
REACT_APP_BACKEND_URL=http://localhost:8001 backend/.venv/bin/python -m pytest backend/tests/ -q

# Frontend unit tests
cd frontend && CI=true yarn test --watchAll=false

# Android debug APK
python3 build_app.py --tenant demo --platform android --version 1.0.0 --version-code 1 --output apk

# Android release AAB (keystore in build.env)
python3 build_app.py --tenant demo --platform android --version 1.0.0 --version-code 1 --output aab

# iOS (on macOS; archive/IPA needs signing)
python3 build_app.py --tenant demo --platform ios --version 1.0.0 --version-code 1 --output ipa
```
