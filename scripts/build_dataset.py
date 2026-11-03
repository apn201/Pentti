#!/usr/bin/env python3
"""raw -> data/generated. Deterministic: same input, same seed, same bytes.

  python scripts/build_dataset.py [--raw DIR] [--out DIR]

Reads data/raw/*.json (gitignored), writes assets.json, findings.json, meta.json.
Never writes an original hostname, IP, MAC, host id or site code. See FACTORY_BUILD.md section 4 and 5.
"""
import argparse
import hashlib
import json
import random
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import yaml

from narrative import apply_pins, build_narrative

ROOT = Path(__file__).resolve().parent.parent
GENERATOR_VERSION = 1

OT_TYPES = {
    "PLC", "Industrial Control Device", "HMI", "Remote IO", "Communication Device",
    "Industrial Computer", "Communications Adapter", "Switch", "Gateway",
    "Engineering Station", "Sensor", "Controller",
}
OT_PURDUE = {"0", "1", "1.5", "2", "2.5"}
IT_PURDUE = {"3", "3.5", "4", "5"}
IT_NEIGHBOURS = 100
SUMMARY_MAX = 240
DESC_TRIM_OVER = 400
ANNEX_INDEX = 9


def load_config(root):
    return yaml.safe_load((root / "config" / "names.yml").read_text(encoding="utf-8"))


def is_ot(r):
    t, p = r.get("device_type"), r.get("purdue_level")
    return (t in OT_TYPES and p not in IT_PURDUE) or p in OT_PURDUE


def parse_ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def days_before(ref, s):
    if not s:
        return None
    return max(0, (ref - parse_ts(s)).days)


def first_subnet(s):
    return (s or "").split(",")[0].strip()


def purdue_num(p):
    if p is None:
        return None
    f = float(p)
    return int(f) if f.is_integer() else f


def stable_hash(*parts):
    return int(hashlib.sha256("|".join(str(p) for p in parts).encode("utf-8")).hexdigest(), 16)


def short_id(prefix, seed, kind, index, taken):
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    salt = 0
    while True:
        n = stable_hash(seed, kind, index, salt)
        s = "".join(alphabet[(n >> (6 * i)) % 36] for i in range(5))
        if s not in taken:
            taken.add(s)
            return f"{prefix}_{s}"
        salt += 1


def summary_of(desc, cve):
    d = " ".join((desc or "").split())
    if len(d) > DESC_TRIM_OVER:
        m = re.match(r"(.+?[.!?])(\s|$)", d)
        d = m.group(1) if m else d
    if cve and cve not in d:
        d = cve + ": " + d
    if len(d) > SUMMARY_MAX:
        d = d[: SUMMARY_MAX - 3].rsplit(" ", 1)[0].rstrip(" ,;:") + "..."
    return d


def first_url(*fields):
    for f in fields:
        for u in re.split(r"[\s,;|]+", f or ""):
            if u.startswith("http://") or u.startswith("https://"):
                return u
    return None


