#!/usr/bin/env python3
"""
Discord Webhook Notifier — Push PS99 findings to Discord in real-time
Sends embeds with:
  - New pet/item names and thumbnails
  - Price movements >10%
  - Game updates & dev releases
  - Asset ID leaks
"""

import json, requests, time
from datetime import datetime
from pathlib import Path

# Discord webhook URL (set this in environment or hardcode for now)
# Format: https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
DISCORD_WEBHOOK = None  # Will read from env or config

def load_webhook():
    global DISCORD_WEBHOOK
    # Try env var first
    import os
    DISCORD_WEBHOOK = os.environ.get("DISCORD_WEBHOOK_PS99")
    if not DISCORD_WEBHOOK:
        # Try from config file
        config_file = Path(__file__).parent.parent / "discord_config.json"
        if config_file.exists():
            with open(config_file) as f:
                DISCORD_WEBHOOK = json.load(f).get("webhook_url")
    return DISCORD_WEBHOOK

def send_embed(title, description, fields=None, thumbnail_url=None, color=3447003):
    """Send a Discord embed notification"""
    if not DISCORD_WEBHOOK:
        print("[Discord] No webhook configured — skipping notification")
        return False
    
    embed = {
        "title": title,
        "description": description,
        "color": color,
        "timestamp": datetime.now().isoformat(),
    }
    
    if thumbnail_url:
        embed["thumbnail"] = {"url": thumbnail_url}
    
    if fields:
        embed["fields"] = fields
    
    payload = {"embeds": [embed]}
    
    try:
        r = requests.post(DISCORD_WEBHOOK, json=payload, timeout=10)
        return r.status_code in [200, 204]
    except Exception as e:
        print(f"[Discord] Error: {e}")
        return False

def notify_new_pet(pet_name, rarity, thumbnail_url=None):
    """Notify a new pet discovery"""
    color = {"Exclusive": 16711680, "Mythic": 16711730, "Legendary": 16776960}.get(rarity, 3447003)
    send_embed(
        title=f"🎉 NEW PET: {pet_name}",
        description=f"Rarity: **{rarity}**",
        thumbnail_url=thumbnail_url,
        color=color
    )

def notify_price_movement(item_name, old_price, new_price, change_pct):
    """Notify significant RAP price movement"""
    direction = "📈" if new_price > old_price else "📉"
    color = 16711680 if new_price > old_price else 32768
    
    send_embed(
        title=f"{direction} Price Movement: {item_name}",
        description=f"{old_price:,} → {new_price:,} ({change_pct:+.1f}%)",
        color=color
    )

def notify_game_update(game_name, old_version, new_version):
    """Notify game version update"""
    send_embed(
        title=f"🔄 Game Updated: {game_name}",
        description=f"v{old_version} → v{new_version}",
        color=65535  # cyan
    )

def notify_new_game_release(game_name, devs):
    """Notify new dev game release"""
    send_embed(
        title=f"🎮 NEW GAME: {game_name}",
        description=f"Released by: {', '.join(devs)}",
        color=16711935  # magenta
    )

def process_report_and_notify(report_file):
    """Read PS99 findings report and send Discord notifications"""
    if not (Path(report_file).exists()):
        return
    
    with open(report_file) as f:
        report = json.load(f)
    
    findings = report.get("findings", {})
    
    # Process new pets
    for col, col_data in findings.get("collections", {}).items():
        if col == "Pets":
            for pet in col_data.get("new", [])[:5]:  # Limit to 5 per notification batch
                name = pet.get("configName", "?")
                rarity = pet.get("category", "?")
                thumb = pet.get("configData", {}).get("thumbnail", "").replace("rbxassetid://", "")
                notify_new_pet(name, rarity, thumbnail_url=f"https://tr.rbxcdn.com/{thumb}" if thumb else None)
                time.sleep(1)  # Rate limit
    
    # Process price movements
    for item in findings.get("rap_changes", [])[:3]:
        name = item.get("category", "?")
        old_val = item.get("old_value", 0)
        new_val = item.get("value", 0)
        pct = item.get("change_pct", 0)
        notify_price_movement(name, old_val, new_val, pct)
        time.sleep(1)

def main():
    load_webhook()
    if not DISCORD_WEBHOOK:
        print("[Discord] No webhook URL configured")
        return
    
    print(f"[Discord] Webhook loaded: {DISCORD_WEBHOOK[:50]}...")
    
    # Test notification
    send_embed(
        title="✅ PS99 Intelligence Connected",
        description="Real-time leak tracking active",
        color=32768  # green
    )

if __name__ == "__main__":
    main()
