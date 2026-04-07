#!/usr/bin/env python3
"""
PS99 Intelligence Engine — Virelai
Deep multi-layer Pet Simulator 99 leak & asset tracker

Layers:
  1. BIG Games public API (all collections, RAP, exists supply)
  2. Roblox group monitoring — BIG Games Pets (group 3959677)
  3. PS99 universe version monitoring
  4. Asset thumbnail extraction for new items
  5. Full diff engine — surfaces NEW / CHANGED things
  6. Discord notifications for findings
  7. DB-persisted snapshots (survives sandbox restarts)
"""

import os, sys, json, time, random, hashlib, subprocess
# Auto-install requests if missing (sandbox resets wipe pip packages)
try:
    import requests
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests
from datetime import datetime, timezone
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
OUTPUT_DIR    = Path(__file__).parent.parent / "output"
REPORT_FILE   = OUTPUT_DIR / "report.json"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

BIG_GAMES_GROUP_ID  = 3959677
PS99_UNIVERSE_ID    = 3317771874
PS99_PLACE_ID       = 8737899170

TRACKED_COLLECTIONS = [
    "Pets", "Eggs", "Worlds", "Boxes", "Boosts", "Buffs",
    "Ranks", "Enchants", "MiscItems", "RandomEvents", "Zones",
    "Lootboxes", "Charms", "Fruits", "Seeds", "Merchants",
    "GuildBattles", "Hoverboards", "Ultimates", "Upgrades",
    "Potions", "FishingRods", "Mastery",
]

BIGGAMES_API = "https://ps99.biggamesapi.io/api"
APP_ID = "69c2415c0f74b28eb1ba3ed0"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://www.roblox.com/",
}

# All Discord channels to broadcast to
DISCORD_WEBHOOKS = [
    "https://discord.com/api/webhooks/1372706312613396532/V9viCgj0wJMP6N6ztBjLfOcEvgK1JHV3nIA0bh-sPElnQ6zDBFjLQePcKzRPLT3RrJzJ",  # original leaks channel
    "https://discord.com/api/webhooks/1372706521896714290/eyNmbyLsMLHfa_UwYCc98dPW5aGYqMgkGwuGLvp7WI6mYPWD_ph9RpjH0iEBXYYwv5F8",  # channel 2
    "https://discord.com/api/webhooks/1443246418067460116/Mg7szF8ot46ko1-0e5SVOJoGYynfUXCZNSRRpSrLktqYLhPv-nNAedKzGbF0tkfb3lx3",  # channel 3
]
DISCORD_WEBHOOK = DISCORD_WEBHOOKS[0]  # kept for backward compat

# ── Helpers ───────────────────────────────────────────────────────────────────
def jitter(base=0.8, spread=0.6):
    time.sleep(base + random.random() * spread)

def safe_get(url, params=None, timeout=15, retries=3):
    for attempt in range(retries):
        try:
            jitter(0.5 + attempt * 0.5, 0.4)
            r = requests.get(url, headers=HEADERS, params=params, timeout=timeout)
            if r.status_code == 200:
                return r.json()
            elif r.status_code == 429:
                wait = 5 + attempt * 5
                print(f"  [429] Rate limited — waiting {wait}s")
                time.sleep(wait)
            else:
                print(f"  [WARN] {url.split('?')[0]} → HTTP {r.status_code}")
                return None
        except Exception as e:
            print(f"  [ERR] {url.split('?')[0]} → {e}")
    return None

def hash_item(item):
    return hashlib.md5(json.dumps(item, sort_keys=True).encode()).hexdigest()

def make_rap_key(item):
    return f"{item.get('category')}|{json.dumps(item.get('configData', ''), sort_keys=True)}"

def make_exists_key(item):
    return f"{item.get('category')}|{json.dumps(item.get('configData', ''), sort_keys=True)}"

# ── DB Snapshot via backend function (persists across sandbox restarts) ──────
BACKEND_URL = "https://virelai-b1ba3ed0.base44.app/functions/ps99SnapshotManager"

