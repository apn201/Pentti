// Jira writes and reads for gap tasks, shared by the create-gap-tasks action and the UI.
// Runs as the user: their own CREATE_ISSUES permission in the loaded project decides.
import api, { route } from '@forge/api';
import { gapLabel, gapTask, validateTaskIds } from './core';
import type { Snapshot } from '../app/context';
import { pickIssueType } from '../seed/format';
import { readConfig } from '../seed/seed';

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

export async function createGapTasks(snap: Snapshot, input: unknown, accountId: string | undefined) {
  // Own data is read only. Nothing in this mode writes to Jira or Confluence.
  if (snap.site.own) return { error: 'Tasks are off while Pentti runs on your own data. Nothing was created.' };
  if (!accountId) return { error: 'No user behind this call. Creating tasks needs a signed-in user.' };
  const v = validateTaskIds(snap.index, input);
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
}

/** Gap tasks that exist in the loaded project, asset id -> issue key. Read as the app. */
export async function existingGapTasks(): Promise<Record<string, string>> {
  const cfg = await readConfig();
  if (!cfg) return {};
  const out: Record<string, string> = {};
  let token: string | undefined;
  const jql = `project = "${cfg.projectKey}" AND labels = "pentti-demo" ORDER BY created ASC`;
  do {
    const res = await api.asApp().requestJira(
      token
        ? route`/rest/api/3/search/jql?jql=${jql}&fields=labels&maxResults=100&nextPageToken=${token}`
        : route`/rest/api/3/search/jql?jql=${jql}&fields=labels&maxResults=100`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { issues: { key: string; fields: { labels: string[] } }[]; nextPageToken?: string };
    for (const i of body.issues) {
      const l = i.fields.labels.find((x) => x.startsWith('pentti-gap-'));
      if (l && !out[l.slice('pentti-gap-'.length)]) out[l.slice('pentti-gap-'.length)] = i.key;
    }
    token = body.nextPageToken;
  } while (token);
  return out;
}
