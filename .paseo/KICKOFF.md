# How to work with Gene — owner cheat sheet

This file is for you, not the agents.

## Start a session
- **Kiro:** pick **gene** from the agent menu. **OpenCode:** switch to the **gene** agent.
- First message: the goal, plus "use Kiro" if you're not on OpenCode.

## Prompt templates

**Something looks wrong**
> I imported my collection. I expected to see about 100 conflicts on the reconciliation screen. Instead it said everything was reconciled. [screenshot]

**A new idea**
> When I'm building a deck, I want to see which suggested cards I already own and which I'd have to buy. It's so I don't buy cards I already have.

**What's next**
> What's next, and why? Give me your top pick and one alternative.

**Reviewing a spec or mockup**
> Mockup reviewed. Change: the Proxy chip is too loud and should sit quieter than Unowned. Everything else is approved.

**Answering an approval question**
> Approved, option A, because I'd rather see every conflict even if the list is long.
> Not yet. What would I see differently with option B?

**Something doesn't make sense**
> I don't follow. Explain it as what I'd see in the app, with an example.

**Changing priorities**
> Park the AI advisor. The import bug matters more this week.

**End of session**
> Wrap up.

## Tips
- Describe **what you did, what you expected, and what happened**. Leave the "how" to the agents.
- One goal per session. Start a new chat for the next goal.
- If a reply is too long or too technical, say "shorter" or "plain words". The rules in `AGENTS.md` require it.
- Say "use Opus" (Kiro) or "use Kimi" (OpenCode) only for hard problems.

## Fallback
If your tool has no Gene agent, paste this as the first message:

> You are the Orchestrator for the Oracle project. Read `AGENTS.md`, then `.paseo/agents/orchestrator.md`, and follow its "Read on every session start" list. Provider for this session: OpenCode.

## Cutting token usage

Tokens are what you're billed for — roughly, the amount of text read and written in a session. Longer chats, bigger files, and repeated context all cost more. None of this changes how you phrase a request; it's about session habits.

### Biggest wins
1. **New chat per goal.** Every message resends the whole conversation so far. A chat that's been going for an hour costs far more per message than a fresh one. Start a new chat for each unrelated thing you want to do.
2. **Say "Wrap up" before you stop.** This saves a short summary that the next session reads instead of every report since the start. Skipping this means the next Gene session re-reads much more to catch up.
3. **Don't paste screenshots or long text unless asked.** A screenshot is useful when something looks visually wrong. For a text-only issue, describe it in a sentence instead.
4. **Batch small requests into one message.** Three separate one-line messages cost more overhead than one message covering all three, because each message re-sends context.

### Medium wins
5. **Let Gene pick the model.** Only ask for a stronger model ("use Opus" / "use Kimi") when something is genuinely hard — a root-cause bug, a database design. The default models are cheaper and are already matched to each task.
6. **Keep review replies short.** "Approved" or "Approved, but make the chip quieter" costs less than restating the whole thing back.
7. **Don't ask for extra explanation you won't use.** Every "why" or "explain more" is a further round trip. Ask it only when you'll act on the answer.

### Set-and-forget
8. **These are already built into the rules** and need nothing from you: agents load only the reference material relevant to the task, keep replies to 1–3 sentences, and skip code/file detail unless you ask. You don't need to request this — just notice if a reply feels bloated and say "shorter."

### Rule of thumb
One session, one goal, one wrap-up. If you notice a session running long and drifting to a second topic, stop, wrap up, and start fresh for the new topic.
