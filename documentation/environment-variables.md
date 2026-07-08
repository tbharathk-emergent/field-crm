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
