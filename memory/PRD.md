# FieldCRM SaaS — PRD (Phase 1 + 2)

## Original Problem Statement
Multi-tenant SaaS Field Force Management platform (FieldCRM / localappstore.in) for agriculture, FMCG, pharma, manufacturing, service. Five surfaces: Super Admin, Tenant Admin, Manager, Employee mobile PWA, Customer/Dealer PWA. Phone+OTP login (Pingbix planned, mocked for MVP). Super Admin phone 9858558555 / OTP 557725. Demo OTP 123456. White-label per tenant. Multilingual i18n (en, hi, te, ta, kn, mr). OpenStreetMap for GPS; Google Maps key placeholder per tenant. Emergent Object Storage; AWS S3 placeholder at platform settings.

## Phase 2 Choices (user decisions)
- GPS interval **5 minutes** between check-in and check-out
- Offline mode for **all field entries** (Visit, Sales, Collection, DCR, Enquiry, Check-in/out, location pings) with auto-sync on reconnect
- Leave approval by **direct manager OR anyone above in hierarchy**
- Area assignment **rolls up automatically** to all descendants
- Targets are **total sales value (₹) per employee per month** with roll-up
- **Custom roles**: admin creates roles with read/write permissions per module; every employee assigned a role

## Architecture
- Backend: FastAPI + MongoDB (motor). All collections scoped by `tenant_id`.
- Frontend: React 19 + react-router-dom 7 + Tailwind + shadcn/ui + recharts + react-leaflet.
- Offline: IndexedDB queue in `/lib/offline.js`; `postOrQueue()` helper used in Visit/Sales/Collection/DCR/Enquiry forms.
- GPS: `gpsTracker.js` starts a 5-min interval when employee checks in, stops on check-out. Persists state to localStorage so reloads resume tracking.
- Permissions: `/api/my-permissions` returns effective permissions overlay (default + custom role). `AppContext.can(module, action)` gates UI.

## What's Implemented

### Phase 1 (Feb 2026)
- Phone+OTP auth (mock), JWT with tenant + role + permissions
- Super Admin: tenants/plans/settings + global analytics
- Tenant Admin: branding (logo + colors + label customizer with live preview), employees, dealers, products, orders, enquiries, reports, announcements
- Manager: dashboard, team, OSM map, reports
- Employee PWA: home + 8 cards (check-in/out, dealers, visit, collection, sales, DCR, enquiry, catalogue, notifications)
- Customer/Dealer PWA: home, catalogue with cart, place order, order history, account
- Excel/CSV import-export, Emergent Object Storage uploads, 6-language i18n, runtime CSS-var theming

### Phase 2 (Feb 2026)
- **Area Hierarchy**, **Custom Roles & Permissions**, **Monthly Targets**, **Leaves**, **Offline Queue**, **GPS Tracking Enhanced** — as previously documented.

### Phase 2.5 — Dealer vs Customer split (Feb 2026)
- **Dealers (B2B distributors)** and **Customers (B2C farmers)** are now distinct roles + modules end-to-end.
  - Backend: `role="dealer"` and `role="customer"` are separate. Data migration in seed promotes legacy `role="customer"` with `dealer_code` → `role="dealer"`. Farmer users seeded with `farm_size_acres`/`crops`.
  - Frontend Admin: separate pages `/admin/dealers` (B2B) and `/admin/customers` (B2C farmers).
  - Frontend Employee: separate PWA pages `/app/dealers` and `/app/customers`.
  - **Enquiry** links exclusively to Customers (Farmers) with optional `customer_id` FK.
  - **Sales & Collections** → Dealers only.
  - **Visits & DCR** → both dealers and customers selectable per entry (`party_type` field).
  - Both dealers and customers can log in via the shop PWA and place orders (role-hint on OTP).
  - New permission module `customers`; sales role gets read+write to both `dealers` and `customers` by default.
  - Login screen now has 3 tabs: Staff | Dealer | Customer.

