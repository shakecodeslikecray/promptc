import type { ModelProfile } from '../profiles/loader.js';
import { findProfileForModel } from '../profiles/loader.js';
import { deterministicRewrite } from './deterministic.js';
import { ollamaRewrite, isOllamaAvailable } from './ollama.js';
import { getCachedRewrite, cacheRewrite } from '../cache/store.js';
import { hashPrompt } from '../cache/hash.js';
import type { SessionContext } from '../session/context.js';

export interface RewriteResult {
  original: string;
  rewritten: string;
  profile: string;
  pass1Only: boolean;
  cached: boolean;
  sessionEnriched: boolean;
}

export async function rewritePrompt(
  prompt: string,
  targetModel: string,
  ollamaModel: string,
  ollamaUrl: string,
  cacheEnabled: boolean,
  sessionContext?: SessionContext,
): Promise<RewriteResult> {
  const profile = await findProfileForModel(targetModel);

  if (!profile) {
    return {
      original: prompt,
      rewritten: prompt,
      profile: 'none',
      pass1Only: false,
      cached: false,
      sessionEnriched: false,
    };
  }

  // Enrich prompt with session context if available
  let enrichedPrompt = prompt;
  let sessionEnriched = false;
  if (sessionContext?.enrichment) {
    enrichedPrompt = `${sessionContext.enrichment}\n\n${prompt}`;
    sessionEnriched = true;
  }

  // Check cache
  const cacheKey = hashPrompt(enrichedPrompt, targetModel);
  if (cacheEnabled) {
    const cached = getCachedRewrite(cacheKey);
    if (cached) {
      return {
        original: prompt,
        rewritten: cached,
        profile: profile.name,
        pass1Only: false,
        cached: true,
        sessionEnriched,
      };
    }
  }

  // Pass 1: Deterministic
  const pass1 = deterministicRewrite(enrichedPrompt, profile);

  // Pass 2: Ollama (if available)
  let rewritten = pass1;
  let pass1Only = true;

  const ollamaUp = await isOllamaAvailable(ollamaUrl);
  if (ollamaUp) {
    rewritten = await ollamaRewrite(enrichedPrompt, pass1, profile, ollamaModel, ollamaUrl);
    pass1Only = false;
  } else {
    console.warn('[promptc] Ollama unavailable, using Pass 1 (deterministic) only');
  }

  // Cache result
  if (cacheEnabled) {
    cacheRewrite(cacheKey, rewritten);
  }

  return {
    original: prompt,
    rewritten,
    profile: profile.name,
    pass1Only,
    cached: false,
    sessionEnriched,
  };
}
