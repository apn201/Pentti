# PENTTI - build specification (Codegeist 2026)

This file is written for Claude Code. Read it fully before writing code. Work one slice at a time (section 12). Do not start slice N+1 until the "Done when" of slice N is true. Commit after every slice and tag it `sN-done`.

Pentti is a Forge app that measures what a factory does not know about its own machines, then helps close the dangerous gaps first. A Rovo agent called Pentti answers questions about assets and says "nobody knows, here is where I looked" when that is the truth.

Working names (all in `config/names.yml`, change freely): app "Pentti", agent "Ask Pentti", fictional company "Tervaniemi Works".

Deadline: Dec 22 2026, 12:00 PST (22:00 Helsinki). Plan to submit Dec 19-20. The last two days are buffer, not build time.

Category: Apps for Specialized Industries (manufacturing). Bonus targets: Best Agents (Rovo), Best Teamwork Graph integration. Stretch: Best Atlassian MCP. Late decision: Marketplace listing.

## 0. What the Forge docs say (checked Nov 3 2026)

Anything marked VERIFY is not known yet and is resolved in slice S0 by running code, not by reading more docs.

| Area | Fact | Consequence |
|---|---|---|
| Teamwork Graph connector | Module key `graph:connector`. Needs `objectTypes` from a fixed set of 26 (includes `atlassian:document`, `atlassian:software-service`, `atlassian:work-item`). There is no device, asset or vulnerability type. Custom types are not documented. | Assets go into the graph as `atlassian:document` "asset cards" with a url back to the app. Forge storage is the source of truth for scoring. |
| TWG scopes and install | Scopes `read:object:jira`, `write:object:jira`, `delete:object:jira`. Connectors are only available for apps installed into Jira. Installing needs org admin. SDK `@forge/teamwork-graph`, calls `setObjects`, `setRelationships`. | Judges need an org admin account. Say so in the install README. |
| TWG links | `associations` with `associationType: "issueIdOrKeys"` links an object to Jira work items. Max 500 associations per object. Document can link to Jira work items. | Asset card to Jira issue links are free. Asset card to Confluence page links: FAIL in S0, no association type exists. Fallback: page title and url go into the card text, links stay in app storage (D7). |
| TWG stability | The blog says generally available. The limitations page says the API may change with one month notice. | Treat as unstable. Keep the connector code in one module so it can be swapped out. |
| TWG limits | S0: SDK caps `setObjects` at 100 objects, 100 accepted in about 1 s, indexed 3 to 4 min later. `atlassian:document` category must be `DOCUMENT`. | Ingest in batches of 100. Wait about 5 minutes before showing graph results in the video. |
| `rovo:agent` | Prompt is the inline `prompt:` field in the manifest. Agent lists `actions:` by key. Template runtime was `nodejs24.x`. Forge CLI 10.8.0 or newer for the templates. Rovo must be active on the site. Deploy before install. | Keep `prompts/pentti.md` as the readable copy and paste it into the manifest in a build step. |
| `action` | Fields: key, name, function, actionVerb (GET, CREATE, UPDATE, DELETE, TRIGGER), description, inputs (title, type, required, description). Handler `(payload, context)`. Return a string or JSON. 5 MB data cap. Agents triggered by automation will not call CREATE, UPDATE, DELETE or TRIGGER. | LLM inputs can be wrong. Authorize with `context.accountId`, validate every asset id against storage, never trust an input. |
| `rovo:mcp` | In Preview. One per app. Name 30 characters max. `tools` is a list of action keys, 50 max. External clients must be enabled by an admin per installation. Endpoint `https://mcp.atlassian.com/forge/<appId>`. | Only expose GET actions. Stretch slice. |
| Forge function timeout, storage quotas | S0: function timeout 55 s, KVS value max 245,760 characters, about 31 ms per write. Jira refuses a `created` date on create. | Seeder batches stay under 20 s. Large records are split under 240 KiB. App keeps its own dates (D6). |

## 1. Rules that govern every line of code

