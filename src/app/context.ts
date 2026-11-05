// What every action and UI resolver needs: the index over the bundled dataset (built once per
// container, the links never change), the scores for today, and a few facts from storage.
import api, { getAppContext, route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';
import { computeLinks } from '../match/link';
import { Index } from '../store/index';
import { bundledDataset } from '../store/dataset';
import { scoreAll, type AssetScore } from '../score';
import { CONFIRM_PREFIX, INSTALLED_AT_KEY, isJiraAdmin, readSeeded } from '../seed/seed';
import type { Site } from '../actions/core';
import type { Confirmation } from '../types';
import type { SeededMap } from '../seed/plan';
import { buildOwn } from '../own/dataset';
import { OWN_CONFIRM_PREFIX, ownModeOn, readAssetChunks, readDocChunks, readMeta } from '../own/store';

const DAY = 24 * 60 * 60 * 1000;

let index: Index | null = null;
let baseUrl: string | null | undefined;

export function appIndex(): Index {
  if (!index) {
    const data = bundledDataset();
    index = new Index(data, computeLinks(data));
  }
  return index;
}

/** The Pentti page: <baseUrl>/jira/apps/<appId>/<envId>. Ids come from the runtime, never from input. */
export function appPageUrl(base: string | null, appId: string | undefined, envId: string | undefined): string | null {
  return base && appId && envId ? `${base}/jira/apps/${appId}/${envId}` : null;
}

function currentAppUrl(base: string | null): string | null {
  try {
    const c = getAppContext();
    return appPageUrl(base, c.appAri.appId, c.environmentAri.environmentId);
  } catch {
    return null;
  }
}

export function daysSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : 0;
}

async function siteBaseUrl(): Promise<string | null> {
  if (baseUrl !== undefined) return baseUrl;
  try {
    const res = await api.asApp().requestJira(route`/rest/api/3/serverInfo`, { headers: { Accept: 'application/json' } });
    baseUrl = res.ok ? ((await res.json()) as { baseUrl?: string }).baseUrl ?? null : null;
  } catch {
    baseUrl = null;
  }
  return baseUrl;
}

/** "I checked this" clicks, stored as confirm:<assetId> -> { accountId, at }. Written by the UI in S6. */
export async function readConfirmations(now = Date.now(), prefix = CONFIRM_PREFIX): Promise<Confirmation[]> {
  const out: Confirmation[] = [];
  let cursor: string | undefined;
  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(100);
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany<{ accountId: string; at: string }>();
    for (const r of page.results) {
      out.push({ assetId: r.key.slice(prefix.length), accountId: r.value.accountId, daysAgo: daysSince(r.value.at, now) });
    }
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

export interface Snapshot {
  index: Index;
  site: Site;
  scores: AssetScore[];
  byId: Map<string, AssetScore>;
  confirmations: Confirmation[];
}

/** Index, site facts and every score, computed on read (section 8). Never stored. */
export async function snapshot(): Promise<Snapshot> {
  if (await ownModeOn()) return ownSnapshot();
  const ix = appIndex();
  const [installedAt, seeded, url, confirmations] = await Promise.all([
    kvs.get<string>(INSTALLED_AT_KEY),
    readSeeded(),
    siteBaseUrl(),
    readConfirmations(),
  ]);
  const elapsedDays = daysSince(installedAt);
  const scores = scoreAll(ix, confirmations, elapsedDays);
  return { index: ix, site: { baseUrl: url, appUrl: currentAppUrl(url), seeded, elapsedDays }, scores, byId: new Map(scores.map((s) => [s.assetId, s])), confirmations };
}

// ---------- own data ----------

let ownCache: { importId: string; index: Index; seeded: SeededMap } | null = null;

async function ownSnapshot(): Promise<Snapshot> {
  const meta = await readMeta();
  if (meta?.state !== 'ready' || !meta.finishedAt) throw new Error('Your data can not be read. An admin can go back to the bundled data on the Pentti admin page.');
  if (ownCache?.importId !== meta.importId) {
    const [assets, docs] = await Promise.all([readAssetChunks(), readDocChunks()]);
    const built = buildOwn(assets, docs, bundledDataset().scoring);
    ownCache = { importId: meta.importId, index: new Index(built.data, built.links), seeded: built.seeded };
  }
  const { index: ix, seeded } = ownCache;
  const [url, confirmations] = await Promise.all([siteBaseUrl(), readConfirmations(Date.now(), OWN_CONFIRM_PREFIX)]);
  const elapsedDays = daysSince(meta.finishedAt);
  const scores = scoreAll(ix, confirmations, elapsedDays, true);
  return {
    index: ix,
    site: {
      baseUrl: url,
      appUrl: currentAppUrl(url),
      seeded,
      elapsedDays,
      own: {
        importedOn: meta.finishedAt.slice(0, 10),
        spaceKey: meta.spaceKey,
        projectKey: meta.projectKey,
        pagesCapped: meta.pagesCapped,
        issuesCapped: meta.issuesCapped,
      },
    },
    scores,
    byId: new Map(scores.map((s) => [s.assetId, s])),
    confirmations,
  };
}

/**
 * Titles of real pages and tickets were read with one admin's permissions, so others may not be allowed
 * to see them. While a site runs on own data only Jira admins get answers. Fails closed.
 */
export async function ownDenied(snap: Snapshot, accountId: string | undefined): Promise<{ error: string } | null> {
  if (!snap.site.own) return null;
  const ok = await isJiraAdmin(accountId).catch(() => false);
  return ok ? null : { error: 'This site runs Pentti on its own data. In this proof of concept only Jira admins can see it.' };
}
