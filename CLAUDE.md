# CLAUDE.md — FieldCRM SaaS

> Engineering reference for AI assistants (and humans) working on this repository.
> Everything here is derived from the actual code at `/app` as of Feb 2026.
> Do not change this file in place after a code edit — regenerate it so it stays
> truthful.

---

## 1. What this app is

**FieldCRM** (`localappstore.in`) is a **multi-tenant, white-label SaaS Field
Force Management platform** that ships as:

- A React PWA (installable on any mobile browser),
- Per-tenant Android (APK/AAB) and iOS (Xcode/IPA) apps built by a Python
  Capacitor pipeline (`build_app.py`), each with its own package ID, logo,
  theme, splash, and Firebase project.

Target industries: Agriculture, FMCG, Pharma, Manufacturing, Service.

Five user surfaces (persona × route tree):

| Persona | Role | Entry route |
|---|---|---|
| Super Admin | `super_admin` | `/super-admin` |
| Tenant Admin | `tenant_admin` | `/t/:slug/admin` |
| Manager | `manager` | `/t/:slug/manager` |
| Field Employee | `employee` | `/t/:slug/app` (mobile shell) |
| Dealer (B2B) / Customer (B2C farmer) | `dealer` / `customer` | `/t/:slug/shop` |

---

## 2. Repository layout

```
/app
├── backend/                       FastAPI + MongoDB
│   ├── server.py                  3,352-line main app (routers + startup)
│   ├── models.py                  Pydantic models for every collection
│   ├── auth.py                    JWT + OTP helpers, session-revocation hook
│   ├── seed.py                    Idempotent demo-tenant seed
│   ├── dedupe_seed.py             Legacy data cleanup helper
│   ├── storage_util.py            Emergent Object Storage wrapper
│   ├── s3_presign.py              AWS S3 direct-upload SigV4 presigning
│   ├── tenant_resolver.py         Host → tenant resolver w/ TTL cache
│   ├── fcm_service.py             Sharded Firebase Cloud Messaging sender
│   ├── firebase_provisioning.py   Firebase Management API v1beta1 client
│   ├── legal_defaults.py          Platform-default Markdown legal docs
│   ├── requirements.txt           Pinned Python deps
│   ├── .env                       Live env (local to pod — not in VCS)
│   ├── .env.example               Template with every variable
│   └── tests/                     Pytest suite (20 files)
│
├── frontend/                      React 19 + CRA (craco) + Tailwind + shadcn/ui
│   ├── public/
│   │   └── index.html             viewport-fit=cover + apple-mobile-web-app meta
│   ├── src/
│   │   ├── App.js                 Route tree
│   │   ├── index.js, index.css    Entry + safe-area CSS vars
│   │   ├── App.css
│   │   ├── context/AppContext.jsx Auth, tenant, i18n, permissions, push hooks
│   │   ├── components/
│   │   │   ├── Guards.jsx         <RequireAuth>, <TenantScope>
│   │   │   ├── Layout/            AdminShell / MobileAdminShell / MobileShell
│   │   │   ├── TenantLogo.jsx     Logo w/ initials fallback
│   │   │   ├── LanguageSwitcher.jsx
│   │   │   ├── OfflineIndicator.jsx
│   │   │   ├── CustomFieldsForm.jsx
│   │   │   └── ui/                shadcn/ui primitives (50+)
│   │   ├── pages/
│   │   │   ├── Landing.jsx, Login.jsx, Legal.jsx, NotFound.jsx
│   │   │   ├── SuperAdmin/        Dashboard, Tenants, Plans, Settings, Cloud
│   │   │   ├── TenantAdmin/       17 admin pages (Dashboard, Branding, …)
│   │   │   ├── Manager/           Dashboard, Team, MapView, Reports
│   │   │   ├── Employee/          Home + 12 PWA pages
│   │   │   ├── Customer/          Home, Catalogue, Cart, Orders, Account
│   │   │   └── Advisor/CropAdvisor.jsx
│   │   ├── lib/
│   │   │   ├── api.js             Axios instance w/ bearer + X-Tenant-Slug interceptors
│   │   │   ├── i18n.js            6-language dictionary
│   │   │   ├── offline.js         IndexedDB queue + postOrQueue()
│   │   │   ├── gpsTracker.js      5-min interval location pings
│   │   │   ├── pushNotifications.js Capacitor FCM registration + listeners
│   │   │   ├── markdown.js        Zero-dep Markdown parser for Legal.jsx
│   │   │   └── utils.js, hooks/use-toast.js
│   │   └── constants/testIds/
│   ├── .env, .env.example
│   └── package.json               Yarn-managed; react 19, cap 7, radix-ui, tailwind
│
├── build_system/                  Python modules used by build_app.py
│   ├── manifest.py                Fetches /api/super/build/manifest/:slug
│   ├── capacitor.py               cap config + package.json + yarn/cap bootstrap
│   ├── assets.py                  Pillow icon + splash generator (all densities)
│   ├── android.py                 build.gradle + Manifest + strings.xml patches
│   ├── ios.py                     Info.plist + pbxproj + AppDelegate.swift patches
│   └── utils.py                   Env loader, logger, run(), colors, fs helpers
├── build_app.py                   CLI entrypoint for per-tenant native builds
├── capacitor-build.sh             Older shell variant (Phase 5)
├── build.env.example              Template for build-only env
│
├── documentation/
│   ├── environment-variables.md
│   ├── retrofit-architecture.md   7-phase SaaS retrofit reference
│   ├── build-system.md            Full build-pipeline guide
│   └── push-notifications.md      End-to-end push guide
│
├── memory/
│   ├── PRD.md                     Living product-requirements doc
│   └── test_credentials.md        Live demo/test accounts
│
├── test_reports/                  Testing-agent output history
├── tests/                         Reserved (empty package marker only)
├── test_result.md                 Testing-agent regression log
├── design_guidelines.json
└── README.md                      Minimal placeholder
```

---

## 3. Tech stack

### Backend
- **FastAPI 0.110.1** + **Uvicorn 0.25.0** (`/root/.venv`), single-worker,
  managed by Supervisor on port **8001**.
- **Motor 3.3.1** (async MongoDB driver) + **PyMongo 4.6.3**.
- **Pydantic ≥2.6.4** for all models.
- **PyJWT ≥2.10.1** for stateless HS256 JWTs.
- **pandas / openpyxl** for Excel/CSV import-export.
- **boto3 ≥1.34** for S3 presigning.
- **firebase-admin ≥6.5** for FCM dispatch.
- **google-auth ≥2.30** for Firebase Management API provisioning.
- **requests** for Emergent Object Storage.

