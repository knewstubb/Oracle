'use client'

import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/lib/debrief-types'
import { renderMessageContent } from '@/lib/render-card-links'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OracleChatProps {
  /** Display mode: 'overlay' renders as a fixed full-screen overlay, 'inline' fills its parent */
  mode: 'inline' | 'overlay'
  /** Colour variant: 'debrief' uses teal accents (default), 'brew' uses blue accents */
  variant?: 'debrief' | 'brew'
  /** Chat messages to render */
  messages: ChatMessage[]
  /** Whether assistant is currently streaming */
  isStreaming: boolean
  /** Partially accumulated streaming text (appended after last assistant message) */
  streamingText: string
  /** Content to render in the right context panel */
  contextPanel?: React.ReactNode
  /** Callback when user submits a message */
  onSendMessage: (text: string) => void
  /** Whether the input is disabled (e.g., during analysis) */
  inputDisabled?: boolean
  /** Placeholder text for the input */
  inputPlaceholder?: string
  /** Footer content (e.g., "Done" button after session completion) */
  footer?: React.ReactNode
  /** Whether the overlay is open (overlay mode only) */
  open?: boolean
  /** Callback to close the overlay (overlay mode only) */
  onClose?: () => void
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message, variant = 'debrief' }: { message: ChatMessage; variant?: 'debrief' | 'brew' }) {
  const isUser = message.role === 'user'
  const isBrew = variant === 'brew'

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      <span className="text-[length:var(--fs-xs)] text-muted-foreground">
        {isUser ? 'You' : 'Oracle'}
      </span>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-[length:var(--fs-md)]',
          isUser
            ? isBrew
              ? 'bg-[rgba(55,138,221,0.1)] border-[0.5px] border-[rgba(55,138,221,0.2)] rounded-lg'
              : 'bg-[rgba(29,158,117,0.12)] border-[0.5px] border-[rgba(29,158,117,0.4)] rounded-lg'
            : isBrew
              ? 'bg-[rgba(255,255,255,0.06)] border-l-2 border-l-[rgba(55,138,221,0.4)]'
              : 'bg-[rgba(255,255,255,0.06)] border-l-2 border-l-[rgba(29,158,117,0.4)]'
        )}
      >
        {renderMessageContent(message.content)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Thinking Indicator (shown while streaming — hides raw tokens)
// ---------------------------------------------------------------------------

function ThinkingIndicator({ variant = 'debrief' }: { variant?: 'debrief' | 'brew' }) {
  const isBrew = variant === 'brew'
  const dotColor = isBrew ? '#378ADD' : '#1D9E75'

  return (
    <div className="flex flex-col gap-1 items-start">
      <span className="text-[length:var(--fs-xs)] text-muted-foreground">Oracle</span>
      <div className={cn(
        'inline-flex items-center gap-2 rounded-lg px-3 py-2.5 bg-[rgba(255,255,255,0.06)] border-l-2',
        isBrew ? 'border-l-[rgba(55,138,221,0.4)]' : 'border-l-[rgba(29,158,117,0.4)]'
      )}>
        <div className="flex gap-1">
          <span className="size-1.5 rounded-full animate-pulse" style={{ backgroundColor: dotColor, animationDelay: '0ms' }} />
          <span className="size-1.5 rounded-full animate-pulse" style={{ backgroundColor: dotColor, animationDelay: '150ms' }} />
          <span className="size-1.5 rounded-full animate-pulse" style={{ backgroundColor: dotColor, animationDelay: '300ms' }} />
        </div>
        <span className="text-[length:var(--fs-sm)] text-muted-foreground">Thinking...</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat Input
// ---------------------------------------------------------------------------

function ChatInput({
  onSend,
  disabled,
  placeholder,
  variant = 'debrief',
}: {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
  variant?: 'debrief' | 'brew'
}) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isBrew = variant === 'brew'

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSend])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    // Auto-height up to max 80px
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`
  }

  return (
    <div className="flex items-end gap-2 px-5 py-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder ?? 'Reply to Oracle...'}
        rows={1}
        className={cn(
          'flex-1 resize-none bg-[rgba(255,255,255,0.05)] text-[length:var(--fs-md)] text-foreground placeholder:text-[rgba(255,255,255,0.2)] outline-none min-h-[38px] max-h-[80px] py-2.5 px-3.5 rounded-lg border-[0.5px] border-[rgba(255,255,255,0.1)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
          isBrew ? 'focus:border-[rgba(55,138,221,0.4)]' : 'focus:border-[rgba(29,158,117,0.4)]'
        )}
        aria-label="Chat message input"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className={cn(
          'flex items-center justify-center w-[34px] h-[34px] rounded-md text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90',
          isBrew ? 'bg-[#378ADD]' : 'bg-[var(--color-teal)]'
        )}
      >
        <ArrowUp className="size-4" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// OracleChat Component
// ---------------------------------------------------------------------------

export function OracleChat({
  mode,
  variant = 'debrief',
  messages,
  isStreaming,
  streamingText,
  contextPanel,
  onSendMessage,
  inputDisabled,
  inputPlaceholder,
  footer,
  open,
  onClose,
}: OracleChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive or streaming text updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // Escape key closes overlay mode
  useEffect(() => {
    if (mode !== 'overlay' || !open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mode, open, onClose])

  // Focus trap for overlay mode
  useEffect(() => {
    if (mode !== 'overlay' || !open || !containerRef.current) return

    const container = containerRef.current
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusables = container.querySelectorAll<HTMLElement>(focusableSelector)
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleTab)

    // Focus the first focusable element on open
    const firstFocusable = container.querySelector<HTMLElement>(focusableSelector)
    firstFocusable?.focus()

    return () => document.removeEventListener('keydown', handleTab)
  }, [mode, open])

  // In overlay mode, don't render if not open
  if (mode === 'overlay' && !open) return null

  const isOverlay = mode === 'overlay'

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full',
        isOverlay && 'fixed inset-0 z-50 backdrop-blur-sm bg-black/60'
      )}
      role={isOverlay ? 'dialog' : undefined}
      aria-modal={isOverlay ? true : undefined}
      aria-label="Oracle Chat"
    >
      {/* Left panel — conversation thread + input */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Close button (overlay only) */}
        {isOverlay && onClose && (
          <div className="flex justify-end p-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Oracle Chat"
              className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-[rgba(255,255,255,0.06)] transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Scrollable message thread */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[640px] px-5 py-5 space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} variant={variant} />
            ))}
            {isStreaming && (
              <ThinkingIndicator variant={variant} />
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Anchored text input */}
        <div className="border-t border-[rgba(255,255,255,0.06)]">
          <div className="mx-auto max-w-[640px]">
            <ChatInput
              onSend={onSendMessage}
              disabled={inputDisabled}
              placeholder={inputPlaceholder}
              variant={variant}
            />
          </div>
        </div>

        {/* Optional footer */}
        {footer && (
          <div className="px-4 py-2 border-t border-[rgba(255,255,255,0.06)]">
            {footer}
          </div>
        )}
      </div>

      {/* Right panel — context (260px fixed width) */}
      <div className="w-[260px] shrink-0 border-l border-[rgba(255,255,255,0.06)] overflow-y-auto">
        {contextPanel}
      </div>
    </div>
  )
}
