import { describe, it, expect } from 'vitest'
import {
  parseCategories,
  parseCategoriesCapped,
  serializeCategories,
  enforceCategoryCap,
  applyCategoryBulk,
  validateCategoryNames,
  MAX_CATEGORIES_PER_CARD,
  MAX_CATEGORY_LENGTH,
} from './categoryUtils'

const LONG = 'Game Plan & Win Conditions'
const SIXTY = 'A'.repeat(60)

describe('HC-02: up to five categories per card, names up to 60 characters', () => {
  it('the limits are 5 per card and 60 characters', () => {
    expect(MAX_CATEGORIES_PER_CARD).toBe(5)
    expect(MAX_CATEGORY_LENGTH).toBe(60)
  })

  it('keeps all five categories, in order, when reading', () => {
    const raw = JSON.stringify(['Creature', 'Ramp', LONG, 'Payoffs', 'Protection'])
    const p = parseCategoriesCapped(raw)
    expect([p.primary_category, ...p.additional_categories]).toEqual(['Creature', 'Ramp', LONG, 'Payoffs', 'Protection'])
  })

  it('a sixth category is dropped, never one of the first five', () => {
    const p = parseCategoriesCapped(JSON.stringify(['A', 'B', 'C', 'D', 'E', 'F']))
    expect([p.primary_category, ...p.additional_categories]).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(enforceCategoryCap({ primary_category: 'A', additional_categories: ['B', 'C', 'D', 'E', 'F'] }).additional_categories).toEqual(['B', 'C', 'D', 'E'])
  })

  it('a 60-character name is stored and read back whole; "Game Plan & Win Conditions" is not cut', () => {
    expect(LONG.length).toBeGreaterThan(16)
    const stored = serializeCategories({ primary_category: LONG, additional_categories: [SIXTY] })
    const p = parseCategoriesCapped(stored)
    expect(p.primary_category).toBe(LONG)
    expect(p.additional_categories).toEqual([SIXTY])
    expect(p.additional_categories[0]).toHaveLength(60)
  })

  it('an existing one-category value reads exactly as before', () => {
    expect(parseCategoriesCapped('["Creature"]')).toEqual({ primary_category: 'Creature', additional_categories: [] })
    expect(parseCategoriesCapped('Creature, Ramp')).toEqual({ primary_category: 'Creature', additional_categories: ['Ramp'] })
    expect(parseCategoriesCapped(null).primary_category).toBe('Other')
  })

  it('the first category decides the group: it is the primary, and the order survives a round trip', () => {
    const stored = serializeCategories({ primary_category: 'Ramp', additional_categories: ['Creature', LONG] })
    expect(parseCategories(stored).primary_category).toBe('Ramp')
    const swapped = serializeCategories({ primary_category: 'Creature', additional_categories: ['Ramp', LONG] })
    expect(parseCategories(swapped).primary_category).toBe('Creature')
  })

  it('bulk suggestions keep up to four besides the first', () => {
    expect(applyCategoryBulk(['B', 'C', 'D', 'E', 'F'], 'A').additional_categories).toEqual(['B', 'C', 'D', 'E'])
    expect(applyCategoryBulk(['A', 'B'], 'A').additional_categories).toEqual(['B'])
  })

  it('validateCategoryNames accepts 5 names of 60 characters and refuses 6 names, 61 characters and empty names', () => {
    expect(validateCategoryNames(SIXTY, [SIXTY, 'B', 'C', 'D'])).toBeNull()
    expect(validateCategoryNames('A', ['B', 'C', 'D', 'E'])).toBeNull()
    expect(validateCategoryNames('A', ['B', 'C', 'D', 'E', 'F'])).toMatch(/at most 5/)
    expect(validateCategoryNames('A'.repeat(61), [])).toMatch(/at most 60/)
    expect(validateCategoryNames('A', [''])).toMatch(/empty/)
  })
})
