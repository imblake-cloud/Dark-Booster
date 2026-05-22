#!/bin/sh
# Updates an already-installed steam-hour-booster service on Linux (systemd).
# Stops the service, rebuilds, and restarts. Must be run as root.
set -eu

# ---------------------------------------------------------------------------
# Config (override via environment)
# ---------------------------------------------------------------------------
SERVICE_NAME="steam-hour-booster"
APP_DIR="${APP_DIR:-/opt/steam-hour-booster}"
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
    log_error "Update failed. The service may be stopped — check status:"
    log_error "  systemctl status $SERVICE_NAME"
    exit 1
}
trap on_error INT TERM

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
check_dependencies() {
    local missing=""
    for cmd in pnpm systemctl; do
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
# Guards
# ---------------------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
    log_error "This script must be run as root."
    exit 1
fi

if [ "$DRY_RUN" = "1" ]; then
    log_warn "DRY-RUN mode enabled — no changes will be made."
fi

check_dependencies

if [ ! -d "$APP_DIR" ]; then
    log_error "App directory not found: $APP_DIR"
    log_error "Run install-systemd.sh first."
    exit 1
fi

if [ ! -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
    log_error "Service unit not found: /etc/systemd/system/${SERVICE_NAME}.service"
    log_error "Run install-systemd.sh first."
    exit 1
fi

# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------
log_step "1/5 — Stop service"
if systemctl is-active "$SERVICE_NAME" >/dev/null 2>&1; then
    run_cmd systemctl stop "$SERVICE_NAME" \
        || log_warn "Stop returned non-zero — proceeding anyway."
    log_info "Service stopped."
else
    log_info "Service was not running — skipping stop."
fi

log_step "2/5 — Install dependencies"
if [ "$DRY_RUN" != "1" ]; then
    cd "$APP_DIR" || { log_error "Cannot cd to $APP_DIR"; exit 1; }
    pnpm install --frozen-lockfile || { log_error "pnpm install failed."; exit 1; }
else
    log_dry "pnpm install --frozen-lockfile (in $APP_DIR)"
fi

log_step "3/5 — Build"
if [ "$DRY_RUN" != "1" ]; then
    pnpm run build:all || { log_error "Build failed."; exit 1; }
else
    log_dry "pnpm run build:all"
fi

log_step "4/5 — Start service"
run_cmd systemctl start "$SERVICE_NAME" \
    || { log_error "Service failed to start. Check: journalctl -u $SERVICE_NAME -n 50"; exit 1; }

log_step "5/5 — Service status"
if [ "$DRY_RUN" != "1" ]; then
    systemctl status "$SERVICE_NAME" --no-pager || true
else
    log_dry "systemctl status $SERVICE_NAME"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
printf '\n'
log_info "Update complete."
printf '  Logs: journalctl -u %s -f\n' "$SERVICE_NAME"
printf '\n'
