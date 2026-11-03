// Text matching of pages and issues to assets (FACTORY_BUILD.md section 6). Deterministic, no LLM.
// Confidence: 1.0 exact, 0.9 history, 0.7 nickname or reused address, 0.5 model+line, 0.3 maybe.
// Only links at or above match_min_confidence count toward knowledge. The rest are shown as "maybe".
import type { Asset, Dataset, Issue, Link, MatchType, Page } from '../types';

const HOSTNAME = /\b[a-z]+-l\d+-[a-z]+-\d{2}\b/g;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const TOKEN = /[a-z0-9][a-z0-9_-]{4,}/g;
const LINE_NEAR = /^[^.\n|]{0,24}?\bline\s+(\d+)/;

export const CONFIDENCE: Record<MatchType, number> = {
  hostname: 1.0,
  ip: 1.0,
  ip_history: 0.9,
  former_name: 0.9,
  nickname: 0.7,
  model_line: 0.5,
  ip_shared: 0.4,
  ip_reused: 0.3,
  nickname_ambiguous: 0.3,
  model_plant: 0.3,
};

/** ip_history when someone else holds the address now. */
export const REUSED_HISTORY = 0.7;

export interface Doc {
  id: string;
  kind: 'page' | 'issue';
  text: string;
}

export function docsOf(data: Pick<Dataset, 'pages' | 'issues'>): Doc[] {
  return [
    ...data.pages.map((p: Page) => ({ id: p.id, kind: 'page' as const, text: `${p.title}\n${p.bodyMarkdown}` })),
    ...data.issues.map((i: Issue) => ({ id: i.id, kind: 'issue' as const, text: `${i.summary}\n${i.description}` })),
  ];
}

export class Matcher {
  private host = new Map<string, Asset>();
  private ipNow = new Map<string, Asset[]>();
  private ipOld = new Map<string, Asset[]>();
  private former = new Map<string, Asset[]>();
  private nick = new Map<string, Asset[]>();
  private models: { text: string; assets: Asset[] }[];
  private plants: string[];

  constructor(assets: Asset[]) {
    const model = new Map<string, Asset[]>();
    for (const a of assets) {
      if (a.hostname) this.host.set(a.hostname.toLowerCase(), a);
      add(this.ipNow, a.ip, a);
      for (const ip of a.ipHistory) add(this.ipOld, ip, a);
      for (const n of a.formerNames) add(this.former, n.toLowerCase(), a);
      if (a.nickname) add(this.nick, a.nickname.toLowerCase(), a);
      if (a.model && a.model.length >= 5) add(model, a.model.toLowerCase(), a);
    }
    // longest first, so "cpu 414-2 dp" wins over "cpu 414-2" at the same spot
    this.models = [...model.entries()].map(([text, list]) => ({ text, assets: list })).sort((x, y) => y.text.length - x.text.length);
    this.plants = [...new Set(assets.map((a) => a.plant))];
  }

  match(doc: Doc): Link[] {
    const text = doc.text.toLowerCase();
    const best = new Map<string, Link>();
    const put = (a: Asset, matchType: MatchType, evidence: string, confidence = CONFIDENCE[matchType]) => {
      const link: Link = { assetId: a.id, source: doc.id, sourceKind: doc.kind, matchType, confidence, evidence };
      const prev = best.get(a.id);
      if (!prev || link.confidence > prev.confidence) best.set(a.id, link);
    };

    for (const m of text.matchAll(HOSTNAME)) {
      const a = this.host.get(m[0]);
      if (a) put(a, 'hostname', m[0]);
    }

    for (const m of text.matchAll(IPV4)) {
      const ip = m[0];
      const now = this.ipNow.get(ip) ?? [];
      const old = this.ipOld.get(ip) ?? [];
      if (old.length) {
        // The address moved. The text most likely describes the machine that had it,
        // less sure when another machine has the address today.
        const histConf = now.length ? REUSED_HISTORY : CONFIDENCE.ip_history;
        for (const a of old) put(a, old.length === 1 ? 'ip_history' : 'ip_shared', ip, old.length === 1 ? histConf : CONFIDENCE.ip_shared);
        for (const a of now) put(a, 'ip_reused', ip);
      } else if (now.length === 1) {
        put(now[0], 'ip', ip);
      } else {
        for (const a of now) put(a, 'ip_shared', ip);
      }
    }

    for (const m of text.matchAll(TOKEN)) {
      const list = this.former.get(m[0]);
      if (list) for (const a of list) put(a, list.length === 1 ? 'former_name' : 'nickname_ambiguous', m[0]);
    }

    const context = this.plantContext(text, best);

    for (const [name, list] of this.nick) {
      if (!phrase(text, name)) continue;
      const inContext = context.size ? list.filter((a) => context.has(a.plant)) : list;
      if (inContext.length === 1) put(inContext[0], 'nickname', name);
      else for (const a of list) put(a, 'nickname_ambiguous', name);
    }

    const taken: [number, number][] = [];
    for (const { text: model, assets } of this.models) {
      let from = 0;
      for (;;) {
        const at = text.indexOf(model, from);
        if (at < 0) break;
        from = at + model.length;
        if (taken.some(([s, e]) => at < e && from > s)) continue;
        taken.push([at, from]);
        const line = LINE_NEAR.exec(text.slice(from, from + 40))?.[1];
        const inPlant = context.size ? assets.filter((a) => context.has(a.plant)) : [];
        const onLine = line ? inPlant.filter((a) => a.line === `L${line}`) : [];
        if (onLine.length === 1) put(onLine[0], 'model_line', model);
        else if (!line && inPlant.length === 1) put(inPlant[0], 'model_plant', model);
      }
    }

    return [...best.values()].sort((x, y) => x.assetId.localeCompare(y.assetId));
  }

  /** Plants the document is about: named in the text, or holding the machines it names exactly. */
  private plantContext(text: string, found: Map<string, Link>): Set<string> {
    const out = new Set<string>();
    for (const p of this.plants) if (phrase(text, p.toLowerCase())) out.add(p);
    if (!out.size) {
      for (const l of found.values()) {
        if (l.confidence >= CONFIDENCE.former_name) {
          const a = this.host.get(l.evidence) ?? (this.ipNow.get(l.evidence) ?? this.ipOld.get(l.evidence) ?? this.former.get(l.evidence))?.[0];
          if (a) out.add(a.plant);
        }
      }
    }
    return out;
  }
}

export function computeLinks(data: Pick<Dataset, 'assets' | 'pages' | 'issues'>): Link[] {
  const m = new Matcher(data.assets);
  return docsOf(data).flatMap((d) => m.match(d));
}

function phrase(text: string, p: string): boolean {
  let from = 0;
  for (;;) {
    const at = text.indexOf(p, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : text[at - 1];
    const after = text[at + p.length] ?? '';
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    from = at + 1;
  }
}

function add<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}
