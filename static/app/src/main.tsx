// Pentti page (FACTORY_BUILD.md section 10): gap map, closing list, asset card, people.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { view } from '@forge/bridge';
import { AssetCard } from './AssetCard';
import { Closing } from './Closing';
import { GapMap, type Overview } from './GapMap';
import { People } from './People';
import { call, Chip, Empty, errorText, setOwnData } from './ui';
import logo from './logo-tervaniemi.png';
import './style.css';

type Tab = 'map' | 'closing' | 'asset' | 'people';
const TABS: [Tab, string][] = [['map', 'Gap map'], ['closing', 'Closing list'], ['asset', 'Asset card'], ['people', 'People']];

function App() {
  const [tab, setTab] = useState<Tab>('map');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadOverview = () => call<Overview>('overview').then((o) => {
    setOwnData(!!o.own);
    setOverview(o);
  }).catch((e) => setError(errorText(e)));
  const own = overview?.own;

  // Deep links: <page>/asset/<assetId> opens that card. Agent answers and graph cards link here.
  const history = useRef<Awaited<ReturnType<typeof view.createHistory>> | null>(null);
  const follow = (path: string) => {
    const m = /^\/asset\/([a-z0-9_]+)$/.exec(path);
    if (m) {
      setAssetId(m[1]);
      setTab('asset');
    }
  };

  useEffect(() => {
    view.theme.enable().catch(() => undefined);
    loadOverview();
    view.createHistory().then((h) => {
      history.current = h;
      follow(h.location.pathname);
      h.listen(() => follow(h.location.pathname));
    }).catch(() => undefined);
  }, []);

  const open = (id: string) => {
    setAssetId(id);
    setTab('asset');
    history.current?.push(`/asset/${id}`);
  };

  return (
    <main>
      {own ? (
        <header className="brand">
          <p className="muted small">
            <strong>Your own data, imported {own.importedOn}. Proof of concept, not for production use.</strong> Read only, nothing here writes to Jira or Confluence, and only Jira admins can see it. Asset list <Chip k="SCAN" />, pages and tickets read from {[own.spaceKey, own.projectKey].filter(Boolean).join(' and ') || 'nowhere, none were picked'} <Chip k="GEN" />, scores computed <Chip k="SCORE" />. People are not imported. Not a safety, security or compliance assessment.
          </p>
        </header>
      ) : (
      <header className="brand">
        <img src={logo} alt="Tervaniemi Works logo" />
        <p className="muted small">
          Demo. Tervaniemi Works is a fictional company, bundled with the app. Nothing here comes from your own machines, pages, tickets or people. Machines from a real anonymized scan <Chip k="SCAN" />, pages, tickets and people generated <Chip k="GEN" />, scores computed <Chip k="SCORE" />.
        </p>
      </header>
      )}
      <nav className="tabs">
        {TABS.filter(([key]) => !own || key !== 'people').map(([key, title]) => (
          <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>{title}</button>
        ))}
      </nav>
      {error && <p className="err">{error}</p>}
      {tab === 'map' && (overview ? <GapMap data={overview} onOpen={open} /> : !error && <Empty>Loading.</Empty>)}
      {tab === 'closing' && <Closing plants={overview?.plants ?? []} onOpen={open} readOnly={!!own} />}
      {tab === 'asset' && <AssetCard assetId={assetId} onOpen={open} onChanged={loadOverview} />}
      {tab === 'people' && !own && <People />}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
