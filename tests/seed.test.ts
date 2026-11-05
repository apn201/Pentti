import { describe, expect, it } from 'vitest';
import { bundledDataset } from '../src/store/dataset';
import {
  DEMO_LABEL, idFromLabels, idLabel, issueDescription, issueLabels, mdToStorage, pageBody, pickIssueType,
} from '../src/seed/format';
import { nextToCreate, nextToDelete, pickableSpaces, progress, ROOT_ID, units, type SeededMap } from '../src/seed/plan';

describe('spaces to pick', () => {
  it('offers every space type a new site creates, sorted, without personal ones', () => {
    const r = pickableSpaces([
      { id: 3, key: 'B', name: 'Beta', type: 'knowledge_base' },
      { id: 1, key: 'A', name: 'Alpha', type: 'collaboration' },
      { id: 2, key: 'C', name: 'Classic', type: 'global' },
      { id: 4, key: '~me', name: 'Me', type: 'personal' },
    ]);
    expect(r).toEqual([{ id: '1', key: 'A', name: 'Alpha' }, { id: '3', key: 'B', name: 'Beta' }, { id: '2', key: 'C', name: 'Classic' }]);
  });
});

const data = bundledDataset();
const people = new Map(data.people.map((p) => [p.id, p]));
const all = units(data);

function seedAll(map: SeededMap, n = 10) {
  let steps = 0;
  for (;;) {
    const batch = nextToCreate(all, map, n);
    if (!batch.length) return steps;
    for (const u of batch) map[u.id] = { kind: u.kind, remoteId: 'r_' + u.id };
    steps++;
  }
}

describe('plan', () => {
  it('has one root, a section per source space, every page and issue', () => {
    const spaces = new Set(data.pages.map((p) => p.space));
    expect(all.filter((u) => u.kind === 'root')).toHaveLength(1);
    expect(all.filter((u) => u.kind === 'section')).toHaveLength(spaces.size);
    expect(all.filter((u) => u.kind === 'page')).toHaveLength(data.pages.length);
    expect(all.filter((u) => u.kind === 'issue')).toHaveLength(data.issues.length);
    expect(new Set(all.map((u) => u.id)).size).toBe(all.length);
  });

  it('never puts a unit in the same step as its parent', () => {
    const map: SeededMap = {};
    for (;;) {
      const batch = nextToCreate(all, map, 10);
      if (!batch.length) break;
      const ids = new Set(batch.map((u) => u.id));
      for (const u of batch) {
        if (u.parent) {
          expect(ids.has(u.parent)).toBe(false);
          expect(map[u.parent]).toBeDefined();
        }
      }
      for (const u of batch) map[u.id] = { kind: u.kind, remoteId: 'x' };
    }
  });

  it('starts with the root alone and seeds everything in a bounded number of steps', () => {
    expect(nextToCreate(all, {}, 10).map((u) => u.id)).toContain(ROOT_ID);
    expect(nextToCreate(all, {}, 10).some((u) => u.kind === 'section' || u.kind === 'page')).toBe(false);
    const map: SeededMap = {};
    const steps = seedAll(map);
    expect(steps).toBeLessThanOrEqual(30);
    expect(progress(all, map).done).toBe(all.length);
  });

  it('a second load creates nothing', () => {
    const map: SeededMap = {};
    seedAll(map);
    expect(nextToCreate(all, map, 10)).toEqual([]);
  });

  it('reset deletes leaves before parents and ends empty', () => {
    const map: SeededMap = {};
    seedAll(map);
    for (;;) {
      const batch = nextToDelete(all, map, 10);
      if (!batch.length) break;
      for (const u of batch) {
        const children = all.filter((c) => c.parent === u.id && map[c.id]);
        expect(children).toEqual([]);
      }
      for (const u of batch) delete map[u.id];
    }
    expect(Object.keys(map)).toEqual([]);
  });

  it('reset also removes seeded ids the current dataset does not know', () => {
    const map: SeededMap = { is_999: { kind: 'issue', remoteId: '1' } };
    expect(nextToDelete(all, map, 10).map((u) => u.id)).toEqual(['is_999']);
  });

  it('progress counts pages with the root and sections', () => {
    const p = progress(all, {});
    expect(p.issues.total).toBe(data.issues.length);
    expect(p.pages.total).toBe(all.length - data.issues.length);
    expect(p.done).toBe(0);
  });
});

