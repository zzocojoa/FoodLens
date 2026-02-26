#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ART_DIR="${ROOT_DIR}/artifacts/phase2"

LOCAL_PG_CONTAINER="${LOCAL_PG_CONTAINER:-foodlens-postgres}"
LOCAL_PG_USER="${LOCAL_PG_USER:-foodlens}"
LOCAL_PG_DB="${LOCAL_PG_DB:-foodlens}"
RESTORE_CHECK_DB="${RESTORE_CHECK_DB:-foodlens_restore_check}"

RENDER_API_KEY="${RENDER_API_KEY:-}"
RENDER_SERVICE_ID="${RENDER_SERVICE_ID:-}"
RENDER_PUBLIC_DB_HOST="${RENDER_PUBLIC_DB_HOST:-}"

mkdir -p "${ART_DIR}"
TS="$(date +%Y%m%d-%H%M%S)"
SUMMARY_PATH="${ART_DIR}/cutover-rehearsal-${TS}.summary"

printf '[run_ts] %s\n' "${TS}" > "${SUMMARY_PATH}"
printf '[local_container] %s\n' "${LOCAL_PG_CONTAINER}" >> "${SUMMARY_PATH}"

LOCAL_DUMP="${ART_DIR}/local-${LOCAL_PG_DB}-${TS}.dump"
docker exec -i "${LOCAL_PG_CONTAINER}" pg_dump -U "${LOCAL_PG_USER}" -d "${LOCAL_PG_DB}" -Fc > "${LOCAL_DUMP}"
shasum -a 256 "${LOCAL_DUMP}" > "${LOCAL_DUMP}.sha256"
/opt/homebrew/opt/libpq/bin/pg_restore -l "${LOCAL_DUMP}" > "${LOCAL_DUMP}.list"
wc -l "${LOCAL_DUMP}.list" > "${LOCAL_DUMP}.list.count"

docker exec -i "${LOCAL_PG_CONTAINER}" psql -U "${LOCAL_PG_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${RESTORE_CHECK_DB};" > "${ART_DIR}/local-restore-drop-${TS}.log" 2>&1
docker exec -i "${LOCAL_PG_CONTAINER}" psql -U "${LOCAL_PG_USER}" -d postgres -c "CREATE DATABASE ${RESTORE_CHECK_DB};" > "${ART_DIR}/local-restore-create-${TS}.log" 2>&1
docker exec -i "${LOCAL_PG_CONTAINER}" pg_restore -U "${LOCAL_PG_USER}" -d "${RESTORE_CHECK_DB}" < "${LOCAL_DUMP}" > "${ART_DIR}/local-restore-run-${TS}.log" 2>&1
docker exec -i "${LOCAL_PG_CONTAINER}" psql -U "${LOCAL_PG_USER}" -d "${RESTORE_CHECK_DB}" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname='public';" > "${ART_DIR}/local-restore-tablecount-${TS}.txt"

printf 'local_dump=%s\n' "${LOCAL_DUMP}" >> "${SUMMARY_PATH}"
printf 'local_restore_check=%s\n' "${RESTORE_CHECK_DB}" >> "${SUMMARY_PATH}"

if [[ -n "${RENDER_API_KEY}" && -n "${RENDER_SERVICE_ID}" && -n "${RENDER_PUBLIC_DB_HOST}" ]]; then
  ENV_JSON_TMP="$(mktemp)"
  ENV_KEYS_PATH="${ART_DIR}/render-env-keys-${TS}.txt"
  curl -sS -H "Authorization: Bearer ${RENDER_API_KEY}" "https://api.render.com/v1/services/${RENDER_SERVICE_ID}/env-vars" > "${ENV_JSON_TMP}"

  RAW_URL="$(
    python3 - <<'PY' "${ENV_JSON_TMP}" "${ENV_KEYS_PATH}"
import json
import sys
rows = json.load(open(sys.argv[1]))
keys = []
for row in rows:
    env = row.get("envVar", {})
    key = env.get("key", "")
    if key:
        keys.append(key)
    if env.get("key") == "DATABASE_URL":
        print(env.get("value", ""))
with open(sys.argv[2], "w") as fp:
    for key in sorted(set(keys)):
        fp.write(f"{key}\n")
PY
  )"
  rm -f "${ENV_JSON_TMP}"

  python3 - <<'PY' "${RAW_URL}" "${RENDER_PUBLIC_DB_HOST}" "${ART_DIR}/render-db-meta-${TS}.txt" "${ART_DIR}/render-url-masked-${TS}.txt"
