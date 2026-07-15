'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search, ChevronDown, Plus, Trash2, AlertTriangle, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { CardSlotBadge } from '@/components/CardSlotBadge'
import { PageHeader } from '@/components/PageHeader'

// ---------------------------------------------------------------------------
// Component Library Page
// ---------------------------------------------------------------------------

export default function ComponentLibraryPage() {
  return (
    <div className="min-h-full bg-[var(--bg-canvas)]">
      <div className="mx-auto max-w-[1280px] px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/settings"
            className="flex items-center gap-1 text-[length:var(--fs-sm)] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Settings
          </Link>
        </div>
        <PageHeader title="Component Library" subtitle="Design system source of truth" />

        <Tabs defaultValue="tokens" className="mt-6">
          <TabsList>
            <TabsTrigger value="tokens">Design Tokens</TabsTrigger>
            <TabsTrigger value="buttons">Buttons</TabsTrigger>
            <TabsTrigger value="badges">Badges &amp; Chips</TabsTrigger>
            <TabsTrigger value="inputs">Inputs</TabsTrigger>
            <TabsTrigger value="status">Status System</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
          </TabsList>

          {/* ─── Design Tokens ─────────────────────────────────────── */}
          <TabsContent value="tokens" className="mt-6 space-y-8">
            <TokensSection />
          </TabsContent>

          {/* ─── Buttons ───────────────────────────────────────────── */}
          <TabsContent value="buttons" className="mt-6 space-y-8">
            <ButtonsSection />
          </TabsContent>

          {/* ─── Badges & Chips ────────────────────────────────────── */}
          <TabsContent value="badges" className="mt-6 space-y-8">
            <BadgesSection />
          </TabsContent>

          {/* ─── Inputs ────────────────────────────────────────────── */}
          <TabsContent value="inputs" className="mt-6 space-y-8">
            <InputsSection />
          </TabsContent>

          {/* ─── Status System ─────────────────────────────────────── */}
          <TabsContent value="status" className="mt-6 space-y-8">
            <StatusSection />
          </TabsContent>

          {/* ─── Layout ────────────────────────────────────────────── */}
          <TabsContent value="layout" className="mt-6 space-y-8">
            <LayoutSection />
          </TabsContent>

          {/* ─── Feedback ──────────────────────────────────────────── */}
          <TabsContent value="feedback" className="mt-6 space-y-8">
            <FeedbackSection />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section: Design Tokens
// ---------------------------------------------------------------------------

function TokensSection() {
  return (
    <>
      {/* Colors */}
      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Colors</h2>

        <h3 className="text-[length:var(--fs-md)] font-medium text-[var(--text-secondary)] mb-3">Neutral ramp</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8 mb-6">
          <EditableColorSwatch name="Canvas" cssVar="--bg-canvas" defaultHex="#131316" />
          <EditableColorSwatch name="Surface" cssVar="--bg-surface" defaultHex="#1A1A1E" />
          <EditableColorSwatch name="Surface hover" cssVar="--bg-surface-hover" defaultHex="#212126" />
          <EditableColorSwatch name="Border subtle" cssVar="--border-subtle" defaultHex="#262629" />
          <EditableColorSwatch name="Border default" cssVar="--border-default" defaultHex="#35353A" />
          <EditableColorSwatch name="Text tertiary" cssVar="--text-tertiary" defaultHex="#6E6E76" />
          <EditableColorSwatch name="Text secondary" cssVar="--text-secondary" defaultHex="#9C9CA3" />
          <EditableColorSwatch name="Text primary" cssVar="--text-primary" defaultHex="#E8E8EA" />
        </div>

        <h3 className="text-[length:var(--fs-md)] font-medium text-[var(--text-secondary)] mb-3">Accent &amp; signals</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 mb-6">
          <EditableColorSwatch name="Accent primary" cssVar="--accent-primary" defaultHex="#1D9E75" />
          <EditableColorSwatch name="Success" cssVar="--signal-success" defaultHex="#1D9E75" />
          <EditableColorSwatch name="Warning" cssVar="--signal-warning" defaultHex="#EF9F27" />
          <EditableColorSwatch name="Critical" cssVar="--signal-critical" defaultHex="#E24B4A" />
          <EditableColorSwatch name="Destructive" cssVar="--signal-destructive" defaultHex="#DC2626" />
        </div>
        <p className="text-[length:var(--fs-xs)] text-[var(--text-tertiary)] mb-6">
          <strong className="text-[var(--text-secondary)]">Accent:</strong> interactive elements (buttons, links).{' '}
          <strong className="text-[var(--text-secondary)]">Success:</strong> positive state (card resolved/assigned).{' '}
          <strong className="text-[var(--text-secondary)]">Warning:</strong> attention needed (open slot, health warn).{' '}
          <strong className="text-[var(--text-secondary)]">Critical:</strong> bad state indicator (unowned, missing).{' '}
          <strong className="text-[var(--text-secondary)]">Destructive:</strong> dangerous action buttons (delete, clear data).
        </p>

        <h3 className="text-[length:var(--fs-md)] font-medium text-[var(--text-secondary)] mb-3">Status colors</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 mb-6">
          <EditableColorSwatch name="Owned" cssVar="--status-owned" defaultHex="#5F5E5A" />
          <EditableColorSwatch name="Proxy" cssVar="--status-proxy" defaultHex="#4A93A0" />
          <EditableColorSwatch name="Unowned" cssVar="--status-unowned" defaultHex="#F0339E" />
          <EditableColorSwatch name="Over-allocated" cssVar="--status-over" defaultHex="#FF5F1F" />
        </div>

        <h3 className="text-[length:var(--fs-md)] font-medium text-[var(--text-secondary)] mb-3">WUBRG (Magic color identity)</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 mb-6">
          <EditableColorSwatch name="White (W)" cssVar="--mana-white" defaultHex="#F5F0C1" />
          <EditableColorSwatch name="Blue (U)" cssVar="--mana-blue" defaultHex="#6BA5C4" />
          <EditableColorSwatch name="Black (B)" cssVar="--mana-black" defaultHex="#9E9E9E" />
          <EditableColorSwatch name="Red (R)" cssVar="--mana-red" defaultHex="#D4836A" />
          <EditableColorSwatch name="Green (G)" cssVar="--mana-green" defaultHex="#7BC4A0" />
        </div>
        <p className="text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">
          WUBRG colors are used on deck tile color bars, collection filter icons, and mana pip rendering.
          Changes here preview live across the entire app (session-only).
        </p>
      </div>

      <Separator />

      {/* Typography */}
      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Typography</h2>
        <div className="space-y-3">
          <TypographySample size="--fs-xs" label="fs-xs" value="11px" />
          <TypographySample size="--fs-sm" label="fs-sm" value="12px" />
          <TypographySample size="--fs-base" label="fs-base" value="13px" />
          <TypographySample size="--fs-md" label="fs-md" value="14px" />
          <TypographySample size="--fs-lg" label="fs-lg" value="16px" />
          <TypographySample size="--fs-xl" label="fs-xl" value="20px" />
          <TypographySample size="--fs-2xl" label="fs-2xl" value="24px" />
          <TypographySample size="--fs-3xl" label="fs-3xl" value="28px" />
        </div>
        <p className="mt-4 text-[length:var(--fs-sm)] text-[var(--text-tertiary)]">
          Weights: 400 (normal), 500 (medium). No bold — medium is the maximum emphasis.
        </p>
      </div>

      <Separator />

      {/* Spacing */}
      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Spacing (8pt grid)</h2>
        <div className="space-y-2">
          {[
            { name: 'space-1', value: '4px' },
            { name: 'space-2', value: '8px' },
            { name: 'space-3', value: '12px' },
            { name: 'space-4', value: '16px' },
            { name: 'space-5', value: '24px' },
            { name: 'space-6', value: '32px' },
            { name: 'space-7', value: '48px' },
          ].map(s => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="w-20 text-[length:var(--fs-xs)] text-[var(--text-tertiary)] font-mono">{s.name}</span>
              <div
                className="h-3 rounded-sm bg-[var(--accent-primary)]"
                style={{ width: s.value }}
              />
              <span className="text-[length:var(--fs-xs)] text-[var(--text-secondary)]">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Border radius */}
      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Border radius</h2>
        <div className="flex gap-4">
          <div className="flex flex-col items-center gap-2">
            <div className="size-12 border border-[var(--border-default)]" style={{ borderRadius: '8px', background: 'var(--bg-surface)' }} />
            <span className="text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">8px (md)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="size-12 border border-[var(--border-default)]" style={{ borderRadius: '12px', background: 'var(--bg-surface)' }} />
            <span className="text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">12px (lg)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="size-12 border border-[var(--border-default)]" style={{ borderRadius: '9999px', background: 'var(--bg-surface)' }} />
            <span className="text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">full (pill)</span>
          </div>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Section: Buttons
// ---------------------------------------------------------------------------

function ButtonsSection() {
  return (
    <>
      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Variants</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="default">Default</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Sizes</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon"><Plus className="size-4" /></Button>
          <Button size="icon-sm"><Plus className="size-3.5" /></Button>
          <Button size="icon-xs"><Plus className="size-3" /></Button>
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">States</h2>
        <div className="flex flex-wrap gap-3">
          <Button>Normal</Button>
          <Button disabled>Disabled</Button>
          <Button variant="outline" style={{ color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' }}>
            Teal outline (action)
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">With icons</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="destructive" className="gap-2">
            <Trash2 className="size-4" /> Delete
          </Button>
          <Button variant="outline" className="gap-2">
            <Plus className="size-4" /> Add
          </Button>
          <Button variant="ghost" className="gap-2">
            <Search className="size-4" /> Search
          </Button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Section: Badges & Chips
// ---------------------------------------------------------------------------

function BadgesSection() {
  return (
    <>
      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Badge variants (shadcn)</h2>
        <div className="flex flex-wrap gap-3">
          <Badge variant="default">Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Custom chips (app-level)</h2>
        <p className="text-[length:var(--fs-sm)] text-[var(--text-tertiary)] mb-3">
          Filter toggle chips used in toolbars. Active state uses a colored border + tinted background.
        </p>
        <div className="flex flex-wrap gap-3">
          <FilterChipExample label="Hide Basics" active />
          <FilterChipExample label="Allocated" active={false} />
          <FilterChipExample label="Missing (3)" active variant="critical" />
          <FilterChipExample label="Proxies (12)" active variant="blue" />
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Proxy / Foil badges (instance rows)</h2>
        <div className="flex flex-wrap gap-3">
          <span
            className="rounded-full px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium leading-none"
            style={{ background: 'rgba(29, 158, 117, 0.15)', color: 'var(--accent-primary)' }}
          >
            Proxy
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium leading-none"
            style={{ background: 'rgba(167,139,250,0.15)', color: 'rgba(167,139,250,0.8)' }}
          >
            Foil
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium leading-none"
            style={{ background: 'rgba(59,130,246,0.15)', color: 'rgb(96,165,250)' }}
          >
            brew
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium leading-none"
            style={{ background: 'rgba(34,197,94,0.15)', color: 'rgb(74,222,128)' }}
          >
            boxed
          </span>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Section: Inputs
// ---------------------------------------------------------------------------

function InputsSection() {
  const [switchOn, setSwitchOn] = useState(false)

  return (
    <>
      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Text input</h2>
        <div className="max-w-sm space-y-3">
          <Input placeholder="Default input" />
          <Input placeholder="Disabled" disabled />
          <Input placeholder="With value" defaultValue="Sol Ring" />
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Search input (app pattern)</h2>
        <div className="max-w-sm">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-[13px] -translate-y-1/2"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            />
            <input
              type="text"
              placeholder="Search cards..."
              className="w-full rounded-md px-2.5 py-1.5 pl-[30px] text-[length:var(--fs-sm)] text-white placeholder:text-[rgba(255,255,255,0.2)]"
              style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)' }}
            />
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Switch</h2>
        <div className="flex items-center gap-3">
          <Switch checked={switchOn} onCheckedChange={setSwitchOn} />
          <span className="text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
            {switchOn ? 'On' : 'Off'}
          </span>
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Select (app pattern)</h2>
        <div className="max-w-sm">
          <select
            className="h-7 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 text-[length:var(--fs-md)] font-medium text-[var(--text-secondary)] outline-none"
          >
            <option>Select location...</option>
            <option>Rare binder</option>
            <option>Bulk box</option>
          </select>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Section: Status System
// ---------------------------------------------------------------------------

function StatusSection() {
  return (
    <>
      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Card slot status badges</h2>
        <p className="text-[length:var(--fs-sm)] text-[var(--text-tertiary)] mb-4">
          Five-state taxonomy for card allocation. Each has a unique dot style + color.
        </p>
        <div className="flex flex-wrap gap-4">
          <CardSlotBadge status="original" />
          <CardSlotBadge status="proxy" />
          <CardSlotBadge status="open" />
          <CardSlotBadge status="claimed" heldBy={{ deckName: 'Muldrotha', deckStatus: 'boxed' }} />
          <CardSlotBadge status="unowned" />
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Dot styles</h2>
        <div className="grid grid-cols-5 gap-6">
          <DotExplainer label="Original" desc="Solid fill" dotStyle="solid" color="var(--accent-primary)" />
          <DotExplainer label="Proxy" desc="Dashed border" dotStyle="dashed" color="var(--accent-primary)" />
          <DotExplainer label="Open" desc="Half fill" dotStyle="half" color="var(--signal-warning)" />
          <DotExplainer label="Claimed" desc="Cross mark" dotStyle="crossed" color="var(--status-over)" />
          <DotExplainer label="Unowned" desc="Empty ring" dotStyle="empty" color="var(--signal-critical)" />
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Missing state</h2>
        <div className="flex items-center gap-3 opacity-50">
          <span className="line-through text-[length:var(--fs-base)] text-[var(--text-tertiary)]">Demonic Tutor</span>
          <span className="text-[9px] font-medium uppercase" style={{ color: 'rgba(228,75,74,0.8)' }}>missing</span>
        </div>
        <p className="mt-2 text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">
          Dimmed row + strikethrough + red left border (in list view) + &quot;MISSING&quot; badge
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Section: Layout
// ---------------------------------------------------------------------------

function LayoutSection() {
  return (
    <>
      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Row height</h2>
        <div
          className="flex items-center rounded-lg border border-[var(--border-default)] px-3"
          style={{ height: 'var(--row-height)' }}
        >
          <span className="text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
            Standard row: 44px (var(--row-height))
          </span>
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Skeleton loading</h2>
        <div className="space-y-2 max-w-sm">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Separator</h2>
        <div className="space-y-3">
          <p className="text-[length:var(--fs-sm)] text-[var(--text-secondary)]">Content above</p>
          <Separator />
          <p className="text-[length:var(--fs-sm)] text-[var(--text-secondary)]">Content below</p>
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Kebab menu pattern</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] px-3 py-2">
            <span className="text-[length:var(--fs-sm)] text-[var(--text-primary)]">Row content</span>
            <button className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-secondary)]">
              <MoreVertical className="size-3.5" />
            </button>
          </div>
          <span className="text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">
            Secondary actions behind kebab (3-dot menu)
          </span>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Section: Feedback
// ---------------------------------------------------------------------------

function FeedbackSection() {
  return (
    <>
      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Toast patterns (via Sonner)</h2>
        <p className="text-[length:var(--fs-sm)] text-[var(--text-tertiary)] mb-3">
          Toasts use <code className="text-[var(--text-secondary)]">toast.success()</code>, <code className="text-[var(--text-secondary)]">toast.error()</code>, <code className="text-[var(--text-secondary)]">toast.info()</code> from sonner.
        </p>
        <div className="flex gap-3">
          <Button size="sm" variant="outline" onClick={() => { import('sonner').then(m => m.toast.success('Action completed')) }}>
            Success toast
          </Button>
          <Button size="sm" variant="outline" onClick={() => { import('sonner').then(m => m.toast.error('Something went wrong')) }}>
            Error toast
          </Button>
          <Button size="sm" variant="outline" onClick={() => { import('sonner').then(m => m.toast.info('Informational message')) }}>
            Info toast
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Confirmation modal pattern</h2>
        <p className="text-[length:var(--fs-sm)] text-[var(--text-tertiary)] mb-3">
          Used for destructive actions (Delete, Clear All Data, Claim from built deck).
          DialogTitle + DialogDescription + Cancel/Confirm buttons.
        </p>
        <div className="max-w-md rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 space-y-3">
          <h3 className="text-[length:var(--fs-md)] font-medium text-[var(--text-primary)]">Delete selected cards?</h3>
          <p className="text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
            This will permanently delete 3 cards from your collection. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm">Cancel</Button>
            <Button variant="destructive" size="sm">Delete</Button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)] mb-4">Empty states</h2>
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-8 flex items-center justify-center">
          <p className="text-[length:var(--fs-md)]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            No cards match your filters.
          </p>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function EditableColorSwatch({ name, cssVar, defaultHex }: { name: string; cssVar: string; defaultHex: string }) {
  const [color, setColor] = useState(defaultHex)
  const [editing, setEditing] = useState(false)

  const handleChange = (newColor: string) => {
    setColor(newColor)
    // Apply to document for live preview
    document.documentElement.style.setProperty(cssVar, newColor)
  }

  const handleReset = () => {
    setColor(defaultHex)
    document.documentElement.style.setProperty(cssVar, defaultHex)
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative group">
        <div
          className="size-10 rounded-lg border border-[rgba(255,255,255,0.1)] cursor-pointer transition-transform hover:scale-110"
          style={{ backgroundColor: color }}
          onClick={() => setEditing(!editing)}
          title={`Click to edit ${name}`}
        />
        {color !== defaultHex && (
          <button
            onClick={(e) => { e.stopPropagation(); handleReset() }}
            className="absolute -top-1 -right-1 size-3.5 rounded-full bg-[var(--signal-critical)] text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title="Reset to default"
          >
            x
          </button>
        )}
      </div>
      <span className="text-[length:var(--fs-xs)] text-[var(--text-secondary)] text-center leading-tight">{name}</span>
      <span className="text-[9px] text-[var(--text-tertiary)] font-mono">{color}</span>
      {editing && (
        <div className="mt-1 flex flex-col items-center gap-1">
          <input
            type="color"
            value={color.startsWith('#') ? color : defaultHex}
            onChange={(e) => handleChange(e.target.value)}
            className="size-8 cursor-pointer rounded border-none bg-transparent"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => handleChange(e.target.value)}
            className="w-[72px] rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1 py-0.5 text-center text-[9px] font-mono text-[var(--text-secondary)]"
          />
        </div>
      )}
    </div>
  )
}

function TypographySample({ size, label, value }: { size: string; label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="w-16 text-[length:var(--fs-xs)] text-[var(--text-tertiary)] font-mono">{label}</span>
      <span style={{ fontSize: `var(${size})` }} className="text-[var(--text-primary)]">
        The quick brown fox jumps over the lazy dog
      </span>
      <span className="text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">{value}</span>
    </div>
  )
}

function FilterChipExample({ label, active, variant = 'accent' }: { label: string; active: boolean; variant?: 'accent' | 'critical' | 'blue' }) {
  const colors = {
    accent: { border: 'rgba(29,158,117,0.4)', bg: 'rgba(29,158,117,0.1)', text: '#1D9E75' },
    critical: { border: 'rgba(228,75,74,0.4)', bg: 'rgba(228,75,74,0.1)', text: 'var(--signal-critical)' },
    blue: { border: 'rgba(107,138,255,0.4)', bg: 'rgba(107,138,255,0.1)', text: '#6B8AFF' },
  }
  const c = colors[variant]

  return (
    <span
      className="rounded-full px-2.5 py-[4px] text-[11px] transition-colors"
      style={{
        border: active ? `0.5px solid ${c.border}` : '0.5px solid rgba(255,255,255,0.1)',
        background: active ? c.bg : undefined,
        color: active ? c.text : 'rgba(255,255,255,0.35)',
      }}
    >
      {label}
    </span>
  )
}

function DotExplainer({ label, desc, dotStyle, color }: { label: string; desc: string; dotStyle: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex items-center justify-center size-8">
        {dotStyle === 'solid' && <span className="size-3 rounded-full" style={{ backgroundColor: color }} />}
        {dotStyle === 'dashed' && <span className="size-3 rounded-full" style={{ border: `2px dashed ${color}` }} />}
        {dotStyle === 'half' && <span className="size-3 rounded-full" style={{ background: `linear-gradient(to right, ${color} 50%, transparent 50%)`, border: `2px solid ${color}` }} />}
        {dotStyle === 'crossed' && (
          <span className="relative size-3 rounded-full" style={{ border: `2px solid ${color}` }}>
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold" style={{ color }}>×</span>
          </span>
        )}
        {dotStyle === 'empty' && <span className="size-3 rounded-full" style={{ border: `2px solid ${color}` }} />}
      </div>
      <span className="text-[length:var(--fs-xs)] text-[var(--text-primary)]">{label}</span>
      <span className="text-[9px] text-[var(--text-tertiary)]">{desc}</span>
    </div>
  )
}
