import type { TrackedMessage } from './tracker.js';

export interface SessionContext {
  sessionId: string;
  turnCount: number;
  enrichment?: string;
}

/**
 * Analyze conversation history for context gaps and generate enrichment text.
 * When the latest user message references something from earlier turns
 * that might be ambiguous to the target model, we pull that context forward.
 */
export function buildSessionContext(
  sessionId: string,
  history: TrackedMessage[],
  latestMessage: string,
): SessionContext {
  const turnCount = history.length;

  if (turnCount < 2) {
    return { sessionId, turnCount };
  }

  // Detect pronouns and references that need context
  const needsContext = detectContextGaps(latestMessage, history);

  if (!needsContext) {
    return { sessionId, turnCount };
  }

  // Build enrichment from recent history
  const enrichment = buildEnrichment(history, latestMessage);

  return {
    sessionId,
    turnCount,
    enrichment: enrichment || undefined,
  };
}

function detectContextGaps(message: string, history: TrackedMessage[]): boolean {
  const lower = message.toLowerCase();

  // Pronoun references that likely refer to prior context
  const pronounPatterns = [
    /\b(it|this|that|these|those|the above|the previous|as mentioned)\b/i,
    /\b(continue|go on|keep going|more of)\b/i,
    /\b(same|similar|like before|as before)\b/i,
  ];

  for (const pattern of pronounPatterns) {
    if (pattern.test(lower)) return true;
  }

  // Short messages in multi-turn conversations often need context
  if (message.length < 50 && history.length > 2) return true;

  return false;
}

function buildEnrichment(history: TrackedMessage[], _latestMessage: string): string | null {
  // Take the last few turns and summarize them as context
  const recentTurns = history.slice(-6);
  if (recentTurns.length === 0) return null;

  const lines: string[] = ['[Conversation context from prior turns:]'];

  for (const turn of recentTurns) {
    const preview = turn.content.length > 200
      ? turn.content.slice(0, 200) + '...'
      : turn.content;
    lines.push(`${turn.role}: ${preview}`);
  }

  return lines.join('\n');
}
