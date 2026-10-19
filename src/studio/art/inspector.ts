import { decompose, isGraphic, rootBox, toRoot, unionBox } from './geometry'
import { attr, type SrcElement } from './sourceMap'

/**
 * The properties inspector. Numbers are in artwork units and apply when you
 * press Enter or leave the field; colours preview while you pick. With
 * several things selected, changes apply to all of them.
 */

export type InspectorChange =
  | { kind: 'x' | 'y' | 'width' | 'height' | 'rotation' | 'skewX' | 'skewY'; value: number }
  | { kind: 'attr'; name: string; value: string | null; live?: boolean }
  | { kind: 'text'; value: string }
  | { kind: 'action'; name: string }

const ctx = document.createElement('canvas').getContext('2d')!
/** Any CSS colour as #rrggbb, for the colour swatch. */
export function toHex(c: string) {
  ctx.fillStyle = '#000000'
  ctx.fillStyle = c
  const v = ctx.fillStyle
  if (v.startsWith('#')) return v
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v)
  return m ? `#${[m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('')}` : '#000000'
}

const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']
const SHAPES = ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']

export interface InspectorContext {
  els: SrcElement[]
  /** Source elements and their displayed counterparts. */
  items: { src: SrcElement; el: Element | null }[]
  root: SVGSVGElement | null
  /** True while the node tool is editing a path. */
  nodes: { editing: boolean; selected: number }
}

