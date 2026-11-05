// What the seeder does next (FACTORY_BUILD.md section 11). Pure.
// The seed is a list of units: one root page, one section page per source space, the pages, the issues.
// A unit is done when the seeded map has a remote id for it. Each step takes up to N units whose parent
// is already done, so a step never depends on itself. Reset walks the same list backwards.
import type { Dataset } from '../types';

export type UnitKind = 'root' | 'section' | 'page' | 'issue';

export interface Unit {
  id: string;            // root, sec_ops, pg_001, is_001
  kind: UnitKind;
  parent: string | null; // unit id that must exist first
}

/** What the app remembers about a seeded object. */
export interface Seeded {
  kind: UnitKind;
  remoteId: string;      // Confluence page id or Jira issue id
  key?: string;          // Jira issue key
  title?: string;
}

export type SeededMap = Record<string, Seeded>;

export const ROOT_ID = 'root';
export const sectionId = (space: string) => `sec_${space.toLowerCase()}`;

export function units(data: Pick<Dataset, 'pages' | 'issues'>): Unit[] {
  const spaces = [...new Set(data.pages.map((p) => p.space))];
  return [
    { id: ROOT_ID, kind: 'root', parent: null },
    ...spaces.map((s) => ({ id: sectionId(s), kind: 'section' as const, parent: ROOT_ID })),
    ...data.pages.map((p) => ({ id: p.id, kind: 'page' as const, parent: sectionId(p.space) })),
    ...data.issues.map((i) => ({ id: i.id, kind: 'issue' as const, parent: null })),
  ];
}

/**
 * Spaces an admin can pick. New sites create collaboration and knowledge_base spaces, not global ones,
 * so this goes by leaving out personal spaces, never by asking for one type (limits.md).
 */
export function pickableSpaces(spaces: { id: string | number; key: string; name: string; type?: string }[]) {
  return spaces
    .filter((s) => s.type !== 'personal')
    .map((s) => ({ id: String(s.id), key: s.key, name: s.name }))
    .sort((x, y) => x.name.localeCompare(y.name));
}

/** Next units to create: missing, parent done before this step, at most n. */
export function nextToCreate(all: Unit[], seeded: SeededMap, n: number): Unit[] {
  const out: Unit[] = [];
  for (const u of all) {
    if (out.length >= n) break;
    if (seeded[u.id]) continue;
    if (u.parent && !seeded[u.parent]) continue;
    out.push(u);
  }
  return out;
}

/** Next units to delete: seeded, no seeded child left before this step, at most n. Leaves first. */
export function nextToDelete(all: Unit[], seeded: SeededMap, n: number): Unit[] {
  const known = new Map(all.map((u) => [u.id, u]));
  // Seeded ids the plan does not know (from an older dataset) are leaves.
  const ids = Object.keys(seeded).sort();
  const hasChild = new Set<string>();
  for (const id of ids) {
    const p = known.get(id)?.parent;
    if (p) hasChild.add(p);
  }
  const order = (id: string) => ({ issue: 0, page: 1, section: 2, root: 3 })[seeded[id].kind];
  return ids
    .filter((id) => !hasChild.has(id))
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
    .slice(0, n)
    .map((id) => known.get(id) ?? { id, kind: seeded[id].kind, parent: null });
}

export interface Progress {
  done: number;
  total: number;
  pages: { done: number; total: number };
  issues: { done: number; total: number };
}

export function progress(all: Unit[], seeded: SeededMap): Progress {
  const count = (pred: (u: Unit) => boolean) => {
    const us = all.filter(pred);
    return { done: us.filter((u) => seeded[u.id]).length, total: us.length };
  };
  const t = count(() => true);
  return {
    done: t.done,
    total: t.total,
    pages: count((u) => u.kind !== 'issue'),
    issues: count((u) => u.kind === 'issue'),
  };
}