1. No source, no claim. Every fact the agent states carries the id of the record it came from. If there is no record, the answer is "not known" plus the list of places searched. This is the product, not a fallback.
2. Code scores, the model talks. Knowledge score, risk score and the closing list are pure functions with tests. The agent only phrases what an action returned. Actions return structured JSON with `known`, `not_known`, `searched`, `sources`.
3. Never guess an asset. Ambiguous query returns all candidates, up to 5, and the agent asks which one.
4. Fictional company, labeled. The company, plants, people, pages and tickets are generated. The asset mix comes from an anonymized scanner export. Three chips appear on every number and card: SCAN (from the export), GEN (generated for the demo), SCORE (computed by the app). The README says in the first screen what is real and what is made up.
5. The raw export never enters git. `data/raw/` is gitignored from the first commit. `tools/check_publishable.py` runs before every commit (section 3) and in CI.
6. Dates are stored as "days ago" and resolved against the install date, so the demo never looks stale or in the future.
7. Idempotent write-backs. Creating Jira issues is keyed by an entity property or label `pentti-gap:<assetId>`. Running twice never duplicates.
8. Judge install works from a clean site with no manual data entry. The seeder (S3) exists for this reason. If it does not work, nothing else matters.
9. Copy voice: short sentences, dry, no exclamation marks, no em dashes, no curly quotes. The UI may be funny. The numbers may not be.
10. No third-party logos or music in the video. Screen recordings of the Atlassian UI are unavoidable and fine.
11. Follow the Atlassian Acceptable Use Policy for Rovo. No scraping, no hidden prompts that push the agent to exceed its actions.

## 2. Stack

- Forge app, Node, TypeScript, Forge CLI latest. Jira global page and admin page as Custom UI (React + Vite, `@forge/bridge`). Check current module keys in the manifest reference before writing the manifest.
- Backend: resolvers for the UI, actions for the agent, one function for the connector, one for the seeder.
- Storage: Forge storage (key-value or custom entities, pick the one that supports the queries in section 8 and record the choice in `docs/decisions.md`).
- Data generator: Python 3.12, standard library plus `pyyaml`, `pytest`. Output is JSON committed to the repo.
- Tests: `vitest` for scoring, matching and actions. `pytest` for the generator.
- CI: GitHub Actions running tests and `check_publishable.py`.
- License: MIT.

## 3. Repository layout

```
pentti/
  CLAUDE.md                 short rules and commands, points here
  FACTORY_BUILD.md          this file
  README.md                 what is real, what is generated, judge install steps
  LICENSE  .gitignore  .env.example
  manifest.yml
  config/
    names.yml               company, plants, role words, nicknames, people
    scoring.yml             weights and effort hours (section 7)
  data/
    raw/                    GITIGNORED. ot_inventory_anonymized.json, ot_vulnerabilities_anonymized.json, README.txt
    generated/              committed, deterministic output of the generator
      assets.json  findings.json  people.json  pages.json  issues.json  meta.json
  scripts/                  Python
    build_dataset.py        raw -> generated (section 5)
    check_dataset.py        asserts the distribution targets in section 5.5
  tools/
    check_publishable.py    leak check (below)
  prompts/
    pentti.md               readable copy of the agent prompt
  src/
    index.ts                handler exports
    store/                  storage wrapper, typed
    score/                  knowledge.ts risk.ts closing.ts (pure)
    match/                  link.ts (text matching of pages and issues to assets)
    actions/                find-asset explain-asset blast-radius gap-report who-knows create-gap-tasks
    connector/              graph.ts (onConnectionChange, ingest, associations)
    seed/                   seed.ts (batched, idempotent, reset)
    resolvers/              ui.ts
  static/
    app/                    Custom UI: gap map, closing list, asset card, people
    admin/                  Custom UI: "Load the factory"
  tests/
  docs/
    decisions.md  limits.md  video-script.md  devpost-text.md
```

`.gitignore` starts with:

```
data/raw/
*.zip
.env
.env.*
!.env.example
node_modules/
dist/
build/
.venv/
__pycache__/
```

`tools/check_publishable.py`: builds a token set from `data/raw/*.json` (hostnames, IPv4 addresses, MAC addresses, site codes such as `QMYMN1`, discoverer hostnames, host_id values, internal DNS suffix, serial-like strings) and greps every tracked file outside `data/raw/` for any of them. Any hit fails with the file and line. Allow-list: public CVE ids, vendor names, device model names, public advisory urls. Run in `npm run check`, pre-commit and CI. CI cannot see the raw files, so in CI it checks against a committed list of SHA-256 hashes of the tokens (`tools/token_hashes.txt`, generated locally) instead of the tokens themselves.

## 4. Names (fun, friendly, deterministic)

All in `config/names.yml`. The generator never uses an original name in its output.

