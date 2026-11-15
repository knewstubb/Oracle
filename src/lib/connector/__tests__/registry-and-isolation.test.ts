import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { CONNECTOR_TOOLS, toJsonSchema } from '../tools'

const ROOT = path.resolve(__dirname, '..')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    return statSync(p).isDirectory() ? (n === '__tests__' ? [] : walk(p)) : [p]
  })
}

describe('registered tools', () => {
  it('are exactly the five read-only tools, all readOnlyHint', () => {
    expect(CONNECTOR_TOOLS.map((t) => t.name)).toEqual(['get_collection_summary', 'search_collection', 'list_decks', 'get_deck', 'get_deck_health'])
    for (const t of CONNECTOR_TOOLS) {
      expect(t.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false })
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
  it('only connection-store imports createAdminClient or reads the service key', () => {
    for (const f of files) {
      if (path.basename(f) === 'connection-store.ts') continue
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/createAdminClient|SUPABASE_SERVICE_ROLE_KEY/)
    }
  })
  it('tool modules never import the connection store or write/rpc methods', () => {
    for (const f of walk(path.join(ROOT, 'tools'))) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/connection-store|\.(insert|update|upsert|delete|rpc)\(/)
    }
  })
  it('the db wrapper type exposes select only', () => {
    const src = readFileSync(path.join(ROOT, 'user-client.ts'), 'utf8')
    const block = /export interface ReadOnlyDb \{([\s\S]*?)\n\}/.exec(src)![1]
    expect(block).toMatch(/select\(/)
    expect(block).not.toMatch(/insert|update|upsert|delete|rpc|from\(/)
  })
})
