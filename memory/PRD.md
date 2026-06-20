# FieldCRM SaaS — Product Requirements (PRD)

## Original Problem Statement
Build a multi-tenant, multi-whitelabel SaaS Field Force Management platform for agricultural businesses, FMCG, pharma, manufacturing, service companies. Includes Super Admin, Tenant Admin, Manager, Employee mobile PWA, and Customer/Dealer PWA. Phone+OTP login (SMS default, WhatsApp option). Mock OTPs for MVP. Super Admin phone `9858558555` with OTP `557725`. Demo OTP `123456`. Each tenant has own branding, configurable labels (Farmer/Customer/Patient etc.), and own URL `/t/tenantname`. Mobile-first PWA, multilingual i18n for rural users (en, hi, te, ta, kn, mr).

## User Choices (gathered)
1. OTP: Mock for now (Pingbix details later)
2. Maps: OpenStreetMap (Leaflet); placeholder for Google Maps API at tenant level
3. Storage: Emergent Object Storage; placeholder for AWS S3 at Super Admin level
4. Scope: MVP focused on full breadth of features; offline sync & push deferred
5. Design: Simple navigation, multilingual support

## Architecture
- **Backend**: FastAPI + MongoDB (motor). Tenant-scoped collections (all docs carry `tenant_id`).
- **Frontend**: React 19 + react-router-dom v7 + Tailwind + shadcn/ui + recharts + react-leaflet.
- **Auth**: Phone+OTP with JWT (HS256, 168h). Mock OTP via backend (visible on screen for MVP).
- **Storage**: Emergent Object Storage via `storage_util.py`; soft-delete via DB flag.
- **Tenant Resolution**: `X-Tenant-Slug` header (set after login); URL pattern `/t/:slug/...`
- **White-label**: CSS variables `--brand-primary`, `--brand-secondary` injected at runtime from tenant.theme. Configurable labels resolved via `getLabel(tenant, key)`.
- **i18n**: 6 languages (en, hi, te, ta, kn, mr) via JSON dictionaries in `lib/i18n.js`. Switcher in every shell.

## What's Implemented (Phase 1 — Feb 2026)
### Backend (`/app/backend/`)
- Models: Tenant, Plan, User (multi-role), Attendance, LocationPing, Visit, SalesEntry, CollectionEntry, DCR, Enquiry, Product, Order, Notification, FileRecord, PlatformSettings
- Routes: `/api/auth/*` (request-otp, verify-otp, me), `/api/public/*` (tenant lookup, demo creds), `/api/super/*` (tenants CRUD, plans CRUD, settings, analytics), `/api/tenant/*` (profile, users, products), `/api/employee/*` (checkin, checkout, location, attendance/today), `/api/visits`, `/api/sales`, `/api/collections`, `/api/dcr`, `/api/enquiries`, `/api/orders`, `/api/notifications`, `/api/files/upload`, `/api/files/view`, `/api/export/{resource}`, `/api/import/{resource}`, `/api/analytics/tenant`, `/api/locations`
- Seed: 4 plans, 1 demo tenant (Akshara Agro), super admin, 4 tenant users, 5 products
- Storage init at startup
- Excel/CSV import & export via pandas

### Frontend (`/app/frontend/src/`)
- **Landing** (`/`): Brand hero, tenant slug entry, demo shortcuts
- **Login** (`/login`, `/t/:slug`): Phone+OTP with role tabs (Staff/Customer), super admin auto-detect, mock OTP display, demo login chips, channel toggle (SMS/WhatsApp), language switcher, resend timer
- **Super Admin**: Dashboard with KPIs, Tenants grid+CRUD+modal, Plans CRUD, Settings (S3+SMS placeholders)
- **Tenant Admin**: Dashboard with 12 KPIs + 7-day sales trend + top employees, Branding editor (logo upload, color pickers, label config, live preview), Employees CRUD with manager assignment, Dealers CRUD with employee assignment, Products grid CRUD, Orders status workflow, Enquiries with assign/status, Reports (Excel/CSV export), Announcements
- **Manager**: Dashboard, Team list, OpenStreetMap GPS view, Reports
- **Employee PWA** (mobile, white-labeled): Tetris home with 9 cards + dominant Check-in/out, Dealers list with GPS+call, Visit/Collection/Sales/DCR forms, Customer Enquiry, Catalogue, Notifications, Profile
- **Customer/Dealer PWA** (mobile, white-labeled): Home with KPI cards + recent orders, Catalogue with add-to-cart, Cart with quantity controls, Orders with status timeline colors, Account with outstanding/credit + raise enquiry
- Multi-language i18n with 6 languages
- Runtime tenant theming via CSS vars
- Toaster notifications

## Backlog (P1 — Phase 2)
- **P0**: Offline sync (IndexedDB) for entries, Pingbix SMS integration (real OTPs), Push notifications (web push)
- **P1**: Selfie capture during check-in, Audit logs for important actions, Period/Year filters on reports, Bulk import preview/error UI, Photo upload UI for visits/enquiries/collections/receipts, Product image upload
- **P2**: GPS background polling, Razorpay payments, Tally integration, Distributor network/hierarchy, Loyalty/incentives, Map route polylines with distance calc, Per-tenant subdomain wildcard routing, PWA manifest per tenant (dynamic icon/splash)

## Personas
1. **Super Admin** (FieldCRM ops) — tenants, billing, platform settings
2. **Tenant Admin** (business owner) — branding, employees, dealers, products, reports
3. **Manager** — team supervisor, GPS, performance, reports
4. **Field Employee** — daily check-in, visits, sales, collections, DCR, enquiries
5. **Customer/Dealer** — browse catalogue, place orders, view outstanding, raise enquiries
