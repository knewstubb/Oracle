# CC-15 contract: Claude creates and sets up a deck

Two new Claude tools. Claude still has no tool that deletes a deck (`delete_deck` stays blocked).

## create_deck
Makes a new, empty deck: name (1-100 characters), format (the app's format list) and, for Commander, a commander by name. The deck starts inactive, the commander is a Planned slot (no copy attached), and the commander's colours are stored the same way as when the owner creates a deck by hand. A second deck with the same name (any letter case) is refused. Limits: 10 new decks per hour, 25 open empty decks.

## set_deck_setup
Changes a deck's commander, strategy notes (up to 4000 characters) and bracket (1 to 4, or null to clear). At least one field. Only the fields that really change are saved and logged; nothing changed returns `no_change` and no log row.

## Undo
- Setup: Claude or the owner, refused with `changed_since` if the owner edited the same thing afterwards.
- Creation: owner only. Claude gets `owner_only`. The owner removes the deck only while it is empty, unused, and under 7 days old; otherwise `deck_not_empty`, `deck_in_use` or `too_old`.
- A Claude-made deck can always be deleted by hand like any other deck.

## Safety
No input has a user id. The user and connection come from the verified token. Types: `claude-connector-cc15-deck-create.types.ts`.
