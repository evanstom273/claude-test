import { autocompletion } from '@codemirror/autocomplete'
import { indentWithTab, redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { xml } from '@codemirror/lang-xml'
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { EditorState, type Text } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import './art.css'
import { Preview } from './preview'
import { deleteArtwork, getArtwork, getDraft, listArtworks, newId, putArtwork, putDraft, type Artwork } from './store'
import { xmlSchema } from './svgSchema'
import { formatSvg, parseSvg, type Issue } from './validate'

/**
 * Art Studio, phase 1: an SVG source editor with a live canvas preview.
 * The code is the document; the canvas always shows its last valid state.
 */

const BLANK = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">

</svg>
`

type Layout = 'split' | 'stacked' | 'code' | 'canvas'

const ICONS: Record<string, string> = {
  new: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14h6"/>',
  open: '<path d="M3 7V5h7l2 2h9v12H3zM3 9h18"/>',
  save: '<path d="M5 3h12l3 3v15H5zM8 3v5h8V3M8 21v-7h8v7"/>',
  saveAs: '<path d="M5 3h12l3 3v6M5 3v18h7M8 3v5h8V3M15 21l6-6-2-2-6 6v2z"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5M4 19h16"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5M4 19h16"/>',
  undo: '<path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h3"/>',
  format: '<path d="M4 6h16M8 10h12M8 14h12M4 18h16"/>',
  zoomOut: '<circle cx="10" cy="10" r="6"/><path d="M7 10h6M15 15l5 5"/>',
  zoomIn: '<circle cx="10" cy="10" r="6"/><path d="M7 10h6M10 7v6M15 15l5 5"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  grid: '<path d="M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16"/>',
  preview: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  split: '<path d="M3 5h18v14H3zM12 5v14"/>',
  stacked: '<path d="M3 5h18v14H3zM3 12h18"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
  canvas: '<path d="M3 5h18v14H3zM7 15l3-4 3 3 2-2 3 3"/>',
}

const icon = (name: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`

export class ArtStudio {
  readonly root: HTMLDivElement
  private view: EditorView
  private preview = new Preview()
  private doc = { id: null as string | null, name: 'Untitled', saved: BLANK }
  private issues: { errors: Issue[]; warnings: Issue[] } = { errors: [], warnings: [] }
  private renderTimer = 0
  private draftTimer = 0
  private layout: Layout
  private grid = false
  private clean = false
  private $: Record<string, HTMLElement> = {}

  constructor() {
    this.root = document.createElement('div')
    this.root.className = 'art'
    const btn = (id: string, label: string, extra = '') => `<button type="button" data-act="${id}" title="${label}" aria-label="${label}" ${extra}>${icon(id)}</button>`
    this.root.innerHTML = `
      <div class="art-toolbar" role="toolbar" aria-label="Art Studio">
        <div class="grp">${btn('new', 'New artwork')}${btn('open', 'Open artwork (Ctrl+O)')}${btn('save', 'Save (Ctrl+S)')}${btn('saveAs', 'Save As (Ctrl+Shift+S)')}${btn('import', 'Import SVG file')}${btn('export', 'Export SVG file')}</div>
        <div class="grp">${btn('undo', 'Undo (Ctrl+Z)')}${btn('redo', 'Redo (Ctrl+Shift+Z)')}${btn('format', 'Format code (Shift+Alt+F)')}</div>
        <div class="grp">${btn('zoomOut', 'Zoom out')}<button type="button" data-act="zoom100" class="zoom" title="Zoom to 100%">100%</button>${btn('zoomIn', 'Zoom in')}${btn('fit', 'Fit artwork')}</div>
        <div class="grp">${btn('grid', 'Grid', 'aria-pressed="false"')}${btn('preview', 'Preview mode: hide editor overlays', 'aria-pressed="false"')}</div>
        <div class="grp" role="radiogroup" aria-label="Layout">${btn('split', 'Side by side')}${btn('stacked', 'Stacked')}${btn('code', 'Code only')}${btn('canvas', 'Canvas only')}</div>
      </div>
      <div class="art-work">
        <div class="art-code"></div>
        <div class="art-resizer" role="separator" aria-label="Resize panels" tabindex="0"></div>
        <div class="art-view"></div>
      </div>
      <div class="art-status">
        <span class="name"></span>
        <button type="button" class="check"></button>
      </div>
      <div class="art-issues" hidden></div>
      <input type="file" accept=".svg,image/svg+xml" hidden />`
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-act]')) this.$[el.dataset.act!] = el
    this.$.work = this.root.querySelector('.art-work')!
    this.$.name = this.root.querySelector('.name')!
    this.$.check = this.root.querySelector('.check')!
    this.$.issues = this.root.querySelector('.art-issues')!
    this.$.file = this.root.querySelector('input[type=file]')!
    this.root.querySelector('.art-view')!.appendChild(this.preview.host)
    this.preview.onZoom = (z) => (this.$.zoom100.textContent = `${Math.round(z * 100)}%`)

    this.view = new EditorView({
      parent: this.root.querySelector('.art-code')!,
      state: this.state(BLANK),
    })

    let saved: Layout | null = null
    try {
      saved = localStorage.getItem('art.layout') as Layout | null
    } catch {
      // storage blocked: fall back to the default
    }
    this.layout = saved ?? (innerWidth < 760 ? 'stacked' : 'split')
    this.setLayout(this.layout)
    this.bindUi()
    void this.restore()
  }

  private state(source: string) {
    return EditorState.create({
      doc: source,
      extensions: [
        basicSetup,
        keymap.of([
          indentWithTab,
          { key: 'Shift-Alt-f', run: () => (this.format(), true) },
          { key: 'Mod-s', run: () => (void this.save(), true), preventDefault: true },
          { key: 'Mod-Shift-s', run: () => (void this.saveAs(), true), preventDefault: true },
          { key: 'Mod-o', run: () => (void this.open(), true), preventDefault: true },
        ]),
        xml(xmlSchema()),
        autocompletion(),
        lintGutter(),
        oneDark,
        EditorView.theme({ '&': { height: '100%', fontSize: '13px' }, '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' } }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) this.changed()
          if (u.docChanged || u.transactions.length) this.updateButtons()
        }),
      ],
    })
  }

  // ---- document ----

  get source() {
    return this.view.state.doc.toString()
  }

  private get dirty() {
    return this.source !== this.doc.saved
  }

  /** Load a document fresh, with its own undo history. */
  private load(source: string, id: string | null, name: string, saved: string) {
    this.doc = { id, name, saved }
    this.view.setState(this.state(source))
    this.render()
    this.updateButtons()
    this.preview.fit()
  }

  private changed() {
    this.updateName()
    clearTimeout(this.renderTimer)
    this.renderTimer = window.setTimeout(() => this.render(), 200)
    clearTimeout(this.draftTimer)
    this.draftTimer = window.setTimeout(() => void putDraft({ id: this.doc.id, name: this.doc.name, svg: this.source }), 800)
  }

  /** Validate and redraw. Invalid source keeps the last good picture on the canvas. */
  private render() {
    const r = parseSvg(this.source)
    if (r.ok) {
      this.preview.show(r.svg)
      this.issues = { errors: [], warnings: r.warnings }
    } else this.issues = { errors: r.errors, warnings: [] }
    this.view.dispatch(setDiagnostics(this.view.state, this.diagnostics(this.view.state.doc)))
    this.updateCheck()
  }

  private diagnostics(doc: Text): Diagnostic[] {
    return this.issues.errors.map((e) => {
      const line = doc.line(Math.max(1, Math.min(doc.lines, e.line ?? 1)))
      const from = Math.min(line.to, line.from + Math.max(0, (e.col ?? 1) - 1))
      return { from: Math.max(line.from, from - 1), to: Math.max(from, Math.min(line.to, from + 1)), severity: 'error', message: e.message }
    })
  }

  // ---- file operations ----

  private async restore() {
    try {
      const draft = await getDraft()
      if (!draft) return this.load(BLANK, null, 'Untitled', BLANK)
      const art = draft.id ? await getArtwork(draft.id) : undefined
      this.load(draft.svg, art ? draft.id : null, draft.name, art?.svg ?? (draft.svg === BLANK ? BLANK : ''))
      if (this.dirty) this.flash('Restored your unsaved work')
    } catch {
      this.load(BLANK, null, 'Untitled', BLANK)
    }
  }

  private confirmDiscard() {
    return !this.dirty || confirm(`Discard unsaved changes to “${this.doc.name}”?`)
  }

  newArtwork() {
    if (!this.confirmDiscard()) return
    this.load(BLANK, null, 'Untitled', BLANK)
    void putDraft({ id: null, name: 'Untitled', svg: BLANK })
  }

  async save() {
    if (!this.doc.id) return this.saveAs()
    const prev = await getArtwork(this.doc.id)
    const now = Date.now()
    await putArtwork({ id: this.doc.id, name: this.doc.name, svg: this.source, created: prev?.created ?? now, updated: now })
    this.doc.saved = this.source
    this.updateName()
    this.flash(this.issues.errors.length ? 'Saved (the SVG still has an error)' : 'Saved')
  }

  async saveAs() {
    const name = prompt('Save artwork as:', this.doc.id ? `${this.doc.name} copy` : this.doc.name)?.trim()
    if (!name) return
    this.doc.id = newId()
    this.doc.name = name
    await this.save()
    void putDraft({ id: this.doc.id, name, svg: this.source })
  }

  async open() {
    const list = await listArtworks()
    const dlg = document.createElement('dialog')
    dlg.className = 'art-dialog'
    dlg.innerHTML = `<form method="dialog"><h3>Open artwork</h3><div class="list"></div><button value="cancel">Close</button></form>`
    const box = dlg.querySelector('.list')!
    if (!list.length) box.innerHTML = '<p class="empty">Nothing saved yet. Use Save to keep your artwork here.</p>'
    const row = (a: Artwork) => {
      const r = document.createElement('div')
      r.className = 'row'
      const p = parseSvg(a.svg)
      const thumb = p.ok ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(p.svg))}` : ''
      r.innerHTML = `<button type="button" class="pick"><span class="thumb">${thumb ? `<img alt="" src="${thumb}">` : '⚠'}</span><span class="meta"><b></b><small>${new Date(a.updated).toLocaleString()}</small></span></button><button type="button" class="del" aria-label="Delete" title="Delete">✕</button>`
      r.querySelector('b')!.textContent = a.name
      r.querySelector('.pick')!.addEventListener('click', () => {
        if (!this.confirmDiscard()) return
        dlg.close()
        this.load(a.svg, a.id, a.name, a.svg)
        void putDraft({ id: a.id, name: a.name, svg: a.svg })
      })
      r.querySelector('.del')!.addEventListener('click', async () => {
        if (!confirm(`Delete “${a.name}”? This can't be undone.`)) return
        await deleteArtwork(a.id)
        if (this.doc.id === a.id) this.doc.id = null
        r.remove()
      })
      return r
    }
    for (const a of list) box.appendChild(row(a))
    document.body.appendChild(dlg)
    dlg.addEventListener('close', () => dlg.remove())
    dlg.showModal()
  }

  private importFile(file: File) {
    if (!this.confirmDiscard()) return
    file.text().then((text) => {
      const name = file.name.replace(/\.svg$/i, '') || 'Imported'
      this.load(text, null, name, '')
      void putDraft({ id: null, name, svg: text })
    })
  }

  private export() {
    if (this.issues.errors.length) return this.flash('Fix the error before exporting')
    const blob = new Blob([this.source], { type: 'image/svg+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${this.doc.name.replace(/[\\/:*?"<>|]+/g, '_') || 'artwork'}.svg`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  private format() {
    const out = formatSvg(this.source)
    if (out === null) return this.flash('Fix the error before formatting')
    if (out !== this.source) this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: out } })
  }

  // ---- interface ----

  private setLayout(l: Layout) {
    this.layout = l
    this.$.work.dataset.layout = l
    for (const k of ['split', 'stacked', 'code', 'canvas']) this.$[k].setAttribute('aria-pressed', String(k === l))
    try {
      localStorage.setItem('art.layout', l)
    } catch {
      // not remembered, that's fine
    }
  }

  private bindUi() {
    const acts: Record<string, () => void> = {
      new: () => this.newArtwork(),
      open: () => void this.open(),
      save: () => void this.save(),
      saveAs: () => void this.saveAs(),
      import: () => this.$.file.click(),
      export: () => this.export(),
      undo: () => (undo(this.view), this.view.focus()),
      redo: () => (redo(this.view), this.view.focus()),
      format: () => this.format(),
      zoomOut: () => this.preview.zoomBy(1 / 1.25),
      zoomIn: () => this.preview.zoomBy(1.25),
      zoom100: () => this.preview.zoomTo(1),
      fit: () => this.preview.fit(),
      grid: () => {
        this.grid = !this.grid
        this.preview.setGrid(this.grid)
        this.$.grid.setAttribute('aria-pressed', String(this.grid))
      },
      preview: () => {
        this.clean = !this.clean
        this.preview.setClean(this.clean)
        this.$.preview.setAttribute('aria-pressed', String(this.clean))
      },
      split: () => this.setLayout('split'),
      stacked: () => this.setLayout('stacked'),
      code: () => this.setLayout('code'),
      canvas: () => this.setLayout('canvas'),
    }
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
      if (b) acts[b.dataset.act!]?.()
    })
    this.$.file.addEventListener('change', () => {
      const f = (this.$.file as HTMLInputElement).files?.[0]
      if (f) this.importFile(f)
      ;(this.$.file as HTMLInputElement).value = ''
    })
    this.$.check.addEventListener('click', () => {
      const e = this.issues.errors[0]
      if (e?.line) {
        const line = this.view.state.doc.line(Math.min(e.line, this.view.state.doc.lines))
        this.view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
        this.view.focus()
      } else if (this.issues.warnings.length) this.$.issues.hidden = !this.$.issues.hidden
    })
    // shortcuts that work even when the editor doesn't have focus
    document.addEventListener('keydown', (e) => {
      if (!this.root.isConnected || !this.root.offsetParent) return
      const mod = e.ctrlKey || e.metaKey
      if (!mod || this.view.hasFocus) return
      const k = e.key.toLowerCase()
      if (k === 's') {
        e.preventDefault()
        void (e.shiftKey ? this.saveAs() : this.save())
      } else if (k === 'o') {
        e.preventDefault()
        void this.open()
      } else if (k === 'z' && !(e.target as HTMLElement).closest('input, textarea')) {
        e.preventDefault()
        if (e.shiftKey) redo(this.view)
        else undo(this.view)
      } else if (k === 'y' && !(e.target as HTMLElement).closest('input, textarea')) {
        e.preventDefault()
        redo(this.view)
      }
    })
    // drag the divider to resize the panels
    const resizer = this.root.querySelector<HTMLElement>('.art-resizer')!
    resizer.addEventListener('pointerdown', (e) => {
      resizer.setPointerCapture(e.pointerId)
      const move = (ev: PointerEvent) => {
        const r = this.$.work.getBoundingClientRect()
        const k = this.layout === 'stacked' ? (ev.clientY - r.top) / r.height : (ev.clientX - r.left) / r.width
        this.$.work.style.setProperty('--split', `${Math.round(Math.max(0.15, Math.min(0.85, k)) * 1000) / 10}%`)
      }
      const done = () => {
        resizer.removeEventListener('pointermove', move)
        resizer.removeEventListener('pointerup', done)
        resizer.removeEventListener('pointercancel', done)
      }
      resizer.addEventListener('pointermove', move)
      resizer.addEventListener('pointerup', done)
      resizer.addEventListener('pointercancel', done)
    })
    resizer.addEventListener('keydown', (e) => {
      const cur = parseFloat(getComputedStyle(this.$.work).getPropertyValue('--split')) || 50
      const step = { ArrowLeft: -5, ArrowUp: -5, ArrowRight: 5, ArrowDown: 5 }[e.key]
      if (step) this.$.work.style.setProperty('--split', `${Math.max(15, Math.min(85, cur + step))}%`)
    })
  }

  private updateButtons() {
    ;(this.$.undo as HTMLButtonElement).disabled = undoDepth(this.view.state) === 0
    ;(this.$.redo as HTMLButtonElement).disabled = redoDepth(this.view.state) === 0
  }

  private updateName() {
    this.$.name.textContent = `${this.doc.name}${this.dirty ? ' •' : ''}`
    this.$.name.title = this.dirty ? 'Unsaved changes (kept on this device automatically)' : 'Saved'
  }

  private updateCheck() {
    const { errors, warnings } = this.issues
    const c = this.$.check
    c.className = `check ${errors.length ? 'bad' : warnings.length ? 'warn' : 'ok'}`
    if (errors.length) {
      const e = errors[0]
      c.textContent = `✕ ${e.line ? `Line ${e.line}: ` : ''}${e.message}. Showing the last valid version.`
    } else if (warnings.length) c.textContent = `⚠ ${warnings.length} warning${warnings.length > 1 ? 's' : ''}`
    else c.textContent = '✓ Valid SVG'
    this.$.issues.innerHTML = ''
    for (const w of warnings) {
      const li = document.createElement('div')
      li.textContent = `⚠ ${w.message}`
      this.$.issues.appendChild(li)
    }
    if (!warnings.length) this.$.issues.hidden = true
    this.updateName()
  }

  private flash(msg: string) {
    const t = document.createElement('div')
    t.className = 'art-toast'
    t.textContent = msg
    this.root.appendChild(t)
    setTimeout(() => t.remove(), 1800)
  }

  /** Call when the panel becomes visible, so the canvas can size itself. */
  shown() {
    this.view.requestMeasure()
  }
}
