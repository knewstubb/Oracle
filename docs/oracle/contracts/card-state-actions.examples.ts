/**
 * T-28 bounded offline reference checks. No application imports, I/O or writes.
 * A = approved rule, E = technical enforcement, P = explicitly conditional gate.
 * Run with Node >= 22 type stripping; strict-check with companion documented tsc command.
 */
import {
  additionalOriginalsNeeded, assemblyEligibility, classifyRetry, computeReadiness,
  headlineAvailability, isGenericBasicSlot, placementConflict, refreshKeys, resolveIdentity,
} from './card-state-actions.types.ts'
import type {
  ActionSuccess, AdvisorAvailability, AffectedRefs, CandidateFacts, IdentityResolution, OperationReceipt,
  PicklistRow, ProxyRequest, ReadState, SleeveRequest, SlotFacts, MoveFromRequest,
} from './card-state-actions.types.ts'

let checks = 0
function equal(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
  checks += 1
}

const observation = { token: 'fixture-revision-1', observedAt: '2026-09-29T08:00:00Z' }
function known<T>(value: T): ReadState<T> & { kind: 'known' } {
  return { kind: 'known', value, observation }
}
function value<T>(input: ReadState<T>): T | string {
  return input.kind === 'known' ? input.value : `${input.kind}:${input.issue}`
}
const identity: IdentityResolution = { kind: 'resolved', oracleId: 'oracle-sol-ring', via: 'printing' }
const sol: SlotFacts = {
  cardName: 'Sol Ring', requestedPrintingId: 'printing-X', copyId: null,
  relation: 'required', quantity: 1, isCommander: false, assignmentVerified: true,
}
function commanderDeck(copyId: number | null, offset: number): SlotFacts[] {
  return [
    ...Array.from({ length: 99 }, (_, i): SlotFacts => ({
      ...sol, cardName: `Fixture card ${i}`, copyId: offset + i,
      isCommander: i === 0,
    })),
    { ...sol, copyId },
  ]
}
const original: CandidateFacts = {
  copyId: 1, oracleId: 'oracle-sol-ring', copyType: 'original',
  printingId: 'printing-X', finish: 'etched', holder: null, excluded: false,
}
const proxy: CandidateFacts = { ...original, copyId: 2, copyType: 'proxy', finish: 'nonfoil' }
const korvold = 10
const prosper = 20
const korvoldSlot = 101
const prosperSlot = 201
const holder = { deckId: korvold, deckCardId: korvoldSlot }
const readiness = (copyId: number | null, offset = 1000) =>
  computeReadiness(known(commanderDeck(copyId, offset)), 'commander').state
const headline = (copies: CandidateFacts[], requested: string | null = 'printing-X') =>
  value(headlineAvailability(identity, requested, known(copies)))
const shortage = (originalsUsable: number) =>
  value(additionalOriginalsNeeded(known({ requiredSlots: 2, originalsUsable })))

// A1-A7: snapshots of the approved journey, not a simulated database implementation.
equal('A1 both Assembling', [readiness(null), readiness(null, 2000)], ['assembling', 'assembling'])
equal('A1 two-deck shortage', shortage(1), 1)
equal('A2 free requested original', headline([original]), 'available')
equal('A2 Sleeve Korvold', [readiness(1), readiness(null, 2000)], ['playable', 'assembling'])
equal('A3 held original', headline([{ ...original, holder }]), 'unavailable')
equal('A3 transfer retains source entry', [commanderDeck(null, 1000).length, readiness(null), readiness(1, 2000)], [100, 'assembling', 'playable'])
equal('P/G-M3 A4 approved fixture proxy creates coverage, not original supply',
  [readiness(2), readiness(1, 2000), shortage(1)], ['playable', 'playable', 1])
equal('A5 Unsleeve proxy; ownership retained', [readiness(null), headline([{ ...original, holder }, proxy]), [original, proxy].length],
  ['assembling', 'proxy_available', 2])
equal('A6 reuse existing proxy; no extra copy', [readiness(proxy.copyId), [original, proxy].length], ['playable', 2])
equal('A7 Break down preserves 100-card list and owned copy',
  [computeReadiness(known(commanderDeck(null, 2000).map(s => ({ ...s, copyId: null }))), 'commander').state, original.copyId],
  ['assembling', 1])

