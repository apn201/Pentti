// Asset card: the three-part answer with a chip on every number, sources with confidence,
// people, findings and "I checked this".
import { useEffect, useState } from 'react';
import { call, Chip, Empty, errorText, ExtLink, LightTag, Num, type ChipKind, type Light } from './ui';

interface Source { id: string; kind: string; title: string; url: string | null; jiraKey?: string | null; matchedOn: string; confidence: number; evidence: string }
interface Person { personId: string; name: string; role: string; left: boolean; leavingInDays: number | null; leavingSoon?: boolean; touches: number; lastTouchDaysAgo: number }

interface AssetData {
  dataset?: 'own';
  asset: { assetId: string; name: string; hostname: string | null; nickname: string | null; plant: string; line: string; role: string; model: string | null; criticality: string; ip: string };
  known: {
    identity: { hostname: string; nickname: string; ip: string; ipHistory: string[]; formerNames: string[]; criticality: string; purdueLevel: number | null; flags: string[] };
    hardware: { model: string; manufacturer: string; firmware: string; modules: string[]; lastSeenDaysAgo: number | string };
    findings: { open: number; openCritical: number; openHigh: number; openMedium: number; openLow: number; maxScore: number | null; total: number };
    owner?: { name: string; leavingSoon: boolean; leavingInDays: number | null };
    pages?: (Source & { lastEditedDaysAgo: number; author: string })[];
    issues?: (Source & { status: string; createdDaysAgo: number })[];
  };
  not_known: string[];
  searched: string[];
  maybe: Source[];
  knowledge: { score: number; parts: Record<string, { points: number; max: number; reason: string }> };
  risk: { score: number; openCriticalOrHigh: number; exploitBonus: number };
  danger: { score: number };
  lights: { risk: Light; knowledge: Light; danger: Light };
  who: Person[];
  blast: { sentence: string; sameLine: number; sameLineCritical: number; sameSubnet: number; subnet: string };
  openFindings: { id: string; cve: string; severity: string; score: number | null; exploit: string | null; summary: string; advisoryUrl: string | null }[];
  confirmed: { daysAgo: number } | null;
  gapTask: { key: string; url: string | null } | null;
}

interface Candidate { assetId: string; name: string; plant: string; line: string; role: string; criticality: string; matchedOn: string }

const PART_NAMES: Record<string, string> = {
  name: 'Name', owner: 'Owner', doc: 'Documentation', doc_fresh: 'Fresh documentation',
  history: 'History', firmware: 'Firmware', confirmed: 'Checked in person',
};

function Tile({ title, value, max, light, kind, chip, children }: { title: string; value: number; max?: number; light: Light; kind: 'risk' | 'knowledge' | 'danger'; chip: ChipKind; children?: React.ReactNode }) {
  return (
    <div className={`tile ${light}`}>
      <div className="label">{title} <Chip k={chip} /></div>
      <div className="big">{value}{max ? <span className="muted small"> / {max}</span> : null}</div>
      <LightTag light={light} kind={kind} />
      {children}
    </div>
  );
}

