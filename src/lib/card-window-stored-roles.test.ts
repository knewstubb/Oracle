import { describe, it, expect } from 'vitest'
import { ROLE_SLUGS as CONTRACT_SLUGS } from '../../docs/oracle/contracts/card-roles-and-deck-jobs.types'
import { ROLE_SLUGS, ROLE_SLUG_LABELS, TEXT_ROLE_TO_SLUG, mergeWindowRoles, undoActionFor, type StoredRoleRow } from './card-window-stored-roles'

const row = (o: Partial<StoredRoleRow>): StoredRoleRow => ({
  role: 'ramp', in_baseline: false, owner_effect: null, claude_effect: null, claude_state: null, effective: false, effective_from: null, beside: false, ...o,
})
const ok = (rows: StoredRoleRow[]) => ({ status: 'ok' as const, oracleId: 'aaaaaaaa-0000-4000-8000-000000000001', rows })

describe('role list', () => {
  it('equals the contract list and every role has a name', () => {
    expect([...ROLE_SLUGS]).toEqual([...CONTRACT_SLUGS])
    for (const s of ROLE_SLUGS) expect(ROLE_SLUG_LABELS[s]).toBeTruthy()
  })
  it('maps the four text-read roles to contract roles', () => {
    expect(TEXT_ROLE_TO_SLUG).toEqual({ ramp: 'ramp', draw: 'card_draw', removal: 'targeted_removal', wipes: 'board_wipe' })
  })
})

describe('mergeWindowRoles', () => {
  it('with nothing stored, shows the text reading as "text" and offers every other role', () => {
    const v = mergeWindowRoles(ok([]), { kind: 'roles', roles: ['ramp', 'draw'] })
    expect(v.chips.map((c) => [c.role, c.source])).toEqual([['ramp', 'text'], ['card_draw', 'text']])
    expect(v.addable).not.toContain('ramp')
    expect(v.addable).toContain('tutor')
  })
  it('shows stored roles with their source, in the contract order', () => {
    const v = mergeWindowRoles(ok([
      row({ role: 'tutor', owner_effect: 'add', effective: true, effective_from: 'owner' }),
      row({ role: 'ramp', in_baseline: true, effective: true, effective_from: 'baseline' }),
    ]), { kind: 'no_data' })
    expect(v.chips.map((c) => [c.role, c.source, c.removeAction])).toEqual([['ramp', 'baseline', 'remove'], ['tutor', 'owner', 'clear']])
  })
  it('a baseline role you also added is removed with "remove", not "clear"', () => {
    const v = mergeWindowRoles(ok([row({ in_baseline: true, owner_effect: 'add', effective: true, effective_from: 'owner' })]), { kind: 'no_data' })
    expect(v.chips[0].removeAction).toBe('remove')
  })
  it('a role you removed is listed as removed and hides the same text-read role', () => {
    const v = mergeWindowRoles(ok([row({ in_baseline: true, owner_effect: 'remove' })]), { kind: 'roles', roles: ['ramp'] })
    expect(v.chips).toEqual([])
    expect(v.removed).toEqual(['ramp'])
    expect(v.addable).toContain('ramp')
  })
  it('a stored role hides the same text-read role, but not a different one', () => {
    const v = mergeWindowRoles(ok([row({ in_baseline: true, effective: true, effective_from: 'baseline' })]), { kind: 'roles', roles: ['ramp', 'removal'] })
    expect(v.chips.map((c) => [c.role, c.source])).toEqual([['ramp', 'baseline'], ['targeted_removal', 'text']])
  })
  it('a dismissed Claude row says nothing, so the text reading still shows', () => {
    const v = mergeWindowRoles(ok([row({ claude_effect: 'add', claude_state: 'dismissed' })]), { kind: 'roles', roles: ['ramp'] })
    expect(v.chips.map((c) => c.source)).toEqual(['text'])
    expect(v.removed).toEqual([])
  })
  it('a land gets no text-read roles but keeps stored ones', () => {
    const v = mergeWindowRoles(ok([row({ role: 'fixing', owner_effect: 'add', effective: true, effective_from: 'owner' })]), { kind: 'land' })
    expect(v.chips.map((c) => c.role)).toEqual(['fixing'])
  })
  it('without readable stored roles, shows only the text reading', () => {
    expect(mergeWindowRoles({ status: 'error' }, { kind: 'roles', roles: ['wipes'] }).chips.map((c) => c.role)).toEqual(['board_wipe'])
    expect(mergeWindowRoles(undefined, { kind: 'roles', roles: [] }).chips).toEqual([])
  })
})

describe('undoActionFor', () => {
  it('replays what was there before', () => {
    expect(undoActionFor({ owner_effect: null })).toBe('clear')
    expect(undoActionFor({ owner_effect: 'add' })).toBe('add')
    expect(undoActionFor({ owner_effect: 'remove' })).toBe('remove')
    expect(undoActionFor(undefined)).toBe('clear')
  })
})
