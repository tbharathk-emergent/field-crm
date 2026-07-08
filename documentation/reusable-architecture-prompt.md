# Reusable Architecture Prompt — Build a New App with the "FieldCRM-Pattern" Scaffolding

> **Purpose**: a copy-pasteable prompt you paste into the FIRST message of a
> **new** project (greenfield) so the agent scaffolds a production-grade,
> multi-tenant, App-Store-compliant SaaS from day one — regardless of the
> domain (Urban Clap, Grocery, Booking, LMS, Delivery, etc.).
>
> The business logic is entirely up to the new agent + your product brief.
> This prompt only fixes the **technical foundation** so every app you ship
> looks and behaves the same on the plumbing you always end up needing.
>
> **How to use**
> 1. Open the new project's very first chat.
> 2. Paste everything inside the fenced block below.
> 3. Fill the three placeholders at the top: `<APP_NAME>`, `<APP_DOMAIN>`,
>    `<PLATFORM_HOST>`. Leave the rest untouched.
> 4. The agent will produce a Phase-0 scaffold plan — approve it, then it
>    ships Phase 1 → 8 one PR at a time.
>
> **Companion**: this pairs with `19-retrofit-architecture-prompt.md` (for
> existing codebases). Both prompts converge on the same acceptance
> criteria.

---

## The Prompt

