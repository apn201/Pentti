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
| j | Does the judge-style install (install link, fresh site, non-owner admin) work | PASS, one run | Run by Juha on 2026-11-05 on a new site from the production install link, reported as working. Not run by an outside tester. Two findings, see "Fresh site, 2026-11-05". |

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

## Agent and actions (S5, 2026-11-04)

- Rovo Chat run on the dev site, agent Ask Pentti: "What happens if Old Faithful dies?" called find-asset, explain-asset and blast-radius and answered in three parts with links to the seeded page and Jira issue. "Closing list for the whole factory" called gap-report: 10 assets, 18.5 hours, 2.3 percent, the frozen numbers. After "yes" Rovo showed its own review card for the CREATE action, then create-gap-tasks made TVW-301 to TVW-310 as the signed-in user. Asking again for Old Faithful returned TVW-305 as existing, nothing new. The nameless PLC at 10.4.1.18 got an honest answer: every gap under not known, no owner, no page, nobody who knows it.
- Action timings from the logs: GET actions 1 to 2.2 s with a cold index, create-gap-tasks 12.6 s for 10 issues (sequential search and create, as the user), 1.2 s for one existing.
- `api.asUser()` works inside Rovo actions without a separate consent step for the user who installed the app.
- In the agent picker, a development agent is listed by its manifest name, no environment suffix.

## UI (S6, 2026-11-04)

- Jira global page `jira:globalPage`, Custom UI with React and Vite, hand drawn SVG for the gap map. No chart library, no external requests, so the default Custom UI content security policy is enough.
- Run from the UI on the dev site: gap map loads (522 assets, 60 Critical with nothing known, 98 in the red corner), a click opens the asset card, People shows Pentti in red as the only name on 39 machines (34 Critical), the closing list for Rowan created TVW-311 to TVW-315 from the "Create tasks" button and showed the keys as links, "I checked this" on rowan-l1-plc-02 moved knowledge from 90 to 100 and danger from 9.7 to 0.
- First load after a deploy takes 8 to 12 s (cold container, the matcher runs once). Later loads take 1 to 2 s.
- Native select popups and the Jira chrome both work inside the Custom UI iframe. `window.confirm` is not used, confirmations are inline buttons.
- Not run live: Reset clearing the confirmations. Covered by code review only, Reset would empty the loaded demo site.
- Atlassian rendered surfaces cannot carry custom visuals: Rovo Chat answers are markdown text, graph cards are text. Jira and Confluence content can use ADF status lozenges and panels, not used yet.

## Teamwork Graph connector (S7, 2026-11-04)

- The S0 graph connection did not survive the S4 installation change (separate Confluence install removed, `compatibility` added). `setObjects` answers "Bad Request - Connection not found". An org admin has to add the connector again, `onConnectionChange` then delivers a new connection id. The app now treats "Connection not found" as disconnected and says so on the admin page.
- `deleteObjectsByExternalId` caps at 100 ids per call, like `setObjects`. 101 ids throw "Bulk object deletion supports maximum 100 objects".
- Deep links into a Jira global page work: `<site>/jira/apps/<appId>/<envId>/asset/<assetId>` opens the page and `view.createHistory()` gives `/asset/<assetId>` as the location. The app id and environment id come from `getAppContext()` in the function, never from input.- After the admin added the connector again: `onConnectionChange` CREATED with a new id, the sync wrote 522 cards, 522 accepted, 0 rejected, in 6 s. The spike card cleanup (101 ids in two calls) reported no error, and no spike card showed in the filtered search.
- Rovo Search, about 4 minutes later: "Old Faithful" with the App filter "Pentti asset cards" lists birch-l2-cp-04 (Old Faithful) first, with hostname, nickname, IP and plant in the snippet. Without the filter the Jira issues rank first, as in S0.
- Rovo Chat with Ask Pentti now writes machine names as links to the asset card, for example birch-l2-cp-04 (Old Faithful) to `/asset/a_d4mjq`. Rovo also turned a fictional person's name into an @mention, the prompt now forbids that.
- The connector icon is still a manifest path and shows broken. A hosted icon url needs a public host, planned for S9 when the repo goes public.

## MCP (S8, 2026-11-04)

- `rovo:mcp` with find-asset, explain-asset, gap-report deployed. The endpoint `https://mcp.atlassian.com/forge/<appId>` answers 401 with `WWW-Authenticate` pointing at OAuth protected resource metadata, so discovery works.
- Admin path for the switch, as of today: Atlassian Administration, Apps, Sites, the site, Connected apps, the app, Details, TOOLS, "Expose tools to MCP-compatible apps", Enable tools. During Preview it exposes every tool in the module, no per-tool choice.
- Known Preview bug, reported in the developer community the same day: when the app is installed in Jira and connected to Confluence at the moment tools are enabled, clients connect but list no tools. Workaround from that thread: disconnect Confluence, Disable tools, Enable tools, then connect Confluence again. Our first try showed this symptom in Claude (connected, no tools).
- MCP Inspector from npm could not be run here: the local safety check blocks running downloaded code. The client test uses Claude's custom connector.- Workaround applied 2026-11-04: `forge uninstall -p confluence`, admin pressed Disable tools then Enable tools, the Claude connector reconnected and listed the three tools, then `forge install -p confluence` again. The tools kept working after Confluence came back.
- Third-party client run (Claude custom connector, tools named `find-asset_development` and so on): find-asset "Old Faithful" returned a_d4mjq with its deep link, find-asset "The Oracle" returned three machines with "Never pick", gap-report Birch n 3 returned 3 assets, 6.5 hours, 4.7 percent, explain-asset a_8bjia returned the full not known list with no sources. Tool names carry the environment as a suffix.

