# Holiday Formatting Specification

## Critical Rules

### 1. Title
- Format: `<div><b>YYYY-MM-DD — Holiday Name</b></div>`
- First line ONLY
- Date in ISO format (YYYY-MM-DD)

### 2. Sections (5 required, all bold)
1. `Things to do`
2. `Places to go`
3. `Foods & recipes`
4. `Cultural facts`
5. `Kid-friendly activities`

### 3. Spacing
- One blank line = `<div><br></div>`
- Never two consecutive
- One blank line between sections

### 4. Bullets
```html
<li>Item: description</li>
```

### 5. Sources Footer
Italic final line with citations.

## Example
```html
<div><b>2026-02-17 — Lunar New Year</b></div>
<div><br></div>
<div><b>Things to do</b></div>
<div><ul>
  <li>Make paper lanterns: Fold red paper into traditional lanterns</li>
</ul></div>
<div><br></div>
<!-- ... remaining sections ... -->
```

## Multi-day Holidays
- Title: `YYYY-MM-DD~DD — Holiday Name`
- Example: `2026-09-24~26 — Chuseok`
