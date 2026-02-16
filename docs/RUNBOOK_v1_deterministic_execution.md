Runbook v1 — Deterministic Smoke Workflow Completion
What this runbook is 

Use this to:

confirm the milestone is working end-to-end

create a clean PR “proof” that the smoke workflow completes deterministically

0) Start in the right directory
cd /root/smartfunds/src/antfarm

1) Confirm DB env var (important)
export ANTFARM_DB="/root/.openclaw/antfarm/antfarm.db"
echo "$ANTFARM_DB"
ls -la "$ANTFARM_DB"

2) Start a new smoke run
./bin/antfarm workflow run smoke "pre-AFK verification"


You should see a Run: <uuid> printed.

3) Run alpha step through deterministic runner
node scripts/step_runner.cjs smoke/alpha


Expected:

Either NO_WORK (if nothing claimable), OR a JSON-ish response showing it advanced.

In your successful case earlier: {"advanced":true,"runCompleted":false} is good.

4) Run beta step through deterministic runner
node scripts/step_runner.cjs smoke/beta


Expected:

In the final step: {"advanced":false,"runCompleted":true} (or equivalent) indicates the run is complete.

5) Verify in the DB (hard confirmation)

First get the newest smoke run:

sqlite3 "$ANTFARM_DB" -header -column "
SELECT id, status, created_at
FROM runs
WHERE workflow_id='smoke'
ORDER BY created_at DESC
LIMIT 3;
"


Then verify steps for the newest run id you see:

RUN_ID="<paste-latest-run-uuid-here>"

sqlite3 "$ANTFARM_DB" -header -column "
SELECT step_index, agent_id, status, updated_at
FROM steps
WHERE run_id='$RUN_ID'
ORDER BY step_index;
"


You want:

run status = completed

both steps = done

6) If things get stuck (only then): reset stuck “running” smoke runs

Use only if you see runs stuck in running and nothing can claim.

sqlite3 "$ANTFARM_DB" "
UPDATE runs
SET status='failed'
WHERE workflow_id='smoke' AND status='running';
"


Then start a fresh smoke run again (Step 2).

7) Common “beginner gotchas”
“scroll up/down doesn’t work” when viewing diffs

You were likely inside a pager (less) from git diff.

Press q to quit.

Use arrows / PgUp/PgDn while inside.

Don’t use Ctrl+C; it often won’t exit less.

“[200~” appears and commands break

That’s “bracketed paste” junk. Just retype the command normally (don’t paste), or disable bracketed paste in terminal settings.