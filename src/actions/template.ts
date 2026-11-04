// Template actions from forge create (action-rovo). Replaced by the Pentti actions in S5.
import api, { route } from '@forge/api';

export async function addComment(payload: { issueId: string; comment: string }) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${payload.issueId}/comment`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ text: payload.comment, type: 'text' }] }] },
    }),
  });
  if (!res.ok) console.log('add comment failed', res.status, await res.text());
}

export async function fetchComments(payload: { issueId: string }) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${payload.issueId}/comment`, {
    headers: { Accept: 'application/json' },
  });
  return res.json();
}