```text
You are building a NEW, greenfield SaaS application from scratch. The
business domain is:

    App name       : <APP_NAME>          e.g. "UrbanClap-lite", "GroceryKart"
    Business domain: <APP_DOMAIN>        e.g. "home services marketplace",
                                              "grocery delivery",
                                              "field force management",
                                              "learning management"
    Platform host  : <PLATFORM_HOST>     e.g. "urbanclap-lite.com"

Before you touch the domain-specific features, lay down the technical
foundation described below. This scaffolding is NON-NEGOTIABLE for any
app that wants to:
  • serve multiple tenants (B2B customers) from one deployment
  • ship to the App Store and Play Store without rejection
  • survive a security audit
  • be handed over to a new team without a 2-week ramp-up

═══════════════════════════════════════════════════════════════════════
 GOLDEN RULES — read before writing a single file
═══════════════════════════════════════════════════════════════════════

  1. Every route that returns business data MUST filter by `tenant_id`.
     No exceptions. If you catch yourself writing `find({...})` without
     a tenant filter, stop.
  2. Every URL, port, secret, credential comes from `.env`. Missing
     config must FAIL FAST at startup — never fall back to a hardcoded
     default value. Add `.env.example` with a one-line comment per var.
  3. Every user-facing schema field that a tenant might want to rename
     (dealer → distributor, farmer → retailer, order → booking, …)
     MUST be surfaced via a `tenant.labels` dict and rendered via a
     `getLabel(tenant, key, fallback)` helper. Never hardcode the noun.
  4. Every write endpoint that mutates a record MUST accept a
     `custom_data: dict` payload; every list endpoint MUST return it.
     Tenant admins add custom fields at runtime — you don't schema-
     migrate for every new field they need.
  5. Data migrations are IDEMPOTENT and run on startup. A single
     `seed.py` (or equivalent) checks-then-writes. Never rely on a
     one-off "run this once" script; production runs it every deploy.
  6. Every interactive DOM element and every user-facing status field
     carries a stable `data-testid` in kebab-case. Testing agents grep
     for these — no testids means no automation.
  7. Business logic lives in ROUTE HANDLERS or SERVICE FUNCTIONS, not
     in models. Models are for shape + validation.
  8. Frontend: exactly ONE React Context for cross-cutting state
     (user, tenant, permissions, features, custom fields cache).
     No prop-drilling of these five.
  9. If you need to add a new "industry-specific" module (e.g.
     "Crop Advisor" for an agri tenant, "AC Servicing" for a home-
     services tenant), gate it behind `tenant.features.<key>` and
     hide the menu + reject the API when the flag is off.
 10. Testids, custom-fields, tenant labels, feature flags — these four
     patterns are what makes a tenant onboarding go from "3 dev-weeks"
     to "one afternoon on the admin UI".

═══════════════════════════════════════════════════════════════════════
 PHASE 0 — SCAFFOLD (do this BEFORE any business feature)
═══════════════════════════════════════════════════════════════════════

Deliver a plan I can approve BEFORE Phase 1. Include:

  0.1  Chosen stack (recommended default below; deviate only with a
       one-line reason):

         Backend  : FastAPI (Python 3.11) + Motor + MongoDB
         Frontend : React 18 (CRA/Vite) + Tailwind + shadcn/ui +
                    react-router v6 + Sonner (toasts) + lucide-react
         Auth     : Phone OTP + JWT (short-lived, `token_rev` for
                    revocation)
         Mobile   : PWA first; wrap with Capacitor when needed
         Storage  : AWS S3 (or Cloudflare R2) — pre-signed uploads
         Push     : Firebase Cloud Messaging (per-tenant project)

  0.2  Folder layout (mirror this exactly — testers expect it):

         /app
           ├── backend/
           │    ├── server.py              (API entry — routes here)
           │    ├── models.py              (Pydantic schemas)
           │    ├── seed.py                (idempotent seed + migrate)
           │    ├── auth.py                (JWT, guards, dep injects)
           │    ├── storage_util.py        (S3 helpers)
           │    ├── push_util.py           (FCM helpers)
           │    ├── policies_util.py       (privacy/terms markdown)
           │    ├── requirements.txt
           │    ├── .env
           │    └── tests/
           │         └── test_*.py         (pytest, one file per phase)
           ├── frontend/
           │    ├── src/
           │    │    ├── App.js
           │    │    ├── context/AppContext.jsx
           │    │    ├── components/
           │    │    │    ├── ui/            (shadcn)
           │    │    │    ├── Layout/        (MobileShell,
           │    │    │    │                    MobileAdminShell,
           │    │    │    │                    AdminShell)
           │    │    │    └── CustomFieldsForm.jsx
           │    │    ├── context/            (AppContext)
           │    │    ├── lib/                (api.js, i18n.js,
           │    │    │                         offline.js, gpsTracker.js)
           │    │    └── pages/              (one folder per role)
           │    │         ├── SuperAdmin/
           │    │         ├── TenantAdmin/
           │    │         ├── Manager/
           │    │         ├── Employee/     (or Provider / Rider)
           │    │         └── Customer/     (end-user PWA)
           │    ├── package.json
           │    └── .env
           ├── documentation/
           │    ├── environment-variables.md
           │    ├── data-model.md
           │    ├── api-endpoints.md
           │    └── test-credentials.md
           └── memory/
                ├── PRD.md
                └── test_credentials.md

  0.3  Data-testid convention: kebab-case, describe the FUNCTION not
       the style. Examples:
         data-testid="login-form-submit-button"
         data-testid="add-dealer-btn"
         data-testid="kpi-outstanding"
       Every dialog, list row, form field, toast, KPI tile MUST have one.

  0.4  Ship each phase as its own commit with a green test suite.

═══════════════════════════════════════════════════════════════════════
 BLOCK A — MULTI-TENANCY (slug + subdomain, both supported)
═══════════════════════════════════════════════════════════════════════

A.1  Tenant document (Mongo collection `tenants`, or equivalent):

         tenants: {
           id, slug, name, business_type,
           logo_path, theme{primary,secondary,ink,bg,mute,line,error},
           labels{
             dealer, dealer_plural,
             customer, customer_plural,
             product, product_plural,
             ...                           # any noun tenant may rename
           },
           default_language, plan_id, plan_status, trial_ends_at,
           is_active, custom_domain?, contact_email, contact_phone,
           address,
           features: {                     # per-tenant industry modules
             crop_advisor: false,
             loyalty: false,
             ...
           },
           catalog_mode: "direct" | "enquiry_only",
           order_approval_flow: "direct" | "sales_exec" | "manager" | "admin",
           created_at, updated_at
         }

A.2  Every business collection has `tenant_id: str` as the FIRST
     non-id field. Create a compound index (tenant_id, ...) on every
     hot query path.

A.3  Frontend tenant resolution priority:
       1. Super-admin impersonation flag in localStorage
       2. Subdomain strip: hostname.endsWith("." + PLATFORM_HOST)
       3. Path prefix `/t/<slug>/…` (default — always works, incl.
          localhost / IP / preview URLs)
       4. `?tenant=<slug>` query string (fallback for embeds)
       5. `REACT_APP_DEFAULT_TENANT_SLUG` at build time
     Every API call carries `Authorization: Bearer <jwt>` — the JWT
     already contains `tid`; the header is not needed for auth. For
     super-admin impersonation, add `X-Tenant-Slug: <slug>`.

A.4  Backend tenant resolution:
       * Super admin token + X-Tenant-Slug present → impersonation
       * Else use `tid` claim from JWT
       * `require_tenant` dependency loads + caches the tenant doc
       * Invalidate the cache on any tenant-edit endpoint

A.5  Stale-tenant self-heal:
       On 404 from `GET /tenant/profile`: clear localStorage
       (`fc_tenant`, `fc_perms`, `fc_user`), set a one-shot guard
       flag, reload to the default slug.

A.6  Public URLs (both work, subdomain preferred once wildcard TLS
     is set):
         https://<slug>.<PLATFORM_HOST>            (branded)
         https://<PLATFORM_HOST>/t/<slug>          (fallback)
     Custom domain via `tenant.custom_domain` wins over both.

A.7  Required env vars:
       Backend  : MONGO_URL, DB_NAME, DEFAULT_TENANT_SLUG,
                  SUPER_ADMIN_PHONE, SUPER_ADMIN_OTP, JWT_SECRET,
                  DEMO_OTP
       Frontend : REACT_APP_BACKEND_URL, REACT_APP_PLATFORM_HOST,
                  REACT_APP_DEFAULT_TENANT_SLUG

═══════════════════════════════════════════════════════════════════════
 BLOCK B — CUSTOM FIELDS (tenant-defined, per-module)
═══════════════════════════════════════════════════════════════════════

B.1  A `custom_fields` collection lets a tenant admin add unlimited
     custom fields (text, textarea, number, date, dropdown, radio,
     checkbox) to any of the app's business modules — WITHOUT a code
     deploy.

         custom_fields: {
           id, tenant_id, module,          # e.g. dealer|customer|order|booking|
                                              product|enquiry|visit|…
           field_key,                      # snake_case unique per module
           label, type,                    # 7 supported types
           options[],                      # for dropdown|radio|checkbox
           required, order,
           placeholder, help_text,
           is_active, visible_to_customer, # hide fields from end-user
           created_at, updated_at
         }
     Unique index: (tenant_id, module, field_key).

B.2  Every business model gets `custom_data: Dict[str, Any] = {}`.
     Every create/patch endpoint accepts and persists it.

B.3  Frontend `<CustomFieldsForm module="dealer" data={form.custom_data}
     onChange={cd => setForm({...form, custom_data: cd})}/>` renders
     the inputs dynamically. It reads a CACHED list from AppContext —
     one API call at app-load, shared across every form.

B.4  Server-side validation: on any `/me/profile` or self-signup
     endpoint, iterate required visible_to_customer fields for the
     caller's module and 400 if empty.

B.5  Reactivate soft-deleted fields on POST when field_key collides,
     instead of erroring — keeps admin UX friction-free.

═══════════════════════════════════════════════════════════════════════
 BLOCK C — TENANT LABELS + THEME + BRANDING
═══════════════════════════════════════════════════════════════════════

C.1  Every user-facing noun that a tenant might want to rename lives
     in `tenant.labels`. The frontend NEVER hard-codes "Dealer" or
     "Customer" — it calls `getLabel(tenant, "dealer", "Dealer")`.

C.2  Theme colors (primary/secondary/ink/bg/mute/line/error) are
     applied at runtime as CSS variables in a `<style>` tag written
     on tenant load. Tailwind reads them via `theme.extend.colors`:

         primary: 'var(--brand-primary)'

     Result: instant re-skin per tenant with zero rebuilds.

C.3  Branding page (tenant admin only) lets admin:
       * Upload logo (S3 direct upload — see Block E)
       * Pick theme colors (5-6 named CSS variables)
       * Rename any noun in `labels`
       * Toggle `catalog_mode` (direct | enquiry_only)
       * Toggle `order_approval_flow`
       * Live preview panel on the right

═══════════════════════════════════════════════════════════════════════
 BLOCK D — ROLE-BASED PERMISSIONS + CUSTOM ROLES
═══════════════════════════════════════════════════════════════════════

D.1  Baseline roles (choose the ones you need, add the ones you don't):
       super_admin, tenant_admin, manager, employee, dealer, customer
     For a marketplace app you might have: provider, customer, admin.
     For LMS: instructor, student, admin. Keep names domain-specific.

D.2  Every route is gated with `require_roles("...", "...")` — a
     FastAPI/Express dependency that inspects the JWT.

D.3  Tenant admin can create CUSTOM ROLES via `/roles` CRUD. A role
     is a permission matrix:

         roles: {
           tenant_id, name, description,
           permissions: {
             visits:  {read, write},
             orders:  {read, write},
             products:{read, write},
             ...                             # one entry per module
           },
           is_default, is_active
         }

D.4  `GET /my-permissions` returns the effective permission dict for
     the caller (baseline defaults for the role, overlaid by their
     `role_id` if set). Frontend caches this and every menu / button
     hides itself when `can(module, "read"|"write") === false`.

D.5  Menu items in bottom-tab + More-drawer carry a `perm: "module"`
     field. `MobileAdminShell` filters items by `can()` at render.

═══════════════════════════════════════════════════════════════════════
 BLOCK E — AWS S3 / R2 STORAGE (pre-signed direct uploads)
═══════════════════════════════════════════════════════════════════════

E.1  Env vars:
       AWS_REGION, AWS_BUCKET_NAME, AWS_ACCESS_KEY_ID,
       AWS_SECRET_ACCESS_KEY, AWS_PUBLIC_MEDIA_HOST (optional CDN),
       AWS_S3_ENDPOINT (only for Cloudflare R2 / MinIO)

E.2  `storage_util.py`:
       presign_upload(prefix, content_type) → {url, public_url}
       upload_bytes(key, content_type, data) → public_url
       download(key) → bytes

E.3  Direct-upload pattern (backend stays stateless on file bytes):
       POST /api/uploads/presign        → returns {url, public_url}
       PUT  <url>  (from browser)       → actual bytes upload to S3
       Save `public_url` on your model.

E.4  Multipart fallback for legacy proxy environments:
       POST /api/upload                 → server accepts multipart,
                                          forwards to S3, returns url

E.5  Database backups (super-admin convenience):
       POST   /api/super/backups        → mongodump → zip → S3
       GET    /api/super/backups        → list with download URLs
       DELETE /api/super/backups/{id}

E.6  For dev with no S3 credentials: implement `storage_util` with a
     local disk fallback keyed on `STORAGE_MODE=local|s3` env var so
     the app runs on a laptop with no cloud account.

═══════════════════════════════════════════════════════════════════════
 BLOCK F — PUSH NOTIFICATIONS (Firebase, per-tenant)
═══════════════════════════════════════════════════════════════════════

Skip this block if the app has no mobile / PWA front-end.

F.1  One Firebase project per tenant. Firebase caps at 30 apps per
     project; use a `firebase_shards` collection to allocate up to
     ~7 tenants per shard (2 platforms × 3 role-apps = 6 apps/tenant
     with a little headroom).

F.2  New collections:
       firebase_shards       {id, project_id, service_account_json,
                              tenants_bound_count}
       fcm_tokens            {id, tenant_id, user_id, role, token,
                              platform, last_seen}
       push_broadcast_events {id, tenant_id, title, body, data,
                              targets, sent_count, failure_count,
                              created_at}

F.3  Endpoints:
       POST   /api/super/firebase/shards
       POST   /api/super/tenants/{id}/firebase/provision
       GET    /api/super/tenants/{id}/firebase/build-config
       POST   /api/push/fcm/token           # register
       DELETE /api/push/fcm/token/{token}   # unregister
       POST   /api/push/test                # dev-only

F.4  Helper: `send_push(tenant_id, user_id, role, title, body, data)`.
     Bulk variant `send_push_bulk` for broadcast events.

F.5  Daily cron cleans UNREGISTERED tokens from `fcm_tokens`.

F.6  Trigger push automatically on: new order, order approval,
     seasonal alert publish, chat message, delivery status change,
     custom announcement. Wire these one-by-one alongside the
     business features.

═══════════════════════════════════════════════════════════════════════
 BLOCK G — ACCOUNT SOFT-DELETE (App Store + Play Store requirement)
═══════════════════════════════════════════════════════════════════════

G.1  Endpoint:
       POST /api/auth/me/delete   {otp}
            * OTP-gated (re-verify caller's mobile / email)
            * Role-specific guards: REFUSE with 409 if:
                - outstanding balance / owed money
                - pending payouts
                - in-progress bookings / orders / jobs
                - active subscription that must be cancelled first
              Return a human-readable `detail` explaining why.
            * On success:
                - set `status="DELETED"` (or `is_active=false` +
                  `deleted_at=<now>`)
                - scrub PII: mobile→"deleted_<id>", email→null,
                  name→"Deleted User", address/dob/govt-id → null
                - increment `user.token_rev` — any cached JWT fails
                  on next request
                - keep the row for audit / regulatory retention

G.2  Nightly job hard-deletes rows older than 90 days (or your
     tenant's retention policy).

G.3  UI surfaces — Profile menu MUST show, in this order:
       • Privacy Policy
       • Terms & Conditions
       • Delete Account            (data-testid="delete-account-btn")
       • Logout
     Delete Account MUST NOT be more than 1 click deep. Apple
     reviewers specifically look for it.

═══════════════════════════════════════════════════════════════════════
 BLOCK H — PRIVACY POLICY + TERMS & CONDITIONS (+ Returns / Shipping)
═══════════════════════════════════════════════════════════════════════

H.1  `policies` collection:
       {tenant_id, kind, markdown, updated_at, updated_by}
       kind ∈ {"privacy","terms","returns","shipping","support_contact"}

H.2  Endpoints:
       GET   /api/policies/{tenant_slug}/{kind}   # public, no auth
       PATCH /api/admin/policies/{kind}            # tenant admin

H.3  Frontend hosted route `/legal/{kind}` renders the markdown for
     the CURRENT tenant. Apple/Google reviewers fetch these
     server-side during review — MUST return HTTP 200 without a login.

H.4  Seed defaults on first boot: writes generic Privacy + T&C
     markdown for the first tenant; new tenants inherit those
     defaults on creation and can override per tenant.

H.5  App Store Connect: paste
       https://<slug>.<PLATFORM_HOST>/legal/privacy
     into the "Privacy Policy URL" field of every submission.

═══════════════════════════════════════════════════════════════════════
 BLOCK I — TEST USERS (bypass mobiles + universal reviewer)
═══════════════════════════════════════════════════════════════════════

I.1  Env-driven bypass mobiles:
       DEMO_BYPASS_MOBILES_JSON='["9000000111","9000000222"]'
       or fixed per-mobile OTPs:
       DEMO_BYPASS_MOBILES_JSON='{"9000000111":"654321"}'

     OTP-verify accepts the fixed OTP without calling the SMS
     provider. Used for local dev, CI, stakeholder demos.

I.2  Universal reviewer mobile:
       UNIVERSAL_REVIEWER_MOBILE=9898989898
       UNIVERSAL_REVIEWER_OTP=123456

     Pre-seeded as EVERY role in EVERY tenant. Document this in the
     App Store "Test account" field.

I.3  `/api/public/demo-credentials` endpoint returns the seed test
     users so the login screen renders one-click quick-login chips.
     Filter this endpoint OFF in prod via `EXPOSE_DEMO_CHIPS=false`.

I.4  Keep `/app/memory/test_credentials.md` current with every auth
     change. Testing agents read this file.

═══════════════════════════════════════════════════════════════════════
 BLOCK J — ENVIRONMENT-VARIABLE DISCIPLINE
═══════════════════════════════════════════════════════════════════════

J.1  Every URL, port, secret, credential MUST come from `.env`.
     Fail fast on missing config — no code-level fallbacks like
     `os.getenv("X", "http://localhost:8001")`.

J.2  `.env.example` lists every var with a one-line comment. Real
     `.env` stays gitignored.

J.3  Protected env keys that MUST NOT be renamed by the agent:
       MONGO_URL, DB_NAME (backend) — DB access
       REACT_APP_BACKEND_URL (frontend) — public API base
     These are pre-configured by the deployment platform.

J.4  Document every env var in `documentation/environment-variables.md`.
     Group by purpose (auth, storage, push, tenant, feature flags).

═══════════════════════════════════════════════════════════════════════
 BLOCK K — iOS SAFE-AREA + CORS (web / PWA only)
═══════════════════════════════════════════════════════════════════════

Skip if the app has no web front-end.

K.1  ONE global CSS rule handles iOS Safe Area for every sticky /
     fixed element (equivalent to Flutter's SafeArea):

         html.capacitor-ios .sticky.top-0,
         html.capacitor-ios .fixed.top-0 {
           top: env(safe-area-inset-top, 0px) !important;
         }
         html.capacitor-ios .fixed.inset-0 > * {
           padding-top: max(env(safe-area-inset-top, 0px), 0px);
         }
         html.capacitor-ios .fixed.bottom-0:not([data-skip-safe-area]),
         html.capacitor-ios .sticky.bottom-0:not([data-skip-safe-area]) {
           padding-bottom: max(env(safe-area-inset-bottom, 0px), 0px);
         }

K.2  CORS is set by the BACKEND ONLY. If nginx / ingress is in
     front of the backend, it MUST NOT add CORS headers (duplicates
     break browsers). Use `allow_origin_regex=".*"` with
     `allow_credentials=true`.

K.3  Toast offset for iOS: `offset="calc(env(safe-area-inset-top, 0px) + 16px)"`.

═══════════════════════════════════════════════════════════════════════
 BLOCK L — OFFLINE-FIRST + IDEMPOTENT SEED
═══════════════════════════════════════════════════════════════════════

L.1  For any app whose primary users are field-facing (delivery,
     home-service technician, salesperson, farmer, medical rep):
       * Every mutating form uses `postOrQueue(api, url, payload,
         kind)` from `lib/offline.js`. It POSTs when online, queues
         in IndexedDB when offline.
       * `POST /api/offline/sync` batches queued actions on
         reconnect. Idempotency via client-generated UUIDs.
       * A visible "Offline — 3 items queued" pill shows in the top
         bar when queue is non-empty.

L.2  `seed.py` runs on every server startup:
       * Uses `_safe_insert()` — never crashes on duplicate keys
       * Runs an idempotent migration block for legacy data (e.g.
         "promote role='customer' with dealer_code to role='dealer'")
       * Seeds test users, default roles, default policies
       * Enables demo features on the demo tenant

L.3  Unique indexes on hot paths PREVENT the race condition when
     multiple workers boot simultaneously:
       users        : (tenant_id, phone, role)
       custom_fields: (tenant_id, module, field_key)
       attendance   : (tenant_id, user_id, date)

═══════════════════════════════════════════════════════════════════════
 BLOCK M — SUPER ADMIN CONSOLE
═══════════════════════════════════════════════════════════════════════

M.1  Super admin bypasses tenant_id filtering. Its JWT has `tid=null`
     and `role="super_admin"`. Every super endpoint lives under
     `/api/super/…` and requires this role.

M.2  Super admin can:
       * CRUD tenants, plans, platform settings
       * Toggle per-tenant features:
             PATCH /api/super/tenants/{id}/features
                   {features: {crop_advisor: true, loyalty: false}}
       * Impersonate a tenant via `X-Tenant-Slug` header
       * Run + download DB backups (Block E.5)
       * Provision Firebase per tenant (Block F.3)

M.3  UI: `/super-admin` route with tenants list, plans, settings,
     features toggle chip on each tenant card.

═══════════════════════════════════════════════════════════════════════
 BLOCK N — TESTING DISCIPLINE
═══════════════════════════════════════════════════════════════════════

N.1  Every phase ships with `/app/backend/tests/test_phase<n>_<name>.py`
     containing pytest cases for every endpoint added in that phase.

N.2  Frontend: every dialog, list row, form field, KPI tile has a
     stable `data-testid` in kebab-case. Testing agents grep for
     these — a missing testid is a MISSED test, not just a lint miss.

N.3  Manual smoke test after each phase:
       * Sanity screenshot at the tenant landing page
       * `curl` the new endpoints with a real token
       * Then hand off to the automated testing agent — never test
         complex flows by hand + screenshots.

═══════════════════════════════════════════════════════════════════════
 EXECUTION PLAN
═══════════════════════════════════════════════════════════════════════

Phase 0  — Scaffold plan + folder structure          ← await approval
Phase 1  — Block J (env discipline) + Block A step 1 (tenant model)
Phase 2  — Block A complete (multi-tenancy + slug/subdomain routing)
Phase 3  — Auth (phone OTP + JWT) + Block D (roles + permissions)
Phase 4  — Block C (labels + theme) + Block M (super-admin console)
Phase 5  — Business features (domain-specific — from your product brief)
Phase 6  — Block B (custom fields) + Block E (S3 direct upload)
Phase 7  — Block H (privacy/T&C) + Block G (soft-delete) + Block I
           (test users)
Phase 8  — Block F (push notifications) + Block L (offline-first)
Phase 9  — Block K (iOS safe-area + CORS) + regression sweep
Phase 10 — Documentation pass + deployment readiness check

Ship one PR per phase. Do NOT batch phases.

═══════════════════════════════════════════════════════════════════════
 ACCEPTANCE CRITERIA (you are done when ALL of these are true)
═══════════════════════════════════════════════════════════════════════

  ☐ Fresh boot creates the demo tenant automatically (seed.py).
  ☐ A new tenant can be created in <60s from the Super Admin console
    and its storefront works at
    https://<slug>.<PLATFORM_HOST>  AND  /t/<slug>/…  immediately.
  ☐ Every API endpoint that returns business data filters by
    tenant_id; super-admin can impersonate any tenant via header.
  ☐ Tenant admin can add custom fields (7 types) to any module
    without a code deploy; the fields appear in every relevant form.
  ☐ Tenant admin can rename any user-facing noun via Branding page;
    the change is reflected everywhere.
  ☐ Users can sign up, request OTP, log in, and delete their account
    via Profile → Delete Account → OTP confirm. Deleted rows are
    PII-scrubbed and sessions revoked.
  ☐ Profile menu shows Privacy Policy, T&C, Delete Account, Logout
    in that order in every role app.
  ☐ Tenant admin can edit Privacy + T&C markdown at /admin/policies;
    public GET /policies/{slug}/{kind} returns HTTP 200 without auth.
  ☐ Bypass mobiles + universal reviewer mobile both work — env-
    controlled, empty by default in prod.
  ☐ S3 pre-signed uploads work from the browser; no file bytes pass
    through the backend on the happy path.
  ☐ Super Admin can toggle per-tenant features (industry modules)
    and the toggle immediately hides / rejects the corresponding
    routes for that tenant's users.
  ☐ Push notifications deliver to a tenant-scoped device token via
    the tenant's own Firebase project (if mobile present).
  ☐ Offline queue survives an app crash and syncs on reconnect
    (if the app has field-facing users).
  ☐ Zero hard-coded secrets / URLs / ports remain in the codebase.
  ☐ iOS PWA respects the notch on every sticky / fixed element.
  ☐ `documentation/` folder has entries for every endpoint, env var,
    collection, feature flag, and role.
  ☐ `/app/memory/test_credentials.md` is current with every seeded
    account (super admin + tenant admin + each role in demo tenant).
  ☐ Full test suite green: `pytest backend/tests/` + testing-agent
    frontend flows for the domain-specific features.

═══════════════════════════════════════════════════════════════════════
 NON-GOALS (do NOT do these from this prompt)
═══════════════════════════════════════════════════════════════════════

  * Do NOT introduce a second auth system — one OTP+JWT is enough.
  * Do NOT add domain features not on the product brief.
  * Do NOT invent industry modules — those are toggled via
    `tenant.features` when they're actually built.
  * Do NOT skip the discovery + plan step. First message = plan.
    Second message onward = code.

If anything is ambiguous, STOP and ask before writing code.
```

