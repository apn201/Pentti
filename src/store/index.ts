// In-memory index over one dataset. At 500 assets a cached index answers every query in section 8.
import type { Asset, Dataset, Finding, Issue, Link, Page, Person } from '../types';

export const MAX_CANDIDATES = 5;

export interface Candidate {
  asset: Asset;
  why: string;   // which field matched, for the agent to say
  rank: number;  // lower is better
}

export class Index {
  readonly assets: Asset[];
  private byId = new Map<string, Asset>();
  private findingsBy = new Map<string, Finding[]>();
  private linksBy = new Map<string, Link[]>();
  private pageById = new Map<string, Page>();
  private issueById = new Map<string, Issue>();
  private personById = new Map<string, Person>();

  constructor(readonly data: Dataset, readonly links: Link[] = []) {
    this.assets = data.assets;
    for (const a of data.assets) this.byId.set(a.id, a);
    for (const f of data.findings) push(this.findingsBy, f.assetId, f);
    for (const l of links) push(this.linksBy, l.assetId, l);
    for (const p of data.pages) this.pageById.set(p.id, p);
    for (const i of data.issues) this.issueById.set(i.id, i);
    for (const p of data.people) this.personById.set(p.id, p);
  }

  asset(id: string): Asset | undefined {
    return this.byId.get(id);
  }

  page(id: string): Page | undefined {
    return this.pageById.get(id);
  }

  issue(id: string): Issue | undefined {
    return this.issueById.get(id);
  }

  person(id: string): Person | undefined {
    return this.personById.get(id);
  }

  byPlant(plant: string): Asset[] {
    const p = plant.toLowerCase();
    return this.assets.filter((a) => a.plant.toLowerCase() === p);
  }

  byLine(plant: string, line: string): Asset[] {
    const l = line.toUpperCase();
    return this.byPlant(plant).filter((a) => a.line === l);
  }

  findingsFor(assetId: string): Finding[] {
    return this.findingsBy.get(assetId) ?? [];
  }

  linksFor(assetId: string): Link[] {
    return this.linksBy.get(assetId) ?? [];
  }

  /**
   * Text search over hostname, nickname, ip, former names and model. Returns up to five candidates,
   * best first. Never a single guess: the caller asks which one when there are several.
   */
  search(text: string): Candidate[] {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const out: Candidate[] = [];
    for (const a of this.assets) {
      const c = rankAsset(a, q);
      if (c) out.push({ asset: a, ...c });
    }
    out.sort((x, y) => x.rank - y.rank || (x.asset.hostname ?? x.asset.id).localeCompare(y.asset.hostname ?? y.asset.id));
    if (out.length && out[0].rank <= 1) {
      // exact hits win, partial hits are noise next to them
      return out.filter((c) => c.rank <= 1).slice(0, MAX_CANDIDATES);
    }
    return out.slice(0, MAX_CANDIDATES);
  }
}

function rankAsset(a: Asset, q: string): { why: string; rank: number } | null {
  const host = a.hostname?.toLowerCase();
  const nick = a.nickname?.toLowerCase();
  if (host === q || a.id === q) return { why: 'hostname', rank: 0 };
  if (a.ip === q) return { why: 'ip', rank: 0 };
  if (nick === q) return { why: 'nickname', rank: 1 };
  if (a.formerNames.some((n) => n.toLowerCase() === q)) return { why: 'former name', rank: 1 };
  if (a.ipHistory.includes(q)) return { why: 'old ip', rank: 1 };
  if (nick && nick.includes(q)) return { why: 'nickname', rank: 2 };
  if (host && host.includes(q)) return { why: 'hostname', rank: 3 };
  if (a.model && a.model.toLowerCase().includes(q)) return { why: 'model', rank: 4 };
  return null;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}
