// Dashboard API routes are registered inline in server.ts
// This file exists for future extraction if routes grow

export { getStats, getRequestHistory, clearHistory, clearCache } from '../cache/store.js';
export { listProfiles } from '../profiles/loader.js';
