// S0 spike. Probes Forge limits and the Teamwork Graph connector.
// Results go into docs/limits.md. Removed or replaced once S0 is done.
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { graph } from '@forge/teamwork-graph';

const CONN_KEY = 'spike:connectionId';
const now = () => Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': ['application/json'] },
  body: JSON.stringify(body, null, 2),
});

async function firstIssueKey() {
  const res = await api
    .asApp()
    .requestJira(route`/rest/api/3/search/jql?jql=${'created >= -3650d order by created DESC'}&maxResults=1&fields=summary`);
  const data = await res.json();
  return data.issues && data.issues[0] ? data.issues[0].key : null;
}

function assetCard(id, issueKeys, extraAssociations = []) {
  const ts = new Date().toISOString();
  const doc = {
    schemaVersion: '1.0',
    id,
    updateSequenceNumber: now(),
    displayName: `Pentti spike asset ${id}`,
    description: 'Spike asset card. Fictional machine, Tervaniemi Works.',
    url: `https://example.com/pentti/asset/${id}`,
    createdAt: ts,
    lastUpdatedAt: ts,
    permissions: [{ accessControls: [{ principals: [{ type: 'EVERYONE' }] }] }],
    'atlassian:document': {
      type: { category: 'DOCUMENT', mimeType: 'text/plain' },
      content: { mimeType: 'text/plain', text: `Asset ${id}. Old Faithful spike. CP 343-1. Nobody knows.` },
    },
  };
  const set = [];
  if (issueKeys.length) set.push({ associationType: 'issueIdOrKeys', values: issueKeys });
  set.push(...extraAssociations);
  if (set.length) doc.associations = { lastUpdatedAt: ts, set };
  return doc;
}

// graph:connector datasource.onConnectionChange
export async function onConnectionChange(event) {
  const body = event && event.body ? event.body : event;
  console.log('onConnectionChange', JSON.stringify(body));
  if (!body || !body.connectionId) return;
  if (body.action === 'DELETED') {
    await kvs.delete(CONN_KEY);
    return;
  }
  await kvs.set(CONN_KEY, body.connectionId);
  const key = await firstIssueKey();
  const result = await graph.setObjects({
    objects: [assetCard('a_spike1', key ? [key] : [])],
    connectionId: body.connectionId,
  });
  console.log('setObjects one card', key, JSON.stringify(result));
  await kvs.set('spike:lastIngest', { key, result, at: now() });
}

async function probeStorage() {
  const out = { valueSize: [], keyLength: [], rate: null };
  for (const kb of [32, 64, 128, 200, 240, 256, 512, 1024]) {
    const v = 'x'.repeat(kb * 1024 - 2);
    try {
      await kvs.set(`spike:size:${kb}`, v);
      out.valueSize.push({ kb, ok: true });
    } catch (e) {
      out.valueSize.push({ kb, ok: false, error: String(e.message || e).slice(0, 200) });
    }
  }
  for (const len of [50, 100, 128, 200, 500]) {
    const k = 'k'.repeat(len);
    try {
      await kvs.set(k, 1);
      await kvs.delete(k);
      out.keyLength.push({ len, ok: true });
    } catch (e) {
      out.keyLength.push({ len, ok: false, error: String(e.message || e).slice(0, 200) });
    }
  }
  const n = 100;
  const t0 = now();
  let failed = 0;
  let firstError = null;
  for (let i = 0; i < n; i++) {
    try {
      await kvs.set(`spike:rate:${i}`, { i, pad: 'y'.repeat(2000) });
    } catch (e) {
      failed++;
      firstError = firstError || String(e.message || e).slice(0, 200);
    }
  }
  out.rate = { writes: n, ms: now() - t0, failed, firstError };
  const t1 = now();
  const par = await Promise.allSettled(
    Array.from({ length: n }, (_, i) => kvs.set(`spike:par:${i}`, { i, pad: 'z'.repeat(2000) }))
  );
  const parFailed = par.filter((p) => p.status === 'rejected');
  out.parallel = {
    writes: n,
    ms: now() - t1,
    failed: parFailed.length,
    firstError: parFailed[0] ? String(parFailed[0].reason).slice(0, 200) : null,
  };
  return out;
}

