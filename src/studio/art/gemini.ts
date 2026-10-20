import { addUsage, clearUsage, getAiSettings, putAiSettings, usageTotals, type AiSettings, type ModelFamily, type Thinking } from './store'

/**
 * Talks to the Gemini API straight from the browser, with the key stored on
 * this device. The key is never part of the site's code.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta'

/** The only two models on offer. The exact id is looked up from the key's model list. */
export const FAMILIES: Record<ModelFamily, { label: string; short: string; match: RegExp; fallback: string }> = {
  lite: { label: 'Gemini 3.1 Flash-Lite', short: '3.1 Flash-Lite', match: /^gemini-3\.1-flash-lite/i, fallback: 'gemini-3.1-flash-lite' },
  flash: { label: 'Gemini 3.8 Flash', short: '3.8 Flash', match: /^gemini-3\.8-flash(?!-lite)/i, fallback: 'gemini-3.8-flash' },
}

/** Models that refused a thinking level this session, so it isn't sent again. */
const noThinking = new Set<string>()

/** Model ids found for this key, cached for the session. */
const resolved: Partial<Record<ModelFamily, string>> = {}

export async function resolveModels(apiKey: string) {
  const res = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } })
  if (!res.ok) throw new Error(await errorText(res))
  const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  const ids = (data.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
  const found: Partial<Record<ModelFamily, string>> = {}
  for (const f of Object.keys(FAMILIES) as ModelFamily[]) {
    // prefer the stable id over previews and experiments, then the shortest name
    const c = ids.filter((id) => FAMILIES[f].match.test(id)).sort((a, b) => Number(/preview|exp/i.test(a)) - Number(/preview|exp/i.test(b)) || a.length - b.length)
    if (c[0]) found[f] = resolved[f] = c[0]
  }
  return found
}

const modelId = (f: ModelFamily) => resolved[f] ?? FAMILIES[f].fallback

async function errorText(res: Response) {
  try {
    const j = (await res.json()) as { error?: { message?: string } }
    return j.error?.message ?? `${res.status} ${res.statusText}`
  } catch {
    return `${res.status} ${res.statusText}`
  }
}

export interface Turn {
  role: 'user' | 'model'
  text: string
  /** A PNG, base64-encoded, sent alongside the text. */
  image?: string
}

export interface GeminiResult {
  text: string
  /** Why it stopped: STOP is normal, MAX_TOKENS means the reply was cut off. */
  finish: string
  input: number
  output: number
  cost: number | null
  model: string
  /** Set if the thinking setting had to be dropped because the model refused it. */
  note?: string
}

/** Progress while a reply streams in: characters of the answer so far, and the latest thinking summary. */
export type Progress = (chars: number, thought: string | null) => void

