'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logout } from '@/app/actions/auth'

// ---------------------------------------------------------------------------
// Nav Items (matches Sidebar)
// ---------------------------------------------------------------------------

function MaterialIcon({ name }: { name: string }) {
  return (
    <span
      className="material-symbols-outlined inline-flex items-center justify-center"
      style={{ fontSize: '22px', fontWeight: 300 }}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}

const navItems = [
  { label: 'Decks', icon: 'grid_view', href: '/' },
  { label: 'Card Management', icon: 'modeling', href: '/allocation' },
  { label: 'Collection', icon: 'newsstand', href: '/collection' },
  { label: 'Binders', icon: 'shelves', href: '/storage' },
  { label: 'Scan', icon: 'photo_camera', href: '/scan' },
  { label: 'Brew Deck', icon: 'science', href: '/new-deck' },
  { label: 'Settings', icon: 'settings', href: '/settings' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MobileHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Close drawer on navigation
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Close on escape key
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Hide on auth pages
  if (pathname === '/login' || pathname.startsWith('/auth/')) {
    return null
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Sticky top bar — mobile only */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-sidebar px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
        <span className="text-[length:var(--fs-lg)] font-medium tracking-tight text-foreground">
          The Oracle
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
          aria-label="Open menu"
        >
          <Menu className="size-6" />
        </button>
      </header>

      {/* Overlay drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer panel — slides in from right */}
          <nav
            className="absolute right-0 top-0 flex h-full w-[280px] flex-col border-l border-border bg-sidebar"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-[length:var(--fs-lg)] font-medium text-foreground">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <ul className="space-y-1">
                {navItems.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[length:var(--fs-md)] font-medium transition-colors',
                          active
                            ? 'bg-[var(--accent-primary-bg)] text-[var(--accent-primary)]'
                            : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                        )}
                      >
                        <MaterialIcon name={item.icon} />
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* Footer — logout */}
            <div className="border-t border-border px-3 py-4">
              <button
                type="button"
                onClick={() => { logout(); setOpen(false) }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[length:var(--fs-md)] font-medium text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
              >
                <MaterialIcon name="logout" />
                Sign out
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  )
}
