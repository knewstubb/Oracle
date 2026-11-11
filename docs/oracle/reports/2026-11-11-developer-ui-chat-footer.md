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
- Chose the docked input row in the footer. (Superseded by owner feedback: the conversation is now a right-edge side panel between the top bar and the footer bar, not an upward-expanding panel; see Follow-up 2.) It overlays the page rather than pushing content.
- The top-bar Oracle button and Cmd+Shift+O still open/close the conversation; the input row stays visible when closed.
- The old right-hand chat width setting is no longer used (still saved in the browser, harmless).
- The separate debrief/brew chat (OracleChat.tsx) was left unchanged; only the main Oracle chat was moved.

## Assumptions
- "Footer" = bottom of the app screen, full width.
- "50% opacity" = the chat's background colour at 50% alpha, text and buttons stay fully opaque. Backdrop blur was kept (it was already used by the old panel), which keeps text readable.
- No page background image exists in the code [Confirmed: grep of src for background-image/bg-cover found only dropdown arrow icons]. The chat now shows whatever is behind it (page content and dark canvas). If an image is to be added, that is separate work.

## Challenges to locked decisions
- none. decisions.md has no entry on chat placement, footer, scrollbars or opacity; no spec in docs/oracle/specs covers them. D-034 (AI changes undoable) is untouched.

## Follow-up (background image on deck pages)
- The only page-wide background image is the blurred commander art on the deck page [Confirmed: src/app/decks/[id]/page.tsx, art layer at z-0, hidden on phones by the existing `sm:block`]. Other art uses (deck tiles, workbench, new-deck) are thumbnails, not backgrounds.
- Problem found: the soft blur sat on the footer wrapper, and a blur inside a blurred parent cannot see the page behind it, so the conversation panel would not have shown the art properly. Fix: the blur now sits on the input row and on the panel separately (OracleSidebar.tsx). The panel is above the page layers and not clipped.
- The art fades to the plain dark background at the bottom of the page (existing gradient), so the thin input bar shows little art; the conversation panel, which covers the page, shows it. I did not change the art or its fade.
- Owner decision recorded: the page does NOT shrink; the chat overlays the page (this is how it is built).
- Tests: updated OracleSidebar.test.tsx (blur not on the footer wrapper, 50% background on the input row and panel); 4 pass. Typecheck unchanged (known error only). Still not checked in a browser.

## Follow-up 2 (side panel, scrollbars)
- Owner feedback: the conversation was a full-width lower-half panel. Now it is a right-edge side panel, 420px wide (or the screen width if narrower), starting under the top bar / page title and ending above the footer message bar. 50% see-through background with blur. The page does not resize [Confirmed: src/components/OracleSidebar.tsx, MainContentWrapper.tsx]. The panel's bottom follows the footer bar height (measured), so it never covers the bar.
- Scrollbars: the only scroll sources are the browser's own (no ScrollArea library; the shadcn `no-scrollbar` utility and one hidden-scrollbar strip on the deck page hide bars, they do not colour them). Global rules now cover: standard scrollbar colour/width, scrollbar, track, track-piece, corner, button (hidden), resizer, thumb; `color-scheme: dark` and a dark `html` background so any browser-drawn track or corner is dark, not white. I could not reproduce a white strip in headless Chrome even before the extra rules, so I cannot be sure what the owner's browser drew; the likely cause on macOS is a light colour scheme for the page scroll bar, which is now forced dark. If white persists, send a screenshot with the browser name.
- Verified visually: copied the repo to /tmp, ran it with webpack on port 3100 (the owner's 3000 server was not touched; my 3100 server is stopped), headless Chrome with scroll bars forced visible and light OS scheme. Screenshots viewed: Decks page and a deck page with the chat open. Result: panel on the right between top bar and footer bar, page content not resized, commander art visible through the panel, chat scroll bar shows a faint thumb on a transparent track. Not visually checked: deck health panel scrolling, phone width, Firefox/Safari.
- Tests: OracleSidebar.test.tsx updated; 4 pass. Full suite: all pass except none failing after the fix (225 files). Typecheck: only the known error. Lint: nothing new in touched files.

## Open questions
- Is a bottom bar that overlays the page acceptable, or should the page shrink to make room when the chat is open? (Answered: overlay, no shrink.)
- Where does the page background image come from? (Answered: commander art on deck pages.)

## Verification
- npm run typecheck — only the known error in docs/oracle/contracts/card-state-actions.examples.ts.
- npm run lint — 0 errors, 279 warnings (includes the known ones); none in files I touched.
- npm test — 225 files passed, 5 skipped; 2657 tests passed, 42 skipped. New OracleSidebar tests pass.
- Visual check — NOT done. Starting a second dev server on port 3100 was refused by Next.js ("Another next dev server is already running" for this folder), and I did not stop the owner's server on 3000. Scrollbar look, panel height on mobile and the half-see-through appearance are untested visually. Also not tested: the app login-protected pages in a browser, the session-history overlay inside the new panel.
- Spec states: loading, empty (suggestions), streaming (thinking dots), history, and new-chat confirmation are preserved in the panel code; not re-tested visually.