### Frontend
- **React 19** + **react-router-dom 7** + **axios 1.16** + **sonner 2.0** +
  **recharts 3.8** + **react-leaflet 5** + **framer-motion 11**.
- **Tailwind CSS 3.4** + **shadcn/ui** (Radix primitives in
  `/app/frontend/src/components/ui/`).
- Build tool: **CRACO 7.1** wrapping `react-scripts 5.0.1`.
- Native shell: **@capacitor/core 7** + **@capacitor/push-notifications 7**
  (plugins injected per build).
- Dev-server pin: `webpack-dev-server ^4.15.2` in `resolutions` (5.x breaks
  with react-scripts 5).
- Package manager: **yarn 1.22.22** (never npm — breaks resolutions).

### Services (supervisord)
```
backend     uvicorn server:app --host 0.0.0.0 --port 8001 --workers 1 --reload
            cwd=/app/backend, venv=/root/.venv
frontend    yarn start   (HOST=0.0.0.0 PORT=3000, cwd=/app/frontend)
mongodb     /usr/bin/mongod --bind_ip_all
```

Hot-reload is enabled on both. Only `.env` changes or new dependencies require
`sudo supervisorctl restart backend|frontend`.

---

## 4. Backend architecture

### Startup sequence (`server.py`)

1. `load_dotenv(backend/.env)`.
2. `require_env([...])` — fails fast if any REQUIRED var is missing/blank:
   `MONGO_URL, DB_NAME, JWT_SECRET, JWT_ALGO, JWT_TTL_HOURS, CORS_ORIGINS,
   APP_NAME, SUPER_ADMIN_PHONE, SUPER_ADMIN_OTP, DEMO_OTP`.
3. Create AsyncIO Mongo client and select `db = client[DB_NAME]`.
4. `FastAPI(title="FieldCRM SaaS API")` with `api = APIRouter(prefix="/api")`.
5. `@app.on_event("startup")`:
   - `ensure_indexes()` — creates every unique/sparse index listed below.
   - `set_session_validator(_session_validator)` — registers the Phase 4
     JWT-revocation hook into `auth.get_current_user`.
   - `_hydrate_cloud_credentials()` — loads AWS creds from
     `platform_settings.aws_credentials` into `s3_presign`.
   - `seed_all(db)` — idempotent demo-tenant seed. Duplicate-key races are
     logged, not raised.
   - `storage.init_storage()` — obtains Emergent Object Storage key.
6. CORS: `CORSMiddleware` from `CORS_ORIGINS` env.
7. `app.include_router(api)` — routes mount at `/api/*`.

### Collections & indexes (from `ensure_indexes()`)

| Collection | Key / Index |
|---|---|
| `tenants` | `slug` unique, `id` unique, `custom_domain` sparse-unique |
| `plans` | `code` unique, `id` unique |
| `users` | `(tenant_id, phone)` unique, `id` unique |
| `roles` | `(tenant_id, name)` unique |
| `areas` | `id` unique |
| `products` | `id` unique |
| `visits`, `sales`, `collections`, `orders`, `leaves` | `id` unique |
| `targets` | `(tenant_id, user_id, month)` unique |
| `attendance` | `(tenant_id, user_id, date)` unique |
| `locations` | `(tenant_id, user_id, timestamp)` compound |
| `custom_fields` | `(tenant_id, module, field_key)` unique |
| `crops` | `(tenant_id, name)` |
| `advisory_entries` | `(tenant_id, type)`, `(tenant_id, crop_ids)` |
| `seasonal_advisories` | `(tenant_id, is_published)` |
| `user_favorites` | `(user_id, entity_id)` unique |
| `recent_views` | `(user_id, viewed_at desc)` |
| `legal_docs` | `(tenant_id, kind, version desc)`, `(tenant_id, kind, is_published)` |
| `push_tokens` | `(user_id, token)` unique, `tenant_id` |
| `firebase_projects` | `project_id` unique |
| `tenant_firebase_config` | `tenant_id` unique |

### Data models (`models.py`)

Core domain:
- `Plan`, `Tenant` (with `TenantTheme`, `TenantLabels`,
  `features: Dict[str,bool]`, `catalog_mode`, `custom_domain`, `fcm_shard_id`).
- `User` (role ∈ `super_admin | tenant_admin | manager | employee | dealer |
  customer`; farmer fields `farm_size_acres`, `crops`, `my_crops`;
  `deleted_at`, `token_revoked_after` for soft-delete).
- Field entries: `Visit`, `SalesEntry`, `CollectionEntry`, `DCR`, `Enquiry`,
  `Order`+`OrderItem`, `Attendance`, `LocationPing`.
- `Product`, `Notification`, `FileRecord`, `PlatformSettings`.

Phase 2+ additions:
- `AreaNode` (country/state/district/area tree w/ `path: [ancestor_ids]`).
- `Role` (`permissions: {module: {read, write}}`).
- `LeaveRequest`, `Target`.
- `CustomField` (per-module, typed, `visible_to_customer` flag).

Crop Advisor (opt-in via `tenant.features.crop_advisor`):
- `Crop`, `AdvisoryEntry` (unified disease/pest/deficiency with 18 sections —
  photos, symptoms, chemical treatment, safety, FAQs, etc.),
  `SeasonalAdvisory`, `UserFavorite`, `RecentView`.

Phase 3-10:
- `LegalDocument` (`kind` ∈ `privacy|terms|refund|shipping|about|contact`,
  versioned, `is_published`).
- `PushToken` (per device, `(user_id, token)` unique).
- `FirebaseProject` (holds up to `FIREBASE_PROJECT_MAX_APPS = 30` apps).
- `TenantFirebaseConfig` (`android` and `ios` as independent
  `TenantFirebaseApp` sub-docs; `mode = existing|auto`).

Soft rules enforced in code:
- `tenant_id` is attached to every tenant-scoped collection and queried on
  every read.
- `datetime` always stored as ISO string via `now_iso()` (timezone-aware UTC).
- Dict spreads from Mongo always go through `clean(doc)` which pops `_id`
  before serialization.

### Auth (`auth.py`)

**Mock OTP flow (production replaces this with Pingbix SMS):**
- `POST /api/auth/request-otp` returns `{mock_otp: "<otp>"}`.
- `expected_otp(phone)` returns:
  - `SUPER_ADMIN_OTP` (`557725`) for `SUPER_ADMIN_PHONE` (`9858558555`).
  - `DEMO_OTP` (`123456`) for everyone else, including reviewer.
- `POST /api/auth/verify-otp` validates and issues a JWT with claims
  `{sub: user_id, tid: tenant_id, role, phone, iat, exp}`.
