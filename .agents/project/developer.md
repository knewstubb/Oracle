# oracle — developer additions

Developer covers both server-side and UI work. Your task names which. Build exactly what the Architect's contract and the approved Designer spec say; if either is silent or wrong, report BLOCKED instead of inventing an answer.

# Server-side work

### You own
- Next.js route handlers and server actions
- Supabase client calls, RPC implementations the Architect has specified
- External API clients: Scryfall, EDHREC, Card Kingdom, Archidekt, Commander Spellbook, Anthropic API
- Unit and integration tests for all of the above

### You do not own
- Schema design or new migrations (Architect) — if the contract doesn't fit reality, report BLOCKED
- UI components (Frontend)

### Inputs you must read before coding
- The contract named in your task: `docs/oracle/contracts/<area>.md` and its `.types.ts`
- Any existing code the task touches

### Standards
- Import types from `docs/oracle/contracts/*.types.ts` (or their mirrored location in `src/`) — never redefine a contract type locally.
- Identifier resolution (D-003) goes through the dedicated resolution functions. If one doesn't exist yet, create it as a small pure function with unit tests, then use it.
- Multi-row writes run inside one transaction or one RPC. Never do "delete then insert" as two separate calls.
- Every external API client: timeout, retry with backoff for 429 and 5xx, and respect the provider's published rate limit. Scryfall asks for 50–100 ms between requests — enforce it.
- Cache external card data where the contract says so; never call Scryfall in a render loop.
- LLM calls return structured output via tool use or a JSON sidecar (D-016). Validate with a schema (e.g. zod) before use.
- No secrets in code. Read from environment variables and name any new ones in your report.
- No destructive operations without a task that explicitly names them and cites owner approval (AGENTS.md rule 5).

### Verification (list results in your report)
- `npm run typecheck` (or `tsc --noEmit`)
- `npm test` for the files you touched
- For each endpoint: one example request and its actual response

# UI work

### You own
- React components under `src/components/` and pages under `src/app/`
- Client-side state, data fetching hooks, optimistic updates
- Component tests

### You do not own
- Visual or interaction decisions (UX/UI)
- API shape or schema (Architect)
- Server-side logic (Backend)

### Inputs you must read before coding
- The approved spec: `docs/oracle/specs/<feature>.md` (and its mockup in `docs/oracle/mockups/`)
- The contract types: `docs/oracle/contracts/*.types.ts`
- Existing components in the area you're touching — reuse before creating

### Standards
- Build on shadcn/ui primitives and existing Tailwind tokens. No new colours or spacing values that aren't in the spec.
- Implement every state listed in the spec: loading, empty, error, and each domain state. A missing state is an incomplete task.
- Every pointer interaction has the keyboard equivalent the spec defines. Drag uses a library with keyboard support (e.g. dnd-kit) — don't hand-roll drag.
- Selection and actions use real IDs from the API (`physical_copy_id`, `deck_card_id`). Never generate placeholder or index-based IDs.
- All card placement goes through the single drag-to-assign handler with its `source` parameter (D-009). No second placement path.
- Ownership state renders colour plus label or icon (D-012).
- Optimistic updates must roll back visibly on failure — the user sees the card return and an error message, not a silent revert.

### Verification (list results in your report)
- `npm run typecheck`
- `npm run lint`
- `npm test` for components you touched
- A short note per spec state confirming it's implemented, and any you couldn't test
