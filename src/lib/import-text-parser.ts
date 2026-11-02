/**
 * Shared text-list parser (T-60 S-2 and the text half of S-4).
 *
 * Contract: docs/oracle/contracts/import-formats.md §5 (section words), §6.1 (card line),
 * §8 (edge cases). One parser for every site's pasted or uploaded list: ManaBox, Arena,
 * MTGO, Moxfield, Archidekt, TappedOut, Deckbox, Deckstats, Goldfish, plain lists.
 *
 * Pure: no database, no network. It only decides, for each line, WHICH BOARD the card
 * belongs on (main / commander / maybeboard / companion), its quantity, name, printing,
 * finish marker and proxy label. Identity resolution happens elsewhere (manabox-import.ts).
 */

import type {
  ImportBoard,
  ManaBoxSkippedToken,
  ManaBoxTextLine,
  ManaBoxUnmatchedLine,
} from '../../docs/oracle/contracts/manabox-import.types'

export interface ListParseResult {
  lines: ManaBoxTextLine[]
  /** Lines that did not match the grammar (D-049: listed, never guessed). */
  badLines: ManaBoxUnmatchedLine[]
  /** Lines under a Tokens heading (D-049): skipped, counted. */
  skippedTokens: ManaBoxSkippedToken[]
  /** Plain-words warnings worth showing next to the preview. */
  warnings: string[]
  /** Plain-words notes about how the file was read (assumption A-1). */
  notes: string[]
  /** True when no card line in the file carries a quantity (a plain name list, E-3). */
  nameOnly: boolean
  /** How many section headings the file had (a name list with none is not recognised as a deck file). */
  headingsSeen: number
}

// ---------------------------------------------------------------------------
// Section words (contract §5)
// ---------------------------------------------------------------------------

const BOARD_WORDS: Record<string, ImportBoard> = {
  commander: 'commander',
  commanders: 'commander',
  'commander(s)': 'commander',
  'command zone': 'commander',
  general: 'commander',
  deck: 'main',
  main: 'main',
  mainboard: 'main',
  'main deck': 'main',
  maindeck: 'main',
  library: 'main',
  maybeboard: 'maybeboard',
  maybe: 'maybeboard',
  considering: 'maybeboard',
  consider: 'maybeboard',
  'maybe board': 'maybeboard',
  wishlist: 'maybeboard',
  sideboard: 'maybeboard',
  'side board': 'maybeboard',
  side: 'maybeboard',
  sb: 'maybeboard',
  companion: 'companion',
  companions: 'companion',
}

const TOKEN_WORDS = new Set(['tokens', 'token'])

/** Not a normal deck card: kept on the maybeboard with a warning. */
const ODD_BOARD_WORDS = new Set(['attractions', 'stickers', 'contraptions', 'acorn'])

/** Type or function groupings: ignored, the section stays as it was. */
const GROUPING_WORDS = new Set([
  'land',
  'lands',
  'creature',
  'creatures',
  'instant',
  'instants',
  'sorcery',
  'sorceries',
  'artifact',
  'artifacts',
  'enchantment',
  'enchantments',
  'planeswalker',
  'planeswalkers',
  'battle',
  'battles',
  'ramp',
  'removal',
  'card draw',
  'draw',
  'board wipes',
  'wipes',
  'protection',
  'tutors',
  'other',
])

export type HeadingKind =
  | { kind: 'board'; board: ImportBoard }
  | { kind: 'tokens' }
  | { kind: 'odd' }
  | { kind: 'grouping' }

