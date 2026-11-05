# Devpost text (draft)

Written in the APN201 voice. `[fill: ...]` marks a fact only Juha can give. Numbers come from the app and `docs/limits.md`. Checked against the code at d437ea7 on 2026-11-05 (production was deployed from it the same day): 522, 2194, 61, 150, 270 of 276, 98 of 98, 395 counted links with 0 wrong. Check again if anything is deployed after that. Rules: https://codegeist2026.devpost.com/rules

## Tagline

A memory for the factory. Says what is known about a machine, what is not, and where it looked.

## Inspiration

[fill: why this problem, from your own work. For example where you have seen a plant run on one person's memory, without names or details that identify anyone.]

Every manufacturer has a scanner export somewhere. It knows the box, the IP and the firmware. It does not know what the machine does, who fixes it or where the runbook is. That part lives in a few people, some Confluence pages from 2019 and old tickets that say "restarted by hand, do not know why it works". NIS2 asks EU manufacturers to have an asset inventory and to know their risks, so the gap is now also a compliance question.

I wanted an agent that is allowed to say "nobody knows". Most assistants fill the gap with something plausible. In a factory that is worse than nothing.

## What it does

Pentti is a working demo, a Forge app for Jira, Confluence and Rovo. It runs on one fictional factory bundled inside the app. It takes the factory's machines from an anonymized scan, matches them to the factory's pages and tickets, and scores each machine on how much is known about it and how risky it is.

To try it on real data, a Jira admin can import an asset list as CSV and pick one Jira project and one Confluence space to read. That part is a proof of concept: read only, no people, no task creation, no graph, visible to Jira admins, and answers come from the import, not live. It is not for production use. Install it on a test site.

- Gap map: 522 assets, knowledge against risk. Top right is risky and nobody knows anything.
- Asset card: known, not known, where it looked. Pages and tickets with match confidence, people, findings, and a button for "I checked this".
- Closing list: the assets to document first, ranked by danger removed per hour. Hours per step, total hours, percent of danger removed. One button creates the Jira tasks.
- People: who is the only name on which machines. Pentti, the maintenance electrician, leaves in 150 days and is the only name on 39 machines.
- Ask Pentti in Rovo Chat: finds a machine by any name (hostname, nickname, old IP, former name), answers in three parts, links the machine to its card, and creates tasks after a yes. If two machines have the same nickname it asks which one.
- Teamwork Graph: one asset card per machine, so Rovo Search finds Old Faithful by its nickname.
- MCP: three read-only tools for any MCP client. Tested with Claude.

The company is fictional, Tervaniemi Works. The machine mix is real, from an anonymized OT scan of a real plant [fill: say how much you can about the source, for example "a scanner export I had access to, anonymized before it left the machine"]. Every number in the app has a chip: SCAN for the scan, GEN for generated content, SCORE for computed.

## How it meets the main technology requirement

The rules ask for a Forge app that integrates with at least one Atlassian product or platform capability. Pentti is a Forge app, Node 24 runtime, no external egress, data in Forge storage. It uses Jira (global page, admin page, seeded issues, gap tasks created as the user), Confluence (seeded pages), Rovo (agent `rovo:agent` and six `action` modules), Teamwork Graph (`graph:connector`, 522 cards) and the Atlassian MCP server (`rovo:mcp`, Preview).

## Testing instructions for judges

Full steps with the install link are in the README: https://github.com/apn201/Pentti#install-the-demo-about-10-minutes

- You need a Jira Cloud test site with Confluence and Rovo, and an organization admin for the connector and MCP steps. Confluence has to be on the site before you install, otherwise the dialog says "Installation failed" next to Confluence.
- Short path: install, Jira settings, Apps, Pentti, pick an empty project and space, Load the factory. Rovo Chat, agent Ask Pentti: "What happens if Old Faithful dies?" Then Jira, Apps, Pentti for the page.
- The page and the agent answer from the bundled data even before the load.
- The author ran this install once on a new site. Nobody else has yet, so "about 10 minutes" is an estimate.

## How I built it

Mostly with Claude Code, working slice by slice from a written spec. [fill: your own words on how that went, how much you steered, what you wrote yourself.]

- A Python generator turns the raw scan into the demo dataset. Same seed, same output byte for byte. Names, IPs and sites are remapped. A leak check runs in CI so nothing original gets committed.
- Pages and tickets were written as narrative with markup, so the ground truth of which page mentions which machine is known. That made it possible to measure the matcher: 270 of 276 exact mentions found, all 98 old names and addresses, no false positives.
- The matcher is plain code, no model. Hostname, current and old IP, former name, nickname within its plant, model with line. When two machines share an IP both get a "maybe", never a guess.
- Scores are pure functions with tests. Weights in one YAML file. The model never adds up anything, it repeats what the actions return.
- "Load the factory" on the admin page seeds 66 Confluence pages (61 of content, five for the page tree) and 150 Jira issues in steps of 10, so the sources can be read on the site. The matcher works on the bundled copy, it does not read them back. Pressing it again changes nothing, Reset removes only what it made.
- Custom UI in React. The gap map is a hand drawn SVG.
- The own data proof of concept sits beside the demo, not inside it: its own matcher, its own storage keys, GET requests only. A test freezes every bundled output, so it can not change the demo unnoticed. Real names follow no pattern, so names match as whole tokens, a name that could be a word stays a maybe, and a page naming more than 25 machines counts as a list, not as documentation. The matcher's measured numbers above are for the demo data, there are none yet for real data.

## Challenges I ran into

- Neither Jira nor Confluence lets you set a created date. The app keeps its own dates and the pages say "(app date)".
- A Jira app could not call Confluence until the manifest declared multi-app compatibility. Before that every call was a 401 "scope does not match".
- Confluence v1 endpoints answer 410 to apps, while the same call with my API token works. Moved to v2.
- Confluence labels do not allow a colon. `pentti-demo:is_001` became `pentti-demo-is_001`.
- MCP tools did not list in Claude. A community thread from the same day had the workaround: disconnect Confluence, toggle the tools, connect again.
- The graph connection did not survive changing the installation. The connector had to be added again.
- Installing on a new site before Confluence was there: "Installation failed. Try again or contact app owner" next to Confluence, no hint of why. The README says it now.
- The admin page listed no spaces on the new site and gave no error, because `type=global` leaves out the newer space types. It now asks for all current spaces except personal ones.

All of it is written down in `docs/limits.md`, with what was tried.

## Accomplishments that I'm proud of

[fill: your pick. Do not let me choose this one.]

## What I learned

[fill: your own words.]

## What's next

[fill: only if you want one. For example a real scanner import instead of the CSV, the own data part as more than a proof of concept.]

## Built with

Forge, Rovo agents, Rovo actions, Teamwork Graph connector, rovo:mcp, Jira, Confluence, TypeScript, React, Vite, Python, vitest, pytest, Claude Code.

## Bonus: Best Agents - Rovo/Assignable agents

Ask Pentti uses six actions: find-asset, explain-asset, blast-radius, who-knows, gap-report and create-gap-tasks. Every asset id the model passes in is checked against the data, an unknown id gets search results back instead of a guess. The one write checks the user's own Jira permission and runs as that user, and Rovo shows its confirmation card before it. The prompt makes the agent answer in three parts and say "not known" when there is no source. On a nameless PLC with 91 findings and no page, it lists every gap and names nobody.

## Bonus: Best apps with Teamwork Graph integration

522 asset cards as `atlassian:document`, one per machine, with the seeded Jira issues as associations. The card text carries every name of the machine, so Rovo Search finds it by hostname, nickname or old address. Cards are rewritten after every load and reset and after "I checked this", and removed on disconnect. There is no Confluence page association type, so page titles and links go into the card text.

## Bonus: Best app with Atlassian MCP

`rovo:mcp` exposes find-asset, explain-asset and gap-report. Read only on purpose, writes stay inside Rovo where the user confirms them. Tested with Claude as the client: find Old Faithful, list the three Oracles in three plants, Birch closing list, and the honest answer for the nameless PLC.

## Submission checklist

The full list is in `docs/publish-checklist.md`.
