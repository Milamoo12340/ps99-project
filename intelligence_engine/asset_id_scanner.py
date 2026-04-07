#!/usr/bin/env python3
"""
Asset ID Range Scanner — Virelai Layer 6
Scans Roblox asset ID ranges around known PS99 assets to find:
- Unreleased assets (allocated IDs not in public API yet)
- Hidden developer assets
- Leaked/hidden items about to be released
"""

import json, time, random, requests
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

OUTPUT_DIR = Path(__file__).parent.parent / "output"
SCANNER_FILE = OUTPUT_DIR / "asset_scan.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

def sleep_jitter(base=0.1, jitter=0.1):
    time.sleep(base + random.random() * jitter)

def test_asset_exists(asset_id):
    """Check if an asset ID exists and what type it is"""
    try:
        sleep_jitter()
        r = requests.get(
            f"https://economy.roblox.com/v2/assets/{asset_id}/details",
            headers=HEADERS,
            timeout=8
        )
        if r.status_code == 200:
            data = r.json()
            return {
                "id": asset_id,
                "exists": True,
                "name": data.get("Name", ""),
                "type": data.get("AssetType", ""),
                "creator": data.get("Creator", {}),
            }
        elif r.status_code == 404:
            return {"id": asset_id, "exists": False}
        else:
            return None
    except:
        return None

def scan_range(start_id, end_id, name="Unknown"):
    """Scan a range of asset IDs for existence"""
    print(f"\n  🔎 Scanning {name}: {start_id:,} → {end_id:,}")
    
    found = []
    tested = 0
    
    # Exponential spacing — test more densely near recent IDs
    # Roblox allocates asset IDs sequentially-ish, so newer = higher
    for asset_id in range(start_id, end_id + 1, max(1, (end_id - start_id) // 100)):
        result = test_asset_exists(asset_id)
        tested += 1
        
        if result and result.get("exists"):
            print(f"    ✓ Found {asset_id}: {result.get('name', '?')}")
            found.append(result)
        
        if tested % 20 == 0:
            print(f"    ... tested {tested} IDs")
    
    return found

def run():
    print("="*60)
    print("  🔐 PS99 Asset ID Range Scanner — Virelai")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("="*60)
    
    # Load last snapshot to find highest known asset IDs
    snapshot_file = OUTPUT_DIR / "last_snapshot.json"
    snapshot = {}
    if snapshot_file.exists():
        with open(snapshot_file) as f:
            snapshot = json.load(f)
    
    # Extract highest asset IDs from collections
    highest_ids = {}
    for col_name, items in snapshot.get("collections", {}).items():
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict):
                    cd = item.get("configData", {})
                    for field in ["thumbnail", "goldenThumbnail", "rainbowThumbnail"]:
                        val = str(cd.get(field, ""))
                        if "rbxassetid://" in val:
                            aid = int(val.replace("rbxassetid://", "").strip())
                            if col_name not in highest_ids or aid > highest_ids[col_name]:
                                highest_ids[col_name] = aid
    
    print(f"\n  📊 Highest known asset IDs per category:")
    for col, asset_id in sorted(highest_ids.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"    {col}: {asset_id:,}")
    
    report = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "findings": {}
    }
    
    # Scan ranges around highest IDs
    # Check for unreleased assets (allocated but not in game yet)
    all_found = []
    
    for col_name, highest_id in list(highest_ids.items())[:5]:
        # Scan 5000 IDs beyond highest known
        range_start = highest_id + 1
        range_end = min(highest_id + 5000, highest_id + 10000)
        
        found = scan_range(range_start, range_end, f"{col_name} (unreleased)")
        all_found.extend(found)
    
    # Also scan some low-numbered ranges (legacy assets)
    legacy_ranges = [
        (1, 1000, "Legacy IDs (1k)"),
        (14000000000, 14000100000, "Recent upload cluster"),
        (15000000000, 15001000000, "2025 cluster"),
    ]
    
    for start, end, name in legacy_ranges[:1]:  # Just first legacy range to avoid spam
        found = scan_range(start, end, name)
        all_found.extend(found)
    
    print(f"\n  ✨ Found {len(all_found)} unreleased/hidden assets")
    
    if all_found:
        report["findings"]["hidden_assets"] = all_found
        
        # Group by creator for analysis
        by_creator = {}
        for asset in all_found:
            creator = asset.get("creator", {}).get("Name", "Unknown")
            if creator not in by_creator:
                by_creator[creator] = []
            by_creator[creator].append(asset)
        
        print(f"\n  📍 Assets by creator:")
        for creator, assets in sorted(by_creator.items(), key=lambda x: len(x[1]), reverse=True):
            print(f"    {creator}: {len(assets)} assets")
            for asset in assets[:3]:
                print(f"      → {asset.get('name', '?')} ({asset.get('id')})")
        
        report["findings"]["by_creator"] = by_creator
    
    # Save
    with open(SCANNER_FILE, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\n{'='*60}")
    print(f"  ✅ Asset scanning complete")
    print(f"  📄 Report: {SCANNER_FILE}")
    print(f"{'='*60}\n")
    
    return report

if __name__ == "__main__":
    report = run()
