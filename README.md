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

1. **Install.** Open the install link: INSTALL_LINK. Pick your site, install into Jira, approve the scopes.
2. **Optional, MCP.** If you want to try the MCP tools, do this now, before step 3: admin.atlassian.com, Apps, Sites, your site, Connected apps, Pentti, Details, TOOLS, Enable tools. Enabling them after Confluence is connected hits a Preview bug, see `docs/mcp.md`.
3. **Connect Confluence.** Pentti writes its demo pages into Confluence. In admin.atlassian.com, Apps, Sites, your site, Connected apps, Pentti: connect Confluence.
4. **Load the factory.** Jira settings, Apps, Pentti. Pick an empty Jira project and an empty Confluence space, press Load the factory. About a minute for 66 pages and 150 issues. Pressing it again changes nothing.
5. **First answer.** Open Rovo Chat, pick the agent Ask Pentti, ask: "What happens if Old Faithful dies?"
6. **The page.** Jira, Apps, Pentti. Gap map, closing list, asset card, people.
7. **Optional, Teamwork Graph.** admin.atlassian.com, Connectors, Add connector, Pentti asset cards. The cards sync at once, Rovo Search finds them 3 to 4 minutes later (filter App: Pentti asset cards).

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