### Phase 2.6 — Custom Fields + Catalog Mode (Feb 2026)
- **Custom Fields** — tenant admin can define custom fields per module (`dealer`, `customer`, `product`, `enquiry`, `visit`).
  - Field types: text, textarea, number, date, dropdown, radio, checkbox (multi-select).
  - Configurable: label, key, options, required, order, placeholder, help_text, visible_to_customer.
  - Managed at `/t/:slug/admin/custom-fields` (module tabs + CRUD table + dialog).
  - Values stored in `custom_data` dict on each record. `<CustomFieldsForm module="..."/>` component auto-renders inputs everywhere.
  - Wired into: TenantAdmin & Employee Dealer/Customer/Product/Enquiry/Visit forms, Customer PWA account page (self-signup fields), Enquiry inline "New Customer" modal.
- **Catalog Mode** — new `tenant.catalog_mode`: `direct` (default: show prices + cart) or `enquiry_only` (hide prices, buttons become "Enquire").
  - Toggle in Branding page.
  - Customer PWA `/shop/catalogue`: shows "Enquire" button per product, submits an enquiry on click.
  - Customer PWA `/shop/cart`: submits a bulk enquiry summarizing all items+qty in enquiry mode.
  - Backend enforces: `POST /api/orders` returns 400 if tenant `catalog_mode==enquiry_only`.
- **Self-profile** endpoint `PATCH /api/me/profile` — dealers/customers can edit their own profile (including custom_data) from the shop PWA account page.

### Phase 3.0 — Crop Health Advisor Module (Feb 2026) 🌱
- **Industry-specific, opt-in module** — `tenant.features.crop_advisor` toggle. Super Admin enables per tenant via new endpoint `PATCH /api/super-admin/tenants/{id}/features` and Tenants management card.
- **Database-driven content** (no hardcoding):
  - `crops` — master list per tenant (Paddy, Cotton, Chilli … seeded 10 crops)
  - `advisory_entries` — unified `disease | pest | deficiency` entries with 18 sections (basic info, photos, symptoms, causes, weather, spread, prevention, organic/chemical treatment, safety instructions, FAQs, documents, product recommendations, keywords)
  - `seasonal_advisories` — targeted alerts (crop / state / district / date range)
  - `user_favorites` + `recent_views` — bookmarks & auto-tracked history
  - Photos & PDFs uploads only (video not supported anywhere in this module)
- **User flows** (`/t/:slug/{app|manager|admin|shop}/advisor`):
  - Hub with 8 tiles: My Crops · Diseases · Pests · Deficiencies · Seasonal Alerts · AI Detection (Coming Soon, disabled) · Recently Viewed · Favourites
  - My Crops selector saves to `user.my_crops` (array of crop IDs)
  - Crop Dashboard shows counts by type + recommended products for a specific crop
  - Advisory list with search + crop filter chips
  - Advisory detail — all 18 sections, integrated Spray Calculator, share-to-WhatsApp button, favorite toggle
  - Product recommendations with **View / Enquire / Buy or Locate Dealer** buttons — respects existing `catalog_mode` for the enquire vs buy choice
- **Admin CRUD** at `/t/:slug/admin/advisor` — tabbed manager for Crops · Diseases · Pests · Deficiencies · Seasonal Alerts. Full-fidelity form with photo/doc uploads, product mapping (multi-select).
- **Menu placement**: More menu link (feature-flag gated) for admin, manager and employee. Top card on Customer/Dealer PWA home.
- Demo tenant seeded with 3 sample advisories (Rice Blast, Pink Bollworm, Nitrogen Deficiency) + one seasonal alert.
- **AppContext cache**: Custom fields are now cached at token-load (`customFieldsFor(module)`) to avoid 5x refetches. `hasFeature("crop_advisor")` helper available.
- **Server-side validation**: `PATCH /api/me/profile` now blocks with 400 when required visible-to-customer custom fields are empty.

