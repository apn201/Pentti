import { describe, expect, it } from 'vitest';
import { bundledDataset } from '../src/store/dataset';
import { computeLinks } from '../src/match/link';
import { Index } from '../src/store/index';
import { scoreAll } from '../src/score';
import {
  BLAST_SENTENCE, blastRadius, explainAsset, findAsset, gapReport, gapTask, label, parseAssetIds, sourceRef,
  validateTaskIds, whoKnows, type Site,
} from '../src/actions/core';

const data = bundledDataset();
const index = new Index(data, computeLinks(data));
const scores = scoreAll(index);
const byId = new Map(scores.map((s) => [s.assetId, s]));
const site: Site = { baseUrl: 'https://example.test', seeded: {}, elapsedDays: 0 };
const OLD_FAITHFUL = 'a_d4mjq';
const NOTHING = 'a_8bjia';   // Critical, no name, no page, no ticket

describe('find-asset', () => {
  it('finds Old Faithful and only it', () => {
    const r = findAsset(index, 'Old Faithful');
    expect((r as { candidates: { assetId: string }[] }).candidates.map((c) => c.assetId)).toEqual([OLD_FAITHFUL]);
  });

  it('lists every Oracle and tells the agent to ask', () => {
    const r = findAsset(index, 'The Oracle') as { candidates: { plant: string }[]; note: string };
    expect(r.candidates).toHaveLength(3);
    expect(new Set(r.candidates.map((c) => c.plant)).size).toBe(3);
    expect(r.note).toContain('Never pick');
  });

  it('says not known for a name nobody uses', () => {
    const r = findAsset(index, 'The Kraken') as { candidates: unknown[]; not_known: string[] };
    expect(r.candidates).toEqual([]);
    expect(r.not_known[0]).toContain('No machine matches');
  });

  it('never returns more than five', () => {
    const r = findAsset(index, 'plc') as { candidates: unknown[] };
    expect(r.candidates.length).toBeLessThanOrEqual(5);
  });

  it('refuses an empty query', () => {
    expect(findAsset(index, '  ')).toHaveProperty('error');
  });
});

describe('explain-asset', () => {
  it('Old Faithful: three parts, frozen scores, the model from the scan', () => {
    const r = explainAsset(index, byId.get(OLD_FAITHFUL)!, site);
    expect(r.knowledge.score).toBe(40);
    expect(r.risk.score).toBe(95);
    expect(r.danger.score).toBe(57);
    expect((r.known.hardware as { model: string }).model).toBe('CP 343-1');
    expect(r.known.findings).toMatchObject({ chip: 'SCAN' });
    expect(r.not_known.length).toBeGreaterThan(0);
    expect(r.searched.length).toBeGreaterThan(3);
    expect(r.searched.join(' ')).toContain('bundled with the app');
    expect(r.searched.at(-1)).toBe('Your own Jira and Confluence were not searched. This demo reads only the bundled data.');
    expect(r.not_known.join(' ')).toContain('Spare parts');
  });

  it('a machine with nothing: honest not known, no invented pages or owner', () => {
    const r = explainAsset(index, byId.get(NOTHING)!, site);
    expect(r.known.pages).toBeUndefined();
    expect(r.known.issues).toBeUndefined();
    expect(r.known.owner).toBeUndefined();
    expect(r.people).toEqual([]);
    expect(r.knowledge.score).toBe(5);
    const nk = r.not_known.join('\n');
    for (const t of ['Name:', 'Owner:', 'Documentation:', 'History:', 'Spare parts: not known.', 'Upstream']) expect(nk).toContain(t);
    expect((r.known.identity as { hostname: string }).hostname).toBe('not known');
    expect(label(index.asset(NOTHING)!)).toContain('nameless');
  });

  it('every number in the answer sits under a chip', () => {
    const r = explainAsset(index, byId.get(OLD_FAITHFUL)!, site);
    for (const part of [r.knowledge, r.risk, r.danger, r.known.identity, r.known.hardware, r.known.findings]) {
      expect(['SCAN', 'GEN', 'SCORE']).toContain((part as { chip: string }).chip);
    }
  });

  it('links seeded sources to Jira and Confluence', () => {
    const s: Site = { ...site, seeded: { is_001: { kind: 'issue', remoteId: '1', key: 'TVW-3' }, pg_001: { kind: 'page', remoteId: '99' } } };
    expect(sourceRef('issue', 'is_001', index, s).url).toBe('https://example.test/browse/TVW-3');
    expect(sourceRef('page', 'pg_001', index, s).url).toBe('https://example.test/wiki/pages/viewpage.action?pageId=99');
    expect(sourceRef('issue', 'is_002', index, s).url).toBeNull();
  });

  it('dates move with the days since install', () => {
    const a = explainAsset(index, byId.get(OLD_FAITHFUL)!, site);
    const b = explainAsset(index, byId.get(OLD_FAITHFUL)!, { ...site, elapsedDays: 10 });
    const pa = a.known.issues as { createdDaysAgo: number }[] | undefined;
    const pb = b.known.issues as { createdDaysAgo: number }[] | undefined;
    if (pa && pb) expect(pb[0].createdDaysAgo).toBe(pa[0].createdDaysAgo + 10);
  });
});

