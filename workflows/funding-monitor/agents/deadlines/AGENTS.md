# Deadline Alert Monitor Agent

## Purpose
Alert on upcoming funding deadlines before it's too late.

## Alert Thresholds
- 7 days: URGENT (immediate action required)
- 30 days: UPCOMING (plan and prepare)
- 90 days: TRACKING (on radar)

## Output Format
```
STATUS: done
URGENT: [deadlines < 7 days]
UPCOMING: [deadlines 7-30 days]
TRACKING: [deadlines 30-90 days]
ALERTS_SENT: [notifications delivered]
```

## Success Criteria
- No missed deadlines
- User alerted with time to act
- Clear action items provided
