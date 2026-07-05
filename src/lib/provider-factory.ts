// ---------------------------------------------------------------------------
// Brew Model Selector — Provider Adapter Factory
// ---------------------------------------------------------------------------
// Creates the correct ProviderAdapter based on the model's provider field.
// Reads API keys from environment variables and throws ProviderConfigError
// with the specific env var name and provider name if a key is missing.
// ---------------------------------------------------------------------------

import type { ModelConfig } from './ai-models'
import type { ProviderAdapter } from './provider-adapter'
import { AnthropicAdapter } from './adapters/anthropic-adapter'
import { GeminiAdapter } from './adapters/gemini-adapter'
import { DeepSeekAdapter } from './adapters/deepseek-adapter'

// ---------------------------------------------------------------------------
// Startup API Key Validation (runs once on first import — server-side only)
// ---------------------------------------------------------------------------
// Non-fatal: the app still starts, but selecting an unconfigured provider will
// error at request time via ProviderConfigError in createProviderAdapter().
// ANTHROPIC_API_KEY is always required because the decision extractor uses it.
// ---------------------------------------------------------------------------

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    '[provider-factory] ANTHROPIC_API_KEY is required for decision extraction and Anthropic models'
  )
}

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    '[provider-factory] GEMINI_API_KEY not set — Gemini models will not be available'
  )
}

if (!process.env.DEEPSEEK_API_KEY) {
  console.warn(
    '[provider-factory] DEEPSEEK_API_KEY not set — DeepSeek models will not be available'
  )
}

// ---------------------------------------------------------------------------
// Error Type
// ---------------------------------------------------------------------------

/**
 * Thrown when a required API key environment variable is missing for the
 * selected provider. Exposes `envVar` and `provider` for programmatic access.
 */
export class ProviderConfigError extends Error {
  constructor(
    public envVar: string,
    public provider: string
  ) {
    super(`Missing API key: ${envVar} is required for ${provider} provider`)
    this.name = 'ProviderConfigError'
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Instantiate the correct ProviderAdapter for the given model configuration.
 * Reads API keys from environment variables and validates they are present.
 *
 * @throws ProviderConfigError if the required API key is not set
 * @throws Error if the provider is unknown
 */
export function createProviderAdapter(config: ModelConfig): ProviderAdapter {
  switch (config.provider) {
    case 'anthropic': {
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) throw new ProviderConfigError('ANTHROPIC_API_KEY', 'Anthropic')
      return new AnthropicAdapter(key)
    }
    case 'gemini': {
      const key = process.env.GEMINI_API_KEY
      if (!key) throw new ProviderConfigError('GEMINI_API_KEY', 'Gemini')
      return new GeminiAdapter(key)
    }
    case 'deepseek': {
      const key = process.env.DEEPSEEK_API_KEY
      if (!key) throw new ProviderConfigError('DEEPSEEK_API_KEY', 'DeepSeek')
      return new DeepSeekAdapter(key)
    }
    default:
      throw new Error(`Unknown provider: ${(config as { provider: string }).provider}`)
  }
}
