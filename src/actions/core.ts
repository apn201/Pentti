// What the agent actions return (FACTORY_BUILD.md section 9). Pure: an index, the scores and a few
// facts about the site go in, plain JSON comes out. The handlers add storage and REST around it.
// Every number carries where it comes from: SCAN (the OT scan), GEN (generated pages, issues, people)
// or SCORE (computed by src/score). The agent repeats numbers, it never makes them.
import type { Asset, Finding, Link, Person, ScoringConfig } from '../types';
import type { Index } from '../store/index';
import type { AssetScore } from '../score';
import { closingList, steps, type Step } from '../score/closing';
import type { Dimension } from '../score/knowledge';
import type { SeededMap } from '../seed/plan';

export type Chip = 'SCAN' | 'GEN' | 'SCORE' | 'CSV' | 'SITE';

/** What an admin imported. Only set when the site runs on own data, so bundled answers never carry it. */
export interface OwnInfo {
  importedOn: string;
  spaceKey: string | null;
  projectKey: string | null;
  pagesCapped: boolean;
  issuesCapped: boolean;
}

export interface Site {
  baseUrl: string | null;    // https://<site>.atlassian.net, null when not known
  appUrl?: string | null;    // the Pentti page, <baseUrl>/jira/apps/<app>/<env>, null when not known
  seeded: SeededMap;         // dataset id -> Jira key or Confluence page id
  elapsedDays: number;       // days since "Load the factory"
  own?: OwnInfo;
}

export const NOT_KNOWN = 'not known';
export const BLAST_SENTENCE = 'Same subnet. Reachability not verified. No routing data.';
export const NOT_SEARCHED = 'Your own Jira and Confluence were not searched. This demo reads only the bundled data.';
export const MAX_TASKS = 10;
export const MAX_GAP_N = 25;
export const MAX_OWN_MAYBE = 10;

const OPEN = new Set(['open', 'reopen']);

// ---------- small shapes ----------

export function label(a: Asset): string {
  if (a.hostname && a.nickname) return `${a.hostname} (${a.nickname})`;
  return a.hostname ?? (a.nickname ? `${a.nickname} (no hostname)` : `nameless ${a.role} at ${a.ip}`);
}

/** Deep link to the asset card on the Pentti page. Agent answers and graph cards use it. */
export function assetUrl(site: Pick<Site, 'appUrl'> | undefined, assetId: string): string | null {
  return site?.appUrl ? `${site.appUrl}/asset/${assetId}` : null;
}

function brief(a: Asset, site?: Site) {
  return {
    assetId: a.id,
    name: label(a),
    url: assetUrl(site, a.id),
    hostname: a.hostname,
    nickname: a.nickname,
    plant: a.plant,
    line: a.line,
    role: a.role,
    model: a.model,
    criticality: a.criticality,
    ip: a.ip,
  };
}

export function sourceRef(kind: 'page' | 'issue', id: string, index: Index, site: Site) {
  const s = site.seeded[id];
  if (kind === 'issue') {
    const i = index.issue(id);
    return {
      id,
      kind,
      title: i?.summary ?? id,
      jiraKey: s?.key ?? null,
      url: s?.key && site.baseUrl ? `${site.baseUrl}/browse/${s.key}` : null,
    };
  }
  const p = index.page(id);
  return {
    id,
    kind,
    title: p?.title ?? id,
    url: s && site.baseUrl ? `${site.baseUrl}/wiki/pages/viewpage.action?pageId=${s.remoteId}` : null,
  };
}

function personRef(p: Person | undefined, elapsed: number) {
  if (!p) return null;
  return {
    personId: p.id,
    name: `${p.name} (fictional)`,
    role: p.role,
    left: p.leftDaysAgo !== null,
    leavingInDays: p.leavingInDays === null ? null : p.leavingInDays - elapsed,
  };
}

// ---------- find-asset ----------

export function findAsset(index: Index, text: string, site?: Site) {
  const q = String(text ?? '').trim();
  if (!q) return { error: 'Give a hostname, nickname, IP address or model.' };
  const hits = index.search(q);
  if (!hits.length) {
    return {
      query: q,
      candidates: [],
      not_known: [`No machine matches "${q}". Searched hostname, nickname, IP, old IP, former name and model of ${index.assets.length} assets.`],
    };
  }
  return {
    query: q,
    candidates: hits.map((h) => ({ ...brief(h.asset, site), matchedOn: h.why })),
    note: hits.length > 1 ? 'Several machines match. Ask which one. Never pick.' : 'One match.',
  };
}

