import { addUsage, clearUsage, getAiSettings, putAiSettings, usageTotals, type AiSettings } from './store'

/**
 * Talks to the Gemini API straight from the browser, with the key stored on
 * this device. The key is never part of the site's code.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta'

export interface GeminiResult {
  text: string
  input: number
  output: number
  cost: number | null
  model: string
}

export async function listModels(apiKey: string): Promise<{ id: string; label: string }[]> {
  const res = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } })
  if (!res.ok) throw new Error(await errorText(res))
  const data = (await res.json()) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] }
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName ?? m.name }))
}

async function errorText(res: Response) {
  try {
    const j = (await res.json()) as { error?: { message?: string } }
    return j.error?.message ?? `${res.status} ${res.statusText}`
  } catch {
    return `${res.status} ${res.statusText}`
  }
}

export async function generate(settings: AiSettings, system: string, prompt: string, signal: AbortSignal): Promise<GeminiResult> {
  const res = await fetch(`${API}/models/${encodeURIComponent(settings.model)}:generateContent`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': settings.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
  })
  if (!res.ok) throw new Error(await errorText(res))
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
    promptFeedback?: { blockReason?: string }
  }
  if (data.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request (${data.promptFeedback.blockReason})`)
  const cand = data.candidates?.[0]
  const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  const input = data.usageMetadata?.promptTokenCount ?? 0
  // thinking tokens are billed as output
  const output = (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0)
  const cost = settings.priceIn !== null && settings.priceOut !== null ? (input * settings.priceIn + output * settings.priceOut) / 1e6 : null
  await addUsage({ time: Date.now(), model: settings.model, input, output, cost })
  if (!text.trim()) throw new Error(`Gemini returned nothing${cand?.finishReason ? ` (${cand.finishReason})` : ''}`)
  return { text, input, output, cost, model: settings.model }
}

/** Settings dialog: key, model, optional prices, and usage so far. Resolves with the saved settings. */
export async function settingsDialog(): Promise<AiSettings | null> {
  const s = await getAiSettings()
  const totals = await usageTotals()
  const dlg = document.createElement('dialog')
  dlg.className = 'art-dialog'
  dlg.innerHTML = `<form method="dialog">
    <h3>AI assistant settings</h3>
    <label>Gemini API key<input name="key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your key"></label>
    <p class="hint">Stored only in this browser on this device, and sent only to Google's Gemini API.</p>
    <label>Model<span class="row-in"><select name="model"></select><button type="button" class="load">Load models</button></span></label>
    <p class="hint models-msg"></p>
    <fieldset><legend>Prices for cost estimates (optional, $ per 1M tokens)</legend>
      <span class="row-in"><label>Input<input name="pin" type="number" min="0" step="any" inputmode="decimal"></label><label>Output<input name="pout" type="number" min="0" step="any" inputmode="decimal"></label></span>
    </fieldset>
    <p class="hint usage"></p>
    <div class="actions"><button type="button" class="clear-usage">Clear usage history</button><span></span><button value="cancel">Cancel</button><button value="save" class="primary">Save</button></div>
  </form>`
  const f = dlg.querySelector('form')!
  const key = f.elements.namedItem('key') as HTMLInputElement
  const model = f.elements.namedItem('model') as HTMLSelectElement
  const pin = f.elements.namedItem('pin') as HTMLInputElement
  const pout = f.elements.namedItem('pout') as HTMLInputElement
  const msg = dlg.querySelector('.models-msg')!
  key.value = s.apiKey
  pin.value = s.priceIn?.toString() ?? ''
  pout.value = s.priceOut?.toString() ?? ''
  const setOptions = (opts: { id: string; label: string }[]) => {
    model.innerHTML = ''
    for (const o of opts) model.add(new Option(`${o.label} (${o.id})`, o.id))
    if (s.model && !opts.some((o) => o.id === s.model)) model.add(new Option(s.model, s.model), 0)
    model.value = s.model || preferred(opts) || opts[0]?.id || ''
  }
  setOptions([])
  const load = async () => {
    if (!key.value.trim()) return (msg.textContent = 'Add your key first.')
    msg.textContent = 'Loading models…'
    try {
      const opts = await listModels(key.value.trim())
      setOptions(opts)
      msg.textContent = `${opts.length} models available to your key.`
    } catch (e) {
      msg.textContent = `Couldn't load models: ${(e as Error).message}`
    }
  }
  dlg.querySelector('.load')!.addEventListener('click', load)
  if (s.apiKey) void load()
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
      const num = (v: string) => (v.trim() === '' || !Number.isFinite(+v) ? null : +v)
      const next: AiSettings = { apiKey: key.value.trim(), model: model.value, priceIn: num(pin.value), priceOut: num(pout.value) }
      await putAiSettings(next)
      resolve(next)
    })
  })
}

/** Default to Gemini 3.1 Flash-Lite, as the spec asks; otherwise the newest Flash-Lite. */
function preferred(opts: { id: string }[]) {
  const named = opts.filter((o) => /3\.1-flash-lite/i.test(o.id)).sort((a, b) => a.id.length - b.id.length)[0]
  if (named) return named.id
  const lite = opts.filter((o) => /flash-lite/i.test(o.id) && !/preview|exp|tts|image|audio|live/i.test(o.id))
  const ver = (id: string) => parseFloat(/gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? '0')
  return lite.sort((a, b) => ver(b.id) - ver(a.id))[0]?.id ?? opts.find((o) => /flash-lite/i.test(o.id))?.id
}
