# Pentti

A Forge app that measures what a factory does not know about its own machines, then helps close the dangerous gaps first. A Rovo agent, Ask Pentti, answers questions about machines and says "nobody knows, here is where I looked" when that is the truth.

Built for Atlassian Codegeist 2026, category Apps for Specialized Industries.

## This is a demo

Out of the box Pentti runs on one fictional factory bundled inside the app. It does not read your machines, your Confluence pages, your Jira tickets or your people unless a Jira admin imports them, see [Try your own data](#try-your-own-data). Scores and answers are not a safety, security or compliance assessment.

On the bundled data:

- The page and the agent answer from the bundled data, even before "Load the factory".
- "Load the factory" writes a copy of the fictional pages and issues to your site so you can read them. Pentti does not read that copy back. "Where I looked" counts the bundled data, not your site.
- The only things Pentti reads from your site are the projects and spaces to pick from, its own labelled objects, your Jira permissions and the site address for links.

Install it on a test site, not a production one. It adds fictional pages and issues to the project and space you pick, and, if you add the connector, 522 fictional cards to Rovo Search that everyone on the site can find.

## What is real and what is made up

Every number in the app carries one of three chips.

- **SCAN**: real. The machine mix (models, firmware, device types, 2194 vulnerability findings) comes from an anonymized OT scanner export of a real manufacturing environment. Names, addresses and sites are remapped, nothing original is published.
- **GEN**: made up. Tervaniemi Works is a fictional Finnish manufacturer with six plants, forty years of automation and one man who remembers where everything is. Its people, 61 Confluence pages and 150 Jira issues are generated.
- **SCORE**: computed. Knowledge, risk and danger scores come from plain code with tests. The language model never does arithmetic.

## What it does

- **Gap map**: 522 assets on one chart, knowledge against risk. The top right corner is risky and nobody knows anything.
- **Asset card**: what is known, what is not known, where Pentti looked. Pages and tickets with match confidence, people, findings, "I checked this".
- **Closing list**: the assets to document first, with hours per step and the percent of danger removed. One button creates the Jira tasks.
- **People**: who is the only name on which machines, and who is leaving.
- **Ask Pentti** in Rovo Chat: finds machines by any name, answers in three parts, links every machine to its card, creates tasks after a yes.
- **Teamwork Graph**: one asset card per machine, so Rovo Search finds them.
- **MCP** (Preview): three read-only tools for any MCP client, see `docs/mcp.md`.

## Install the demo, about 10 minutes

You need a Jira Cloud test site with Confluence and Rovo, and an organization admin account (Teamwork Graph connectors and MCP exposure need one).

Every step below ran on our own development site. An install from this link on a fresh site, by someone else, has not been tested, so the 10 minutes is an estimate.

1. **Install.** Open the [install link](https://developer.atlassian.com/console/install/d2fcbee5-3e1f-41db-8db4-e4360bef4b93?signature=AYABeCPQx2AQIdiRJtt2fagOzmIAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBjymlfhRrVYbTYamD3gJz8gAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDMQLrC%2F%2Bgz%2Fn7H6SmgIBEIA7dKCGn%2FGaiU6GRiBAGlkIJIng%2FOMFc4lnZrMmy6ttWTaRPJg2drPLdZeywFRMvYfP%2BwOSnN%2BjHAMtMWUAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgFvO1ZhgoYpqrDUp%2Fnt9V3yAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMjTGQ8zlFfV%2BJZbNEAgEQgDsNe4TXTgm4qF8M3OXaJuIgp%2FcPT%2Blct7X01m8NUMSxoukWl4IhFHVEYK1FpY5IiA6g6tbzOPr9nq1M6wAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAR%2BG8r%2BwFe2JaDsHjpCfsWQAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAzCWzKUTu%2F4DNXTJgYCARCAO37y8NrbMnAhuzSdoXbUNsxarnzCasdZ2Egu6vNiCRlaunK%2BsGEypTW%2F75MB2aHLmj3xY3RX%2F3RSZcnLAgAAAAAMAAAQAAAAAAAAAAAAAAAAAOxgQ95YrS5eRgTjnJ94Rh3%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADKKV4N1gOewmCBV3Kj%2B4LnbTGHTVcUKv8bJP18crPGBqLNho%2Bu7cUdr1HHKg7yfTmH1WUFp3pfn4mBeRtSZLQpwhi4%3D&product=jira&product=confluence). Pick your site, install into Jira and Confluence, approve the scopes. If Confluence was skipped: admin.atlassian.com, Apps, Sites, your site, Connected apps, Pentti, connect Confluence.
2. **Optional, MCP.** admin.atlassian.com, Apps, Sites, your site, Connected apps, Pentti, Details, TOOLS, Enable tools. If a client then lists no tools, it is a Preview bug with Confluence connected, the fix is in `docs/mcp.md`.
3. **Load the factory.** Jira settings, Apps, Pentti. Pick an empty Jira project and an empty Confluence space (create them first if the site has none, any type works), press Load the factory. About a minute for 66 pages (the 61 pages of content, one root page and four section pages) and 150 issues. Pressing it again changes nothing.
4. **First answer.** Open Rovo Chat, pick the agent Ask Pentti, ask: "What happens if Old Faithful dies?"
5. **The page.** Jira, Apps, Pentti. Gap map, closing list, asset card, people.
6. **Optional, Teamwork Graph.** admin.atlassian.com, Connectors, Add connector, Pentti asset cards. The cards sync at once, Rovo Search finds them 3 to 4 minutes later (filter App: Pentti asset cards).

Reset on the admin page removes everything Pentti created, by the label `pentti-demo`, and nothing else.

## Try your own data

A proof of concept, not for production use. Use a sandbox site or a small space with nothing sensitive in it. Bundled data stays the default, your data is used only after you choose it, and one click goes back.

1. Jira settings, Apps, Pentti, scroll to **Try your own data**.
2. Give an asset list as CSV, at most 1000 machines. Each row needs a `hostname` or an `ip`. Optional columns: `site`, `line`, `role`, `model`, `manufacturer`, `firmware`, `criticality`, `nickname`, `former_names`, `old_ips`, `open_critical`, `open_high`. A blank becomes "not known".
3. Optional: pick one Jira project and one Confluence space to read. At most 200 pages and 500 issues, the answers say when more exist.
4. Tick the box, press **Import**, then choose **Use my own data** under Data source.

What it does:

- Matches pages and tickets to your machines by hostname, IP, old IP, former name, nickname and model with line. It finds a machine only where a page or ticket names it.
- Fills the gap map, the closing list, the asset cards and Ask Pentti, with CSV, SITE and SCORE chips.
- Something it can not back up stays "not known". A name that could be an ordinary word, such as `printer`, only counts as a maybe. A page naming more than 25 machines is treated as a list, not as documentation.

What it does not do:

- **No writes.** It only sends GET requests to Jira and Confluence, as the admin who imports. Creating tasks is off in this mode.
- **No people.** Owner and "who knows it" are "not known", and the owner points can not be earned, so the highest knowledge score is 80. No account names are read into the app.
- **No live sync.** It answers from the import until you import again.
- **No sharing.** Only Jira admins get answers, on the page and in Rovo. The MCP tools refused while a site ran on own data, in our test with the Claude client. Nothing goes into the Teamwork Graph.

What it keeps: your asset list, page and ticket titles, keys and dates, and what matched, in this app's Forge storage. Page and ticket text is dropped after matching. **Delete my data** removes all of it. Nothing changes in Jira or Confluence, and Reset can not touch your pages or tickets. Answers in Rovo Chat and over MCP pass through those services as usual.

## How it is built

- Forge, Node 24, TypeScript. Custom UI with React and Vite. Storage in Forge KVS.
- `scripts/`: Python generator, raw scan export to `data/generated/`, deterministic (seed 2026). The raw export never enters git, a leak check runs in CI.
- `src/match/`: deterministic matcher, pages and tickets to machines by hostname, IP, old IP, former name, nickname, model with line. No model in the loop.
- `src/score/`: knowledge, risk, danger, closing list, traffic lights. Pure functions, weights in `config/scoring.yml`.
- `src/actions/`: the Rovo actions and the view models for the page.
- `src/seed/`: the idempotent seeder behind "Load the factory".
- `src/connector/`: Teamwork Graph asset cards.
- `src/own/`: the own data proof of concept. CSV reader, read-only Jira and Confluence reader, its own matcher, its own storage keys.
- Tests: `npm test` runs pytest for the generator and vitest for matcher, scores, actions, seeder, cards and own data. `tests/bundled-baseline.test.ts` freezes every bundled output, so own data can not change the demo unnoticed.

What we measured on the platform, and every workaround, is in `docs/limits.md`. Decisions are in `docs/decisions.md`.

## License

MIT.