### Phase 2 (Feb 2026)
- **Area Hierarchy** (Country → State → District → Area) — `/api/areas` CRUD, tree UI at `/t/:slug/admin/areas`. 8 nodes seeded for demo tenant (India / Telangana+AP / Hyderabad+Warangal+Karimnagar / Hyderabad N+S).
- **Custom Roles & Permissions** — `/api/roles`, `/api/permission-modules`, `/api/my-permissions`. UI at `/t/:slug/admin/roles` with module×{read,write} matrix; 2 default roles seeded (Sales Executive, Read-Only Observer). Employees PWA cards gate visibility via `can()`.
- **Monthly Targets** — `/api/targets` and `/api/targets/progress` with sales actual aggregation. UI at `/t/:slug/admin/targets` (per-employee row with progress bar). Employee PWA home shows progress card. Demo: Anil ₹50k, Priya ₹40k for current month.
- **Leaves** — `/api/leaves` apply (employee), list (mine for employees, team+self for managers, all for admin), `/api/leaves/{id}` PATCH for approve/reject with hierarchy enforcement (direct manager or anyone above; tenant_admin always). Employee PWA at `/app/leaves` with Apply modal; Tenant Admin & Manager at `/admin/leaves` and `/manager/leaves` with Approve/Reject dialog.
- **Offline Queue** — IndexedDB-backed queue (`fc_offline.queue`). Field forms call `postOrQueue()` and survive network outages. `OfflineIndicator` shows pending count + Sync Now button. Auto-sync on `online` event via `/api/sync/batch`. Supports visit/sales/collection/dcr/enquiry/location types.
- **GPS Tracking Enhanced** — Background ping every 5 min on check-in. `/api/gps/track?user_id=...&date=...` returns pings + 50m-radius clustered stops + duration + attached visit activities (within 200m of stop). `/api/gps/live` returns currently checked-in users with last known location. Manager Map view has History/Live toggle, stop timeline, distance KPI.
- **User Model Extensions** — `role_id` (custom role), `area_node_id` (any level of area hierarchy), `leave_balance`. Employee Add modal exposes both selects.

### Backend test coverage
- 23/23 pytest pass on Phase 2 endpoints (`test_phase2.py`)
- Includes hierarchy enforcement (403 for non-chain manager), GPS clustering, sync batch round-trip, target progress rollup, role permissions overlay

## Personas
1. **Super Admin** — platform owner (tenants, billing, settings)
2. **Tenant Admin** — business owner (branding, areas, roles, targets, all data)
3. **Manager** — team supervisor (approves leaves of reports, GPS, performance)
4. **Field Employee** — daily activity entries + leave application
5. **Customer/Dealer** — catalogue, orders, account

## Backlog (P1)
- Pingbix SMS integration once credentials shared (provider already plumbed in Platform Settings)
- Selfie capture during check-in
- Photo uploads on Visit/Enquiry/Collection forms
- Audit logs for important actions
- Per-tenant subdomain wildcard routing + PWA manifest per tenant
- Tree-move support for area hierarchy (PATCH with parent_id update)
- Sync batch idempotency (dedupe by client_id)

## Backlog (P2)
- Push notifications (web push)
- Razorpay payments, Tally integration
- Distributor network / multi-level hierarchy
- Loyalty / incentive schemes
- Background route-replay with speed colored polylines

---

## Retrofit Architecture (7-Phase — Feb 2026)

Layering "Bizil-Pattern" scaffolding onto the existing MVP. **Golden rule: additive only, do not change business logic. All new fields default null/empty.**

### ✅ Phase 1 — Block G: Env Var Discipline (Feb 8, 2026)
- Created `backend/.env.example` and `frontend/.env.example` with all present + planned (S3, FCM, subdomain) variables and inline comments.
- Added `require_env([...])` fail-fast validator in `server.py`; startup raises `RuntimeError` if any REQUIRED variable is missing or blank. Verified via unit script.
- `auth.py` now reads `JWT_SECRET / JWT_ALGO / JWT_TTL_HOURS / SUPER_ADMIN_PHONE / SUPER_ADMIN_OTP / DEMO_OTP` without dev fallbacks. Removed hard-coded `"dev-secret"` default.
- `auth.py` calls `load_dotenv()` at module top to guarantee env is available even when imported before `server.py` fires its own `load_dotenv`.
- Full env reference documented at `/app/documentation/environment-variables.md`.
- Live smoke test: super-admin login (`9858558555 / 557725`) returns valid 259-char JWT.

