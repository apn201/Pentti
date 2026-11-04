// View models for the Pentti page (FACTORY_BUILD.md section 10). Pure, like core.ts.
// The UI draws what these return and never computes a number itself.
import type { Index } from '../store/index';
import type { AssetScore } from '../score';
import { lights } from '../score/bands';
import { monthsToDays } from '../score/knowledge';
import type { Confirmation } from '../types';
import { blastRadius, explainAsset, label, touches, whoKnows, type Site } from './core';

const OPEN = new Set(['open', 'reopen']);

/** Nothing known: no name and not one page or ticket counted for the asset. */
export function nothingKnown(index: Index, s: AssetScore): boolean {
  const min = index.data.scoring.match_min_confidence;
  return s.knowledge.parts.name.points === 0 && !index.linksFor(s.assetId).some((l) => l.confidence >= min);
}

export function overview(index: Index, scores: AssetScore[]) {
  const cfg = index.data.scoring;
  const rows = scores.map((s) => {
    const a = index.asset(s.assetId)!;
    const open = index.findingsFor(a.id).filter((f) => OPEN.has(f.status)).length;
    return {
      assetId: a.id,
      name: label(a),
      plant: a.plant,
      line: a.line,
      role: a.role,
      criticality: a.criticality,
      ot: a.ot,
      knowledge: s.knowledge.score,
      risk: s.risk,
      danger: Math.round(s.danger * 10) / 10,
      openFindings: open,
      lights: lights({ risk: s.risk, knowledge: s.knowledge.score, danger: s.danger }, cfg),
      nothingKnown: nothingKnown(index, s),
    };
  });
  const criticalNothingKnown = rows.filter((r) => r.criticality === 'Critical' && r.nothingKnown).length;
  return {
    rows,
    plants: [...new Set(rows.map((r) => r.plant))].sort(),
    counts: { assets: rows.length, criticalNothingKnown },
    sentence: `${rows.length} assets. ${criticalNothingKnown} are Critical and nobody knows anything about them.`,
    bands: cfg.bands,
  };
}

/**
 * Bus factor per person. Recent = a counted page or ticket inside the owner window. Sole = the only
 * person still here who touched the asset recently. People who left keep their all-time count.
 */
export function peopleView(index: Index, scores: AssetScore[], site: Site) {
  const cfg = index.data.scoring;
  const window = monthsToDays(cfg.windows_months.owner_activity);
  const per = new Map<string, { touched: Set<string>; recent: Set<string>; sole: Set<string>; soleCritical: Set<string> }>();
  const get = (pid: string) => {
    let e = per.get(pid);
    if (!e) per.set(pid, (e = { touched: new Set(), recent: new Set(), sole: new Set(), soleCritical: new Set() }));
    return e;
  };
  for (const s of scores) {
    const a = index.asset(s.assetId)!;
    const t = touches(index, index.linksFor(a.id), cfg.match_min_confidence, site.elapsedDays);
    const recentActive: string[] = [];
    for (const x of t) {
      const e = get(x.personId);
      e.touched.add(a.id);
      const p = index.person(x.personId);
      if (x.lastDaysAgo <= window) {
        e.recent.add(a.id);
        if (p && p.leftDaysAgo === null) recentActive.push(x.personId);
      }
    }
    if (recentActive.length === 1) {
      const e = get(recentActive[0]);
      e.sole.add(a.id);
      if (a.criticality === 'Critical') e.soleCritical.add(a.id);
    }
  }
  const rows = index.data.people.map((p) => {
    const e = per.get(p.id);
    const leavingInDays = p.leavingInDays === null ? null : p.leavingInDays - site.elapsedDays;
    const sole = e?.sole.size ?? 0;
    return {
      personId: p.id,
      name: `${p.name} (fictional)`,
      role: p.role,
      plant: p.plant,
      left: p.leftDaysAgo !== null,
      leftDaysAgo: p.leftDaysAgo === null ? null : p.leftDaysAgo + site.elapsedDays,
      leavingInDays,
      leavingSoon: leavingInDays !== null && leavingInDays <= cfg.leaving_days_threshold,
      touched: e?.touched.size ?? 0,
      recent: e?.recent.size ?? 0,
      soleKnower: sole,
      soleCritical: e?.soleCritical.size ?? 0,
      note: leavingInDays !== null && sole > 0
        ? `The only name on ${sole} machines leaves too.`
        : null,
    };
  });
  rows.sort((x, y) => y.soleKnower - x.soleKnower || y.recent - x.recent || x.personId.localeCompare(y.personId));
  return { rows, ownerWindowMonths: cfg.windows_months.owner_activity };
}

export function assetView(
  index: Index,
  score: AssetScore,
  byId: Map<string, AssetScore>,
  site: Site,
  confirmations: Confirmation[],
  gapTaskKey: string | null,
) {
  const cfg = index.data.scoring;
  const a = index.asset(score.assetId)!;
  const explain = explainAsset(index, score, site);
  const blast = blastRadius(index, byId, a.id);
  const findings = index.findingsFor(a.id)
    .filter((f) => OPEN.has(f.status))
    .sort((x, y) => (y.score ?? 0) - (x.score ?? 0) || x.cve.localeCompare(y.cve))
    .slice(0, 50)
    .map((f) => ({ id: f.id, cve: f.cve, severity: f.severity, score: f.score, exploit: f.exploitLabel, summary: f.summary, advisoryUrl: f.advisoryUrl }));
  const conf = confirmations.filter((c) => c.assetId === a.id).sort((x, y) => x.daysAgo - y.daysAgo)[0] ?? null;
  return {
    ...explain,
    lights: lights({ risk: score.risk, knowledge: score.knowledge.score, danger: score.danger }, cfg),
    who: whoKnows(index, a.id, site).people,
    blast: { sentence: blast.sentence, sameLine: blast.sameLine.count, sameLineCritical: blast.sameLine.critical, sameSubnet: blast.sameSubnet.count, subnet: blast.sameSubnet.subnet },
    openFindings: findings,
    confirmed: conf ? { daysAgo: conf.daysAgo } : null,
    gapTask: gapTaskKey && site.baseUrl ? { key: gapTaskKey, url: `${site.baseUrl}/browse/${gapTaskKey}` } : gapTaskKey ? { key: gapTaskKey, url: null } : null,
  };
}
