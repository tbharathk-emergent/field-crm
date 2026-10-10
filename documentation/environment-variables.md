# Environment Variables Reference

This document catalogs every environment variable used by the FieldCRM SaaS backend and frontend. Both apps **fail fast** at startup if a REQUIRED variable is missing — no silent fallbacks.

> **Golden Rule:** Never hard-code secrets. Never commit `.env`. Copy `.env.example` → `.env` and fill in the values.

---

## Backend (`/app/backend/.env`)

### Required — Core

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGO_URL` | MongoDB connection string. | `mongodb://localhost:27017` |
| `DB_NAME` | Mongo database name. | `fieldcrm_db` |
| `JWT_SECRET` | HMAC secret used to sign JWTs. **Must be long & random in prod.** | 32+ char random string |
| `JWT_ALGO` | JWT signing algorithm. | `HS256` |
| `JWT_TTL_HOURS` | Token time-to-live in hours. | `168` |
| `CORS_ORIGINS` | Comma-separated allowed origins, or `*`. | `*` |
| `APP_NAME` | Internal app identifier. | `fieldcrm` |
| `SUPER_ADMIN_PHONE` | Bootstrap phone for the platform super admin. | `9858558555` |
| `SUPER_ADMIN_OTP` | Bootstrap OTP for super admin login. | `557725` |
| `DEMO_OTP` | Universal demo/reviewer OTP (used by the reviewer number `9898989898` in Phase 4). | `123456` |

### Optional — LLM

| Variable | Description |
|----------|-------------|
| `EMERGENT_LLM_KEY` | Emergent universal LLM key (Claude/GPT/Gemini). Powers Crop Advisor AI features. |

### Planned — Phase 3 — AWS S3 Direct Uploads

| Variable | Description |
|----------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user key with `PutObject` on the bucket. |
| `AWS_SECRET_ACCESS_KEY` | IAM secret. |
| `AWS_REGION` | Bucket region (e.g. `ap-south-1`). |
| `AWS_S3_BUCKET` | Bucket name. |
| `AWS_S3_PRESIGN_TTL_SECONDS` | Lifespan of a presigned PUT URL. Default `900`. |

If any S3 var is unset, `POST /api/uploads/presign` returns **503** with a clear message; the rest of the app continues to run.

> S3 credentials (including `AWS_PUBLIC_MEDIA_HOST` and the presign TTL) can
> also be entered at runtime via **Super Admin → Cloud** — they are stored in
> Mongo (`platform_settings.aws_credentials`), hot-applied without a restart,
> reloaded at startup, and take precedence over the env values. The secret key
> is only ever returned masked.

### SMS / OTP — Pingbix

All optional. Without them (or with `SMS_PROVIDER=mock`), OTP stays in mock
mode: the fixed `DEMO_OTP` / `SUPER_ADMIN_OTP` values are shown on screen, so
local development never needs live SMS credentials. The super admin phone and
the reviewer phone (`9898989898`) always use their fixed OTPs even when
Pingbix is active.

| Variable | Description |
|----------|-------------|
| `SMS_PROVIDER` | `mock` (default) or `pingbix`. Can be overridden at runtime via Super Admin → Settings. |
| `PINGBIX_BASE_URL` | Full send-SMS endpoint URL from the Pingbix integration sheet. |
| `PINGBIX_API_KEY` | Pingbix API key (runtime override: Super Admin → Settings → API Key). |
| `PINGBIX_SENDER_ID` | 6-char DLT-approved sender id (runtime override: Settings → Sender ID). |
| `PINGBIX_ENTITY_ID` | DLT principal entity id (optional, appended to the payload). |
| `PINGBIX_TEMPLATE_ID` | DLT content template id (optional, appended to the payload). |
| `PINGBIX_OTP_TEMPLATE` | Message text; `{otp}` and `{app}` are substituted. Must match the registered DLT template. |
| `PINGBIX_TIMEOUT_SECONDS` | Gateway HTTP timeout. Default `10`. |

When Pingbix is active, OTPs are random 6-digit codes stored HMAC-hashed in
the `otp_codes` collection with a 5-minute expiry, 30-second resend cooldown,
5 verify attempts, and single-use semantics. If `SMS_PROVIDER=pingbix` but the
`PINGBIX_*` config is incomplete, the backend logs a warning and falls back to
mock so login never breaks.

### Planned — Phase 5 — Firebase Cloud Messaging (Sharded)

Each shard holds up to 15 tenants. Increment as tenant count grows.

| Variable | Description |
|----------|-------------|
| `FCM_SHARD_1_CREDENTIALS_JSON` | Full service-account JSON on one line for shard 1. |
| `FCM_SHARD_1_PROJECT_ID` | Firebase project ID for shard 1. |
| `FCM_SHARD_2_CREDENTIALS_JSON` | (Add when tenant #16 is onboarded.) |
| `FCM_SHARD_2_PROJECT_ID` | … |

### Planned — Phase 2 — Subdomain Routing

| Variable | Description |
|----------|-------------|
| `ROOT_DOMAIN` | Root domain for subdomain-to-slug resolution. `<slug>.<ROOT_DOMAIN>` → tenant. |
| `TENANT_CACHE_TTL_SECONDS` | In-memory tenant resolution cache TTL. Default `300`. |

---

## Frontend (`/app/frontend/.env`)

All frontend env vars **must** be prefixed with `REACT_APP_` (Create React App requirement).

### Required

| Variable | Description |
|----------|-------------|
| `REACT_APP_BACKEND_URL` | Full backend base URL (no trailing slash). Never hard-code. |
| `WDS_SOCKET_PORT` | Dev server socket port (Emergent preview requirement). Value: `443`. |
| `ENABLE_HEALTH_CHECK` | Toggle for internal health widget. Default `false`. |

### Planned — Phase 5 — FCM Web Push

| Variable | Description |
|----------|-------------|
| `REACT_APP_FCM_API_KEY` | Firebase web SDK API key. |
| `REACT_APP_FCM_AUTH_DOMAIN` | e.g. `<project>.firebaseapp.com`. |
| `REACT_APP_FCM_PROJECT_ID` | Firebase project ID. |
| `REACT_APP_FCM_APP_ID` | Firebase App ID. |
| `REACT_APP_FCM_MESSAGING_SENDER_ID` | FCM sender ID. |
| `REACT_APP_FCM_VAPID_KEY` | Web push VAPID public key. |

### Planned — Phase 2 — Subdomain Routing

| Variable | Description |
|----------|-------------|
| `REACT_APP_ROOT_DOMAIN` | Root domain used by the client-side tenant self-heal logic. |

---

## Fail-Fast Behaviour

On import, `/app/backend/server.py` runs `require_env([...])` and aborts the process with a clear message if any REQUIRED variable is unset or blank. This guarantees:

1. Broken containers crash immediately instead of serving traffic with defaults.
2. Kubernetes / Supervisor surfaces the misconfiguration in logs on first boot.
3. No hidden dev-secret fallbacks in production.

## Rotation & Secrets Hygiene

- Rotate `JWT_SECRET` at least annually or after any suspected leak. Rotating invalidates all live sessions (intended).
- Rotate AWS IAM keys quarterly.
- Store production `.env` in a secrets manager (AWS Secrets Manager / Doppler / 1Password), not the repository.
