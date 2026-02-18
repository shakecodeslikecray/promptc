#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig, initConfig } from '../config.js';
import { createServer } from '../server.js';
import { listProfiles } from '../profiles/loader.js';

const program = new Command();

program
  .name('promptc')
  .description('Prompt compiler proxy -- preserve developer intent across any LLM')
  .version('0.1.0');

program
  .command('init')
  .description('Create ~/.promptc/config.yaml with defaults and profile files')
  .action(async () => {
    await initConfig();
    console.log('Initialized ~/.promptc/config.yaml and default profiles.');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Edit ~/.promptc/config.yaml');
    console.log('     Set targetBaseUrl to your subscription endpoint');
    console.log('     (e.g. https://api.z.ai/api/anthropic)');
    console.log('  2. Run: promptc start');
    console.log('  3. Point your tool at http://localhost:4000 instead of the real API');
    console.log('     e.g. ANTHROPIC_BASE_URL=http://localhost:4000 claude');
  });

program
  .command('start')
  .description('Start the proxy server')
  .option('-p, --port <number>', 'Port to listen on')
  .option('-t, --target <url>', 'Target base URL to forward to')
  .action(async (opts) => {
    const config = await loadConfig();
    if (opts.port) config.port = parseInt(opts.port, 10);
    if (opts.target) config.targetBaseUrl = opts.target;
    const server = await createServer(config);
    await server.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`promptc proxy listening on http://localhost:${config.port}`);
    console.log(`Forwarding to ${config.targetBaseUrl}`);
    console.log(`Rewriting via Ollama (${config.ollamaModel})`);
    console.log(`Dashboard at http://localhost:${config.port}/dashboard`);
  });

program
  .command('profiles')
  .description('Manage model profiles')
  .argument('<action>', 'list | detect <model-name>')
  .argument('[model]', 'Model name for detect')
  .action(async (action: string, model?: string) => {
    if (action === 'list') {
      const profiles = await listProfiles();
      console.log('Installed profiles:');
      for (const p of profiles) {
        console.log(`  ${p.name} (${p.provider}) - format: ${p.preferredFormat}`);
      }
    } else if (action === 'detect' && model) {
      const profiles = await listProfiles();
      const match = profiles.find(p =>
        model.toLowerCase().includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes(model.toLowerCase())
      );
      if (match) {
        console.log(`Best match: ${match.name} (${match.provider})`);
      } else {
        console.log(`No profile match for "${model}". Use 'promptc profiles list' to see available.`);
      }
    }
  });

program.parse();
