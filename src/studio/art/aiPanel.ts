import { FAMILIES, generate, settingsDialog, type GeminiResult, type Turn } from './gemini'
import { getAiSettings, type AiSettings } from './store'
import { artSize, parseSvg } from './validate'

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
  /** True when the artwork has nothing drawn in it yet. */
  blank(): boolean
  /** The selected element, if any and if the code is valid. */
  selection(): AiTarget | null
  /** Check a proposal and (unless show is false) preview it on the canvas; returns an error message if it doesn't work. */
  propose(target: AiTarget, replacement: string, show?: boolean): string | null
  accept(): void
  reject(): void
}

const SYSTEM = `You are the artwork engine of a cartoon studio. You write SVG source code.
Reply with SVG markup only: no explanation and no Markdown code fences.

Safety: never use <script>, <foreignObject>, event attributes (onclick and so on) or links to external files. Any new gradients, filters, masks or clip paths need ids that don't clash with existing ones.

Building accurately. You can't measure, so don't hand-calculate dozens of coordinates. Instead:
- Work out the key numbers first (centre point, radii, sizes, angles) and use them consistently everywhere.
- Repeated or radial parts (segments, spokes, petals, teeth, clock marks, tiles, rows of windows): draw ONE piece inside <defs> and place copies with <use href="#piece" transform="rotate(angle cx cy)"/> or translate(). For n pieces round a circle, the angle step is 360/n degrees.
- Ring segments and alternating colours round a circle: use a <circle> with a thick stroke and stroke-dasharray instead of arc paths. The stroke sits centred on the radius r, so a ring from r1 to r2 is a circle with r=(r1+r2)/2 and stroke-width=r2-r1. Its circumference is C=2*pi*r; n equal segments each take C/n. Two colours alternate with two circles, each stroke-dasharray="C/n C/n", the second rotated by 360/n degrees. Rotate the circle to set where segment one starts (dashes start at 3 o'clock and run clockwise).
- Text round a circle: one <text> per label with text-anchor="middle" and dominant-baseline="central", positioned at the top and turned into place with transform="rotate(angle cx cy)".
- Prefer basic shapes (circle, ellipse, rect, line, polygon) with transforms over long hand-made paths. When you do write paths, keep them simple and smooth.
- Finish everything. Every repeated part must actually be in the reply. Never leave placeholders, "...", or comments like "repeat for the rest".
- Parts that belong together must actually join: feet on the ends of legs, hands on arms, heads on necks, objects resting on surfaces. Overlap them slightly rather than leaving gaps.
- Keep one consistent viewpoint for the whole picture. A face and the body it belongs to are drawn from the same angle.
- If the subject is a real thing with a known design (a dartboard, a flag, a clock face, a playing card), reproduce its real layout accurately: the right counts, order, proportions and colours.`

/** What "2.5D" means in this studio, from the Art Studio spec. */
const STYLE_25D = `"2.5D" in this studio means fundamentally 2D cartoon artwork with convincing depth and volume: layered shading, controlled gradients, highlights, contact shadows and ambient shadows, visible sides on objects, and clear foreground, middle ground and background. Characters face front, three-quarter, side or back, with the head and body drawn consistently from that one angle. It does NOT mean isometric, blocky, voxel or low-poly art; only use those if the user asks for them by name.`

const CREATE_RULE = `You are CREATING new artwork from a description.
- Keep the current document's width, height and viewBox, and fill that canvas sensibly, centred.
- Make it complete and polished in whatever style the user asks for. If they don't name a style, use the studio's cartoon style: clean dark outlines (#1a1410), solid colours with simple layered shading and highlights, bold readable shapes.
- ${STYLE_25D}
- Organise it into groups with descriptive ids (for example id="board", id="numbers") so parts can be selected and edited later.
- Return one complete SVG document: a single <svg> root with xmlns="http://www.w3.org/2000/svg".`

const EDIT_RULE = `You are EDITING existing artwork. Change only what the instruction asks for. Keep existing ids, group structure and unrelated elements exactly as they are.
${STYLE_25D}`
const ELEMENT_RULE = `Return a replacement for exactly the TARGET element and nothing else: a single element. If the change needs new gradients or filters, you may return a <g> that holds a <defs> and the edited element, keeping the element's own id on it.`
const WHOLE_RULE = `Return one complete SVG document: a single <svg> root with xmlns="http://www.w3.org/2000/svg".`

