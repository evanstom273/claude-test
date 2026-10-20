import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { store, type Env } from './env'
import { parseError, renderPng, safetyWarnings, type Region } from './render'

/**
 * The Art Studio's MCP tools. Claude reads and writes SVG artwork, and every
 * change comes back with a rendered picture, so it can see what it drew.
 */

const INSTRUCTIONS = `This is the Art Studio: SVG artwork for a 2D cartoon.
- Read the style guide (get_style_guide) before drawing, and follow it.
- After every change you get a rendered image back. Look at it properly and fix what's wrong (parts that don't join, wrong proportions, inconsistent perspective or line weight) before moving on.
- Prefer edit_artwork for small changes; it keeps everything else exactly as it was.
- Build characters and complex objects in named groups (id="head", id="arm-left"), part by part.
- To give the user a file for other apps, use export_artwork (PNG or SVG) and pass on the link.
- For iterative refinement towards a goal, use loop_artwork, then loop_step until you're satisfied or the round limit is reached.`

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

const text = (t: string): Content => ({ type: 'text', text: t })
const fail = (t: string) => ({ content: [text(t)], isError: true })

const regionSchema = z
  .object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() })
  .optional()
  .describe('Zoom into this area of the artwork, in its own coordinates')

const editSchema = z.object({
  find: z.string().min(1).describe('Exact text to find in the SVG source'),
  replace: z.string().describe('Text to put in its place'),
  all: z.boolean().optional().describe('Replace every occurrence (default: the text must occur exactly once)'),
})

/** Apply find/replace edits; returns the new source or an error. */
function applyEdits(svg: string, edits: z.infer<typeof editSchema>[]): { svg: string } | { error: string } {
  let out = svg
  for (const [n, e] of edits.entries()) {
    const count = out.split(e.find).length - 1
    if (count === 0) return { error: `Edit ${n + 1}: the text to find isn't in the source: ${JSON.stringify(e.find.slice(0, 120))}` }
    if (count > 1 && !e.all) return { error: `Edit ${n + 1}: the text to find occurs ${count} times. Include more surrounding text so it's unique, or set all: true.` }
    out = e.all ? out.split(e.find).join(e.replace) : out.replace(e.find, () => e.replace)
  }
  return { svg: out }
}

/** Check a source before saving: it must parse, and safety issues are reported. */
async function check(svg: string) {
  if (svg.length > 2_000_000) return { error: 'That SVG is over 2 MB; split it into smaller artworks.' }
  const err = await parseError(svg)
  if (err) return { error: `The SVG doesn't parse: ${err}` }
  return { warnings: safetyWarnings(svg) }
}

async function picture(svg: string, opts: { width?: number; background?: string; region?: Region } = {}): Promise<Content[]> {
  try {
    const png = await renderPng(svg, opts)
    return [{ type: 'image', data: png.base64, mimeType: 'image/png' }]
  } catch (e) {
    return [text(`(Couldn't render: ${e instanceof Error ? e.message : String(e)})`)]
  }
}

const warn = (w: string[]) => (w.length ? `\nWarnings: ${w.join('; ')}.` : '')

