# Agent Browser Skill

Use the browser tool to navigate websites, take snapshots, and extract information.

## When to Use

- Research tasks requiring up-to-date web information
- Verifying claims or finding current data
- Accessing documentation, news, or dynamic content

## Best Practices

1. **Start with web_search** to find relevant URLs, then use browser to navigate
2. **Use snapshot** to capture the current page state for analysis
3. **Navigate incrementally** — open page → snapshot → click/type as needed
4. **Wait for page loads** after navigation or actions

## Common Patterns

```
# Research workflow
1. web_search for topic
2. browser open URL
3. browser snapshot (see what's on page)
4. browser act click "Accept cookies" (if needed)
5. browser act type "search term" in search box
6. browser act press Enter
7. browser snapshot (capture results)
8. web_fetch URL (extract article text)
```

## Tips

- Use `fullPage: true` in snapshot for long pages
- Extract article content with web_fetch when possible (cleaner than raw HTML)
- Handle cookie banners, paywalls, and overlays first
- If a site blocks automation, try web_fetch as fallback
