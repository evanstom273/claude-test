import { AuthorizationError, authorizationErrorRedirect, CimdFetchError, type ConsentDescription } from '@cloudflare/workers-oauth-provider'
import { ALLOWED_LOGIN, type Env } from './env'
import { serveExport } from './export'

/**
 * Signing in: MCP clients (Claude) are sent here, the user approves on a
 * consent page, signs in with GitHub, and only the allowed account gets
 * through. Everything else on the site is the studio's static files.
 */

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function page(title: string, body: string, status = 200, headers = new Headers()) {
  headers.set('Content-Type', 'text/html; charset=utf-8')
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#16161a;color:#ececf1;font:16px system-ui,sans-serif}main{max-width:420px;padding:28px;margin:16px;border:1px solid #2e2e36;border-radius:16px;background:#1f1f25}h1{font-size:20px;margin:0 0 12px}p{color:#b8b8c4;line-height:1.5}.warn{color:#ffd23a}button{font:inherit;padding:10px 18px;border-radius:10px;border:0;cursor:pointer;margin-right:8px}.yes{background:#ececf1;color:#16161a;font-weight:700}.no{background:#2a2a32;color:#ececf1}</style></head>
<body><main>${body}</main></body></html>`,
    { status, headers },
  )
}

function consentPage(d: ConsentDescription, handle: string, headers: Headers) {
  const who = d.clientDomain ? `Published by <strong>${esc(d.clientDomain)}</strong>.` : 'This app registered itself; its name is not verified.'
  return page(
    'Connect to the Art Studio',
    `<h1>Let ${esc(d.clientName)} use your Art Studio?</h1>
<p>${who} Access will be sent to <strong>${esc(d.redirectHost)}</strong>.</p>
${d.redirectIsLoopback ? '<p class="warn">This sends access to an app on your computer. Continue only if you just started connecting from it.</p>' : ''}
<p>It will be able to read, create, change and delete your artwork. You'll sign in with GitHub next.</p>
<form method="post"><input type="hidden" name="handle" value="${esc(handle)}">
<button class="yes" name="decision" value="approve">Allow</button><button class="no" name="decision" value="deny">Deny</button></form>`,
    200,
    headers,
  )
}

const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

async function githubRedirect(env: Env, req: Request, state: string, verifier: string) {
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const u = new URL('https://github.com/login/oauth/authorize')
  u.searchParams.set('client_id', env.GITHUB_CLIENT_ID)
  u.searchParams.set('redirect_uri', `${new URL(req.url).origin}/callback`)
  u.searchParams.set('scope', 'read:user')
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', challenge)
  u.searchParams.set('code_challenge_method', 'S256')
  u.searchParams.set('allow_signup', 'false')
  return u.toString()
}

/** Start the GitHub sign-in for an approved request. */
async function toGithub(env: Env, req: Request, request: Parameters<Env['OAUTH_PROVIDER']['beginUpstream']>[0], headers?: Headers) {
  const verifier = crypto.randomUUID() + crypto.randomUUID()
  const up = await env.OAUTH_PROVIDER.beginUpstream(request, { data: { verifier }, headers })
  up.headers.set('Location', await githubRedirect(env, req, up.state, verifier))
  return new Response(null, { status: 302, headers: up.headers })
}

async function authorize(req: Request, env: Env) {
  const oauth = env.OAUTH_PROVIDER
  if (req.method === 'GET') {
    const request = await oauth.parseAuthRequest(req)
    const details = await oauth.describeConsent(request)
    const consent = await oauth.beginConsent(request)
    return consentPage(details, consent.handle, consent.headers)
  }
  const form = await req.formData()
  const handle = String(form.get('handle') ?? '')
  if (form.get('decision') !== 'approve') {
    const denied = await oauth.denyConsent(req, handle)
    return new Response(null, { status: 302, headers: denied.headers })
  }
  const approved = await oauth.approveConsent(req, handle, { scope: ['art'] })
  return toGithub(env, req, approved.request, approved.headers)
}

async function callback(req: Request, env: Env) {
  const oauth = env.OAUTH_PROVIDER
  const url = new URL(req.url)
  const { request, data, headers } = await oauth.finishUpstream<{ verifier: string }>(req)
  if (url.searchParams.get('error')) {
    headers.set('Location', authorizationErrorRedirect(request, 'access_denied'))
    return new Response(null, { status: 302, headers })
  }
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: url.searchParams.get('code') ?? '',
      redirect_uri: `${url.origin}/callback`,
      code_verifier: data.verifier,
    }),
  })
  const token = (await tokenRes.json()) as { access_token?: string; error_description?: string }
  if (!token.access_token) return page('Sign-in failed', `<h1>GitHub sign-in failed</h1><p>${esc(token.error_description ?? 'No access token came back.')}</p>`, 502)
  const userRes = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'art-engine', Accept: 'application/vnd.github+json' } })
  const user = (await userRes.json()) as { login?: string; id?: number }
  if (!user.login || user.login.toLowerCase() !== ALLOWED_LOGIN.toLowerCase()) {
    return page('Not allowed', `<h1>This studio is private</h1><p>The GitHub account <strong>${esc(user.login ?? 'unknown')}</strong> isn't allowed to use it.</p>`, 403)
  }
  const { redirectTo } = await oauth.completeAuthorization({
    request,
    userId: user.login,
    metadata: { github_id: user.id },
    scope: ['art'],
    // we only needed GitHub to know who it is; its token isn't kept
    props: { login: user.login },
  })
  headers.set('Location', redirectTo)
  return new Response(null, { status: 302, headers })
}

/** Everything that isn't the MCP endpoint or the OAuth token machinery, including export downloads. */
export const defaultHandler: ExportedHandler<Env> = {
  async fetch(req, env) {
    const path = new URL(req.url).pathname
    try {
      if (path === '/authorize') return await authorize(req, env)
      if (path === '/callback') return await callback(req, env)
      if (path.startsWith('/export/')) return await serveExport(req, env)
    } catch (e) {
      if (e instanceof AuthorizationError && e.redirectTo) return Response.redirect(e.redirectTo, 302)
      if (e instanceof AuthorizationError || e instanceof CimdFetchError) {
        const msg = e instanceof AuthorizationError ? e.description : 'This app could not be verified.'
        return page('Sign-in problem', `<h1>Something went wrong</h1><p>${esc(msg ?? 'The sign-in request was not valid.')}</p><p>Start connecting again from Claude.</p>`, 400)
      }
      throw e
    }
    return env.ASSETS.fetch(req)
  },
}
