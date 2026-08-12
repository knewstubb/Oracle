'use client'

import { createContext, useContext, useState, useEffect, useRef, useMemo, type ReactNode } from 'react'

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
// Provider - uses a stable callback to prevent loops
// ---------------------------------------------------------------------------

interface PageHeaderProviderProps {
  children: ReactNode
}

export function PageHeaderProvider({ children }: PageHeaderProviderProps) {
  const [config, setConfig] = useState<PageHeaderConfig | null>(null)
  
  // Use a ref to track the latest config without causing re-renders
  const configRef = useRef<PageHeaderConfig | null>(null)
  
  // Stable setConfig that batches updates
  const stableSetConfig = useMemo(() => {
    let pending = false
    return (newConfig: PageHeaderConfig | null) => {
      configRef.current = newConfig
      if (!pending) {
        pending = true
        // Batch updates to avoid render loops
        queueMicrotask(() => {
          pending = false
          setConfig(configRef.current)
        })
      }
    }
  }, [])

  return (
    <PageHeaderContext.Provider value={{ config, setConfig: stableSetConfig }}>
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
 * The hook handles dynamic subtitles and actions that change over time
 * (e.g., loading states, async data). Updates are batched to prevent
 * infinite render loops even when inline JSX creates new objects each render.
 */
export function usePageHeader(config: PageHeaderConfig): void {
  const { setConfig } = usePageHeaderContext()
  
  // Set config on every render - the provider batches updates
  // This allows dynamic content to update properly
  setConfig(config)
  
  // Clear on unmount
  useEffect(() => {
    return () => setConfig(null)
  }, [setConfig])
}
