// Knowledge score, 0 to 100 (FACTORY_BUILD.md section 7). Pure. Weights and windows from scoring.json.
// "Days ago" values in the dataset are relative to the install date. elapsedDays moves them to today.
import type { Asset, Confirmation, Issue, Link, Page, Person, ScoringConfig } from '../types';

export type Dimension = 'name' | 'owner' | 'doc' | 'doc_fresh' | 'history' | 'firmware' | 'confirmed';
export const DIMENSIONS: Dimension[] = ['name', 'owner', 'doc', 'doc_fresh', 'history', 'firmware', 'confirmed'];

export interface Part {
  points: number;
  max: number;
  reason: string;
  sources: string[];   // page or issue ids behind the points
}

export interface Knowledge {
  score: number;
  parts: Record<Dimension, Part>;
  owner: { personId: string; leaving: boolean } | null;
}

export interface KnowledgeContext {
  cfg: ScoringConfig;
  links: Link[];                       // links for this asset
  page: (id: string) => Page | undefined;
  issue: (id: string) => Issue | undefined;
  person: (id: string) => Person | undefined;
  confirmations: Confirmation[];       // for this asset, daysAgo relative to today
  elapsedDays?: number;
  ownData?: boolean;                   // a real asset list: any name counts, people are not imported
}

const HOSTNAME_PATTERN = /^[a-z]+-l\d+-[a-z]+-\d{2}$/;

export function monthsToDays(months: number): number {
  return Math.round((months * 365) / 12);
}

export function knowledge(asset: Asset, ctx: KnowledgeContext): Knowledge {
  const { cfg } = ctx;
  const w = cfg.knowledge;
  const win = cfg.windows_months;
  const elapsed = ctx.elapsedDays ?? 0;
  const counted = ctx.links.filter((l) => l.confidence >= cfg.match_min_confidence);

  const pages = counted
    .filter((l) => l.sourceKind === 'page')
    .map((l) => ctx.page(l.source))
    .filter((p): p is Page => !!p);
  const issues = counted
    .filter((l) => l.sourceKind === 'issue')
    .map((l) => ctx.issue(l.source))
    .filter((i): i is Issue => !!i);

  const parts = {} as Record<Dimension, Part>;
  const part = (d: Dimension, met: boolean, reason: string, sources: string[] = [], points?: number) => {
    parts[d] = { points: points ?? (met ? w[d] : 0), max: w[d], reason, sources };
  };

  // name
  const named = !!(asset.hostname && HOSTNAME_PATTERN.test(asset.hostname)) || !!asset.nickname;
  if (ctx.ownData) part('name', !!(asset.hostname || asset.nickname), asset.hostname ? 'has a hostname' : asset.nickname ? 'has a nickname' : 'no name and no nickname');
  else part('name', named, named ? (asset.hostname ? 'hostname follows the pattern' : 'has a nickname') : 'no name and no nickname');

  // owner: a person who touched it recently and is still here
  const touches: { personId: string; daysAgo: number; source: string }[] = [];
  for (const p of pages) if (p.authorId) touches.push({ personId: p.authorId, daysAgo: p.lastEditedDaysAgo + elapsed, source: p.id });
  for (const i of issues) {
    for (const pid of new Set([i.reporterId, i.assigneeId])) {
      if (pid) touches.push({ personId: pid, daysAgo: i.createdDaysAgo + elapsed, source: i.id });
    }
  }
  const ownerWindow = monthsToDays(win.owner_activity);
  let owner: Knowledge['owner'] = null;
  let ownerSources: string[] = [];
  for (const t of touches.filter((t) => t.daysAgo <= ownerWindow).sort((a, b) => a.daysAgo - b.daysAgo || a.source.localeCompare(b.source))) {
    const person = ctx.person(t.personId);
    if (!person || person.leftDaysAgo !== null) continue;
    const leaving = person.leavingInDays !== null && person.leavingInDays - elapsed <= cfg.leaving_days_threshold;
    if (!owner || (owner.leaving && !leaving)) {
      owner = { personId: person.id, leaving };
      ownerSources = [t.source];
    }
  }
  if (ctx.ownData) part('owner', false, 'people are not imported');
  else if (!owner) part('owner', false, 'nobody touched it in the last ' + win.owner_activity + ' months');
  else if (owner.leaving) part('owner', true, 'last touched by someone who is leaving', ownerSources, w.owner_leaving);
  else part('owner', true, 'touched recently by someone who stays', ownerSources);

  // documentation
  const pageAges = pages.map((p) => ({ id: p.id, days: p.lastEditedDaysAgo + elapsed })).sort((a, b) => a.days - b.days || a.id.localeCompare(b.id));
  part('doc', pageAges.length > 0, pageAges.length ? `${pageAges.length} linked page(s)` : 'no linked page', pageAges.map((p) => p.id));
  const fresh = pageAges.length > 0 && pageAges[0].days <= monthsToDays(win.doc_fresh);
  part('doc_fresh', fresh, pageAges.length ? (fresh ? 'newest page is recent' : 'newest page is older than ' + win.doc_fresh + ' months') : 'no page to be fresh', fresh ? [pageAges[0].id] : []);

  // history
  const recentIssues = issues.filter((i) => i.createdDaysAgo + elapsed <= monthsToDays(win.history)).map((i) => i.id).sort();
  part('history', recentIssues.length > 0, recentIssues.length ? `${recentIssues.length} issue(s) in ${win.history} months` : 'no issue in ' + win.history + ' months', recentIssues);

  // firmware
  part('firmware', !!asset.firmware, asset.firmware ? 'firmware known' : 'firmware not known');

  // confirmed by a human
  const conf = ctx.confirmations.filter((c) => c.daysAgo <= monthsToDays(win.confirmed));
  part('confirmed', conf.length > 0, conf.length ? 'checked by a person recently' : 'nobody has checked it');

  const score = DIMENSIONS.reduce((s, d) => s + parts[d].points, 0);
  return { score, parts, owner };
}
