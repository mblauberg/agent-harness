---
title: Prevent Hydration Mismatch Without Flickering
impact: MEDIUM
impactDescription: avoids visual flicker and hydration errors
tags: rendering, ssr, hydration, localStorage, flicker
---

## Prevent Hydration Mismatch Without Flickering

For a presentation preference that exists only in client storage, a small
pre-hydration script can avoid SSR breakage and visual flicker. Prefer a
server-readable cookie when possible. Never use client storage or DOM state as
authentication or authorisation authority.

**Incorrect (breaks SSR):**

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  // localStorage is not available on server - throws error
  const theme = localStorage.getItem('theme') || 'light'
  
  return (
    <div className={theme}>
      {children}
    </div>
  )
}
```

Server-side rendering will fail because `localStorage` is undefined.

**Incorrect (visual flickering):**

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState('light')
  
  useEffect(() => {
    // Runs after hydration - causes visible flash
    const stored = localStorage.getItem('theme')
    if (stored) {
      setTheme(stored)
    }
  }, [])
  
  return (
    <div className={theme}>
      {children}
    </div>
  )
}
```

Component first renders with default value (`light`), then updates after hydration, causing a visible flash of incorrect content.

**Correct for a theme preference (framework script plus CSP nonce):**

```tsx
import Script from 'next/script'

function RootLayout({ children, nonce }: { children: ReactNode; nonce: string }) {
  return (
    <html suppressHydrationWarning>
      <head>
        <Script id="theme-boot" strategy="beforeInteractive" nonce={nonce}>{`
            (function() {
              try {
                var theme = localStorage.getItem('theme') || 'light';
                document.documentElement.className = theme;
              } catch (e) {}
            })();
        `}</Script>
      </head>
      <body>{children}</body>
    </html>
  )
}
```

The nonce must match the response Content Security Policy. Keep the script
constant and minimal; do not interpolate user-controlled text. This exception
fits themes and similar display preferences, not identity, permissions or
security decisions.
