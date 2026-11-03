# Decisions

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-11-03 | GitHub for the repo, private until submission | Rules need an install link, a video and a description, not a repo. Claude Code works with GitHub directly. |
| D2 | 2026-11-03 | npm scripts, no Makefile | Windows machine, no make. |
| D3 | 2026-11-03 | Assets enter the Teamwork Graph as `atlassian:document` asset cards, Forge storage is the source of truth | The graph has no device, asset or vulnerability object type. |
| D4 | 2026-11-03 | Raw export stays in `data/raw/` (gitignored). Only the generated, remapped dataset is committed. | Leak check enforces it. |
| D5 | 2026-11-03 | Fictional company Tervaniemi Works, agent Pentti | Names live in `config/names.yml`. |
| D6 | 2026-11-03 | Seeded content dates live in the app, scores never read Atlassian created or updated dates | Jira REST refuses `created` on create (limits.md g). |
| D7 | 2026-11-03 | Asset card to Confluence page links are kept in app storage and written into the card text, not as graph associations | No Confluence page association type exists (limits.md h). |
| D8 | 2026-11-03 | App registered in Developer Space `pentti`, not as a personal app | The space refuses personal apps. |
| D9 | 2026-11-03 | Node 24.22.2 pinned in `.node-version` via fnm | Forge CLI 15 refuses Node 24.14. |
| D10 | 2026-11-03 | OT-like means an OT device type outside Purdue 3 and up, or any Purdue level 0 to 2.5. Scope is OT-like plus every host with findings plus 100 random IT neighbours. | Gives 309 OT-like rows (spec says 307) and 522 assets, inside 450 to 550. |
| D11 | 2026-11-03 | Model, firmware and manufacturer come from findings. A host with several modules takes the most frequent tuple. Assets without findings have model null. | The inventory export has no model or firmware fields. |
| D12 | 2026-11-03 | Findings join by IP. When one IP carries several host ids, they map to the inventory rows on that IP in record order. A duplicate IP keeps the address of its first holder, also across lines. | Keeps the export's ambiguities instead of repairing them. |
| D13 | 2026-11-03 | Nicknames are unique within a plant and may repeat across plants. Pool of 60. | 25 percent of about 300 OT assets needs more than 60 names. Cross-plant repeats are realistic and exercise the ambiguous-match path. |
| D14 | 2026-11-03 | Asset and finding ids are hashes of seed and record position, never of original values. | A salted hash of an IP could be brute forced. Record order is preserved in the export, so position is stable. |
