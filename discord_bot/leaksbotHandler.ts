import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// ── Config — v2 autocomplete ─────────────────────────────────────────────────────────────────────
const BIGGAMES   = "https://ps99.biggamesapi.io/api";
const PS99_UNI   = "3317771874";
const PS99_PLACE = "8737899170";
const BIG_GROUP  = "3959677";
const DISCORD_HOOKS = [
  "https://discord.com/api/webhooks/1372706312613396532/V9viCgj0wJMP6N6ztBjLfOcEvgK1JHV3nIA0bh-sPElnQ6zDBFjLQePcKzRPLT3RrJzJ",
  "https://discord.com/api/webhooks/1372706521896714290/eyNmbyLsMLHfa_UwYCc98dPW5aGYqMgkGwuGLvp7WI6mYPWD_ph9RpjH0iEBXYYwv5F8",
  "https://discord.com/api/webhooks/1443246418067460116/Mg7szF8ot46ko1-0e5SVOJoGYynfUXCZNSRRpSrLktqYLhPv-nNAedKzGbF0tkfb3lx3",
];
const DISCORD_PUBKEY = Deno.env.get("DISCORD_PUBLIC_KEY") || "";
const RH = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36","Accept":"application/json"};

// ── Helpers ────────────────────────────────────────────────────────────────────
async function rget(url: string, params?: Record<string,string>) {
  try {
    const u = new URL(url);
    if (params) Object.entries(params).forEach(([k,v]) => u.searchParams.set(k,v));
    const r = await fetch(u.toString(), {headers: RH});
    if (r.ok) return await r.json().catch(() => null);
  } catch {}
  return null;
}
function embed(title: string, desc="", color=0x7289DA, fields?: any[], thumbnail?: string, image?: string) {
  const e: any = {title, description: desc, color, footer:{text:"Leaksbot • PS99 Intelligence"}, timestamp: new Date().toISOString()};
  if (fields?.length) e.fields = fields;
  if (thumbnail) e.thumbnail = {url: thumbnail};
  if (image) e.image = {url: image};
  return e;
}
async function sendWebhook(embeds: any[], content?: string) {
  const p: any = {username:"Leaksbot 🔍", embeds: embeds.slice(0,5)};
  if (content) p.content = content;
  await Promise.all(DISCORD_HOOKS.map(h => fetch(h,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(p)}).catch(()=>{})));
}
async function verifySig(req: Request, body: string): Promise<boolean> {
  if (!DISCORD_PUBKEY) return true;
  try {
    const sig = req.headers.get("x-signature-ed25519")||"", ts = req.headers.get("x-signature-timestamp")||"";
    const key = await crypto.subtle.importKey("raw", hexBytes(DISCORD_PUBKEY), {name:"Ed25519"}, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexBytes(sig), new TextEncoder().encode(ts+body));
  } catch { return false; }
}
function hexBytes(hex: string): Uint8Array {
  const b = new Uint8Array(hex.length/2);
  for (let i=0; i<hex.length; i+=2) b[i/2] = parseInt(hex.slice(i,i+2),16);
  return b;
}
function parseOpts(options: any[]): Record<string,any> {
  const out: Record<string,any> = {};
  for (const opt of options||[]) {
    if (opt.type===1||opt.type===2) Object.assign(out, parseOpts(opt.options||[]));
    else out[opt.name] = opt.value;
  }
  return out;
}
function cmdKey(data: any): string {
  const sub = (data.options||[]).find((o: any) => o.type===1||o.type===2);
  return sub ? `${data.name} ${sub.name}` : data.name;
}
function fmt(n: number): string {
  if (n>=1e12) return (n/1e12).toFixed(2).replace(/\.?0+$/,"")+"T";
  if (n>=1e9)  return (n/1e9).toFixed(2).replace(/\.?0+$/,"")+"B";
  if (n>=1e6)  return (n/1e6).toFixed(2).replace(/\.?0+$/,"")+"M";
  if (n>=1e3)  return (n/1e3).toFixed(1).replace(/\.0$/,"")+"K";
  return n.toLocaleString();
}
function petEmoji(name: string): string {
  if (name.includes("Gargantuan")) return "🔱";
  if (name.includes("Titanic")) return "🐉";
  if (name.includes("Huge")) return "🐾";
  return "◾";
}
function variantStr(pt?: number, sh?: boolean): string {
  return [(pt===2?"🌈":pt===1?"⭐":""), (sh?"✨":"")].filter(Boolean).join("");
}
function pctToOdds(pct: number): string {
  if (!pct||pct<=0) return "N/A";
  return `${pct}% — **1 in ${Math.round(100/pct).toLocaleString()}**`;
}
async function getPetThumbnail(petName: string): Promise<string|undefined> {
  const pets = (await rget(`${BIGGAMES}/collection/Pets`))?.data || [];
  const p = pets.find((x: any) => (x.configData?.name||x.configName||"") === petName ||
    (x.configData?.name||x.configName||"").toLowerCase() === petName.toLowerCase());
  const thumb = p?.configData?.thumbnail || p?.configData?.goldenThumbnail;
  if (!thumb) return undefined;
  const id = thumb.replace("rbxassetid://","");
  return `https://ps99.biggamesapi.io/image/${id}`;
}
async function getRobloxUser(username: string): Promise<{id:number,name:string,displayName:string}|null> {
  try {
    const r = await fetch("https://users.roblox.com/v1/usernames/users", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({usernames:[username],excludeBannedUsers:false})
    });
    return (await r.json()).data?.[0] || null;
  } catch { return null; }
}

// ── Pet stat lookup (full profile for one pet) ────────────────────────────────
async function cmdStatPet(petName: string): Promise<any[]> {
  const [rapData, existsData, petsData] = await Promise.all([
    rget(`${BIGGAMES}/rap`), rget(`${BIGGAMES}/exists`), rget(`${BIGGAMES}/collection/Pets`)
  ]);
  const q = petName.toLowerCase();
  const rap = (rapData?.data||[]) as any[];
  const exists = (existsData?.data||[]) as any[];
  const pets = (petsData?.data||[]) as any[];

  // Find base pet config
  const petConf = pets.find((p: any) => (p.configData?.name||p.configName||"").toLowerCase() === q ||
    (p.configData?.name||p.configName||"").toLowerCase().includes(q));
  if (!petConf) return [embed("❌ Pet Not Found", `No pet matching \`${petName}\`. Try \`/search\`.`, 0xE74C3C)];

  const name = petConf.configData?.name || petConf.configName;
  const thumb = petConf.configData?.thumbnail?.replace("rbxassetid://","");
  const thumbUrl = thumb ? `https://ps99.biggamesapi.io/image/${thumb}` : undefined;

  // Get all variants from RAP + exists
  const rapVariants = rap.filter((r: any) => typeof r.configData==="object" &&
    (r.configData?.id||"").toLowerCase() === name.toLowerCase() && r.value > 0);
  const existVariants = exists.filter((e: any) => typeof e.configData==="object" &&
    (e.configData?.id||"").toLowerCase() === name.toLowerCase());

  const fields: any[] = [];
  // RAP values
  for (const v of rapVariants) {
    const vs = variantStr(v.configData?.pt, v.configData?.sh);
    const label = `💰 RAP${vs ? " "+vs : ""}`;
    fields.push({name: label, value: `**${fmt(v.value)}**`, inline: true});
  }
  // Supply counts
  for (const v of existVariants) {
    const vs = variantStr(v.configData?.pt, v.configData?.sh);
    const label = `📦 Supply${vs ? " "+vs : ""}`;
    fields.push({name: label, value: `**${(v.value||0).toLocaleString()}** exist`, inline: true});
  }
  // Category
  fields.push({name:"🏷️ Category", value: petConf.configData?.category||"Standard", inline:true});
  if (petConf.configData?.huge) fields.push({name:"✨ Tier", value:"Huge", inline:true});

  return [embed(`${petEmoji(name)} ${name}`, "", 0x9B59B6, fields, thumbUrl)];
}

