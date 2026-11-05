import { describe, expect, it } from 'vitest';
import { parseCsv, readAssetList, rowToAsset, MAX_ROWS, type OwnAsset } from '../src/own/csv';
import { adfToText, storageToText } from '../src/own/text';
import { isStrongName, OwnMatcher } from '../src/own/match';
import { buildOwn, daysAgo, splitDocs, type OwnDocs } from '../src/own/dataset';
import { bundledDataset } from '../src/store/dataset';
import { Index } from '../src/store/index';
import { scoreAll } from '../src/score';
import { blastRadius, explainAsset, whoKnows, type Site } from '../src/actions/core';
import { peopleView } from '../src/actions/views';

const scoring = bundledDataset().scoring;
const asset = (row: Parameters<typeof rowToAsset>[0]) => rowToAsset(row) as OwnAsset;

describe('asset list', () => {
  it('reads quotes, doubled quotes, a BOM, CRLF and semicolons', () => {
    expect(parseCsv('﻿a;b\r\n"x;1";"say ""hi"""\r\n')).toEqual([['a', 'b'], ['x;1', 'say "hi"']]);
  });

  it('maps known headers and reports the rest', () => {
    const r = readAssetList('Host Name,hostname,IP Address,Colour\nignored,plc-14,10.0.0.1,red\n');
    expect(r.fatal).toBeUndefined();
    expect(r.assets[0]).toMatchObject({ hostname: 'plc-14', plant: 'Unknown', role: 'unknown', line: '', criticality: 'Unassigned' });
    expect(r.assets[0].ip).toBe('10.0.0.1');
    expect(r.ignoredColumns).toEqual(['Host Name', 'Colour']);
  });

  it('never fills a blank with a guess', () => {
    const a = asset({ hostname: 'plc-14' });
    expect(a).toMatchObject({ ip: '', model: null, firmware: null, nickname: null, manufacturer: null, openCritical: 0, openHigh: 0 });
  });

  it('refuses a file without a hostname or ip column', () => {
    expect(readAssetList('model,site\nS7,Oulu\n').fatal).toContain('hostname or ip');
  });

  it('lists bad rows and keeps the good ones', () => {
    const r = readAssetList('hostname,ip,open_high\nplc-1,10.0.0.1,2\n,,\nplc-2,300.1.1.1,0\nplc-3,10.0.0.3,many\nplc-1,10.0.0.1,2\n,10.0.0.9,\n');
    expect(r.assets.map((a) => a.ip)).toEqual(['10.0.0.1', '10.0.0.9']);
    expect(r.errors.map((e) => e.line)).toEqual([4, 5, 6]);
    expect(r.errors[2].message).toContain('line 2');
  });

  it('caps the row count', () => {
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => `h-${i}`).join('\n');
    expect(readAssetList(`hostname\n${rows}\n`).fatal).toContain(String(MAX_ROWS));
  });

  it('ids are stable and survive the deep link pattern', () => {
    const a = asset({ hostname: 'PLC-14', ip: '10.0.0.1', site: 'Oulu' });
    expect(a.id).toBe(asset({ hostname: 'plc-14', ip: '10.0.0.1', site: 'oulu' }).id);
    expect(a.id).toMatch(/^[a-z0-9_]+$/);
  });
});

describe('page and ticket text', () => {
  it('storage format loses its tags and keeps the words', () => {
    expect(storageToText('<p>Restart <strong>plc-14</strong> &amp; check&nbsp;it</p><ac:x a="secret-host-99"/>')).toBe('Restart plc-14 & check it');
  });

  it('ADF gives text, mentions and links, and survives junk', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plc-14' }, { type: 'mention', attrs: { text: '@Sam' } }] }, { type: 'inlineCard', attrs: { url: 'http://x/y' } }] };
    expect(adfToText(doc)).toBe('plc-14 @Sam http://x/y');
    expect(adfToText(null)).toBe('');
    expect(adfToText('x')).toBe('');
  });
});

