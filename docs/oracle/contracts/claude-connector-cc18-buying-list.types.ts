// CC-18a get_buying_list (read-only, no database change). Reuses OwnershipPriceSource from slice A.
import type { OwnershipPriceSource } from './claude-connector-slice-a.types'

export interface BuyingListDeckPart {
  deckId: number
  deckName: string
  notOwned: number // copies this deck needs that the owner does not own
  proxyUpgrade: number // proxy copies in this deck that an original would replace (0 unless include_proxies)
}

export interface BuyingListItem {
  name: string
  toBuy: number // notOwned + proxyUpgrade, across all decks (one per deck that wants it)
  notOwned: number
  proxyUpgrade: number
  unitPriceUsd: number | null // null = no known price (never 0)
  estimatedCostUsd: number | null // unitPriceUsd * toBuy; null when unpriced
  decks: BuyingListDeckPart[]
}

export interface BuyingListResult {
  ok: true
  includesProxies: boolean
  includesMaybeboard: boolean
  sort: 'price' | 'name'
  priceSource: OwnershipPriceSource & { notShopPrices: string }
  totals: {
    cardsToBuy: number // copies, all lines
    notOwnedCopies: number
    proxyUpgradeCopies: number
    estimatedCostUsd: number // priced lines only
    notOwnedCostUsd: number
    proxyUpgradeCostUsd: number
    unpricedCopies: number // copies with no known price, left out of the cost
    unpricedCards: number // distinct card names with no known price
  }
  items: BuyingListItem[] // the paged part
  total: number // distinct cards on the list (exact)
  returned: number
  offset: number
  truncated: boolean
  note?: string
}
