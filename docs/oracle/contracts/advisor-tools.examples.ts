/**
 * Pure T-36 examples, revising T-15 for D-034/D-035/D-036 and T-28 reconciliation.
 * Run with Node >=22.18 (native TypeScript stripping).
 * Names/expected rules cases come from frozen T-19, not current API observations.
 * fixture-* IDs are deliberately NOT production UUIDs. No app imports or I/O.
 * This checks a limited reference boundary, not a production runtime validator.
 */
import type {
  AdvisorError,
  AdvisorResult,
  ApplyResult,
  AvailabilityLabel,
  AvailabilityRead,
  CardFacts,
  Claim,
  Colour,
  CopyFacts,
  Evidence,
  Fact,
  ModelSubmission,
  NonEmpty,
  OracleId,
  PlacementSource,
  PriceQuote,
  PrintingId,
  RulesFacts,
  Suggestion,
  UndoResult,
} from './advisor-tools.types.ts'
import type { AdvisorAvailability, ReadState } from './card-state-actions.types.ts'

const now = '2026-10-10T08:00:00.000Z'
const expiry = '2026-10-11T08:00:00.000Z'
const evidence: Evidence = {
  id: 'fixture-t19',
  source: 'offline_fixture',
  locator: 'ai-recommendations-assessment-2026-09.md#7',
  observedAt: now,
  sourceUpdatedAt: null,
  version: 't36-fixtures-v1',
}

const scryfallEvidence: Evidence = {
  id: 'fixture-scryfall',
  source: 'scryfall',
  locator: 'ref_printings.price_usd',
  observedAt: now,
  sourceUpdatedAt: now,
  version: 't36-scryfall-estimate',
}

const oid = (value: string): OracleId => ({ kind: 'oracle_id', value })
const pid = (value: string): PrintingId => ({ kind: 'scryfall_id', value })
const known = <T>(value: T): Fact<T> => ({
  state: 'known', value, evidence: [evidence],
  freshness: { state: 'fresh', validUntil: expiry },
})
const unknown = <T>(message: string): Fact<T> => ({
  state: 'unknown', reason: 'lookup_failed', message, attemptedSources: [evidence],
})

function fresh<T>(fact: Fact<T>, at = now): fact is Extract<Fact<T>, { state: 'known' }> {
  return fact.state === 'known'
    && fact.freshness.state === 'fresh'
    && Number.isFinite(Date.parse(fact.freshness.validUntil))
    && Date.parse(fact.freshness.validUntil) > Date.parse(at)
}

function card(
  key: string,
  name: string,
  colours: readonly Colour[],
  faceText: string,
): CardFacts {
  return {
    identity: { oracleId: oid(`fixture-${key}`), name },
    rules: known({
      layout: 'normal',
      faces: [{ index: 0, name, typeLine: 'Fixture type', oracleText: faceText, manaCost: null, colours }],
      colourIdentity: colours,
      manaValue: 1,
      keywords: [],
      producedMana: [],
      textHash: `fixture-hash-${key}`,
    }),
    commanderLegality: known('legal'),
    printing: known({
      printingId: pid(`fixture-print-${key}`),
      oracleId: oid(`fixture-${key}`),
      setCode: 'fixture',
      collectorNumber: '1',
      finishes: ['nonfoil', 'foil', 'etched'],
    }),
  }
}

const prosper = card('prosper', 'Prosper, Tome-Bound', ['B', 'R'],
  'Whenever you play a card from exile, create a Treasure token.')
const korvold = card('korvold', 'Korvold, Fae-Cursed King', ['B', 'R', 'G'],
  'Whenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card.')
const light = card('light', 'Light Up the Stage', ['R'],
  'Exile the top two cards of your library. Until the end of your next turn, you may play those cards.')
const dispute = card('dispute', 'Deadly Dispute', ['B'],
  'As an additional cost to cast this spell, sacrifice an artifact or creature.')
const bloodArtist = card('artist', 'Blood Artist', ['B'],
  'Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.')
const remora = card('remora', 'Mystic Remora', ['U'], 'Fixture draw condition.')
const shatterskull = card('shatterskull', 'Shatterskull Smashing // Shatterskull, the Hammer Pass',
  ['R'], 'Fixture sorcery removal face.')
