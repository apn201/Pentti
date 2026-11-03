import { describe, expect, it } from 'vitest';
import { bundledDataset } from '../src/store/dataset';
import { computeLinks } from '../src/match/link';
import { Index } from '../src/store/index';
import { scoreAll, scoreAsset } from '../src/score';
import { knowledge, monthsToDays } from '../src/score/knowledge';
import { danger, risk } from '../src/score/risk';
import { closingList, steps } from '../src/score/closing';
import type { Asset, Finding, Issue, Link, Page, Person } from '../src/types';

const data = bundledDataset();
const cfg = data.scoring;
const index = new Index(data, computeLinks(data));
const id = (h: string) => data.assets.find((a) => a.hostname === h || a.id === h)!.id;
const parts = (h: string) => Object.fromEntries(Object.entries(scoreAsset(index, id(h)).knowledge.parts).map(([k, v]) => [k, v.points]));

// Frozen numbers for the hero assets (FACTORY_BUILD.md 5.6 and 7). If a weight in config/scoring.yml
// or the dataset changes, these change on purpose and get updated here, never the other way round.
describe('frozen hero scores', () => {
  it('hero 1, Old Faithful', () => {
    const s = scoreAsset(index, id('birch-l2-cp-04'));
    expect([s.knowledge.score, s.risk, s.danger]).toEqual([40, 95, 57]);
    expect(parts('birch-l2-cp-04')).toEqual({ name: 10, owner: 0, doc: 25, doc_fresh: 0, history: 0, firmware: 5, confirmed: 0 });
    expect(s.riskDetail).toEqual({ score: 95, critWeight: 1, openCriticalOrHigh: 19, exploitBonus: 0 });
  });

  it('hero 2, the nameless PLC with 91 findings', () => {
    const s = scoreAsset(index, 'a_8bjia');
    expect([s.knowledge.score, s.risk, s.danger]).toEqual([5, 100, 95]);
    expect(s.riskDetail.openCriticalOrHigh).toBe(63);
  });

  it('hero 3, two machines with one IP, scored the same', () => {
    const a = scoreAsset(index, 'a_2yq7i');
    const b = scoreAsset(index, 'a_6asq9');
    expect([a.knowledge.score, a.risk, a.danger]).toEqual([5, 73, 69.35]);
    expect([b.knowledge.score, b.risk, b.danger]).toEqual([5, 73, 69.35]);
  });

  it('hero 4, the moved PLC keeps its page, the machine now at that address gets none', () => {
    expect(scoreAsset(index, id('birch-l2-plc-12')).knowledge.parts.doc.points).toBe(25);
    expect(scoreAsset(index, id('birch-l2-plc-03')).knowledge.parts.doc.points).toBe(0);
  });

  it('a well documented PLC for contrast', () => {
    const s = scoreAsset(index, id('spruce-l1-plc-09'));
    expect([s.knowledge.score, s.risk, s.danger]).toEqual([90, 97, 9.7]);
  });

  it('a Birch PLC only Pentti touches gets the leaving-owner points', () => {
    const s = scoreAsset(index, id('birch-l2-plc-09'));
    expect(s.knowledge.parts.owner.points).toBe(cfg.knowledge.owner_leaving);
    expect(s.knowledge.owner).toEqual({ personId: 'p_pentti', leaving: true });
  });

  it('closing list for the whole factory, top 10', () => {
    const cl = closingList(scoreAll(index), cfg, 10);
    expect(cl.items).toHaveLength(10);
    expect(cl.items[0].assetId).toBe('a_8bjia');
    expect(cl.totalHours).toBe(18.5);
    expect(cl.percentRemoved).toBe(2.3);
  });
});

// --- formulas on small inputs

const cfgDays = (m: number) => monthsToDays(m);

