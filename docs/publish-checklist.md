# Publish checklist

Status as of 2026-11-05. `[x]` means checked that day, with what checked it. Rules: https://codegeist2026.devpost.com/rules

Deadline: Tue Dec 22 2026, 12:00 Pacific (22:00 Helsinki). Plan: submit Dec 19-20.

## 1. App

- [x] `npm run check`, typecheck, vitest (111) and pytest (17) pass at d437ea7. CI green on main.
- [x] Production deployed 2026-11-05 10:55 UTC, after the last code commit. This is what the install link gives.
- [ ] Development install on the dev site was deployed 10:47 UTC, before the last commit (admin space list only). Run `npm run deploy` there before recording, so the film and the install link run the same code.
- [ ] Deploy again if anything changes in `src/`, `static/`, `manifest.yml` or `prompts/`. Then `forge version list -e production`, and recheck the install link.
- [ ] Space list fix seen live on a new space. NOT RUN so far (`docs/limits.md`, Fresh site).
- [ ] Load into a `collaboration` or `knowledge_base` space. NOT RUN so far.
- [ ] Connector icon broken in Rovo Search on the dev site, it still asks for the old path. Add the connector again on that site (disconnect deletes the cards, they sync back on connect), and check it on a new site too, since a judge adds it fresh (`docs/limits.md`, Screenshots). Retake `rovo-search.png` after.
- [ ] Someone else installs from the link on a clean site. Not done, the only install is the author's own. README says so.
- [ ] Install link opens in a logged-out browser. Forge sharing still on in the developer console.

## 2. Devpost text (`docs/devpost-text.md`)

- [x] Numbers checked against the code: 522, 2194, 61, 150, 270 of 276, 98 of 98, no false positives (395 counted links, 0 wrong).
- [x] Added what the rules ask and the draft lacked: main technology requirement, testing instructions. Bonus names now as in the rules.
- [ ] Every `[fill: ...]` replaced or removed. Six left, all yours: inspiration, the source of the scan, how the build went, accomplishments, what you learned, what's next.
- [ ] Copy voice check on what you write: no em dashes, no curly quotes, no exclamation marks.

## 3. Video (`docs/video-script.md`)

- [x] End card fixed, it said the app does not read your own site, own data exists now.
- [ ] Photo of Pentti and the full size logo. Neither is in the repo. If the photo shows a real person, consent. If AI generated, see the YouTube setting in `docs/publish-copy.md`.
- [ ] Reset and load on recording day, so "150 days" is 150. Reset removes gap tasks and "I checked this" clicks.
- [ ] Record, under 3:00 for the story. Rules: less than 5 minutes, judges need not watch past 3.
- [ ] Rules: no third party trademarks or copyrighted material without permission. No news logos or footage on the fridge card. No music.
- [ ] Jira UI in English. `data/raw/` never on screen.
- [ ] Upload to YouTube, public. Text in `docs/publish-copy.md`. Fix chapter times to the final cut.

## 4. Pictures (`docs/media/`, see its README)

- [x] Screenshots from the real app on the dev site: gap map, asset card, closing list with keys, People, Rovo Chat, Rovo Search. Numbers on screen match the docs.
- [x] Thumbnails built from those: YouTube 1280x720, Devpost 3:2 at 1500x1000.
- [ ] Look through them yourself, they are your entry.
- [ ] Retake after any UI change, or if a number on the page changes.

## 5. Repo

- [x] Public. `.env` and `data/raw` are ignored, `.env` never in history. Leak check clean.
- [ ] Description and topics, command in `docs/publish-copy.md`.
- [ ] Optional: a screenshot at the top of the README.
- [ ] Commit `docs/` and `docs/media/` after `npm run check`.

## 6. Devpost form

- [ ] Category: Apps for Specialized Industries.
- [ ] Bonus: Best Agents - Rovo/Assignable agents, Best apps with Teamwork Graph integration, Best app with Atlassian MCP. Paste the three write-ups. Best Marketplace published app is skipped (D40). One submission can win one grand prize and one bonus prize.
- [ ] Links: YouTube, install link (from the README), repo.
- [ ] Testing instructions, gallery images in the order from `docs/publish-copy.md`, thumbnail.
- [ ] Submit by Dec 20.
- [ ] Reopen the submission page from a logged-out browser. Video plays, links open.

## 7. After submitting

- [ ] Leave the production app installed and the install link on until judging ends, Feb 3 2027. Winners about Feb 15.
- [ ] Do not deploy anything that changes what the video shows during judging.
- [ ] Post on LinkedIn and X, `docs/publish-copy.md`.
