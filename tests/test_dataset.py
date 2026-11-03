"""Generator tests. Synthetic tests run everywhere, raw tests only where data/raw exists."""
import hashlib
import json
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build_dataset as bd  # noqa: E402
import check_dataset as cd  # noqa: E402
import narrative as nar  # noqa: E402

RAW = ROOT / "data" / "raw"
GEN = ROOT / "data" / "generated"
needs_raw = pytest.mark.skipif(not (RAW / "ot_inventory_anonymized.json").exists(), reason="data/raw not present")


def digest(d: Path):
    h = hashlib.sha256()
    for name in sorted(p.name for p in d.glob("*.json")):
        h.update(name.encode())
        h.update((d / name).read_bytes())
    return h.hexdigest()


# --- pure helpers

def test_summary_keeps_cve_and_fits():
    long = "First sentence about a buffer overflow. " + "More words " * 80
    s = bd.summary_of(long, "CVE-2020-0001")
    assert s.startswith("CVE-2020-0001: First sentence")
    assert len(s) <= 240


def test_summary_cuts_on_a_word_with_ellipsis():
    s = bd.summary_of("word " * 70, "CVE-2021-1234")
    assert s.endswith("...") and len(s) <= 240 and "CVE-2021-1234" in s
    assert not s[:-3].endswith(" ")


def test_first_url_skips_empty_and_non_urls():
    assert bd.first_url("", "see https://example.org/a, https://example.org/b") == "https://example.org/a"
    assert bd.first_url("none here", None) is None


def test_is_ot_rules():
    assert bd.is_ot({"device_type": "PLC", "purdue_level": "1"})
    assert not bd.is_ot({"device_type": "PLC", "purdue_level": "4"})
    assert bd.is_ot({"device_type": "Endpoint", "purdue_level": "2"})
    assert not bd.is_ot({"device_type": "Endpoint", "purdue_level": "4"})


def test_purdue_and_days():
    assert bd.purdue_num("1.5") == 1.5 and bd.purdue_num("2") == 2 and bd.purdue_num(None) is None
    ref = bd.parse_ts("2026-12-02T10:00:00Z")
    assert bd.days_before(ref, "2026-11-30T09:00:00Z") == 2
    assert bd.days_before(ref, None) is None


# --- synthetic end to end, no raw data needed

def synthetic_cfg():
    cfg = yaml.safe_load((ROOT / "config" / "names.yml").read_text(encoding="utf-8"))
    cfg["plants"] = {"AAAAA1": "Birch", "BBBBB1": "Spruce"}
    cfg["pins"] = []
    return cfg


def inv_row(ip, subnet, host, dtype="PLC", purdue="1", disc=None, mac="00:1b:1b:01:02:03"):
    return {
        "entity_type": "managed", "first_seen_timestamp": "2026-01-01T00:00:00Z",
        "last_seen_timestamp": "2026-12-01T00:00:00Z", "system_manufacturer": "Siemens",
        "hostname": host, "current_local_ip": ip, "criticality": "Critical", "device_type": dtype,
        "purdue_level": purdue, "subnet": subnet, "device_mac_addresses": [mac],
        "xiot_last_discoverer_hostname": disc, "triage_status": "Not reviewed",
    }


def vul_row(ip, host_id, site, cve="CVE-2020-0001"):
    return {
        "host_id": host_id, "hostname": "x", "device_model": "CP 343-1", "device_firmware": "V3.0",
        "device_type": "Communication Device", "local_ip": ip, "site_name": site,
        "system_manufacturer": "Siemens", "cve_id": cve, "cve_description": "A flaw. Details.",
        "status": "open", "severity": "CRITICAL", "create_date": "2026-11-01T00:00:00Z",
        "base_score": "9.8", "vendor_advisory": "https://example.org/adv", "references": "",
        "exploit_status": {"label": "Unproven", "value": 0}, "cve_published_date": "2020-01-01T00:00:00Z",
    }


@pytest.fixture
def synthetic(tmp_path):
    inv = [
        inv_row("192.0.2.10", "192.0.2.0/24", "orig-one"),                      # site from finding
        inv_row("192.0.2.11", "192.0.2.0/24", None),                            # site from subnet vote, no name
        inv_row("198.51.100.5", "198.51.100.0/24", "orig-two", disc="BBBBB1-x"),  # site from discoverer
        inv_row("198.51.100.5", "198.51.100.0/24", "orig-three"),               # duplicate ip
        inv_row("203.0.113.9", "203.0.113.0/24", "orig-four"),                  # no site -> Annex
        inv_row("203.0.113.20", "203.0.113.0/24", "it-box", dtype="Endpoint", purdue="4"),
    ]
    vul = [vul_row("192.0.2.10", "h1", "AAAAA1"), vul_row("192.0.2.10", "h1", "AAAAA1", cve="CVE-2021-0002")]
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "ot_inventory_anonymized.json").write_text(json.dumps(inv), encoding="utf-8")
    (raw / "ot_vulnerabilities_anonymized.json").write_text(json.dumps(vul), encoding="utf-8")
    return bd.build(raw, ROOT, synthetic_cfg(), narrative_root=tmp_path)


