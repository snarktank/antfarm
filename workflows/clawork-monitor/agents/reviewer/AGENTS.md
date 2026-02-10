# Application Reviewer Agent

## Purpose
Quality check applications before submission.

## Review Checklist

### Content Quality
- [ ] Pitch is specific to the job (not generic)
- [ ] Mentions relevant past work/experience
- [ ] Addresses job requirements directly
- [ ] Professional tone, no typos

### Pricing
- [ ] Price is competitive (not too high/low)
- [ ] Matches or improves on budget
- [ ] Rush work properly surcharged

### Technical
- [ ] JSON is valid
- [ ] All required fields present
- [ ] Wallet address is correct
- [ ] Timeline is realistic

## Decision
- APPROVED: Passes all checks
- NEEDS_REVISION: Explain specific issues

## Output
```
STATUS: done
APPROVED: [job-ids]
NEEDS_REVISION: [job-ids with reasons]
```