// ---------- explain-asset ----------

function notKnownText(d: Dimension, w: ScoringConfig['windows_months'], own?: OwnInfo): string {
  if (own && d === 'owner') return 'Owner: people are not imported in this proof of concept.';
  if (own && d === 'firmware') return 'Firmware: the asset list does not say.';
  return {
    name: 'Name: no hostname and no nickname.',
    owner: `Owner: nobody who stays touched it in the last ${w.owner_activity} months.`,
    doc: 'Documentation: no page describes it.',
    doc_fresh: `Fresh documentation: no page edited in the last ${w.doc_fresh} months.`,
    history: `History: no ticket in the last ${w.history} months.`,
    firmware: 'Firmware: the scan does not report it.',
    confirmed: `Confirmed: nobody has checked it in person in the last ${w.confirmed} months.`,
  }[d];
}

function findingsSummary(findings: Finding[], chip: Chip = 'SCAN') {
  const open = findings.filter((f) => OPEN.has(f.status));
  const by = (s: Finding['severity']) => open.filter((f) => f.severity === s).length;
  const top = [...open]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.cve.localeCompare(b.cve))
    .slice(0, 3)
    .map((f) => ({ cve: f.cve, severity: f.severity, score: f.score, exploit: f.exploitLabel, summary: f.summary }));
  const scores = open.map((f) => f.score ?? 0);
  return {
    chip,
    total: findings.length,
    open: open.length,
    openCritical: by('Critical'),
    openHigh: by('High'),
    openMedium: by('Medium'),
    openLow: by('Low'),
    // Counts from an asset list have no scores. Zero would be a made up number.
    maxScore: !scores.length || (chip === 'CSV' && open.every((f) => f.score === null)) ? null : Math.max(...scores),
    top,
  };
}

/** People who touched the asset through counted pages and issues, most recent first. */
export function touches(index: Index, links: Link[], minConfidence: number, elapsed: number) {
  const t = new Map<string, { personId: string; lastDaysAgo: number; count: number; sources: Set<string> }>();
  const add = (pid: string | null, days: number, source: string) => {
    if (!pid) return;
    const e = t.get(pid) ?? { personId: pid, lastDaysAgo: Infinity, count: 0, sources: new Set<string>() };
    if (!e.sources.has(source)) {
      e.sources.add(source);
      e.count++;
    }
    e.lastDaysAgo = Math.min(e.lastDaysAgo, days);
    t.set(pid, e);
  };
  for (const l of links) {
    if (l.confidence < minConfidence) continue;
    if (l.sourceKind === 'page') {
      const p = index.page(l.source);
      if (p) add(p.authorId, p.lastEditedDaysAgo + elapsed, p.id);
    } else {
      const i = index.issue(l.source);
      if (i) {
        add(i.reporterId, i.createdDaysAgo + elapsed, i.id);
        add(i.assigneeId, i.createdDaysAgo + elapsed, i.id);
      }
    }
  }
  return [...t.values()].sort((a, b) => a.lastDaysAgo - b.lastDaysAgo || b.count - a.count || a.personId.localeCompare(b.personId));
}

