// Risk score, 0 to 100, and danger (FACTORY_BUILD.md section 7). Pure.
// risk = round(base * critW + min(cap, factor * log2(1 + openCriticalOrHigh) + exploitBonus))
import type { Asset, Finding, ScoringConfig } from '../types';

export interface Risk {
  score: number;
  critWeight: number;
  openCriticalOrHigh: number;
  exploitBonus: number;
}

const OPEN = new Set(['open', 'reopen']);

export function risk(asset: Asset, findings: Finding[], cfg: ScoringConfig): Risk {
  const r = cfg.risk;
  const critWeight = asset.criticality === 'Critical' ? r.crit_weight.Critical : asset.criticality === 'High' ? r.crit_weight.High : r.crit_weight.other;
  const open = findings.filter((f) => f.assetId === asset.id && OPEN.has(f.status));
  const openCriticalOrHigh = open.filter((f) => f.severity === 'Critical' || f.severity === 'High').length;
  const exploitBonus = open.some((f) => (f.exploitValue ?? 0) >= r.exploit_threshold) ? r.exploit_bonus : 0;
  const findingsPart = Math.min(r.findings_cap, r.findings_factor * Math.log2(1 + openCriticalOrHigh) + exploitBonus);
  return { score: Math.round(r.base * critWeight + findingsPart), critWeight, openCriticalOrHigh, exploitBonus };
}

/** Danger = risk * (100 - knowledge) / 100. What is risky and unknown at the same time. */
export function danger(riskScore: number, knowledgeScore: number): number {
  return (riskScore * (100 - knowledgeScore)) / 100;
}