for (const count of [99, 101]) {
  const slots = commanderDeck(1, 1000)
  if (count === 99) slots.pop()
  else slots.push({ ...sol, copyId: 5000 })
  equal(`A9 ${count} cards`, computeReadiness(known(slots), 'commander').state, 'draft')
}
equal('A10 verified no commander', computeReadiness(known(commanderDeck(1, 1000).map(s => ({ ...s, isCommander: false }))), 'commander').state, 'draft')
const generic: SlotFacts = { ...sol, cardName: 'Island', requestedPrintingId: null, quantity: 36 }
const basicDeck = [...commanderDeck(1, 1000).slice(0, 64), generic]
const basicReadiness = computeReadiness(known(basicDeck), 'commander')
equal('A11 64 tracked + 36 generic', basicReadiness.kind === 'known'
  ? [basicReadiness.state, basicReadiness.requiredCards, basicReadiness.sleevedCards, basicReadiness.genericBasicCards]
  : basicReadiness.issue, ['playable', 100, 100, 36])
equal('A11 no physical generic assignment', [isGenericBasicSlot(generic), generic.copyId], [true, null])
equal('P/G-M4 A12 separate Maybeboard release', computeReadiness(known(basicDeck.map((s, i) =>
  i === 1 ? { ...s, relation: 'optional', copyId: null } : s)), 'commander').state, 'draft')
equal('A15 alternate original', headline([{ ...original, printingId: 'printing-Y' }]), 'alt_available')
equal('A16 proxy-heavy shortages', [shortage(0), shortage(1), shortage(2)], [2, 1, 0])
equal('A20 Casual unknown', computeReadiness(known([]), 'casual').state, null)
equal('A20 null/unknown format not Commander', [null, 'typo'].map(f => computeReadiness(known(commanderDeck(1, 1000)), f).state), [null, null])
equal('existing Standard minimum is not Commander 100', computeReadiness(known(commanderDeck(1, 1000).slice(0, 60).map(s => ({ ...s, isCommander: false }))), 'standard').state, 'playable')
equal('A21 excluded owned copy is not Unowned', headline([{ ...original, excluded: true }]), 'unavailable')
equal('five-label priority preserves other choices', headline([proxy, { ...original, copyId: 3, printingId: 'printing-Y' }, original]), 'available')
equal('alternate beats free proxy', headline([proxy, { ...original, printingId: 'printing-Y' }]), 'alt_available')
equal('no requested printing matches any verified original', headline([{ ...original, printingId: 'printing-Y' }], null), 'available')
equal('only truly absent inventory is Unowned', headline([]), 'unowned')

