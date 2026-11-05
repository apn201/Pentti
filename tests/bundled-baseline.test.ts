// The bundled data option must stay exactly as it was before own data existed.
// Hashes of every pure output over all assets, written from the code at tag rollback-before-own-data.
// A failure here means the bundled mode changed. Never update the snapshot to make it pass.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bundledDataset } from '../src/store/dataset';
import { computeLinks } from '../src/match/link';
import { Index } from '../src/store/index';
import { scoreAll } from '../src/score';
import { blastRadius, explainAsset, findAsset, gapReport, gapTask, whoKnows, type Site } from '../src/actions/core';
import { assetView, overview, peopleView } from '../src/actions/views';
import { assetCard } from '../src/connector/cards';
import { units } from '../src/seed/plan';
import { issueDescription, pageBody } from '../src/seed/format';

const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x) ?? 'undefined').digest('hex').slice(0, 24);

const data = bundledDataset();
const links = computeLinks(data);
const index = new Index(data, links);
const people = new Map(data.people.map((p) => [p.id, p]));

function outputs(elapsedDays: number) {
  const confirmations = [{ assetId: 'a_d4mjq', accountId: 'x', daysAgo: 3 }];
  const scores = scoreAll(index, confirmations, elapsedDays);
  const byId = new Map(scores.map((s) => [s.assetId, s]));
  const seeded = Object.fromEntries([
    ...data.pages.map((p, i) => [p.id, { kind: 'page' as const, remoteId: String(1000 + i), title: p.title }]),
    ...data.issues.map((x, i) => [x.id, { kind: 'issue' as const, remoteId: String(2000 + i), key: `TVW-${i + 1}` }]),
  ]);
  const site: Site = { baseUrl: 'https://example.test', appUrl: 'https://example.test/jira/apps/a/e', seeded, elapsedDays };
  const ids = index.assets.map((a) => a.id);
  const plants = ['all', ...new Set(index.assets.map((a) => a.plant))];
  const opts = { now: '2026-11-05T00:00:00.000Z', sequence: 1 };
  return {
    scores: hash(scores),
    explain: hash(ids.map((id) => explainAsset(index, byId.get(id)!, site))),
    blast: hash(ids.map((id) => blastRadius(index, byId, id, site))),
    who: hash(ids.map((id) => whoKnows(index, id, site))),
    assetView: hash(ids.map((id) => assetView(index, byId.get(id)!, byId, site, confirmations, null))),
    cards: hash(ids.map((id) => assetCard(index, byId.get(id)!, site, opts))),
    gapTasks: hash(ids.map((id) => gapTask(index, byId.get(id)!))),
    gapReports: hash(plants.map((p) => [5, 10, 25].map((n) => gapReport(index, scores, p, n, site)))),
    overview: hash(overview(index, scores)),
    people: hash(peopleView(index, scores, site)),
    find: hash(['Old Faithful', 'The Oracle', 'The Kraken', 'plc', '10.1.2.27', '  '].map((q) => findAsset(index, q, site))),
  };
}

describe('bundled data stays as it was', () => {
  it('matches the hashes frozen before the own data work', async () => {
    const frozen = {
      counts: { assets: data.assets.length, findings: data.findings.length, pages: data.pages.length, issues: data.issues.length, people: data.people.length, links: links.length },
      dataset: hash(data),
      links: hash(links),
      seedPlan: hash(units(data)),
      seedBodies: hash([data.pages.map((p) => pageBody(p, people)), data.issues.map((i) => issueDescription(i, people))]),
      atInstall: outputs(0),
      after30Days: outputs(30),
    };
    await expect(JSON.stringify(frozen, null, 2)).toMatchFileSnapshot('./fixtures/bundled-baseline.json');
  });
});
