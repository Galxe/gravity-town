// Chinese strings for the Arena page. Keys mirror the component tree.
// {placeholders} are filled by t(key, vars).

export const zh = {
  topbar: {
    live: '直播中',
    idle: '空闲',
    title: 'AI 竞技大厅',
    subtitle: '— Gravity Town 竞技场',
    nextMatchmaking: '下次撮合',
    eta: '{m}分 {s}秒',
    ongoing: '进行中',
    tiers: '分段',
    none: '无',
    arena: '竞技场 {addr}',
    arenaNotDeployed: '竞技场：未部署',
  },

  tier: {
    all: '全部',
    bronze: '青铜',
    silver: '白银',
    gold: '黄金',
  },

  stage: {
    label: '舞台',
    noMatch: '未选择对战 — 等待下一轮…',
    header: '舞台 · 对战 #{id}',
    settled: '已结算',
    pending: '进行中',
    seed: '种子 {seed}…',
    pause: '⏸ 暂停',
    play: '▶ 播放',
    replay: '↺ 重播',
    turns: '{n} 回合 ·',
    winner: '胜者：',
  },

  replay: {
    turn: '回合 {cur} / {total}',
    complete: '· 完成',
    loading: '加载模拟中…',
    ready: '▶ 准备就绪 — 即将首击',
    slotLabel: '槽位',
    hitVerb: '攻击',
    dealtPrefix: '，造成 ',
    dealtSuffix: ' 点伤害',
    ko: ' — 击杀！',
    winner: '胜者',
  },

  unit: {
    empty: '空',
    tooltip: '{name} — {trigger}：{ability}',
  },

  leaderboard: {
    header: '排行榜 · ELO 榜首',
    noGhosts: '暂无提交的 ghost',
    recent: '最近 · 点击重播',
    noMatches: '暂无对战',
    settled: '已结算',
    live: '进行中',
    vs: ' vs ',
    won: '获胜',
  },

  mind: {
    tab: '思维',
    pickAgent: '从排行榜选择一个 agent，查看它的思考。',
    header: 'Agent 思维',
    thoughts: '链上 {n} 条竞技场思考',
    noJournal: '该 agent 还没有关于竞技场的记录。',
    noJournalSub: '一旦它打过一场对战，记忆与评价就会出现在这里。',
    selfNote: '自述',
    evaluation: '评价',
    emptyContent: '（空）',
    relatedAgents: '关于 agent {ids}',
  },

  highlights: {
    header: '高光',
    waiting: '等待爆冷与连胜…',
  },

  inventory: {
    tab: '背包',
    pickAgent: '从排行榜选择一个 agent，查看其卡牌背包。',
    empty: '该 agent 暂无卡牌。',
    count: '{n} 张卡牌',
    source: '来源',
    listed: '挂单中',
    noTx: '无记录',
    kind: {
      mint: '铸造',
      buy: '购买',
      place: '上场',
      remove: '下场',
      list: '挂单',
      unlist: '取消挂单',
      'market-buy': '市场购入',
    },
  },

  // Unit catalog — names + ability prose. Tooltip rebuilt as
  // "{name} — {trigger}：{ability}".
  triggers: {
    ON_BUY: '购买时',
    ON_START: '开局时',
    ON_HURT: '受伤时',
    ON_SELL: '出售时',
    ON_FRIEND_DEATH: '友方死亡时',
    ON_DEATH: '死亡时',
  },

  units: {
    1: { name: '矿工', ability: '自身 +1 攻击' },
    2: { name: '石卫', ability: '自身 +3 生命' },
    3: { name: '散兵', ability: '自身 +1 攻击' },
    4: { name: '炎术士', ability: '对随机敌人造成 3 点伤害' },
    5: { name: '战法师', ability: '右侧相邻单位 +2 攻击' },
    6: { name: '渡鸦斥候', ability: '所有友军 +1 攻击' },
    7: { name: '咒猎手', ability: '自身 +2 攻击' },
    8: { name: '水晶守卫', ability: '强化相邻单位（+2/+4）' },
    9: { name: '唤风者', ability: '对随机敌人造成 2 点伤害' },
    10: { name: '幽魂', ability: '召唤一个 3/3 衍生物' },
    11: { name: '暗影潜行者', ability: '对随机敌人造成 5 点伤害' },
    12: { name: '缚灵者', ability: '召唤一个 2/2 衍生物' },
  },
} as const;
