#!/bin/sh
set -eu

SERVICE_NAME="steam-hour-booster"
APP_DIR="${APP_DIR:-/opt/steam-hour-booster}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root."
  exit 1
fi

if [ ! -d "${APP_DIR}" ]; then
  echo "App directory not found: ${APP_DIR}"
  exit 1
fi

cd "${APP_DIR}"

echo "[1/5] Stopping service..."
rc-service "${SERVICE_NAME}" stop || true

echo "[2/5] Installing dependencies..."
npm install
npm --prefix web install

echo "[3/5] Building..."
npm run build:all

echo "[4/5] Starting service..."
rc-service "${SERVICE_NAME}" start

echo "[5/5] Service status..."
rc-service "${SERVICE_NAME}" status
