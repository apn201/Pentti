// Resolvers for the Pentti page (FACTORY_BUILD.md section 10). Reads compute on request.
// The two writes, "Create tasks" and "I checked this", key off context.accountId and check every id.
import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
import { snapshot } from '../app/context';
import { CONFIRM_PREFIX } from '../seed/seed';
import { findAsset, gapReport } from '../actions/core';
import { assetView, overview, peopleView } from '../actions/views';
import { createGapTasks, existingGapTasks } from '../actions/tasks';
import { lights } from '../score/bands';
import { syncOne } from '../connector/graph';

const resolver = new Resolver();

type Req = { payload: Record<string, unknown>; context: { accountId?: string } };

function safe<T>(name: string, fn: (req: Req) => Promise<T>) {
  return async (req: Req) => {
    const t0 = Date.now();
    try {
      const r = await fn(req);
      console.log(name, Date.now() - t0, 'ms');
      return r;
    } catch (e) {
      console.error(name, e);
      return { error: String(e instanceof Error ? e.message : e).slice(0, 300) };
    }
  };
}

resolver.define('overview', safe('overview', async () => {
  const snap = await snapshot();
  return overview(snap.index, snap.scores);
}));

resolver.define('find', safe('find', async ({ payload }) => {
  const snap = await snapshot();
  return findAsset(snap.index, String(payload.query ?? ''), snap.site);
}));

resolver.define('asset', safe('asset', async ({ payload }) => {
  const snap = await snapshot();
  const id = String(payload.assetId ?? '');
  const score = snap.byId.get(id);
  if (!score) return { error: `Unknown asset id ${id}.` };
  const tasks = await existingGapTasks().catch(() => ({} as Record<string, string>));
  return assetView(snap.index, score, snap.byId, snap.site, snap.confirmations, tasks[id] ?? null);
}));

resolver.define('closing', safe('closing', async ({ payload }) => {
  const snap = await snapshot();
  const report = gapReport(snap.index, snap.scores, String(payload.plant ?? 'all'), Number(payload.n ?? 10));
  if ('error' in report) return report;
  const tasks = await existingGapTasks().catch(() => ({} as Record<string, string>));
  const url = (k: string) => (snap.site.baseUrl ? `${snap.site.baseUrl}/browse/${k}` : null);
  return {
    ...report,
    items: report.items.map((i) => ({
      ...i,
      lights: lights(i, snap.index.data.scoring),
      task: tasks[i.assetId] ? { key: tasks[i.assetId], url: url(tasks[i.assetId]) } : null,
    })),
  };
}));

resolver.define('people', safe('people', async () => {
  const snap = await snapshot();
  return peopleView(snap.index, snap.scores, snap.site);
}));

resolver.define('createTasks', safe('createTasks', async ({ payload, context }) =>
  createGapTasks(await snapshot(), payload.assetIds, context.accountId)));

resolver.define('confirm', safe('confirm', async ({ payload, context }) => {
  if (!context.accountId) return { error: 'Sign in to confirm a machine.' };
  const snap = await snapshot();
  const id = String(payload.assetId ?? '');
  if (!snap.index.asset(id)) return { error: `Unknown asset id ${id}.` };
  await kvs.set(CONFIRM_PREFIX + id, { accountId: context.accountId, at: new Date().toISOString() });
  await syncOne(id).catch((e) => console.error('syncOne', e));
  return { ok: true, assetId: id };
}));

export const handler = resolver.getDefinitions();