describe('blast-radius', () => {
  it('always carries the sentence and never lists the asset itself', () => {
    const r = blastRadius(index, byId, OLD_FAITHFUL);
    expect(r.sentence).toBe(BLAST_SENTENCE);
    expect(r.sameLine.assets.some((a) => a.assetId === OLD_FAITHFUL)).toBe(false);
    expect(r.sameSubnet.subnet).toMatch(/\.0\/24$/);
    expect(r.sameLine.assets.length).toBeLessThanOrEqual(25);
  });
});

describe('who-knows', () => {
  it('Old Faithful: Pentti is there and flagged as leaving', () => {
    const r = whoKnows(index, OLD_FAITHFUL, site);
    const p = r.people.find((x) => x.personId === 'p_pentti');
    expect(p).toBeDefined();
    expect(p!.leavingSoon).toBe(true);
  });

  it('nobody knows the machine with nothing', () => {
    const r = whoKnows(index, NOTHING, site);
    expect(r.people).toEqual([]);
    expect(r.not_known[0]).toContain('Nobody');
  });
});

describe('gap-report', () => {
  it('whole factory, top 10: the frozen numbers', () => {
    const r = gapReport(index, scores, 'all', 10) as { items: { assetId: string }[]; totalHours: number; percentRemoved: number; sentence: string };
    expect(r.items).toHaveLength(10);
    expect(r.items[0].assetId).toBe(NOTHING);
    expect(r.totalHours).toBe(18.5);
    expect(r.percentRemoved).toBe(2.3);
    expect(r.sentence).toBe('10 assets, 18.5 hours, removes 2.3 percent of the danger in all plants.');
  });

  it('per plant, case insensitive, and refuses an unknown plant', () => {
    const r = gapReport(index, scores, 'birch', 5) as { scope: string; items: { plant: string }[] };
    expect(r.scope).toBe('Birch');
    expect(r.items.every((i) => i.plant === 'Birch')).toBe(true);
    expect(gapReport(index, scores, 'Oak', 5)).toHaveProperty('error');
  });

  it('clamps n to 1..25', () => {
    expect((gapReport(index, scores, 'all', 500) as { items: unknown[] }).items).toHaveLength(25);
    expect((gapReport(index, scores, 'all', 0) as { items: unknown[] }).items).toHaveLength(10);
  });
});

describe('create-gap-tasks, pure part', () => {
  it('parses lists and drops duplicates', () => {
    expect(parseAssetIds('a_1, a_2;a_1  a_3')).toEqual(['a_1', 'a_2', 'a_3']);
    expect(parseAssetIds(['a_1', 'a_1'])).toEqual(['a_1']);
  });

  it('rejects unknown ids, empty input and more than ten', () => {
    expect(validateTaskIds(index, `${OLD_FAITHFUL},a_zzzzz`)).toEqual({ error: expect.stringContaining('a_zzzzz') });
    expect(validateTaskIds(index, '')).toHaveProperty('error');
    expect(validateTaskIds(index, scores.slice(0, 11).map((s) => s.assetId).join(','))).toHaveProperty('error');
    expect(validateTaskIds(index, `${OLD_FAITHFUL} ${NOTHING}`)).toEqual({ ids: [OLD_FAITHFUL, NOTHING] });
  });

  it('builds a task with hours, labels and no banned characters', () => {
    const t = gapTask(index, byId.get(NOTHING)!);
    expect(t.labels).toEqual(['pentti-demo', 'pentti-gap-a_8bjia']);
    expect(t.hours).toBeGreaterThan(0);
    expect(t.summary).toContain('Close knowledge gap');
    for (const line of [t.summary, ...t.lines]) expect(line).not.toMatch(/[–—‘’“”!]/);
  });
});
