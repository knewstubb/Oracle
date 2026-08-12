'use client'

import { createContext, useContext, useState, useLayoutEffect, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageHeaderConfig {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}

interface PageHeaderContextValue {
  config: PageHeaderConfig | null
  setConfig: (config: PageHeaderConfig | null) => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface PageHeaderProviderProps {
  children: ReactNode
}

export function PageHeaderProvider({ children }: PageHeaderProviderProps) {
  const [config, setConfig] = useState<PageHeaderConfig | null>(null)

  return (
    <PageHeaderContext.Provider value={{ config, setConfig }}>
      {children}
    </PageHeaderContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook: usePageHeaderContext (internal - for MainContentWrapper)
// ---------------------------------------------------------------------------

export function usePageHeaderContext(): PageHeaderContextValue {
  const context = useContext(PageHeaderContext)
  if (!context) {
    throw new Error('usePageHeaderContext must be used within a PageHeaderProvider')
  }
  return context
}

// ---------------------------------------------------------------------------
// Hook: usePageHeader (for pages to set their header config)
// ---------------------------------------------------------------------------

export function usePageHeader(config: PageHeaderConfig): void {
  const { setConfig } = usePageHeaderContext()

  // Use layout effect to set before paint, avoiding flash
  // We set on every render since subtitle/actions can be new objects each time
  // Clear on unmount to ensure no stale header persists
  useLayoutEffect(() => {
    setConfig(config)
    return () => setConfig(null)
  })
}
