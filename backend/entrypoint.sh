#!/bin/sh
set -e

POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

echo "==> [1/3] Waiting for PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
python3 - << 'PYEOF'
import os, sys, time

try:
    import psycopg2
except ImportError:
    print("  psycopg2 not found — skipping wait, relying on healthcheck.", flush=True)
    sys.exit(0)

host     = os.environ.get("POSTGRES_HOST", "db")
port     = int(os.environ.get("POSTGRES_PORT", "5432"))
user     = os.environ.get("POSTGRES_USER", "mpwik")
password = os.environ.get("POSTGRES_PASSWORD", "devpassword")
dbname   = os.environ.get("POSTGRES_DB", "mpwik_lublin")

for attempt in range(1, 31):
    try:
        conn = psycopg2.connect(
            host=host, port=port, user=user,
            password=password, dbname=dbname,
            connect_timeout=3,
        )
        conn.close()
        print(f"  PostgreSQL ready after {attempt} attempt(s).", flush=True)
        sys.exit(0)
    except psycopg2.OperationalError as exc:
        print(f"  Attempt {attempt}/30 failed ({exc!r}). Retrying in 2s...", flush=True)
        time.sleep(2)

print("ERROR: PostgreSQL not available after 60 seconds.", file=sys.stderr)
sys.exit(1)
PYEOF

echo "==> [2/3] Applying Alembic migrations (alembic upgrade head)..."
python -m alembic upgrade head

echo "==> [3/3] Starting application..."
exec "$@"
