# Pentti - project rules for Claude Code

Read `FACTORY_BUILD.md` first. It is the spec. Work one slice at a time. Do not start the next slice until the current one's "Done when" is true. Commit per slice and tag `sN-done`.

Start with slice S0 only, unless told otherwise.

## Hard rules
- `data/raw/` is gitignored. Never commit it, never copy its contents into any tracked file, never paste raw hostnames, IPs, MACs or site codes into code, tests, docs or commit messages. The generated dataset in `data/generated/` is the only thing derived from it that gets committed.
- Run `npm run check` (leak check, plus dataset checks once they exist) before every commit.
- Scores are pure functions with tests. The model never computes a number.
- The agent says "not known" when there is no source. No guessing, no filling gaps.
- Authorize writes with `context.accountId`. Never trust action inputs, they may be hallucinated.
- Fictional company, generated people. Label SCAN, GEN, SCORE chips on every number.
- Copy voice: short, dry, no em dashes, no curly quotes, no exclamation marks.
- If a Forge doc fact is marked VERIFY, test it with code and write the result to `docs/limits.md`. Do not guess.

## Platform
Windows. There is no `make`. Use the npm scripts in `package.json`. Python is `python` (3.12). Install dev deps with `pip install -r requirements-dev.txt`.

## Commands (npm scripts)
- `npm run dataset`        raw -> data/generated, deterministic (script arrives in S1)
- `npm run check`          leak check (`tools/check_publishable.py`), more checks join in S1 and S2
- `npm run hashes`         rebuild `tools/token_hashes.txt` from data/raw (CI uses the hashes)
- `npm test`               placeholder until S1 and S3 add pytest and vitest
- `npm run deploy`         forge deploy
- `npm run forge-install`  forge install (dev site)
- `npm run logs`           forge logs

## Slice S0 notes
- `forge create` makes its own scaffold. Run it in a temporary subfolder, then merge `manifest.yml`, `src/` and the dependencies into this repo root. Keep this repo's `package.json` scripts, `.gitignore`, `config/`, `docs/` and `tools/`.
- Needs `FORGE_EMAIL` and `FORGE_API_TOKEN` for non-interactive Forge CLI login (see `.env.example`). Never commit them.
- Results of the spike go into `docs/limits.md`, the table is already there.

## When blocked
Stop, write what you tried and what failed into `docs/limits.md`, and ask. Do not loop on the same failing call more than twice.
