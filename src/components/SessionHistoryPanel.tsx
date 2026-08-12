'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, Compass, Layers, MessageSquare, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOracle, type SessionType } from '@/contexts/OracleContext'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionListItem {
  id: string
  session_name: string | null
  session_type: SessionType
  status: string
  context_deck_id: number | null
  commander_name: string | null
  last_message_at: string
  message_count: number
  started_at: string
}

type TabType = 'explorations' | 'decks'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getSessionIcon(sessionType: SessionType) {
  switch (sessionType) {
    case 'exploration':
      return <Compass className="w-3.5 h-3.5 text-amber-400" />
    case 'deck':
      return <Layers className="w-3.5 h-3.5 text-emerald-400" />
    default:
      return <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
  }
}

// ---------------------------------------------------------------------------
// SessionHistoryPanel
// ---------------------------------------------------------------------------

export function SessionHistoryPanel() {
  const { isHistoryPanelOpen, closeHistoryPanel, loadSession, activeSession } = useOracle()
  const [activeTab, setActiveTab] = useState<TabType>('explorations')
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Fetch sessions when panel opens or tab changes
  useEffect(() => {
    if (!isHistoryPanelOpen) return

    const fetchSessions = async () => {
      setIsLoading(true)
      try {
        // Map tab to session types to fetch
        const types = activeTab === 'explorations' 
          ? ['exploration', 'general'] 
          : ['deck']
        
        const params = new URLSearchParams()
        params.set('types', types.join(','))
        params.set('limit', '50')
        params.set('archived', 'false')

        const res = await fetch(`/api/oracle/sessions?${params.toString()}`)
        if (res.ok) {
          const data = await res.json()
          setSessions(data.sessions ?? [])
        } else {
          console.error('[SessionHistoryPanel] Failed to fetch sessions')
          setSessions([])
        }
      } catch (err) {
        console.error('[SessionHistoryPanel] Fetch error:', err)
        setSessions([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchSessions()
  }, [isHistoryPanelOpen, activeTab])

  const handleSelectSession = useCallback((sessionId: string) => {
    loadSession(sessionId)
    // Panel closes automatically in loadSession
  }, [loadSession])

  if (!isHistoryPanelOpen) return null

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-zinc-900/98 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
        <h2 className="text-sm font-medium text-zinc-200">History</h2>
        <button
          onClick={closeHistoryPanel}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
          aria-label="Close history"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800/60">
        <button
          onClick={() => setActiveTab('explorations')}
          className={cn(
            'flex-1 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'explorations'
              ? 'text-amber-400 border-b-2 border-amber-400'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          Explorations
        </button>
        <button
          onClick={() => setActiveTab('decks')}
          className={cn(
            'flex-1 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'decks'
              ? 'text-emerald-400 border-b-2 border-emerald-400'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          Deck Conversations
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-zinc-500" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-zinc-500" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-zinc-500" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <p className="text-xs text-zinc-500">
              {activeTab === 'explorations'
                ? 'No exploration sessions yet'
                : 'No deck conversations yet'
              }
            </p>
          </div>
        ) : (
          <div className="py-1">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                isActive={session.id === activeSession?.id}
                onSelect={() => handleSelectSession(session.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SessionRow
// ---------------------------------------------------------------------------

interface SessionRowProps {
  session: SessionListItem
  isActive: boolean
  onSelect: () => void
}

function SessionRow({ session, isActive, onSelect }: SessionRowProps) {
  const displayName = session.session_name || 'Untitled conversation'
  const subtitle = session.session_type === 'deck' && session.commander_name
    ? session.commander_name
    : null

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left px-3 py-2 transition-colors',
        'hover:bg-zinc-800/60',
        isActive && 'bg-zinc-800/40'
      )}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">
          {getSessionIcon(session.session_type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-sm truncate',
              isActive ? 'text-zinc-100 font-medium' : 'text-zinc-300'
            )}>
              {displayName}
            </span>
          </div>
          {subtitle && (
            <p className="text-xs text-zinc-500 truncate mt-0.5">
              {subtitle}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-600">
            <Clock className="w-3 h-3" />
            <span>{formatRelativeTime(session.last_message_at)}</span>
            <span>·</span>
            <span>{session.message_count} messages</span>
          </div>
        </div>
      </div>
    </button>
  )
}
