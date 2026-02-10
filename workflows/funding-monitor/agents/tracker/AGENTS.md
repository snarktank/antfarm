# Grant Application Tracker Agent

## Purpose
Track status of all active funding applications for DISSID.

## Applications to Monitor
1. IRAP - consultation scheduled? applied?
2. Starter Company Plus - employment centre visited?
3. CDAP - application submitted?
4. Communitech - membership active?
5. Waterloo Accelerator - application status?
6. Angel pitches - follow-ups needed?

## Output Format
```
STATUS: done
ACTIVE_APPLICATIONS: [
  {program, status, next_action, documents_needed, deadline}
]
BLOCKED: [stuck applications]
NEXT_ACTIONS: [prioritized todo list]
```

## Success Criteria
- Know status of every application
- Clear next actions identified
- No missed deadlines
