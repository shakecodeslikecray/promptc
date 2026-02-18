import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { request } from 'undici';
import type { PromptcConfig } from './config.js';
import { detectFormat, type ApiFormat } from './detect-format.js';
import { rewritePrompt } from './rewrite/pipeline.js';
import { logRequest, getRequestHistory, getStats, clearHistory, clearCache } from './cache/store.js';
import { listProfiles } from './profiles/loader.js';
import { getSessionId, appendToSession, getSessionHistory } from './session/tracker.js';
import { buildSessionContext } from './session/context.js';

// Headers to strip (hop-by-hop) before forwarding
const HOP_HEADERS = new Set([
  'host', 'connection', 'keep-alive', 'transfer-encoding',
  'te', 'trailer', 'upgrade', 'content-length',
]);

export async function createServer(config: PromptcConfig) {
  const app = Fastify({
    logger: config.logLevel !== 'silent',
    bodyLimit: 10 * 1024 * 1024, // 10MB for large prompts
  });

  await app.register(cors, { origin: true });

  // Raw body access — we need to parse JSON ourselves for rewriting
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Serve dashboard static files
  const dashboardDir = path.join(import.meta.dirname, 'dashboard');
  try {
    const { statSync } = await import('node:fs');
    statSync(dashboardDir);
    await app.register(fastifyStatic, {
      root: dashboardDir,
      prefix: '/dashboard/',
      decorateReply: false,
    });
  } catch {
    app.get('/dashboard', async (_req, reply) => {
      reply.type('text/html').send('<html><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;padding:40px"><h1>promptc dashboard</h1><p>Run <code>npm run dashboard:build</code> to build the dashboard SPA.</p></body></html>');
    });
  }

  // --- Dashboard API routes ---

  app.get('/api/stats', async () => getStats());

  app.get('/api/history', async (req) => {
    const query = req.query as { limit?: string; offset?: string };
    return getRequestHistory(
      parseInt(query.limit ?? '50', 10),
      parseInt(query.offset ?? '0', 10),
    );
  });

  app.delete('/api/history', async () => {
    clearHistory();
    return { ok: true };
  });

  app.delete('/api/cache', async () => {
    clearCache();
    return { ok: true };
  });

  app.get('/api/profiles', async () => listProfiles());

  // --- Transparent proxy: catch ALL paths under /v1/ ---
  // This way we forward /v1/messages, /v1/chat/completions, and anything else

  app.all('/v1/*', async (req, reply) => {
    return handleProxy(req, reply, config);
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', version: '0.1.0' }));

  return app;
}

async function handleProxy(
  req: any,
  reply: any,
  config: PromptcConfig,
) {
  const startTime = Date.now();
  const incomingFormat = detectFormat(req.url, req.headers).format;
  const body = req.body as Record<string, unknown> | undefined;
  const isStream = body?.stream === true;
  const isPostWithBody = req.method === 'POST' && body;

  // --- Build forwarding headers (passthrough everything from client) ---
  const forwardHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (HOP_HEADERS.has(key.toLowerCase())) continue;
    if (typeof value === 'string') forwardHeaders[key] = value;
    if (Array.isArray(value)) forwardHeaders[key] = value.join(', ');
  }

  // --- If it's a POST with a body, try to rewrite the prompt ---
  let rewriteResult: { original: string; rewritten: string; profile: string; cached: boolean } | null = null;
  let finalBody = body ? JSON.stringify(body) : undefined;

  if (isPostWithBody) {
    const { promptText, systemText } = extractPromptText(body!, incomingFormat);

    if (promptText) {
      // Session tracking
      const apiKey = (req.headers['authorization'] as string ?? '').replace('Bearer ', '').replace('x-api-key ', '');
      const sessionId = getSessionId(apiKey, body!.session_id as string | undefined);
      const history = getSessionHistory(sessionId);
      const sessionCtx = buildSessionContext(sessionId, history, promptText);

      appendToSession(sessionId, [{ role: 'user', content: promptText }]);

      // Detect target model from the request body itself
      const targetModel = (body!.model as string) ?? 'unknown';

      // Rewrite
      const result = await rewritePrompt(
        promptText,
        targetModel,
        config.ollamaModel,
        config.ollamaUrl,
        config.cacheEnabled,
        sessionCtx,
      );

      rewriteResult = {
        original: promptText,
        rewritten: result.rewritten,
        profile: result.profile,
        cached: result.cached,
      };

      // Apply rewrite back into the body, keep everything else untouched
      const modifiedBody = applyRewrite(body!, incomingFormat, result.rewritten);
      finalBody = JSON.stringify(modifiedBody);
    }
  }

  // --- Forward to target, preserving the exact path ---
  const targetUrl = `${config.targetBaseUrl.replace(/\/$/, '')}${req.url}`;

  try {
    const resp = await request(targetUrl, {
      method: req.method,
      headers: {
        ...forwardHeaders,
        'content-type': 'application/json',
      },
      body: finalBody,
    });

    const latencyMs = Date.now() - startTime;

    // --- Stream: pipe through untouched ---
    if (isStream) {
      // Copy response headers
      const respHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(resp.headers)) {
        if (value && !HOP_HEADERS.has(key.toLowerCase())) {
          respHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
        }
      }

      reply.raw.writeHead(resp.statusCode, respHeaders);

      let responsePreview = '';
      for await (const chunk of resp.body) {
        reply.raw.write(chunk);
        if (responsePreview.length < 200) {
          responsePreview += chunk.toString();
        }
      }
      reply.raw.end();

      // Log
      if (rewriteResult) {
        logRequest({
          sourceFormat: incomingFormat,
          targetModel: (body?.model as string) ?? 'unknown',
          originalPrompt: rewriteResult.original.slice(0, 500),
          rewrittenPrompt: rewriteResult.rewritten.slice(0, 500),
          profileUsed: rewriteResult.profile,
          cached: rewriteResult.cached,
          latencyMs,
          responsePreview: responsePreview.slice(0, 200),
        });
      }

      return;
    }

    // --- Non-stream: pass response body through untouched ---
    const responseBuffer = await resp.body.arrayBuffer();
    const responseBytes = Buffer.from(responseBuffer);

    // Copy response headers
    for (const [key, value] of Object.entries(resp.headers)) {
      if (value && !HOP_HEADERS.has(key.toLowerCase())) {
        reply.header(key, value);
      }
    }

    // Log
    if (rewriteResult) {
      const preview = responseBytes.toString('utf-8').slice(0, 200);

      logRequest({
        sourceFormat: incomingFormat,
        targetModel: (body?.model as string) ?? 'unknown',
        originalPrompt: rewriteResult.original.slice(0, 500),
        rewrittenPrompt: rewriteResult.rewritten.slice(0, 500),
        profileUsed: rewriteResult.profile,
        cached: rewriteResult.cached,
        latencyMs,
        responsePreview: preview,
      });

      // Track assistant response in session
      try {
        const respJson = JSON.parse(responseBytes.toString('utf-8'));
        const assistantText = extractResponseText(respJson, incomingFormat);
        if (assistantText) {
          const apiKey = (req.headers['authorization'] as string ?? '').replace('Bearer ', '');
          const sessionId = getSessionId(apiKey, body?.session_id as string | undefined);
          appendToSession(sessionId, [{ role: 'assistant', content: assistantText }]);
        }
      } catch {
        // Response may not be JSON, that's fine
      }
    }

    reply.status(resp.statusCode).send(responseBytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[promptc] Proxy error: ${msg}`);
    reply.status(502).send({ error: 'proxy_error', message: msg });
  }
}

function extractPromptText(body: Record<string, unknown>, format: ApiFormat): { promptText: string; systemText?: string } {
  if (format === 'anthropic') {
    const messages = (body.messages as Array<{ role: string; content: unknown }>) ?? [];
    const last = messages[messages.length - 1];
    const promptText = typeof last?.content === 'string'
      ? last.content
      : Array.isArray(last?.content)
        ? (last.content as Array<{ text?: string }>).map(b => b.text ?? '').join('\n')
        : '';
    const systemText = typeof body.system === 'string' ? body.system : undefined;
    return { promptText, systemText };
  }

  // OpenAI
  const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? [];
  const userMsgs = messages.filter(m => m.role === 'user');
  const last = userMsgs[userMsgs.length - 1];
  const systemMsgs = messages.filter(m => m.role === 'system');
  return {
    promptText: last?.content ?? '',
    systemText: systemMsgs.map(m => m.content).join('\n') || undefined,
  };
}

function applyRewrite(body: Record<string, unknown>, format: ApiFormat, rewritten: string): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(body));

  if (format === 'anthropic') {
    const messages = clone.messages as Array<{ role: string; content: unknown }>;
    const last = messages[messages.length - 1];
    if (last && typeof last.content === 'string') {
      last.content = rewritten;
    } else if (last && Array.isArray(last.content)) {
      const textBlock = (last.content as Array<{ type: string; text?: string }>).find(b => b.type === 'text');
      if (textBlock) textBlock.text = rewritten;
    }
    return clone;
  }

  // OpenAI
  const messages = clone.messages as Array<{ role: string; content: string | null }>;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      messages[i].content = rewritten;
      break;
    }
  }
  return clone;
}

function extractResponseText(response: Record<string, unknown>, format: ApiFormat): string | null {
  if (format === 'anthropic') {
    const content = response.content as Array<{ text?: string }> | undefined;
    return content?.map(b => b.text ?? '').join('') ?? null;
  }
  const choices = response.choices as Array<{ message?: { content?: string } }> | undefined;
  return choices?.[0]?.message?.content ?? null;
}