export async function generate(settings: AiSettings, family: ModelFamily, thinking: Thinking, system: string, turns: Turn[], signal: AbortSignal, onProgress: Progress = () => {}): Promise<GeminiResult> {
  if (!resolved[family]) await resolveModels(settings.apiKey).catch(() => {})
  const model = modelId(family)
  const call = (withThinking: boolean) =>
    fetch(`${API}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': settings.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }, ...(t.image ? [{ inlineData: { mimeType: 'image/png', data: t.image } }] : [])] })),
        // includeThoughts streams short summaries of the model's thinking, shown in the status bar
        ...(withThinking ? { generationConfig: { thinkingConfig: { includeThoughts: true, ...(thinking !== 'default' ? { thinkingLevel: thinking } : {}) } } } : {}),
      }),
    })
  let note: string | undefined
  let res = await call(!noThinking.has(model))
  if (!res.ok && res.status === 400 && !noThinking.has(model)) {
    // if this model won't take a thinking level, try again without one
    const msg = await errorText(res)
    if (/think/i.test(msg)) {
      noThinking.add(model)
      note = `${FAMILIES[family].short} doesn't accept thinking settings, so it used its defaults${thinking !== 'default' ? ` instead of ${thinking} thinking` : ''}.`
      res = await call(false)
    } else throw new Error(msg)
  }
  if (!res.ok) throw new Error(await errorText(res))
  // the reply streams in as server-sent events, so progress can be shown while it's written
  type Chunk = {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
    promptFeedback?: { blockReason?: string }
    error?: { message?: string }
  }
  let text = ''
  let thought: string | null = null
  let finish = ''
  let usage: Chunk['usageMetadata'] = {}
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  const handle = (line: string) => {
    if (!line.startsWith('data:')) return
    const c = JSON.parse(line.slice(5)) as Chunk
    if (c.error) throw new Error(c.error.message ?? 'Gemini reported an error')
    if (c.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request (${c.promptFeedback.blockReason})`)
    const cand = c.candidates?.[0]
    for (const part of cand?.content?.parts ?? []) {
      if (!part.text) continue
      if (part.thought) thought = summary(part.text)
      else text += part.text
    }
    if (cand?.finishReason) finish = cand.finishReason
    if (c.usageMetadata) usage = c.usageMetadata
    onProgress(text.length, thought)
  }
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      handle(buf.slice(0, nl).trim())
      buf = buf.slice(nl + 1)
    }
  }
  if (buf.trim()) handle(buf.trim())
  const data = { usageMetadata: usage }
  const input = data.usageMetadata?.promptTokenCount ?? 0
  // thinking tokens are billed as output
  const output = (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0)
  const p = settings.prices[family]
  const cost = p.in !== null && p.out !== null ? (input * p.in + output * p.out) / 1e6 : null
  await addUsage({ time: Date.now(), model, input, output, cost })
  if (!text.trim()) throw new Error(`Gemini returned nothing${finish ? ` (${finish})` : ''}`)
  return { text, finish: finish || 'STOP', input, output, cost, model, note }
}

/** A thinking summary as one short line: its bold heading if it has one, otherwise its first sentence. */
function summary(t: string) {
  const head = /\*\*(.+?)\*\*/.exec(t)?.[1]
  const line = (head ?? t.replace(/[*#_`]/g, '').trim().split(/(?<=[.!?])\s|\n/)[0] ?? '').trim()
  return line || null
}

