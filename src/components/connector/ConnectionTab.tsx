'use client'

import { useState } from 'react'
import { Check, CircleAlert, Circle, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { connectorKeys, fetchConnectionStatus, switchConnection, type ConnectionStatus } from './api'
import { formatDateTime } from './format'

const CAN = [
  'Read your decks, collection and where each card is',
  'Add and take cards off a deck list (the copy goes back to storage, never deleted)',
  'Move a card to or from a maybeboard',
  'Add a card to your collection',
  'Mark a copy Original or Proxy',
  'Make small changes straight away. You can undo them here for 7 days',
]
const CANT = [
  'Take any card out of your collection',
  'Delete or empty a deck',
  'Clear or replace your collection',
  'Do big edits (over about 10 cards) or move a card between decks without your yes here',
  "Approve its own waiting changes",
  "See anyone else's data",
]

export function CapabilitiesPanel() {
  return (
    <section aria-labelledby="caps-h" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
      <h3 id="caps-h" className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)]">What Claude can and can&apos;t do</h3>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="text-[length:var(--fs-sm)] font-medium text-[var(--text-primary)]">Claude can</p>
          <ul className="mt-1 space-y-1.5">
            {CAN.map((t) => (
              <li key={t} className="flex items-start gap-2 text-[length:var(--fs-sm)] text-[var(--text-primary)]">
                <Check className="mt-0.5 size-4 shrink-0 text-[var(--signal-success)]" aria-hidden="true" />
                <span><span className="sr-only">Can: </span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[length:var(--fs-sm)] font-medium text-[var(--text-primary)]">Claude can&apos;t</p>
          <ul className="mt-1 space-y-1.5">
            {CANT.map((t) => (
              <li key={t} className="flex items-start gap-2 text-[length:var(--fs-sm)] text-[var(--text-primary)]">
                <X className="mt-0.5 size-4 shrink-0 text-[var(--signal-critical)]" aria-hidden="true" />
                <span><span className="sr-only">Can&apos;t: </span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
        These limits are enforced by Oracle, not by Claude&apos;s own prompts, so they hold even if Claude is set to never ask.
      </p>
    </section>
  )
}

function Banner({ tone, children, role }: { tone: 'info' | 'bad'; children: React.ReactNode; role?: 'alert' | 'status' }) {
  return (
    <div
      role={role}
      className="flex items-start gap-2 rounded-lg border p-3 text-[length:var(--fs-sm)] text-[var(--text-primary)]"
      style={{ borderColor: tone === 'bad' ? 'var(--signal-critical)' : 'var(--border-default)' }}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function ConnectionTab({ onShowGuide }: { onShowGuide?: () => void }) {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: connectorKeys.status, queryFn: fetchConnectionStatus, retry: false })
  const [switching, setSwitching] = useState(false)
  const [switchFailed, setSwitchFailed] = useState(false)
  const [justOff, setJustOff] = useState(false)
  const [needReconnect, setNeedReconnect] = useState(false)
  const data: ConnectionStatus | undefined = status.data

  const loading = status.isPending
  const errored = status.isError
  const state = data?.state
  const isOn = state === 'active' && !justOff

  async function onToggle(next: boolean) {
    if (!data) return
    if (next) {
      // There is no route to re-enable an ended link; turning on means reconnecting from Claude.
      setNeedReconnect(true)
      return
    }
    if (!data.connectionId) return
    setSwitching(true)
    setSwitchFailed(false)
    const out = await switchConnection(data.connectionId)
    setSwitching(false)
    if (out.ok) {
      setJustOff(true)
      toast('Claude is switched off.')
      qc.invalidateQueries({ queryKey: connectorKeys.status })
      qc.invalidateQueries({ queryKey: connectorKeys.pending })
      qc.invalidateQueries({ queryKey: connectorKeys.pendingCount })
    } else {
      setSwitchFailed(true) // the switch stays where it was (still On)
    }
  }

  const badge = loading
    ? { icon: <Circle className="size-3" aria-hidden="true" />, text: 'Checking…' }
    : errored
      ? { icon: <CircleAlert className="size-3" aria-hidden="true" />, text: "Can't check" }
      : state === 'expired'
        ? { icon: <CircleAlert className="size-3" aria-hidden="true" />, text: 'Needs reconnecting' }
        : isOn
          ? { icon: <Circle className="size-3 fill-current" aria-hidden="true" />, text: 'Active' }
          : { icon: <Circle className="size-3" aria-hidden="true" />, text: 'Off' }

  return (
    <div className="space-y-4" data-testid="connection-tab">
      <section aria-labelledby="conn-h" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4" aria-busy={loading}>
        <div className="flex flex-wrap items-center gap-3">
          <h3 id="conn-h" className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)]">Claude</h3>
          <span
            data-testid="connection-badge"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[length:var(--fs-xs)] font-medium text-[var(--text-primary)]"
          >
            {badge.icon}
            {badge.text}
          </span>
          <label className="ml-auto flex min-h-[44px] min-w-[44px] cursor-pointer items-center gap-2 text-[length:var(--fs-sm)] text-[var(--text-primary)]">
            <span>Let Claude use Oracle</span>
            <Switch
              aria-label="Let Claude use Oracle"
              checked={isOn}
              disabled={loading || errored || switching}
              onCheckedChange={onToggle}
            />
          </label>
        </div>

        {loading && <Skeleton className="mt-3 h-4 w-2/3" />}
        {!loading && !errored && isOn && (
          <p className="mt-2 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
            Claude is connected{data?.email ? ` as ${data.email}` : ''}.
            {data?.lastUsedAt ? ` Last used ${formatDateTime(data.lastUsedAt)}` : ' Not used yet'}
            {data?.clientName ? `, from ${data.clientName}.` : '.'}
          </p>
        )}
        {!loading && !errored && !isOn && !justOff && state === 'off' && (
          <p className="mt-2 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">Claude isn&apos;t connected.</p>
        )}
      </section>

      {errored && (
        <Banner tone="bad" role="alert">
          <p>We couldn&apos;t check whether Claude is connected. It may still be.</p>
          <Button type="button" variant="outline" className="mt-2 min-h-[44px]" onClick={() => status.refetch()}>Try again</Button>
        </Banner>
      )}
      {switchFailed && (
        <Banner tone="bad" role="alert">
          We couldn&apos;t switch Claude off. Try again. If it keeps failing, change your Oracle password.
        </Banner>
      )}
      {justOff && (
        <Banner tone="info" role="status">
          Claude can no longer reach Oracle. Any Claude chat that asks now gets &quot;not connected&quot;. To use it again, switch this back on
          and reconnect from Claude. Anything waiting for your yes was cancelled.
        </Banner>
      )}
      {needReconnect && !justOff && (
        <Banner tone="info" role="status">
          <p>To use Claude again, reconnect Oracle from Claude&apos;s connector settings.</p>
          {onShowGuide && (
            <Button type="button" variant="outline" className="mt-2 min-h-[44px]" onClick={onShowGuide}>Show me how to reconnect</Button>
          )}
        </Banner>
      )}
      {state === 'expired' && (
        <Banner tone="bad" role="alert">
          <p><b>Claude&apos;s sign-in has expired.</b> Claude can&apos;t reach Oracle until you reconnect. Nothing was changed while it was signed out.</p>
          {onShowGuide && (
            <Button type="button" variant="outline" className="mt-2 min-h-[44px]" onClick={onShowGuide}>Show me how to reconnect</Button>
          )}
        </Banner>
      )}

      <CapabilitiesPanel />

      {!loading && !errored && data?.clientName && (
        <section aria-labelledby="where-h" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          <h3 id="where-h" className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)]">Where it&apos;s connected</h3>
          <p className="mt-1 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
            {data.clientName}{data.lastUsedAt ? `, last used ${formatDateTime(data.lastUsedAt)}` : ''}
          </p>
        </section>
      )}
    </div>
  )
}
