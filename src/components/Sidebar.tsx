'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Copy, Library, Search, Plus, PanelLeftClose, PanelLeft, RefreshCw, Loader2, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { logout } from '@/app/actions/auth'

const COLLAPSE_KEY = 'sidebar-collapsed'

interface NavItem {
  label: string
  icon: typeof LayoutGrid
  href: string
  isOverlay?: boolean
}

const navItems: NavItem[] = [
  { label: 'Decks', icon: LayoutGrid, href: '/' },
  { label: 'Shared Cards', icon: Copy, href: '/shared-cards' },
  { label: 'Collection', icon: Library, href: '/collection' },
  { label: 'Search', icon: Search, href: '#search', isOverlay: true },
  { label: 'Brew Deck', icon: Plus, href: '/new-deck' },
  { label: 'Settings', icon: Settings, href: '/settings' },
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
          <span className="truncate pl-1 text-base font-bold tracking-tight text-foreground">
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
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 p-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item)

          const content = (
            <span
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors duration-150',
                'motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
                active
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                collapsed && 'justify-center px-0'
              )}
            >
              <Icon className="size-5 shrink-0" strokeWidth={1.5} />
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

      {/* Footer — sync & logout */}
      <div className={cn(
        'border-t border-border p-2 space-y-1',
        collapsed ? 'flex flex-col items-center' : ''
      )}>
        <SyncButton collapsed={collapsed} />
        <LogoutButton collapsed={collapsed} />
      </div>
    </aside>
  )
}


function SyncButton({ collapsed }: { collapsed: boolean }) {
  const queryClient = useQueryClient()

  const syncMutation = useMutation({
    mutationFn: () =>
      fetch('/api/sync').then((r) => {
        if (!r.ok) throw new Error('Sync failed')
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      queryClient.invalidateQueries({ queryKey: ['shared-cards'] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['sync-status'] })
    },
  })

  const isSyncing = syncMutation.isPending

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => syncMutation.mutate()}
              disabled={isSyncing}
              aria-label={isSyncing ? 'Syncing...' : 'Sync with Archidekt'}
            />
          }
        >
          {isSyncing ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <RefreshCw className="size-4" strokeWidth={1.5} />
          )}
        </TooltipTrigger>
        <TooltipContent side="right">
          {isSyncing ? 'Syncing...' : 'Sync with Archidekt'}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <button
      type="button"
      onClick={() => syncMutation.mutate()}
      disabled={isSyncing}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors duration-150',
        'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground',
        'disabled:pointer-events-none disabled:opacity-50'
      )}
    >
      {isSyncing ? (
        <Loader2 className="size-5 shrink-0 animate-spin" strokeWidth={1.5} />
      ) : (
        <RefreshCw className="size-5 shrink-0" strokeWidth={1.5} />
      )}
      <span className="truncate">{isSyncing ? 'Syncing...' : 'Sync'}</span>
    </button>
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
          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors duration-150',
          'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'
        )}
      >
        <LogOut className="size-5 shrink-0" strokeWidth={1.5} />
        <span className="truncate">Log out</span>
      </button>
    </form>
  )
}
