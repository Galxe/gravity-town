// Static metadata mirror of contracts/src/UnitCatalog.sol — keep in sync if the
// catalog evolves. Used by the Arena UI to render bench cards, ability
// descriptions and tier colors without a per-render RPC roundtrip.

export type UnitDef = {
  type: number;          // 1..12 — 0 means empty slot
  name: string;
  atk: number;
  hp: number;
  cost: number;
  tier: 1 | 2 | 3 | 4;
  trigger: string;       // human-readable trigger (e.g. "ON_BUY")
  ability: string;       // short prose
  emoji: string;         // sprite stand-in until art lands
};

export const UNITS: Record<number, UnitDef> = {
  1: { type: 1, name: "Mineworker",    atk: 2, hp: 3, cost: 3, tier: 1, trigger: "ON_BUY",          ability: "+1 ATK to self",                emoji: "⛏️" },
  2: { type: 2, name: "Stoneguard",    atk: 2, hp: 4, cost: 3, tier: 1, trigger: "ON_START",        ability: "+3 HP to self",                 emoji: "🪨" },
  3: { type: 3, name: "Skirmisher",    atk: 3, hp: 3, cost: 3, tier: 1, trigger: "ON_HURT",         ability: "+1 ATK to self",                emoji: "🗡️" },
  4: { type: 4, name: "Pyromancer",    atk: 3, hp: 4, cost: 4, tier: 2, trigger: "ON_START",        ability: "3 dmg to a random enemy",        emoji: "🔥" },
  5: { type: 5, name: "Battlemage",    atk: 3, hp: 5, cost: 4, tier: 2, trigger: "ON_BUY",          ability: "+2 ATK to right neighbor",       emoji: "🧙" },
  6: { type: 6, name: "Ravenscout",    atk: 4, hp: 4, cost: 4, tier: 2, trigger: "ON_SELL",         ability: "+1 ATK to all allies",          emoji: "🦅" },
  7: { type: 7, name: "Hexhunter",     atk: 4, hp: 5, cost: 5, tier: 3, trigger: "ON_FRIEND_DEATH", ability: "+2 ATK to self",                emoji: "🏹" },
  8: { type: 8, name: "Crystalwarden", atk: 3, hp: 6, cost: 5, tier: 3, trigger: "ON_START",        ability: "buffs neighbors (+2/+4)",        emoji: "💠" },
  9: { type: 9, name: "Stormcaller",   atk: 4, hp: 6, cost: 5, tier: 3, trigger: "ON_HURT",         ability: "2 dmg to random enemy",         emoji: "⛈️" },
  10:{ type:10, name: "Wraith",        atk: 5, hp: 5, cost: 6, tier: 4, trigger: "ON_DEATH",        ability: "summons a 3/3 token",            emoji: "👻" },
  11:{ type:11, name: "Shadowstalker", atk: 6, hp: 5, cost: 6, tier: 4, trigger: "ON_DEATH",        ability: "5 dmg to random enemy",         emoji: "🗡️" },
  12:{ type:12, name: "Spiritbinder",  atk: 5, hp: 6, cost: 6, tier: 4, trigger: "ON_FRIEND_DEATH", ability: "summons a 2/2 token",            emoji: "🕯️" },
};

export function getUnit(type: number): UnitDef | null {
  if (!type) return null;
  return UNITS[type] ?? null;
}

export const TIER_COLOR: Record<1 | 2 | 3 | 4, string> = {
  1: "border-stone-500/60 bg-stone-800/40",
  2: "border-sky-500/60 bg-sky-900/30",
  3: "border-violet-500/60 bg-violet-900/30",
  4: "border-amber-500/60 bg-amber-900/30",
};

export const TIER_TEXT: Record<1 | 2 | 3 | 4, string> = {
  1: "text-stone-300",
  2: "text-sky-300",
  3: "text-violet-300",
  4: "text-amber-300",
};
