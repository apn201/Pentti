// Page and ticket formats to plain text, for matching only. Pure. The text is never stored.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Confluence storage format to text. */
export function storageToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') return String.fromCodePoint(Number(e.slice(1)) || 32);
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Atlassian Document Format to text. Unknown nodes give their children, never an error. */
export function adfToText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; attrs?: { text?: string; url?: string }; content?: unknown[] };
  const own = n.text ?? (n.type === 'mention' ? n.attrs?.text : undefined) ?? (n.type === 'inlineCard' ? n.attrs?.url : undefined) ?? '';
  const kids = Array.isArray(n.content) ? n.content.map(adfToText).filter(Boolean).join(' ') : '';
  return [own, kids].filter(Boolean).join(' ');
}
