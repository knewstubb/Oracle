// ---------------------------------------------------------------------------
// DeepSeek Adapter — Native Streamed Tool-Call Argument Assembly (T-34)
// ---------------------------------------------------------------------------
// Scope: regression coverage for the native tool-call argument duplication
// defect only. Each provider arguments delta must be appended exactly once,
// even when the first delta already carries id + name + a nonempty
// arguments fragment. Existing valid streaming/non-streaming call modes must
// be preserved. This does not cover DSML handling, S1/S2 owner gates, S3's
// full terminal-error protocol, or tool dispatch.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StreamChunk, StreamingParams, ConversationMessage } from '../provider-adapter'

// ---------------------------------------------------------------------------
// Mock the OpenAI SDK so no live network/model call is ever made.
// ---------------------------------------------------------------------------

const createMock = vi.fn()

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: createMock,
        },
      }
    },
  }
})

// Import after the mock is registered so the adapter picks up the mock class.
const { DeepSeekAdapter } = await import('./deepseek-adapter')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolCallDelta = {
  index: number
  id?: string
  function?: { name?: string; arguments?: string }
}

/** Minimal OpenAI-shaped streaming chunk, with only the fields the adapter reads. */
function makeChunk(delta: { content?: string; tool_calls?: ToolCallDelta[] }, usage?: { prompt_tokens: number; completion_tokens: number }) {
  return {
    choices: [{ delta }],
    usage,
  }
}

/** Wraps an array of fake chunks as the async iterable the adapter consumes. */
function fakeStream(chunks: ReturnType<typeof makeChunk>[]): AsyncIterable<ReturnType<typeof makeChunk>> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0
      return {
        next(): Promise<IteratorResult<ReturnType<typeof makeChunk>>> {
          if (i < chunks.length) {
            return Promise.resolve({ value: chunks[i++], done: false })
          }
          return Promise.resolve({ value: undefined, done: true })
        },
      }
    },
  }
}

const baseParams: StreamingParams = {
  model: 'deepseek-chat',
  system: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'test' } as ConversationMessage],
  tools: [],
  maxTokens: 1024,
}

async function collect(adapter: InstanceType<typeof DeepSeekAdapter>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of adapter.sendMessageStreaming!(baseParams)) {
    chunks.push(chunk)
  }
  return chunks
}