def call_snapshot_manager(payload):
    """Call the ps99SnapshotManager backend function"""
    try:
        r = requests.post(BACKEND_URL, json=payload, timeout=30)
        if r.status_code == 200:
            return r.json()
        else:
            print(f"  [WARN] SnapshotManager {payload.get('action')} failed: {r.status_code} {r.text[:150]}")
    except Exception as e:
        print(f"  [WARN] SnapshotManager error: {e}")
    return None

def load_snapshot_from_db():
    """Load snapshot from PS99Snapshot entity via backend function"""
    result = call_snapshot_manager({"action": "load"})
    if result and result.get("found"):
        snap = result.get("data", {})
        snap["_db_id"] = result.get("id")
        print(f"  [DB] Loaded snapshot (updated {result.get('updated_at','?')[:19]})")
        return snap
    print("  [DB] No existing snapshot — starting fresh baseline")
    return {}

def save_snapshot_to_db(snap, db_id=None):
    """Save snapshot via backend function"""
    result = call_snapshot_manager({
        "action": "save",
        "snapshot_data": snap,
        "record_id": db_id,
    })
    if result and result.get("ok"):
        print(f"  [DB] Snapshot saved ✓ (id: {result.get('id','?')[:8]}...)")
        return result.get("id")
    return db_id

def batch_save_findings_to_db(findings_list):
    """Batch save findings via backend function"""
    if not findings_list:
        return
    result = call_snapshot_manager({
        "action": "batch_save_findings",
        "findings": findings_list,
    })
    if result and result.get("ok"):
        print(f"  [DB] {result.get('saved', 0)} findings saved to DB ✓")

# ── Discord ───────────────────────────────────────────────────────────────────
def send_discord(embeds):
    for i in range(0, len(embeds), 10):
        chunk = embeds[i:i+10]
        payload = {"username": "Virelai Intelligence", "embeds": chunk}
        for hook in DISCORD_WEBHOOKS:
            try:
                r = requests.post(hook, json=payload, timeout=10)
                print(f"  [Discord] → {hook.split('/')[6][:8]}... {r.status_code}")
            except Exception as e:
                print(f"  [Discord] Error {hook.split('/')[6][:8]}: {e}")

def discord_new_items(items, category):
    if not items:
        return
    lines = [f"• {i.get('configName', '?')}" for i in items[:15]]
    if len(items) > 15:
        lines.append(f"_...and {len(items)-15} more_")
    send_discord([{
        "title": f"🐾 NEW {category.upper()}S — {len(items)} detected",
        "description": "\n".join(lines),
        "color": 10181046,
        "footer": {"text": "Virelai • PS99 Intelligence"},
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }])

def discord_price_moves(changes):
    if not changes:
        return
    fields = []
    for r in changes[:8]:
        old = r.get("old_value", 0)
        new = r.get("value", 0)
        pct = r.get("change_pct", 0)
        arrow = "📈" if new > old else "📉"
        fields.append({
            "name": f"{arrow} {r.get('configName') or r.get('configData', {}).get('id', '?')}",
            "value": f"**{old:,}** → **{new:,}** ({pct:+.1f}%)",
            "inline": False
        })
    send_discord([{
        "title": f"💰 RAP PRICE MOVEMENTS — {len(changes)} items",
        "color": 16776960,
        "fields": fields,
        "footer": {"text": "Virelai • PS99 Intelligence"},
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }])

def discord_game_update(old_ts, new_ts, players):
    send_discord([{
        "title": "🚨 PS99 GAME UPDATE DETECTED",
        "description": "Pet Simulator 99 just pushed an update!",
        "color": 15158332,
        "fields": [
            {"name": "Previous", "value": str(old_ts)[:19], "inline": True},
            {"name": "Now", "value": str(new_ts)[:19], "inline": True},
            {"name": "Live Players", "value": f"{players:,}", "inline": True},
        ],
        "footer": {"text": "Virelai • PS99 Intelligence"},
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }])

