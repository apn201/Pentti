// Rovo action handlers (FACTORY_BUILD.md section 9). Inputs come from a language model and may be
// wrong: every asset id is checked against the dataset, the one write checks the caller's own Jira
// permission through context.accountId and runs as that user.
import { blastRadius, explainAsset, findAsset, gapReport, whoKnows } from './core';
import { createGapTasks } from './tasks';
import { ownDenied, snapshot, type Snapshot } from '../app/context';

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
  const found = findAsset(snap.index, id, snap.site);
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

/** A read action: the access check for own data, then the answer. Own data answers say so, for the agent. */
const read = <T extends object>(name: string, payload: Payload, context: Ctx, fn: (snap: Snapshot) => T) =>
  run(name, async () => {
    const snap = await snapshot();
    const denied = await ownDenied(snap, accountIdOf(payload, context));
    if (denied) return denied;
    const r = fn(snap);
    return snap.site.own ? { dataset: 'own', ...r } : r;
  });

export const findAssetAction = (payload: Payload, context?: Ctx) =>
  read('find-asset', payload, context, (snap) => findAsset(snap.index, String(payload.query ?? ''), snap.site));

export const explainAssetAction = (payload: Payload, context?: Ctx) =>
  read('explain-asset', payload, context, (snap) => {
    const r = assetOrError(snap, payload.assetId);
    if ('error' in r) return r;
    return explainAsset(snap.index, snap.byId.get(r.id)!, snap.site);
  });

export const blastRadiusAction = (payload: Payload, context?: Ctx) =>
  read('blast-radius', payload, context, (snap) => {
    const r = assetOrError(snap, payload.assetId);
    if ('error' in r) return r;
    return blastRadius(snap.index, snap.byId, r.id, snap.site);
  });

export const whoKnowsAction = (payload: Payload, context?: Ctx) =>
  read('who-knows', payload, context, (snap) => {
    const r = assetOrError(snap, payload.assetId);
    if ('error' in r) return r;
    return whoKnows(snap.index, r.id, snap.site);
  });

export const gapReportAction = (payload: Payload, context?: Ctx) =>
  read('gap-report', payload, context, (snap) => gapReport(snap.index, snap.scores, String(payload.plant ?? 'all'), Number(payload.n ?? 10), snap.site));

// ---------- create-gap-tasks ----------

export const createGapTasksAction = (payload: Payload, context: Ctx) =>
  run('create-gap-tasks', async () => createGapTasks(await snapshot(), payload.assetIds, accountIdOf(payload, context)));
