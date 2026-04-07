#!/usr/bin/env python3
"""
Advanced BIG Games Developer Account Tracker
Monitors known BIG Games dev accounts for:
  - Recent asset uploads (decals, models, images)
  - Item modifications (release before public announcement)
  - Asset ID patterns (range scanning for unreleased IDs)
"""

import json, requests, time, random
from datetime import datetime, timezone
from pathlib import Path

DEV_IDS = {
    189395688: "Preston_Username",    # Preston — BIG Games founder (verify)
    # More dev IDs discovered via group members endpoint
}

BIGGAMES_GROUP = 3959677

def fetch_group_members():
    """Get all BIG Games group members — find dev accounts"""
    print("[DevTracker] Fetching group members...")
    members = []
    cursor = None
    while True:
        params = {"limit": 100}
        if cursor:
            params["sortOrder"] = "Desc"  
        r = requests.get(
            f"https://groups.roblox.com/v1/groups/{BIGGAMES_GROUP}/users",
            headers={"User-Agent": "Mozilla/5.0"},
            params=params,
            timeout=10
        )
        if r.status_code != 200:
            break
        data = r.json()
        batch = data.get("data", [])
        if not batch:
            break
        members.extend(batch)
        if "nextPageCursor" not in data or not data.get("nextPageCursor"):
            break
        cursor = data["nextPageCursor"]
        time.sleep(1)
    print(f"  ✓ {len(members)} group members found")
    return members

def fetch_user_inventory(user_id):
    """Get recent items created/modified by a user"""
    url = f"https://inventory.roblox.com/v2/users/{user_id}/inventory"
    params = {
        "assetTypes": "Image,Decal,Model,MeshPart",
        "limit": 50,
        "sortOrder": "Desc"
    }
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, params=params, timeout=10)
    if r.status_code == 200:
        data = r.json()
        items = data.get("data", [])
        return items
    return []

def main():
    members = fetch_group_members()
    top_devs = sorted(members, key=lambda x: x.get("role", ""), reverse=True)[:20]
    
    print("\n[DevTracker] Top 20 members (likely devs):")
    for member in top_devs:
        print(f"  {member.get('user', {}).get('name', 'unknown')} | role:{member.get('role',' ')}")
    
    print("\n[DevTracker] Scanning dev inventories for recent creations...")
    for member in top_devs[:5]:  # Scan top 5
        user_id = member.get("userId")
        user_name = member.get("user", {}).get("name", "unknown")
        items = fetch_user_inventory(user_id)
        if items:
            print(f"\n  {user_name} ({user_id}): {len(items)} recent items")
            for item in items[:3]:
                print(f"    • {item.get('name', '?')} (ID:{item.get('id')})")
        time.sleep(2)

if __name__ == "__main__":
    main()
