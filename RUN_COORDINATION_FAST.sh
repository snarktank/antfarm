#!/usr/bin/env bash
set -euo pipefail
AF_ROOT="/root/smartfunds/src/antfarm"
DB="/root/.openclaw/antfarm/antfarm.db"
WF_ID="feature-dev"
SERVICE="antfarm-worker.service"
LOG="/var/log/antfarm/worker.log"

systemctl is-active "$SERVICE"
systemctl show "$SERVICE" -p ExecStart -p Environment --no-pager

RUN_ID="$(sqlite3 "$DB" "select id from runs where workflow_id='${WF_ID}' order by created_at desc limit 1;")"
if [ -n "$RUN_ID" ]; then
  sqlite3 -header -column "$DB" "select step_index,step_id,agent_id,status from steps where run_id='${RUN_ID}' order by step_index;"
  sqlite3 "$DB" "update runs set status='failed' where id='${RUN_ID}' and status='running';"
  sqlite3 "$DB" "update steps set status='failed', output=coalesce(output,'') || char(10) || '[auto reset stale]' where run_id='${RUN_ID}' and status in ('waiting','running');"
fi

systemctl restart "$SERVICE"
cd "$AF_ROOT"
./bin/antfarm workflow run "$WF_ID" "post-upgrade coordination $(date -Iseconds)"

NEW_RUN_ID="$(sqlite3 "$DB" "select id from runs where workflow_id='${WF_ID}' order by created_at desc limit 1;")"
echo "NEW_RUN_ID=$NEW_RUN_ID"
for i in $(seq 1 20); do
  echo "--- poll $i ---"
  sqlite3 -header -column "$DB" "select step_index,step_id,agent_id,status from steps where run_id='${NEW_RUN_ID}' order by step_index;"
  sleep 3
done

tail -n 120 "$LOG"