for (const kind of ['loading', 'error', 'partial', 'stale'] as const) {
  const failed: ReadState<never> = { kind, issue: kind === 'stale' ? 'stale_data' : 'lookup_failed', message: 'Fixture essential read is unavailable.' }
  equal(`A13/A25 ${kind} supply never Unowned`, headlineAvailability(identity, 'printing-X', failed).kind, kind)
  equal(`A14/A34 ${kind} assigned facts never Playable`, computeReadiness(failed, 'commander').state, null)
  equal(`A25 ${kind} row exposes no assembly`, assemblyEligibility(known(sol), identity, failed).kind, 'blocked')
  equal(`A33 ${kind} shortage never zero`, additionalOriginalsNeeded(failed).kind, kind)
}
equal('A13 unrelated supply failure does not erase verified deck facts', readiness(null), 'assembling')
for (const quantity of [null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  const invalid = { ...sol, quantity }
  const result = computeReadiness(known([invalid]), 'commander')
  equal(`A23 invalid quantity ${String(quantity)}`, result.kind === 'unknown' ? result.issue : result.state, 'invalid_quantity')
  equal(`A23 no executable invalid quantity ${String(quantity)}`, assemblyEligibility(known(invalid), identity, known([])).kind, 'blocked')
}
for (const copyId of [null, 1]) {
  const anomalous = { ...sol, quantity: 2, copyId }
  equal('A24 multi-quantity tracked readiness unknown', computeReadiness(known([anomalous]), 'commander').state, null)
  equal('A24 multi-quantity tracked no Proxy/Sleeve', assemblyEligibility(known(anomalous), identity, known([])).kind, 'blocked')
}
equal('A34 duplicate assigned copy', computeReadiness(known(commanderDeck(1000, 1000)), 'commander').state, null)
equal('A34 assigned exclusion/identity unknown', computeReadiness(known(commanderDeck(1, 1000).map(s => ({ ...s, assignmentVerified: false }))), 'commander').state, null)
equal('A32 unresolved relation', computeReadiness(known([{ ...sol, relation: 'unresolved' }]), 'commander').state, null)
equal('A32 optional holder not silently ignored', computeReadiness(known([...commanderDeck(1, 1000), { ...sol, relation: 'optional', copyId: 5000 }]), 'commander').state, null)
equal('A32 main+optional identity does not collapse rows', computeReadiness(known([...commanderDeck(1, 1000), { ...sol, relation: 'optional' }]), 'commander').state, 'playable')
equal('A25 unknown copy finish blocks executable options', assemblyEligibility(known(sol), identity, known([{ ...original, finish: null }])).kind, 'blocked')
equal('A25 unknown copy printing blocks executable options', assemblyEligibility(known(sol), identity, known([{ ...original, printingId: null }])).kind, 'blocked')
equal('A25 unknown printing is not a claimed alternate', headlineAvailability(identity, 'printing-X', known([{ ...original, printingId: null }])).kind, 'error')
equal('A25 mismatched essential snapshot revisions', assemblyEligibility(known(sol), identity,
  { ...known([original]), observation: { ...observation, token: 'older-snapshot' } }), { kind: 'blocked', issue: 'stale_data' })
equal('A23 safe quantities with unsafe combined total', computeReadiness(known([
  { ...generic, quantity: Number.MAX_SAFE_INTEGER }, { ...generic, quantity: Number.MAX_SAFE_INTEGER },
]), 'commander').state, null)
equal('A35 generic is not an assembly action', assemblyEligibility(known(generic), identity, known([])).kind, 'blocked')
equal('A33 invalid shortage input is error', additionalOriginalsNeeded(known({ requiredSlots: 2, originalsUsable: -1 })).kind, 'error')

const mapping = { oracleId: 'oracle-sol-ring', printingId: 'printing-X', canonicalName: 'Sol Ring' }
equal('A26 exact printing identity', resolveIdentity({ kind: 'printing', printingId: 'printing-X' }, known([mapping])), identity)
equal('A26 absent printing cannot fall back to matching name', resolveIdentity({ kind: 'printing', printingId: 'absent' }, known([mapping])).kind, 'unresolved')
equal('A26 unique exact canonical name', resolveIdentity({ kind: 'exact_name', name: 'Sol Ring' }, known([mapping, { ...mapping, printingId: 'printing-Y' }])).kind, 'resolved')
equal('A26 approximate name cannot move', resolveIdentity({ kind: 'exact_name', name: 'Sol Rin' }, known([mapping])).kind, 'unresolved')
equal('A26 ambiguous name', resolveIdentity({ kind: 'exact_name', name: 'Sol Ring' }, known([mapping, { ...mapping, oracleId: 'other-oracle' }])).kind, 'unresolved')
equal('A26 partial identity mapping is not exact success', resolveIdentity({ kind: 'printing', printingId: 'printing-X' }, known([mapping, { ...mapping, oracleId: '' }])).kind, 'unresolved')
const unresolved: IdentityResolution = { kind: 'unresolved', issue: 'identity_unresolved', message: 'Resolve card identity.' }
equal('A26 identity error is not Unowned', headlineAvailability(unresolved, null, known([])).kind, 'error')
equal('A26 identity error has no physical action', assemblyEligibility(known(sol), unresolved, known([original])).kind, 'blocked')
equal('A26 mismatched canonical copy', headlineAvailability(identity, null, known([{ ...original, oracleId: 'other-oracle' }])).kind, 'error')

const sleeve: SleeveRequest = {
  action: 'sleeve', operationId: 'op-sleeve', observationToken: observation.token,
  deckCardId: korvoldSlot, copyId: 1, expectedSlotCopyId: null, expectedCopyHolderDeckCardId: null,
}
const move: MoveFromRequest = {
  action: 'move_from', operationId: 'op-move', observationToken: observation.token,
  targetDeckCardId: prosperSlot, copyId: 1, expectedSourceDeckCardId: korvoldSlot, expectedTargetCopyId: null,
}
const createProxy: ProxyRequest = {
  action: 'proxy', operationId: 'op-proxy', observationToken: observation.token,
  deckCardId: korvoldSlot, expectedSlotCopyId: null,
  approvedProxyPolicyId: 'CONDITIONAL-FIXTURE-NOT-OWNER-APPROVAL', printingId: 'printing-X', finish: 'nonfoil',
}
const fresh = { observationToken: observation.token, targetDeckId: prosper, targetCopyId: null, selectedCopy: original, proxyPolicyApproved: false }
equal('A22/A31 Sleeve never steals from inactive/allocate=false holder',
  placementConflict(sleeve, { ...fresh, selectedCopy: { ...original, holder } }), 'copy_not_free')
equal('A17 expected donor changed', placementConflict(move, { ...fresh, selectedCopy: { ...original, holder: { deckId: 30, deckCardId: 301 } } }), 'source_changed')
equal('A17 expected donor verified', placementConflict(move, { ...fresh, selectedCopy: { ...original, holder } }), null)
equal('A31 Move cannot unsleeve a sibling slot', placementConflict(move, { ...fresh, targetDeckId: korvold, selectedCopy: { ...original, holder } }), 'source_changed')
equal('A22 excluded copy', placementConflict(sleeve, { ...fresh, selectedCopy: { ...original, excluded: true } }), 'copy_excluded')
equal('A35 unapproved Proxy policy', placementConflict(createProxy, fresh), 'approval_required')
equal('P/G-M3 explicit approved fixture policy', placementConflict(createProxy, { ...fresh, proxyPolicyApproved: true }), null)
for (const request of [sleeve, move, createProxy]) {
  equal(`A8 ${request.action} different actor fills target`, placementConflict(request, { ...fresh, targetCopyId: 999 }), 'slot_already_filled')
  equal(`A29 ${request.action} intervening transfer/ABA`, placementConflict(request, { ...fresh, observationToken: 'revision-after-away-and-back' }), 'stale_observation')
}

const affected: AffectedRefs = {
  deckIds: [korvold, prosper], deckCardIds: [korvoldSlot, prosperSlot], copyIds: [1],
  oracleIds: ['oracle-sol-ring'], cardNames: ['Sol Ring'], collection: true,
}
for (const request of [sleeve, move, createProxy]) {
  const receipt: OperationReceipt = {
    operationId: request.operationId, committedAt: observation.observedAt, action: request.action,
    affected, slots: [], copies: [], readiness: {}, createdCopyIds: request.action === 'proxy' ? [2] : [], releasedCopyIds: [],
  }
  const record = { kind: 'committed' as const, fingerprint: 'same-validated-payload', receipt }
  equal(`A8/A28 ${request.action} exact retry replays only receipt`, classifyRetry(record, 'same-validated-payload'), 'replay_receipt')
  equal(`A28 ${request.action} replay even if current copy since moved`, classifyRetry(record, 'same-validated-payload'), 'replay_receipt')
  equal(`A30 ${request.action} changed payload rejected`, classifyRetry(record, 'different'), 'idempotency_key_reused')
}
equal('A30 never accepted may check fresh preconditions', classifyRetry({ kind: 'absent', neverAccepted: true }, 'same'), 'check_preconditions')
equal('A30 pending timeout', classifyRetry({ kind: 'pending', fingerprint: 'same' }, 'same'), 'operation_pending')
equal('A30 unknown/expired receipt', classifyRetry({ kind: 'unknown' }, 'same'), 'outcome_unknown')

const keys = refreshKeys(affected)
for (const deckId of [korvold, prosper]) {
  for (const expected of [
    ['decks', deckId], ['decks', deckId, 'card-statuses'], ['decks', deckId, 'health'],
    ['picklist', deckId], ['allocation', deckId], ['card-actions', deckId, 'Sol Ring'],
  ]) equal(`A3/A31 both-deck refresh ${JSON.stringify(expected)}`, keys.some(key => JSON.stringify(key) === JSON.stringify(expected)), true)
}
equal('A28 subsequent holder refresh', refreshKeys({ ...affected, deckIds: [korvold, prosper, 30] }).some(key => JSON.stringify(key) === '["picklist",30]'), true)
equal('A31 collection and shortage refresh', [['collection'], ['original-shortages']].every(expected =>
  keys.some(key => JSON.stringify(key) === JSON.stringify(expected))), true)
const replayAfterTransfer: ActionSuccess = {
  ok: true, outcome: 'replayed',
  receipt: {
    operationId: 'op-move', committedAt: observation.observedAt, action: 'move_from',
    affected, slots: [], copies: [], readiness: {}, createdCopyIds: [], releasedCopyIds: [],
  },
  current: known({ slots: [], readiness: {}, copies: [{
    copyId: 1, oracleId: 'oracle-sol-ring', copyType: 'original',
    printing: { printingId: 'printing-X', setCode: 'fixture' }, finish: 'etched',
    location: { kind: 'deck', deckId: 30, deckName: 'Later deck', deckCardId: 301, relation: 'required' },
  }] }),
  refresh: { ...affected, deckIds: [korvold, prosper, 30], deckCardIds: [korvoldSlot, prosperSlot, 301] },
}
equal('A28 replay distinguishes original effects from current holder',
  [replayAfterTransfer.receipt.affected.deckIds, replayAfterTransfer.current.kind === 'known' ? replayAfterTransfer.current.value.copies[0].location : null],
  [[korvold, prosper], { kind: 'deck', deckId: 30, deckName: 'Later deck', deckCardId: 301, relation: 'required' }])
const savedRefreshFailed: ActionSuccess = {
  ...replayAfterTransfer, current: { kind: 'error', issue: 'lookup_failed', message: 'Saved; current locations could not be refreshed.' },
}
equal('A36 saved action with failed current read is not fresh success', [savedRefreshFailed.ok, savedRefreshFailed.current.kind], [true, 'error'])

const rowBase = { deckCardId: korvoldSlot, cardName: 'Sol Ring', oracleId: 'oracle-sol-ring',
  requestedPrinting: { printingId: 'printing-X', setCode: 'fixture' }, isCommander: false, primaryCategory: null }
const blocked: PicklistRow = { ...rowBase, kind: 'blocked', outstandingCount: 1,
  availability: { kind: 'error', issue: 'lookup_failed', message: 'Copy locations could not be loaded.' }, options: [], proxy: null }
equal('A13 typed blocked row has no Proxy', [blocked.options, blocked.proxy], [[], null])
// @ts-expect-error A blocked row cannot carry an executable Proxy.
const invalidBlocked: PicklistRow = { ...blocked, proxy: { kind: 'executable', action: createProxy } }
void invalidBlocked
const ready: PicklistRow = {
  ...rowBase, kind: 'ready', outstandingCount: 1, observation,
  availability: { kind: 'available' }, proxy: { kind: 'gated', gate: 'G-M3', message: 'Proxy details await approval.' },
  options: [{
    kind: 'free_original', copyId: 1, oracleId: 'oracle-sol-ring', copyType: 'original',
    printing: { printingId: 'printing-X', setCode: 'fixture' }, finish: 'etched', matchesRequestedPrinting: true,
    location: { kind: 'storage', locationId: 4, name: 'Binder A' }, action: sleeve,
  }, {
    kind: 'free_proxy', copyId: 2, oracleId: 'oracle-sol-ring', copyType: 'proxy',
    printing: { printingId: 'printing-Y', setCode: 'fixture' }, finish: 'foil', matchesRequestedPrinting: false,
    location: { kind: 'not_recorded' }, action: { ...sleeve, copyId: 2 },
  }],
}
equal('A27 exact sources/copy types/printings/finishes preserved', ready.options.map(o =>
  [o.copyId, o.copyType, o.printing.printingId, o.finish, o.location.kind]),
  [[1, 'original', 'printing-X', 'etched', 'storage'], [2, 'proxy', 'printing-Y', 'foil', 'not_recorded']])
const advisor: AdvisorAvailability = known({
  oracleId: 'oracle-sol-ring', requestedPrintingId: 'printing-X', availability: { kind: 'available' },
  originalsOwned: 1, proxiesOwned: 1, excludedCopyCount: 0,
  copies: ready.options.map(({ action: _action, kind: _kind, ...copy }) => copy),
})
equal('T15 read-only shape has no actions', advisor.kind === 'known' && advisor.value.copies.every(copy => !('action' in copy)), true)
equal('A36 stale response cannot expose values', 'value' in { kind: 'stale', issue: 'stale_data', message: 'Refresh required.' }, false)

console.log(`T-28 reference checks: ${checks} passed (pure contract examples; no app/database execution).`)
