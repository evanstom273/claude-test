/**
 * The art-engine Worker. For now it just serves the built studio; the MCP
 * server (and its GitHub sign-in) will be added here.
 */

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request)
  },
}
