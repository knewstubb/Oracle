import { redirect } from 'next/navigation'
import { isAiChatEnabled } from '@/lib/ai-chat-switch'

// The new-deck brewing chat is part of the in-app AI chat (DV-03). While paused, send visitors to Explore.
export default function NewDeckLayout({ children }: { children: React.ReactNode }) {
  if (!isAiChatEnabled()) redirect('/explore')
  return children
}
