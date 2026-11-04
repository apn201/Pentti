# Limits and spike results

Filled in during slice S0. Every row is run with code, not read from docs. FAIL rows get a fallback written into section 0 of FACTORY_BUILD.md.

| # | Check | Result | Notes |
|---|---|---|---|
| a | Dev site created, hello world deployed and installed | PASS | Demo site via `forge site provision`. Template `action-rovo`, deployed to development, installed in Jira. |
| b | Rovo agent from the template answers in Chat on the dev site | PASS | Agent `pentti` (development) in Rovo Chat called `fetch-comments` on MOBL-57 and answered "no comments". Rovo is active on the demo site. |
| c | `graph:connector` ingests one `atlassian:document` with an `issueIdOrKeys` association, visible in Rovo search | PASS | Site search with the App filter "Pentti asset cards" returns all 101 spike cards with title and text. In the unfiltered "All" view they rank below Jira issues, so the first check looked like a miss. Principals `ATLASSIAN_WORKSPACE` and `EVERYONE` both work. Admin path: admin.atlassian.com > Connectors > Add connector > Pentti asset cards. `onConnectionChange` gets `{action, name, connectionId, configProperties, context}`. Card with `issueIdOrKeys: [MOBL-57]` accepted, `INDEXED` 3 to 4 min later. `atlassian:document.type.category` must be uppercase `DOCUMENT`, the SDK README example `document` is rejected. |
| d | Function timeout, measured (seconds) | PASS: 55 | Web trigger function slept 1 s steps: 54 s alive, then "Function timed out. Limit of 55.00 seconds", caller gets HTTP 424. Custom UI resolver (S4, admin page Diagnostics): 20 s ok, 26 s fails after about 25 s, so the resolver limit is 25 s. Seeder steps take 1 to 2.5 s. |
| e | Storage write limits (size, count, rate) | PASS | `@forge/kvs`: max value 245,760 characters (240 KiB), larger fails with a clear error. Key length 500 ok. 100 sequential 2 KB writes 3.1 s (about 31 ms each), 100 parallel 4.9 s, no throttling. |
| f | `setObjects` batch size and rate | PASS | SDK caps at 100 per call. 100 objects accepted in 0.66 to 1.15 s per call, 3 calls in a row, no rate limit hit. 500 assets is 5 calls. |
| g | Can REST set created/updated dates on seeded Jira issues and Confluence pages | FAIL (both, measured) | Jira create: "Field 'created' cannot be set". Confluence v1 create with `history.createdDate` and `version.when` set to 2019: accepted, both ignored, page shows today. Fallback per spec section 11: the app keeps `createdDaysAgo` and `lastEditedDaysAgo` and scores never read Atlassian dates (D6). Page and issue headers say "(app date)". |
| h | Can a graph object link to a Confluence page | FAIL | Docs list only `issueIdOrKeys` and `atlassian:<objectType>` association types. Tried `confluencePageIds`, `pageIds`, `contentIds`, `atlassian:page`, `confluencePageId`, all "not a valid 'associationType'". Fallback: asset card text and description carry the Confluence page title and url, page links live in app storage. |
| i | Scopes the seeder needs (Jira, Confluence) | PASS | Jira: `read:jira-work`, `write:jira-work` (create, transition, delete issues, project and createmeta reads, own permissions as the user). Confluence (granular, v2): `read:space:confluence`, `read:page:confluence`, `write:page:confluence`, `delete:page:confluence`, `read:label:confluence`, `write:label:confluence`, `search:confluence`, `read:content-details:confluence`. Plus `storage:app`. Classic Confluence scopes are not enough: the v1 content and space endpoints answer 410 to apps. |
| j | Does the judge-style install (install link, fresh site, non-owner admin) work | DEFERRED to S9 | Needs a production deploy and a second account. Not part of S0 Done when. |

Seeded-content and API quirks found later go below.

## Toolchain (S0, 2026-11-03)

