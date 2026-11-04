// Gap map: x = knowledge from 100 to 0, so the bad corner is top right. y = risk.
// Size = open findings, colour = plant, dark ring = Critical. Click opens the asset card.
import { useMemo, useState } from 'react';
import { Chip, Dot, PLANT_COLORS, type Light } from './ui';

export interface Row {
  assetId: string;
  name: string;
  plant: string;
  line: string;
  role: string;
  criticality: string;
  ot: boolean;
  knowledge: number;
  risk: number;
  danger: number;
  openFindings: number;
  lights: { risk: Light; knowledge: Light; danger: Light };
  nothingKnown: boolean;
}

export interface Overview {
  rows: Row[];
  plants: string[];
  counts: { assets: number; criticalNothingKnown: number };
  sentence: string;
  bands: { risk: { red: number; amber: number }; knowledge: { green: number; amber: number } };
}

const W = 900, H = 500, ML = 52, MR = 16, MT = 16, MB = 46;
const PW = W - ML - MR, PH = H - MT - MB;
const xOf = (k: number) => ML + ((100 - k) / 100) * PW;
const yOf = (r: number) => MT + (1 - r / 100) * PH;

// Many assets share the same two scores. A small fixed spread from the id keeps them clickable.
function jitter(id: string, axis: number): number {
  let h = axis * 7919;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 12;
}

export function GapMap({ data, onOpen }: { data: Overview; onOpen: (id: string) => void }) {
  const [plant, setPlant] = useState('all');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; row: Row } | null>(null);

  const rows = useMemo(
    () => data.rows
      .filter((r) => (plant === 'all' || r.plant === plant) && (!criticalOnly || r.criticality === 'Critical'))
      .sort((a, b) => b.openFindings - a.openFindings),
    [data, plant, criticalOnly],
  );
  const cornerX = xOf(data.bands.knowledge.amber);
  // The red corner: knowledge in the red band and risk at least amber.
  const cornerY = yOf(data.bands.risk.amber);
  const inCorner = rows.filter((r) => r.knowledge < data.bands.knowledge.amber && r.risk >= data.bands.risk.amber).length;

  return (
    <section>
      <p className="headline">
        {data.counts.assets} assets <Chip k="SCAN" />. <strong>{data.counts.criticalNothingKnown}</strong> <Chip k="SCORE" /> are Critical and nobody knows anything about them.
      </p>
      <div className="bar">
        <label>
          Plant{' '}
          <select value={plant} onChange={(e) => setPlant(e.target.value)}>
            <option value="all">All plants</option>
            {data.plants.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={criticalOnly} onChange={(e) => setCriticalOnly(e.target.checked)} /> Critical only</label>
        <span className="muted">{rows.length} shown. {inCorner} in the red corner.</span>
      </div>

      <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gap map, knowledge against risk" onMouseLeave={() => setTip(null)}>
        <rect className="corner" x={cornerX} y={MT} width={W - MR - cornerX} height={cornerY - MT} />
        <text className="corner-label" x={cornerX + 8} y={cornerY - 8}>Risky and nobody knows: {inCorner} assets</text>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={`x${v}`}>
            <line className="axis" x1={xOf(v)} x2={xOf(v)} y1={MT} y2={MT + PH} />
            <text x={xOf(v)} y={MT + PH + 16} textAnchor="middle">{v}</text>
          </g>
        ))}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={`y${v}`}>
            <line className="axis" x1={ML} x2={ML + PW} y1={yOf(v)} y2={yOf(v)} />
            <text x={ML - 8} y={yOf(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}
        <text x={ML + PW / 2} y={H - 8} textAnchor="middle">Knowledge, SCORE. Well known on the left, nothing known on the right.</text>
        <text x={14} y={MT + PH / 2} textAnchor="middle" transform={`rotate(-90 14 ${MT + PH / 2})`}>Risk, SCORE</text>
        {rows.map((r) => (
          <circle
            key={r.assetId}
            className={r.criticality === 'Critical' ? 'critical' : ''}
            cx={xOf(r.knowledge) + jitter(r.assetId, 1)}
            cy={yOf(r.risk) + jitter(r.assetId, 2)}
            r={Math.min(16, 3 + 1.5 * Math.sqrt(r.openFindings))}
            fill={PLANT_COLORS[r.plant] ?? '#888'}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, row: r })}
            onClick={() => onOpen(r.assetId)}
          />
        ))}
      </svg>

      <div className="legend">
        {data.plants.map((p) => <span key={p}><i style={{ background: PLANT_COLORS[p] }} />{p}</span>)}
        <span>Dark ring: Critical</span>
        <span>Size: open findings <Chip k="SCAN" /></span>
        <span>Dots are spread a little where they overlap.</span>
      </div>

      {tip && (
        <div className="tip" style={{ left: tip.x + 14, top: tip.y + 10 }}>
          <strong>{tip.row.name}</strong>
          <div className="muted">{tip.row.plant} {tip.row.line}, {tip.row.role}, {tip.row.criticality}</div>
          <div><Dot light={tip.row.lights.knowledge} kind="knowledge" /> Knowledge {tip.row.knowledge} <Chip k="SCORE" /></div>
          <div><Dot light={tip.row.lights.risk} kind="risk" /> Risk {tip.row.risk} <Chip k="SCORE" /></div>
          <div><Dot light={tip.row.lights.danger} kind="danger" /> Danger {tip.row.danger} <Chip k="SCORE" /></div>
          <div>Open findings {tip.row.openFindings} <Chip k="SCAN" /></div>
          {tip.row.nothingKnown && <div className="err">Nothing known.</div>}
        </div>
      )}
    </section>
  );
}
