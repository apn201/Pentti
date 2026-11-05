// Resolvers for the Pentti page (FACTORY_BUILD.md section 10). Reads compute on request.
// The two writes, "Create tasks" and "I checked this", key off context.accountId and check every id.
import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
import { ownDenied, snapshot, type Snapshot } from '../app/context';
import { CONFIRM_PREFIX } from '../seed/seed';
import { OWN_CONFIRM_PREFIX } from '../own/store';
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

/** A resolver that needs the data: the access check for own data comes first. */
function withData<T>(name: string, fn: (snap: Snapshot, req: Req) => Promise<T> | T) {
  return safe(name, async (req) => {
    const snap = await snapshot();
    const denied = await ownDenied(snap, req.context.accountId);
    if (denied) return denied;
    return fn(snap, req);
  });
}

// Gap tasks do not exist on own data, it is read only.
const gapTasks = (snap: Snapshot) => (snap.site.own ? Promise.resolve({} as Record<string, string>) : existingGapTasks().catch(() => ({} as Record<string, string>)));

resolver.define('overview', withData('overview', (snap) => {
  const o = overview(snap.index, snap.scores);
  return snap.site.own ? { ...o, own: snap.site.own } : o;
}));

resolver.define('find', withData('find', (snap, { payload }) => findAsset(snap.index, String(payload.query ?? ''), snap.site)));

resolver.define('asset', withData('asset', async (snap, { payload }) => {
  const id = String(payload.assetId ?? '');
  const score = snap.byId.get(id);
  if (!score) return { error: `Unknown asset id ${id}.` };
  const tasks = await gapTasks(snap);
  return assetView(snap.index, score, snap.byId, snap.site, snap.confirmations, tasks[id] ?? null);
}));

resolver.define('closing', withData('closing', async (snap, { payload }) => {
  const report = gapReport(snap.index, snap.scores, String(payload.plant ?? 'all'), Number(payload.n ?? 10));
  if ('error' in report) return report;
  const tasks = await gapTasks(snap);
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

resolver.define('people', withData('people', (snap) => peopleView(snap.index, snap.scores, snap.site)));

resolver.define('createTasks', safe('createTasks', async ({ payload, context }) =>
  createGapTasks(await snapshot(), payload.assetIds, context.accountId)));

resolver.define('confirm', withData('confirm', async (snap, { payload, context }) => {
  if (!context.accountId) return { error: 'Sign in to confirm a machine.' };
  const id = String(payload.assetId ?? '');
  if (!snap.index.asset(id)) return { error: `Unknown asset id ${id}.` };
  const prefix = snap.site.own ? OWN_CONFIRM_PREFIX : CONFIRM_PREFIX;
  await kvs.set(prefix + id, { accountId: context.accountId, at: new Date().toISOString() });
  await syncOne(id).catch((e) => console.error('syncOne', e));
  return { ok: true, assetId: id };
}));

export const handler = resolver.getDefinitions();