// ── Clan commands ─────────────────────────────────────────────────────────────
async function cmdClanInfo(clanName: string): Promise<any[]> {
  const [clanData, clanList] = await Promise.all([
    rget(`${BIGGAMES}/clan/${clanName}`),
    rget(`${BIGGAMES}/clans`, {page:"1",pageSize:"200",sort:"Points",sortOrder:"desc"})
  ]);
  if (!clanData?.data) return [embed("❌ Clan Not Found", `No clan found for \`${clanName}\`.`, 0xE74C3C)];
  const d = clanData.data;
  const clans = clanList?.data || [];
  const rank = clans.findIndex((c: any) => c.Name === clanName) + 1;
  const pubData = clans.find((c: any) => c.Name === clanName) || {};

  const members = d.Members || [];
  const sortedMembers = [...members].sort((a: any, b: any) => b.PermissionLevel - a.PermissionLevel);
  const owner = sortedMembers.find((m: any) => m.PermissionLevel >= 90);
  const officers = sortedMembers.filter((m: any) => m.PermissionLevel >= 50 && m.PermissionLevel < 90);

  const fields: any[] = [
    {name:"🏰 Clan", value: d.Name, inline:true},
    {name:"📊 Global Rank", value: rank ? `**#${rank}** of ${clans.length}+` : "Unranked", inline:true},
    {name:"🌍 Country", value: d.CountryCode||"?", inline:true},
    {name:"⭐ Guild Level", value: String(d.GuildLevel||0), inline:true},
    {name:"👥 Members", value: `**${members.length}** / ${d.MemberCapacity||75}`, inline:true},
    {name:"🏆 Officer slots", value: `${officers.length}/${d.OfficerCapacity||10}`, inline:true},
    {name:"⚔️ Battle Points", value: fmt(pubData.Points||0), inline:true},
    {name:"💎 Deposited Diamonds", value: fmt(pubData.DepositedDiamonds||0), inline:true},
    {name:"🥇 Gold / 🥈 Silver / 🥉 Bronze", value: `${d.GoldMedals||0} / ${d.SilverMedals||0} / ${d.BronzeMedals||0}`, inline:false},
  ];
  if (owner) fields.push({name:"👑 Owner", value:`UserID: ${owner.UserID}`, inline:true});
  if (d.Desc) fields.push({name:"📝 Description", value: d.Desc.slice(0,100), inline:false});

  const iconId = d.Icon?.replace("rbxassetid://","");
  const iconUrl = iconId ? `https://ps99.biggamesapi.io/image/${iconId}` : undefined;

  return [embed(`🏰 Clan — ${d.Name}`, "", 0xF1C40F, fields, iconUrl)];
}

async function cmdClanBattle(clanName: string): Promise<any[]> {
  const [clanData, battle, clanList] = await Promise.all([
    rget(`${BIGGAMES}/clan/${clanName}`),
    rget(`${BIGGAMES}/activeClanBattle`),
    rget(`${BIGGAMES}/clans`, {page:"1",pageSize:"200",sort:"Points",sortOrder:"desc"})
  ]);
  if (!clanData?.data) return [embed("❌ Not Found", `Clan \`${clanName}\` not found.`, 0xE74C3C)];
  const d = clanData.data;
  const clans = clanList?.data || [];
  const rank = clans.findIndex((c: any) => c.Name === clanName) + 1;
  const pubData = clans.find((c: any) => c.Name === clanName) || {};
  const bn = battle?.data?.configName || "?";
  const contrib = d.Contribution || {};

  const fields: any[] = [
    {name:"⚔️ Active Battle", value: bn, inline:true},
    {name:"📊 Clan Rank", value: rank ? `**#${rank}**` : "Unranked", inline:true},
    {name:"⭐ Clan Points", value: fmt(pubData.Points||0), inline:true},
  ];

  let contribText = "No individual contribution data available.\n*(Data populates during active battle rounds)*";
  for (const [battleType, entries] of Object.entries(contrib)) {
    if (Array.isArray(entries) && entries.length > 0) {
      const sorted = [...entries].sort((a: any, b: any) => b.Points - a.Points);
      const lines = sorted.slice(0,10).map((e: any, i: number) =>
        `\`#${i+1}\` UserID: ${e.UserID} — **${fmt(e.Points)}** stars`
      ).join("\n");
      contribText = lines;
      const total = sorted.reduce((s: number, e: any) => s + (e.Points||0), 0);
      fields.push({name:`🗡️ ${battleType} — ${sorted.length} contributors (total: ${fmt(total)})`, value: lines||"None", inline:false});
    }
  }
  if (!fields.find((f: any) => f.name.startsWith("🗡️"))) {
    fields.push({name:"🗡️ Battle Contributions", value: contribText, inline:false});
  }

  return [embed(`⚔️ ${d.Name} — Battle Stats`, `**${d.Name}** in battle **${bn}**`, 0xFF6B35, fields)];
}

