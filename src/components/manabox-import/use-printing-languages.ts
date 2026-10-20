'use client'

import { useEffect, useState } from 'react'
import type { LanguageLookup } from '@/lib/printing-languages'

const cache = new Map<string, Promise<string[] | null>>()

function lookup(set: string, cn: string): Promise<string[] | null> {
  const key = `${set.toLowerCase()}|${cn}`
  let pending = cache.get(key)
  if (!pending) {
    pending = fetch(`/api/printing-languages?set=${encodeURIComponent(set)}&cn=${encodeURIComponent(cn)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => (Array.isArray(body?.languages) ? (body.languages as string[]) : null))
      .catch(() => null)
    cache.set(key, pending)
  }
  return pending
}

/** Test helper: forget cached lookups. */
export function clearPrintingLanguageCache() {
  cache.clear()
}

/** Languages a printing exists in. Only asks once `enabled` (the row is open); cached per printing. */
export function usePrintingLanguages(set: string, cn: string, enabled: boolean): LanguageLookup {
  const [state, setState] = useState<{ key: string; languages: string[] | null } | null>(null)
  const key = `${set.toLowerCase()}|${cn}`

  useEffect(() => {
    if (!enabled) return
    let live = true
    void lookup(set, cn).then((languages) => {
      if (live) setState({ key, languages })
    })
    return () => {
      live = false
    }
  }, [enabled, set, cn, key])

  return state && state.key === key ? { status: 'done', languages: state.languages } : { status: 'loading' }
}