- JWTs are HS256-signed via `JWT_SECRET`, TTL `JWT_TTL_HOURS` (default 168 = 7
  days).
- `get_current_user` → `_SESSION_VALIDATOR(payload)` (registered by server.py)
  → checks `users.deleted_at`, `is_active`, and `iat < token_revoked_after`.
  Any violation → 401.
- `require_roles(*roles)` dependency for role-gated endpoints.

**Reviewer bypass (App Store / Play Store):**
- Phone `9898989898` + OTP `123456` → auto-seeded as `tenant_admin` of
  tenant `demo`. Cannot self-delete.

**Universal frontend auth helper:** every axios request pulls `fc_token` and
`fc_tenant_slug` from `localStorage` and injects `Authorization: Bearer …` +
`X-Tenant-Slug: …` headers (`frontend/src/lib/api.js`).

### API endpoints (grouped — all prefixed `/api`)

**Auth**
- `POST  /auth/request-otp`, `POST /auth/verify-otp`, `GET /auth/me`,
  `POST /auth/me/delete`, `POST /auth/logout-all`.

**Public (unauthenticated)**
- `GET /public/tenants/by-slug/{slug}`
- `GET /public/demo-credentials`
- `GET /public/tenant-resolve?host=<host>` (Phase 2)
- `GET /public/legal/{kind}` (per-tenant via header/host/slug + platform-default
  fallback)

**Super admin (`require_roles("super_admin")`)**
- Tenants: `GET/POST /super/tenants`, `PATCH/DELETE /super/tenants/{id}`,
  `PATCH /super-admin/tenants/{id}/features`.
- Plans: `GET/POST /super/plans`, `PATCH/DELETE /super/plans/{id}`.
- Analytics: `GET /super/analytics`.
- Settings: `GET/PATCH /super/settings`.
- Cloud: `GET/PUT /super/aws-credentials` (masks secret on GET; verifies via
  `head_bucket` on PUT), `GET/POST/DELETE /super/firebase-projects`,
  `POST /super/firebase-projects/{id}/refresh`,
  `GET/PUT /super/tenants/{tid}/firebase-config`,
  `POST /super/tenants/{tid}/firebase-config/provision`,
  `DELETE /super/tenants/{tid}/firebase-config/{platform}`,
  `POST /super/tenants/{tid}/push/test` (supports `dry_run_token`).
- Push shards + token mgmt: `GET /super/push/shards`,
  `POST /super/push/tokens/purge`.
- Build pipeline: `GET /super/build/manifest/{slug}`.

**Tenant admin / manager / employee** (role-gated at the route)
- `GET/PATCH /tenant/profile`, `GET/POST/PATCH/DELETE /tenant/users`,
  `GET/POST/PATCH/DELETE /tenant/products`.
- `PATCH /me/profile` (self-service; enforces required custom fields when
  `visible_to_customer=True`).
- `GET /my-permissions` (merges default + custom-role matrix).
- `POST /employee/checkin`, `POST /employee/checkout`,
  `GET /employee/attendance/today`, `GET /attendance`.
- `POST /employee/location`, `GET /locations`.
- Field entries: `POST/GET /visits`, `POST/GET /sales`, `POST/GET /collections`,
  `POST/GET /dcr`, `POST/GET /enquiries` + `PATCH /enquiries/{eid}`.
- Orders: `POST/GET /orders`, `PATCH /orders/{oid}`.
- Notifications: `POST/GET /notifications`, `POST /notifications/{nid}/read`.
- Files: `POST /files/upload` (Emergent Object Storage multipart),
  `GET /files/view?path=…&auth=…` (streams through backend with auth check).
- Import/Export: `GET /export/{resource}`, `POST /import/{resource}`.
- Analytics: `GET /analytics/tenant`.

**Phase 2 additions**
- `GET/POST/PATCH/DELETE /areas` (tree w/ `path` ancestors).
- `GET /permission-modules`, `GET/POST/PATCH/DELETE /roles`.
- `GET/POST/PATCH/DELETE /custom-fields` + `GET /custom-fields/modules`.
- `POST/GET /leaves` + `PATCH /leaves/{lid}` (hierarchy approval).
- `POST/GET /targets` + `GET /targets/progress` (rollup).
- `POST /sync/batch` — IndexedDB queue drain.
- `GET /gps/track`, `GET /gps/live`.

**Phase 3 (uploads + legal)**
- `POST /uploads/presign` (503 when AWS unset).
- `GET /admin/legal`, `GET /admin/legal/{kind}/latest`,
  `POST /admin/legal`, `POST /admin/legal/{id}/publish`,
  `DELETE /admin/legal/{id}`.

**Phase 3.0 (Crop Advisor)**
- `GET/POST/PATCH/DELETE /crops` and `/advisory-entries` and
  `/seasonal-advisories`.
- `GET /crops/{cid}/summary`.
- `GET /favorites`, `POST /favorites/toggle`, `GET /recent-views`.
- `PATCH /me/my-crops`.

**Phase 5 (Push)**
- `POST /push/register`, `POST /push/unregister`.
- `POST /admin/push/test`, `GET /admin/push/status`.

**Health**
- `GET /` (root), `GET /health` (deep: Mongo + storage).

### Core subsystems

**Tenant resolver (`tenant_resolver.py`)**
- Resolution order: positive cache → `custom_domain` → `<slug>.<ROOT_DOMAIN>` →
  negative cache.
- TTL `TENANT_CACHE_TTL_SECONDS` (default 300s). Negative TTL capped at 60s.
- Cache invalidation on tenant update/delete.
- Pure functions `normalize_host(host)`, `parse_host_to_slug(host, root)`.

**S3 presigning (`s3_presign.py`)**
- Returns a `{method, url, key, headers, object_url, …}` dict ready for direct
  client-side PUT. SigV4, no CORS preflight.
- Key layout: `tenant/<tid>/<module>/<user>/<uuid10>-<safe-name>`.
- `apply_runtime_credentials({...})` lets the Super Admin UI update AWS keys
  **without restart**. Also mirrors into `os.environ` for consistency.
- 503 "S3 uploads not configured" when any of `AWS_ACCESS_KEY_ID /
  AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_S3_BUCKET` is missing.

**FCM dispatch (`fcm_service.py`)**
- Two code paths:
  - **Per-tenant (Phase 8)**: inline `service_account_json` +
    `project_id` → named firebase_admin app `tenant-<project_id>`.
  - **Shard fallback (Phase 5)**: `FCM_SHARD_<i>_PROJECT_ID` +
    `FCM_SHARD_<i>_CREDENTIALS_JSON` env vars; shard capped at `SHARD_CAPACITY
    = 15` tenants.
