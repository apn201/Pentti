// Shapes of data/generated/*.json (FACTORY_BUILD.md 5.3) and of what the app derives from them.

export type Criticality = 'Critical' | 'High' | 'Noncritical' | 'Unassigned';
export type Flag = 'NO_NAME' | 'DUP_IP' | 'UNSUPPORTED' | 'NO_FIRMWARE';

export interface Asset {
  id: string;
  hostname: string | null;
  nickname: string | null;
  plant: string;
  line: string;
  role: string;
  deviceType: string | null;
  model: string | null;
  firmware: string | null;
  manufacturer: string | null;
  purdue: number | null;
  criticality: Criticality;
  entityType: 'managed' | 'unmanaged' | 'unsupported';
  ot: boolean;
  ip: string;
  macs: string[];
  flags: Flag[];
  modules: string[];
  ipHistory: string[];
  formerNames: string[];
  firstSeenDaysAgo: number;
  lastSeenDaysAgo: number;
}

export interface Finding {
  id: string;
  assetId: string;
  cve: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  score: number | null;
  exploitLabel: string | null;
  exploitValue: number | null;
  status: string;
  publishedDaysAgo: number;
  openedDaysAgo: number;
  summary: string;
  advisoryUrl: string | null;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  plant: string | null;
  startedYearsAgo: number | null;
  leavingInDays: number | null;
  leftDaysAgo: number | null;
  bio: string;
}

/** Ground truth written by the generator. The app never reads it, tests do. */
export interface Mention {
  assetId: string;
  kind: 'exact' | 'nick' | 'old' | 'model' | 'model_line' | 'model_plant';
}

export interface Page {
  id: string;
  title: string;
  space: string;
  authorId: string | null;
  class: string;
  lastEditedDaysAgo: number;
  bodyMarkdown: string;
  mentions: Mention[];
}

export interface Issue {
  id: string;
  summary: string;
  type: string;
  status: string;
  reporterId: string;
  assigneeId: string | null;
  createdDaysAgo: number;
  resolvedDaysAgo: number | null;
  description: string;
  labels: string[];
  mentions: Mention[];
}

export interface ScoringConfig {
  knowledge: {
    name: number; owner: number; owner_leaving: number; doc: number;
    doc_fresh: number; history: number; firmware: number; confirmed: number;
  };
  windows_months: { owner_activity: number; doc_fresh: number; history: number; confirmed: number };
  leaving_days_threshold: number;
  risk: {
    crit_weight: { Critical: number; High: number; other: number };
    base: number; findings_factor: number; findings_cap: number;
    exploit_bonus: number; exploit_threshold: number;
  };
  effort_hours: { name: number; owner: number; doc: number; doc_fresh: number; confirmed: number };
  match_min_confidence: number;
}

export interface Dataset {
  assets: Asset[];
  findings: Finding[];
  people: Person[];
  pages: Page[];
  issues: Issue[];
  scoring: ScoringConfig;
}

export type MatchType =
  | 'hostname' | 'ip' | 'ip_shared' | 'ip_history' | 'ip_reused'
  | 'former_name' | 'nickname' | 'nickname_ambiguous' | 'model_line' | 'model_plant';

export interface Link {
  assetId: string;
  source: string;           // page or issue id
  sourceKind: 'page' | 'issue';
  matchType: MatchType;
  confidence: number;       // 1.0 exact ... 0.3 maybe. Below match_min_confidence it is shown, never counted.
  evidence: string;         // the text that matched
}

/** "I checked this" clicks. Kept by the app, keyed by asset. */
export interface Confirmation {
  assetId: string;
  accountId: string;
  daysAgo: number;
}
