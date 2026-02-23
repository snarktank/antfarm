---
name: cc-nextjs-serverside
description: >-
  Enforce Next.js App Router Server Component architecture.
  Pages and layouts default to Server Components for performance.
  Push interactivity to leaf Client Components ("client islands").
  Use when creating pages, reviewing component architecture, or optimizing bundle size.
version: 1.0.0
tags: [Next.js, Server Components, Client Components, App Router, Performance, RSC, SSR]
---

# Next.js Server-First Architecture

Enforce the Server Components pattern in Next.js App Router for optimal performance.

## Core Principle

> **Server Components are the default. Client Components are the exception.**

In the App Router, all components are **Server Components** by default. Only add `'use client'` when you need interactivity, browser APIs, or React hooks like `useState`/`useEffect`.

## The "Leaf Components" Pattern

Push interactivity to the **leaves** of your component tree:

```
Layout (Server)
├── Header (Server)
│   ├── Logo (Server)
│   └── SearchBar (Client) ← leaf with interactivity
├── Sidebar (Server)
│   └── NavLinks (Server)
└── Main Content (Server)
    ├── ArticleList (Server)
    └── LikeButton (Client) ← leaf with interactivity
```

**Key insight:** The `'use client'` directive creates a **boundary**. Everything below that boundary (imports and children) becomes client-side. Keep this boundary as low as possible.

## When to Use Each Component Type

### Use Server Components (default) for:
- **Data fetching** - Direct database/API access
- **Secrets** - Access to API keys, tokens
- **Static content** - Text, images, layouts
- **Heavy dependencies** - Keep large libraries off the client bundle

### Use Client Components (`'use client'`) only for:
- **Interactivity** - `onClick`, `onChange`, form submissions
- **State** - `useState`, `useReducer`
- **Effects** - `useEffect`, `useLayoutEffect`
- **Browser APIs** - `localStorage`, `window`, `navigator`
- **Custom hooks** - That use any of the above

## Correct Patterns

### Pattern 1: Interactive Elements as Leaf Components

```tsx
// app/products/page.tsx (Server Component - NO directive)
import { ProductCard } from './product-card'
import { AddToCartButton } from './add-to-cart-button' // Client Component

export default async function ProductsPage() {
  const products = await getProducts() // Server-side data fetch
  return (
    <div>
      {products.map(product => (
        <ProductCard key={product.id} product={product}>
          <AddToCartButton productId={product.id} /> {/* Client leaf */}
        </ProductCard>
      ))}
    </div>
  )
}
```

```tsx
// app/products/add-to-cart-button.tsx (Client Component)
'use client'
import { useState } from 'react'

export function AddToCartButton({ productId }: { productId: string }) {
  const [isAdding, setIsAdding] = useState(false)
  
  const handleClick = async () => {
    setIsAdding(true)
    await addToCart(productId)
    setIsAdding(false)
  }
  
  return (
    <button onClick={handleClick} disabled={isAdding}>
      {isAdding ? 'Adding...' : 'Add to Cart'}
    </button>
  )
}
```

### Pattern 2: Composition via Children (Server inside Client)

```tsx
// app/layout.tsx (Server Component)
import { Modal } from './modal'
import { ProductDetails } from './product-details'

export default function Layout({ children }) {
  return (
    <Modal> {/* Client Component */}
      <ProductDetails /> {/* Server Component passed as children */}
    </Modal>
  )
}
```

```tsx
// app/modal.tsx (Client Component)
'use client'
import { useState } from 'react'

export function Modal({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open</button>
      {isOpen && (
        <div className="modal">
          {children} {/* Server Component renders here */}
          <button onClick={() => setIsOpen(false)}>Close</button>
        </div>
      )}
    </>
  )
}
```

### Pattern 3: Context Providers (Render Deep in Tree)

```tsx
// app/providers.tsx (Client Component)
'use client'
import { ThemeProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}
```

```tsx
// app/layout.tsx (Server Component)
import { Providers } from './providers'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

**Best practice:** Render providers as deep as possible to preserve static optimization for Server Components above them.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Marking Entire Pages as Client Components

```tsx
// ❌ BAD - Entire page is client-side
'use client'

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  
  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(setProducts)
  }, [])
  
  return <ProductList products={products} />
}
```

```tsx
// ✅ GOOD - Page is Server Component, only interactive parts are Client
export default async function ProductsPage() {
  const products = await getProducts() // Server-side fetch
  
  return (
    <>
      <ProductList products={products} />
      <FilterControls /> {/* Only this is 'use client' */}
    </>
  )
}
```

### Anti-Pattern 2: Client Directive Too High in Tree

```tsx
// ❌ BAD - 'use client' at layout level kills SSR benefits
'use client'

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  
  return (
    <div>
      <Sidebar isOpen={sidebarOpen} />
      <main>{children}</main>
    </div>
  )
}
```

```tsx
// ✅ GOOD - Extract only the interactive toggle
// dashboard/layout.tsx (Server Component)
export default function DashboardLayout({ children }) {
  return (
    <div className="flex">
      <SidebarWrapper /> {/* Contains client toggle */}
      <main>{children}</main>
    </div>
  )
}

// dashboard/sidebar-wrapper.tsx (Client Component)
'use client'

export function SidebarWrapper() {
  const [isOpen, setIsOpen] = useState(true)
  
  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>
      <Sidebar isOpen={isOpen} />
    </>
  )
}
```

### Anti-Pattern 3: Fetching Data in Client Components

```tsx
// ❌ BAD - Creates waterfall and exposes API to client
'use client'

