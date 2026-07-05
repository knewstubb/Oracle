/**
 * AI Model Registry — centralized model configuration with pricing metadata.
 * Supports Anthropic, Gemini, and DeepSeek providers.
 */

export interface ModelConfig {
  id: string
  label: string
  provider: 'anthropic' | 'gemini' | 'deepseek'
  modelId: string
  inputCostPerMillion: number   // USD per 1M input tokens
  outputCostPerMillion: number  // USD per 1M output tokens
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    inputCostPerMillion: 3.00,
    outputCostPerMillion: 15.00,
  },
  {
    id: 'gemini-35-flash',
    label: 'Gemini 3.5 Flash',
    provider: 'gemini',
    modelId: 'gemini-3.5-flash',
    inputCostPerMillion: 1.50,
    outputCostPerMillion: 9.00,
  },
  {
    id: 'gemini-25-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'gemini',
    modelId: 'gemini-2.5-flash-preview-05-20',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.60,
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    modelId: 'deepseek-chat',
    inputCostPerMillion: 0.44,
    outputCostPerMillion: 0.87,
  },
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    modelId: 'deepseek-chat',
    inputCostPerMillion: 0.14,
    outputCostPerMillion: 0.28,
  },
]

export const DEFAULT_MODEL_ID = 'sonnet-4'

export function getModelConfig(modelId: string): ModelConfig {
  return AVAILABLE_MODELS.find(m => m.id === modelId) ?? AVAILABLE_MODELS[0]
}

export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const config = getModelConfig(modelId)
  return (
    (inputTokens / 1_000_000) * config.inputCostPerMillion +
    (outputTokens / 1_000_000) * config.outputCostPerMillion
  )
}
