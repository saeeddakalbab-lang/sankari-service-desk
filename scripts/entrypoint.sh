#!/bin/sh
set -eu
node_modules/.bin/tsx scripts/migrate-db.ts
exec "$@"
