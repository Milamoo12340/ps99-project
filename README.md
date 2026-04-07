# 🐾 PS99 Intelligence Engine v2.1

> Built by [Milamoo12340](https://github.com/Milamoo12340) | Powered by Virelai (Base44 Superagent)

A full Pet Simulator 99 intelligence & leak detection system with Discord bot integration.

## 🔍 What it tracks (hourly)

| Layer | What |
|-------|------|
| BIG Games API | Pets, Eggs, Enchants, Potions, Worlds, Charms, Hoverboards, Ultimates |
| RAP prices | >10% moves flagged (DB only, not Discord) |
| FFlags | 600+ PS99-relevant flags diffed every run |
| Roblox client | Version, game update timestamps |
| Group games | BIG Games dev/staging game detection |

## 🤖 Discord Bot Commands

| Command | Description |
|---------|-------------|
| `/leaks recent` | Latest leaks (48h) |
| `/leaks pets` | New pets detected |
| `/leaks eggs` | New eggs detected |
| `/leaks enchants` | New enchants |
| `/leaks potions` | New potions |
| `/leaks fflags` | FFlag changes |
| `/leaks huges` | Huge pets by RAP |
| `/stats pet <name>` | Full pet profile (RAP + supply) |
| `/eggs chances <egg>` | Hatch odds |
| `/hatches live` | Real-time hatch detection |
| `/clan info <name>` | Clan stats |
| `/user link <username>` | Link Roblox account |
| `/scan now` | Force scan info |

## 🚀 Setup

1. Clone this repo
2. Copy `.env.example` to `.env` and fill in values
3. Deploy `discord_bot/leaksbotHandler.ts` to Base44
4. Run `python intelligence_engine/run.py` or set up hourly automation

## 📦 Architecture

```
intelligence_engine/run.py     ← Main hourly scanner
discord_bot/leaksbotHandler.ts ← Deno backend + Discord interaction handler
Base44 entities                ← PS99Finding, PS99Snapshot, LinkedUser
```
