// Resolvers for the admin page "Load the factory" (FACTORY_BUILD.md section 10).
// The page drives the seeder one step at a time. Every call checks that the caller is a Jira admin,
// by context.accountId, never by anything in the payload.
import Resolver from '@forge/resolver';
import { bundledDataset } from '../store/dataset';
import { isJiraAdmin, listTargets, loadStep, resetStep, status } from '../seed/seed';
import { connectionId, LAST_SYNC_KEY, syncAll } from '../connector/graph';
import { kvs } from '@forge/kvs';

const data = bundledDataset();
const resolver = new Resolver();

type Req = { payload: Record<string, unknown>; context: { accountId?: string } };

const KEY = /^[A-Z][A-Z0-9_]{0,49}$/;
const SPACE = /^~?[A-Za-z0-9_]{1,255}$/;

function admin<T>(fn: (req: Req) => Promise<T>) {
  return async (req: Req) => {
    if (!(await isJiraAdmin(req.context.accountId))) return { error: 'Only Jira admins can load or reset the factory.' };
    try {
      return await fn(req);
    } catch (e) {
      console.error(e);
      return { error: String(e instanceof Error ? e.message : e).slice(0, 300) };
    }
  };
}

resolver.define('status', admin(async () => status(data)));

resolver.define('targets', admin(async () => listTargets()));

resolver.define('loadStep', admin(async ({ payload }) => {
  const projectKey = String(payload.projectKey ?? '');
  const spaceKey = String(payload.spaceKey ?? '');
  if (!KEY.test(projectKey) || !SPACE.test(spaceKey)) return { error: 'Pick a Jira project and a Confluence space.' };
  const r = await loadStep(data, { projectKey, spaceKey, first: payload.first === true });
  console.log('loadStep', r.ms, 'ms', r.created.length, 'created', r.errors.length, 'errors');
  // Cards carry the new Jira keys as associations, so they follow the load.
  if (r.done && r.created.length > 0) return { ...r, graph: await syncAll().catch((e) => ({ error: String(e) })) };
  return r;
}));

resolver.define('resetStep', admin(async ({ payload }) => {
  const r = await resetStep(data, { first: payload.first === true });
  console.log('resetStep', r.ms, 'ms', r.deleted.length, 'deleted', r.errors.length, 'errors');
  if (r.done && r.deleted.length > 0) return { ...r, graph: await syncAll().catch((e) => ({ error: String(e) })) };
  return r;
}));

resolver.define('graphStatus', admin(async () => ({
  connected: !!(await connectionId()),
  lastSync: (await kvs.get(LAST_SYNC_KEY)) ?? null,
})));

resolver.define('graphSync', admin(async () => syncAll()));

export const handler = resolver.getDefinitions();
