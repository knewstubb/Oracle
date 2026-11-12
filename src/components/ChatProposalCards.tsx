'use client'

// Proposal cards for the Oracle chat: the owner sees what the chat suggests and clicks Add.
// Nothing changes in the deck until that click. Added shows only after the server says so.
// Contract: docs/oracle/contracts/chat-add-cards.md (sections 2.3 to 2.6). Wording and layout are provisional until
// a Designer spec exists (none was written before this build).

import { useCallback, useMemo, useState } from 'react'
import { Check, Plus, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConfirmReply, ProposalCard, UndoReply } from '@/lib/chat-proposal-types'

export interface ProposalGroup {
  deckId: number
  deckName: string
  proposals: ProposalCard[]
}

type RowState =
  | { kind: 'ready' }
  | { kind: 'sending' }
  | { kind: 'added'; batch: string }
  | { kind: 'undoing'; batch: string }
  | { kind: 'undone' }
  | { kind: 'dismissed' }
  | { kind: 'blocked'; text: string }
  | { kind: 'failed' }

interface Receipt {
  batch: string
  ids: string[]
  text: string
  undone: boolean
  undoing: boolean
  error?: string
}

/** "Your copy is still in Prosper." from the ownership line, when the card is in another deck. */
export function copyStillLine(ownershipLine?: string): string | null {
  const m = ownershipLine?.match(/it's in (.+?)\. Adding it/)
  return m ? `Your copy is still in ${m[1]}.` : null
}

export function receiptText(deckName: string, added: ProposalCard[], skipped: Array<{ name: string; text: string }>, total: number, deckCardCount?: number): string {
  let text: string
  if (added.length === 1 && skipped.length === 0) {
    const c = added[0]
    text = `Added ${c.cardName} to ${deckName}. ${copyStillLine(c.ownershipLine) ?? "It's a planned slot; no copy was moved."}`
  } else {
    text = `Added ${added.length} of ${total} to ${deckName}. They are planned slots; no copy was moved.`
    for (const s of skipped) text += ` ${s.name}: ${s.text}`
  }
  if (typeof deckCardCount === 'number' && deckCardCount > 100) text += ` Deck now has ${deckCardCount} cards.`
  return text
}

async function post<T>(url: string, body: unknown): Promise<{ status: number; data: T | null }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  let data: T | null = null
  try { data = (await res.json()) as T } catch { /* no body */ }
  return { status: res.status, data }
}

