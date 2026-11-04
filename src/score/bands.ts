// Traffic lights for the UI. Pure. Bounds come from scoring.json (config/scoring.yml, bands).
// Risk and danger are bad when high, knowledge is bad when low.
import type { ScoringConfig } from '../types';

export type Light = 'red' | 'amber' | 'green';

export function riskLight(score: number, cfg: ScoringConfig): Light {
  const b = cfg.bands.risk;
  return score >= b.red ? 'red' : score >= b.amber ? 'amber' : 'green';
}

export function dangerLight(score: number, cfg: ScoringConfig): Light {
  const b = cfg.bands.danger;
  return score >= b.red ? 'red' : score >= b.amber ? 'amber' : 'green';
}

export function knowledgeLight(score: number, cfg: ScoringConfig): Light {
  const b = cfg.bands.knowledge;
  return score >= b.green ? 'green' : score >= b.amber ? 'amber' : 'red';
}

export interface Lights {
  risk: Light;
  knowledge: Light;
  danger: Light;
}

export function lights(s: { risk: number; knowledge: number; danger: number }, cfg: ScoringConfig): Lights {
  return { risk: riskLight(s.risk, cfg), knowledge: knowledgeLight(s.knowledge, cfg), danger: dangerLight(s.danger, cfg) };
}
