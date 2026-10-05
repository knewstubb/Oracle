# Report: Archidekt public collection validation error
Role: Backend
Status: DONE
Task as received: 1906809\nFailed to validate user: Failed to validate user: 400

## Summary for the owner
The supplied collection link is public and belongs to account 1160498. Archidekt returns 171 collection entries and five public decks for it. The earlier value 1906809 was a different account ID, which explains the rejection; the screen now reports this situation clearly.

## Changed files
- `src/lib/archidekt-client.ts` — recognize Archidekt's 400 response for a missing public collection and show a useful explanation.
- `src/app/api/onboarding/collection-stream/route.ts` — remove the duplicate validation-error prefix.
- `src/lib/__tests__/archidekt-input-parser.test.ts` — cover the 400 response and revised validation errors.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- Archidekt's response `No public collection found.` means the supplied account has no collection available through its public collection API.
- The supplied collection URL is the intended source for this import.

## Challenges to locked decisions
- none

## Open questions
- None.

## Verification
- `curl https://archidekt.com/api/collection/1906809/?pageSize=1` — returned `400` with `No public collection found.`
- `curl https://archidekt.com/api/collection/1160498/?pageSize=1` — returned `200`, 171 total entries.
- `curl https://archidekt.com/api/decks/v3/?ownerId=1160498&orderBy=-updatedAt&pageSize=100` — returned five decks; all five report `private: false`.
- `pnpm exec vitest run src/lib/__tests__/archidekt-input-parser.test.ts` — 33 passed.
- `git diff --check` — passed.
- `curl -I http://localhost:3001` — local feature-branch app responds and redirects to login.
