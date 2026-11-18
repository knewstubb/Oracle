/**
 * Closed lists used to read a Magic card's type line.
 *
 * Source: Comprehensive Rules section 205, as understood from the owner's
 * 2026-11-18 decision ("align to this exactly"): supertypes first, then card
 * types, then subtypes after the dash.
 *
 * ASSUMPTION: these lists could NOT be verified offline. Treat them as
 * unconfirmed against the current rules text. Known oddities flagged for
 * review: the library holds cards whose type words are not in the rules
 * lists (Hero, Stickers, old "Summon" cards). They are deliberately NOT
 * listed here, so the parser reports them as unknown instead of guessing.
 *
 * Adding a new type is a one-line change in this file. Nothing else in the
 * app should hold its own copy of these lists.
 */

export const SUPERTYPES = [
  'Basic',
  'Legendary',
  'Snow',
  'World',
  'Ongoing',
  'Elite',
  'Host',
] as const;

export const CARD_TYPES = [
  'Artifact',
  'Battle',
  'Creature',
  'Enchantment',
  'Instant',
  'Kindred',
  'Land',
  'Planeswalker',
  'Sorcery',
  'Conspiracy',
  'Dungeon',
  'Phenomenon',
  'Plane',
  'Scheme',
  'Vanguard',
] as const;

export type Supertype = (typeof SUPERTYPES)[number];
export type CardType = (typeof CARD_TYPES)[number];

/** Retired names, read as their current name (matched case-insensitively). */
export const TYPE_ALIASES: Readonly<Record<string, CardType>> = {
  Tribal: 'Kindred',
};

/**
 * Subtypes that contain a space. Only needed for the Scryfall format, where
 * subtypes are separated by spaces ("Time Lord Doctor"). The library format
 * separates subtypes with commas and needs no help.
 * "Aura Curse" is two subtypes (Aura, Curse), so it is not listed.
 */
export const KNOWN_MULTIWORD_SUBTYPES: readonly string[] = ['Time Lord'];

/**
 * PRIMARY TYPE BUCKET RULE (plain words): when a place in the app must show a
 * card under exactly ONE type, look only at the front face and pick the first
 * type in this list that the face has. If none matches, use "Other".
 * Every other place that shows types lists ALL of a card's types.
 *
 * Example: Artifact Creature goes under Creature. Kindred Sorcery goes under
 * Kindred. A Land Creature goes under Land.
 *
 * OWNER DECISION PENDING: this order is the architect's recommendation
 * (2026-11-18 audit), not yet confirmed by the owner. Changing the order here
 * changes every single-group view at once.
 */
export const PRIMARY_TYPE_ORDER: readonly CardType[] = [
  'Land',
  'Creature',
  'Planeswalker',
  'Battle',
  'Kindred',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Conspiracy',
  'Dungeon',
  'Phenomenon',
  'Plane',
  'Scheme',
  'Vanguard',
];

/**
 * Types that never become a default category name when a card is added or imported
 * (Kindred Sorcery stays "Sorcery"; the rare types fall to "Other"), so no new
 * category names appear in decks.
 */
export const CATEGORY_DEFAULT_EXCLUDE: readonly CardType[] = [
  'Kindred',
  'Conspiracy',
  'Dungeon',
  'Phenomenon',
  'Plane',
  'Scheme',
  'Vanguard',
];

/** Bucket used when no type in PRIMARY_TYPE_ORDER matches. */
export const PRIMARY_TYPE_FALLBACK = 'Other';
