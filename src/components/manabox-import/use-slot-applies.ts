'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchEligibleNames, type CommanderCandidate } from './CommanderPicker'

/**
 * Does a command-zone slot apply to this deck? (spec import-modal-redesign §3 #2)
 * - 'second' (Partner / Background): the chosen commander has at least one eligible pair in the file.
 * - 'companion': at least one card in the file can be a companion.
 * Answers false while the check is running or if it fails, so the slot stays hidden until it is known.
 * Uses the same read-only eligibility check the pickers use (docs/oracle/contracts/command-zone-roles.md).
 */
export function useSlotApplies(
  slot: 'second' | 'companion',
  cards: CommanderCandidate[],
  withName: string | undefined,
  enabled: boolean
): boolean {
  const namesKey = useMemo(() => [...new Set(cards.map((c) => c.name))].sort().join('\n'), [cards])
  const key = `${slot}|${withName ?? ''}|${namesKey}`
  const [answer, setAnswer] = useState<{ key: string; applies: boolean } | null>(null)
  const wanted = enabled && (slot === 'companion' || !!withName) && namesKey !== ''

  useEffect(() => {
    if (!wanted) return
    let cancelled = false
    fetchEligibleNames(namesKey.split('\n'), { role: slot, withName }).then((set) => {
      if (cancelled) return
      // A card can't pair with itself.
      const applies = !!set && [...set].some((n) => n !== withName)
      setAnswer({ key, applies })
    })
    return () => {
      cancelled = true
    }
  }, [wanted, key, namesKey, slot, withName])

  return wanted && answer?.key === key && answer.applies
}
