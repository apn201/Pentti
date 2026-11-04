// Closing list: what to document first, with hours, and "Create tasks". Keys appear as links.
import { useEffect, useState } from 'react';
import { call, Chip, Dot, Empty, errorText, ExtLink, type Light } from './ui';

interface Item {
  rank: number;
  assetId: string;
  name: string;
  plant: string;
  line: string;
  role: string;
  criticality: string;
  knowledge: number;
  risk: number;
  danger: number;
  steps: { action: string; hours: number }[];
  hours: number;
  dangerRemoved: number;
  lights: { risk: Light; knowledge: Light; danger: Light };
  task: { key: string; url: string | null } | null;
}

interface Report {
  scope: string;
  assetsInScope: number;
  items: Item[];
  totalHours: number;
  percentRemoved: number;
  sentence: string;
}

interface Created {
  project: string;
  created: number;
  existing: number;
  tasks: { assetId: string; key: string | null; created: boolean; note?: string }[];
}

const STEP_WORDS: Record<string, string> = {
  name: 'Name it',
  owner: 'Find an owner',
  doc: 'Write a page',
  doc_refresh: 'Refresh the page',
  confirm: 'Check it in person',
};

export function Closing({ plants, onOpen }: { plants: string[]; onOpen: (id: string) => void }) {
  const [plant, setPlant] = useState('all');
  const [n, setN] = useState(10);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Created | null>(null);

  const load = () => {
    setError('');
    call<Report>('closing', { plant, n }).then(setReport).catch((e) => setError(errorText(e)));
  };
  useEffect(load, [plant, n]);

  const open = report?.items.filter((i) => !i.task) ?? [];

  const create = async () => {
    setBusy(true);
    setAsking(false);
    setError('');
    try {
      const r = await call<Created>('createTasks', { assetIds: open.map((i) => i.assetId).join(',') });
      setResult(r);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <p className="muted">
        The assets to document first, ranked by danger removed per hour. Hours and danger come from the scoring config, nothing here is a guess.
      </p>
      <div className="bar">
        <label>
          Plant{' '}
          <select value={plant} onChange={(e) => { setPlant(e.target.value); setResult(null); }}>
            <option value="all">All plants</option>
            {plants.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>
          Assets{' '}
          <select value={n} onChange={(e) => { setN(Number(e.target.value)); setResult(null); }}>
            {[5, 10, 15, 25].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="err">{error}</p>}
      {!report && !error && <Empty>Loading.</Empty>}
      {report && (
        <>
          <table>
            <thead>
              <tr>
                <th className="r">#</th>
                <th>Asset</th>
                <th>Now</th>
                <th>Steps</th>
                <th className="r">Hours <Chip k="SCORE" /></th>
                <th className="r">Danger removed <Chip k="SCORE" /></th>
                <th>Task</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((i) => (
                <tr key={i.assetId}>
                  <td className="r">{i.rank}</td>
                  <td>
                    <a className="row-link" onClick={() => onOpen(i.assetId)}>{i.name}</a>
                    <div className="muted small">{i.plant} {i.line}, {i.role}, {i.criticality}</div>
                  </td>
                  <td>
                    <span className="lights">
                      <Dot light={i.lights.knowledge} kind="knowledge" />
                      <Dot light={i.lights.risk} kind="risk" />
                      <Dot light={i.lights.danger} kind="danger" />
                    </span>
                    <div className="muted small">K {i.knowledge}, R {i.risk}, D {i.danger} <Chip k="SCORE" /></div>
                  </td>
                  <td>{i.steps.map((s) => <span className="step" key={s.action}>{STEP_WORDS[s.action] ?? s.action} {s.hours} h</span>)}</td>
                  <td className="r">{i.hours}</td>
                  <td className="r">{i.dangerRemoved}</td>
                  <td>{i.task ? <ExtLink href={i.task.url}>{i.task.key}</ExtLink> : <span className="muted">none</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="total">
            {report.items.length} assets, {report.totalHours} hours <Chip k="SCORE" />, removes {report.percentRemoved} percent <Chip k="SCORE" /> of the danger in {report.scope}.
          </p>
          <p className="muted small">K knowledge, R risk, D danger. Dots: knowledge, risk, danger. Red is bad.</p>
          <div className="bar">
            {!asking && (
              <button className="btn primary" disabled={busy || open.length === 0} onClick={() => setAsking(true)}>
                {busy ? 'Creating' : open.length === 0 ? 'Every asset here has a task' : `Create tasks for ${open.length} assets`}
              </button>
            )}
            {asking && (
              <span className="confirmbox">
                Create {open.length} Jira tasks, one per asset?
                <button className="btn primary" onClick={create}>Yes, create</button>
                <button className="btn subtle" onClick={() => setAsking(false)}>No</button>
              </span>
            )}
          </div>
          {result && (
            <p className="ok">
              {result.created} created and {result.existing} already there, in {result.project}:{' '}
              {result.tasks.filter((t) => t.key).map((t) => t.key).join(', ')}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
