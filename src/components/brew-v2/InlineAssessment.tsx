'use client'

import type { CardAssessment } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InlineAssessmentProps {
  assessment: CardAssessment | null // null = loading
  onRemove: () => void
  onDiscuss: () => void
}

// ---------------------------------------------------------------------------
// FitScoreBar — horizontal bar colored by score range
// ---------------------------------------------------------------------------

function FitScoreBar({ score }: { score: number }) {
  // Determine color based on score range
  const getColor = (s: number) => {
    if (s >= 8) return { bg: 'bg-teal-500', text: 'text-teal-400' }
    if (s >= 5) return { bg: 'bg-amber-500', text: 'text-amber-400' }
    return { bg: 'bg-red-500', text: 'text-red-400' }
  }

  const { bg, text } = getColor(score)
  const widthPercent = (score / 10) * 100

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
        <div
          className={`h-full rounded-full ${bg} transition-all duration-300`}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <span className={`text-[10px] font-medium ${text} shrink-0`}>
        {score}/10
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LoadingState — pulsing dots with assessment message
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex items-center gap-1.5 py-2">
      <span className="inline-flex gap-0.5 animate-pulse">
        <span className="text-muted-foreground text-xs">●</span>
        <span className="text-muted-foreground text-xs">●</span>
        <span className="text-muted-foreground text-xs">●</span>
      </span>
      <span className="text-xs italic text-muted-foreground">
        Assessing for this deck...
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// InlineAssessment — expand below card row, accordion style
// ---------------------------------------------------------------------------

export function InlineAssessment({
  assessment,
  onRemove,
  onDiscuss,
}: InlineAssessmentProps) {
  return (
    <div className="ml-5 pl-3 border-l border-[rgba(255,255,255,0.08)] py-2 space-y-2 animate-in slide-in-from-top-1 duration-200">
      {assessment === null ? (
        <LoadingState />
      ) : (
        <>
          {/* Pros */}
          {assessment.pros.length > 0 && (
            <ul className="space-y-0.5">
              {assessment.pros.map((pro, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <span className="text-green-400 font-medium shrink-0">+</span>
                  <span className="text-[#d4d4d0]">{pro}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Cons */}
          {assessment.cons.length > 0 && (
            <ul className="space-y-0.5">
              {assessment.cons.map((con, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <span className="text-red-400 font-medium shrink-0">−</span>
                  <span className="text-[#d4d4d0]">{con}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Fit Score Bar */}
          <FitScoreBar score={assessment.fit_score} />

          {/* Fit Note */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            {assessment.fit_note}
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDiscuss()
              }}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Discuss
            </button>
          </div>
        </>
      )}
    </div>
  )
}
