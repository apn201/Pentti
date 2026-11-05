// Asset list import. Pure, runs in the browser for the preview and again on the server, because the
// server never trusts what the browser sends. A blank field stays blank, it becomes "not known" later.
import type { Asset, Criticality } from '../types';

export const MAX_ROWS = 1000;
export const MAX_FIELD = 120;
export const MAX_CHARS = 5_000_000;
export const MAX_COUNT = 500;
export const NO_PLANT = 'Unknown';

export interface OwnAsset extends Asset {
  openCritical: number;
  openHigh: number;
}

export const COLUMNS = {
  hostname: ['hostname', 'host', 'name', 'device', 'device_name'],
  ip: ['ip', 'ip_address', 'ipaddress', 'address'],
  nickname: ['nickname', 'alias'],
  site: ['site', 'plant', 'location', 'factory'],
  line: ['line', 'area', 'cell', 'zone'],
  role: ['role', 'type', 'device_type', 'devicetype'],
  model: ['model', 'product'],
  manufacturer: ['manufacturer', 'vendor', 'make'],
  firmware: ['firmware', 'fw', 'firmware_version', 'version'],
  criticality: ['criticality', 'critical', 'priority'],
  former_names: ['former_names', 'former_name', 'old_names', 'old_name'],
  old_ips: ['old_ips', 'old_ip', 'previous_ip'],
  open_critical: ['open_critical', 'critical_findings'],
  open_high: ['open_high', 'high_findings'],
} as const;

export type Column = keyof typeof COLUMNS;
export type Row = Partial<Record<Column, string>>;

export interface RowError {
  line: number;
  message: string;
}

export interface AssetList {
  rows: Row[];
  assets: OwnAsset[];
  errors: RowError[];
  ignoredColumns: string[];
  fatal?: string;
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

/** Comma, semicolon or tab, whichever the header line uses most. Excel in Finland writes semicolons. */
function delimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (c: string) => first.split(c).length - 1;
  return [';', '\t', ','].reduce((best, c) => (count(c) > count(best) ? c : best), ',');
}

/** RFC 4180 with quoted fields and doubled quotes. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const d = delimiter(text);
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');

function columnOf(header: string): Column | null {
  const h = norm(header);
  for (const [col, names] of Object.entries(COLUMNS) as [Column, readonly string[]][]) {
    if (names.includes(h)) return col;
  }
  return null;
}

function criticality(raw: string): Criticality {
  const c = raw.trim().toLowerCase();
  if (c === 'critical') return 'Critical';
  if (c === 'high') return 'High';
  if (c === 'medium' || c === 'low' || c === 'noncritical' || c === 'non-critical') return 'Noncritical';
  return 'Unassigned';
}

const list = (raw: string) => raw.split(/[|,;\s]+/).map((s) => s.trim()).filter(Boolean);

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** One row to one asset. Returns a message instead of guessing when the row cannot be used. */
export function rowToAsset(row: Row): OwnAsset | string {
  const get = (c: Column) => String(row[c] ?? '').trim();
  for (const c of Object.keys(COLUMNS) as Column[]) {
    if (get(c).length > MAX_FIELD) return `${c} is longer than ${MAX_FIELD} characters.`;
  }
  const hostname = get('hostname') || null;
  const ip = get('ip');
  if (!hostname && !ip) return 'Needs a hostname or an IP address.';
  if (ip && !IPV4.test(ip)) return `"${ip}" is not an IPv4 address.`;
  const oldIps = list(get('old_ips'));
  const bad = oldIps.find((x) => !IPV4.test(x));
  if (bad) return `"${bad}" in old_ips is not an IPv4 address.`;
  const count = (c: Column): number | string => {
    const v = get(c);
    if (!v) return 0;
    if (!/^\d+$/.test(v)) return `${c} must be a whole number, got "${v}".`;
    return Math.min(MAX_COUNT, Number(v));
  };
  const openCritical = count('open_critical');
  if (typeof openCritical === 'string') return openCritical;
  const openHigh = count('open_high');
  if (typeof openHigh === 'string') return openHigh;
  const plant = get('site') || NO_PLANT;
  return {
    id: `o_${fnv(`${(hostname ?? '').toLowerCase()}|${ip}|${plant.toLowerCase()}`)}`,
    hostname,
    nickname: get('nickname') || null,
    plant,
    line: get('line').toUpperCase(),
    role: get('role') || 'unknown',
    deviceType: get('role') || null,
    model: get('model') || null,
    firmware: get('firmware') || null,
    manufacturer: get('manufacturer') || null,
    purdue: null,
    criticality: criticality(get('criticality')),
    entityType: 'managed',
    ot: true,
    ip,
    macs: [],
    flags: [],
    modules: [],
    ipHistory: oldIps,
    formerNames: list(get('former_names')),
    firstSeenDaysAgo: 0,
    lastSeenDaysAgo: 0,
    openCritical,
    openHigh,
  };
}

/** The whole file. Bad rows are listed and left out, the rest can still be imported. */
export function readAssetList(text: string): AssetList {
  const empty: AssetList = { rows: [], assets: [], errors: [], ignoredColumns: [] };
  if (text.length > MAX_CHARS) return { ...empty, fatal: `The file is larger than ${MAX_CHARS} characters.` };
  // Blank lines go, but every row keeps the line number the person sees in their file.
  const table = parseCsv(text).map((cells, i) => ({ cells, line: i + 1 })).filter((r) => r.cells.some((c) => c.trim() !== ''));
  if (table.length < 2) return { ...empty, fatal: 'Needs a header line and at least one row.' };
  const header = table[0].cells.map(columnOf);
  if (!header.includes('hostname') && !header.includes('ip')) {
    return { ...empty, fatal: 'Needs a column called hostname or ip.' };
  }
  const ignoredColumns = table[0].cells.filter((_, i) => !header[i]).map((h) => h.trim()).filter(Boolean);
  if (table.length - 1 > MAX_ROWS) return { ...empty, ignoredColumns, fatal: `At most ${MAX_ROWS} assets, the file has ${table.length - 1}.` };
  const rows: Row[] = [];
  const assets: OwnAsset[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  table.slice(1).forEach(({ cells, line }) => {
    const row: Row = {};
    header.forEach((col, c) => { if (col) row[col] = cells[c] ?? ''; });
    const a = rowToAsset(row);
    if (typeof a === 'string') { errors.push({ line, message: a }); return; }
    const twin = seen.get(a.id);
    if (twin) { errors.push({ line, message: `Same machine as line ${twin}.` }); return; }
    seen.set(a.id, line);
    rows.push(row);
    assets.push(a);
  });
  return { rows, assets, errors, ignoredColumns };
}
