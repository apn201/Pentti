// graph:connector (slice S7). Mirrors one asset card per asset into the Teamwork Graph.
// Sync runs when an admin connects the connector, after "Load the factory" and Reset, from the
// admin page, and for one card after "I checked this". Disconnect removes the cards.
import { kvs } from '@forge/kvs';
import { graph } from '@forge/teamwork-graph';
import { snapshot, type Snapshot } from '../app/context';
import { assetCard, CARD_SOURCE, CARD_TYPE, chunks, SPIKE_IDS } from './cards';
import { ownModeOn } from '../own/store';

export const CONNECTION_KEY = 'graph:connectionId';
export const LAST_SYNC_KEY = 'graph:lastSync';
const SPIKE_DONE_KEY = 'graph:spikeRemoved';
const SPIKE_CONNECTION_KEY = 'spike:connectionId';   // where the S0 spike kept it

/** The connection id from onConnectionChange. Moves the S0 spike's key over once. */
export async function connectionId(): Promise<string | undefined> {
  const id = await kvs.get<string>(CONNECTION_KEY);
  if (id) return id;
  const old = await kvs.get<string>(SPIKE_CONNECTION_KEY);
  if (old) {
    await kvs.set(CONNECTION_KEY, old);
    await kvs.delete(SPIKE_CONNECTION_KEY);
  }
  return old;
}

export interface SyncResult {
  connected: boolean;
  cards: number;
  accepted: number;
  rejected: number;
  errors: string[];
  at: string;
  ms: number;
}

interface ConnectionEvent {
  action?: string;
  connectionId?: string;
}

async function sendCards(connectionId: string, snap: Snapshot, ids: string[]) {
  const now = new Date().toISOString();
  const sequence = Date.now();
  const cards = ids.map((id) => assetCard(snap.index, snap.byId.get(id)!, snap.site, { now, sequence }));
  let accepted = 0;
  let rejected = 0;
  const errors: string[] = [];
  for (const batch of chunks(cards)) {
    const r = await graph.setObjects({ objects: batch as never[], connectionId, properties: CARD_SOURCE });
    if (!r.success) errors.push(String(r.error ?? 'setObjects failed').slice(0, 200));
    accepted += r.results?.accepted?.length ?? 0;
    const rej = r.results?.rejected ?? [];
    rejected += rej.length;
    if (rej.length) errors.push(JSON.stringify(rej[0]).slice(0, 300));
  }
  return { cards: cards.length, accepted, rejected, errors };
}

/** Writes every asset card. Returns connected false when no admin has connected the connector yet. */
export async function syncAll(): Promise<SyncResult> {
  const t0 = Date.now();
  const connection = await connectionId();
  const at = new Date().toISOString();
  if (!connection) return { connected: false, cards: 0, accepted: 0, rejected: 0, errors: [], at, ms: 0 };
  // Cards are visible to everyone on the site. Own data never goes into the graph.
  if (await ownModeOn()) return { connected: true, cards: 0, accepted: 0, rejected: 0, errors: [], at, ms: 0 };
  const snap = await snapshot();
  const r = await sendCards(connection, snap, snap.index.assets.map((a) => a.id));
  if (r.errors.some((e) => /connection not found/i.test(e))) {
    // The connection died, for example when the installation changed. An admin has to add the connector again.
    await kvs.delete(CONNECTION_KEY);
    const gone = { connected: false, ...r, errors: ['The graph connection is gone. Add the connector again in admin.atlassian.com, Connectors.', ...r.errors], at, ms: Date.now() - t0 };
    await kvs.set(LAST_SYNC_KEY, gone);
    return gone;
  }
  if (!(await kvs.get(SPIKE_DONE_KEY))) {
    // Deletes cap at 100 ids per call, like writes.
    let ok = true;
    for (const ids of chunks(SPIKE_IDS)) {
      const d = await graph.deleteObjectsByExternalId({ objectType: CARD_TYPE, externalIds: ids, connectionId: connection })
        .catch((e: unknown) => ({ success: false, error: String(e) }));
      if (!d.success) {
        ok = false;
        r.errors.push(`spike cleanup: ${String(d.error).slice(0, 200)}`);
      }
    }
    if (ok) await kvs.set(SPIKE_DONE_KEY, at);
  }
  const result = { connected: true, ...r, at, ms: Date.now() - t0 };
  await kvs.set(LAST_SYNC_KEY, result);
  console.log('graph sync', result.cards, 'cards', result.accepted, 'accepted', result.rejected, 'rejected', result.ms, 'ms');
  return result;
}

/** Rewrites one card, for example after "I checked this". Quiet when not connected. */
export async function syncOne(assetId: string): Promise<void> {
  const connection = await connectionId();
  if (!connection || await ownModeOn()) return;
  const snap = await snapshot();
  if (!snap.byId.has(assetId)) return;
  const r = await sendCards(connection, snap, [assetId]);
  if (r.errors.length) console.error('graph syncOne', assetId, r.errors);
}

export async function onConnectionChange(event: { body?: ConnectionEvent } & ConnectionEvent): Promise<void> {
  const body = event?.body ?? event;
  console.log('onConnectionChange', body?.action, body?.connectionId);
  if (!body?.connectionId) return;
  if (body.action === 'DELETED') {
    const d = await graph.deleteObjectsByProperties({ objectType: CARD_TYPE, properties: CARD_SOURCE, connectionId: body.connectionId })
      .catch((e: unknown) => ({ success: false, error: String(e) }));
    console.log('graph cards removed on disconnect', d.success, d.error ?? '');
    await kvs.delete(CONNECTION_KEY);
    await kvs.delete(LAST_SYNC_KEY);
    return;
  }
  await kvs.set(CONNECTION_KEY, body.connectionId);
  await syncAll();
}
