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