/** The comparable form of a heading: no `//`/`#`/`*`, no `:`, no `(15)` count, lower-case. */
export function headingKey(line: string): string {
  let s = line.trim().replace(/^(?:\/\/|#|\*)+\s*/, '').replace(/\*+$/, '').trim()
  s = s.replace(/:$/, '').trim()
  s = s.replace(/\s*\(\d+\)$/, '').trim()
  s = s.replace(/:$/, '').trim()
  return s.toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Is this whole line a section word? Matched on the whole trimmed line and only WITHOUT a
 * quantity, so `1 Commander Info` and `1 Island` are never headings (E-4, E-5).
 */
export function classifyHeading(line: string): HeadingKind | null {
  const trimmed = line.trim()
  if (!trimmed || /^\d/.test(trimmed)) return null
  const key = headingKey(trimmed)
  if (!key) return null
  const board = BOARD_WORDS[key]
  if (board) return { kind: 'board', board }
  if (TOKEN_WORDS.has(key)) return { kind: 'tokens' }
  if (ODD_BOARD_WORDS.has(key)) return { kind: 'odd' }
  if (GROUPING_WORDS.has(key)) return { kind: 'grouping' }
  return null
}

/** The board a bare word names, for line tags like `[Commander]` or `# commander` (null if none). */
function boardForTag(word: string): ImportBoard | null {
  const key = headingKey(word.replace(/\{[^}]*\}/g, ''))
  const board = BOARD_WORDS[key]
  // `deck`/`main` in a tag is just the default, not a line-level marker.
  return board && board !== 'main' ? board : null
}

// ---------------------------------------------------------------------------
// Card line (contract §6.1)
// ---------------------------------------------------------------------------

const QTY_RE = /^(\d+)(?:\s*[xX])?\s+(.+)$/
const NAME_PRINTING_RE = /^(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+(\S+))?)?\s*$/
const DECKSTATS_SET_RE = /^(\d+)(?:\s*[xX])?\s+\[([A-Za-z0-9]{2,6})#([^\]\s]+)\]\s+(.+)$/
const UNKNOWN_HEADING_RE = /^(?:[^\d]+\(\d+\)\s*:?|[A-Za-z][A-Za-z'’-]*)$/

const BOARD_PRECEDENCE: ImportBoard[] = ['maybeboard', 'commander', 'companion']

function pickLineBoard(boards: ImportBoard[]): { board?: ImportBoard; conflict: boolean } {
  const distinct = [...new Set(boards)]
  if (distinct.length === 0) return { conflict: false }
  const board = BOARD_PRECEDENCE.find((b) => distinct.includes(b))
  return { board, conflict: distinct.length > 1 }
}

/** Curly quotes to straight, for lookup only (E-20). */
export function normaliseQuotes(name: string): string {
  return name.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"')
}

/**
 * Parse a list. Section words mark every card under them until the next section word; a
 * blank line does NOT end a section (§5).
 */
export function parseListText(content: string): ListParseResult {
  const text = content.replace(/^\uFEFF/, '').replace(/\u00A0/g, ' ')
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  const lines: ManaBoxTextLine[] = []
  const badLines: ManaBoxUnmatchedLine[] = []
  const skippedTokens: ManaBoxSkippedToken[] = []
  const warnings: string[] = []
  const notes: string[] = []

  const isCommentLine = (t: string) => t.startsWith('//') || t.startsWith('#')

  // E-3: a file where no card line has a quantity is a plain name list: one copy each.
  const nameOnly = !rawLines.some((raw) => {
    const t = raw.trim().replace(/^(?:sb|cmdr|commander)\s*:\s*/i, '')
    return t !== '' && !isCommentLine(t) && QTY_RE.test(t) && !classifyHeading(t)
  })

  let board: ImportBoard = 'main'
  let inTokens = false
  let blankSeen = false
  let cardsSinceHeading = 0
  let headingsSeen = 0
  let keptNoteGiven = false

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i]
    const lineNumber = i + 1
    const trimmed = rawLine.trim()

    if (trimmed === '') {
      if (cardsSinceHeading > 0) blankSeen = true
      continue
    }

    const heading = classifyHeading(trimmed)
    if (heading) {
      headingsSeen++
      if (heading.kind === 'board') {
        board = heading.board
        inTokens = false
      } else if (heading.kind === 'tokens') {
        inTokens = true
      } else if (heading.kind === 'odd') {
        board = 'maybeboard'
        inTokens = false
        warnings.push(`Line ${lineNumber}: "${trimmed}" is not a normal deck card. Kept on the maybeboard.`)
      }
      blankSeen = false
      cardsSinceHeading = 0
      continue
    }

    if (isCommentLine(trimmed)) continue

    if (inTokens) {
      skippedTokens.push({ sourceIndex: lineNumber, rawLine, cardName: trimmed })
      continue
    }

    // ---- line-level prefixes: SB:, SB <qty>, CMDR:, Commander: ----
    let work = trimmed
    const lineBoards: ImportBoard[] = []
    let hadPrefix = false
    const prefix = work.match(/^(sb|cmdr|commander)\s*:\s*(.+)$/i) ?? work.match(/^(sb)\s+(\d.*)$/i)
    if (prefix) {
      lineBoards.push(prefix[1].toLowerCase() === 'sb' ? 'maybeboard' : 'commander')
      work = prefix[2].trim()
      hadPrefix = true
    }

    // ---- Deckstats printing form: `1 [CMM#400] Sol Ring` ----
    let bracketSet = ''
    let bracketCollector = ''
    const ds = work.match(DECKSTATS_SET_RE)
    if (ds) {
      bracketSet = ds[2]
      bracketCollector = ds[3]
      work = `${ds[1]} ${ds[4]}`
    }

    // ---- tags: ^label^, [categories], {flags}, *F*/*E*, trailing comment ----
    let proxy = false
    work = work.replace(/\^([^^]*)\^/g, (_m, label: string) => {
      if (label.split(',').some((p) => p.trim().toLowerCase() === 'proxy')) proxy = true
      return ' '
    })
    work = work.replace(/\[([^\]]*)\]/g, (_m, inner: string) => {
      for (const piece of inner.split(',')) {
        const tagBoard = boardForTag(piece)
        if (tagBoard) lineBoards.push(tagBoard)
      }
      return ' '
    })
    work = work.replace(/\{[^}]*\}/g, ' ')
    let finish: 'foil' | 'etched' | undefined
    work = work.replace(/(^|\s)\*([FfEe])\*(?=\s|$)/g, (_m, lead: string, letter: string) => {
      finish = letter.toLowerCase() === 'e' ? 'etched' : 'foil'
      return lead
    })
    // `# comment` anywhere after the name; `// comment` only when it names a board (a DFC keeps its ` // `).
    const hashComment = work.match(/\s+#\s*(.*)$/)
    if (hashComment) {
      const tagBoard = boardForTag(hashComment[1])
      if (tagBoard) lineBoards.push(tagBoard)
      work = work.slice(0, hashComment.index)
    } else {
      const slashComment = work.match(/\s+\/\/\s*([A-Za-z() ]+)$/)
      const tagBoard = slashComment ? boardForTag(slashComment[1]) : null
      if (slashComment && tagBoard) {
        lineBoards.push(tagBoard)
        work = work.slice(0, slashComment.index)
      }
    }
    work = work.replace(/\s+/g, ' ').trim()

    // ---- quantity ----
    let quantity: number
    let rest: string
    const qty = work.match(QTY_RE)
    if (qty) {
      quantity = Number.parseInt(qty[1], 10)
      rest = qty[2].trim()
    } else if (nameOnly && work !== '') {
      quantity = 1
      rest = work
    } else if (!hadPrefix && UNKNOWN_HEADING_RE.test(trimmed)) {
      warnings.push(`Line ${lineNumber}: "${trimmed}" looks like a heading we don't know. Ignored; the section is unchanged.`)
      continue
    } else {
      badLines.push({ sourceIndex: lineNumber, rawLine, reason: 'bad_line' })
      continue
    }

    const printing = rest.match(NAME_PRINTING_RE)
    const cardName = (printing?.[1] ?? rest).trim()
    const setCode = bracketSet || (printing?.[2] ?? '')
    const collectorNumber = bracketCollector || (printing?.[3] ?? '')

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100 || !cardName) {
      badLines.push({
        sourceIndex: lineNumber,
        rawLine,
        cardName,
        setCode,
        collectorNumber,
        reason: 'bad_line',
      })
      continue
    }

    const picked = pickLineBoard(lineBoards)
    if (picked.conflict) {
      warnings.push(
        `Line ${lineNumber}: "${cardName}" is marked more than one way. Kept as ${picked.board}.`
      )
    }
    const lineBoard: ImportBoard = picked.board ?? board

    if (lineBoard === 'main' && blankSeen && cardsSinceHeading > 0 && !keptNoteGiven) {
      keptNoteGiven = true
      notes.push(
        'A blank line followed by more cards: kept in the main deck. Add a Sideboard heading if these are maybeboard cards.'
      )
    }
    blankSeen = false
    cardsSinceHeading++

    const line: ManaBoxTextLine = {
      quantity,
      cardName,
      setCode,
      collectorNumber,
      rawLine,
      lineNumber,
      board: lineBoard,
    }
    if (finish) line.finish = finish
    if (proxy) line.proxy = true
    lines.push(line)
  }

  const commanderCount = lines
    .filter((l) => l.board === 'commander')
    .reduce((sum, l) => sum + l.quantity, 0)
  if (commanderCount >= 100) warnings.push('The Commander section is unusually large.')

  return { lines, badLines, skippedTokens, warnings, notes, nameOnly, headingsSeen }
}
