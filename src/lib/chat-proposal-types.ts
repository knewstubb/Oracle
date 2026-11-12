// Types for "chat can add cards after the owner confirms" (contract: docs/oracle/contracts/chat-add-cards.md).

export type ProposalState = 'ready' | 'blocked'

export type BlockReason =
  | 'not_found'
  | 'in_deck'
  | 'in_maybeboard'
  | 'outside_colours'
  | 'colours_unknown'
  | 'not_legal'
  | 'expired'
  | 'changed'

export type ProposalStatus = 'pending' | 'added' | 'dismissed' | 'undone' | 'blocked' | 'expired'

/** What the owner's browser gets for one suggestion. The id is the single-use token: it never goes to the model. */
export interface ProposalCard {
  proposalId: string
  cardName: string
  reason?: string
  category?: string
  state: ProposalState
  blockReason?: BlockReason
  blockText?: string
  ownershipLine?: string
}

/** Stream event sent to the page. */
export interface AddProposalsEvent {
  type: 'add_proposals'
  deckId: number
  deckName: string
  proposals: ProposalCard[]
}

export interface ConfirmReply {
  added: Array<{ proposalId: string; deckCardId: number }>
  skipped: Array<{ proposalId: string; blockReason: BlockReason | 'used' | 'unknown'; blockText: string }>
  /** Cards in the main deck after the add (so the receipt can warn past 100). */
  deckCardCount?: number
}

export interface UndoReply {
  undone: string[]
  refused: Array<{ proposalId: string; text: string }>
}

/** Limits from the contract (section 3, item 8) and the 24-hour life the owner approved. */
export const MAX_PROPOSALS_PER_CALL = 10
export const MAX_PENDING_PROPOSALS_PER_DECK = 30
export const PROPOSAL_LIFE_MS = 24 * 60 * 60 * 1000
