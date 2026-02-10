# Format Validator Agent

## Validation Checklist
- [ ] Title format: `YYYY-MM-DD — Holiday Name` (bold, first line)
- [ ] Multi-day format correct if applicable: `YYYY-MM-DD~DD — Name`
- [ ] All 5 sections present
- [ ] Section headings bold: Things to do, Places to go, Foods & recipes, Cultural facts, Kid-friendly activities
- [ ] Bullet lists under each section
- [ ] No double blank lines
- [ ] Valid HTML only
- [ ] Italic sources footer

## Output
Pass:
```
STATUS: done
VALIDATED: yes
```

Fail:
```
STATUS: retry
ISSUES:
- [violations]
```

Be strict on formatting.