export function createServer(env: Env, origin: string) {
  const db = store(env)
  const server = new McpServer({ name: 'art-engine', version: '1.0.0' }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'list_artworks',
    { description: 'List all artworks in the studio, newest first.', inputSchema: z.object({}), annotations: { readOnlyHint: true } },
    async () => {
      const list = await db.list()
      if (!list.length) return { content: [text('The studio is empty. Use create_artwork to start something.')] }
      return { content: [text(list.map((a) => `- ${a.name} (id: ${a.id}, version ${a.version}, ${(a.size / 1024).toFixed(1)} KB, edited ${new Date(a.updated).toISOString()})`).join('\n'))] }
    },
  )

  server.registerTool(
    'get_artwork',
    { description: "Get an artwork's full SVG source.", inputSchema: z.object({ id: z.string() }), annotations: { readOnlyHint: true } },
    async ({ id }) => {
      const a = await db.get(id)
      if (!a) return fail(`No artwork with id "${id}".`)
      return { content: [text(`${a.name} (id: ${a.id}, version ${a.version})\n\n${a.svg}`)] }
    },
  )

  server.registerTool(
    'create_artwork',
    {
      description: 'Create a new artwork from SVG source. Returns its id and a rendered image.',
      inputSchema: z.object({ name: z.string().min(1).max(100), svg: z.string().min(1).describe('A complete SVG document with xmlns="http://www.w3.org/2000/svg"') }),
    },
    async ({ name, svg }) => {
      const c = await check(svg)
      if ('error' in c) return fail(c.error!)
      const a = await db.create(name, svg)
      return { content: [text(`Created "${a.name}" (id: ${a.id}).${warn(c.warnings!)}`), ...(await picture(a.svg))] }
    },
  )

  server.registerTool(
    'edit_artwork',
    {
      description: 'Make targeted find-and-replace edits to an artwork, saved as a new version. Each "find" must match exactly once unless all is true. Returns the new render.',
      inputSchema: z.object({ id: z.string(), edits: z.array(editSchema).min(1), note: z.string().optional().describe('What changed, for the version history') }),
    },
    async ({ id, edits, note }) => {
      const a = await db.get(id)
      if (!a) return fail(`No artwork with id "${id}".`)
      const r = applyEdits(a.svg, edits)
      if ('error' in r) return fail(r.error)
      const c = await check(r.svg)
      if ('error' in c) return fail(`${c.error} Nothing was saved.`)
      const saved = (await db.save(id, r.svg, note ?? 'edited'))!
      return { content: [text(`Saved "${saved.name}" as version ${saved.version}.${warn(c.warnings!)}`), ...(await picture(saved.svg))] }
    },
  )

  server.registerTool(
    'replace_artwork',
    {
      description: "Replace an artwork's whole SVG source (and optionally rename it), saved as a new version. Returns the new render.",
      inputSchema: z.object({ id: z.string(), svg: z.string().min(1), name: z.string().min(1).max(100).optional(), note: z.string().optional() }),
    },
    async ({ id, svg, name, note }) => {
      if (!(await db.get(id))) return fail(`No artwork with id "${id}".`)
      const c = await check(svg)
      if ('error' in c) return fail(`${c.error} Nothing was saved.`)
      if (name) await db.rename(id, name)
      const saved = (await db.save(id, svg, note ?? 'replaced'))!
      return { content: [text(`Saved "${saved.name}" as version ${saved.version}.${warn(c.warnings!)}`), ...(await picture(saved.svg))] }
    },
  )

  server.registerTool(
    'delete_artwork',
    {
      description: 'Permanently delete an artwork and all its versions. Only do this when the user has asked for it.',
      inputSchema: z.object({ id: z.string(), confirm: z.literal(true).describe('Must be true: confirms the user asked for this deletion') }),
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      const a = await db.get(id)
      if (!a) return fail(`No artwork with id "${id}".`)
      await db.remove(id)
      return { content: [text(`Deleted "${a.name}" (id: ${id}) and its ${a.version} version(s).`)] }
    },
  )

  server.registerTool(
    'render',
    {
      description: 'Render an artwork (or unsaved SVG source) to a PNG so you can see it. Use region to zoom into detail.',
      inputSchema: z.object({
        id: z.string().optional().describe('Artwork to render'),
        svg: z.string().optional().describe('Or render this SVG source without saving it'),
        version: z.number().int().positive().optional().describe('Render an older version of the artwork'),
        width: z.number().int().min(64).max(2048).optional().describe('Output width in pixels (default 1024)'),
        background: z.string().optional().describe('Background colour (default white); "transparent" for none'),
        region: regionSchema,
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ id, svg, version, width, background, region }) => {
      let source = svg
      if (!source && id) source = version ? ((await db.version(id, version)) ?? undefined) : (await db.get(id))?.svg
      if (!source) return fail(id ? `Couldn't find artwork "${id}"${version ? ` version ${version}` : ''}.` : 'Give an artwork id or some SVG source.')
      const err = await parseError(source)
      if (err) return fail(`The SVG doesn't parse: ${err}`)
      return { content: await picture(source, { width, background: background === 'transparent' ? undefined : (background ?? '#ffffff'), region }) }
    },
  )

  server.registerTool(
    'export_artwork',
    {
      description: 'Make a download link for an artwork as a PNG or SVG file, so the user can take it into other apps. The link works for 24 hours.',
      inputSchema: z.object({
        id: z.string(),
        format: z.enum(['png', 'svg']),
        version: z.number().int().positive().optional().describe('Export an older version (default: the current one)'),
        width: z.number().int().min(64).max(2048).optional().describe('PNG width in pixels (default 1024)'),
        background: z.string().optional().describe('PNG background colour (default white); "transparent" for none'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ id, format, version, width, background }) => {
      const a = await db.get(id)
      if (!a) return fail(`No artwork with id "${id}".`)
      const v = version ?? a.version
      if (!(await db.version(id, v))) return fail(`"${a.name}" has no version ${v}.`)
      const png = format === 'png'
      const e = await db.createExport(id, v, format, png ? (width ?? 1024) : null, png ? (background ?? '#ffffff') : null)
      return { content: [text(`Download "${a.name}" (version ${v}) as ${format.toUpperCase()}: ${origin}/export/${e.token}/${id}.${format}\nThe link works for 24 hours. Give it to the user as is.`)] }
    },
  )

  server.registerTool(
    'validate',
    { description: 'Check SVG source parses and is safe for the studio, without saving it.', inputSchema: z.object({ svg: z.string() }), annotations: { readOnlyHint: true } },
    async ({ svg }) => {
      const c = await check(svg)
      if ('error' in c) return fail(c.error!)
      return { content: [text(c.warnings!.length ? `Parses, but: ${c.warnings!.join('; ')}.` : 'Valid SVG with nothing to flag.')] }
    },
  )

  server.registerTool(
    'list_versions',
    { description: "An artwork's version history, newest first.", inputSchema: z.object({ id: z.string() }), annotations: { readOnlyHint: true } },
    async ({ id }) => {
      const a = await db.get(id)
      if (!a) return fail(`No artwork with id "${id}".`)
      const v = await db.versions(id)
      return { content: [text(v.map((x) => `- v${x.version}: ${x.note} (${new Date(x.created).toISOString()}, ${(x.size / 1024).toFixed(1)} KB)`).join('\n'))] }
    },
  )

  server.registerTool(
    'restore_version',
    { description: 'Bring back an older version of an artwork. It is saved as a new version, so nothing is lost.', inputSchema: z.object({ id: z.string(), version: z.number().int().positive() }) },
    async ({ id, version }) => {
      const old = await db.version(id, version)
      if (old === null) return fail(`No version ${version} of "${id}".`)
      const saved = (await db.save(id, old, `restored version ${version}`))!
      return { content: [text(`Restored version ${version} of "${saved.name}" as version ${saved.version}.`), ...(await picture(saved.svg))] }
    },
  )

  server.registerTool(
    'get_style_guide',
    { description: "The studio's art style guide. Read it before drawing.", inputSchema: z.object({}), annotations: { readOnlyHint: true } },
    async () => ({ content: [text((await db.getSetting('style_guide')) ?? 'No style guide has been written yet. Ask the user about the style, or write one with update_style_guide.')] }),
  )

  server.registerTool(
    'update_style_guide',
    { description: 'Replace the art style guide (Markdown). Only change it when the user asks or agrees.', inputSchema: z.object({ markdown: z.string().min(1).max(100_000) }) },
    async ({ markdown }) => {
      await db.setSetting('style_guide', markdown)
      return { content: [text('Style guide updated.')] }
    },
  )

  server.registerTool(
    'loop_artwork',
    {
      description:
        'Start an improvement loop on an artwork: you work towards a goal over several rounds, seeing a render after each, until you are satisfied, the goal is met, or the round limit is hit. After starting, call loop_step once per round.',
      inputSchema: z.object({
        id: z.string(),
        goal: z.string().min(1).describe('What the artwork should look like when the loop is done'),
        max_rounds: z.number().int().min(1).max(20).optional().describe('Most rounds allowed (default 5)'),
      }),
    },
    async ({ id, goal, max_rounds }) => {
      const a = await db.get(id)
      if (!a) return fail(`No artwork with id "${id}".`)
      const loop = await db.startLoop(id, goal, max_rounds ?? 5)
      return {
        content: [
          text(
            `Loop ${loop.id} started on "${a.name}" (version ${a.version}), up to ${loop.max_rounds} rounds.\nGoal: ${goal}\n\nHere is where it stands. Compare it critically with the goal and the style guide, then call loop_step with your improvement (edits or a full svg) and an honest assessment. Set done: true when the goal is met or you're satisfied.`,
          ),
          ...(await picture(a.svg)),
        ],
      }
    },
  )

  server.registerTool(
    'loop_step',
    {
      description: 'One round of an improvement loop: apply your changes, see the result, and either keep going or finish (done: true). The loop ends itself at its round limit.',
      inputSchema: z.object({
        loop_id: z.string(),
        assessment: z.string().min(1).describe('Your honest view of the current state against the goal, and what this round changes'),
        edits: z.array(editSchema).optional().describe('Targeted changes for this round'),
        svg: z.string().optional().describe('Or the full new SVG source'),
        done: z.boolean().optional().describe('True when the goal is met or you are satisfied'),
      }),
    },
    async ({ loop_id, assessment, edits, svg, done }) => {
      const loop = await db.loop(loop_id)
      if (!loop) return fail(`No loop "${loop_id}".`)
      if (loop.status !== 'running') return fail(`Loop ${loop_id} has already finished (${loop.status}). Start a new one with loop_artwork if more work is wanted.`)
      const a = await db.get(loop.artwork_id)
      if (!a) return fail('The artwork for this loop has been deleted.')
      let source = a.svg
      let changed = false
      if (svg || edits?.length) {
        if (svg) source = svg
        if (edits?.length) {
          const r = applyEdits(source, edits)
          if ('error' in r) return fail(`${r.error} This round wasn't counted; try again.`)
          source = r.svg
        }
        const c = await check(source)
        if ('error' in c) return fail(`${c.error} This round wasn't counted; try again.`)
        changed = source !== a.svg
      }
      const round = loop.round + 1
      const saved = changed ? (await db.save(a.id, source, `${loop_id} round ${round}: ${assessment}`))! : a
      const status = done ? 'satisfied' : round >= loop.max_rounds ? 'limit' : 'running'
      await db.updateLoop(loop_id, round, status)
      const head = `Round ${round} of ${loop.max_rounds}${changed ? `, saved as version ${saved.version}` : ', no changes'}.`
      const next =
        status === 'satisfied'
          ? `Loop finished: you judged the goal met. Summarise for the user what changed and what (if anything) is still worth improving.`
          : status === 'limit'
            ? `Loop finished: round limit reached. Tell the user honestly how close it got to the goal and what still needs work.`
            : `Look at the render, compare it with the goal ("${loop.goal}") and the style guide, then call loop_step again.`
      return { content: [text(`${head}\n${next}`), ...(await picture(saved.svg))] }
    },
  )

  return server
}