export function ChatProposalCards({ group, onDeckChanged }: { group: ProposalGroup; onDeckChanged?: () => void }) {
  const { deckId, deckName, proposals } = group
  const base = `/api/decks/${deckId}/chat-proposals`
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(proposals.map((p) => [p.proposalId, p.state === 'blocked' ? ({ kind: 'blocked', text: p.blockText ?? 'This card cannot be added.' } as RowState) : ({ kind: 'ready' } as RowState)]))
  )
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const byId = useMemo(() => new Map(proposals.map((p) => [p.proposalId, p])), [proposals])
  const setRow = useCallback((id: string, s: RowState) => setRows((prev) => ({ ...prev, [id]: s })), [])

  const readyIds = proposals.filter((p) => rows[p.proposalId]?.kind === 'ready' || rows[p.proposalId]?.kind === 'failed').filter((p) => p.state === 'ready').map((p) => p.proposalId)
  const anySending = Object.values(rows).some((r) => r.kind === 'sending' || r.kind === 'undoing')

  const confirm = useCallback(async (ids: string[]) => {
    for (const id of ids) setRow(id, { kind: 'sending' })
    try {
      const { status, data } = await post<ConfirmReply & { error?: string }>(`${base}/confirm`, { proposalIds: ids })
      if (status === 200 && data && 'added' in data) {
        const batch = `b-${Date.now()}-${ids[0]}`
        const addedIds = data.added.map((a) => a.proposalId)
        const skippedList = data.skipped.map((s) => ({ id: s.proposalId, text: s.blockText, name: byId.get(s.proposalId)?.cardName ?? 'A card' }))
        for (const id of addedIds) setRow(id, { kind: 'added', batch })
        for (const s of skippedList) setRow(s.id, { kind: 'blocked', text: s.text })
        if (addedIds.length > 0) {
          setReceipts((prev) => [...prev, {
            batch, ids: addedIds, undone: false, undoing: false,
            text: receiptText(deckName, addedIds.map((id) => byId.get(id)!).filter(Boolean), skippedList, ids.length, data.deckCardCount),
          }])
          onDeckChanged?.()
        }
        return
      }
      const text =
        status === 409 ? 'This suggestion was already used.'
        : status === 410 ? 'This suggestion has expired. Ask me again.'
        : status === 404 ? 'I could not find that suggestion.'
        : null
      for (const id of ids) setRow(id, text ? { kind: 'blocked', text } : { kind: 'failed' })
    } catch {
      for (const id of ids) setRow(id, { kind: 'failed' })
    }
  }, [base, byId, deckName, onDeckChanged, setRow])

  const undo = useCallback(async (batch: string) => {
    const receipt = receipts.find((r) => r.batch === batch)
    if (!receipt) return
    setReceipts((prev) => prev.map((r) => (r.batch === batch ? { ...r, undoing: true, error: undefined } : r)))
    for (const id of receipt.ids) setRow(id, { kind: 'undoing', batch })
    try {
      const { status, data } = await post<UndoReply>(`${base}/undo`, { proposalIds: receipt.ids })
      if (status === 200 && data) {
        for (const id of data.undone) setRow(id, { kind: 'undone' })
        for (const r of data.refused) setRow(r.proposalId, { kind: 'added', batch })
        const refusedText = data.refused[0]?.text
        setReceipts((prev) => prev.map((r) => (r.batch === batch ? { ...r, undoing: false, undone: data.refused.length === 0, error: refusedText } : r)))
        if (data.undone.length > 0) onDeckChanged?.()
        return
      }
      throw new Error('undo failed')
    } catch {
      for (const id of receipt.ids) setRow(id, { kind: 'added', batch })
      setReceipts((prev) => prev.map((r) => (r.batch === batch ? { ...r, undoing: false, error: "Couldn't undo that. Nothing was changed." } : r)))
    }
  }, [base, onDeckChanged, receipts, setRow])

  const dismiss = useCallback((id: string) => {
    setRow(id, { kind: 'dismissed' })
    void post(`${base}/dismiss`, { proposalIds: [id] }).catch(() => undefined)
  }, [base, setRow])

  const visible = proposals.filter((p) => rows[p.proposalId]?.kind !== 'dismissed')
  if (visible.length === 0) return null

  return (
    <div className="mt-3 space-y-2" data-testid="chat-proposals">
      {readyIds.length > 1 && (
        <button
          type="button"
          disabled={anySending}
          onClick={() => confirm(readyIds)}
          className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add all ({readyIds.length})
        </button>
      )}
      <ul className="space-y-2">
        {visible.map((p) => {
          const row = rows[p.proposalId] ?? { kind: 'ready' as const }
          const batchReceipt = row.kind === 'added' || row.kind === 'undoing' ? receipts.find((r) => r.batch === row.batch) : undefined
          const soloUndo = batchReceipt && batchReceipt.ids.length === 1
          return (
            <li key={p.proposalId} className="rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3 py-2" data-state={row.kind}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-100">{p.cardName}</div>
                  {p.reason && <div className="text-xs text-zinc-400">{p.reason}</div>}
                  {p.category && row.kind !== 'blocked' && <div className="text-xs text-zinc-500">Goes in: {p.category}</div>}
                  {p.ownershipLine && row.kind !== 'blocked' && <div className="mt-0.5 text-xs text-zinc-400">{p.ownershipLine}</div>}
                  {row.kind === 'blocked' && <div className="mt-0.5 text-xs text-amber-400" role="status">{row.text}</div>}
                  {row.kind === 'failed' && <div className="mt-0.5 text-xs text-red-400" role="alert">Couldn&apos;t add {p.cardName}. Try again.</div>}
                  {row.kind === 'undone' && <div className="mt-0.5 text-xs text-zinc-500">Removed again. Nothing else changed.</div>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {(row.kind === 'ready' || row.kind === 'failed' || row.kind === 'sending') && (
                    <>
                      <button
                        type="button"
                        disabled={row.kind === 'sending' || anySending}
                        onClick={() => confirm([p.proposalId])}
                        aria-label={`Add ${p.cardName} to ${deckName}`}
                        className={cn(
                          'flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-400 transition-colors',
                          'hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50'
                        )}
                      >
                        <Plus className="h-3 w-3" aria-hidden />
                        {row.kind === 'sending' ? 'Adding…' : row.kind === 'failed' ? 'Try again' : `Add to ${deckName}`}
                      </button>
                      {row.kind !== 'sending' && (
                        <button type="button" onClick={() => dismiss(p.proposalId)} className="text-xs text-zinc-500 hover:text-zinc-300">
                          Not now
                        </button>
                      )}
                    </>
                  )}
                  {(row.kind === 'added' || row.kind === 'undoing') && (
                    <>
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                        <Check className="h-3 w-3" aria-hidden /> Added
                      </span>
                      {soloUndo && (
                        <button
                          type="button"
                          disabled={row.kind === 'undoing'}
                          onClick={() => undo(row.batch)}
                          className="flex items-center gap-1 text-xs text-zinc-400 underline hover:text-zinc-200 disabled:opacity-50"
                        >
                          <Undo2 className="h-3 w-3" aria-hidden /> {row.kind === 'undoing' ? 'Undoing…' : 'Undo'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {soloUndo && <ReceiptLine receipt={batchReceipt!} />}
            </li>
          )
        })}
      </ul>
      {receipts.filter((r) => r.ids.length > 1).map((r) => (
        <div key={r.batch} className="rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3 py-2">
          <ReceiptLine receipt={r} />
          {!r.undone && (
            <button type="button" disabled={r.undoing} onClick={() => undo(r.batch)} className="mt-1 flex items-center gap-1 text-xs text-zinc-400 underline hover:text-zinc-200 disabled:opacity-50">
              <Undo2 className="h-3 w-3" aria-hidden /> {r.undoing ? 'Undoing…' : 'Undo all'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function ReceiptLine({ receipt }: { receipt: Receipt }) {
  return (
    <div className="mt-1 text-xs text-zinc-400" role="status">
      {receipt.undone ? 'Removed again. Nothing else changed.' : receipt.text}
      {receipt.error && <span className="block text-amber-400">{receipt.error}</span>}
    </div>
  )
}
