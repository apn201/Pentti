// Rovo action handlers (FACTORY_BUILD.md section 9). Inputs come from a language model and may be
// wrong: every asset id is checked against the dataset, the one write checks the caller's own Jira
// permission through context.accountId and runs as that user.
import api, { route } from '@forge/api';
import { blastRadius, explainAsset, findAsset, gapLabel, gapReport, gapTask, validateTaskIds, whoKnows } from './core';
import { snapshot, type Snapshot } from '../app/context';
import { pickIssueType } from '../seed/format';
import { readConfig } from '../seed/seed';

type Payload = Record<string, unknown> & { context?: { accountId?: string } };
type Ctx = { accountId?: string } | undefined;

function accountIdOf(payload: Payload, context: Ctx): string | undefined {
  return context?.accountId ?? payload?.context?.accountId ?? (typeof payload?.accountId === 'string' ? payload.accountId : undefined);
}

/** Resolves an asset id input. Unknown ids get the search results instead of a guess. */
function assetOrError(snap: Snapshot, input: unknown): { id: string } | { error: string; candidates?: unknown } {
  const id = String(input ?? '').trim();
  if (!id) return { error: 'Give an asset id. Use find-asset to get one.' };
  if (snap.index.asset(id)) return { id };
  const found = findAsset(snap.index, id);
  return { error: `Unknown asset id "${id}". Asset ids look like a_d4mjq. Use find-asset first, then pass its assetId.`, candidates: 'candidates' in found ? found.candidates : [] };
}

async function run<T>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  const t0 = Date.now();
  try {
    const r = await fn();
    console.log(name, Date.now() - t0, 'ms');
    return r;
  } catch (e) {
    console.error(name, e);
    return { error: `${name} failed: ${String(e instanceof Error ? e.message : e).slice(0, 300)}` };
  }
}

export const findAssetAction = (payload: Payload) =>
  run('find-asset', async () => findAsset((await snapshot()).index, String(payload.query ?? '')));

export const explainAssetAction = (payload: Payload) =>
  run('explain-asset', async () => {
    const snap = await snapshot();
    const r = assetOrError(snap, payload.assetId);
    if ('error' in r) return r;
    return explainAsset(snap.index, snap.byId.get(r.id)!, snap.site);
  });

export const blastRadiusAction = (payload: Payload) =>
  run('blast-radius', async () => {
    const snap = await snapshot();
    const r = assetOrError(snap, payload.assetId);
    if ('error' in r) return r;
    return blastRadius(snap.index, snap.byId, r.id);
  });

export const whoKnowsAction = (payload: Payload) =>
  run('who-knows', async () => {
    const snap = await snapshot();
    const r = assetOrError(snap, payload.assetId);
    if ('error' in r) return r;
    return whoKnows(snap.index, r.id, snap.site);
  });

export const gapReportAction = (payload: Payload) =>
  run('gap-report', async () => {
    const snap = await snapshot();
    return gapReport(snap.index, snap.scores, String(payload.plant ?? 'all'), Number(payload.n ?? 10));
  });

// ---------- create-gap-tasks ----------

async function asUserJira<T>(r: ReturnType<typeof route>, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await api.asUser().requestJira(r, {
    method: init?.method ?? 'GET',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

function adf(lines: string[]) {
  return {
    type: 'doc',
    version: 1,
    content: lines.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
  };
}

export const createGapTasksAction = (payload: Payload, context: Ctx) =>
  run('create-gap-tasks', async () => {
    const accountId = accountIdOf(payload, context);
    if (!accountId) return { error: 'No user behind this call. Creating tasks needs a signed-in user.' };
    const snap = await snapshot();
    const v = validateTaskIds(snap.index, payload.assetIds);
    if ('error' in v) return v;
    const cfg = await readConfig();
    if (!cfg) return { error: 'No Jira project yet. A Jira admin runs "Load the factory" first, tasks go into that project.' };

    const perm = await asUserJira<{ permissions: { CREATE_ISSUES?: { havePermission?: boolean } } }>(
      route`/rest/api/3/mypermissions?projectKey=${cfg.projectKey}&permissions=CREATE_ISSUES`,
    );
    if (!perm.permissions.CREATE_ISSUES?.havePermission) {
      return { error: `You cannot create issues in ${cfg.projectKey}. Nothing was created.` };
    }
    const typeId = pickIssueType('Task', cfg.issueTypes);
    if (!typeId) return { error: `Project ${cfg.projectKey} has no usable issue type.` };

    const results = [];
    for (const id of v.ids) {
      const task = gapTask(snap.index, snap.byId.get(id)!);
      const url = (key: string) => (snap.site.baseUrl ? `${snap.site.baseUrl}/browse/${key}` : null);
      const jql = `project = "${cfg.projectKey}" AND labels = "${gapLabel(id)}" ORDER BY created ASC`;
      const found = await asUserJira<{ issues: { key: string }[] }>(route`/rest/api/3/search/jql?jql=${jql}&fields=summary&maxResults=1`);
      if (found.issues[0]) {
        results.push({ assetId: id, key: found.issues[0].key, url: url(found.issues[0].key), created: false, note: 'Task already existed. Nothing new.' });
        continue;
      }
      if (task.nothingToClose) {
        results.push({ assetId: id, key: null, url: null, created: false, note: 'Nothing left to close from a desk on this machine.' });
        continue;
      }
      const created = await asUserJira<{ key: string }>(route`/rest/api/3/issue`, {
        method: 'POST',
        body: {
          fields: {
            project: { id: cfg.projectId },
            issuetype: { id: typeId },
            summary: task.summary,
            description: adf(task.lines),
            labels: task.labels,
          },
        },
      });
      results.push({ assetId: id, key: created.key, url: url(created.key), created: true, hours: task.hours, dangerRemoved: task.dangerRemoved });
    }
    return {
      project: cfg.projectKey,
      created: results.filter((r) => r.created).length,
      existing: results.filter((r) => !r.created && r.key).length,
      tasks: results,
    };
  });