describe('format', () => {
  it('labels round trip', () => {
    expect(idFromLabels(['kind:breakdown', DEMO_LABEL, idLabel('is_001')])).toBe('is_001');
    expect(idFromLabels([DEMO_LABEL])).toBeNull();
    expect(idFromLabels([`${DEMO_LABEL}:is_002`])).toBe('is_002');
    for (const id of ['root', 'sec_ops', 'pg_001', 'is_150']) expect(idLabel(id)).toMatch(/^[a-z0-9_-]+$/);
  });

  it('issue labels have no spaces and carry the demo label and id', () => {
    for (const i of data.issues) {
      const l = issueLabels(i);
      expect(l).toContain(DEMO_LABEL);
      expect(l).toContain(idLabel(i.id));
      for (const x of l) expect(x).not.toMatch(/\s/);
    }
  });

  it('converts the markdown subset', () => {
    const s = mdToStorage('## Head\n\nLine one\nline two\n\n- a\n- b\n\n1. x\n2. y\n\n| A | B |\n|---|---|\n| 1 | <2> |\n\nSee https://example.org/x');
    expect(s).toBe(
      '<h2>Head</h2><p>Line one<br />line two</p><ul><li>a</li><li>b</li></ul><ol><li>x</li><li>y</li></ol>'
      + '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>&lt;2&gt;</td></tr></tbody></table>'
      + '<p>See <a href="https://example.org/x">https://example.org/x</a></p>',
    );
  });

  it('every page body is well formed enough: no raw markdown table or heading left', () => {
    for (const p of data.pages) {
      const b = pageBody(p, people);
      expect(b).toContain(`Pentti id ${p.id}`);
      expect(b).toContain('fictional');
      expect(b).not.toMatch(/(^|>)\s*\|/);
      expect(b).not.toMatch(/(^|>)##/);
      expect(b.split('<table>').length).toBe(b.split('</table>').length);
    }
  });

  it('page header names a fictional author or says not known', () => {
    const p = data.pages.find((x) => x.authorId === 'p_pentti') ?? data.pages[0];
    expect(pageBody(p, people)).toMatch(/Written by .* \(fictional\)\./);
    expect(pageBody({ ...p, authorId: null }, people)).toContain('Written by not known.');
  });

  it('issue description is ADF with the app dates in the header', () => {
    const i = data.issues[0];
    const d = issueDescription(i, people) as { type: string; content: { content: { text: string }[] }[] };
    expect(d.type).toBe('doc');
    expect(d.content[0].content[0].text).toContain(`Pentti id ${i.id}`);
    expect(d.content[0].content[0].text).toContain('(app date)');
  });

  it('copy has no banned characters', () => {
    const texts = [...data.pages.map((p) => pageBody(p, people)), ...data.issues.map((i) => JSON.stringify(issueDescription(i, people)))];
    for (const t of texts) expect(t).not.toMatch(/[–—‘’“”!]/);
  });

  it('picks an issue type the project has', () => {
    const sd = [{ id: '1', name: 'Incident' }, { id: '2', name: 'Service Request' }, { id: '3', name: 'Task' }, { id: '4', name: 'Sub-task', subtask: true }];
    const sw = [{ id: '10', name: 'Bug' }, { id: '11', name: 'Story' }, { id: '12', name: 'Task' }];
    expect(pickIssueType('Incident', sd)).toBe('1');
    expect(pickIssueType('Request', sd)).toBe('2');
    expect(pickIssueType('Change', sd)).toBe('3');
    expect(pickIssueType('Incident', sw)).toBe('10');
    expect(pickIssueType('Request', sw)).toBe('12');
    expect(pickIssueType('Task', [{ id: '9', name: 'Epic' }])).toBe('9');
    expect(pickIssueType('Task', [])).toBeNull();
  });
});
