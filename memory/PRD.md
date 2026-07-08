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