def build(raw: Path, root: Path, cfg=None, narrative_root=None):
    cfg = cfg or load_config(root)
    seed = cfg["seed"]
    rng = random.Random(seed)

    inv = json.loads((raw / "ot_inventory_anonymized.json").read_text(encoding="utf-8"))
    vul = json.loads((raw / "ot_vulnerabilities_anonymized.json").read_text(encoding="utf-8"))

    code_to_plant = cfg["plants"]
    plant_order = list(code_to_plant.values())
    annex = cfg["annex_name"]

    # --- 5.1 join and site resolution
    vul_by_ip = defaultdict(list)
    for v in vul:
        vul_by_ip[v["local_ip"]].append(v)
    inv_rows_by_ip = defaultdict(list)
    for i, r in enumerate(inv):
        inv_rows_by_ip[r["current_local_ip"]].append(i)

    # findings -> inventory row. Several host ids on one IP go to several rows on that IP, in order.
    finding_row = {}
    for ip, vs in vul_by_ip.items():
        rows = inv_rows_by_ip.get(ip, [])
        if not rows:
            continue
        hosts = list(dict.fromkeys(v["host_id"] for v in vs))
        for v in vs:
            k = hosts.index(v["host_id"])
            finding_row[id(v)] = rows[min(k, len(rows) - 1)]

    site_of = {}
    for v in vul:
        if id(v) in finding_row:
            site_of.setdefault(finding_row[id(v)], v["site_name"])
    for i, r in enumerate(inv):
        if i in site_of:
            continue
        disc = r.get("xiot_last_discoverer_hostname") or ""
        prefix = disc.split("-")[0] if "-" in disc else ""
        if prefix.upper() in code_to_plant:
            site_of[i] = prefix.upper()
    subnet_votes = defaultdict(Counter)
    for i, s in site_of.items():
        subnet_votes[first_subnet(inv[i].get("subnet"))][s] += 1
    for i, r in enumerate(inv):
        if i not in site_of:
            votes = subnet_votes.get(first_subnet(r.get("subnet")))
            if votes:
                site_of[i] = sorted(votes.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]

    def plant_of(i):
        return code_to_plant.get((site_of.get(i) or "").upper(), annex)

    # --- 5.2 demo scope
    with_findings = set(finding_row.values())
    ot_rows = {i for i, r in enumerate(inv) if is_ot(r)}
    core = ot_rows | with_findings
    pool = [i for i in range(len(inv)) if i not in core]
    neighbours = set(rng.sample(pool, min(IT_NEIGHBOURS, len(pool))))
    scope = sorted(core | neighbours)

    # --- per-host device facts from findings (inventory has no model or firmware)
    facts = {}
    by_row = defaultdict(list)
    for v in vul:
        if id(v) in finding_row:
            by_row[finding_row[id(v)]].append(v)
    for i, vs in by_row.items():
        tuples = Counter((v["device_model"], v["device_firmware"], v["system_manufacturer"], v["device_type"]) for v in vs)
        best = sorted(tuples.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        models = Counter(v["device_model"] for v in vs)
        facts[i] = {
            "model": best[0], "firmware": best[1] or None, "manufacturer": best[2], "deviceType": best[3],
            "modules": [m for m, _ in sorted(models.items(), key=lambda kv: (-kv[1], kv[0]))],
        }

    # --- names, lines, ips, macs
    roles = cfg["roles"]
    line_of_subnet = defaultdict(dict)
    host_octet = defaultdict(dict)
    new_ip_of = {}
    name_counter = Counter()
    mac_map = {}
    taken_ids = set()
    nick_used = defaultdict(set)
    nick_pool = cfg["nicknames"]
    nick_share = cfg["nickname_share"]
    reserved = {p["set"]["nickname"] for p in cfg.get("pins", []) if p.get("set", {}).get("nickname")}

    assets = []
    asset_id_of_row = {}
    for n, i in enumerate(scope):
        r = inv[i]
        plant = plant_of(i)
        pidx = plant_order.index(plant) + 1 if plant in plant_order else ANNEX_INDEX
        subnet = first_subnet(r.get("subnet"))
        lines = line_of_subnet[plant]
        if subnet not in lines:
            lines[subnet] = len(lines) + 1
        lidx = lines[subnet]
        line = f"L{lidx}"

        orig_ip = r["current_local_ip"]
        key = (plant, orig_ip)
        if key not in new_ip_of:
            octets = host_octet[(plant, lidx)]
            octets[orig_ip] = len(octets) + 11
            if octets[orig_ip] > 254:
                raise SystemExit(f"line {plant}/{line} has more than 244 hosts, widen the remap")
            new_ip_of[key] = f"10.{pidx}.{lidx}.{octets[orig_ip]}"
        ip = new_ip_of[key]

        f = facts.get(i, {})
        device_type = r.get("device_type") or f.get("deviceType")
        role = roles.get(device_type, roles["default"])
        aid = short_id("a", seed, "asset", n, taken_ids)

        hostname = None
        if r.get("hostname"):
            name_counter[(plant, line, role)] += 1
            hostname = cfg["hostname_pattern"].format(
                plant=plant.lower(), line=line.lower(), role=role, nn=f"{name_counter[(plant, line, role)]:02d}"
            )

        macs = []
        for m in r.get("device_mac_addresses") or []:
            m = m.lower().replace("-", ":")
            if m not in mac_map:
                tail = ":".join(f"{rng.randrange(256):02x}" for _ in range(3))
                mac_map[m] = m[:8] + ":" + tail
            macs.append(mac_map[m])

        nickname = None
        if is_ot(r) and (stable_hash(seed, "nick", aid) % 10000) < nick_share * 10000:
            start = stable_hash(seed, "nickpick", aid) % len(nick_pool)
            for k in range(len(nick_pool)):
                cand = nick_pool[(start + k) % len(nick_pool)]
                if cand not in nick_used[plant] and cand not in reserved:
                    nick_used[plant].add(cand)
                    nickname = cand
                    break

        firmware = f.get("firmware")
        flags = []
        if not r.get("hostname"):
            flags.append("NO_NAME")
        if r.get("entity_type") == "unsupported":
            flags.append("UNSUPPORTED")
        if not firmware:
            flags.append("NO_FIRMWARE")

        asset_id_of_row[i] = aid
        assets.append({
            "id": aid,
            "hostname": hostname,
            "nickname": nickname,
            "plant": plant,
            "line": line,
            "role": role,
            "deviceType": device_type,
            "model": f.get("model"),
            "firmware": firmware,
            "manufacturer": f.get("manufacturer") or r.get("system_manufacturer"),
            "purdue": purdue_num(r.get("purdue_level")),
            "criticality": r.get("criticality"),
            "entityType": r.get("entity_type"),
            "ot": is_ot(r),
            "ip": ip,
            "macs": macs,
            "_first": r.get("first_seen_timestamp"),
            "_last": r.get("last_seen_timestamp"),
            "flags": flags,
            "modules": f.get("modules", []),
            "ipHistory": [],
            "formerNames": [],
        })

    apply_pins(assets, cfg.get("pins"))
    people, pages, issues = build_narrative(narrative_root or root, cfg, assets)

    ip_count = Counter(a["ip"] for a in assets)
    inv_ref = max(parse_ts(x) for r in inv for x in (r.get("first_seen_timestamp"), r.get("last_seen_timestamp")) if x)
    for a in assets:
        if ip_count[a["ip"]] > 1:
            a["flags"].append("DUP_IP")
        a["firstSeenDaysAgo"] = days_before(inv_ref, a.pop("_first"))
        a["lastSeenDaysAgo"] = days_before(inv_ref, a.pop("_last"))
        a["flags"] = sorted(a["flags"])

    # --- findings
    vul_ref = max(parse_ts(v["create_date"]) for v in vul)
    findings = []
    taken_f = set()
    for n, v in enumerate(vul):
        row = finding_row.get(id(v))
        if row is None or row not in asset_id_of_row:
            continue
        ex = v.get("exploit_status") or {}
        findings.append({
            "id": short_id("f", seed, "finding", n, taken_f),
            "assetId": asset_id_of_row[row],
            "cve": v["cve_id"],
            "severity": v["severity"].capitalize(),
            "score": float(v["base_score"]) if v.get("base_score") else None,
            "exploitLabel": ex.get("label"),
            "exploitValue": ex.get("value"),
            "status": v["status"],
            "publishedDaysAgo": days_before(vul_ref, v.get("cve_published_date")),
            "openedDaysAgo": days_before(vul_ref, v.get("create_date")),
            "summary": summary_of(v.get("cve_description"), v["cve_id"]),
            "advisoryUrl": first_url(v.get("vendor_advisory"), v.get("references")),
        })

    meta = {
        "PENTTI_SEED": seed,
        "generatorVersion": GENERATOR_VERSION,
        "company": cfg["company"],
        "plants": plant_order + [annex],
        "counts": {
            "assets": len(assets),
            "otAssets": sum(1 for a in assets if a["ot"]),
            "findings": len(findings),
            "rawInventoryRows": len(inv),
            "rawFindingRows": len(vul),
            "inventoryWithoutHostname": sum(1 for r in inv if not r.get("hostname")),
            "people": len(people),
            "pages": len(pages),
            "issues": len(issues),
        },
        "dates": "All dates are days before the newest timestamp in the source file. Resolve against the install date.",
    }
    scoring = yaml.safe_load((root / "config" / "scoring.yml").read_text(encoding="utf-8"))
    return {
        "scoring.json": scoring,
        "assets.json": assets, "findings.json": findings, "people.json": people,
        "pages.json": pages, "issues.json": issues, "meta.json": meta,
    }


def write(out: Path, data):
    out.mkdir(parents=True, exist_ok=True)
    for name, obj in data.items():
        text = json.dumps(obj, indent=1, ensure_ascii=False) + "\n"
        (out / name).write_text(text, encoding="utf-8", newline="\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", default=str(ROOT / "data" / "raw"))
    ap.add_argument("--out", default=str(ROOT / "data" / "generated"))
    args = ap.parse_args()
    data = build(Path(args.raw), ROOT)
    write(Path(args.out), data)
    c = data["meta.json"]["counts"]
    print(f"wrote {args.out}: {c['assets']} assets ({c['otAssets']} OT), {c['findings']} findings")


if __name__ == "__main__":
    main()
