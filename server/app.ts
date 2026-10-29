import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProviderId } from '../src/providers';
import { publicModelCatalog, type CatalogOptions } from './modelCatalog';
import {
  fetchModels,
  providerRegistry,
  safeProviderError,
  streamChat,
  type ProviderOptions,
} from './providers';

export function createApp(options: ProviderOptions & { catalog?: CatalogOptions } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  // This is a single-user local server. Never send credentials to the browser.
  const registry = providerRegistry(options);
  const catalog = publicModelCatalog(options.catalog);
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.get('origin');
    if (origin && new URL(origin).host !== req.get('host')) {
      res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
      return;
    }
    next();
  });
  app.get('/api/config', (_req, res) => res.json(registry.publicConfig()));
  app.get('/api/models/catalog', async (req, res) => {
    res.json(await catalog.get(req.query.refresh === '1'));
  });
  app.post('/api/config', async (req, res) => {
    // Accept the old OpenAI-only payload for existing local clients.
    const id = req.body?.provider ?? 'openai';
    if (!isProviderId(id)) {
      res.status(400).json({ error: 'Unknown AI provider.' });
      return;
    }
    if (!req.body?.provider && !req.body?.apiKey?.trim()) {
      res.status(400).json({ error: 'Enter a valid API key.' });
      return;
    }
    const { provider: _provider, ...patch } = req.body;
    try {
      await registry.update(id, patch);
      res.json(registry.publicConfig());
    } catch (error) {
      res
        .status(400)
        .json({ error: error instanceof Error ? error.message : 'Unable to save settings.' });
    }
  });
  app.get('/api/providers/:provider/models', async (req, res) => {
    const id = req.params.provider;
    if (!isProviderId(id)) {
      res.status(400).json({ error: 'Unknown AI provider.' });
      return;
    }
    if (!registry.ready(id)) {
      res.status(401).json({ error: 'Add API key in settings' });
      return;
    }
    const config = registry.get(id);
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const models = await fetchModels(id, config, controller.signal);
      // Do not cache a response for settings which changed during the request.
      if (JSON.stringify(config) === JSON.stringify(registry.get(id)))
        registry.discover(id, models);
      res.json({ models });
    } catch (error) {
      if (!res.destroyed)
        res.status(502).json({
          error: controller.signal.aborted
            ? 'Model discovery timed out.'
            : safeProviderError(error, config),
        });
    } finally {
      clearTimeout(timeout);
    }
  });
  app.post('/api/providers/ollama/test', async (req, res) => {
    // Validate the draft URL without changing saved settings.
    const baseURL = req.body?.baseURL;
    try {
      if (typeof baseURL !== 'string' || baseURL.length > 2048)
        throw new Error('Enter a valid Ollama base URL.');
      const url = new URL(baseURL);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error('Enter an HTTP(S) base URL without credentials, query, or fragment.');
      const controller = new AbortController();
      res.on('close', () => controller.abort());
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
      try {
        const models = await fetchModels(
          'ollama',
          registry.get('ollama'),
          controller.signal,
          baseURL.replace(/\/+$/, ''),
        );
        res.json({ connected: true, models });
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      if (!res.destroyed)
        res.status(502).json({
          error: 'Unable to connect to Ollama. Check the base URL and that Ollama is running.',
        });
    }
  });
  let active = 0;
  let testing = false;
  app.post('/api/providers/:provider/test-model', async (req, res) => {
    const id = req.params.provider;
    const model = req.body?.model;
    if (
      !isProviderId(id) ||
      typeof model !== 'string' ||
      !model.trim() ||
      model.length > 512 ||
      /[\r\n\0]/.test(model) ||
      Object.keys(req.body).some((key) => key !== 'model')
    ) {
      res
        .status(400)
        .json({ error: 'Choose a provider and exact model ID. Only a model ID is accepted.' });
      return;
    }
    if (!registry.ready(id)) {
      res.status(401).json({ error: 'Save this provider’s settings before testing.' });
      return;
    }
    if (active >= 5 || testing) {
      res
        .status(429)
        .json({ error: 'Another model test or too many conversations are running. Please wait.' });
      return;
    }
    const config = registry.get(id);
    const controller = new AbortController();
    const started = Date.now();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
    res.on('close', () => controller.abort());
    active++;
    testing = true;
    try {
      let text = '';
      for await (const token of streamChat(
        id,
        config,
        model.trim(),
        [
          {
            role: 'user',
            content: 'Reply with one short sentence confirming you can respond. Do not use tools.',
          },
        ],
        controller.signal,
        { maxOutputTokens: 128 },
      )) {
        text += token;
        if (text.length > 4096) {
          controller.abort();
          throw new Error('The model exceeded the test response limit. The test was stopped.');
        }
      }
      if (controller.signal.aborted) throw new Error('The model test was stopped.');
      if (!text.trim())
        throw new Error(
          'The model completed without a text response. Compatibility has not been confirmed.',
        );
      if (JSON.stringify(config) !== JSON.stringify(registry.get(id)))
        throw new Error(
          'Provider settings changed during this test. Test the current settings again.',
        );
      if (!res.destroyed)
        res.json({
          provider: id,
          model: model.trim(),
          text: text.trim(),
          elapsedMs: Date.now() - started,
          status: 'passed',
        });
    } catch (error) {
      if (!res.destroyed)
        res.status(502).json({
          error: controller.signal.aborted
            ? 'The model test was stopped or timed out. It may still incur provider charges.'
            : safeProviderError(error, config),
          elapsedMs: Date.now() - started,
        });
    } finally {
      clearTimeout(timeout);
      active--;
      testing = false;
    }
  });
  app.post('/api/chat', async (req, res) => {
    const provider = req.body?.provider ?? 'openai';
    if (!isProviderId(provider)) {
      res.status(400).json({ error: 'Unknown AI provider.' });
      return;
    }
    const config = registry.get(provider);
    const model = req.body?.model ?? config.model;
    if (typeof model !== 'string' || !model.trim() || model.length > 512 || /[\r\n]/.test(model)) {
      res.status(400).json({ error: 'Select a valid model in this node.' });
      return;
    }
    if (!registry.ready(provider)) {
      res
        .status(401)
        .json({ error: 'Configure this provider in AI settings to start a conversation.' });
      return;
    }
    const messages = req.body.messages;
    if (
      !Array.isArray(messages) ||
      !messages.length ||
      messages.length > 500 ||
      !messages.every(
        (m) =>
          m &&
          ['user', 'assistant', 'system'].includes(m.role) &&
          typeof m.content === 'string' &&
          m.content.length <= 100_000,
      )
    ) {
      res.status(400).json({ error: 'Invalid conversation. Use up to 500 text messages.' });
      return;
    }
    if (active >= 5) {
      res.status(429).json({ error: 'Five conversations are already streaming. Please wait.' });
      return;
    }
    active++;
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 180_000);
    try {
      const emit = (data: object) => {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('X-Accel-Buffering', 'no');
          res.flushHeaders();
        }
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      for await (const token of streamChat(provider, config, model, messages, controller.signal, {
        onUsage: (usage) => emit({ usage }),
      }))
        emit({ token });
      emit({ done: true });
      res.end();
    } catch (error) {
      if (res.destroyed) return;
      const message = controller.signal.aborted
        ? 'The request timed out. Please retry.'
        : safeProviderError(error, config);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      } else {
        const status = (error as { status?: number }).status;
        res
          .status(status && status >= 400 && status <= 599 ? status : 502)
          .json({ error: message });
      }
    } finally {
      clearTimeout(timeout);
      active--;
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
  app.use(
    (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(400).json({ error: error.message || 'Invalid request.' });
    },
  );
  return app;
}