- `send_to_tokens(...)` **never raises** — missing config returns
  `{sent: 0, failed: 0, disabled: "…"}`.
- Returns `invalid_tokens: [...]` for FCM "NotRegistered / InvalidArgument"
  errors so the caller can bulk-purge from `push_tokens`.

**Firebase provisioning (`firebase_provisioning.py`)**
- Firebase Management API v1beta1 client built on `google-auth` service-account
  flow.
- `create_app(project_id, service_account_json, platform, package_or_bundle,
  display_name)` → 201/409 both resolve to `{ok, app_id, config_json,
  package_or_bundle}`.
- `find_and_fetch_config(...)` for already-existing apps (re-provision path).
- `list_apps(...)` to enforce the ~30-app Firebase quota.
- Every helper returns `{ok, error?}` dicts — never throws.

**Storage (`storage_util.py`)**
- Thin wrapper around Emergent Object Storage
  (`https://integrations.emergentagent.com/objstore/api/v1/storage`).
- `init_storage()` exchanges `EMERGENT_LLM_KEY` for a long-lived storage key
  (cached). `put_object(path, data, content_type)` and `get_object(path)`
  auto-refresh the key on 403.
- Path layout: `<APP_NAME>/<tenant_id or 'platform'>/<purpose>/<uuid>.<ext>`.

**Legal defaults (`legal_defaults.py`)**
- Platform-default Markdown for all six `LEGAL_KINDS` so every tenant has
  working privacy/terms/refund/shipping/about/contact pages from day zero.
- `GET /public/legal/{kind}` returns tenant-owned doc if published, else
  `platform_default(kind)` with `is_platform_default: True`.

---

## 5. Frontend architecture

### Entry (`src/index.js` → `src/App.js`)

- Wraps the tree in `<AppProvider>` + `<Toaster>` + `<BrowserRouter>`.
- Routes are static (no code-splitting currently). Guards:
  - `<RequireAuth roles={[…]}>` reads `fc_token`+user from context, redirects
    to `/t/:slug/` (login) or `/login` if missing/wrong role.
  - `<TenantScope>` calls `loadPublicTenant(slug)` on mount; self-heals stale
    localStorage when backend returns `{code: "tenant_not_found"}`.

### `AppContext` (`src/context/AppContext.jsx`)

State hydrated from localStorage keys:
- `fc_token`, `fc_user`, `fc_tenant`, `fc_lang`, `fc_perms`, `fc_tenant_slug`.

Boot effects:
1. `applyTenantTheme(theme)` writes `--brand-primary`, `--brand-secondary` CSS
   vars on `document.documentElement`.
2. `GET /my-permissions` + `GET /custom-fields` on token change.
3. `resolveHostTenant()` only if no token AND no cached tenant.
4. `registerPushNotifications()` on return visits (`token && user` effect).

Exposed API:
```
token, user, tenant, lang, setLang, t(key)
permissions, can(module, action), customFieldsFor(module), hasFeature(key)
loginSuccess({token, user, tenant})      // sets state + persists + fires push
logout()                                  // unregisters push + clears storage
loadPublicTenant(slug), resolveHostTenant()
refreshTenant(), refreshMe()
```

`loginSuccess` schedules `registerPushNotifications()` with a 500 ms delay so
the UI nav happens first; it is idempotent so repeated logins don't duplicate
listeners.

### Shells
- `AdminShell` — desktop sidebar + top bar (SuperAdmin).
- `MobileAdminShell` — mobile-first drawer + content (tenant admin, manager).
- `MobileShell` — bottom-nav PWA (employee, customer/dealer); `variant` prop
  switches tabs.

### i18n (`src/lib/i18n.js`)
Six languages: `en` (default), `hi`, `te`, `ta`, `kn`, `mr`. Keys selected
via `useApp().t(key)`.

### Offline queue (`src/lib/offline.js`)
- IndexedDB db `fc_offline`, store `queue`, keyPath `client_id`.
- `postOrQueue(api, url, payload, type)` — tries network first; falls back to
  `queueAdd(type, payload)` on `!navigator.onLine` or no-response error.
- Supported types: `visit | sales | collection | dcr | enquiry | location`.
- `syncQueue(api)` drains the queue through `POST /sync/batch` and removes
  items that return `ok:true` with matching `client_id`.
- `OfflineIndicator.jsx` listens for the `fc:queue:changed` event and shows a
  Sync Now button + pending count.

### GPS tracker (`src/lib/gpsTracker.js`)
- 5-minute `setInterval` after employee check-in; persisted to localStorage so
  reloads resume the timer.
- Each tick POSTs `{lat, lng}` to `/api/employee/location`.
- Stops on check-out.

### Push (`src/lib/pushNotifications.js`)
- `isNativeRuntime()` — detects Capacitor native container; web PWA returns
  immediately (no-op).
- `registerPushNotifications()`:
  1. Dynamic `import("@capacitor/push-notifications")`.
  2. `checkPermissions()` → `requestPermissions()` if `prompt*`.
  3. Wires 4 listeners (`registration`, `registrationError`,
     `pushNotificationReceived`, `pushNotificationActionPerformed`).
  4. `PushNotifications.register()` triggers the OS APNs/FCM handshake.
  5. On token receipt → `POST /api/push/register` with
     `{token, platform, device_label}`.
- Logs every state at `[push] …` so Safari Web Inspector / `chrome://inspect`
  pinpoint stalls.
- Foreground messages render a `sonner` toast; background taps route to
  `data.url`.
- `unregisterPushNotifications()` on logout — best-effort DELETE + remove
  listeners.

### Pages — a short map

| Route | Page | Purpose |
|---|---|---|
| `/` | `Landing.jsx` | Public home w/ tenant-slug entry |
| `/login` | `Login.jsx` | Phone+OTP for super admin / reviewer |
| `/t/:slug` | `Login.jsx` (TenantScope wrapped) | Tenant-scoped login (Staff/Dealer/Customer tabs) |
| `/legal/:kind` | `Legal.jsx` | Platform-default or tenant Markdown |
| `/t/:slug/legal/:kind` | `Legal.jsx` | Tenant-first; falls back to default |
| `/super-admin/*` | `SuperAdmin/*` | Dashboard · Tenants · Plans · Settings · Cloud |
| `/t/:slug/admin/*` | `TenantAdmin/*` | 17 admin pages (branding, employees, dealers, customers, products, orders, enquiries, reports, announcements, areas, roles, targets, leaves, custom-fields, advisor, legal, dashboard) |
| `/t/:slug/manager/*` | `Manager/*` | Dashboard · Team · MapView · Reports · reuses Targets/Leaves |
| `/t/:slug/app/*` | `Employee/*` | Home · dealers · customers · visit · collection · sales · dcr · enquiry · catalogue · notifications · profile · leaves · advisor |
| `/t/:slug/shop/*` | `Customer/*` | Home · catalogue · cart · orders · account · advisor |

