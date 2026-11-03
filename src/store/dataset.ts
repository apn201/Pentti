// The generated dataset as bundled with the app. Forge storage gets a copy at "Load the factory" (S4),
// this module is the source for tests and for the first load.
import assets from '../../data/generated/assets.json';
import findings from '../../data/generated/findings.json';
import people from '../../data/generated/people.json';
import pages from '../../data/generated/pages.json';
import issues from '../../data/generated/issues.json';
import scoring from '../../data/generated/scoring.json';
import type { Dataset } from '../types';

export function bundledDataset(): Dataset {
  return {
    assets: assets as Dataset['assets'],
    findings: findings as Dataset['findings'],
    people: people as Dataset['people'],
    pages: pages as Dataset['pages'],
    issues: issues as Dataset['issues'],
    scoring: scoring as Dataset['scoring'],
  };
}
