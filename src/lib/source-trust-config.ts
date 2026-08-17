/**
 * Source Trust Configuration
 * 
 * Defines the base trustworthiness scores for different insight sources.
 * Higher scores indicate more reliable sources.
 * 
 * Trust scores are combined with recency to calculate final confidence:
 *   final_confidence = source_trust * recency_factor
 * 
 * Where recency_factor decays over time for sources where freshness matters.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Source Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

export type SourceType =
  // Data aggregation sources
  | 'scryfall-curated'    // Official Scryfall tagger team
  | 'edhrec'              // EDHREC deck statistics
  | 'edhrec-article'      // EDHREC written articles
  | 'mtggoldfish'         // MTGGoldfish metagame data
  
  // Content creator sources
  | 'youtube-tier1'       // Command Zone, EDHRECast, Tolarian
  | 'youtube-tier2'       // Nitpicking Nerds, Commander's Quarters
  | 'youtube-tier3'       // Smaller channels, varied quality
  | 'youtube'             // Generic YouTube (unknown tier)
  | 'podcast'             // Audio content
  
  // Community sources
  | 'reddit'              // Reddit discussions
  | 'discord'             // Discord community
  | 'forum'               // MTGSalvation, etc.
  
  // AI and user sources
  | 'ai-analysis'         // Oracle's own reasoning
  | 'user-submitted'      // Single user input
  | 'unknown';            // Fallback

// ═══════════════════════════════════════════════════════════════════════════
// Trust Configuration
// ═══════════════════════════════════════════════════════════════════════════

export interface SourceTrustConfig {
  /** Base trust score (0.00 - 1.00) */
  baseTrust: number;
  
  /** Whether the source value decays over time */
  recencyMatters: boolean;
  
  /** Monthly decay rate (only if recencyMatters is true) */
  monthlyDecayRate: number;
  
  /** Minimum trust floor after decay */
  minTrust: number;
  
  /** Human-readable description */
  description: string;
}