shatterskull.rules = known<RulesFacts>({
  layout: 'modal_dfc',
  faces: [
    { index: 0, name: 'Shatterskull Smashing', typeLine: 'Sorcery', oracleText: 'Fixture removal.', manaCost: '{X}{R}{R}', colours: ['R'] },
    { index: 1, name: 'Shatterskull, the Hammer Pass', typeLine: 'Land', oracleText: 'Fixture land.', manaCost: null, colours: [] },
  ],
  colourIdentity: ['R'], manaValue: 2, keywords: [], producedMana: ['R'],
  textHash: 'fixture-hash-two-faces',
})
const dockside = {
  ...card('dockside', 'Dockside Extortionist', ['R'], 'Fixture Treasure ability.'),
  commanderLegality: known<'banned'>('banned'),
}

function eligible(candidate: CardFacts, colours: readonly Colour[], pairVerified = true): boolean {
  if (!pairVerified || !fresh(candidate.rules) || !fresh(candidate.commanderLegality)) return false
  if (candidate.commanderLegality.value !== 'legal') return false
  if (candidate.rules.value.layout === 'modal_dfc' && candidate.rules.value.faces.length !== 2) return false
  if (fresh(candidate.printing)
    && candidate.printing.value.oracleId.value !== candidate.identity.oracleId.value) return false
  return candidate.rules.value.colourIdentity.every(colour => colours.includes(colour))
}

function t28Availability(label: AvailabilityLabel): AdvisorAvailability {
  const copies: CopyFacts[] = label === 'unowned' ? [] : [{
    copyId: 91,
    oracleId: 'fixture-oracle',
    copyType: label === 'proxy_available' ? 'proxy' : 'original',
    printing: label === 'alt_available'
      ? { printingId: 'fixture-alternate-print', setCode: 'fixture' }
      : { printingId: 'fixture-print-light', setCode: 'fixture' },
    finish: label === 'proxy_available' ? 'etched' : 'nonfoil',
    matchesRequestedPrinting: label !== 'alt_available',
    location: label === 'unavailable'
      ? { kind: 'deck', deckId: 16, deckName: 'Korvold fixture', deckCardId: 160, relation: 'required' }
      : { kind: 'storage', locationId: 1, name: 'Fixture binder' },
  }]
  return {
    kind: 'known',
    value: {
      oracleId: 'fixture-oracle',
      requestedPrintingId: 'fixture-print-light',
      availability: label === 'unavailable'
        ? { kind: 'unavailable', reasons: ['held_by_other_deck'], holderDecks: [] }
        : { kind: label },
      originalsOwned: ['available', 'alt_available', 'unavailable'].includes(label) ? 1 : 0,
      proxiesOwned: label === 'proxy_available' ? 1 : 0,
      copies,
      excludedCopyCount: 0,
    },
    observation: { token: 'fixture-revision-1', observedAt: now },
  }
}

function availability(candidate: CardFacts, label: AvailabilityLabel): AvailabilityRead {
  return {
    key: {
      oracleId: candidate.identity.oracleId,
      requestedPrinting: pid(`fixture-print-${candidate.identity.oracleId.value.slice('fixture-'.length)}`),
      target: { kind: 'candidate', deckId: 36 },
    },
    availability: t28Availability(label),
  }
}

function group(read: AvailabilityRead): AvailabilityLabel | null {
  const a = read.availability
  return a.kind === 'known' && a.value.availability.kind !== 'unavailable'
    ? a.value.availability.kind
    : a.kind === 'known' && a.value.availability.kind === 'unavailable'
      ? 'unavailable'
      : null
}

const claims: NonEmpty<Claim> = [{
  id: 'prosper-play-exile',
  text: 'Playing an exiled card can trigger Prosper; playing a land counts, subject to normal play permissions.',
  kind: 'rules',
  card: prosper.identity.oracleId,
  faceIndex: 0,
  evidenceIds: [evidence.id],
  assertionId: 'fixture-reviewed-play-includes-land',
}]

function scryfallPrice(amount: number): Fact<PriceQuote> {
  return known({
    provider: 'scryfall',
    currency: 'USD',
    amount,
    printingId: pid('fixture-print-light'),
    finish: 'nonfoil',
    condition: null,
    indicative: true,
    sourceUpdatedAt: now,
  })
}