### ✅ Phase 2 — Block A: Multi-tenant subdomain resolver (Feb 8, 2026, SHIPPED LIVE)
- Added `Tenant.custom_domain` (Optional[str], additive, defaults `null`) + sparse-unique index in Mongo.
- New `/app/backend/tenant_resolver.py` module: pure `normalize_host` + `parse_host_to_slug` helpers, plus positive/negative in-memory TTL caches (`TENANT_CACHE_TTL_SECONDS`, default 300s).
- New endpoint `GET /api/public/tenant-resolve?host=<host>` — returns `{tenant, matched_by, host, root_domain}`; resolves via `custom_domain` first, then `<slug>.<ROOT_DOMAIN>` subdomain.
- Stale-tenant self-heal: both `/api/public/tenants/by-slug/:slug` and internal `resolve_tenant_by_slug` now 404 with `{code: "tenant_not_found"}` so the frontend can drop stale localStorage and recover cleanly.
- Cache invalidation wired into `PATCH /api/tenant/profile`, `PATCH /api/super/tenants/:id`, and `DELETE /api/super/tenants/:id`.
- Frontend `AppContext` boots with `resolveHostTenant()` — auto-loads tenant when the URL matches a custom domain or subdomain; no `/t/:slug` click required. `loadPublicTenant()` now purges stale localStorage on 404-code.
- Tenant Admin Branding page adds a **Custom Domain** input (lowercase, trimmed) with a CNAME hint.
- 9/9 new pytest cases (`tests/test_phase2_subdomain.py`) green. Full backend regression: 120 passed (3 pre-existing failures in `test_fieldcrm.py` are stale demo-data assertions, unrelated to Phase 2).
- No console errors on landing after Phase 2 changes.
### ✅ Phase 3 — Block C (S3 direct upload) + Block E (Legal CRUD) (Feb 8, 2026)

**Block C — AWS S3 direct-upload presigning**
- New `/app/backend/s3_presign.py`: env-driven S3 client factory + `presign_put()` producing a SigV4 PUT URL (no CORS preflight). Includes deterministic `build_key(tenant, user, module, filename)` scheme: `tenant/<tid>/<module>/<user>/<uuid>-<safe-name>`.
- New endpoint `POST /api/uploads/presign` (auth-gated). Returns **503** with `"S3 uploads not configured on this environment"` when `AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_S3_BUCKET` are absent — the rest of the app continues to work.
- Env vars already documented in Phase 1 (`.env.example` + `documentation/environment-variables.md`).

**Block E — Legal Documents CRUD + public `/legal/:kind`**
- New `LegalDocument` model (`kind ∈ {privacy, terms, refund, shipping, about, contact}`, versioned, `is_published` flag). Additive: existing tenants have zero rows.
- Endpoints:
    - `GET /api/public/legal/{kind}?slug=<>` — resolves tenant by slug/header/host; returns latest published doc or 404 `{code: "legal_not_found"}`.
    - `GET /api/admin/legal` + `GET /api/admin/legal/{kind}/latest` — tenant admin fetch.
    - `POST /api/admin/legal` — creates a new version (optional `publish=true` demotes prior versions atomically).
    - `POST /api/admin/legal/{id}/publish` and `DELETE /api/admin/legal/{id}`.
- Frontend:
    - Public route `/legal/:kind` and `/t/:slug/legal/:kind` — renders content_md with an App-Store-friendly empty-state fallback.
    - New Tenant Admin page `/t/:slug/admin/legal` with per-kind tabs + Save Draft / Publish buttons; wired into the admin sidebar (**Legal Documents**).
    - Customer/Dealer Account page now surfaces Privacy / Terms / Refund / Contact links.

### ✅ Phase 4 — Block D: Soft-delete + session revocation + reviewer bypass (Feb 8, 2026)
- `User` model gained `deleted_at` and `token_revoked_after` (additive, nullable).
- New async `_session_validator` registered on startup via `auth.set_session_validator()`. Every Bearer request checks the user's status: rejects when user is deleted, disabled, or the JWT `iat < token_revoked_after`.
- New endpoint `POST /api/auth/me/delete` — strict guards:
    - **outstanding_balance** (`> 0`) → 409 `{code: "outstanding_balance", outstanding_amount}`.
    - **active_orders** (any order in draft/submitted/approved/packed/dispatched) → 409 `{code: "active_orders"}`.
    - **Reviewer bypass**: phone `9898989898` cannot self-delete (App Store re-audits repeatedly). Super-admin also cannot.
    - On success: `is_active=false`, `deleted_at=now`, `token_revoked_after=now` — all existing JWTs die on the next request.
- New endpoint `POST /api/auth/logout-all` — self-service kill switch bumping `token_revoked_after`.
- **Universal reviewer bypass** (App Store / Play Store):
    - Phone `9898989898` + OTP `123456` logs in without a tenant slug and becomes a tenant_admin of the `demo` tenant.
    - Reviewer user is auto-seeded on first login and auto-reactivated on subsequent audits.