// ── Player search (the CW-Ranking equivalent) ─────────────────────────────────
async function cmdPlayerSearch(username: string): Promise<any[]> {
  // Step 1: Get Roblox user
  const robloxUser = await getRobloxUser(username);
  if (!robloxUser) return [embed("❌ Not Found", `No Roblox user \`${username}\`.`, 0xE74C3C)];

  const uid = robloxUser.id;
  const [avatar, groups, badges, game, clanList, followers, friends] = await Promise.all([
    rget(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${uid}&size=150x150&format=Png`),
    rget(`https://groups.roblox.com/v1/users/${uid}/groups/roles`),
    rget(`https://badges.roblox.com/v1/users/${uid}/badges?limit=100&sortOrder=Desc`),
    rget(`https://games.roblox.com/v1/games`, {universeIds: PS99_UNI}),
    rget(`${BIGGAMES}/clans`, {page:"1",pageSize:"200",sort:"Points",sortOrder:"desc"}),
    rget(`https://friends.roblox.com/v1/users/${uid}/followers/count`),
    rget(`https://friends.roblox.com/v1/users/${uid}/friends/count`),
  ]);

  const avatarUrl = avatar?.data?.[0]?.imageUrl;
  const grpList = groups?.data || [];
  const allBadges = badges?.data || [];
  const topClans = clanList?.data || [];
  const ps99Badges = allBadges.filter((b: any) => b.awardingUniverse?.id === 3317771874);
  const bigRole = grpList.find((gr: any) => gr.group?.id === 3959677);

  // Find their clan + contribution data
  let clanData: any = null, clanRank: number|null = null, membership: any = null;
  let myStars = 0, totalContribPlayers = 0;

  for (let i=0; i<Math.min(topClans.length,50); i++) {
    try {
      const detail = await rget(`${BIGGAMES}/clan/${topClans[i].Name}`);
      const found = (detail?.data?.Members||[]).find((m: any) => m.UserID === uid);
      if (found) {
        clanData = detail.data; clanRank = i+1; membership = {...found};
        // Get battle stars from contribution
        const contrib = detail.data.Contribution || {};
        for (const [k, entries] of Object.entries(contrib)) {
          if (Array.isArray(entries)) {
            const me = (entries as any[]).find((e: any) => e.UserID === uid);
            if (me) { myStars += me.Points; (membership as any)[`contrib_${k}`] = me.Points; }
            totalContribPlayers += (entries as any[]).length;
          }
        }
        break;
      }
    } catch {}
  }

  const battle = await rget(`${BIGGAMES}/activeClanBattle`);
  const bn = battle?.data?.configName || "Unknown";
  const perm = membership?.PermissionLevel || 0;
  const roleLabel = perm>=90?"👑 Owner":perm>=50?"⭐ Officer":perm>=10?"🔵 Member":"⚪ Guest";

  // Build global rank from scanning all clans' contributions
  // NOTE: We can only rank within clans we've scanned. CW-Ranking has the full /leaderboard API.
  // We scan top 200 clans' contributions to approximate rank.
  const allStarPlayers: {uid: number, stars: number, clan: string}[] = [];
  if (clanData && myStars > 0) {
    // We have our stars — compare against others in contrib data we have
    // For now show what we have
  }

  const fields: any[] = [
    {name:"👤 Username", value:`[${robloxUser.name}](https://www.roblox.com/users/${uid}/profile)`, inline:true},
    {name:"🏷️ Display Name", value: robloxUser.displayName, inline:true},
    {name:"🆔 Roblox ID", value: String(uid), inline:true},
    {name:"👥 Friends", value:(friends?.count||0).toLocaleString(), inline:true},
    {name:"📣 Followers", value:(followers?.count||0).toLocaleString(), inline:true},
    {name:"🐾 BIG Games Role", value: bigRole?.role?.name||"Fan", inline:true},
  ];

  if (clanData) {
    const pubData = topClans.find((c: any) => c.Name === clanData.Name) || {};
    fields.push(
      {name:"🏰 Clan", value:`**${clanData.Name}** (Lvl ${clanData.GuildLevel||"?"})`, inline:true},
      {name:"📊 Clan Rank", value:clanRank?`**#${clanRank}** globally`:"Unranked", inline:true},
      {name:"🏅 Clan Role", value:roleLabel, inline:true},
      {name:"⚔️ Clan Points", value:fmt(pubData.Points||0), inline:true},
      {name:"💎 Clan Diamonds", value:fmt(pubData.DepositedDiamonds||0), inline:true},
      {name:"🥇🥈🥉 Medals", value:`${clanData.GoldMedals||0}G / ${clanData.SilverMedals||0}S / ${clanData.BronzeMedals||0}B`, inline:true},
    );
  } else {
    fields.push({name:"🏰 Clan", value:"Not in top 200 ranked clans", inline:false});
  }

  // Battle stars
  if (myStars > 0) {
    fields.push({name:`🌟 Battle Stars (${bn})`, value:`**${fmt(myStars)}** stars`, inline:true});
  } else {
    fields.push({name:`🌟 Battle Stars (${bn})`, value:"No stars this battle yet\n*(or battle just started)*", inline:true});
  }

  // Battle note
  fields.push({name:"⚠️ Global Rank", value:"Full global rank needs BIG Games API key (we've applied!). Your clan rank + stars shown above.", inline:false});
  if (ps99Badges.length) fields.push({name:`🏆 PS99 Badges (${ps99Badges.length})`, value:ps99Badges.map((b: any)=>b.name).join("\n")||"None", inline:false});

  return [embed(`🔍 Player — ${robloxUser.name}`, `Active battle: **${bn}**`, 0x3498DB, fields, avatarUrl)];
}

async function cmdPlayerCompare(u1: string, u2: string): Promise<any[]> {
  const [r1, r2] = await Promise.all([cmdPlayerSearch(u1), cmdPlayerSearch(u2)]);
  return [...r1, ...r2].slice(0,4);
}

// ── User rank command (for linked users) ─────────────────────────────────────
async function cmdUserRank(discordUserId: string, base44: any): Promise<any[]> {
  const linked = await base44.asServiceRole.entities.LinkedUser.filter({discord_user_id: discordUserId});
  if (!linked?.length) return [embed("👤 No Account Linked","Use `/user link <username>` first.",0x95A5A6)];
  return cmdPlayerSearch(linked[0].roblox_username);
}

// ── Live hatch detection ──────────────────────────────────────────────────────
async function cmdHatchLive(): Promise<any[]> {
  const snap1 = await rget(`${BIGGAMES}/exists`);
  await new Promise(r => setTimeout(r, 2000));
  const snap2 = await rget(`${BIGGAMES}/exists`);
  if (!snap1?.data||!snap2?.data) return [embed("❌ API unavailable","",0xE74C3C)];

  const makeMap = (data: any[]) => {
    const m: Record<string,{val:number,id:string,pt?:number,sh?:boolean}> = {};
    for (const e of data) {
      if (typeof e.configData!=="object") continue;
      const id = e.configData?.id||"";
      // Only NAMED huge/titanic/gargantuan (exclude generic categories)
      if (!id||["Huge","Titanic","Gargantuan"].includes(id)) continue;
      if (!["Huge","Titanic","Gargantuan"].some(kw=>id.includes(kw))) continue;
      const key = `${id}|${e.configData?.pt||0}|${e.configData?.sh||false}`;
      m[key] = {val:e.value||0, id, pt:e.configData?.pt, sh:e.configData?.sh};
    }
    return m;
  };

  const m1 = makeMap(snap1.data), m2 = makeMap(snap2.data);
  const hatches: {name:string,count:number,total:number,pt?:number,sh?:boolean}[] = [];
  for (const [k, v] of Object.entries(m2)) {
    const old = m1[k]?.val||0;
    if (v.val > old) hatches.push({name:v.id, count:v.val-old, total:v.val, pt:v.pt, sh:v.sh});
  }
  hatches.sort((a,b) => b.count-a.count);

  if (!hatches.length) return [embed("🥚 Live Hatch Feed",
    "No new hatches in this window.\n*(API caches 60s — try again in a minute)*",
    0x95A5A6, [{name:"How it works",value:"We diff the `exists` API — any supply count increase = real in-game hatch just occurred.",inline:false}])];

  const lines = hatches.slice(0,20).map(h =>
    `${petEmoji(h.name)} **${h.name}**${variantStr(h.pt,h.sh)} — **+${h.count}** hatch${h.count>1?"es":""} *(${fmt(h.total)} total exist)*`
  );
  return [embed(`🔴 LIVE Hatches — ${hatches.length} detected`, lines.join("\n"), 0xFF0000, [
    {name:"⏱️ Window",value:"~2 second diff",inline:true},
    {name:"📊 Variants tracked",value:`${Object.keys(m1).length.toLocaleString()}`,inline:true},
    {name:"💡 Tip",value:"Run again in 60s for fresh data — API caches once per minute",inline:false}
  ])];
}

// ── Hatch broadcast (called by hourly scan automation) ───────────────────────
async function detectAndBroadcastHatches(prevExists: any, currExists: any): Promise<{hatches: any[]}> {
  if (!prevExists||!currExists) return {hatches: []};
  const hatches: any[] = [];
  const currMap: Record<string,number> = {};
  for (const e of currExists) {
    if (typeof e.configData!=="object") continue;
    const id=e.configData?.id||"";
    if (!id||["Huge","Titanic","Gargantuan"].includes(id)) continue;
    if (!["Huge","Titanic","Gargantuan"].some(kw=>id.includes(kw))) continue;
    const key = `${id}|${e.configData?.pt||0}|${e.configData?.sh||false}`;
    currMap[key] = e.value||0;
  }
  for (const e of prevExists) {
    if (typeof e.configData!=="object") continue;
    const id=e.configData?.id||"";
    if (!id||["Huge","Titanic","Gargantuan"].includes(id)) continue;
    if (!["Huge","Titanic","Gargantuan"].some(kw=>id.includes(kw))) continue;
    const key = `${id}|${e.configData?.pt||0}|${e.configData?.sh||false}`;
    const prev = e.value||0;
    const curr = currMap[key]||0;
    if (curr > prev) {
      hatches.push({id, pt:e.configData?.pt, sh:e.configData?.sh, count:curr-prev, total:curr});
    }
  }
  return {hatches};
}

// ── Egg chances ───────────────────────────────────────────────────────────────
async function cmdEggChances(eggQuery: string): Promise<any[]> {
  const eggs = (await rget(`${BIGGAMES}/collection/Eggs`))?.data||[];
  const q = eggQuery.toLowerCase();
  const found = eggs.find((e: any) => {
    const name=(e.configData?.name||e.configName||"").toLowerCase();
    return name===q||name.includes(q);
  });
  if (!found) return [embed("❌ Not Found",`No egg matching \`${eggQuery}\`. Try \`/eggs search\`.`,0xE74C3C)];
  const cd=found.configData||{}, name=cd.name||found.configName, pets: any[]=cd.pets||[];
  const lines: string[] = [];
  for (const p of pets) {
    if (!Array.isArray(p)||p.length<2) continue;
    const pname=String(p[0]), pct=Number(p[1]);
    if (!pct) continue;
    const oneIn=Math.round(100/pct);
    const em = pname.includes("Titanic")||pname.includes("Gargantuan")?"🐉":pname.includes("Huge")?"🐾":"◾";
    const rarity = p[2]?` *(${p[2]})*`:"";
    lines.push(`${em} **${pname}**${rarity}\n  └ \`${pct}%\` chance — **1 in ${oneIn.toLocaleString()}** hatches`);
  }
  const mods: string[] = [];
  if (cd.goldChance>0) mods.push(`⭐ Golden: ${pctToOdds(cd.goldChance)}`);
  if (cd.rainbowChance>0) mods.push(`🌈 Rainbow: ${pctToOdds(cd.rainbowChance)}`);
  if (cd.shinyChance>0) mods.push(`✨ Shiny: 1 in ${Math.round(100/cd.shinyChance).toLocaleString()}`);
  const iconId = cd.icon?.replace("rbxassetid://","");
  const fields: any[] = [];
  if (mods.length) fields.push({name:"✨ Modifiers (apply ON TOP of pet chance)",value:mods.join("\n"),inline:false});
  return [embed(`🥚 ${name}`, lines.join("\n")||"No data.", 0xF1C40F, fields,
    iconId?`https://ps99.biggamesapi.io/image/${iconId}`:undefined)];
}
async function cmdEggSearch(query: string): Promise<any[]> {
  const eggs=(await rget(`${BIGGAMES}/collection/Eggs`))?.data||[];
  const q=query.toLowerCase();
  const matches=eggs.filter((e: any)=>(e.configData?.name||e.configName||"").toLowerCase().includes(q)).slice(0,20);
  if (!matches.length) return [embed("❌ No Results",`No eggs matching \`${query}\`.`,0xE74C3C)];
  const lines=matches.map((e: any)=>{
    const cd=e.configData||{},pets: any[]=cd.pets||[];
    const huges=pets.filter((p: any)=>Array.isArray(p)&&(String(p[0]).includes("Huge")||String(p[0]).includes("Titanic")||String(p[0]).includes("Gargantuan")));
    const note=huges.length?` — ${huges.length} huge/titanic pet${huges.length>1?"s":""}`:""
    return `• **${cd.name||e.configName}**${note}`;
  });
  return [embed(`🔍 Eggs matching "${query}" — ${matches.length}`,lines.join("\n"),0x3498DB)];
}
async function cmdEggExclusive(): Promise<any[]> {
  const eggs=(await rget(`${BIGGAMES}/collection/Eggs`))?.data||[];
  const excl=eggs.filter((e: any)=>e.configName?.startsWith("Exclusive")||e.configData?.rarity?._id==="Exclusive");
  const lines: string[] = [];
  for (const egg of excl.slice(0,12)) {
    const cd=egg.configData||{},name=cd.name||egg.configName,pets: any[]=cd.pets||[];
    const specials=pets.filter((p: any)=>Array.isArray(p)&&p.length>=2&&Number(p[1])>0&&
      (String(p[0]).includes("Huge")||String(p[0]).includes("Titanic")||String(p[0]).includes("Gargantuan")));
    if (!specials.length) continue;
    const str=specials.map((p: any)=>{
      const em=String(p[0]).includes("Titanic")||String(p[0]).includes("Gargantuan")?"🐉":"🐾";
      return `${em} ${p[0]}: **1 in ${Math.round(100/Number(p[1])).toLocaleString()}**`;
    }).join("\n");
    lines.push(`**${name}**\n${str}`);
  }
  return [embed(`✨ Exclusive Eggs — ${excl.length} total`,lines.join("\n\n")||"None found.",0x9B59B6)];
}

// ── User helpers ──────────────────────────────────────────────────────────────
async function linkUser(duid: string, duname: string, rname: string, base44: any): Promise<any[]> {
  const ru = await getRobloxUser(rname);
  if (!ru) return [embed("❌ Not Found",`\`${rname}\` not found on Roblox.`,0xE74C3C)];
  const rec={discord_user_id:duid,discord_username:duname,roblox_username:ru.name,roblox_id:String(ru.id),roblox_display_name:ru.displayName,linked_at:new Date().toISOString()};
  const ex=await base44.asServiceRole.entities.LinkedUser.filter({discord_user_id:duid});
  if (ex?.length>0) await base44.asServiceRole.entities.LinkedUser.update(ex[0].id,rec);
  else await base44.asServiceRole.entities.LinkedUser.create(rec);
  const av=await rget(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${ru.id}&size=150x150&format=Png`);
  return [embed("✅ Account Linked!",`**${duname}** → **${ru.name}**\nYou can now use \`/user stats\`, \`/user rank\`, \`/user badges\` — all personalised to you!`,0x2ECC71,[
    {name:"Roblox Username",value:ru.name,inline:true},{name:"Display Name",value:ru.displayName,inline:true},{name:"Roblox ID",value:String(ru.id),inline:true},
    {name:"Profile",value:`https://www.roblox.com/users/${ru.id}/profile`,inline:false},
  ],av?.data?.[0]?.imageUrl)];
}
async function getUserStats(duid: string, base44: any): Promise<any[]> {
  const linked=await base44.asServiceRole.entities.LinkedUser.filter({discord_user_id:duid});
  if (!linked?.length) return [embed("👤 No Account","Use `/user link <username>` first.",0x95A5A6)];
  return cmdPlayerSearch(linked[0].roblox_username);
}
async function getUserBadges(duid: string, base44: any): Promise<any[]> {
  const linked=await base44.asServiceRole.entities.LinkedUser.filter({discord_user_id:duid});
  if (!linked?.length) return [embed("👤 No Account","Use `/user link <username>` first.",0x95A5A6)];
  const u=linked[0],rid=u.roblox_id;
  const [badges,ps99All]=await Promise.all([
    rget(`https://badges.roblox.com/v1/users/${rid}/badges?limit=100&sortOrder=Desc`),
    rget(`https://badges.roblox.com/v1/universes/${PS99_UNI}/badges?limit=100`)
  ]);
  const all=badges?.data||[],allPS99=ps99All?.data||[],myPS99=all.filter((b: any)=>b.awardingUniverse?.id===3317771874),notEarned=allPS99.filter((b: any)=>!myPS99.find((m: any)=>m.id===b.id));
  return [embed(`🏆 PS99 Badges — ${u.roblox_username}`,"",0xF1C40F,[
    {name:`✅ Earned (${myPS99.length}/${allPS99.length})`,value:myPS99.map((b: any)=>`✅ **${b.name}**`).join("\n")||"None",inline:false},
    {name:"❌ Not Yet Earned",value:notEarned.map((b: any)=>`❌ **${b.name}**`).join("\n")||"All earned! 🎉",inline:false},
    {name:"Total Roblox Badges",value:String(all.length),inline:true},
  ])];
}

