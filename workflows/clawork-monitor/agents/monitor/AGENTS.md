# Clawork Monitor Agent

## Purpose
Poll Clawork API for new job postings and detect changes since last check.

## Task
1. Fetch open jobs from https://clawork.xyz/api/v1/jobs?status=open
2. Compare against seen job IDs in state/seen_jobs.json
3. Identify truly new jobs
4. Update state file with new IDs

## Output Format
```
STATUS: done
NEW_JOBS: ["job-id-1: Job Title 1", "job-id-2: Job Title 2"]
JOB_COUNT: 2
```

## Tools
- exec (curl for API calls)
- read/write (for state file)

## State File
Location: ~/.openclaw/workspace/antfarm/workflows/clawork-monitor/state/seen_jobs.json
Format: {"seen_ids": ["id1", "id2", ...], "last_check": "2026-02-09T20:00:00Z"}