- Company: Tervaniemi Works. One-line fiction in the README: a mid-size Finnish manufacturer with five plants, forty years of automation and one man who remembers where everything is.
- Plants: the five sites with the most OT hosts in the vulnerability file become Birch, Spruce, Rowan, Pine, Alder (site codes in order of OT host count: QMYMN1, QDJKP1, XBGIA1, QKSRR1, QKRTT1). Everything else becomes "Annex": counted in totals, no drill-down.
- Lines: derived from subnets inside each plant, numbered `L1..Ln` by first appearance.
- Hostname pattern: `{plant}-{line}-{role}-{nn}`, e.g. `birch-l3-plc-07`. Roles: plc, hmi, sw (switch), cp (communication processor), io, pc, cam, prn.
- Nickname: about 25 percent of OT assets also carry a nickname, picked by a stable hash of the asset id. Nicknames are what tribal knowledge looks like, and what the matcher must handle. Starter pool (extend to about 60):
  Old Faithful, The Philosopher, Do Not Touch, Grumpy, Sleeping Beauty, Lucky Number Seven, The Intern, Mr. Reboot, Blinky, The Oracle, Sauna Boy, Kalle's Mistake, Don't Ask, Probably Fine, Temporary (2011), Final Final, Spare (Not Spare), The Gatekeeper, Hot Potato, The Whisperer, Third Shift Special, Mystery Box, Two Cables Too Many, Last One Standing, The Cousin, Duct Tape Edition, Wednesday, Nobody's Fault, The Quiet One, Rusty.
- IPs: remapped deterministically to `10.{plantIndex}.{lineIndex}.{host}`. Duplicate IPs in the source stay duplicate in the output (the README of the export says ambiguities are preserved on purpose, and "two machines with one address" is a finding worth showing).
- MACs: keep the first three bytes (manufacturer OUI, public), randomize the rest from the seed.
- Kept as is, because they are public facts: manufacturer, model, firmware, device type, Purdue level, CVE ids, severities, scores, advisory urls.
- Dropped: host_id, discoverer hostnames, raw descriptions longer than 400 characters (trim, keep the CVE id and the first sentence).
- Seed: `PENTTI_SEED=2026` in `meta.json`. Same input, same output, byte for byte. A test asserts it.

## 5. The data pipeline (`scripts/build_dataset.py`)

### 5.1 Join and site resolution
- Findings join to inventory by IP (all 2,194 do in the export). Findings carry `site_name`, inventory does not.
- Inventory site resolution order: finding join, then discoverer hostname prefix, then majority vote of the subnet, else Annex.
- Timestamps in the export are shifted into December 2026. Convert every timestamp to "days before the newest timestamp in its file". Output only offsets.

### 5.2 Demo scope
Keep: all 307 OT-like inventory rows (device types PLC, Industrial Control Device, HMI, Remote IO, Communication Device, Industrial Computer, Communications Adapter, Switch, Gateway, Engineering Station, Sensor, Controller and Purdue 0 to 2.5), plus every host that has findings, plus 100 randomly chosen IT neighbours so the inventory does not look pure. Expect 450 to 550 assets.

### 5.3 Output shapes (all ids are stable short strings, `a_xxxxx`)
- `assets.json`: id, hostname, nickname|null, plant, line, role, deviceType, model, firmware|null, manufacturer, purdue, criticality, entityType (managed, unmanaged, unsupported), ot, ip, macs[], flags[] (`NO_NAME`, `DUP_IP`, `UNSUPPORTED`, `NO_FIRMWARE`), modules[], ipHistory[], formerNames[], firstSeenDaysAgo, lastSeenDaysAgo.
- `findings.json`: id, assetId, cve, severity, score, exploitLabel, exploitValue, status, publishedDaysAgo, openedDaysAgo, summary (<= 240 chars), advisoryUrl (first one only).
- `people.json`: id, name, role, plant, startedYearsAgo, leavingInDays|null, bio (one dry line).
- `pages.json`: id, title, space, authorId, class, lastEditedDaysAgo, bodyMarkdown, mentions[] ({assetId, kind}, filled by the generator for ground truth, not used by the app, D17).
- `issues.json`: id, summary, type, status, reporterId, assigneeId, createdDaysAgo, resolvedDaysAgo|null, description, labels[], mentions[] (ground truth).

### 5.4 Generated narrative (written by Claude Code, in batches, no API calls)
Write the content straight into files, ten pages or twenty issues per batch, then run `check_dataset.py` after each batch. Every document must mention its assets the way real people do: by hostname, by nickname, by old IP, by "the S7 in the corner of line 3", or by model only. About a fifth of mentions use an old name or IP that no longer matches, because that is the hard case for the matcher.

