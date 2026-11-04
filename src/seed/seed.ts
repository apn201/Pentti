// Seeder (FACTORY_BUILD.md section 11). Creates the Confluence pages and Jira issues from the bundled
// dataset, a few per call, so the admin page can drive it in steps under the function time limit.
// Idempotent: every object carries the labels pentti-demo and pentti-demo:<id>, the app keeps a map
// unit id -> remote id in KVS, and the first step of a load or reset rebuilds the map from a label search.
import api, { route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';
import type { Dataset, Person } from '../types';
import {
  DEMO_LABEL, idFromLabels, idLabel, issueDescription, issueLabels, pageBody, pickIssueType,
  rootBody, rootTitle, sectionBody, sectionTitle,
} from './format';
import { nextToCreate, nextToDelete, progress, ROOT_ID, units, type Progress, type Seeded, type SeededMap, type Unit } from './plan';

export const STEP_SIZE = 10;
const OBJ_PREFIX = 'seed:obj:';
const CONFIG_KEY = 'seed:config';
export const INSTALLED_AT_KEY = 'meta:installedAt';

export interface SeedConfig {
  projectId: string;
  projectKey: string;
  spaceId: string;
  spaceKey: string;
  issueTypes: { id: string; name: string; subtask?: boolean }[];
}

export interface StepResult {
  progress: Progress;
  done: boolean;
  created: string[];
  deleted: string[];
  errors: { id: string; message: string }[];
  ms: number;
}

// ---------- KVS ----------

export async function readSeeded(): Promise<SeededMap> {
  const map: SeededMap = {};
  let cursor: string | undefined;
  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith(OBJ_PREFIX)).limit(100);
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany<Seeded>();
    for (const r of page.results) map[r.key.slice(OBJ_PREFIX.length)] = r.value;
    cursor = page.nextCursor;
  } while (cursor);
  return map;
}

const remember = (id: string, s: Seeded) => kvs.set(OBJ_PREFIX + id, s);
const forget = (id: string) => kvs.delete(OBJ_PREFIX + id);

export const readConfig = () => kvs.get<SeedConfig>(CONFIG_KEY);

// ---------- REST helpers ----------

