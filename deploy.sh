#!/usr/bin/env bash

set -Eeuo pipefail

readonly PROJECT_DIR='/root/nashpryanik'
readonly BACKEND_SERVICE='stroit-backend'
readonly DEMO_SERVICE='stroit-demo'
readonly API_HEALTH_URL='https://stroit.site/api/health'
readonly SITE_URL='https://stroit.site/'
readonly HEALTH_ATTEMPTS=12
readonly HEALTH_DELAY_SECONDS=5

cd "$PROJECT_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Production working tree содержит изменения. Deploy запрещён.' >&2
  git status --short >&2
  exit 1
fi

git fetch origin main
git pull --ff-only origin main

LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse origin/main)"

if [[ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]]; then
  echo 'Production HEAD не совпадает с origin/main. Deploy запрещён.' >&2
  exit 1
fi

npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run backend:build

systemctl restart "$BACKEND_SERVICE"
systemctl restart "$DEMO_SERVICE"
systemctl is-active --quiet "$BACKEND_SERVICE"
systemctl is-active --quiet "$DEMO_SERVICE"
nginx -t

health_ok=false
for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1)); do
  api_response="$(curl --fail --silent --show-error --max-time 10 "$API_HEALTH_URL" || true)"
  site_status="$(curl --output /dev/null --silent --show-error --max-time 10 --write-out '%{http_code}' "$SITE_URL" || true)"
  if [[ "$api_response" == *'"status":"ok"'* && "$site_status" == '200' ]]; then
    health_ok=true
    break
  fi
  if ((attempt < HEALTH_ATTEMPTS)); then
    sleep "$HEALTH_DELAY_SECONDS"
  fi
done

if [[ "$health_ok" != true ]]; then
  echo 'Production health-check не прошёл после повторных попыток.' >&2
  exit 1
fi

printf 'DEPLOY_HEAD=%s\nAPI_HEALTH=%s\nSITE_HTTP=%s\n' "$LOCAL_HEAD" "$api_response" "$site_status"
