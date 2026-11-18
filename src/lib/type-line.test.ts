import { describe, expect, it } from 'vitest';
import {
  allCardTypes,
  frontFace,
  hasCardType,
  hasSubtype,
  hasSupertype,
  isBasicLandFace,
  parseTypeLine,
  primaryType,
} from './type-line';
import { KNOWN_MULTIWORD_SUBTYPES, PRIMARY_TYPE_ORDER } from './type-line-constants';

type Expected = [supertypes: string[], cardTypes: string[], subtypes: string[], unknown?: string[]];

// One entry per fixture: [type line, expected faces]. Each face is
// [supertypes, cardTypes, subtypes, unknown].
const FIXTURES: Array<[string, Expected[]]> = [
  // Owner examples, library (comma) format
  ['Legendary Creature — Elf, Druid', [[['Legendary'], ['Creature'], ['Elf', 'Druid']]]],
  ['Basic Land — Forest', [[['Basic'], ['Land'], ['Forest']]]],
  ['Basic, Snow Land — Swamp', [[['Basic', 'Snow'], ['Land'], ['Swamp']]]],
  ['Kindred, Sorcery — Eldrazi', [[[], ['Kindred', 'Sorcery'], ['Eldrazi']]]],
  ['Legendary Enchantment, Creature — God', [[['Legendary'], ['Enchantment', 'Creature'], ['God']]]],
  ['Artifact, Creature — Golem', [[[], ['Artifact', 'Creature'], ['Golem']]]],
  ['Artifact, Land —', [[[], ['Artifact', 'Land'], []]]],
  ['World Enchantment —', [[['World'], ['Enchantment'], []]]],
  ['Basic Land —', [[['Basic'], ['Land'], []]]],
  ['Snow Creature — Snake', [[['Snow'], ['Creature'], ['Snake']]]],
  // Scryfall (space) format
  ['Legendary Artifact Creature — Human Artificer', [[['Legendary'], ['Artifact', 'Creature'], ['Human', 'Artificer']]]],
  ['Basic Snow Land — Swamp', [[['Basic', 'Snow'], ['Land'], ['Swamp']]]],
  ['Creature — Human Wizard', [[[], ['Creature'], ['Human', 'Wizard']]]],
  ['Legendary Creature — Time Lord Doctor', [[['Legendary'], ['Creature'], ['Time Lord', 'Doctor']]]],
  ['Enchantment — Aura Curse', [[[], ['Enchantment'], ['Aura', 'Curse']]]],
  // Two faces
  ['Artifact // Artifact Creature — Golem', [[[], ['Artifact'], []], [[], ['Artifact', 'Creature'], ['Golem']]]],
  [
    'Legendary Artifact Creature — Robot // Legendary Artifact — Vehicle',
    [[['Legendary'], ['Artifact', 'Creature'], ['Robot']], [['Legendary'], ['Artifact'], ['Vehicle']]],
  ],
  ['Creature — Dragon // Sorcery — Omen', [[[], ['Creature'], ['Dragon']], [[], ['Sorcery'], ['Omen']]]],
  ['Instant // Land', [[[], ['Instant'], []], [[], ['Land'], []]]],
  ['Enchantment // Land — Cave', [[[], ['Enchantment'], []], [[], ['Land'], ['Cave']]]],
  ['Enchantment — Room // Enchantment — Room', [[[], ['Enchantment'], ['Room']], [[], ['Enchantment'], ['Room']]]],
  [
    'Creature — Zombie, Knight // Instant — Adventure',
    [[[], ['Creature'], ['Zombie', 'Knight']], [[], ['Instant'], ['Adventure']]],
  ],
  // Library oddities
  ['Enchantment, Creature — Saga, Drake', [[[], ['Enchantment', 'Creature'], ['Saga', 'Drake']]]],
  ["Land — Urza's, Cave", [[[], ['Land'], ["Urza's", 'Cave']]]],
  ['Artifact, Creature — Assembly-Worker', [[[], ['Artifact', 'Creature'], ['Assembly-Worker']]]],
  ['Legendary Creature — Time Lord, Doctor', [[['Legendary'], ['Creature'], ['Time Lord', 'Doctor']]]],
  ['Ongoing Scheme', [[['Ongoing'], ['Scheme'], []]]],
  ['pLAnE — sECreT, LaIR', [[[], ['Plane'], ['sECreT', 'LaIR']]]],
  ['Summon, Dragon —', [[[], [], [], ['Summon', 'Dragon']]]],
  ['Tribal Instant — Goblin', [[[], ['Kindred', 'Instant'], ['Goblin']]]],
  ['Plane — Dominaria', [[[], ['Plane'], ['Dominaria']]]],
  ['Vanguard', [[[], ['Vanguard'], []]]],
  ['Conspiracy', [[[], ['Conspiracy'], []]]],
  ['Phenomenon', [[[], ['Phenomenon'], []]]],
  ['Dungeon', [[[], ['Dungeon'], []]]],
  ['Battle — Siege', [[[], ['Battle'], ['Siege']]]],
  // Other common cards
  ['Legendary Planeswalker — Jace', [[['Legendary'], ['Planeswalker'], ['Jace']]]],
  ['Instant', [[[], ['Instant'], []]]],
  ['Sorcery', [[[], ['Sorcery'], []]]],
  ['Legendary Artifact — Equipment', [[['Legendary'], ['Artifact'], ['Equipment']]]],
  ['Land Creature — Forest Dryad', [[[], ['Land', 'Creature'], ['Forest', 'Dryad']]]],
  ['Land Creature — Forest, Dryad', [[[], ['Land', 'Creature'], ['Forest', 'Dryad']]]],
  ['Elite Creature — Elf', [[['Elite'], ['Creature'], ['Elf']]]],
  ['Host Creature — Goblin', [[['Host'], ['Creature'], ['Goblin']]]],
  // Separators
  ['Creature - Elf Druid', [[[], ['Creature'], ['Elf', 'Druid']]]],
  ['Creature-Elf', [[[], [], [], ['Creature-Elf']]]],
  // Odd casing and spacing
  ['  legendary   CREATURE — Elf  ', [[['Legendary'], ['Creature'], ['Elf']]]],
];

