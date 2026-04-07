#!/usr/bin/env python3
"""
Roblox Update Monitor - Detects client updates and PS99 game updates
Uses endpoints discovered from MaximumADHD and RiisDev repos
"""
import requests
import json
import os
import time
from datetime import datetime

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "../output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

SNAPSHOT_FILE = os.path.join(OUTPUT_DIR, "update_snapshot.json")
REPORT_FILE = os.path.join(OUTPUT_DIR, "update_report.json")

PS99_UNIVERSE = 3317771874
PETSGO_UNIVERSE = 6401952734
BIG_GAMES_GROUP = 3959677

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json"
}

def safe_get(url, timeout=10):
    try:
        time.sleep(0.5)
        r = requests.get(url, headers=headers, timeout=timeout)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"  [WARN] {url}: {e}")
    return None

def get_roblox_client_version():
    """Get current Roblox client version - key signal for PS99 updates"""
    result = {}
    for platform, url in [
        ("Windows", "https://clientsettings.roblox.com/v2/client-version/WindowsPlayer/channel/LIVE"),
        ("Mac", "https://clientsettings.roblox.com/v2/client-version/MacPlayer/channel/LIVE"),
    ]:
        data = safe_get(url)
        if data:
            result[platform] = {
                "version": data.get("clientVersionUpload", ""),
                "next_version": data.get("nextClientVersionUpload", ""),
                "bootstrapper": data.get("bootstrapperVersion", "")
            }
    return result

def get_ps99_game_info():
    """Get current PS99 and PETS GO game state"""
    url = f"https://games.roblox.com/v1/games?universeIds={PS99_UNIVERSE},{PETSGO_UNIVERSE}"
    data = safe_get(url)
    result = {}
    if data and "data" in data:
        for g in data["data"]:
            result[str(g["id"])] = {
                "name": g.get("name", ""),
                "updated": g.get("updated", ""),
                "playing": g.get("playing", 0),
                "visits": g.get("visits", 0)
            }
    return result

def get_big_games_catalog_count():
    """Count BIG Games catalog items to detect new additions"""
    url = f"https://catalog.roblox.com/v1/search/items?category=GamePass&creatorTargetId={BIG_GAMES_GROUP}&creatorType=Group&limit=30"
    data = safe_get(url)
    if data:
        items = data.get("data", [])
        cursor = data.get("nextPageCursor", "")
        return {
            "count": len(items),
            "has_more": bool(cursor),
            "item_ids": [i.get("id") for i in items]
        }
    return {"count": 0, "has_more": False, "item_ids": []}

def get_fflag_snapshot():
    """Get current FFlag snapshot to detect feature changes"""
    url = "https://raw.githubusercontent.com/MaximumADHD/Roblox-FFlag-Tracker/main/PCDesktopClient.json"
    try:
        time.sleep(0.5)
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            flags = r.json()
            # Focus on game/economy/asset flags
            relevant = {k: v for k, v in flags.items() 
                       if any(x in k.lower() for x in ['pet', 'egg', 'hatch', 'catalog', 'asset', 'economy', 'trade', 'collectible', 'price', 'gamepass'])}
            return {
                "total_flags": len(flags),
                "relevant_count": len(relevant),
                "relevant_flags": relevant
            }
    except Exception as e:
        print(f"  [WARN] FFlag fetch failed: {e}")
    return {}

def get_client_tracker_version():
    """Get current version from MaximumADHD tracker"""
    try:
        r = requests.get(
            "https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox/version.txt",
            timeout=10
        )
        if r.status_code == 200:
            return r.text.strip()
    except:
        pass
    return ""

def load_snapshot():
    if os.path.exists(SNAPSHOT_FILE):
        with open(SNAPSHOT_FILE) as f:
            return json.load(f)
    return {}

def save_snapshot(data):
    with open(SNAPSHOT_FILE, "w") as f:
        json.dump(data, f, indent=2)

