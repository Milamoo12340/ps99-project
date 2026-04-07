# 🤖 Virelai — PS99 Intelligence Superagent

> Personal AI agent built on [Base44](https://app.base44.com) by Milamoo12340

Virelai is the intelligence engine behind all PS99 leak tracking, asset scanning, Discord bot automation, and repo maintenance for this GitHub account.

## 🔗 Live Access

| Resource | Link |
|----------|------|
| 💬 Chat with Virelai | https://app.base44.com/superagent/69c2415c0f74b28eb1ba3ed0 |
| 📊 PS99 Intelligence Dashboard | https://virelai-app-7cf874fa.base44.app |
| 🐾 PS99 Performance Hub | https://milamoos-ps99-performance-hub.base44.app |

## 🧠 What Virelai Does

### PS99 Intelligence (Hourly Automation)
- Tracks **2,584+ pets**, 772 eggs, 15,176 supply entries
- Detects RAP price movements >10%
- Monitors 600+ PS99-relevant FFlags
- Scans BIG Games dev/staging games
- Sends real-time Discord alerts via webhook

### Repo Management
- Fixes and pushes to all GitHub repos automatically
- Completed: `AHK-AIForge`, `Milamoos-PS99-Optimisation-Hub`, `ps99-hub`, `FastFlag-Optimisation-RBLX`, `ps99-project`

### Discord Bot (Leaksbot)
- 30+ slash commands: `/leaks`, `/stats`, `/eggs`, `/hatches`, `/clan`, `/user`, `/scan`
- App ID: `1352881326461812736`
- Webhook: attached to PS99 leaks channel

### Dashboard Features (12 tabs)
- 📊 Overview · 🔔 Leaks · 🗂️ Assets · 🐾 Pets · 🥚 Eggs
- 💰 RAP · 📦 Supply · 👾 Devs · 🔌 Endpoints · 🎫 Gamepasses
- 🤖 Discord Bot · ⚡ Scan

## 🏗️ Architecture

\`\`\`
Base44 App (69c2415c0f74b28eb1ba3ed0)
├── Entities
│   ├── PS99Finding       — all leak detections
│   ├── PS99Snapshot      — baseline state (diffed hourly)
│   └── LinkedUser        — Discord ↔ Roblox account links
├── Backend Functions
│   ├── leaksbotHandler   — Discord slash command handler
│   ├── ps99SnapshotManager — snapshot load/save
│   └── notifyPS99Findings — Discord webhook sender
├── Automations
│   └── PS99 Intelligence Hourly Scan (28 runs/day, ~0.2 credits/run)
└── Skills
    └── ps99_intelligence/
        ├── run.py                  — main 4-layer scanner
        ├── roblox_update_monitor.py — FFlag + version tracker
        ├── advanced_dev_tracker.py  — BIG Games dev scanner
        └── asset_id_scanner.py      — asset range scanner
\`\`\`

## 📡 APIs Used

| Source | Endpoints |
|--------|-----------|
| BIG Games | `ps99.biggamesapi.io/api/collection/*`, `/rap`, `/exists`, `/clans` |
| Roblox Games | `games.roblox.com/v1/games`, group games |
| Roblox FFlags | `clientsettings.roblox.com/v2/settings/application/PCDesktopClient` |
| Roblox Client | `clientsettings.roblox.com/v2/client-version/WindowsPlayer` |
| Roblox Thumbnails | `thumbnails.roblox.com/v1/assets` |

## 🤖 Identity

- **Name:** Virelai
- **Platform:** Base44 Superagent
- **Owner:** Milamoo12340 (IQ: 132, Perth AU 🇦🇺)
- **Stack:** TypeScript · Python · React · AHK · Discord · Roblox APIs
- **Personality:** Sharp, warm, takes initiative, builds things that actually work

---

*Virelai maintains this repo autonomously. Last push: April 2026.*
