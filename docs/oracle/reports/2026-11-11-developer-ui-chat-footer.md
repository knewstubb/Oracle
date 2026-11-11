# Report: ui-chat-footer
Role: Developer
Status: PARTIAL
Task as received: Three changes on branch ui-chat-footer (push, do not merge): (1) remove white backgrounds from scroll bars everywhere (deck health panel, chat, page); (2) move the Oracle chat so it lives inside the footer (docked input row that expands upward if ambiguous); (3) make the Oracle chat background 50% opacity so the page background image shows through, text readable. Check specs and decisions.md for conflicts. Update tests. Run typecheck, lint, unit tests. Verify visually on a fresh dev server on port 3100 if possible.

## Summary for the owner
Scroll bars are now see-through with a faint thumb instead of white. The Oracle chat is now a bar along the bottom of the screen with a message box; clicking or typing in it opens the conversation upward over the page, and the chat is half see-through. I could not look at it in a browser (see Open questions), and two things you described do not exist in the app today (a footer and a page background image).

## Changed files
- src/app/globals.css — global scrollbar rules: transparent track and corner, subtle light thumb, dark colour scheme (covers page, chat, deck health panel, dialogs).
- src/components/OracleSidebar.tsx — chat is now a footer: always-visible input row; conversation panel expands upward (60% of screen height, max 560px). Removed side-panel resize handle and mobile backdrop. Background is 50% opaque with the existing blur. Focus or send while collapsed opens it.
- src/components/MainContentWrapper.tsx — chat slot moved from beside the page to below it (the new footer).
- src/components/OracleSidebar.test.tsx — new tests: collapsed shows only the input row, focus opens, send while collapsed opens and sends, open state expands upward with 50% background and closes.

## New decisions made (need owner confirmation)
- There was no footer in the app [Confirmed: src/app/layout.tsx, src/components/MainContentWrapper.tsx; no footer element outside page-level pagination]. I created the app footer as the chat's home. If you meant a different footer, tell me.
- Chose the docked input row that expands upward (as instructed for the ambiguous case). It overlays the page rather than pushing content up.
- The top-bar Oracle button and Cmd+Shift+O still open/close the conversation; the input row stays visible when closed.
- The old right-hand chat width setting is no longer used (still saved in the browser, harmless).
- The separate debrief/brew chat (OracleChat.tsx) was left unchanged; only the main Oracle chat was moved.

## Assumptions
- "Footer" = bottom of the app screen, full width.
- "50% opacity" = the chat's background colour at 50% alpha, text and buttons stay fully opaque. Backdrop blur was kept (it was already used by the old panel), which keeps text readable.
- No page background image exists in the code [Confirmed: grep of src for background-image/bg-cover found only dropdown arrow icons]. The chat now shows whatever is behind it (page content and dark canvas). If an image is to be added, that is separate work.

## Challenges to locked decisions
- none. decisions.md has no entry on chat placement, footer, scrollbars or opacity; no spec in docs/oracle/specs covers them. D-034 (AI changes undoable) is untouched.

## Open questions
- Is a bottom bar that overlays the page acceptable, or should the page shrink to make room when the chat is open?
- Where does the page background image come from? Nothing in the app defines one.

## Verification
- npm run typecheck — only the known error in docs/oracle/contracts/card-state-actions.examples.ts.
- npm run lint — 0 errors, 279 warnings (includes the known ones); none in files I touched.
- npm test — 225 files passed, 5 skipped; 2657 tests passed, 42 skipped. New OracleSidebar tests pass.
- Visual check — NOT done. Starting a second dev server on port 3100 was refused by Next.js ("Another next dev server is already running" for this folder), and I did not stop the owner's server on 3000. Scrollbar look, panel height on mobile and the half-see-through appearance are untested visually. Also not tested: the app login-protected pages in a browser, the session-history overlay inside the new panel.
- Spec states: loading, empty (suggestions), streaming (thinking dots), history, and new-chat confirmation are preserved in the panel code; not re-tested visually.