- Forge CLI 15.0.0 needs Node `^22.23.4 || ^24.22.1 || >=26.12.1`. System Node 24.14.1 is too old. Repo pins 24.22.2 in `.node-version`, installed with fnm.
- `forge whoami` works non-interactively with `FORGE_EMAIL` and `FORGE_API_TOKEN` in the environment. Run `forge settings set usage-analytics false` once, or the CLI prompts and fails without a TTY.
- `forge create --personal` still needs a Developer Space. Creating one is an interactive prompt only, so the first `forge create` has to run in a real terminal.
- No dev site existed. `forge site provision` started a demo site, it runs past the CLI's 5 minute watch window and finishes in the background. The CLI does not print the site URL. The site name shows in Atlassian admin workspace settings, `<name>.atlassian.net`.
- The Developer Space created by the CLI does not allow personal apps. The app is registered in the space instead.
- Templates are listed in `templates.json` at the CLI's template service. The Rovo agent plus actions template is `action-rovo`, not `rovo-agent`.
- Adding a web trigger drops the app out of the Runs on Atlassian program and needs `forge deploy --approve MAJOR_VERSION_RULE`. The spike web trigger goes away after S0.
- Jira search from an app rejects unbounded JQL ("Unbounded JQL queries are not allowed here"). Always add a restriction, for example `created >= -3650d`.
- Graph cards show a broken icon in search: a manifest icon path like `static/connector-icon.svg` is not served. Use a hosted icon url in S7.
- Card `url` opens on click. The spike used example.com. In S7 it must point to the app's Jira page for the asset.
- The connector also shows in each user's Rovo settings > Apps as "Connected". Check in S9 whether a judge has to connect it there too.
- `@forge/teamwork-graph` 5.3.2 caps `setObjects` at 100 objects per call in the SDK itself (`MAX_BULK_OBJECTS`), same for deletes and relationships. Max 5 properties per object.

## Seeder (S4, 2026-11-04)

- A Jira app cannot call Confluence from a separate Confluence installation: `requestConfluence` answers 401 "scope does not match". The manifest needs `app.compatibility` with `jira: required: true` and `confluence: required: false`. Then the app is one installation, `forge install -p confluence` connects Confluence to it. Switching needed `forge uninstall -i <confluence installation>` first, the deploy refuses while a non-required installation exists.
- Confluence v1 `GET /wiki/rest/api/space` and `POST /wiki/rest/api/content` answer 410 "deprecated endpoint has been removed" to the app, while the same calls with a user API token still work. The seeder uses v2 (`/wiki/api/v2/spaces`, `/wiki/api/v2/pages`). v2 cannot label on create, labels go through v1 `POST /wiki/rest/api/content/{id}/label`, which still works. CQL search is v1 `/wiki/rest/api/search`.
- Confluence labels refuse a colon ("label.contains.invalid.chars"). Seeded objects carry `pentti-demo-<id>`, not `pentti-demo:<id>` (D26). The first Jira test run used the colon form, the reconcile step reads both.
- Page delete through v2 moves the page to the trash, it does not purge.
- The app may not run `POST /rest/api/3/permissions/check` ("Only Jira administrators and Connect apps"). The admin check asks `GET /rest/api/3/mypermissions?permissions=ADMINISTER` as the user. No consent screen appeared for the admin who installed the app.
- Full run on the dev site, 2026-11-04: Load created 216 objects, a second Load changed nothing, Reset removed 216 and left the project and space empty (counted by JQL and CQL), Load after Reset created 216 again with no errors. Tested on the existing demo site with a new empty project and space. The fresh-site test from the install link is S9.
- Seeding on the dev site: 150 issues in 15 steps of 10, about 1.5 to 2.5 s per step including the Done transitions, 66 pages in 8 steps. The second Load answers "Already loaded. Nothing changed." with 150 issues and 66 labelled pages in place.
- A Jira business project (simplified task tracking) offers only Task and Sub-task. All seeded issues become Task there, the app keeps the original type.
- `tsconfig.json` must not set `noEmit`: the Forge bundler (ts-loader) then emits nothing and the deploy fails with "TypeScript emitted no output". `npm run typecheck` passes `--noEmit` on the command line instead.
- Removing the spike web trigger put the app back in the Runs on Atlassian program. Adding Confluence scopes needs `--approve MAJOR_VERSION_RULE` again and `forge install --upgrade`.
- Vite 8 needs `@vitejs/plugin-react` 6, vitest 3 pins Vite 7. The repo uses Vite 7 with plugin-react 5.
