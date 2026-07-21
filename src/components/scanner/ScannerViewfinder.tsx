'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Zap, ZapOff, RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { computeGlarePercentage } from '@/lib/scanner/frame-buffer'
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
  const [cardDetected, setCardDetected] = useState(false)
  const [glareLevel, setGlareLevel] = useState(0)

  // Suggestion prompt — shown after OCR capture
  const [suggestionPrompt, setSuggestionPrompt] = useState<{ match: any; imageUrl: string } | null>(null)

  // Duplicate confirmation state
  const [duplicatePrompt, setDuplicatePrompt] = useState<{ match: any; imageUrl: string } | null>(null)

  // Last scanned card (for proxy toggle)
  const [lastScannedCard, setLastScannedCard] = useState<{ sessionId: number; cardName: string } | null>(null)

  // Screen flash on successful scan
  const [showFlash, setShowFlash] = useState(false)

  // Manual card name input (fallback when hash DB isn't available)
  const [manualMode, setManualMode] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  // Guide rect — center crop of the video frame
  // On mobile, the card fills most of the center of the frame
  // Use a generous center crop (60% width, 70% height, centered)
  const guideRect = { x: 0.2, y: 0.1, w: 0.6, h: 0.7 }

  // Debug state (visible on screen)
  const [debugInfo, setDebugInfo] = useState('')

  // ─── Load hash database ────────────────────────────────────────
  // NOTE: Hash DB disabled — dHash matching doesn't work from camera.
  // Scanner uses OCR capture instead. Debug shows "Ready" immediately.

  useEffect(() => {
    setDebugInfo('Ready — tap shutter to scan')
  }, [])

  // ─── Frame processing loop ─────────────────────────────────────
  // NOTE: dHash auto-matching disabled — produces d=14 with wrong cards.
  // Scanner now uses OCR (tap-to-capture) instead. This effect only
  // handles glare monitoring.

  useEffect(() => {
    if (!cameraReady) return

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    // Run glare monitoring at low frequency (1fps)
    scanLoopRef.current = setInterval(() => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return

      const vw = video.videoWidth
      const vh = video.videoHeight
      if (vw === 0 || vh === 0) return

      canvas.width = vw
      canvas.height = vh
      ctx.drawImage(video, 0, 0, vw, vh)

      // Extract guide region for glare check
      const gx = Math.round(guideRect.x * vw)
      const gy = Math.round(guideRect.y * vh)
      const gw = Math.round(guideRect.w * vw)
      const gh = Math.round(guideRect.h * vh)
      const guideImage = ctx.getImageData(gx, gy, Math.max(gw, 1), Math.max(gh, 1))

      const glare = computeGlarePercentage(guideImage)
      setGlareLevel(glare)
    }, 1000)

    return () => {
      if (scanLoopRef.current) clearInterval(scanLoopRef.current)
    }
  }, [cameraReady])

  // ─── OCR Capture ───────────────────────────────────────────────

  const [isCapturing, setIsCapturing] = useState(false)
  const [ocrDebugText, setOcrDebugText] = useState('')

  const handleCapture = useCallback(async () => {
    if (isCapturing) return
    if (Date.now() - lastScanTime < SCAN_COOLDOWN_MS) return

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    setIsCapturing(true)
    setDebugInfo('Capturing...')

    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return

      const vw = video.videoWidth
      const vh = video.videoHeight
      canvas.width = vw
      canvas.height = vh
      ctx.drawImage(video, 0, 0, vw, vh)

      // Extract the guide region (card area)
      const gx = Math.round(guideRect.x * vw)
      const gy = Math.round(guideRect.y * vh)
      const gw = Math.round(guideRect.w * vw)
      const gh = Math.round(guideRect.h * vh)
      const cardImage = ctx.getImageData(gx, gy, Math.max(gw, 1), Math.max(gh, 1))

      // Extract the title region (top ~4-12% of the card, inset from edges)
      const titleX = Math.round(cardImage.width * 0.08)
      const titleY = Math.round(cardImage.height * 0.03)
      const titleW = Math.round(cardImage.width * 0.75)
      const titleH = Math.round(cardImage.height * 0.07)

      // Draw title region to canvas for base64 export
      canvas.width = titleW
      canvas.height = titleH
      const titleData = new ImageData(titleW, titleH)
      for (let y = 0; y < titleH; y++) {
        for (let x = 0; x < titleW; x++) {
          const srcIdx = ((titleY + y) * cardImage.width + (titleX + x)) * 4
          const dstIdx = (y * titleW + x) * 4
          titleData.data[dstIdx] = cardImage.data[srcIdx]
          titleData.data[dstIdx + 1] = cardImage.data[srcIdx + 1]
          titleData.data[dstIdx + 2] = cardImage.data[srcIdx + 2]
          titleData.data[dstIdx + 3] = 255
        }
      }
      ctx.putImageData(titleData, 0, 0)

      // Convert to base64
      const titleBase64 = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')

      setDebugInfo('Sending to OCR...')

      // Call OCR API with the title region
      const res = await fetch('/api/scan/ocr-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: titleBase64 }),
      })

      if (!res.ok) {
        setDebugInfo('OCR failed — try manual entry')
        toast.error('Could not read card name. Try the manual text input.')
        return
      }

      const data = await res.json()
      const cardName = data.card_name

      if (!cardName) {
        setDebugInfo('No text detected — try again')
        toast.error('Could not read card name. Hold card steady and try again.')
        return
      }

      setDebugInfo(`OCR: "${cardName}"`)

      // Resolve via Scryfall fuzzy match
      const scryfallRes = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`,
        { headers: { 'User-Agent': 'TheOracle/0.1.0' } }
      )

      if (!scryfallRes.ok) {
        setDebugInfo(`Not found: "${cardName}"`)
        toast.error(`Card not found: "${cardName}". Try manual entry.`)
        return
      }

      const card = await scryfallRes.json()
      const imageUrl = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null

      // Show suggestion prompt for confirmation
      setSuggestionPrompt({
        match: {
          n: card.name,
          o: card.oracle_id,
          s: card.id,
          c: card.set,
          r: card.collector_number,
        },
        imageUrl: imageUrl ?? '',
      })
      setDebugInfo(`Found: ${card.name}`)

    } catch (err) {
      setDebugInfo('Error — try manual entry')
      toast.error('Capture failed. Try the manual text input.')
    } finally {
      setIsCapturing(false)
    }
  }, [isCapturing, lastScanTime, onCardScanned, scannedCards])

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
      setShowFlash(true)
      setTimeout(() => setShowFlash(false), 150)
      setTimeout(() => setScanFeedback(null), 2500)
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

        {/* Screen flash on successful scan */}
        {showFlash && (
          <div className="absolute inset-0 z-20 bg-white/30 pointer-events-none" />
        )}

        {/* Card guide overlay */}
        {cameraReady && (
          <div className="absolute inset-0 flex items-start justify-center pt-[15vh]">
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

        {/* Suggestion confirmation prompt — semi-auto matching */}
        {suggestionPrompt && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
            <div className="mx-4 w-full max-w-sm rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-2xl">
              <p className="mb-3 text-center text-[length:var(--fs-md)] font-medium text-foreground">
                Is this your card?
              </p>
              <p className="mb-3 text-center text-[length:var(--fs-lg)] font-semibold text-foreground">
                {suggestionPrompt.match.n}
              </p>
              {/* Card image preview */}
              <div className="mb-4 flex justify-center">
                <img
                  src={suggestionPrompt.imageUrl}
                  alt={suggestionPrompt.match.n}
                  className="h-48 rounded-lg shadow-lg"
                  style={{ aspectRatio: '5/7' }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSuggestionPrompt(null)
                    // Reset cooldown so scanning resumes immediately
                    setLastScanTime(0)
                  }}
                  className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-2 text-[length:var(--fs-sm)] font-medium text-muted-foreground transition-colors hover:bg-white/[0.05]"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const match = suggestionPrompt.match
                    onCardScanned({
                      cardName: match.n,
                      oracleId: match.o,
                      scryfallId: match.s,
                      setCode: match.c,
                      collectorNumber: match.r,
                      isProxy: false,
                      isFoil: false,
                      condition: 'near_mint',
                      imageUrl: suggestionPrompt.imageUrl,
                      confidence: 'medium',
                    })
                    setSuggestionPrompt(null)
                    setLastScanTime(Date.now())
                    setScanFeedback(match.n)
                    setShowFlash(true)
                    setTimeout(() => setShowFlash(false), 150)
                    setTimeout(() => setScanFeedback(null), 2500)
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
                  }}
                  className="flex-1 rounded-lg px-3 py-2 text-[length:var(--fs-sm)] font-medium text-white transition-colors"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  Yes
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
            <GlareIndicator glarePercentage={glareLevel} visible={cameraReady} />
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

        {/* Target indicator — moved to top area */}
        <div className="absolute left-0 right-0 top-16 flex justify-center">
          <span className="rounded-full bg-black/60 px-3 py-1 text-[length:var(--fs-xs)] text-white/80">
            {target.type === 'deck' && `Adding to: ${target.deckName}`}
            {target.type === 'storage' && `Adding to: ${target.storageLocationName}`}
            {target.type === 'collection' && 'Adding to: Collection'}
          </span>
        </div>

        {/* Capture button — centered bottom of camera view */}
        <div className="absolute bottom-16 left-0 right-0 flex justify-center">
          <button
            type="button"
            onClick={handleCapture}
            disabled={isCapturing || !cameraReady}
            className="flex size-16 items-center justify-center rounded-full border-4 border-white bg-white/20 shadow-lg transition-all active:scale-90 disabled:opacity-50"
            aria-label="Capture card"
          >
            <div className={`size-12 rounded-full ${isCapturing ? 'bg-yellow-400 animate-pulse' : 'bg-white'}`} />
          </button>
        </div>

        {/* Debug info */}
        <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1">
          <pre className="text-[10px] font-mono leading-tight text-green-400 whitespace-pre-wrap">{debugInfo}</pre>
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