def test_site_resolution_order(synthetic):
    a = synthetic["assets.json"]
    assert [x["plant"] for x in a[:5]] == ["Birch", "Birch", "Spruce", "Spruce", "Annex"]


def test_remap_hides_originals(synthetic):
    text = json.dumps(synthetic)
    for orig in ("192.0.2", "198.51.100", "203.0.113", "orig-", "AAAAA1", "BBBBB1", "h1"):
        assert orig not in text


def test_names_ips_macs_flags(synthetic):
    a = synthetic["assets.json"]
    assert a[0]["hostname"] == "birch-l1-plc-01" and a[0]["ip"] == "10.1.1.11"
    assert a[1]["hostname"] is None and "NO_NAME" in a[1]["flags"]
    assert a[2]["ip"] == a[3]["ip"] and "DUP_IP" in a[2]["flags"] and "DUP_IP" in a[3]["flags"]
    assert a[4]["ip"].startswith("10.9.")
    assert all(m.startswith("00:1b:1b:") for x in a for m in x["macs"])
    assert a[0]["model"] == "CP 343-1" and a[0]["firmware"] == "V3.0"


def test_findings_join_and_offsets(synthetic):
    f = synthetic["findings.json"]
    a = synthetic["assets.json"]
    assert len(f) == 2 and {x["assetId"] for x in f} == {a[0]["id"]}
    assert f[0]["openedDaysAgo"] == 0 and f[0]["severity"] == "Critical" and f[0]["score"] == 9.8


def test_synthetic_is_deterministic(tmp_path, synthetic):
    again = bd.build(tmp_path / "raw", ROOT, synthetic_cfg(), narrative_root=tmp_path)
    assert json.dumps(again) == json.dumps(synthetic)


# --- narrative renderer and pins

def tiny_assets():
    base = {"nickname": None, "model": "CPU 315-2 DP", "plant": "Birch", "line": "L2", "role": "plc",
            "ipHistory": [], "formerNames": []}
    return [
        dict(base, id="a_aaaaa", hostname="birch-l2-plc-07", ip="10.1.2.27", nickname="Old Faithful"),
        dict(base, id="a_bbbbb", hostname=None, ip="10.1.2.13"),
    ]


def test_render_forms_and_mentions():
    r = nar.Renderer(tiny_assets())
    text, m = r.render("[[birch-l2-plc-07]] aka [[birch-l2-plc-07|nick]] at [[a_bbbbb|ip]], [[a_bbbbb|modelline]]", "t")
    assert text == "birch-l2-plc-07 aka Old Faithful at 10.1.2.13, the CPU 315-2 DP on line 2"
    assert [x["kind"] for x in m] == ["exact", "nick", "exact", "model_line"]
    assert [x["assetId"] for x in m] == ["a_aaaaa", "a_aaaaa", "a_bbbbb", "a_bbbbb"]


def test_old_ip_and_name_are_stable_and_recorded():
    assets = tiny_assets()
    r = nar.Renderer(assets)
    one, m = r.render("[[birch-l2-plc-07|oldip]] [[birch-l2-plc-07|oldname]]", "t")
    two, _ = r.render("[[birch-l2-plc-07|oldip]] [[birch-l2-plc-07|oldname]]", "t")
    assert one == two == "10.1.2.200 bir2plc7"
    assert assets[0]["ipHistory"] == ["10.1.2.200"] and assets[0]["formerNames"] == ["bir2plc7"]
    assert {x["kind"] for x in m} == {"old"}


def test_render_rejects_bad_refs():
    r = nar.Renderer(tiny_assets())
    for bad in ("[[nope]]", "[[a_bbbbb]]", "[[a_bbbbb|nick]]", "[[a_aaaaa|weird]]"):
        with pytest.raises(nar.NarrativeError):
            r.render(bad, "t")


def test_pins_set_fields_and_borrow_an_address():
    assets = tiny_assets()
    assets[1]["hostname"] = "birch-l2-plc-03"
    nar.apply_pins(assets, [
        {"id": "a_aaaaa", "set": {"hostname": "birch-l2-cp-04", "role": "cp"}, "ipHistory": ["@birch-l2-plc-03"]},
    ])
    assert assets[0]["hostname"] == "birch-l2-cp-04" and assets[0]["role"] == "cp"
    assert assets[0]["ipHistory"] == ["10.1.2.13"]
    with pytest.raises(nar.NarrativeError):
        nar.apply_pins(assets, [{"id": "a_zzzzz", "set": {}}])


# --- committed dataset (runs in CI)

def test_committed_dataset_passes_checks():
    assert cd.check(GEN, ROOT) == []


# --- real raw data (local only)

@needs_raw
def test_build_is_byte_for_byte_deterministic(tmp_path):
    one, two = tmp_path / "one", tmp_path / "two"
    bd.write(one, bd.build(RAW, ROOT))
    bd.write(two, bd.build(RAW, ROOT))
    assert digest(one) == digest(two)


@needs_raw
def test_committed_dataset_is_current(tmp_path):
    out = tmp_path / "gen"
    bd.write(out, bd.build(RAW, ROOT))
    assert digest(out) == digest(GEN), "run npm run dataset and commit data/generated"