- Frontend: Customer/Dealer Account page adds a **Delete My Account** button (with confirm + error surfacing).

**Testing (Phase 3 + 4)**
- `tests/test_phase34_uploads_legal_delete.py`: **11/11 green** — presign 503, presign 401, legal kind validation, full publish cycle, missing-kind fallback, non-admin 403, reviewer bypass login, reviewer cannot delete, soft-delete blocked by outstanding balance, soft-delete succeeds & revokes session, logout-all revocation.
- Full regression: **131 passed**. 3 pre-existing `test_fieldcrm.py` failures unrelated (stale demo-tenant name).
- Live smoke: `/t/demo/legal/privacy` renders the published Privacy Policy.
### ✅ Phase 5 — Block B: FCM sharded push + Capacitor build script (Feb 8, 2026)

**Backend — FCM sharding (`/app/backend/fcm_service.py`)**
- Constants: `SHARD_CAPACITY = 15` tenants per Firebase project.
- Pure helpers: `pick_shard_for_new_tenant()`, `configured_shards()`, `is_shard_configured()`.
- Lazy per-shard `firebase_admin.App` cache (thread-safe). Service-account JSON from `FCM_SHARD_<i>_CREDENTIALS_JSON`.
- `send_to_tokens(shard_id, tokens, title, body, data)` — multicast via `messaging.send_each_for_multicast`; returns `{sent, failed, disabled?}` and NEVER raises. Missing config → benign no-op.
- New `Tenant.fcm_shard_id` field (additive, default 1). Auto-assigned on `POST /api/super/tenants` via round-robin picker.

**Backend — Endpoints**
- `POST /api/push/register` — upserts a `PushToken` row. Dedupes by `(user_id, token)` (unique index).
- `POST /api/push/unregister` — removes a token.
- `POST /api/admin/push/test` — tenant admin dispatches a test push through the tenant's shard. Returns shard result + `tokens_targeted + shard_id`.
- `GET /api/admin/push/status` — diagnostic (shard configured?, token count).
- `GET /api/super/push/shards` — super-admin overview: per-shard tenant list, remaining capacity.

**Capacitor build script (`/app/capacitor-build.sh`)**
- One command: `./capacitor-build.sh <slug> [ios|android|both]`.
- Fetches tenant JSON, derives `APP_ID = in.localappstore.fieldcrm.<slug>`, brands `capacitor.config.ts` with theme colour + push plugin.
- Copies shard-appropriate `google-services.json` / `GoogleService-Info.plist` — Android + iOS push wired per shard.
- Idempotent: `dist/tenants/<slug>` refreshes on re-run.

### ✅ Phase 6 — Block H: iOS safe-area CSS + toast offset (Feb 8, 2026)
- `viewport-fit=cover` + `apple-mobile-web-app-capable` meta in `index.html`.
- CSS custom props `--sa-top/right/bottom/left` from `env(safe-area-inset-*)`.
- Utility classes: `.safe-pt`, `.safe-pb`, `.safe-px`, `.safe-mb`, `.safe-inset-x`, `.fixed-bottom-safe`.
- Sonner toaster shifted by safe-area on all four sides.
- Mobile shells apply `safe-pt` on sticky header and `safe-pb` on fixed bottom nav.

### ✅ Phase 7 — Docs + full regression (Feb 8, 2026)
- New `/app/documentation/retrofit-architecture.md` — 7-phase reference (endpoints, models, env vars, credentials, files).
- Fixed one pre-existing 500-error bug: customer auto-register now returns **409 `{code: "phone_role_conflict"}`** instead of leaking `DuplicateKeyError` when the phone is already registered under a different role.
- Restored demo tenant name (`Akshara Agro`) and corrected `test_fieldcrm.py` to use the real customer phone (`9000000007`).
- Applied testing agent's polish items:
  - `POST /api/admin/push/test` now accepts empty body via `Body(default_factory=PushTestIn)`.
  - Reviewer / super-admin self-delete 403s now return structured `{code: "reviewer_no_self_delete"}` / `{code: "super_admin_no_self_delete"}` for programmatic frontend handling.
- `testing_agent_v3_fork` **iteration_6.json → 100% (18/18)** — all seven phases validated end-to-end against live REACT_APP_BACKEND_URL.
- Full backend pytest: **164 / 164 green** (146 pre-existing + 18 regression suite).

