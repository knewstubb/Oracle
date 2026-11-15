import { describe, it, expect } from 'vitest'
import { safeNextPath } from '@/lib/safe-next'

describe('safeNextPath', () => {
  it('accepts a same-site consent path', () => {
    expect(safeNextPath('/oauth/consent?authorization_id=abc')).toBe('/oauth/consent?authorization_id=abc')
  })
  it.each(['//evil.com', 'https://evil.com', '/\\evil', 'javascript:alert(1)', 'evil.com', '', null, undefined, '/a\nb'])('rejects %j', (v) => {
    expect(safeNextPath(v as string | null | undefined)).toBe('/')
  })
})