export function explainAsset(index: Index, score: AssetScore, site: Site) {
  const a = index.asset(score.assetId)!;
  const cfg = index.data.scoring;
  const links = index.linksFor(a.id);
  const counted = links.filter((l) => l.confidence >= cfg.match_min_confidence);
  const maybe = links.filter((l) => l.confidence < cfg.match_min_confidence);
  const k = score.knowledge;
  const elapsed = site.elapsedDays;
  const own = site.own;
  const listChip: Chip = own ? 'CSV' : 'SCAN';
  const docChip: Chip = own ? 'SITE' : 'GEN';

  const pages = counted.filter((l) => l.sourceKind === 'page').map((l) => {
    const p = index.page(l.source)!;
    return {
      ...sourceRef('page', l.source, index, site),
      lastEditedDaysAgo: p.lastEditedDaysAgo + elapsed,
      author: personRef(index.person(p.authorId ?? ''), elapsed)?.name ?? NOT_KNOWN,
      matchedOn: l.matchType,
      confidence: l.confidence,
      evidence: l.evidence,
      chip: docChip,
    };
  }).sort((x, y) => x.lastEditedDaysAgo - y.lastEditedDaysAgo);

  const issues = counted.filter((l) => l.sourceKind === 'issue').map((l) => {
    const i = index.issue(l.source)!;
    return {
      ...sourceRef('issue', l.source, index, site),
      status: i.status,
      createdDaysAgo: i.createdDaysAgo + elapsed,
      matchedOn: l.matchType,
      confidence: l.confidence,
      evidence: l.evidence,
      chip: docChip,
    };
  }).sort((x, y) => x.createdDaysAgo - y.createdDaysAgo);

  const owner = k.owner ? { ...personRef(index.person(k.owner.personId), elapsed)!, leavingSoon: k.owner.leaving, chip: 'GEN' as Chip } : null;

  const known: Record<string, unknown> = {
    identity: {
      chip: listChip,
      hostname: a.hostname ?? NOT_KNOWN,
      nickname: a.nickname ?? NOT_KNOWN,
      plant: a.plant,
      line: a.line,
      role: a.role,
      ip: a.ip || NOT_KNOWN,
      ipHistory: a.ipHistory,
      formerNames: a.formerNames,
      criticality: a.criticality,
      purdueLevel: a.purdue,
      flags: a.flags,
    },
    hardware: {
      chip: listChip,
      model: a.model ?? NOT_KNOWN,
      manufacturer: a.manufacturer ?? NOT_KNOWN,
      firmware: a.firmware ?? NOT_KNOWN,
      modules: a.modules,
      lastSeenDaysAgo: own ? NOT_KNOWN : a.lastSeenDaysAgo,
    },
    findings: findingsSummary(index.findingsFor(a.id), listChip),
  };
  if (owner) known.owner = owner;
  if (pages.length) known.pages = pages;
  if (issues.length) known.issues = issues;

  const notKnown = (Object.keys(k.parts) as Dimension[])
    .filter((d) => k.parts[d].points === 0)
    .map((d) => notKnownText(d, cfg.windows_months, own));
  if (own && !index.findingsFor(a.id).length) notKnown.push('Findings: the asset list gives none. That does not mean there are none.');
  if (k.owner?.leaving) notKnown.push(`Owner after ${owner?.name ?? 'the owner'} leaves: nobody else touched it recently.`);
  notKnown.push(
    pages.length ? 'Spare parts: not in any structured source. Check the linked pages.' : 'Spare parts: not known.',
    'Upstream and downstream machines: not known. No process or routing data.',
  );

  const pagesMaybe = maybe.filter((l) => l.sourceKind === 'page').length;
  const issuesMaybe = maybe.filter((l) => l.sourceKind === 'issue').length;
  const searched = own ? [
    `Your asset list, imported ${own.importedOn}: ${index.assets.length} assets. ${index.findingsFor(a.id).length} findings counted on this machine.`,
    own.spaceKey
      ? `Confluence space ${own.spaceKey}: ${index.data.pages.length} pages read${own.pagesCapped ? ', more exist and were not read' : ''}. ${pages.length} counted for this machine, ${pagesMaybe} maybe.`
      : 'Confluence: no space was picked.',
    own.projectKey
      ? `Jira project ${own.projectKey}: ${index.data.issues.length} issues read${own.issuesCapped ? ', more exist and were not read' : ''}. ${issues.length} counted for this machine, ${issuesMaybe} maybe.`
      : 'Jira: no project was picked.',
    'People: not imported.',
    'Matched on hostname, IP, old IP, former name, nickname and model with line.',
    `Nothing else on this site was searched. Pages and tickets are as they were on ${own.importedOn}.`,
  ] : [
    `Scan: ${index.assets.length} assets and ${index.data.findings.length} findings. ${index.findingsFor(a.id).length} findings on this machine.`,
    `Demo pages bundled with the app: ${index.data.pages.length}. ${pages.length} counted for this machine, ${maybe.filter((l) => l.sourceKind === 'page').length} maybe.`,
    `Demo issues bundled with the app: ${index.data.issues.length}. ${issues.length} counted for this machine, ${maybe.filter((l) => l.sourceKind === 'issue').length} maybe.`,
    `People: ${index.data.people.length} on file.`,
    'Matched on hostname, IP, old IP, former name, nickname and model with line.',
    NOT_SEARCHED,
  ];

  return {
    ...(own ? { dataset: 'own' as const } : {}),
    asset: brief(a, site),
    known,
    not_known: notKnown,
    searched,
    // A common word in a real project can be a maybe in hundreds of tickets. The counts are in searched.
    maybe: (own ? maybe.slice(0, MAX_OWN_MAYBE) : maybe).map((l) => ({ ...sourceRef(l.sourceKind, l.source, index, site), matchedOn: l.matchType, confidence: l.confidence, evidence: l.evidence })),
    ...(own && maybe.length > MAX_OWN_MAYBE ? { maybeNotShown: maybe.length - MAX_OWN_MAYBE } : {}),
    sources: [...pages.map((p) => p.id), ...issues.map((i) => i.id)],
    knowledge: {
      chip: 'SCORE',
      score: k.score,
      max: 100,
      parts: Object.fromEntries((Object.keys(k.parts) as Dimension[]).map((d) => [d, { points: k.parts[d].points, max: k.parts[d].max, reason: k.parts[d].reason }])),
    },
    risk: { chip: 'SCORE', score: score.risk, openCriticalOrHigh: score.riskDetail.openCriticalOrHigh, exploitBonus: score.riskDetail.exploitBonus },
    danger: { chip: 'SCORE', score: round1(score.danger), formula: 'risk * (100 - knowledge) / 100' },
    people: touches(index, links, cfg.match_min_confidence, elapsed).map((t) => ({
      ...personRef(index.person(t.personId), elapsed),
      touches: t.count,
      lastTouchDaysAgo: t.lastDaysAgo,
      chip: 'GEN',
    })),
    findingsSummary: known.findings,
  };
}

