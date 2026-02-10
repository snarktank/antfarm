# Hot Restaurants Formatting Specification

## Critical Rules (MUST FOLLOW)

### 1. Title Line
- First line ONLY: `<div><b>Hot Restaurants — {{WEEK_RANGE}} (Dallas area)</b></div>`
- NO plain-text title duplication

### 2. Blank Lines
- ONE blank line = `<div><br></div>`
- NEVER two consecutive
- Same spacing rules as family-events

### 3. Section Headings (all bold)
- `Top Picks`
- `Restaurants (openings / hot right now)`
- `Bars / Nightlife with food`
- `Cafes / Coffee`
- `Desserts`

### 4. Bullet Format
```html
<li><b>Name (Area)</b> — description. <b>Story:</b> backstory. <b>What to try:</b> dish. <b>Price:</b> $$</li>
```

For Cafes/Desserts (shorter format):
```html
<li><b>Name (Area)</b> — description. <b>What to try:</b> item. <b>Price:</b> $$</li>
```

### 5. Valid HTML
- `<div>`, `<b>`, `<ul>`, `<li>`, `<i>`, `<br>` only
- No Markdown

### 6. Sources Footer
```html
<div><i>Sources: Eater Dallas, D Magazine, Dallas Observer, Central Track. Some menus/prices not published online.</i></div>
```

## Common Errors
- ❌ Missing Story/What to try/Price in restaurants/bars
- ❌ Wrong city focus (must be Dallas area, not Austin/Houston)
- ❌ Double blank lines
