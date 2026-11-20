'use client'
import { useState } from 'react'
import { MoreVertical } from 'lucide-react'
import { toast } from 'sonner'
import { CopySwatch } from '@/components/CopySwatch'
import { SaveStatus } from '@/components/SaveStatus'
import { LocationPickerModal } from '@/components/LocationPickerModal'
import { StorageLocationSelect } from '@/components/collection/StorageLocationSelect'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { formatPrice } from '@/lib/collection-printing-utils'
import { CARD_DETAILS_LABELS as L, CONDITION_OPTIONS, conditionLabel, deckStateLabel } from '@/lib/card-details/labels'
import { playableWarning } from '@/lib/move-here'
import type { CollectionCopyView } from '@/lib/card-details/collection-copies'
import type { CollectionCardDetails, WaitingDeck } from '@/lib/card-details/load-collection'
import { BTN_SM, SELECT, TAB_BODY, finishSuffix, setLabel } from './shared'
import { copySwatchKind } from './CollectionOverviewTab'

export interface CollectionCopiesTabProps {
  data: CollectionCardDetails
  refresh: () => void
  isInstanceSelected: (copyId: number) => boolean
  onToggleInstance: (copyId: number) => void
  onPreview: (scryfallId: string | null) => void
}

type Panel =
  | { copyId: number; kind: 'move-pick' }
  | { copyId: number; kind: 'move-confirm'; deck: WaitingDeck }
  | { copyId: number; kind: 'unassign-confirm' }
  | { copyId: number; kind: 'delete-confirm' }
  | { copyId: number; kind: 'no-original' }

type Save = { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'error'; retry: () => void }

const printingText = (c: CollectionCopyView) =>
  c.printing ? `${setLabel(c.printing.setCode, c.printing.collectorNumber)}${finishSuffix(c.finish)}${c.isProxy ? ' · proxy' : ''}` : c.isProxy ? 'Proxy' : '—'

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}))
  return typeof body.error === 'string' ? body.error : fallback
}

