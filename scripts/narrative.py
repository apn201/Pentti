"""Hero pins and narrative rendering for build_dataset.py.

Narrative sources live in narrative/pages/*.md (YAML front matter + body) and
narrative/issues/*.yml (a list of issues). Text refers to assets with markup:

  [[ref]]            hostname                       kind exact
  [[ref|ip]]         current IP                     kind exact
  [[ref|nick]]       nickname                       kind nick
  [[ref|oldip]]      an address it no longer has    kind old
  [[ref|oldname]]    a name it no longer has        kind old
  [[ref|model]]      model only                     kind model
  [[ref|modelline]]  "the <model> on line <n>"      kind model_line
  [[ref|modelplant]] "the <model> in <Plant>"       kind model_plant

ref is a hostname (after pins) or an asset id. The renderer records each use in
mentions[] as {assetId, kind}. That is ground truth for the matcher, the app never reads it.
"""
import re
from pathlib import Path

import yaml

REF = re.compile(r"\[\[([^|\]]+)(?:\|([a-z]+))?\]\]")
KINDS = {
    None: "exact", "ip": "exact", "nick": "nick", "oldip": "old", "oldname": "old",
    "model": "model", "modelline": "model_line", "modelplant": "model_plant",
}
PAGE_CLASSES = {"gold", "ok", "stale", "wrong-ref", "duplicate-conflict", "orphan", "fun", "reference"}


class NarrativeError(Exception):
    pass


def apply_pins(assets, pins):
    by_id = {a["id"]: a for a in assets}
    for pin in pins or []:
        a = by_id.get(pin["id"])
        if a is None:
            raise NarrativeError(f"pin for unknown asset {pin['id']}")
        for k, v in pin.get("set", {}).items():
            if k not in a:
                raise NarrativeError(f"pin sets unknown field {k}")
            a[k] = v
    ip_of_host = {a["hostname"]: a["ip"] for a in assets if a["hostname"]}
    for pin in pins or []:
        a = by_id[pin["id"]]
        for old in pin.get("ipHistory", []):
            old = ip_of_host.get(old[1:], old) if old.startswith("@") else old
            if old not in a["ipHistory"]:
                a["ipHistory"].append(old)


def short_model(m):
    return m or "unknown box"


class Renderer:
    def __init__(self, assets):
        self.assets = assets
        self.by_ref = {}
        for a in assets:
            self.by_ref[a["id"]] = a
            if a["hostname"]:
                self.by_ref[a["hostname"]] = a
        self.used_ips = {a["ip"] for a in assets}
        self.old_counter = {}

    def old_ip(self, a):
        if a["ipHistory"]:
            return a["ipHistory"][0]
        plant_oct, line_oct = a["ip"].split(".")[1:3]
        k = self.old_counter.get((plant_oct, line_oct), 200)
        while f"10.{plant_oct}.{line_oct}.{k}" in self.used_ips:
            k += 1
        ip = f"10.{plant_oct}.{line_oct}.{k}"
        self.old_counter[(plant_oct, line_oct)] = k + 1
        self.used_ips.add(ip)
        a["ipHistory"].append(ip)
        return ip

    def old_name(self, a):
        if a["formerNames"]:
            return a["formerNames"][0]
        if a["hostname"]:
            plant, line, role, nn = a["hostname"].split("-")
            name = f"{plant[:3]}{line[1:]}{role}{int(nn)}"
        else:
            name = f"{a['plant'][:3].lower()}{a['line'][1:]}-{a['role']}-x{a['ip'].split('.')[-1]}"
        a["formerNames"].append(name)
        return name

    def render(self, text, where):
        mentions = []

        def sub(m):
            ref, form = m.group(1).strip(), m.group(2)
            a = self.by_ref.get(ref)
            if a is None:
                raise NarrativeError(f"{where}: unknown asset ref [[{ref}]]")
            if form not in KINDS:
                raise NarrativeError(f"{where}: unknown form |{form}")
            if form is None:
                if not a["hostname"]:
                    raise NarrativeError(f"{where}: {ref} has no hostname")
                out = a["hostname"]
            elif form == "ip":
                out = a["ip"]
            elif form == "nick":
                if not a["nickname"]:
                    raise NarrativeError(f"{where}: {ref} has no nickname")
                out = a["nickname"]
            elif form == "oldip":
                out = self.old_ip(a)
            elif form == "oldname":
                out = self.old_name(a)
            elif form == "model":
                out = short_model(a["model"])
            elif form == "modelline":
                out = f"the {short_model(a['model'])} on line {a['line'][1:]}"
            else:
                out = f"the {short_model(a['model'])} in {a['plant']}"
            mentions.append({"assetId": a["id"], "kind": KINDS[form]})
            return out

        return REF.sub(sub, text or ""), mentions