def run():
    print(f"[{datetime.utcnow().isoformat()}] Running Roblox Update Monitor...")
    
    old_snapshot = load_snapshot()
    findings = []
    
    # 1. Roblox Client Version
    print("  Checking Roblox client version...")
    client_versions = get_roblox_client_version()
    for platform, info in client_versions.items():
        old_ver = old_snapshot.get("client_versions", {}).get(platform, {}).get("version", "")
        new_ver = info.get("version", "")
        if old_ver and new_ver and old_ver != new_ver:
            findings.append({
                "type": "ROBLOX_CLIENT_UPDATE",
                "platform": platform,
                "old_version": old_ver,
                "new_version": new_ver,
                "severity": "HIGH",
                "note": "Roblox client updated — PS99 may update soon!"
            })
            print(f"  🚨 ROBLOX UPDATE: {platform} {old_ver} → {new_ver}")
    
    # 2. Client Tracker Version
    print("  Checking client tracker version...")
    tracker_version = get_client_tracker_version()
    old_tracker = old_snapshot.get("tracker_version", "")
    if old_tracker and tracker_version and old_tracker != tracker_version:
        findings.append({
            "type": "CLIENT_TRACKER_UPDATE",
            "old_version": old_tracker,
            "new_version": tracker_version,
            "severity": "MEDIUM",
            "note": "MaximumADHD tracker updated — new Roblox build extracted"
        })
    
    # 3. PS99 Game Update Detection
    print("  Checking PS99 game state...")
    game_info = get_ps99_game_info()
    for universe_id, info in game_info.items():
        old_updated = old_snapshot.get("game_info", {}).get(universe_id, {}).get("updated", "")
        new_updated = info.get("updated", "")
        if old_updated and new_updated and old_updated != new_updated:
            findings.append({
                "type": "GAME_UPDATE",
                "game": info.get("name", universe_id),
                "old_updated": old_updated,
                "new_updated": new_updated,
                "severity": "HIGH",
                "note": f"{info.get('name')} game was updated!"
            })
            print(f"  🚨 GAME UPDATE: {info.get('name')} → {new_updated}")
    
    # 4. Catalog count change (new items)
    print("  Checking BIG Games catalog...")
    catalog = get_big_games_catalog_count()
    old_catalog_ids = set(old_snapshot.get("catalog", {}).get("item_ids", []))
    new_catalog_ids = set(catalog.get("item_ids", []))
    new_items = new_catalog_ids - old_catalog_ids
    if new_items:
        findings.append({
            "type": "NEW_CATALOG_ITEMS",
            "new_ids": list(new_items),
            "count": len(new_items),
            "severity": "HIGH",
            "note": f"{len(new_items)} new catalog item(s) detected!"
        })
        print(f"  🚨 NEW CATALOG ITEMS: {new_items}")
    
    # 5. FFlag changes (check for newly enabled game flags)
    print("  Checking FFlags...")
    fflag_data = get_fflag_snapshot()
    old_flags = old_snapshot.get("fflag_relevant", {})
    new_flags = fflag_data.get("relevant_flags", {})
    
    changed_flags = []
    for k, v in new_flags.items():
        if k in old_flags and old_flags[k] != v:
            changed_flags.append({"flag": k, "old": old_flags[k], "new": v})
    new_flag_keys = set(new_flags.keys()) - set(old_flags.keys())
    if changed_flags or new_flag_keys:
        findings.append({
            "type": "FFLAG_CHANGES",
            "changed": changed_flags[:10],
            "new_flags": list(new_flag_keys)[:10],
            "severity": "MEDIUM",
            "note": f"{len(changed_flags)} flag changes, {len(new_flag_keys)} new flags detected"
        })
    
    # Save new snapshot
    new_snapshot = {
        "run_at": datetime.utcnow().isoformat(),
        "client_versions": client_versions,
        "tracker_version": tracker_version,
        "game_info": game_info,
        "catalog": catalog,
        "fflag_relevant": new_flags
    }
    save_snapshot(new_snapshot)
    
    # Save report
    report = {
        "run_at": datetime.utcnow().isoformat(),
        "findings_count": len(findings),
        "findings": findings,
        "summary": {
            "roblox_version": client_versions.get("Windows", {}).get("version", ""),
            "ps99_players": game_info.get(str(PS99_UNIVERSE), {}).get("playing", 0),
            "catalog_items": catalog.get("count", 0),
            "total_fflags": fflag_data.get("total_flags", 0),
            "relevant_fflags": fflag_data.get("relevant_count", 0)
        }
    }
    with open(REPORT_FILE, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"  Done — {len(findings)} findings, report saved.")
    # ── Discord notifications ─────────────────────────────────
    if findings:
        try:
            import sys, os
            sys.path.insert(0, os.path.dirname(__file__))
            from discord_notify import (
                notify_game_update, notify_roblox_client_update,
                notify_new_catalog_items, notify_fflag_changes
            )
            for f in findings:
                ftype = f.get("type", "")
                if ftype == "GAME_UPDATE":
                    notify_game_update(f["game"], f["old_updated"], f["new_updated"], 0)
                elif ftype == "ROBLOX_CLIENT_UPDATE":
                    notify_roblox_client_update(f["platform"], f["old_version"], f["new_version"])
                elif ftype == "NEW_CATALOG_ITEMS":
                    notify_new_catalog_items(f["new_ids"])
                elif ftype == "FFLAG_CHANGES":
                    notify_fflag_changes(f.get("changed", []), f.get("new_flags", []))
            print("  [Discord] Update monitor notifications sent.")
        except Exception as e:
            print(f"  [WARN] Discord notify error: {e}")

    return report


if __name__ == "__main__":
    result = run()
    print(json.dumps(result, indent=2))
