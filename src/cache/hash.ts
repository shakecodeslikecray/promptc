import { createHash } from 'node:crypto';

export function hashPrompt(prompt: string, targetModel: string): string {
  return createHash('sha256')
    .update(`${targetModel}::${prompt}`)
    .digest('hex');
}

export function hashSession(apiKey: string, threadId: string): string {
  return createHash('sha256')
    .update(`${apiKey}::${threadId}`)
    .digest('hex')
    .slice(0, 16);
}
