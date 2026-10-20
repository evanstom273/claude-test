import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'

/**
 * Where the art lives: one Durable Object with a small SQLite database.
 * Every save keeps a numbered version, so nothing is ever lost to an edit.
 */

export interface ArtworkSummary {
  id: string
  name: string
  version: number
  updated: number
  size: number
}

export interface Artwork extends ArtworkSummary {
  svg: string
  created: number
}

export interface VersionInfo {
  version: number
  note: string
  created: number
  size: number
}

export interface Export {
  token: string
  artwork_id: string
  version: number
  format: 'png' | 'svg'
  width: number | null
  background: string | null
  expires: number
}

export interface Loop {
  id: string
  artwork_id: string
  goal: string
  max_rounds: number
  round: number
  status: 'running' | 'satisfied' | 'limit' | 'stopped'
  created: number
  updated: number
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'art'

export class ArtStore extends DurableObject<Env> {
  private sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS artworks (id TEXT PRIMARY KEY, name TEXT NOT NULL, svg TEXT NOT NULL, version INTEGER NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS versions (artwork_id TEXT NOT NULL, version INTEGER NOT NULL, svg TEXT NOT NULL, note TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (artwork_id, version));
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS exports (token TEXT PRIMARY KEY, artwork_id TEXT NOT NULL, version INTEGER NOT NULL, format TEXT NOT NULL, width INTEGER, background TEXT, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS loops (id TEXT PRIMARY KEY, artwork_id TEXT NOT NULL, goal TEXT NOT NULL, max_rounds INTEGER NOT NULL, round INTEGER NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);
    `)
  }

  list(): ArtworkSummary[] {
    return this.sql.exec<{ id: string; name: string; version: number; updated: number; size: number }>('SELECT id, name, version, updated, length(svg) AS size FROM artworks ORDER BY updated DESC').toArray()
  }

  get(id: string): Artwork | null {
    const rows = this.sql.exec<Artwork & Record<string, SqlStorageValue>>('SELECT id, name, svg, version, created, updated, length(svg) AS size FROM artworks WHERE id = ?', id).toArray()
    return rows[0] ?? null
  }

  create(name: string, svg: string): Artwork {
    const base = slug(name)
    let id = base
    for (let n = 2; this.get(id); n++) id = `${base}-${n}`
    const now = Date.now()
    this.sql.exec('INSERT INTO artworks (id, name, svg, version, created, updated) VALUES (?, ?, ?, 1, ?, ?)', id, name, svg, now, now)
    this.sql.exec('INSERT INTO versions (artwork_id, version, svg, note, created) VALUES (?, 1, ?, ?, ?)', id, svg, 'created', now)
    return this.get(id)!
  }

  /** Save new source as the next version. */
  save(id: string, svg: string, note: string): Artwork | null {
    const a = this.get(id)
    if (!a) return null
    const v = a.version + 1
    const now = Date.now()
    this.sql.exec('UPDATE artworks SET svg = ?, version = ?, updated = ? WHERE id = ?', svg, v, now, id)
    this.sql.exec('INSERT INTO versions (artwork_id, version, svg, note, created) VALUES (?, ?, ?, ?, ?)', id, v, svg, note.slice(0, 500), now)
    return this.get(id)
  }

  rename(id: string, name: string): Artwork | null {
    this.sql.exec('UPDATE artworks SET name = ?, updated = ? WHERE id = ?', name, Date.now(), id)
    return this.get(id)
  }

  remove(id: string): boolean {
    if (!this.get(id)) return false
    this.sql.exec('DELETE FROM artworks WHERE id = ?', id)
    this.sql.exec('DELETE FROM versions WHERE artwork_id = ?', id)
    this.sql.exec('DELETE FROM loops WHERE artwork_id = ?', id)
    this.sql.exec('DELETE FROM exports WHERE artwork_id = ?', id)
    return true
  }

  versions(id: string): VersionInfo[] {
    return this.sql.exec<{ version: number; note: string; created: number; size: number }>('SELECT version, note, created, length(svg) AS size FROM versions WHERE artwork_id = ? ORDER BY version DESC', id).toArray()
  }

  version(id: string, version: number): string | null {
    const rows = this.sql.exec<{ svg: string }>('SELECT svg FROM versions WHERE artwork_id = ? AND version = ?', id, version).toArray()
    return rows[0]?.svg ?? null
  }

  getSetting(key: string): string | null {
    const rows = this.sql.exec<{ value: string }>('SELECT value FROM settings WHERE key = ?', key).toArray()
    return rows[0]?.value ?? null
  }

  setSetting(key: string, value: string) {
    this.sql.exec('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value)
  }

  /** A download link for one version of an artwork, valid for a day. */
  createExport(artworkId: string, version: number, format: Export['format'], width: number | null, background: string | null): Export {
    const now = Date.now()
    this.sql.exec('DELETE FROM exports WHERE expires < ?', now)
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    this.sql.exec('INSERT INTO exports (token, artwork_id, version, format, width, background, expires) VALUES (?, ?, ?, ?, ?, ?, ?)', token, artworkId, version, format, width, background, now + 24 * 60 * 60 * 1000)
    return this.export(token)!
  }

  export(token: string): Export | null {
    const rows = this.sql.exec<Export & Record<string, SqlStorageValue>>('SELECT * FROM exports WHERE token = ? AND expires >= ?', token, Date.now()).toArray()
    return rows[0] ?? null
  }

  startLoop(artworkId: string, goal: string, maxRounds: number): Loop {
    const id = `loop-${crypto.randomUUID().slice(0, 8)}`
    const now = Date.now()
    this.sql.exec('INSERT INTO loops (id, artwork_id, goal, max_rounds, round, status, created, updated) VALUES (?, ?, ?, ?, 0, ?, ?, ?)', id, artworkId, goal, maxRounds, 'running', now, now)
    return this.loop(id)!
  }

  loop(id: string): Loop | null {
    const rows = this.sql.exec<Loop & Record<string, SqlStorageValue>>('SELECT * FROM loops WHERE id = ?', id).toArray()
    return rows[0] ?? null
  }

  updateLoop(id: string, round: number, status: Loop['status']): Loop | null {
    this.sql.exec('UPDATE loops SET round = ?, status = ?, updated = ? WHERE id = ?', round, status, Date.now(), id)
    return this.loop(id)
  }
}
