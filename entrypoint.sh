#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "Checking and applying database migrations..."
  if [ -x /migrate ]; then
    /migrate -path=/migrations -database="$DATABASE_URL" up || true
  fi

  if [ -x /seed ]; then
    echo "Running database seeder check..."
    /seed || true
  fi
fi

exec "$@"
