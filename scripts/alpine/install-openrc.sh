#!/bin/sh
set -eu

SERVICE_NAME="steam-hour-booster"
APP_DIR="${APP_DIR:-/opt/steam-hour-booster}"
APP_USER="${APP_USER:-steambooster}"
APP_GROUP="${APP_GROUP:-steambooster}"

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root."
  exit 1
fi

echo "[1/9] Installing runtime packages..."
apk add --no-cache nodejs npm

echo "[2/9] Creating service user/group if missing..."
if ! grep -q "^${APP_GROUP}:" /etc/group 2>/dev/null; then
  addgroup -S "${APP_GROUP}"
fi

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  adduser -S -D -H -h "${APP_DIR}" -s /sbin/nologin -G "${APP_GROUP}" "${APP_USER}"
fi

echo "[3/9] Syncing project to ${APP_DIR}..."
mkdir -p "${APP_DIR}"
if [ "${ROOT_DIR}" != "${APP_DIR}" ]; then
  tar \
    --exclude="./node_modules" \
    --exclude="./dist" \
    --exclude="./web/node_modules" \
    --exclude="./web/dist" \
    --exclude="./.git" \
    --exclude="./.env" \
    --exclude="./accounts.json" \
    -C "${ROOT_DIR}" \
    -cf - . | tar -C "${APP_DIR}" -xf -
fi

echo "[4/9] Installing Node dependencies..."
cd "${APP_DIR}"
npm install
npm --prefix web install

echo "[5/9] Building backend + web..."
npm run build:all

echo "[6/9] Installing OpenRC service..."
install -m 0755 "${APP_DIR}/scripts/alpine/openrc/${SERVICE_NAME}" "/etc/init.d/${SERVICE_NAME}"

if [ ! -f "/etc/conf.d/${SERVICE_NAME}" ]; then
  install -m 0644 "${APP_DIR}/scripts/alpine/openrc/${SERVICE_NAME}.conf" "/etc/conf.d/${SERVICE_NAME}"
fi

echo "[7/9] Preparing logs and permissions..."
touch /var/log/steam-hour-booster.log /var/log/steam-hour-booster.err.log
chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"
chown "${APP_USER}:${APP_GROUP}" /var/log/steam-hour-booster.log /var/log/steam-hour-booster.err.log

echo "[8/9] Ensuring .env exists..."
if [ ! -f "${APP_DIR}/.env" ] && [ -f "${APP_DIR}/.env.example" ]; then
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  chown "${APP_USER}:${APP_GROUP}" "${APP_DIR}/.env"
fi

echo "[9/9] Enabling service..."
rc-update add "${SERVICE_NAME}" default >/dev/null 2>&1 || true

echo ""
echo "Done."
echo "Review and edit: ${APP_DIR}/.env"
echo "Then run:"
echo "  rc-service ${SERVICE_NAME} start"
echo "  rc-service ${SERVICE_NAME} status"