function asset(over: Partial<Asset> = {}): Asset {
  return {
    id: 'a_test1', hostname: 'birch-l2-plc-01', nickname: null, plant: 'Birch', line: 'L2', role: 'plc',
    deviceType: 'PLC', model: 'CPU 315-2 DP', firmware: 'V3.3', manufacturer: 'Siemens', purdue: 1,
    criticality: 'Critical', entityType: 'managed', ot: true, ip: '10.1.2.11', macs: [], flags: [],
    modules: [], ipHistory: [], formerNames: [], firstSeenDaysAgo: 100, lastSeenDaysAgo: 0, ...over,
  };
}

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: 'f_1', assetId: 'a_test1', cve: 'CVE-2020-0001', severity: 'Critical', score: 9.8, exploitLabel: 'Unproven',
    exploitValue: 0, status: 'open', publishedDaysAgo: 10, openedDaysAgo: 5, summary: '', advisoryUrl: null, ...over,
  };
}

describe('risk', () => {
  it('follows the formula', () => {
    expect(risk(asset(), [], cfg).score).toBe(60);
    expect(risk(asset({ criticality: 'High' }), [], cfg).score).toBe(42);
    expect(risk(asset({ criticality: 'Unassigned' }), [], cfg).score).toBe(18);
    // 1 open critical: 60 + 8 * log2(2) = 68
    expect(risk(asset(), [finding()], cfg).score).toBe(68);
    // exploit bonus
    expect(risk(asset(), [finding({ exploitValue: 60 })], cfg).score).toBe(78);
    // closed or medium findings do not count
    expect(risk(asset(), [finding({ status: 'closed' }), finding({ severity: 'Medium' })], cfg).score).toBe(60);
  });

  it('caps the findings part at 40', () => {
    const many = Array.from({ length: 200 }, (_, i) => finding({ id: `f_${i}`, exploitValue: 90 }));
    expect(risk(asset(), many, cfg).score).toBe(100);
  });

  it('danger is risk times what is unknown', () => {
    expect(danger(80, 25)).toBe(60);
    expect(danger(80, 100)).toBe(0);
  });
});

describe('knowledge', () => {
  const people: Person[] = [
    { id: 'p_stay', name: 'S', role: '', plant: null, startedYearsAgo: 1, leavingInDays: null, leftDaysAgo: null, bio: '' },
    { id: 'p_go', name: 'G', role: '', plant: null, startedYearsAgo: 1, leavingInDays: 100, leftDaysAgo: null, bio: '' },
    { id: 'p_gone', name: 'X', role: '', plant: null, startedYearsAgo: 1, leavingInDays: null, leftDaysAgo: 10, bio: '' },
  ];
  const page = (id: string, author: string | null, days: number): Page =>
    ({ id, title: '', space: '', authorId: author, class: 'ok', lastEditedDaysAgo: days, bodyMarkdown: '', mentions: [] });
  const issue = (id: string, who: string, days: number): Issue =>
    ({ id, summary: '', type: '', status: '', reporterId: who, assigneeId: who, createdDaysAgo: days, resolvedDaysAgo: null, description: '', labels: [], mentions: [] });
  const link = (source: string, sourceKind: 'page' | 'issue', confidence = 1): Link =>
    ({ assetId: 'a_test1', source, sourceKind, matchType: 'hostname', confidence, evidence: '' });

  function k(a: Asset, links: Link[], pages: Page[], issues: Issue[], elapsedDays = 0, confirmations: { daysAgo: number }[] = []) {
    return knowledge(a, {
      cfg, links, elapsedDays,
      page: (i) => pages.find((p) => p.id === i),
      issue: (i) => issues.find((p) => p.id === i),
      person: (i) => people.find((p) => p.id === i),
      confirmations: confirmations.map((c) => ({ assetId: a.id, accountId: 'acc', daysAgo: c.daysAgo })),
    });
  }

  it('scores 100 when everything is known', () => {
    const r = k(asset(), [link('pg', 'page'), link('is', 'issue')], [page('pg', 'p_stay', 10)], [issue('is', 'p_stay', 10)], 0, [{ daysAgo: 1 }]);
    expect(r.score).toBe(100);
  });

  it('scores only firmware for a nameless box nobody knows', () => {
    expect(k(asset({ hostname: null }), [], [], []).score).toBe(5);
    expect(k(asset({ hostname: null, firmware: null }), [], [], []).score).toBe(0);
  });

  it('a nickname counts as a name, an odd hostname does not', () => {
    expect(k(asset({ hostname: 'BOX7' }), [], [], []).parts.name.points).toBe(0);
    expect(k(asset({ hostname: null, nickname: 'Grumpy' }), [], [], []).parts.name.points).toBe(10);
  });

  it('maybe links never count', () => {
    const r = k(asset(), [link('pg', 'page', 0.3)], [page('pg', 'p_stay', 10)], []);
    expect(r.parts.doc.points).toBe(0);
  });

  it('owner: leaving gives partial points, gone gives none, old touches give none', () => {
    expect(k(asset(), [link('is', 'issue')], [], [issue('is', 'p_go', 10)]).parts.owner.points).toBe(8);
    expect(k(asset(), [link('is', 'issue')], [], [issue('is', 'p_gone', 10)]).parts.owner.points).toBe(0);
    expect(k(asset(), [link('is', 'issue')], [], [issue('is', 'p_stay', cfgDays(24) + 1)]).parts.owner.points).toBe(0);
    // someone who stays beats someone who leaves
    expect(k(asset(), [link('a', 'issue'), link('b', 'issue')], [], [issue('a', 'p_go', 5), issue('b', 'p_stay', 50)]).parts.owner.points).toBe(20);
  });

  it('a doc goes stale after 18 months, history after 36, and time moves on from the install date', () => {
    const fresh = cfgDays(18);
    expect(k(asset(), [link('pg', 'page')], [page('pg', null, fresh)], []).parts.doc_fresh.points).toBe(15);
    expect(k(asset(), [link('pg', 'page')], [page('pg', null, fresh)], [], 1).parts.doc_fresh.points).toBe(0);
    expect(k(asset(), [link('is', 'issue')], [], [issue('is', 'p_gone', cfgDays(36))]).parts.history.points).toBe(15);
    expect(k(asset(), [link('is', 'issue')], [], [issue('is', 'p_gone', cfgDays(36) + 1)]).parts.history.points).toBe(0);
  });
});

