'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Hash, BookOpen, Ban, Trash2, FlaskConical, FolderInput } from 'lucide-react'
import { toast } from 'sonner'
import { CardImage } from '@/components/CardImage'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { validateDeckCount } from '@/lib/format-config'
import { cn } from '@/lib/utils'

export type HealthPipStatus = 'ok' | 'warn' | 'crit'
export type ReadinessTier = 'green' | 'amber' | 'red' | 'overcount'

export interface DeckFolder {
  id: number
  name: string
  color: string | null
}

export interface DeckTileProps {
  id: number
  name: string
  commanderName: string
  commanderScryfallId: string
  colourIdentity: string[]
  cardCount?: number
  deckType?: string | null
  format?: string | null
  healthStatus?: Array<HealthPipStatus>
  proxyCount?: number
  isActive?: boolean
  completeness?: { resolved: number; total: number; availableCount?: number; claimedCount?: number; unownedCount?: number } | null
  pipDistribution?: Record<string, number>
  hasBrew?: boolean  // Has an active brew session
  folderId?: number | null
  folders?: DeckFolder[]  // Available folders for context menu
}

const COLOUR_BAR_MAP: Record<string, { hex: string; label: string }> = {
  W: { hex: 'var(--mana-white)', label: 'White' },
  U: { hex: 'var(--mana-blue)', label: 'Blue' },
  B: { hex: 'var(--mana-black)', label: 'Black' },
  R: { hex: 'var(--mana-red)', label: 'Red' },
  G: { hex: 'var(--mana-green)', label: 'Green' },
}

const COLOUR_ORDER = ['W', 'U', 'B', 'R', 'G']

// Border colors by readiness tier
const BORDER_COLORS: Record<ReadinessTier, string> = {
  green: 'var(--accent-primary)',      // #1D9E75
  amber: 'var(--signal-warning)',      // #EF9F27
  red: 'var(--signal-critical)',       // #E24B4A
  overcount: 'var(--signal-warning)',  // amber for >100 cards
}

// Status icons for the count row
function getStatusIcon(tier: ReadinessTier, isActive?: boolean) {
  if (!isActive) return <BookOpen className="size-4" />
  
  switch (tier) {
    case 'green': return <Check className="size-4" />
    case 'amber': return <BookOpen className="size-4" />
    case 'red': return <Ban className="size-4" />
    case 'overcount': return <Hash className="size-4" />
  }
}

function getReadinessTier(
  isActive: boolean | undefined,
  completeness: DeckTileProps['completeness'],
  cardCount: number | undefined,
  format: string | null | undefined
): ReadinessTier {
  // Check for overcount first
  if (cardCount !== undefined) {
    const validation = validateDeckCount(cardCount, format)
    if (validation.required > 0 && cardCount > validation.required) {
      return 'overcount'
    }
  }
  
  // Check allocation completeness — applies to all decks now
  if (!completeness) return 'green'
  if (completeness.resolved === completeness.total) return 'green'
  if ((completeness.unownedCount ?? 0) > 0) return 'red'
  return 'amber'
}