### Design system
- Shadcn primitives at `src/components/ui/*`. Prefer named imports from these.
- Toasts via `sonner` (`src/components/ui/sonner.jsx`).
- Tailwind theme variables: `--brand-primary`, `--brand-primary-hover`,
  `--brand-secondary`, plus safe-area vars `--sa-top|right|bottom|left`.
- `index.css` provides `.safe-pt`, `.safe-pb`, `.safe-px`, `.safe-mb`,
  `.fixed-bottom-safe` utilities (Phase 6).
- `.legal-prose` style class used by `Legal.jsx` for Markdown rendering.
- `data-testid` convention: kebab-case function names
  (`send-otp-btn`, `demo-tenant-admin`, …) — see
  `src/constants/testIds/*.js`.

---

## 6. Build system (`build_app.py` + `build_system/`)

### Pipeline (per invocation)

Input: `build.env` + CLI args.

Step 1 — Fetch manifest (`manifest.py`):
- OTP-auths as super admin at `${API_BASE_URL}/api/auth/{request,verify}-otp`
  OR uses `SUPER_ADMIN_TOKEN`.
- Calls `GET /api/super/build/manifest/{slug}` → `{tenant, firebase: {android,
  ios}, logo: {base64, mime}, server: {host}}`.
- Masquerades as a browser UA to pass Cloudflare WAF.

Step 2 — Prepare project dir (`capacitor.py`):
- Wipes `${OUTPUT_DIR}/<slug>/` to guarantee zero cross-tenant contamination.
- Rebuilds the React bundle with per-tenant env overrides written to a
  **temporary** `frontend/.env.local` (removed after build):
  `REACT_APP_BACKEND_URL`, `REACT_APP_PLATFORM_HOST`,
  `REACT_APP_WEB_BASE_URL`.
- Copies the resulting `/app/frontend/build` → `<out>/webapp/`.
- Writes `tenant.json` for reproducibility (logo redacted).

Step 3 — Emit Capacitor config:
- `capacitor.config.ts` includes:
  - `appId = ${IOS_BUNDLE_PREFIX}.<slugified-slug>`
  - `appName = tenant.name`, `webDir = "webapp"`
  - `plugins.SplashScreen` (color = `theme.primary`, duration 1500ms,
    `androidSplashResourceName = "splash"`, CENTER_CROP).
  - `plugins.PushNotifications` (`presentationOptions:
    ['badge','sound','alert']`).
  - `plugins.StatusBar`, `plugins.Keyboard`.
  - `ios/android.backgroundColor = theme.webview_bg || "#FFFFFF"`.
- `package.json` pins Capacitor 7 + plugins + TypeScript 5.4.
- `yarn install --non-interactive` → `npx cap add <platform>`.

Step 4 — Generate assets (`assets.py`, Pillow):
- Android launcher icons for 5 densities × 3 variants (ic_launcher,
  ic_launcher_round, ic_launcher_foreground).
- `mipmap-anydpi-v26/ic_launcher*.xml` adaptive icon XML.
- `values/ic_launcher_background.xml` color.
- 2732×2732 splash → `resources/splash.png` and `splash-dark.png`.
- 512×512 Play Store marketing icon.
- iOS AppIcon.appiconset with 18 sizes (iPhone + iPad + marketing) +
  `Contents.json`.

Step 5 — Platform-specific patches:
- **Android (`android.py`)**:
  - `app/build.gradle` — rewrites `applicationId`, `versionName`,
    `versionCode`; applies `com.google.gms.google-services` plugin + Firebase
    BOM 33.3.0 if `google-services.json` present; injects release signing
    config from env.
  - `android/build.gradle` — adds `com.google.gms:google-services:4.4.2`
    classpath to buildscript.
  - `strings.xml` — tenant display name (XML-escaped).
  - `AndroidManifest.xml` — declares `POST_NOTIFICATIONS` permission
    (Android 13+).
  - `drawable-*` folders — copies `splash.png` into every density.
  - Compile: `./gradlew assembleDebug | assembleRelease | bundleRelease`
    when `ANDROID_HOME` is set.
- **iOS (`ios.py`)**:
  - `project.pbxproj` — `PRODUCT_BUNDLE_IDENTIFIER`, `MARKETING_VERSION`,
    `CURRENT_PROJECT_VERSION`, `CODE_SIGN_ENTITLEMENTS = App/App.entitlements`,
    optional `DEVELOPMENT_TEAM`.
  - `Info.plist` — `CFBundleDisplayName/Name/Version`,
    `UIBackgroundModes += remote-notification`, and
    **`FirebaseAppDelegateProxyEnabled = NO`** (required so Capacitor's push
    plugin owns APNs delegate callbacks instead of Firebase swizzling).
  - `GoogleService-Info.plist` — written from the manifest.
  - `App.entitlements` — `aps-environment = ${IOS_APS_ENVIRONMENT:-production}`.
  - `Podfile` (macOS) — adds `pod 'Firebase/Messaging'` into `target 'App' do`.
  - `AppDelegate.swift` — injects `import Firebase`,
    `FirebaseApp.configure()`, `Messaging.messaging().apnsToken =
    deviceToken` on APNs register, **plus
    `didFailToRegisterForRemoteNotificationsWithError` with `NSLog`** for
    on-device failure diagnostics.
  - **`Assets.xcassets/Splash.imageset/`** — populated via
    `install_splash_ios()` at @1x/@2x/@3x with `Contents.json`, so
    `LaunchScreen.storyboard` renders the tenant logo instead of the stock
    Capacitor placeholder.
  - Emits `build-ios.sh` for one-command `xcodebuild archive + -exportArchive`
    (uses optional `ExportOptions.plist` auto-generated from env).
  - On macOS: runs `npx cap sync ios` → `pod install` → optional
    `xcodebuild archive` when `--output archive|ipa`.
  - On Linux: prep-only; final iOS compile must finish on a Mac with Xcode +
    CocoaPods.

### Build CLI reference

```
python3 build_app.py \
  --tenant <slug> \
  --platform <android|ios> \
  --version <x.y.z> \
  --version-code <int> \
  [--output apk|aab|archive|ipa|prep]   # default apk for Android; prep for iOS
  [--release]                            # Android: produce release-signed APK
  [--env-file PATH]                      # default ./build.env or /app/build.env
  [--backend-url URL]                    # overrides API_BASE_URL
  [--super-token TOKEN]                  # skip OTP flow with pre-issued JWT
  [--super-phone PHONE] [--super-otp OTP]
  [--out-dir DIR]                        # overrides OUTPUT_DIR
  [--verbose]

python3 build_app.py --list-tenants       # discover available slugs
```

