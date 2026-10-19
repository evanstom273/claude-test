import { isGraphic, rootBox, rootRotation } from './geometry'
import { attr, type SrcElement } from './sourceMap'

/**
 * The properties inspector for the selected element. Numbers are in artwork
 * units; changes apply when you press Enter or leave the field.
 */

export type InspectorChange = { kind: 'x' | 'y' | 'width' | 'height' | 'rotation'; value: number } | { kind: 'attr'; name: string; value: string | null; live?: boolean }

const ctx = document.createElement('canvas').getContext('2d')!
/** Any CSS colour as #rrggbb, for the colour swatch. */
function toHex(c: string) {
  ctx.fillStyle = '#000000'
  ctx.fillStyle = c
  const v = ctx.fillStyle
  if (v.startsWith('#')) return v
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v)
  return m ? `#${[m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('')}` : '#000000'
}

export class Inspector {
  readonly el: HTMLDivElement
  private f: Record<string, HTMLInputElement> = {}
  private title: HTMLDivElement
  onChange: (c: InspectorChange) => void = () => {}

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'art-inspector'
    const num = (k: string, label: string) => `<label class="fld"><span>${label}</span><input data-k="${k}" type="number" step="any" inputmode="decimal"></label>`
    const color = (k: string, label: string) =>
      `<label class="fld"><span>${label}</span><span class="color"><input data-k="${k}Swatch" type="color" aria-label="${label} colour"><input data-k="${k}" type="text" spellcheck="false" placeholder="none"></span></label>`
    this.el.innerHTML = `
      <div class="ititle">Nothing selected</div>
      <div class="ibody">
        <label class="fld"><span>ID</span><input data-k="id" type="text" spellcheck="false" placeholder="(no id)"></label>
        <div class="pair">${num('x', 'X')}${num('y', 'Y')}</div>
        <div class="pair">${num('width', 'Width')}${num('height', 'Height')}</div>
        ${num('rotation', 'Rotation (°)')}
        <hr>
        ${color('fill', 'Fill')}
        ${color('stroke', 'Stroke')}
      </div>`
    this.title = this.el.querySelector('.ititle')!
    for (const i of this.el.querySelectorAll<HTMLInputElement>('input')) this.f[i.dataset.k!] = i
    for (const k of ['x', 'y', 'width', 'height', 'rotation'] as const) {
      this.f[k].addEventListener('change', () => {
        const v = parseFloat(this.f[k].value)
        if (Number.isFinite(v)) this.onChange({ kind: k, value: v })
      })
    }
    this.f.id.addEventListener('change', () => this.onChange({ kind: 'attr', name: 'id', value: this.f.id.value.trim() || null }))
    for (const k of ['fill', 'stroke']) {
      this.f[k].addEventListener('change', () => this.onChange({ kind: 'attr', name: k, value: this.f[k].value.trim() || null }))
      // the swatch previews while you pick, then writes the code when you let go
      this.f[`${k}Swatch`].addEventListener('input', () => this.onChange({ kind: 'attr', name: k, value: this.f[`${k}Swatch`].value, live: true }))
      this.f[`${k}Swatch`].addEventListener('change', () => this.onChange({ kind: 'attr', name: k, value: this.f[`${k}Swatch`].value }))
    }
    this.update(null, null, null)
  }

  update(src: SrcElement | null, el: Element | null, root: SVGSVGElement | null) {
    const editing = document.activeElement instanceof HTMLInputElement && this.el.contains(document.activeElement) && document.activeElement.type !== 'color'
    const set = (k: string, v: string) => {
      if (!(editing && document.activeElement === this.f[k])) this.f[k].value = v
    }
    this.el.classList.toggle('empty', !src)
    if (!src) {
      this.title.textContent = 'Nothing selected'
      for (const i of Object.values(this.f)) i.disabled = true
      return
    }
    const id = attr(src, 'id')?.value
    this.title.textContent = `Selected: ${id ?? `<${src.name}>`}`
    this.f.id.disabled = false
    set('id', id ?? '')
    const geo = el && root && isGraphic(el) && el !== root ? rootBox(el, root) : null
    for (const k of ['x', 'y', 'width', 'height', 'rotation']) this.f[k].disabled = !geo
    if (geo && el && root && isGraphic(el)) {
      const r = (n: number) => String(Math.round(n * 100) / 100)
      set('x', r(geo.x))
      set('y', r(geo.y))
      set('width', r(geo.width))
      set('height', r(geo.height))
      set('rotation', r(rootRotation(el, root)))
    } else for (const k of ['x', 'y', 'width', 'height', 'rotation']) set(k, '')
    for (const k of ['fill', 'stroke']) {
      const on = !!el && isGraphic(el)
      this.f[k].disabled = !on
      this.f[`${k}Swatch`].disabled = !on
      const v = attr(src, k)?.value ?? ''
      set(k, v)
      const computed = el && on ? getComputedStyle(el).getPropertyValue(k) : ''
      this.f[k].placeholder = v ? '' : computed && computed !== 'none' ? `inherited: ${computed}` : 'none'
      this.f[`${k}Swatch`].value = toHex(v && !v.startsWith('url') ? v : computed && computed !== 'none' && !computed.startsWith('url') ? computed : '#000000')
    }
  }
}