def discord_heartbeat(stats):
    """Quiet hourly heartbeat — no findings this run"""
    send_discord([{
        "title": "💚 Hourly Scan — Clean",
        "description": f"No new findings this run. Everything matches last snapshot.\nRAP price movements tracked silently (DB only — no Discord spam).",
        "color": 3066993,
        "fields": [
            {"name": "Pets tracked", "value": str(stats.get("pets", 0)), "inline": True},
            {"name": "RAP entries", "value": str(stats.get("rap", 0)), "inline": True},
            {"name": "Group games", "value": str(stats.get("games", 0)), "inline": True},
        ],
        "footer": {"text": "Virelai • PS99 Intelligence — Hourly Scan"},
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }])


# ── Layer 1b: FFlag monitoring ────────────────────────────────────────────────
FFLAG_PS99_KEYWORDS = [
    "pet", "egg", "collect", "catalog", "economy", "asset", "inventory",
    "trade", "badge", "gamepass", "developer", "purchase", "currency",
    "enchant", "potion", "charm", "hatch", "spawn", "loot"
]
FFLAG_URL = "https://raw.githubusercontent.com/MaximumADHD/Roblox-FFlag-Tracker/main/PCDesktopClient.json"

def fetch_fflags():
    print("\n[Layer 1b] FFlags")
    data = safe_get(FFLAG_URL)
    if not data:
        return {}
    # Filter to only PS99-relevant flags
    relevant = {k: v for k, v in data.items()
                if any(kw in k.lower() for kw in FFLAG_PS99_KEYWORDS)}
    print(f"  ✓ {len(relevant)} PS99-relevant FFlags (of {len(data)} total)")
    return relevant

def diff_fflags(old_flags, new_flags, limit=50):
    """Returns flags that are new or changed in value"""
    changes = []
    for k, v in new_flags.items():
        if k not in old_flags:
            changes.append({"name": k, "old": None, "new": v, "type": "new"})
        elif old_flags[k] != v:
            changes.append({"name": k, "old": old_flags[k], "new": v, "type": "changed"})
    return changes[:limit]

# ── Layer 1: BIG Games API ────────────────────────────────────────────────────
def fetch_collections():
    print("\n[Layer 1] BIG Games collections")
    results = {}
    for col in TRACKED_COLLECTIONS:
        data = safe_get(f"{BIGGAMES_API}/collection/{col}")
        if data and data.get("status") == "ok" and isinstance(data.get("data"), list):
            results[col] = data["data"]
            print(f"  ✓ {col}: {len(data['data'])} items")
        else:
            print(f"  ✗ {col}: skipped")
    return results

def fetch_rap():
    print("\n[Layer 1] RAP (prices)")
    data = safe_get(f"{BIGGAMES_API}/rap")
    if data and data.get("status") == "ok":
        print(f"  ✓ {len(data['data'])} RAP entries")
        return data["data"]
    return []

def fetch_exists():
    print("\n[Layer 1] Exists (supply counts)")
    data = safe_get(f"{BIGGAMES_API}/exists")
    if data and data.get("status") == "ok":
        print(f"  ✓ {len(data['data'])} exists entries")
        return data["data"]
    return []

# ── Layer 2: Group & Dev Game Monitoring ──────────────────────────────────────
def fetch_group_games(group_id):
    print("\n[Layer 2] BIG Games group games")
    games = []
    cursor = None
    pages = 0
    while pages < 5:
        params = {"accessFilter": 1, "limit": 50, "sortOrder": "Desc"}
        if cursor:
            params["cursor"] = cursor
        data = safe_get(f"https://games.roblox.com/v2/groups/{group_id}/gamesV2", params=params)
        if not data:
            break
        batch = data.get("data", [])
        games.extend(batch)
        cursor = data.get("nextPageCursor")
        if not cursor:
            break
        pages += 1
    print(f"  ✓ {len(games)} games tracked")
    return games

def fetch_universe_info(universe_id):
    print("\n[Layer 2] PS99 universe info")
    data = safe_get("https://games.roblox.com/v1/games", params={"universeIds": universe_id})
    if data and "data" in data and len(data["data"]) > 0:
        info = data["data"][0]
        print(f"  ✓ '{info.get('name')}' | updated {info.get('updated')} | players {info.get('playing',0):,}")
        return info
    return {}