### Isolation guarantees
| Dimension | Source |
|---|---|
| appId / Bundle ID | `${IOS_BUNDLE_PREFIX}.<slugified-slug>` |
| App name | `tenant.name` |
| Icon (all densities) | Tenant `logo_path` → Pillow resize |
| Splash | Logo centered on `theme.primary` background |
| Firebase project | Per-tenant `google-services.json` / `GoogleService-Info.plist` from manifest |
| API endpoint | `API_BASE_URL` compiled into JS bundle |
| Theme | `theme.primary` → StatusBar + Splash background |

Two tenant apps on the same device cannot cross-contaminate: different
applicationId → different data sandbox; different Firebase project → different
APNs/FCM routing.

### Phase 10 Fix log (iOS push + splash — Feb 12 2026)

| Issue | Fix | File |
|---|---|---|
| iOS permission dialog never fires | `FirebaseAppDelegateProxyEnabled = NO` in Info.plist | `build_system/ios.py :: patch_info_plist` |
| APNs failures silent | Inject `didFailToRegisterForRemoteNotificationsWithError` w/ `NSLog` | `build_system/ios.py :: patch_app_delegate` |
| Tenant logo missing from iOS splash | New `install_splash_ios()` writes `Assets.xcassets/Splash.imageset` | `build_system/ios.py` |
| No frontend diagnostics on stall | Verbose `[push]` logs at every step | `frontend/src/lib/pushNotifications.js` |

Regression suite: `backend/tests/test_ios_push_and_splash_fix.py` — 6 tests
pass (Info.plist shape, AppDelegate injections, patch idempotency,
Splash.imageset layout, guard paths).

---

## 7. Credentials & demo data

### Test accounts (`memory/test_credentials.md`)

| Role | Phone | OTP | Notes |
|---|---|---|---|
| Super Admin | `9858558555` | `557725` | No tenant slug; `/login` |
| App/Play Reviewer | `9898989898` | `123456` | No slug; auto-reactivated; cannot self-delete |
| Tenant Admin (demo) | `9000000001` | `123456` | Ravi Kumar |
| Manager | `9000000002` | `123456` | Suresh Reddy |
| Employee | `9000000003` | `123456` | Anil Sharma |
| Employee #2 | `9000000005` | `123456` | Priya Patel |
| Dealer (B2B) | `9000000004` | `123456` | Naidu Krishi Kendra (DLR001) |
| Dealer #2 | `9000000006` | `123456` | Devi Agro Centre (DLR002) |
| Customer (B2C) | `9000000007` | `123456` | Venkat Rao (Farmer) |
| Customer #2 | `9000000008` | `123456` | Saraswati Bai |

Demo tenant: `slug=demo`, `name=Akshara Agro`. Seeded by
`backend/seed.py` on startup (idempotent — safe to re-run across worker
restarts; duplicate-key races are logged, not raised).

---

## 8. Environment variables

### Backend `/app/backend/.env` (required unless noted)

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URL` | ✓ | e.g. `mongodb://localhost:27017` |
| `DB_NAME` | ✓ | e.g. `fieldcrm_db` |
| `JWT_SECRET` | ✓ | HMAC key — rotate on compromise |
| `JWT_ALGO` | ✓ | `HS256` |
| `JWT_TTL_HOURS` | ✓ | integer, default 168 |
| `CORS_ORIGINS` | ✓ | `*` or comma-separated origins |
| `APP_NAME` | ✓ | `fieldcrm` — used by Emergent Object Storage path layout |
| `SUPER_ADMIN_PHONE` | ✓ | 10-digit phone of the platform owner |
| `SUPER_ADMIN_OTP` | ✓ | Fixed OTP for super admin |
| `DEMO_OTP` | ✓ | OTP for all demo users AND the universal reviewer |
| `EMERGENT_LLM_KEY` | optional | Enables Emergent Object Storage + LLM calls |
| `AWS_ACCESS_KEY_ID` | optional | S3 presign |
| `AWS_SECRET_ACCESS_KEY` | optional | S3 presign |
| `AWS_REGION` | optional | e.g. `ap-south-1` |
| `AWS_S3_BUCKET` | optional | e.g. `follomedia` |
| `AWS_S3_PRESIGN_TTL_SECONDS` | optional | default 900 |
| `AWS_PUBLIC_MEDIA_HOST` | optional | CloudFront/custom host for public URL |
| `FCM_SHARD_<i>_PROJECT_ID` | optional | Firebase project ID per shard |
| `FCM_SHARD_<i>_CREDENTIALS_JSON` | optional | Service-account JSON on one line |
| `ROOT_DOMAIN` | optional | Enables subdomain resolver |
| `TENANT_CACHE_TTL_SECONDS` | optional | default 300 |

### Frontend `/app/frontend/.env`

| Variable | Purpose |
|---|---|
| `REACT_APP_BACKEND_URL` | Base URL (no trailing `/`) that axios + `fileUrl` prepend to `/api` |
| `WDS_SOCKET_PORT` | `443` for Emergent preview WebSocket |
| `ENABLE_HEALTH_CHECK` | `false` |
| `REACT_APP_ROOT_DOMAIN` | optional — host-based tenant self-heal |

### Build `/app/build.env` (used only by `build_app.py`)
Covered fully in `/app/build.env.example` and §6 above. Never shares env with
backend/.env.

---

## 9. Local development

> This repo is pre-provisioned inside an Emergent preview pod. Supervisord
> starts MongoDB, backend, and frontend on boot. For local-outside-pod work,
> use the following steps.

### 9.1 Backend
```bash
cd /app/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in MONGO_URL, JWT_SECRET, SUPER_ADMIN_*, DEMO_OTP
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
# Verify:
curl -s http://localhost:8001/api/health
```
In the pod, `sudo supervisorctl status` lists `backend`, `frontend`, `mongodb`.
Restart only after `.env` or `requirements.txt` edits:
```bash
sudo supervisorctl restart backend
tail -n 100 /var/log/supervisor/backend.err.log
```

### 9.2 Frontend
```bash
cd /app/frontend
yarn install          # ONLY yarn — npm breaks resolutions
cp .env.example .env  # set REACT_APP_BACKEND_URL
yarn start            # port 3000, hot reload
```
Build for production: `yarn build` → `/app/frontend/build/`.
In the pod, HMR is on; restart only after `.env` / `package.json` changes:
```bash
sudo supervisorctl restart frontend
```

