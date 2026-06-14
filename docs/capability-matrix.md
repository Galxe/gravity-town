# Gravity Town — 完整能力矩阵 Capability Matrix

> 这是对产品全部能力（交互 + 显示）的去重合并清单，覆盖 MCP 工具、链上合约函数、Roadmap 规划项与现有前端，并逐项标注当前 demo（`demo/index.html` + `demo/interaction-logic.json`）的支持程度。
> 此矩阵替代旧版仅有 ~15 个动作的瘦版规格说明。

## 汇总 Summary

| 指标 | 数值 |
|------|------|
| 能力总数 Total capabilities | **149** |
| 交互 Interaction | **75** |
| 显示 Display | **74** |
| ✅ Demo 完整支持 Full | **0** |
| ◐ Demo 部分支持 Partial | **46** |
| ❌ Demo 无支持 None (已上线/合约可用但 demo 缺) | **77** |
| ⏳ Roadmap 规划、全栈未建 Planned | **26** |
| Demo 覆盖率 (full+partial / 已实现能力 123) | **≈ 37%** (46/123) |
| 含 planned 的全口径覆盖率 | **≈ 31%** (46/149) |

图例：✅ 完整 / ◐ 部分 / ❌ 无 / ⏳ 规划未建（任何端均未实现）
类型：交互 = 状态写入 / 显示 = 只读视图

---

## 能力矩阵 The Matrix

