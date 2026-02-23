---
name: cc-frontend-dev
description: >-
  Create beautiful, consistent frontend interfaces using shadcn/ui and the Terminal Elegance design system.
  Use when building new pages, components, or UI features. Provides light/dark mode patterns,
  color schemes, component structures, and UX planning methodology.
version: 1.0.0
author: Content-Craft Team
tags: [frontend, design, shadcn, ui, components, terminal-elegance]
---

# Content-Craft Frontend Developer

Build graceful, consistent interfaces using the Terminal Elegance design system with proper light/dark mode support.

## When to Use

- Creating new pages or major UI sections
- Building reusable components
- Implementing features with complex UI
- Ensuring design consistency across the app

## Quick Reference

### Theme Detection Pattern

```typescript
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const { resolvedTheme } = useTheme();
const isDarkMode = resolvedTheme === 'dark';
```

### Core Color Palette

| Element | Dark Mode | Light Mode |
|---------|-----------|------------|
| **Background** | `bg-zinc-950` | `bg-stone-50` |
| **Surface** | `bg-zinc-900/80` | `bg-white` |
| **Border** | `border-zinc-800` | `border-stone-200` |
| **Text Primary** | `text-zinc-100` | `text-stone-900` |
| **Text Secondary** | `text-zinc-400` | `text-stone-600` |
| **Text Muted** | `text-zinc-500` | `text-stone-500` |

### Accent Colors (Consistent Across Modes)

| Purpose | Dark | Light |
|---------|------|-------|
| Primary | `orange-500` | `orange-500` |
| Success | `emerald-400` | `emerald-700` |
| Warning | `amber-400` | `amber-700` |
| Error | `red-400` | `red-600` |
| Info | `blue-400` | `blue-700` |
| Highlight | `violet-400` | `violet-700` |
| Cyan accent | `cyan-400` | `cyan-700` |

## Component Pattern

```typescript
function MyComponent({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className={cn(
      "rounded-xl border transition-all duration-300",
      isDarkMode
        ? "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
        : "border-stone-200 bg-white hover:border-stone-300"
    )}>
      {/* content */}
    </div>
  );
}
```

## UX Planning Checklist

Before implementing:

1. **Layout Structure** - Define grid/flex layout, responsive breakpoints
2. **State Management** - Loading, empty, error, success states
3. **Interactions** - Hover, focus, active states
4. **Accessibility** - Keyboard navigation, ARIA labels
5. **Light/Dark Mode** - Test both themes thoroughly

## MCP Tools

### shadcn MCP
Use for component discovery and implementation:

```
mcp__shadcn__search_items_in_registries - Find components
mcp__shadcn__view_items_in_registries - Get component details
mcp__shadcn__get_item_examples_from_registries - Usage examples
mcp__shadcn__get_add_command_for_items - Install commands
```

## References

- [Terminal Elegance Design System](references/terminal-elegance.md) - Complete theme patterns
- [Component Patterns](references/component-patterns.md) - Reusable component structures