### 9.3 MongoDB
Local pod runs `mongod --bind_ip_all` under supervisor. Shell:
```bash
mongosh "mongodb://localhost:27017/fieldcrm_db"
> db.tenants.countDocuments()
```
Do not drop the `demo` tenant — the reviewer bypass depends on it existing.

### 9.4 Quick API smoke
```bash
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
curl -s "$API/api/" ; echo
curl -s "$API/api/health" ; echo
# OTP + login round trip
curl -s "$API/api/auth/request-otp" -H "Content-Type: application/json" \
  -d '{"phone":"9858558555"}' ; echo
TOKEN=$(curl -s "$API/api/auth/verify-otp" -H "Content-Type: application/json" \
  -d '{"phone":"9858558555","otp":"557725"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
curl -s "$API/api/auth/me" -H "Authorization: Bearer $TOKEN"
```

---

## 10. Testing

### 10.1 Backend pytest

Suite lives in `/app/backend/tests/`. Each file corresponds to a Phase.

```bash
# One-off (requires REACT_APP_BACKEND_URL exported for integration tests)
cd /app
export REACT_APP_BACKEND_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
python -m pytest backend/tests/ -v

# Unit-style tests that don't need the running server
python -m pytest backend/tests/test_ios_push_and_splash_fix.py -v
```

Reports from the testing agent live at `/app/test_reports/iteration_*.json`
(latest wins).

Note: a few integration tests (`test_phase26_*`, `test_phase3_*`) read
`REACT_APP_BACKEND_URL` at import time and fail collection when it's unset.
Export it before running them.

### 10.2 Frontend
```bash
cd /app/frontend
yarn test             # Jest + React Testing Library (CRA default)
yarn lint             # eslint (configured via @eslint/js)
```
Browser smoke via headless Playwright is routed through the testing agent;
there is no persistent E2E script in-repo.

### 10.3 Manual curl recipes

```bash
# Tenant resolve by host
curl -s "$API/api/public/tenant-resolve?host=demo.fieldcrm.localappstore.in"

# Super admin: list tenants
curl -s "$API/api/super/tenants" -H "Authorization: Bearer $SUPER_TOKEN"

# Super admin: build manifest for a slug (used by build_app.py)
curl -s "$API/api/super/build/manifest/demo" -H "Authorization: Bearer $SUPER_TOKEN" | jq '.tenant.name,.server,.firebase | keys'

# Push diagnostic (tenant admin)
curl -s "$API/api/admin/push/status" -H "Authorization: Bearer $TA_TOKEN"
```

---

## 11. Building the mobile apps

### 11.1 Prerequisites

| Target | Required on the build host |
|---|---|
| **Android debug APK** | JDK 17+, Node 18+, yarn, Python 3.11+, Pillow (via `pip install Pillow`) |
| **Android release APK/AAB** | all above + Android SDK (`ANDROID_HOME`) + keystore configured in `build.env` |
| **iOS prep (any OS)** | Node 18+, yarn, Python 3.11+, Pillow |
| **iOS compile** | macOS + Xcode 15+ + CocoaPods (`sudo gem install cocoapods`) |

### 11.2 One-time setup

```bash
cp /app/build.env.example /app/build.env
$EDITOR /app/build.env          # fill API_BASE_URL, SUPER_ADMIN_*, IOS_*, OUTPUT_DIR
python3 /app/build_app.py --list-tenants
```

### 11.3 Android

Debug APK (sideloadable, no signing):
```bash
python3 /app/build_app.py \
  --tenant demo --platform android \
  --version 1.0.0 --version-code 1 \
  --output apk
# → <OUTPUT_DIR>/demo/android/app/build/outputs/apk/debug/app-debug.apk
```

Release APK (requires keystore in `build.env`):
```bash
python3 /app/build_app.py \
  --tenant demo --platform android \
  --version 1.0.0 --version-code 1 \
  --output apk --release
```

Release AAB (Play Store):
```bash
python3 /app/build_app.py \
  --tenant demo --platform android \
  --version 2.4.1 --version-code 41 \
  --output aab
# → <OUTPUT_DIR>/demo/android/app/build/outputs/bundle/release/*.aab
```

Prep-only (skip gradle):
```bash
python3 /app/build_app.py --tenant demo --platform android \
  --version 1.0.0 --version-code 1 --output prep
# Finish later: cd <OUTPUT_DIR>/demo/android && ./gradlew assembleDebug
```

### 11.4 iOS

On Linux (prep):
```bash
python3 /app/build_app.py --tenant demo --platform ios \
  --version 1.0.0 --version-code 1
# → <OUTPUT_DIR>/demo/ios/App/App.xcworkspace prepared; iOS cap add is macOS-only
```

On macOS (finish):
```bash
rsync -r pod:/path/to/output/demo/ ./demo/
cd demo
yarn install
npx cap add ios && npx cap sync ios
open ios/App/App.xcworkspace
# Signing & Capabilities → confirm team → + Capability → Push Notifications
# Product → Archive → Organizer → Distribute App
# OR
./build-ios.sh    # xcodebuild archive + -exportArchive with ExportOptions.plist
```

For a one-shot IPA pipeline on macOS:
```bash
python3 build_app.py --tenant demo --platform ios \
  --version 1.0.0 --version-code 1 --output ipa
```

### 11.5 APNs key (one-time per Firebase project)

Required so Firebase can sign push messages to Apple's APNs:
1. Apple Developer → `developer.apple.com/account/resources/authkeys` → create
   an APNs Auth Key (`.p8`). Note Key ID + Team ID.
2. Firebase Console → Project Settings → Cloud Messaging → Apple app
   configuration → upload `.p8` + Key ID + Team ID.
