import { attr, type SrcElement } from './sourceMap'

/** The layers panel: every element in the document as a tree, in source order. */

const COLLAPSED_BY_DEFAULT = new Set(['defs', 'linearGradient', 'radialGradient', 'filter', 'clipPath', 'mask', 'pattern', 'marker', 'symbol', 'style'])

export class Layers {
  readonly el: HTMLDivElement
  private els: SrcElement[] = []
  private selected: number | null = null
  /** Collapsed groups, keyed by tag and id so they stay collapsed across edits. */
  private collapsed = new Set<string>()
  private open = new Set<string>()
  onSelect: (i: number) => void = () => {}

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'art-layers'
    this.el.setAttribute('role', 'tree')
    this.el.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
      if (!row) return
      const i = +row.dataset.i!
      if ((e.target as HTMLElement).closest('.caret')) {
        const k = this.key(this.els[i])
        if (this.isCollapsed(this.els[i])) {
          this.collapsed.delete(k)
          this.open.add(k)
        } else {
          this.collapsed.add(k)
          this.open.delete(k)
        }
        this.draw()
      } else this.onSelect(i)
    })
  }

  private key(e: SrcElement) {
    return `${e.name}#${attr(e, 'id')?.value ?? e.i}`
  }

  private isCollapsed(e: SrcElement) {
    const k = this.key(e)
    return this.collapsed.has(k) || (COLLAPSED_BY_DEFAULT.has(e.name) && !this.open.has(k))
  }

  update(els: SrcElement[], selected: number | null) {
    this.els = els
    this.selected = selected
    // make sure the selection is visible
    for (let p = selected !== null ? els[selected]?.parent : null; p; p = p.parent) {
      if (this.isCollapsed(p)) {
        this.collapsed.delete(this.key(p))
        this.open.add(this.key(p))
      }
    }
    this.draw()
  }

  private draw() {
    const rows: string[] = []
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const walk = (e: SrcElement, depth: number) => {
      const id = attr(e, 'id')?.value
      const kids = e.children.length > 0
      const collapsed = kids && this.isCollapsed(e)
      rows.push(
        `<div class="layer${e.i === this.selected ? ' sel' : ''}" data-i="${e.i}" role="treeitem" aria-selected="${e.i === this.selected}"${kids ? ` aria-expanded="${!collapsed}"` : ''} style="padding-left:${6 + depth * 14}px">` +
          `<span class="caret">${kids ? (collapsed ? '▸' : '▾') : ''}</span>` +
          `<span class="lname">${esc(id ?? e.name)}</span>${id ? `<span class="ltag">${esc(e.name)}</span>` : ''}</div>`,
      )
      if (kids && !collapsed) for (const c of e.children) walk(c, depth + 1)
    }
    if (this.els[0]) walk(this.els[0], 0)
    this.el.innerHTML = rows.join('')
    this.el.querySelector('.sel')?.scrollIntoView({ block: 'nearest' })
  }
}
