"""Copy prompts/pentti.md into the rovo:agent prompt in manifest.yml.

The prompt lives in a readable file (FACTORY_BUILD.md section 9), inside its first ``` fence. The
manifest carries a copy as a literal block between the `prompt: |` line and `conversationStarters:`.

    python tools/sync_prompt.py          rewrite the manifest
    python tools/sync_prompt.py --check  fail if the manifest is out of date (npm run check)
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "manifest.yml"
PROMPT = ROOT / "prompts" / "pentti.md"
START = "      prompt: |\n"
END = "      conversationStarters:\n"
INDENT = " " * 8


def render(manifest: str, prompt: str) -> str:
    if START not in manifest or END not in manifest:
        raise SystemExit("sync_prompt: manifest has no `prompt: |` block followed by conversationStarters")
    head, rest = manifest.split(START, 1)
    _, tail = rest.split(END, 1)
    body = "".join((INDENT + line).rstrip() + "\n" for line in prompt.strip().splitlines())
    return head + START + body + END + tail


def fenced(text: str) -> str:
    parts = text.split("```")
    if len(parts) < 3:
        raise SystemExit(f"sync_prompt: no ``` fenced block in {PROMPT.name}")
    return parts[1]


def main() -> int:
    manifest = MANIFEST.read_text(encoding="utf-8")
    prompt = fenced(PROMPT.read_text(encoding="utf-8"))
    for bad in ("—", "–", "‘", "’", "“", "”", "!"):
        if bad in prompt:
            raise SystemExit(f"sync_prompt: banned character {bad!r} in {PROMPT.name}")
    out = render(manifest, prompt)
    if "--check" in sys.argv:
        if out != manifest:
            print("sync_prompt: manifest.yml prompt differs from prompts/pentti.md, run python tools/sync_prompt.py")
            return 1
        print("prompt in sync")
        return 0
    if out != manifest:
        MANIFEST.write_bytes(out.encode("utf-8"))
        print("manifest.yml prompt updated")
    else:
        print("prompt already in sync")
    return 0


if __name__ == "__main__":
    sys.exit(main())