export function CollectionCopiesTab({ data, refresh, isInstanceSelected, onToggleInstance, onPreview }: CollectionCopiesTabProps) {
  const [panel, setPanel] = useState<Panel | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [rowError, setRowError] = useState<{ id: number; text: string } | null>(null)
  const [saves, setSaves] = useState<Record<number, Save>>({})
  const [pendingCondition, setPendingCondition] = useState<Record<number, string>>({})
  const [unassignPicker, setUnassignPicker] = useState<number | null>(null)
  const [replaceFor, setReplaceFor] = useState<CollectionCopyView | null>(null)
  const [addingProxy, setAddingProxy] = useState(false)
  const copies = data.copies
  const selectedHere = copies.filter((c) => isInstanceSelected(c.copyId)).length
  const allSelected = copies.length > 0 && selectedHere === copies.length

  const setSave = (id: number, s: Save | null) =>
    setSaves((prev) => {
      const next = { ...prev }
      if (s) next[id] = s
      else delete next[id]
      return next
    })

  // ─── Bulk selection: the host owns it; select-all only toggles rows whose state differs ───
  const toggleAll = () => {
    for (const c of copies) if (isInstanceSelected(c.copyId) === allSelected) onToggleInstance(c.copyId)
  }

  // ─── Condition: saves on change; a failed save changes nothing ───
  const saveCondition = async (c: CollectionCopyView, stored: string) => {
    setPendingCondition((p) => ({ ...p, [c.copyId]: stored }))
    setSave(c.copyId, { kind: 'saving' })
    const clear = () => setPendingCondition((p) => { const n = { ...p }; delete n[c.copyId]; return n })
    try {
      const res = await fetch('/api/collection/instances/condition', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyId: c.copyId, condition: stored }),
      })
      if (!res.ok) throw new Error('save failed')
      setSave(c.copyId, { kind: 'saved', at: new Date() })
      refresh()
      // Keep showing the new value until the refreshed data arrives.
      setTimeout(clear, 1500)
    } catch {
      clear()
      setSave(c.copyId, { kind: 'error', retry: () => void saveCondition(c, stored) })
    }
  }

  // ─── Moves, unassign, delete, replace ───
  const fail = (id: number, text: string) => setRowError({ id, text })
  const doMove = async (c: CollectionCopyView, deck: WaitingDeck) => {
    setBusyId(c.copyId)
    setRowError(null)
    try {
      const res = await fetch(c.assigned ? '/api/allocation/reassign-to-deck' : '/api/allocation/assign-free-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyId: c.copyId, targetDeckId: deck.deckId, cardName: data.cardName }),
      })
      if (!res.ok) {
        fail(c.copyId, `${await readError(res, "Couldn't move that copy.")} Nothing was changed.`)
        return
      }
      setPanel(null)
      toast.success(`Moved a copy of ${data.cardName} to ${deck.deckName}`)
      refresh()
    } catch {
      fail(c.copyId, 'No connection. Nothing was moved.')
    } finally {
      setBusyId(null)
    }
  }
  const chooseDeck = (c: CollectionCopyView, deck: WaitingDeck) => {
    // A Playable source warns on the row first; any other source moves on one click.
    if (c.assigned?.deckState === 'playable') setPanel({ copyId: c.copyId, kind: 'move-confirm', deck })
    else void doMove(c, deck)
  }
  const doUnassign = async (copyId: number, storageLocationId: number | null) => {
    setUnassignPicker(null)
    setRowError(null)
    try {
      const res = await fetch('/api/collection/instances/unassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyId }),
      })
      if (!res.ok) throw new Error('Unassign failed')
      try {
        const locRes = await fetch('/api/collection/assign-location', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ physicalCopyId: copyId, storageLocationId }),
        })
        toast.success(locRes.ok ? 'Unassigned and moved to storage' : 'Unassigned, but couldn\u2019t update storage location')
      } catch {
        toast.success('Unassigned, but couldn\u2019t update storage location')
      }
      refresh()
    } catch {
      fail(copyId, "Couldn't unassign that copy. Nothing was changed.")
    }
  }
  const onUnassignClick = (c: CollectionCopyView) => {
    if (c.assigned?.deckState === 'playable') setPanel({ copyId: c.copyId, kind: 'unassign-confirm' })
    else setUnassignPicker(c.copyId)
  }
  const doDelete = async (c: CollectionCopyView) => {
    setBusyId(c.copyId)
    setRowError(null)
    try {
      const res = await fetch('/api/collection/instances/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyId: c.copyId }),
      })
      if (!res.ok) throw new Error('delete failed')
      setPanel(null)
      toast.success('Copy deleted')
      refresh()
    } catch {
      fail(c.copyId, "Couldn't delete that copy. Nothing was changed.")
    } finally {
      setBusyId(null)
    }
  }
  const onReplaceClick = (c: CollectionCopyView) => {
    const original = copies.find((x) => x.state === 'open' && !x.isProxy)
    if (!original) setPanel({ copyId: c.copyId, kind: 'no-original' })
    else setReplaceFor(c)
  }
  const doReplace = async (proxy: CollectionCopyView, storageLocationId: number | null) => {
    setReplaceFor(null)
    const original = copies.find((x) => x.state === 'open' && !x.isProxy)
    if (!original) { setPanel({ copyId: proxy.copyId, kind: 'no-original' }); return }
    try {
      const res = await fetch('/api/allocation/replace-with-original', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxyCopyId: proxy.copyId, originalCopyId: original.copyId, proxyStorageLocationId: storageLocationId }),
      })
      if (!res.ok) {
        fail(proxy.copyId, `${await readError(res, "Couldn't replace the proxy.")} Nothing was changed.`)
        return
      }
      toast.success('Replaced proxy with original')
      refresh()
    } catch {
      fail(proxy.copyId, 'No connection. Nothing was changed.')
    }
  }
  const addProxy = async () => {
    setAddingProxy(true)
    try {
      const res = await fetch('/api/collection/instances/add-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oracleId: data.oracleId }),
      })
      if (!res.ok) throw new Error('failed')
      toast.success('Proxy added')
      refresh()
    } catch {
      toast.error("Couldn't add a proxy. Nothing was changed.")
    } finally {
      setAddingProxy(false)
    }
  }

  const unassignCopy = copies.find((c) => c.copyId === unassignPicker)
  const hasPanelRow = (c: CollectionCopyView) => panel?.copyId === c.copyId || saves[c.copyId] || rowError?.id === c.copyId

  return (
    <div className={TAB_BODY}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[length:var(--fs-sm)] text-muted-foreground" data-testid="card-details-selected-count">{selectedHere} selected</span>
        <button type="button" className={BTN_SM} disabled={addingProxy} onClick={() => void addProxy()}>{L.addAProxy}</button>
      </div>
      {copies.length === 0 ? (
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">You don&apos;t own a copy of this card ({L.unowned}).</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[length:var(--fs-sm)]">
            <caption className="sr-only">Your copies of this card</caption>
            <thead className="text-[length:var(--fs-xs)] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="w-8 py-1 pr-2">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all copies" className="size-4 max-sm:size-6" />
                </th>
                <th scope="col" className="py-1 pr-3">Printing</th>
                <th scope="col" className="py-1 pr-3">Condition</th>
                <th scope="col" className="py-1 pr-3">Stored in</th>
                <th scope="col" className="py-1 pr-3">Assigned to</th>
                <th scope="col" className="py-1 pr-3 text-right">Price</th>
                <th scope="col" className="py-1"><span className="sr-only">More actions</span></th>
              </tr>
            </thead>
            <tbody>
              {copies.map((c) => {
                const save = saves[c.copyId]
                const condValue = pendingCondition[c.copyId] ?? c.condition ?? ''
                const knownCond = CONDITION_OPTIONS.some((o) => o.stored === condValue)
                const p = panel?.copyId === c.copyId ? panel : null
                const playableName = c.assigned?.deckState === 'playable' ? c.assigned.deckName : null
                return [
                  <tr
                    key={c.copyId}
                    data-testid="card-details-copy-row"
                    onMouseEnter={() => onPreview(c.printingId)}
                    onMouseLeave={() => onPreview(null)}
                    className="border-t border-[var(--border-default)] align-middle"
                  >
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={isInstanceSelected(c.copyId)}
                        onChange={() => onToggleInstance(c.copyId)}
                        aria-label={`Select copy ${c.copyId} (${printingText(c)})`}
                        className="size-4 max-sm:size-6"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2"><CopySwatch kind={copySwatchKind(c)} />{printingText(c)}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {c.isProxy || c.state === 'missing' ? (
                        <span>{conditionLabel(c.isProxy ? null : c.condition)}</span>
                      ) : (
                        <select
                          value={condValue}
                          onChange={(e) => void saveCondition(c, e.target.value)}
                          disabled={save?.kind === 'saving'}
                          aria-label={`Condition for copy ${c.copyId}`}
                          className={SELECT}
                        >
                          {condValue === '' && <option value="" disabled>–</option>}
                          {!knownCond && condValue !== '' && <option value={condValue}>{condValue}</option>}
                          {CONDITION_OPTIONS.map((o) => <option key={o.stored} value={o.stored}>{o.label}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {c.assigned ? (
                        <span className="block">
                          <span>{c.storage.name ?? 'Not stored'}</span>
                          <span className="block text-[length:var(--fs-xs)] text-muted-foreground">{L.storedInHint}</span>
                        </span>
                      ) : c.state === 'missing' ? (
                        <span>{c.storage.name ?? '–'}</span>
                      ) : (
                        <StorageLocationSelect
                          physicalCopyId={c.copyId}
                          currentLocationId={c.storage.id}
                          currentLocationName={c.storage.name}
                          isAllocated={false}
                          onSaveStart={() => setSave(c.copyId, { kind: 'saving' })}
                          onSaved={() => { setSave(c.copyId, { kind: 'saved', at: new Date() }); refresh() }}
                          onSaveError={(retry) => setSave(c.copyId, { kind: 'error', retry })}
                        />
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {c.assigned ? (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <a href={`/decks/${c.assigned.deckId}`} className="underline">{c.assigned.deckName}</a>
                          <span className="text-muted-foreground">{deckStateLabel(c.assigned.deckState)}</span>
                          {c.isProxy && (
                            <button type="button" className={BTN_SM} disabled={busyId !== null} onClick={() => onReplaceClick(c)}>{L.replaceWithOriginal}</button>
                          )}
                        </span>
                      ) : c.state === 'missing' ? (
                        <span className="text-muted-foreground">{L.missing}</span>
                      ) : (
                        <span className="flex items-center gap-2 text-muted-foreground"><CopySwatch kind="open" />{c.isProxy ? L.proxy : L.open}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.isProxy || c.priceUsd == null ? '–' : formatPrice(c.priceUsd)}</td>
                    <td className="py-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`More actions for copy ${c.copyId}`}
                          className="inline-flex size-8 items-center justify-center rounded-md border border-[var(--border-emphasis)] max-sm:size-11"
                        >
                          <MoreVertical className="size-4" aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          {c.state !== 'missing' && (
                            <DropdownMenuItem onClick={() => { setRowError(null); setPanel({ copyId: c.copyId, kind: 'move-pick' }) }} className="max-sm:min-h-11">{L.moveToDeck}</DropdownMenuItem>
                          )}
                          {c.assigned && (
                            <DropdownMenuItem onClick={() => { setRowError(null); onUnassignClick(c) }} className="max-sm:min-h-11">{L.unassign}</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => { setRowError(null); setPanel({ copyId: c.copyId, kind: 'delete-confirm' }) }} className="max-sm:min-h-11">{L.deleteCopy}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>,
                  hasPanelRow(c) && (
                    <tr key={`${c.copyId}-extra`} data-testid="card-details-copy-extra">
                      <td />
                      <td colSpan={6} className="pb-2 pr-3">
                        {save && (
                          <SaveStatus
                            status={save.kind}
                            lastSavedAt={save.kind === 'saved' ? save.at : null}
                            onRetry={() => save.kind === 'error' && save.retry()}
                            errorText="Couldn't save. Nothing was changed."
                            className="min-h-0"
                          />
                        )}
                        {p?.kind === 'move-pick' && (
                          <div data-testid="card-details-move-pick" className="flex flex-col gap-1.5">
                            <span className="text-[length:var(--fs-xs)] text-muted-foreground">{L.moveToDeck}</span>
                            {data.waitingDecks.filter((d) => d.deckId !== c.assigned?.deckId).length === 0 ? (
                              <span className="text-muted-foreground">{L.noDecksWaiting}</span>
                            ) : (
                              <span className="flex flex-wrap gap-2">
                                {data.waitingDecks.filter((d) => d.deckId !== c.assigned?.deckId).map((d) => (
                                  <button key={d.deckCardsId} type="button" className={BTN_SM} disabled={busyId !== null} onClick={() => chooseDeck(c, d)}>{d.deckName}</button>
                                ))}
                              </span>
                            )}
                            <span><button type="button" className={BTN_SM} onClick={() => setPanel(null)}>Cancel</button></span>
                          </div>
                        )}
                        {p?.kind === 'move-confirm' && playableName && (
                          <div role="alert" data-testid="card-details-move-warning" className="flex flex-wrap items-center gap-2">
                            <span style={{ color: 'var(--signal-warning)' }}>{playableWarning(playableName)}</span>
                            <button type="button" className={`${BTN_SM} bg-primary text-primary-foreground`} disabled={busyId !== null} onClick={() => void doMove(c, p.deck)}>
                              {busyId === c.copyId ? 'Moving…' : `Confirm move to ${p.deck.deckName}`}
                            </button>
                            <button type="button" className={BTN_SM} onClick={() => setPanel(null)}>Cancel</button>
                          </div>
                        )}
                        {p?.kind === 'unassign-confirm' && playableName && (
                          <div role="alert" data-testid="card-details-unassign-warning" className="flex flex-wrap items-center gap-2">
                            <span style={{ color: 'var(--signal-warning)' }}>{playableWarning(playableName)}</span>
                            <button type="button" className={`${BTN_SM} bg-primary text-primary-foreground`} onClick={() => { setPanel(null); setUnassignPicker(c.copyId) }}>Confirm {L.unassign.toLowerCase()}</button>
                            <button type="button" className={BTN_SM} onClick={() => setPanel(null)}>Cancel</button>
                          </div>
                        )}
                        {p?.kind === 'delete-confirm' && (
                          <div role="alert" data-testid="card-details-delete-confirm" className="flex flex-wrap items-center gap-2">
                            {playableName && <span style={{ color: 'var(--signal-warning)' }}>{playableWarning(playableName)}</span>}
                            <span>Delete this copy permanently?</span>
                            <button type="button" className={`${BTN_SM} bg-destructive text-white`} disabled={busyId !== null} onClick={() => void doDelete(c)}>
                              {busyId === c.copyId ? 'Deleting…' : 'Confirm delete'}
                            </button>
                            <button type="button" className={BTN_SM} onClick={() => setPanel(null)}>Cancel</button>
                          </div>
                        )}
                        {p?.kind === 'no-original' && (
                          <p role="alert" className="flex items-center gap-2" data-testid="card-details-no-original">
                            {L.noOpenOriginal}
                            <button type="button" className={BTN_SM} onClick={() => setPanel(null)}>OK</button>
                          </p>
                        )}
                        {rowError?.id === c.copyId && (
                          <p role="alert" className="text-[length:var(--fs-xs)]" style={{ color: 'var(--signal-critical)' }}>{rowError.text}</p>
                        )}
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[length:var(--fs-xs)] text-muted-foreground">{L.copiesFootnote}</p>
      <LocationPickerModal
        open={unassignPicker !== null}
        cardName={data.cardName}
        printingInfo="Where should this copy go after unassigning?"
        onConfirm={(locId) => { if (unassignCopy) void doUnassign(unassignCopy.copyId, locId) }}
        onCancel={() => setUnassignPicker(null)}
      />
      {replaceFor && (
        <LocationPickerModal
          open
          cardName={data.cardName}
          printingInfo="Where should the proxy go?"
          onConfirm={(locId) => void doReplace(replaceFor, locId)}
          onCancel={() => setReplaceFor(null)}
        />
      )}
    </div>
  )
}
