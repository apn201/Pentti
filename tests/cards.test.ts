import { describe, expect, it } from 'vitest';
import { bundledDataset } from '../src/store/dataset';
import { computeLinks } from '../src/match/link';
import { Index } from '../src/store/index';
import { scoreAll } from '../src/score';
import { assetCard, chunks, MAX_ASSOCIATIONS, SPIKE_IDS } from '../src/connector/cards';
import { assetUrl, findAsset, gapReport, type Site } from '../src/actions/core';
import { appPageUrl } from '../src/app/context';

const data = bundledDataset();
const index = new Index(data, computeLinks(data));
const scores = scoreAll(index);
const byId = new Map(scores.map((s) => [s.assetId, s]));
const APP = 'https://example.test/jira/apps/app1/env1';
const site: Site = {
  baseUrl: 'https://example.test',
  appUrl: APP,
  seeded: { is_001: { kind: 'issue', remoteId: '1', key: 'TVW-151' }, pg_021: { kind: 'page', remoteId: '77' } },
  elapsedDays: 0,
};
const opts = { now: '2026-11-04T00:00:00.000Z', sequence: 1 };

describe('deep links', () => {
  it('build the page url from runtime ids and the asset url from it', () => {
    expect(appPageUrl('https://example.test', 'app1', 'env1')).toBe(APP);
    expect(appPageUrl(null, 'app1', 'env1')).toBeNull();
    expect(appPageUrl('https://example.test', undefined, 'env1')).toBeNull();
    expect(assetUrl(site, 'a_d4mjq')).toBe(`${APP}/asset/a_d4mjq`);
    expect(assetUrl({ appUrl: null }, 'a_d4mjq')).toBeNull();
  });

  it('action outputs carry the url, or null without a page url', () => {
    const r = findAsset(index, 'Old Faithful', site) as { candidates: { url: string | null }[] };
    expect(r.candidates[0].url).toBe(`${APP}/asset/a_d4mjq`);
    const g = gapReport(index, scores, 'all', 3, site) as { items: { url: string | null }[] };
    expect(g.items.every((i) => i.url?.startsWith(APP))).toBe(true);
    const n = findAsset(index, 'Old Faithful') as { candidates: { url: string | null }[] };
    expect(n.candidates[0].url).toBeNull();
  });
});

describe('asset cards', () => {
  const card = assetCard(index, byId.get('a_d4mjq')!, site, opts) as Record<string, unknown> & {
    'atlassian:document': { type: { category: string }; content: { text: string }; labels: string[] };
    associations?: { set: { associationType: string; values: string[] }[] };
  };

  it('Old Faithful: searchable text, link back, seeded Jira key as association', () => {
    expect(card.id).toBe('a_d4mjq');
    expect(card.displayName).toBe('birch-l2-cp-04 (Old Faithful)');
    expect(card.url).toBe(`${APP}/asset/a_d4mjq`);
    expect(card['atlassian:document'].type.category).toBe('DOCUMENT');
    const t = card['atlassian:document'].content.text;
    for (const s of ['birch-l2-cp-04', 'Old Faithful', 'CP 343-1', 'Knowledge 40', 'risk 95', 'danger 57', 'fictional', 'Not known:']) expect(t).toContain(s);
    expect(t).toContain('https://example.test/wiki/pages/viewpage.action?pageId=77');
    expect(card.associations?.set[0]).toEqual({ associationType: 'issueIdOrKeys', values: ['TVW-151'] });
  });

  it('no association without seeded keys, and never more than the limit', () => {
    const c = assetCard(index, byId.get('a_8bjia')!, site, opts) as { associations?: unknown };
    expect(c.associations).toBeUndefined();
    for (const s of scores) {
      const x = assetCard(index, s, site, opts) as { associations?: { set: { values: unknown[] }[] } };
      expect((x.associations?.set[0].values.length ?? 0)).toBeLessThanOrEqual(MAX_ASSOCIATIONS);
    }
  });

  it('every asset gets a card with no banned characters', () => {
    for (const s of scores) {
      const c = assetCard(index, s, site, opts) as { 'atlassian:document': { content: { text: string } }; description: string };
      expect(c['atlassian:document'].content.text + c.description).not.toMatch(/[–—‘’“”!]/);
    }
  });

  it('refuses to build a card without the page url', () => {
    expect(() => assetCard(index, byId.get('a_d4mjq')!, { ...site, appUrl: null }, opts)).toThrow();
  });

  it('batches of 100 and the spike ids', () => {
    expect(chunks(scores).map((c) => c.length)).toEqual([100, 100, 100, 100, 100, 22]);
    expect(SPIKE_IDS).toHaveLength(101);
  });
});
