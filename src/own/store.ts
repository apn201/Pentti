// Own data in Forge storage, under own: keys only. Nothing here ever touches a seed: key, and the seeder
// and its Reset never read an own: key, so Reset can not reach a real page or ticket. The mode key is
// missing by default, which means bundled data. It can only say own when an import has finished.
import { kvs, WhereConditions } from '@forge/kvs';
import type { OwnAsset } from './csv';
import type { OwnDocs } from './dataset';

const MODE_KEY = 'data:mode';
const META_KEY = 'own:meta';
const ASSETS_PREFIX = 'own:assets:';
const DOCS_PREFIX = 'own:docs:';
export const OWN_PREFIX = 'own:';
export const OWN_CONFIRM_PREFIX = 'own:confirm:';

export interface OwnMeta {
  importId: string;
  state: 'importing' | 'ready';
  startedAt: string;
  finishedAt: string | null;
  assets: number;
  spaceKey: string | null;
  spaceId: string | null;
  projectKey: string | null;
  pagesRead: number;
  issuesRead: number;
  pagesCapped: boolean;
  issuesCapped: boolean;
  matched: number;
  pagesDone: boolean;
  issuesDone: boolean;
  pageCursor: string | null;
  issueToken: string | null;
  docChunks: number;
}

export const readMeta = () => kvs.get<OwnMeta>(META_KEY);
export const writeMeta = (m: OwnMeta) => kvs.set(META_KEY, m);

export async function ownModeOn(): Promise<boolean> {
  return (await kvs.get<string>(MODE_KEY)) === 'own';
}

export async function useOwn(): Promise<void> {
  const m = await readMeta();
  if (m?.state !== 'ready') throw new Error('Nothing imported yet.');
  await kvs.set(MODE_KEY, 'own');
}

/** Back to bundled data. Deleting the key is the state a fresh install has. */
export const useBundled = () => kvs.delete(MODE_KEY);

/** Removes every own: key. Writes nothing to Jira or Confluence. */
export async function clearOwn(): Promise<void> {
  await useBundled();
  for (;;) {
    const page = await kvs.query().where('key', WhereConditions.beginsWith(OWN_PREFIX)).limit(100).getMany();
    if (!page.results.length) return;
    await Promise.all(page.results.map((r) => kvs.delete(r.key)));
  }
}

const seq = (n: number) => String(n).padStart(4, '0');

export const writeAssetChunk = (n: number, assets: OwnAsset[]) => kvs.set(ASSETS_PREFIX + seq(n), assets);
export const writeDocChunk = (n: number, docs: OwnDocs) => kvs.set(DOCS_PREFIX + seq(n), docs);

async function readAll<T>(prefix: string): Promise<T[]> {
  const out: { key: string; value: T }[] = [];
  let cursor: string | undefined;
  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(100);
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany<T>();
    out.push(...page.results);
    cursor = page.nextCursor;
  } while (cursor);
  return out.sort((a, b) => a.key.localeCompare(b.key)).map((r) => r.value);
}

export const readAssetChunks = () => readAll<OwnAsset[]>(ASSETS_PREFIX);
export const readDocChunks = () => readAll<OwnDocs>(DOCS_PREFIX);
