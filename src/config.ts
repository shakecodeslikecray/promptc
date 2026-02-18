import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';

export interface RouteRule {
  pattern: string;
  target: string;
  fallback?: string;
}

export interface PromptcConfig {
  port: number;
  targetBaseUrl: string;
  ollamaModel: string;
  ollamaUrl: string;
  logLevel: string;
  routes: RouteRule[];
  cacheEnabled: boolean;
  sessionTtlMinutes: number;
}

const CONFIG_DIR = path.join(os.homedir(), '.promptc');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.yaml');
const PROFILES_DIR = path.join(CONFIG_DIR, 'profiles');

const DEFAULT_CONFIG: PromptcConfig = {
  port: 4000,
  targetBaseUrl: 'https://api.z.ai/api/anthropic',
  ollamaModel: 'qwen2.5-coder:14b',
  ollamaUrl: 'http://localhost:11434',
  logLevel: 'info',
  routes: [],
  cacheEnabled: true,
  sessionTtlMinutes: 60,
};

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getProfilesDir(): string {
  return PROFILES_DIR;
}

export async function loadConfig(): Promise<PromptcConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    const parsed = yaml.load(raw) as Partial<PromptcConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function initConfig(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.mkdir(PROFILES_DIR, { recursive: true });

  try {
    await fs.access(CONFIG_PATH);
  } catch {
    const content = yaml.dump(DEFAULT_CONFIG);
    await fs.writeFile(CONFIG_PATH, content, 'utf-8');
  }

  // Write default profiles
  const defaults = getDefaultProfiles();
  for (const [filename, content] of Object.entries(defaults)) {
    const dest = path.join(PROFILES_DIR, filename);
    try {
      await fs.access(dest);
    } catch {
      await fs.writeFile(dest, content, 'utf-8');
    }
  }
}

function getDefaultProfiles(): Record<string, string> {
  return {
    'claude-sonnet.yaml': `name: claude-sonnet
provider: anthropic
preferredFormat: xml
systemPromptStyle: |
  Claude responds best to XML-tagged sections with clear role definitions.
  Place important instructions in <instructions> tags.
  Use numbered lists for multi-step tasks.
strengths:
  - Long context understanding
  - Instruction following
  - Code generation
  - Nuanced reasoning
quirks:
  - Tends to be verbose without explicit brevity instructions
  - Responds well to persona/role assignments
  - XML tags strongly influence output structure
rewriteHints:
  structureTags: xml
  sectionOrder: "role,context,instructions,constraints,output_format"
  emphasisMethod: "xml_tags_and_caps"
`,
    'gpt-4o.yaml': `name: gpt-4o
provider: openai
preferredFormat: markdown
systemPromptStyle: |
  GPT-4o responds well to markdown-formatted prompts.
  Use headers (##) for sections instead of XML tags.
  Be explicit about output format expectations.
strengths:
  - Fast response times
  - Good at structured output (JSON)
  - Strong code generation
  - Follows formatting instructions well
quirks:
  - May ignore XML tags or treat them as literal text
  - System message positioning matters less
  - Prefers explicit examples over abstract rules
rewriteHints:
  structureTags: markdown
  sectionOrder: "context,instructions,constraints,output_format,examples"
  emphasisMethod: "bold_and_headers"
`,
    'glm-5.yaml': `name: glm-5
provider: zhipu
preferredFormat: markdown
systemPromptStyle: |
  GLM models respond best to clear, structured markdown prompts.
  Avoid overly complex nesting. Keep instructions direct.
strengths:
  - Strong multilingual support (especially Chinese)
  - Good at following structured instructions
  - Competitive reasoning ability
quirks:
  - XML tags may not be well understood
  - Benefits from explicit step-by-step instructions
  - May need more explicit output format specification
rewriteHints:
  structureTags: markdown
  sectionOrder: "role,instructions,context,output_format,constraints"
  emphasisMethod: "headers_and_numbered_lists"
`,
    'deepseek-v3.yaml': `name: deepseek-v3
provider: deepseek
preferredFormat: markdown
systemPromptStyle: |
  DeepSeek models work well with markdown-structured prompts.
  Strong at code tasks. Use code blocks and explicit examples.
  Chain-of-thought prompting improves reasoning quality.
strengths:
  - Excellent code generation and understanding
  - Strong reasoning with chain-of-thought
  - Good instruction following
  - Cost effective
quirks:
  - XML tags treated as literal text, not structure
  - Benefits from explicit thinking instructions
  - May need temperature tuning for creative tasks
rewriteHints:
  structureTags: markdown
  sectionOrder: "context,role,instructions,examples,output_format,constraints"
  emphasisMethod: "bold_and_code_blocks"
`,
  };
}
