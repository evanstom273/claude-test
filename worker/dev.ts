import { createMcpHandler } from 'agents/mcp/server'
import type { Env } from './env'
import { createServer } from './mcp'

/**
 * Local testing only (npm run dev:worker): the MCP tools at /mcp with no
 * sign-in. Never deployed; wrangler.jsonc points at index.ts.
 */

export { ArtStore } from './store'

export default {
  fetch(request, env, ctx) {
    return createMcpHandler(() => createServer(env))(request, env, ctx)
  },
} satisfies ExportedHandler<Env>