People (about 12, all fictional):
- Pentti Vaisanen, maintenance electrician, 38 years, leaves in 150 days. Last toucher of about 40 assets. His issues say "fixed" and little else.
- Two contractors who left in earlier years. One integrator company that no longer answers.
- A plant manager, an automation engineer, an IT/OT coordinator, a safety officer, and a few operators and technicians.
Names are plain Finnish-style names. Bios are one dry line each.

Pages (60), by class:
- gold (6): complete runbooks with owner, last test, spare parts.
- ok (14): decent, slightly dated.
- stale (20): last edited 3 to 9 years ago, mostly still plausible.
- wrong-ref (8): refer to a machine by an IP or name it no longer has.
- duplicate-conflict (4): two pages that disagree about the same machine.
- orphan (4): no author left, no mentions that resolve.
- fun (4): "READ ME FIRST (final v3)", "Line 3 - ask Pentti", "Do not power cycle (see below)" where below is empty, and one page written in Finnish by an operator.

Issues (150), by kind:
- breakdowns and restarts (60), including "restarted by hand, do not know why it works".
- firmware or config changes (25), a few with no follow-up.
- network changes and renumbering (15).
- audit and NIS2 findings left open (20).
- spare parts and vendor contact (15).
- noise (15): "label broken", "who owns this PLC".

Also one Confluence page `NIS2 - what applies to us` that summarizes the public obligations in plain words and links to the official text. No legal claims beyond what the regulation says.

### 5.5 Distribution targets (`check_dataset.py` asserts these)
Among OT assets: 
- 10 percent well documented (name, owner, fresh doc, history).
- 25 percent have a doc but it is stale.
- 40 percent have no doc at all.
- At least 20 assets are Critical with nothing known at all: no doc, no history, no owner, no nickname. This is the danger list.
- Pentti is the only recent toucher of 35 to 45 assets.
- Two assets share one IP.
- Matcher recall against the ground truth `mentions[]`: at least 0.85 on exact mentions, at least 0.5 on old-name mentions.

### 5.6 Hero scenes (these must exist, the video depends on them)
1. `birch-l2-cp-04` (line 2 in the data, see D15), nickname "Old Faithful", a CP 343-1 with 33 open findings and score 9.3 and above. One stale page, one issue from 2019 ("restarted by hand"), only Pentti ever touched it.
2. A PLC with 90+ findings and no documentation at all.
3. Two machines with one IP.
4. A page that refers to a PLC by an address it no longer has, so a naive search returns "documented" and the honest answer is "documented, for a machine that no longer exists at that address".

## 6. Matching (`src/match/link.ts`)
Deterministic. No LLM. For each page and issue, extract candidate references and score them against assets: exact hostname, nickname (case-insensitive, whole phrase), IP (also old IPs from `ipHistory` if the generator provides them), model plus plant plus line, model plus plant. Output `links[]` with `assetId`, `source`, `matchType`, `confidence` (1.0 exact, 0.7 nickname, 0.5 model+line, 0.3 model+plant). Only links with confidence >= 0.5 count toward knowledge. Lower ones are shown as "maybe" and never counted. Tests use the ground truth from the generator.

## 7. Scoring (`src/score/*`, pure functions, weights in `config/scoring.yml`)

Knowledge score, 0 to 100:
- name 10: hostname follows the pattern or a nickname exists.
- owner 20: a named person touched the asset in the last 24 months and is not leaving within 180 days. A leaving owner gives 8.
- doc 25: at least one linked page with confidence >= 0.5.
- doc fresh 15: newest linked page edited within 18 months.
- history 15: at least one linked issue within 36 months.
- firmware 5: firmware known.
- confirmed 10: a human clicked "I checked this" within 12 months.

Risk score, 0 to 100:
`round(60 * critW + min(40, 8 * log2(1 + openCriticalOrHigh) + (10 if any exploitValue >= 60 else 0)))`, with `critW` Critical 1.0, High 0.7, anything else 0.3.

Danger = `risk * (100 - knowledge) / 100`.

Closing list: for each missing dimension an estimated effort in hours (name 0.5, owner 0.5, doc 2, doc refresh 1, confirm 0.5), configurable. Sort by danger removed per hour, greedy, return the top N with the total hours. This is the risk-based, cost-aware part: it never says "document everything". It says "these ten assets, 14 hours, removes 38 percent of the danger".

Tests freeze the numbers for the hero assets.

