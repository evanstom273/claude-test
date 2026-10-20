import { createMcpHandler } from 'agents/mcp/server'
import type { Env } from './env'
import { serveExport } from './export'
import { createServer } from './mcp'

/**
 * Local testing only (npm run dev:worker): the MCP tools at /mcp with no
 * sign-in. Never deployed; wrangler.jsonc points at index.ts.
 */

export { ArtStore } from './store'

export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith('/export/')) return serveExport(request, env)
    return createMcpHandler(() => createServer(env, new URL(request.url).origin))(request, env, ctx)
  },
} satisfies ExportedHandler<Env>