async function jira<T>(r: ReturnType<typeof route>, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await api.asApp().requestJira(r, {
    method: init?.method ?? 'GET',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

async function conf<T>(r: ReturnType<typeof route>, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await api.asApp().requestConfluence(r, {
    method: init?.method ?? 'GET',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new Error(`Confluence ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

// ---------- targets and admin check ----------

/**
 * True when the calling user holds the Jira ADMINISTER global permission. Asked as the user, because
 * the app itself may not run the bulk permission check (limits.md, seeder notes).
 */
export async function isJiraAdmin(accountId: string | undefined): Promise<boolean> {
  if (!accountId) return false;
  const res = await api.asUser().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { permissions?: { ADMINISTER?: { havePermission?: boolean } } };
  return body.permissions?.ADMINISTER?.havePermission === true;
}

export async function listTargets() {
  const projects = await jira<{ values: { id: string; key: string; name: string; projectTypeKey: string }[] }>(
    route`/rest/api/3/project/search?maxResults=100&orderBy=name`,
  );
  // Confluence v2. The v1 content and space endpoints answer 410 to apps (limits.md, seeder notes).
  const spaces = await conf<{ results: { id: string; key: string; name: string; type: string }[] }>(
    route`/wiki/api/v2/spaces?limit=250&type=global`,
  );
  return {
    projects: projects.values.map((p) => ({ id: p.id, key: p.key, name: p.name, type: p.projectTypeKey })),
    spaces: spaces.results.map((s) => ({ id: String(s.id), key: s.key, name: s.name })).sort((x, y) => x.name.localeCompare(y.name)),
  };
}

async function makeConfig(projectKey: string, spaceKey: string): Promise<SeedConfig> {
  const project = await jira<{ id: string; key: string }>(route`/rest/api/3/project/${projectKey}`);
  const types = await jira<{ issueTypes?: SeedConfig['issueTypes']; values?: SeedConfig['issueTypes'] }>(
    route`/rest/api/3/issue/createmeta/${project.key}/issuetypes?maxResults=50`,
  );
  const found = await conf<{ results: { id: string; key: string }[] }>(route`/wiki/api/v2/spaces?keys=${spaceKey}`);
  const space = found.results[0];
  if (!space) throw new Error(`space ${spaceKey} not found`);
  return {
    projectId: project.id,
    projectKey: project.key,
    spaceId: String(space.id),
    spaceKey: space.key,
    issueTypes: (types.issueTypes ?? types.values ?? []).map((t) => ({ id: t.id, name: t.name, subtask: t.subtask })),
  };
}

// ---------- reconcile: rebuild the map from labels ----------

/** Finds seeded objects by label and adds the ones the map does not know. Returns how many were added. */
export async function reconcile(map: SeededMap, cfg: SeedConfig | undefined): Promise<number> {
  let added = 0;
  let token: string | undefined;
  do {
    const jql = `labels = "${DEMO_LABEL}" order by created ASC`;
    const res: { issues: { id: string; key: string; fields: { labels: string[] } }[]; nextPageToken?: string } = await jira(
      token
        ? route`/rest/api/3/search/jql?jql=${jql}&fields=labels&maxResults=100&nextPageToken=${token}`
        : route`/rest/api/3/search/jql?jql=${jql}&fields=labels&maxResults=100`,
    );
    for (const i of res.issues) {
      // Gap tasks from create-gap-tasks carry pentti-demo too, so Reset removes them as extra leaves.
      const gap = i.fields.labels.find((l) => l.startsWith('pentti-gap-'));
      const id = idFromLabels(i.fields.labels) ?? (gap ? `gap_${gap.slice('pentti-gap-'.length)}` : null);
      if (id && !map[id]) {
        map[id] = { kind: 'issue', remoteId: i.id, key: i.key };
        await remember(id, map[id]);
        added++;
      }
    }
    token = res.nextPageToken;
  } while (token);

  if (cfg) {
    let start = 0;
    for (;;) {
      const cql = `space = "${cfg.spaceKey}" and label = "${DEMO_LABEL}" and type = page`;
      const res: { results: { content?: { id: string; title: string } }[]; size: number } = await conf(
        route`/wiki/rest/api/search?cql=${cql}&limit=100&start=${String(start)}`,
      );
      const known = new Set(Object.values(map).map((m) => m.remoteId));
      const pages = res.results.map((r) => r.content).filter((c): c is { id: string; title: string } => !!c && !known.has(c.id));
      const labelled = await Promise.all(pages.map(async (p) => {
        const l = await conf<{ results: { name: string }[] }>(route`/wiki/api/v2/pages/${p.id}/labels?limit=50`);
        return { p, id: idFromLabels(l.results.map((x) => x.name)) };
      }));
      for (const { p, id } of labelled) {
        if (id && !map[id]) {
          map[id] = { kind: id === ROOT_ID ? 'root' : id.startsWith('sec_') ? 'section' : 'page', remoteId: p.id, title: p.title };
          await remember(id, map[id]);
          added++;
        }
      }
      if (res.size < 100) break;
      start += 100;
    }
  }
  return added;
}

// ---------- create and delete one unit ----------

const ATTEMPT_SUFFIXES = ['', ' (Pentti demo)'];

async function createPage(cfg: SeedConfig, title: string, body: string, parentId: string | null, id: string): Promise<Seeded> {
  let lastErr: unknown;
  for (const suffix of ATTEMPT_SUFFIXES) {
    try {
      const res = await conf<{ id: string; title: string }>(route`/wiki/api/v2/pages`, {
        method: 'POST',
        body: {
          spaceId: cfg.spaceId,
          status: 'current',
          title: title + suffix,
          ...(parentId ? { parentId } : {}),
          body: { representation: 'storage', value: body },
        },
      });
      // v2 cannot label on create. If labelling fails the page goes again, an unlabelled page is an
      // orphan that neither reconcile nor Reset can find.
      try {
        await conf(route`/wiki/rest/api/content/${res.id}/label`, {
          method: 'POST',
          body: [{ prefix: 'global', name: DEMO_LABEL }, { prefix: 'global', name: idLabel(id) }],
        });
      } catch (e) {
        await conf(route`/wiki/api/v2/pages/${res.id}`, { method: 'DELETE' }).catch(() => undefined);
        throw e;
      }
      return { kind: 'page', remoteId: res.id, title: res.title };
    } catch (e) {
      lastErr = e;
      if (!/title already exists/i.test(String(e))) throw e;
    }
  }
  throw lastErr;
}

async function createIssue(cfg: SeedConfig, data: Dataset, people: Map<string, Person>, id: string): Promise<Seeded> {
  const issue = data.issues.find((i) => i.id === id)!;
  const typeId = pickIssueType(issue.type, cfg.issueTypes);
  if (!typeId) throw new Error(`project ${cfg.projectKey} has no usable issue type`);
  const created = await jira<{ id: string; key: string }>(route`/rest/api/3/issue`, {
    method: 'POST',
    body: {
      fields: {
        project: { id: cfg.projectId },
        issuetype: { id: typeId },
        summary: issue.summary.slice(0, 250),
        description: issueDescription(issue, people),
        labels: issueLabels(issue),
      },
    },
  });
  if (issue.status === 'Done') {
    const t = await jira<{ transitions: { id: string; to: { statusCategory: { key: string } } }[] }>(
      route`/rest/api/3/issue/${created.id}/transitions`,
    );
    const done = t.transitions.find((x) => x.to.statusCategory.key === 'done');
    if (done) await jira(route`/rest/api/3/issue/${created.id}/transitions`, { method: 'POST', body: { transition: { id: done.id } } });
  }
  return { kind: 'issue', remoteId: created.id, key: created.key };
}

async function createUnit(u: Unit, cfg: SeedConfig, data: Dataset, people: Map<string, Person>, map: SeededMap): Promise<Seeded> {
  const parentId = u.parent ? map[u.parent].remoteId : null;
  if (u.kind === 'root') return { ...(await createPage(cfg, rootTitle(), rootBody(), null, u.id)), kind: 'root' };
  if (u.kind === 'section') {
    const space = data.pages.find((p) => `sec_${p.space.toLowerCase()}` === u.id)!.space;
    return { ...(await createPage(cfg, sectionTitle(space), sectionBody(space), parentId, u.id)), kind: 'section' };
  }
  if (u.kind === 'page') {
    const page = data.pages.find((p) => p.id === u.id)!;
    return createPage(cfg, page.title, pageBody(page, people), parentId, u.id);
  }
  return createIssue(cfg, data, people, u.id);
}

async function deleteUnit(s: Seeded): Promise<void> {
  try {
    if (s.kind === 'issue') await jira(route`/rest/api/3/issue/${s.remoteId}`, { method: 'DELETE' });
    else await conf(route`/wiki/api/v2/pages/${s.remoteId}`, { method: 'DELETE' });
  } catch (e) {
    // Already gone counts as deleted.
    if (!/ 404:/.test(String(e))) throw e;
  }
}

// ---------- steps ----------

async function runAll<T>(items: T[], fn: (t: T) => Promise<void>): Promise<void> {
  await Promise.all(items.map(fn));
}

/** One load step. first=true stores the config and reconciles the map from labels. */
export async function loadStep(data: Dataset, opts: { projectKey: string; spaceKey: string; first: boolean }): Promise<StepResult> {
  const t0 = Date.now();
  let cfg = await readConfig();
  if (!cfg || opts.first) {
    if (!cfg) {
      cfg = await makeConfig(opts.projectKey, opts.spaceKey);
      await kvs.set(CONFIG_KEY, cfg);
    }
  }
  const map = await readSeeded();
  if (opts.first) {
    await reconcile(map, cfg);
    if (!(await kvs.get(INSTALLED_AT_KEY))) await kvs.set(INSTALLED_AT_KEY, new Date().toISOString());
  }
  const all = units(data);
  const people = new Map(data.people.map((p) => [p.id, p]));
  const batch = nextToCreate(all, map, STEP_SIZE);
  const created: string[] = [];
  const errors: StepResult['errors'] = [];
  await runAll(batch, async (u) => {
    try {
      const s = await createUnit(u, cfg!, data, people, map);
      await remember(u.id, s);
      map[u.id] = s;
      created.push(u.id);
    } catch (e) {
      errors.push({ id: u.id, message: String(e instanceof Error ? e.message : e).slice(0, 300) });
    }
  });
  const p = progress(all, map);
  return { progress: p, done: p.done === p.total, created: created.sort(), deleted: [], errors, ms: Date.now() - t0 };
}

/** One reset step. Removes only objects the app seeded (by map or by the pentti-demo label). */
export async function resetStep(data: Dataset, opts: { first: boolean }): Promise<StepResult> {
  const t0 = Date.now();
  const cfg = await readConfig();
  const map = await readSeeded();
  if (opts.first) await reconcile(map, cfg);
  const all = units(data);
  const batch = nextToDelete(all, map, STEP_SIZE);
  const deleted: string[] = [];
  const errors: StepResult['errors'] = [];
  await runAll(batch, async (u) => {
    try {
      await deleteUnit(map[u.id]);
      await forget(u.id);
      delete map[u.id];
      deleted.push(u.id);
    } catch (e) {
      errors.push({ id: u.id, message: String(e instanceof Error ? e.message : e).slice(0, 300) });
    }
  });
  const left = Object.keys(map).length;
  if (left === 0 && errors.length === 0) {
    await kvs.delete(CONFIG_KEY);
    await kvs.delete(INSTALLED_AT_KEY);
  }
  return { progress: progress(all, map), done: left === 0, created: [], deleted: deleted.sort(), errors, ms: Date.now() - t0 };
}

export async function status(data: Dataset) {
  const [cfg, map, installedAt] = await Promise.all([readConfig(), readSeeded(), kvs.get<string>(INSTALLED_AT_KEY)]);
  const all = units(data);
  return {
    config: cfg ? { projectKey: cfg.projectKey, spaceKey: cfg.spaceKey } : null,
    installedAt: installedAt ?? null,
    progress: progress(all, map),
    extra: Object.keys(map).filter((id) => !all.some((u) => u.id === id)).length,
  };
}