describe('own matcher', () => {
  const assets = [
    asset({ hostname: 'plc-14', ip: '10.0.0.1', site: 'Oulu', line: 'L2', model: 'CP 343-1', old_ips: '10.9.9.9' }),
    asset({ hostname: 'plc-140', ip: '10.0.0.2', site: 'Oulu' }),
    asset({ hostname: 'printer', ip: '10.0.0.3', site: 'Oulu', former_names: 'old-name-1' }),
    asset({ hostname: 'srv01.corp.local', site: 'Vaasa', nickname: 'Big Blue' }),
    asset({ ip: '10.0.0.5', nickname: 'Big Blue', site: 'Oulu' }),
    asset({ hostname: 'twin-1', ip: '10.0.0.6', site: 'Oulu' }),
    asset({ hostname: 'twin-1', ip: '10.0.0.7', site: 'Vaasa' }),
  ];
  const m = new OwnMatcher(assets);
  const find = (text: string) => m.match({ id: 'd', kind: 'page', text }).map((l) => [assets.find((a) => a.id === l.assetId)!.hostname ?? assets.find((a) => a.id === l.assetId)!.ip, l.matchType, l.confidence]);

  it('matches any hostname shape as a whole token, not inside a longer name', () => {
    expect(find('Replaced plc-14.')).toEqual([['plc-14', 'hostname', 1]]);
    expect(find('plc-140 only')).toEqual([['plc-140', 'hostname', 1]]);
    expect(find('plc-14x is something else')).toEqual([]);
    expect(find('see SRV01.corp.local')).toEqual([['srv01.corp.local', 'hostname', 1]]);
    expect(find('srv01 restarted')).toEqual([['srv01.corp.local', 'hostname', 1]]);
  });

  it('a name that could be a word only counts as a maybe', () => {
    expect(isStrongName('printer')).toBe(false);
    expect(isStrongName('plc')).toBe(false);
    expect(isStrongName('1234')).toBe(false);
    expect(isStrongName('plc-14')).toBe(true);
    expect(find('the printer is out of paper')).toEqual([['printer', 'nickname_ambiguous', 0.3]]);
  });

  it('two machines with one name are both a maybe, never a pick', () => {
    expect(find('twin-1 stopped').map((x) => x[1])).toEqual(['nickname_ambiguous', 'nickname_ambiguous']);
  });

  it('finds addresses, old addresses and former names', () => {
    expect(find('ping 10.0.0.1')).toEqual([['plc-14', 'ip', 1]]);
    expect(find('was at 10.9.9.9')).toEqual([['plc-14', 'ip_history', 0.9]]);
    expect(find('renamed from old-name-1')).toEqual([['printer', 'former_name', 0.9]]);
  });

  it('a nickname needs its plant when several share it', () => {
    expect(find('Big Blue in Vaasa')).toEqual([['srv01.corp.local', 'nickname', 0.7]]);
    expect(find('Big Blue').map((x) => x[1])).toEqual(['nickname_ambiguous', 'nickname_ambiguous']);
  });

  it('a model needs a plant and a line', () => {
    expect(find('CP 343-1 line 2 in Oulu')).toEqual([['plc-14', 'model_line', 0.5]]);
    expect(find('CP 343-1 somewhere')).toEqual([]);
  });

  it('finds nothing in text about nothing', () => {
    expect(find('Lunch menu for Friday. The line is long.')).toEqual([]);
  });
});