export function AssetCard({ assetId, onOpen, onChanged }: { assetId: string | null; onOpen: (id: string) => void; onChanged: () => void }) {
  const [data, setData] = useState<AssetData | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ candidates: Candidate[]; not_known?: string[]; note?: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = (id: string) => {
    setError('');
    setData(null);
    call<AssetData>('asset', { assetId: id }).then(setData).catch((e) => setError(errorText(e)));
  };
  useEffect(() => { if (assetId) load(assetId); }, [assetId]);

  const search = async () => {
    if (!query.trim()) return;
    try {
      const r = await call<{ candidates: Candidate[]; not_known?: string[]; note?: string }>('find', { query });
      setFound(r);
      if (r.candidates.length === 1) onOpen(r.candidates[0].assetId);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const confirm = async () => {
    if (!data) return;
    setBusy(true);
    setAsking(false);
    try {
      await call('confirm', { assetId: data.asset.assetId });
      load(data.asset.assetId);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const k = data?.known;
  const pages = k?.pages ?? [];
  const issues = k?.issues ?? [];
  const own = data?.dataset === 'own';

  return (
    <section>
      <div className="bar">
        <input
          type="search"
          placeholder="Hostname, nickname, IP or model"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
        />
        <button className="btn subtle" onClick={search}>Find</button>
      </div>
      {found && found.candidates.length !== 1 && (
        <div className="banner">
          {found.candidates.length === 0
            ? (found.not_known?.[0] ?? 'Nobody knows that name.')
            : <>Several machines match. Pick one:{' '}
              {found.candidates.map((c, i) => (
                <span key={c.assetId}>{i ? ', ' : ''}<a onClick={() => onOpen(c.assetId)}>{c.name}</a> <span className="muted small">({c.plant} {c.line}, {c.role})</span></span>
              ))}</>}
        </div>
      )}
      {!assetId && <Empty>Pick an asset on the gap map or the closing list, or search for one.</Empty>}
      {error && <p className="err">{error}</p>}
      {assetId && !data && !error && <Empty>Loading.</Empty>}
      {data && k && (
        <>
          <h1>{data.asset.name}</h1>
          <p className="muted">
            {data.asset.plant} {data.asset.line}, {data.asset.role}, {data.asset.criticality} <Chip k="SCAN" />. Asset id {data.asset.assetId}.
            {data.gapTask && <> Gap task <ExtLink href={data.gapTask.url}>{data.gapTask.key}</ExtLink>.</>}
          </p>

          <div className="tiles">
            <Tile title="Knowledge" value={data.knowledge.score} max={100} light={data.lights.knowledge} kind="knowledge" chip="SCORE" />
            <Tile title="Risk" value={data.risk.score} max={100} light={data.lights.risk} kind="risk" chip="SCORE">
              <div className="muted small">{data.risk.openCriticalOrHigh} open Critical or High <Chip k="SCAN" /></div>
            </Tile>
            <Tile title="Danger" value={data.danger.score} light={data.lights.danger} kind="danger" chip="SCORE">
              <div className="muted small">Risk times what is not known</div>
            </Tile>
          </div>

          <div className="cols">
            <div>
              <h2>What is known</h2>
              <ul className="plain">
                <li>Hostname {k.identity.hostname}, nickname {k.identity.nickname}, IP {k.identity.ip} <Chip k="SCAN" /></li>
                {k.identity.ipHistory.length > 0 && <li>Old IP {k.identity.ipHistory.join(', ')} <Chip k={own ? 'SCAN' : 'GEN'} /></li>}
                {k.identity.formerNames.length > 0 && <li>Former name {k.identity.formerNames.join(', ')} <Chip k={own ? 'SCAN' : 'GEN'} /></li>}
                <li>Model {k.hardware.model}, {k.hardware.manufacturer}, firmware {k.hardware.firmware} <Chip k="SCAN" /></li>
                <li>
                  Open findings <Num v={k.findings.open} k="SCAN" />: Critical {k.findings.openCritical}, High {k.findings.openHigh}, Medium {k.findings.openMedium}, Low {k.findings.openLow}.
                  Highest score <Num v={k.findings.maxScore} k="SCAN" />
                </li>
                {k.owner && <li>Owner {k.owner.name}{k.owner.leavingSoon ? `, leaving in ${k.owner.leavingInDays} days` : ''} <Chip k="GEN" /></li>}
                {pages.length > 0 && <li>{pages.length} page(s) and {issues.length} ticket(s) describe it <Chip k="GEN" /></li>}
                {pages.length === 0 && issues.length > 0 && <li>{issues.length} ticket(s) mention it <Chip k="GEN" /></li>}
              </ul>
              <h2>What is not known</h2>
              <ul className="plain notknown">{data.not_known.map((t) => <li key={t}>{t}</li>)}</ul>
              <h2>Where I looked</h2>
              <ul className="plain muted">{data.searched.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div>
              <h2>Knowledge, part by part <Chip k="SCORE" /></h2>
              <table>
                <tbody>
                  {Object.entries(data.knowledge.parts).map(([key, p]) => (
                    <tr key={key}>
                      <td>{PART_NAMES[key] ?? key}</td>
                      <td className="r num">{p.points} / {p.max}</td>
                      <td className="muted small">{p.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h2>Who knows it {!own && <Chip k="GEN" />}</h2>
              {own ? <Empty>Not known. People are not imported.</Empty> : data.who.length === 0 ? <Empty>Nobody. Not one page or ticket by anyone.</Empty> : (
                <ul className="plain">
                  {data.who.map((w) => (
                    <li key={w.personId}>
                      {w.name}, {w.role}. {w.touches} source(s), last {w.lastTouchDaysAgo} days ago.
                      {w.left && <span className="err"> Has left.</span>}
                      {!w.left && w.leavingSoon && <span className="err"> Leaves in {w.leavingInDays} days.</span>}
                    </li>
                  ))}
                </ul>
              )}
              <h2>If it stops</h2>
              <p>
                {data.blast.sameLine} other assets on the line, {data.blast.sameLineCritical} of them Critical. {data.blast.sameSubnet} in {data.blast.subnet} <Chip k="SCAN" />.{' '}
                <span className="muted">{data.blast.sentence}</span>
              </p>
              <div className="bar">
                {data.confirmed
                  ? <span className="ok">Checked in person {data.confirmed.daysAgo === 0 ? 'today' : `${data.confirmed.daysAgo} days ago`}.</span>
                  : !asking
                    ? <button className="btn primary" disabled={busy} onClick={() => setAsking(true)}>I checked this</button>
                    : (
                      <span className="confirmbox">
                        You stood next to it and it is what the card says?
                        <button className="btn primary" onClick={confirm}>Yes</button>
                        <button className="btn subtle" onClick={() => setAsking(false)}>No</button>
                      </span>
                    )}
              </div>
            </div>
          </div>

          <h2>Pages and tickets <Chip k="GEN" /></h2>
          {pages.length + issues.length === 0 ? <Empty>{own ? 'None counted in what was read.' : 'None counted. Nobody wrote anything down.'}</Empty> : (
            <table>
              <thead><tr><th>Source</th><th>Matched on</th><th className="r">Confidence</th><th className="r">Age, days</th></tr></thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.id}>
                    <td><ExtLink href={p.url}>{p.title}</ExtLink> <span className="muted small">page, {p.author}</span></td>
                    <td className="small">{p.matchedOn}: "{p.evidence}"</td>
                    <td className="r">{p.confidence}</td>
                    <td className="r">{p.lastEditedDaysAgo}</td>
                  </tr>
                ))}
                {issues.map((i) => (
                  <tr key={i.id}>
                    <td><ExtLink href={i.url}>{i.jiraKey ?? i.id}</ExtLink> {i.title} <span className="muted small">{i.status}</span></td>
                    <td className="small">{i.matchedOn}: "{i.evidence}"</td>
                    <td className="r">{i.confidence}</td>
                    <td className="r">{i.createdDaysAgo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.maybe.length > 0 && (
            <>
              <h3>Maybe, not counted</h3>
              <ul className="plain muted">
                {data.maybe.map((m) => <li key={m.id}><ExtLink href={m.url}>{m.title}</ExtLink>, {m.matchedOn} "{m.evidence}", confidence {m.confidence}</li>)}
              </ul>
            </>
          )}

          <h2>Open findings <Chip k="SCAN" /></h2>
          {data.openFindings.length === 0 ? <Empty>{own ? 'None in your asset list. That does not mean there are none.' : 'No open findings in the scan.'}</Empty> : (
            <table>
              <thead><tr><th>CVE</th><th>Severity</th><th className="r">Score</th><th>Exploit</th><th>Summary</th></tr></thead>
              <tbody>
                {data.openFindings.map((f) => (
                  <tr key={f.id}>
                    <td className="num"><ExtLink href={f.advisoryUrl}>{f.cve}</ExtLink></td>
                    <td>{f.severity}</td>
                    <td className="r">{f.score ?? 'not known'}</td>
                    <td className="small">{f.exploit ?? ''}</td>
                    <td className="small">{f.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
