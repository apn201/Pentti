// Stored own data to the same Dataset the scores and actions already work on. Pure.
// No people: an empty list, so nobody is ever invented. Page and ticket text is not kept, only what the
// matcher found in it, so bodies are empty here. Links are worked out at import and stored.
import type { Dataset, Finding, Issue, Link, Page, ScoringConfig } from '../types';
import type { SeededMap } from '../seed/plan';
import type { OwnAsset } from './csv';

export interface OwnPage {
  id: string;
  remoteId: string;
  title: string;
  lastEditedDaysAgo: number;
}

export interface OwnIssue {
  id: string;
  remoteId: string;
  key: string;
  summary: string;
  status: string;
  createdDaysAgo: number;
  resolvedDaysAgo: number | null;
}

export interface OwnDocs {
  pages: OwnPage[];
  issues: OwnIssue[];
  links: Link[];
}

export const pageId = (remoteId: string) => `op_${remoteId}`;
export const issueId = (remoteId: string) => `oi_${remoteId}`;

const COUNTED = 'Count from your asset list. No details.';

function findingsOf(a: OwnAsset): Finding[] {
  const make = (severity: 'Critical' | 'High', n: number) => Array.from({ length: n }, (_, i): Finding => ({
    id: `${a.id}_${severity[0]}${i}`,
    assetId: a.id,
    cve: 'not known',
    severity,
    score: null,
    exploitLabel: null,
    exploitValue: null,
    status: 'open',
    publishedDaysAgo: 0,
    openedDaysAgo: 0,
    summary: COUNTED,
    advisoryUrl: null,
  }));
  return [...make('Critical', a.openCritical), ...make('High', a.openHigh)];
}

export function buildOwn(assetChunks: OwnAsset[][], docChunks: OwnDocs[], scoring: ScoringConfig): { data: Dataset; links: Link[]; seeded: SeededMap } {
  const seen = new Set<string>();
  const assets = assetChunks.flat().filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  const pages: Page[] = docChunks.flatMap((d) => d.pages).map((p) => ({
    id: p.id, title: p.title, space: '', authorId: null, class: 'own', lastEditedDaysAgo: p.lastEditedDaysAgo, bodyMarkdown: '', mentions: [],
  }));
  const issues: Issue[] = docChunks.flatMap((d) => d.issues).map((i) => ({
    id: i.id, summary: i.summary, type: 'own', status: i.status, reporterId: '', assigneeId: null,
    createdDaysAgo: i.createdDaysAgo, resolvedDaysAgo: i.resolvedDaysAgo, description: '', labels: [], mentions: [],
  }));
  const seeded: SeededMap = {};
  for (const d of docChunks) {
    for (const p of d.pages) seeded[p.id] = { kind: 'page', remoteId: p.remoteId, title: p.title };
    for (const i of d.issues) seeded[i.id] = { kind: 'issue', remoteId: i.remoteId, key: i.key };
  }
  return {
    data: { assets, findings: assets.flatMap(findingsOf), people: [], pages, issues, scoring },
    links: docChunks.flatMap((d) => d.links).filter((l) => seen.has(l.assetId)),
    seeded,
  };
}

/** Storage takes 240 KiB per value. One page can match hundreds of machines, so links split over chunks. */
export function splitDocs(docs: OwnDocs, maxChars = 200_000): OwnDocs[] {
  const size = (x: unknown) => JSON.stringify(x).length;
  const out: OwnDocs[] = [{ pages: docs.pages, issues: docs.issues, links: [] }];
  let used = size(out[0]);
  for (const link of docs.links) {
    const n = size(link) + 1;
    if (used + n > maxChars) {
      out.push({ pages: [], issues: [], links: [] });
      used = size(out[out.length - 1]);
    }
    out[out.length - 1].links.push(link);
    used += n;
  }
  return out;
}

export function daysAgo(iso: string | null | undefined, now: number, unknown: number): number {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return unknown;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}