describe('own data through the scores and actions', () => {
  const a1 = asset({ hostname: 'plc-14', ip: '10.0.0.1', site: 'Oulu', line: 'L2', criticality: 'Critical', firmware: '1.2', open_critical: '1', open_high: '2' });
  const a2 = asset({ hostname: 'plc-15', ip: '10.0.0.2', site: 'Oulu', line: 'L2' });
  const a3 = asset({ ip: '10.5.0.1' });
  const a4 = asset({ hostname: 'lonely-1' });
  const docs: OwnDocs = {
    pages: [{ id: 'op_1', remoteId: '1', title: 'plc-14 runbook', lastEditedDaysAgo: 10 }],
    issues: [{ id: 'oi_2', remoteId: '2', key: 'REAL-7', summary: 'plc-14 stopped', status: 'Done', createdDaysAgo: 20, resolvedDaysAgo: 19 }],
    links: [
      { assetId: a1.id, source: 'op_1', sourceKind: 'page', matchType: 'hostname', confidence: 1, evidence: 'plc-14' },
      { assetId: a1.id, source: 'oi_2', sourceKind: 'issue', matchType: 'hostname', confidence: 1, evidence: 'plc-14' },
    ],
  };
  const { data, links, seeded } = buildOwn([[a1, a2], [a3, a4, a1]], [docs], scoring);
  const index = new Index(data, links);
  const scores = scoreAll(index, [], 0, true);
  const byId = new Map(scores.map((s) => [s.assetId, s]));
  const site: Site = {
    baseUrl: 'https://real.test', appUrl: null, seeded, elapsedDays: 0,
    own: { importedOn: '2026-11-05', spaceKey: 'OPS', projectKey: 'REAL', pagesCapped: true, issuesCapped: false },
  };

  it('keeps one copy of a machine and invents no people', () => {
    expect(data.assets).toHaveLength(4);
    expect(data.people).toEqual([]);
    expect(peopleView(index, scores, site).rows).toEqual([]);
  });

  it('keeps no page or ticket text', () => {
    expect(data.pages.every((p) => p.bodyMarkdown === '')).toBe(true);
    expect(data.issues.every((i) => i.description === '')).toBe(true);
  });

  it('any hostname earns the name points, nobody earns the owner points', () => {
    const k = byId.get(a1.id)!.knowledge;
    expect(k.parts.name.points).toBe(scoring.knowledge.name);
    expect(k.parts.owner).toMatchObject({ points: 0, reason: 'people are not imported' });
    expect(byId.get(a3.id)!.knowledge.parts.name.points).toBe(0);
  });

  it('counts from the list drive risk, and carry no invented CVE', () => {
    expect(byId.get(a1.id)!.riskDetail.openCriticalOrHigh).toBe(3);
    expect(index.findingsFor(a1.id).every((f) => f.cve === 'not known' && f.score === null)).toBe(true);
  });

  it('explain says own data, links the real page and ticket, and says what it did not read', () => {
    const r = explainAsset(index, byId.get(a1.id)!, site);
    expect(r.dataset).toBe('own');
    expect(r.known.identity).toMatchObject({ chip: 'CSV' });
    const pages = r.known.pages as { url: string; chip: string }[];
    const issues = r.known.issues as { url: string; chip: string; jiraKey: string }[];
    expect(pages[0]).toMatchObject({ url: 'https://real.test/wiki/pages/viewpage.action?pageId=1', chip: 'SITE' });
    expect(issues[0]).toMatchObject({ url: 'https://real.test/browse/REAL-7', jiraKey: 'REAL-7', chip: 'SITE' });
    const looked = r.searched.join(' ');
    expect(looked).toContain('more exist and were not read');
    expect(looked).toContain('People: not imported');
    expect(looked).not.toContain('Demo');
    expect(JSON.stringify(r)).not.toContain('fictional');
  });

  it('a sparse machine is honest', () => {
    const r = explainAsset(index, byId.get(a3.id)!, site);
    expect(r.not_known.join(' ')).toContain('people are not imported');
    expect(r.not_known.join(' ')).toContain('That does not mean there are none');
    expect(r.known.hardware).toMatchObject({ model: 'not known', lastSeenDaysAgo: 'not known' });
    const noIp = explainAsset(index, byId.get(a4.id)!, site);
    expect(noIp.known.identity).toMatchObject({ ip: 'not known' });
  });

  it('blanks are not neighbours', () => {
    const b = blastRadius(index, byId, a4.id, site);
    expect(b.sameLine.count).toBe(0);
    expect(b.sameSubnet).toMatchObject({ count: 0, subnet: 'not known' });
    const real = blastRadius(index, byId, a1.id, site);
    expect(real.sameLine.count).toBe(1);
    expect(real.sameSubnet.count).toBe(1);
  });

  it('who knows says not known, never nobody', () => {
    const w = whoKnows(index, a1.id, site);
    expect(w.people).toEqual([]);
    expect(w.not_known[0]).toContain('not known');
  });
});

describe('a page that lists many machines', () => {
  const many = Array.from({ length: 300 }, (_, i) => asset({ hostname: `node-${i}`, ip: `10.1.${Math.floor(i / 250)}.${i % 250}` }));
  const links = new OwnMatcher(many).match({ id: 'op_9', kind: 'page', text: many.map((a) => a.hostname).join(' ') });

  it('is a list, it does not document them', () => {
    expect(links).toHaveLength(300);
    expect(links.every((l) => l.confidence < scoring.match_min_confidence)).toBe(true);
    const few = new OwnMatcher(many).match({ id: 'op_8', kind: 'page', text: 'node-1 node-2' });
    expect(few.every((l) => l.confidence === 1)).toBe(true);
  });

  it('fits storage, split without losing a link', () => {
    const docs: OwnDocs = { pages: [{ id: 'op_9', remoteId: '9', title: 't', lastEditedDaysAgo: 1 }], issues: [], links };
    const chunks = splitDocs(docs, 5000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => JSON.stringify(c).length <= 5000)).toBe(true);
    expect(chunks.flatMap((c) => c.links)).toEqual(links);
    expect(chunks.flatMap((c) => c.pages)).toEqual(docs.pages);
  });
});

describe('dates', () => {
  it('a missing date is the given unknown, a future date is zero', () => {
    const now = Date.parse('2026-11-05T00:00:00Z');
    expect(daysAgo('2026-11-01T00:00:00Z', now, 99)).toBe(4);
    expect(daysAgo(undefined, now, 99)).toBe(99);
    expect(daysAgo('junk', now, 99)).toBe(99);
    expect(daysAgo('2027-01-01T00:00:00Z', now, 99)).toBe(0);
  });
});
