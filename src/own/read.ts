// Reads one Jira project and one Confluence space, a batch per call, as the admin who runs the import.
// GET only: the helpers below take no method, so this module can not write. The admin's own permissions
// decide what is read. Page and ticket text is matched here and dropped, only titles and links are kept.
import api, { route } from '@forge/api';
import type { Asset } from '../types';
import { OwnMatcher } from './match';
import { adfToText, storageToText } from './text';
import { daysAgo, issueId, pageId, splitDocs, type OwnDocs, type OwnIssue, type OwnPage } from './dataset';
import { bundledDataset } from '../store/dataset';
import { readAssetChunks, readMeta, writeDocChunk, writeMeta, type OwnMeta } from './store';

export const MAX_PAGES = 200;
export const MAX_ISSUES = 500;
const PAGE_BATCH = 25;
const ISSUE_BATCH = 50;
const MAX_TEXT = 200_000;
const MAX_TITLE = 250;
const UNKNOWN_AGE = 36_500;   // no date means never fresh
const MIN_COUNTED = bundledDataset().scoring.match_min_confidence;

type R = ReturnType<typeof route>;

async function getJira<T>(r: R): Promise<T> {
  const res = await api.asUser().requestJira(r, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

async function getConfluence<T>(r: R): Promise<T> {
  const res = await api.asUser().requestConfluence(r, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Confluence ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

/** The space id, read as the admin. Fails when the admin can not see the space. */
export async function spaceIdOf(spaceKey: string): Promise<string> {
  const found = await getConfluence<{ results: { id: string }[] }>(route`/wiki/api/v2/spaces?keys=${spaceKey}`);
  if (!found.results[0]) throw new Error(`You can not see a space ${spaceKey}.`);
  return String(found.results[0].id);
}

export async function checkProject(projectKey: string): Promise<void> {
  await getJira(route`/rest/api/3/project/${projectKey}`);
}

interface PageRow { id: string; title: string; version?: { createdAt?: string }; createdAt?: string; body?: { storage?: { value?: string } } }

async function readPages(meta: OwnMeta, matcher: OwnMatcher, now: number): Promise<OwnDocs> {
  const left = MAX_PAGES - meta.pagesRead;
  const limit = String(Math.min(PAGE_BATCH, left));
  const res = await getConfluence<{ results: PageRow[]; _links?: { next?: string } }>(
    meta.pageCursor
      ? route`/wiki/api/v2/spaces/${meta.spaceId!}/pages?body-format=storage&limit=${limit}&cursor=${meta.pageCursor}`
      : route`/wiki/api/v2/spaces/${meta.spaceId!}/pages?body-format=storage&limit=${limit}`,
  );
  const pages: OwnPage[] = [];
  const links: OwnDocs['links'] = [];
  for (const p of res.results) {
    const id = pageId(String(p.id));
    const title = String(p.title ?? '').slice(0, MAX_TITLE);
    pages.push({ id, remoteId: String(p.id), title, lastEditedDaysAgo: daysAgo(p.version?.createdAt ?? p.createdAt, now, UNKNOWN_AGE) });
    links.push(...matcher.match({ id, kind: 'page', text: `${title}\n${storageToText(p.body?.storage?.value ?? '').slice(0, MAX_TEXT)}` }));
  }
  meta.pagesRead += pages.length;
  const next = res._links?.next ? new URLSearchParams(res._links.next.split('?')[1] ?? '').get('cursor') : null;
  meta.pageCursor = next;
  if (!next) meta.pagesDone = true;
  else if (meta.pagesRead >= MAX_PAGES) { meta.pagesDone = true; meta.pagesCapped = true; }
  return { pages, issues: [], links };
}

interface IssueRow {
  id: string;
  key: string;
  fields: {
    summary?: string;
    description?: unknown;
    status?: { name?: string };
    created?: string;
    resolutiondate?: string | null;
    comment?: { comments?: { body?: unknown }[] };
  };
}

async function readIssues(meta: OwnMeta, matcher: OwnMatcher, now: number): Promise<OwnDocs> {
  const left = MAX_ISSUES - meta.issuesRead;
  const limit = String(Math.min(ISSUE_BATCH, left));
  const jql = `project = "${meta.projectKey}" ORDER BY updated DESC`;
  const fields = 'summary,description,status,created,resolutiondate,comment';
  const res = await getJira<{ issues: IssueRow[]; nextPageToken?: string }>(
    meta.issueToken
      ? route`/rest/api/3/search/jql?jql=${jql}&fields=${fields}&maxResults=${limit}&nextPageToken=${meta.issueToken}`
      : route`/rest/api/3/search/jql?jql=${jql}&fields=${fields}&maxResults=${limit}`,
  );
  const issues: OwnIssue[] = [];
  const links: OwnDocs['links'] = [];
  for (const i of res.issues) {
    const id = issueId(String(i.id));
    const summary = String(i.fields.summary ?? '').slice(0, MAX_TITLE);
    issues.push({
      id,
      remoteId: String(i.id),
      key: i.key,
      summary,
      status: String(i.fields.status?.name ?? 'not known').slice(0, 60),
      createdDaysAgo: daysAgo(i.fields.created, now, UNKNOWN_AGE),
      resolvedDaysAgo: i.fields.resolutiondate ? daysAgo(i.fields.resolutiondate, now, UNKNOWN_AGE) : null,
    });
    const comments = (i.fields.comment?.comments ?? []).map((c) => adfToText(c.body)).join('\n');
    links.push(...matcher.match({ id, kind: 'issue', text: `${i.key} ${summary}\n${adfToText(i.fields.description)}\n${comments}`.slice(0, MAX_TEXT) }));
  }
  meta.issuesRead += issues.length;
  meta.issueToken = res.nextPageToken ?? null;
  if (!res.nextPageToken) meta.issuesDone = true;
  else if (meta.issuesRead >= MAX_ISSUES) { meta.issuesDone = true; meta.issuesCapped = true; }
  return { pages: [], issues, links };
}

/** One batch of pages, or of issues once the pages are done. */
export async function readStep(now = Date.now()) {
  const meta = await readMeta();
  if (!meta || meta.state !== 'importing') throw new Error('No import is running.');
  const assets: Asset[] = (await readAssetChunks()).flat();
  const matcher = new OwnMatcher(assets);
  if (!meta.pagesDone || !meta.issuesDone) {
    const docs = !meta.pagesDone ? await readPages(meta, matcher, now) : await readIssues(meta, matcher, now);
    meta.matched += docs.links.filter((l) => l.confidence >= MIN_COUNTED).length;
    for (const chunk of splitDocs(docs)) {
      await writeDocChunk(meta.docChunks, chunk);
      meta.docChunks += 1;
    }
    await writeMeta(meta);
  }
  return { done: meta.pagesDone && meta.issuesDone, pagesRead: meta.pagesRead, issuesRead: meta.issuesRead };
}
