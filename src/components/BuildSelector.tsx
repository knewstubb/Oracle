'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Sparkles, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

interface Build {
  id: string
  archetype: string | null
  theme: string | null
  slug: string
  deckCount: number
  deckPercentage: number
}

interface DetectedBuild {
  id: string
  archetype: string | null
  theme: string | null
  score: number
  matchedCards: number
  totalBuildCards: number
}

interface BuildResponse {
  currentBuildId: string | null
  detectedBuild: DetectedBuild | null
  availableBuilds: Build[]
}

interface BuildSelectorProps {
  deckId: number
  /** Called after build is changed */
  onBuildChange?: (buildId: string | null) => void
}

function formatBuildName(archetype: string | null, theme: string | null): string {
  if (archetype && theme) {
    return `${capitalize(theme)} ${capitalize(archetype)}`
  }
  if (archetype) {
    return capitalize(archetype)
  }
  if (theme) {
    return capitalize(theme)
  }
  return 'Unknown'
}

function capitalize(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function BuildSelector({ deckId, onBuildChange }: BuildSelectorProps) {
  const queryClient = useQueryClient()
  const [hasShownSuggestion, setHasShownSuggestion] = useState(false)

  const { data, isLoading, error } = useQuery<BuildResponse>({
    queryKey: ['deck-build', deckId],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/build`)
      if (!res.ok) throw new Error('Failed to load build data')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const setBuildMutation = useMutation({
    mutationFn: async (buildId: string | null) => {
      const res = await fetch(`/api/decks/${deckId}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildId }),
      })
      if (!res.ok) throw new Error('Failed to update build')
      return res.json()
    },
    onSuccess: (_, buildId) => {
      queryClient.invalidateQueries({ queryKey: ['deck-build', deckId] })
      queryClient.invalidateQueries({ queryKey: ['decks', String(deckId)] })
      onBuildChange?.(buildId)
      
      if (buildId) {
        const build = data?.availableBuilds.find(b => b.id === buildId)
        if (build) {
          toast.success(`Build set to ${formatBuildName(build.archetype, build.theme)}`)
        }
      } else {
        toast.success('Build cleared')
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update build')
    },
  })

  // Show suggestion toast when detected build differs from current
  useEffect(() => {
    if (
      !hasShownSuggestion &&
      data?.detectedBuild &&
      !data.currentBuildId &&
      data.detectedBuild.score >= 50
    ) {
      setHasShownSuggestion(true)
      const buildName = formatBuildName(data.detectedBuild.archetype, data.detectedBuild.theme)
      toast(
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--accent-primary)]" />
          <span>This deck looks like a <strong>{buildName}</strong> build ({data.detectedBuild.score}% match)</span>
        </div>,
        {
          action: {
            label: 'Set Build',
            onClick: () => setBuildMutation.mutate(data.detectedBuild!.id),
          },
          duration: 8000,
        }
      )
    }
  }, [data, hasShownSuggestion, setBuildMutation])

  if (isLoading) {
    return <Skeleton className="h-8 w-32" />
  }

  if (error || !data) {
    return null // Silent fail — build selector is optional
  }

  // No builds available for this commander
  if (data.availableBuilds.length === 0) {
    return null
  }

  const currentBuild = data.currentBuildId
    ? data.availableBuilds.find(b => b.id === data.currentBuildId)
    : null

  const displayName = currentBuild
    ? formatBuildName(currentBuild.archetype, currentBuild.theme)
    : 'Set Build'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-[length:var(--fs-md)]"
        >
          {currentBuild ? (
            <>
              <span className="max-w-[120px] truncate">{displayName}</span>
              <ChevronDown className="size-3.5 opacity-50" />
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" />
              <span>Set Build</span>
              <ChevronDown className="size-3.5 opacity-50" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {data.detectedBuild && !data.currentBuildId && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-[var(--accent-primary)]" />
              Suggested
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => setBuildMutation.mutate(data.detectedBuild!.id)}
            >
              <div className="flex flex-1 items-center justify-between">
                <span>
                  {formatBuildName(data.detectedBuild.archetype, data.detectedBuild.theme)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {data.detectedBuild.score}% match
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}

        {data.detectedBuild && !data.currentBuildId && <DropdownMenuSeparator />}

        <DropdownMenuGroup>
          <DropdownMenuLabel>Available Builds</DropdownMenuLabel>
          {data.availableBuilds.map(build => (
            <DropdownMenuItem
              key={build.id}
              onClick={() => setBuildMutation.mutate(build.id)}
            >
              <div className="flex flex-1 items-center justify-between">
                <div className="flex items-center gap-2">
                  {data.currentBuildId === build.id && (
                    <Check className="size-3.5" />
                  )}
                  <span>{formatBuildName(build.archetype, build.theme)}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {build.deckPercentage}%
                </span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        {data.currentBuildId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setBuildMutation.mutate(null)}
              className="text-muted-foreground"
            >
              Clear Build
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
