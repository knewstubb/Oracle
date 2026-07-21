'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Zap, ZapOff, RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { loadHashDB, isHashDBReady, getHashDBSize } from '@/lib/scanner/hash-db'
import { processFrame, detectCardPresence } from '@/lib/scanner/scan-pipeline'
import { FrameBuffer, computeGlarePercentage } from '@/lib/scanner/frame-buffer'
import { GlareIndicator } from '@/components/scanner/GlareIndicator'
import type { ScanMode, ScanTarget, ScannedCard } from '@/components/scanner/ScanSession'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cooldown after a successful scan to prevent duplicate detection (ms) */
const SCAN_COOLDOWN_MS = 2000

/** Card aspect ratio (63mm x 88mm = 0.716) */
const CARD_ASPECT_RATIO = 63 / 88

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScannerViewfinderProps {
  mode: ScanMode
  target: ScanTarget
  scannedCards: ScannedCard[]
  onCardScanned: (card: Omit<ScannedCard, 'sessionId' | 'scannedAt'>) => void
  onMarkLastProxy: () => void
  onFinish: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScannerViewfinder({
  mode,
  target,
  scannedCards,
  onCardScanned,
  onMarkLastProxy,
  onFinish,
}: ScannerViewfinderProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [lastScanTime, setLastScanTime] = useState(0)
  const [scanFeedback, setScanFeedback] = useState<string | null>(null)
  const [hashDBLoaded, setHashDBLoaded] = useState(false)
  const [cardDetected, setCardDetected] = useState(false)
  const [glareLevel, setGlareLevel] = useState(0)
  const frameBufferRef = useRef(new FrameBuffer(5))

  // Duplicate confirmation state
  const [duplicatePrompt, setDuplicatePrompt] = useState<{ match: any; imageUrl: string } | null>(null)

  // Last scanned card (for proxy toggle)
  const [lastScannedCard, setLastScannedCard] = useState<{ sessionId: number; cardName: string } | null>(null)

  // Manual card name input (fallback when hash DB isn't available)
  const [manualMode, setManualMode] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  // Guide rect (normalized coordinates of the card guide in the video frame)
  // Centered, 70% of viewport width, card aspect ratio
  const guideRect = { x: 0.15, y: 0.15, w: 0.7, h: 0.7 * (88 / 63) * 0.5 }

  // ─── Load hash database ────────────────────────────────────────

  useEffect(() => {
    loadHashDB().then(() => {
      if (isHashDBReady()) {
        setHashDBLoaded(true)
        console.log('[scanner] Hash DB loaded, auto-detection enabled, size:', getHashDBSize())
      } else {
        console.warn('[scanner] Hash DB loaded but empty — check /scan/hash-db.json')
      }
    }).catch((err) => {
      console.error('[scanner] Hash DB failed to load:', err)
    })
  }, [])

  // ─── Frame processing loop ─────────────────────────────────────

  useEffect(() => {
    if (!cameraReady || !hashDBLoaded) return

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    // Run detection every 200ms (~5 fps)
    scanLoopRef.current = setInterval(async () => {
      // Skip if we're in cooldown
      if (Date.now() - lastScanTime < SCAN_COOLDOWN_MS) return

      // Check card presence first (lightweight)
      const present = detectCardPresence(video, canvas, guideRect)
      setCardDetected(present)
      if (!present) return

      // Run full pipeline
      const result = await processFrame(video, canvas, guideRect, frameBufferRef.current)

      // Update glare level for indicator
      setGlareLevel(result.glarePercentage)

      if (result.matched && result.topMatch) {
        const match = result.topMatch.entry

        // Check if this is a consecutive duplicate (same card scanned again)
        const isDuplicate = scannedCards.some(c => c.scryfallId === match.s)
        if (isDuplicate) {
          // Show confirmation prompt instead of blocking
          if (!duplicatePrompt) {
            const imageUrl = `https://cards.scryfall.io/normal/front/${match.s.charAt(0)}/${match.s.charAt(1)}/${match.s}.jpg`
            setDuplicatePrompt({ match, imageUrl })
            setLastScanTime(Date.now())
          }
          return
        }

        // Auto-accept confident match
        const imageUrl = `https://cards.scryfall.io/normal/front/${match.s.charAt(0)}/${match.s.charAt(1)}/${match.s}.jpg`

        onCardScanned({
          cardName: match.n,
          oracleId: match.o,
          scryfallId: match.s,
          setCode: match.c,
          collectorNumber: match.r,
          isProxy: false,
          isFoil: result.isFoil,
          condition: 'near_mint',
          imageUrl,
          confidence: 'high',
        })

        setLastScanTime(Date.now())
        setScanFeedback(match.n)
        setLastScannedCard({ sessionId: scannedCards.length + 1, cardName: match.n })
        setTimeout(() => setScanFeedback(null), 2500)

        // Clear frame buffer for next card
        frameBufferRef.current.clear()

        // Audio feedback
        try {
          const ctx = new AudioContext()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.frequency.value = 800
          gain.gain.value = 0.1
          osc.start()
          osc.stop(ctx.currentTime + 0.08)
        } catch { /* audio not available */ }
      }
    }, 200)

    return () => {
      if (scanLoopRef.current) clearInterval(scanLoopRef.current)
    }
  }, [cameraReady, hashDBLoaded, lastScanTime, scannedCards, onCardScanned])

  // ─── Camera setup ──────────────────────────────────────────────

  useEffect(() => {
    let mounted = true

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })

        if (!mounted) {
          stream.getTracks().forEach(t => t.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }

        // Check torch support
        const track = stream.getVideoTracks()[0]
        const capabilities = track.getCapabilities?.() as any
        if (capabilities?.torch) {
          setTorchSupported(true)
        }

        setCameraReady(true)
      } catch (err) {
        if (!mounted) return
        const message = err instanceof Error ? err.message : 'Camera access denied'
        setCameraError(message)
      }
    }

    startCamera()

    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // ─── Torch toggle ──────────────────────────────────────────────

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] })
      setTorchOn(prev => !prev)
    } catch {
      toast.error('Torch not available on this device')
    }
  }, [torchOn])

  // ─── Manual card entry (temporary scanner) ─────────────────────

  const handleManualSearch = useCallback(async () => {
    if (!manualInput.trim()) return
    if (Date.now() - lastScanTime < SCAN_COOLDOWN_MS) {
      toast.error('Wait a moment before scanning again')
      return
    }

    setIsSearching(true)
    try {
      // Use Scryfall to resolve the card
      const res = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(manualInput.trim())}`,
        { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
      )

      if (!res.ok) {
        toast.error('Card not found — check the name and try again')
        return
      }

      const card = await res.json()

      // Check duplicate — show confirmation instead of blocking
      const isDuplicate = scannedCards.some(c => c.scryfallId === card.id)
      if (isDuplicate) {
        const imageUrl = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null
        setDuplicatePrompt({ match: { s: card.id, n: card.name, o: card.oracle_id, c: card.set, r: card.collector_number }, imageUrl: imageUrl ?? '' })
        setManualInput('')
        return
      }

      const imageUrl = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null

      onCardScanned({
        cardName: card.name,
        oracleId: card.oracle_id ?? null,
        scryfallId: card.id,
        setCode: card.set ?? null,
        collectorNumber: card.collector_number ?? null,
        isProxy: false,
        isFoil: false,
        condition: 'near_mint',
        imageUrl,
        confidence: 'verified',
      })

      setLastScanTime(Date.now())
      setScanFeedback(card.name)
      setTimeout(() => setScanFeedback(null), 1500)
      setManualInput('')

      // Play a subtle sound (if available)
      try {
        const ctx = new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 800
        gain.gain.value = 0.1
        osc.start()
        osc.stop(ctx.currentTime + 0.08)
      } catch { /* audio not available */ }

    } catch (err) {
      toast.error('Failed to look up card')
    } finally {
      setIsSearching(false)
    }
  }, [manualInput, lastScanTime, scannedCards, onCardScanned])

  // ─── Cleanup ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // ─── Render ────────────────────────────────────────────────────

  if (cameraError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[length:var(--fs-md)] text-destructive">{cameraError}</p>
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">
          Camera access is required for scanning. Please grant permission and reload.
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RotateCcw className="size-4" /> Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Camera feed area */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Hidden canvas for frame extraction */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Card guide overlay */}
        {cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Darkened area outside guide */}
            <div className="absolute inset-0 bg-black/40" />
            {/* Card-shaped cutout */}
            <div
              className={`relative rounded-xl border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] transition-colors ${
                cardDetected ? 'border-[var(--accent-primary)]' : 'border-white/60'
              }`}
              style={{
                width: '70vw',
                maxWidth: '280px',
                aspectRatio: `${CARD_ASPECT_RATIO}`,
              }}
            >
              {/* Corner indicators */}
              <div className="absolute -left-0.5 -top-0.5 h-6 w-6 rounded-tl-xl border-l-[3px] border-t-[3px] border-white" />
              <div className="absolute -right-0.5 -top-0.5 h-6 w-6 rounded-tr-xl border-r-[3px] border-t-[3px] border-white" />
              <div className="absolute -bottom-0.5 -left-0.5 h-6 w-6 rounded-bl-xl border-b-[3px] border-l-[3px] border-white" />
              <div className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-br-xl border-b-[3px] border-r-[3px] border-white" />
            </div>

            {/* Status text below guide */}
            <div className="absolute left-0 right-0" style={{ top: 'calc(50% + 35vw + 16px)', maxWidth: '100%' }}>
              <p className="text-center text-[length:var(--fs-xs)] text-white/70">
                {!hashDBLoaded ? 'Loading card database...' :
                 cardDetected ? 'Detecting card...' :
                 'Position card within the frame'}
              </p>
            </div>
          </div>
        )}

        {/* Scan feedback overlay + proxy toggle */}
        {scanFeedback && (
          <div className="absolute inset-x-0 top-1/4 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-[var(--accent-primary)] px-4 py-2 text-white shadow-lg">
              <Check className="size-4" />
              <span className="text-[length:var(--fs-sm)] font-medium">{scanFeedback}</span>
            </div>
            {lastScannedCard && (
              <button
                type="button"
                onClick={() => {
                  onMarkLastProxy()
                  toast.success('Marked as proxy')
                  setScanFeedback(null)
                }}
                className="rounded-full bg-[#489ADE]/90 px-3 py-1 text-[length:var(--fs-xs)] font-medium text-white shadow transition-all hover:bg-[#489ADE]"
              >
                Mark as Proxy
              </button>
            )}
          </div>
        )}

        {/* Duplicate confirmation prompt */}
        {duplicatePrompt && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
            <div className="mx-4 w-full max-w-sm rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-2xl">
              <p className="mb-3 text-center text-[length:var(--fs-md)] font-medium text-foreground">
                Add another copy?
              </p>
              <p className="mb-4 text-center text-[length:var(--fs-sm)] text-muted-foreground">
                {duplicatePrompt.match.n} is already in this session.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDuplicatePrompt(null)}
                  className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-2 text-[length:var(--fs-sm)] font-medium text-muted-foreground transition-colors hover:bg-white/[0.05]"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const match = duplicatePrompt.match
                    onCardScanned({
                      cardName: match.n,
                      oracleId: match.o,
                      scryfallId: match.s,
                      setCode: match.c,
                      collectorNumber: match.r,
                      isProxy: false,
                      isFoil: false,
                      condition: 'near_mint',
                      imageUrl: duplicatePrompt.imageUrl,
                      confidence: 'high',
                    })
                    toast.success(`Added another ${match.n}`)
                    setDuplicatePrompt(null)
                    setLastScanTime(Date.now())
                  }}
                  className="flex-1 rounded-lg px-3 py-2 text-[length:var(--fs-sm)] font-medium text-white transition-colors"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  Add Copy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Top controls */}
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-4">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onFinish}
            className="rounded-full bg-black/50 text-white hover:bg-black/70"
            aria-label="Finish scanning"
          >
            <X className="size-5" />
          </Button>

          <div className="flex items-center gap-2">
            <GlareIndicator glarePercentage={glareLevel} visible={hashDBLoaded && cardDetected} />
            {torchSupported && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleTorch}
                className="rounded-full bg-black/50 text-white hover:bg-black/70"
                aria-label={torchOn ? 'Turn off flash' : 'Turn on flash'}
              >
                {torchOn ? <Zap className="size-4" /> : <ZapOff className="size-4" />}
              </Button>
            )}
          </div>
        </div>

        {/* Target indicator */}
        <div className="absolute bottom-20 left-0 right-0 flex justify-center">
          <span className="rounded-full bg-black/60 px-3 py-1 text-[length:var(--fs-xs)] text-white/80">
            {target.type === 'deck' && `Adding to: ${target.deckName}`}
            {target.type === 'storage' && `Adding to: ${target.storageLocationName}`}
            {target.type === 'collection' && 'Adding to: Collection'}
          </span>
        </div>
      </div>

      {/* Bottom panel — manual input (temporary) + scanned count */}
      <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-surface)' }}>
        {/* Manual card entry (placeholder until camera recognition is built) */}
        <div className="mb-3 flex items-center gap-2">
          <input
            type="text"
            placeholder="Type card name to scan (camera recognition coming soon)..."
            value={manualInput}
            onChange={e => setManualInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleManualSearch() }}
            className="h-9 flex-1 rounded-lg border bg-transparent px-3 text-[length:var(--fs-sm)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
            style={{ borderColor: 'var(--border-emphasis)' }}
            aria-label="Card name"
          />
          <Button
            size="sm"
            onClick={handleManualSearch}
            disabled={isSearching || !manualInput.trim()}
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            {isSearching ? 'Looking...' : 'Add'}
          </Button>
        </div>

        {/* Session stats */}
        <div className="flex items-center justify-between">
          <span className="text-[length:var(--fs-sm)] text-muted-foreground">
            {scannedCards.length} card{scannedCards.length !== 1 ? 's' : ''} scanned
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onFinish}
            disabled={scannedCards.length === 0}
          >
            Review & Confirm ({scannedCards.length})
          </Button>
        </div>
      </div>
    </div>
  )
}
