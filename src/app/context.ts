// What every action and UI resolver needs: the index over the bundled dataset (built once per
// container, the links never change), the scores for today, and a few facts from storage.
import api, { getAppContext, route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';
import { computeLinks } from '../match/link';
import { Index } from '../store/index';
import { bundledDataset } from '../store/dataset';
import { scoreAll, type AssetScore } from '../score';
import { CONFIRM_PREFIX, INSTALLED_AT_KEY, readSeeded } from '../seed/seed';
import type { Site } from '../actions/core';
import type { Confirmation } from '../types';

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
export async function readConfirmations(now = Date.now()): Promise<Confirmation[]> {
  const out: Confirmation[] = [];
  let cursor: string | undefined;
  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith(CONFIRM_PREFIX)).limit(100);
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany<{ accountId: string; at: string }>();
    for (const r of page.results) {
      out.push({ assetId: r.key.slice(CONFIRM_PREFIX.length), accountId: r.value.accountId, daysAgo: daysSince(r.value.at, now) });
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
