import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import type { ArtStore } from './store'

/** Bindings and secrets for the art-engine Worker (see wrangler.jsonc). */
export interface Env {
  ASSETS: Fetcher
  ART_STORE: DurableObjectNamespace<ArtStore>
  OAUTH_KV: KVNamespace
  OAUTH_PROVIDER: OAuthHelpers
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
}

/** The only GitHub account allowed in. */
export const ALLOWED_LOGIN = 'evanstom273'

/** The single store everything lives in. */
export const store = (env: Env) => env.ART_STORE.get(env.ART_STORE.idFromName('main'))
