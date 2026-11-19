// DV-04: every Claude change carries a one-line reason. One place for the limit, the wording Claude sees, and the schema field.
import { z } from 'zod'
/** Same number as the table check in supabase/drafts/20261119110000_s4_claude_change_reason.draft.sql. */
export const REASON_MAX = 200
const SEND = `Send "reason": one plain sentence (at most ${REASON_MAX} characters, no line breaks) saying why you are making this change, for example "The deck is two mana sources under its target." Nothing was changed`
/** Required on every Claude edit tool. A missing, empty or too long reason refuses the whole request before anything is sent. */
export const reasonField = z
  .string({ error: SEND })
  .trim()
  .min(1, SEND)
  .max(REASON_MAX, `The reason is too long (at most ${REASON_MAX} characters). Shorten it to one plain sentence and send it again. Nothing was changed`)
  .refine((v) => !/[\r\n\t]/.test(v), { message: 'The reason must be one line. Send one plain sentence with no line breaks. Nothing was changed' })
  .describe(`Required. One plain sentence, at most ${REASON_MAX} characters, saying why you are making this change. The owner reads it next to "Changed by Claude" in Recent changes and in the deck's History.`)
/** Said when the reason cannot be stored yet (Oracle's stored data has not been updated) or just now (a passing failure). */
export function reasonNotStoredNote(when: 'yet' | 'now', waiting: boolean): string {
  const why = when === 'yet' ? "Oracle's stored data has not been updated for reasons" : 'Oracle could not save it just now'
  return waiting
    ? `The request is waiting for the owner, but its reason cannot be kept for the owner to see yet: ${why}.`
    : `The change was made, but its reason could not be saved: ${why}. The owner will not see a reason for this change.`
}
/** True when a database error means the reasons table does not exist yet (as opposed to a passing failure). */
export const isMissingTable = (message: string | undefined) => /does not exist|could not find|schema cache/i.test(message ?? '')