// ---------- blast-radius ----------

function subnet(ip: string): string {
  return ip.split('.').slice(0, 3).join('.');
}

export function blastRadius(index: Index, scores: Map<string, AssetScore>, assetId: string, site?: Site) {
  const a = index.asset(assetId)!;
  const row = (b: Asset) => ({
    ...brief(b, site),
    openCriticalOrHigh: scores.get(b.id)?.riskDetail.openCriticalOrHigh ?? 0,
    danger: round1(scores.get(b.id)?.danger ?? 0),
  });
  const byDanger = (x: { danger: number; assetId: string }, y: { danger: number; assetId: string }) => y.danger - x.danger || x.assetId.localeCompare(y.assetId);
  // A blank line or address in an asset list says nothing about neighbours.
  const sameLine = (a.line ? index.byLine(a.plant, a.line) : []).filter((b) => b.id !== a.id).map(row).sort(byDanger);
  const net = subnet(a.ip);
  const sameSubnet = (a.ip ? index.assets : []).filter((b) => b.id !== a.id && subnet(b.ip) === net).map(row).sort(byDanger);
  const cap = 25;
  const chip: Chip = site?.own ? 'CSV' : 'SCAN';
  return {
    asset: brief(a, site),
    sentence: BLAST_SENTENCE,
    sameLine: { chip, count: sameLine.length, critical: sameLine.filter((b) => b.criticality === 'Critical').length, assets: sameLine.slice(0, cap) },
    sameSubnet: { chip, subnet: a.ip ? `${net}.0/24` : NOT_KNOWN, count: sameSubnet.length, critical: sameSubnet.filter((b) => b.criticality === 'Critical').length, assets: sameSubnet.slice(0, cap) },
    note: sameLine.length > cap || sameSubnet.length > cap ? `Lists show the ${cap} with the most danger.` : undefined,
  };
}

// ---------- who-knows ----------

export function whoKnows(index: Index, assetId: string, site: Site) {
  const a = index.asset(assetId)!;
  const cfg = index.data.scoring;
  const t = touches(index, index.linksFor(a.id), cfg.match_min_confidence, site.elapsedDays);
  const people = t.map((x) => {
    const p = personRef(index.person(x.personId), site.elapsedDays)!;
    return {
      ...p,
      touches: x.count,
      lastTouchDaysAgo: x.lastDaysAgo,
      leavingSoon: p.leavingInDays !== null && p.leavingInDays <= cfg.leaving_days_threshold,
      sources: [...x.sources].sort(),
      chip: 'GEN',
    };
  });
  const active = people.filter((p) => !p.left);
  return {
    asset: brief(a, site),
    people,
    not_known: site.own
      ? ['Who knows it: not known. People are not imported in this proof of concept.']
      : active.length ? [] : ['Nobody who is still here has touched this machine in any page or ticket.'],
    note: active.length === 1 ? 'One person still here knows it.' : undefined,
  };
}

