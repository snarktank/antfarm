# Antfarm v0.5.1 Upgrade Runbook (EC2)

## Objective
- Keep antfarm stable at `v0.5.1` on EC2 with reversible, evidence-first operations.
- Avoid workflow uninstall-first flow that can remove CLI usability.

## Known-Good State
- CLI path: `/home/ubuntu/.npm-global/bin/antfarm`
- Install source: clean `v0.5.1` worktree under `/home/ubuntu/.openclaw/workspace/antfarm_wt_v051_clean_<UTC>`
- Verified snapshot artifact: `/home/ubuntu/.openclaw/workspace/antfarm/derived/evidence-antfarm-v051-stable-snapshot-20260215-062746Z.txt`

## Critical Rules
- Agent IDs in `v0.5.1` use underscore delimiters:
  - Example: `feature-dev_planner` (not `feature-dev-planner`)
- Before completing a claimed step, validate:
  - `claim.runId == RUN_ID`
  - **Hard gate (bin-link):** if `/home/ubuntu/.npm-global/bin/antfarm` is missing, first ensure the bin target exists: `dist/cli/cli.js` in the clean worktree (`npm ci && npm run build`), then `npm install -g .`.
- If mismatch:
  - Stop and do not complete
  - Cancel unintended running run(s)

## Standard Workflow Install Procedure (Safe)
1. Verify CLI and version:
   - `command -v antfarm`
   - `antfarm version`
   - `test -x /home/ubuntu/.npm-global/bin/antfarm || echo "MISSING_CLI_SHIM (see Hard gate)"`
2. Install workflows over top (no uninstall-first):
   - `antfarm workflow install feature-dev`
   - `antfarm workflow install bug-fix`
   - `antfarm workflow install security-audit`
3. Verify:
   - `antfarm workflow list`
   - `antfarm workflow runs`

## Plan-Only Canary Procedure
1. Ensure no active runs:
   - `antfarm workflow runs`
2. Start run and capture UUID:
   - `RUN_ID=$(antfarm workflow run feature-dev "<task>" | rg -o "[0-9a-f-]{36}" | head -n1)`
3. Confirm pending plan agent is underscore-form:
   - `antfarm workflow status "$RUN_ID"`
4. Claim:
   - `CLAIM_JSON=$(antfarm step claim feature-dev_planner)`
5. Gate:
   - Parse `runId` and `stepId` from `CLAIM_JSON`
   - Continue only if `runId` equals `RUN_ID`
6. Complete only first step:
   - `antfarm step complete "<STEP_UUID>" < /tmp/plan.complete.json`
7. Verify plan advanced and stop:
   - `antfarm workflow status "$RUN_ID"`
   - `antfarm workflow stop "$RUN_ID"`

## Recovery if CLI Disappears
1. Build from a fresh clean `v0.5.1` worktree:
   - `npm ci`
   - `npm run build`
2. Reinstall globally:
   - `npm install -g .`
3. Verify:
   - `ls -l /home/ubuntu/.npm-global/bin/antfarm`
   - `/home/ubuntu/.npm-global/bin/antfarm version`

## Decision Gate
- Do not proceed if any condition fails:
  - worktree dirty
  - tag mismatch
  - running workflows during manual claim flow
  - `claim.runId != RUN_ID`
