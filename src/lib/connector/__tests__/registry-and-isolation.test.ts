import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { CONNECTOR_TOOLS, toJsonSchema } from '../tools'
import { CONNECTOR_READ_TOOLS_B, CONNECTOR_WRITE_TOOLS, DESTRUCTIVE_HINT_TOOLS, isBlockedToolName } from '../edit-config'

const ROOT = path.resolve(__dirname, '..')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    return statSync(p).isDirectory() ? (n === '__tests__' ? [] : walk(p)) : [p]
  })
}

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const EDIT = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }

describe('registered tools', () => {
  it('are exactly the slice A readers plus the slice B list, in order', () => {
    expect(CONNECTOR_TOOLS.map((t) => t.name)).toEqual([
      'get_collection_summary', 'search_collection', 'list_decks', 'get_deck', 'get_deck_health', 'list_deck_cards_by_ownership', 'get_buying_list',
      ...CONNECTOR_WRITE_TOOLS, ...CONNECTOR_READ_TOOLS_B,
    ])
  })
  it('descriptions match CC-06: facts, estimate wording, live health, bracket owner', () => {
    const d = (n: string) => CONNECTOR_TOOLS.find((t) => t.name === n)!.description
    expect(d('search_collection')).toMatch(/facts/i)
    expect(d('search_collection')).toMatch(/estimate/i)
    expect(d('search_collection')).toMatch(/not free/i)
    expect(d('get_deck')).toMatch(/include_rules_text/)
    expect(d('get_deck')).toMatch(/estimate/i)
    expect(d('get_deck_health')).toMatch(/fresh on every call/i)
    expect(d('get_deck_health')).toMatch(/saves nothing/i)
    expect(d('get_deck_health')).not.toMatch(/last saved|never runs a new check/i)
    expect(d('list_decks')).toMatch(/Deck strategy screen/)
    expect(d('list_deck_cards_by_ownership')).toMatch(/facts/i)
    expect(d('get_buying_list')).toMatch(/estimate/i)
    expect(d('get_buying_list')).toMatch(/not free/i)
    expect(d('get_buying_list')).toMatch(/Card Kingdom/)
  })
  it('get_buying_list tells Claude an empty unowned list must offer the proxy upgrade list (CC-19)', () => {
    const d = CONNECTOR_TOOLS.find((t) => t.name === 'get_buying_list')!.description
    expect(d).toMatch(/totals\.notOwnedCopies is 0/)
    expect(d).toMatch(/never answer only that there is nothing/i)
    expect(d).toMatch(/if include_proxies was not set, call again with include_proxies true/i)
    expect(d).toMatch(/totals\.proxyUpgradeCopies is above 0/)
    expect(d).toMatch(/offer the upgrade list/i)
  })
  it('readers are read-only; writers are not; destructiveHint only where the contract says', () => {
    for (const t of CONNECTOR_TOOLS) {
      const isWriter = (CONNECTOR_WRITE_TOOLS as readonly string[]).includes(t.name)
      if (!isWriter) expect(t.annotations, t.name).toEqual(READ)
      else expect(t.annotations, t.name).toEqual((DESTRUCTIVE_HINT_TOOLS as readonly string[]).includes(t.name) ? { ...EDIT, destructiveHint: true } : EDIT)
    }
  })
  it('no registered name is blocked, and no description claims it can delete from the collection', () => {
    for (const t of CONNECTOR_TOOLS) {
      expect(isBlockedToolName(t.name), t.name).toBe(false)
      expect(t.description, t.name).not.toMatch(/delete (a|the) (card|copy|collection)/i)
    }
  })
  it('every input schema is strict (unknown keys rejected) and none takes a user id', () => {
    for (const t of CONNECTOR_TOOLS) {
      const js = toJsonSchema(t.inputSchema) as { additionalProperties?: boolean; properties?: Record<string, unknown> }
      expect(js.additionalProperties).toBe(false)
      expect(Object.keys(js.properties ?? {}).some((k) => /user/i.test(k))).toBe(false)
    }
  })
})

describe('service-role isolation and read-only wrapper', () => {
  const files = walk(ROOT).filter((f) => f.endsWith('.ts'))
  it('only connection-store and write-gateway import createAdminClient or read the service key', () => {
    for (const f of files) {
      if (['connection-store.ts', 'write-gateway.ts'].includes(path.basename(f))) continue
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/createAdminClient|SUPABASE_SERVICE_ROLE_KEY/)
    }
  })
  it('tool modules never import the connection store or write/rpc methods', () => {
    for (const f of walk(path.join(ROOT, 'tools'))) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/connection-store|write-gateway|\.(insert|update|upsert|delete|rpc)\(/)
    }
  })
  it('the health loader and the card library view never write', () => {
    for (const f of ['deck-health-loader.ts', 'read-only-ref-client.ts', path.join('tools', 'card-facts.ts'), path.join('tools', 'bracket.ts')]) {
      const src = readFileSync(path.join(ROOT, f), 'utf8')
      expect(src, f).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(|createAdminClient|SERVICE_ROLE/)
    }
  })
  it('the db wrapper type exposes select only', () => {
    const src = readFileSync(path.join(ROOT, 'user-client.ts'), 'utf8')
    const block = /export interface ReadOnlyDb \{([\s\S]*?)\n\}/.exec(src)![1]
    expect(block).toMatch(/select\(/)
    expect(block).not.toMatch(/insert|update|upsert|delete|rpc|from\(/)
  })
})