const REVIEW = `The attached image is exactly how your SVG renders. Look at it carefully against the description and fix every problem you can see, for example:
- parts that should join but don't (feet floating off legs, hands off arms, a head off its neck, objects hovering above surfaces), or parts that overlap or poke through each other wrongly;
- a mixed or inconsistent viewpoint (a front-on face on a side-on body, mismatched perspective);
- wrong proportions, missing or duplicated parts, anything clipped by the edge of the canvas;
- anything that doesn't match what was asked for, including the style.
Keep everything that already works. If nothing needs fixing, reply with the same SVG. Reply with the complete corrected SVG document only.`

/** Render SVG source to a PNG (base64, no prefix), long side at most 1024px, on white. */
async function renderPng(source: string): Promise<string> {
  const r = parseSvg(source)
  if (!r.ok) throw new Error(r.errors[0].message)
  const svg = r.svg
  const size = artSize(svg)
  const k = Math.min(1, 1024 / Math.max(size.width, size.height))
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`)
  const w = Math.max(1, Math.round(size.width * k))
  const h = Math.max(1, Math.round(size.height * k))
  svg.setAttribute('width', String(w))
  svg.setAttribute('height', String(h))
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    return c.toDataURL('image/png').split(',')[1]
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** "Create a…", "Draw…" and so on start new artwork rather than editing what's there. */
const CREATE_WORDS = /^\s*(please\s+)?(create|draw|generate|design|sketch|illustrate|make\s+(me\s+)?(a|an)\s+new)\b/i

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
      <div class="ai-status" hidden role="status"><span class="spin" aria-hidden="true"></span><span class="stext"><span class="sline"></span><span class="sthought"></span></span><span class="stime"></span><button type="button" class="scancel">Cancel</button></div>
      <form class="ai-form">
        <textarea rows="2" placeholder="Describe an SVG edit…" aria-label="Instruction for the AI"></textarea>
        <button type="submit" class="send" aria-label="Send" title="Send">↑</button>
      </form>
      <div class="ai-chips"><button type="button" class="chip target"></button><span class="chip usage" hidden></span></div>`
    for (const k of ['model', 'log', 'proposal', 'ptext', 'accept', 'reject', 'target', 'usage', 'send', 'status', 'stext', 'sline', 'sthought', 'stime']) this.$[k] = this.el.querySelector(`.${k}, .ai-${k}`)!
    this.$.textarea = this.el.querySelector('textarea')!
    this.$.model.addEventListener('click', () => void this.openSettings())
    this.el.querySelector('.scancel')!.addEventListener('click', () => this.abort?.abort())
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
    this.$.model.textContent = s?.apiKey ? FAMILIES[s.editModel].short : 'Set up'
    this.$.model.title = s?.apiKey ? `Edits: ${FAMILIES[s.editModel].label} · Creating: ${FAMILIES[s.createModel].label}. Tap for settings.` : 'Set up the AI assistant'
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
    if (!this.settings?.apiKey) {
      await this.openSettings()
      if (!this.settings?.apiKey) return
    }
    if (this.pending) {
      this.host.reject()
      this.pending = null
      this.$.proposal.hidden = true
    }
    const source = this.host.source()
    const sel = this.wholeChosen ? null : this.host.selection()
    const target: AiTarget = sel ?? { from: 0, to: source.length, text: source, label: 'the whole artwork', whole: true }
    const creating = target.whole && (this.host.blank() || CREATE_WORDS.test(instruction))
    const family = creating ? this.settings.createModel : this.settings.editModel
    const thinkingLevel = creating ? this.settings.thinkingCreate : this.settings.thinkingEdit
    const prompt = creating
      ? `${CREATE_RULE}\n\nCURRENT DOCUMENT:\n${source}\n\nDESCRIPTION: ${instruction}`
      : target.whole
        ? `${EDIT_RULE}\n${WHOLE_RULE}\n\nCURRENT DOCUMENT:\n${source}\n\nINSTRUCTION: ${instruction}`
        : `${EDIT_RULE}\n${ELEMENT_RULE}\n\nDOCUMENT (for context only):\n${source}\n\nTARGET element to replace:\n${target.text}\n\nINSTRUCTION: ${instruction}`
    this.log('you', instruction)
    ta.value = ''
    this.abort = new AbortController()
    this.$.send.textContent = '■'
    this.$.send.setAttribute('aria-label', 'Cancel')
    this.$.send.title = 'Cancel'
    // a status line that stays in view, with a clock, so a slow model never looks frozen
    const started = performance.now()
    let phase = ''
    let chars = 0
    let thought: string | null = null
    const showStatus = () => {
      this.$.sline.textContent = chars ? `${phase}: writing the SVG (${chars.toLocaleString()} characters so far)` : `${phase}: ${thought || thinkingLevel === 'high' ? 'thinking' : 'waiting for the reply'}…`
      this.$.sthought.textContent = thought && !chars ? thought : ''
      this.$.stime.textContent = `${Math.floor((performance.now() - started) / 1000)}s`
    }
    const status = { remove: () => (this.$.status.hidden = true) }
    this.$.status.hidden = false
    const clock = window.setInterval(showStatus, 1000)
    const turns: Turn[] = [{ role: 'user', text: prompt }]
    const used = { input: 0, output: 0, cost: null as number | null }
    const tally = (r: GeminiResult) => {
      used.input += r.input
      used.output += r.output
      if (r.cost !== null) used.cost = (used.cost ?? 0) + r.cost
      this.$.usage.hidden = false
      this.$.usage.textContent = `${(used.input + used.output).toLocaleString()} tokens${used.cost !== null ? ` · ~$${used.cost.toFixed(4)}` : ''}`
      this.$.usage.title = `${used.input.toLocaleString()} in, ${used.output.toLocaleString()} out`
    }
    const short = FAMILIES[family].short
    const ask = async (label: string) => {
      phase = label
      chars = 0
      thought = null
      showStatus()
      const r = await generate(this.settings!, family, thinkingLevel, SYSTEM, turns, this.abort!.signal, (n, t) => {
        if (n !== chars || t !== thought) {
          chars = n
          thought = t
          showStatus()
        }
      })
      tally(r)
      if (r.note) this.log('note', r.note)
      return r
    }
    /** A usable reply: the answer, plus one automatic retry if it's cut off or broken. */
    const usable = async (label: string): Promise<string | null> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await ask(attempt ? `${short} is fixing its reply` : label)
        const svg = cleanReply(r.text)
        const cut = r.finish === 'MAX_TOKENS'
        const err = cut ? 'the reply was cut off before the end' : this.host.propose(target, svg, false)
        turns.push({ role: 'model', text: r.text })
        if (!err) return svg
        if (attempt) {
          this.log('error', `The reply still couldn't be used: ${err}`)
          return null
        }
        this.log('note', `That reply couldn't be used (${err}), so I've asked it to fix it.`)
        turns.push({
          role: 'user',
          text: cut
            ? "Your reply was cut off before the end. Reply again with the complete SVG, written more compactly: reuse pieces with <defs> and <use>, and drop anything decorative that isn't needed. SVG only."
            : `Your reply can't be used: ${err}. Reply again with the complete, corrected SVG only.`,
        })
      }
      return null
    }
    try {
      let svg = await usable(`${creating ? 'Creating' : 'Editing'} with ${short}`)
      if (svg === null) return
      // self-review: show the model what it actually drew and let it fix what it sees
      if (creating && this.settings.selfReview) {
        let image: string | null = null
        try {
          image = await renderPng(svg)
        } catch (e) {
          this.log('note', `Couldn't render the artwork for self-review (${(e as Error).message}), so it wasn't reviewed.`)
        }
        if (image) {
          turns.push({ role: 'user', text: REVIEW, image })
          const reviewed = await usable(`${short} is checking its drawing`)
          if (reviewed !== null) {
            if (reviewed.trim() !== svg.trim()) this.log('note', 'Self-review made fixes.')
            else this.log('note', 'Self-review found nothing to fix.')
            svg = reviewed
          } else this.log('note', 'Kept the version from before the review.')
        }
      }
      const err = this.host.propose(target, svg)
      if (err) return this.log('error', `The reply couldn't be used: ${err}`)
      this.pending = target
      this.$.ptext.textContent = `Previewing ${creating ? 'new artwork' : `a change to ${target.label}`}.`
      this.$.proposal.hidden = false
    } catch (e) {
      status.remove()
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      this.log(aborted ? 'note' : 'error', aborted ? 'Cancelled.' : (e as Error).message)
    } finally {
      clearInterval(clock)
      status.remove()
      this.abort = null
      this.$.send.textContent = '↑'
      this.$.send.setAttribute('aria-label', 'Send')
      this.$.send.title = 'Send'
    }
  }
}