describe('parseTypeLine fixtures', () => {
  expect(FIXTURES.length).toBeGreaterThanOrEqual(40);

  it.each(FIXTURES)('%s', (line, faces) => {
    const parsed = parseTypeLine(line);
    expect(
      parsed.faces.map((f) => [f.supertypes, f.cardTypes, f.subtypes, f.unknown]),
    ).toEqual(faces.map(([s, c, sub, u]) => [s, c, sub, u ?? []]));
  });

  it('keeps the trimmed raw text of each face', () => {
    expect(parseTypeLine('Instant // Land').faces.map((f) => f.raw)).toEqual(['Instant', 'Land']);
  });
});

describe('empty and bad input never throws', () => {
  it.each([[''], ['   '], [null], [undefined]])('%j gives no faces', (input) => {
    expect(parseTypeLine(input as string | null | undefined)).toEqual({ faces: [] });
  });

  it('a bare dash gives empty arrays', () => {
    expect(parseTypeLine('—').faces).toEqual([
      { raw: '—', supertypes: [], cardTypes: [], subtypes: [], unknown: [] },
    ]);
  });

  it('non-string input gives no faces', () => {
    expect(parseTypeLine(42 as unknown as string)).toEqual({ faces: [] });
  });
});

describe('subtypes are read by position, never as card types', () => {
  it('a subtype named like a card type stays a subtype', () => {
    const p = parseTypeLine('Creature — Battle');
    expect(frontFace(p).cardTypes).toEqual(['Creature']);
    expect(frontFace(p).subtypes).toEqual(['Battle']);
    expect(hasCardType(p, 'Battle', 'any')).toBe(false);
    expect(hasSubtype(p, 'Battle', 'any')).toBe(true);
  });

  it('a made-up subtype containing a type word is not a card type', () => {
    const p = parseTypeLine('Creature — Landshark');
    expect(hasCardType(p, 'Land', 'any')).toBe(false);
    expect(frontFace(p).subtypes).toEqual(['Landshark']);
    expect(primaryType(p)).toBe('Creature');
  });

  it('a subtype named Legendary is not a supertype', () => {
    const p = parseTypeLine('Creature — Legendary');
    expect(hasSupertype(p, 'Legendary', 'any')).toBe(false);
  });
});

describe('constants', () => {
  it('lists Time Lord as the only known multiword subtype', () => {
    expect(KNOWN_MULTIWORD_SUBTYPES).toEqual(['Time Lord']);
  });
});

describe('allCardTypes', () => {
  it('unions faces in list order without duplicates', () => {
    expect(allCardTypes(parseTypeLine('Creature — Dragon // Sorcery — Omen'))).toEqual([
      'Creature',
      'Sorcery',
    ]);
    expect(allCardTypes(parseTypeLine('Enchantment, Creature — Saga, Drake'))).toEqual([
      'Creature',
      'Enchantment',
    ]);
    expect(allCardTypes(parseTypeLine('Enchantment — Room // Enchantment — Room'))).toEqual([
      'Enchantment',
    ]);
  });

  it('is empty for empty input', () => {
    expect(allCardTypes(parseTypeLine(''))).toEqual([]);
  });
});

