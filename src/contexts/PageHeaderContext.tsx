'use client'

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'

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

/**
 * Sets the page header config. Call this in your page component.
 * 
 * The config is set via useEffect to avoid render-phase state updates.
 * We track the title to determine when to update, since subtitle/actions
 * may be new objects on every render.
 */
export function usePageHeader(config: PageHeaderConfig): void {
  const { setConfig } = usePageHeaderContext()
  const configRef = useRef(config)
  
  // Always keep ref in sync
  configRef.current = config

  // Set header on mount and when title changes
  useEffect(() => {
    setConfig(configRef.current)
  }, [config.title, setConfig])

  // Clear on unmount
  useEffect(() => {
    return () => setConfig(null)
  }, [setConfig])
}
