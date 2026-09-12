---
inclusion: fileMatch
fileMatchPattern: '**/api/**/*.ts'
---

# Convention: Atomic Multi-Row Writes

## Rule

Any API endpoint that writes to more than one database row where both writes must succeed or fail together **must** go through a single Postgres RPC (stored procedure), not sequential `.update()` / `.insert()` calls from the application layer. Sequential calls with manual rollback on the second failure are not atomic — if the process crashes between calls, the intermediate state is permanent and undetectable.

## When this applies

When the two (or more) writes maintain an invariant that must never be violated, even transiently:

- A physical copy must never be readable as existing in two deck slots simultaneously, or in zero places (orphaned between source-clear and target-fill)
- A deck slot's `physical_copy_id` and `ownership_status` must always be consistent (both null or both set)
- Mark-as-missing must unlink from deck AND set the missing flag — a card can't be both "assigned to deck X" and "missing"

If the writes are independent (e.g., invalidating two unrelated caches, logging + updating), sequential calls are fine — no invariant is at risk.

## Pattern

Follow the `assign_physical_copy` RPC (migration 016) as the reference implementation:

1. **Advisory lock** on the contested resource (`pg_advisory_xact_lock(hashtext(id::TEXT))`) to serialize concurrent attempts
2. **Guard checks** inside the function (ownership verification, slot availability) — not in the API route before the call
3. **All state changes** in a single PL/pgSQL function body — Postgres guarantees the entire function runs in one transaction
4. **Structured error raising** via `RAISE EXCEPTION 'error_code'` — the API route maps these to HTTP status codes
5. **JSON return** with the operation result for the API route to forward to the client

```sql
-- Example: migration 021 (reassign_to_deck)
CREATE OR REPLACE FUNCTION reassign_to_deck(
  p_physical_copy_id INTEGER,
  p_target_deck_id INTEGER,
  p_card_name TEXT,
  p_user_id UUID
) RETURNS JSON LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_physical_copy_id::TEXT));
  -- ... guards, source lookup, target lookup ...
  UPDATE deck_cards SET physical_copy_id = NULL WHERE id = v_source;
  UPDATE deck_cards SET physical_copy_id = p_physical_copy_id WHERE id = v_target;
  RETURN json_build_object('success', true, ...);
END;
$$;
```

The API route becomes a thin wrapper: validate auth → call `supabase.rpc(...)` → map RPC errors to HTTP responses.

## Existing RPCs following this pattern

| RPC | Migration | Invariant protected |
|-----|-----------|-------------------|
| `assign_physical_copy` | 016 | Copy can't be in two slots; advisory-locked |
| `batch_assign_deck` | 018/019 | Multiple slot assignments are all-or-nothing |
| `reassign_to_deck` | 021 | Source-clear + target-fill are atomic |
| `assign_free_copy` | 021 | Guard-against-double-assign + fill are atomic |

## Audit: flows that still have this gap (flagged, not yet fixed)

| Flow | File | Gap description | Severity |
|------|------|----------------|----------|
| **Mark as Missing** | `src/lib/missing.ts` | Sets `physical_copies.missing = true` then unlinks `deck_cards` rows. If crash between, card is "missing" but still appears assigned to a deck. | High |
| **Undo (Case 2: restore)** | `src/app/api/allocation/undo/route.ts` | Clears current slot then fills restore target. Same orphan window as the original reassign bug. | High |
| **Add Proxy (allocation)** | `src/app/api/allocation/add-proxy/route.ts` | INSERTs `physical_copies` then UPDATEs `deck_cards`. If crash between, orphaned copy exists, slot stays empty. | Medium |
| **Replace-with-original** | `src/app/api/allocation/replace-with-original/route.ts` | Swap is a single UPDATE (safe). The follow-up storage-location write for the outgoing proxy is independent — no data-loss invariant. | Low (acceptable) |

**Recommended fix order:** Mark as Missing → Undo → Add Proxy. Replace-with-original's storage write is acceptable as-is (the swap itself is atomic; the proxy ending up with `storage_location_id = null` is the same as "Unsorted" which is a valid state).

## Provenance

- Authored: 2026-07-15
- Motivated by: `reassign-to-deck` and `assign-free-copy` routes using sequential `.update()` calls with manual rollback — not truly atomic.
