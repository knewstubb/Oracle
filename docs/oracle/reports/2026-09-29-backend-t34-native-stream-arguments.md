# Report: native-stream-arguments
Role: Backend
Status: DONE
Task as received: Fix only native streamed tool-call argument duplication and its valid-fragment cases in the DeepSeek adapter, following the exact scope, owned files and offline verification in docs/oracle/reports/2026-09-29-orchestrator-dispatch-first-implementation.md.

## Summary for the owner

When the AI advisor asked to use a tool while its reply was still streaming in, one specific pattern — the very first update from the AI already containing the tool's name and its full instructions together — caused those instructions to be copied in twice. That made the instructions unreadable, so the tool call could silently get thrown away. That one pattern is now fixed and covered by an automated regression test; every other streaming pattern already worked and is unchanged.

## Changed files

- `src/lib/adapters/deepseek-adapter.ts` — in the native streamed tool-call handling, the first update for a call can arrive with its ID, name **and** a nonempty instructions fragment together. The old code stored that fragment when starting the call, then unconditionally re-entered the "add more instructions" step and appended the same fragment a second time, corrupting the JSON. The fix records the fragment once at call start, emits one delta event for it, and skips the duplicate append for that specific update only; every later update with only added instructions still accumulates exactly as before.
- `src/lib/adapters/deepseek-adapter.test.ts` (new) — regression coverage for the native streaming assembly only (see cases below).

## New decisions made (need owner confirmation)

- None.

## Assumptions

- The OpenAI SDK's streamed delta shape (`index`, optional `id`, `function.name`, `function.arguments`) is as currently typed/consumed elsewhere in this adapter; no SDK behavior was reinterpreted.
- "Header-only first delta" (id + name, no arguments) and "later fragment-only delta" (arguments only, no id/name) are the two other valid shapes already handled correctly before this change; only the third shape (id + name + nonempty arguments together) was broken.

## Challenges to locked decisions

- None.

## Open questions

- None for this scoped defect. Per the task's own limits, still separate/unaddressed: the S3 terminal-error protocol (DSML detection returning a typed `unsupported_response`, propagating failure through tool loop → route → sidebar, removing the advisor's no-tools fallback), and the S1/S2 owner gates. This change does not touch or claim any of that; it is one native streaming defect fixed, not "AI safeguards complete."

## Verification

- Regression proof (pre-fix): temporarily reverted only the fix (`git stash` on the adapter file) and reran the new suite — 5 of 7 cases failed, including the exact first-delta-duplication and interleaved-calls cases (tool calls dropped to length 0 because of malformed accumulated JSON). Restored the fix and reran — all 7 pass. This proves the regression is real and the fix addresses it.
- `npx vitest --run src/lib/adapters/deepseek-adapter.test.ts` — 7/7 passed:
  1. Complete JSON in the first delta (id+name+full arguments) accumulates once, one `tool_call_delta`, correct parsed object.
  2. Partial first fragment plus two subsequent pieces accumulate in order with no duplication.
  3. Header-only first delta then a separate arguments delta (pre-existing valid mode) unchanged.
  4. Two interleaved calls (alternating indices) each accumulate correctly under their own stable id/index; two starts, two ends, no cross-contamination.
  5. Empty-argument object (`{}`) parses to `{}` correctly.
  6. Mixed normal text deltas plus one tool call: text and tool-call streams remain independent.
  7. Non-streaming `sendMessage` normalization (existing call mode) is unchanged — verifies the fix is scoped to the streaming path only.
- `npx eslint src/lib/adapters/deepseek-adapter.ts src/lib/adapters/deepseek-adapter.test.ts` — 1 pre-existing error at line 152 (`prefer-const` in unrelated DSML text-buffering code, outside this diff, confirmed via `git diff` showing it untouched); zero errors introduced by this change or the new test file.
- `npx tsc --noEmit` (full project, no `typecheck` script exists) — 251-line baseline output saved to session workspace; zero errors reference `deepseek-adapter.ts` or `deepseek-adapter.test.ts`. All reported errors are pre-existing, in unrelated files (research scripts, other API routes/tests).
- Restored dependencies via `npm ci` only after `npx vitest` failed on a missing `vitest/config` module (empty `node_modules`); used the existing lockfile, no package/version changes.
- No live provider request, API key, paid model call, or app tool dispatch was made; the OpenAI SDK client is fully mocked with a hand-built async iterable of chunk objects.
