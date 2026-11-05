// Scores for every asset in an index, computed on read (FACTORY_BUILD.md section 8). Never stored.
import type { Confirmation } from '../types';
import type { Index } from '../store/index';
import { knowledge, type Knowledge } from './knowledge';
import { danger, risk, type Risk } from './risk';
import type { Scored } from './closing';

export interface AssetScore extends Scored {
  riskDetail: Risk;
  knowledge: Knowledge;
  danger: number;
}

export function scoreAsset(index: Index, assetId: string, confirmations: Confirmation[] = [], elapsedDays = 0, ownData = false): AssetScore {
  const a = index.asset(assetId);
  if (!a) throw new Error(`unknown asset ${assetId}`);
  const cfg = index.data.scoring;
  const k = knowledge(a, {
    cfg,
    links: index.linksFor(a.id),
    page: (id) => index.page(id),
    issue: (id) => index.issue(id),
    person: (id) => index.person(id),
    confirmations: confirmations.filter((c) => c.assetId === a.id),
    elapsedDays,
    ownData,
  });
  const r = risk(a, index.findingsFor(a.id), cfg);
  return { assetId: a.id, risk: r.score, riskDetail: r, knowledge: k, danger: danger(r.score, k.score) };
}

export function scoreAll(index: Index, confirmations: Confirmation[] = [], elapsedDays = 0, ownData = false): AssetScore[] {
  return index.assets.map((a) => scoreAsset(index, a.id, confirmations, elapsedDays, ownData));
}
