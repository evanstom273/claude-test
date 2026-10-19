import { generate, settingsDialog } from './gemini'
import { getAiSettings, type AiSettings } from './store'

/**
 * The AI Art Assistant: sends the selected element (or the whole artwork)
 * plus an instruction to Gemini, then hands back a proposed replacement for
 * the studio to preview. Nothing changes until you accept it.
 */

export interface AiTarget {
  from: number
  to: number
  /** The exact source being replaced. */
  text: string
  /** How to describe it, e.g. "#head" or "the whole artwork". */
  label: string
  whole: boolean
}

export interface AiHost {
  source(): string
  /** The selected element, if any and if the code is valid. */
  selection(): AiTarget | null
  /** Show a proposal on the canvas; returns an error message if it doesn't work. */
  propose(target: AiTarget, replacement: string): string | null
  accept(): void
  reject(): void
}

const SYSTEM = `You edit SVG artwork for a cartoon studio. Reply with SVG markup only: no explanation and no Markdown code fences.
Rules:
- Change only what the instruction asks for. Keep existing id attributes, group structure and unrelated elements exactly as they are.
- Write clean, readable SVG with sensible indentation.
- Never use <script>, <foreignObject>, event attributes (onclick and so on) or links to external files.
- Any new gradients, filters, masks or clip paths need ids that don't clash with existing ones.`

const ELEMENT_RULE = `Return a replacement for exactly the TARGET element and nothing else: a single element. If the change needs new gradients or filters, you may return a <g> that holds a <defs> and the edited element, keeping the element's own id on it.`
const WHOLE_RULE = `Return one complete SVG document: a single <svg> root with xmlns="http://www.w3.org/2000/svg".`

/** Pull the markup out of a reply, in case it came wrapped in fences or chatter. */
export function cleanReply(text: string) {
  let t = text.trim()
  const fence = /```(?:svg|xml|html)?\s*\n([\s\S]*?)```/i.exec(t)
  if (fence) t = fence[1].trim()
  const a = t.indexOf('<')
  const b = t.lastIndexOf('>')
  return a >= 0 && b > a ? t.slice(a, b + 1) : t
}

export class AiPanel {
  readonly el: HTMLDivElement
  private settings: AiSettings | null = null
  private wholeChosen = false
  private abort: AbortController | null = null
  private pending: AiTarget | null = null
  private $: Record<string, HTMLElement> = {}

