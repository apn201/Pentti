// Data source choice and the own data import. Bundled data stays the default: the site moves to own data
// only when an admin chooses it after a finished import, and one click takes it back.
import { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';
import { readAssetList, type AssetList } from '../../../src/own/csv';

type Targets = { projects: { key: string; name: string }[]; spaces: { key: string; name: string }[] };
type Imported = { on: string; assets: number; spaceKey: string | null; projectKey: string | null; pagesRead: number; issuesRead: number; pagesCapped: boolean; issuesCapped: boolean; matched: number };
type OwnStatus = { mode: 'own' | 'bundled'; imported: Imported | null; limits: { rows: number; pages: number; issues: number; batch: number } };

const EXAMPLE = 'hostname,ip,site,line,role,model,manufacturer,firmware,criticality,nickname,former_names,old_ips,open_critical,open_high';
const STALL_LIMIT = 500;

async function call<T>(name: string, payload: Record<string, unknown> = {}): Promise<T> {
  const r = await invoke<T | { error: string }>(name, payload);
  if (r && typeof r === 'object' && 'error' in r) throw new Error((r as { error: string }).error);
  return r as T;
}

const text = (e: unknown) => String((e as Error)?.message ?? e);

export function OwnData({ targets, demo, onMode }: { targets: Targets | null; demo: { projectKey: string; spaceKey: string } | null; onMode: (own: boolean) => void }) {
  const [status, setStatus] = useState<OwnStatus | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [list, setList] = useState<AssetList | null>(null);
  const [projectKey, setProjectKey] = useState('');
  const [spaceKey, setSpaceKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const show = (s: OwnStatus) => {
    setStatus(s);
    onMode(s.mode === 'own');
  };

  useEffect(() => {
    call<OwnStatus>('ownStatus').then(show).catch((e) => setMessage(text(e)));
  }, []);

  const parse = (csv: string) => {
    setMessage('');
    setList(csv.trim() ? readAssetList(csv) : null);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      parse(await file.text());
    } catch (e) {
      setMessage(text(e));
    }
  };

  const doImport = async () => {
    if (!list || !status) return;
    setBusy(true);
    try {
      setMessage('Starting. The site stays on bundled data.');
      await call('ownBegin', { accepted, projectKey, spaceKey });
      onMode(false);
      const size = status.limits.batch;
      for (let i = 0, batch = 0; i < list.rows.length; i += size, batch++) {
        await call('ownAssets', { batch, rows: list.rows.slice(i, i + size) });
        setMessage(`Asset list: ${Math.min(i + size, list.rows.length)} of ${list.rows.length}.`);
      }
      for (let step = 0; ; step++) {
        const r = await call<{ done: boolean; pagesRead: number; issuesRead: number }>('ownRead');
        setMessage(`Reading. ${r.pagesRead} pages and ${r.issuesRead} issues so far.`);
        if (r.done) break;
        if (step > STALL_LIMIT) throw new Error('Stopped. Reading did not finish.');
      }
      const done = await call<OwnStatus>('ownFinish');
      show(done);
      setList(null);
      setMessage('Imported. The site is still on bundled data until you choose your own below.');
    } catch (e) {
      setMessage(`${text(e)} The site stays on bundled data.`);
      call<OwnStatus>('ownStatus').then(show).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const act = async (name: string, payload: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      show(await call<OwnStatus>(name, payload));
      setMessage(done);
    } catch (e) {
      setMessage(text(e));
    } finally {
      setBusy(false);
    }
  };

  const projects = targets?.projects.filter((p) => p.key !== demo?.projectKey) ?? [];
  const spaces = targets?.spaces.filter((s) => s.key !== demo?.spaceKey) ?? [];
  const imp = status?.imported;
  const own = status?.mode === 'own';

  return (
    <section>
      <h2>Data source</h2>
      <label className="choice">
        <input type="radio" name="source" checked={!own} disabled={busy} onChange={() => act('ownUse', { mode: 'bundled' }, 'Back on the bundled data.')} /> Use bundled data, the fictional factory
      </label>
      <label className="choice">
        <input type="radio" name="source" checked={own} disabled={busy || !imp} onChange={() => act('ownUse', { mode: 'own' }, 'The Pentti page and Ask Pentti now answer from your data. Only Jira admins can see it.')} /> Use my own data{imp ? '' : ', import it first'}
      </label>
      {imp && (
        <p className="muted">
          Imported {imp.on}: {imp.assets} assets, {imp.pagesRead} pages{imp.spaceKey ? ` from ${imp.spaceKey}` : ''}{imp.pagesCapped ? ' (more exist, not read)' : ''}, {imp.issuesRead} issues{imp.projectKey ? ` from ${imp.projectKey}` : ''}{imp.issuesCapped ? ' (more exist, not read)' : ''}. {imp.matched} matches between them and the machines.
        </p>
      )}

      <h2>Try your own data</h2>
      <div className="warn">
        <p><strong>Proof of concept, not for production use.</strong> Use a sandbox site or a small space with nothing sensitive in it.</p>
        <ul className="muted">
          <li>Reads the project and space you pick, as you, with your permissions. Nothing is written to Jira or Confluence. Creating tasks is off.</li>
          <li>Page and ticket text is read to look for machine names, then dropped. Your asset list, the titles and what matched stay in this app's Forge storage until you delete them.</li>
          <li>Only Jira admins can see the results. Nothing goes into the Teamwork Graph. People are not imported.</li>
          <li>Finds a machine only where a page or ticket names it. The scores are not a safety, security or compliance assessment.</li>
        </ul>
      </div>

      <label htmlFor="own-file">Asset list, CSV</label>
      <p className="muted">
        At most {status?.limits.rows ?? '...'} machines. Each row needs a hostname or an IP. The other columns are optional, a blank becomes "not known". Columns: <code>{EXAMPLE}</code>
      </p>
      <input id="own-file" type="file" accept=".csv,text/csv,text/plain" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
      <label htmlFor="own-paste">Or paste it</label>
      <textarea id="own-paste" disabled={busy} onChange={(e) => parse(e.target.value)} />
      {list?.fatal && <p className="errors">{list.fatal}</p>}
      {list && !list.fatal && (
        <p>
          {list.assets.length} machines ready.
          {list.ignoredColumns.length > 0 && <span className="muted"> Columns not used: {list.ignoredColumns.join(', ')}.</span>}
        </p>
      )}
      {list && list.errors.length > 0 && (
        <pre className="errors">{`${list.errors.length} rows left out.\n`}{list.errors.slice(0, 10).map((e) => `Line ${e.line}: ${e.message}`).join('\n')}</pre>
      )}

      <label htmlFor="own-project">Jira project to read, optional</label>
      <select id="own-project" value={projectKey} disabled={busy} onChange={(e) => setProjectKey(e.target.value)}>
        <option value="">None</option>
        {projects.map((t) => <option key={t.key} value={t.key}>{t.name} ({t.key})</option>)}
      </select>
      <label htmlFor="own-space">Confluence space to read, optional</label>
      <select id="own-space" value={spaceKey} disabled={busy} onChange={(e) => setSpaceKey(e.target.value)}>
        <option value="">None</option>
        {spaces.map((t) => <option key={t.key} value={t.key}>{t.name} ({t.key})</option>)}
      </select>
      <p className="muted">Reads at most {status?.limits.pages ?? '...'} pages and {status?.limits.issues ?? '...'} issues, the newest issues first. The answers say when more exist. The project and space of the fictional factory are not offered.</p>

      <label className="choice">
        <input type="checkbox" checked={accepted} disabled={busy} onChange={(e) => setAccepted(e.target.checked)} /> I understand this is a proof of concept and I may import this data.
      </label>
      <div className="row">
        <button className="primary" disabled={busy || !accepted || !list || !!list.fatal || list.assets.length === 0} onClick={doImport}>
          {busy ? 'Working' : imp ? 'Import again, replaces the old import' : 'Import'}
        </button>
        <button className="danger" disabled={busy || !imp} onClick={() => act('ownDelete', {}, 'Your data is deleted from this app. Nothing changed in Jira or Confluence.')}>
          Delete my data
        </button>
      </div>
      {message && <p>{message}</p>}
    </section>
  );
}
