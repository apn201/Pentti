# Devpost text (draft)

Written in the APN201 voice. `[fill: ...]` marks a fact only Juha can give. Numbers come from the app and `docs/limits.md`, check them against the final build before pasting.

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

All of it is written down in `docs/limits.md`, with what was tried.

## Accomplishments that I'm proud of

[fill: your pick. Do not let me choose this one.]

## What I learned

[fill: your own words.]

## What's next

[fill: only if you want one. For example a real scanner import instead of the demo dataset.]

## Built with

Forge, Rovo agents, Rovo actions, Teamwork Graph connector, rovo:mcp, Jira, Confluence, TypeScript, React, Vite, Python, vitest, pytest, Claude Code.

## Bonus: Best Agents (Rovo)

Ask Pentti uses six actions: find-asset, explain-asset, blast-radius, who-knows, gap-report and create-gap-tasks. Every asset id the model passes in is checked against the data, an unknown id gets search results back instead of a guess. The one write checks the user's own Jira permission and runs as that user, and Rovo shows its confirmation card before it. The prompt makes the agent answer in three parts and say "not known" when there is no source. On a nameless PLC with 91 findings and no page, it lists every gap and names nobody.

## Bonus: Best Teamwork Graph integration

522 asset cards as `atlassian:document`, one per machine, with the seeded Jira issues as associations. The card text carries every name of the machine, so Rovo Search finds it by hostname, nickname or old address. Cards are rewritten after every load and reset and after "I checked this", and removed on disconnect. There is no Confluence page association type, so page titles and links go into the card text.

## Bonus: Best Atlassian MCP

`rovo:mcp` exposes find-asset, explain-asset and gap-report. Read only on purpose, writes stay inside Rovo where the user confirms them. Tested with Claude as the client: find Old Faithful, list the three Oracles in three plants, Birch closing list, and the honest answer for the nameless PLC.

## Submission checklist

- [ ] Video public on YouTube, under 3 minutes of content, link in the form.
- [ ] Every `[fill: ...]` above replaced or removed.
- [ ] Category: Apps for Specialized Industries.
- [ ] Bonus categories selected: Best Agents (Rovo), Best Teamwork Graph integration, Best Atlassian MCP. Paste the three write-ups above.
- [ ] Install link (from the README) and the public repo link in the form.
- [ ] Screenshots: gap map, asset card, closing list with keys, People with Pentti in red, Rovo Chat answer.
- [ ] Submit by Dec 20, deadline Dec 22 12:00 PST (22:00 Helsinki).
- [ ] Reopen the submission page from a logged-out browser and check the video plays and the links open.
