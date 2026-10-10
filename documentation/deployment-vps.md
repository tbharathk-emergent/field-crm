# VPS deployment — systemd + nginx (Ubuntu/Debian)

Production runbook for a classic VPS: MongoDB + FastAPI (uvicorn under
systemd) + nginx serving the built React bundle and proxying `/api`.
Mirrors the Dentor deployment style, with FieldCRM-specific differences
called out.

**FieldCRM-specific — do not skip:**
1. **Frontend uses yarn, never npm** (`package.json` has a `resolutions`
   block npm ignores; `npm ci` produces a broken dev-server pin).
2. `REACT_APP_BACKEND_URL` is baked into the bundle **at build time**. Set it
   in `frontend/.env` *before* `yarn build`. For a same-origin deploy behind
   nginx you may leave it empty (requests go to relative `/api`).
3. nginx must forward `Host`/`X-Forwarded-Host`, and uvicorn needs
   `--proxy-headers` — white-label tenant resolution (`<slug>.<ROOT_DOMAIN>`,
   custom domains) and `/public/legal/*` depend on the original Host header.
4. `client_max_body_size` must be raised or `POST /api/files/upload` dies at
   nginx's 1 MB default.
5. Keep **one** uvicorn worker (startup seed + in-process credential caches
   are designed for a single worker).

---

## 0. Prerequisites (once per server)

```bash
# MongoDB 7 (or managed Atlas — then skip this and set MONGO_URL accordingly)
sudo apt-get install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl enable --now mongod

# Python 3.11+, Node 18+, yarn
sudo apt-get install -y python3-venv python3-pip nginx
corepack enable || sudo npm i -g yarn   # yarn 1.x
```

## 1. Clone + backend

```bash
cd /var/www/
git clone <YOUR_FIELDCRM_REMOTE_URL> fieldcrm
cd fieldcrm/backend/

python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -c "import fastapi, uvicorn, motor; print('dependencies OK')"

cp .env.example .env
vim .env
# REQUIRED: MONGO_URL, DB_NAME, JWT_SECRET (openssl rand -hex 32), JWT_ALGO,
#           JWT_TTL_HOURS, CORS_ORIGINS (your domain), APP_NAME,
#           SUPER_ADMIN_PHONE, SUPER_ADMIN_OTP, DEMO_OTP (=123456, reviewer!)
# Production SMS: SMS_PROVIDER=pingbix + PINGBIX_* block
# White-label subdomains: ROOT_DOMAIN=fieldcrm.example.com

# Manual test run (reads .env automatically; Ctrl+C after "Application startup complete")
/var/www/fieldcrm/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
```

> Note the module is `server:app` (not `app.main:app`) and the server
> fail-fasts with a clear message if any REQUIRED env var is missing.

## 2. Frontend (yarn — NOT npm)

```bash
cd /var/www/fieldcrm/frontend/
cp .env.example .env
vim .env    # REACT_APP_BACKEND_URL=https://fieldcrm.example.com  (or empty for same-origin)
yarn install --frozen-lockfile
yarn build          # → /var/www/fieldcrm/frontend/build
```

## 3. systemd unit

`sudo nano /etc/systemd/system/fieldcrm-api.service`:

```ini
[Unit]
Description=FieldCRM FastAPI backend
After=network.target mongod.service
Wants=mongod.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/fieldcrm/backend
ExecStart=/var/www/fieldcrm/backend/venv/bin/uvicorn server:app \
  --host 127.0.0.1 --port 8001 --workers 1 \
  --proxy-headers --forwarded-allow-ips 127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /var/www/fieldcrm
sudo systemctl daemon-reload
sudo systemctl enable fieldcrm-api.service
sudo systemctl start fieldcrm-api.service
sudo systemctl status fieldcrm-api.service
curl -s http://127.0.0.1:8001/api/health      # → {"ok":true,...}
```

## 4. nginx

`sudo nano /etc/nginx/sites-available/fieldcrm`:

```nginx
server {
    listen 80;
    # Wildcard covers white-label tenant subdomains (<slug>.fieldcrm.example.com).
    # Add tenant custom domains here too (or make this the default_server).
    server_name fieldcrm.example.com *.fieldcrm.example.com;

    root /var/www/fieldcrm/frontend/build;
    index index.html;

    # Excel import + file uploads exceed nginx's 1m default
    client_max_body_size 25m;

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;                 # tenant resolution needs this
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;                     # Excel export/import
    }

    # SPA fallback — react-router handles /t/:slug/... client-side
    location / {
        try_files $uri /index.html;
    }

    location /static/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/fieldcrm /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
curl -s http://127.0.0.1/api/health
# TLS (also covers the subdomain wildcard if you use DNS challenge):
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d fieldcrm.example.com
```

## 5. Smoke test

```bash
D=https://fieldcrm.example.com
curl -s $D/api/health
curl -s $D/api/public/tenants/by-slug/demo | head -c 200; echo
curl -s $D/api/public/tenant-resolve?host=demo.fieldcrm.example.com
curl -s $D/api/public/legal/privacy | head -c 200; echo
curl -s $D/ | grep -o viewport-fit=cover        # frontend served
```

## 6. Updating a deployment

```bash
cd /var/www/fieldcrm && sudo -u www-data git pull
backend/venv/bin/pip install -r backend/requirements.txt
cd frontend && yarn install --frozen-lockfile && yarn build && cd ..
sudo systemctl restart fieldcrm-api.service
sudo nginx -t && sudo systemctl reload nginx
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Service crash-loops at boot | Missing REQUIRED env var — `journalctl -u fieldcrm-api -n 50` shows the fail-fast message. |
| Frontend loads, all API calls fail with `undefined/api` or `//api` | Bundle built without/with-trailing-slash `REACT_APP_BACKEND_URL` on an old build — rebuild (new `api.js` tolerates both). |
| 413 Request Entity Too Large on upload/import | Raise `client_max_body_size`. |
| Tenant subdomain resolves to nothing | `ROOT_DOMAIN` unset in backend `.env`, or nginx not passing `Host` / wildcard `server_name` missing. |
| OTP never arrives in production | `SMS_PROVIDER` still `mock` or incomplete `PINGBIX_*` (backend logs a fallback warning); check Super Admin → Settings "Active provider". |
| Mixed-content/CORS errors | `CORS_ORIGINS` must include the https origin; build frontend with the https URL (or empty for same-origin). |