// ---------- gap-report ----------

export function gapReport(index: Index, scores: AssetScore[], plant: string, n: number, site?: Site) {
  const plants = [...new Set(index.assets.map((a) => a.plant))].sort();
  const p = String(plant ?? '').trim();
  const all = !p || p.toLowerCase() === 'all';
  const match = plants.find((x) => x.toLowerCase() === p.toLowerCase());
  if (!all && !match) return { error: `Unknown plant "${p}". Plants: ${plants.join(', ')}, or all.` };
  const count = Math.min(MAX_GAP_N, Math.max(1, Math.round(Number(n) || 10)));
  const ids = new Set(all ? index.assets.map((a) => a.id) : index.byPlant(match!).map((a) => a.id));
  const cl = closingList(scores.filter((s) => ids.has(s.assetId)), index.data.scoring, count);
  return {
    scope: all ? 'all plants' : match,
    assetsInScope: ids.size,
    chip: 'SCORE',
    items: cl.items.map((it, i) => {
      const a = index.asset(it.assetId)!;
      return {
        rank: i + 1,
        ...brief(a, site),
        knowledge: it.knowledge,
        risk: it.risk,
        danger: round1(it.danger),
        steps: it.steps.map((s) => ({ action: s.action, hours: s.hours })),
        hours: it.hours,
        dangerRemoved: round1(it.dangerRemoved),
      };
    }),
    totalHours: cl.totalHours,
    dangerRemoved: round1(cl.dangerRemoved),
    totalDanger: round1(cl.totalDanger),
    percentRemoved: cl.percentRemoved,
    sentence: `${cl.items.length} assets, ${cl.totalHours} hours, removes ${cl.percentRemoved} percent of the danger in ${all ? 'all plants' : match}.`,
  };
}

// ---------- create-gap-tasks (pure part) ----------

export function parseAssetIds(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.map(String) : String(input ?? '').split(/[\s,;]+/);
  return [...new Set(raw.map((s) => s.trim()).filter(Boolean))];
}

/** Validates ids against the dataset. Never trusts the input: unknown ids fail the whole call. */
export function validateTaskIds(index: Index, input: unknown): { ids: string[] } | { error: string } {
  const ids = parseAssetIds(input);
  if (!ids.length) return { error: 'Give between 1 and 10 asset ids, for example a_d4mjq.' };
  if (ids.length > MAX_TASKS) return { error: `At most ${MAX_TASKS} assets per call, got ${ids.length}.` };
  const unknown = ids.filter((id) => !index.asset(id));
  if (unknown.length) return { error: `Unknown asset ids: ${unknown.join(', ')}. Use find-asset or gap-report to get ids.` };
  return { ids };
}

export const gapLabel = (assetId: string) => `pentti-gap-${assetId}`;

const ACTION_TEXT: Record<Step['action'], string> = {
  name: 'Give it a hostname that follows the pattern, or record the name the floor uses.',
  owner: 'Name an owner who stays, and have them touch it: a page or a ticket.',
  doc: 'Write a page: what it runs, restart order, spare parts, vendor contact.',
  doc_refresh: 'Refresh the newest page, it is no longer fresh.',
  confirm: 'Walk to it and press "I checked this" in Pentti.',
};

export function gapTask(index: Index, score: AssetScore) {
  const a = index.asset(score.assetId)!;
  const st = steps(score, index.data.scoring);
  const hours = st.reduce((x, y) => x + y.hours, 0);
  const removed = st.reduce((x, y) => x + y.dangerRemoved, 0);
  const lines = [
    `Close the knowledge gap on ${label(a)}, ${a.plant} ${a.line}, ${a.role}, criticality ${a.criticality}.`,
    `Knowledge ${score.knowledge.score} of 100, risk ${score.risk}, danger ${round1(score.danger)} (SCORE).`,
    ...st.map((s) => `- ${ACTION_TEXT[s.action]} ${s.hours} h.`),
    `Total ${hours} h. Removes ${round1(removed)} danger points (SCORE).`,
    `Created by Pentti from the closing list. Pentti asset id ${a.id}.`,
  ];
  return {
    assetId: a.id,
    summary: `Close knowledge gap: ${label(a)}`.slice(0, 250),
    lines,
    hours,
    dangerRemoved: round1(removed),
    labels: ['pentti-demo', gapLabel(a.id)],
    nothingToClose: st.length === 0,
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