// ── Leaks ─────────────────────────────────────────────────────────────────────
async function cmdLeaksRecent(hours: number, base44: any): Promise<any[]> {
  const since=new Date(Date.now()-hours*3600000).toISOString();
  const all=await base44.asServiceRole.entities.PS99Finding.filter({});
  const items=all.filter((f: any)=>f.run_at>since&&f.change_type!=="price_move").sort((a: any,b: any)=>(b.run_at||"").localeCompare(a.run_at||""));
  if (!items.length) return [embed(`🔍 No New Leaks (${hours}h)`,"Nothing detected. Scanner runs hourly.\n*Price moves are tracked but not shown as leaks*",0x95A5A6)];
  const ic: any={new:"🆕",changed:"✏️",game_update:"🚨",dev_game_update:"👾",fflag:"🚩"};
  const lines=items.slice(0,20).map((f: any)=>`${ic[f.change_type]||"•"} **${f.item_name}** \`[${f.category}]\` — <t:${Math.floor(new Date(f.run_at).getTime()/1000)}:R>`);
  return [embed(`🔍 Leaks — Last ${hours}h (${items.length})`,lines.join("\n"),0x9B59B6)];
}

// ── Main dispatcher ────────────────────────────────────────────────────────────
async function handle(key: string, opts: Record<string,any>, base44: any, ix?: any): Promise<any[]> {
  const snapR=await base44.asServiceRole.entities.PS99Snapshot.filter({snapshot_key:"main"});
  const snap=snapR?.[0]?.data||{};
  const uid=ix?.member?.user?.id||ix?.user?.id||"unknown";
  const uname=ix?.member?.user?.username||ix?.user?.username||"unknown";

  switch (key) {
    // ── Bot ──────────────────────────────────────────────────────────────────
    case "bot status": return [embed("🤖 Leaksbot Status","",0x2ECC71,[
      {name:"Status",value:"🟢 24/7 on Base44",inline:true},
      {name:"Pets tracked",value:String(snap.collections?.Pets?.length||0),inline:true},
      {name:"RAP entries",value:String(snap.rap?.length||0),inline:true},
      {name:"Last scan",value:(snap.updated_at||"Never").slice(0,16),inline:true},
      {name:"Live players",value:String(snap.universe?.playing||0),inline:true},
      {name:"Channels",value:String(DISCORD_HOOKS.length),inline:true},
    ])];
    case "bot logs": {
      const all=await base44.asServiceRole.entities.PS99Finding.filter({});
      all.sort((a: any,b: any)=>(b.run_at||"").localeCompare(a.run_at||""));
      const since48=new Date(Date.now()-48*3600000).toISOString(), recent=all.filter((f: any)=>f.run_at>since48);
      return [embed("📋 Recent Logs (48h)",recent.slice(0,10).map((f: any)=>`• \`${f.item_name}\` [${f.category}] ${f.change_type} — <t:${Math.floor(new Date(f.run_at).getTime()/1000)}:R>`).join("\n")||"Nothing in 48h.",0x95A5A6,[
        {name:"All-time findings",value:String(all.length),inline:true},{name:"Last 48h",value:String(recent.length),inline:true}
      ])];
    }

    // ── Leaks ────────────────────────────────────────────────────────────────
    case "leaks recent": return await cmdLeaksRecent(Number(opts.hours||48), base44);
    case "leaks pets": {
      const since=new Date(Date.now()-48*3600000).toISOString(), all=await base44.asServiceRole.entities.PS99Finding.filter({});
      const pets=all.filter((f: any)=>f.run_at>since&&f.category==="Pets"&&f.change_type==="new");
      if (!pets.length) return [embed("🐾 No New Pets (48h)","Nothing detected.",0x95A5A6)];
      return [embed(`🐾 New Pets — 48h (${pets.length})`,pets.slice(0,15).map((f: any)=>`🆕 **${f.item_name}** — <t:${Math.floor(new Date(f.run_at).getTime()/1000)}:R>${f.thumbnail_url?" 🖼️":""}`).join("\n"),0x9B59B6)];
    }
    case "leaks eggs": {
      const since=new Date(Date.now()-48*3600000).toISOString(), all=await base44.asServiceRole.entities.PS99Finding.filter({});
      const eggs=all.filter((f: any)=>f.run_at>since&&f.category==="Eggs"&&f.change_type==="new");
      if (!eggs.length) return [embed("🥚 No New Eggs (48h)","Nothing detected.",0x95A5A6)];
      return [embed(`🥚 New Eggs — 48h (${eggs.length})`,eggs.slice(0,15).map((f: any)=>`🆕 **${f.item_name}** — <t:${Math.floor(new Date(f.run_at).getTime()/1000)}:R>`).join("\n"),0xF1C40F)];
    }
    case "leaks huges": {
      const rap=(snap.rap||[]) as any[], huges=rap.filter((e: any)=>(e.configData?.id||"").includes("Huge")&&e.value>0).sort((a: any,b: any)=>b.value-a.value).slice(0,12);
      if (!huges.length) return [embed("🐾 No Huges","No huge pets with RAP data.",0x95A5A6)];
      return [embed(`🐾 Huges by RAP (${huges.length})`,huges.map((h: any)=>`• **${h.configData?.id||"?"}** — ${fmt(h.value)} RAP`).join("\n"),0x9B59B6)];
    }
    case "leaks tiers": {
      const rap=(snap.rap||[]) as any[];
      return [embed("📊 RAP Tier Breakdown","",0xF1C40F,[
        {name:"🔱 Gargantuan tier",value:String(rap.filter((e: any)=>(e.configData?.id||"").includes("Gargantuan")).length),inline:true},
        {name:"🐉 Titanic tier",value:String(rap.filter((e: any)=>(e.configData?.id||"").includes("Titanic")&&!(e.configData?.id||"").includes("Gargantuan")).length),inline:true},
        {name:"🌟 ≥1T RAP",value:String(rap.filter((e: any)=>e.value>=1e12).length),inline:true},
        {name:"💜 ≥100M",value:String(rap.filter((e: any)=>e.value>=1e8&&e.value<1e12).length),inline:true},
        {name:"🔵 ≥1M",value:String(rap.filter((e: any)=>e.value>=1e6&&e.value<1e8).length),inline:true},
        {name:"📦 Total valued",value:String(rap.filter((e: any)=>e.value>0).length),inline:true},
      ])];
    }
    case "leaks types": return [embed("📋 Leak Types","",0x9B59B6,[
      {name:"🆕 new",value:"Added to game config",inline:true},{name:"✏️ changed",value:"Config changed",inline:true},
      {name:"🚨 game_update",value:"Universe pushed update",inline:true},{name:"👾 dev_game_update",value:"Staging updated",inline:true},
      {name:"🚩 fflag",value:"Roblox FFlag changed",inline:true},{name:"🔮 enchant",value:"New enchant data",inline:true},{name:"🧪 potion",value:"New potion data",inline:true},
    ])];
    case "leaks weekly": {
      const s7=new Date(Date.now()-7*86400000).toISOString(), allF=await base44.asServiceRole.entities.PS99Finding.filter({});
      const w=allF.filter((f: any)=>f.run_at>s7&&f.change_type!=="price_move"), bt: Record<string,number>={};
      w.forEach((f: any)=>{bt[f.change_type]=(bt[f.change_type]||0)+1;});
      return [embed(`📅 Weekly — ${w.length}`,"7 days",0x3498DB,Object.entries(bt).length?Object.entries(bt).map(([k,v])=>({name:k,value:String(v),inline:true})):[{name:"Week",value:"No findings yet",inline:false}])];
    }
    case "leaks images": {
      const all=await base44.asServiceRole.entities.PS99Finding.filter({}), since48=new Date(Date.now()-48*3600000).toISOString();
      const wt=all.filter((f: any)=>f.thumbnail_url&&f.run_at>since48).slice(0,4);
      return wt.length?wt.map((f: any)=>embed(`🖼️ ${f.item_name}`,`[${f.category}] ${f.change_type}`,0x3498DB,undefined,f.thumbnail_url)):[embed("🖼️ No Image Leaks (48h)","None in last 48h.",0x95A5A6)];
    }
    case "leaks developers": {
      const gg=(snap.group_games||[]) as any[], dg=gg.filter((g: any)=>/dev|staging|test|\[/i.test(g.name||""));
      return [embed(`👾 Dev/Staging Games — ${dg.length}`,dg.slice(0,8).map((g: any)=>`• \`${g.name}\` — \`${(g.updated||"?").slice(0,10)}\``).join("\n")||"None.",0xFF6B35)];
    }

    case "leaks enchants": {
      const since=new Date(Date.now()-48*3600000).toISOString(), all=await base44.asServiceRole.entities.PS99Finding.filter({});
      const enc=all.filter((f: any)=>f.run_at>since&&f.category==="Enchants"&&f.change_type==="new");
      if (!enc.length) return [embed("🔮 No New Enchants (48h)","Nothing detected.",0x95A5A6)];
      return [embed(`🔮 New Enchants — 48h (${enc.length})`,enc.slice(0,15).map((f: any)=>`🆕 **${f.item_name}** — <t:${Math.floor(new Date(f.run_at).getTime()/1000)}:R>`).join("\n"),0x9B59B6)];
    }
    case "leaks potions": {
      const since=new Date(Date.now()-48*3600000).toISOString(), all=await base44.asServiceRole.entities.PS99Finding.filter({});
      const pot=all.filter((f: any)=>f.run_at>since&&f.category==="Potions"&&f.change_type==="new");
      if (!pot.length) return [embed("🧪 No New Potions (48h)","Nothing detected.",0x95A5A6)];
      return [embed(`🧪 New Potions — 48h (${pot.length})`,pot.slice(0,15).map((f: any)=>`🆕 **${f.item_name}** — <t:${Math.floor(new Date(f.run_at).getTime()/1000)}:R>`).join("\n"),0xE74C3C)];
    }
    case "leaks fflags": {
      const since=new Date(Date.now()-48*3600000).toISOString(), all=await base44.asServiceRole.entities.PS99Finding.filter({});
      const ff=all.filter((f: any)=>f.run_at>since&&f.category==="FFlags");
      if (!ff.length) return [embed("🚩 No FFlag Changes (48h)","No PS99-relevant FFlag changes detected.",0x95A5A6)];
      return [embed(`🚩 FFlag Changes — 48h (${ff.length})`,ff.slice(0,15).map((f: any)=>`• \`${f.item_name}\` — <t:${Math.floor(new Date(f.run_at).getTime()/1000)}:R>`).join("\n"),0x3498DB)];
    }
    // ── Eggs ─────────────────────────────────────────────────────────────────
    case "eggs chances": return await cmdEggChances(opts.egg||"");
    case "eggs search": return await cmdEggSearch(opts.query||"");
    case "eggs exclusive": return await cmdEggExclusive();
    case "eggs current": {
      const since48=new Date(Date.now()-48*3600000).toISOString(), all=await base44.asServiceRole.entities.PS99Finding.filter({});
      const ne=all.filter((f: any)=>f.run_at>since48&&f.category==="Eggs"&&f.change_type==="new");
      if (!ne.length) return [embed("🥚 No New Eggs (48h)","None detected.",0x95A5A6)];
      return [embed(`🥚 New Eggs — 48h`,ne.map((f: any)=>`🆕 **${f.item_name}** — <t:${Math.floor(new Date(f.run_at).getTime()/1000)}:R>`).join("\n"),0xF1C40F)];
    }

    // ── Hatches ───────────────────────────────────────────────────────────────
    case "hatches live": return await cmdHatchLive();
    case "hatches rarest": {
      const exists=(await rget(`${BIGGAMES}/exists`))?.data||[];
      const specials=exists.filter((e: any)=>typeof e.configData==="object"&&["Titanic","Gargantuan","Huge"].some(kw=>(e.configData?.id||"").includes(kw))&&!["Huge","Titanic","Gargantuan"].includes(e.configData?.id||"")&&(e.value||0)<=50&&(e.value||0)>0).sort((a: any,b: any)=>(a.value||0)-(b.value||0)).slice(0,20);
      return [embed("💎 Ultra-Rarest Pets (≤50 exist)",specials.map((e: any)=>`${petEmoji(e.configData.id)} **${e.configData.id}**${variantStr(e.configData?.pt,e.configData?.sh)} — **${e.value}** exist`).join("\n")||"None.",0x9B59B6)];
    }
    case "hatches counts": {
      const exists=(await rget(`${BIGGAMES}/exists`))?.data||[];
      const titanics=exists.filter((e: any)=>typeof e.configData==="object"&&["Titanic","Gargantuan"].some(kw=>(e.configData?.id||"").includes(kw))&&!["Titanic","Gargantuan"].includes(e.configData?.id||"")&&!e.configData?.pt&&!e.configData?.sh).sort((a: any,b: any)=>(b.value||0)-(a.value||0)).slice(0,12);
      const huges=exists.filter((e: any)=>typeof e.configData==="object"&&(e.configData?.id||"").includes("Huge")&&!(e.configData?.id||"").includes("Titanic")&&!(e.configData?.id||"").includes("Gargantuan")&&!["Huge"].includes(e.configData?.id||"")&&!e.configData?.pt&&!e.configData?.sh).sort((a: any,b: any)=>(b.value||0)-(a.value||0)).slice(0,10);
      return [embed("🐉 Titanic/Gargantuan Supply",titanics.map((e: any)=>`🐉 **${e.configData.id}**: ${fmt(e.value)} exist`).join("\n")||"No data",0xFF6B35),embed("🐾 Huge Supply (Top 10)",huges.map((e: any)=>`🐾 **${e.configData.id}**: ${fmt(e.value)} exist`).join("\n")||"No data",0x9B59B6)];
    }
    case "hatches watch": return [embed("👁️ Hatch Watch",`Hatch broadcasts go to all ${DISCORD_HOOKS.length} configured channels automatically during each hourly scan.\n\nNew hatches (supply count increases) are detected every hour and posted as rich embeds with pet name, count, thumbnail and supply info.`,0x9B59B6)];

    // ── Stats ─────────────────────────────────────────────────────────────────
    case "stats leaderboard": {
      const [byPts,byDia,battle,total,game,group]=await Promise.all([
        rget(`${BIGGAMES}/clans`,{page:"1",pageSize:"10",sort:"Points",sortOrder:"desc"}),
        rget(`${BIGGAMES}/clans`,{page:"1",pageSize:"8",sort:"DepositedDiamonds",sortOrder:"desc"}),
        rget(`${BIGGAMES}/activeClanBattle`),rget(`${BIGGAMES}/clansTotal`),
        rget(`https://games.roblox.com/v1/games`,{universeIds:PS99_UNI}),
        rget(`https://groups.roblox.com/v1/groups/${BIG_GROUP}`)]);
      const g=game?.data?.[0]||{},grp=group||{},bn=battle?.data?.configName||"?";
      const rw=(battle?.data?.configData?.PlacementRewards||[]).slice(0,4).map((r: any)=>`\`#${r.Best}–#${r.Worst}\` → **${r.Item?._data?.id||"?"}**`).join("\n")||"No data";
      const ptLines=(byPts?.data||[]).map((c: any,i: number)=>`\`#${i+1}\` **${c.Name}** ${c.CountryCode||""} — **${fmt(c.Points)}** pts | 💎${fmt(c.DepositedDiamonds||0)} | 👥${c.Members}`).join("\n");
      const diaLines=(byDia?.data||[]).map((c: any,i: number)=>`\`#${i+1}\` **${c.Name}** — 💎**${fmt(c.DepositedDiamonds||0)}** | ${fmt(c.Points)} pts`).join("\n");
      return [
        embed("🏆 Top 10 Clans by Points",ptLines||"No data",0xF1C40F,[{name:"⚔️ Battle",value:bn,inline:true},{name:"🌍 Total Clans",value:(total?.data||0).toLocaleString(),inline:true},{name:"🎮 Live",value:fmt(g.playing||0),inline:true}]),
        embed("💎 Top 8 by Diamonds",diaLines||"No data",0x3498DB,[{name:"📊 Visits",value:fmt(g.visits||0),inline:true},{name:"⭐ Favs",value:fmt(g.favoritedCount||0),inline:true},{name:"👥 BIG Games Group",value:fmt(grp.memberCount||0)+" members",inline:true}]),
        embed(`⚔️ Battle Rewards — ${bn}`,rw,0xFF6B35),
      ];
    }
    case "stats event": {
      const [battle,events,clans]=await Promise.all([rget(`${BIGGAMES}/activeClanBattle`),rget(`${BIGGAMES}/collection/RandomEvents`),rget(`${BIGGAMES}/clans`,{page:"1",pageSize:"5",sort:"Points",sortOrder:"desc"})]);
      const bn=battle?.data?.configName||"?",rw=(battle?.data?.configData?.PlacementRewards||[]).slice(0,5).map((r: any)=>`\`#${r.Best}–#${r.Worst}\` → **${r.Item?._data?.id||"?"}**`).join("\n")||"No data",topClans=(clans?.data||[]).map((c: any,i: number)=>`\`#${i+1}\` **${c.Name}** — **${fmt(c.Points)}** pts`).join("\n"),evtList=(events?.data||[]).map((e: any)=>`• \`${e.configName}\``).join("\n")||"None";
      return [embed(`⚔️ Active Battle — ${bn}`,rw,0xFF6B35,[{name:"🏆 Top 5 Clans",value:topClans,inline:false}]),embed("🎉 Active Random Events",evtList,0x9B59B6)];
    }
    case "stats rap": {
      const rap=await rget(`${BIGGAMES}/rap`);
      if (!rap?.data) return [embed("❌ RAP unavailable","",0xE74C3C)];
      const sorted=(rap.data as any[]).filter((e: any)=>e.value>0).sort((a: any,b: any)=>b.value-a.value).slice(0,15);
      return [embed(`💰 Top ${sorted.length} by RAP`,`${(rap.data as any[]).filter((e: any)=>e.value>0).length.toLocaleString()} total valued items`,0xF39C12,sorted.map((e: any,i: number)=>{const vs=variantStr(e.configData?.pt,e.configData?.sh);return{name:`#${i+1} ${e.configData?.id||"?"}${vs?" "+vs:""}`,value:`**${fmt(e.value)}** RAP`,inline:true};}))];
    }
    case "stats game": {
      const [game,group,servers]=await Promise.all([rget(`https://games.roblox.com/v1/games`,{universeIds:PS99_UNI}),rget(`https://groups.roblox.com/v1/groups/${BIG_GROUP}`),rget(`https://games.roblox.com/v1/games/${PS99_PLACE}/servers/Public?sortOrder=Desc&limit=5`)]);
      const g=game?.data?.[0]||{},grp=group||{},svrs=servers?.data||[];
      return [embed("📊 PS99 Live Stats","",0x2ECC71,[{name:"🎮 Live Players",value:fmt(g.playing||0),inline:true},{name:"🔢 Total Visits",value:fmt(g.visits||0),inline:true},{name:"⭐ Favourites",value:fmt(g.favoritedCount||0),inline:true},{name:"📅 Last Update",value:(g.updated||"?").slice(0,19).replace("T"," "),inline:true},{name:"👥 BIG Games",value:fmt(grp.memberCount||0)+" members",inline:true},{name:"🖥️ Live Servers",value:svrs.map((s: any,i: number)=>`#${i+1}: ${s.playing}/${s.maxPlayers} | fps:${Math.round(s.fps||0)}`).join("\n")||"No data",inline:false}])];
    }
    case "stats servers": {
      const [game,servers]=await Promise.all([rget(`https://games.roblox.com/v1/games`,{universeIds:PS99_UNI}),rget(`https://games.roblox.com/v1/games/${PS99_PLACE}/servers/Public?sortOrder=Desc&limit=10`)]);
      const g=game?.data?.[0]||{},svrs=servers?.data||[];
      return [embed("🖥️ Live PS99 Servers",svrs.map((s: any,i: number)=>`\`#${i+1}\` **${s.playing}/${s.maxPlayers}** players | fps:${Math.round(s.fps||0)} | ping:${Math.round(s.ping||0)}ms`).join("\n")||"None",0x2ECC71,[{name:"🎮 Total Live",value:fmt(g.playing||0),inline:true},{name:"Servers shown",value:String(svrs.length),inline:true}])];
    }
    case "stats supply": {
      const exists=(await rget(`${BIGGAMES}/exists`))?.data||[], q=(opts.pet||"").toLowerCase();
      const matches=exists.filter((e: any)=>typeof e.configData==="object"&&(e.configData?.id||"").toLowerCase().includes(q));
      if (!matches.length) return [embed("❌ Not Found",`No pets matching \`${opts.pet}\`.`,0xE74C3C)];
      return [embed(`📊 Supply — "${opts.pet}"`,matches.slice(0,15).map((e: any)=>`• **${e.configData.id||"?"}**${variantStr(e.configData?.pt,e.configData?.sh)}: **${(e.value||0).toLocaleString()}** exist`).join("\n"),0x3498DB)];
    }
    case "stats pet": return await cmdStatPet(opts.name||"");

    // ── Clan ──────────────────────────────────────────────────────────────────
    case "clan info": return await cmdClanInfo(opts.name||"");
    case "clan battle": return await cmdClanBattle(opts.name||"");
    case "clan top": {
      const [byPts,battle]=await Promise.all([rget(`${BIGGAMES}/clans`,{page:"1",pageSize:"10",sort:"Points",sortOrder:"desc"}),rget(`${BIGGAMES}/activeClanBattle`)]);
      const ptLines=(byPts?.data||[]).map((c: any,i: number)=>`\`#${i+1}\` **${c.Name}** ${c.CountryCode||""} — **${fmt(c.Points)}** pts | 💎${fmt(c.DepositedDiamonds||0)}`).join("\n");
      return [embed(`🏆 Top 10 Clans — ${battle?.data?.configName||"?"}`,ptLines||"No data",0xF1C40F)];
    }
    case "clan search": {
      const list=await rget(`${BIGGAMES}/clansList`), q=(opts.query||"").toLowerCase();
      const matches=(list?.data||[]).filter((n: string)=>n.toLowerCase().includes(q)).slice(0,15);
      if (!matches.length) return [embed("❌ No Clans Found",`No clans matching \`${opts.query}\`.`,0xE74C3C)];
      return [embed(`🔍 Clans matching "${opts.query}" — ${matches.length}`,matches.map((n: string)=>`• \`${n}\``).join("\n"),0x3498DB)];
    }

    // ── Player ────────────────────────────────────────────────────────────────
    case "player search": return await cmdPlayerSearch(opts.username||"");
    case "player compare": return await cmdPlayerCompare(opts.player1||"", opts.player2||"");

    // ── Scan ──────────────────────────────────────────────────────────────────
    case "scan now":
      fetch("https://virelai-b1ba3ed0.base44.app/functions/ps99HourlyScan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({manual:true})}).catch(()=>{});
      return [embed("⚡ Scan Triggered","Full intelligence scan started — results broadcast to all channels when complete.",0xF39C12,[{name:"Scans",value:"Collections • RAP • Exists • Universe version • Dev games • FFlags",inline:false}])];

    // ── Search ────────────────────────────────────────────────────────────────
    case "search": {
      const kw=(opts.query||"").toLowerCase(), res: string[]=[];
      for (const [col,items] of Object.entries(snap.collections||{}))
        for (const item of (items as any[])||[])
          if (item?.configName?.toLowerCase().includes(kw)) res.push(`[\`${col}\`] **${item.configName}**`);
      for (const e of (snap.rap||[]) as any[])
        if ((e?.configData?.id||"").toLowerCase().includes(kw))
          res.push(`[\`RAP\`] **${e.configData.id}** — **${fmt(e.value)}** RAP`);
      return [embed(`🔎 "${opts.query}" — ${res.length}`,res.slice(0,20).join("\n")||"No results.",0x9B59B6)];
    }

    // ── User ──────────────────────────────────────────────────────────────────
    case "user link": return await linkUser(uid, uname, opts.username||"", base44);
    case "user unlink": {
      const ex=await base44.asServiceRole.entities.LinkedUser.filter({discord_user_id:uid});
      if (ex?.length>0) await base44.asServiceRole.entities.LinkedUser.update(ex[0].id,{roblox_username:"",roblox_id:""});
      return [embed("✅ Unlinked","Roblox account removed.",0x2ECC71)];
    }
    case "user info": {
      const ex=await base44.asServiceRole.entities.LinkedUser.filter({discord_user_id:uid});
      if (!ex?.length) return [embed("👤 No Account","Use `/user link` first.",0x95A5A6)];
      const u=ex[0];
      return [embed(`👤 ${u.roblox_username}`,"",0x3498DB,[{name:"Username",value:u.roblox_username,inline:true},{name:"Display",value:u.roblox_display_name||"?",inline:true},{name:"ID",value:u.roblox_id,inline:true},{name:"Discord",value:u.discord_username||"?",inline:true},{name:"Linked",value:(u.linked_at||"?").slice(0,10),inline:true},{name:"Profile",value:`https://www.roblox.com/users/${u.roblox_id}/profile`,inline:false}])];
    }
    case "user stats": return await getUserStats(uid, base44);
    case "user badges": return await getUserBadges(uid, base44);
    case "user rank": return await cmdUserRank(uid, base44);

    default: return [embed("❓ Unknown",`\`${key}\` not recognised.`,0x95A5A6)];
  }
}

// ── Server ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const rawBody = await req.text();
  try {
    const body = JSON.parse(rawBody);
    if (body.type !== undefined) {
      if (DISCORD_PUBKEY) { const v=await verifySig(req,rawBody); if(!v) return new Response("Invalid signature",{status:401}); }
      if (body.type===1) return Response.json({type:1});

      if (body.type===4) {
        // Autocomplete interaction — return matching suggestions
        const acData = body.data;
        const focusedOpt = (function findFocused(opts: any[]): any {
          for (const o of opts||[]) {
            if (o.focused) return o;
            const sub = findFocused(o.options||[]);
            if (sub) return sub;
          }
          return null;
        })(acData?.options||[]);
        
        const query = (focusedOpt?.value||"").toLowerCase();
        const cmdName = acData?.name||"";
        let choices: {name:string,value:string}[] = [];
        
        // Pet autocomplete (rap lookup, stats pet, stats supply)
        if (["rap","stats"].includes(cmdName) || (cmdName==="search")) {
          const [rapData, petsData] = await Promise.all([
            rget(`${BIGGAMES}/rap`),
            rget(`${BIGGAMES}/collection/Pets`),
          ]);
          const rap = (rapData?.data||[]) as any[];
          const pets = (petsData?.data||[]) as any[];
          
          // Build unique pet name list — prioritise huges/titanics from RAP
          const seen = new Set<string>();
          const results: {name:string,value:string,sort:number}[] = [];
          
          // From RAP (has value = more relevant)
          for (const e of rap) {
            const n = e.configData?.id||"";
            if (!n||seen.has(n)) continue;
            if (!query||n.toLowerCase().includes(query)) {
              seen.add(n);
              const tier = n.includes("Gargantuan")?0:n.includes("Titanic")?1:n.includes("Huge")?2:3;
              results.push({name:n, value:n, sort:tier});
            }
          }
          // From pets collection
          for (const p of pets) {
            const n = p.configData?.name||p.configName||"";
            if (!n||seen.has(n)) continue;
            if (!query||n.toLowerCase().includes(query)) {
              seen.add(n);
              results.push({name:n, value:n, sort:5});
            }
          }
          results.sort((a,b)=>a.sort-b.sort||(a.name.localeCompare(b.name)));
          choices = results.slice(0,25).map(r=>({name:r.name,value:r.value}));
        }
        
        // Egg autocomplete (eggs chances, eggs search)
        if (cmdName==="eggs") {
          const eggsData = await rget(`${BIGGAMES}/collection/Eggs`);
          const eggs = (eggsData?.data||[]) as any[];
          const matches = eggs
            .map((e: any) => e.configData?.name||e.configName||"")
            .filter((n: string) => n && (!query||n.toLowerCase().includes(query)))
            .slice(0,25)
            .map((n: string) => ({name:n, value:n}));
          choices = matches;
        }
        
        return Response.json({type:8, data:{choices: choices.slice(0,25)}});
      }

      if (body.type===2) {
        const k=cmdKey(body.data), opts=parseOpts(body.data?.options||[]), appId=body.application_id, token=body.token;
        (async()=>{
          try {
            const b44=createClientFromRequest(req), embeds=await handle(k,opts,b44,body);
            await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`,
              {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({embeds:embeds.slice(0,5)})});
          } catch(e){console.error("cmd:",e);}
        })();
        return Response.json({type:5});
      }
    }
    const b44=createClientFromRequest(req), action=body.action;
    if (action==="query_findings") {
      const h=body.hours||48, since=new Date(Date.now()-h*3600000).toISOString();
      let all=await b44.asServiceRole.entities.PS99Finding.filter({});
      all=all.filter((f: any)=>f.run_at&&f.run_at>since);
      if(body.category) all=all.filter((f: any)=>f.category===body.category);
      if(body.change_type) all=all.filter((f: any)=>f.change_type===body.change_type);
      all.sort((a: any,b: any)=>(b.run_at||"").localeCompare(a.run_at||""));
      return Response.json({ok:true, findings:all.slice(0,body.limit||20)});
    }
    if (action==="load_keyed") {
      const k=body.key||"main", recs=await b44.asServiceRole.entities.PS99Snapshot.filter({snapshot_key:k});
      if(recs?.length>0) return Response.json({ok:true,found:true,id:recs[0].id,data:recs[0].data||{},updated_at:recs[0].updated_at});
      return Response.json({ok:true,found:false,data:{}});
    }
    if (action==="save_keyed") {
      const k=body.key||"main", ex=await b44.asServiceRole.entities.PS99Snapshot.filter({snapshot_key:k});
      const payload={snapshot_key:k,data:body.snapshot_data,updated_at:new Date().toISOString()};
      const saved=ex?.length>0?await b44.asServiceRole.entities.PS99Snapshot.update(ex[0].id,payload):await b44.asServiceRole.entities.PS99Snapshot.create(payload);
      return Response.json({ok:true,id:saved.id});
    }
    if (body.action==="slash_command") {
      const embeds=await handle(body.command,body.options||{},b44); await sendWebhook(embeds);
      return Response.json({ok:true,embeds_sent:embeds.length});
    }
    if (action==="broadcast") { await sendWebhook(body.embeds||[],body.content); return Response.json({ok:true}); }
    if (action==="hatch_broadcast") {
      // Called by hourly scan — broadcast hatch notifications
      const hatches=body.hatches||[];
      for (const h of hatches.slice(0,10)) {
        const em=petEmoji(h.id), vs=variantStr(h.pt,h.sh);
        const thumbUrl=h.thumbnail||undefined;
        const hEmbed=embed(`${em} NEW HATCH — ${h.id}${vs}`,`**${h.count}** new hatch${h.count>1?"es":""} just detected in-game!`,h.id.includes("Gargantuan")?0xFF0000:h.id.includes("Titanic")?0xFF6B00:0x9B59B6,[
          {name:"🐾 Pet",value:h.id,inline:true},
          {name:"✨ Variant",value:vs||"Normal",inline:true},
          {name:"📦 Total Exist",value:fmt(h.total),inline:true},
          {name:"+",value:`**+${h.count}** hatched`,inline:true},
        ],thumbUrl);
        await sendWebhook([hEmbed]);
        await new Promise(r=>setTimeout(r,500));
      }
      return Response.json({ok:true,broadcast:hatches.length});
    }
    return Response.json({error:"Unknown action"},{status:400});
  } catch(e){console.error("error:",e); return Response.json({error:String(e)},{status:500});}
});