async function probeTimeout(seconds) {
  const t0 = now();
  for (let s = 1; s <= seconds; s++) {
    await sleep(1000);
    console.log(`timeout probe alive ${s}s`);
  }
  return { survived: seconds, ms: now() - t0 };
}

async function probeGraph(batch) {
  const connectionId = await kvs.get(CONN_KEY);
  if (!connectionId) return { error: 'no connection yet. Connect the connector in admin first.' };
  const key = await firstIssueKey();
  if (batch === 1) {
    const one = await graph.setObjects({ objects: [assetCard('a_spike1', key ? [key] : [])], connectionId });
    return { key, one: JSON.stringify(one).slice(0, 1500) };
  }
  const objects = Array.from({ length: batch }, (_, i) => assetCard(`a_spikeb${i}`, key ? [key] : []));
  const t0 = now();
  const result = await graph.setObjects({ objects, connectionId });
  const ms = now() - t0;
  const status = await graph.getObjectIndexStatusByExternalId({
    objectType: 'atlassian:document',
    externalId: 'a_spike1',
    connectionId,
  });
  return {
    batch,
    ms,
    success: result.success,
    error: result.error || null,
    accepted: result.results && result.results.accepted ? result.results.accepted.length : null,
    rejected: result.results && result.results.rejected ? result.results.rejected.length : null,
    firstRejected: result.results && result.results.rejected && result.results.rejected[0] ? JSON.stringify(result.results.rejected[0]).slice(0, 400) : null,
    indexStatusSpike1: status,
    lastIngest: await kvs.get('spike:lastIngest'),
  };
}

async function probeConfluenceLink(pageId) {
  const connectionId = await kvs.get(CONN_KEY);
  if (!connectionId) return { error: 'no connection yet' };
  const tries = {};
  for (const associationType of ['confluencePageIds', 'pageIds', 'contentIds', 'atlassian:page', 'confluencePageId']) {
    const r = await graph.setObjects({
      objects: [assetCard(`a_spikec_${associationType.replace(/\W/g, '')}`, [], [{ associationType, values: [pageId] }])],
      connectionId,
    });
    tries[associationType] = JSON.stringify(r).slice(0, 600);
  }
  return tries;
}

// web trigger: ?probe=storage | timeout&s=N | graph&n=N | conf&page=ID | issue
export async function spikeTrigger(request) {
  const q = request.queryParameters || {};
  const probe = q.probe ? q.probe[0] : 'help';
  try {
    if (probe === 'storage') return json(200, await probeStorage());
    if (probe === 'timeout') return json(200, await probeTimeout(Number(q.s ? q.s[0] : 10)));
    if (probe === 'graph') return json(200, await probeGraph(Number(q.n ? q.n[0] : 10)));
    if (probe === 'conf') return json(200, await probeConfluenceLink(q.page ? q.page[0] : '0'));
    if (probe === 'backdate') {
      const body = {
        fields: {
          project: { key: 'MOBL' },
          issuetype: { name: 'Task' },
          summary: 'pentti-spike backdate test',
          labels: ['pentti-spike'],
          created: '2019-03-01T10:00:00.000+0000',
        },
      };
      const r = await api.asApp().requestJira(route`/rest/api/3/issue`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return json(200, { status: r.status, body: (await r.text()).slice(0, 800) });
    }
    if (probe === 'index') {
      const connectionId = await kvs.get(CONN_KEY);
      const ids = ['a_spike1', 'a_spikeb0', 'a_spikeb99'];
      const out = {};
      for (const externalId of ids) {
        out[externalId] = await graph.getObjectIndexStatusByExternalId({ objectType: 'atlassian:document', externalId, connectionId });
      }
      return json(200, out);
    }
    if (probe === 'issue') {
      const r = await api.asApp().requestJira(route`/rest/api/3/search/jql?jql=${'created >= -3650d order by created DESC'}&maxResults=3&fields=summary`);
      const p = await api.asApp().requestJira(route`/rest/api/3/project/search?maxResults=5`);
      return json(200, { search: r.status, body: (await r.text()).slice(0, 800), projects: p.status, pbody: (await p.text()).slice(0, 800) });
    }
    return json(200, { probes: ['storage', 'timeout&s=N', 'graph&n=N', 'conf&page=ID', 'issue'] });
  } catch (e) {
    return json(500, { probe, error: String(e && e.stack ? e.stack : e).slice(0, 2000) });
  }
}
