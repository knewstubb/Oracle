import { describe, it, expect } from 'vitest'
import { getTagsForOracleId, orderTags } from './card-tags-read'
import { fakeClient } from './fake-client'

describe('card tags read', () => {
  it('orders broad before mechanic, then by display order', () => {
    const tags = orderTags([
      { key: 'lifegain', display_name: 'Lifegain', kind: 'mechanic', display_order: 15 },
      { key: 'ramp', display_name: 'Ramp', kind: 'broad', display_order: 3 },
      { key: 'card_draw', display_name: 'Card draw', kind: 'broad', display_order: 2 },
    ])
    expect(tags.map((t) => t.key)).toEqual(['card_draw', 'ramp', 'lifegain'])
    expect(tags[0]).toEqual({ key: 'card_draw', displayName: 'Card draw', kind: 'broad' })
  })

  it('returns an empty list for a card with no Tags, without reading the Tag list', async () => {
    const seen: string[] = []
    const client = fakeClient((c) => {
      seen.push(c.table)
      return { data: [], error: null }
    })
    expect(await getTagsForOracleId(client, 'o1')).toEqual([])
    expect(seen).toEqual(['ref_card_tags'])
  })

  it('throws on a failed read instead of returning empty', async () => {
    const client = fakeClient(() => ({ data: null, error: { message: 'boom' } }))
    await expect(getTagsForOracleId(client, 'o1')).rejects.toThrow('boom')
  })
})
