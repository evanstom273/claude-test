import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { createMcpHandler } from 'agents/mcp/server'
import { defaultHandler } from './auth'
import { ALLOWED_LOGIN, type Env } from './env'
import { createServer } from './mcp'

/**
 * The art-engine Worker: the Art Studio's MCP server at /mcp, behind OAuth
 * with GitHub sign-in (one allowed account), and the studio's static site
 * everywhere else.
 */

export { ArtStore } from './store'

const ORIGIN = 'https://art-engine.evanstom273.workers.dev'

export default new OAuthProvider<Env>({
  apiRoute: '/mcp',
  apiHandler: {
    async fetch(request, env, ctx) {
      // the token can only have been issued to the allowed account, but check anyway
      const props = (ctx as ExecutionContext & { props?: { login?: string } }).props
      if (props?.login?.toLowerCase() !== ALLOWED_LOGIN.toLowerCase()) return new Response('Forbidden', { status: 403 })
      return createMcpHandler(() => createServer(env, new URL(request.url).origin))(request, env, ctx)
    },
  },
  defaultHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  clientIdMetadataDocumentEnabled: true,
  scopesSupported: ['art'],
  resourceMetadata: { resource: `${ORIGIN}/mcp`, resource_name: 'Art Studio' },
})
