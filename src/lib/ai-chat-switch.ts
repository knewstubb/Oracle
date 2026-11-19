// ---------------------------------------------------------------------------
// In-app AI chat switch (DV-03). The ONLY place that reads the setting.
//
// The in-app chat is PAUSED unless NEXT_PUBLIC_AI_CHAT_ENABLED is exactly "true".
// Screens use isAiChatEnabled() to hide entry points; server routes that would
// call the paid AI service return aiChatPausedResponse() before doing anything.
// The reference below must stay a literal `process.env.NEXT_PUBLIC_...` so the
// build can inline it for browser code.
// ---------------------------------------------------------------------------
export const AI_CHAT_PAUSED_MESSAGE =
  'The in-app chat is paused. Ask Claude through the connector instead.'

export function isAiChatEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AI_CHAT_ENABLED === 'true'
}

/** Returns a plain "paused" answer (HTTP 503) when paused, otherwise null. Call first in every route that uses the paid AI service. */
export function aiChatPausedResponse(): Response | null {
  if (isAiChatEnabled()) return null
  return Response.json({ error: 'paused', message: AI_CHAT_PAUSED_MESSAGE }, { status: 503 })
}
