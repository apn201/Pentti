// Asset cards for the Teamwork Graph (FACTORY_BUILD.md section 0 and slice S7). Pure.
// One atlassian:document per asset. The text carries what Rovo should find: names, address, model,
// scores and the three-part answer. Jira issues ride along as issueIdOrKeys associations, Confluence
// pages only as titles and links in the text, the graph has no association for them (D7).
import type { Index } from '../store/index';
import type { AssetScore } from '../score';
import { lights, type Light } from '../score/bands';
import { assetUrl, label, NOT_KNOWN, touches, type Site } from '../actions/core';

export const CARD_TYPE = 'atlassian:document';
export const CARD_SOURCE = { source: 'pentti' };
export const MAX_ASSOCIATIONS = 500;
export const BATCH = 100;

const WORD: Record<'risk' | 'knowledge' | 'danger', Record<Light, string>> = {
  risk: { red: 'high', amber: 'medium', green: 'low' },
  danger: { red: 'high', amber: 'medium', green: 'low' },
  knowledge: { red: 'little known', amber: 'partly known', green: 'well known' },
};

const OPEN = new Set(['open', 'reopen']);

export interface CardOptions {
  now: string;             // ISO time of this sync
  sequence: number;        // updateSequenceNumber, grows with every sync
}

export function assetCard(index: Index, score: AssetScore, site: Site, opts: CardOptions) {
  const cfg = index.data.scoring;
  const a = index.asset(score.assetId)!;
  const url = assetUrl(site, a.id);
  if (!url) throw new Error('The Pentti page url is not known, cards need it.');
  const l = lights({ risk: score.risk, knowledge: score.knowledge.score, danger: score.danger }, cfg);
  const min = cfg.match_min_confidence;
  const links = index.linksFor(a.id).filter((x) => x.confidence >= min);
  const pageLinks = [...new Set(links.filter((x) => x.sourceKind === 'page').map((x) => x.source))];
  const issueIds = [...new Set(links.filter((x) => x.sourceKind === 'issue').map((x) => x.source))];
  const issueKeys = issueIds.map((id) => site.seeded[id]?.key).filter((k): k is string => !!k).slice(0, MAX_ASSOCIATIONS);
  const open = index.findingsFor(a.id).filter((f) => OPEN.has(f.status));
  const people = touches(index, links, min, site.elapsedDays)
    .map((t) => index.person(t.personId))
    .filter((p) => !!p)
    .map((p) => `${p!.name} (fictional, ${p!.role}${p!.leftDaysAgo !== null ? ', has left' : ''})`);
  const notKnown = (Object.keys(score.knowledge.parts) as (keyof typeof score.knowledge.parts)[])
    .filter((d) => score.knowledge.parts[d].points === 0)
    .map((d) => score.knowledge.parts[d].reason);

  const pageLine = (id: string) => {
    const p = index.page(id)!;
    const s = site.seeded[id];
    const href = s && site.baseUrl ? ` ${site.baseUrl}/wiki/pages/viewpage.action?pageId=${s.remoteId}` : '';
    return `- ${p.title}${href}`;
  };
  const issueLine = (id: string) => {
    const i = index.issue(id)!;
    return `- ${site.seeded[id]?.key ?? id}: ${i.summary} (${i.status})`;
  };

  const text = [
    `${label(a)}. Pentti asset card. Tervaniemi Works is a fictional company, the machine comes from an anonymized scan.`,
    `Hostname: ${a.hostname ?? NOT_KNOWN}. Nickname: ${a.nickname ?? NOT_KNOWN}. IP: ${a.ip}.`
      + (a.ipHistory.length ? ` Old IP: ${a.ipHistory.join(', ')}.` : '')
      + (a.formerNames.length ? ` Former name: ${a.formerNames.join(', ')}.` : ''),
    `Plant ${a.plant}, line ${a.line}, role ${a.role}, criticality ${a.criticality}.`,
    `Model: ${a.model ?? NOT_KNOWN}. Manufacturer: ${a.manufacturer ?? NOT_KNOWN}. Firmware: ${a.firmware ?? NOT_KNOWN}.`,
    `Open findings: ${open.length}, of them Critical or High: ${score.riskDetail.openCriticalOrHigh}. Source: scan.`,
    `Knowledge ${score.knowledge.score} of 100 (${WORD.knowledge[l.knowledge]}), risk ${score.risk} (${WORD.risk[l.risk]}), danger ${Math.round(score.danger * 10) / 10} (${WORD.danger[l.danger]}). Computed by Pentti.`,
    people.length ? `People who touched it: ${people.join('; ')}.` : 'People who touched it: nobody.',
    pageLinks.length ? `Pages:\n${pageLinks.map(pageLine).join('\n')}` : 'Pages: none.',
    issueIds.length ? `Tickets:\n${issueIds.map(issueLine).join('\n')}` : 'Tickets: none.',
    notKnown.length ? `Not known:\n${notKnown.map((t) => `- ${t}`).join('\n')}` : 'Not known: nothing the score measures.',
    `Open the card in Pentti: ${url}`,
  ].join('\n');

  const card: Record<string, unknown> = {
    schemaVersion: '1.0',
    id: a.id,
    updateSequenceNumber: opts.sequence,
    displayName: label(a),
    description: `${a.criticality} ${a.role}, ${a.plant} ${a.line}. Knowledge ${score.knowledge.score}, risk ${score.risk}, danger ${Math.round(score.danger * 10) / 10}. Fictional company.`,
    url,
    createdAt: opts.now,
    lastUpdatedAt: opts.now,
    permissions: [{ accessControls: [{ principals: [{ type: 'EVERYONE' }] }] }],
    [CARD_TYPE]: {
      type: { category: 'DOCUMENT', mimeType: 'text/plain' },
      content: { mimeType: 'text/plain', text },
      labels: ['pentti', a.plant.toLowerCase(), a.criticality.toLowerCase()],
    },
  };
  if (issueKeys.length) card.associations = { lastUpdatedAt: opts.now, set: [{ associationType: 'issueIdOrKeys', values: issueKeys }] };
  return card;
}

export function chunks<T>(xs: T[], n = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** External ids of the S0 spike cards, removed on the first real sync. */
export const SPIKE_IDS = ['a_spike1', ...Array.from({ length: 100 }, (_, i) => `a_spikeb${i}`)];
