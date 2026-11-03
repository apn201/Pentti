// Closing list (FACTORY_BUILD.md section 7). Pure.
// For each asset, the gaps a person can close and what each costs in hours. Assets are ranked by
// danger removed per hour, greedy, and the top N come back with their total. It never says
// "document everything".
import type { ScoringConfig } from '../types';
import type { Knowledge } from './knowledge';

export type Action = 'name' | 'owner' | 'doc' | 'doc_refresh' | 'confirm';

export interface Step {
  action: Action;
  hours: number;
  points: number;          // knowledge points gained
  dangerRemoved: number;
}

export interface ClosingItem {
  assetId: string;
  risk: number;
  knowledge: number;
  danger: number;
  steps: Step[];
  hours: number;
  dangerRemoved: number;
  perHour: number;
}

export interface ClosingList {
  items: ClosingItem[];
  totalHours: number;
  dangerRemoved: number;
  totalDanger: number;
  percentRemoved: number;  // of the danger in the scope that was passed in
}

export interface Scored {
  assetId: string;
  risk: number;
  knowledge: Knowledge;
}

export function steps(s: Scored, cfg: ScoringConfig): Step[] {
  const p = s.knowledge.parts;
  const h = cfg.effort_hours;
  const out: Step[] = [];
  const add = (action: Action, hours: number, points: number) => {
    if (points > 0) out.push({ action, hours, points, dangerRemoved: (s.risk * points) / 100 });
  };
  add('name', h.name, p.name.max - p.name.points);
  add('owner', h.owner, p.owner.max - p.owner.points);
  if (p.doc.points === 0) add('doc', h.doc, p.doc.max + p.doc_fresh.max);
  else add('doc_refresh', h.doc_fresh, p.doc_fresh.max - p.doc_fresh.points);
  add('confirm', h.confirmed, p.confirmed.max - p.confirmed.points);
  return out;
}

export function closingList(scope: Scored[], cfg: ScoringConfig, n: number): ClosingList {
  const items: ClosingItem[] = [];
  let totalDanger = 0;
  for (const s of scope) {
    const d = (s.risk * (100 - s.knowledge.score)) / 100;
    totalDanger += d;
    const st = steps(s, cfg);
    const hours = st.reduce((x, y) => x + y.hours, 0);
    const removed = st.reduce((x, y) => x + y.dangerRemoved, 0);
    if (hours > 0 && removed > 0) {
      items.push({ assetId: s.assetId, risk: s.risk, knowledge: s.knowledge.score, danger: d, steps: st, hours, dangerRemoved: removed, perHour: removed / hours });
    }
  }
  items.sort((a, b) => b.perHour - a.perHour || b.danger - a.danger || a.assetId.localeCompare(b.assetId));
  const top = items.slice(0, Math.max(0, n));
  const totalHours = top.reduce((x, y) => x + y.hours, 0);
  const dangerRemoved = top.reduce((x, y) => x + y.dangerRemoved, 0);
  return {
    items: top,
    totalHours,
    dangerRemoved,
    totalDanger,
    percentRemoved: totalDanger > 0 ? Math.round((1000 * dangerRemoved) / totalDanger) / 10 : 0,
  };
}