describe('closing list', () => {
  it('prices each gap from scoring.json', () => {
    const s = scoreAsset(index, 'a_8bjia');
    expect(steps(s, cfg).map((x) => [x.action, x.hours, x.points])).toEqual([
      ['name', 0.5, 10], ['owner', 0.5, 20], ['doc', 2, 40], ['confirm', 0.5, 10],
    ]);
    const of = scoreAsset(index, id('birch-l2-cp-04'));
    expect(steps(of, cfg).map((x) => x.action)).toEqual(['owner', 'doc_refresh', 'confirm']);
  });

  it('ranks by danger removed per hour and stops at N', () => {
    const cl = closingList(scoreAll(index), cfg, 5);
    expect(cl.items).toHaveLength(5);
    for (let i = 1; i < cl.items.length; i++) expect(cl.items[i - 1].perHour).toBeGreaterThanOrEqual(cl.items[i].perHour);
    expect(cl.totalHours).toBe(cl.items.reduce((s, x) => s + x.hours, 0));
  });

  it('works on a plant scope and never lists a fully known asset', () => {
    const birch = new Set(index.byPlant('Birch').map((a) => a.id));
    const cl = closingList(scoreAll(index).filter((s) => birch.has(s.assetId)), cfg, 10);
    expect(cl.items.every((i) => birch.has(i.assetId))).toBe(true);
    expect(cl.items.every((i) => i.knowledge < 100)).toBe(true);
    expect(cl.percentRemoved).toBeGreaterThan(0);
  });
});

describe('store search', () => {
  it('finds Old Faithful by nickname, and only it', () => {
    const r = index.search('old faithful');
    expect(r).toHaveLength(1);
    expect(r[0].asset.hostname).toBe('birch-l2-cp-04');
  });

  it('returns candidates, never more than five, for a vague query', () => {
    const r = index.search('cpu 315');
    expect(r.length).toBeGreaterThan(1);
    expect(r.length).toBeLessThanOrEqual(5);
  });

  it('a nickname used in two plants gives both', () => {
    expect(index.search('the oracle').map((c) => c.asset.plant).sort()).toEqual(['Birch', 'Rowan', 'Spruce']);
  });

  it('finds by old address and by current address', () => {
    expect(index.search('10.1.2.13').map((c) => c.asset.hostname).sort()).toEqual(['birch-l2-plc-03', 'birch-l2-plc-12']);
  });
});