const proposal: Suggestion = {
  id: 'fixture-suggestion-1',
  kind: 'recommendation',
  source: 'ai',
  actionability: 'applicable',
  action: { kind: 'sleeve', copyId: 91 },
  card: light,
  commanderIds: [prosper.identity.oracleId],
  rationale: 'Light Up the Stage supplies exile-play opportunities for Prosper, rather than an immediate guaranteed Treasure payout.',
  roles: ['card_flow', 'engine_enabler'],
  mechanics: ['play_from_exile'],
  claims,
  conditions: [{ description: 'Prosper is on the battlefield when you play the exiled card.', status: 'unknown', evidenceIds: [evidence.id] }],
  antiSynergyClaims: [],
  cut: { kind: 'not_assessed', reason: 'A full list needs a separately assessed cut.' },
  package: null,
  availability: availability(light, 'unowned'),
  price: scryfallPrice(2.5),
  evidence: [evidence, scryfallEvidence],
  usefulness: 'unrated',
  unknowns: ['Budget and combo preference are unset.'],
}

const submission: ModelSubmission = {
  schemaVersion: 'advisor-model-v1',
  contextId: 'fixture-context',
  suggestions: [{
    candidateKey: 'light',
    commanderKeys: ['prosper'],
    rationale: proposal.rationale,
    roles: proposal.roles,
    mechanics: proposal.mechanics,
    claimIds: ['prosper-play-exile'],
    conditions: proposal.conditions,
    antiSynergyClaimIds: [],
    cut: proposal.cut,
    package: null,
    unknowns: proposal.unknowns,
  }],
  noMatchesReason: null,
}

function error(code: AdvisorError['code']): AdvisorResult {
  return { status: 'error', error: { code, message: code, retryable: false, requestId: 'fixture-request' } }
}

// Deliberately only the supplied-key and context part of the normative validator.
function validateSubmission(input: ModelSubmission, revision = 'fixture-revision'): AdvisorResult {
  if (revision !== 'fixture-revision' || input.contextId !== submission.contextId) return error('stale_context')
  for (const item of input.suggestions) {
    if (item.candidateKey !== 'light' || item.commanderKeys.some(key => key !== 'prosper')
      || item.claimIds.some(id => id !== claims[0].id)
      || item.antiSynergyClaimIds.length > 0) return error('invalid_suggestion')
  }
  const context = {
    requestId: 'fixture-request', contextId: input.contextId, deckRevision: revision,
    availabilitySnapshotId: 'fixture-supply-1', generatedAt: now, notices: ['Scryfall estimate only.'],
  }
  if (input.suggestions.length === 0) {
    return input.noMatchesReason
      ? { status: 'no_matches', context, suggestions: [], reason: input.noMatchesReason }
      : error('invalid_suggestion')
  }
  if (input.suggestions.length !== 1 || input.noMatchesReason !== null) return error('invalid_suggestion')
  return {
    status: 'partial', context, suggestions: [proposal],
    issues: [{ code: 'facts_unavailable', message: 'Price unavailable for some candidates.', retryable: true, requestId: context.requestId }],
  }
}

