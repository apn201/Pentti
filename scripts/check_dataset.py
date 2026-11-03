#!/usr/bin/env python3
"""Checks data/generated against FACTORY_BUILD.md section 4 and 5.

  python scripts/check_dataset.py [--dir DIR]

Mechanical parts (S1): shapes, ids, joins, remaps, offsets, scope.
Narrative targets (S2): section 5.5 distribution and 5.6 hero scenes, from ground-truth mentions.
  --progress  print the coverage numbers and only fail on mechanical problems
Exit codes: 0 pass, 1 fail.
"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent

ASSET_KEYS = [
    "id", "hostname", "nickname", "plant", "line", "role", "deviceType", "model", "firmware",
    "manufacturer", "purdue", "criticality", "entityType", "ot", "ip", "macs", "flags",
    "modules", "ipHistory", "formerNames", "firstSeenDaysAgo", "lastSeenDaysAgo",
]
FINDING_KEYS = [
    "id", "assetId", "cve", "severity", "score", "exploitLabel", "exploitValue", "status",
    "publishedDaysAgo", "openedDaysAgo", "summary", "advisoryUrl",
]
FLAGS = {"NO_NAME", "DUP_IP", "UNSUPPORTED", "NO_FIRMWARE"}
ENTITY = {"managed", "unmanaged", "unsupported"}
SEVERITY = {"Critical", "High", "Medium", "Low"}
ID = re.compile(r"^[af]_[0-9a-z]{5}$")
IP = re.compile(r"^10\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$")
MAC = re.compile(r"^[0-9a-f]{2}(:[0-9a-f]{2}){5}$")
CVE = re.compile(r"^CVE-\d{4}-\d{4,}$")


# windows from config/scoring.yml, in days
FRESH_DOC_DAYS = 548
OWNER_DAYS = 730
HISTORY_DAYS = 1095
LEAVING_DAYS = 180
PAGE_TARGETS = {"gold": 6, "ok": 14, "stale": 20, "wrong-ref": 8, "duplicate-conflict": 4, "orphan": 4, "fun": 4, "reference": 1}
ISSUE_KINDS = {"breakdown": 60, "change": 25, "network": 15, "audit": 20, "spares": 15, "noise": 15}
BANNED = ["\u2014", "\u2013", "\u201c", "\u201d", "\u2018", "\u2019", "!", "[["]


def coverage(assets, people, pages, issues):
    """Ground-truth view of what is known per OT asset."""
    person = {p["id"]: p for p in people}
    active = {pid for pid, p in person.items() if p.get("leftDaysAgo") is None}
    stays = {pid for pid in active if person[pid].get("leavingInDays") is None or person[pid]["leavingInDays"] > LEAVING_DAYS}
    docs, hist, touch = {}, {}, {}
    for pg in pages:
        for m in pg["mentions"]:
            docs.setdefault(m["assetId"], []).append(pg["lastEditedDaysAgo"])
            if pg.get("authorId"):
                touch.setdefault(m["assetId"], []).append((pg["authorId"], pg["lastEditedDaysAgo"]))
    for it in issues:
        for m in it["mentions"]:
            hist.setdefault(m["assetId"], []).append(it["createdDaysAgo"])
            for pid in {it["reporterId"], it.get("assigneeId")} - {None}:
                touch.setdefault(m["assetId"], []).append((pid, it["createdDaysAgo"]))
    rows = {}
    for a in assets:
        if not a["ot"]:
            continue
        aid = a["id"]
        recent = {pid for pid, d in touch.get(aid, []) if d <= OWNER_DAYS and pid in active}
        rows[aid] = {
            "name": bool(a["hostname"] or a["nickname"]),
            "doc": aid in docs,
            "fresh": bool(docs.get(aid)) and min(docs[aid]) <= FRESH_DOC_DAYS,
            "history": bool(hist.get(aid)) and min(hist[aid]) <= HISTORY_DAYS,
            "anyIssue": aid in hist,
            "owner": bool(recent & stays),
            "anyTouch": aid in touch,
            "recent": recent,
            "critical": a["criticality"] == "Critical",
            "nickname": bool(a["nickname"]),
        }
    return rows


def narrative_report(assets, people, pages, issues, findings):
    rows = coverage(assets, people, pages, issues)
    n = len(rows)
    well = sum(1 for r in rows.values() if r["name"] and r["owner"] and r["fresh"] and r["history"])
    stale = sum(1 for r in rows.values() if r["doc"] and not r["fresh"])
    nodoc = sum(1 for r in rows.values() if not r["doc"])
    danger = sum(1 for r in rows.values() if r["critical"] and not r["doc"] and not r["anyIssue"] and not r["anyTouch"] and not r["nickname"])
    pentti = sum(1 for r in rows.values() if r["recent"] == {"p_pentti"})
    all_m = [m for x in pages + issues for m in x["mentions"]]
    kinds = Counter(m["kind"] for m in all_m)
    report = {
        "otAssets": n,
        "wellDocumented": [well, round(well / n, 3)],
        "staleDocOnly": [stale, round(stale / n, 3)],
        "noDoc": [nodoc, round(nodoc / n, 3)],
        "criticalNothingKnown": danger,
        "penttiOnlyRecent": pentti,
        "pages": dict(Counter(p["class"] for p in pages)),
        "issues": dict(Counter(next((lb[5:] for lb in i["labels"] if lb.startswith("kind:")), "?") for i in issues)),
        "mentionKinds": dict(kinds),
        "oldShare": round(kinds["old"] / max(1, len(all_m)), 3),
    }
    targets = [
        ("well documented about 10 percent", 0.08 <= well / n <= 0.14),
        ("stale doc about 25 percent", 0.21 <= stale / n <= 0.30),
        ("no doc about 40 percent", 0.36 <= nodoc / n <= 0.46),
        ("at least 20 Critical with nothing known", danger >= 20),
        ("Pentti only recent toucher of 35 to 45", 35 <= pentti <= 45),
        ("about a fifth of mentions old", 0.15 <= report["oldShare"] <= 0.28),
        ("page classes", report["pages"] == PAGE_TARGETS),
        ("issue kinds", report["issues"] == ISSUE_KINDS),
        ("about 12 people", 10 <= len(people) <= 14),
    ]
    targets += hero_checks(assets, pages, issues, findings)
    return report, targets


def hero_checks(assets, pages, issues, findings):
    by_id = {a["id"]: a for a in assets}
    fc = Counter(f["assetId"] for f in findings if f["status"] in ("open", "reopen"))
    top = {}
    for f in findings:
        top[f["assetId"]] = max(top.get(f["assetId"], 0), f["score"] or 0)
    out = []
    of = next((a for a in assets if a["nickname"] == "Old Faithful"), None)
    ok = bool(of) and of["model"] == "CP 343-1" and fc[of["id"]] >= 33 and top.get(of["id"], 0) >= 9.3
    if ok:
        pg = [p for p in pages if any(m["assetId"] == of["id"] for m in p["mentions"])]
        it = [i for i in issues if any(m["assetId"] == of["id"] for m in i["mentions"])]
        touchers = {p.get("authorId") for p in pg} | {x for i in it for x in (i["reporterId"], i.get("assigneeId"))}
        touchers -= {None}
        ok = (len(pg) >= 1 and all(p["lastEditedDaysAgo"] > FRESH_DOC_DAYS for p in pg) and len(it) == 1
              and it[0]["createdDaysAgo"] >= 2400 and touchers <= {"p_pentti", "p_kontro", "p_tiina", "p_esa"}
              and "p_pentti" in touchers)
    out.append(("hero 1 Old Faithful: CP 343-1, 33 open, 9.3, one stale page, one 2019 issue, Pentti only", ok))
    mentioned = {m["assetId"] for x in pages + issues for m in x["mentions"]}
    big = [a for a in assets if a["deviceType"] == "PLC" and fc[a["id"]] >= 90]
    out.append(("hero 2 PLC with 90+ findings and no documentation", any(a["id"] not in mentioned for a in big)))
    ips = Counter(a["ip"] for a in assets if a["ot"])
    out.append(("hero 3 two machines with one IP", any(c == 2 for c in ips.values())))
    ip_holder = {a["ip"]: a for a in assets}
    wrong = False
    for p in pages:
        for m in p["mentions"]:
            a = by_id[m["assetId"]]
            if m["kind"] == "old" and a["role"] == "plc" and any(ip in ip_holder and ip_holder[ip]["id"] != a["id"] for ip in a["ipHistory"]):
                wrong = True
    out.append(("hero 4 page names a PLC by an address another machine now has", wrong))
    return out


def check(d: Path, root: Path, progress=False):
    cfg = yaml.safe_load((root / "config" / "names.yml").read_text(encoding="utf-8"))
    errors = []

    def fail(msg):
        errors.append(msg)

    try:
        assets = json.loads((d / "assets.json").read_text(encoding="utf-8"))
        findings = json.loads((d / "findings.json").read_text(encoding="utf-8"))
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return [f"cannot read dataset: {e}"]

    plants = list(cfg["plants"].values()) + [cfg["annex_name"]]
    roles = set(cfg["roles"].values())
    host_re = re.compile(
        "^" + cfg["hostname_pattern"].format(
            plant="(" + "|".join(p.lower() for p in plants) + ")", line=r"l\d+", role="(" + "|".join(roles) + ")", nn=r"\d{2}"
        ) + "$"
    )

    # scope
    if not 450 <= len(assets) <= 550:
        fail(f"scope: {len(assets)} assets, expected 450 to 550")
    if meta.get("PENTTI_SEED") != cfg["seed"]:
        fail("meta: PENTTI_SEED does not match config seed")

    ids = Counter(a.get("id") for a in assets)
    for k, c in ids.items():
        if c > 1:
            fail(f"asset id {k} used {c} times")
    hostnames = Counter(a["hostname"] for a in assets if a.get("hostname"))
    for k, c in hostnames.items():
        if c > 1:
            fail(f"hostname {k} used {c} times")

    ip_count = Counter(a.get("ip") for a in assets)
    nick_by_plant = Counter((a["plant"], a["nickname"]) for a in assets if a.get("nickname"))
    for k, c in nick_by_plant.items():
        if c > 1:
            fail(f"nickname {k[1]} used {c} times in {k[0]}")

    for a in assets:
        aid = a.get("id")
        if list(a.keys()) != ASSET_KEYS:
            fail(f"{aid}: keys {list(a.keys())}")
            continue
        if not ID.match(aid) or not aid.startswith("a_"):
            fail(f"{aid}: bad id")
        if a["plant"] not in plants:
            fail(f"{aid}: plant {a['plant']}")
        if not re.match(r"^L\d+$", a["line"]):
            fail(f"{aid}: line {a['line']}")
        if a["role"] not in roles:
            fail(f"{aid}: role {a['role']}")
        if a["hostname"] is not None and not host_re.match(a["hostname"]):
            fail(f"{aid}: hostname {a['hostname']} does not follow the pattern")
        if a["hostname"] is not None and not a["hostname"].startswith(a["plant"].lower() + "-" + a["line"].lower() + "-"):
            fail(f"{aid}: hostname does not match plant and line")
        if (a["hostname"] is None) != ("NO_NAME" in a["flags"]):
            fail(f"{aid}: NO_NAME flag and hostname disagree")
        if a["nickname"] is not None and (a["nickname"] not in cfg["nicknames"] or not a["ot"]):
            fail(f"{aid}: nickname {a['nickname']}")
        m = IP.match(a["ip"] or "")
        if not m:
            fail(f"{aid}: ip {a['ip']}")
        else:
            pidx = plants.index(a["plant"]) + 1 if a["plant"] != cfg["annex_name"] else 9
            # a duplicate IP keeps the line octet of its first holder
            line_ok = ip_count[a["ip"]] > 1 or int(m.group(2)) == int(a["line"][1:])
            if int(m.group(1)) != pidx or not line_ok or not 11 <= int(m.group(3)) <= 254:
                fail(f"{aid}: ip {a['ip']} does not match plant and line")
        if (ip_count[a["ip"]] > 1) != ("DUP_IP" in a["flags"]):
            fail(f"{aid}: DUP_IP flag wrong")
        if ("UNSUPPORTED" in a["flags"]) != (a["entityType"] == "unsupported"):
            fail(f"{aid}: UNSUPPORTED flag wrong")
        if (not a["firmware"]) != ("NO_FIRMWARE" in a["flags"]):
            fail(f"{aid}: NO_FIRMWARE flag wrong")
        if set(a["flags"]) - FLAGS or a["flags"] != sorted(a["flags"]):
            fail(f"{aid}: flags {a['flags']}")
        if a["entityType"] not in ENTITY:
            fail(f"{aid}: entityType {a['entityType']}")
        for mac in a["macs"]:
            if not MAC.match(mac):
                fail(f"{aid}: mac {mac}")
        for k in ("firstSeenDaysAgo", "lastSeenDaysAgo"):
            if not isinstance(a[k], int) or a[k] < 0:
                fail(f"{aid}: {k} {a[k]}")
        if isinstance(a["firstSeenDaysAgo"], int) and isinstance(a["lastSeenDaysAgo"], int) and a["firstSeenDaysAgo"] < a["lastSeenDaysAgo"]:
            fail(f"{aid}: first seen after last seen")

    if not any(c > 1 for c in ip_count.values()):
        fail("no duplicate IP pair, the export has them on purpose")

    ot = [a for a in assets if a.get("ot")]
    share = sum(1 for a in ot if a.get("nickname")) / max(1, len(ot))
    if not 0.18 <= share <= 0.32:
        fail(f"nickname share {share:.2f} of OT assets, expected about {cfg['nickname_share']}")

    fids = Counter(f.get("id") for f in findings)
    for k, c in fids.items():
        if c > 1:
            fail(f"finding id {k} used {c} times")
    for f in findings:
        fid = f.get("id")
        if list(f.keys()) != FINDING_KEYS:
            fail(f"{fid}: keys {list(f.keys())}")
            continue
        if not ID.match(fid) or not fid.startswith("f_"):
            fail(f"{fid}: bad id")
        if f["assetId"] not in ids:
            fail(f"{fid}: asset {f['assetId']} not in assets")
        if not CVE.match(f["cve"]):
            fail(f"{fid}: cve {f['cve']}")
        if f["severity"] not in SEVERITY:
            fail(f"{fid}: severity {f['severity']}")
        if len(f["summary"]) > 240 or f["cve"] not in f["summary"]:
            fail(f"{fid}: summary too long or missing the CVE id")
        if f["advisoryUrl"] is not None and not f["advisoryUrl"].startswith(("http://", "https://")):
            fail(f"{fid}: advisoryUrl {f['advisoryUrl']}")
        for k in ("publishedDaysAgo", "openedDaysAgo"):
            if not isinstance(f[k], int) or f[k] < 0:
                fail(f"{fid}: {k} {f[k]}")

    if meta.get("counts", {}).get("rawFindingRows") and len(findings) != meta["counts"]["rawFindingRows"]:
        fail(f"{meta['counts']['rawFindingRows'] - len(findings)} findings did not join to an asset")

    try:
        people = json.loads((d / "people.json").read_text(encoding="utf-8"))
        pages = json.loads((d / "pages.json").read_text(encoding="utf-8"))
        issues = json.loads((d / "issues.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return errors + [f"cannot read narrative: {e}"]
    banned = [b.encode().decode("unicode_escape") for b in BANNED]
    for x in pages + issues:
        for m in x["mentions"]:
            if m["assetId"] not in ids:
                fail(f"{x['id']}: mention of unknown asset {m['assetId']}")
        text = x.get("bodyMarkdown", "") + x.get("description", "") + x.get("title", "") + x.get("summary", "")
        for b in banned:
            if b in text:
                fail(f"{x['id']}: copy voice, contains {b!r}")
    report, targets = narrative_report(assets, people, pages, issues, findings)
    if progress:
        print(json.dumps(report, indent=1))
        for name, ok in targets:
            print(("  ok   " if ok else "  MISS ") + name)
    else:
        for name, ok in targets:
            if not ok:
                fail("target: " + name)
    return errors


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", default=str(ROOT / "data" / "generated"))
    ap.add_argument("--progress", action="store_true")
    args = ap.parse_args()
    errors = check(Path(args.dir), ROOT, args.progress)
    if errors:
        print(f"FAIL: {len(errors)} problem(s)")
        for e in errors[:50]:
            print("  " + e)
        return 1
    print("dataset ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
