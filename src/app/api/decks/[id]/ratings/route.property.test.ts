import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'

// Mock the database and init-db to isolate the validation logic
vi.mock('@/lib/db', () => ({
  default: {
    prepare: () => ({
      get: () => undefined, // deck not found — but we never reach this for invalid IDs
    }),
  },
}))
vi.mock('@/lib/init-db', () => ({ ensureDb: vi.fn() }))

import { GET } from './route'

/**
 * Helper to call the GET handler with a given id string.
 */
async function callGetWithId(id: string): Promise<Response> {
  const url = `http://localhost:3000/api/decks/${encodeURIComponent(id)}/ratings`
  const request = new NextRequest(url)
  return GET(request, { params: Promise.resolve({ id }) })
}

describe('Feature: deck-ratings, Property 9: Invalid ID Rejection', () => {
  /**
   * **Validates: Requirements 7.6**
   *
   * Property 9: Invalid ID Rejection
   * For any string that is not a positive integer (empty string, negative number,
   * float, alphabetic, special characters), the Ratings API SHALL return HTTP status 400.
   */

  // Generator for strings that are NOT positive integers.
  // We combine multiple strategies to cover all invalid ID categories.
  const invalidIdArb: fc.Arbitrary<string> = fc.oneof(
    // Empty string
    fc.constant(''),
    // Negative integers
    fc.integer({ min: -10000, max: -1 }).map(String),
    // Zero
    fc.constant('0'),
    // Floats (positive and negative)
    fc.tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 1, max: 99 })).map(
      ([whole, frac]) => `${whole}.${frac}`
    ),
    // Alphabetic strings
    fc.stringMatching(/^[a-zA-Z]{1,10}$/),
    // Special characters
    fc.constantFrom('!@#', '$%^&', '()', '[]{}', ';DROP', '1;DROP', '<script>', '/', '\\'),
    // Mixed alphanumeric (not purely digits)
    fc.tuple(
      fc.stringMatching(/^[a-zA-Z]{1,5}$/),
      fc.nat({ max: 999 }).map(String)
    ).map(([alpha, num]) => alpha + num),
    // Numbers with leading zeros (e.g., "01", "001")
    fc.nat({ max: 9999 }).map((n) => '0' + String(n)),
    // Whitespace-containing strings
    fc.nat({ max: 99 }).map((n) => ' ' + String(n)),
    // Negative floats
    fc.tuple(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 99 })).map(
      ([whole, frac]) => `-${whole}.${frac}`
    ),
    // Strings starting with digits but containing non-digits
    fc.nat({ max: 999 }).map((n) => `${n}abc`),
  )

  it('returns 400 for any string that is not a positive integer', async () => {
    await fc.assert(
      fc.asyncProperty(invalidIdArb, async (id) => {
        const response = await callGetWithId(id)
        expect(response.status).toBe(400)

        const body = await response.json()
        expect(body).toHaveProperty('error')
      }),
      { numRuns: 100 }
    )
  })

  it('returns 400 specifically for negative numbers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -10000, max: -1 }).map(String),
        async (id) => {
          const response = await callGetWithId(id)
          expect(response.status).toBe(400)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns 400 specifically for floating point numbers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(fc.nat({ max: 100 }), fc.integer({ min: 1, max: 99 })).map(
          ([whole, frac]) => `${whole}.${frac}`
        ),
        async (id) => {
          const response = await callGetWithId(id)
          expect(response.status).toBe(400)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns 400 specifically for leading zeros', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 9999 }).map((n) => '0' + String(n)),
        async (id) => {
          const response = await callGetWithId(id)
          expect(response.status).toBe(400)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns 400 specifically for alphabetic and special char strings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.stringMatching(/^[a-zA-Z]{1,10}$/),
          fc.constantFrom('!@#', '1;DROP', 'abc', 'hello', '1abc', 'abc1', ' ', '\t', '\n')
        ),
        async (id) => {
          const response = await callGetWithId(id)
          expect(response.status).toBe(400)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns 400 for zero', async () => {
    const response = await callGetWithId('0')
    expect(response.status).toBe(400)
  })
})