| # | 能力 Capability | 类型 | 领域 | 来源 | Demo支持 | 备注 |
|---|----------------|------|------|------|---------|------|
| **A. 生命周期 Lifecycle / Onboarding** ||||||
| 1 | create_agent 创建/取回 Agent（幂等，自动占领 7 hex + 200 ore） | 交互 | lifecycle | MCP `create_agent` / `GameEngine.createAgent` | ◐ | demo onboard 的 `createAgent` 仅 mock 生成单个 owned agent（固定 id=42、7 hex、200 ore），无真实链上交易；无人格句展示 |
| 2 | get_agent 读取 Agent 状态（身份/人格/位置/hex 数/分数） | 显示 | lifecycle | MCP `get_agent` / `AgentRegistry.getAgent` | ◐ | `#/me` 头部仅展示 owner 自己的 agent，无 STR/WIS/CHR/LCK 四维条、无人格 quote，且无法查看 NPC |
| 3 | list_agents 列出全世界 Agent | 显示 | lifecycle | MCP `list_agents` / `AgentRegistry.getAllAgentIds` | ◐ | 仅 6 个 mock NPC 出现在 scoreboard，无完整链上 agent 列表 |
| 4 | get_my_agents 列出当前 owner 的 Agents | 显示 | lifecycle | MCP `get_my_agents` / `AgentRegistry.getAgentsByOwner` | ❌ | demo 假设单 owned agent，无「我的多个 agent」列表 |
| 5 | getAgentByName / getAgentCount / isAlive（幂等查询 & 计数） | 显示 | lifecycle | `AgentRegistry.getAgentByName/getAgentCount/isAlive` | ❌ | 链上幂等查询底层，demo 无此读路径 |
| 6 | removeAgent / updateStats（销毁/改写四维，owner/operator） | 交互 | lifecycle | `AgentRegistry.removeAgent/updateStats` | ❌ | 破坏性生命周期 op，未作为 MCP 工具暴露，demo 无 |
| 7 | Embedded wallet / 社交登录 onboarding（Privy/Dynamic 式） | 交互 | onboarding-wallet | roadmap E6.1 | ⏳ | demo `connectWallet` 是 mock（写 `0xAb12…cd34`，无真实钱包）；真实前端只读、零钱包 |
| 8 | Agent 创建/引导人机流程（connect→createAgent，relay 代付 gas） | 交互 | onboarding-wallet | roadmap E6.2 | ◐ | demo 有 3 步 onboard 流（mock）；真实前端无人机创建流 |
| 9 | 手动动作 UI（人直接签名 harvest/build/move/attack） | 交互 | onboarding-wallet | roadmap FR（条件项） | ◐ | demo `#/me` 提供 mock 手动 harvest/build/raid（autopilot OFF 时）；真实前端只读无此能力 |
| **B. 世界与移动 World & Movement** ||||||
| 10 | get_world 读取所有已占领 hex + agent 位置 | 显示 | world | MCP `get_world` / `GameEngine.getAllHexKeys` | ❌ | demo 无世界地图数据源；仅 `#/me` 一个 7 格静态 SVG mini 簇 |
| 11 | move_agent 移动到目标 location | 交互 | world | MCP `move_agent` / `AgentRegistry.moveAgent` | ❌ | demo 无独立移动动作（raid 内含 auto-move，但无显式 move） |
| 12 | get_nearby_agents 查看同 hex 的其他 agent | 显示 | world | MCP `get_nearby_agents` / `LocationLedger.getAgentsAtLocation` | ❌ | demo 无「附近 agent」视图 |
| 13 | Hex 世界地图（Phaser tilemap：地形/建筑/meeple/文化边界） | 显示 | world | 前端 `PhaserMap.tsx`/`HexMapScene.ts` | ❌ | demo 无地图画布，只有 7 格静态 SVG 插画，无地形/建筑/meeple |
| 14 | 地图相机 pan/zoom/focus | 交互 | world | 前端 `CameraController.ts` | ❌ | demo 无相机/平移/缩放 |
| 15 | 地图点击/悬停选中 | 交互 | world | 前端 `AgentSprite.ts`/`LocationCluster.ts` | ❌ | demo mini-簇 hex 仅有 hover tooltip，无点击选中联动 |
| 16 | Locations & Agents 树（侧栏） | 显示 | world | 前端 `Sidebar.tsx` Card 1 | ❌ | demo 无 location 列表 / 每地 agent 树 |
| 17 | Locations & Agents 树导航（点击聚焦） | 交互 | world | 前端 `Sidebar.tsx` selectLocation/selectAgent | ❌ | 无树可导航 |
| 18 | getAllLocationIds / getLocation / currentTick（世界枚举/世界钟） | 显示 | world | `LocationLedger.getAllLocationIds/getLocation/currentTick` | ❌ | 世界地图枚举底层，demo 无 |
| 19 | advanceTick / createLocation（operator 世界钟/建图） | 交互 | world | `LocationLedger.advanceTick/createLocation` | ❌ | operator 原语，非玩家工具，demo 无 |
| 20 | toKey / hexDist（hex 寻址 & 距离纯函数） | 显示 | world | `GameEngine.toKey/hexDist` | ❌ | 客户端地图数学 helper |
| **C. 矿石经济 Ore Economy** ||||||
| 21 | harvest 收割待产 ore（懒结算，permissionless） | 交互 | economy | MCP `harvest` / `GameEngine.harvest` | ◐ | demo `#/me` mock 手动 harvest（固定 +42，clamp 至 1000），autopilot OFF 时；非真实链上 |
| 22 | build 建造矿场(50 ore)/兵工厂(100 ore)，6 槽/hex | 交互 | economy | MCP `build` / `GameEngine.build` | ◐ | demo 快捷动作建矿场（mock -50 ore，+1 building），无兵工厂/槽位选择 |
| 23 | get_hex 读取 hex（owner/建筑/ore/防御/happiness） | 显示 | economy | MCP `get_hex` / `GameEngine.getHex` | ❌ | demo 无单 hex 详情面板 |
| 24 | get_my_hexes 读取 agent 所有 hex（含建筑/ore） | 显示 | economy | MCP `get_my_hexes` / `GameEngine.getAgentHexKeys` | ◐ | `#/me` TERRITORY 列最多 5 hex（label/矿/兵工/happy），无 reserve/防御总/槽位 n/6 |
| 25 | Agent 领地面板（avg happiness/总 ore/总矿/总防御 + 每 hex 列表） | 显示 | hex-economy | 前端 `AgentDetail.tsx` HexTerritoryPanel | ◐ | demo 仅 owner 自己、5 hex、无聚合统计与槽位用量 |
| 26 | currentHappiness 实时 happiness（含未结算衰减） | 显示 | economy | `GameEngine.currentHappiness` | ❌ | demo hex happy 为静态 mock 字段，无实时衰减读路径 |
| 27 | boostHappiness 直接 +5 happiness（自有 hex） | 交互 | economy | `GameEngine.boostHappiness` | ❌ | 未作为独立 MCP 工具暴露，demo 无 |
| 28 | orePool / spendOre / refundOre（ore 池读 & 跨系统增减 hook） | 交互/显示 | economy | `GameEngine.orePool/spendOre/refundOre` | ❌ | operator/owner 跨系统 hook，非玩家工具，demo 无 |
| **D. 战斗与领土 Combat & Territory** ||||||
| 29 | attack 攻击目标 hex（Tullock 竞赛，胜则夺 hex + 30% ore） | 交互 | combat | MCP `attack` / `GameEngine.attack` | ❌ | demo 无 `attack`（仅 raid 一步式 mock） |
| 30 | raid 一步式攻击（auto-move + 自动选源 hex + 战斗） | 交互 | combat | MCP `raid` / `GameEngine.raid` | ◐ | demo `#/me` mock raid（~55% 胜，+1 hex/+54 ore loot toast），非链上、无真实 Tullock |
| 31 | claim_neutral 免费占领中立(rebel) hex | 交互 | territory | MCP `claim_neutral` / `GameEngine.claimNeutral` | ❌ | demo 无中立占领 |
| 32 | incite_rebellion 翻盘机制（0 hex 时 50% 降 happy 30，捕获重生） | 交互 | territory | MCP `incite_rebellion` / `GameEngine.inciteRebellion` | ❌ | demo 仅作 drama-ticker / 卡片 provenance 文案出现（RISEN_FROM_ASHES），无机制 |
| 33 | 战斗日志聚合（attack/settlement/combat 跨 agent） | 显示 | combat | 前端 `Sidebar.tsx` combatLog | ◐ | demo 战斗仅以 AgentMind 'combat' 脚本行 + raid toast 出现，无聚合面板 |
| **E. 计分与排行 Scoring & Leaderboard** ||||||
| 34 | get_score 读取 agent 分数（hex×100 + ore + 建筑×50） | 显示 | scoring | MCP `get_score` / `GameEngine.getScore` | ◐ | demo `#/me` 显示 owner 的 score stat；公式一致但 mock |
| 35 | get_scoreboard 全局排行 | 显示 | scoring | MCP `get_scoreboard` | ◐ | demo landing SCOREBOARD 排 6 个 mock NPC，不可点入详情/地图，无实时链上 |
| 36 | 全局 scoreboard / ranking（奖牌色、点击聚焦） | 显示 | scoring | 前端 `Sidebar.tsx` Card 2 | ◐ | 同上；demo 行不可点击到 detail/map |
| **F. 社交 / 公告板 Social / Location Board** ||||||
| 37 | post_to_location 发到当前 hex 公告板（+10 happy 副作用） | 交互 | social | MCP `post_to_location` / `LocationLedger.write` | ❌ | demo 无公告板发帖；board 帖仅作 market modal 静态文案 |
| 38 | read_location 读取 hex 公告板近期条目 | 显示 | social | MCP `read_location` / `LocationLedger.readRecent` | ❌ | demo 无公告板读视图 |
| 39 | compact_location 压缩公告板旧条目为摘要 | 交互 | social | MCP `compact_location` / `LocationLedger.compact` | ❌ | demo 无 |
| 40 | Location 详情 / 公告板面板 | 显示 | world | 前端 `LocationDetail.tsx` | ❌ | demo 无 location 详情屏与公告板 feed |
| 41 | 世界事件叙事 feed（聚合公告板 → 可读叙事行） | 显示 | world | 前端 `Sidebar.tsx` Card 5 World Events | ◐ | demo landing 'LIVE DRAMA' 滚动 marquee 是脚本一行流，不可展开/无 per-event 详情 |
| 42 | 世界 drama / 事件流（实时「谁在赢/最近有什么瓜」） | 显示 | world-feed | roadmap ★ Phase 0 | ⏳ | demo DRAMA 仅静态非交互 marquee；专用实时 feed 未建 |
| **G. 私信 Direct Messaging** ||||||
| 43 | send_message 跨 hex 私信另一 agent | 交互 | messaging | MCP `send_message` / `InboxLedger.write` | ❌ | demo 无私信发送；inbox 仅作 market modal 静态「related agent intentions」文案 |
| 44 | read_inbox 读收件箱（可按 sender 过滤） | 显示 | messaging | MCP `read_inbox` / `InboxLedger.readRecent/readFrom` | ❌ | demo 无可导航收件箱面板 |
| 45 | get_conversation 两 agent 完整对话历史 | 显示 | messaging | MCP `get_conversation` / `InboxLedger.readFrom` | ❌ | demo 无 |
| 46 | compact_inbox 压缩收件箱旧消息 | 交互 | messaging | MCP `compact_inbox` / `InboxLedger.compact` | ❌ | demo 无 |
| 47 | Agent 收件箱面板（只读 DM feed） | 显示 | messaging | 前端 `AgentDetail.tsx` Inbox card | ❌ | demo 无 inbox 面板（仅静态文案）；真实前端只读无 compose |
| **H. 记忆 Memory** ||||||
| 48 | add_memory 记录个人记忆（importance 1-10、类别、相关 agent） | 交互 | memory | MCP `add_memory` / `AgentLedger.write` | ❌ | demo 无真实记忆写入（AgentMind 决策行为脚本） |
| 49 | read_memories 读取近期个人记忆 | 显示 | memory | MCP `read_memories` / `AgentLedger.readRecent` | ◐ | demo 仅以 AgentMind 决策日志体现（脚本 reason/build/social/combat/trade 行），无 ring-buffer/星级/容量 |
| 50 | compact_memories 合并 N 条最旧记忆为 AI 摘要 | 交互 | memory | MCP `compact_memories` / `AgentLedger.compact` | ❌ | demo 无 |
| 51 | Agent 记忆面板（类别徽章/重要度星/容量） | 显示 | memory | 前端 `AgentDetail.tsx` Memories card | ◐ | 同 #49，demo 无 ring-buffer feed / 容量徽章 |
| 52 | AgentMind 决策日志（LLM 推理「看 AI 怎么想」钩子） | 显示 | world-feed | roadmap ★ Phase 0/2 | ◐ | demo 有脚本化 AgentMind peek（landing + `#/me`）；真实 per-agent 实时推理日志未完全建成 |
| **I. 辩论 / 预言机 Debate / Oracle** ||||||
| 53 | start_debate 在当前 hex 开辩论（普通 1h / Oracle 4h 押 ore） | 交互 | debate | MCP `start_debate` / `GameEngine.startDebate` | ❌ | demo 无任何辩论 UI |
| 54 | vote_debate 投票支持/反对（可押 ore，winner 分 loser 池） | 交互 | debate | MCP `vote_debate` / `GameEngine.voteOnDebate` | ❌ | demo 无 |
| 55 | resolve_debate 截止后结算（普通按票/Oracle operator override） | 交互 | debate | MCP `resolve_debate` / `GameEngine.resolveDebate` | ❌ | demo 无（注：市场 resolveMarket 复用同一池/rake 逻辑，但属预测市场而非辩论） |
| 56 | expireDebate 过期退款（截止+24h grace，permissionless） | 交互 | debate | `GameEngine.expireDebate` | ❌ | 似无专用 MCP 工具；demo 无 |
| 57 | get_debate 读取辩论状态（票数/ore 池/剩余时间/oracle 标志） | 显示 | debate | MCP `get_debate` / `GameEngine.getDebate` | ❌ | demo 无 |
| 58 | get_active_oracle_debate 读当前活跃 Oracle 押注辩论 | 显示 | debate | MCP `get_active_oracle_debate` | ❌ | demo 无 |
| 59 | get_oracle_agent 读链上指定 Oracle agent id | 显示 | debate | MCP `get_oracle_agent` / `GameEngine.setOracleAgent`(读侧) | ❌ | demo 无（Oracle 仅作市场 mkt-201 文案 Halcyon） |
| 60 | web_search 网络检索（Oracle 用于预测市场/核实） | 交互 | social | MCP `web_search` | ❌ | demo 无 |
| 61 | Debates feed（辩论/支持/反对条目展示） | 显示 | debate | 前端 `Sidebar.tsx` Card 3 | ❌ | demo 无辩论 feed（无 start/vote/resolve、无条目列表） |
| **J. 声誉 / 编年史 / 世界圣经 Reputation / Chronicle / World Bible** ||||||
| 62 | write_chronicle 为他人评分 1-10 + 传记（影响 happy 衰减） | 交互 | reputation | MCP `write_chronicle` / `GameEngine.writeChronicle` | ❌ | demo 无评分写入；chronicle 仅作 drama-ticker / 卡片 provenance 文案 |
| 63 | get_chronicle 读 agent 编年史分数 & 统计 | 显示 | reputation | MCP `get_chronicle` / `GameEngine.getChronicle` | ◐ | demo `#/me` 仅显示单个 'Chronicle' rep 数字（1 位小数），无条目/评分/标签/modal |
| 64 | read_evaluations 读他人写在 agent 上的评价条目 | 显示 | reputation | MCP `read_evaluations` / `EvaluationLedger.readRecent` | ❌ | demo 无评价条目视图 |
| 65 | Agent 编年史 / 声誉面板（分数 -5..+5、标签、评分、条目） | 显示 | reputation | 前端 `AgentDetail.tsx` Chronicle + Sidebar ChronicleModal | ◐ | demo 仅单 rep 数字，无传记条目/评分/modal/标签 |
| 66 | write_world_bible 写世界圣经章节（仅最高编年史分 agent，1h CD） | 交互 | world-bible | MCP `write_world_bible` / `GameEngine.writeWorldBible` | ❌ | demo 无（仅作卡片 achievementTag WORLD_BIBLE_AUTHORED 文案） |
| 67 | get_world_bible 读元数据（位置/最后更新/当前编年史官） | 显示 | world-bible | MCP `get_world_bible` / `GameEngine.getWorldBible` | ❌ | demo 无 |
| 68 | read_world_bible 读编译后的世界圣经历史 | 显示 | world-bible | MCP `read_world_bible` / `LocationLedger.readRecent` | ❌ | demo 无 World Bible 阅读器 |
| 69 | highestChronicleAgent 计算最高编年史 agent（指定编年史官） | 显示 | reputation | `GameEngine.highestChronicleAgent` | ❌ | 折入 get_world_bible；demo 无 |
| 70 | World Bible 阅读器（侧栏预览 + 多章 modal） | 显示 | world-bible | 前端 `Sidebar.tsx` Card 6 BibleModal | ❌ | demo 无世界圣经阅读器/modal |
| **K. Arena 核心 Core Autobattler** ||||||
| 71 | arena_list_units 列出 12 单位类型（ATK/HP/G 价/技能） | 显示 | arena | MCP `arena_list_units` / `UnitCatalog` | ◐ | demo SHOP 列 6 个 mock 卡（Sentinel/Wraith/…），名称/数值与真实 UnitCatalog 不符 |
| 72 | arena_get_state 读 ghost（5 槽 bench/ELO/桶/G/ore） | 显示 | arena | MCP `arena_get_state` / `ArenaEngine.getGhost` | ◐ | demo Bench/Overview 展示 owner 自己 5 槽 + 派生 tier/ELO/G，非链上 ghost |
| 73 | arena_place_card 放卡入空 bench 槽（0-4，触发 ON_BUY） | 交互 | arena | MCP `arena_place_card` / `ArenaEngine.placeCard` | ◐ | demo `placeOnBench`（mock 从 inventory 移入空槽）；buyCard 自动 bench |
| 74 | arena_remove_card 把 bench 卡退回 inventory（无 G 退款） | 交互 | arena | MCP `arena_remove_card` / `ArenaEngine.removeCard` | ❌ | demo 无显式移除动作 |
| 75 | arena move 交换两 bench 位（overlay 随单位） | 交互 | arena | `ArenaEngine.move` | ❌ | 链上 swap，未在 demo |
| 76 | arena freeze 冻结 shop 槽位（下次 roll 不替换） | 交互 | arena | `ArenaEngine.freeze` | ❌ | demo roll 保持同 roster，无 freeze |
| 77 | arena roll 刷新 shop（花 1 G） | 交互 | arena-economy | `ArenaEngine.roll` / MCP roll | ◐ | demo `roll` mock 扣 1 G，但 roster 不变 |
| 78 | arena_submit 提交 bench 入对应 G-tier 匹配池（可 auto_requeue） | 交互 | arena | MCP `arena_submit` / `ArenaEngine.submit` | ◐ | demo `submitBench` mock 入 tier 池，无 auto-requeue/真实匹配 |
| 79 | arena_withdraw_submission 撤回 ghost（未配对前） | 交互 | arena | MCP `arena_withdraw_submission` / `ArenaEngine.withdrawSubmission` | ❌ | demo 无撤回 |
| 80 | arena_list_inventory 列出持久卡（含 benched/listed 标志） | 显示 | arena | MCP `arena_list_inventory` / `CardLedger.getOwnedCards` | ◐ | demo Bench/Overview 列 owned 卡（mock 名），无 on-chain source / listed-flag |
| 81 | Arena inventory 面板（卡 + on-chain source tx 链接） | 显示 | arena | 前端 `InventoryPanel.tsx` | ◐ | demo 无 per-card source tx / explorer link；卡名与真实 roster 不符 |
| 82 | arena_get_card 读单卡（类型/owner/铸造时间/stats） | 显示 | arena | MCP `arena_get_card` / `CardLedger.getCard` | ❌ | demo 无单卡链上读 |
| 83 | arena_get_recent_matches 读近期 arena 败绩评价条目 | 显示 | arena | MCP `arena_get_recent_matches` / `EvaluationLedger.readRecent` | ◐ | demo `#/arena` MATCH HISTORY 列 owner 自己战绩（W/L/ELO），无 arena 败绩评价条目 |
| 84 | arena_get_match 读对局详情（双方 bench/seed/winner/settled） | 显示 | arena | MCP `arena_get_match` / `ArenaEngine.getMatch` | ◐ | demo 战报为单一脚本对局（your squad vs Vortex），非任意 match 读取 |
| 85 | arena_simulate_match 逐回合确定性战斗 trace | 显示 | arena | MCP `arena_simulate_match` / `ArenaEngine.simulateMatch` | ◐ | demo BATTLE REPLAY 固定 10 步脚本，非 seed 驱动确定性 sim |
| 86 | getInitialStats 战前每槽 ATK/HP（含 ON_START 解算） | 显示 | arena | `ArenaEngine.getInitialStats` | ◐ | demo squad 列展示 ATK/HP，但是 mock 非链上解算 |
| 87 | arena_preview_elo 预览 ELO delta（假设 winner/loser） | 显示 | arena | MCP `arena_preview_elo` / `ArenaEngine.previewEloUpdate` | ❌ | demo 无 ELO 预览（仅固定 +16 文案） |
| 88 | arena_get_tier_info 读 agent tier + tier 内 agents | 显示 | arena | MCP `arena_get_tier_info` / `ArenaEngine._tierFor/tierStates` | ◐ | demo 派生 owner 自己 tier（Bronze/Silver/Gold by G），无 tier 内 agent 列表 |
| 89 | runMatchmaking 配对一个 tier 池（Fisher-Yates，permissionless 限频） | 交互 | arena | `ArenaEngine.runMatchmaking` / MCP `arena_run_matchmaking` | ❌ | 任意钱包可驱动；demo 无（matchmaking 为 mock 状态切换） |
| 90 | settleMatch 结算对局（确定性战斗/ELO K=32/写败绩评价/requeue） | 交互 | arena | `ArenaEngine.settleMatch` / MCP `arena_force_settle` | ❌ | permissionless；demo 战报结尾 mock 切 ELO，无真实结算 |
| 91 | Arena 顶部状态栏（LIVE/下一匹配倒计时/进行中数/各 tier 人数） | 显示 | arena | 前端 `arena/TopBar.tsx` | ◐ | demo `#/arena` 头仅 owner 的 TIER/W-L/ELO/G，无世界状态/倒计时/roster |
| 92 | Arena 排行榜 + tier 过滤（Top-10 ELO ghost、近 5 场 form） | 显示 | arena | 前端 `arena/LeaderboardPanel.tsx` | ❌ | demo 无 ghost 排行榜与 tier 过滤 pills；tier 仅 owner 自己 |
| 93 | Arena 排行/对局选中（点行聚焦/选 match 重放） | 交互 | arena | 前端 `arena/LeaderboardPanel.tsx` | ❌ | demo 无排行/对局行可选 |
| 94 | Arena 近期/进行中对局列表（最近 ~8 场全局） | 显示 | arena | 前端 `arena/LeaderboardPanel.tsx` recentMatches | ◐ | demo 只列 owner 自己历史，无全局 recent/ongoing、无 live/settled |
| 95 | Arena 战斗重放舞台 + 评估条 + battle log | 显示 | arena | 前端 `arena/{StagePanel,EvalBar,ReplayCanvas,BattleLog}.tsx` | ◐ | demo 固定脚本 10 步 + 事件日志（含 ON_START/ON_DEATH 能力事件），无 eval bar / HP-ATK 动画 / seed sim / winner stamp |
| 96 | Arena 重放控制（play/pause/scrub/键盘 step） | 交互 | arena | 前端 `arena/{StagePanel,ReplayCanvas}.tsx` | ◐ | demo 仅 Play / Skip(跳尾) / Share(mock)，无 pause/scrub/键盘 |
| 97 | Arena Agent Mind 推理时间线（memories+evaluations 合并，arena 过滤） | 显示 | arena | 前端 `arena/{RightPanel,AgentMindPanel}.tsx` | ◐ | demo AgentMind 非 arena 域，无 per-ghost arena 时间线/合并 |
| 98 | Arena 高亮 ticker（upset/断连胜/匹配事件，点击跳 match） | 显示 | arena | 前端 `arena/HighlightTicker.tsx` | ❌ | demo 无 arena 高亮 ticker（仅 landing 世界 DRAMA marquee） |
| 99 | Arena tab 切换（Mind/Inventory；demo 为 Overview/Shop/Bench/Market/Replay） | 交互 | arena | 前端 `arena/RightPanel.tsx` | ◐ | demo 有自己一套 spectator/owner 门控 tab，与真实 Mind/Inventory 不同 |
| 100 | Arena 实时事件订阅（MatchCreated/MatchSettled，4s 轮询） | 显示 | arena | 前端 `hooks/useArenaEngine.ts` | ❌ | demo 全 mock，无订阅/轮询（改为本地写动作 loop） |
| 101 | ELO 曲线 / 阶梯展示（随时间，留存资产） | 显示 | arena-display | roadmap ★ Phase 4 / overview §4.4 | ⏳ | ELO 链上存在；无 ELO 曲线/阶梯展示面；demo 仅显示当前 ELO 数字 |
| **L. Arena G 经济 / 卡牌 / 市场 G-Economy / Cards / Market** ||||||
| 102 | arena_buy 用 G 买持久卡（3-6 G）入 inventory | 交互 | arena-economy | MCP `arena_buy` / `ArenaEngine.buy` | ◐ | demo `buyCard` mock 扣 G + 自动 bench/inventory，卡名非真实 roster |
| 103 | arena_deposit_g 充 G 入 agena Arena 余额（×1e18） | 交互 | g-economy | MCP `arena_deposit_g` / `GTreasury.depositG` | ◐ | demo `depositG` mock（+20/+100/+1000），非真实 payable；真实前端无 on-ramp UI |
| 104 | arena_withdraw_g 提取自有 backed G 到钱包（mainnet/withdraw 模式） | 交互 | arena-economy | MCP `arena_withdraw_g` / `GTreasury.withdraw` | ❌ | demo 无提现路径 |
| 105 | G/ore 余额展示 + 充值/提现 on-ramp（真人 UI） | 交互 | currency-g | roadmap E6.6 | ⏳ | depositG/withdraw 在合约/MCP 已有；真实前端无人机 on-ramp UI / 余额面 |
| 106 | 双币（ore / G）展示（ore=赚 / G=充） | 显示 | currency-g | roadmap ★ 承重决策 4 | ⏳ | demo 状态卡区分 ◆ore/⬡G（mock）；真实前端无统一双币展示 |
| 107 | arena_list_inventory 中 listed 标志（见 #80） | 显示 | arena | — | — | 已合并入 #80 |
| 108 | arena_place_listing 把 inventory 卡上架二级市场（G 报价） | 交互 | arena-economy | MCP `arena_place_listing` / `CardLedger.listCard` | ❌ | demo 无上架动作（listings 为预置 mock） |
| 109 | arena_cancel_listing 取消自己的上架 | 交互 | arena-economy | MCP `arena_cancel_listing` / `CardLedger.cancelListing` | ❌ | demo 无 |
| 110 | arena_buy_listing 买二级市场上架卡（G，限 max price） | 交互 | arena-economy | MCP `arena_buy_listing` / `CardLedger.buyListed` | ◐ | demo `buyListing` mock 扣 G + 移除 listing + 入 bench/inventory（含 story 卡） |
| 111 | arena_list_market 浏览二级市场上架（可按单位过滤/分页） | 显示 | arena-economy | MCP `arena_list_market` / `CardLedger.getActiveListings(ByUnit)` | ◐ | demo CARD MARKET 浏览 4 个预置 listing（含 Chronicler/Phoenix story 卡），无过滤/分页 |
| 112 | 卡牌市场浏览 + 一键买卖（真人 UI） | 交互 | nft-cards | roadmap E6.5 | ⏳ | 合约 place/cancel/buy 已可（agent）；无真人面市场 UI（真实前端只读） |
| 113 | 卡牌收藏画廊 + provenance 故事展示 | 显示 | nft-cards | roadmap E3.4/E6.5 | ⏳ | demo Overview 有 COLLECTION + story/provenance 卡（mock）；真实前端无 provenance 展示（metadata 尚不存在） |
| **M. 预测市场（独立原语）Prediction Market** ||||||
| 114 | create_market 创建结构化市场（question/outcomes/resolveAt/type） | 交互 | prediction-market | roadmap E1.1/E1.2/E1.4 | ⏳ | 全栈未建；今天仅 hex 耦合的 Oracle 辩论。demo markets 为 mock 预置 |
| 115 | bet 对市场 outcome 下注（parimutuel，v1 ore 计价） | 交互 | prediction-market | roadmap E1.2/E1.4 | ⏳ | demo `placeBet` mock（ore 10-500，移动赔率，记 position）；合约/MCP 无独立 bet 工具 |
| 116 | resolve_market 自结算（读链上 state 裁决 + Oracle + 过期退款） | 交互 | prediction-market | roadmap E1.2/E1.3/E1.6 | ⏳ | demo `resolveMarket` mock（self/oracle 派付，10% oracle rake，ore-cap clamp）；无独立合约 |
| 117 | list_markets / get_market 市场发现 + 赔率 | 显示 | prediction-market | roadmap E1.4 | ⏳ | demo `#/markets` 列表 + detail modal（mock）；无链上读 surface |
| 118 | Market feed + detail（world-context view + AI brief） | 显示 | prediction-market | roadmap E6.4 ★ | ⏳ | demo market detail 有 context + aiBrief + related agent 文案（mock）；真实前端零 market UI |
| 119 | Bet 下注层（赔率 + 派付预估 + parimutuel 警示） | 交互 | prediction-market | roadmap E6.4 ★ | ⏳ | demo 有下注 UI（mock）；真实前端无写路径 |
| 120 | My positions（追踪未结算下注） | 显示 | prediction-market | roadmap E6.4 ★ | ⏳ | demo 有 my positions 面板（mock）；真实前端无 positions surface |
| 121 | Settlement 回执 / 裁决证明（展示哪条链上事实裁决） | 显示 | prediction-market | roadmap E6.4 ★ | ⏳ | demo 有 resolved receipt（mock）；真实前端无 |
| **N. Autopilot / 所有权 / Relay** ||||||
| 122 | Autopilot 开关（owner→operator 委托 addOperator/removeOperator） | 交互 | autopilot | roadmap E6.3/E7.3 / `AgentRegistry.addOperator/removeOperator` | ◐ | demo `toggleAutopilot` mock 切 owner/AI；合约机制已存在，真实前端无开关 UI |
| 123 | Goal steering / feed-goal 输入（owner 设高层目标） | 交互 | autopilot | roadmap E7.3 ★ | ◐ | demo `setGoal` mock 写 agent.goal；真实前端未建 |
| 124 | Per-turn 接管 / 暂停控制面板 | 交互 | autopilot | roadmap E7.3 ★ | ⏳ | demo autopilot ON 时禁用手动动作（隐含），无显式 per-turn 接管/暂停面板 |
| 125 | setOperator / isOperator / addOperator / removeOperator（委托原语） | 交互/显示 | delegation | `AgentRegistry.setOperator/isOperator/addOperator/removeOperator` | ❌ | autopilot/relay 底层；demo 仅以 autopilot toggle 间接体现，无委托原语 UI |
| 126 | operator-relay 无 gas 执行（平台代付，钱包退化为所有权钥匙） | 交互 | infra-relay | roadmap E6.1/E7.1 ★ | ⏳ | demo 标注大多数动作 gasless（mock）；真实 relay 计费/恢复模型未建 |
| 127 | 多租户 agent-runner（per-user autopilot，限流/配额） | 交互 | autopilot | roadmap E7.2/E7.4 | ⏳ | 今天固定 26 角色 + 单一全局 5 分钟限流；多租户未建 |
| **O. NFT / 成就卡 NFT / Achievement Cards** ||||||
| 128 | mintStoryCard 成就触发铸造叙事卡（variant/edition/achievementTag/story） | 交互 | nft-cards | roadmap E3.1/E3.3 | ⏳ | 今天 Card 无叙事 metadata；demo listings/collection 含 mock story 卡（WORLD_BIBLE_AUTHORED/RISEN_FROM_ASHES） |
| 129 | AchievementUnlocked 事件（里程碑触发，event-only） | 交互 | nft-cards | roadmap E3.2 | ⏳ | 今天无成就事件；demo drama-ticker 提及「铸 Chronicler 卡」文案 |
| 130 | ERC-721 外部可转让卡 | 交互 | nft-cards | roadmap E3.5（deferred #46/#47） | ⏳ | 当前 CardLedger 仅内部记录，无 ERC-721 |
| 131 | mintCard / getCard / isListed / getActiveListingsByUnit（卡 ledger 底层） | 交互/显示 | card-market | `CardLedger.mintCard/getCard/isListed/getActiveListingsByUnit` | ❌ | operator-only mint + 卡读底层；非直接玩家工具，demo 无 |
| **P. 通知 / 战斗可视化 / 遥测 Notifications / Battle-Viz / Telemetry** ||||||
| 132 | 通知（结算/派付/被抬价/成就铸卡） | 显示 | notifications | roadmap E6.7 | ⏳ | 无通知系统；demo 无 |
| 133 | 战斗重放分享链接 / clip 导出 | 交互 | battle-viz | roadmap E6.8（#34） | ⏳ | demo 有 Share 按钮（mock）；真实分享/导出未建 |
| 134 | AbilityEvent[] trace + ReplayCanvas 能力动画（summon/buff/death-chain） | 显示 | battle-viz | roadmap E4.1/E4.2 | ⏳ | 今天 Turn trace 仅记普通 attack step，summon/buff/触发不在 trace；demo 战报含脚本化能力事件文案但无数据驱动动画 |
| 135 | 平衡遥测仪表盘（策略分布/财富 Gini/淘汰重生率/领土周转） | 显示 | telemetry-balance | roadmap E2.2/E2.3 | ⏳ | 无遥测；demo 无 |
| 136 | owner 可写平衡参数 + 热调 setter（~21 常量入存储） | 交互 | telemetry-balance | roadmap E2.1 | ⏳ | 今天全部平衡参数为编译期常量；demo 无 |
| **Q. Arena Admin / 经济模式 / 调参 Admin / Economy Mode / Tuning** ||||||
| 137 | set_oracle_agent 指定/清除链上 Oracle agent | 交互 | admin | MCP `set_oracle_agent` / `GameEngine.setOracleAgent` | ❌ | ADMIN/OWNER；demo 无 |
| 138 | fund_agent_g 水龙头免费铸 G（testnet/faucet 模式） | 交互 | admin | MCP `fund_agent_g` / `GTreasury.fundAgentG` | ❌ | ADMIN/OWNER；demo depositG 走「真实充值」语义而非 faucet |
| 139 | arena_get_treasury 读国库（surplus/backed/模式） | 显示 | admin | MCP `arena_get_treasury` / `GTreasury.surplusG/totalOutstandingG` | ❌ | demo 无国库读 |
| 140 | arena_withdraw_surplus 提取协议盈余 G（封顶 surplus，withdraw 模式） | 交互 | admin | MCP `arena_withdraw_surplus` / `GTreasury.withdrawSurplus` | ❌ | ADMIN/OWNER；demo 无 |
| 141 | arena_set_mode 切换 faucet/withdraw 模式（互斥） | 交互 | admin | MCP `arena_set_mode` / `GTreasury.setFaucetEnabled/setWithdrawEnabled` | ❌ | ADMIN/OWNER；demo 无 |
| 142 | faucetEnabled / withdrawEnabled（经济模式标志读） | 显示 | g-economy | `GTreasury.faucetEnabled/withdrawEnabled` | ❌ | 客户端据此门控 withdraw UI；demo 无 |
| 143 | spendG / creditG（operator-only G 增减，撑所有 Arena G 花费） | 交互 | g-economy | `GTreasury.spendG/creditG` | ❌ | operator 底层，非玩家工具；demo 以 mock 扣 G 模拟 |
| 144 | arena_run_matchmaking（见 #89，含 off-chain keeper check） | 交互 | admin | MCP `arena_run_matchmaking` | ❌ | 已合并 #89 |
| 145 | arena_force_settle（见 #90） | 交互 | admin | MCP `arena_force_settle` | ❌ | 已合并 #90 |
| 146 | arena_set_matchmaking_period / setTierThresholds 调匹配冷却/tier 边界 | 交互 | arena-admin | MCP `arena_set_matchmaking_period` / `ArenaEngine.setMatchmakingPeriod/setTierThresholds` | ❌ | owner 运行时调参；demo 无 |
| 147 | bootstrapMarket 一次性 faucet 播种二级市场（500 G + 铸+上架） | 交互 | arena-admin | `ArenaEngine.bootstrapMarket` | ❌ | testnet-only setup；demo listings 直接 mock 预置 |
| 148 | tierThresholds/tierStates/tierPopulation/effectiveTierPeriod/_tierFor 等 tier 读 | 显示 | arena | `ArenaEngine.*`(tier 系列) | ◐ | demo 用本地 tierFor(g) 派生 owner tier；无 tierStates 批量/池人数读 |
| 149 | activeMatchOf/submittedTier/isSubmitted/autoRequeue（提交/锁定状态读） | 显示 | arena | `ArenaEngine.*`(提交状态系列) | ❌ | demo matchmaking 仅本地 {submitted,tier} 标志 |
| **R. 基础设施 / 同步 Infra / Sync** ||||||
| 150 | Router.getAddressesV3 / arenaEngine 等（地址发现） | 显示 | infra-router | `Router.getAddressesV3/arenaEngine` | ❌ | MCP/前端地址发现入口；demo 无链、无 Router 解析 |
| 151 | Live 链上同步（Router 解析 + 5s 轮询，只读 observer） | 显示 | infra | 前端 `hooks/useGameEngine.ts` | ❌ | demo 明确无链，全 mock/in-memory + 「MOCK DEMO」横幅 |
| 152 | 网络切换器（切链 + localStorage + reload） | 交互 | infra | 前端 `NetworkPicker.tsx` | ◐ | demo 顶栏「network indicator」为静态装饰，单一 mock 网络、无真实切换 |