  constructor(private host: AiHost) {
    this.el = document.createElement('div')
    this.el.className = 'art-ai'
    this.el.innerHTML = `
      <div class="ai-head">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 2l.6 1.4L7 4l-1.4.6L5 6l-.6-1.4L3 4l1.4-.6z"/></svg>
        <b>AI Art Assistant</b>
        <button type="button" class="model" title="AI settings">Set up</button>
      </div>
      <div class="ai-log" aria-live="polite"></div>
      <div class="ai-proposal" hidden>
        <span class="ptext"></span>
        <span class="pbtns"><button type="button" class="reject">Reject</button><button type="button" class="accept primary">Accept</button></span>
      </div>
      <form class="ai-form">
        <textarea rows="2" placeholder="Describe an SVG edit…" aria-label="Instruction for the AI"></textarea>
        <button type="submit" class="send" aria-label="Send" title="Send">↑</button>
      </form>
      <div class="ai-chips"><button type="button" class="chip target"></button><span class="chip usage" hidden></span></div>`
    for (const k of ['model', 'log', 'proposal', 'ptext', 'accept', 'reject', 'target', 'usage', 'send']) this.$[k] = this.el.querySelector(`.${k}, .ai-${k}`)!
    this.$.textarea = this.el.querySelector('textarea')!
    this.$.model.addEventListener('click', () => void this.openSettings())
    this.$.target.addEventListener('click', () => {
      this.wholeChosen = !this.wholeChosen
      this.refresh()
    })
    this.$.accept.addEventListener('click', () => {
      this.host.accept()
      this.clearProposal('Applied. Undo puts it back.')
    })
    this.$.reject.addEventListener('click', () => {
      this.host.reject()
      this.clearProposal('Rejected; nothing changed.')
    })
    this.el.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault()
      if (this.abort) this.abort.abort()
      else void this.send()
    })
    this.$.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !(e as KeyboardEvent).isComposing) {
        e.preventDefault()
        this.el.querySelector('form')!.requestSubmit()
      }
    })
    void getAiSettings().then((s) => {
      this.settings = s
      this.refresh()
    })
  }

  private async openSettings() {
    const s = await settingsDialog()
    if (s) this.settings = s
    this.refresh()
  }

  /** Call when the selection changes. */
  refresh() {
    const s = this.settings
    this.$.model.textContent = s?.apiKey && s.model ? s.model : 'Set up'
    const sel = this.host.selection()
    const whole = this.wholeChosen || !sel
    this.$.target.textContent = whole ? 'Whole artwork' : `Selected: ${sel!.label}`
    this.$.target.title = sel ? 'Tap to switch between the selection and the whole artwork' : 'Select something to edit just that'
    ;(this.$.target as HTMLButtonElement).disabled = !sel
  }

  /** The studio discarded the preview (for example, the code was edited). */
  dropProposal() {
    if (!this.pending) return
    this.clearProposal('The code changed, so the preview was dropped.')
  }

  private clearProposal(msg: string) {
    this.pending = null
    this.$.proposal.hidden = true
    this.log('note', msg)
  }

  private log(kind: 'you' | 'note' | 'error', text: string) {
    const d = document.createElement('div')
    d.className = `msg ${kind}`
    d.textContent = text
    this.$.log.appendChild(d)
    while (this.$.log.children.length > 12) this.$.log.firstElementChild!.remove()
    this.$.log.scrollTop = this.$.log.scrollHeight
  }

  private async send() {
    const ta = this.$.textarea as HTMLTextAreaElement
    const instruction = ta.value.trim()
    if (!instruction) return
    if (!this.settings?.apiKey || !this.settings.model) {
      await this.openSettings()
      if (!this.settings?.apiKey || !this.settings.model) return
    }
    if (this.pending) {
      this.host.reject()
      this.pending = null
      this.$.proposal.hidden = true
    }
    const source = this.host.source()
    const sel = this.wholeChosen ? null : this.host.selection()
    const target: AiTarget = sel ?? { from: 0, to: source.length, text: source, label: 'the whole artwork', whole: true }
    const prompt = target.whole
      ? `${WHOLE_RULE}\n\nCURRENT DOCUMENT:\n${source}\n\nINSTRUCTION: ${instruction}`
      : `${ELEMENT_RULE}\n\nDOCUMENT (for context only):\n${source}\n\nTARGET element to replace:\n${target.text}\n\nINSTRUCTION: ${instruction}`
    this.log('you', instruction)
    ta.value = ''
    this.abort = new AbortController()
    this.$.send.textContent = '■'
    this.$.send.setAttribute('aria-label', 'Cancel')
    this.$.send.title = 'Cancel'
    const thinking = document.createElement('div')
    thinking.className = 'msg note'
    thinking.textContent = `Asking ${this.settings.model}…`
    this.$.log.appendChild(thinking)
    try {
      const r = await generate(this.settings, SYSTEM, prompt, this.abort.signal)
      thinking.remove()
      this.$.usage.hidden = false
      this.$.usage.textContent = `${(r.input + r.output).toLocaleString()} tokens${r.cost !== null ? ` · ~$${r.cost.toFixed(4)}` : ''}`
      this.$.usage.title = `${r.input.toLocaleString()} in, ${r.output.toLocaleString()} out`
      const err = this.host.propose(target, cleanReply(r.text))
      if (err) this.log('error', `The reply couldn't be used: ${err}`)
      else {
        this.pending = target
        this.$.ptext.textContent = `Previewing a change to ${target.label}.`
        this.$.proposal.hidden = false
      }
    } catch (e) {
      thinking.remove()
      this.log(e instanceof DOMException && e.name === 'AbortError' ? 'note' : 'error', e instanceof DOMException && e.name === 'AbortError' ? 'Cancelled.' : (e as Error).message)
    } finally {
      this.abort = null
      this.$.send.textContent = '↑'
      this.$.send.setAttribute('aria-label', 'Send')
      this.$.send.title = 'Send'
    }
  }
}