### ✅ Phase 8 — Cloud Credentials UI + Per-Tenant Firebase + Test Push (Feb 8, 2026)

**User-reported gaps addressed**
- **Bug**: "there is no option for firebase service account file uploading in super admin" ✅
- **Bug**: "check the aws keys provision in super admin" ✅
- **Feature**: "need to provide a test push notification provision for each tenant in super admin" ✅

**Backend**
- New `s3_presign.apply_runtime_credentials()` + in-process override — AWS creds saved via UI apply immediately, no restart.
- `platform_settings.aws_credentials` doc; hydrated on startup by `_hydrate_cloud_credentials()`.
- New models: `FirebaseProject` (project_id + service_account_json + capacity), `TenantFirebaseApp` (per platform), `TenantFirebaseConfig` (android + ios). Additive; backward-compat with env-based `Tenant.fcm_shard_id`.
- New `firebase_provisioning.py` — real-time Firebase Management API v1beta1: create iOS/Android app + LRO polling + config download. `create_app()` returns `{ok, error?}`, NEVER raises.
- `fcm_service.send_to_tokens()` now accepts optional `service_account_json + project_id` for per-tenant Firebase; falls back to env shard when absent.
- `_dispatch_to_tenant()` prefers per-tenant DB config, falls back to env shard — includes `source` field in the response.

**Backend endpoints (super_admin only)**
- `GET/PUT /api/super/aws-credentials` (secret always masked on read; `head_bucket` verify on save).
- `GET/POST/DELETE /api/super/firebase-projects` + `POST .../refresh`. Sparse-unique on `project_id`, 409 on duplicate.
- `GET/PUT /api/super/tenants/{id}/firebase-config` + `DELETE .../{platform}` — per-platform independence for mixed scenarios (android existing + ios auto, etc.).
- `POST /api/super/tenants/{id}/firebase-config/provision` — real-time Firebase Management API app creation. Errors captured in `provisioning_error` field (deferred fallback path).
- `POST /api/super/tenants/{id}/push/test` — super-admin per-tenant test push with optional `dry_run_token` for tenants that have no real devices yet.

**Frontend — Super Admin → Cloud (`/super-admin/cloud`)**
- Three tabs: AWS S3, Firebase Projects, Tenants.
- AWS section: 5 inputs + save; live head_bucket verification badge; secret shown masked after save.
- Firebase Projects: add via JSON file upload OR paste; capacity bar per project (X/30); tenants_bound counter; refresh (calls Management API to re-count remote apps); delete blocked when bound.
- Tenants tab: sidebar list + two PlatformCards (Android/iOS) with "Existing" / "Auto-provisioned" / "Not configured" chips; independent per-platform edit/unbind; auto-provision modal with capacity-aware dropdown; error red-banner on failure.
- Test Push card per tenant with title/body/dry_run_token → live send with JSON result panel.
- Central `formatDetail()` helper prevents any `[object Object]` toast from Phase 2/3/4 structured errors.

**Testing**
- `tests/test_phase8_cloud_firebase.py`: **11/11 green** — AWS 403 for non-super / GET masks / PUT applies at runtime with real bucket verification / presign returns real signed URL with `media.localappstore.in`. Firebase rejects non-service-account / CRUD lifecycle / 409 duplicate. Per-tenant config platform independence (android + ios stored separately, unbind one preserves the other). Provisioning fails gracefully with fake SA (200 with ok:false + error stored). Super push forbidden for tenant_admin.
- `testing_agent_v3_fork` **iteration_8 → 100% (22/22 backend + full frontend UI)** — all reported bugs and features validated live.
- Full backend regression: **182 / 182 green** after updating two legacy tests that assumed AWS was un-configurable.
- AWS bucket `follomedia` verified live via `head_bucket` at ap-south-1.
- New `/app/documentation/retrofit-architecture.md` — 7-phase reference (endpoints, models, env vars, credentials, files).
- Fixed one pre-existing 500-error bug: customer auto-register now returns **409 `{code: "phone_role_conflict"}`** instead of leaking `DuplicateKeyError` when the phone is already registered under a different role.
- Restored demo tenant name (`Akshara Agro`) and corrected `test_fieldcrm.py` to use the real customer phone (`9000000007`).
- Applied testing agent's polish items:
  - `POST /api/admin/push/test` now accepts empty body via `Body(default_factory=PushTestIn)`.
  - Reviewer / super-admin self-delete 403s now return structured `{code: "reviewer_no_self_delete"}` / `{code: "super_admin_no_self_delete"}` for programmatic frontend handling.
