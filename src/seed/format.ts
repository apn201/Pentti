// Turns generated pages and issues into Confluence storage format and Jira ADF (FACTORY_BUILD.md section 11).
// Pure. The fictional people are not Atlassian users, so authorship and dates go into a header line.
import type { Issue, Page, Person } from '../types';

export const DEMO_LABEL = 'pentti-demo';
export const COMPANY = 'Tervaniemi Works';

/**
 * Label that makes a seeded object findable again: pentti-demo-<id>. Not pentti-demo:<id> as the spec
 * says, because Confluence refuses a colon in labels (limits.md, seeder notes, D26).
 */
export function idLabel(id: string): string {
  return `${DEMO_LABEL}-${id}`;
}

/** Inverse of idLabel. Also reads the colon form that early Jira seeds carry. */
export function idFromLabels(labels: string[]): string | null {
  for (const l of labels) {
    if (l.startsWith(DEMO_LABEL + '-') || l.startsWith(DEMO_LABEL + ':')) return l.slice(DEMO_LABEL.length + 1);
  }
  return null;
}

export const SECTION_TITLES: Record<string, string> = {
  OPS: 'Operations',
  NET: 'Network',
  SAFE: 'Safety',
  PROJ: 'Projects',
};

export function sectionTitle(space: string): string {
  return `${SECTION_TITLES[space] ?? space} (${COMPANY})`;
}

export function rootTitle(): string {
  return `${COMPANY} (fictional)`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s: string): string {
  return esc(s).replace(/https?:\/\/[^\s)]+/g, (u) => `<a href="${u}">${u}</a>`);
}

function tableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/**
 * The markdown subset the narrative uses: ## headings, paragraphs, - lists, 1. lists, pipe tables, bare urls.
 * Anything else is kept as paragraph text.
 */
export function mdToStorage(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = tableRow(lines[i]);
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push('<table><tbody>'
        + '<tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr>'
        + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table>');
      continue;
    }
    const list = /^(\s*)(-|\*|\d+\.)\s+/.exec(line);
    if (list) {
      const ordered = /\d/.test(list[2]);
      const items: string[] = [];
      while (i < lines.length && /^\s*(-|\*|\d+\.)\s+/.test(lines[i]) && /\d/.test(/^\s*(-|\*|\d+\.)/.exec(lines[i])![1]) === ordered) {
        items.push(lines[i].replace(/^\s*(-|\*|\d+\.)\s+/, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>` + items.map((t) => `<li>${inline(t)}</li>`).join('') + `</${tag}>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*\||\s*(-|\*|\d+\.)\s)/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${para.map(inline).join('<br />')}</p>`);
  }
  return out.join('');
}

function personLine(id: string | null, people: Map<string, Person>): string {
  if (!id) return 'not known';
  const p = people.get(id);
  return p ? `${p.name} (fictional)` : 'not known';
}

export function daysAgoText(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

/** Storage body for a generated page. Dates are the app's own (D6), counted from the install date. */
export function pageBody(page: Page, people: Map<string, Person>): string {
  const header = `<p><em>Written by ${esc(personLine(page.authorId, people))}. `
    + `Last edited ${daysAgoText(page.lastEditedDaysAgo)} at install (app date). `
    + `Generated demo content, ${esc(COMPANY)} is a fictional company. Pentti id ${page.id}.</em></p>`;
  return header + mdToStorage(page.bodyMarkdown);
}

export function rootBody(): string {
  return `<p>Demo content for the Pentti app. ${esc(COMPANY)} is a fictional company with six plants. `
    + 'The machines come from a real anonymized OT scan, renamed. The people, pages and tickets are generated.</p>'
    + `<p>Every page carries the label ${DEMO_LABEL}. Reset on the Pentti admin page removes them.</p>`;
}

export function sectionBody(space: string): string {
  return `<p>${esc(SECTION_TITLES[space] ?? space)} pages of ${esc(COMPANY)}. Generated demo content.</p>`;
}

type AdfNode = { type: string; [k: string]: unknown };

function para(text: string, marks?: { type: string }[]): AdfNode {
  return { type: 'paragraph', content: text ? [{ type: 'text', text, ...(marks ? { marks } : {}) }] : [] };
}

/** Jira description in ADF. Reporter, assignee and dates live in the app, the header says so. */
export function issueDescription(issue: Issue, people: Map<string, Person>): AdfNode {
  const header = `Reported by ${personLine(issue.reporterId, people)}. Assigned to ${personLine(issue.assigneeId, people)}. `
    + `Created ${daysAgoText(issue.createdDaysAgo)} at install (app date)`
    + (issue.resolvedDaysAgo !== null ? `, resolved ${daysAgoText(issue.resolvedDaysAgo)}.` : '.')
    + ` Generated demo content. Pentti id ${issue.id}.`;
  const body = issue.description.split(/\n{2,}/).map((t) => para(t.trim())).filter((p) => (p.content as unknown[]).length);
  return { type: 'doc', version: 1, content: [para(header, [{ type: 'em' }]), ...body] };
}

/** Jira labels may not contain spaces. kind:breakdown and friends pass through. */
export function issueLabels(issue: Issue): string[] {
  return [DEMO_LABEL, idLabel(issue.id), ...issue.labels.map((l) => l.replace(/\s+/g, '-'))];
}

/** Map a generated issue type onto what the project offers. Exact name first, then Task, then the first standard type. */
export function pickIssueType(wanted: string, available: { id: string; name: string; subtask?: boolean }[]): string | null {
  const std = available.filter((t) => !t.subtask);
  const byName = (n: string) => std.find((t) => t.name.toLowerCase() === n.toLowerCase());
  const fallbacks: Record<string, string[]> = {
    Incident: ['Incident', 'Bug', 'Problem', 'Task'],
    Change: ['Change', 'Task'],
    Request: ['Service Request', 'Request', 'Task'],
    Task: ['Task'],
  };
  for (const n of fallbacks[wanted] ?? [wanted, 'Task']) {
    const t = byName(n);
    if (t) return t.id;
  }
  return std[0]?.id ?? null;
}
