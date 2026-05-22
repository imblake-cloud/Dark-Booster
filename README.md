<div align="center">
  <img src="web/public/logo-render.svg" alt="Dark Booster" width="88" />

  <h1>Dark Booster</h1>

  <p>Self-hosted Steam hour booster — headless, multi-account, real-time dashboard.</p>

  <p>
    <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=nodedotjs&logoColor=white&labelColor=0d0d12" alt="Node.js"/>
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=0d0d12" alt="TypeScript"/>
    <img src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white&labelColor=0d0d12" alt="Docker"/>
    <img src="https://img.shields.io/badge/license-MIT-c9a84c?style=flat-square&labelColor=0d0d12" alt="MIT"/>
    <img src="https://img.shields.io/badge/telemetry-none-3dba72?style=flat-square&labelColor=0d0d12" alt="No telemetry"/>
  </p>

  <p>
    <a href="#-quick-start">Quick Start</a> ·
    <a href="#%EF%B8%8F-configuration">Configuration</a> ·
    <a href="#-linux--systemd">Linux</a> ·
    <a href="#-development">Development</a> ·
    <a href="https://github.com/imblake-cloud/Dark-Booster/issues">Issues</a>
  </p>
</div>

---

## What it does

Dark Booster connects to Steam using your account credentials and starts idle sessions for up to 32 games simultaneously. It runs as a Node.js process — either standalone or inside Docker — and exposes a WebSocket-powered dashboard to manage accounts, view live session timers, respond to Steam Guard prompts, and get Discord alerts.

> **Steam ToS notice:** Automating playtime may violate Steam's [Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/). Use on accounts you can afford to lose.

---

## Features

- Run unlimited Steam accounts in parallel (RAM is the only limit)
- Boost up to 32 games per account simultaneously
- Real-time dashboard with live session timers and account status
- Steam Guard support — enter codes from the dashboard, or automate with a shared secret
- Per-account stealth mode: `invisible`, `offline`, or `normal`
- Per-account HTTP/S proxy support
- Discord webhook alerts for Steam Guard prompts and errors
- Optional AES-256 encryption for stored passwords
- No telemetry, no external calls beyond Steam's servers

---

## 🚀 Quick Start

### Docker (recommended)

**1.** Clone and enter the directory:

```bash
git clone https://github.com/imblake-cloud/Dark-Booster
cd Dark-Booster
```

**2.** Create config files and start:

```bash
make setup    # creates .env and accounts.json from templates
# Edit .env — at minimum review API_HOST, API_PORT, and API_TOKEN
make start    # builds the Docker image and starts the service
```

> No `make`? Run manually:
> ```bash
> cp .env.example .env && cp accounts.json.example accounts.json
> docker compose up -d --build
> ```

Dashboard → `http://localhost:3100`

#### Common commands

```bash
make logs      # follow live output
make restart   # restart the service
make update    # pull latest code and rebuild
make stop      # stop the service
```

---

### Node.js (local)

Requires **Node.js 20+** and **[pnpm](https://pnpm.io) 9+**.

```bash
git clone https://github.com/imblake-cloud/Dark-Booster
cd Dark-Booster
pnpm install
cp .env.example .env
cp accounts.json.example accounts.json
pnpm run build:all
pnpm start
```

---

## ⚙️ Configuration

Copy `.env.example` to `.env` and set the values. The most important ones:

| Variable | Default | Description |
|---|---|---|
| `API_HOST` | `0.0.0.0` | Interface to bind — `0.0.0.0` for Docker/LAN, `127.0.0.1` for local only |
| `API_PORT` | `3100` | Dashboard and API port |
| `API_TOKEN` | — | If set, all `/api/*` routes require `Authorization: Bearer <token>` |
| `DEFAULT_STEALTH_MODE` | `invisible` | Online status: `invisible` · `offline` · `normal` |
| `GAME_OPTIONS` | `CS2:730\|...` | Quick-select game presets (`Label:appId\|Label:appId`) |
| `ACCOUNTS_ENCRYPTION_KEY` | — | AES-256 key to encrypt passwords in `accounts.json` (optional) |
| `DISCORD_WEBHOOK_URL` | — | Webhook for Steam Guard and error alerts (optional) |

All options are documented in `.env.example`.

---

## 🐧 Linux — systemd

For persistent deployment on Ubuntu, Debian, Fedora, Arch, or any systemd-based distro:

```bash
sudo sh ./scripts/linux/install-systemd.sh
```

Installs Dark Booster as a systemd service that starts automatically on boot. Requires **Node.js 20+ installed system-wide** (not via nvm).

```bash
sudo systemctl start steam-hour-booster
journalctl -u steam-hour-booster -f
```

Full guide: [`docs/LINUX_DEPLOYMENT.md`](docs/LINUX_DEPLOYMENT.md)

---

## 💻 Development

```bash
pnpm install                  # install all deps (backend + frontend)
pnpm run dev                  # backend watch mode → http://localhost:3100
pnpm run web:dev              # frontend dev server → http://localhost:5173
```

---

## 🛠 Tech Stack

<p>
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express"/>
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React"/>
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-0F172A?style=for-the-badge&logo=tailwindcss&logoColor=38BDF8" alt="Tailwind CSS"/>
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/>
</p>

---

## 📁 Project Structure

```
Dark-Booster/
├── src/                        # TypeScript backend
│   ├── index.ts                # Entry point
│   ├── api/                    # Express REST + WebSocket server
│   ├── core/                   # Account manager, booster, Steam session
│   ├── models/                 # Types and enums
│   ├── services/               # Discord alerts, game DB, Steam service
│   └── utils/                  # Logger, security helpers
├── web/                        # React dashboard (Vite + Tailwind)
│   ├── src/
│   │   ├── components/         # Dashboard, Sidebar, modals, status indicators
│   │   ├── services/           # API client, WebSocket client
│   │   ├── store/              # Zustand state
│   │   └── types/
│   └── public/                 # Static assets (favicon, logo)
├── scripts/linux/              # systemd service installer
├── docs/                       # Deployment guides
├── Makefile                    # Convenience commands (setup, start, logs…)
├── Dockerfile                  # Multi-stage Alpine build
├── docker-compose.yml
├── .env.example                # All config options documented
└── accounts.json.example       # Copy to accounts.json before first run
```

---

## License

[MIT](LICENSE) © imblake-cloud