---

## What each `<PLACEHOLDER>` should look like

| Placeholder | Real-world examples |
|---|---|
| `<APP_NAME>` | "UrbanClap-lite", "GroceryKart", "MediRep-CRM", "FieldCRM" |
| `<APP_DOMAIN>` | "home-services marketplace", "grocery delivery", "medical-rep field force", "field-service CRM" |
| `<PLATFORM_HOST>` | "urbanclap-lite.com", "grocery-kart.app", "medirep.co" — DO NOT include `https://` or a trailing slash |

## Why the phases are in this order

1. **Env discipline first** so no secret ever ends up in git.
2. **Multi-tenancy foundation** before ANY business model — every
   business table gets `tenant_id` from day one.
3. **Auth + roles + super-admin console** before business features —
   because Phase 5's business endpoints need `require_roles` guards.
4. **Custom fields + S3** are parallelisable and both are prerequisites
   for real-world onboarding.
5. **Privacy / T&C / soft-delete / test users** are the App Store
   compliance bundle — ship them together before the first submission.
6. **Push + offline + iOS safe-area** are the mobile-only concerns —
   ship them last so the app is fully functional on web first.

## What to do when a section doesn't apply

Every block carries an explicit "Skip if…" clause. In particular:

* No mobile / PWA front-end → skip Block F (push) + Block K (safe-area)
* No S3 credentials in dev → use `STORAGE_MODE=local` fallback in E.6
* No offline requirement (all users are desk-based) → skip Block L
* Existing OTP / magic-link auth → extend in Block I, don't duplicate

## Companion documents to keep updated

- `documentation/environment-variables.md` — canonical env-var list
- `documentation/data-model.md` — every collection + its indexes
- `documentation/api-endpoints.md` — every route + role + testids
- `memory/PRD.md` — product requirements + what's shipped + backlog
- `memory/test_credentials.md` — every test account + OTP + role

## Diff vs the retrofit prompt (`19-…`)

| Aspect | `19-` (retrofit) | This (`greenfield`) |
|---|---|---|
| Project state | Existing codebase | Brand new |
| Golden rule #1 | "Do NOT change business logic" | "Business logic follows product brief" |
| Placeholders | None — discovery-first | 3 (app name, domain, host) |
| Phase 0 | Discovery report | Scaffold plan |
| Tech stack | Whatever exists | FastAPI + React + Mongo default |
| Schema changes | Additive only | Green-field, but still idempotent |
| Auth | Extend existing | Build phone-OTP + JWT from scratch |
| Business features | Explicitly out of scope | Explicitly ordered as Phase 5 |
| Blocks | A–H | A–N (extra: custom fields, labels, roles, super-admin, offline, testing) |