- `testing_agent_v3_fork` **iteration_6.json → 100% (18/18)** — all seven phases validated end-to-end against live REACT_APP_BACKEND_URL.
- Full backend pytest: **164 / 164 green** (146 pre-existing + 18 regression suite).



### Login/OTP Regression Sign-off (Feb 11, 2026)
- Recurring "Failed to send OTP" bug (user reported 3x) confirmed resolved. Root cause was a transient backend crash-loop after `ROOT_DOMAIN` `.env` change; backend now stable across hot-reload cycles.
- `testing_agent_v3_fork` **iteration_12.json → 100% backend (8/8) + full frontend flows** for Super Admin (9858558555), Reviewer bypass (9898989898), and Tenant Admin demo (9000000001). `/api/auth/request-otp`, `/verify-otp`, `/auth/me`, `/public/tenant-resolve` all green.
- New regression suite added: `/app/backend/tests/test_login_regression_iter12.py` (8 tests).
- Note: super_admin is identified by `user.role == 'super_admin'` (no `is_super_admin` flag on the user object); `/api/public/tenant-resolve` is host-based only (no `?slug=` query support).

### P2/P3 Backlog (open)
- P2: Server-side enforcement of required `visible_to_customer` custom fields on `/api/me/profile` and self-signup.
- P2: Pingbix real OTP integration (pending user credentials).
- P2: Razorpay / Tally integration modules (pending scope + credentials).
- P3: Extract Logo Upload and Firebase Provisioning subcomponents from `Tenants.jsx`; surface per-platform (iOS/Android) provisioning status in the update dialog.
- P3: Split `server.py` (3218 lines) into `/app/backend/routes/` by domain (auth/tenants/orders/uploads/legal/…). Optionally add typed response model for `/api/auth/me`.
- P3 (cosmetic): Fix Recharts `width(-1) height(-1)` container-sizing warnings on tenant admin dashboard tiles.
- P3 (optional DX): Add `?slug=<x>` query fallback in `/api/public/tenant-resolve` for easier debugging.


## Phase 10 — Capacitor Build System (Feb 11, 2026)

Fully automated per-tenant Capacitor build via `python3 build_app.py`.

**Backend**
- New `GET /api/super/build/manifest/{slug}` (super_admin JWT) — packages tenant metadata, theme, base64 logo, per-platform Firebase config (raw google-services.json / GoogleService-Info.plist), and derived `<slug>.<ROOT_DOMAIN>` host in one call.
- 4 new pytest cases in `tests/test_phase10_build_manifest.py` — auth guard, shape, unknown slug, ROOT_DOMAIN host derivation. All green.

**Build orchestrator (`/app/build_app.py` + `/app/build_system/`)**
- CLI: `--tenant <slug> --platform android|ios --version <x.y.z> --version-code <int> [--output apk|aab|prep]`.
- `manifest.py` — OTP-auths as super admin, fetches build manifest (Cloudflare-safe UA).
- `capacitor.py` — writes `capacitor.config.ts` (per-tenant appId, appName, primary color plugin config for SplashScreen/StatusBar/Keyboard), `package.json` with pinned Capacitor 7 deps + TypeScript, runs `yarn install` + `npx cap add <platform>`.
- `assets.py` — Pillow-based icon + splash generation: 5 Android densities × (launcher + round + foreground), adaptive-icon XML, values color, 2732×2732 splash into all `drawable-*` folders, iOS AppIcon.appiconset (18 sizes iPhone + iPad + marketing), 512×512 Play Store icon.
- `android.py` — patches `applicationId`, `versionName`, `versionCode` in `app/build.gradle`; applies google-services plugin + firebase-messaging BOM 33.3.0; sets `strings.xml` display name; injects release signing config from env; runs `./gradlew assembleDebug` (APK) or `bundleRelease` (AAB) when `ANDROID_HOME` is set; skips gracefully otherwise.
- `ios.py` — patches project.pbxproj (PRODUCT_BUNDLE_IDENTIFIER, MARKETING_VERSION, CURRENT_PROJECT_VERSION, DEVELOPMENT_TEAM), Info.plist (CFBundleDisplayName/Name/Version + UIBackgroundModes=remote-notification), writes App.entitlements (aps-environment=production). Prep-only (macOS finish required for `cap add ios`).

