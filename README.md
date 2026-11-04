# Pentti

A Forge app that measures what a factory does not know about its own machines, then helps close the dangerous gaps first. A Rovo agent, Ask Pentti, answers questions about machines and says "nobody knows, here is where I looked" when that is the truth.

Built for Atlassian Codegeist 2026, category Apps for Specialized Industries.

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

## Install and try, about 10 minutes

You need a Jira Cloud site with Confluence and Rovo, and an organization admin account (Teamwork Graph connectors and MCP exposure need one).

1. **Install.** Open the [install link](https://developer.atlassian.com/console/install/d2fcbee5-3e1f-41db-8db4-e4360bef4b93?signature=AYABeCPQx2AQIdiRJtt2fagOzmIAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBjymlfhRrVYbTYamD3gJz8gAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDMQLrC%2F%2Bgz%2Fn7H6SmgIBEIA7dKCGn%2FGaiU6GRiBAGlkIJIng%2FOMFc4lnZrMmy6ttWTaRPJg2drPLdZeywFRMvYfP%2BwOSnN%2BjHAMtMWUAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgFvO1ZhgoYpqrDUp%2Fnt9V3yAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMjTGQ8zlFfV%2BJZbNEAgEQgDsNe4TXTgm4qF8M3OXaJuIgp%2FcPT%2Blct7X01m8NUMSxoukWl4IhFHVEYK1FpY5IiA6g6tbzOPr9nq1M6wAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAR%2BG8r%2BwFe2JaDsHjpCfsWQAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAzCWzKUTu%2F4DNXTJgYCARCAO37y8NrbMnAhuzSdoXbUNsxarnzCasdZ2Egu6vNiCRlaunK%2BsGEypTW%2F75MB2aHLmj3xY3RX%2F3RSZcnLAgAAAAAMAAAQAAAAAAAAAAAAAAAAAOxgQ95YrS5eRgTjnJ94Rh3%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADKKV4N1gOewmCBV3Kj%2B4LnbTGHTVcUKv8bJP18crPGBqLNho%2Bu7cUdr1HHKg7yfTmH1WUFp3pfn4mBeRtSZLQpwhi4%3D&product=jira&product=confluence). Pick your site, install into Jira and Confluence, approve the scopes. If Confluence was skipped: admin.atlassian.com, Apps, Sites, your site, Connected apps, Pentti, connect Confluence.
2. **Optional, MCP.** admin.atlassian.com, Apps, Sites, your site, Connected apps, Pentti, Details, TOOLS, Enable tools. If a client then lists no tools, it is a Preview bug with Confluence connected, the fix is in `docs/mcp.md`.
3. **Load the factory.** Jira settings, Apps, Pentti. Pick an empty Jira project and an empty Confluence space (create them first if the site has none, any type works), press Load the factory. About a minute for 66 pages and 150 issues. Pressing it again changes nothing.
4. **First answer.** Open Rovo Chat, pick the agent Ask Pentti, ask: "What happens if Old Faithful dies?"
5. **The page.** Jira, Apps, Pentti. Gap map, closing list, asset card, people.
6. **Optional, Teamwork Graph.** admin.atlassian.com, Connectors, Add connector, Pentti asset cards. The cards sync at once, Rovo Search finds them 3 to 4 minutes later (filter App: Pentti asset cards).

Reset on the admin page removes everything Pentti created, by the label `pentti-demo`, and nothing else.

## How it is built

- Forge, Node 24, TypeScript. Custom UI with React and Vite. Storage in Forge KVS.
- `scripts/`: Python generator, raw scan export to `data/generated/`, deterministic (seed 2026). The raw export never enters git, a leak check runs in CI.
- `src/match/`: deterministic matcher, pages and tickets to machines by hostname, IP, old IP, former name, nickname, model with line. No model in the loop.
- `src/score/`: knowledge, risk, danger, closing list, traffic lights. Pure functions, weights in `config/scoring.yml`.
- `src/actions/`: the Rovo actions and the view models for the page.
- `src/seed/`: the idempotent seeder behind "Load the factory".
- `src/connector/`: Teamwork Graph asset cards.
- Tests: `npm test` runs pytest for the generator and vitest for matcher, scores, actions, seeder and cards.

What we measured on the platform, and every workaround, is in `docs/limits.md`. Decisions are in `docs/decisions.md`.

## License

MIT.
