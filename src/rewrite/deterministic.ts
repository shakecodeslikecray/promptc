import type { ModelProfile } from '../profiles/loader.js';

/**
 * Pass 1: Deterministic structural transforms.
 * Converts prompt structure based on target model profile hints.
 */
export function deterministicRewrite(prompt: string, profile: ModelProfile): string {
  let result = prompt;

  const targetFormat = profile.preferredFormat;

  if (targetFormat === 'markdown') {
    result = xmlToMarkdown(result);
  } else if (targetFormat === 'xml') {
    result = markdownToXml(result);
  }

  // Reorder sections if profile specifies order
  const sectionOrder = profile.rewriteHints?.sectionOrder;
  if (sectionOrder) {
    result = reorderSections(result, sectionOrder.split(',').map(s => s.trim()));
  }

  return result;
}

function xmlToMarkdown(text: string): string {
  // Convert XML-style tags to markdown headers
  // <instructions> ... </instructions> -> ## Instructions\n...\n
  let result = text;

  const tagPattern = /<(\w[\w-]*)>([\s\S]*?)<\/\1>/g;
  result = result.replace(tagPattern, (_match, tagName: string, content: string) => {
    const heading = tagName
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    return `## ${heading}\n${content.trim()}\n`;
  });

  return result;
}

function markdownToXml(text: string): string {
  // Convert markdown headers to XML tags
  let result = text;

  // Match ## Header\n content until next ## or end
  const headerPattern = /^##\s+(.+)\n([\s\S]*?)(?=^##\s|\z)/gm;
  result = result.replace(headerPattern, (_match, heading: string, content: string) => {
    const tagName = heading
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_-]/g, '');
    return `<${tagName}>\n${content.trim()}\n</${tagName}>\n`;
  });

  return result;
}

function reorderSections(text: string, order: string[]): string {
  // Extract named sections (either XML or markdown)
  const sections = new Map<string, string>();
  let remaining = text;

  // Try XML sections
  const xmlPattern = /<(\w[\w-]*)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = xmlPattern.exec(text)) !== null) {
    sections.set(match[1].toLowerCase(), match[0]);
    remaining = remaining.replace(match[0], '');
  }

  // Try markdown sections
  const mdPattern = /^(##\s+.+\n[\s\S]*?)(?=^##\s|$(?![\s\S]))/gm;
  while ((match = mdPattern.exec(text)) !== null) {
    const heading = match[1].match(/^##\s+(.+)/)?.[1] ?? '';
    const key = heading.toLowerCase().replace(/\s+/g, '_');
    if (!sections.has(key)) {
      sections.set(key, match[0]);
      remaining = remaining.replace(match[0], '');
    }
  }

  if (sections.size === 0) return text;

  // Rebuild in order
  const ordered: string[] = [];
  for (const key of order) {
    const normalized = key.toLowerCase().replace(/\s+/g, '_');
    const section = sections.get(normalized);
    if (section) {
      ordered.push(section);
      sections.delete(normalized);
    }
  }

  // Append remaining sections not in the order
  for (const section of sections.values()) {
    ordered.push(section);
  }

  const prefix = remaining.trim();
  return (prefix ? prefix + '\n\n' : '') + ordered.join('\n\n');
}
