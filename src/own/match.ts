// Matching for own data. Deterministic, no model. A separate class from src/match/link.ts, which keeps
// the demo's naming pattern and its measured results. Real names have no fixed pattern, so names are
// looked up as whole tokens, and a name that could be an ordinary word only ever counts as a maybe.
import type { Asset, Link, MatchType } from '../types';
import { CONFIDENCE, REUSED_HISTORY, type Doc } from '../match/link';
import { NO_PLANT } from './csv';

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const NAME_TOKEN = /[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?/g;
const LINE_NEAR = /^[^.\n|]{0,24}?\bline\s+(\d+)/;
const MIN_MODEL = 5;
const MIN_STRONG_NAME = 4;
export const MAX_MACHINES_PER_DOC = 25;
const LIST_CONFIDENCE = 0.3;

/** plc-14 or srv.site1 are names. "printer" or "plc" could be any sentence. */
export function isStrongName(name: string): boolean {
  return name.length >= MIN_STRONG_NAME && /[0-9._-]/.test(name) && !/^\d+$/.test(name);
}

function add<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) { if (!list.includes(v)) list.push(v); }
  else m.set(k, [v]);
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

export class OwnMatcher {
  private names = new Map<string, Asset[]>();   // hostname, and its first label when it has dots
  private former = new Map<string, Asset[]>();
  private ipNow = new Map<string, Asset[]>();
  private ipOld = new Map<string, Asset[]>();
  private nick = new Map<string, Asset[]>();
  private models: { text: string; assets: Asset[] }[];
  private plants: string[];

  constructor(assets: Asset[]) {
    const model = new Map<string, Asset[]>();
    for (const a of assets) {
      if (a.hostname) {
        const host = a.hostname.toLowerCase();
        add(this.names, host, a);
        if (host.includes('.')) add(this.names, host.split('.')[0], a);
      }
      if (a.ip) add(this.ipNow, a.ip, a);
      for (const ip of a.ipHistory) add(this.ipOld, ip, a);
      for (const n of a.formerNames) add(this.former, n.toLowerCase(), a);
      if (a.nickname) add(this.nick, a.nickname.toLowerCase(), a);
      if (a.model && a.model.length >= MIN_MODEL) add(model, a.model.toLowerCase(), a);
    }
    this.models = [...model.entries()].map(([text, list]) => ({ text, assets: list })).sort((x, y) => y.text.length - x.text.length);
    this.plants = [...new Set(assets.map((a) => a.plant))].filter((p) => p !== NO_PLANT);
  }

  match(doc: Doc): Link[] {
    const text = doc.text.toLowerCase();
    const best = new Map<string, Link>();
    const put = (a: Asset, matchType: MatchType, evidence: string, confidence = CONFIDENCE[matchType]) => {
      const prev = best.get(a.id);
      if (!prev || confidence > prev.confidence) {
        best.set(a.id, { assetId: a.id, source: doc.id, sourceKind: doc.kind, matchType, confidence, evidence });
      }
    };

    for (const m of text.matchAll(NAME_TOKEN)) {
      const t = m[0];
      const hosts = this.names.get(t);
      if (hosts) for (const a of hosts) {
        if (hosts.length === 1 && isStrongName(t)) put(a, 'hostname', t);
        else put(a, 'nickname_ambiguous', t);
      }
      const old = this.former.get(t);
      if (old) for (const a of old) {
        if (old.length === 1 && isStrongName(t)) put(a, 'former_name', t);
        else put(a, 'nickname_ambiguous', t);
      }
    }

    for (const m of text.matchAll(IPV4)) {
      const ip = m[0];
      const now = this.ipNow.get(ip) ?? [];
      const old = this.ipOld.get(ip) ?? [];
      if (old.length) {
        const hist = now.length ? REUSED_HISTORY : CONFIDENCE.ip_history;
        for (const a of old) put(a, old.length === 1 ? 'ip_history' : 'ip_shared', ip, old.length === 1 ? hist : CONFIDENCE.ip_shared);
        for (const a of now) put(a, 'ip_reused', ip);
      } else if (now.length === 1) put(now[0], 'ip', ip);
      else for (const a of now) put(a, 'ip_shared', ip);
    }

    const context = new Set(this.plants.filter((p) => phrase(text, p.toLowerCase())));
    for (const [name, list] of this.nick) {
      if (!phrase(text, name)) continue;
      const inContext = context.size ? list.filter((a) => context.has(a.plant)) : list;
      if (inContext.length === 1 && name.length >= MIN_STRONG_NAME) put(inContext[0], 'nickname', name);
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
        const onLine = line ? inPlant.filter((a) => a.line === `L${line}` || a.line === line) : [];
        if (onLine.length === 1) put(onLine[0], 'model_line', model);
        else if (!line && inPlant.length === 1) put(inPlant[0], 'model_plant', model);
      }
    }

    // A page that names this many machines is a list. It says they exist, it does not document them.
    const links = [...best.values()].sort((x, y) => x.assetId.localeCompare(y.assetId));
    return links.length > MAX_MACHINES_PER_DOC ? links.map((l) => ({ ...l, confidence: Math.min(l.confidence, LIST_CONFIDENCE) })) : links;
  }
}
