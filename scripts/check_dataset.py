#!/usr/bin/env python3
"""Checks data/generated against FACTORY_BUILD.md section 4 and 5.

  python scripts/check_dataset.py [--dir DIR]

S1 checks the mechanical parts: shapes, ids, joins, remaps, offsets, scope.
The narrative distribution targets in 5.5 join in S2.
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
    "firstSeenDaysAgo", "lastSeenDaysAgo",
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


def check(d: Path, root: Path):
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
    return errors


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", default=str(ROOT / "data" / "generated"))
    args = ap.parse_args()
    errors = check(Path(args.dir), ROOT)
    if errors:
        print(f"FAIL: {len(errors)} problem(s)")
        for e in errors[:50]:
            print("  " + e)
        return 1
    print("dataset ok (S1 mechanical checks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
