/**
 * Shared, pure type-line parser (Comprehensive Rules 205 order:
 * supertypes, card types, then subtypes after the dash).
 *
 * Reads both formats the library holds:
 *  - library (MTGJSON) style: "Basic, Snow Land — Swamp", "Artifact, Land —"
 *  - Scryfall style: "Legendary Artifact Creature — Human Artificer"
 * Never throws. Unknown words on the left of the dash are kept in unknown[].
 */
import {
  CARD_TYPES,
  CATEGORY_DEFAULT_EXCLUDE,
  KNOWN_MULTIWORD_SUBTYPES,
  PRIMARY_TYPE_FALLBACK,
  PRIMARY_TYPE_ORDER,
  SUPERTYPES,
  TYPE_ALIASES,
  type CardType,
} from './type-line-constants';

export interface ParsedFace {
  raw: string;
  supertypes: string[];
  cardTypes: string[];
  subtypes: string[];
  unknown: string[];
}

export interface ParsedTypeLine {
  faces: ParsedFace[];
}

export type FaceScope = 'front' | 'any';

const EMPTY_FACE: ParsedFace = {
  raw: '',
  supertypes: [],
  cardTypes: [],
  subtypes: [],
  unknown: [],
};

const SUPER_BY_LOWER = new Map<string, string>(SUPERTYPES.map((s) => [s.toLowerCase(), s]));
const TYPE_BY_LOWER = new Map<string, string>(CARD_TYPES.map((t) => [t.toLowerCase(), t]));
for (const [alias, target] of Object.entries(TYPE_ALIASES)) {
  TYPE_BY_LOWER.set(alias.toLowerCase(), target);
}

function splitSubtypes(right: string): string[] {
  const text = right.trim();
  if (!text) return [];
  if (text.includes(',')) {
    return text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const words = text.split(/\s+/).filter(Boolean);
  const multi = KNOWN_MULTIWORD_SUBTYPES.map((m) => m.split(' '));
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    const hit = multi.find(
      (parts) =>
        i + parts.length <= words.length &&
        parts.every((p, k) => words[i + k].toLowerCase() === p.toLowerCase()),
    );
    if (hit) {
      out.push(hit.join(' '));
      i += hit.length;
    } else {
      out.push(words[i]);
      i += 1;
    }
  }
  return out;
}

function parseFace(raw: string): ParsedFace {
  const face: ParsedFace = { raw, supertypes: [], cardTypes: [], subtypes: [], unknown: [] };
  // First em dash, else a spaced hyphen. A bare hyphen is never a separator.
  let idx = raw.indexOf('\u2014');
  let sepLen = 1;
  if (idx < 0) {
    idx = raw.indexOf(' - ');
    sepLen = 3;
  }
  const left = idx < 0 ? raw : raw.slice(0, idx);
  const right = idx < 0 ? '' : raw.slice(idx + sepLen);

  for (const word of left.split(/[\s,]+/).filter(Boolean)) {
    const key = word.toLowerCase();
    const sup = SUPER_BY_LOWER.get(key);
    const type = TYPE_BY_LOWER.get(key);
    if (sup) face.supertypes.push(sup);
    else if (type) face.cardTypes.push(type);
    else face.unknown.push(word);
  }
  face.subtypes = splitSubtypes(right);
  return face;
}

export function parseTypeLine(raw: string | null | undefined): ParsedTypeLine {
  try {
    if (typeof raw !== 'string') return { faces: [] };
    const text = raw.trim();
    if (!text) return { faces: [] };
    return { faces: text.split(' // ').map((f) => parseFace(f.trim())) };
  } catch {
    return { faces: [] };
  }
}

export function frontFace(parsed: ParsedTypeLine): ParsedFace {
  return parsed.faces[0] ?? EMPTY_FACE;
}

function scoped(parsed: ParsedTypeLine, scope: FaceScope): ParsedFace[] {
  return scope === 'front' ? parsed.faces.slice(0, 1) : parsed.faces;
}

/** Union of card types across faces, in CARD_TYPES order, no duplicates. */
export function allCardTypes(parsed: ParsedTypeLine): string[] {
  const seen = new Set(parsed.faces.flatMap((f) => f.cardTypes));
  return CARD_TYPES.filter((t) => seen.has(t));
}

export function hasSupertype(parsed: ParsedTypeLine, name: string, scope: FaceScope): boolean {
  const n = name.toLowerCase();
  return scoped(parsed, scope).some((f) => f.supertypes.some((s) => s.toLowerCase() === n));
}

export function hasCardType(parsed: ParsedTypeLine, name: string, scope: FaceScope): boolean {
  const n = (TYPE_ALIASES[name] ?? name).toLowerCase();
  return scoped(parsed, scope).some((f) => f.cardTypes.some((t) => t.toLowerCase() === n));
}

/** Whole-word, case-insensitive match against the subtype list only. */
export function hasSubtype(parsed: ParsedTypeLine, name: string, scope: FaceScope): boolean {
  const n = name.toLowerCase();
  return scoped(parsed, scope).some((f) => f.subtypes.some((s) => s.toLowerCase() === n));
}

/** The single bucket for places that can show only one type (front face). */
export function primaryType(
  parsed: ParsedTypeLine,
  opts: { exclude?: readonly string[] } = {},
): CardType | typeof PRIMARY_TYPE_FALLBACK {
  const face = frontFace(parsed);
  const excluded = new Set((opts.exclude ?? []).map((e) => e.toLowerCase()));
  const found = PRIMARY_TYPE_ORDER.find(
    (t) => !excluded.has(t.toLowerCase()) && face.cardTypes.includes(t),
  );
  return found ?? PRIMARY_TYPE_FALLBACK;
}

/** Basic supertype AND Land card type on the front face. */
export function isBasicLandFace(parsed: ParsedTypeLine): boolean {
  return hasSupertype(parsed, 'Basic', 'front') && hasCardType(parsed, 'Land', 'front');
}

/** Default deck category for a card being added or imported: its primary type, never Kindred or a rare type. */
export function defaultCategoryForTypeLine(typeLine: string | null | undefined): string {
  return primaryType(parseTypeLine(typeLine), { exclude: CATEGORY_DEFAULT_EXCLUDE });
}

/** The existing commander rule "Legendary AND Creature", read from the supertypes and card types (either face, as before). */
export function isLegendaryCreatureLine(typeLine: string | null | undefined): boolean {
  const parsed = parseTypeLine(typeLine);
  return hasSupertype(parsed, 'Legendary', 'any') && hasCardType(parsed, 'Creature', 'any');
}
