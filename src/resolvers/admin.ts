// Resolvers for the admin page "Load the factory" (FACTORY_BUILD.md section 10).
// The page drives the seeder one step at a time. Every call checks that the caller is a Jira admin,
// by context.accountId, never by anything in the payload.
import Resolver from '@forge/resolver';
import { bundledDataset } from '../store/dataset';
import { isJiraAdmin, listTargets, loadStep, readConfig, resetStep, status } from '../seed/seed';
import { connectionId, LAST_SYNC_KEY, syncAll } from '../connector/graph';
import { kvs } from '@forge/kvs';
import { MAX_ROWS, rowToAsset, type OwnAsset, type Row } from '../own/csv';
import { checkProject, MAX_ISSUES, MAX_PAGES, readStep, spaceIdOf } from '../own/read';
import { clearOwn, ownModeOn, readMeta, useBundled, useOwn, writeAssetChunk, writeMeta, type OwnMeta } from '../own/store';

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

// ---------- own data, proof of concept ----------
// Reads from Jira and Confluence as the admin, GET only. Everything it keeps stays in own: keys. The site
// stays on the bundled data until the admin chooses own data after a finished import.

const ASSET_BATCH = 50;   // worst case about 2.5 KB a row, well under the 240 KiB a value can hold

function ownStatus(meta: OwnMeta | undefined | null, on: boolean) {
  return {
    mode: on ? 'own' : 'bundled',
    imported: meta?.state === 'ready'
      ? { on: meta.finishedAt?.slice(0, 10) ?? '', assets: meta.assets, spaceKey: meta.spaceKey, projectKey: meta.projectKey, pagesRead: meta.pagesRead, issuesRead: meta.issuesRead, pagesCapped: meta.pagesCapped, issuesCapped: meta.issuesCapped, matched: meta.matched }
      : null,
    limits: { rows: MAX_ROWS, pages: MAX_PAGES, issues: MAX_ISSUES, batch: ASSET_BATCH },
  };
}

resolver.define('ownStatus', admin(async () => {
  const [meta, on] = await Promise.all([readMeta(), ownModeOn()]);
  return ownStatus(meta, on);
}));

resolver.define('ownBegin', admin(async ({ payload }) => {
  if (payload.accepted !== true) return { error: 'Tick the box first.' };
  const projectKey = String(payload.projectKey ?? '');
  const spaceKey = String(payload.spaceKey ?? '');
  if (projectKey && !KEY.test(projectKey)) return { error: 'That is not a Jira project key.' };
  if (spaceKey && !SPACE.test(spaceKey)) return { error: 'That is not a Confluence space key.' };
  // The demo content must not be read as if it were real.
  const demo = await readConfig();
  if (demo && (projectKey === demo.projectKey || spaceKey === demo.spaceKey)) {
    return { error: 'That project or space holds the fictional factory. Pick another one.' };
  }
  if (projectKey) await checkProject(projectKey);
  const spaceId = spaceKey ? await spaceIdOf(spaceKey) : null;
  // Back to bundled data first. A failed import can never leave a site on half an import.
  await clearOwn();
  await writeMeta({
    importId: `${Date.now()}`,
    state: 'importing',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    assets: 0,
    spaceKey: spaceKey || null,
    spaceId,
    projectKey: projectKey || null,
    pagesRead: 0,
    issuesRead: 0,
    pagesCapped: false,
    issuesCapped: false,
    matched: 0,
    pagesDone: !spaceKey,
    issuesDone: !projectKey,
    pageCursor: null,
    issueToken: null,
    docChunks: 0,
  });
  return { ok: true };
}));

resolver.define('ownAssets', admin(async ({ payload }) => {
  const meta = await readMeta();
  if (meta?.state !== 'importing') return { error: 'No import is running.' };
  const rows = Array.isArray(payload.rows) ? (payload.rows as Row[]) : [];
  const batch = Number(payload.batch);
  if (!Number.isInteger(batch) || batch < 0 || batch > MAX_ROWS || rows.length > ASSET_BATCH) return { error: 'Bad batch.' };
  // The browser already checked these. The server checks again and keeps only what it built itself.
  const assets = rows.map(rowToAsset).filter((a): a is OwnAsset => typeof a !== 'string');
  if (meta.assets + assets.length > MAX_ROWS) return { error: `At most ${MAX_ROWS} assets.` };
  await writeAssetChunk(batch, assets);
  meta.assets += assets.length;
  await writeMeta(meta);
  return { stored: assets.length, refused: rows.length - assets.length };
}));

resolver.define('ownRead', admin(async () => readStep()));

resolver.define('ownFinish', admin(async () => {
  const meta = await readMeta();
  if (meta?.state !== 'importing') return { error: 'No import is running.' };
  if (!meta.pagesDone || !meta.issuesDone) return { error: 'Reading has not finished.' };
  if (!meta.assets) return { error: 'No assets were imported.' };
  await writeMeta({ ...meta, state: 'ready', finishedAt: new Date().toISOString() });
  return ownStatus(await readMeta(), await ownModeOn());
}));

resolver.define('ownUse', admin(async ({ payload }) => {
  if (payload.mode === 'own') await useOwn();
  else await useBundled();
  return ownStatus(await readMeta(), await ownModeOn());
}));

resolver.define('ownDelete', admin(async () => {
  await clearOwn();
  return ownStatus(null, false);
}));

export const handler = resolver.getDefinitions();
