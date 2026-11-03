# Limits and spike results

Filled in during slice S0. Every row is run with code, not read from docs. FAIL rows get a fallback written into section 0 of FACTORY_BUILD.md.

| # | Check | Result | Notes |
|---|---|---|---|
| a | Dev site created, hello world deployed and installed | PASS | Demo site via `forge site provision`. Template `action-rovo`, deployed to development, installed in Jira. |
| b | Rovo agent from the template answers in Chat on the dev site | PASS | Agent `pentti` (development) in Rovo Chat called `fetch-comments` on MOBL-57 and answered "no comments". Rovo is active on the demo site. |
| c | `graph:connector` ingests one `atlassian:document` with an `issueIdOrKeys` association, visible in Rovo search | PASS | Rovo search on the site shows "Pentti spike asset a_spike1". Admin path: admin.atlassian.com > Connectors > Add connector > Pentti asset cards. `onConnectionChange` gets `{action, name, connectionId, configProperties, context}`. Card with `issueIdOrKeys: [MOBL-57]` accepted, `INDEXED` 3 to 4 min later. `atlassian:document.type.category` must be uppercase `DOCUMENT`, the SDK README example `document` is rejected. |
| d | Function timeout, measured (seconds) | PASS: 55 | Web trigger function slept 1 s steps: 54 s alive, then "Function timed out. Limit of 55.00 seconds", caller gets HTTP 424. Resolver limit for Custom UI still to measure in S4. Plan batches for 20 s. |
| e | Storage write limits (size, count, rate) | PASS | `@forge/kvs`: max value 245,760 characters (240 KiB), larger fails with a clear error. Key length 500 ok. 100 sequential 2 KB writes 3.1 s (about 31 ms each), 100 parallel 4.9 s, no throttling. |
| f | `setObjects` batch size and rate | PASS | SDK caps at 100 per call. 100 objects accepted in 0.66 to 1.15 s per call, 3 calls in a row, no rate limit hit. 500 assets is 5 calls. |
| g | Can REST set created/updated dates on seeded Jira issues and Confluence pages | FAIL (Jira, measured). Confluence: S4 | Jira create: "Field 'created' cannot be set". Fallback per spec section 11: the app keeps `createdDaysAgo` and `lastEditedDaysAgo` and scores never read Atlassian dates (D6). Confluence is tested when the app is installed in Confluence in S4. |
| h | Can a graph object link to a Confluence page | FAIL | Docs list only `issueIdOrKeys` and `atlassian:<objectType>` association types. Tried `confluencePageIds`, `pageIds`, `contentIds`, `atlassian:page`, `confluencePageId`, all "not a valid 'associationType'". Fallback: asset card text and description carry the Confluence page title and url, page links live in app storage. |
| i | Scopes the seeder needs (Jira, Confluence) | PARTIAL | In use now: `read:jira-work`, `write:jira-work`, `storage:app`, `read:object:jira`, `write:object:jira`, `delete:object:jira`. Confluence scopes are found in S4, when the seeder writes pages. |
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
- `@forge/teamwork-graph` 5.3.2 caps `setObjects` at 100 objects per call in the SDK itself (`MAX_BULK_OBJECTS`), same for deletes and relationships. Max 5 properties per object.