## 8. Storage and ingest
- Store assets, findings, people, pages (metadata and body), issues (metadata), links, confirmations, seeded-object ids.
- Required queries: by id, by plant, by line, by text search over hostname, nickname, ip, model (in memory over a cached index is fine at 500 assets), top-N by danger, all links for an asset.
- Load generated JSON from the bundle at first run into storage (admin "Load the factory" does this, section 10).
- Scores are computed on read and cached per request, not stored.

## 9. The agent and its actions

Agent "Ask Pentti". Prompt (keep in `prompts/pentti.md`, paste into the manifest in a build step):

```
You are Pentti, a maintenance veteran's memory for a factory. You answer questions about machines.
Rules:
- Use only what the actions return. Never use your own knowledge to fill a gap about a specific machine.
- Always answer in three parts: What is known (with source ids), What is not known, Where I looked.
- If an action says not_known, say so plainly. "Nobody knows" is a valid answer.
- If a query matches several machines, list them and ask which one. Never pick.
- Keep it short. Dry is fine. Jokes about the machine are fine, jokes about the numbers are not.
- Numbers come from the action output. Do not round, estimate or invent them.
- Before creating Jira tasks, show the list and ask for confirmation.
```

Actions (each validates inputs against storage and checks `context.accountId` where it writes):
- `find-asset` (GET): text -> up to 5 candidates, never one guess.
- `explain-asset` (GET): asset id -> `{asset, known{}, not_known[], searched[], sources[], knowledge, risk, danger, people[], findingsSummary}`.
- `blast-radius` (GET): asset id -> other assets on the same line and subnet with criticality and counts. Always includes the sentence "Same subnet. Reachability not verified. No routing data."
- `who-knows` (GET): asset id -> people ranked by recent touches, with a flag when someone is leaving.
- `gap-report` (GET): plant or all, N -> closing list with hours and percent of danger removed.
- `create-gap-tasks` (CREATE): up to 10 asset ids -> Jira issues in the configured project, idempotent by `pentti-gap:<assetId>`, with a description built from the closing list entry. Returns issue keys.

The UI has one more write, "I checked this" (confirm), which is deliberately not an agent action.

## 10. The UI (Custom UI, Jira global page "Pentti")
Phone width is not required, a laptop in a video is. Four tabs:
1. Gap map: bubble chart. x = knowledge (100 to 0, so the bad corner is top right), y = risk, size = open findings, color = plant. Click opens the asset card. Plant filter. A counter line at the top: "N assets. M are Critical and nobody knows anything about them."
2. Closing list: the list from section 7, with hours, "Create tasks" and a total. After creating, issue keys appear as links.
3. Asset card: every number with its chip (SCAN, GEN, SCORE), the three-part answer, linked pages and issues with confidence, people, findings, "I checked this".
4. People: bus factor per person, with the leaving date. Pentti's row is red and has a dry tooltip.

Admin page "Load the factory" (`jira:adminPage`): pick a Jira project and a Confluence space, press load. Progress bar. Reset button removes only items carrying the `pentti-demo` label or property. The UI drives the seeding in small batches (a resolver call per 10 objects) to stay under function time limits.

## 11. Seeder (`src/seed/seed.ts`)
- Creates the Confluence pages and Jira issues from `pages.json` and `issues.json`, with dates resolved against now. Real Atlassian users do not exist for the fictional people, so authorship is stored in the app and shown in the page header line "Written by Pentti Vaisanen (fictional)". Check which scopes the REST calls need and put the list in `docs/limits.md`.
- Idempotent by `pentti-demo:<id>` label or content property. Re-running does nothing. Reset then load works.
- Backdating: if the API cannot set created or updated dates, the app keeps its own `lastEditedDaysAgo` and `createdDaysAgo` and uses those for scoring. Record this in `docs/decisions.md`. The scores never read dates from Atlassian for seeded content.
- Emit the same ids so ground-truth matching still works.

## 12. Slices

Each slice ends in something you can show. Dates are targets from Nov 3. Cut order is in section 13.

