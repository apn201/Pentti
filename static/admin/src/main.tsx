// Admin page "Load the factory" (FACTORY_BUILD.md section 10). Drives the seeder one resolver call
// per step, so no call runs near the function time limit.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, view } from '@forge/bridge';
import './style.css';

type Count = { done: number; total: number };
type Progress = Count & { pages: Count; issues: Count };
type Status = { config: { projectKey: string; spaceKey: string } | null; installedAt: string | null; progress: Progress; extra: number };
type Step = { progress: Progress; done: boolean; created: string[]; deleted: string[]; errors: { id: string; message: string }[]; ms: number };
type Targets = { projects: { key: string; name: string; type: string }[]; spaces: { key: string; name: string }[] };
type Failure = { error: string };
type Sync = { connected: boolean; cards: number; accepted: number; rejected: number; errors: string[]; at: string; ms: number };
type GraphStatus = { connected: boolean; lastSync: Sync | null };

const failed = (r: unknown): r is Failure => !!r && typeof r === 'object' && 'error' in r;

async function call<T>(name: string, payload: Record<string, unknown> = {}): Promise<T> {
  const r = await invoke<T | Failure>(name, payload);
  if (failed(r)) throw new Error(r.error);
  return r as T;
}

const text = (e: unknown) => String((e as Error)?.message ?? e);

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [projectKey, setProjectKey] = useState('');
  const [spaceKey, setSpaceKey] = useState('');
  const [busy, setBusy] = useState<'load' | 'reset' | null>(null);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [graph, setGraph] = useState<GraphStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [graphMsg, setGraphMsg] = useState('');

  const loadGraph = () => call<GraphStatus>('graphStatus').then(setGraph).catch((e) => setGraphMsg(text(e)));
  const sync = async () => {
    setSyncing(true);
    setGraphMsg('');
    try {
      const r = await call<Sync>('graphSync');
      setGraphMsg(r.errors.length ? `${r.accepted} of ${r.cards} cards accepted. ${r.errors[0]}` : r.connected ? `${r.accepted} of ${r.cards} cards accepted in ${r.ms} ms.` : 'Not connected yet.');
      await loadGraph();
    } catch (e) {
      setGraphMsg(text(e));
    } finally {
      setSyncing(false);
    }
  };

  const refresh = async () => {
    const s = await call<Status>('status');
    setStatus(s);
    if (s.config) {
      setProjectKey(s.config.projectKey);
      setSpaceKey(s.config.spaceKey);
    }
  };

  useEffect(() => {
    view.theme.enable().catch(() => undefined);
    refresh().catch((e) => setMessage(text(e)));
    call<Targets>('targets').then(setTargets).catch((e) => setMessage(text(e)));
    loadGraph();
  }, []);

  const run = async (kind: 'load' | 'reset') => {
    setBusy(kind);
    setErrors([]);
    let changed = 0;
    let stalled = 0;
    try {
      for (let first = true; ; first = false) {
        const r = await call<Step>(kind === 'load' ? 'loadStep' : 'resetStep', { projectKey, spaceKey, first });
        const moved = r.created.length + r.deleted.length;
        changed += moved;
        setStatus((s) => (s ? { ...s, progress: r.progress } : s));
        setMessage(`${kind === 'load' ? 'Loading' : 'Removing'}. ${r.progress.done} of ${r.progress.total} in place. Last step ${r.ms} ms.`);
        if (r.errors.length) setErrors(r.errors.map((e) => `${e.id}: ${e.message}`));
        if (r.done) break;
        stalled = moved === 0 ? stalled + 1 : 0;
        if (stalled >= 2) throw new Error('Stopped. Two steps in a row changed nothing.');
      }
      await refresh();
      await loadGraph();
      if (kind === 'load') setMessage(changed ? `Done. ${changed} objects created.` : 'Already loaded. Nothing changed.');
      else setMessage(changed ? `Done. ${changed} objects removed.` : 'Nothing to remove.');
    } catch (e) {
      setMessage(text(e));
    } finally {
      setBusy(null);
    }
  };

  const p = status?.progress;
  const locked = !!status?.config && (p?.done ?? 0) > 0;
  const pct = p && p.total ? Math.round((100 * p.done) / p.total) : 0;

  return (
    <main>
      <h1>Load the factory</h1>
      <p>
        Creates the demo content for Tervaniemi Works, a fictional company: {p ? p.pages.total : '...'} Confluence pages and{' '}
        {p ? p.issues.total : '...'} Jira issues. Every object carries the label <code>pentti-demo</code>. Reset removes those
        and nothing else.
      </p>
      <p className="muted">Pick an empty project and space if you can. Dates and authors live in the app, the pages say so.</p>

      <label htmlFor="project">Jira project</label>
      <select id="project" value={projectKey} disabled={locked || !!busy} onChange={(e) => setProjectKey(e.target.value)}>
        <option value="">Pick a project</option>
        {targets?.projects.map((t) => (
          <option key={t.key} value={t.key}>{t.name} ({t.key})</option>
        ))}
      </select>

      <label htmlFor="space">Confluence space</label>
      <select id="space" value={spaceKey} disabled={locked || !!busy} onChange={(e) => setSpaceKey(e.target.value)}>
        <option value="">Pick a space</option>
        {targets?.spaces.map((t) => (
          <option key={t.key} value={t.key}>{t.name} ({t.key})</option>
        ))}
      </select>
      {locked && <p className="muted">Locked while content is loaded. Reset to pick another project or space.</p>}

      <div className="row">
        <button className="primary" disabled={!!busy || !projectKey || !spaceKey} onClick={() => run('load')}>
          {busy === 'load' ? 'Loading' : 'Load the factory'}
        </button>
        <button className="danger" disabled={!!busy} onClick={() => run('reset')}>
          {busy === 'reset' ? 'Removing' : 'Reset'}
        </button>
      </div>

      {p && (
        <>
          <div className="bar"><div style={{ width: `${pct}%` }} /></div>
          <p className="muted">
            Pages {p.pages.done} of {p.pages.total}. Issues {p.issues.done} of {p.issues.total}.
            {status?.installedAt ? ` Install date ${status.installedAt.slice(0, 10)}.` : ''}
          </p>
        </>
      )}
      {message && <p>{message}</p>}
      {errors.length > 0 && <pre className="errors">{errors.join('\n')}</pre>}

      <h2>Teamwork Graph</h2>
      <p className="muted">
        One asset card per machine goes into the graph, so Rovo Search and Rovo Chat find the machines. An org admin connects it once:
        admin.atlassian.com, Connectors, Add connector, Pentti asset cards. Cards follow every load and reset.
      </p>
      {graph && (
        <p>
          {graph.connected ? 'Connected.' : 'Not connected yet.'}
          {graph.lastSync ? ` Last sync ${graph.lastSync.at.slice(0, 16).replace('T', ' ')} UTC, ${graph.lastSync.accepted} of ${graph.lastSync.cards} cards accepted.` : ''}
        </p>
      )}
      <button className="subtle" disabled={!!busy || syncing || !graph?.connected} onClick={sync}>
        {syncing ? 'Syncing' : 'Sync asset cards now'}
      </button>
      {graphMsg && <p>{graphMsg}</p>}

    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
