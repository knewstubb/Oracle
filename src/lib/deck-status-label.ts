/** Words and colours for the automatic deck status. Colours match the Decks page tile badges. */
export const DECK_STATUS_LABEL = { brewing: 'Brewing', assembling: 'Assembling', playable: 'Playable' } as const
export const DECK_STATUS_COLOUR = { brewing: '#8F51D5', assembling: '#EF9F27', playable: '#1D9E75' } as const
export function deckStatusLabel(status: string | null | undefined): string {
  return status && status in DECK_STATUS_LABEL ? DECK_STATUS_LABEL[status as keyof typeof DECK_STATUS_LABEL] : ''
}
export function deckStatusColour(status: string | null | undefined): string {
  return status && status in DECK_STATUS_COLOUR ? DECK_STATUS_COLOUR[status as keyof typeof DECK_STATUS_COLOUR] : '#9CA3AF'
}
