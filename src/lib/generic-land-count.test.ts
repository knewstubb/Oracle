import { describe, it, expect } from 'vitest'
import { parseLandCount } from './generic-land-count'

describe('parseLandCount', () => {
  it('accepts whole numbers, 0 or more', () => {
    expect(parseLandCount('0')).toBe(0)
    expect(parseLandCount('12')).toBe(12)
    expect(parseLandCount(' 7 ')).toBe(7)
  })
  it('rejects everything else', () => {
    for (const bad of ['', ' ', 'abc', '-1', '2.5', '1e3', '+3', '3 4']) expect(parseLandCount(bad)).toBeNull()
  })
})