describe('hasSupertype / hasCardType / hasSubtype', () => {
  const adventure = parseTypeLine('Legendary Creature — Elf // Sorcery — Adventure');

  it('respects front vs any scope', () => {
    expect(hasCardType(adventure, 'Sorcery', 'front')).toBe(false);
    expect(hasCardType(adventure, 'Sorcery', 'any')).toBe(true);
    expect(hasSubtype(adventure, 'Adventure', 'front')).toBe(false);
    expect(hasSubtype(adventure, 'Adventure', 'any')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(hasSupertype(adventure, 'legendary', 'front')).toBe(true);
    expect(hasCardType(adventure, 'CREATURE', 'front')).toBe(true);
    expect(hasSubtype(adventure, 'ELF', 'front')).toBe(true);
  });

  it('matches subtypes as whole words', () => {
    expect(hasSubtype(adventure, 'El', 'any')).toBe(false);
    expect(hasSubtype(parseTypeLine('Creature — Elf Druid'), 'Elf Druid', 'any')).toBe(false);
  });

  it('reads Tribal as Kindred', () => {
    expect(hasCardType(parseTypeLine('Tribal Instant — Goblin'), 'Tribal', 'front')).toBe(true);
    expect(hasCardType(parseTypeLine('Tribal Instant — Goblin'), 'Kindred', 'front')).toBe(true);
  });

  it('is false on empty input', () => {
    const empty = parseTypeLine(null);
    expect(hasSupertype(empty, 'Basic', 'any')).toBe(false);
    expect(hasCardType(empty, 'Land', 'front')).toBe(false);
    expect(hasSubtype(empty, 'Elf', 'any')).toBe(false);
  });
});

describe('frontFace', () => {
  it('returns the first face', () => {
    expect(frontFace(parseTypeLine('Instant // Land')).cardTypes).toEqual(['Instant']);
  });
  it('returns an empty face when there are none', () => {
    expect(frontFace(parseTypeLine('')).cardTypes).toEqual([]);
  });
});

describe('primaryType', () => {
  it.each([
    ['Artifact, Creature — Golem', 'Creature'],
    ['Land Creature — Forest Dryad', 'Land'],
    ['Basic Land — Forest', 'Land'],
    ['Kindred, Sorcery — Eldrazi', 'Kindred'],
    ['Tribal Instant — Goblin', 'Kindred'],
    ['Instant // Land', 'Instant'],
    ['Battle — Siege', 'Battle'],
    ['Enchantment, Creature — Saga, Drake', 'Creature'],
    ['Artifact, Land —', 'Land'],
    ['Artifact Land', 'Land'],
    ['Artifact Land — Gate', 'Land'],
    ['Artifact, Land — Gate', 'Land'],
    ['Snow Artifact Land', 'Land'],
    ['Snow, Artifact, Land —', 'Land'],
    ['Legendary Artifact Land', 'Land'],
    ['Artifact Land // Artifact Land', 'Land'],
    ['Land Artifact', 'Land'],
    ['Enchantment Land — Gate', 'Land'],
    ['Legendary Enchantment', 'Enchantment'],
    ['Ongoing Scheme', 'Scheme'],
    ['Summon, Dragon —', 'Other'],
    ['', 'Other'],
  ])('%s -> %s', (line, expected) => {
    expect(primaryType(parseTypeLine(line))).toBe(expected);
  });

  it('uses the front face only', () => {
    expect(primaryType(parseTypeLine('Sorcery // Land'))).toBe('Sorcery');
  });

  it('skips excluded types', () => {
    expect(primaryType(parseTypeLine('Artifact, Land —'), { exclude: ['Land'] })).toBe('Artifact');
    expect(primaryType(parseTypeLine('Basic Land — Forest'), { exclude: ['land'] })).toBe('Other');
  });

  it('every type in the order list is a known card type', () => {
    for (const t of PRIMARY_TYPE_ORDER) {
      expect(primaryType(parseTypeLine(t))).toBe(t);
    }
  });
});

describe('isBasicLandFace', () => {
  it.each([
    ['Basic Land — Forest', true],
    ['Basic, Snow Land — Swamp', true],
    ['Basic Land —', true],
    ['Land — Forest', false],
    ['Legendary Land', false],
    ['Basic Creature — Elf', false],
    ['Instant // Basic Land', false],
    ['Basic Land — Forest // Instant', true],
    ['', false],
  ])('%s -> %s', (line, expected) => {
    expect(isBasicLandFace(parseTypeLine(line))).toBe(expected);
  });
});