export class Inspector {
  readonly el: HTMLDivElement
  private f: Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = {}
  private title: HTMLDivElement
  private sections: Record<string, HTMLElement> = {}
  /** Which point of the selection stays put when resizing, rotating, flipping or skewing (0..2 each way). */
  origin = { x: 1, y: 1 }
  lockAspect = false
  onChange: (c: InspectorChange) => void = () => {}
  /** Extra sections added by later parts of the studio (appearance, character…). */
  readonly extra: HTMLDivElement

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'art-inspector'
    const num = (k: string, label: string, extra = '') => `<label class="fld"><span>${label}</span><input data-k="${k}" type="number" step="any" inputmode="decimal" ${extra}></label>`
    const color = (k: string, label: string) =>
      `<label class="fld"><span>${label}</span><span class="color"><input data-k="${k}Swatch" type="color" aria-label="${label} colour"><input data-k="${k}" type="text" spellcheck="false" placeholder="none"></span></label>`
    const btn = (name: string, label: string, title = label) => `<button type="button" class="ibtn" data-action="${name}" title="${title}">${label}</button>`
    this.el.innerHTML = `
      <div class="ititle">Nothing selected</div>
      <div class="ibody">
        <div class="isec" data-sec="object">
          <label class="fld"><span>ID (name)</span><input data-k="id" type="text" spellcheck="false" placeholder="(no id)"></label>
          <div class="pair">${num('x', 'X')}${num('y', 'Y')}</div>
          <div class="pair wh">${num('width', 'Width')}${num('height', 'Height')}<button type="button" class="lock" data-action="lockAspect" title="Keep proportions" aria-pressed="false">⛓</button></div>
          <div class="pair">${num('rotation', 'Rotation °')}<div class="fld"><span>Origin</span><div class="origin" role="radiogroup" aria-label="Transform origin">${[0, 1, 2].map((y) => [0, 1, 2].map((x) => `<button type="button" data-ox="${x}" data-oy="${y}" aria-label="Origin ${['left', 'centre', 'right'][x]} ${['top', 'middle', 'bottom'][y]}"></button>`).join('')).join('')}</div></div></div>
          <div class="pair">${num('skewX', 'Skew X °', 'placeholder="0"')}${num('skewY', 'Skew Y °', 'placeholder="0"')}</div>
          <div class="btns">${btn('flipX', '⇋ Flip H', 'Flip horizontally')}${btn('flipY', '⇵ Flip V', 'Flip vertically')}</div>
        </div>
        <div class="isec" data-sec="appearance">
          <h4>Appearance</h4>
          ${color('fill', 'Fill')}
          ${color('stroke', 'Stroke')}
          <div class="pair">${num('stroke-width', 'Stroke width', 'min="0"')}<label class="fld"><span>Opacity %</span><input data-k="opacity" type="number" min="0" max="100" step="1" inputmode="numeric"></label></div>
          <label class="fld"><span>Blend mode</span><select data-k="mix-blend-mode">${BLENDS.map((b) => `<option value="${b}">${b}</option>`).join('')}</select></label>
        </div>
        <div class="isec" data-sec="text">
          <h4>Text</h4>
          <label class="fld"><span>Content</span><textarea data-k="content" rows="2"></textarea></label>
          <label class="fld"><span>Font</span><input data-k="font-family" type="text" list="art-fonts" spellcheck="false"></label>
          <datalist id="art-fonts"><option value="Arial, sans-serif"><option value="Arial Black, Impact, sans-serif"><option value="Georgia, serif"><option value="Courier New, monospace"><option value="Comic Sans MS, cursive"><option value="Trebuchet MS, sans-serif"><option value="Verdana, sans-serif"></datalist>
          <div class="pair">${num('font-size', 'Size', 'min="1"')}<label class="fld"><span>Weight</span><select data-k="font-weight"><option value="">normal</option><option>300</option><option>500</option><option>700</option><option>900</option></select></label></div>
          <label class="fld"><span>Align</span><select data-k="text-anchor"><option value="">start</option><option value="middle">middle</option><option value="end">end</option></select></label>
        </div>
        <div class="isec" data-sec="rect">
          <h4>Rectangle</h4>
          <div class="pair">${num('rx', 'Corner radius', 'min="0"')}<span></span></div>
        </div>
        <div class="isec" data-sec="path">
          <h4>Path</h4>
          <div class="btns nodes">
            ${btn('addNode', '+ Node', 'Add a node after each selected node')}${btn('deleteNode', '− Node', 'Delete selected nodes')}${btn('smooth', 'Smooth/Corner', 'Toggle smooth or corner (or double-tap a node)')}
            ${btn('closePath', 'Close/Open', 'Close or open the path')}${btn('split', 'Split', 'Split at the selected node')}${btn('join', 'Join', 'Join two selected end nodes')}
          </div>
          <div class="btns">${btn('editNodes', 'Edit nodes', 'Edit nodes (or double-tap the shape)')}${btn('simplify', 'Simplify', 'Remove unnecessary nodes')}${btn('toPath', 'To path', 'Convert to an editable path')}</div>
        </div>
      </div>`
    this.title = this.el.querySelector('.ititle')!
    this.extra = document.createElement('div')
    this.extra.className = 'iextra'
    this.el.querySelector('.ibody')!.appendChild(this.extra)
    for (const s of this.el.querySelectorAll<HTMLElement>('[data-sec]')) this.sections[s.dataset.sec!] = s
    for (const i of this.el.querySelectorAll<HTMLInputElement>('[data-k]')) this.f[i.dataset.k!] = i
    for (const k of ['x', 'y', 'width', 'height', 'rotation', 'skewX', 'skewY'] as const) {
      this.f[k].addEventListener('change', () => {
        const v = parseFloat(this.f[k].value)
        if (Number.isFinite(v)) this.onChange({ kind: k, value: v })
        if (k === 'skewX' || k === 'skewY') this.f[k].value = ''
      })
    }
    const attrField = (k: string, map: (v: string) => string | null = (v) => v.trim() || null) => this.f[k].addEventListener('change', () => this.onChange({ kind: 'attr', name: k, value: map(this.f[k].value) }))
    attrField('id')
    for (const k of ['stroke-width', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'rx']) attrField(k)
    attrField('opacity', (v) => (v.trim() === '' || +v >= 100 ? null : String(Math.max(0, Math.min(100, +v)) / 100)))
    attrField('mix-blend-mode', (v) => (v === 'normal' ? null : v))
    this.f.content.addEventListener('change', () => this.onChange({ kind: 'text', value: this.f.content.value }))
    for (const k of ['fill', 'stroke']) {
      attrField(k)
      // the swatch previews while you pick, then writes the code when you let go
      this.f[`${k}Swatch`].addEventListener('input', () => this.onChange({ kind: 'attr', name: k, value: this.f[`${k}Swatch`].value, live: true }))
      this.f[`${k}Swatch`].addEventListener('change', () => this.onChange({ kind: 'attr', name: k, value: this.f[`${k}Swatch`].value }))
    }
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      const o = t.closest<HTMLElement>('[data-ox]')
      if (o) {
        this.origin = { x: +o.dataset.ox!, y: +o.dataset.oy! }
        this.drawOrigin()
        return
      }
      const a = t.closest<HTMLElement>('[data-action]')
      if (!a) return
      if (a.dataset.action === 'lockAspect') {
        this.lockAspect = !this.lockAspect
        a.setAttribute('aria-pressed', String(this.lockAspect))
        return
      }
      this.onChange({ kind: 'action', name: a.dataset.action! })
    })
    this.drawOrigin()
    this.update({ els: [], items: [], root: null, nodes: { editing: false, selected: 0 } })
  }

  private drawOrigin() {
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-ox]')) b.setAttribute('aria-checked', String(+b.dataset.ox! === this.origin.x && +b.dataset.oy! === this.origin.y))
  }

  /** Show or hide a section by name. */
  show(sec: string, on: boolean) {
    this.sections[sec]?.toggleAttribute('hidden', !on)
  }

  update(c: InspectorContext) {
    const active = document.activeElement
    const editing = active instanceof HTMLElement && this.el.contains(active) && (active as HTMLInputElement).type !== 'color'
    const set = (k: string, v: string) => {
      if (!(editing && active === this.f[k])) this.f[k].value = v
    }
    const items = c.items
    const one = items.length === 1 ? items[0] : null
    this.el.classList.toggle('empty', !items.length)
    for (const i of Object.values(this.f)) i.disabled = !items.length
    if (!items.length) {
      this.title.textContent = 'Nothing selected'
      for (const [k, i] of Object.entries(this.f)) if ((i as HTMLInputElement).type !== 'color' && k !== 'mix-blend-mode') i.value = ''
      for (const s of ['text', 'rect', 'path']) this.show(s, false)
      this.show('appearance', true)
      return
    }
    const id = one ? attr(one.src, 'id')?.value : undefined
    this.title.textContent = one ? `Selected: ${id ?? `<${one.src.name}>`}` : `${items.length} objects selected`
    this.f.id.disabled = !one
    set('id', id ?? '')
    const root = c.root
    const graphics = items.map((x) => x.el).filter((e): e is SVGGraphicsElement => !!e && isGraphic(e) && e !== root)
    const geo = root && graphics.length ? (graphics.length === 1 ? rootBox(graphics[0], root) : unionBox(graphics, root)) : null
    for (const k of ['x', 'y', 'width', 'height', 'rotation', 'skewX', 'skewY']) this.f[k].disabled = !geo
    const rr = (n: number) => String(Math.round(n * 100) / 100)
    if (geo) {
      set('x', rr(geo.x))
      set('y', rr(geo.y))
      set('width', rr(geo.width))
      set('height', rr(geo.height))
      set('rotation', graphics.length === 1 ? rr(decompose(toRoot(graphics[0], root!)).rotate) : '0')
    } else for (const k of ['x', 'y', 'width', 'height', 'rotation']) set(k, '')
    // appearance shows the first item's own values (or what it inherits, as a hint)
    const first = items[0]
    const fel = first.el && isGraphic(first.el) ? first.el : null
    for (const k of ['fill', 'stroke']) {
      const v = attr(first.src, k)?.value ?? ''
      set(k, v)
      const computed = fel ? getComputedStyle(fel).getPropertyValue(k) : ''
      ;(this.f[k] as HTMLInputElement).placeholder = v ? '' : computed && computed !== 'none' ? `inherited: ${computed}` : 'none'
      this.f[`${k}Swatch`].value = toHex(v && !v.startsWith('url') ? v : computed && computed !== 'none' && !computed.startsWith('url') ? computed : '#000000')
    }
    set('stroke-width', attr(first.src, 'stroke-width')?.value ?? '')
    const op = attr(first.src, 'opacity')?.value
    set('opacity', op ? rr(parseFloat(op) * 100) : '')
    set('mix-blend-mode', attr(first.src, 'mix-blend-mode')?.value ?? 'normal')
    // text
    const isText = !!one && one.src.name === 'text'
    this.show('text', isText)
    if (isText && one.el) {
      set('content', one.el.textContent ?? '')
      for (const k of ['font-family', 'font-size', 'font-weight', 'text-anchor']) set(k, attr(one.src, k)?.value ?? '')
    }
    const isRect = !!one && one.src.name === 'rect'
    this.show('rect', isRect)
    if (isRect) set('rx', attr(one.src, 'rx')?.value ?? '')
    const shape = items.some((x) => SHAPES.includes(x.src.name))
    this.show('path', shape)
    this.el.querySelector<HTMLElement>('.btns.nodes')!.hidden = !c.nodes.editing
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('.btns.nodes button')) b.disabled = !c.nodes.selected && b.dataset.action !== 'closePath'
    this.el.querySelector<HTMLButtonElement>('[data-action=toPath]')!.hidden = !items.some((x) => SHAPES.includes(x.src.name) && x.src.name !== 'path')
    this.el.querySelector<HTMLButtonElement>('[data-action=simplify]')!.hidden = !items.some((x) => x.src.name === 'path')
    this.el.querySelector<HTMLButtonElement>('[data-action=editNodes]')!.hidden = c.nodes.editing || !one || !SHAPES.includes(one.src.name)
  }
}