export function DeckTile({
  id,
  name,
  commanderName,
  commanderScryfallId,
  colourIdentity,
  cardCount,
  format,
  isActive,
  completeness,
  pipDistribution,
  hasBrew,
  folderId,
  folders = [],
}: DeckTileProps) {
  const sorted = COLOUR_ORDER.filter((c) => colourIdentity.includes(c))
  const colourLabel = sorted.map((c) => COLOUR_BAR_MAP[c]?.label).filter(Boolean).join(', ')
  
  const readiness = getReadinessTier(isActive, completeness, cardCount, format)
  
  // Border color: Active decks get tier-based color, others get none
  const borderColor = isActive ? BORDER_COLORS[readiness] : undefined
  
  // Card count display
  const validation = cardCount !== undefined ? validateDeckCount(cardCount, format) : null
  const required = validation?.required ?? 100
  
  // For active decks that are ready (green), show the full card count
  // For active decks not ready, show resolved count to indicate progress
  // For brews, show slots filled
  let displayCount: number
  if (isActive) {
    if (readiness === 'green' || readiness === 'overcount') {
      // Deck is ready — show full card count
      displayCount = cardCount ?? 0
    } else if (completeness) {
      // Deck needs work — show how many are resolved
      displayCount = completeness.resolved
    } else {
      displayCount = cardCount ?? 0
    }
  } else {
    displayCount = cardCount ?? 0
  }
  const countText = `${displayCount}/${required} ${isActive ? 'cards' : 'slots'}`
  
  // Icon color matches border for Active decks, muted for others
  const iconColor = isActive 
    ? BORDER_COLORS[readiness] 
    : 'var(--text-muted)'

  // Outer glow for warning (amber) and alert (red) states - subtle
  const glowStyle = isActive && (readiness === 'amber' || readiness === 'overcount')
    ? { boxShadow: '0 0 8px 1px rgba(239, 159, 39, 0.25)' }
    : isActive && readiness === 'red'
      ? { boxShadow: '0 0 8px 1px rgba(226, 75, 74, 0.25)' }
      : {}

  // Context menu and delete state
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/decks/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete deck')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      toast.success(`Deleted ${name}`)
      setDeleteDialogOpen(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const moveMutation = useMutation({
    mutationFn: async (targetFolderId: number | null) => {
      const res = await fetch(`/api/decks/${id}/folder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: targetFolderId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to move deck')
      }
      return res.json()
    },
    onSuccess: (_, targetFolderId) => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      const folderName = targetFolderId 
        ? folders.find(f => f.id === targetFolderId)?.name ?? 'folder'
        : 'no folder'
      toast.success(`Moved to ${folderName}`)
      setContextMenuPos(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
    setShowMoveSubmenu(false)
  }

  const handleDeleteClick = () => {
    setContextMenuPos(null)
    setDeleteDialogOpen(true)
  }

  const handleMoveClick = (targetFolderId: number | null) => {
    moveMutation.mutate(targetFolderId)
  }

  // Drag handlers for folder drag-and-drop
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-deck-id', String(id))
    e.dataTransfer.setData('text/plain', name)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <>
      <Link
        href={`/decks/${id}`}
        aria-label={`${name} — ${commanderName}`}
        draggable
        onDragStart={handleDragStart}
        className={cn(
          'group relative block w-full aspect-[236/260] min-w-[200px] overflow-hidden rounded-2xl',
          '[box-shadow:0px_1px_3px_rgba(0,0,0,0.4),0px_4px_8px_3px_rgba(0,0,0,0.2)]',
          'transition-all duration-200 ease-out',
          'hover:-translate-y-1 hover:[box-shadow:0px_4px_8px_3px_rgba(0,0,0,0.4),0px_1px_3px_rgba(0,0,0,0.5)]',
          'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          !isActive && 'opacity-80',
        )}
        style={{
          backgroundColor: '#1A1A1A',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        onContextMenu={handleContextMenu}
      >
      {/* Commander art — 60% of card height */}
      <div className="relative h-[60%] overflow-hidden">
        <CardImage
          scryfallId={commanderScryfallId}
          alt={`${commanderName} card art`}
          width={480}
          height={322}
          artCrop
          noPreview
          className="h-full w-full object-cover brightness-[0.7] transition-all duration-200 ease-out group-hover:brightness-100 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        
        {/* Active deck status badge — top right corner */}
        {isActive && (
          <div 
            className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full"
            style={{ backgroundColor: BORDER_COLORS[readiness] }}
            aria-label={readiness === 'green' ? 'Ready to play' : readiness === 'amber' ? 'Needs attention' : 'Missing cards'}
          >
            <Check className="size-4 text-black" strokeWidth={3} />
          </div>
        )}
        
        {/* Inactive deck badge — brew flask */}
        {!isActive && (
          <div 
            className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full"
            style={{ backgroundColor: '#8F51D5' }}
            aria-label="Deck in progress"
          >
            <FlaskConical className="size-3.5 text-black" strokeWidth={2.5} />
          </div>
        )}
      </div>

      {/* Dark footer section — 40% of card height */}
      <div className="flex h-[40%] flex-col justify-between bg-[#1A1A1A] px-3 pt-3 pb-2">
        {/* Text content */}
        <div>
          {/* Deck name */}
          <h3 className="truncate text-[14px] font-semibold text-white leading-[18px]">
            {name}
          </h3>
          
          {/* Commander name — muted gray */}
          <p className="mt-0.5 truncate text-[12px] text-[#808080] leading-[15px]">
            {commanderName}
          </p>

          {/* Card count — neutral color */}
          <p className="mt-2 text-[12px] text-[#808080] leading-[15px]">
            {countText}
          </p>
        </div>

        {/* Colour identity bar — at bottom */}
        {sorted.length > 0 && (
          <div
            className="flex h-1 gap-0.5 rounded-full overflow-hidden"
            role="img"
            aria-label={colourLabel || 'Colourless'}
          >
            {sorted.map((c) => {
              const colour = COLOUR_BAR_MAP[c]
              if (!colour) return null
              const totalPips = pipDistribution
                ? Object.values(pipDistribution).reduce((a, b) => a + b, 0)
                : 0
              const weight = pipDistribution && totalPips > 0
                ? (pipDistribution[c] ?? 0) / totalPips
                : 1 / sorted.length
              return (
                <div
                  key={c}
                  className="h-full"
                  style={{
                    backgroundColor: colour.hex,
                    flex: `${weight} 0 0%`,
                  }}
                  aria-hidden="true"
                />
              )
            })}
          </div>
        )}
      </div>
    </Link>

    {/* Right-click context menu */}
    {contextMenuPos && (
      <div
        className="fixed z-50 min-w-[160px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1 shadow-lg"
        style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
        onMouseLeave={() => {
          setContextMenuPos(null)
          setShowMoveSubmenu(false)
        }}
      >
        {/* Move to folder option */}
        <div 
          className="relative"
          onMouseEnter={() => setShowMoveSubmenu(true)}
        >
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[length:var(--fs-xs)] text-foreground transition-colors hover:bg-[var(--bg-surface-hover)]"
          >
            <span className="flex items-center gap-2">
              <FolderInput className="size-3" />
              Move to folder
            </span>
            <span className="text-muted-foreground">›</span>
          </button>
          
          {/* Submenu */}
          {showMoveSubmenu && (
            <div 
              className="absolute left-full top-0 ml-1 min-w-[140px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1 shadow-lg"
            >
              {/* Remove from folder option */}
              {folderId !== null && (
                <button
                  type="button"
                  onClick={() => handleMoveClick(null)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[length:var(--fs-xs)] text-muted-foreground transition-colors hover:bg-[var(--bg-surface-hover)]"
                >
                  No folder
                </button>
              )}
              
              {/* Folder options */}
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => handleMoveClick(folder.id)}
                  disabled={folder.id === folderId}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[length:var(--fs-xs)] text-foreground transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 disabled:cursor-default"
                >
                  <span 
                    className="size-2 rounded-full" 
                    style={{ backgroundColor: folder.color ?? 'var(--text-muted)' }}
                  />
                  {folder.name}
                  {folder.id === folderId && <span className="ml-auto text-muted-foreground">✓</span>}
                </button>
              ))}
              
              {folders.length === 0 && (
                <span className="block px-3 py-1.5 text-[length:var(--fs-xs)] text-muted-foreground">
                  No folders yet
                </span>
              )}
            </div>
          )}
        </div>

        <div className="my-1 border-t border-[var(--border-subtle)]" />
        
        <button
          type="button"
          onClick={handleDeleteClick}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-[length:var(--fs-xs)] transition-colors hover:bg-[rgba(226,75,74,0.1)]"
          style={{ color: 'rgba(226,75,74,0.9)' }}
        >
          <Trash2 className="size-3" />
          Delete deck
        </button>
      </div>
    )}

    {/* Delete confirmation dialog */}
    <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <DialogContent className="sm:max-w-[400px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete deck?</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{name}</strong>? All allocated cards will be returned to storage.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
