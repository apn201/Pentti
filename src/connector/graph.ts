// graph:connector datasource.onConnectionChange. S7 ingests the asset cards here.
// Until then it only remembers the connection id, so the cards can be written and removed later.
import { kvs } from '@forge/kvs';

export const CONNECTION_KEY = 'graph:connectionId';

interface ConnectionEvent {
  action?: string;
  connectionId?: string;
}

export async function onConnectionChange(event: { body?: ConnectionEvent } & ConnectionEvent): Promise<void> {
  const body = event?.body ?? event;
  console.log('onConnectionChange', body?.action, body?.connectionId);
  if (!body?.connectionId) return;
  if (body.action === 'DELETED') await kvs.delete(CONNECTION_KEY);
  else await kvs.set(CONNECTION_KEY, body.connectionId);
}