export const SOURCE_TRUST_CONFIG: Record<SourceType, SourceTrustConfig> = {
  // ─────────────────────────────────────────────────────────────────────────
  // Data Aggregation Sources (highest trust, based on real data)
  // ─────────────────────────────────────────────────────────────────────────
  
  'scryfall-curated': {
    baseTrust: 0.95,
    recencyMatters: false,
    monthlyDecayRate: 0,
    minTrust: 0.95,
    description: 'Official Scryfall tagger team - rules-text based, objective',
  },
  
  'edhrec': {
    baseTrust: 0.85,
    recencyMatters: true,
    monthlyDecayRate: 0.005, // -0.5% per month (slow decay)
    minTrust: 0.70,
    description: 'EDHREC deck statistics - aggregated from thousands of real decklists',
  },
  
  'edhrec-article': {
    baseTrust: 0.75,
    recencyMatters: true,
    monthlyDecayRate: 0.02, // -2% per month
    minTrust: 0.50,
    description: 'EDHREC written articles - expert opinions but can become dated',
  },
  
  'mtggoldfish': {
    baseTrust: 0.80,
    recencyMatters: true,
    monthlyDecayRate: 0.03, // -3% per month (metagame shifts quickly)
    minTrust: 0.45,
    description: 'MTGGoldfish metagame data - tournament/competitive focused, less EDH',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Content Creator Sources (opinions, but often well-researched)
  // ─────────────────────────────────────────────────────────────────────────
  
  'youtube-tier1': {
    baseTrust: 0.75,
    recencyMatters: true,
    monthlyDecayRate: 0.02,
    minTrust: 0.45,
    description: 'Top-tier creators: Command Zone, EDHRECast, Tolarian Community College',
  },
  
  'youtube-tier2': {
    baseTrust: 0.70,
    recencyMatters: true,
    monthlyDecayRate: 0.02,
    minTrust: 0.40,
    description: 'Mid-tier creators: Nitpicking Nerds, Commander\'s Quarters, Play to Win',
  },
  
  'youtube-tier3': {
    baseTrust: 0.55,
    recencyMatters: true,
    monthlyDecayRate: 0.03,
    minTrust: 0.30,
    description: 'Smaller channels with variable quality',
  },
  
  'youtube': {
    baseTrust: 0.60,
    recencyMatters: true,
    monthlyDecayRate: 0.025,
    minTrust: 0.35,
    description: 'Generic YouTube source (tier unknown)',
  },
  
  'podcast': {
    baseTrust: 0.65,
    recencyMatters: true,
    monthlyDecayRate: 0.02,
    minTrust: 0.40,
    description: 'Audio content - often discussion-based',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // Community Sources (wisdom of crowds, but groupthink risk)
  // ─────────────────────────────────────────────────────────────────────────
  
  'reddit': {
    baseTrust: 0.55,
    recencyMatters: true,
    monthlyDecayRate: 0.04, // -4% per month (meta shifts, opinions change)
    minTrust: 0.25,
    description: 'Reddit discussions - community wisdom but groupthink risk',
  },
  
  'discord': {
    baseTrust: 0.50,
    recencyMatters: true,
    monthlyDecayRate: 0.05,
    minTrust: 0.20,
    description: 'Discord community - real-time but ephemeral',
  },
  
  'forum': {
    baseTrust: 0.50,
    recencyMatters: true,
    monthlyDecayRate: 0.03,
    minTrust: 0.25,
    description: 'Forum posts - MTGSalvation, etc.',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // AI and User Sources (variable quality)
  // ─────────────────────────────────────────────────────────────────────────
  
  'ai-analysis': {
    baseTrust: 0.60,
    recencyMatters: false, // AI reasoning doesn't age the same way
    monthlyDecayRate: 0,
    minTrust: 0.60,
    description: 'Oracle\'s own reasoning - can synthesize but may hallucinate',
  },
  
  'user-submitted': {
    baseTrust: 0.40,
    recencyMatters: true,
    monthlyDecayRate: 0.02,
    minTrust: 0.25,
    description: 'Single user input - no external validation',
  },
  
  'unknown': {
    baseTrust: 0.50,
    recencyMatters: true,
    monthlyDecayRate: 0.02,
    minTrust: 0.30,
    description: 'Unknown source type - default moderate trust',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// YouTube Creator Mapping
// ═══════════════════════════════════════════════════════════════════════════

export type YouTubeCreatorTier = 'tier1' | 'tier2' | 'tier3';

export const YOUTUBE_CREATOR_TIERS: Record<string, YouTubeCreatorTier> = {
  // Tier 1 - Highest production, widest reach
  'the command zone': 'tier1',
  'command zone': 'tier1',
  'tolarian community college': 'tier1',
  'tolarian': 'tier1',
  'edhrecast': 'tier1',
  'edhrec': 'tier1',
  'mtg muddstah': 'tier1',
  
  // Tier 2 - Focused content, strong following
  'nitpicking nerds': 'tier2',
  'commander\'s quarters': 'tier2',
  'commanders quarters': 'tier2',
  'play to win': 'tier2',
  'playing with power': 'tier2',
  'the spike feeders': 'tier2',
  'i hate your deck': 'tier2',
  'mental misplay': 'tier2',
  'quest for the janklord': 'tier2',
  'commander clash': 'tier2',
  
  // Tier 3 - Smaller channels, niche content
  // (unlisted creators default to tier3)
};

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the base trust score for a source type
 */
export function getBaseTrust(sourceType: string): number {
  const config = SOURCE_TRUST_CONFIG[sourceType as SourceType];
  return config?.baseTrust ?? SOURCE_TRUST_CONFIG.unknown.baseTrust;
}

/**
 * Get the full trust config for a source type
 */
export function getTrustConfig(sourceType: string): SourceTrustConfig {
  return SOURCE_TRUST_CONFIG[sourceType as SourceType] ?? SOURCE_TRUST_CONFIG.unknown;
}

/**
 * Calculate adjusted trust based on source date
 * @param sourceType - The type of source
 * @param sourceDate - When the insight was created/published
 * @returns Adjusted trust score accounting for recency
 */
export function calculateAdjustedTrust(
  sourceType: string,
  sourceDate?: Date | string | null
): number {
  const config = getTrustConfig(sourceType);
  
  if (!config.recencyMatters || !sourceDate) {
    return config.baseTrust;
  }
  
  const date = typeof sourceDate === 'string' ? new Date(sourceDate) : sourceDate;
  const monthsOld = (Date.now() - date.getTime()) / (30 * 24 * 60 * 60 * 1000);
  
  const decayedTrust = config.baseTrust - (monthsOld * config.monthlyDecayRate);
  return Math.max(config.minTrust, Math.min(config.baseTrust, decayedTrust));
}

/**
 * Determine YouTube source type based on channel name
 */
export function getYouTubeSourceType(channelName?: string): SourceType {
  if (!channelName) return 'youtube';
  
  const normalized = channelName.toLowerCase().trim();
  const tier = YOUTUBE_CREATOR_TIERS[normalized];
  
  if (tier === 'tier1') return 'youtube-tier1';
  if (tier === 'tier2') return 'youtube-tier2';
  if (tier === 'tier3') return 'youtube-tier3';
  
  // Check for partial matches
  for (const [name, t] of Object.entries(YOUTUBE_CREATOR_TIERS)) {
    if (normalized.includes(name) || name.includes(normalized)) {
      if (t === 'tier1') return 'youtube-tier1';
      if (t === 'tier2') return 'youtube-tier2';
      return 'youtube-tier3';
    }
  }
  
  return 'youtube-tier3'; // Default unknown YouTube to tier 3
}

/**
 * Map legacy source_type values to new standardized types
 */
export function normalizeSourceType(sourceType: string): SourceType {
  const normalized = sourceType.toLowerCase().trim();
  
  // Direct matches
  if (normalized in SOURCE_TRUST_CONFIG) {
    return normalized as SourceType;
  }
  
  // Legacy mappings
  const mappings: Record<string, SourceType> = {
    'edhrec-stats': 'edhrec',
    'scryfall': 'scryfall-curated',
    'goldfish': 'mtggoldfish',
    'mtg goldfish': 'mtggoldfish',
    'ai': 'ai-analysis',
    'ai-generated': 'ai-analysis',
    'user': 'user-submitted',
    'curated': 'user-submitted',
  };
  
  return mappings[normalized] ?? 'unknown';
}