/** Settings dialog: key, models, thinking, optional prices, and usage so far. Resolves with the saved settings. */
export async function settingsDialog(): Promise<AiSettings | null> {
  const s = await getAiSettings()
  const totals = await usageTotals()
  const dlg = document.createElement('dialog')
  dlg.className = 'art-dialog'
  const models = (name: string) => `<select name="${name}">${(Object.keys(FAMILIES) as ModelFamily[]).map((f) => `<option value="${f}">${FAMILIES[f].label}</option>`).join('')}</select>`
  const think = (name: string) => `<select name="${name}"><option value="default">Model default</option><option value="low">Low</option><option value="high">High</option></select>`
  const price = (f: ModelFamily) =>
    `<div class="row-in"><span class="plabel">${FAMILIES[f].short}</span><label>Input<input name="${f}In" type="number" min="0" step="any" inputmode="decimal"></label><label>Output<input name="${f}Out" type="number" min="0" step="any" inputmode="decimal"></label></div>`
  dlg.innerHTML = `<form method="dialog">
    <h3>AI assistant settings</h3>
    <label>Gemini API key<span class="row-in"><input name="key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your key"><button type="button" class="load">Check</button></span></label>
    <p class="hint models-msg">Stored only in this browser on this device, and sent only to Google's Gemini API.</p>
    <div class="row-in"><label>Model for edits${models('editModel')}</label><label>Thinking${think('thinkingEdit')}</label></div>
    <div class="row-in"><label>Model for creating${models('createModel')}</label><label>Thinking${think('thinkingCreate')}</label></div>
    <p class="hint">More thinking usually means better geometry and more complete artwork, but slower and with more output tokens.</p>
    <label class="check-row"><input name="selfReview" type="checkbox"> Self-review new artwork</label>
    <p class="hint">Shows the model a picture of what it drew and asks it to fix problems like detached or overlapping parts. One extra request each time.</p>
    <fieldset><legend>Prices for cost estimates (optional, $ per 1M tokens)</legend>${price('lite')}${price('flash')}</fieldset>
    <p class="hint usage"></p>
    <div class="actions"><button type="button" class="clear-usage">Clear usage history</button><span></span><button value="cancel">Cancel</button><button value="save" class="primary">Save</button></div>
  </form>`
  const f = dlg.querySelector('form')!
  const el = <T extends HTMLInputElement | HTMLSelectElement>(n: string) => f.elements.namedItem(n) as T
  el<HTMLInputElement>('key').value = s.apiKey
  el<HTMLSelectElement>('editModel').value = s.editModel
  el<HTMLSelectElement>('createModel').value = s.createModel
  el<HTMLSelectElement>('thinkingEdit').value = s.thinkingEdit
  el<HTMLSelectElement>('thinkingCreate').value = s.thinkingCreate
  el<HTMLInputElement>('selfReview').checked = s.selfReview
  for (const fam of Object.keys(FAMILIES) as ModelFamily[]) {
    el<HTMLInputElement>(`${fam}In`).value = s.prices[fam].in?.toString() ?? ''
    el<HTMLInputElement>(`${fam}Out`).value = s.prices[fam].out?.toString() ?? ''
  }
  const msg = dlg.querySelector('.models-msg')!
  const check = async () => {
    const key = el<HTMLInputElement>('key').value.trim()
    if (!key) return (msg.textContent = 'Add your key first.')
    msg.textContent = 'Checking…'
    try {
      const found = await resolveModels(key)
      msg.textContent = (Object.keys(FAMILIES) as ModelFamily[]).map((fam) => (found[fam] ? `✓ ${FAMILIES[fam].short} (${found[fam]})` : `✕ ${FAMILIES[fam].short} isn't available to this key`)).join('   ')
    } catch (e) {
      msg.textContent = `Couldn't check the key: ${(e as Error).message}`
    }
  }
  dlg.querySelector('.load')!.addEventListener('click', check)
  if (s.apiKey) void check()
  const showUsage = (t: typeof totals) =>
    (dlg.querySelector('.usage')!.textContent = `Usage so far: ${t.requests} request${t.requests === 1 ? '' : 's'}, ${t.input.toLocaleString()} input + ${t.output.toLocaleString()} output tokens${t.cost !== null ? `, about $${t.cost.toFixed(4)}` : ''}.`)
  showUsage(totals)
  dlg.querySelector('.clear-usage')!.addEventListener('click', async () => {
    await clearUsage()
    showUsage(await usageTotals())
  })
  document.body.appendChild(dlg)
  dlg.showModal()
  return new Promise((resolve) => {
    dlg.addEventListener('close', async () => {
      dlg.remove()
      if (dlg.returnValue !== 'save') return resolve(null)
      const num = (n: string) => {
        const v = el<HTMLInputElement>(n).value
        return v.trim() === '' || !Number.isFinite(+v) ? null : +v
      }
      const next: AiSettings = {
        apiKey: el<HTMLInputElement>('key').value.trim(),
        editModel: el<HTMLSelectElement>('editModel').value as ModelFamily,
        createModel: el<HTMLSelectElement>('createModel').value as ModelFamily,
        thinkingEdit: el<HTMLSelectElement>('thinkingEdit').value as Thinking,
        thinkingCreate: el<HTMLSelectElement>('thinkingCreate').value as Thinking,
        selfReview: el<HTMLInputElement>('selfReview').checked,
        prices: { lite: { in: num('liteIn'), out: num('liteOut') }, flash: { in: num('flashIn'), out: num('flashOut') } },
      }
      await putAiSettings(next)
      resolve(next)
    })
  })
}
