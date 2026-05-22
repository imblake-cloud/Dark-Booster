# Alpine Linux Deployment (24/7)

Two deployment methods are available:

- **[Docker](#docker-deployment)** — recommended, self-contained, easiest to update
- **[OpenRC service](#openrc-service-deployment)** — bare-metal, no Docker required

---

## Docker deployment

### Prerequisites

```sh
apk update
apk add --no-cache docker docker-compose-plugin
rc-update add docker default
rc-service docker start
```

### 1) Copy project to server

```sh
cd /opt
git clone <YOUR_REPO_URL> steam-hour-booster
cd steam-hour-booster
```

Or copy the folder manually to `/opt/steam-hour-booster`.

### 2) Configure environment

```sh
cp .env.example .env
vi .env
```

Minimum values for Docker:

```env
# Dashboard auth (Discord OAuth)
DASHBOARD_DISCORD_CLIENT_ID=...
DASHBOARD_DISCORD_CLIENT_SECRET=...
DASHBOARD_DISCORD_REDIRECT_URI=http://steam.local:3100/api/auth/discord/callback
DASHBOARD_CORS_ORIGINS=http://steam.local:3100
DASHBOARD_FRONTEND_URL=http://steam.local:3100
DASHBOARD_ALLOWED_DISCORD_USER_IDS=<your_discord_user_id>

# Discord bot (optional — set DISCORD_ENABLED=false to skip)
DISCORD_ENABLED=false
```

> `API_HOST`, `API_PORT`, and `NODE_ENV` are forced in `docker-compose.yml` — do not set them in `.env` for Docker.

### 3) Create accounts file

```sh
cp accounts.json accounts.json.bak 2>/dev/null || true
# Create empty accounts file (add accounts via the dashboard)
echo "[]" > accounts.json
```

Or copy your existing `accounts.json` directly.

### 4) Build and start

```sh
docker compose up -d --build
```

Follow logs:

```sh
docker compose logs -f
```

Open the dashboard:

```
http://steam.local:3100
```

### 5) Update

```sh
docker compose up -d --build
```

Docker rebuilds the image, replaces the container, and keeps your `accounts.json` intact.

### 6) Docker lifecycle

```sh
docker compose stop
docker compose start
docker compose restart
docker compose down        # stop + remove container (data safe)
docker compose down --rmi all  # also remove image
```

---

## OpenRC service deployment

### 1) System prerequisites

Run as root:

```sh
apk update
apk add --no-cache git nodejs npm
npm install -g pnpm
```

Check versions:

```sh
node -v
pnpm -v
```

### 2) Copy project to server

Recommended location:

```sh
mkdir -p /opt
cd /opt
git clone <YOUR_REPO_URL> steam-hour-booster
cd steam-hour-booster
```

If you are not using Git, copy the project folder to:
`/opt/steam-hour-booster`

### 3) Configure environment

Copy env templates:

```sh
cp .env.example .env
cp web/.env.example web/.env
```

Edit root `.env`:

```sh
vi .env
```

Minimum important values:

- `API_ENABLED=true`
- `API_HOST=0.0.0.0` (for LAN access)
- `API_PORT=3100`
- `DASHBOARD_STATIC_ENABLED=true`
- `DASHBOARD_STATIC_DIR=./web/dist`
- `DASHBOARD_FRONTEND_URL=http://steam.local:3100`
- `DASHBOARD_DISCORD_REDIRECT_URI=http://steam.local:3100/api/auth/discord/callback`
- `DASHBOARD_CORS_ORIGINS=http://steam.local:3100`
- `DASHBOARD_DISCORD_CLIENT_ID=...`
- `DASHBOARD_DISCORD_CLIENT_SECRET=...`
- `DASHBOARD_ALLOWED_DISCORD_USER_IDS=<your_discord_user_id>`

If you also use Discord bot control:

- `DISCORD_ENABLED=true`
- `DISCORD_BOT_TOKEN=...`
- `DISCORD_CLIENT_ID=...`
- `ALLOWED_DISCORD_USER_IDS=<your_discord_user_id>`

### 4) Configure Discord OAuth2 redirect

In Discord Developer Portal:

1. Open your app.
2. `OAuth2` -> `Redirects`.
3. Add:
   - `http://steam.local:3100/api/auth/discord/callback`
4. Save.

`DASHBOARD_DISCORD_REDIRECT_URI` in `.env` must match exactly.

### 4.1) Publish `steam.local` on your LAN

For `steam.local` to work from another PC, the hostname must resolve to your miniPC IP.

#### Option A (recommended): Avahi/mDNS on Alpine

```sh
apk add --no-cache avahi dbus
echo "steam" > /etc/hostname
hostname steam
rc-update add dbus default
rc-service dbus start
rc-update add avahi-daemon default
rc-service avahi-daemon start
```

Then your panel should be reachable as:

- `http://steam.local:3100`

#### Option B: hosts file on your other PC (fastest fallback)

Add this line on the other PC:

```txt
<MINIPC_LAN_IP> steam.local
```

Windows hosts path: `C:\Windows\System32\drivers\etc\hosts`

Linux/macOS hosts path: `/etc/hosts`

### 5) Configure Steam accounts

Edit `accounts.json`:

```json
[
  {
    "id": "main-account",
    "username": "steam_user",
    "password": "steam_password",
    "shared_secret": "OPTIONAL_SHARED_SECRET",
    "proxy": "OPTIONAL_PROXY",
    "preferred_app_ids": [730]
  }
]
```

Notes:

- If `shared_secret` is missing, login may require code or mobile approval.
- Mobile app `Approve` is supported.

### 6) Build once

```sh
pnpm install        # installs backend + frontend deps in one command
pnpm run build:all
```

Quick manual test:

```sh
pnpm run start:prod
```

Open:

- `http://steam.local:3100`

Stop test with `Ctrl+C`.

### 7) Install OpenRC service (recommended 24/7)

From project root:

```sh
sh ./scripts/alpine/install-openrc.sh
```

This will:

- install deps
- copy/update app in `/opt/steam-hour-booster`
- build backend + frontend
- install `/etc/init.d/steam-hour-booster`
- install `/etc/conf.d/steam-hour-booster`
- enable auto-start in runlevel `default`

### 8) Service lifecycle

```sh
rc-service steam-hour-booster start
rc-service steam-hour-booster status
rc-service steam-hour-booster stop
rc-service steam-hour-booster restart
rc-update add steam-hour-booster default
```

### 9) Logs and troubleshooting

Service logs:

```sh
tail -f /var/log/steam-hour-booster.log
tail -f /var/log/steam-hour-booster.err.log
```

Common issues:

1. `EADDRINUSE` on port 3100 — change `API_PORT` or stop old process.

2. Discord OAuth error — check `DASHBOARD_DISCORD_CLIENT_ID`, `DASHBOARD_DISCORD_CLIENT_SECRET`, `DASHBOARD_DISCORD_REDIRECT_URI`, `DASHBOARD_ALLOWED_DISCORD_USER_IDS`. If OAuth rejects `steam.local`, verify the exact redirect URL is added in Discord Developer Portal.

3. Dashboard not loading — ensure `pnpm run build:all` completed, `web/dist/index.html` exists, and `DASHBOARD_STATIC_ENABLED=true`.

### 10) Update flow

```sh
sh ./scripts/alpine/update-openrc.sh
```

Or manually:

```sh
cd /opt/steam-hour-booster
pnpm install
pnpm run build:all
rc-service steam-hour-booster restart
```

### 11) Security hardening (recommended)

- Use `API_HOST=0.0.0.0` only if you need LAN access.
- If exposing remotely, put Nginx/Caddy in front with TLS.
- Restrict access using firewall rules.
- Keep `.env` readable only by service user/root.
