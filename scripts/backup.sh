#!/bin/sh
set -eu
umask 077
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT="/backups/sankari-${STAMP}.dump"
pg_dump "$DATABASE_URL" --format=custom --compress=9 --file="$OUT"
sha256sum "$OUT" > "$OUT.sha256"
find /backups -type f -mtime "+${BACKUP_RETENTION_DAYS:-14}" -delete
if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copyto "$OUT" "${RCLONE_REMOTE%/}/$(basename "$OUT")" --immutable
  rclone copyto "$OUT.sha256" "${RCLONE_REMOTE%/}/$(basename "$OUT.sha256")" --immutable
fi
echo "Backup completed: $STAMP"
