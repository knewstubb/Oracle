'use client'

import { AVAILABLE_MODELS, type ModelConfig } from '@/lib/ai-models'

// ---------------------------------------------------------------------------
// Provider colour mapping
// ---------------------------------------------------------------------------

const PROVIDER_COLOURS: Record<ModelConfig['provider'], string> = {
  anthropic: '#F97316', // orange
  gemini: '#3B82F6',    // blue
  deepseek: '#22C55E',  // green
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ModelSelectorProps {
  selectedModelId: string
  onModelChange: (modelId: string) => void
  disabled?: boolean // True while streaming
}

// ---------------------------------------------------------------------------
// ModelSelector
// ---------------------------------------------------------------------------

export function ModelSelector({
  selectedModelId,
  onModelChange,
  disabled = false,
}: ModelSelectorProps) {
  const selectedModel = AVAILABLE_MODELS.find(m => m.id === selectedModelId) ?? AVAILABLE_MODELS[0]
  const dotColour = PROVIDER_COLOURS[selectedModel.provider]

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${disabled ? 'opacity-50' : ''}`}
    >
      {/* Provider colour dot */}
      <span
        className="inline-block h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: dotColour }}
        aria-hidden="true"
      />

      {/* Native select dropdown */}
      <select
        value={selectedModelId}
        onChange={(e) => onModelChange(e.target.value)}
        disabled={disabled}
        aria-label="Select AI model"
        className="bg-transparent text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 cursor-pointer hover:border-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-100 appearance-none pr-5 transition-colors"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 4px center',
        }}
      >
        {AVAILABLE_MODELS.map((model) => (
          <option key={model.id} value={model.id}>
            {`${model.label} — $${model.inputCostPerMillion}/$${model.outputCostPerMillion} per 1M tokens`}
          </option>
        ))}
      </select>
    </div>
  )
}
