#!/usr/bin/env sh
set -eu

required_paths="
apps/backend/README.md
apps/mobile/README.md
apps/admin/README.md
packages/shared/README.md
packages/api_client/README.md
packages/design_system/README.md
infra/docker/docker-compose.yml
infra/docker/README.md
infra/nginx/README.md
infra/postgres/README.md
infra/redis/README.md
infra/minio/README.md
scripts/dev.sh
scripts/reset.sh
scripts/healthcheck.sh
docs/README.md
.env.example
Makefile
"

for path in $required_paths; do
  if [ ! -e "$path" ]; then
    echo "Missing required path: $path"
    exit 1
  fi
done

echo "Repository foundation structure is present"
