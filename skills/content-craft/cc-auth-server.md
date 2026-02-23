---
name: 'cc-auth-server'
description: 'Server-side authentication pattern with Supabase and Next.js.
Always use getUser() for auth verification - getSession() reads unverified data from cookies.
Session establishment is debounced (5s) to prevent infinite loops from onAuthStateChange events.'
---

# Server-Side Authentication Pattern

This document describes how server-side authentication is implemented in Content-Craft, following Supabase's recommended patterns for Next.js Server Components.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Server Side                              │
│  ┌─────────────────┐    ┌──────────────────────────────┐   │
│  │  UserProfile    │───▶│  getServerUser()             │   │
│  │  (Server Comp)  │    │  - Validates JWT via getUser()│   │
│  │                 │    │  - Fetches /api/v1/auth/me   │   │
│  └────────┬────────┘    └──────────────────────────────┘   │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Reads currentWorkspaceId from cookie                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ (passes user data as props)
┌─────────────────────────────────────────────────────────────┐
│                     Client Side                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  UserProfileDropdown (Client Component)              │   │
│  │  - Uses useWorkspace() for switching                 │   │
│  │  - Handles interactive dropdown                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  WorkspaceContext                                    │   │
│  │  - Stores workspace ID in localStorage + cookie      │   │
│  │  - Syncs across tabs via BroadcastChannel            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

| File | Type | Purpose |
|------|------|---------|
| `src/lib/auth/server-auth.ts` | Utility | `getServerUser()` - fetches user on server |
| `src/components/layout/UserProfile.tsx` | Server Component | Fetches user, reads workspace cookie |
| `src/components/layout/UserProfileDropdown.tsx` | Client Component | Interactive dropdown menu |
| `src/components/layout/HeaderServer.tsx` | Server Component | Server-rendered header |
| `src/components/layout/HeaderClientControls.tsx` | Client Component | Theme toggle, notifications |
| `src/contexts/WorkspaceContext.tsx` | Client Context | Workspace state management |

## Server-Side: Getting User Data

### Using `getServerUser()`

```typescript
import { getServerUser, getUserDisplayName } from '@/lib/auth/server-auth'

export default async function MyServerPage() {
  const { user, error } = await getServerUser()

  if (!user) {
    redirect('/auth/login')
  }

  return <div>Hello {getUserDisplayName(user)}</div>
}
```

### What `getServerUser()` Returns

```typescript
interface ServerUser {
  id: string
  email: string
  name?: string
  avatar_url?: string
  role: 'user' | 'workspace_admin' | 'super_admin'
  workspaces: UserWorkspace[]
  default_workspace_id?: string
  current_workspace_id?: string
}

interface ServerAuthResult {
  user: ServerUser | null
  error: string | null
  accessToken: string | null  // For server-side API calls
}
```

### Using Access Token for Server-Side API Calls

When making server-to-server API calls from Server Components, use the `accessToken` from `getServerUser()`:

```typescript
export async function MyServerComponent() {
  const { user, accessToken } = await getServerUser()

  if (!user || !accessToken) {
    return <div>Not authenticated</div>
  }

  // Use accessToken for server-side API calls
  const response = await fetch(`${API_URL}/api/v1/some-endpoint`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  const data = await response.json()
  return <div>{data.name}</div>
}
```

### Security: getUser() vs getSession()

**IMPORTANT**: Always use `getUser()` for server-side auth checks.

| Method | Security | Use Case |
|--------|----------|----------|
| `getSession()` | ❌ Not secure | Only for getting access token |
| `getUser()` | ✅ Secure | Validates JWT on Supabase server |

```typescript
// ❌ WRONG - Don't trust getSession() for auth
const { data: { session } } = await supabase.auth.getSession()
if (!session) redirect('/login') // JWT could be forged!

// ✅ CORRECT - Use getUser() which validates on server
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login') // JWT validated by Supabase
```

## Client-Side: Getting Workspace ID

### Using WorkspaceContext