# ── Layer 3: Asset Thumbnails ──────────────────────────────────────────────────
def fetch_thumbnails(asset_ids):
    if not asset_ids:
        return {}
    asset_ids = list(set(asset_ids))[:300]
    print(f"\n[Layer 3] Thumbnails for {len(asset_ids)} asset IDs")
    results = {}
    chunks = [asset_ids[i:i+25] for i in range(0, len(asset_ids), 25)]
    for i, chunk in enumerate(chunks):
        data = safe_get(
            "https://thumbnails.roblox.com/v1/assets",
            params={"assetIds": ",".join(str(a) for a in chunk),
                    "returnPolicy": "PlaceHolder", "size": "420x420",
                    "format": "Png", "isCircular": "false"}
        )
        if data and "data" in data:
            for item in data["data"]:
                results[str(item["targetId"])] = item.get("imageUrl", "")
        if i > 0 and i % 5 == 0:
            time.sleep(3)
    print(f"  ✓ {len(results)} thumbnails fetched")
    return results

# ── Layer 4: Diff Engine ──────────────────────────────────────────────────────
def diff_collections(old_cols, new_cols):
    findings = {}
    for col, items in new_cols.items():
        if not isinstance(items, list):
            continue
        old_items  = old_cols.get(col, [])
        old_names  = {i.get("configName", "") for i in old_items if isinstance(i, dict)}
        old_hashes = {hash_item(i) for i in old_items if isinstance(i, dict)}
        new_found  = [i for i in items if isinstance(i, dict) and i.get("configName", "") not in old_names]
        changed    = [i for i in items if isinstance(i, dict)
                      and i.get("configName", "") in old_names
                      and hash_item(i) not in old_hashes]
        if new_found:
            print(f"  🆕 {col}: {len(new_found)} NEW → {[i.get('configName','?') for i in new_found[:6]]}")
        if changed:
            print(f"  ✏️  {col}: {len(changed)} CHANGED → {[i.get('configName','?') for i in changed[:4]]}")
        if new_found or changed:
            findings[col] = {"new": new_found, "changed": changed}
    return findings

def diff_rap(old_list, new_list, threshold_pct=10):
    old_map = {make_rap_key(i): i.get("value", 0) for i in old_list if isinstance(i, dict)}
    changes = []
    for item in new_list:
        if not isinstance(item, dict):
            continue
        key     = make_rap_key(item)
        old_val = old_map.get(key, 0)
        new_val = item.get("value", 0)
        if old_val > 0 and new_val > 0:
            pct = abs(new_val - old_val) / old_val * 100
            if pct >= threshold_pct:
                changes.append({**item, "old_value": old_val, "change_pct": round(pct, 1)})
    return changes

def diff_games(old_list, new_list):
    old_ids = {str(g.get("id", "")) for g in old_list if isinstance(g, dict)}
    return [g for g in new_list if isinstance(g, dict) and str(g.get("id", "")) not in old_ids]

def extract_asset_ids(col_diff):
    ids = []
    for col, data in col_diff.items():
        for item in data.get("new", []) + data.get("changed", []):
            cd = item.get("configData", {}) if isinstance(item, dict) else {}
            if isinstance(cd, dict):
                for field in ["thumbnail", "goldenThumbnail", "rainbowThumbnail", "shinyThumbnail", "icon"]:
                    val = cd.get(field, "")
                    if isinstance(val, (int, str)) and str(val).isdigit():
                        ids.append(int(val))
    return ids

