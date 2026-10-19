import { attr, type SrcElement } from './sourceMap'

/**
 * The layers panel: every element in the document as a tree, in source
 * order (top of the list is the back of the picture, like the code).
 * Rows can be selected (Shift or Ctrl for several), hidden, locked,
 * renamed, and dragged to a new place.
 */

const COLLAPSED_BY_DEFAULT = new Set(['defs', 'linearGradient', 'radialGradient', 'filter', 'clipPath', 'mask', 'pattern', 'marker', 'symbol', 'style'])

export interface LayerActions {
  select(i: number, mode: 'only' | 'toggle' | 'range'): void
  setVisible(i: number, on: boolean): void
  setLocked(i: number, on: boolean): void
  rename(i: number, id: string | null): void
  /** Move element i to be the child of `parent` before `before` (null = at the end). */
  move(i: number, parent: number, before: number | null): void
  addLayer(): void
}

export class Layers {
  readonly el: HTMLDivElement
  private list: HTMLDivElement
  private els: SrcElement[] = []
  private selected = new Set<number>()
  /** Collapsed groups, keyed by tag and id so they stay collapsed across edits. */
  private collapsed = new Set<string>()
  private open = new Set<string>()
  private dragging: number | null = null

  constructor(private act: LayerActions) {
    this.el = document.createElement('div')
    this.el.className = 'art-layers-wrap'
    this.el.innerHTML = `<div class="lbar"><button type="button" class="ibtn" data-l="add" title="New layer (a top-level group)">+ Layer</button></div><div class="art-layers" role="tree"></div>`
    this.list = this.el.querySelector('.art-layers')!
    this.el.querySelector('[data-l=add]')!.addEventListener('click', () => this.act.addLayer())
    this.list.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      const row = t.closest<HTMLElement>('[data-i]')
      if (!row) return
      const i = +row.dataset.i!
      const e2 = this.els[i]
      if (t.closest('.caret')) {
        const k = this.key(e2)
        if (this.isCollapsed(e2)) {
          this.collapsed.delete(k)
          this.open.add(k)
        } else {
          this.collapsed.add(k)
          this.open.delete(k)
        }
        return this.draw()
      }
      if (t.closest('.eye')) return this.act.setVisible(i, attr(e2, 'display')?.value === 'none')
      if (t.closest('.lck')) return this.act.setLocked(i, attr(e2, 'data-locked')?.value !== 'true')
      const me = e as MouseEvent
      this.act.select(i, me.shiftKey ? 'range' : me.ctrlKey || me.metaKey ? 'toggle' : 'only')
    })
    this.list.addEventListener('dblclick', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
      if (!row || (e.target as HTMLElement).closest('.eye, .lck, .caret')) return
      const i = +row.dataset.i!
      const cur = attr(this.els[i], 'id')?.value ?? ''
      const name = prompt('Name (id):', cur)
      if (name !== null && name.trim() !== cur) this.act.rename(i, name.trim() || null)
    })
    // drag and drop to reorder: drop on the top half of a row to go before it, inside a group on its bottom half
    this.list.addEventListener('dragstart', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
      if (!row || row.dataset.i === '0') return e.preventDefault()
      this.dragging = +row.dataset.i!
      e.dataTransfer?.setData('text/plain', row.dataset.i!)
    })
    this.list.addEventListener('dragover', (e) => {
      if (this.dragging === null) return
      e.preventDefault()
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
      for (const r of this.list.querySelectorAll('.drop-before, .drop-into')) r.classList.remove('drop-before', 'drop-into')
      if (!row) return
      const target = this.els[+row.dataset.i!]
      const into = (target.name === 'g' || target.i === 0) && e.offsetY > row.offsetHeight / 2
      row.classList.add(into ? 'drop-into' : 'drop-before')
    })
    this.list.addEventListener('drop', (e) => {
      e.preventDefault()
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
      const i = this.dragging
      this.dragging = null
      if (!row || i === null) return this.draw()
      const target = this.els[+row.dataset.i!]
      const into = row.classList.contains('drop-into')
      // can't drop a group into itself
      for (let p: SrcElement | null = target; p; p = p.parent) if (p.i === i) return this.draw()
      if (into) this.act.move(i, target.i, null)
      else if (target.parent) this.act.move(i, target.parent.i, target.i)
    })
    this.list.addEventListener('dragend', () => {
      this.dragging = null
      this.draw()
    })
  }

  private key(e: SrcElement) {
    return `${e.name}#${attr(e, 'id')?.value ?? e.i}`
  }

  private isCollapsed(e: SrcElement) {
    const k = this.key(e)
    return this.collapsed.has(k) || (COLLAPSED_BY_DEFAULT.has(e.name) && !this.open.has(k))
  }

  update(els: SrcElement[], selected: number[]) {
    this.els = els
    this.selected = new Set(selected)
    // make sure the selection is visible
    for (const s of selected)
      for (let p = els[s]?.parent; p; p = p.parent) {
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
    const walk = (e: SrcElement, depth: number, hiddenAbove: boolean) => {
      const id = attr(e, 'id')?.value
      const kids = e.children.length > 0
      const collapsed = kids && this.isCollapsed(e)
      const hidden = attr(e, 'display')?.value === 'none'
      const locked = attr(e, 'data-locked')?.value === 'true'
      const sel = this.selected.has(e.i)
      rows.push(
        `<div class="layer${sel ? ' sel' : ''}${hidden || hiddenAbove ? ' off' : ''}" data-i="${e.i}" role="treeitem" aria-selected="${sel}"${kids ? ` aria-expanded="${!collapsed}"` : ''} draggable="${e.i !== 0}" style="padding-left:${6 + depth * 14}px">` +
          `<span class="caret">${kids ? (collapsed ? '▸' : '▾') : ''}</span>` +
          `<span class="lname">${esc(id ?? e.name)}</span>${id ? `<span class="ltag">${esc(e.name)}</span>` : ''}` +
          (e.i !== 0
            ? `<span class="sp"></span><button type="button" class="lck${locked ? ' on' : ''}" title="${locked ? 'Unlock' : 'Lock'}" aria-label="${locked ? 'Unlock' : 'Lock'}">${locked ? '🔒' : '🔓'}</button><button type="button" class="eye${hidden ? ' on' : ''}" title="${hidden ? 'Show' : 'Hide'}" aria-label="${hidden ? 'Show' : 'Hide'}">${hidden ? '◌' : '●'}</button>`
            : '') +
          `</div>`,
      )
      if (kids && !collapsed) for (const c of e.children) walk(c, depth + 1, hiddenAbove || hidden)
    }
    if (this.els[0]) walk(this.els[0], 0, false)
    this.list.innerHTML = rows.join('')
    this.list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' })
  }
}
