# Linux Deployment (systemd)

For any Linux distribution that uses **systemd** (Ubuntu, Debian, Fedora, RHEL, Arch, etc.).

Two deployment methods are available:

- **[Docker](#docker-deployment)** — recommended, self-contained, easiest to update
- **[systemd service](#systemd-service-deployment)** — bare-metal, no Docker required

---

## Docker deployment

Docker is the easiest way to run Dark Booster on any Linux system. It requires no manual dependency management and works identically across all distros.

### Prerequisites

- Docker Engine: https://docs.docker.com/engine/install/
- pnpm is **not** required for Docker — it is handled inside the build image.

### 1) Clone the repository

```sh
cd /opt
git clone https://github.com/imblake-cloud/Dark-Booster steam-hour-booster
cd steam-hour-booster
```

Or copy the folder manually to `/opt/steam-hour-booster`.

### 2) Configure environment

```sh
cp .env.example .env
nano .env   # or vi .env
```

Minimum values:

```env
API_HOST=0.0.0.0
API_PORT=3100
```

### 3) Create accounts file

```sh
cp accounts.json.example accounts.json
```

> `accounts.json` **must exist as a file** before the first `docker compose up`. If it doesn't, Docker creates a directory and account writes will fail silently.

### 4) Build and start

```sh
docker compose up -d --build
```

Dashboard → `http://YOUR_SERVER_IP:3100`

### 5) Update

```sh
docker compose up -d --build
```

Docker rebuilds the image and replaces the container. Your `accounts.json` is preserved via volume mount.

### 6) Lifecycle

```sh
docker compose logs -f
docker compose stop
docker compose start
docker compose restart
docker compose down          # stop + remove container (data safe)
docker compose down --rmi all  # also remove image
```

---

## systemd service deployment

Runs Dark Booster natively as a systemd service — no Docker needed. The process auto-starts on boot and restarts automatically on failure.

### Prerequisites

- Linux with systemd (Ubuntu 20.04+, Debian 11+, Fedora 35+, Arch, etc.)
- **Node.js 20+ installed system-wide** (not via nvm — see note below)

#### Installing Node.js 20+ system-wide

**Ubuntu / Debian (NodeSource):**
```sh
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

**Fedora / RHEL 9+:**
```sh
sudo dnf install nodejs
```

**Arch:**
```sh
sudo pacman -S nodejs npm
```

> **Why not nvm?** nvm installs Node.js under your home directory. systemd runs the service as a dedicated `steambooster` user who cannot access your home directory. Use a system-wide installation instead.

#### Installing pnpm

```sh
npm install -g pnpm
```

Or via corepack (bundled with Node.js 16+):

```sh
corepack enable
corepack prepare pnpm@latest --activate
```

---

### 1) Clone the repository

```sh
cd /opt
git clone https://github.com/imblake-cloud/Dark-Booster steam-hour-booster
cd steam-hour-booster
```

### 2) Run the installer

```sh
sudo sh ./scripts/linux/install-systemd.sh
```

The installer:
- Creates the `steambooster` system user and group
- Copies the project to `/opt/steam-hour-booster`
- Installs Node.js dependencies and builds the project
- Installs and enables the systemd unit at `/etc/systemd/system/steam-hour-booster.service`
- Copies `.env.example` → `.env` if no `.env` exists

You can override defaults with environment variables:

```sh
sudo APP_DIR=/srv/dark-booster APP_USER=myuser sh ./scripts/linux/install-systemd.sh
```

Dry-run (preview without making changes):

```sh
sudo DRY_RUN=1 sh ./scripts/linux/install-systemd.sh
```

---

### 3) Configure environment

```sh
sudo nano /opt/steam-hour-booster/.env
```

Minimum values for LAN access:

```env
API_HOST=0.0.0.0
API_PORT=3100
```

See [`.env.example`](../.env.example) for all available options.

---

### 4) Configure Steam accounts

You can add accounts through the dashboard after first start, or pre-populate `accounts.json`:

```sh
sudo nano /opt/steam-hour-booster/accounts.json
```

```json
[
  {
    "id": "main-account",
    "username": "steam_user",
    "password": "steam_password",
    "shared_secret": "OPTIONAL_TOTP_SECRET",
    "preferred_app_ids": [730]
  }
]
```

---

### 5) Start the service

```sh
sudo systemctl start steam-hour-booster
sudo systemctl status steam-hour-booster
```

Dashboard → `http://YOUR_SERVER_IP:3100`

---

### Service lifecycle

```sh
# Start / stop / restart
sudo systemctl start   steam-hour-booster
sudo systemctl stop    steam-hour-booster
sudo systemctl restart steam-hour-booster

# Enable / disable auto-start on boot
sudo systemctl enable  steam-hour-booster
sudo systemctl disable steam-hour-booster

# Status
sudo systemctl status steam-hour-booster
```

---

### Logs

Dark Booster logs to the systemd journal. View logs with:

```sh
# Follow live
journalctl -u steam-hour-booster -f

# Last 100 lines
journalctl -u steam-hour-booster -n 100

# Since last boot
journalctl -u steam-hour-booster -b

# Between dates
journalctl -u steam-hour-booster --since "2024-01-15 10:00" --until "2024-01-15 11:00"
```

---

### Updating

Pull the latest code and run the update script:

```sh
cd /opt/steam-hour-booster
sudo git pull
sudo sh ./scripts/linux/update-systemd.sh
```

Or manually:

```sh
cd /opt/steam-hour-booster
sudo pnpm install
sudo pnpm run build:all
sudo systemctl restart steam-hour-booster
```

---

### Troubleshooting

**Service fails to start:**
```sh
journalctl -u steam-hour-booster -n 50 --no-pager
```

**Port already in use (`EADDRINUSE`):**
Change `API_PORT` in `.env` and restart the service.

**Dashboard not loading:**
Verify the build completed: `ls /opt/steam-hour-booster/web/dist/index.html`
If missing, re-run: `cd /opt/steam-hour-booster && sudo pnpm run build:all`

**Permission denied on accounts.json:**
```sh
sudo chown steambooster:steambooster /opt/steam-hour-booster/accounts.json
```

**Node not found by systemd:**
Check that node is installed system-wide: `which node` should return `/usr/bin/node` or `/usr/local/bin/node`.
If it returns a path under `/home/` or `/root/`, reinstall Node.js using your distro's package manager or NodeSource.

---

### Security hardening (recommended)

- Set `API_HOST=127.0.0.1` and put Nginx or Caddy in front with TLS if exposing to the internet.
- Set `API_TOKEN` in `.env` to require authentication on all API routes.
- Keep `.env` readable only by the service user: `chmod 640 .env`
- Use a firewall to restrict port 3100 to trusted IPs if not using a reverse proxy.
