'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PanelLeftClose, PanelLeft, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/** Material Symbol icon wrapper that matches lucide icon interface */
function MaterialIcon({ name, className }: { name: string; className?: string; strokeWidth?: number }) {
  return (
    <span
      className={cn('material-symbols-outlined inline-flex items-center justify-center', className)}
      style={{ fontSize: '24px', fontWeight: 300 }}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}

// Create icon components for each nav item
function DecksIcon(props: { className?: string; strokeWidth?: number }) {
  return <MaterialIcon name="grid_view" {...props} />
}
function CardManagementIcon(props: { className?: string; strokeWidth?: number }) {
  return <MaterialIcon name="modeling" {...props} />
}
function CollectionIcon(props: { className?: string; strokeWidth?: number }) {
  return <MaterialIcon name="newsstand" {...props} />
}
function StorageIcon(props: { className?: string; strokeWidth?: number }) {
  return <MaterialIcon name="shelves" {...props} />
}
function ScanIcon(props: { className?: string; strokeWidth?: number }) {
  return <MaterialIcon name="photo_camera" {...props} />
}
function BrewIcon(props: { className?: string; strokeWidth?: number }) {
  return <MaterialIcon name="science" {...props} />
}
function SettingsIcon(props: { className?: string; strokeWidth?: number }) {
  return <MaterialIcon name="settings" {...props} />
}
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { logout } from '@/app/actions/auth'

const COLLAPSE_KEY = 'sidebar-collapsed'

interface NavItem {
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  href: string
  isOverlay?: boolean
}

const navItems: NavItem[] = [
  { label: 'Decks', icon: DecksIcon, href: '/' },
  { label: 'Card Management', icon: CardManagementIcon, href: '/allocation' },
  { label: 'Collection', icon: CollectionIcon, href: '/collection' },
  { label: 'Storage', icon: StorageIcon, href: '/storage' },
  { label: 'Scan', icon: ScanIcon, href: '/scan' },
  { label: 'Brew Deck', icon: BrewIcon, href: '/new-deck' },
  { label: 'Settings', icon: SettingsIcon, href: '/settings' },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY)
    if (stored !== null) {
      setCollapsed(stored === 'true')
    }
    setMounted(true)
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSE_KEY, String(next))
      return next
    })
  }, [])

  // Cmd+K / Ctrl+K keyboard shortcut for search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        // Dispatch a custom event that the search overlay can listen for
        window.dispatchEvent(new CustomEvent('open-search'))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Hide sidebar on auth pages (login, auth callback)
  if (pathname === '/login' || pathname.startsWith('/auth/')) {
    return null
  }

  function isActive(item: NavItem) {
    if (item.isOverlay) return false
    if (item.href === '/') return pathname === '/'
    return pathname.startsWith(item.href)
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'flex h-full flex-col border-r border-border bg-sidebar transition-[width] duration-200',
        'motion-reduce:transition-none',
        collapsed ? 'w-[56px]' : 'w-[220px]'
      )}
    >
      {/* Header */}
      <div className={cn(
        'flex h-14 items-center border-b border-border px-3',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        {!collapsed && (
          <span className="truncate pl-1 text-[length:var(--fs-lg)] font-medium tracking-tight text-foreground">
            The Oracle
          </span>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                onClick={toggleCollapsed}
              />
            }
          >
            {collapsed ? (
              <PanelLeft className="size-4" strokeWidth={1.5} />
            ) : (
              <PanelLeftClose className="size-4" strokeWidth={1.5} />
            )}
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          )}
        </Tooltip>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-2 p-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item)

          const content = (
            <span
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[length:var(--fs-md)] font-medium transition-colors duration-150',
                'motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                collapsed && 'justify-center px-0'
              )}
            >
              <Icon className="size-6 shrink-0" strokeWidth={1.5} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </span>
          )

          const element = item.isOverlay ? (
            <button
              key={item.label}
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-search'))}
              aria-label={collapsed ? `${item.label} (⌘K)` : `${item.label} (⌘K)`}
            >
              {content}
            </button>
          ) : (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              aria-label={collapsed ? item.label : undefined}
            >
              {content}
            </Link>
          )

          if (collapsed) {
            return (
              <Tooltip key={item.label}>
                <TooltipTrigger render={element} />
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            )
          }

          return element
        })}
      </nav>

      {/* Footer */}
      <div className={cn(
        'border-t border-border p-2 space-y-1',
        collapsed ? 'flex flex-col items-center' : ''
      )}>
        <LogoutButton collapsed={collapsed} />
      </div>
    </aside>
  )
}


function LogoutButton({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <form action={logout}>
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                aria-label="Log out"
              />
            </form>
          }
        >
          <LogOut className="size-4" strokeWidth={1.5} />
        </TooltipTrigger>
        <TooltipContent side="right">Log out</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <form action={logout}>
      <button
        type="submit"
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[length:var(--fs-md)] font-medium transition-colors duration-150',
          'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'
        )}
      >
        <LogOut className="size-5 shrink-0" strokeWidth={1.5} />
        <span className="truncate">Log out</span>
      </button>
    </form>
  )
}