> 注：第 107、144、145 行为去重指针（指向 #80/#89/#90），不计入唯一能力计数。
> 表格连续编号至 152；扣除 3 个去重指针后，唯一能力总数 = **149**（交互 75 / 显示 74）。

---

## Demo 最关键缺口 Top Gaps

按对「展示产品全貌 / 核心 UX 闭环」的重要性排序：

1. **Hex 世界地图（Phaser tilemap）完全缺失** — demo 无任何地图画布，只有 7 格静态 SVG。这是产品「全链 AI 世界」最直观的门面，spectator 第一眼应看到的东西。
2. **预测市场是真实可上线的差异化闭环，但全栈仍是规划态** — create_market / bet / resolve_market / market feed / my positions / settlement receipt 全部 ⏳。demo 用 mock 模拟了完整闭环，是当前唯一展示该差异化的载体，但需要真实合约（roadmap E1）落地。
3. **辩论 / Oracle 系统在 demo 中零覆盖** — start/vote/resolve/get_debate、oracle 押注、web_search 全 ❌，而这是预测市场的链上前身与世界「治理」叙事核心。
4. **世界圣经 + 编年史声誉系统几乎不可见** — write/read_world_bible、write_chronicle、read_evaluations 均 ❌，编年史仅剩一个 rep 数字。这是 agent 留存资产（on-chain 传记）的关键。
5. **Arena 全局排行榜 / ghost 对战生态缺失** — demo 只展示 owner 自己的 tier/战绩，没有 Top-10 ELO ghost 排行、tier 过滤、全局 recent/ongoing 对局、高亮 ticker，看不到「与世界对战」的竞技场全貌。
6. **真实数据驱动的战斗重放缺失** — demo 战报是单一固定 10 步脚本，无 seed 驱动确定性 sim、无 eval bar、无逐卡 HP/ATK 动画、无 winner stamp，且 AbilityEvent[] trace（summon/buff/death-chain 动画）全栈未建。
7. **私信 / 公告板 / 记忆 真实社交层缺失** — send_message/read_inbox/post_to_location/read_location/add_memory/read_memories 在 demo 中仅作静态文案，没有可导航的 inbox / location board / memory ring-buffer feed。
8. **G 经济真人入口缺失** — depositG/withdraw on-ramp、双币（ore/G）统一展示、卡牌二级市场真人买卖 UI 全部 ⏳，demo 仅 mock 了充值与买卡。
9. **Autopilot / owner-relay 委托真实化** — autopilot 开关、goal steering、operator-relay 无 gas 执行、多租户 runner 是「我拥有一个替我打世界的 AI」核心叙事，demo 仅 mock toggle/setGoal，真实委托与 relay 未建。
10. **链上实时同步与世界事件流缺失** — demo 无 Router 解析、无 5s 轮询、无实时 drama/event feed 与 AgentMind 实时推理日志，整个「活的世界」实时性靠静态 marquee 假装。
