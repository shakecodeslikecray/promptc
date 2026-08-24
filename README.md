# promptc

Prompt compiler proxy -- preserve developer intent across any LLM.

`promptc` is a transparent HTTP proxy that sits between your LLM client and the API endpoint. It rewrites prompts to match each target model's preferred format and behavioral quirks, so you don't have to.

## The Problem

Every model has a different behavioral grammar. Claude responds best to XML tags. GPT prefers Markdown. GLM-5 likes headers and lists. Research shows format alone causes up to 78.3 percentage points of accuracy variation ([Sclar et al., ICLR 2024](https://arxiv.org/abs/2310.11324)) and optimal format overlap between model families falls below an IoU of 0.2 ([arXiv 2411.10541](https://arxiv.org/abs/2411.10541)).

No existing tool addresses this. DSPy optimizes *what* you say. `promptc` optimizes *how you structurally present it*.

See the paper: [*Prompt Coupling: Formalizing Cross-Model Prompt Dependencies in Large Language Model Systems*](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6262638) (Sharma, 2026), published on SSRN. A copy is included in this repo at [`paper/sharma2026_prompt_coupling.pdf`](paper/sharma2026_prompt_coupling.pdf).

## How It Works

```
Your Tool (Claude Code, Cursor, etc.)
    |
    | HTTP /v1/*
    v
promptc proxy (localhost:4000)
    |-- Detect API format (Anthropic / OpenAI)
    |-- Match target model profile
    |-- Pass 1: Deterministic transform (XML <-> Markdown, section reorder)
    |-- Pass 2: Semantic adaptation via Ollama (optional)
    |-- Cache (SQLite, hash-based)
    |
    v
Target LLM API
```

Two-pass pipeline:

1. **Deterministic**: Structural transforms based on model profile. XML tags to Markdown headers (or vice versa), section reordering, delimiter adaptation. No LLM required.
2. **Semantic** (optional): Local Ollama model rewrites the prompt to match target model's behavioral grammar while preserving all instructions and intent.

## Quick Start

```bash
# Install
npm install -g promptc

# Initialize config and profiles
promptc init

# Start the proxy
promptc start

# Point your tool at the proxy
ANTHROPIC_BASE_URL=http://localhost:4000 claude "your prompt here"
```

## Requirements

- Node.js 22+
- [Ollama](https://ollama.ai) (optional, for Pass 2 semantic adaptation)
  - Default model: `qwen2.5-coder:14b`

## CLI

```bash
promptc init                    # Create config + default profiles
promptc start                   # Start proxy on default port
promptc start -p 5000           # Custom port
promptc start -t https://api.anthropic.com  # Custom target
promptc profiles list           # List installed profiles
promptc profiles detect gpt-4o  # Show which profile matches a model
```

## Configuration

Config lives at `~/.promptc/config.yaml`:

```yaml
port: 4000
targetBaseUrl: https://api.anthropic.com
ollamaModel: qwen2.5-coder:14b
ollamaUrl: http://localhost:11434
logLevel: info
cacheEnabled: true
sessionTtlMinutes: 60
```

## Model Profiles

Profiles encode each model's behavioral grammar as YAML. Located at `~/.promptc/profiles/`.

```yaml
# profiles/claude-sonnet.yaml
model: claude-sonnet-4
format_preferences:
  structure: xml_tags
  emphasis: nested_xml
  persona_placement: system_message
  cot_style: "think step by step inside <thinking> tags"
  example_format: xml_wrapped
known_strengths: [long_context, instruction_following, xml_parsing]
known_weaknesses: [refusal_sensitivity]
```

```yaml
# profiles/gpt-4o.yaml
model: gpt-4o
format_preferences:
  structure: markdown
  emphasis: bold_and_caps
  persona_placement: system_message
  cot_style: "Let's think step by step"
  example_format: markdown_codeblocks
known_strengths: [tool_use, creative_tasks, markdown_parsing]
```

**Contributing profiles**: Add a YAML file following the schema above and submit a PR. Profiles are the community-maintainable part of the system -- like browser compatibility tables.

## Dashboard

Web UI at `http://localhost:4000/dashboard` for monitoring rewrite activity, cache hit rates, and request history.

## How It Compares

| Approach | What It Adapts | How |
|----------|---------------|-----|
| **DSPy** | Prompt content (instructions, examples) | Optimization with training data |
| **PromptBridge** | Learned cross-model mappings | Calibration + evolution |
| **LiteLLM** | API schema (OpenAI <-> Anthropic format) | Configuration |
| **promptc** | Structural format per target model | Profile-based transforms + optional Ollama |

DSPy is an algorithm optimizer. `promptc` is a cross-compilation backend.

## Architecture

```
src/
  bin/promptc.ts          # CLI entry point
  server.ts               # Fastify proxy server
  config.ts               # Config management + default profiles
  detect-format.ts        # API format detection (Anthropic vs OpenAI)
  rewrite/
    pipeline.ts           # Two-pass rewrite orchestration
    deterministic.ts      # XML<->Markdown, section reordering
    ollama.ts             # LLM-powered semantic adaptation
  cache/
    store.ts              # SQLite storage for cache/logs/sessions
    hash.ts               # Prompt hashing for cache keys
  session/
    tracker.ts            # Multi-turn conversation tracking
    context.ts            # Session enrichment (context gaps)
  profiles/
    loader.ts             # Profile matching logic
    defaults/             # Built-in model profiles
  api/
    dashboard-routes.ts   # Stats/history API
    history-routes.ts     # Request history API
  dashboard/
    app.tsx               # React dashboard UI
    index.html            # Dashboard HTML
```

## Status

This is a proof-of-concept accompanying the "Prompt Coupling" paper. It demonstrates feasibility, not production readiness. In particular, the structural transforms are **not benchmarked** for downstream task performance — whether they preserve or improve results is an open empirical question, and the paper says so explicitly.

The most useful contribution right now is evidence: run promptc against a real task suite and report what happens to accuracy and latency. Model profiles for new families are equally welcome.

## Citing

```bibtex
@misc{sharma2026promptcoupling,
  title        = {Prompt Coupling: Formalizing Cross-Model Prompt Dependencies in Large Language Model Systems},
  author       = {Sharma, Abhishek},
  year         = {2026},
  howpublished = {SSRN},
  url          = {https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6262638}
}
```

## License

MIT
