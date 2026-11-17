'use client'

import { useId } from 'react'
import { CircleAlert, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { connectorAddress } from './connector-address'

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(done)
  } catch {
    toast("Couldn't copy. Select the text and copy it yourself.")
  }
}

function CopyBlock({ label, text, button, done }: { label: string; text: string; button: string; done: string }) {
  const id = useId()
  return (
    <div className="mt-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
      <p id={id} className="text-[length:var(--fs-xs)] text-[var(--text-secondary)]">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <code
          tabIndex={0}
          aria-labelledby={id}
          data-testid="copy-text"
          className="min-w-0 flex-1 select-all break-all rounded bg-[var(--bg-base)] px-2 py-2 text-[length:var(--fs-sm)] text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-white"
        >
          {text}
        </code>
        <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => copyText(text, done)}>
          <Copy className="size-4" aria-hidden="true" />
          {button}
        </Button>
      </div>
    </div>
  )
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="mt-1 list-decimal space-y-1.5 pl-5">{children}</ol>
}

export function SetupGuideTab() {
  const address = connectorAddress()
  const command = `claude mcp add --transport http oracle ${address}`
  return (
    <div className="space-y-4" data-testid="setup-guide">
      <div role="note" className="flex items-start gap-2 rounded-lg border border-[var(--border-default)] p-3 text-[length:var(--fs-sm)] text-[var(--text-primary)]">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Adding a connector from the phone app is still in beta, so it&apos;s easiest to start on the web or desktop. Once it&apos;s added, it shows up on your phone.
        </p>
      </div>

      <section aria-labelledby="addr-h" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
        <h3 id="addr-h" className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)]">Oracle&apos;s connector address</h3>
        <p className="mt-1 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">You will paste this into Claude in the steps below.</p>
        <CopyBlock label="Connector address" text={address} button="Copy address" done="Address copied" />
      </section>

      <Accordion defaultValue={['web']} multiple className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4">
        <AccordionItem value="web">
          <AccordionTrigger>Claude on the web</AccordionTrigger>
          <AccordionContent>
            <Steps>
              <li>Open Claude in your browser and sign in.</li>
              <li>Go to Customize, then Connectors.</li>
              <li>Choose &quot;Add&quot;, then &quot;Add custom connector&quot;.</li>
              <li>Type a name, for example Oracle, and paste the address from above. Choose &quot;Continue&quot;.</li>
              <li>Leave the sign-in choices as Claude suggests and choose &quot;Add&quot;.</li>
              <li>Claude opens Oracle&apos;s page. Sign in to Oracle and choose &quot;Sign in and allow&quot;.</li>
              <li>In a new chat, tap the &quot;+&quot; button, choose Connectors, and make sure Oracle is switched on for that chat.</li>
            </Steps>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="desktop">
          <AccordionTrigger>Claude desktop app</AccordionTrigger>
          <AccordionContent>
            <Steps>
              <li>Open the Claude desktop app and sign in.</li>
              <li>Go to Customize, then Connectors.</li>
              <li>Choose &quot;Add&quot;, then &quot;Add custom connector&quot;.</li>
              <li>Type a name, for example Oracle, and paste the address from above. Choose &quot;Continue&quot;, then &quot;Add&quot;.</li>
              <li>Your browser opens Oracle&apos;s page. Sign in to Oracle and choose &quot;Sign in and allow&quot;.</li>
              <li>In a new chat, use the &quot;+&quot; button, choose Connectors, and switch Oracle on.</li>
            </Steps>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="phone">
          <AccordionTrigger>Claude on your phone</AccordionTrigger>
          <AccordionContent>
            <Steps>
              <li>First add Oracle on the web or the desktop app, using the steps above.</li>
              <li>Open the Claude app on your phone and sign in to the same Claude account.</li>
              <li>Start a chat, tap the &quot;+&quot; button, choose Connectors, and switch Oracle on.</li>
              <li>Ask Claude about your decks. For example: &quot;Which of my decks is missing cards?&quot;</li>
            </Steps>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="code">
          <AccordionTrigger>Claude Code</AccordionTrigger>
          <AccordionContent>
            <p>If you use Claude Code in a terminal, run this one line, then follow the sign-in prompt Claude Code shows.</p>
            <CopyBlock label="Command" text={command} button="Copy command" done="Command copied" />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <p className="text-[length:var(--fs-sm)] text-[var(--text-primary)]">
        Claude can build a whole deck in one request. Each request has a single Undo in Recent changes, for 7 days, however many cards it holds. Requests over 120 cards wait for your yes.
      </p>

      <p className="text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
        Claude&apos;s menus change from time to time. If a step looks different, look for &quot;connectors&quot; in Claude&apos;s settings.
      </p>
    </div>
  )
}
