'use client'

import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { ColourPips } from '@/components/ColourPips'
import type { Commander } from '@/components/CommanderSearch'

interface BrewConfirmationCardProps {
  commander: Commander
  onConfirm: () => void
  onBack: () => void
}

function getScryfallImageUrl(name: string): string {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`
}

export function BrewConfirmationCard({ commander, onConfirm, onBack }: BrewConfirmationCardProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.06)] p-6">
      {/* Card art */}
      <div className="overflow-hidden rounded-xl">
        <Image
          src={getScryfallImageUrl(commander.name)}
          alt={commander.name}
          width={200}
          height={148}
          className="h-auto w-[200px] rounded-xl object-cover"
          unoptimized
        />
      </div>

      {/* Commander name + colour pips */}
      <div className="flex flex-col items-center gap-1.5">
        <h3 className="text-lg font-semibold text-foreground">
          {commander.name}
        </h3>
        <ColourPips colours={commander.colorIdentity} size={14} />
      </div>

      {/* Type line */}
      <p className="text-sm text-muted-foreground">
        {commander.typeLine}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          variant="ghost"
          size="lg"
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          size="lg"
          onClick={onConfirm}
          className="bg-[var(--color-teal)] text-white hover:bg-[rgba(29,158,117,0.85)]"
        >
          Confirm
        </Button>
      </div>
    </div>
  )
}
