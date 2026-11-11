/**
 * The questions the "Chat about this" buttons send to the Oracle chat (Deck health slice S5).
 * Kept separate from the server code so screens can import it.
 */

import { ROLE_LABELS, type HealthRoleKey } from './deck-health'

export function healthChatQuestion(role?: HealthRoleKey | null): string {
  if (!role) return 'What is my deck missing? Check my deck health.'
  return `How is my ${ROLE_LABELS[role].toLowerCase()} looking? What could fill the gap?`
}