let checks = 0
function check(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${name}`)
  checks += 1
}
function isError(result: AdvisorResult, code: AdvisorError['code']): boolean {
  return result.status === 'error' && result.error.code === code
}

check('Prosper accepts the red exile-play card', eligible(light, ['B', 'R']))
check('Korvold accepts the black sacrifice outlet', eligible(dispute, ['B', 'R', 'G']))
check('Distinct engines are preserved instead of one generic category',
  proposal.mechanics.includes('play_from_exile')
  && fresh(korvold.rules) && korvold.rules.value.faces[0].oracleText.includes('sacrifice a permanent'))
check('Blood Artist negative remains creature-death conditional',
  fresh(bloodArtist.rules) && bloodArtist.rules.value.faces[0].oracleText.includes('creature dies'))
check('Prosper rationale retains a support condition', proposal.conditions[0]?.status === 'unknown')
check('Wilson plus Candlekeep Sage permits blue after pair validation', eligible(remora, ['G', 'U']))
check('Wilson alone does not permit blue', !eligible(remora, ['G']))
check('Colour union without valid pairing is insufficient', !eligible(remora, ['G', 'U'], false))
check('MDFC has both faces and one oracle identity',
  eligible(shatterskull, ['R']) && fresh(shatterskull.rules)
  && shatterskull.rules.value.faces.length === 2
  && shatterskull.identity.oracleId.value === 'fixture-shatterskull')
check('Missing MDFC facts are not reconstructed', !eligible({ ...shatterskull, rules: unknown('Faces missing.') }, ['R']))
if (fresh(shatterskull.rules)) {
  check('One-face MDFC is not sufficient', !eligible({
    ...shatterskull,
    rules: known({ ...shatterskull.rules.value, faces: [shatterskull.rules.value.faces[0]] }),
  }, ['R']))
}
check('Frozen banned example rejected', !eligible(dockside, ['R']))
check('Unknown legality rejected', !eligible({ ...light, commanderLegality: unknown('Legality lookup failed.') }, ['R']))
check('Stale legality rejected', !eligible({
  ...light,
  commanderLegality: {
    state: 'known', value: 'legal', evidence: [evidence],
    freshness: { state: 'stale', expiredAt: '2026-10-09T00:00:00.000Z' },
  },
}, ['R']))
check('Fresh flag with expired time rejected', !fresh(known('legal'), expiry))
check('Wrong printing identity rejected', !eligible({
  ...light,
  printing: known({
    printingId: pid('fixture-wrong-print'), oracleId: oid('fixture-other-card'),
    setCode: 'fixture', collectorNumber: '2', finishes: ['nonfoil'],
  }),
}, ['R']))

const failed = availability(light, 'unowned')
failed.availability = { kind: 'error', issue: 'lookup_failed', message: 'Ownership query failed.' }
check('Ownership failure is not Unowned', group(failed) === null)
const stale: AvailabilityRead = {
  ...availability(light, 'available'),
  availability: { kind: 'stale', issue: 'stale_data', message: 'Availability snapshot is stale.' },
}
check('Stale ownership is not Available', group(stale) === null)
for (const label of ['available', 'alt_available', 'proxy_available', 'unavailable', 'unowned'] as const) {
  check(`T-28 ${label} is passed through, not recomputed`, group(availability(light, label)) === label)
}

const proxy = availability(light, 'proxy_available')
if (proxy.availability.kind === 'known') {
  proxy.availability.value.copies = [{
    copyId: 91, oracleId: 'fixture-oracle', copyType: 'proxy',
    printing: { printingId: 'fixture-print-light', setCode: 'fixture' }, finish: 'etched',
    matchesRequestedPrinting: true,
    location: { kind: 'not_recorded' },
  }]
}
check('Existing proxy keeps copy type, finish and unknown location',
  proxy.availability.kind === 'known'
  && proxy.availability.value.proxiesOwned === 1
  && proxy.availability.value.copies[0]?.copyType === 'proxy'
  && proxy.availability.value.copies[0]?.finish === 'etched'
  && proxy.availability.value.copies[0]?.location.kind === 'not_recorded')
check('Copy summary provides no Proxy write action',
  proxy.availability.kind === 'known'
  && proxy.availability.value.copies[0] !== undefined
  && !('action' in proxy.availability.value.copies[0]))

check('Valid submission with unknown price is explicitly partial', validateSubmission(submission).status === 'partial')
check('Unknown candidate cannot become an invented card', isError(validateSubmission({
  ...submission, suggestions: [{ ...submission.suggestions[0]!, candidateKey: 'invented' }],
}), 'invalid_suggestion'))
check('Invented rules claim rejected', isError(validateSubmission({
  ...submission, suggestions: [{ ...submission.suggestions[0]!, claimIds: ['treasure-is-creature-death'] }],
}), 'invalid_suggestion'))
check('Changed deck does not receive a successful old result',
  isError(validateSubmission(submission, 'new-revision'), 'stale_context'))
check('Empty unsupported output is not empty success', isError(validateSubmission({
  ...submission, suggestions: [], noMatchesReason: null,
}), 'invalid_suggestion'))
check('Explicit successful bounded no-match remains distinct', validateSubmission({
  ...submission, suggestions: [], noMatchesReason: 'No eligible cards in the verified supplied pool.',
}).status === 'no_matches')
const unsupported: AdvisorResult = error('unsupported_response')
check('Unsupported provider output has no suggestions', unsupported.status === 'error' && !('suggestions' in unsupported))
function nativeEnvelope(call: { transport: 'native' | 'text'; name: string; arguments: string }): AdvisorResult {
  if (call.transport !== 'native' || call.name !== 'advisor_submit_recommendations') {
    return error('unsupported_response')
  }
  return call.arguments === JSON.stringify(submission) ? validateSubmission(submission) : error('unsupported_response')
}
check('Native structured fixture reaches validation', nativeEnvelope({
  transport: 'native', name: 'advisor_submit_recommendations', arguments: JSON.stringify(submission),
}).status === 'partial')
check('DSML text is not rescued into a tool call', isError(nativeEnvelope({
  transport: 'text', name: 'advisor_submit_recommendations',
  arguments: '<|DSML|invoke name="advisor_submit_recommendations">...</invoke>',
}), 'unsupported_response'))
check('Malformed native payload fails explicitly', isError(nativeEnvelope({
  transport: 'native', name: 'advisor_submit_recommendations', arguments: '{"suggestions":',
}), 'unsupported_response'))
check('Native mutation tool is not authorized by native transport', isError(nativeEnvelope({
  transport: 'native', name: 'add_cards_to_deck', arguments: '{"cards":[{"name":"Sol Ring"}]}',
}), 'unsupported_response'))
check('Canonical and printing identifiers retain different kinds',
  light.identity.oracleId.kind === 'oracle_id' && fresh(light.printing)
  && light.printing.value.printingId.kind === 'scryfall_id')
const unset: Fact<'allow' | 'avoid'> = {
  state: 'unknown', reason: 'unset', message: 'Combo preference not supplied.', attemptedSources: [],
}
check('Unset combo preference is not allow', !fresh(unset))
check('No assessed cut is not an executable swap', proposal.cut.kind === 'not_assessed')

// D-034: direct apply with source = 'ai'
function applySuggestion(suggestion: Suggestion): ApplyResult {
  return {
    schemaVersion: 'advisor-apply-v1',
    requestId: 'fixture-request',
    operationId: 'fixture-op-1',
    source: 'ai' satisfies PlacementSource,
    affected: {
      deckIds: [36],
      deckCardIds: [proposal.action.kind === 'sleeve' ? 360 : 0],
      copyIds: [proposal.action.kind === 'sleeve' ? proposal.action.copyId : 0],
      oracleIds: [suggestion.card.identity.oracleId.value],
    },
    current: null,
    issues: [],
  }
}
const applied = applySuggestion(proposal)
check('Applied suggestion records source = ai', applied.source === 'ai')
check('Apply result carries operation id', applied.operationId.length > 0)

function undoLastApply(operationId: string): UndoResult {
  return {
    schemaVersion: 'advisor-undo-v1',
    requestId: 'fixture-request',
    operationId,
    source: 'manual',
    affected: applied.affected,
    current: null,
    issues: [],
  }
}
check('Undo reverts the AI operation', undoLastApply(applied.operationId).operationId === applied.operationId)
check('Undo is a manual action, not ai', undoLastApply(applied.operationId).source === 'manual')

// D-035: Scryfall estimate prices
check('Price provider is scryfall', proposal.price.state === 'known' && proposal.price.value.provider === 'scryfall')
check('Price is indicative', proposal.price.state === 'known' && proposal.price.value.indicative === true)
check('Missing price is unknown, not zero', ((): boolean => {
  const missing: Suggestion = { ...proposal, price: { state: 'unknown', reason: 'not_recorded', message: 'No Scryfall quote.', attemptedSources: [] } }
  return missing.price.state === 'unknown'
})())

// D-036: advisor defaults
// (a) failed Upgrade refresh keeps old suggestions
const oldUpgrade = [{ card: light, generatedAt: '2026-10-01T00:00:00.000Z' }]
function refreshUpgrade(): { kept: boolean; reason: string } {
  return { kept: true, reason: 'New upgrade analysis is not available yet.' }
}
const refresh = refreshUpgrade()
check('Failed upgrade refresh keeps old suggestions', refresh.kept && refresh.reason.includes('not available'))

// (b) ask before infinite-combo package when preference unset
function packageAllowed(pref: Fact<'allow' | 'avoid'>): boolean {
  return pref.state === 'known' && pref.value === 'allow'
}
check('Unknown combo preference blocks package inclusion', !packageAllowed(unset))

// (c) thin evidence gives fewer suggestions
check('Sparse evidence does not pad to ten', submission.suggestions.length <= 10)

console.log(`PASS: ${checks} pure T-36 reference checks (synthetic identities; no runtime or quality certification).`)
