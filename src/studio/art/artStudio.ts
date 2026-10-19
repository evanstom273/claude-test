import { autocompletion } from '@codemirror/autocomplete'
import { indentWithTab, redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { xml } from '@codemirror/lang-xml'
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { Annotation, EditorState, type ChangeSpec, type Text } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import './art.css'
import { AiPanel, type AiTarget } from './aiPanel'
import { isGraphic, moved, ownMatrix, resized, rootBox, rootRotation, rotated, transformString } from './geometry'
import { Inspector, type InspectorChange } from './inspector'
import { Layers } from './layers'
import { Preview, type Tool } from './preview'
import { attr, elementAt, scan, setAttrChange, type SrcElement } from './sourceMap'
import { deleteArtwork, getArtwork, getDraft, listArtworks, newId, putArtwork, putDraft, type Artwork } from './store'
import { xmlSchema } from './svgSchema'
import { artSize, formatSvg, parseSvg, SVG_NS, type Issue } from './validate'

/**
 * Art Studio: SVG source and canvas kept in step. The code is the document;
 * the canvas, layers and inspector read it and write back to exactly the
 * characters they change, so every edit is undoable and nothing else moves.
 */

const BLANK = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">

</svg>
`

type SourcePlace = 'bottom' | 'side' | 'hidden'
type Tab = 'layers' | 'inspector' | 'source' | 'ai'

/** Marks editor changes made by the studio itself, rather than typed. */
const fromStudio = Annotation.define<boolean>()

const ICONS: Record<string, string> = {
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.5-.9 1.2-1.7-.4-1 .2-2.3 1.5-2.3H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="14.5" cy="7" r="1.2"/>',
  undo: '<path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h3"/>',
  save: '<path d="M5 3h12l3 3v15H5zM8 3v5h8V3M8 21v-7h8v7"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  select: '<path d="M5 3l14 8-6 2-3 6z"/>',
  hand: '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.6-1.5L8 15"/>',
  zoomOut: '<path d="M5 12h14"/>',
  zoomIn: '<path d="M5 12h14M12 5v14"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  max: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  format: '<path d="M4 6h16M8 10h12M8 14h12M4 18h16"/>',
}
const icon = (n: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`

export class ArtStudio {
  readonly root: HTMLDivElement
  private view: EditorView
  private preview = new Preview()
  private layers = new Layers()
  private inspector = new Inspector()
  private ai: AiPanel
  private doc = { id: null as string | null, name: 'Untitled', saved: BLANK }
  private issues: { errors: Issue[]; warnings: Issue[] } = { errors: [], warnings: [] }
  /** The source map of the last valid render. Only meaningful while `mapped` matches the source. */
  private els: SrcElement[] = []
  private mapped = ''
  /** The selection, as the source position where its tag starts, so it follows edits. */
  private selPos: number | null = null
  private sel: number | null = null
  private dragBase: DOMMatrix | null = null
  private proposal: { from: number; to: number; insert: string } | null = null
  private renderTimer = 0
  private draftTimer = 0
  private place: SourcePlace = 'bottom'
  private grid = false
  private clean = false
  private $: Record<string, HTMLElement> = {}

  constructor() {
    this.root = document.createElement('div')
    this.root.className = 'art'
    this.root.innerHTML = `
      <header class="art-head">
        <span class="logo">${icon('palette')}</span><h2>Art Studio</h2>
        <span class="sp"></span>
        <button type="button" data-act="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${icon('undo')}</button>
        <button type="button" data-act="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon('redo')}</button>
        <button type="button" data-act="save" title="Save (Ctrl+S)" aria-label="Save">${icon('save')}</button>
        <button type="button" data-act="menu" title="More" aria-label="More" aria-haspopup="menu" aria-expanded="false">${icon('more')}</button>
        <div class="art-menu" role="menu" hidden>
          <button type="button" role="menuitem" data-act="new">New artwork</button>
          <button type="button" role="menuitem" data-act="open">Open…</button>
          <button type="button" role="menuitem" data-act="saveAs">Save as…</button>
          <button type="button" role="menuitem" data-act="import">Import SVG file…</button>
          <button type="button" role="menuitem" data-act="export">Export SVG file</button>
          <hr>
          <button type="button" role="menuitemcheckbox" data-act="grid" aria-checked="false">Grid</button>
          <button type="button" role="menuitemcheckbox" data-act="preview" aria-checked="false">Preview mode (hide overlays)</button>
          <hr>
          <button type="button" role="menuitemradio" data-act="srcBottom">Source below</button>
          <button type="button" role="menuitemradio" data-act="srcSide">Source beside canvas</button>
          <button type="button" role="menuitemradio" data-act="srcHidden">Hide source</button>
          <hr>
          <button type="button" role="menuitem" data-act="aiSettings">AI settings…</button>
        </div>
      </header>
      <div class="art-sub">
        <button type="button" class="chip file" data-act="saveAs" title="Rename / save as"></button>
        <span class="dims"></span>
        <span class="sp"></span>
        <span class="state"></span>
      </div>
      <div class="art-body">
        <aside class="col-left">
        <section class="p-tools" aria-label="Tools">
          <h3>Tools</h3>
          <div class="tools">
            <button type="button" data-tool="select" title="Select and move (V)" aria-label="Select">${icon('select')}</button>
            <button type="button" data-tool="hand" title="Pan (H)" aria-label="Pan">${icon('hand')}</button>
          </div>
        </section>
        <section class="p-layers" aria-label="Layers"><h3>Layers</h3></section>
        </aside>
        <section class="p-canvas" aria-label="Canvas">
          <div class="phead"><h3>Canvas</h3><span class="sp"></span>
            <button type="button" data-act="zoomOut" title="Zoom out" aria-label="Zoom out">${icon('zoomOut')}</button>
            <button type="button" data-act="zoom100" class="zoom" title="Zoom to 100%">100%</button>
            <button type="button" data-act="zoomIn" title="Zoom in" aria-label="Zoom in">${icon('zoomIn')}</button>
            <button type="button" data-act="fit" title="Fit artwork" aria-label="Fit artwork">${icon('fit')}</button>
          </div>
          <div class="canvas-slot"></div>
          <div class="pfoot"><span class="selinfo">Nothing selected</span><span class="sp"></span><span class="coords"></span></div>
        </section>
        <aside class="col-right">
        <section class="p-inspector" aria-label="Inspector"><h3>Inspector</h3></section>
        <section class="p-ai" aria-label="AI Art Assistant"></section>
        </aside>
        <section class="p-source" aria-label="SVG source">
          <div class="src-resize" role="separator" aria-label="Resize source panel" tabindex="0"></div>
          <div class="phead"><span class="ic">${icon('code')}</span><h3>SVG Source</h3><span class="sp"></span>
            <button type="button" class="check"></button>
            <button type="button" data-act="format" title="Format code (Shift+Alt+F)" aria-label="Format code">${icon('format')}</button>
            <button type="button" data-act="maxSrc" title="Full screen code" aria-label="Full screen code" aria-pressed="false">${icon('max')}</button>
          </div>
          <div class="art-issues" hidden></div>
          <div class="code"></div>
        </section>
        <nav class="tabs" role="tablist">
          <button type="button" role="tab" data-tab="layers">Layers</button>
          <button type="button" role="tab" data-tab="inspector">Inspector</button>
          <button type="button" role="tab" data-tab="source">Source</button>
          <button type="button" role="tab" data-tab="ai">AI</button>
        </nav>
      </div>
      <input type="file" accept=".svg,image/svg+xml" hidden />`
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-act]')) this.$[el.dataset.act!] ??= el
    Object.assign(this.$, {
      body: q('.art-body'),
      file: q('.file'),
      dims: q('.dims'),
      state: q('.state'),
      check: q('.check'),
      issues: q('.art-issues'),
      selinfo: q('.selinfo'),
      coords: q('.coords'),
      menuBox: q('.art-menu'),
      input: q('input[type=file]'),
    })
    q('.canvas-slot').appendChild(this.preview.host)
    q('.p-layers').appendChild(this.layers.el)
    q('.p-inspector').appendChild(this.inspector.el)
    this.ai = new AiPanel({
      source: () => this.source,
      selection: () => this.aiSelection(),
      propose: (t, r) => this.propose(t, r),
      accept: () => this.acceptProposal(),
      reject: () => this.rejectProposal(),
    })
    q('.p-ai').appendChild(this.ai.el)

    this.view = new EditorView({ parent: q('.p-source .code'), state: this.state(BLANK) })

    this.preview.onZoom = (z) => (this.$.zoom100.textContent = `${Math.round(z * 100)}%`)
    this.preview.onPointer = (x, y) => (this.$.coords.textContent = `X: ${Math.round(x)}  Y: ${Math.round(y)}`)
    this.preview.onTap = (el, deep) => this.tap(el, deep)
    this.preview.onDrag = (_el, dx, dy, done) => this.dragSelected(dx, dy, done)
    this.layers.onSelect = (i) => this.select(i, true)
    this.inspector.onChange = (c) => this.inspect(c)

    let pref: { place?: SourcePlace; tab?: Tab } = {}
    try {
      pref = JSON.parse(localStorage.getItem('art.ui') ?? '{}')
    } catch {
      // not remembered
    }
    this.setPlace(pref.place ?? 'bottom')
    this.setTab(pref.tab ?? 'source')
    this.setTool('select')
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
          if (u.docChanged) {
            if (this.selPos !== null) this.selPos = u.changes.mapPos(this.selPos, 1)
            const studio = u.transactions.some((t) => t.annotation(fromStudio))
            this.changed(!studio)
          } else if (u.selectionSet && !u.transactions.some((t) => t.annotation(fromStudio)) && u.view.hasFocus) this.selectFromCode()
          this.updateButtons()
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
    this.selPos = null
    this.proposal = null
    this.view.setState(this.state(source))
    this.render()
    this.updateButtons()
    this.preview.fit()
  }

  private changed(typed: boolean) {
    this.updateName()
    if (this.proposal) {
      this.proposal = null
      this.preview.setBanner(null)
      this.ai.dropProposal()
    }
    clearTimeout(this.renderTimer)
    // typing waits for a pause; studio edits redraw at once
    if (typed) this.renderTimer = window.setTimeout(() => this.render(), 200)
    else this.render()
    clearTimeout(this.draftTimer)
    this.draftTimer = window.setTimeout(() => void putDraft({ id: this.doc.id, name: this.doc.name, svg: this.source }), 800)
  }

  /** Validate and redraw. Invalid source keeps the last good picture on the canvas. */
  private render() {
    clearTimeout(this.renderTimer)
    const src = this.source
    const r = parseSvg(src)
    if (r.ok) {
      this.preview.show(r.svg)
      this.issues = { errors: [], warnings: r.warnings }
      this.els = scan(src)
      this.mapped = src
      const s = artSize(r.svg)
      this.$.dims.textContent = `${Math.round(s.width)} × ${Math.round(s.height)}`
    } else this.issues = { errors: r.errors, warnings: [] }
    this.view.dispatch(setDiagnostics(this.view.state, this.diagnostics(this.view.state.doc)))
    this.updateCheck()
    this.resolveSelection()
  }

  private get valid() {
    return this.mapped === this.source
  }

  private diagnostics(doc: Text): Diagnostic[] {
    return this.issues.errors.map((e) => {
      const line = doc.line(Math.max(1, Math.min(doc.lines, e.line ?? 1)))
      const from = Math.min(line.to, line.from + Math.max(0, (e.col ?? 1) - 1))
      return { from: Math.max(line.from, from - 1), to: Math.max(from, Math.min(line.to, from + 1)), severity: 'error', message: e.message }
    })
  }

  /** Apply text changes made by the studio (not typed), as one undo step. */
  private edit(changes: ChangeSpec) {
    this.view.dispatch({ changes, annotations: fromStudio.of(true), userEvent: 'input.studio' })
  }

  // ---- selection ----

  private resolveSelection() {
    const e = this.valid && this.selPos !== null ? this.els.find((x) => x.start === this.selPos) : undefined
    this.sel = e ? e.i : null
    if (!e) this.selPos = null
    this.showSelection()
  }

  select(i: number | null, revealInCode = true) {
    const e = i !== null && this.valid ? this.els[i] : undefined
    this.sel = e ? e.i : null
    this.selPos = e ? e.start : null
    this.showSelection()
    if (e && revealInCode) {
      // highlight the tag in the code without stealing focus (no keyboard popping up on phones)
      this.view.dispatch({ selection: { anchor: e.start, head: e.openEnd }, effects: EditorView.scrollIntoView(e.start, { y: 'center' }), annotations: fromStudio.of(true) })
    }
  }

  private selectFromCode() {
    if (!this.valid) return
    const e = elementAt(this.els, this.view.state.selection.main.head)
    if (e && e.i !== this.sel) this.select(e.i, false)
  }

  private showSelection() {
    const e = this.sel !== null ? this.els[this.sel] : null
    const el = this.sel !== null ? this.preview.element(this.sel) : null
    this.preview.select(el)
    this.layers.update(this.els, this.sel)
    this.inspector.update(e, el, this.preview.root)
    const id = e ? attr(e, 'id')?.value : null
    this.$.selinfo.textContent = e ? `Selection: ${id ?? ''}${id ? ' ' : ''}${e.name === 'g' ? 'group' : `<${e.name}>`}` : 'Nothing selected'
    this.ai.refresh()
  }

  private tap(el: Element | null, deep: boolean) {
    if (!el) return this.select(null, false)
    let target = el
    if (!deep) {
      // a single tap picks the top-level object; tap again quickly to pick inside groups
      const sel = this.sel !== null ? this.preview.element(this.sel) : null
      if (sel && sel.contains(el)) return
      while (target.parentNode instanceof Element && target.parentNode !== this.preview.root) target = target.parentNode
    }
    const i = target.getAttribute('data-art-i')
    if (i !== null) this.select(+i)
  }

  // ---- editing from the canvas and inspector ----

  private writeTransform(i: number, m: DOMMatrix) {
    if (!this.valid) return
    const change = setAttrChange(this.els[i], 'transform', transformString(m), this.source)
    if (change) this.edit(change)
  }

  private dragSelected(dx: number, dy: number, done: boolean) {
    const el = this.sel !== null ? this.preview.element(this.sel) : null
    const root = this.preview.root
    if (!el || !root || !isGraphic(el) || el === root) return
    this.dragBase ??= ownMatrix(el)
    const m = moved(el, root, dx, dy, this.dragBase)
    if (done) {
      el.setAttribute('transform', this.dragBase.toString())
      this.dragBase = null
      this.writeTransform(this.sel!, m)
    } else {
      // move the picture live; the code is written once, when you let go
      const t = transformString(m)
      if (t) el.setAttribute('transform', t)
      else el.removeAttribute('transform')
      this.preview.drawSelection()
      this.inspector.update(this.els[this.sel!], el, root)
    }
  }

  private inspect(c: InspectorChange) {
    if (this.sel === null || !this.valid) return
    const i = this.sel
    const el = this.preview.element(i)
    const root = this.preview.root
    if (c.kind === 'attr') {
      if (c.live) {
        el?.setAttribute(c.name, c.value ?? '')
        return
      }
      const change = setAttrChange(this.els[i], c.name, c.value, this.source)
      if (change) this.edit(change)
      return
    }
    if (!el || !root || !isGraphic(el)) return
    const box = rootBox(el, root)
    if (!box) return
    let m: DOMMatrix
    if (c.kind === 'x') m = moved(el, root, c.value - box.x, 0)
    else if (c.kind === 'y') m = moved(el, root, 0, c.value - box.y)
    else if (c.kind === 'width') m = resized(el, root, box, Math.max(0.01, c.value), box.height)
    else if (c.kind === 'height') m = resized(el, root, box, box.width, Math.max(0.01, c.value))
    else m = rotated(el, root, c.value - rootRotation(el, root))
    this.writeTransform(i, m)
  }

  // ---- AI proposals ----

  private aiSelection(): AiTarget | null {
    if (this.sel === null || !this.valid) return null
    const e = this.els[this.sel]
    const id = attr(e, 'id')?.value
    if (e.i === 0) return { from: 0, to: this.source.length, text: this.source, label: 'the whole artwork', whole: true }
    return { from: e.start, to: e.end, text: this.source.slice(e.start, e.end), label: id ? `#${id}` : `<${e.name}>`, whole: false }
  }

  private propose(t: AiTarget, replacement: string): string | null {
    if (!t.whole) {
      const check = parseSvg(`<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink">${replacement}</svg>`)
      if (!check.ok) return check.errors[0].message
      if (!check.svg.firstElementChild) return 'it contained no SVG element'
    }
    const src = this.source
    const next = src.slice(0, t.from) + replacement + src.slice(t.to)
    const r = parseSvg(next)
    if (!r.ok) return r.errors[0].message
    this.proposal = { from: t.from, to: t.to, insert: replacement }
    this.preview.show(r.svg)
    this.preview.select(null)
    this.preview.setBanner('Previewing AI change')
    return null
  }

  private acceptProposal() {
    const p = this.proposal
    if (!p) return
    this.proposal = null
    this.preview.setBanner(null)
    this.edit(p)
  }

  private rejectProposal() {
    this.proposal = null
    this.preview.setBanner(null)
    this.render()
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
    dlg.innerHTML = `<form method="dialog"><h3>Open artwork</h3><div class="list"></div><div class="actions"><span></span><button value="cancel">Close</button></div></form>`
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
    void file.text().then((text) => {
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

  private savePrefs() {
    try {
      localStorage.setItem('art.ui', JSON.stringify({ place: this.place, tab: this.$.body.dataset.tab }))
    } catch {
      // not remembered, that's fine
    }
  }

  private setPlace(p: SourcePlace) {
    this.place = p
    this.$.body.dataset.src = p
    for (const [k, v] of [['srcBottom', 'bottom'], ['srcSide', 'side'], ['srcHidden', 'hidden']] as const) this.$[k].setAttribute('aria-checked', String(p === v))
    this.savePrefs()
  }

  private setTab(t: Tab) {
    this.$.body.dataset.tab = t
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === t))
    this.savePrefs()
    if (t === 'source') this.view.requestMeasure()
  }

  private setTool(t: Tool) {
    this.preview.setTool(t)
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t))
  }

  private menu(open: boolean) {
    this.$.menuBox.hidden = !open
    this.$.menu.setAttribute('aria-expanded', String(open))
  }

  private bindUi() {
    const acts: Record<string, () => void> = {
      new: () => this.newArtwork(),
      open: () => void this.open(),
      save: () => void this.save(),
      saveAs: () => void this.saveAs(),
      import: () => this.$.input.click(),
      export: () => this.export(),
      undo: () => undo(this.view),
      redo: () => redo(this.view),
      format: () => this.format(),
      zoomOut: () => this.preview.zoomBy(1 / 1.25),
      zoomIn: () => this.preview.zoomBy(1.25),
      zoom100: () => this.preview.zoomTo(1),
      fit: () => this.preview.fit(),
      grid: () => {
        this.grid = !this.grid
        this.preview.setGrid(this.grid)
        this.$.grid.setAttribute('aria-checked', String(this.grid))
      },
      preview: () => {
        this.clean = !this.clean
        this.preview.setClean(this.clean)
        this.$.preview.setAttribute('aria-checked', String(this.clean))
      },
      srcBottom: () => this.setPlace('bottom'),
      srcSide: () => this.setPlace('side'),
      srcHidden: () => this.setPlace('hidden'),
      maxSrc: () => {
        const on = this.$.body.dataset.max !== 'true'
        this.$.body.dataset.max = String(on)
        this.$.maxSrc.setAttribute('aria-pressed', String(on))
        this.view.requestMeasure()
      },
      aiSettings: () => this.ai.el.querySelector<HTMLButtonElement>('.model')!.click(),
    }
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      const b = t.closest<HTMLElement>('[data-act]')
      const tool = t.closest<HTMLElement>('[data-tool]')
      const tab = t.closest<HTMLElement>('[data-tab]')
      if (b?.dataset.act === 'menu') return this.menu(this.$.menuBox.hidden)
      if (!this.$.menuBox.hidden) this.menu(false)
      if (b) acts[b.dataset.act!]?.()
      if (tool) this.setTool(tool.dataset.tool as Tool)
      if (tab) this.setTab(tab.dataset.tab as Tab)
    })
    document.addEventListener('pointerdown', (e) => {
      if (!this.$.menuBox.hidden && !(e.target as HTMLElement).closest?.('.art-menu, [data-act=menu]')) this.menu(false)
    })
    this.$.input.addEventListener('change', () => {
      const f = (this.$.input as HTMLInputElement).files?.[0]
      if (f) this.importFile(f)
      ;(this.$.input as HTMLInputElement).value = ''
    })
    this.$.check.addEventListener('click', () => {
      const e = this.issues.errors[0]
      if (e?.line) {
        const line = this.view.state.doc.line(Math.min(e.line, this.view.state.doc.lines))
        this.view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
        this.view.focus()
      } else if (this.issues.warnings.length) this.$.issues.hidden = !this.$.issues.hidden
    })
    // shortcuts that work when the code editor doesn't have focus
    document.addEventListener('keydown', (e) => {
      if (!this.root.isConnected || !this.root.offsetParent) return
      const typing = (e.target as HTMLElement).closest?.('input, textarea, select, .cm-editor')
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (e.key === 'Escape') {
        this.menu(false)
        if (!typing) this.select(null, false)
      }
      if (mod && k === 's') {
        e.preventDefault()
        void (e.shiftKey ? this.saveAs() : this.save())
      } else if (mod && k === 'o') {
        e.preventDefault()
        void this.open()
      } else if (typing) return
      else if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(this.view)
        else undo(this.view)
      } else if (mod && k === 'y') {
        e.preventDefault()
        redo(this.view)
      } else if (!mod && k === 'v') this.setTool('select')
      else if (!mod && k === 'h') this.setTool('hand')
    })
    // drag the source panel's edge to resize it
    const handle = this.root.querySelector<HTMLElement>('.src-resize')!
    handle.addEventListener('pointerdown', (e) => {
      handle.setPointerCapture(e.pointerId)
      const move = (ev: PointerEvent) => {
        const r = this.$.body.getBoundingClientRect()
        if (this.place === 'side') this.$.body.style.setProperty('--src-w', `${Math.round(Math.max(240, Math.min(r.width - 420, r.right - ev.clientX - 280)))}px`)
        else this.$.body.style.setProperty('--src-h', `${Math.round(Math.max(120, Math.min(r.height - 160, r.bottom - ev.clientY)))}px`)
      }
      const done = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', done)
        handle.removeEventListener('pointercancel', done)
        this.view.requestMeasure()
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', done)
      handle.addEventListener('pointercancel', done)
    })
  }

  private updateButtons() {
    ;(this.$.undo as HTMLButtonElement).disabled = undoDepth(this.view.state) === 0
    ;(this.$.redo as HTMLButtonElement).disabled = redoDepth(this.view.state) === 0
  }

  private updateName() {
    this.$.file.textContent = this.doc.id ? `${this.doc.name}.svg` : this.doc.name
    this.$.state.textContent = this.dirty ? 'Unsaved' : 'Saved'
    this.$.state.className = `state ${this.dirty ? 'dirty' : 'clean'}`
    this.$.state.title = this.dirty ? 'Unsaved changes (kept on this device automatically)' : 'Saved'
  }

  private updateCheck() {
    const { errors, warnings } = this.issues
    const c = this.$.check
    c.className = `check ${errors.length ? 'bad' : warnings.length ? 'warn' : 'ok'}`
    if (errors.length) {
      const e = errors[0]
      c.textContent = `✕ ${e.line ? `Line ${e.line}: ` : ''}${e.message}`
      c.title = `${c.textContent}. The canvas shows the last valid version.`
    } else if (warnings.length) {
      c.textContent = `⚠ ${warnings.length} warning${warnings.length > 1 ? 's' : ''}`
      c.title = 'Show warnings'
    } else {
      c.textContent = 'Live sync'
      c.title = 'Valid SVG; the canvas is up to date'
    }
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

  /** Call when the panel becomes visible, so the editor and canvas can size themselves. */
  shown() {
    this.view.requestMeasure()
  }
}