**Tenant isolation delivered**
- Separate `applicationId` / bundle ID per tenant → distinct OS entries + separate data sandbox.
- Per-tenant Firebase config → notifications routed independently, no cross-talk.
- Per-tenant name, logo (all resolutions), splash, theme baked into the binary.
- Web bundle same code, tenant chosen at runtime by subdomain resolver from `ROOT_DOMAIN`.

**Validated E2E on demo tenant** (Feb 11, 2026)
- `python3 build_app.py --tenant demo --platform android --version 1.0.0 --version-code 1 --output prep` — full success; project at `/app/dist/tenants/demo/` with correct `capacitor.config.ts`, patched `build.gradle` (`applicationId "in.localappstore.fieldcrm.demo"`, `versionCode 1`, `versionName "1.0.0"`), all 5 icon densities + adaptive XML + 512×512 marketing icon + 2732 splash across all `drawable-*` folders + tenant name in `strings.xml`. iOS prep path also validated (with expected macOS-only limitations logged as warnings).

**Docs**
- New `/app/documentation/build-system.md` — full CLI reference, env-var table, isolation guarantees, Mac finishing steps.
- `backend/.env.example` — added ANDROID_HOME, ANDROID_KEYSTORE_*, IOS_TEAM_ID, IOS_BUNDLE_PREFIX, BUILD_OUT_ROOT.


## Phase 10 (continued) — Legal Pages + Logo Preview (Feb 11, 2026)

**1. Tenant Logo Preview**
- `Tenants.jsx` now renders the uploaded tenant logo as a `<TenantLogo>` React component (state-driven fallback, no DOM manipulation).
- Uses `fileUrl(logo_path)` helper with `?auth=<jwt>` query param so `<img>` tags authenticate correctly.
- Verified in-browser: demo tenant "Akshara Agro" shows the actual logo (naturalWidth=1325). Tenants without a logo fall back to a coloured initial-letter block using `theme.primary`.

**2. Dynamic Legal Pages** (`/api/legal/*` + `LegalPage.jsx`)
- New `/app/backend/legal_defaults.py` — six platform-default templates (privacy, terms, refund, shipping, about, contact) baked into the code.
- `/api/public/legal/{kind}` now transparently falls back to the platform default when the tenant hasn't published its own doc. Response includes `is_platform_default: True` so the UI can show a banner.
- **Zero migration required** — every existing AND new tenant instantly has working legal pages the day they exist.
- Rewrote `Legal.jsx` with proper markdown rendering (new `/app/frontend/src/lib/markdown.js` — 130 LOC zero-deps parser: headings, bold, italic, links, lists, blockquotes, code blocks) + platform-default banner + back link + timestamp.
- Added `.legal-prose` styles in `index.css` for beautiful typography.

**3. All Tenants Supported**
- Marketing landing footer (`Landing.jsx`) now has legal links pointing to `/legal/{kind}` which resolve to platform defaults when there's no tenant context — no 404 anywhere.
- Existing tenants automatically inherit the platform default until their admin publishes a custom doc from Admin → Legal Documents. No migration script needed.

**4. Copy URL Buttons**
- `Tenants.jsx` card now shows BOTH `Copy Privacy URL` and `Copy Terms URL` buttons (previously only Privacy).
- Refactored to a `LEGAL_URL_KINDS` config array — easy to add Refund/Shipping/etc. in the future.
- Copy uses `navigator.clipboard.writeText` with a `document.execCommand("copy")` fallback for insecure-context browsers.

**Tests**: 8 new pytest cases in `test_phase10_legal_platform_defaults.py`. Full Phase-10 suite: **27 passed, 1 skipped**.

**Files touched**:
- Backend: `legal_defaults.py` (new), `server.py` (`/api/public/legal/{kind}` fallback logic).
- Frontend: `pages/Legal.jsx` (rewrite), `lib/markdown.js` (new), `index.css` (`.legal-prose` styles), `pages/SuperAdmin/Tenants.jsx` (logo + Copy Terms), `pages/Landing.jsx` (footer legal links).
