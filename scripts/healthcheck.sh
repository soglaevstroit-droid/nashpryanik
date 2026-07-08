#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE=".env.example"
fi

COMPOSE="docker compose --env-file $ENV_FILE -f infra/docker/docker-compose.yml"

$COMPOSE ps postgres redis minio

POSTGRES_STATUS="$($COMPOSE ps --status running --services postgres)"
REDIS_STATUS="$($COMPOSE ps --status running --services redis)"
MINIO_STATUS="$($COMPOSE ps --status running --services minio)"

if [ "$POSTGRES_STATUS" != "postgres" ]; then
  echo "PostgreSQL is not running"
  exit 1
fi

if [ "$REDIS_STATUS" != "redis" ]; then
  echo "Redis is not running"
  exit 1
fi

if [ "$MINIO_STATUS" != "minio" ]; then
  echo "MinIO is not running"
  exit 1
fi

echo "Development services are running"
