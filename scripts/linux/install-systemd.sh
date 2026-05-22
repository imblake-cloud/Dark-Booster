#!/bin/sh
# Installs steam-hour-booster as a systemd service on any Linux distro.
# Requires: Node.js 20+ installed system-wide, systemd, root access.
# Safe to re-run (idempotent).
set -eu

# ---------------------------------------------------------------------------
# Config (override via environment)
# ---------------------------------------------------------------------------
SERVICE_NAME="steam-hour-booster"
APP_DIR="${APP_DIR:-/opt/steam-hour-booster}"
APP_USER="${APP_USER:-steambooster}"
APP_GROUP="${APP_GROUP:-steambooster}"
DRY_RUN="${DRY_RUN:-0}"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log_info()  { printf '[%s] INFO:  %s\n'  "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
log_warn()  { printf '[%s] WARN:  %s\n'  "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }
log_error() { printf '[%s] ERROR: %s\n'  "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }
log_step()  { printf '\n[%s] === %s ===\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
log_dry()   { printf '[%s] DRY-RUN: would run: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# ---------------------------------------------------------------------------
# Dry-run wrapper
# ---------------------------------------------------------------------------
run_cmd() {
    if [ "$DRY_RUN" = "1" ]; then
        log_dry "$*"
        return 0
    fi
    "$@"
}

# ---------------------------------------------------------------------------
# Error trap
# ---------------------------------------------------------------------------
on_error() {
    log_error "Script failed. Review output above."
    exit 1
}
trap on_error INT TERM

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
check_dependencies() {
    local missing=""
    for cmd in node pnpm tar install chown cp systemctl useradd groupadd id; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing="$missing $cmd"
        fi
    done
    if [ -n "$missing" ]; then
        log_error "Missing required commands:$missing"
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Node version check (requires 20+)
# ---------------------------------------------------------------------------
check_node_version() {
    local version
    version="$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)"
    if [ -z "$version" ] || [ "$version" -lt 20 ]; then
        log_error "Node.js 20+ is required. Found: $(node --version 2>/dev/null || echo 'not found')"
        log_error "Install Node.js 20+ system-wide (not via nvm) before running this script."
        log_error "  Ubuntu/Debian: https://github.com/nodesource/distributions"
        log_error "  Fedora/RHEL:   sudo dnf install nodejs"
        log_error "  Arch:          sudo pacman -S nodejs npm"
        exit 1
    fi
    log_info "Node.js $(node --version) detected."
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
group_exists() { getent group "$1" >/dev/null 2>&1; }
user_exists()  { id -u "$1" >/dev/null 2>&1; }

ensure_dir() {
    local dir="$1" owner="$2" mode="${3:-0755}"
    if [ ! -d "$dir" ]; then
        run_cmd mkdir -p -- "$dir" || { log_error "Cannot create directory: $dir"; exit 1; }
    fi
    run_cmd chown "$owner" -- "$dir"
    run_cmd chmod "$mode" -- "$dir"
}

# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then
    log_error "This script must be run as root."
    exit 1
fi

if [ "$DRY_RUN" = "1" ]; then
    log_warn "DRY-RUN mode enabled — no changes will be made."
fi

check_dependencies
check_node_version

# Detect node binary path (must be system-wide, not nvm)
NODE_BIN="$(command -v node)"
log_info "Using node binary: $NODE_BIN"

# Warn if node is inside a home directory (nvm)
case "$NODE_BIN" in
    /home/*|/root/*)
        log_warn "Node.js appears to be installed via nvm or inside a home directory."
        log_warn "systemd services run as a different user and may not find node at this path."
        log_warn "Consider installing Node.js system-wide (e.g. NodeSource) for reliable service operation."
        ;;
esac

# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------
log_step "1/9 — Create service user/group"
if ! group_exists "$APP_GROUP"; then
    log_info "Creating group: $APP_GROUP"
    run_cmd groupadd --system "$APP_GROUP"
else
    log_info "Group already exists: $APP_GROUP"
fi

if ! user_exists "$APP_USER"; then
    log_info "Creating user: $APP_USER"
    run_cmd useradd \
        --system \
        --no-create-home \
        --home-dir "$APP_DIR" \
        --shell /sbin/nologin \
        --gid "$APP_GROUP" \
        "$APP_USER"
else
    log_info "User already exists: $APP_USER"
fi

log_step "2/9 — Sync project to ${APP_DIR}"
run_cmd mkdir -p -- "$APP_DIR"
if [ "$ROOT_DIR" != "$APP_DIR" ]; then
    log_info "Copying from $ROOT_DIR → $APP_DIR"
    if [ "$DRY_RUN" != "1" ]; then
        tar \
            --exclude="./node_modules" \
            --exclude="./dist" \
            --exclude="./web/node_modules" \
            --exclude="./web/dist" \
            --exclude="./.git" \
            --exclude="./.env" \
            --exclude="./accounts.json" \
            -C "$ROOT_DIR" \
            -cf - . > /tmp/shb_transfer.tar \
        && tar -C "$APP_DIR" -xf /tmp/shb_transfer.tar \
        && rm -f /tmp/shb_transfer.tar \
        || { log_error "File transfer failed."; rm -f /tmp/shb_transfer.tar; exit 1; }
    else
        log_dry "tar (excluded: node_modules, dist, .git, .env, accounts.json) $ROOT_DIR → $APP_DIR"
    fi
else
    log_info "Source and destination are the same — skipping copy."
fi

log_step "3/9 — Install Node dependencies"
if [ "$DRY_RUN" != "1" ]; then
    cd "$APP_DIR" || { log_error "Cannot cd to $APP_DIR"; exit 1; }
    pnpm install --frozen-lockfile || { log_error "pnpm install failed."; exit 1; }
else
    log_dry "pnpm install --frozen-lockfile (in $APP_DIR)"
fi

log_step "4/9 — Build backend + web"
if [ "$DRY_RUN" != "1" ]; then
    pnpm run build:all || { log_error "Build failed."; exit 1; }
else
    log_dry "pnpm run build:all"
fi

log_step "5/9 — Set permissions"
ensure_dir "$APP_DIR" "${APP_USER}:${APP_GROUP}" 0755

log_step "6/9 — Install systemd unit"
SERVICE_TEMPLATE="${APP_DIR}/scripts/linux/steam-hour-booster.service"
SERVICE_DEST="/etc/systemd/system/${SERVICE_NAME}.service"

if [ ! -f "$SERVICE_TEMPLATE" ]; then
    log_error "Service template not found: $SERVICE_TEMPLATE"
    exit 1
fi

if [ "$DRY_RUN" != "1" ]; then
    sed \
        -e "s|__APP_DIR__|${APP_DIR}|g" \
        -e "s|__APP_USER__|${APP_USER}|g" \
        -e "s|__APP_GROUP__|${APP_GROUP}|g" \
        -e "s|__NODE_BIN__|${NODE_BIN}|g" \
        "$SERVICE_TEMPLATE" > "$SERVICE_DEST"
    chmod 0644 "$SERVICE_DEST"
    log_info "Installed: $SERVICE_DEST"
else
    log_dry "sed substitution: $SERVICE_TEMPLATE → $SERVICE_DEST"
fi

log_step "7/9 — Reload systemd daemon"
run_cmd systemctl daemon-reload

log_step "8/9 — Ensure .env exists"
if [ ! -f "${APP_DIR}/.env" ]; then
    if [ -f "${APP_DIR}/.env.example" ]; then
        run_cmd cp -- "${APP_DIR}/.env.example" "${APP_DIR}/.env"
        run_cmd chown "${APP_USER}:${APP_GROUP}" -- "${APP_DIR}/.env"
        run_cmd chmod 0640 -- "${APP_DIR}/.env"
        log_info "Created .env from .env.example — review and edit before starting."
    else
        log_warn ".env.example not found. Create ${APP_DIR}/.env manually."
    fi
else
    log_info ".env already exists — skipping."
fi

log_step "9/9 — Enable service at boot"
if [ "$DRY_RUN" != "1" ]; then
    if systemctl is-enabled "$SERVICE_NAME" >/dev/null 2>&1; then
        log_info "Service already enabled."
    else
        run_cmd systemctl enable "$SERVICE_NAME" \
            || log_warn "systemctl enable failed — enable manually: systemctl enable $SERVICE_NAME"
    fi
else
    log_dry "systemctl enable $SERVICE_NAME"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
printf '\n'
log_info "Installation complete."
printf '\n'
printf '  Review:  %s/.env\n' "$APP_DIR"
printf '  Then:    systemctl start %s\n' "$SERVICE_NAME"
printf '           systemctl status %s\n' "$SERVICE_NAME"
printf '  Logs:    journalctl -u %s -f\n' "$SERVICE_NAME"
printf '\n'
