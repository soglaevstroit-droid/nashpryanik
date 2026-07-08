#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE=".env.example"
fi

COMPOSE="docker compose --env-file $ENV_FILE -f infra/docker/docker-compose.yml"

check_service() {
  service="$1"
  container="$2"

  running="$($COMPOSE ps --status running --services "$service")"
  if [ "$running" != "$service" ]; then
    echo "$service is not running"
    exit 1
  fi

  health="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$container")"
  if [ "$health" != "healthy" ] && [ "$health" != "running" ]; then
    echo "$service health is $health"
    exit 1
  fi
}

$COMPOSE ps postgres redis minio

check_service "postgres" "stroit-postgres"
check_service "redis" "stroit-redis"
check_service "minio" "stroit-minio"

echo "Development services are running"
