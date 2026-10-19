import { autocompletion } from '@codemirror/autocomplete'
import { indentWithTab, isolateHistory, redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { xml } from '@codemirror/lang-xml'
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { Annotation, EditorState, type ChangeSpec, type Text } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import './art.css'
import { AiPanel, type AiTarget } from './aiPanel'
import { boxPoint, isGraphic, rootBox, rootRotation, unionBox, type Box } from './geometry'
import { Inspector, toHex, type InspectorChange } from './inspector'
import { Layers } from './layers'
import { Ops, type Mapper } from './ops'
import { Preview } from './preview'
import { snapBox, snapPoint, targets, type SnapSettings, type SnapTargets } from './snap'
import { attr, chunk, childIndent, elementAt, idsIn, insertionPoint, scan, setAttrChange, uniqueId, type SrcElement } from './sourceMap'
import { deleteArtwork, getArtwork, getDraft, listArtworks, newId, putArtwork, putDraft, type ArtMeta, type Artwork } from './store'
import { xmlSchema } from './svgSchema'
import { Tools, type DrawStyle, type ToolName } from './tools'
import { artSize, formatSvg, parseSvg, SVG_NS, type Issue } from './validate'

/**
 * Art Studio: SVG source and canvas kept in step. The code is the document;
 * the canvas tools, layers and inspector read it and write back to exactly
 * the characters they change, so every edit is undoable and nothing else
 * moves. Editor-only information (guides and so on) lives beside the SVG.
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
  node: '<path d="M4 20C8 8 16 16 20 4"/><rect x="2" y="18" width="4" height="4"/><rect x="18" y="2" width="4" height="4"/><circle cx="12" cy="12" r="2"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
  line: '<path d="M5 19L19 5"/>',
  polygon: '<path d="M12 3l8 6-3 10H7L4 9z"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  pen: '<path d="M12 19l7-7-3-3-7 7-2 5zM14 7l3 3M5 21l3-3"/>',
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"/>',
  eyedropper: '<path d="M14 4l6 6-2 2-6-6zM12 6l-8 8v4h4l8-8"/>',
  hand: '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.6-1.5L8 15"/>',
  zoomOut: '<path d="M5 12h14"/>',
  zoomIn: '<path d="M5 12h14M12 5v14"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  max: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  format: '<path d="M4 6h16M8 10h12M8 14h12M4 18h16"/>',
  object: '<rect x="3" y="3" width="10" height="10"/><rect x="11" y="11" width="10" height="10"/>',
}
const icon = (n: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`

const TOOLS: [ToolName, string, string][] = [
  ['select', 'Select, move, resize, rotate (V)', 'V'],
  ['node', 'Edit nodes (A)', 'A'],
  ['rect', 'Rectangle (R)', 'R'],
  ['ellipse', 'Ellipse / circle (E)', 'E'],
  ['line', 'Line (L)', 'L'],
  ['polygon', 'Polygon', ''],
  ['star', 'Star', ''],
  ['text', 'Text (T)', 'T'],
  ['pen', 'Pen: tap for corners, drag for curves (P)', 'P'],
  ['pencil', 'Pencil: draw freehand (N)', 'N'],
  ['eyedropper', 'Eyedropper: copy a colour (I)', 'I'],
  ['hand', 'Pan (H, or hold Space)', 'H'],
]

export class ArtStudio {
  readonly root: HTMLDivElement
  private view: EditorView
  private preview = new Preview()
  private layers: Layers
  private inspector = new Inspector()
  private ai: AiPanel
  private ops: Ops
  private tools: Tools
  private doc = { id: null as string | null, name: 'Untitled', saved: BLANK, savedMeta: '{}' }
  private meta: ArtMeta = {}
  private issues: { errors: Issue[]; warnings: Issue[] } = { errors: [], warnings: [] }
  /** The source map of the last valid render. Only meaningful while `mapped` matches the source. */
  private els: SrcElement[] = []
  private mapped = ''
  /** The selection, as the source positions where its tags start, so it follows edits. */
  private selPos: number[] = []
  private sel: number[] = []
  private proposal: { from: number; to: number; insert: string } | null = null
  private renderTimer = 0
  private draftTimer = 0
  private place: SourcePlace = 'bottom'
  private grid = false
  private clean = false
  private snap: SnapSettings = { grid: false, guides: true, objects: true, gridSize: 10 }
  private snapCache: { at: number; ignore: string; t: SnapTargets } | null = null
  private drawStyle: DrawStyle = { fill: '#f2c14e', stroke: '#1a1410', strokeWidth: 4 }
  private shapeOpts = { sides: 6, points: 5, inner: 0.5 }
  private $: Record<string, HTMLElement> = {}

  constructor() {
    this.root = document.createElement('div')
    this.root.className = 'art'
    const check = (act: string, label: string) => `<button type="button" role="menuitemcheckbox" data-act="${act}" aria-checked="false">${label}</button>`
    const item = (act: string, label: string, keys = '') => `<button type="button" role="menuitem" data-act="${act}">${label}${keys ? `<kbd>${keys}</kbd>` : ''}</button>`
    this.root.innerHTML = `
      <header class="art-head">
        <span class="logo">${icon('palette')}</span><h2>Art Studio</h2>
        <span class="sp"></span>
        <button type="button" data-act="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${icon('undo')}</button>
        <button type="button" data-act="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon('redo')}</button>
        <button type="button" data-act="save" title="Save (Ctrl+S)" aria-label="Save">${icon('save')}</button>
        <button type="button" data-act="menu" title="More" aria-label="More" aria-haspopup="menu" aria-expanded="false">${icon('more')}</button>
        <div class="art-menu main-menu" role="menu" hidden>
          ${item('new', 'New artwork')}${item('open', 'Open…', 'Ctrl+O')}${item('saveAs', 'Save as…', 'Ctrl+Shift+S')}${item('import', 'Import SVG file…')}${item('export', 'Export SVG file')}
          <hr>
          ${check('grid', 'Grid')}${check('rulers', 'Rulers')}${check('snapGrid', 'Snap to grid')}${check('snapGuides', 'Snap to guides')}${check('snapObjects', 'Snap to objects')}${item('clearGuides', 'Clear guides')}
          ${check('preview', 'Preview mode (hide overlays)')}
          <hr>
          <button type="button" role="menuitemradio" data-act="srcBottom">Source below</button>
          <button type="button" role="menuitemradio" data-act="srcSide">Source beside canvas</button>
          <button type="button" role="menuitemradio" data-act="srcHidden">Hide source</button>
          <hr>
          ${item('aiSettings', 'AI settings…')}
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
          <div class="tools">${TOOLS.map(([t, title]) => `<button type="button" data-tool="${t}" title="${title}" aria-label="${title}">${icon(t)}</button>`).join('')}</div>
        </section>
        <section class="p-layers" aria-label="Layers"><h3>Layers</h3></section>
        </aside>
        <section class="p-canvas" aria-label="Canvas">
          <div class="phead"><h3>Canvas</h3>
            <button type="button" data-act="objMenu" class="objbtn" title="Object: arrange, align, combine" aria-haspopup="menu" aria-expanded="false">${icon('object')}<span>Object</span></button>
            <div class="art-menu obj-menu" role="menu" hidden>
              ${item('group', 'Group', 'Ctrl+G')}${item('ungroup', 'Ungroup', 'Ctrl+Shift+G')}${item('duplicate', 'Duplicate', 'Ctrl+D')}${item('delete', 'Delete', 'Del')}
              <hr>
              ${item('front', 'Bring to front', 'Ctrl+Shift+]')}${item('forward', 'Bring forward', 'Ctrl+]')}${item('backward', 'Send backward', 'Ctrl+[')}${item('back', 'Send to back', 'Ctrl+Shift+[')}
              <hr>
              <div class="grid-items">${item('alignLeft', '⇤ Left')}${item('alignHcenter', '↔ Centre')}${item('alignRight', '⇥ Right')}${item('alignTop', '⤒ Top')}${item('alignVcenter', '↕ Middle')}${item('alignBottom', '⤓ Bottom')}</div>
              ${item('distX', 'Distribute horizontally')}${item('distY', 'Distribute vertically')}
              <hr>
              ${item('flipX', 'Flip horizontally')}${item('flipY', 'Flip vertically')}
              <hr>
              ${item('toPath', 'Convert to path')}${item('combine', 'Combine paths')}
              <div class="grid-items">${item('unite', 'Union')}${item('subtract', 'Subtract')}${item('intersect', 'Intersect')}${item('exclude', 'Exclude')}</div>
              ${item('simplify', 'Simplify path')}
              <hr>
              ${item('selectAll', 'Select all', 'Ctrl+A')}${item('fitSel', 'Zoom to selection', 'Ctrl+2')}
            </div>
            <span class="sp"></span>
            <button type="button" data-act="zoomOut" title="Zoom out (Ctrl+−)" aria-label="Zoom out">${icon('zoomOut')}</button>
            <button type="button" data-act="zoom100" class="zoom" title="Zoom to 100% (Ctrl+1)">100%</button>
            <button type="button" data-act="zoomIn" title="Zoom in (Ctrl+=)" aria-label="Zoom in">${icon('zoomIn')}</button>
            <button type="button" data-act="fit" title="Fit artwork (Ctrl+0)" aria-label="Fit artwork">${icon('fit')}</button>
          </div>
          <div class="toolopts"></div>
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
      menuBox: q('.main-menu'),
      objBox: q('.obj-menu'),
      toolopts: q('.toolopts'),
      input: q('input[type=file]'),
    })
    q('.canvas-slot').appendChild(this.preview.host)

    this.ops = new Ops({
      source: () => this.source,
      els: () => this.els,
      root: () => this.preview.root,
      element: (i) => this.preview.element(i),
      selection: () => (this.valid ? this.sel : []),
      apply: (changes, select) => this.apply(changes, select),
      flash: (m) => this.flash(m),
    })
    this.tools = new Tools({
      preview: this.preview,
      els: () => this.els,
      valid: () => this.valid,
      selection: () => (this.valid ? this.sel : []),
      select: (is, reveal) => this.select(is, reveal ?? true),
      commitTransforms: (items) => this.apply(items.map(({ i, m }) => this.ops.transformChange(this.els[i], this.source, m)).filter((c): c is ChangeSpec => !!c), this.keep()),
      setAttr: (i, name, value) => this.setAttrs([i], name, value),
      setPath: (i, d) => this.setPath(i, d),
      insert: (markup) => this.ops.insert(markup),
      isLocked: (el) => this.isLocked(el),
      snapPoint: (x, y, ignore = []) => snapPoint(this.snapTargets(ignore), x, y, 8 * this.preview.unitsPerPx),
      snapMove: (box, dx, dy, ignore) => snapBox(this.snapTargets(ignore), box, dx, dy, 8 * this.preview.unitsPerPx),
      guides: () => ({ x: [...(this.meta.guides?.x ?? [])], y: [...(this.meta.guides?.y ?? [])] }),
      setGuides: (g) => this.setMeta({ guides: g }),
      style: () => this.drawStyle,
      shapeOptions: () => this.shapeOpts,
      setTool: (t) => this.setTool(t),
      changed: () => this.refreshInspector(),
      pick: (el) => this.eyedrop(el),
      uniqueId: (base) => uniqueId(base, idsIn(this.source)),
      overlayExtra: () => this.overlayExtra(),
    })
    this.preview.handler = this.tools
    this.preview.onRuler = (axis, p) => this.tools.rulerDown(axis, p)
    this.preview.onView = () => this.tools.draw()

    this.layers = new Layers({
      select: (i, mode) => {
        if (mode === 'only') return this.select([i])
        this.select(this.sel.includes(i) ? this.sel.filter((x) => x !== i) : [...this.sel, i])
      },
      setVisible: (i, on) => this.setAttrs([i], 'display', on ? null : 'none'),
      setLocked: (i, on) => this.setAttrs([i], 'data-locked', on ? 'true' : null),
      rename: (i, id) => this.setAttrs([i], 'id', id && !idsIn(this.source).has(id) ? id : id ? uniqueId(id, idsIn(this.source)) : null),
      move: (i, parent, before) => this.moveElement(i, parent, before),
      addLayer: () => this.addLayer(),
    })
    q('.p-layers').appendChild(this.layers.el)
    q('.p-inspector').appendChild(this.inspector.el)
    this.ai = new AiPanel({
      source: () => this.source,
      blank: () => this.valid && (this.els[0]?.children ?? []).every((c) => ['defs', 'title', 'desc', 'metadata', 'style'].includes(c.name)),
      selection: () => this.aiSelection(),
      propose: (t, r, show) => this.propose(t, r, show),
      accept: () => this.acceptProposal(),
      reject: () => this.rejectProposal(),
    })
    q('.p-ai').appendChild(this.ai.el)

    this.view = new EditorView({ parent: q('.p-source .code'), state: this.state(BLANK) })

    this.preview.onZoom = (z) => (this.$.zoom100.textContent = `${Math.round(z * 100)}%`)
    this.preview.onPointer = (x, y) => (this.$.coords.textContent = `X: ${Math.round(x)}  Y: ${Math.round(y)}`)
    this.inspector.onChange = (c) => this.inspect(c)

    let pref: { place?: SourcePlace; tab?: Tab; snap?: Partial<SnapSettings>; rulers?: boolean; grid?: boolean; style?: DrawStyle } = {}
    try {
      pref = JSON.parse(localStorage.getItem('art.ui') ?? '{}')
    } catch {
      // not remembered
    }
    this.snap = { ...this.snap, ...pref.snap }
    if (pref.style) this.drawStyle = pref.style
    this.grid = !!pref.grid
    this.preview.setGrid(this.grid)
    this.preview.setRulers(!!pref.rulers)
    this.setPlace(pref.place ?? 'bottom')
    this.setTab(pref.tab ?? 'source')
    this.syncChecks()
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
            this.selPos = this.selPos.map((p) => u.changes.mapPos(p, 1))
            // studio edits, undo and redo redraw at once; typing waits for a pause
            const studio = u.transactions.some((t) => t.annotation(fromStudio) || t.isUserEvent('undo') || t.isUserEvent('redo'))
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
    return this.source !== this.doc.saved || JSON.stringify(this.meta) !== this.doc.savedMeta
  }

  /** Load a document fresh, with its own undo history. */
  private load(source: string, id: string | null, name: string, saved: string, meta: ArtMeta = {}, savedMeta: ArtMeta | null = meta) {
    this.doc = { id, name, saved, savedMeta: JSON.stringify(savedMeta ?? {}) }
    this.meta = meta
    this.selPos = []
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
    this.saveDraft()
  }

  private saveDraft() {
    clearTimeout(this.draftTimer)
    this.draftTimer = window.setTimeout(() => void putDraft({ id: this.doc.id, name: this.doc.name, svg: this.source, meta: this.meta }), 800)
  }

  /** Change editor-only information (guides and so on). */
  private setMeta(patch: Partial<ArtMeta>) {
    this.meta = { ...this.meta, ...patch }
    this.updateName()
    this.saveDraft()
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
      this.snapCache = null
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

  /** Apply text changes made by the studio as one undo step, then optionally select by new positions. */
  private apply(changes: ChangeSpec[], select?: (map: Mapper) => number[]) {
    if (!this.valid) return this.flash('Fix the code error first')
    if (!changes.length) return
    const tr = this.view.state.update({ changes, annotations: [fromStudio.of(true), isolateHistory.of('full')], userEvent: 'studio' })
    this.view.dispatch(tr)
    if (select) {
      this.selPos = select((pos, assoc = 1) => tr.changes.mapPos(pos, assoc))
      this.resolveSelection()
    }
  }

  /** Keep the current selection through an edit that doesn't add or remove elements. */
  private keep() {
    const starts = this.sel.map((i) => this.els[i].start)
    return (map: Mapper) => starts.map((p) => map(p, 1))
  }

  private setAttrs(is: number[], name: string, value: string | null) {
    if (!this.valid) return
    const src = this.source
    const changes = is.map((i) => setAttrChange(this.els[i], name, value, src)).filter((c): c is NonNullable<typeof c> => !!c)
    this.apply(changes, this.keep())
  }

  private setPath(i: number, d: string) {
    const e = this.els[i]
    if (!e) return
    if (e.name === 'path') return this.setAttrs([i], 'd', d)
    this.apply([{ from: e.start, to: e.end, insert: this.ops.pathText(e, d) }], (map) => [map(e.start, -1)])
  }

  // ---- selection ----

  private resolveSelection() {
    const byStart = new Map(this.els.map((e) => [e.start, e.i]))
    this.sel = this.valid ? this.selPos.map((p) => byStart.get(p)).filter((i): i is number => i !== undefined) : []
    this.selPos = this.sel.map((i) => this.els[i].start)
    this.showSelection()
  }

  select(is: number[], revealInCode = true) {
    this.sel = this.valid ? [...new Set(is.filter((i) => this.els[i]))] : []
    this.selPos = this.sel.map((i) => this.els[i].start)
    this.showSelection()
    const e = this.els[this.sel[this.sel.length - 1]]
    if (e && revealInCode) {
      // highlight the tag in the code without stealing focus (no keyboard popping up on phones)
      this.view.dispatch({ selection: { anchor: e.start, head: e.openEnd }, effects: EditorView.scrollIntoView(e.start, { y: 'center' }), annotations: fromStudio.of(true) })
    }
  }

  private selectFromCode() {
    if (!this.valid) return
    const e = elementAt(this.els, this.view.state.selection.main.head)
    if (e && !(this.sel.length === 1 && this.sel[0] === e.i)) this.select([e.i], false)
  }

  private showSelection() {
    this.tools.followSelection()
    this.tools.draw()
    this.layers.update(this.els, this.sel)
    this.refreshInspector()
    const one = this.sel.length === 1 ? this.els[this.sel[0]] : null
    const id = one ? attr(one, 'id')?.value : null
    this.$.selinfo.textContent = one ? `Selection: ${id ?? ''}${id ? ' ' : ''}${one.name === 'g' ? 'group' : `<${one.name}>`}` : this.sel.length ? `${this.sel.length} objects selected` : 'Nothing selected'
    this.ai.refresh()
  }

  private refreshInspector() {
    this.inspector.update({
      els: this.els,
      items: this.sel.map((i) => ({ src: this.els[i], el: this.preview.element(i) })),
      root: this.preview.root,
      nodes: { editing: this.tools.editingNodes, selected: this.tools.nodeSelection },
    })
  }

  private isLocked(el: Element) {
    for (let e: Element | null = el; e && e !== this.preview.root; e = e.parentNode instanceof Element ? e.parentNode : null) if (e.getAttribute('data-locked') === 'true') return true
    return false
  }

  // ---- snapping and guides ----

  private snapTargets(ignore: Element[]): SnapTargets {
    const key = ignore.map((e) => e.getAttribute('data-art-i')).join(',')
    const now = performance.now()
    if (this.snapCache && this.snapCache.ignore === key && now - this.snapCache.at < 400) return this.snapCache.t
    const root = this.preview.root
    const boxes: Box[] = []
    if (root && this.snap.objects) {
      for (const el of root.querySelectorAll('[data-art-i]')) {
        if (el === root || !isGraphic(el) || ignore.some((g) => g === el || g.contains(el) || el.contains(g))) continue
        if (el.closest('defs, clipPath, mask, symbol, pattern, marker')) continue
        // only top-level objects and their direct children, to keep it quick
        const depth = (() => {
          let d = 0
          for (let p: Node | null = el.parentNode; p && p !== root; p = p.parentNode) d++
          return d
        })()
        if (depth > 1) continue
        const b = rootBox(el, root)
        if (b && b.width + b.height > 0) boxes.push(b)
      }
    }
    const t = targets(this.snap, { x: this.meta.guides?.x ?? [], y: this.meta.guides?.y ?? [] }, boxes, this.preview.artBox)
    this.snapCache = { at: now, ignore: key, t }
    return t
  }

  private overlayExtra() {
    const g = this.meta.guides
    if (!g) return ''
    const pv = this.preview
    const W = 100000
    return [...g.x.map((x) => `<line x1="${pv.toScreen(x, 0).x}" y1="-${W}" x2="${pv.toScreen(x, 0).x}" y2="${W}" stroke="#2bd4d4" stroke-width="1"/>`), ...g.y.map((y) => `<line x1="-${W}" y1="${pv.toScreen(0, y).y}" x2="${W}" y2="${pv.toScreen(0, y).y}" stroke="#2bd4d4" stroke-width="1"/>`)].join('')
  }

  // ---- editing from the inspector ----

  private inspect(c: InspectorChange) {
    if (!this.sel.length || !this.valid) return
    const root = this.preview.root
    if (c.kind === 'action') return this.action(c.name)
    if (c.kind === 'attr') {
      if (c.live) {
        for (const i of this.sel) this.preview.element(i)?.setAttribute(c.name, c.value ?? '')
        return
      }
      if (c.name === 'id') {
        const taken = idsIn(this.source)
        const cur = attr(this.els[this.sel[0]], 'id')?.value
        if (cur) taken.delete(cur)
        return this.setAttrs([this.sel[0]], 'id', c.value && taken.has(c.value) ? uniqueId(c.value, taken) : c.value)
      }
      return this.setAttrs(this.sel, c.name, c.value)
    }
    if (c.kind === 'text') {
      const e = this.els[this.sel[0]]
      const close = insertionPoint(e, this.source)
      if (close === null) return
      const end = this.source.lastIndexOf('</', e.end - 1)
      return this.apply([{ from: e.openEnd, to: end, insert: c.value.replace(/&/g, '&amp;').replace(/</g, '&lt;') }], this.keep())
    }
    if (!root) return
    const items = this.sel.map((i) => this.preview.element(i)).filter((e): e is SVGGraphicsElement => !!e && isGraphic(e) && e !== root)
    const box = items.length === 1 ? rootBox(items[0], root) : unionBox(items, root)
    if (!box) return
    const o = boxPoint(box, this.inspector.origin.x, this.inspector.origin.y)
    let m: DOMMatrix
    if (c.kind === 'x') m = new DOMMatrix().translate(c.value - box.x, 0)
    else if (c.kind === 'y') m = new DOMMatrix().translate(0, c.value - box.y)
    else if (c.kind === 'width' || c.kind === 'height') {
      const k = c.kind === 'width' ? Math.max(0.01, c.value) / (box.width || 1) : Math.max(0.01, c.value) / (box.height || 1)
      const sx = c.kind === 'width' || this.inspector.lockAspect ? k : 1
      const sy = c.kind === 'height' || this.inspector.lockAspect ? k : 1
      m = new DOMMatrix().translate(o.x, o.y).scale(sx, sy).translate(-o.x, -o.y)
    } else if (c.kind === 'rotation') {
      const shown = items.length === 1 ? rootRotation(items[0], root) : 0
      m = new DOMMatrix().translate(o.x, o.y).rotate(c.value - shown).translate(-o.x, -o.y)
    } else {
      const t = Math.tan((c.value * Math.PI) / 180)
      const skew = c.kind === 'skewX' ? new DOMMatrix([1, 0, t, 1, 0, 0]) : new DOMMatrix([1, t, 0, 1, 0, 0])
      m = new DOMMatrix().translate(o.x, o.y).multiply(skew).translate(-o.x, -o.y)
    }
    this.ops.transformAll(m)
  }

  /** Copy fill and stroke from a picked element: onto the selection, or into the style for new shapes. */
  private eyedrop(el: Element) {
    const cs = getComputedStyle(el)
    const norm = (v: string) => v.replace(/url\("?([^")]+)"?\)/, (_, u: string) => `url(${u.slice(u.indexOf('#'))})`)
    const fill = norm(cs.fill)
    const stroke = norm(cs.stroke)
    const width = parseFloat(cs.strokeWidth) || 0
    const targetsSel = this.sel.filter((i) => i !== 0 && this.preview.element(i) !== el)
    if (targetsSel.length) {
      const src = this.source
      const changes = targetsSel.flatMap((i) => [setAttrChange(this.els[i], 'fill', fill, src), setAttrChange(this.els[i], 'stroke', stroke, src), setAttrChange(this.els[i], 'stroke-width', String(width), src)]).filter((c): c is NonNullable<typeof c> => !!c)
      this.apply(changes, this.keep())
      this.flash('Copied the style onto the selection')
    } else {
      this.drawStyle = { fill: fill.startsWith('rgb') ? toHex(fill) : fill, stroke: stroke.startsWith('rgb') ? toHex(stroke) : stroke, strokeWidth: width }
      this.savePrefs()
      this.drawToolOptions()
      this.flash('Picked the style for new shapes')
    }
  }

  // ---- structure ----

  private moveElement(i: number, parentI: number, beforeI: number | null) {
    const src = this.source
    const e = this.els[i]
    const parent = this.els[parentI]
    const before = beforeI !== null ? this.els[beforeI] : null
    if (!e || !parent || before === e) return
    const c = chunk(e, src)
    const at = before ? chunk(before, src).from : insertionPoint(parent, src)
    if (at === null) return this.flash("That element can't hold others")
    const indent = childIndent(parent, src)
    const oldIndent = c.lead.replace(/^\n/, '')
    const text = c.text.replace(new RegExp(`\n${oldIndent}`, 'g'), `\n${indent}`)
    const lead = `\n${indent}`
    this.apply([{ from: c.from, to: c.to, insert: '' }, { from: at, insert: lead + text }], (map) => [map(at, 1) - text.length])
  }

  private addLayer() {
    const root = this.els[0]
    if (!root) return
    const src = this.source
    const at = insertionPoint(root, src)
    if (at === null) return
    const id = uniqueId('layer', idsIn(src))
    const indent = childIndent(root, src)
    const lead = `\n${indent}`
    this.apply([{ from: at, insert: `${lead}<g id="${id}">\n${indent}</g>` }], (map) => [map(at, -1) + lead.length])
  }

  /** Object and path actions, from the Object menu, the inspector and shortcuts. */
  private action(name: string) {
    const t = this.tools
    const align: Record<string, 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'> = { alignLeft: 'left', alignHcenter: 'hcenter', alignRight: 'right', alignTop: 'top', alignVcenter: 'vcenter', alignBottom: 'bottom' }
    if (align[name]) return this.ops.align(align[name], this.preview.artBox)
    switch (name) {
      case 'group':
        return this.ops.group()
      case 'ungroup':
        return this.ops.ungroup()
      case 'duplicate':
        return this.ops.duplicate()
      case 'delete':
        return t.editingNodes && t.nodeSelection ? t.deleteNodes() : this.ops.remove()
      case 'front':
      case 'forward':
      case 'backward':
      case 'back':
        return this.ops.reorder(name)
      case 'distX':
        return this.ops.distribute('x')
      case 'distY':
        return this.ops.distribute('y')
      case 'flipX':
        return this.flip('x')
      case 'flipY':
        return this.flip('y')
      case 'toPath':
        return this.ops.toPath()
      case 'combine':
        return this.ops.combine()
      case 'unite':
      case 'subtract':
      case 'intersect':
      case 'exclude':
        return void this.ops.boolean(name)
      case 'simplify':
        return void this.ops.simplify()
      case 'selectAll':
        return this.select((this.els[0]?.children ?? []).filter((c) => !['defs', 'style', 'title', 'desc', 'metadata'].includes(c.name)).map((c) => c.i), false)
      case 'fitSel': {
        const root = this.preview.root
        const items = this.sel.map((i) => this.preview.element(i)).filter((e): e is SVGGraphicsElement => !!e && isGraphic(e))
        const b = root && items.length ? unionBox(items, root) : null
        return b ? this.preview.fitBox(b) : this.preview.fit()
      }
      case 'editNodes':
        return this.setTool('node')
      case 'addNode':
        return t.addNodes()
      case 'deleteNode':
        return t.deleteNodes()
      case 'smooth':
        return t.toggleSmooth()
      case 'closePath':
        return t.toggleClosed()
      case 'split':
        return t.splitAtNode()
      case 'join':
        return t.joinNodes()
    }
  }

  private flip(axis: 'x' | 'y') {
    const root = this.preview.root
    const items = this.sel.map((i) => this.preview.element(i)).filter((e): e is SVGGraphicsElement => !!e && isGraphic(e) && e !== root)
    const box = root && items.length ? unionBox(items, root) : null
    if (!box) return
    const o = boxPoint(box, this.inspector.origin.x, this.inspector.origin.y)
    this.ops.transformAll(new DOMMatrix().translate(o.x, o.y).scale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1).translate(-o.x, -o.y))
  }

  // ---- AI proposals ----

  private aiSelection(): AiTarget | null {
    if (!this.sel.length || !this.valid) return null
    const e = this.els[this.sel[this.sel.length - 1]]
    const id = attr(e, 'id')?.value
    if (e.i === 0) return { from: 0, to: this.source.length, text: this.source, label: 'the whole artwork', whole: true }
    return { from: e.start, to: e.end, text: this.source.slice(e.start, e.end), label: id ? `#${id}` : `<${e.name}>`, whole: false }
  }

  /** Check a replacement; with show, also preview it on the canvas. Returns an error message if it doesn't work. */
  private propose(t: AiTarget, replacement: string, show = true): string | null {
    if (!t.whole) {
      const check = parseSvg(`<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink">${replacement}</svg>`)
      if (!check.ok) return check.errors[0].message
      if (!check.svg.firstElementChild) return 'it contained no SVG element'
    }
    const src = this.source
    const next = src.slice(0, t.from) + replacement + src.slice(t.to)
    const r = parseSvg(next)
    if (!r.ok) return r.errors[0].message
    if (!show) return null
    this.proposal = { from: t.from, to: t.to, insert: replacement }
    this.preview.show(r.svg)
    this.preview.drawOverlay('')
    this.preview.setBanner('Previewing AI change')
    return null
  }

  private acceptProposal() {
    const p = this.proposal
    if (!p) return
    this.proposal = null
    this.preview.setBanner(null)
    this.view.dispatch({ changes: p, annotations: [fromStudio.of(true), isolateHistory.of('full')], userEvent: 'studio' })
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
      this.load(draft.svg, art ? draft.id : null, draft.name, art?.svg ?? (draft.svg === BLANK ? BLANK : ''), draft.meta ?? {}, art ? (art.meta ?? {}) : null)
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
    await putArtwork({ ...prev, id: this.doc.id, name: this.doc.name, svg: this.source, meta: this.meta, created: prev?.created ?? now, updated: now })
    this.doc.saved = this.source
    this.doc.savedMeta = JSON.stringify(this.meta)
    this.updateName()
    this.flash(this.issues.errors.length ? 'Saved (the SVG still has an error)' : 'Saved')
  }

  async saveAs() {
    const name = prompt('Save artwork as:', this.doc.id ? `${this.doc.name} copy` : this.doc.name)?.trim()
    if (!name) return
    this.doc.id = newId()
    this.doc.name = name
    await this.save()
    void putDraft({ id: this.doc.id, name, svg: this.source, meta: this.meta })
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
        this.load(a.svg, a.id, a.name, a.svg, a.meta ?? {})
        void putDraft({ id: a.id, name: a.name, svg: a.svg, meta: a.meta })
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
      localStorage.setItem('art.ui', JSON.stringify({ place: this.place, tab: this.$.body.dataset.tab, snap: this.snap, rulers: this.preview.rulers, grid: this.grid, style: this.drawStyle }))
    } catch {
      // not remembered, that's fine
    }
  }

  private syncChecks() {
    const on: Record<string, boolean> = { grid: this.grid, rulers: this.preview.rulers, snapGrid: this.snap.grid, snapGuides: this.snap.guides, snapObjects: this.snap.objects, preview: this.clean }
    for (const [k, v] of Object.entries(on)) this.$[k]?.setAttribute('aria-checked', String(v))
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

  private setTool(t: ToolName) {
    this.tools.setTool(t)
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t))
    this.drawToolOptions()
    this.refreshInspector()
  }

  /** The strip under the canvas header: settings for the current tool. */
  private drawToolOptions() {
    const t = this.tools.tool
    const s = this.drawStyle
    const box = this.$.toolopts
    const drawing = ['rect', 'ellipse', 'polygon', 'star', 'text', 'pen', 'pencil', 'line'].includes(t)
    const sw = (k: 'fill' | 'stroke') => `<label class="opt">${k === 'fill' ? 'Fill' : 'Stroke'}<input type="color" data-o="${k}" value="${toHex(s[k] === 'none' ? '#ffffff' : s[k])}"><button type="button" data-o="${k}None" class="none${s[k] === 'none' ? ' on' : ''}" title="No ${k}">∅</button></label>`
    const hints: Partial<Record<ToolName, string>> = {
      select: 'Tap to select · Shift adds · double-tap goes inside groups · drag empty space to box-select',
      node: 'Drag nodes or handles · Shift selects several · double-tap a node for smooth/corner · double-tap the outline to add a node',
      pen: 'Tap for corners, drag for curves · tap the first node to close, the last to finish',
      hand: 'Drag to pan · pinch or Ctrl+scroll to zoom',
      eyedropper: 'Tap something to copy its colours onto the selection (or into the style for new shapes)',
    }
    box.innerHTML = [
      drawing ? `${sw('fill')}${sw('stroke')}<label class="opt">Width<input type="number" data-o="strokeWidth" min="0" step="0.5" value="${s.strokeWidth}"></label>` : '',
      t === 'polygon' ? `<label class="opt">Sides<input type="number" data-o="sides" min="3" max="64" value="${this.shapeOpts.sides}"></label>` : '',
      t === 'star' ? `<label class="opt">Points<input type="number" data-o="points" min="3" max="64" value="${this.shapeOpts.points}"></label><label class="opt">Inner %<input type="number" data-o="inner" min="5" max="95" value="${Math.round(this.shapeOpts.inner * 100)}"></label>` : '',
      t === 'pen' ? `<button type="button" class="ibtn" data-o="finish">Finish path</button>` : '',
      hints[t] ? `<span class="hint">${hints[t]}</span>` : '',
    ].join('')
    box.hidden = !box.innerHTML
  }

  private menus(which: 'menu' | 'objMenu' | null) {
    for (const [btn, boxKey] of [['menu', 'menuBox'], ['objMenu', 'objBox']] as const) {
      const open = which === btn && this.$[boxKey].hidden
      this.$[boxKey].hidden = !open
      this.$[btn].setAttribute('aria-expanded', String(open))
    }
  }

  private bindUi() {
    const toggleSnap = (k: 'grid' | 'guides' | 'objects') => {
      this.snap = { ...this.snap, [k]: !this.snap[k] }
      this.snapCache = null
      this.syncChecks()
      this.savePrefs()
    }
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
        this.syncChecks()
        this.savePrefs()
      },
      rulers: () => {
        this.preview.setRulers(!this.preview.rulers)
        this.syncChecks()
        this.savePrefs()
      },
      snapGrid: () => toggleSnap('grid'),
      snapGuides: () => toggleSnap('guides'),
      snapObjects: () => toggleSnap('objects'),
      clearGuides: () => {
        this.setMeta({ guides: { x: [], y: [] } })
        this.tools.draw()
      },
      preview: () => {
        this.clean = !this.clean
        this.preview.setClean(this.clean)
        this.syncChecks()
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
      if (b?.dataset.act === 'menu' || b?.dataset.act === 'objMenu') return this.menus(b.dataset.act)
      this.menus(null)
      if (b) {
        const name = b.dataset.act!
        if (acts[name]) acts[name]()
        else this.action(name)
      }
      if (tool) this.setTool(tool.dataset.tool as ToolName)
      if (tab) this.setTab(tab.dataset.tab as Tab)
    })
    document.addEventListener('pointerdown', (e) => {
      if (!(e.target as HTMLElement).closest?.('.art-menu, [data-act=menu], [data-act=objMenu]')) this.menus(null)
    })
    // tool options
    this.$.toolopts.addEventListener('input', (e) => {
      const i = e.target as HTMLInputElement
      const k = i.dataset.o
      if (k === 'fill' || k === 'stroke') this.drawStyle = { ...this.drawStyle, [k]: i.value }
      else if (k === 'strokeWidth') this.drawStyle = { ...this.drawStyle, strokeWidth: Math.max(0, +i.value || 0) }
      else if (k === 'sides' || k === 'points') this.shapeOpts[k] = Math.max(3, Math.min(64, Math.round(+i.value) || 3))
      else if (k === 'inner') this.shapeOpts.inner = Math.max(0.05, Math.min(0.95, (+i.value || 50) / 100))
      this.savePrefs()
    })
    this.$.toolopts.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-o]')
      if (!b) return
      if (b.dataset.o === 'finish') return this.tools.finishPen()
      const k = b.dataset.o === 'fillNone' ? 'fill' : 'stroke'
      this.drawStyle = { ...this.drawStyle, [k]: this.drawStyle[k] === 'none' ? (k === 'fill' ? '#f2c14e' : '#1a1410') : 'none' }
      this.savePrefs()
      this.drawToolOptions()
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
        this.menus(null)
        if (typing) return
        if (this.tools.tool === 'pen') return this.tools.finishPen()
        if (this.tools.tool === 'node') return this.setTool('select')
        return this.select([], false)
      }
      if (mod && k === 's') {
        e.preventDefault()
        return void (e.shiftKey ? this.saveAs() : this.save())
      }
      if (mod && k === 'o') {
        e.preventDefault()
        return void this.open()
      }
      if (typing) return
      const run = (name: string) => {
        e.preventDefault()
        this.action(name)
      }
      if (mod && k === 'z') {
        e.preventDefault()
        return void (e.shiftKey ? redo(this.view) : undo(this.view))
      }
      if (mod && k === 'y') return void (e.preventDefault(), redo(this.view))
      if (mod && k === 'g') return run(e.shiftKey ? 'ungroup' : 'group')
      if (mod && k === 'd') return run('duplicate')
      if (mod && k === 'a') return run('selectAll')
      if (mod && (e.key === ']' || e.key === '}')) return run(e.shiftKey ? 'front' : 'forward')
      if (mod && (e.key === '[' || e.key === '{')) return run(e.shiftKey ? 'back' : 'backward')
      if (mod && k === '0') return void (e.preventDefault(), this.preview.fit())
      if (mod && k === '1') return void (e.preventDefault(), this.preview.zoomTo(1))
      if (mod && k === '2') return run('fitSel')
      if (mod && (k === '=' || k === '+')) return void (e.preventDefault(), this.preview.zoomBy(1.25))
      if (mod && k === '-') return void (e.preventDefault(), this.preview.zoomBy(1 / 1.25))
      if (e.key === 'Delete' || e.key === 'Backspace') return run('delete')
      if (e.key === 'Enter' && this.tools.tool === 'pen') return this.tools.finishPen()
      if (e.key.startsWith('Arrow') && this.sel.length) {
        e.preventDefault()
        const d = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
        return this.ops.transformAll(new DOMMatrix().translate(dx, dy))
      }
      if (mod || e.altKey) return
      const tool = TOOLS.find(([, , key]) => key && key.toLowerCase() === k)
      if (tool) this.setTool(tool[0])
    })
    // drag the source panel's edge to resize it
    const handle = this.root.querySelector<HTMLElement>('.src-resize')!
    handle.addEventListener('pointerdown', (e) => {
      handle.setPointerCapture(e.pointerId)
      const move = (ev: PointerEvent) => {
        const r = this.$.body.getBoundingClientRect()
        if (this.place === 'side' && innerWidth >= 1100) this.$.body.style.setProperty('--src-w', `${Math.round(Math.max(240, Math.min(r.width - 420, r.right - ev.clientX - 280)))}px`)
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
