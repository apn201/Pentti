import { describe, expect, it } from 'vitest';
import { bundledDataset } from '../src/store/dataset';
import { computeLinks } from '../src/match/link';
import { Index } from '../src/store/index';
import { scoreAll } from '../src/score';
import { dangerLight, knowledgeLight, lights, riskLight } from '../src/score/bands';
import { assetView, nothingKnown, overview, peopleView } from '../src/actions/views';
import type { Site } from '../src/actions/core';

const data = bundledDataset();
const cfg = data.scoring;
const index = new Index(data, computeLinks(data));
const scores = scoreAll(index);
const byId = new Map(scores.map((s) => [s.assetId, s]));
const site: Site = { baseUrl: 'https://example.test', seeded: {}, elapsedDays: 0 };

describe('traffic lights', () => {
  it('risk and danger are red when high, knowledge is red when low', () => {
    expect(riskLight(cfg.bands.risk.red, cfg)).toBe('red');
    expect(riskLight(cfg.bands.risk.red - 1, cfg)).toBe('amber');
    expect(riskLight(cfg.bands.risk.amber - 1, cfg)).toBe('green');
    expect(dangerLight(cfg.bands.danger.red, cfg)).toBe('red');
    expect(dangerLight(cfg.bands.danger.amber, cfg)).toBe('amber');
    expect(dangerLight(0, cfg)).toBe('green');
    expect(knowledgeLight(cfg.bands.knowledge.green, cfg)).toBe('green');
    expect(knowledgeLight(cfg.bands.knowledge.amber, cfg)).toBe('amber');
    expect(knowledgeLight(0, cfg)).toBe('red');
  });

  it('hero lights are frozen', () => {
    const l = (id: string) => { const s = byId.get(id)!; return lights({ risk: s.risk, knowledge: s.knowledge.score, danger: s.danger }, cfg); };
    expect(l('a_d4mjq')).toEqual({ risk: 'red', knowledge: 'amber', danger: 'red' });   // Old Faithful K40 R95 D57
    expect(l('a_8bjia')).toEqual({ risk: 'red', knowledge: 'red', danger: 'red' });     // K5 R100 D95
  });
});

describe('overview', () => {
  const o = overview(index, scores);
  it('one row per asset with lights and the counter line', () => {
    expect(o.rows).toHaveLength(data.assets.length);
    expect(o.sentence).toBe(`${data.assets.length} assets. ${o.counts.criticalNothingKnown} are Critical and nobody knows anything about them.`);
    expect(o.counts.criticalNothingKnown).toBeGreaterThanOrEqual(20);
    expect(o.plants).toEqual(['Alder', 'Annex', 'Birch', 'Pine', 'Rowan', 'Spruce']);
  });

  it('nothing known: the nameless PLC yes, Old Faithful no', () => {
    expect(nothingKnown(index, byId.get('a_8bjia')!)).toBe(true);
    expect(nothingKnown(index, byId.get('a_d4mjq')!)).toBe(false);
  });
});

describe('people', () => {
  const p = peopleView(index, scores, site);
  it('Pentti tops the list, leaving, sole name on about 40 machines', () => {
    const pentti = p.rows.find((r) => r.personId === 'p_pentti')!;
    expect(p.rows[0].personId).toBe('p_pentti');
    expect(pentti.leavingSoon).toBe(true);
    expect(pentti.leavingInDays).toBe(150);
    expect(pentti.soleKnower).toBeGreaterThanOrEqual(35);
    expect(pentti.soleKnower).toBeLessThanOrEqual(45);
    expect(pentti.note).toBe(`The only name on ${pentti.soleKnower} machines leaves too.`);
  });

  it('people who left are never the sole knower', () => {
    for (const r of p.rows.filter((x) => x.left)) expect(r.soleKnower).toBe(0);
  });

  it('every person is listed once', () => {
    expect(p.rows).toHaveLength(data.people.length);
  });
});

describe('asset card', () => {
  it('carries lights, findings, people, blast counts and the gap task', () => {
    const v = assetView(index, byId.get('a_d4mjq')!, byId, site, [], 'TVW-305');
    expect(v.lights.danger).toBe('red');
    expect(v.openFindings.length).toBe(33);
    expect(v.openFindings[0].score).toBe(9.3);
    expect(v.who.some((w) => w.personId === 'p_pentti')).toBe(true);
    expect(v.blast.sentence).toContain('Reachability not verified');
    expect(v.gapTask).toEqual({ key: 'TVW-305', url: 'https://example.test/browse/TVW-305' });
    expect(v.confirmed).toBeNull();
  });

  it('a confirmation shows and raises knowledge through the score', () => {
    const conf = [{ assetId: 'a_8bjia', accountId: 'u1', daysAgo: 0 }];
    const s2 = scoreAll(index, conf);
    const after = s2.find((s) => s.assetId === 'a_8bjia')!;
    const v = assetView(index, after, new Map(s2.map((s) => [s.assetId, s])), site, conf, null);
    expect(v.confirmed).toEqual({ daysAgo: 0 });
    expect(v.knowledge.score).toBe(byId.get('a_8bjia')!.knowledge.score + cfg.knowledge.confirmed);
  });
});