import sys
from urllib.parse import urlparse
raw = sys.argv[1]
host = sys.argv[2]
meta_path = sys.argv[3]
out_path = sys.argv[4]
parsed = urlparse(raw)
user = parsed.username or ""
db = (parsed.path or "/").lstrip("/")
internal_host = parsed.hostname or ""
with open(meta_path, "w") as fp:
    fp.write("AUTH_STATE_BACKEND=postgres\n")
    fp.write("AUTH_STATE_TABLE=auth_runtime_state\n")
    fp.write("AUTH_STATE_KEY=default\n")
    fp.write(f"DATABASE_URL_INTERNAL(masked)=postgresql://{user}:***@{internal_host}/{db}\n")
with open(out_path, "w") as fp:
    fp.write(f"postgresql://{user}:***@{host}:5432/{db}?sslmode=require\n")
PY

  python3 - <<'PY' "${RAW_URL}" "${RENDER_PUBLIC_DB_HOST}" "${ART_DIR}/render-conn-smoke-${TS}.log" "${ART_DIR}/render-restore-attempt-${TS}.log" "${LOCAL_DUMP}" "${SUMMARY_PATH}"
import os
import subprocess
import sys
from urllib.parse import urlparse

raw_url, public_host, conn_log, restore_log, dump_path, summary_path = sys.argv[1:]
parsed = urlparse(raw_url)
user = parsed.username or ""
password = parsed.password or ""
db = (parsed.path or "/").lstrip("/")

env = dict(os.environ)
env["PGPASSWORD"] = password
conn_cmd = [
    "/opt/homebrew/opt/libpq/bin/psql",
    f"host={public_host} port=5432 dbname={db} user={user} sslmode=require connect_timeout=10",
    "-c",
    "select now();",
]
conn_result = subprocess.run(conn_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
with open(conn_log, "w") as fp:
    fp.write(conn_result.stdout)

restore_cmd = [
    "docker",
    "run",
    "--rm",
    "-i",
    "-e",
    f"PGPASSWORD={password}",
    "-e",
    "PGSSLMODE=require",
    "public.ecr.aws/docker/library/postgres@sha256:97ff59a4e30e08d1c11bdcd9455e7832368c0572b576c9092cde2df4ae5552a3",
    "pg_restore",
    "-h",
    public_host,
    "-p",
    "5432",
    "-U",
    user,
    "-d",
    db,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
]
with open(dump_path, "rb") as dump_fp:
    restore_result = subprocess.run(restore_cmd, stdin=dump_fp, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
with open(restore_log, "wb") as fp:
    fp.write(restore_result.stdout)

with open(summary_path, "a") as fp:
    fp.write(f"render_conn_exit={conn_result.returncode}\n")
    fp.write(f"render_restore_exit={restore_result.returncode}\n")
PY

  if grep -q "SSL connection has been closed unexpectedly" "${ART_DIR}/render-conn-smoke-${TS}.log"; then
    HINT_PATH="${ART_DIR}/render-internal-smoke-hint-${TS}.txt"
    cat > "${HINT_PATH}" <<'EOF'
[Phase2] External TLS path to Render Postgres failed.
Run this DB smoke test inside Render web service shell (where DATABASE_URL is injected):

python - <<'PY'
import os
from psycopg import connect

database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL is missing. Run this inside Render web service shell.")

with connect(database_url) as conn:
    with conn.cursor() as cur:
        cur.execute("select now();")
        print(cur.fetchone())
PY
EOF
    printf 'render_internal_smoke_hint=%s\n' "${HINT_PATH}" >> "${SUMMARY_PATH}"
  fi
else
  printf 'render_checks=skipped (set RENDER_API_KEY, RENDER_SERVICE_ID, RENDER_PUBLIC_DB_HOST)\n' >> "${SUMMARY_PATH}"
fi

docker exec -i "${LOCAL_PG_CONTAINER}" psql -U "${LOCAL_PG_USER}" -d "${LOCAL_PG_DB}" -Atc "SELECT count(*) FROM auth_runtime_state;" > "${ART_DIR}/local-primary-auth-state-count.txt"
docker exec -i "${LOCAL_PG_CONTAINER}" psql -U "${LOCAL_PG_USER}" -d "${RESTORE_CHECK_DB}" -Atc "SELECT count(*) FROM auth_runtime_state;" > "${ART_DIR}/local-restore-auth-state-count.txt"
docker exec -i "${LOCAL_PG_CONTAINER}" psql -U "${LOCAL_PG_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${RESTORE_CHECK_DB};" > "${ART_DIR}/local-restore-cleanup.log" 2>&1

printf '%s\n' "${TS}" > "${ART_DIR}/last-run-ts.txt"
echo "[Phase2 Cutover Rehearsal] completed: ${SUMMARY_PATH}"
