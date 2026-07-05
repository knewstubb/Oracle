'use client'

import { GenericLandArtSettings } from '@/components/settings/generic-land-art-settings'

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </header>

      <div className="space-y-8">
        <GenericLandArtSettings />
      </div>
    </div>
  )
}