export function UserProfile({ userId }) {
  const [user, setUser] = useState(null)
  
  useEffect(() => {
    fetch(`/api/users/${userId}`).then(r => r.json()).then(setUser)
  }, [userId])
  
  return user ? <Profile user={user} /> : <Loading />
}
```

```tsx
// ✅ GOOD - Fetch on server, pass data as props
// Server Component
export default async function UserProfilePage({ params }) {
  const user = await getUser(params.userId) // Direct DB access
  
  return (
    <Profile user={user}>
      <FollowButton userId={user.id} /> {/* Client leaf */}
    </Profile>
  )
}
```

## Serialization Rules

When passing data from Server to Client Components:

**Props must be serializable:**
- Strings, numbers, booleans
- Arrays and plain objects
- Dates (serialized as ISO strings)
- `null` and `undefined`

**Not serializable:**
- Functions (except Server Actions)
- Classes and class instances
- React elements/components
- Symbols

```tsx
// ✅ GOOD - Serializable props
<ClientComponent 
  name="John" 
  count={42} 
  items={['a', 'b', 'c']}
  metadata={{ key: 'value' }}
/>

// ❌ BAD - Non-serializable
<ClientComponent 
  formatPrice={price => `$${price}`} // Function not allowed
  user={new User()} // Class instance not allowed
/>
```

## Environment Protection

Use `server-only` package to prevent server code from leaking to client:

```tsx
// lib/db.ts
import 'server-only'

export async function getSecretData() {
  return db.query('SELECT * FROM secrets WHERE key = $1', [process.env.API_KEY])
}
```

If this module is imported into a Client Component, you get a build-time error.

## Quick Decision Flowchart

```
Does this component need...
├── useState/useEffect? → Client Component (leaf)
├── onClick/onChange? → Client Component (leaf)
├── Browser APIs? → Client Component (leaf)
├── Data fetching? → Server Component
├── Environment secrets? → Server Component
├── Heavy dependencies? → Server Component
└── Just rendering props? → Server Component
```

## Review Checklist

When reviewing Next.js code, verify:

- [ ] Pages and layouts are Server Components (no `'use client'`)
- [ ] `'use client'` is only on leaf components that need interactivity
- [ ] Data fetching happens in Server Components, not `useEffect`
- [ ] Props passed to Client Components are serializable
- [ ] Context providers are rendered as deep as possible
- [ ] `server-only` protects sensitive server code
- [ ] No unnecessary Client Component boundaries

## Content-Craft Server-Side Utilities

Content-Craft has established utilities for server-side data fetching. **Always use these instead of creating custom solutions.**

### `serverFetch()` - Server-Side API Calls

Location: `lib/api/server.ts`

```tsx
import { serverFetch } from '@/lib/api/server';

// In a Server Component
export default async function MyPage() {
  const { data, error, status } = await serverFetch<MyDataType>('/api/v1/endpoint');
  
  if (status === 404) notFound();
  if (error) return <ErrorDisplay error={error} />;
  
  return <MyClientComponent initialData={data} />;
}
```

**What it handles automatically:**
- Gets `accessToken` from `getServerUser()`
- Reads `currentWorkspaceId` from cookies
- Sets `Authorization` and `X-Workspace-ID` headers
- Uses `cache: 'no-store'` for fresh data
- Returns typed `{ data, error, status }`

### `getServerUser()` - Server-Side Authentication

Location: `lib/auth/server-auth.ts`

```tsx
import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/auth/server-auth';

export default async function ProtectedPage() {
  const { user, accessToken } = await getServerUser();
  
  if (!user || !accessToken) {
    redirect('/login');
  }
  
  // User is authenticated, proceed with page
  return <PageContent user={user} />;
}
```

### Reference Implementation Pattern

See `app/library/metadata/[id]/page.tsx` for a complete example:

```tsx
// app/my-feature/[id]/page.tsx (Server Component - NO 'use client')
import { redirect, notFound } from 'next/navigation';
import { getServerUser } from '@/lib/auth/server-auth';
import { serverFetch } from '@/lib/api/server';
import { MyFeatureClient, type MyDataType } from './MyFeatureClient';

export const dynamic = 'force-dynamic';

export default async function MyFeaturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  // Server-side auth check
  const { user, accessToken } = await getServerUser();
  if (!user || !accessToken) redirect('/login');
  
  // Server-side data fetch
  const { data, error, status } = await serverFetch<MyDataType>(
    `/api/v1/my-endpoint/${id}`
  );
  
  if (status === 404) notFound();
  
  // Pass serializable data to client component
  return (
    <MyFeatureClient 
      initialData={data}
      userId={user.id}
    />
  );
}
```

```tsx
// app/my-feature/[id]/MyFeatureClient.tsx (Client Component)
'use client';

import { useState } from 'react';

export interface MyDataType {
  id: string;
  name: string;
  // ... other serializable fields
}

interface MyFeatureClientProps {
  initialData: MyDataType | null;
  userId: string;
}

export function MyFeatureClient({ initialData, userId }: MyFeatureClientProps) {
  const [data, setData] = useState(initialData);
  
  // All interactivity here
  return <div>...</div>;
}
```

### Key Content-Craft Patterns

1. **Export types from Client Components**
   - The `WorkspaceData` type is defined in the Client Component and imported by the Server Component

2. **Use `dynamic = 'force-dynamic'`**
   - For pages that need fresh data on every request

3. **Extract user role server-side**
   - `user.workspaces.find(w => w.workspace_id === id)?.role`

4. **Build defaults server-side**
   - Construct `initialData` with fallback values before passing to client

## Official References

- [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [React Server Components](https://react.dev/reference/react/use-server)
- [Composition Patterns](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns)

## Related Skills

- `/react-best-practices` - Performance optimization for React/Next.js
- `/cc-style-guide` - UI styling patterns
