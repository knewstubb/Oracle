// The "has Claude changed anything?" marker (live refresh). One tiny read of the change record (ai_change_log),
// scoped to the signed-in owner by the cookie session and the table's own owner-only read rule. No service key.
// It answers with a short marker text and who made the newest event; never the changes themselves.
export interface ChangeMarker {
  /** Changes whenever Claude (or an undo) adds or reverses a change. Opaque: compare for equality only. */
  marker: string
  /** Who made the newest event: Claude, or the owner (approved a waiting request, or pressed Undo). null = no changes yet. */
  actor: 'claude' | 'owner' | null
}
interface Row { id?: string; created_at?: string; approved_by_owner?: boolean; undone_at?: string | null; undone_by?: string | null }
type Result = { data: Row[] | null; error: unknown }
interface Query extends PromiseLike<Result> {
  eq(col: string, v: unknown): Query
  or(filter: string): Query
  not(col: string, op: string, v: unknown): Query
  gte(col: string, v: string): Query
  order(col: string, o: { ascending: boolean }): Query
  limit(n: number): Query
}
export interface MarkerDb { from(table: string): { select(cols: string): Query } }
// Undo is possible for 7 days, so an undone row older than that cannot be the newest event.
const UNDO_WINDOW_MS = 8 * 24 * 3600 * 1000
export async function readChangeMarker(db: MarkerDb, userId: string, deckId?: number, now: number = Date.now()): Promise<ChangeMarker> {
  const scoped = (q: Query) => {
    const mine = q.eq('user_id', userId)
    return deckId === undefined ? mine : mine.or(`deck_id.eq.${deckId},other_deck_id.eq.${deckId}`)
  }
  const [made, undone] = await Promise.all([
    scoped(db.from('ai_change_log').select('id, created_at, approved_by_owner')).order('created_at', { ascending: false }).limit(1),
    scoped(db.from('ai_change_log').select('undone_at, undone_by')).not('undone_at', 'is', null).gte('created_at', new Date(now - UNDO_WINDOW_MS).toISOString()).order('undone_at', { ascending: false }).limit(1),
  ])
  if (made.error || undone.error) throw new Error('marker_read_failed')
  const m = made.data?.[0]
  const u = undone.data?.[0]
  const marker = `${m?.id ?? '-'}|${u?.undone_at ?? '-'}`
  let actor: ChangeMarker['actor'] = null
  if (m?.created_at) actor = m.approved_by_owner ? 'owner' : 'claude'
  if (u?.undone_at && (!m?.created_at || u.undone_at > m.created_at)) actor = u.undone_by === 'claude' ? 'claude' : 'owner'
  return { marker, actor }
}
