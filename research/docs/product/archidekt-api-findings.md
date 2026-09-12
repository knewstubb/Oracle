# Archidekt API Findings

## Working Endpoints

### Get user's decks
```
GET https://archidekt.com/api/users/{userId}/decks/
```
Returns `{ decks: [...], rootFolder: {...} }`. Each deck has: id, name, private, featured (image URL), customFeatured, viewCount.

User ID: 614000

### Get single deck (full)
```
GET https://archidekt.com/api/decks/{deckId}/
```
Returns full deck with cards, categories, tags, owner info.

### Get single deck (compact)
```
GET https://archidekt.com/api/decks/{deckId}/small/
```
Same structure, possibly fewer fields.

## Non-working Endpoints
- `GET /api/decks/cards/?owner=...` — returns "Client Unavailable" error
- `GET /api/decks/?owner=...` — same error

## Data Structure

### Deck response top-level keys
id, name, createdAt, updatedAt, deckFormat, edhBracket, game, description, viewCount, featured, customFeatured, hasPrimer, private, unlisted, theorycrafted, points, userInput, owner, commentRoot, editors, parentFolder, bookmarked, categories, deckTags, playgroupDeckUrl, cardPackage, cards, customCards

### Card entry structure
```json
{
  "id": 2952642546,
  "categories": ["Ramp"],
  "companion": false,
  "flippedDefault": false,
  "label": "Proxy,#e158ff",
  "modifier": "Normal",
  "quantity": 1,
  "customCmc": null,
  "removedCategories": null,
  "createdAt": "...",
  "updatedAt": "...",
  "deletedAt": null,
  "notes": null,
  "card": {
    "id": 97290,
    "uid": "3178e55c-...",
    "edition": { "editioncode": "pw21", "editionname": "..." },
    "oracleCard": {
      "id": 665,
      "name": "Arbor Elf",
      "cmc": 1,
      "colorIdentity": ["Green"],
      "colors": ["Green"],
      "edhrecRank": 590,
      "layout": "normal",
      "uid": "4567a528-..."
    }
  }
}
```

### Label format
The `label` field on each card entry contains the tag name and colour:
- No tag: `",#656565"` (default grey)
- Have tag: `"Have,#37d67a"` (green)
- Don't Have tag: `"Don't Have,#f47373"` (red)
- Proxy tag: `"Proxy,#e158ff"` (purple)

Format: `"TagName,#hexcolor"` — comma-separated, no spaces.

### Commander detection
Commander cards have `"Commander"` in their `categories` array.

### Categories
Each deck has a `categories` array defining custom categories (Ramp, Draw, Removal, etc.) with `includedInDeck` and `includedInPrice` flags.

## Collection Endpoint
Not yet tested — may require authentication. Need to investigate:
- `GET /api/users/{userId}/collection/` or similar
- May need Playwright for authenticated collection access

## Auth
All tested endpoints work without authentication for public decks. Private decks and collection likely require auth.

## Deck count
User has 20 decks (16 Commander + some others).
