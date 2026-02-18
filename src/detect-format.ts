export type ApiFormat = 'anthropic' | 'openai';

export interface FormatDetection {
  format: ApiFormat;
  path: string;
}

export function detectFormat(url: string, headers: Record<string, string | undefined>): FormatDetection {
  // Path-based detection
  if (url.includes('/v1/messages')) {
    return { format: 'anthropic', path: url };
  }
  if (url.includes('/v1/chat/completions')) {
    return { format: 'openai', path: url };
  }

  // Header-based detection
  const anthropicVersion = headers['anthropic-version'];
  if (anthropicVersion) {
    return { format: 'anthropic', path: url };
  }

  // Default to OpenAI format
  return { format: 'openai', path: url };
}
