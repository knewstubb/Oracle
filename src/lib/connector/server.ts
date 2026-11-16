// Builds one stateless MCP server per request, wired to the read tools (slice A) and the edit tools (slice B).
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { editError, errorBody } from './errors'
import { CONNECTOR_TOOLS, toJsonSchema } from './tools'
import { isBlockedToolName } from './edit-config'
import type { ToolOutput } from './tools/common'
import type { EditContext } from './user-client'

export function toToolResult(out: ToolOutput) {
  if (out.ok === false) {
    return { isError: true as const, content: [{ type: 'text' as const, text: out.error.message }], structuredContent: out as unknown as Record<string, unknown> }
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(out) }], structuredContent: out as Record<string, unknown> }
}

export async function runTool(ctx: EditContext, name: string, args: unknown): Promise<ReturnType<typeof toToolResult>> {
  // Defence in depth: a destructive-sounding name is refused even if some future code registers it.
  if (isBlockedToolName(name)) return toToolResult(editError('tool_not_allowed', 'That action is not available through this connection. Claude cannot delete or bulk-change your collection.'))
  const tool = CONNECTOR_TOOLS.find((t) => t.name === name)
  if (!tool) return toToolResult(errorBody('INVALID_INPUT', `There is no tool called "${name}".`))
  const parsed = tool.inputSchema.safeParse(args ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path.length ? issue.path.join('.') : (issue?.code === 'unrecognized_keys' ? (issue as { keys?: string[] }).keys?.join(', ') : '') || 'input'
    return toToolResult(errorBody('INVALID_INPUT', `Invalid input for ${field}: ${issue?.message ?? 'not accepted'}.`))
  }
  return toToolResult(await tool.handler(ctx, parsed.data as never))
}

export function createConnectorServer(ctx: EditContext): Server {
  const server = new Server({ name: 'oracle', version: '0.1.0' }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: CONNECTOR_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: toJsonSchema(t.inputSchema) as { type: 'object'; properties?: Record<string, unknown> },
      annotations: { ...t.annotations },
    })),
  }))
  server.setRequestHandler(CallToolRequestSchema, async (req) => runTool(ctx, req.params.name, req.params.arguments))
  return server
}
