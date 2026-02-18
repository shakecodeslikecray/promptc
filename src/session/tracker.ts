import { hashSession } from '../cache/hash.js';
import { getSession, upsertSession } from '../cache/store.js';

export interface TrackedMessage {
  role: string;
  content: string;
}

export function getSessionId(apiKey: string, threadHint?: string): string {
  const thread = threadHint ?? 'default';
  return hashSession(apiKey, thread);
}

export function appendToSession(sessionId: string, messages: TrackedMessage[]): TrackedMessage[] {
  const existing = getSession(sessionId);
  const history = existing?.history ?? [];

  for (const msg of messages) {
    history.push({ role: msg.role, content: msg.content });
  }

  // Keep last 50 turns max
  const trimmed = history.slice(-100);
  upsertSession(sessionId, trimmed);
  return trimmed;
}

export function getSessionHistory(sessionId: string): TrackedMessage[] {
  const existing = getSession(sessionId);
  return existing?.history ?? [];
}
