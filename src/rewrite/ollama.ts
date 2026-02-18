import { Ollama } from 'ollama';
import type { ModelProfile } from '../profiles/loader.js';

let ollamaClient: Ollama | null = null;

function getClient(baseUrl: string): Ollama {
  if (!ollamaClient) {
    ollamaClient = new Ollama({ host: baseUrl });
  }
  return ollamaClient;
}

export async function ollamaRewrite(
  originalPrompt: string,
  deterministicResult: string,
  profile: ModelProfile,
  ollamaModel: string,
  ollamaUrl: string,
): Promise<string> {
  const client = getClient(ollamaUrl);

  const metaPrompt = `You are a prompt adaptation engine. Your job is to rewrite prompts so that a target LLM interprets them with the same intent as the original author intended.

TARGET MODEL: ${profile.name} (${profile.provider})
PREFERRED FORMAT: ${profile.preferredFormat}
MODEL CHARACTERISTICS:
- Strengths: ${profile.strengths.join(', ')}
- Quirks: ${profile.quirks.join(', ')}
- System prompt style: ${profile.systemPromptStyle}

ORIGINAL PROMPT (written for Claude):
---
${originalPrompt}
---

STRUCTURALLY ADAPTED VERSION:
---
${deterministicResult}
---

Rewrite the structurally adapted version to maximize intent preservation for ${profile.name}.
Rules:
1. Preserve ALL factual content and instructions
2. Adapt structure and emphasis to match what ${profile.name} responds best to
3. Do NOT add new instructions or remove existing ones
4. Do NOT explain your changes - output ONLY the rewritten prompt
5. Keep the same language as the original`;

  try {
    const response = await client.generate({
      model: ollamaModel,
      prompt: metaPrompt,
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 4096,
      },
    });

    return response.response.trim();
  } catch (err) {
    // If Ollama is unavailable, return the deterministic result
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[promptc] Ollama unavailable (${msg}), using deterministic rewrite only`);
    return deterministicResult;
  }
}

export async function isOllamaAvailable(ollamaUrl: string): Promise<boolean> {
  try {
    const client = getClient(ollamaUrl);
    await client.list();
    return true;
  } catch {
    return false;
  }
}