def read_pages(root: Path):
    out = []
    for p in sorted((root / "narrative" / "pages").glob("*.md")) if (root / "narrative" / "pages").exists() else []:
        text = p.read_text(encoding="utf-8")
        if not text.startswith("---"):
            raise NarrativeError(f"{p.name}: missing front matter")
        _, fm, body = text.split("---", 2)
        meta = yaml.safe_load(fm)
        meta["body"] = body.strip("\n") + "\n"
        meta["_file"] = p.name
        out.append(meta)
    return out


def read_issues(root: Path):
    out = []
    for p in sorted((root / "narrative" / "issues").glob("*.yml")) if (root / "narrative" / "issues").exists() else []:
        for item in yaml.safe_load(p.read_text(encoding="utf-8")) or []:
            item["_file"] = p.name
            out.append(item)
    return out


def people_of(cfg):
    out = []
    for p in cfg["people"]:
        out.append({
            "id": p["id"],
            "name": p["name"],
            "role": p["role"],
            "plant": p.get("plant"),
            "startedYearsAgo": p.get("started_years_ago"),
            "leavingInDays": p.get("leaving_in_days"),
            "leftDaysAgo": p.get("left_days_ago"),
            "bio": p["bio"],
        })
    return out


def build_narrative(root: Path, cfg, assets):
    people = people_of(cfg)
    person_ids = {p["id"] for p in people}
    r = Renderer(assets)

    pages = []
    seen = set()
    for m in read_pages(root):
        where = m["_file"]
        for k in ("id", "title", "space", "class", "lastEditedDaysAgo"):
            if k not in m:
                raise NarrativeError(f"{where}: missing {k}")
        if m["id"] in seen:
            raise NarrativeError(f"{where}: duplicate id {m['id']}")
        seen.add(m["id"])
        if m["class"] not in PAGE_CLASSES:
            raise NarrativeError(f"{where}: class {m['class']}")
        if m.get("author") is not None and m["author"] not in person_ids:
            raise NarrativeError(f"{where}: unknown author {m['author']}")
        title, t_mentions = r.render(m["title"], where)
        body, b_mentions = r.render(m["body"], where)
        pages.append({
            "id": m["id"],
            "title": title,
            "space": m["space"],
            "authorId": m.get("author"),
            "class": m["class"],
            "lastEditedDaysAgo": m["lastEditedDaysAgo"],
            "bodyMarkdown": body,
            "mentions": t_mentions + b_mentions,
        })

    issues = []
    for m in read_issues(root):
        where = f"{m['_file']}:{m.get('id')}"
        for k in ("id", "summary", "type", "status", "reporter", "createdDaysAgo"):
            if k not in m:
                raise NarrativeError(f"{where}: missing {k}")
        if m["id"] in seen:
            raise NarrativeError(f"{where}: duplicate id")
        seen.add(m["id"])
        for k in ("reporter", "assignee"):
            if m.get(k) is not None and m[k] not in person_ids:
                raise NarrativeError(f"{where}: unknown {k} {m[k]}")
        summary, s_mentions = r.render(m["summary"], where)
        desc, d_mentions = r.render(m.get("description", ""), where)
        issues.append({
            "id": m["id"],
            "summary": summary,
            "type": m["type"],
            "status": m["status"],
            "reporterId": m["reporter"],
            "assigneeId": m.get("assignee"),
            "createdDaysAgo": m["createdDaysAgo"],
            "resolvedDaysAgo": m.get("resolvedDaysAgo"),
            "description": desc.strip("\n"),
            "labels": m.get("labels", []),
            "mentions": s_mentions + d_mentions,
        })
    return people, pages, issues