| # | Slice | Done when | Target |
|---|---|---|---|
| S0 | Spike. (a) Dev site, `forge create`, hello world deployed and installed. (b) Rovo agent from the template answers in Chat on the dev site. (c) Teamwork Graph: a `graph:connector` ingests ONE `atlassian:document` with an `issueIdOrKeys` association and it shows up in Rovo search. (d) Measure: function timeout, storage write limit, `setObjects` batch size and rate. (e) Write a pass/fail table to `docs/limits.md`. | Table has no unexplained FAIL. For each FAIL, the fallback is written into section 0 of this file. | Nov 5 |
| S1 | Repo, CI, `.gitignore`, `check_publishable.py`, generator with names, remap, site resolution, offsets, trimming. `check_dataset.py` for the mechanical parts. | `npm run dataset` is deterministic (two runs, same hash). `npm run check` passes. No original token in output. | Nov 9 |
| S2 | Narrative content: people, 60 pages, 150 issues in batches. Hero scenes. Distribution targets met. | `check_dataset.py` passes every target in 5.5 except matcher recall. | Nov 13 |
| S3 | Store, matcher, knowledge and risk scores, closing list. Pure code and tests. | `vitest` green. Hero asset numbers frozen. Matcher recall meets 5.5. | Nov 17 |
| S4 | Seeder and admin page. | On a brand new dev site, one click loads everything. Second click changes nothing. Reset clears it. | Nov 21 |
| S5 | Agent Pentti and the five GET actions plus `create-gap-tasks`. | In Rovo Chat: find "Old Faithful", get the three-part answer, ask for the closing list, create tasks, see issue keys. Honest "not known" works on a machine with nothing. | Nov 29 |
| S6 | UI: gap map, closing list, asset card, people. | The video flow runs from the UI without touching the console. | Dec 5 |
| S7 | Teamwork Graph connector for real: asset cards as `atlassian:document`, associations to seeded issues, `mirror` sync, delete on disconnect. | Asking Rovo Chat or Rovo Search about an asset surfaces the asset card from the graph. If S0(c) failed, skip and note it. | Dec 8 |
| S8 | Stretch: `rovo:mcp` exposing `find-asset`, `explain-asset`, `gap-report` only. | A third-party MCP client lists and calls the three tools. Admin enablement documented. | Dec 10 |
| S9 | Judge readiness: README (first screen says what is real), install instructions, fresh-site test from the install link, `docs/limits.md`, `docs/devpost-text.md`. Decide on Marketplace listing (go or no-go by Dec 11). | Someone who is not you can install on a clean site and reach the first answer in under 10 minutes. | Dec 15 |
| S10 | Video (under 3 minutes of content, hard cap 5), YouTube public, Devpost form, bonus write-ups. | Submitted. Submission page reopened and checked from a logged-out browser. | Dec 19-20 |

## 13. Cut order if time runs out
S8, then the Marketplace listing, then the People tab, then `blast-radius`. Never cut: S0, the seeder, the honest "not known" behavior, the gap map, the closing list, the fresh-site test, the video.

## 14. Judging map

| Criterion (20 percent each) | Where it is earned |
|---|---|
| Technological implementation | Agent plus actions, connector with associations, matcher, scoring, idempotent seeder, tests. Optional MCP. |
| Design | Gap map and asset card with chips, honest empty states, one coherent flow. |
| Potential impact | The NIS2 and asset-inventory problem every EU manufacturer has. Cost-aware closing list in hours. |
| Innovation | Measuring what is not known instead of summarizing what is. An agent that can say "nobody knows". |
| Presentation | The video script below, first three minutes carry everything. |

## 15. Demo video script (judges are not required to watch past 3:00)
- 0:00 to 0:15 Hook. A scanner export with 4,695 rows and 124 machines without a name. "The scanner knows the box. Nobody knows the machine."
- 0:15 to 0:50 Rovo Chat: "What happens if Old Faithful dies?" Three-part answer. Known: model, 33 open findings, one stale page. Not known: owner, spare parts, upstream. Where I looked.
- 0:50 to 1:30 Gap map. The top right corner. Click a Critical asset with nothing known. Pentti's red row on the People tab: leaves in 150 days, only name on 40 machines.
- 1:30 to 2:15 Closing list: "10 assets, 14 hours, removes 38 percent of the danger." Create tasks. Issue keys appear in Jira.
- 2:15 to 2:40 Graph and agent bonuses: asset card in Rovo Search, honest "not known" on a nameless machine. Optional MCP call.
- 2:40 to 3:00 Fresh-site install: "Load the factory", one click. "Fictional company, real machine mix."
Keep it live, no voice-over fluff, no music.

## 16. Definition of done for the whole entry
- A clean dev site, the install link, README steps, and under 10 minutes later the first honest answer.
- Every number in the UI has a chip. The README opens with what is real and what is generated.
- `check_publishable.py` passes on the full git history and in CI.
- Tests green. Scoring numbers for the hero assets are frozen.
- Video public on YouTube, Devpost complete, bonus categories selected with write-ups, a day to spare.
