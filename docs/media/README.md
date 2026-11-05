# Media

Screenshots of the real app, taken 2026-11-05 from the development install on the dev site, right after a load (Pentti shows 150 days). Nothing here is mocked. In the thumbnails only the headline and the short text are typed, the map and the red row are pixels from the screenshots.

| File | What |
|---|---|
| `gap-map.png` | Gap map, 522 assets, 60 Critical with nothing known, 98 in the red corner |
| `asset-card.png` | Asset card for birch-l2-cp-04 (Old Faithful). Full length in `crops/` |
| `closing-list.png` | Closing list for Birch with task keys, 10 assets, 22.5 hours, 15.1 percent |
| `people.png` | People, Pentti in red, only name on 39 machines, 34 of them Critical |
| `rovo-chat.png` | Ask Pentti in Rovo Chat, the two parts of one answer side by side, cut from `rovo-chat-known.png` and `rovo-chat-not-known.png` |
| `rovo-search.png` | Rovo Search for Old Faithful, the asset card first. Shows the broken connector icon, see `docs/limits.md` |
| `thumb-youtube-1280x720.png` | YouTube thumbnail |
| `thumb-devpost-3x2.png` | Devpost thumbnail, 1500x1000 |

## Retake

Needs a browser a person has signed in to, on port 9333, and `playwright-core` outside the repo (it is not a dependency of the app).

```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9333 --user-data-dir=<a temp folder> --no-first-run
```

```bash
PENTTI_SITE=https://<dev site>.atlassian.net NODE_PATH=<folder>/node_modules node tools/capture_media.cjs
```

```bash
python tools/build_thumbnails.py && NODE_PATH=<folder>/node_modules node tools/render_thumbnails.cjs
```

`capture_media.cjs` covers the four page tabs and only reads. Rovo Chat and Rovo Search were driven by hand-written one-off steps and are not in the script. Rovo Chat answers are written by a model, so the wording differs between runs.

Reset and load first if the day count matters. Dates count from the load.