3. Verify Bundle ID in Firebase matches `${IOS_BUNDLE_PREFIX}.<slug>` exactly.

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Backend crash-loop on startup | Missing REQUIRED env var | Check `tail -n 100 /var/log/supervisor/backend.err.log` for the fail-fast message. Set the var in `/app/backend/.env`, `sudo supervisorctl restart backend`. |
| `POST /api/uploads/presign` returns 503 | AWS keys unset | Set `AWS_*` env vars **or** PUT them via `PUT /api/super/aws-credentials` (hot-applied at runtime via `apply_runtime_credentials`). |
| FCM test push returns `disabled: FCM shard N not configured` | Shard env vars missing OR per-tenant Firebase config absent | Add to Super Admin → Cloud → Firebase Projects, bind tenant via `PUT /super/tenants/{id}/firebase-config` or auto-provision. |
| `verify-otp` returns 401 on 9898989898 | OTP mismatch | OTP is literally `123456` (not `DEMO_OTP` env value if different). Check `/app/backend/.env` — `DEMO_OTP` must equal `123456`. |
| Tenant resolver returns null for custom host | `ROOT_DOMAIN` unset or `custom_domain` not saved | `GET /api/public/tenant-resolve?host=<h>`; verify the tenant row has `custom_domain` set OR `ROOT_DOMAIN` matches the suffix. |
| Frontend "Can't reach the server" | Cold-start on Cloudflare 502/503/504 | Login UI auto-retries once with 1.5 s backoff — this is expected and will succeed on 2nd attempt. |
| craco: command not found during build | `node_modules` missing or `npm` was used | `cd /app/frontend && rm -rf node_modules && yarn install`. |
| Android `./gradlew` fails with "SDK location not found" | `ANDROID_HOME` unset | Set `ANDROID_HOME=/opt/android-sdk` (or wherever) in `build.env`; otherwise use `--output prep` and compile on another machine. |
| iOS permission dialog never appears on first launch | Pre-fix: Firebase swizzling | Fixed via `FirebaseAppDelegateProxyEnabled=NO`. If still broken, verify Info.plist contains that key AND APNs capability is enabled in Xcode. |
| iOS splash shows stock Capacitor logo | Pre-fix: `Splash.imageset` empty | Fixed via `install_splash_ios()`. If still broken, verify `ios/App/App/Assets.xcassets/Splash.imageset/splash*.png` exist in the generated project. |
| `fileUrl(path)` returns 401 | Token stale or missing | `fileUrl` embeds `?auth=<fc_token>` from localStorage. Ensure user is logged in; otherwise use direct S3 `object_url` from the presign response. |
| Offline queue not draining | `online` event didn't fire or `/sync/batch` 4xx | Click Sync Now in `OfflineIndicator`, or inspect devtools → Application → IndexedDB → `fc_offline`. |
| Push tokens accumulate dead entries | Firebase marks tokens as `NotRegistered` | `POST /api/super/push/tokens/purge` (super admin) bulk-removes invalid tokens flagged by the FCM response. |

Log locations:
- `/var/log/supervisor/backend.err.log`, `backend.out.log`
- `/var/log/supervisor/frontend.err.log`, `frontend.out.log`
- `/var/log/mongodb.err.log`
- Frontend browser console (verbose `[push]` logs during registration)
- iOS device log via Xcode → Devices → Console (NSLog entries from AppDelegate)

---

## 13. Conventions & rules

1. **No new .env defaults.** Required vars are enforced by `require_env`.
   Omit fallbacks so misconfiguration surfaces immediately.
2. **Backend routes must be prefixed with `/api`.** The Kubernetes ingress
   routes `/api/*` to port 8001 and everything else to the frontend.
3. **Frontend must use `process.env.REACT_APP_BACKEND_URL`** — never hard-code.
4. **Tenant isolation**: every query that touches a tenant-scoped collection
   must filter by `tenant_id`. The helper `current_tenant_id(user,
   x_tenant_slug)` returns the correct scope (super admin uses the header,
   everyone else uses `user.tid`).
5. **Datetimes**: always `datetime.now(timezone.utc)` → stored as ISO string
   via `now_iso()`. Never `datetime.utcnow()` (naive).
6. **Mongo `_id`**: Always `clean(doc)` before returning. Models expose `id`
   (string UUID4), not `_id`.
7. **Soft-delete first**: `users.deleted_at` + bumped `token_revoked_after`
   kills all live sessions. Only `super_admin` and the reviewer phone cannot
   self-delete.
8. **Additive-only migrations**: new model fields default to `null` / empty /
   benign so existing rows keep working.
9. **No fallback secrets.** `auth.py` reads `JWT_SECRET`, `JWT_ALGO`,
   `JWT_TTL_HOURS`, `SUPER_ADMIN_*`, `DEMO_OTP` without default values.
10. **Yarn only.** `package.json` has a `resolutions` block that `npm`
    silently ignores.
11. **Build artifacts live outside the repo.** `OUTPUT_DIR` defaults to
    `./output`; `BUILD_OUT_ROOT` is a legacy alias.
12. **Reviewer bypass is sacrosanct.** `9898989898` + `123456` must always
    log into the `demo` tenant without a slug; test
    `test_phase34_uploads_legal_delete.py` locks this behaviour.
13. **`test_credentials.md` is read by the testing agent** — update it any
    time an auth account is created/modified.

---

## 14. Verified commands cheat sheet

```bash
# Service control
sudo supervisorctl status
sudo supervisorctl restart backend
sudo supervisorctl restart frontend
tail -n 100 /var/log/supervisor/backend.err.log

# Mongo shell
mongosh "mongodb://localhost:27017/fieldcrm_db"

# Backend tests (unit-style, no running server needed)
cd /app && python -m pytest backend/tests/test_ios_push_and_splash_fix.py -v
cd /app && python -m pytest backend/tests/test_phase10_build_manifest.py -v

# Backend tests (integration — need preview URL set)
cd /app && \
  REACT_APP_BACKEND_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2) \
  python -m pytest backend/tests/ -q

# Discover tenants
python3 /app/build_app.py --list-tenants

# Build a tenant (prep only, no SDK required)
python3 /app/build_app.py --tenant demo --platform android \
    --version 1.0.0 --version-code 1 --output prep

# Full OTP + manifest round-trip
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
curl -s "$API/api/auth/request-otp" -H "Content-Type: application/json" \
    -d '{"phone":"9858558555"}'
TOKEN=$(curl -s "$API/api/auth/verify-otp" -H "Content-Type: application/json" \
    -d '{"phone":"9858558555","otp":"557725"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
curl -s "$API/api/super/build/manifest/demo" -H "Authorization: Bearer $TOKEN" | jq keys
```

---

## 15. Related documentation

| File | Scope |
|---|---|
| `/app/documentation/environment-variables.md` | Every env var, required vs. optional |
| `/app/documentation/retrofit-architecture.md` | 7-phase SaaS retrofit reference (Phases 1–7) |
| `/app/documentation/build-system.md` | Full build-pipeline guide |
| `/app/documentation/push-notifications.md` | End-to-end FCM/APNs push guide + diagnostics |
| `/app/memory/PRD.md` | Living product-requirements doc + changelog |
| `/app/memory/test_credentials.md` | Live demo accounts & OTPs |
| `/app/test_reports/iteration_*.json` | Historical testing-agent reports |
| `/app/test_result.md` | Running testing-agent log |

---

_End of CLAUDE.md. Regenerate (do not patch) when backend `models.py` /
`server.py` / `build_system/*` evolve significantly._