## Judge readiness (S9, 2026-11-04)

- Production deploy done. The install link comes from the developer console, Manage, Distribution, Edit, status Sharing. The form asks for company, support contact, privacy policy, terms of service and whether the app stores personal data. Pentti stores account ids of people who press "I checked this".
- The console shows "This app will be installed on Jira, can also be connected to Confluence", matching the `compatibility` block.
- `git push` of a tag failed twice with a GitHub server error, creating the tag through the REST API worked.
- Leak-check hashes are unsalted. Accepted, the raw export was anonymized already (D41).
- The temporary resolver timeout probe and its Diagnostics section are removed from the admin page.
- Repo made public 2026-11-04. The connector icon now points at jsDelivr (`cdn.jsdelivr.net/gh/apn201/Pentti@<commit>/static/connector-icon.svg`), which serves it as `image/svg+xml`. Raw GitHub serves SVG as `text/plain` and would not render. Forge lint and deploy accept an https url for `graph:connector` icons. Not yet checked in Rovo Search.

## Own data, 2026-11-05

- Checked in the signed-in browser on the dev site, with the same URLs as `src/own/read.ts` (sample space and project): Confluence v2 pages with `body-format=storage` return `body.storage.value` and `version.createdAt`, the `_links.next` cursor pages on. Jira `search/jql` returns `description` and comment bodies as ADF, `created` with an offset like `-0500`, and `nextPageToken` pages on.
- Live on dev after the deploy, bundled mode: explain-asset for Old Faithful returned the same answer as before.
- Live run through the admin page on the dev site, 2026-11-05: a CSV of 7 rows, pasted, against the sample IT Operations space and project. 6 machines kept, the bad row reported at the right line. 19 pages and 500 issues read in about 20 s, "more exist" shown. Reading as the admin from a resolver works for Jira and Confluence, no new scopes and no reinstall.
- Matches were as expected: `user-service` on two tickets at 1.0, an IP in a ticket summary, a hostname in a page. `billing` stayed a maybe at 0.3 on many tickets. `no-such-host-99` matched nothing.
- The site stayed on bundled data until own data was chosen. Back on bundled, the Birch report said 22.5 hours and 15.1 percent, the gap map 522, 60 and 98. After Delete my data the test machine was gone.
- Nothing was written: JQL and CQL over the last 3 hours found no created issue, no changed ITO issue, no changed ITO page, no gap task. The graph sync time did not move.
- Rovo Chat, as an admin: Ask Pentti answered from own data with CSV, SITE and SCORE and real ticket links, said people are not imported, and refused to create a task.
- MCP with the Claude client: every tool refused with the admin-only message while on own data, and worked again on bundled. Why it refuses is not known, the check fails closed. Not looked into further, it is the safe side.
- Found live and fixed: "Highest score 0" from counts without scores, "Medium 0, Low 0" that the list never said, "0 in not known", a long list of maybes (now 10 and a count), a horizontal scrollbar from the column list.
- NOT RUN: the file picker, a native dialog the test tools can not drive, so only pasting ran. A user who is not a Jira admin. Limits at their edge, 1000 assets and 200 pages. Reset while own data exists, it would empty the demo site, covered by the separate keys in code. Real plant data, so the matcher has no measured number there.
- Test tool notes: the first wheel scroll after a load is lost, native select lists can not be clicked. Focus with Tab and press letters.
- Limits chosen, not measured at the edge: 1000 assets, 200 pages, 500 issues.

## Fresh site, 2026-11-05

- Installing before Confluence was on the site: the dialog showed Jira as successful and "Installation failed. Try again or contact app owner" next to Confluence. Jira stayed installed. After adding Confluence the connection worked. The message gives no hint of the cause, so the README says it.
- The admin page listed no spaces for a new space, with no error. `/wiki/api/v2/spaces?type=global` leaves out the newer types. The dev site API shows `global`, `collaboration`, `knowledge_base` and `personal`. On the new site a space made with the purpose Custom appeared in the list, so Custom appears to give `global`. Fixed: the list now asks for all current spaces and leaves out personal ones.
- NOT RUN: a load into a `collaboration` or `knowledge_base` space, and the fixed list seen live. The fresh-site load went into a Custom space.
- Still likely: a site with no Confluence at all loses the project list too, one call fetches both. Seen in code, not live.

## Screenshots, 2026-11-05

- Taken from the development install on the dev site. On screen: 522, 60, 98, Birch 10 assets 22.5 hours 15.1 percent, Pentti 39 and 34, 150 days. Ask Pentti and Rovo Search answered as the video script expects, the asset card first even without the App filter.
- The connector icon is broken in Rovo Search on this site, on the card and in the "Pentti asset cards" filter. The page asks for `<site>/jira/static/connector-icon.svg`, the old relative path from before the jsDelivr url. The manifest has the new url and jsDelivr serves it as `image/svg+xml`. Probably the connection on this site keeps the icon it was added with, not tested. Adding the connector again would test it, but disconnect deletes the cards. A connector added on a new site is NOT RUN for the icon.
- The built-in browser pane of the desktop app caps screenshots at 800x450 and times out while hidden, not enough for publishing. A separate Edge window on a debug port, signed in by a person, gives 1920x1080.
- Rovo full screen view: the menu item did nothing when driven by script, tried twice, left it. The shots use the sidebar.
- Typing in Jira without focus in the search box fires keyboard shortcuts. It opened Help and the All work list here. JQL `updated >= -30m` found no changed issue.
