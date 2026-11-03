import { describe, expect, it } from 'vitest';
import { bundledDataset } from '../src/store/dataset';
import { computeLinks, Matcher, docsOf } from '../src/match/link';
import type { Link, Mention } from '../src/types';

const data = bundledDataset();
const links = computeLinks(data);
const MIN = data.scoring.match_min_confidence;

function counted(ls: Link[]) {
  return new Set(ls.filter((l) => l.confidence >= MIN).map((l) => `${l.source}|${l.assetId}`));
}

function truth(kind: Mention['kind']) {
  const out = new Set<string>();
  for (const x of [...data.pages, ...data.issues]) {
    for (const m of x.mentions) if (m.kind === kind) out.add(`${x.id}|${m.assetId}`);
  }
  return out;
}

function recall(kind: Mention['kind']) {
  const got = counted(links);
  const want = truth(kind);
  let hit = 0;
  for (const k of want) if (got.has(k)) hit++;
  return { recall: hit / want.size, n: want.size };
}

describe('matcher recall against generator ground truth (FACTORY_BUILD.md 5.5)', () => {
  it('finds at least 85 percent of exact mentions', () => {
    const r = recall('exact');
    expect(r.n).toBeGreaterThan(200);
    expect(r.recall).toBeGreaterThanOrEqual(0.85);
  });

  it('finds at least half of old-name and old-address mentions', () => {
    const r = recall('old');
    expect(r.n).toBeGreaterThan(50);
    expect(r.recall).toBeGreaterThanOrEqual(0.5);
  });

  it('counted links are mostly right', () => {
    const all = new Set<string>();
    for (const x of [...data.pages, ...data.issues]) for (const m of x.mentions) all.add(`${x.id}|${m.assetId}`);
    const got = [...counted(links)];
    const right = got.filter((k) => all.has(k)).length;
    expect(right / got.length).toBeGreaterThanOrEqual(0.95);
  });
});

describe('matcher rules', () => {
  const byHost = (h: string) => data.assets.find((a) => a.hostname === h)!;

  it('a moved address points at the machine that had it, the current holder is only a maybe', () => {
    const moved = byHost('birch-l2-plc-12');
    const holder = byHost('birch-l2-plc-03');
    const page = links.filter((l) => l.source === 'pg_041');
    const m = page.find((l) => l.assetId === moved.id)!;
    const h = page.find((l) => l.assetId === holder.id)!;
    expect(m.matchType).toBe('ip_history');
    expect(m.confidence).toBeGreaterThanOrEqual(MIN);
    expect(h.matchType).toBe('ip_reused');
    expect(h.confidence).toBeLessThan(MIN);
  });

  it('an address shared by two machines never picks one', () => {
    const page = links.filter((l) => l.source === 'pg_011' && l.matchType === 'ip_shared');
    expect(page.length).toBe(4);
    expect(page.every((l) => l.confidence < MIN)).toBe(true);
  });

  it('a nickname from another plant is only a maybe', () => {
    const m = new Matcher(data.assets);
    const ls = m.match({ id: 'x', kind: 'page', text: 'Rowan line 1. Tested a cold start in the spring.' });
    const cold = ls.find((l) => l.evidence === 'cold start');
    expect(cold?.confidence ?? 0).toBeLessThan(MIN);
  });

  it('a nickname shared across plants resolves by the plant the text is about', () => {
    const m = new Matcher(data.assets);
    const ls = m.match({ id: 'x', kind: 'page', text: 'Spruce. The Oracle froze again.' });
    const counted = ls.filter((l) => l.confidence >= MIN);
    expect(counted).toHaveLength(1);
    expect(data.assets.find((a) => a.id === counted[0].assetId)!.plant).toBe('Spruce');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(computeLinks(data))).toBe(JSON.stringify(links));
    expect(docsOf(data)).toHaveLength(data.pages.length + data.issues.length);
  });
});