# ── Main Run ──────────────────────────────────────────────────────────────────
def run():
    run_at = datetime.now(timezone.utc).isoformat()
    print(f"\n{'='*62}")
    print(f"  PS99 Intelligence Engine — {run_at[:19]} UTC")
    print(f"{'='*62}")

    # Load snapshot from DB
    snapshot = load_snapshot_from_db()
    db_id = snapshot.pop("_db_id", None)

    report = {"run_at": run_at, "findings": {}}

    # ── Layer 1 ───────────────────────────────────────────────────────────
    collections = fetch_collections()
    col_diff = diff_collections(snapshot.get("collections", {}), collections)
    if col_diff:
        report["findings"]["collections"] = col_diff

    rap = fetch_rap()
    exists = fetch_exists()
    rap_changes = diff_rap(snapshot.get("rap", []), rap)
    if rap_changes:
        print(f"\n  💰 {len(rap_changes)} significant RAP price movements")
        report["findings"]["rap_changes"] = rap_changes


    # ── Layer 1b: FFlag monitoring ────────────────────────────────────────
    fflags_data = fetch_fflags()
    fflag_changes = diff_fflags(snapshot.get("fflags", {}), fflags_data)
    if fflag_changes:
        print(f"\n  🚩 {len(fflag_changes)} FFlag changes detected")
        report["findings"]["fflag_changes"] = fflag_changes

    # ── Layer 2 ───────────────────────────────────────────────────────────
    group_games   = fetch_group_games(BIG_GAMES_GROUP_ID)
    universe_info = fetch_universe_info(PS99_UNIVERSE_ID)

    new_games = diff_games(snapshot.get("group_games", []), group_games)
    if new_games:
        print(f"\n  🎮 {len(new_games)} NEW games in BIG Games group: {[g.get('name','?') for g in new_games]}")
        report["findings"]["new_group_games"] = new_games

    old_universe = snapshot.get("universe_info", {})
    if universe_info and old_universe:
        if universe_info.get("updated") != old_universe.get("updated"):
            print(f"\n  🔄 PS99 UPDATED! {old_universe.get('updated')} → {universe_info.get('updated')}")
            report["findings"]["game_updated"] = {
                "old_updated": old_universe.get("updated"),
                "new_updated": universe_info.get("updated"),
                "playing": universe_info.get("playing", 0),
            }

    dev_changes = []
    old_dev_map = {str(g.get("id","")): g for g in snapshot.get("group_games", []) if isinstance(g, dict)}
    for g in group_games:
        if "[Dev]" in g.get("name", "") or "Dev" in g.get("name", ""):
            gid = str(g.get("id", ""))
            old = old_dev_map.get(gid, {})
            if old and g.get("updated") != old.get("updated"):
                dev_changes.append({"name": g.get("name"), "new_updated": g.get("updated")})
    if dev_changes:
        print(f"\n  👾 DEV GAME(S) UPDATED: {[d['name'] for d in dev_changes]}")
        report["findings"]["dev_game_updates"] = dev_changes

    # ── Layer 3 ───────────────────────────────────────────────────────────
    new_asset_ids = extract_asset_ids(col_diff)
    thumbnails = {}
    if new_asset_ids:
        thumbnails = fetch_thumbnails(new_asset_ids)
        report["findings"]["new_asset_thumbnails"] = thumbnails
    else:
        print("\n[Layer 3] No new asset IDs to fetch")

    # ── Save snapshot to DB ───────────────────────────────────────────────
    new_snapshot = {
        "collections":         collections,
        "rap":                 rap,
        "group_games":         group_games,
        "universe_info":       universe_info,
        "fflags":              fflags_data,
        "exists":              exists,
        "updated_at":          run_at,
    }
    db_id = save_snapshot_to_db(new_snapshot, db_id)

    # ── Save findings to DB (batched) ────────────────────────────────────
    findings_batch = []
    for col, diff in col_diff.items():
        for item in diff.get("new", []):
            findings_batch.append({"category": col, "item_name": item.get("configName","?"), "change_type": "new", "details": item, "run_at": run_at})
        for item in diff.get("changed", []):
            findings_batch.append({"category": col, "item_name": item.get("configName","?"), "change_type": "changed", "details": item, "run_at": run_at})
    for r in rap_changes:
        rap_name = r.get("configName") or r.get("configData", {}).get("id", "?")
        findings_batch.append({"category": "RAP", "item_name": rap_name, "change_type": "price_move", "details": r, "run_at": run_at})
    if report["findings"].get("fflag_changes"):
        for fc in report["findings"]["fflag_changes"][:20]:
            findings_batch.append({"category": "FFlags", "item_name": fc.get("name","?"), "change_type": "changed", "details": fc, "run_at": run_at})
    if report["findings"].get("game_updated"):
        findings_batch.append({"category": "Game", "item_name": "PS99", "change_type": "game_update", "details": report["findings"]["game_updated"], "run_at": run_at})
    if findings_batch:
        batch_save_findings_to_db(findings_batch)

    # ── Save local report ─────────────────────────────────────────────────
    with open(REPORT_FILE, "w") as f:
        json.dump(report, f, indent=2)

    has_findings = any(bool(v) for v in report["findings"].values())

    print(f"\n{'='*62}")
    if has_findings:
        n = sum(len(v.get("new",[])) + len(v.get("changed",[])) if isinstance(v, dict) and "new" in v
                else len(v) if isinstance(v, list) else 1
                for v in report["findings"].values() if v)
        print(f"  🚨 {n} total findings this run!")
    else:
        print("  ✅ No new findings — everything matches last snapshot")
    print(f"{'='*62}\n")

    # ── Discord notifications ─────────────────────────────────────────────
    # NOTE: RAP price moves are NEVER sent to Discord — DB only
    if has_findings:
        # New pets/eggs/items/enchants/potions etc
        for col in ["Pets", "Eggs", "Boxes", "Worlds", "Charms", "Hoverboards", "Ultimates", "Enchants", "Potions"]:
            col_data = col_diff.get(col, {})
            if col_data.get("new"):
                discord_new_items(col_data["new"], col.rstrip("s"))
        # Changed items (not just new)
        for col, data in col_diff.items():
            if data.get("changed") and col not in ["Pets", "Eggs"]:
                send_discord([{
                    "title": f"✏️ {col.upper()} CHANGED — {len(data['changed'])} item(s)",
                    "description": "\n".join([f"• {i.get('configName','?')}" for i in data['changed'][:10]]),
                    "color": 3447003,
                    "footer": {"text": "Virelai • PS99 Intelligence"},
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }])
        # FFlag changes
        if report["findings"].get("fflag_changes"):
            fc_list = report["findings"]["fflag_changes"][:10]
            send_discord([{
                "title": f"🚩 FFLAG CHANGES — {len(fc_list)} flags updated",
                "description": "\n".join([f"• `{f['name']}` `{f.get('old')}` → `{f.get('new')}`" for f in fc_list]),
                "color": 3447003,
                "footer": {"text": "Virelai • PS99 Intelligence"},
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }])
        # Game update
        if report["findings"].get("game_updated"):
            gu = report["findings"]["game_updated"]
            discord_game_update(gu["old_updated"], gu["new_updated"], gu.get("playing", 0))
        # Dev game update
        if dev_changes:
            send_discord([{
                "title": f"👾 DEV GAME UPDATE — {len(dev_changes)} game(s)",
                "description": "\n".join([f"• {d['name']}" for d in dev_changes]),
                "color": 15105570,
                "footer": {"text": "Virelai • PS99 Intelligence"},
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }])
        # New group games
        if new_games:
            send_discord([{
                "title": f"🎮 NEW GAME IN BIG GAMES GROUP — {len(new_games)} game(s)",
                "description": "\n".join([f"• {g.get('name','?')}" for g in new_games[:5]]),
                "color": 2067276,
                "footer": {"text": "Virelai • PS99 Intelligence"},
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }])
    else:
        # Quiet heartbeat so you know it's alive
        discord_heartbeat({
            "pets": len(collections.get("Pets", [])),
            "rap": len(rap),
            "games": len(group_games),
        })

    return report


if __name__ == "__main__":
    report = run()
    findings = report.get("findings", {})
    if findings:
        print("\n=== FINDINGS SUMMARY ===")
        for cat, data in findings.items():
            if isinstance(data, dict) and "new" in data:
                print(f"  {cat}: {len(data['new'])} new, {len(data.get('changed', []))} changed")
            elif isinstance(data, list):
                print(f"  {cat}: {len(data)} entries")
            else:
                print(f"  {cat}: detected")
    else:
        print("\n  No new findings this run.")
