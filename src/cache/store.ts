import Database from 'better-sqlite3';
import path from 'node:path';
import { getConfigDir } from '../config.js';

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(getConfigDir(), 'promptc.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS rewrite_cache (
        hash TEXT PRIMARY KEY,
        rewritten TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS request_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
        source_format TEXT NOT NULL,
        target_model TEXT NOT NULL,
        original_prompt TEXT,
        rewritten_prompt TEXT,
        profile_used TEXT,
        cached INTEGER NOT NULL DEFAULT 0,
        latency_ms INTEGER,
        session_id TEXT,
        response_preview TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        history TEXT NOT NULL DEFAULT '[]'
      );
    `);
  }
  return db;
}

// --- Rewrite Cache ---

export function getCachedRewrite(hash: string): string | null {
  const row = getDb().prepare('SELECT rewritten FROM rewrite_cache WHERE hash = ?').get(hash) as { rewritten: string } | undefined;
  return row?.rewritten ?? null;
}

export function cacheRewrite(hash: string, rewritten: string): void {
  getDb().prepare('INSERT OR REPLACE INTO rewrite_cache (hash, rewritten) VALUES (?, ?)').run(hash, rewritten);
}

// --- Request Log ---

export interface RequestLogEntry {
  id?: number;
  timestamp?: number;
  sourceFormat: string;
  targetModel: string;
  originalPrompt?: string;
  rewrittenPrompt?: string;
  profileUsed?: string;
  cached: boolean;
  latencyMs?: number;
  sessionId?: string;
  responsePreview?: string;
}

export function logRequest(entry: RequestLogEntry): void {
  getDb().prepare(`
    INSERT INTO request_log (source_format, target_model, original_prompt, rewritten_prompt, profile_used, cached, latency_ms, session_id, response_preview)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.sourceFormat,
    entry.targetModel,
    entry.originalPrompt ?? null,
    entry.rewrittenPrompt ?? null,
    entry.profileUsed ?? null,
    entry.cached ? 1 : 0,
    entry.latencyMs ?? null,
    entry.sessionId ?? null,
    entry.responsePreview ?? null,
  );
}

export function getRequestHistory(limit = 50, offset = 0): RequestLogEntry[] {
  const rows = getDb().prepare(
    'SELECT * FROM request_log ORDER BY timestamp DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as Array<Record<string, unknown>>;

  return rows.map(r => ({
    id: r.id as number,
    timestamp: r.timestamp as number,
    sourceFormat: r.source_format as string,
    targetModel: r.target_model as string,
    originalPrompt: r.original_prompt as string | undefined,
    rewrittenPrompt: r.rewritten_prompt as string | undefined,
    profileUsed: r.profile_used as string | undefined,
    cached: r.cached === 1,
    latencyMs: r.latency_ms as number | undefined,
    sessionId: r.session_id as string | undefined,
    responsePreview: r.response_preview as string | undefined,
  }));
}

export function clearHistory(): void {
  getDb().prepare('DELETE FROM request_log').run();
}

export function clearCache(): void {
  getDb().prepare('DELETE FROM rewrite_cache').run();
}

// --- Sessions ---

export interface SessionRow {
  sessionId: string;
  history: Array<{ role: string; content: string }>;
  updatedAt: number;
}

export function getSession(sessionId: string): SessionRow | null {
  const row = getDb().prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    sessionId: row.session_id as string,
    history: JSON.parse(row.history as string),
    updatedAt: row.updated_at as number,
  };
}

export function upsertSession(sessionId: string, history: Array<{ role: string; content: string }>): void {
  getDb().prepare(`
    INSERT INTO sessions (session_id, history, updated_at) VALUES (?, ?, unixepoch())
    ON CONFLICT(session_id) DO UPDATE SET history = excluded.history, updated_at = excluded.updated_at
  `).run(sessionId, JSON.stringify(history));
}

export function getStats(): { totalRequests: number; cachedRequests: number; cacheEntries: number; sessions: number } {
  const total = (getDb().prepare('SELECT COUNT(*) as c FROM request_log').get() as { c: number }).c;
  const cached = (getDb().prepare('SELECT COUNT(*) as c FROM request_log WHERE cached = 1').get() as { c: number }).c;
  const cacheEntries = (getDb().prepare('SELECT COUNT(*) as c FROM rewrite_cache').get() as { c: number }).c;
  const sessions = (getDb().prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
  return { totalRequests: total, cachedRequests: cached, cacheEntries, sessions };
}
