'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, Settings, ChevronDown, Menu, X, LogOut, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logout } from '@/app/actions/auth'
import { useOracle } from '@/contexts/OracleContext'

// Material icon wrapper
function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn('material-symbols-outlined inline-flex items-center justify-center', className)}
      style={{ fontSize: '20px', fontWeight: 300 }}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}

interface NavItem {
  label: string
  href: string
  icon?: string
}

const mainNavItems: NavItem[] = [
  { label: 'Decks', href: '/' },
  { label: 'Explore', href: '/explore' },
  { label: 'Collection', href: '/collection' },
  { label: 'Wishlist', href: '/wishlist' },
]

const toolsMenuItems: NavItem[] = [
  { label: 'Card Management', href: '/allocation', icon: 'modeling' },
  { label: 'Binders', href: '/storage', icon: 'shelves' },
  { label: 'New Deck', href: '/decks/new', icon: 'add_box' },
]

// Mobile nav includes all items
const mobileNavItems: NavItem[] = [
  { label: 'Decks', href: '/', icon: 'grid_view' },
  { label: 'Explore', href: '/explore', icon: 'explore' },
  { label: 'Collection', href: '/collection', icon: 'newsstand' },
  { label: 'Wishlist', href: '/wishlist', icon: 'favorite' },
  { label: 'Card Management', href: '/allocation', icon: 'modeling' },
  { label: 'Binders', href: '/storage', icon: 'shelves' },
  { label: 'New Deck', href: '/decks/new', icon: 'add_box' },
  { label: 'Settings', href: '/settings', icon: 'settings' },
]

export function TopNav() {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isOpen: oracleOpen, toggle: toggleOracle } = useOracle()

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  // Close on escape
  useEffect(() => {
    if (!mobileMenuOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileMenuOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [mobileMenuOpen])

  // Prevent body scroll when mobile menu open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen])

  // Hide on auth pages
  if (pathname === '/login' || pathname.startsWith('/auth/')) {
    return null
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  function isToolsActive() {
    return toolsMenuItems.some(item => isActive(item.href))
  }

  function openSearch() {
    window.dispatchEvent(new CustomEvent('open-search'))
  }

  return (
    <>
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-sidebar">
        <div className="flex h-14 items-center justify-between px-4">
          {/* Left: Logo + Main Nav */}
          <div className="flex items-center gap-6">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm">
                O
              </div>
              <span className="hidden sm:block font-semibold text-lg text-foreground">
                The Oracle
              </span>
            </Link>

            {/* Desktop Main Nav */}
            <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
              {mainNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  {item.label}
                </Link>
              ))}

              {/* Tools Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    'flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isToolsActive()
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  Tools
                  <ChevronDown className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {toolsMenuItems.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href} className="flex items-center gap-2">
                        {item.icon && <MaterialIcon name={item.icon} />}
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>

          {/* Center: Search (desktop) */}
          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <button
              onClick={openSearch}
              className="flex items-center gap-2 w-full px-4 py-2 rounded-lg bg-background border border-border text-sm text-muted-foreground hover:border-muted-foreground/50 transition-colors"
            >
              <Search className="w-4 h-4" />
              <span className="flex-1 text-left">Search cards...</span>
              <kbd className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
          </div>

          {/* Right: Settings + Avatar (desktop) / Menu button (mobile) */}
          <div className="flex items-center gap-2">
            {/* Mobile: Search + Oracle + Menu */}
            <button
              onClick={openSearch}
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>

            <button
              onClick={toggleOracle}
              className={cn(
                'md:hidden p-2 rounded-lg transition-colors',
                oracleOpen
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
              aria-label="Toggle Oracle assistant"
            >
              <MessageSquare className="w-5 h-5" />
            </button>

            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Desktop: Oracle + Settings + Avatar */}
            <button
              onClick={toggleOracle}
              className={cn(
                'hidden md:flex p-2 rounded-lg transition-colors',
                oracleOpen
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
              aria-label="Toggle Oracle assistant"
              title="Oracle (⌘O)"
            >
              <MessageSquare className="w-5 h-5" />
            </button>

            <Link
              href="/settings"
              className={cn(
                'hidden md:flex p-2 rounded-lg transition-colors',
                isActive('/settings')
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </Link>

            {/* Avatar */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="hidden md:flex w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-600 items-center justify-center text-primary-foreground font-medium text-sm hover:ring-2 hover:ring-primary/50 hover:ring-offset-2 hover:ring-offset-sidebar transition-all"
                aria-label="User menu"
              >
                U
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => logout()}
                  className="flex items-center gap-2 text-destructive focus:text-destructive"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer */}
          <nav
            className="absolute right-0 top-0 flex h-full w-[280px] flex-col border-l border-border bg-sidebar pb-[env(safe-area-inset-bottom)]"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-lg font-medium text-foreground">Menu</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav Items */}
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <ul className="space-y-1">
                {mobileNavItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive(item.href)
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                    >
                      {item.icon && <MaterialIcon name={item.icon} />}
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Footer */}
            <div className="border-t border-border px-3 py-4">
              <button
                onClick={() => { logout(); setMobileMenuOpen(false) }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <MaterialIcon name="logout" />
                Sign out
              </button>
              <p className="mt-3 px-3 text-[10px] font-mono text-muted-foreground/50">
                v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0'}
              </p>
            </div>
          </nav>
        </div>
      )}
    </>
  )
}
