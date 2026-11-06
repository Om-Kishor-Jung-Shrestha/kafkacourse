#!/bin/bash
set -e

wait_for() {
  echo "[entrypoint] waiting for $1..."
  until (echo > /dev/tcp/"$1"/"$2") 2>/dev/null; do sleep 1; done
  echo "[entrypoint] $1 is up"
}

wait_for postgres 5432
wait_for pgbouncer 5432
wait_for redis 6379

echo "[entrypoint] pushing prisma schema (via DIRECT_DATABASE_URL, bypassing pgbouncer)..."
npx prisma db push --skip-generate --accept-data-loss

echo "[entrypoint] seeding database (safe to re-run, upserts only)..."
npx ts-node prisma/seed.ts || echo "[entrypoint] seed skipped/failed, continuing"

echo "[entrypoint] starting NestJS in watch mode..."
exec npm run start:dev
