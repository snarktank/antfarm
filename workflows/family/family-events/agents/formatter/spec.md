# Family Events Formatting Specification

## Critical Rules (MUST FOLLOW)

### 1. Title Line
- First line ONLY: `<div><b>Family & Kid Events — {{WEEK_RANGE}} (North Dallas)</b></div>`
- NO plain-text title before this
- NO duplicate title in body

### 2. Blank Lines
- Represent ONE blank line as: `<div><br></div>`
- NEVER have two consecutive `<div><br></div>`
- One blank line after "By Day" heading
- One blank line after each day's bullet list

### 3. Valid HTML Elements
- `<div>` — structural blocks
- `<b>` — bold text
- `<ul>` `<li>` — bullet lists
- `<i>` — italic (sources footer only)
- `<br>` — line breaks inside divs

### 4. Section Headings (bold)
- `Top Picks`
- `By Day`
- Day subheadings: `Monday (M/D)`, `Tuesday (M/D)`, etc.
- `All-Week / Ongoing`

### 5. Bullet Format
```html
<li><b>Event Name @ Venue (City)</b> — time/short description. <b>Cost:</b> $X</li>
```

### 6. Sources Footer
- Must be italic: `<div><i>Sources: ... Verify registration...</i></div>`
- List actual sources checked

## Example
```html
<div><b>Family & Kid Events — 2/9/26–2/15/26 (North Dallas)</b></div>
<div><br></div>
<div><b>Top Picks</b></div>
<div><ul>
  <li><b>Lunar New Year Festival @ Allen Premium Outlets (Allen)</b> — Sat 12–4pm. Cultural performances, crafts, food vendors. <b>Cost:</b> Free</li>
</ul></div>
<div><br></div>
```

## Common Errors to Avoid
- ❌ Double blank lines
- ❌ Markdown asterisks instead of HTML
- ❌ Plain text title + bold title (duplicate)
- ❌ Missing day subheadings
- ❌ Wrong bullet format (missing bold on Event Name)