```typescript
'use client'

import { useWorkspace } from '@/contexts/WorkspaceContext'

export function MyClientComponent() {
  const {
    currentWorkspace,    // Current workspace object
    switchWorkspace,     // Function to switch workspaces
    isSwitching,         // Loading state during switch
  } = useWorkspace()

  // Get workspace ID
  const workspaceId = currentWorkspace?.workspace_id

  return (
    <div>
      Current workspace: {currentWorkspace?.workspace_name}
      <button onClick={() => switchWorkspace('other-id')}>
        Switch
      </button>
    </div>
  )
}
```

### Getting Workspace ID for API Calls

The API client automatically includes the workspace ID in headers:

```typescript
import { apiClient } from '@/lib/api/client'

// Workspace ID is automatically added to X-Workspace-ID header
const response = await apiClient.get('/api/v1/content')
```

If you need the ID manually:

```typescript
import { useWorkspace } from '@/contexts/WorkspaceContext'

function MyComponent() {
  const { currentWorkspace } = useWorkspace()
  const workspaceId = currentWorkspace?.workspace_id

  // Use workspaceId for custom API calls
}
```

## Server-Side: Getting Workspace ID

Read from the cookie that WorkspaceContext sets:

```typescript
import { cookies } from 'next/headers'

export async function MyServerComponent() {
  const cookieStore = await cookies()
  const currentWorkspaceId = cookieStore.get('currentWorkspaceId')?.value

  // Use with user data
  const { user } = await getServerUser()
  const workspace = user?.workspaces?.find(
    w => w.workspace_id === currentWorkspaceId
  )
}
```

## Workspace Persistence

Workspace selection is persisted in two places:

| Storage | Purpose | Scope |
|---------|---------|-------|
| `localStorage` | Client-side hydration | Per-browser |
| `cookie` | Server-side rendering | Per-browser |

When user switches workspaces:
1. `switchWorkspace()` calls API to verify access
2. Stores ID in `localStorage` AND `cookie`
3. Broadcasts to other tabs via `BroadcastChannel`
4. Reloads page to refresh data

## Component Separation Rules

### Server Components CAN:
- Fetch data with `await`
- Read cookies with `cookies()`
- Access environment variables
- Import other Server Components

### Server Components CANNOT:
- Use hooks (`useState`, `useEffect`, etc.)
- Use browser APIs (`window`, `localStorage`)
- Handle events (`onClick`, etc.)
- Use Context (`useContext`)

### Client Components CAN:
- Use all React hooks
- Handle user interactions
- Access browser APIs
- Use Context

### Pattern: Server → Client Data Flow

```typescript
// ServerComponent.tsx (no "use client")
import { ClientComponent } from './ClientComponent'

export async function ServerComponent() {
  const data = await fetchData() // Server-side fetch
  return <ClientComponent data={data} /> // Pass as props
}

// ClientComponent.tsx
"use client"
export function ClientComponent({ data }) {
  const [state, setState] = useState(data)
  return <button onClick={() => setState(...)}>Click</button>
}
```

## Barrel Export Warning

**IMPORTANT**: Do NOT export Server Components through barrel files (index.ts).

```typescript
// ❌ WRONG - causes webpack bundling errors
// index.ts
export { UserProfile } from './UserProfile' // Server Component

// ✅ CORRECT - import Server Components directly
import { UserProfile } from '@/components/layout/UserProfile'
```

## Test Page

Visit `/test-server-auth` to see the pattern in action:
- User data fetched on server (no loading spinner)
- Workspace persists across page reloads
- Interactive dropdown still works

## Quick Reference

### Get User (Server)
```typescript
const { user } = await getServerUser()
```

### Get Workspace ID (Client)
```typescript
const { currentWorkspace } = useWorkspace()
const id = currentWorkspace?.workspace_id
```

### Get Workspace ID (Server)
```typescript
const cookieStore = await cookies()
const id = cookieStore.get('currentWorkspaceId')?.value
```

### Check if Authenticated (Server)
```typescript
const { user } = await getServerUser()
if (!user) redirect('/auth/login')
```
