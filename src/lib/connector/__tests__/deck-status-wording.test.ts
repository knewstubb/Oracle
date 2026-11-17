import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { CONNECTOR_TOOLS } from '../tools'
import { listDecksInput } from '../tools/list-decks'

const desc = (name: string) => CONNECTOR_TOOLS.find((t) => t.name === name)!.description

describe('connector wording: automatic deck status', () => {
  it('list_decks and get_deck say the status is automatic and name the three states', () => {
    for (const name of ['list_decks', 'get_deck']) {
      expect(desc(name)).toMatch(/Draft/)
      expect(desc(name)).toMatch(/Assembling/)
      expect(desc(name)).toMatch(/Playable/)
    }
    expect(desc('list_decks')).toMatch(/automatic/i)
  })
  it('no tool description or input text talks about marking a deck active or inactive', () => {
    for (const t of CONNECTOR_TOOLS) {
      expect(t.description, t.name).not.toMatch(/marked active|not marked active|inactive|starts inactive/i)
    }
    const shape = JSON.stringify(listDecksInput.shape.include_inactive.description)
    expect(shape).not.toMatch(/marked active|active by you/i)
  })
  it('connector source no longer builds the "marked active by you" note', () => {
    const root = path.resolve(__dirname, '..')
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = path.join(dir, n)
        return statSync(p).isDirectory() ? (n === '__tests__' ? [] : walk(p)) : [p]
      })
    for (const f of walk(root)) expect(readFileSync(f, 'utf8'), f).not.toMatch(/marked active|activeNote/)
  })
})
