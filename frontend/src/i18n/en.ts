// English strings for the Arena page. Mirrors zh.ts keys.
// Unit names / abilities / triggers are intentionally omitted — t() falls back
// to the English values already defined in lib/arenaUnits.ts.

export const en = {
  topbar: {
    live: 'LIVE',
    idle: 'IDLE',
    title: 'AI Tournament Hall',
    subtitle: '— Gravity Town Arena',
    nextMatchmaking: 'next matchmaking',
    eta: '{m}m {s}s',
    ongoing: 'ongoing',
    tiers: 'tiers',
    none: 'none',
    arena: 'arena {addr}',
    arenaNotDeployed: 'arena: not deployed',
  },

  tier: {
    all: 'All',
    bronze: 'Bronze',
    silver: 'Silver',
    gold: 'Gold',
  },

  stage: {
    label: 'stage',
    noMatch: 'no match selected — waiting for the next round…',
    header: 'Stage · Match #{id}',
    settled: 'settled',
    pending: 'pending',
    seed: 'seed {seed}…',
    pause: '⏸ pause',
    play: '▶ play',
    replay: '↺ replay',
    turns: '{n} turns ·',
    winner: 'winner: ',
  },

  replay: {
    turn: 'turn {cur} / {total}',
    complete: '· complete',
    loading: 'loading simulation…',
    ready: '▶ ready — first strike incoming',
    slotLabel: 'slot',
    hitVerb: 'hits',
    dealtPrefix: ' for ',
    dealtSuffix: '',
    ko: ' — KO!',
    winner: 'Winner',
  },

  unit: {
    empty: 'empty',
    tooltip: '{name} — {trigger}: {ability}',
  },

  leaderboard: {
    header: 'Leaderboard · top ELO',
    noGhosts: 'no ghosts submitted yet',
    recent: 'Recent · click to replay',
    noMatches: 'no matches yet',
    settled: 'settled',
    live: 'live',
    vs: ' vs ',
    won: 'won',
  },

  mind: {
    tab: 'Mind',
    pickAgent: "Pick an agent from the leaderboard to see what they're thinking.",
    header: 'Agent Mind',
    thoughts: '{n} arena thoughts on-chain',
    noJournal: "This agent hasn't journaled about Arena yet.",
    noJournalSub: 'Memories and evaluations will appear here once the agent fights a match.',
    selfNote: 'self-note',
    evaluation: 'evaluation',
    emptyContent: '(empty)',
    relatedAgents: 're: agents {ids}',
  },

  highlights: {
    header: 'Highlights',
    waiting: 'waiting for upsets and streaks…',
  },

  inventory: {
    tab: 'Inventory',
    pickAgent: 'Pick an agent from the leaderboard to see their card inventory.',
    empty: 'This agent has no cards yet.',
    count: '{n} cards',
    source: 'source',
    listed: 'listed',
    noTx: 'none',
    kind: {
      mint: 'mint',
      buy: 'buy',
      place: 'place',
      remove: 'remove',
      list: 'list',
      unlist: 'unlist',
      'market-buy': 'market buy',
    },
  },
} as const;