beforeEach(() => {
  createMock.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeepSeekAdapter native streamed tool-call argument assembly', () => {
  it('accumulates a complete-JSON first delta exactly once (regression: no duplication)', async () => {
    const args = '{"cardName":"Sol Ring"}'
    createMock.mockResolvedValue(
      fakeStream([
        makeChunk({
          tool_calls: [{ index: 0, id: 'call_1', function: { name: 'lookup_card', arguments: args } }],
        }),
        makeChunk({}, { prompt_tokens: 10, completion_tokens: 5 }),
      ])
    )

    const adapter = new DeepSeekAdapter('fake-key')
    const chunks = await collect(adapter)

    const done = chunks.find((c) => c.type === 'done')
    expect(done).toBeDefined()
    const message = (done as Extract<StreamChunk, { type: 'done' }>).message
    expect(message.toolCalls).toHaveLength(1)
    expect(message.toolCalls[0].arguments).toEqual({ cardName: 'Sol Ring' })

    // Each supplied fragment is emitted exactly once as a tool_call_delta.
    const deltas = chunks.filter((c) => c.type === 'tool_call_delta')
    expect(deltas).toHaveLength(1)
    expect((deltas[0] as Extract<StreamChunk, { type: 'tool_call_delta' }>).argumentsDelta).toBe(args)

    // start/end/done relationship preserved
    expect(chunks.filter((c) => c.type === 'tool_call_start')).toHaveLength(1)
    expect(chunks.filter((c) => c.type === 'tool_call_end')).toHaveLength(1)
  })

  it('accumulates a partial first fragment plus subsequent pieces without duplication', async () => {
    createMock.mockResolvedValue(
      fakeStream([
        makeChunk({
          tool_calls: [{ index: 0, id: 'call_1', function: { name: 'lookup_card', arguments: '{"cardN' } }],
        }),
        makeChunk({
          tool_calls: [{ index: 0, function: { arguments: 'ame":"Sol ' } }],
        }),
        makeChunk({
          tool_calls: [{ index: 0, function: { arguments: 'Ring"}' } }],
        }),
        makeChunk({}),
      ])
    )

    const adapter = new DeepSeekAdapter('fake-key')
    const chunks = await collect(adapter)
    const done = chunks.find((c) => c.type === 'done') as Extract<StreamChunk, { type: 'done' }>

    expect(done.message.toolCalls).toHaveLength(1)
    expect(done.message.toolCalls[0].arguments).toEqual({ cardName: 'Sol Ring' })

    const deltas = chunks.filter((c) => c.type === 'tool_call_delta') as Extract<StreamChunk, { type: 'tool_call_delta' }>[]
    expect(deltas.map((d) => d.argumentsDelta)).toEqual(['{"cardN', 'ame":"Sol ', 'Ring"}'])
  })

  it('handles a header-only first delta followed by arguments (existing valid mode preserved)', async () => {
    createMock.mockResolvedValue(
      fakeStream([
        makeChunk({
          tool_calls: [{ index: 0, id: 'call_1', function: { name: 'lookup_card' } }],
        }),
        makeChunk({
          tool_calls: [{ index: 0, function: { arguments: '{"cardName":"Sol Ring"}' } }],
        }),
        makeChunk({}),
      ])
    )

    const adapter = new DeepSeekAdapter('fake-key')
    const chunks = await collect(adapter)
    const done = chunks.find((c) => c.type === 'done') as Extract<StreamChunk, { type: 'done' }>

    expect(done.message.toolCalls).toHaveLength(1)
    expect(done.message.toolCalls[0].arguments).toEqual({ cardName: 'Sol Ring' })

    const deltas = chunks.filter((c) => c.type === 'tool_call_delta')
    expect(deltas).toHaveLength(1)
  })

  it('preserves stable indices/IDs for two interleaved calls', async () => {
    createMock.mockResolvedValue(
      fakeStream([
        makeChunk({
          tool_calls: [{ index: 0, id: 'call_1', function: { name: 'lookup_card', arguments: '{"a":' } }],
        }),
        makeChunk({
          tool_calls: [{ index: 1, id: 'call_2', function: { name: 'check_price', arguments: '{"b":' } }],
        }),
        makeChunk({
          tool_calls: [{ index: 0, function: { arguments: '1}' } }],
        }),
        makeChunk({
          tool_calls: [{ index: 1, function: { arguments: '2}' } }],
        }),
        makeChunk({}),
      ])
    )

    const adapter = new DeepSeekAdapter('fake-key')
    const chunks = await collect(adapter)
    const done = chunks.find((c) => c.type === 'done') as Extract<StreamChunk, { type: 'done' }>

    expect(done.message.toolCalls).toHaveLength(2)
    const byId = Object.fromEntries(done.message.toolCalls.map((tc) => [tc.id, tc]))
    expect(byId['call_1'].name).toBe('lookup_card')
    expect(byId['call_1'].arguments).toEqual({ a: 1 })
    expect(byId['call_2'].name).toBe('check_price')
    expect(byId['call_2'].arguments).toEqual({ b: 2 })

    // Each call gets its own start/end pair, not merged or dropped.
    expect(chunks.filter((c) => c.type === 'tool_call_start')).toHaveLength(2)
    expect(chunks.filter((c) => c.type === 'tool_call_end')).toHaveLength(2)
  })

  it('parses an empty-argument object call correctly', async () => {
    createMock.mockResolvedValue(
      fakeStream([
        makeChunk({
          tool_calls: [{ index: 0, id: 'call_1', function: { name: 'refresh_context', arguments: '{}' } }],
        }),
        makeChunk({}),
      ])
    )

    const adapter = new DeepSeekAdapter('fake-key')
    const chunks = await collect(adapter)
    const done = chunks.find((c) => c.type === 'done') as Extract<StreamChunk, { type: 'done' }>

    expect(done.message.toolCalls).toHaveLength(1)
    expect(done.message.toolCalls[0].arguments).toEqual({})
  })

  it('mixes normal text deltas with a tool call without cross-contamination', async () => {
    createMock.mockResolvedValue(
      fakeStream([
        makeChunk({ content: 'Let me check that for you. ' }),
        makeChunk({
          tool_calls: [{ index: 0, id: 'call_1', function: { name: 'lookup_card', arguments: '{"cardName":"Sol Ring"}' } }],
        }),
        makeChunk({}),
      ])
    )

    const adapter = new DeepSeekAdapter('fake-key')
    const chunks = await collect(adapter)
    const done = chunks.find((c) => c.type === 'done') as Extract<StreamChunk, { type: 'done' }>

    expect(done.message.textContent).toContain('Let me check that for you.')
    expect(done.message.toolCalls).toHaveLength(1)
    expect(done.message.toolCalls[0].arguments).toEqual({ cardName: 'Sol Ring' })

    const textDeltas = chunks.filter((c) => c.type === 'text_delta')
    expect(textDeltas.length).toBeGreaterThan(0)
  })

  it('leaves valid non-streaming normalization unchanged', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'lookup_card', arguments: '{"cardName":"Sol Ring"}' },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 6 },
    })

    const adapter = new DeepSeekAdapter('fake-key')
    const result = await adapter.sendMessage({
      model: 'deepseek-chat',
      system: 'You are a helpful assistant.',
      messages: [{ role: 'user', content: 'test' } as ConversationMessage],
      tools: [],
      maxTokens: 1024,
    })

    expect(result.wantsToolUse).toBe(true)
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].arguments).toEqual({ cardName: 'Sol Ring' })
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 6 })
  })
})
