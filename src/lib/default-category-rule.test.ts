import { describe, expect, it } from 'vitest';
import { defaultCategoryForTypeLine } from './type-line';
import { deriveDefaultCategory } from './card-definition-resolver';

// Owner rule (2026-11-18): a new card starts in its type's category. Land first,
// then the Group: Type order; double-faced cards use the front face.
const CASES: Array<[string, string, string]> = [
  ['Artifact Land (library format)', 'Artifact, Land —', 'Land'],
  ['Artifact Land (Scryfall format)', 'Artifact Land', 'Land'],
  ['Legendary Artifact // Legendary Artifact Land', 'Legendary Artifact — Equipment // Legendary Artifact Land', 'Artifact'],
  ['Creature // Land', 'Creature — Goblin // Land', 'Creature'],
  ['Instant // Land', 'Instant // Land', 'Instant'],
  ['Land // Creature (front is the land)', 'Land // Creature — Goblin', 'Land'],
  ['plain Creature', 'Creature — Elf Druid', 'Creature'],
  ['Basic Land', 'Basic Land — Forest', 'Land'],
  ['Artifact Creature', 'Artifact Creature — Golem', 'Creature'],
  ['Kindred Sorcery stays Sorcery', 'Kindred Sorcery — Goblin', 'Sorcery'],
  ['empty type line', '', 'Other'],
];

describe('starting category for a new card', () => {
  it.each(CASES)('%s', (_name, typeLine, expected) => {
    expect(defaultCategoryForTypeLine(typeLine)).toBe(expected);
    expect(deriveDefaultCategory(typeLine)).toBe(expected);
  });
});
